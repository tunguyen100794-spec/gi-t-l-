const axios = require('axios');
const QueryString = require('node:querystring');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // ✅ Load .env
const { sendMessage } = require('../../../shared/telegram'); // ✅ Shared telegram

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class OKX {
  constructor() {
    this.name = 'OKX';
    this.config = config.exchanges.okx;
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

  async fetchOrders({ coins = ['USDT'], fiat = 'VND', side = 'sell' }) {
    const results = [];

    for (const coin of coins) {
      try {
        const query = QueryString.stringify({
          t: Date.now(),
          side,
          userType: 'all',
          cryptoCurrency: coin,
          fiatCurrency: fiat,
          currentPage: 1,
          numberPerPage: 50,
          sortType: 'price_asc',
        });

        const response = await this.fetchWithRetry(`${this.config.url}?${query}`, {
          method: 'GET',
          headers: this.config.headers,
        });

        const orders = response.data.data?.sell || [];

        const filtered = orders
          .filter(o =>
            o.price <= this.thresholds.minPrice &&
            o.minCompletedOrderQuantity <= 200 &&
            o.quoteMaxAmountPerOrder >= this.thresholds.maxAmount &&
            (JSON.stringify(o.whitelistedCountries) === JSON.stringify(['ALL_COUNTRIES']) ||
             JSON.stringify(o.whitelistedCountries) === JSON.stringify(['VN']))
          )
          .slice(0, this.thresholds.maxResults)
          .map(o => ({
            price: parseFloat(o.price),
            qty: Math.round(o.quoteMaxAmountPerOrder / o.price),
            username: o.nickName,
          }));

        if (filtered.length > 0) {
          const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty}`).join('\n')}`;
          await sendMessage(botName, msg); // ✅ Use shared telegram and botName
        } else {
          logger.info(`${this.name} running: ${coin} | ${this.thresholds.minPrice} => ${orders[0]?.nickName}|${orders[0]?.price}`);
        }

        results.push(filtered);
      } catch (error) {
        logger.error(`${this.name} fetch error for ${coin}: ${error.message}`);
        results.push([]);
      }

      await this.sleep(500);
    }

    return results.flat();
  }
}

module.exports = new OKX();
