const express = require("express");
const cors = require("cors");
const { Zalo } = require("zalo-api-final");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const puppeteer = require("puppeteer");
const os = require("os");
const QRCode = require("qrcode");
const { execSync } = require("child_process");


function cleanCustomerName(name) {
  if (!name) return "";
  let s = String(name).trim();
  s = s.replace(/(\+?84|0)?[0-9]{9,10}/g, "");
  s = s.replace(/[\*\(\)]+/g, " ");
  s = s.replace(/\s+[0-9]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function removeVietnameseTones(str) {
  if (!str) return "";
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
  str = str.replace(/\u02C6|\u0306|\u031B/g, "");
  return str.trim();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1024kb" }));

const ZALO_CREDENTIALS_PATH = path.join(__dirname, "zalo_credentials.json");
const ZALO_QR_PATH = path.join(__dirname, "qr.png");
const VIP_CARD_TEMPLATE = path.join(__dirname, "vip_card_full.png");

let zaloClient = null;
let isZaloReady = false;
let isLoggingIn = false;

// ─────────────────────────────────────────────────────────
// Hàng đợi gửi tin (Queue Rate-Limiting: 2.5s giữa các tin)
// ─────────────────────────────────────────────────────────
const sendQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || sendQueue.length === 0) return;
  isProcessingQueue = true;

  while (sendQueue.length > 0) {
    const item = sendQueue.shift();
    try {
      const res = await item.task();
      item.resolve(res);
    } catch (err) {
      item.reject(err);
    }
    if (sendQueue.length > 0) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  isProcessingQueue = false;
}

function enqueueTask(taskFn) {
  return new Promise((resolve, reject) => {
    sendQueue.push({ task: taskFn, resolve, reject });
    processQueue();
  });
}

// ─────────────────────────────────────────────────────────
// Thông báo Telegram (giữ nguyên cấu hình cũ)
// ─────────────────────────────────────────────────────────
async function sendTelegramMessage(messageText) {
  const token = "8418080766:AAGd8gRJyffpFQKUFoXshNnoc7jMoB6-BBI";
  const chatId = "-1003447493989";
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const nodeFetch = require("node-fetch");
    const fetchFn = nodeFetch.default || nodeFetch;

    const response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
      }),
    });
    const result = await response.json();
    if (!result.ok) {
      console.error("Failed to send Telegram text message:", result);
    }
  } catch (error) {
    console.error("Error sending Telegram text message:", error);
  }
}

async function sendTelegramQR(qrPath) {
  const token = "8418080766:AAGd8gRJyffpFQKUFoXshNnoc7jMoB6-BBI";
  const chatId = "-1003447493989";
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  const FormData = require("form-data");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", fs.createReadStream(qrPath));
  form.append("caption", "Vui lòng quét mã QR này bằng Zalo Hotline để đăng nhập hệ thống.");

  try {
    const nodeFetch = require("node-fetch");
    const fetchFn = nodeFetch.default || nodeFetch;
    const response = await fetchFn(url, {
      method: "POST",
      body: form,
      headers: typeof form.getHeaders === "function" ? form.getHeaders() : undefined,
    });
    const result = await response.json();
    if (!result.ok) {
      console.error("Failed to send Telegram QR:", result);
    }
  } catch (error) {
    console.error("Error sending Telegram QR:", error);
  }
}

