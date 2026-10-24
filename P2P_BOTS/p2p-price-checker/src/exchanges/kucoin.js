const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load .env for BOT_NAME
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class KuCoin {
  constructor() {
    this.name = 'KuCoin';
    this.config = config.exchanges.kucoin;
    this.thresholds = config.thresholds;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, cfg, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios(url, cfg);
        return response;
      } catch (error) {
        if (error.response?.status === 429 && i < retries - 1) {
          logger.warn(`Rate limit hit for ${url}, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
  }

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'SELL' }) {
    // side = 'SELL' → người dùng mua USDT (bán VND) → giá thấp = tốt
    try {
      const response = await this.fetchWithRetry(this.config.url, {
        method: 'GET',
        headers: this.config.headers,
        params: {
          status: 'PUTUP',
          currency: coin,
          legal: fiat,
          page: 1,
          pageSize: 10,
          side,
          amount: this.thresholds.maxAmount, // 1500000 VND
          payTypeCodes: '',
          sortCode: 'PRICE',        // sort giá tăng dần
          highQualityMerchant: 0,
          canDealOrder: false,
          lang: 'en_US',
        },
      });

      let orders = response.data?.items || [];

      // Sort giá tăng dần → orders[0] là giá tốt nhất (thấp nhất)
      orders = orders.sort((a, b) => parseFloat(a.floatPrice) - parseFloat(b.floatPrice));
	  //console.log(orders);
      const filtered = orders
        .filter(o => {
          const price = parseFloat(o.floatPrice);
          const avail = parseFloat(o.currencyBalanceQuantity);
          return price <= this.thresholds.minPrice && avail > 50; // >50 USDT
        })
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.floatPrice),
          qty: Math.round(parseFloat(o.currencyBalanceQuantity)), // USDT còn lại
          username: o.nickName,
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered
          .map(o => `${o.username}|${o.price}====>${o.qty} u`)
          .join('\n')}`;
        await sendMessage(botName, msg);
      } else if (orders.length > 0) {
        // Logger để biết bot chạy ok
        logger.info(
          `${this.name} running: ${this.thresholds.minPrice} => ${orders[0].nickName}|${orders[0].floatPrice}`
        );
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new KuCoin();