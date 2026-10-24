const logger = require('./utils/logger'); // Same directory structure
const config = require('./config');       // Changed from '../config' to './config'
const exchanges = require('./exchanges');

class P2PBot {
  constructor() {
    this.exchanges = exchanges;
    this.interval = config.pollingInterval * 1000;
  }

  async run() {
    logger.info('Starting P2P price monitoring...');
    const tasks = [
      exchanges.find(ex => ex.name === 'Binance')?.fetchOrders({ coins: ['USDT', 'USDC', 'FDUSD'], fiat: 'VND', side: 'BUY' }),
      exchanges.find(ex => ex.name === 'OKX')?.fetchOrders({ coins: ['USDT', 'USDC'], fiat: 'VND', side: 'sell' }),
      exchanges.find(ex => ex.name === 'MEXC')?.fetchOrders({ coin: 'USDT', fiat: 'VND', side: 'SELL' }),
      exchanges.find(ex => ex.name === 'Bybit')?.fetchOrders({ coins: ['USDT', 'USDC'], fiat: 'VND', side: '1' }),
      exchanges.find(ex => ex.name === 'KuCoin')?.fetchOrders({ coin: 'USDT', fiat: 'VND', side: 'SELL' }),
      exchanges.find(ex => ex.name === 'XT')?.fetchOrders({ coin: 'USDT', fiat: 'VND', side: '0' }),
    ].filter(Boolean);

    await Promise.all(tasks);
  }

  async start() {
    while (true) {
      await this.run();
      logger.info(`Waiting ${config.pollingInterval} seconds...`);
      await new Promise(resolve => setTimeout(resolve, this.interval));
    }
  }
}

const bot = new P2PBot();
bot.start().catch(err => logger.error(`Bot crashed: ${err.message}`));