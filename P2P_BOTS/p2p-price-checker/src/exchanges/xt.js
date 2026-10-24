const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load .env for BOT_NAME
const { sendMessage } = require('../../../shared/telegram'); // ✅ Shared Telegram

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class XT {
  constructor() {
    this.name = 'XT';
    this.config = config.exchanges.xt;
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

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = '0' }) { // side: 0 = sell
    try {
      const response = await this.fetchWithRetry(this.config.url, {
        method: 'POST',
        headers: this.config.headers,
        data: {
          isMyself: '0',
          market: `${coin.toLowerCase()}_${fiat.toLowerCase()}`,
          types: side,
          pageIndex: 1,
          pageSize: 10,
          isNewVersion: true,
          paymentConfigId: '',
          amount: this.thresholds.maxAmount,
        },
      });

      const orders = response.data.data?.items || [];
      const filtered = orders
        .filter(o => o.price <= this.thresholds.minPrice && o.maxTradeAmount > 50)
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(o.maxTradeAmount),
          username: o.user.simple.nickName,
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty} u`).join('\n')}`;
        await sendMessage(botName, msg); // ✅ Send with correct botName
      } else {
        logger.info(`${this.name} running: ${this.thresholds.minPrice} => ${orders[0]?.user.simple.nickName}|${orders[0]?.maxTradeAmount} u`);
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new XT();
