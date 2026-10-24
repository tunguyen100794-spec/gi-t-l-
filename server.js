/**
 * server.js - AppSheet -> Webhook -> NodeJS -> ESC/POS (Network printer RAW 9100)
 * Unicode Vietnamese by HTML -> PNG -> ESC/POS raster
 *
 * ĐÃ SỬA TRIỆT ĐỂ LỖI ConnectionClosedError:
 * - Browser Puppeteer tự động relaunch khi disconnect (rất hay xảy ra sau khi máy tắt/mở lại)
 * - Retry 1 lần khi gặp Connection closed
 * - Thêm nhiều Chrome args ổn định hơn (giảm crash, tiết kiệm RAM)
 * - Log rõ ràng khi relaunch
 *
 * Endpoints (tất cả dưới prefix /goldlaundry):
 * - GET /goldlaundry/ → thông báo
 * - GET /goldlaundry/health → OK
 * - GET /goldlaundry/last → JSON body cuối cùng
 * - POST /goldlaundry/print → in hóa đơn
 * - POST /goldlaundry/print-request → in phiếu yêu cầu giặt ủi
 * - POST /goldlaundry/send-zns → gửi ZNS
 *
 * Cloudflare Tunnel: lyhuynh.online → localhost:3000
 */
const express = require("express");
const net = require("net");
const puppeteer = require("puppeteer");
const { PNG } = require("pngjs");
const { format } = require('date-fns');
const fetch = require("node-fetch");
const { URLSearchParams } = require("url");
const fs = require("fs");
const path = require("path");

// ================== CONFIG ==================
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const API_PORT = Number(process.env.API_PORT || 3000);
// 80mm chuẩn: 576 dots
const PAPER_DOTS_INVOICE = 576;
// DPI phổ biến máy in nhiệt: 203 dpi → 10cm = khoảng 236 dots chiều cao
const MIN_HEIGHT_DOTS_INVOICE = 400;
// ngưỡng trắng/đen (càng thấp càng đậm)
const GRAY_THRESHOLD = Number(120);
// số dòng feed sau khi in
const FEED_LINES = Number(process.env.FEED_LINES || 1);
// giảm dư trắng phía trên (px)
const TOP_PAD = Number(process.env.TOP_PAD || 2);

// ================== APP ==================
const app = express();
app.use(express.json({ limit: "1024kb" }));
let LAST = { at: null, ip: null, body: null };

// ================== RAW PRINT ==================
const bytes = (...arr) => Buffer.from(arr);

function printRaw(payload, printerIP) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setTimeout(15000);
    socket.connect(PRINTER_PORT, printerIP, () => {
      socket.write(payload);
      setTimeout(() => socket.end(), 700);
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.on("error", reject);
    socket.on("close", resolve);
  });
}

// ================== HELPERS ==================
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeItems(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((it) => it && typeof it === "object")
    .map((it) => ({
      name: String(it.name ?? "").trim(),
      qty: String(it.qty ?? "").trim(),
      price: String(it.price ?? "").trim(),
      amount: String(it.amount ?? "").trim(),
    }))
    .filter((it) => it.name !== "");
}

