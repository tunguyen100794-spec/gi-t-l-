const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load .env for BOT_NAME
const { sendMessage } = require('../../../shared/telegram'); // ✅ Shared telegram module

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class Gate {
  constructor() {
    this.name = 'Gate';
    this.config = config.exchanges.gate;
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

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'sell' }) {
    try {
      const response = await this.fetchWithRetry(this.config.url, {
        method: 'POST',
        headers: this.config.headers,
        data: {
          type: 'push_order_list',
          symbol: `${coin}_${fiat}`,
          big_trade: '0',
          fiat_amount: '',
          amount: '',
          pay_type: '',
          is_blue: '0',
          is_crown: '0',
          is_follow: '0',
          have_traded: '0',
          no_query_hide: '0',
          per_page: 20,
          push_type: side,
          sort_type: 1,
          page: 1,
        },
      });

      const orders = response.data.push_order || [];
      const filtered = orders
        .filter(o => o.rate <= this.thresholds.minPrice 
					 && parseInt(o.limit_total.split('~')[1], 10) > 50
					 && o.discount_rate == '0'
					 && o.min_completed_limit == '-1')
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.rate),
          qty: Math.round(o.amount),
          username: o.username,
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty}`).join('\n')}`;
        await sendMessage(botName, msg); // ✅ Use shared Telegram with botName
      } else {
        logger.info(`${this.name} running: ${this.thresholds.minPrice} => ${orders[0]?.username}|${orders[0]?.rate}`);
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new Gate();
