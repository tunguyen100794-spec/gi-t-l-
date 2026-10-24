const TelegramBot = require('node-telegram-bot-api');
const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('./logger');
require('dotenv').config({ path: __dirname + '/../../.env' });

// Telegram IP and host config
const TELEGRAM_IP = '149.154.167.220';
const TELEGRAM_HOST = 'api.telegram.org';

const proxies = [
  { host: '172.111.171.150', port: 18808, user: 'uZdzfX', pass: 'dqrdDl' },
  { host: '180.149.35.155', port: 18187, user: 'QZVSVI', pass: 'ahgHfU' },
  { host: '23.95.45.249', port: 21344, user: 'IhHJzp', pass: 'YsGmie' }
];

let bot = null;
const chatId = process.env.TELEGRAM_CHAT_ID || 'default_chat_id_here';

// Escape MarkdownV2 special characters
function escapeMarkdownV2(text) {
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

async function createBotWithProxyFallback() {
  for (const proxy of proxies) {
    const proxyUrl = `socks5://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`;
    const agent = new SocksProxyAgent(proxyUrl);

    try {
      const testBot = new TelegramBot(process.env.TELEGRAM_TOKEN || '', {
        polling: true,
        baseApiUrl: `https://${TELEGRAM_IP}`, // Do not include /bot
        request: {
          agent,
          headers: {
            Host: TELEGRAM_HOST
          }
        }
      });

      await testBot.getMe(); // Test if bot connects
      logger.info(`✅ Connected to Telegram using proxy: ${proxyUrl}`);
      return testBot;
    } catch (err) {
      logger.error(`Proxy failed: ${proxyUrl} — ${err.message}`);
    }
  }

  throw new Error('All proxies failed to connect to Telegram.');
}

(async () => {
  if (!process.env.TELEGRAM_TOKEN) {
    logger.error('❌ TELEGRAM_TOKEN missing in .env');
    return;
  }

  try {
    bot = await createBotWithProxyFallback();
  } catch (e) {
    logger.error(e.message);
  }
})();

// Safely send a message using MarkdownV2
async function sendMessage(message, options = {}) {
  if (!bot) {
    logger.error('❌ Telegram bot not initialized.');
    return;
  }

  try {
    const escapedMessage = escapeMarkdownV2(message);
    await bot.sendMessage(chatId, escapedMessage, {
      parse_mode: 'MarkdownV2',
      ...options
    });
    logger.info(`✅ Telegram sent: ${message}`);
  } catch (error) {
    logger.error(`❌ Telegram sendMessage error: ${error.message}`);
  }
}

module.exports = { sendMessage };
