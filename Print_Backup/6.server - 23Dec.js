/**
 * server.js - AppSheet -> Webhook -> NodeJS -> ESC/POS (Network printer RAW 9100)
 * Unicode Vietnamese by HTML -> PNG -> ESC/POS raster
 *
 * Endpoints (tất cả dưới prefix /goldlaundry):
 * - GET  /goldlaundry/           → thông báo
 * - GET  /goldlaundry/health     → OK
 * - GET  /goldlaundry/last       → JSON body cuối cùng
 * - POST /goldlaundry/print      → in hóa đơn
 * - POST /goldlaundry/print-request → in phiếu yêu cầu giặt ủi
 *
 * Cloudflare Tunnel: lyhuynh.online → localhost:3000 (không cần thay config.yml)
 */
const express = require("express");
const net = require("net");
const puppeteer = require("puppeteer");
const { PNG } = require("pngjs");
const { format } = require('date-fns');
// ================== CONFIG ==================
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const API_PORT = Number(process.env.API_PORT || 3000);
// 80mm chuẩn: 576 dots
const PAPER_DOTS_INVOICE = 576;
// DPI phổ biến máy in nhiệt: 203 dpi → 10cm = khoảng 236 dots chiều cao
const MIN_HEIGHT_DOTS_INVOICE = 400; // Tăng để chứa QR (từ 236 lên 400)
// ngưỡng trắng/đen (càng thấp càng đậm)
const GRAY_THRESHOLD = Number(120);
// số dòng feed sau khi in (giảm để bớt dư giấy)
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
  const totalNumber = parseFloat(total.replace(/,/g, ''));
  
  const qrUrl = `https://img.vietqr.io/image/970441-191264-compact.png?amount=${totalNumber}`;

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
  .title{font-size:45px;font-weight:950;letter-spacing:.3px;margin-top:4px;}
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
  .qr-section{margin-top:12px;}
  .qr-title{font-size:28px;font-weight:750;margin-bottom:6px;}
  .qr-img{width:250px;height:250px;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="center shop">${escapeHtml(SHOP_NAME)}</div>
    <div class="center hotline">${escapeHtml(SHOP_HOTLINE)}</div>
    <div class="center addr">${escapeHtml(SHOP_ADDR)}</div>
    <div class="center title">${escapeHtml(title)}</div>
    <hr/>
    <div class="row">
      <div>Khách hàng:</div>
      <div>${escapeHtml(customer)}</div>
    </div>
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
    <div class="center qr-section">
      <div class="qr-title">Chuyển khoản qua QR</div>
      <img src="${qrUrl}" alt="QR Code" class="qr-img">
    </div>
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
// ================== PUPPETEER (CROP HEIGHT) ==================
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}
async function renderHTMLToPNGBuffer(html) {
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
// ================== ROUTES (TẤT CẢ DƯỚI /goldlaundry) ==================
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

// Gắn router vào prefix /goldlaundry
app.use('/goldlaundry', goldlaundryRouter);

// Route gốc để kiểm tra tunnel
app.get("/", (req, res) => res.send("Cloudflare Tunnel OK - Use /goldlaundry/print or /goldlaundry/health"));

// ================== START ==================
app.listen(API_PORT, () => {
  console.log(`✅ API listening: http://127.0.0.1:${API_PORT}`);
  console.log(`🖨️  Webhook URL: https://lyhuynh.online/goldlaundry/print`);
  console.log(`🧾 Hóa đơn: 80mm, dài tối thiểu ~10cm | TOP_PAD=${TOP_PAD} FEED_LINES=${FEED_LINES}`);
});