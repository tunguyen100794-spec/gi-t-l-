const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load .env for BOT_NAME
const { sendMessage } = require('../../../shared/telegram'); // ✅ Shared Telegram

const botName = process.env.BOT_NAME || 'p2p-price-checker';

class Bitunix {
  constructor() {
    this.name = 'Bitunix';
    this.config = config.exchanges.bitunix;
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

  async fetchOrders({ coin = 'USDT', fiat = 'VND', side = 'buy' }) { // side: 'buy' for buy crypto (sell fiat to advertiser)
    try {
      const response = await this.fetchWithRetry(this.config.url, {
        method: 'POST',
        headers: this.config.headers,
        data: {
          fiatCode: fiat,
          fiatCount: '', // Để rỗng để không filter amount
          cryptoCode: coin,
          exchangeService: '',
          paymethodId: [],
          servicePaymethodId: [],
          pageSize: '10', // Max 10 theo fetch
          page: 1,
        },
      });

      // console.log(response.data); // ✅ Uncomment để debug nếu cần

      let orders = response.data.data?.items || []; // Structure từ JSON: data.items

      // Sort orders by price ascending để lấy giá tốt nhất (thấp nhất)
      orders = orders.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

      const filtered = orders
        .filter(o => parseFloat(o.price) <= this.thresholds.minPrice && parseFloat(o.amount) > 50) // Filter price thấp & available USDT >50
        .slice(0, this.thresholds.maxResults)
        .map(o => ({
          price: parseFloat(o.price),
          qty: Math.round(parseFloat(o.amount)), // Available USDT, round integer
          username: o.nickname, // Field chính xác
        }));

      if (filtered.length > 0) {
        const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty} u`).join('\n')}`;
        await sendMessage(botName, msg); // ✅ Send with correct botName
      } else {
        logger.info(`${this.name} running: ${this.thresholds.minPrice} => ${orders[0]?.nickname}|${orders[0]?.price}`);
      }

      return filtered;
    } catch (error) {
      logger.error(`${this.name} fetch error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new Bitunix();