// ================== HTML: INVOICE (80MM, DÀI TỐI THIỂU 10CM) ==================
function buildReceiptHTML(data) {
  const PAPER_DOTS = PAPER_DOTS_INVOICE;
  const SHOP_NAME = "Gold laundry";
  const SHOP_ADDR = "282 Diên Hồng";
  const SHOP_HOTLINE = "Hotline: 077 777 9711";
  const items = normalizeItems(data.items);
  const title = data.title || "HÓA ĐƠN";
  const customer = data.customer || "N/A";
  const customerPhone = data.customer_phone || "";
  const date = format(new Date(), 'dd/MM/yyyy HH:mm');
  const reqCreated = (data.request_created_at || "").trim();
  const reqEmployee = (data.request_employee_name || "").trim();
  const requestLine =
    reqCreated || reqEmployee
      ? `Yêu cầu tạo lúc ${escapeHtml(reqCreated || "N/A")} bởi ${escapeHtml(
          reqEmployee || "N/A"
        )}`
      : "";
  const total = String(data.total || "0").trim();

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body{
    margin:0;padding:0;width:${PAPER_DOTS}px;background:#fff;color:#000;
    font-family: Arial,"Segoe UI",sans-serif;
    min-height:${MIN_HEIGHT_DOTS_INVOICE}px;
    box-sizing:border-box;
  }
  .wrap{ padding:${TOP_PAD}px 10px 8px 10px; }
  .center{text-align:center;}
  .right{text-align:right;}
  .shop{font-size:39px;font-weight:900;letter-spacing:.3px;margin:0;}
  .hotline{font-size:30px;font-weight:600;letter-spacing:.3px;margin:0;}
  .addr{font-size:24px;margin-top:2px;opacity:.9;}
  .title{font-size:90px;font-weight:950;letter-spacing:.5px;margin-top:8px;}
  .phone-info{font-size:32px;font-weight:700;margin-top:6px;}
  hr{border:0;border-top:2px dashed #000;margin:8px 0;}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:28.5px;font-weight:650;line-height:1.15;}
  .row.muted{font-weight:450;opacity:.9;margin-top:2px;}
  .note{font-size:24px;font-weight:650;line-height:1.2;margin-top:6px;}
  table{width:100%;border-collapse:collapse;margin-top:6px;}
  th,td{font-size:27px;padding:6px 0;vertical-align:top;}
  th{text-align:left;border-bottom:2px solid #000;padding-bottom:6px;}
  td.qty{width:60px;text-align:right;padding-right:6px;}
  td.price{width:120px;text-align:right;padding-right:6px;}
  td.amount{width:150px;text-align:right;}
  .total{font-size:33px;font-weight:950;margin-top:6px;display:flex;justify-content:space-between;}
  .thanks{font-size:27px;margin-top:8px;font-weight:750;}
  .min-padding{flex:1;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="center shop">${escapeHtml(SHOP_NAME)}</div>
    <div class="center hotline">${escapeHtml(SHOP_HOTLINE)}</div>
    <div class="center addr">${escapeHtml(SHOP_ADDR)}</div>
    <div class="center title">${escapeHtml(title)}</div>
    ${customerPhone ? `<div class="center phone-info">SĐT: ${escapeHtml(customerPhone)}</div>` : ""}
    <hr/>
    <div class="row muted">
      <div>In lúc:</div>
      <div>${escapeHtml(date)}</div>
    </div>
    ${requestLine ? `<div class="note">${requestLine}</div>` : ""}
    <hr/>
    <table>
      <thead>
        <tr>
          <th>Mặt hàng</th>
          <th style="text-align:right;">SL</th>
          <th style="text-align:right;">Giá</th>
          <th style="text-align:right;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (it) => `
          <tr>
            <td>${escapeHtml(it.name)}</td>
            <td class="qty">${escapeHtml(it.qty.replace('.', ','))}</td>
            <td class="price">${escapeHtml(it.price)}</td>
            <td class="amount">${escapeHtml(it.amount)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
    <hr/>
    <div class="total">
      <div>Tổng tiền:</div>
      <div class="right">${escapeHtml(total)} đ</div>
    </div>
    <div class="min-padding"></div>
    <div class="center thanks">Cảm ơn quý khách! 😊</div>
  </div>
</body>
</html>
`;
}

// ================== HTML: REQUEST TICKET ==================
function buildRequestTicketHTML(data) {
  const PAPER_DOTS = 576;
  const SHOP_NAME = String(data.shop_name || "Gold laundry");
  const SHOP_ADDR = String(data.shop_address || "282 Diên Hồng");
  const title = String(data.title || "PHIẾU YÊU CẦU GIẶT ỦI");
  const createdAt = String(data.created_at || "");
  const employee = String(data.employee || "");
  const customer = String(data.customer || "");
  const phone = String(data.phone || "");
  const desc = String(data.description || "");

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body{
    margin:0;padding:0;width:${PAPER_DOTS}px;background:#fff;color:#000;
    font-family: Arial,"Segoe UI",sans-serif;
  }
  .wrap{ padding:${TOP_PAD}px 10px 8px 10px; }
  .center{text-align:center;}
  .right{text-align:right;}
  .shop{font-size:39px;font-weight:900;letter-spacing:.3px;margin:0;}
  .addr{font-size:24px;margin-top:2px;opacity:.9;}
  .title{font-size:45px;font-weight:950;letter-spacing:.3px;margin-top:6px;}
  hr{border:0;border-top:2px dashed #000;margin:8px 0;}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:28.5px;font-weight:650;line-height:1.2;}
  .label{min-width:110px;}
  .boxTitle{font-size:30px;font-weight:900;margin-top:6px;}
  .desc{
    margin-top:6px;
    font-size:30px;
    font-weight:750;
    line-height:1.25;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .thanks{font-size:27px;margin-top:10px;font-weight:750;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="center shop">${escapeHtml(SHOP_NAME)}</div>
    <div class="center addr">${escapeHtml(SHOP_ADDR)}</div>
    <hr/>
    <div class="center title">${escapeHtml(title)}</div>
    <hr/>
    <div class="row"><div class="label">Tạo lúc:</div><div class="right">${escapeHtml(createdAt)}</div></div>
    <div class="row"><div class="label">Nhân viên:</div><div class="right">${escapeHtml(employee)}</div></div>
    <hr/>
    <div class="row"><div class="label">Khách:</div><div class="right">${escapeHtml(customer)}</div></div>
    <div class="row"><div class="label">SĐT:</div><div class="right">${escapeHtml(phone)}</div></div>
    <hr/>
    <div class="boxTitle">Nội dung yêu cầu:</div>
    <div class="desc">${escapeHtml(desc || "(Trống)")}</div>
    <hr/>
    <div class="center thanks">Cảm ơn quý khách!</div>
  </div>
</body>
</html>
`;
}

// ================== PUPPETEER (ROBUST - TỰ ĐỘNG RELAUNCH) ==================
let browserPromise = null;

async function getBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (browser && browser.process && !browser.process().killed) {
        return browser;
      }
    } catch (err) {
      console.warn("Previous browser promise rejected:", err.message);
    }
    browserPromise = null;
  }

  console.log("🌟 Launching new Puppeteer browser...");
  browserPromise = puppeteer
    .launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--no-first-run",
        "--disable-extensions",
      ],
    })
    .then((browser) => {
      console.log("✅ Browser launched successfully.");
      browser.on("disconnected", () => {
        console.error("❌ Puppeteer browser disconnected! Resetting for auto-relaunch...");
        browserPromise = null;
      });
      return browser;
    })
    .catch((err) => {
      console.error("❌ Browser launch failed:", err);
      browserPromise = null;
      throw err;
    });

  return browserPromise;
}

