const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config();
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class LBank {
  constructor() {
    this.name = 'LBank';
    this.config = config.exchanges.lbank;
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
        tradeType: side,                    // 'buy' = advertiser bán USDT (người dùng mua)
        assetCode: coin,
        currencyCode: fiat,
        showOnlyPurchasable: false,
        certifiedOnly: false,
        pageNo: 1,
        pageSize: 20,
        currencyMoney: this.thresholds.maxAmount, // 1500000 VND
      };

      const response = await this.fetchWithRetry(this.config.url, {
        headers: this.config.headers,
        params,
        timeout: 15000
      });

      let orders = response.data?.data?.resultList || [];

      // Sort giá tăng dần
      orders = orders.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

      const filtered = orders
        .filter(o => {
          const price = parseFloat(o.price);
          const avail = parseFloat(o.realAmount);
          return price <= this.thresholds.minPrice && avail > 50; // >50 USDT
        })
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(parseFloat(o.realAmount)),
          username: o.nickName || 'unknown',
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered
          .map(o => `${o.username}|${o.price}====>${o.qty} u`)
          .join('\n')}`;
        await sendMessage(botName, msg);
      } else if (orders.length > 0) {
        const best = orders[0];
        logger.info(
          `${this.name} running: ${this.thresholds.minPrice} => ${best.nickName || 'unknown'}|${best.price}`
        );
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new LBank();