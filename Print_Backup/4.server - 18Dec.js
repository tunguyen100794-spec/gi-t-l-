/** 
 * server.js - AppSheet -> Webhook -> NodeJS -> ESC/POS (Network printer RAW 9100)
 * Unicode Vietnamese by HTML -> PNG -> ESC/POS raster
 *
 * Endpoints:
 * - GET /health
 * - GET /last
 * - POST /print (INVOICE) ✅ giữ cấu trúc hóa đơn như bản đang đẹp
 * - POST /print-request (REQUEST) ✅ thêm phiếu yêu cầu giặt ủi, không phá hóa đơn
 *
 * NOTE:
 * - Giảm dư trắng phần trên: chỉnh TOP_PAD (mặc định 2px) + giảm margin-top title nhẹ.
 * - Giảm dư giấy dưới: chỉnh FEED_LINES (mặc định 1).
 */
const express = require("express");
const net = require("net");
const puppeteer = require("puppeteer");
const { PNG } = require("pngjs");
const { format } = require('date-fns');
// ================== CONFIG ==================
const PRINTER_IP = process.env.PRINTER_IP || "192.168.1.222";
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const API_PORT = Number(process.env.API_PORT || 3000);
// 80mm thường ~ 576 dots; 58mm thường ~ 384 dots
const PAPER_DOTS = Number(process.env.PAPER_DOTS || 576);
// ngưỡng trắng/đen (càng thấp càng đậm)
const GRAY_THRESHOLD = Number(process.env.GRAY_THRESHOLD || 200);
// số dòng feed sau khi in (giảm để bớt dư giấy)
const FEED_LINES = Number(process.env.FEED_LINES || 1);
// giảm dư trắng phía trên (px) – bạn có thể thử 0 / 1 / 2
const TOP_PAD = Number(process.env.TOP_PAD || 2);
// ================== APP ==================
const app = express();
app.use(express.json({ limit: "1024kb" }));
let LAST = { at: null, ip: null, body: null };
// ================== RAW PRINT ==================
const bytes = (...arr) => Buffer.from(arr);
function printRaw(payload) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setTimeout(15000);
    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
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
// Parse: "610,000" "1.070.000" "1070000 đ" 1070000
function toNumberLoose(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return 0;
    const cleaned = s.replace(/[^\d-]/g, "");
    if (!cleaned || cleaned === "-") return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function money(v) {
  const n = toNumberLoose(v);
  return n.toLocaleString("vi-VN");
}
function normalizeItems(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((it) => it && typeof it === "object")
    .map((it) => {
      const name = String(it.name ?? "").trim();
      const qty = toNumberLoose(it.qty ?? it.quantity ?? 0);
      const price = toNumberLoose(it.price ?? 0);
      const amount = toNumberLoose(it.amount ?? (qty * price));
      return { name, qty, price, amount };
    })
    .filter(
      (it) =>
        it.name !== "" && (it.qty !== 0 || it.price !== 0 || it.amount !== 0)
    );
}
function calcTotal(data, items) {
  const t = toNumberLoose(data.total);
  if (t > 0) return t;
  return items.reduce((s, it) => s + toNumberLoose(it.amount), 0);
}
// ================== HTML: INVOICE (GIỮ Y NGUYÊN CẤU TRÚC ĐẸP) ==================
function buildReceiptHTML(data) {
  const SHOP_NAME = "Gold laundry";
  const SHOP_ADDR = "282 Diên Hồng";
  const SHOP_HOTLINE = "Hotline: 077 777 9711";
  const items = normalizeItems(data.items);
  const title = data.title || "HÓA ĐƠN";
  const customer = data.customer || "N/A";
  const date = format(new Date(), 'dd/MM/yyyy HH:mm');
  // Request info (từ bên Invoice)
  const reqCreated = (data.request_created_at || "").trim();
  const reqEmployee = (data.request_employee_name || "").trim();
  const requestLine =
    reqCreated || reqEmployee
      ? `Yêu cầu tạo lúc ${escapeHtml(reqCreated || "N/A")} bởi ${escapeHtml(
          reqEmployee || "N/A"
        )}`
      : "";
  const total = calcTotal(data, items);
  // Customer pay + change
  const custPay = toNumberLoose(data.cust_pay ?? 0);
  const change = custPay > 0 ? custPay - total : 0;
  const paidRow = ""; // vẫn giữ như bản đẹp của bạn
  const payRow =
    custPay > 0
      ? `<div class="row"><div>Khách đưa:</div><div class="right">${money(
          custPay
        )} đ</div></div>`
      : "";
  const changeRow =
    custPay > 0
      ? `<div class="row"><div>Trả lại khách:</div><div class="right">${money(
          change
        )} đ</div></div>`
      : "";
  // Thêm payment_method (nếu có)
  const paymentMethod = String(data.payment_method || "").trim();
  const paymentRow = paymentMethod
    ? `<div class="row"><div>Thanh toán bằng:</div><div>${escapeHtml(paymentMethod)}</div></div>`
    : "";
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
  /* ✅ giảm dư trắng phần trên: TOP_PAD */
  .wrap{ padding:${TOP_PAD}px 10px 8px 10px; }
  .center{text-align:center;}
  .right{text-align:right;}
  .shop{font-size:26px;font-weight:900;letter-spacing:.3px;margin:0;}
  .hotline{font-size:20px;font-weight:600;letter-spacing:.3px;margin:0;}
  .addr{font-size:16px;margin-top:2px;opacity:.9;}
  /* ✅ giảm margin-top nhẹ */
  .title{font-size:30px;font-weight:950;letter-spacing:.3px;margin-top:4px;}
  hr{border:0;border-top:2px dashed #000;margin:8px 0;}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:19px;font-weight:650;line-height:1.15;}
  .row.muted{font-weight:450;opacity:.9;margin-top:2px;}
  .note{font-size:16px;font-weight:650;line-height:1.2;margin-top:6px;}
  table{width:100%;border-collapse:collapse;margin-top:6px;}
  th,td{font-size:18px;padding:6px 0;vertical-align:top;}
  th{text-align:left;border-bottom:2px solid #000;padding-bottom:6px;}
  td.qty{width:60px;text-align:right;padding-right:6px;}
  td.price{width:120px;text-align:right;padding-right:6px;}
  td.amount{width:150px;text-align:right;}
  .total{font-size:22px;font-weight:950;margin-top:6px;display:flex;justify-content:space-between;}
  .thanks{font-size:18px;margin-top:8px;font-weight:750;}
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
            <td class="qty">${escapeHtml(it.qty)}</td>
            <td class="price">${money(it.price)}</td>
            <td class="amount">${money(it.amount)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
    <hr/>
    <div class="total">
      <div>Tổng tiền:</div>
      <div class="right">${money(total)} đ</div>
    </div>
    ${paidRow}
    ${payRow}
    ${changeRow}
    ${paymentRow}
    <div class="center thanks">Cảm ơn quý khách! 😊</div>
  </div>
</body>
</html>
`;
}
// ================== HTML: REQUEST TICKET (THÊM MỚI, KHÔNG ĐỤNG HÓA ĐƠN) ==================
function buildRequestTicketHTML(data) {
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
  /* ✅ giảm dư trắng phần trên */
  .wrap{ padding:${TOP_PAD}px 10px 8px 10px; }
  .center{text-align:center;}
  .right{text-align:right;}
  .shop{font-size:26px;font-weight:900;letter-spacing:.3px;margin:0;}
  .addr{font-size:16px;margin-top:2px;opacity:.9;}
  .title{font-size:30px;font-weight:950;letter-spacing:.3px;margin-top:6px;}
  hr{border:0;border-top:2px dashed #000;margin:8px 0;}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:19px;font-weight:650;line-height:1.2;}
  .label{min-width:110px;}
  .boxTitle{font-size:20px;font-weight:900;margin-top:6px;}
  .desc{
    margin-top:6px;
    font-size:20px;
    font-weight:750;
    line-height:1.25;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .thanks{font-size:18px;margin-top:10px;font-weight:750;}
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
  await page.setViewport({ width: PAPER_DOTS, height: 650, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  const height = await page.evaluate(() => Math.ceil(document.body.scrollHeight));
  const pngBuffer = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: PAPER_DOTS, height },
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
// ================== ROUTES ==================
app.get("/", (req, res) => res.send("OK - use /health or POST /print, /print-request"));
app.get("/health", (req, res) => res.send("OK"));
app.get("/last", (req, res) => res.json(LAST));
app.post("/print", async (req, res) => {
  try {
    LAST = { at: new Date().toISOString(), ip: req.ip, body: req.body || null };
    console.log("Incoming /print:", JSON.stringify(req.body || {}));
    const html = buildReceiptHTML(req.body || {});
    const png = await renderHTMLToPNGBuffer(html);
    const payload = buildPrintPayloadFromPNG(png);
    await printRaw(payload);
    res.json({ ok: true });
  } catch (e) {
    console.error("Print error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.post("/print-request", async (req, res) => {
  try {
    LAST = { at: new Date().toISOString(), ip: req.ip, body: req.body || null };
    console.log("Incoming /print-request:", JSON.stringify(req.body || {}));

    // Đọc giá trị Print_Times từ payload
    const printTimes = parseInt(req.body.Print_Times, 10) || 1;

    // In nhiều lần
    for (let i = 0; i < printTimes; i++) {
      const html = buildRequestTicketHTML(req.body || {});
      const png = await renderHTMLToPNGBuffer(html);
      const payload = buildPrintPayloadFromPNG(png);
      await printRaw(payload);
      console.log(`Printed request ticket ${i + 1} of ${printTimes}`);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Print-request error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ================== START ==================
app.listen(API_PORT, () => {
  console.log(`✅ API listening: http://127.0.0.1:${API_PORT}`);
  console.log(`🖨️ Printer target: ${PRINTER_IP}:${PRINTER_PORT}`);
  console.log(`🧾 PAPER_DOTS=${PAPER_DOTS} TOP_PAD=${TOP_PAD} FEED_LINES=${FEED_LINES}`);
});