async function renderHTMLToPNGBuffer(html) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      const width = PAPER_DOTS_INVOICE;

      await page.setViewport({ width, height: 650, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: "networkidle0" });

      let height = await page.evaluate(() => Math.ceil(document.body.scrollHeight));
      if (html.includes('HÓA ĐƠN') && height < MIN_HEIGHT_DOTS_INVOICE) {
        height = MIN_HEIGHT_DOTS_INVOICE;
      }

      const pngBuffer = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width, height },
        omitBackground: true,
      });

      await page.close();
      return pngBuffer;
    } catch (e) {
      console.error(`[Render attempt ${attempt}/2] Failed: ${e.message}`);
      if (attempt === 1 && (e.message.includes("Connection closed") || e.message.includes("ConnectionClosedError"))) {
        console.log("🔄 Forcing browser reset due to connection error...");
        browserPromise = null;
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw e;
    }
  }
}

// ================== PNG -> ESC/POS RASTER ==================
function pngBufferToEscposRaster(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  const width = png.width;
  const height = png.height;
  const widthBytes = Math.ceil(width / 8);
  const data = Buffer.alloc(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let xb = 0; xb < widthBytes; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        let black = 0;
        if (x < width) {
          const idx = (y * width + x) * 4;
          const r = png.data[idx];
          const g = png.data[idx + 1];
          const b = png.data[idx + 2];
          const a = png.data[idx + 3];
          if (a < 10) black = 0;
          else {
            const gray = r * 0.299 + g * 0.587 + b * 0.114;
            black = gray < GRAY_THRESHOLD ? 1 : 0;
          }
        }
        if (black) byte |= 0x80 >> bit;
      }
      data[y * widthBytes + xb] = byte;
    }
  }

  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  return Buffer.concat([
    Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    data,
  ]);
}

function buildPrintPayloadFromPNG(pngBuffer) {
  const ESC_INIT = bytes(0x1b, 0x40);
  const ALIGN_LEFT = bytes(0x1b, 0x61, 0x00);
  const FEED = bytes(0x1b, 0x64, FEED_LINES);
  const CUT = bytes(0x1d, 0x56, 0x42, 0x00);
  const raster = pngBufferToEscposRaster(pngBuffer);
  return Buffer.concat([ESC_INIT, ALIGN_LEFT, raster, FEED, CUT]);
}

// ================== ROUTES ==================

// ================== ZALO VIP CARD AUTO SEND (ANTI-SPAM CACHE 30 NGÀY) ==================
const VIP_CACHE_FILE = path.join(__dirname, "sent_vip_cache.json");
const VIP_COOLDOWN_DAYS = 30;


