require('dotenv').config(); // ✅ Add this line at the top

module.exports = {
  'p2p-price-checker': {
    token: process.env.TG_TOKEN_PRICE,
    chatId: process.env.TG_CHAT_PRICE
  },
  'p2p-USD-check-bot': {
    token: process.env.TG_TOKEN_USD,
    chatId: process.env.TG_CHAT_USD
  },
  'coinmarketcap-funding-bot': {
    token: process.env.TG_TOKEN_CMC,
    chatId: process.env.TG_CHAT_CMC
  },
  'auto-buy-bot': {
    token: process.env.TG_TOKEN_AUTO,
    chatId: process.env.TG_CHAT_AUTO
  }
};
