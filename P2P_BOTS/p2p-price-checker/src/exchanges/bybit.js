const logger = require('../utils/logger');
const config = require('../config');
require('dotenv').config(); // Load .env to get BOT_NAME
const { sendMessage } = require('../../../shared/telegram');

const botName = process.env.BOT_NAME || 'p2p-price-checker'; // Ensure this matches telegram-config.js

class Bybit {
  constructor() {
    this.name = 'Bybit';
    this.config = config.exchanges.bybit;
    this.thresholds = config.thresholds;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, options, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
        }
        return await response.json();
      } catch (error) {
        if (error.message.includes('429') && i < retries - 1) {
          logger.warn(`Rate limit hit for ${url}, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
  }

  async fetchOrders({ coins = ['USDT'], fiat = 'VND', side = '1' }) {
    const promises = coins.map(async coin => {
      try {
        const data = {
          tokenId: coin,
          currencyId: fiat,
          side,
          size: '5',
          page: '1',
          amount: this.thresholds.maxAmount.toString(),
        };

        const responseData = await this.fetchWithRetry(this.config.url, {
          method: 'POST',
          headers: this.config.headers,
          body: JSON.stringify(data),
        });

        const orders = responseData.result?.items || [];
        //console.log(orders);
		const filtered = orders
          .filter(o => o.price <= this.thresholds.minPrice
					&& o.quantity > 50
					&& o.tradingPreferenceSet.hasNationalLimit === 0)
          .slice(0, this.thresholds.maxResults)
          .map(o => ({
            price: parseFloat(o.price),
            qty: Math.round(o.quantity),
            username: o.nickName,
          }));

        if (filtered.length > 0) {
          const msg = `${this.name} & ${coin}\n**************\n${filtered.map(o => `${o.username}|${o.price}====>${o.qty}`).join('\n')}`;
          await sendMessage(botName, msg); // ✅ Fixed: pass correct bot name
        } else {
          logger.info(`${this.name} running: ${this.thresholds.minPrice} => ${orders[0]?.nickName}|${orders[0]?.price}`);
        }

        return filtered;
      } catch (error) {
        logger.error(`${this.name} fetch error for ${coin}: ${error.message}`);
        return [];
      }
    });

    const results = await Promise.all(promises);
    return results.flat();
  }
}

module.exports = new Bybit();
