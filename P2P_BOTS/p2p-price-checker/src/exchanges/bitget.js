const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config();
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker';

const API_KEY = process.env.BITGET_API_KEY;
const API_SECRET = process.env.BITGET_API_SECRET;
const PASSPHRASE = process.env.BITGET_PASSPHRASE;

if (!API_KEY || !API_SECRET || !PASSPHRASE) {
  logger.warn('Bitget API keys not set in .env → skipping Bitget');
}

class Bitget {
  constructor() {
    this.name = 'Bitget';
    this.thresholds = config.thresholds;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateHeaders(method, requestPath, queryParams = {}, body = null) {
    const timestamp = Date.now().toString();
    let queryString = '';
    if (Object.keys(queryParams).length > 0) {
      const sorted = Object.keys(queryParams).sort();
      queryString = '?' + sorted.map(k => `${k}=${queryParams[k]}`).join('&');
    }

    const bodyStr = body ? JSON.stringify(body) : '';
    const prehash = timestamp + method.toUpperCase() + requestPath + queryString + bodyStr;

    const signature = crypto.createHmac('sha256', API_SECRET).update(prehash).digest('base64');

    return {
      'ACCESS-KEY': API_KEY,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': PASSPHRASE,
      'locale': 'en-US',
      'Content-Type': 'application/json'
    };
  }

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'sell' }) {
    if (!API_KEY || !API_SECRET || !PASSPHRASE) return [];

    try {
      const requestPath = '/api/v2/p2p/advList';
      const baseUrl = 'https://api.bitget.com';

      const params = {
        coin,
        fiat,
        side,
        status: 'online',
        limit: '20',
        sourceType: 'competitior',
        language: 'en-US'
      };

      const headers = this.generateHeaders('GET', requestPath, params);

      let queryString = '';
      if (Object.keys(params).length > 0) {
        const sorted = Object.keys(params).sort();
        queryString = '?' + sorted.map(k => `${k}=${params[k]}`).join('&');
      }

      const url = `${baseUrl}${requestPath}${queryString}`;

      const response = await axios.get(url, { headers, timeout: 15000 });

      let orders = response.data?.data?.advList || [];

      // Sort giá tăng dần
      orders = orders.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

      const filtered = orders
        // LOẠI BỎ QUẢNG CÁO CÓ COUNTRY (207, v.v.) → CHỈ LẤY COUNTRY RỖNG
        .filter(o => !o.userLimitList?.country || o.userLimitList.country === '')
        .filter(o => {
          const price = parseFloat(o.price);
          const avail = parseFloat(o.size || 0);
          return price <= this.thresholds.minPrice && avail > 50;
        })
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(parseFloat(o.size)),
          username: o.userInfo?.nickName || o.userInfo?.userName || 'unknown',
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered
          .map(o => `${o.username}|${o.price}====>${o.qty} u`)
          .join('\n')}`;
        await sendMessage(botName, msg);
      } else if (orders.length > 0) {
        const bestGlobal = orders.find(o => !o.userLimitList?.country || o.userLimitList.country === '');
        const best = bestGlobal || orders[0];
        const bestNick = best.userInfo?.nickName || best.userInfo?.userName || 'unknown';
        logger.info(`${this.name} running: ${this.thresholds.minPrice} => ${bestNick}|${best.price}`);
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.response?.data?.msg || error.message}`);
      return [];
    }
  }
}

module.exports = new Bitget();