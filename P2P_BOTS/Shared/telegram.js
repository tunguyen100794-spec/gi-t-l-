const TelegramBot = require('node-telegram-bot-api');
const { SocksProxyAgent } = require('socks-proxy-agent');
const botConfigs = require('./telegram-config');
require('dotenv').config();

// New: Read from .env or default to false
const USE_PROXY = process.env.USE_PROXY === 'true';

const TELEGRAM_IP = '149.154.167.220';
const TELEGRAM_HOST = 'api.telegram.org';

// Proxy list
const proxies = [
  { host: '172.111.171.150', port: 18808, user: 'uZdzfX', pass: 'dqrdDl' },
  { host: '180.149.35.155', port: 18187, user: 'QZVSVI', pass: 'ahgHfU' },
  { host: '23.95.45.249', port: 21344, user: 'IhHJzp', pass: 'YsGmie' }
];


const bots = {};
const initPromises = {};

function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, (char) => '\\' + char);
}

async function createBot(botName) {
  if (bots[botName]) return bots[botName];
  if (!initPromises[botName]) {
    const config = botConfigs[botName];
    if (!config || !config.token || !config.chatId) {
      throw new Error(`No Telegram config for ${botName}`);
    }

    initPromises[botName] = (async () => {
      if (USE_PROXY) {
        // Try proxies in order
        for (const proxy of proxies) {
          const proxyUrl = `socks5://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`;
          const agent = new SocksProxyAgent(proxyUrl);

          try {
            const bot = new TelegramBot(config.token, {
              polling: false,
              baseApiUrl: `https://${TELEGRAM_IP}`,
              request: {
                agent,
                headers: { Host: TELEGRAM_HOST }
              }
            });

            await bot.getMe();
            bots[botName] = { bot, chatId: config.chatId };
            console.log(`✅ Telegram bot ready for ${botName} (via proxy)`);
            return bots[botName];
          } catch (err) {
            console.error(`❌ Proxy failed for ${botName}: ${err.message}`);
          }
        }

        throw new Error(`All proxies failed for ${botName}`);
      } else {
        // No proxy mode
        const bot = new TelegramBot(config.token, { polling: false });
        await bot.getMe();
        bots[botName] = { bot, chatId: config.chatId };
        console.log(`✅ Telegram bot ready for ${botName} (no proxy)`);
        return bots[botName];
      }
    })();
  }

  return initPromises[botName];
}

async function sendMessage(botName, message) {
  try {
    const { bot, chatId } = await createBot(botName);
    const text = escapeMarkdownV2(message);
    await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2' });
    console.log(`✅ Telegram sent from ${botName}`);
  } catch (err) {
    console.error(`❌ Telegram sendMessage error (${botName}): ${err.message}`);
  }
}

module.exports = { sendMessage };
