// src/exchanges/bingx.js
// Fetch P2P marketplace ads từ BingX (signed: HMAC-SHA256 + X-BX-APIKEY)
// - Lọc theo config.thresholds (giống Gate)
// - Gửi Telegram giống Gate
// - Tự fallback pageStart=1 → 0 nếu total>0 mà trang đầu rỗng
// - ✅ Kiểm tra ENV: nếu thiếu BINGX_API_KEY/BINGX_API_SECRET thì disable, không crash

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const config = require('../config');

// Logger: dùng logger của dự án, fallback console khi chạy lẻ file
let logger;
try { logger = require('../utils/logger'); } catch { logger = console; }

// Telegram: dùng shared/telegram, fallback log khi chạy lẻ file
let sendMessage;
try { ({ sendMessage } = require('../../../shared/telegram')); }
catch { sendMessage = async (_botName, msg) => logger.info(`[TELEGRAM MOCK]\n${msg}`); }

const botName = process.env.BOT_NAME || 'p2p-price-checker';
// ⭐ Thêm ngưỡng số lượng asset tối thiểu (USDT)
const MIN_ASSET_QTY = 100;

class BingX {
  constructor() {
    this.name = 'BingX';
    this.thresholds = config.thresholds;
    this.baseURL = 'https://open-api.bingx.com';
    this.paths = [
      '/openApi/p2p/v1/advert/list',
      '/openApi/P2P/v1/advert/list',
    ];
    this.pageSize = 100;

    this.apiKey = (process.env.BINGX_API_KEY || '').trim();
    this.apiSecret = (process.env.BINGX_API_SECRET || '').trim();

    if (!this.apiKey || !this.apiSecret) {
      // Không throw để tránh bot crash; đánh dấu disabled và hướng dẫn cấu hình
      this.disabled = true;
      logger.error(
        `[${this.name}] Missing credentials. Hãy tạo file .env ở thư mục project gốc (không phải trong src/) với:
BINGX_API_KEY=your_key
BINGX_API_SECRET=your_secret`
      );
    } else {
      this.disabled = false;
    }
  }

  // ---------- helpers ----------
  buildQuery(params) {
    const usp = new URLSearchParams();
    Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .sort()
      .forEach(k => usp.append(k, params[k]));
    return usp.toString();
  }

  sign(qs) {
    return crypto.createHmac('sha256', this.apiSecret).update(qs).digest('hex');
  }

  toTradeType(side) {
    // map side => tradeType (1=BUY, 2=SELL)
    if (typeof side === 'number') return side === 2 ? 2 : 1;
    const s = String(side || '').toLowerCase();
    return s.startsWith('s') || s === '2' ? 2 : 1;
  }

  // gọi 1 trang (đã ký + header)
  async fetchPage({ asset, fiatUnit, tradeType, pageId }) {
    const params = {
      pageId,
      pageSize: this.pageSize,
      tradeType,      // 1 buy, 2 sell
      asset,          // ví dụ 'USDT'
      fiatUnit,       // ví dụ 'VND'
      recvWindow: 5000,
      timestamp: Date.now(),
    };
    const qs = this.buildQuery(params);
    const signature = this.sign(qs);
    const headers = { 'X-BX-APIKEY': this.apiKey };

    let lastErr = null;
    for (const p of this.paths) {
      const url = `${this.baseURL}${p}?${qs}&signature=${signature}`;
      try {
        const res = await axios.get(url, { headers, timeout: 15000 });
        const data = res?.data;
        if (typeof data?.code !== 'undefined' && data.code !== 0) {
          // 100400: api/path không tồn tại → thử path khác
          lastErr = new Error(`code=${data.code} (${data?.msg || data?.message || 'no message'})`);
          if (data.code === 100400) continue;
          throw lastErr;
        }
        return data;
      } catch (e) {
        lastErr = e?.response?.data
          ? new Error(`code=${e.response.data.code} (${e.response.data.msg || e.response.data.message || 'no message'})`)
          : new Error(e.message);
        if (e?.response?.data?.code === 100400) continue;
        break;
      }
    }
    throw lastErr || new Error('All advert/list endpoints failed.');
  }

  // ---------- public API ----------
  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'BUY' } = {}) {
    if (this.disabled) {
      logger.warn(`[${this.name}] Disabled: thiếu BINGX_API_KEY/BINGX_API_SECRET trong .env`);
      return [];
    }

    const tradeType = this.toTradeType(side);
    const asset = coin;
    const fiatUnit = fiat;

    try {
      // paginate start=1; nếu rỗng nhưng total>0 thì thử start=0
      const runFrom = async (start) => {
        let pageId = start;
        let total = Infinity;
        const all = [];
        while (all.length < total) {
          const payload = await this.fetchPage({ asset, fiatUnit, tradeType, pageId });
          const block = payload?.data || {};
          total = Number(block?.total ?? 0);
          const result = Array.isArray(block?.result) ? block.result : [];
          logger.info(`[${this.name}] page=${pageId} got=${result.length} sofar=${all.length + result.length}/${total}`);
          if (result.length === 0) break;
          all.push(...result);
          pageId += 1;
        }
        return { all, total };
      };

      let { all, total } = await runFrom(1);
      if (all.length === 0 && total > 0) {
        logger.info(`[${this.name}] No data with pageStart=1 → retry pageStart=0 …`);
        ({ all, total } = await runFrom(0));
      }

      // ⭐ Lọc: giá <= minPrice, đơn tối đa > 50 VND, và số USDT còn lại >= 100
      const minPrice = this.thresholds.minPrice;
      
	  const filtered = (all || [])
        .filter(ad => Number(ad.price) <= minPrice)
        .filter(ad => {
          const maxFiat = Number(ad.maxPerOrderAmount ?? ad.maxAmount ?? 0);
          return maxFiat > 2000000;
        })
        .filter(ad => Number(ad.availableAmount ?? 0) >= MIN_ASSET_QTY) // 👈 thêm điều kiện 100 USDT
        .slice(0, this.thresholds.maxResults)
        .map(ad => ({
          price: Number(ad.price),
          qty: Math.round(Number(ad.availableAmount ?? 0)), // xấp xỉ số USDT còn lại
          username: ad.nickname || 'n/a',
        }));
		//console.log(filtered);

      if (filtered.length > 0) {
        const msg = `${this.name} & ${asset}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty}`).join('\n')}`;
        await sendMessage(botName, msg);
      } else {
        const sample = all?.[0];
        logger.info(`${this.name} running: ${minPrice} => ${sample ? `${sample.nickname}|${sample.price}` : 'no-ads'}`);
      }

      return filtered;
    } catch (err) {
      logger.error(`${this.name} fetch error: ${err.message}`);
      return [];
    }
  }
}

// Export instance cho bot dùng
module.exports = new BingX();

// Nếu chạy trực tiếp file này: node src/exchanges/bingx.js
if (require.main === module) {
  (async () => {
    const inst = new BingX();
    const rows = await inst.fetchOrders({ coin: 'USDT', fiat: 'VND', side: 'BUY' });
    console.log('\nPreview rows:', rows);
  })().catch(err => {
    console.error('ERR:', err.message);
    process.exit(1);
  });
}