function cleanCustomerName(name) {
  if (!name) return "";
  let s = String(name).trim();
  s = s.replace(/(\+?84|0)?[0-9]{9,10}/g, "");
  s = s.replace(/[\*\(\)]+/g, " ");
  s = s.replace(/\s+[0-9]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function shouldSendVipCard(phone) {
  try {
    if (!fs.existsSync(VIP_CACHE_FILE)) return true;
    const cache = JSON.parse(fs.readFileSync(VIP_CACHE_FILE, "utf8"));
    const lastSent = cache[phone];
    if (!lastSent) return true;
    const daysSince = (Date.now() - new Date(lastSent).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= VIP_COOLDOWN_DAYS;
  } catch (err) {
    console.error("Error reading VIP cache:", err.message);
    return true;
  }
}

function markVipCardSent(phone) {
  try {
    let cache = {};
    if (fs.existsSync(VIP_CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(VIP_CACHE_FILE, "utf8"));
    }
    cache[phone] = new Date().toISOString();
    fs.writeFileSync(VIP_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving VIP cache:", err.message);
  }
}

async function triggerSendVipCard(phone, customerName) {
  try {
    let cleanPhone = (phone || "").toString().trim().replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("84")) {
      cleanPhone = "0" + cleanPhone.slice(2);
    }
    if (!cleanPhone || cleanPhone.length < 9) {
      console.log("[VIP-AUTO] Bỏ qua: SĐT không hợp lệ:", phone);
      return;
    }

    if (!shouldSendVipCard(cleanPhone)) {
      console.log(`[VIP-AUTO] Bỏ qua gửi Thẻ VIP cho ${cleanPhone}: Đã gửi trong vòng ${VIP_COOLDOWN_DAYS} ngày.`);
      return;
    }

    const cleanName = cleanCustomerName(customerName);
    const greeting = cleanName ? `KÍNH CHÀO ${cleanName.toUpperCase()}!` : "KÍNH CHÀO QUÝ KHÁCH!";
    const shortCardUrl = "giatsayquynhon.vn/the";

    const greetingLine = cleanName ? `Kính chào Quý khách ${cleanName.toUpperCase()}!` : "Kính chào Quý khách!";

    const cardCaption = 
      `✨ GIẶT SẤY GOLD LAUNDRY ✨\n` +
      `${greetingLine}\n\n` +
      `Cảm ơn Quý khách đã tin tưởng gửi đồ tại cửa hàng hôm nay.\n\n` +
      `Cửa hàng thân gửi tặng Quý khách THẺ THÀNH VIÊN VIP ĐIỆN TỬ để tích điểm và theo dõi tiến độ giặt sấy.\n\n` +
      `👉 Đăng ký & mở Thẻ VIP tại:\n` +
      `${shortCardUrl}\n\n` +
      `📞 Hotline hỗ trợ: 0777779711\n` +
      `Kính chúc Quý khách một ngày tốt lành! 🌸`;

    console.log(`[VIP-AUTO] Đang gọi Zalo Gateway gửi Thẻ VIP tới ${cleanPhone}...`);
    const nodeFetch = require("node-fetch");
    const fetchFn = nodeFetch.default || nodeFetch;

    const res = await fetchFn("http://127.0.0.1:5050/api/send-zalo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: cleanPhone,
        message: cardCaption
      })
    });

    const data = await res.json();
    if (data.ok) {
      console.log(`[VIP-AUTO] ✓ Gửi thành công Thẻ VIP Zalo tới ${cleanPhone}!`);
      markVipCardSent(cleanPhone);
    } else {
      console.error(`[VIP-AUTO] Lỗi từ Zalo Gateway khi gửi cho ${cleanPhone}:`, data.error);
    }
  } catch (err) {
    console.error(`[VIP-AUTO] Lỗi kết nối gửi Thẻ VIP cho ${phone}:`, err.message);
  }
}

const goldlaundryRouter = express.Router();


goldlaundryRouter.get("/", (req, res) => res.send("Gold Laundry Printer Ready - Use /goldlaundry/print"));
goldlaundryRouter.get("/health", (req, res) => res.send("OK"));
goldlaundryRouter.get("/last", (req, res) => res.json(LAST));

