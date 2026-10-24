const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load .env
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker'; // Must match your telegram-config.js

class MEXC {
  constructor() {
    this.name = 'MEXC';
    this.config = config.exchanges.mexc;
    this.thresholds = config.thresholds;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, config, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios(url, config);
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
    try {
      const response = await this.fetchWithRetry(this.config.url, {
        method: 'GET',
        headers: this.config.headers,
        params: {
          allowTrade: false,
          amount: 999999,
          blockTrade: false,
          coinId: '128f589271cb4951b03e71e6323eb7be', // USDT coinId
          currency: fiat,
          follow: false,
          haveTrade: false,
          page: 1,
          tradeType: side,
        },
      });

      const orders = response.data.data || [];
	  const filtered = orders
        .filter(o => o.tags === '' && o.price <= this.thresholds.minPrice && o.minTradeLimit <= 100)
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(o.availableQuantity),
          username: o.merchant.nickName,
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty} USDT`).join('\n')}`;
        await sendMessage(botName, msg); // ✅ Use shared telegram with botName
      } else {
        logger.info(`${this.name} running: ${this.thresholds.minPrice} => ${orders[0]?.merchant.nickName}|${orders[0]?.price}`);
      }

      //console.log(filtered);
      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new MEXC();
