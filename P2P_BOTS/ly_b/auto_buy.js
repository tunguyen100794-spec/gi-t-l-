require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');

// ==================== CONFIG ====================
// Edit these parameters for testing (based on Chrome script thresholds)
const CRYPTO_CURRENCY = 'USDT';
const FIAT_CURRENCY = 'VND';
const MIN_PRICE = 27600; // Max acceptable sell price (VND per USDT) - from Chrome script
const MIN_COMPLETED_ORDERS = 200; // Filter ads where seller's minCompletedOrderQuantity <= this (from Chrome script)
const MIN_FIAT_AMOUNT = 2000000; // Min max amount per order (VND) - p_filter_amount
const MAX_RESULTS = 1; // Limit results - from Chrome script
const TARGET_COUNTRIES = ['ALL_COUNTRIES', 'VN']; // Whitelisted countries
const MAX_VND = 490000000;

// API Keys (set in .env)
const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const PASSPHRASE = process.env.PASSPHRASE;
const BASE_URL = 'https://www.okx.com';

// Telegram Configuration (from Chrome script)
const TELEGRAM_TOKEN = '7342694360:AAGLGNbOLw28OmXa7ED4WxLI6bJ7lcjfjtc';
const TELEGRAM_CHAT_ID = '-1002474099162';

// Headers for fetching ads (no auth needed)
const ADS_HEADERS = {
  "authority": "www.okx.com",
  "accept": "application/json",
  "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
  "app-type": "web",
  "referer": `https://www.okx.com/p2p-markets/${FIAT_CURRENCY.toLowerCase()}/buy-${CRYPTO_CURRENCY.toLowerCase()}`,
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ==================== TELEGRAM FUNCTIONS ====================
async function sendMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown",
  };

  try {
    const response = await axios.post(url, payload);
    const data = response.data;
    if (!data.ok) {
      console.error(`Failed to send Telegram message: ${data.description}`);
    } else {
      console.log("Telegram message sent successfully");
    }
  } catch (error) {
    console.error(`Error sending Telegram message: ${error.message}`);
  }
}

// ==================== AUTH FUNCTIONS ====================
function generateSignature(timestamp, method, requestPath, body = '') {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', SECRET_KEY).update(message).digest('base64');
}

function getAuthHeaders(method, requestPath, body = '') {
  const timestamp = new Date().toISOString();
  const signature = generateSignature(timestamp, method, requestPath, body);
  return {
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    'Content-Type': 'application/json',
  };
}

// ==================== P2P FUNCTIONS ====================
async function getP2PAds() {
  const params = {
    t: Date.now(),
    side: 'sell',
    userType: 'all', // From Chrome script
    cryptoCurrency: CRYPTO_CURRENCY,
    fiatCurrency: FIAT_CURRENCY,
    currentPage: 1,
    numberPerPage: 500, // High number to get more, like Chrome script
    sortType: 'price_asc',
  };
  const query = querystring.stringify(params);
  const url = `https://www.okx.com/v3/c2c/tradingOrders/getMarketplaceAdsPrelogin?${query}`;

  try {
    const response = await axios.get(url, { headers: ADS_HEADERS });
    //console.log(response.data.data);
	return response.data.data?.sell || [];
  } catch (error) {
    console.error('Error fetching ads:', error.response ? error.response.data : error.message);
    return [];
  }
}

async function placeOrder(amount, totalMoney, adId) {
  // Use standard v5 endpoint for order creation (fixes 404 error from v3)
  const method = 'POST';
  const requestPath = '/api/v5/p2p/order/create';
  const url = `${BASE_URL}${requestPath}`;

  const body = {
    adId: adId,
    cryptoAmount: amount.toString(), // USDT amount
    cryptoCurrency: CRYPTO_CURRENCY.toLowerCase(),
    fiatCurrency: FIAT_CURRENCY.toLowerCase(),
    paymentMethod: 'bank', // From Chrome script
    totalFiatAmount: totalMoney.toString(), // VND total
  };

  const bodyString = JSON.stringify(body);
  const headers = getAuthHeaders(method, requestPath, bodyString);

  try {
    const response = await axios.post(url, body, { headers });
    const responseData = response.data;

    if (responseData.code === 0) {
      console.info(`OKX Order placed successfully: ${JSON.stringify(responseData)}`);
    } else {
      const warnMsg = responseData.msg || JSON.stringify(responseData);
      console.warn(`OKX Order placement warning: ${warnMsg}`);
    }
    return responseData;
  } catch (error) {
    const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`OKX Order placement failed: ${errorMsg}`);
    throw { message: errorMsg, fullError: error.response ? error.response.data : error }; // Propagate full error
  }
}

