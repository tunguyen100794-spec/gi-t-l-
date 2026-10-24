const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config();
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class Bitmart {
  constructor() {
    this.name = 'Bitmart';
    this.config = config.exchanges.bitmart;
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

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'sell' }) {
    try {
      const response = await this.fetchWithRetry(this.config.url, {
        method: 'POST',
        headers: this.config.headers,
        data: {
          side,
          crypto: coin,
          currency: fiat,
          currencyMin: this.thresholds.maxAmount, // 1500000 VND
        },
      });

      let orders = response.data?.data?.items || [];

      // Sort giá tăng dần → orders[0] là giá tốt nhất
      orders = orders.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

      const filtered = orders
        .filter(o => {
          const price = parseFloat(o.price);
          const avail = parseFloat(o.availableSize);
          return price <= this.thresholds.minPrice && avail > 50; // >50 USDT
        })
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(parseFloat(o.availableSize)),
          username: o.merchantVO?.merchantName || 'unknown',
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered
          .map(o => `${o.username}|${o.price}====>${o.qty} u`)
          .join('\n')}`;
        await sendMessage(botName, msg);
      } else if (orders.length > 0) {
        const best = orders[0];
        logger.info(
          `${this.name} running: ${this.thresholds.minPrice} => ${best.merchantVO?.merchantName || 'unknown'}|${best.price}`
        );
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new Bitmart();