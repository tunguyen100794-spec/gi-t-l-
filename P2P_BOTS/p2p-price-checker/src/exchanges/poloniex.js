const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config();
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class Poloniex {
  constructor() {
    this.name = 'Poloniex';
    this.config = config.exchanges.poloniex;
    this.thresholds = config.thresholds;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, cfg, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.get(url, cfg);
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

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'buy' }) {
    try {
      const params = {
        amount: 150000,
        quoteAssetId: 5,
        coinId: 2,
        tradeType: 2, // advertiser bán USDT
        page: 1
      };

      const response = await this.fetchWithRetry(this.config.url, {
        headers: this.config.headers,
        params,
        timeout: 15000
      });

      let orders = response.data?.data?.list || [];

      // Sort giá tăng dần
      orders = orders.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

      const filtered = orders
        .filter(o => {
          const price = parseFloat(o.price);
          const avail = parseFloat(o.tradeCount || 0); // ← Đây là availableAmount!
          return price <= this.thresholds.minPrice && avail > 50;
        })
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(parseFloat(o.tradeCount)),
          username: o.userName || 'unknown',
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered
          .map(o => `${o.username}|${o.price}====>${o.qty} u`)
          .join('\n')}`;
        await sendMessage(botName, msg);
      } else if (orders.length > 0) {
        const best = orders[0];
        logger.info(
          `${this.name} running: ${this.thresholds.minPrice} => ${best.userName || 'unknown'}|${best.price}`
        );
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new Poloniex();