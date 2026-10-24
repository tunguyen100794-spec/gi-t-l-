require('dotenv').config();

module.exports = {
  exchanges: {
    binance: {
      url: 'https://c2c.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      headers: {
        "accept": "*/*",
        "accept-language": "en,en-SG;q=0.9,vi;q=0.8",
        "content-type": "application/json",
        // ... (rest of your Binance_header from original code)
      },
    },
    okx: {
      url: 'https://www.okx.com/v3/c2c/tradingOrders/getMarketplaceAdsPrelogin',
      headers: {
        "authority": "www.okx.com",
        "accept": "application/json",
        "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
        "app-type": "web",
        "referer": "https://www.okx.com/p2p-markets/vnd/buy-usdt",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        // ... (rest of your OKX_header)
      },
    },
    mexc: {
      url: 'https://p2p.mexc.com/api/market',
      headers: {
        "accept": "*/*",
        "accept-language": "en,en-SG;q=0.9,vi;q=0.8",
        "content-type": "application/json",
        // ... (rest of your MEXC_Header)
      },
    },
    gate: {
      url: 'https://www.gate.com/json_svr/query_push/?u=21&c=73627',
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en,en-SG;q=0.9,vi;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        // ... (rest of your GATE_Header)
      },
    },
    kucoin: {
      url: 'https://www.kucoin.com/_api/otc/ad/list',
      headers: {
		"accept": "application/json",
		"accept-language": "en,en-SG;q=0.9,vi;q=0.8",
		"cache-control": "no-cache",
		"pragma": "no-cache",
		"priority": "u=1, i",
		"sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "\"Windows\"",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-origin",
		"cookie": "_fbp=fb.1.1725353726842.65374869; __user_id=uid-0467808533.7038664269; sensorsdata2015jssdkcross=%7B%22distinct_id%22%3A%2279097900%22%2C%22first_id%22%3A%2218e30c196cd2f1-06d1db5698f7c88-26001b51-1049088-18e30c196ce24a%22%2C%22props%22%3A%7B%22%24latest_traffic_source_type%22%3A%22%E7%9B%B4%E6%8E%A5%E6%B5%81%E9%87%8F%22%2C%22%24latest_search_keyword%22%3A%22%E6%9C%AA%E5%8F%96%E5%88%B0%E5%80%BC_%E7%9B%B4%E6%8E%A5%E6%89%93%E5%BC%80%22%2C%22%24latest_referrer%22%3A%22%22%7D%2C%22identities%22%3A%22eyIkaWRlbnRpdHlfbG9naW5faWQiOiI3OTA5NzkwMCIsIiRpZGVudGl0eV9jb29raWVfaWQiOiIxOGUzMGMxOTZjZDJmMS0wNmQxZGI1Njk4ZjdjODgtMjYwMDFiNTEtMTA0OTA4OC0xOGUzMGMxOTZjZTI0YSJ9%22%2C%22history_login_id%22%3A%7B%22name%22%3A%22%24identity_login_id%22%2C%22value%22%3A%2279097900%22%7D%2C%22%24device_id%22%3A%2218e30c196cd2f1-06d1db5698f7c88-26001b51-1049088-18e30c196ce24a%22%7D; _uetvid=4338f41069d211efa0c6bd9cfc7ed1f6; __cf_bm=pAG3jzEU1C79xMTxAB8rEnIy6wHS27yRVGudzc7qYzo-1735029229-1.0.1.1-TUqy7oiXFH4rFE0Z5q09jJR80ji_cIe_0vCqZE9uij9RgZN5xsq8jUJ74kQMoiwZ4OXlj32FOqbLwFgFuuN0GA; _cfuvid=4fvTeLNNbedgMo.NbRwNM0lrYzKnvkdUvDLJket2fkU-1735029229693-0.0.1.1-604800000; cf_clearance=qAeuOHJIdPks0hNND489l4zVlqS4qJFPYg5VuevP2fk-1735029231-1.2.1.1-QTVf5YtzHaUpaSLg2dOdndkEDbGxU3kVmPjUhlIol2iZ3Hm4I0N3kjwNKcLl3tgBZCtUw_nnKCehecRS_rIRXBm_r7WHD9ROHqSOkp6aDkC.pra6d4od9Te1OrRJkdRrLjmEPcaBMpFX5f6JdBCgY4MSIVA0PzdkyaB62BiaOeNbcYSywUVJvlEutPrnavDmF1rcWuz09WPG2Ftwwrgb9H3NjLFm60lpBDd1kyn6aRz3C5App7SE_CWrBgxhfhX7PtKnhkH0FLKeUcw4wPBdOXkJHfupgVMHHTtYku5byW_XUYg5KhEpbXhRwZT8y5myiDk.c1A3Lp8XfqPbCUIVL6.SU5QoHBr6EGeopIdchTxA._b6NTxLDufU47yy0bJ5; _gid=GA1.2.1583346937.1735029231; x-bullet-token=2neAiuYvAU5cbMXpmsXD5OJlewXCKryg8dSpDCgag8ZwbZpn3uIHi0A1AOtpCibAwoXOiOG0Q0H7xkHXxIN6-Fw7A_DD7umEziVfeXsg3OEPtzcigcJM6KqRyqznCVt1vKhvwHn1CVm7qYBBNVX2tNyGHm3eNqX1XXVnpwJUSU6deVGf_8WhG6z5J9sQhK6a.Ryku1LX-yE_3gOhdsyyP_A==; _ga=GA1.1.742715342.1710214977; WEBGRAY=stable; X-GRAY=xgray-growth2024122402; X_GRAY_TEMP_UUID=784ca31b-ddb7-4135-9bcb-fcbfb657d80d; X_GRAY_TMP=1735029247065; .thumbcache_c294bfec3668b22bff5f6aa9bb528f6a=ZJ0G4elUuqbI83It+mOJebOz1ZIFPqVML1vZztlHJH91JJ4ryjcxAa3HoD50MT/FjGKBNs4tqYzI7oeUsCIqWA%3D%3D; _ga_YHWW24NNH9=GS1.1.1735029231.15.1.1735029345.9.0.0; AWSALB=mex+hSv6o40AzE69W9+nzTTnvglfNJLPYuQytymQpbZmi8Q+ldGaAvErVuP/3uzvLBslLb85M5a5f+GxAOzBPtIgx88OeEWuHgJNqFWZwdSvSllImvTOyeJZM7Tm; AWSALBCORS=mex+hSv6o40AzE69W9+nzTTnvglfNJLPYuQytymQpbZmi8Q+ldGaAvErVuP/3uzvLBslLb85M5a5f+GxAOzBPtIgx88OeEWuHgJNqFWZwdSvSllImvTOyeJZM7Tm",
		"Referer": "https://www.kucoin.com/otc/buy/USDT-VND",
		"Referrer-Policy": "origin-when-cross-origin"
      },
    },
    bybit: {
      url: 'https://api2.bybitglobal.com/fiat/otc/item/online',
      headers: {
        "accept": "application/json",
        "accept-language": "en",
        "content-type": "application/json;charset=UTF-8",
        // ... (rest of your Bybit_header)
      },
    },
    xt: {
      url: 'https://www.xt.com/exchange-otc/api/web/1_0_0/get-adv-list',
      headers: {
		"accept": "application/json, text/plain, */*",
		"accept-language": "en,en-SG;q=0.9,vi;q=0.8",
		"api-version": "2",
		"cache-control": "no-cache",
		"client-code": "1735032999713S7lYFXNdOam1en2zsDY",
		"content-type": "application/x-www-form-urlencoded",
		"device": "web",
		"lang": "en",
		"pragma": "no-cache",
		"priority": "u=1, i",
		"sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "\"Windows\"",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-origin",
		"cookie": "lang=en; clientCode=1735032999713S7lYFXNdOam1en2zsDY; _ga=GA1.1.948321165.1735033006; captcha_v4_user=a21e4c54115f44c3afcc6238c51407a0; _ga_CY0DPVC3GS=GS1.1.1735660652.2.1.1735660656.0.0.0; _ga_MK8XKWK7DV=GS1.1.1735660653.2.1.1735660656.0.0.0",
		"Referer": "https://www.xt.com/otc/index",
		"Referrer-Policy": "strict-origin-when-cross-origin"
      },
    },
	bitunix: {
      url: 'https://api.bitunix.com/web/p2p/ad/buy',
      headers: {
        "accept": "application/json",
        "accept-language": "en_US",
        "build-cu": "200000000",
        "client-type": "pc",
        "clienttype": "pc",
        "content-type": "application/json",
        "exchange-client": "pc",
        "exchange-language": "en_US",
        "language": "en_US",
        "platform-cu": "pc",
        "priority": "u=1, i",
        "sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "Referer": "https://www.bitunix.com/"
      },
    },
	kucoin: {
	  url: 'https://www.kucoin.com/_api/otc/ad/list',
	  headers: {
		"accept": "application/json",
		"accept-language": "en,en-SG;q=0.9,vi;q=0.8",
		"priority": "u=1, i",
		"sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "\"Windows\"",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-origin",
		"x-site": "global",
		"Referer": "https://www.kucoin.com/otc/buy/USDT-VND"
		// Không cần cookie → đã bỏ
		},
	},
	bitmart: {
	  url: 'https://www.bitmart.com/gw-api/p2p-trade/p2p/ad/getAdBook',
	  headers: {
		"accept": "application/json, text/plain, */*",
		"accept-language": "en,en-SG;q=0.9,vi;q=0.8",
		"content-type": "application/json",
		"origin": "https://www.bitmart.com",
		"referer": "https://www.bitmart.com/p2p",
		"sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "\"Windows\"",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-origin",
		"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
		"x-bm-agency": "0",
		"x-bm-client": "WEB",
		"x-bm-contract": "2",
		"x-bm-device": "f34ac938a34c97a83df023b709573410", // Cố định OK
		"x-bm-local": "en_US",
		"x-bm-timezone": "Asia/Bangkok",
		"x-bm-timezone-offset": "-420",
		"x-bm-ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
		"x-bm-version": "2b4c71d2"
	  }
	},
	lbank: {
	  url: 'https://ccapi.rerrkvifj.com/otc-trade-center/acceptant/v1/advertisementList',
	  headers: {
		"accept": "application/json, text/plain, */*",
		"accept-language": "en-US",
		"content-type": "application/json",
		"origin": "https://www.lbank.com",
		"referer": "https://www.lbank.com/",
		"sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "\"Windows\"",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "cross-site",
		"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
		"ex-client-type": "WEB",
		"ex-client-source": "WEB",
		"ex-language": "en-US",
		"ex-host-name": "www.lbank.com",
		"ex-browser-name": "Chrome",
		"ex-browser-version": "142.0.0.0",
		"ex-os-name": "Windows",
		"ex-os-version": "10",
		"ex-station": "1"
	  }
	},
	poloniex: {
	  url: 'https://www.poloniex.com/proxy/sapi/spot/otc/advertisement/public/list',
	  headers: {
		"accept": "application/json, text/plain, */*",
		"accept-language": "en-us",
		"lang": "en-us",
		"referer": "https://www.poloniex.com/p2p/markets/buy/usdt-vnd",
		"sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": "\"Windows\"",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-origin",
		"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
		"x-app-id": "poloniex-web"
	  }
	},
  },
  thresholds: {
    minPrice: 25400, // VND
    maxAmount: 1500000, // VND
    maxResults: 5,
  },
  pollingInterval: 2, // seconds
};