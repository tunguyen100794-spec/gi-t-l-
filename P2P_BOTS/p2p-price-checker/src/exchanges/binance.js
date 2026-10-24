const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load environment variables
const { sendMessage } = require('../../../shared/telegram'); // ✅ Use shared telegram

const botName = process.env.BOT_NAME || 'p2p-price-checker'; // ✅ Consistent with telegram-config.js

class Binance {
  constructor() {
    this.name = 'Binance';
    this.config = config.exchanges.binance;
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

  async fetchOrders({ coins = ['USDT'], fiat = 'VND', side = 'BUY' }) {
    const results = [];
    for (const coin of coins) {
      try {
        const response = await this.fetchWithRetry(this.config.url, {
          url: this.config.url,
          method: 'POST',
          headers: this.config.headers,
          data: {
            fiat,
            page: 1,
            rows: 10,
            transAmount: this.thresholds.maxAmount,
            tradeType: side,
            asset: coin,
            proMerchantAds: false,
            shieldMerchantAds: false,
            filterType: 'all',
            payTypes: ['BANK', 'BankTransferVietnam'],
          },
        });

        const orders = response.data.data || [];
        const filtered = orders
          .filter(order => order.adv.price <= this.thresholds.minPrice && order.adv.maxSingleTransQuantity > 50)
          .slice(0, this.thresholds.maxResults)
          .map(order => ({
            price: parseFloat(order.adv.price),
            qty: Math.round(order.adv.tradableQuantity),
            username: order.advertiser.nickName,
          }));

        if (filtered.length > 0) {
          const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty}`).join('\n')}`;
          await sendMessage(botName, msg); // ✅ Use shared telegram with botName
        } else {
          logger.info(`${this.name} running: ${coin} | ${this.thresholds.minPrice} => ${orders[0]?.advertiser.nickName}|${orders[0]?.adv.price}`);
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

module.exports = new Binance();