async function downloadImage(url, filepath) {
  const nodeFetch = require("node-fetch");
  const fetchFn = nodeFetch.default || nodeFetch;
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`unexpected response ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  await fsPromises.writeFile(filepath, Buffer.from(arrayBuffer));
}

// ─────────────────────────────────────────────────────────
// Ghép mã QR vào phôi Thẻ VIP (System.Drawing native Windows)
// ─────────────────────────────────────────────────────────
async function composeVipCard(templatePath, qrPath, outPath) {
  try {
    const normTpl = templatePath.replace(/\\/g, "/");
    const normQr = qrPath.replace(/\\/g, "/");
    const normOut = outPath.replace(/\\/g, "/");

    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $t = [System.Drawing.Bitmap]::FromFile('${normTpl}'); $q = [System.Drawing.Bitmap]::FromFile('${normQr}'); $g = [System.Drawing.Graphics]::FromImage($t); $dest = [System.Drawing.Rectangle]::new(262, 859, 175, 175); $src = [System.Drawing.Rectangle]::new(0, 0, $q.Width, $q.Height); $g.DrawImage($q, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel); $g.Dispose(); $q.Dispose(); $t.Save('${normOut}', [System.Drawing.Imaging.ImageFormat]::Png); $t.Dispose()"`;
    execSync(psCmd);
    return fs.existsSync(outPath);
  } catch (psErr) {
    console.error("[BOT] Lỗi vẽ ảnh Thẻ VIP qua Windows System.Drawing:", psErr.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────
// Nghiệp vụ: Gửi Thẻ VIP (Phục vụ Thu ngân / quanly.html)
// ─────────────────────────────────────────────────────────
async function handleSendVipCard({ phone, message }) {
  if (!isZaloReady || !zaloClient) {
    throw new Error("Zalo Gateway chưa sẵn sàng hoặc chưa đăng nhập.");
  }

  let cleanPhone = (phone || "").toString().trim().replace(/[^0-9]/g, "");
  if (cleanPhone.startsWith("84")) {
    cleanPhone = "0" + cleanPhone.slice(2);
  }
  if (!cleanPhone) {
    throw new Error("Số điện thoại không hợp lệ.");
  }

  console.log(`[BOT-VIP] Đang tìm kiếm khách hàng SĐT: ${cleanPhone}`);
  let userResult = null;
  try {
    userResult = await zaloClient.findUser(cleanPhone);
  } catch (findErr) {
    console.error(`[BOT-VIP] Lỗi tìm user ${cleanPhone}:`, findErr.message);
    throw new Error(`Không tìm thấy Zalo của số ${cleanPhone} (khách chưa đăng ký hoặc chặn tìm kiếm qua SĐT).`);
  }

  if (!userResult || (!userResult.uid && !userResult.userId)) {
    throw new Error(`Không tìm thấy tài khoản Zalo với SĐT ${cleanPhone}.`);
  }

  const targetUid = userResult.uid || userResult.userId;
  const targetName = userResult.display_name || userResult.displayName || userResult.zalo_name || cleanPhone;
  console.log(`[BOT-VIP] Tìm thấy khách: ${targetName} (UID: ${targetUid}). Bắt đầu ghép Thẻ VIP...`);

  const cardUrl = `https://giatsayquynhon.vn/the/?phone=${cleanPhone}`;
  const cleanName = cleanCustomerName(targetName);
  const greeting = cleanName ? `KÍNH CHÀO ${cleanName.toUpperCase()}!` : "KÍNH CHÀO QUÝ KHÁCH!";
  const shortCardUrl = "giatsayquynhon.vn/the";

  const greetingLine = cleanName ? `Kính chào Quý khách ${cleanName.toUpperCase()}` : "Kính chào Quý khách";

  const cardCaption =
    message ||
    `🧺 GIẶT SẤY GOLD LAUNDRY\n` +
      `${greetingLine}\n\n` +
      `Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.\n` +
      `Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN: 💳\n\n` +
      `👉 Mở Thẻ Thành Viên tại:\n` +
      `${shortCardUrl}\n\n` +
      `Hotline: 0777779711\n` +
      `Kính chúc Quý khách một ngày tốt lành! 🌷`;

  const tempQrPath = path.join(os.tmpdir(), `temp_qr_${cleanPhone}_${Date.now()}.png`);
  const finalCardPath = path.join(os.tmpdir(), `card_${cleanPhone}_${Date.now()}.png`);
  let finalSendPath = null;

  try {
    await QRCode.toFile(tempQrPath, cardUrl, {
      width: 175,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    if (fs.existsSync(VIP_CARD_TEMPLATE)) {
      const composed = await composeVipCard(VIP_CARD_TEMPLATE, tempQrPath, finalCardPath);
      if (composed && fs.existsSync(finalCardPath)) {
        finalSendPath = finalCardPath;
        console.log(`[BOT-VIP] ✓ Đã ghép xong ảnh Thẻ VIP hoàn chỉnh cho ${cleanPhone}`);
      }
    }

    if (!finalSendPath && fs.existsSync(tempQrPath)) {
      finalSendPath = tempQrPath;
    }

    if (finalSendPath && fs.existsSync(finalSendPath)) {
      console.log(`[BOT-VIP] Đang gửi ảnh Thẻ VIP tới ${targetName}...`);
      await zaloClient.sendMessage(
        {
          msg: "",
          attachments: [finalSendPath],
        },
        targetUid
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      console.log(`[BOT-VIP] Đang gửi tin nhắn chữ (bong bóng chuẩn) tới ${targetName}...`);
      await zaloClient.sendMessage({ msg: cardCaption }, targetUid);
      console.log(`[BOT-VIP] ✓ Gửi thành công Thẻ VIP & Tin nhắn tới ${targetName} (${cleanPhone})!`);
    } else {
      console.log(`[BOT-VIP] Gửi tin nhắn chữ tới ${targetName}...`);
      await zaloClient.sendMessage({ msg: cardCaption }, targetUid);
      console.log(`[BOT-VIP] ✓ Gửi tin nhắn thành công tới ${targetName} (${cleanPhone})`);
    }
  } catch (sendErr) {
    console.error(`[BOT-VIP] Gửi tin thất bại: ${sendErr.message}. Thử gửi Lời mời kết bạn...`);
    try {
      await zaloClient.sendFriendRequest(cardCaption.slice(0, 150), targetUid);
      console.log(`[BOT-VIP] ✓ Đã gửi lời mời kết bạn kèm tin nhắn tới ${targetName}`);
      return { ok: true, uid: targetUid, name: targetName, friendRequest: true };
    } catch (frErr) {
      console.error(`[BOT-VIP] Gửi lời mời kết bạn thất bại: ${frErr.message}`);
      throw new Error(`Không thể gửi tin Zalo: ${sendErr.message}`);
    }
  } finally {
    if (fs.existsSync(tempQrPath)) {
      try { fs.unlinkSync(tempQrPath); } catch (e) {}
    }
    if (fs.existsSync(finalCardPath)) {
      try { fs.unlinkSync(finalCardPath); } catch (e) {}
    }
  }

  return { ok: true, uid: targetUid, name: targetName };
}

// ─────────────────────────────────────────────────────────
// Tạo ảnh receipt đẹp bằng Puppeteer (Gold Laundry style)
// ─────────────────────────────────────────────────────────
async function generateReceiptImage(data, qrImagePath, outputPath) {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  let qrBase64 = "";
  if (qrImagePath && fs.existsSync(qrImagePath)) {
    const qrBuffer = fs.readFileSync(qrImagePath);
    const isSvg =
      qrBuffer.toString("utf8", 0, 100).includes("<svg") ||
      qrBuffer.toString("utf8", 0, 100).includes("<?xml");
    const mime = isSvg ? "image/svg+xml" : "image/png";
    qrBase64 = `data:${mime};base64,${qrBuffer.toString("base64")}`;
  }

  const { Customer_Name, Complete_Date, Bill_Amount, Point, Customer_Phone } = data;
  const displayName = Customer_Name || Customer_Phone || "Khách hàng";
  let rawAmount = parseInt(String(Bill_Amount || "0").replace(/[^0-9]/g, "")) || 0;
  const formattedAmount = rawAmount.toLocaleString("vi-VN");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Be Vietnam Pro',sans-serif; background:transparent; width:560px; }
    .card { width:560px; background:#f0f5ff; border-radius:24px; overflow:hidden; box-shadow:0 16px 48px rgba(0,30,120,0.18); }
    .header { background:linear-gradient(160deg,#0a2d8f 0%,#1245c8 55%,#1a6fe0 100%); padding:32px 30px 0; text-align:center; position:relative; overflow:hidden; }
    .header::before { content:''; position:absolute; top:-60px; left:50%; transform:translateX(-50%); width:460px; height:260px; background:radial-gradient(ellipse,rgba(255,255,255,0.10) 0%,transparent 70%); }
    .hc { position:absolute; border-radius:50%; background:rgba(255,255,255,0.06); }
    .hc1 { width:220px;height:220px;top:-80px;right:-60px; }
    .hc2 { width:140px;height:140px;bottom:20px;left:-40px; }
    .sparkles { position:relative;z-index:2;display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:10px; }
    .sparkle-icon { color:#ffd740;font-size:22px; }
    .sparkle-icon.sm { font-size:14px; }
    .brand-name { position:relative;z-index:2;font-size:46px;font-weight:900;color:#ffffff;letter-spacing:1px;line-height:1;text-shadow:0 3px 16px rgba(0,0,0,0.2); }
    .brand-sub { position:relative;z-index:2;font-size:13px;font-weight:400;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-top:8px;margin-bottom:20px; }
    .wave { position:relative;z-index:2;line-height:0;margin-top:4px; }
    .wave svg { display:block;width:100%; }
    .status-bar { background:#f0f5ff;padding:14px 24px;display:flex;align-items:center;justify-content:center;gap:14px; }
    .status-line { flex:1;height:2px;background:linear-gradient(90deg,transparent,#1245c8 80%);border-radius:2px; }
    .status-line.right { background:linear-gradient(90deg,#1245c8 20%,transparent); }
    .status-diamond { width:9px;height:9px;border-radius:2px;background:#1245c8;transform:rotate(45deg);flex-shrink:0; }
    .status-text { font-size:27px;font-weight:900;color:#1245c8;text-transform:uppercase;letter-spacing:1px;white-space:nowrap; }
    .body { padding:10px 16px 18px;display:flex;flex-direction:column;gap:10px; }
    .wcard { background:white;border-radius:16px;border:1.5px solid #e0e8f8;padding:14px 18px;box-shadow:0 2px 10px rgba(0,40,160,0.05); }
    .cust-row { display:flex;align-items:center;gap:14px; }
    .cust-avatar { width:50px;height:50px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#1245c8,#2d8ef5);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(18,69,200,0.3); }
    .cust-name { font-size:20px;font-weight:900;color:#0d1b3e; }
    .cust-phone { font-size:14px;color:#6b7db3;margin-top:4px;display:flex;align-items:center;gap:5px; }
    .info-row { display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #edf2fb; }
    .info-row:last-child { border-bottom:none; }
    .info-lbl { font-size:15px;color:#444;display:flex;align-items:center;gap:8px;font-weight:500; }
    .info-val { font-size:16px;font-weight:900;color:#1245c8; }
    .total-card { background:linear-gradient(90deg,#0e3dc7 0%,#1a6fe0 100%);border-radius:16px;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 8px 22px rgba(14,61,199,0.35); }
    .total-lbl { font-size:15px;font-weight:800;color:rgba(255,255,255,0.95);text-transform:uppercase;letter-spacing:0.5px; }
    .total-amt { font-size:40px;font-weight:900;color:#ffffff;line-height:1; }
    .total-curr { font-size:22px;font-weight:700;color:rgba(255,255,255,0.95);margin-left:4px; }
    .notice-card { background:#ffffff;border:1.5px solid #e0e8f8;border-left:4px solid #1245c8;border-radius:16px;padding:15px 20px;box-shadow:0 2px 10px rgba(0,40,160,0.05); }
    .notice-title { font-size:15px;font-weight:900;color:#1245c8;display:flex;align-items:center;gap:8px;margin-bottom:8px; }
    .notice-text { font-size:14px;color:#2d3a5a;line-height:1.75;font-weight:500; }
    .pay-card { background:white;border-radius:16px;border:1.5px solid #e0e8f8;padding:18px;text-align:center;box-shadow:0 2px 10px rgba(0,40,160,0.05); }
    .pay-title { font-size:14px;font-weight:800;color:#1245c8;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px; }
    .pay-sub { font-size:12px;color:#8899bb;margin-bottom:14px; }
    .qr-wrap { display:inline-flex;padding:8px;background:white;border-radius:12px;border:1.5px solid #e0e8f8;box-shadow:0 4px 14px rgba(0,0,0,0.08);margin-bottom:14px; }
    .qr-wrap img { width:170px;height:170px;display:block;border-radius:6px; }
    .chips { display:flex;justify-content:center;gap:8px; }
    .chip { background:#f0f5ff;border:1.5px solid #c8d8f8;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;color:#1245c8; }
    .footer { background:linear-gradient(90deg,#0a2d8f,#1245c8);padding:14px 20px;text-align:center; }
    .footer-text { font-size:13px;color:rgba(255,255,255,0.85);display:inline-flex;align-items:center;gap:6px; }
    .footer-brand { font-weight:800;color:#fff; }
    .footer-heart { color:#ff5252; }
  </style>
</head>
<body>
  <div class="card" id="receipt">
    <div class="header">
      <div class="hc hc1"></div><div class="hc hc2"></div>
      <div class="sparkles">
        <span class="sparkle-icon sm">✦</span>
        <span class="sparkle-icon">✦</span>
        <span class="sparkle-icon sm">✦</span>
      </div>
      <div class="brand-name">GOLD LAUNDRY</div>
      <div class="brand-sub">Dịch vụ giặt ủi sấy cao cấp</div>
      <div class="wave">
        <svg viewBox="0 0 560 48" xmlns="http://www.w3.org/2000/svg" height="48" preserveAspectRatio="none">
          <path d="M0,28 C80,48 160,8 280,28 C400,48 480,8 560,28 L560,48 L0,48 Z" fill="#f0f5ff"/>
        </svg>
      </div>
    </div>
    <div class="status-bar">
      <div class="status-line"></div>
      <div class="status-diamond"></div>
      <div class="status-text">Hoàn thành đơn hàng</div>
      <div class="status-diamond"></div>
      <div class="status-line right"></div>
    </div>
    <div class="body">
      <div class="wcard cust-row">
        <div class="cust-avatar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div>
          <div class="cust-name">${displayName}</div>
        </div>
      </div>
      <div class="wcard" style="padding:4px 18px;">
        <div class="info-row">
          <span class="info-lbl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Thời gian hoàn thành
          </span>
          <span class="info-val">${Complete_Date || ""}</span>
        </div>
        <div class="info-row">
          <span class="info-lbl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Điểm tích lũy
          </span>
          <span class="info-val">${Point || "0"} điểm</span>
        </div>
      </div>
      <div class="total-card">
        <div class="total-lbl">Tổng thanh toán</div>
        <div><span class="total-amt">${formattedAmount}</span><span class="total-curr">đ</span></div>
      </div>
      <div class="notice-card">
        <div class="notice-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1245c8" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          Hướng dẫn nhận đồ
        </div>
        <div class="notice-text">Quý khách ghé trực tiếp cửa hàng để nhận đồ, hoặc nhắn lại tin nhắn này để được giao tận nơi (phụ phí ship).</div>
      </div>
      ${
        qrBase64
          ? `
      <div class="pay-card">
        <div class="pay-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1245c8" stroke-width="2"><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          Thanh toán chuyển khoản
        </div>
        <div class="qr-wrap"><img src="${qrBase64}"/></div>
        <div class="chips">
          <span class="chip">MB</span>
          <span class="chip">0394135248</span>
          <span class="chip">LE THI DIEU MANH</span>
        </div>
      </div>`
          : ""
      }
    </div>
    <div class="footer">
      <div class="footer-text">
        Cảm ơn quý khách đã tin tưởng
        <span class="footer-brand">Gold Laundry</span>
        <span class="footer-heart">❤</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");
  const element = await page.$("#receipt");
  await element.screenshot({ path: outputPath, omitBackground: true });
  await browser.close();
}

// ─────────────────────────────────────────────────────────
// Nghiệp vụ: AppSheet Webhook đơn hàng giặt sấy
// ─────────────────────────────────────────────────────────
async function handleAppSheetOrder(data) {
  const { Customer_Phone, Customer_Name, Complete_Date, Bill_Amount, Point } = data;

  const friendRequestText = `Chào anh/chị, em là quản lý của Gold Laundry. Em xin phép kết nối Zalo để tiện hỗ trợ dịch vụ giặt sấy khi anh/chị cần ạ.`;

  console.log("[BOT-ORDER] Finding Zalo user for phone:", Customer_Phone);
  const userResult = await zaloClient.findUser(Customer_Phone);

  if (!userResult || !userResult.uid) {
    console.error("[BOT-ORDER] Cannot find user with phone", Customer_Phone);
    throw new Error("Cannot find user with phone " + Customer_Phone);
  }

  const uid = userResult.uid;
  console.log("[BOT-ORDER] Found Zalo UID:", uid, "for phone:", Customer_Phone);

  let cleanAmount = 0;
  if (Bill_Amount) {
    cleanAmount = String(Bill_Amount).replace(/[^0-9]/g, "");
  }

  const qrImagePath = path.join(os.tmpdir(), `qr_pay_${Date.now()}.png`);

  let cleanName = removeVietnameseTones(Customer_Name || "");
  cleanName = cleanName.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  let addInfoString = cleanName ? `${cleanName} chuyen khoan` : `chuyen khoan ${Customer_Phone}`;
  if (addInfoString.length > 50) {
    addInfoString = addInfoString.substring(0, 50);
  }
  const addInfo = encodeURIComponent(addInfoString);

  const qrUrl = `https://img.vietqr.io/image/MB-0394135248-compact.png?amount=${cleanAmount}&addInfo=${addInfo}&accountName=LE%20THI%20DIEU%20MANH`;

  console.log("[BOT-ORDER] Downloading QR code from:", qrUrl);
  let hasQr = false;
  const receiptImagePath = path.join(os.tmpdir(), `receipt_${Date.now()}.png`);

  try {
    try {
      await downloadImage(qrUrl, qrImagePath);
      hasQr = true;
    } catch (err) {
      console.error("[BOT-ORDER] Failed to download QR code:", err);
    }

    try {
      await generateReceiptImage(
        { Customer_Name, Complete_Date, Bill_Amount, Point, Customer_Phone },
        hasQr ? qrImagePath : null,
        receiptImagePath
      );
    } catch (imgErr) {
      console.error("[BOT-ORDER] Failed to generate receipt image:", imgErr);
    }

    console.log("[BOT-ORDER] Sending Zalo message to:", uid);
    if (fs.existsSync(receiptImagePath)) {
      await zaloClient.sendMessage({ msg: "", attachments: [receiptImagePath] }, uid);
    }
  } finally {
    if (fs.existsSync(receiptImagePath)) {
      try { fs.unlinkSync(receiptImagePath); } catch (e) {}
    }
    if (hasQr && fs.existsSync(qrImagePath)) {
      try { fs.unlinkSync(qrImagePath); } catch (e) {}
    }
  }

  console.log("[BOT-ORDER] Sending Zalo friend request to:", uid);
  try {
    await zaloClient.sendFriendRequest(friendRequestText, uid);
  } catch (friendReqError) {
    console.error("[BOT-ORDER] Send friend request error:", friendReqError.message);
  }

  return { ok: true, uid };
}

// ─────────────────────────────────────────────────────────
// Quản lý đăng nhập Zalo (Telegram QR)
// ─────────────────────────────────────────────────────────
async function checkAndLogin() {
  if (isZaloReady || isLoggingIn) return;
  isLoggingIn = true;

  try {
    let zaloInit = new Zalo();

    if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
      console.log("Found Zalo credentials, attempting to login...");
      const credsRaw = await fsPromises.readFile(ZALO_CREDENTIALS_PATH, "utf8");
      const credentials = JSON.parse(credsRaw);
      zaloClient = await zaloInit.login(credentials);
      isZaloReady = true;
      console.log("✅ Zalo login successful with saved credentials!");
      await sendTelegramMessage("✅ Đăng nhập Zalo thành công (sử dụng session lưu trữ)!");
      isLoggingIn = false;
      return;
    }

    console.log("Starting QR login...");
    zaloClient = await zaloInit.loginQR(
      {
        qrPath: ZALO_QR_PATH,
      },
      async (event) => {
        if (event.type === 0) {
          // QRCodeGenerated
          console.log(`Scan the Zalo QR code at: ${ZALO_QR_PATH}`);
          await event.actions.saveToFile(ZALO_QR_PATH);
          await sendTelegramQR(ZALO_QR_PATH);
        } else if (event.type === 4) {
          // GotLoginInfo
          console.log("Got Zalo login info, saving to credentials...");
          await fsPromises.writeFile(ZALO_CREDENTIALS_PATH, JSON.stringify(event.data, null, 2));
        }
      }
    );
    isZaloReady = true;
    console.log("✅ Zalo login successful via QR!");
    await sendTelegramMessage("✅ Đăng nhập Zalo thành công (thông qua quét mã QR)!");
  } catch (error) {
    console.error("❌ Zalo login failed:", error);
    await sendTelegramMessage("❌ Đăng nhập Zalo thất bại: " + error.message + ". Sẽ thử lại sau 15 phút...");
    if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
      try { fs.unlinkSync(ZALO_CREDENTIALS_PATH); } catch (e) {}
    }
  } finally {
    isLoggingIn = false;
  }
}

// Khởi tạo Zalo tự động lần đầu
checkAndLogin();

// Lên lịch kiểm tra mỗi 15 phút
setInterval(() => {
  if (!isZaloReady) {
    console.log("Zalo is not ready, attempting to login again...");
    checkAndLogin();
  }
}, 15 * 60 * 1000);

// ─────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────

// 1. Kiểm tra trạng thái
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    status: isZaloReady ? "ready" : isLoggingIn ? "logging_in" : "waiting",
    message: isZaloReady ? "Zalo Gateway đã sẵn sàng" : "Đang chờ kết nối Zalo...",
  });
});

// 2. Trang chủ hiển thị trạng thái tổng quan
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Gold Laundry Zalo Gateway</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { background: #1e293b; padding: 32px 40px; border-radius: 16px; border: 1px solid #334155; text-align: center; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    h1 { font-size: 20px; color: #fbbf24; margin-bottom: 8px; text-transform: uppercase; }
    .badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; font-weight: 700; font-size: 13px; margin: 16px 0; }
    .badge-ok { background: #064e3b; color: #34d399; border: 1px solid #059669; }
    .badge-no { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }
    p { font-size: 13px; color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size: 40px; margin-bottom: 12px;">🧺</div>
    <h1>Gold Laundry Zalo Gateway</h1>
    <div class="badge ${isZaloReady ? "badge-ok" : "badge-no"}">
      ${isZaloReady ? "● ĐÃ SẴN SÀNG HOẠT ĐỘNG" : "○ ĐANG KHỞI TẠO KẾT NỐI..."}
    </div>
    <p>
      <b>Port 3001:</b> Webhook AppSheet (gold-zalo.vtechqn.online)<br>
      <b>Port 5050:</b> Web Thu Ngân (quanly.html - Mời Thẻ VIP)
    </p>
  </div>
</body>
</html>`);
});

// 3. Endpoint Mời Zalo Thẻ VIP (dành cho Web Thu Ngân quanly.html)
app.post("/api/send-zalo", async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) {
    return res.status(400).json({ ok: false, error: "Thiếu số điện thoại." });
  }

  if (!isZaloReady || !zaloClient) {
    return res.status(503).json({
      ok: false,
      error: "Zalo Hotline chưa sẵn sàng. Vui lòng kiểm tra mã QR trên Telegram.",
    });
  }

  try {
    const result = await enqueueTask(() => handleSendVipCard({ phone, message }));
    return res.json({ ok: true, data: result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Lỗi gửi Thẻ VIP Zalo" });
  }
});

// 4. Endpoint Webhook AppSheet hoàn thành đơn giặt sấy
app.post("/webhook/zalo", async (req, res) => {
  if (!isZaloReady || !zaloClient) {
    return res.status(500).json({ ok: false, error: "Zalo client is not ready yet" });
  }

  const { Customer_Phone } = req.body || {};
  if (!Customer_Phone) {
    return res.status(400).json({ ok: false, error: "Missing Customer_Phone" });
  }

  try {
    await enqueueTask(() => handleAppSheetOrder(req.body));
    res.json({ ok: true, message: "Zalo message sent successfully to " + Customer_Phone });
  } catch (e) {
    console.error("Zalo webhook error:", e);
    const errorMsg = e.message ? e.message.toLowerCase() : "";
    if (
      errorMsg.includes("not logged in") ||
      errorMsg.includes("session") ||
      errorMsg.includes("login") ||
      errorMsg.includes("auth")
    ) {
      console.log("Authentication error detected, setting isZaloReady to false");
      isZaloReady = false;
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// Khởi chạy đồng thời 2 Cổng: 3001 (AppSheet) & 5050 (Thu ngân)
// ─────────────────────────────────────────────────────────
const PORT_APPSHEET = 3001;
const PORT_THUNGAN = 5050;

const server3001 = app.listen(PORT_APPSHEET, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`✨ GOLD LAUNDRY ZALO BOT SERVER (MERGED) ✨`);
  console.log(`[PORT 3001] AppSheet Webhook: http://0.0.0.0:${PORT_APPSHEET}/webhook/zalo`);
  console.log(`[PORT 3001] Cloudflare Tunnel: gold-zalo.vtechqn.online`);
});

const server5050 = app.listen(PORT_THUNGAN, "0.0.0.0", () => {
  console.log(`[PORT 5050] Web Thu Ngân API: http://127.0.0.1:${PORT_THUNGAN}/api/send-zalo`);
  console.log(`[PORT 5050] Dashboard Status: http://127.0.0.1:${PORT_THUNGAN}/api/status`);
  console.log(`====================================================`);
});

server3001.on("error", (err) => {
  console.error(`[LỖI CỔNG 3001]:`, err.message);
});

server5050.on("error", (err) => {
  console.error(`[LỖI CỔNG 5050]:`, err.message);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});