goldlaundryRouter.post("/print", async (req, res) => {
  try {
    LAST = { at: new Date().toISOString(), ip: req.ip, body: req.body || null };
    console.log("Incoming /goldlaundry/print:", JSON.stringify(req.body || {}));

    const html = buildReceiptHTML(req.body || {});
    const png = await renderHTMLToPNGBuffer(html);
    const payload = buildPrintPayloadFromPNG(png);

    let printers = req.body.printer || [];
    if (typeof printers === "string") printers = [printers];
    if (!Array.isArray(printers) || printers.length === 0) {
      throw new Error("No printer IP provided");
    }

    for (const ip of printers) {
      await printRaw(payload, ip);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Print error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

goldlaundryRouter.post("/print-request", async (req, res) => {
  try {
    LAST = { at: new Date().toISOString(), ip: req.ip, body: req.body || null };
    console.log("Incoming /goldlaundry/print-request:", JSON.stringify(req.body || {}));

    // Kích hoạt gửi ngầm Thẻ VIP qua Zalo (Non-blocking, không làm trễ máy in)
    const phoneToVip = req.body.phone || req.body.customer_phone;
    const customerNameToVip = req.body.customer || "";
    if (phoneToVip) {
      setImmediate(() => {
        triggerSendVipCard(phoneToVip, customerNameToVip).catch(err => {
          console.error("[VIP-AUTO] Background task error:", err.message);
        });
      });
    }

    const printTimes = parseInt(req.body.Print_Times, 10) || 1;
    for (let i = 0; i < printTimes; i++) {
      const html = buildRequestTicketHTML(req.body || {});
      const png = await renderHTMLToPNGBuffer(html);
      const payload = buildPrintPayloadFromPNG(png);

      let printers = req.body.printer || [];
      if (typeof printers === "string") printers = [printers];
      if (!Array.isArray(printers) || printers.length === 0) {
        throw new Error("No printer IP provided");
      }

      for (const ip of printers) {
        await printRaw(payload, ip);
      }
      console.log(`Printed request ticket ${i + 1} of ${printTimes}`);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Print-request error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

goldlaundryRouter.post("/send-zns", async (req, res) => {
  try {
    const body = req.body || {};
    const app_id = body.app_id;
    const app_secret = body.app_secret;
    const refresh_token = body.refresh_token;

    if (!app_id || !app_secret || !refresh_token) {
      throw new Error("Missing credentials: app_id, app_secret, refresh_token");
    }

    console.log("Incoming /goldlaundry/send-zns:", JSON.stringify(body));

    // Refresh access_token
    console.log("Refreshing Zalo access token...");
    const refreshResponse = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "secret_key": app_secret
      },
      body: new URLSearchParams({
        app_id: app_id,
        refresh_token: refresh_token,
        grant_type: "refresh_token"
      })
    });

    const refreshData = await refreshResponse.json();
    if (!refreshResponse.ok || refreshData.error) {
      throw new Error(`Refresh failed: ${refreshData.error_name || refreshData.message || "Unknown error"}`);
    }

    const access_token = refreshData.access_token;
    const new_refresh_token = refreshData.refresh_token;

    console.log("Access token refreshed successfully.");

    // Gửi ZNS
    const payload = {
      recipient: {
        phone: body.number_phone || ""
      },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_id: 530398,
            template_data: {
              customer_code: body.customer_code || "",
              time: body.time || "",
              number_service: body.number_service || 0,
              number_DTL: body.number_DTL || 0,
              number_phone: body.number_phone || "",
              TM: body.TM || ""
            }
          }
        }
      },
      mode: "development"
    };

    const znsResponse = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": access_token
      },
      body: JSON.stringify(payload)
    });

    const zaloResult = await znsResponse.json();
    console.log("Zalo response:", zaloResult);

    if (znsResponse.ok) {
      res.json({ ok: true, zalo: zaloResult, new_refresh_token });
    } else {
      res.status(znsResponse.status).json({ ok: false, zalo: zaloResult });
    }
  } catch (e) {
    console.error("Send ZNS error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Gắn router
app.use('/goldlaundry', goldlaundryRouter);

// Route gốc
app.get("/", (req, res) => res.send("Cloudflare Tunnel OK - Use /goldlaundry/print or /goldlaundry/health"));

// ================== START ==================
app.listen(API_PORT, () => {
  console.log(`✅ API listening: http://127.0.0.1:${API_PORT}`);
  console.log(`🖨️ Webhook URL: https://lyhuynh.online/goldlaundry/print`);
  console.log(`🔔 ZNS URL: https://lyhuynh.online/goldlaundry/send-zns`);
  console.log(`🧾 Hóa đơn: 80mm, dài tối thiểu ~10cm | TOP_PAD=${TOP_PAD} FEED_LINES=${FEED_LINES}`);
  console.log(`🔧 Puppeteer robust mode: auto-relaunch khi ConnectionClosedError`);
});