// ==================== MAIN SCRIPT ====================
async function main() {
  console.log(`Scanning OKX P2P sell ads for ${CRYPTO_CURRENCY}/${FIAT_CURRENCY}...`);

  const ads = await getP2PAds();
  if (ads.length === 0) {
    console.log('No ads found.');
    return;
  }
  
  console.log(`Found ${ads.length} ads. Filtering...`);

  // Filter ads based on config (matching Chrome script logic)
  const filteredAds = ads
    .filter(ad => {
      const price = parseFloat(ad.price || 0);
      const maxFiat = parseFloat(ad.quoteMaxAmountPerOrder || 0);
      const minCompletedOrders = parseFloat(ad.minCompletedOrderQuantity || 0);
      const countries = ad.whitelistedCountries || [];
      const allowsVN = TARGET_COUNTRIES.some(c => countries.includes(c));
	  const userType = ad.userType;

      return price <= MIN_PRICE &&
             minCompletedOrders <= MIN_COMPLETED_ORDERS &&
             maxFiat >= MIN_FIAT_AMOUNT &&
			 userType == 'all' &&
             allowsVN;
    })
    .slice(0, MAX_RESULTS); // Limit to top N cheapest

  
  if (filteredAds.length === 0) {
    console.log(`No suitable ads found under ${MIN_PRICE} VND/USDT.`);
    // Log top ad for reference
    const topAd = ads[0];
    console.log(`Cheapest ad: ${topAd.nickName} @ ${topAd.price} VND (max fiat: ${topAd.quoteMaxAmountPerOrder}, min completed: ${topAd.minCompletedOrderQuantity})`);
    return;
  }

  console.log(`\nFound ${filteredAds.length} suitable ads:`);
  console.log('Seller | Max Qty (VND) | Qty (USDT) | Price (VND/USDT) | Ad ID\n' + '-'.repeat(80));
  filteredAds.forEach((ad, i) => {
    const qty = (parseFloat(ad.quoteMaxAmountPerOrder || 0) / parseFloat(ad.price || 1)).toFixed(2);
    console.log(`${ad.nickName.padEnd(15)} | ${parseFloat(ad.quoteMaxAmountPerOrder || 0).toLocaleString().padEnd(12)} | ${qty.padEnd(10)} | ${ad.price.padEnd(12)} | ${ad.id}`);
  });

  // Take the first (best) ad and place order like Chrome script
  const bestOffer = filteredAds[0];
  //const qty = (parseFloat(bestOffer.quoteMaxAmountPerOrder || 0) / parseFloat(bestOffer.price || 1)).toFixed(2);
  const rawMaxQuote = parseFloat(bestOffer.quoteMaxAmountPerOrder || 0);
  const maxQuoteAmount = Math.min(rawMaxQuote, MAX_VND);
  const rawQty = maxQuoteAmount / parseFloat(bestOffer.price || 1);
  const qty = Math.floor(rawQty).toString();
  console.log(`\nPlacing OKX order for best offer: ${JSON.stringify(bestOffer)}`);
  console.log(`Qty: ${qty}, Max Quote: ${maxQuoteAmount}, Ad ID: ${bestOffer.id}`);

  try {
    const orderResponse = await placeOrder(qty, maxQuoteAmount, bestOffer.id);

    // Check if the order was successful (adapt from Chrome: look for code 0 and data.orderId or similar)
    if (orderResponse && orderResponse.code === 0 && orderResponse.data?.orderId) {
      const successMsg = `
*CMD Bot OKX Order Placed Successfully!*
*Coin:* ${CRYPTO_CURRENCY}
*Amount:* ${qty}
*Price:* ${bestOffer.price}
*Seller:* ${bestOffer.username || bestOffer.nickName}
*Order ID:* ${orderResponse.data.orderId}
      `;
      console.info(`OKX Order success: ${JSON.stringify(orderResponse)}`);
      await sendMessage(successMsg);
    } else {
      const errorMsg = orderResponse?.msg || JSON.stringify(orderResponse) || "Unknown error";
      const failMsg = `
*CMD Bot OKX Order Placement Failed!*
*Coin:* ${CRYPTO_CURRENCY}
*Amount:* ${qty}
*Price:* ${bestOffer.price}
*Seller:* ${bestOffer.username || bestOffer.nickName}
*Error:* ${errorMsg}
      `;
      console.error(`OKX Order failed: ${errorMsg}`);
      await sendMessage(failMsg);
    }
  } catch (error) {
    const fullError = error.fullError || error;
    const errorDetails = fullError.msg || fullError.error_message || JSON.stringify(fullError) || error.message;
    const errorMsg = `
*CMD Bot Error in OKX placeOrder!*
*Coin:* ${CRYPTO_CURRENCY}
*Amount:* ${qty}
*Price:* ${bestOffer.price}
*Seller:* ${bestOffer.username || bestOffer.nickName}
*Ad ID:* ${bestOffer.id}
*Full Error:* ${errorDetails}
    `;
    console.error(`OKX placeOrder error: ${error.message}`);
    await sendMessage(errorMsg);
  }
}

// ==================== SCHEDULE FUNCTIONS ====================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the main function every 2 seconds
async function runScheduled() {
  console.log('Starting scheduled runs every 2 seconds...');
  while (true) {
    try {
      await main();
    } catch (error) {
      console.error(`Error in scheduled run: ${error.message}`);
    }
    await sleep(1500); // Wait 2 seconds before next run
  }
}

// Start the scheduler
runScheduled().catch(console.error);