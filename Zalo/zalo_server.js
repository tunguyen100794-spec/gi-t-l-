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
const birthdayManager = require("./birthday_manager");


function cleanCustomerName(name) {
  if (!name) return "";
  let s = String(name).trim();
  s = s.replace(/(\+?84|0)?[0-9]{9,10}/g, "");
  s = s.replace(/[\*\(\)]+/g, " ");
  s = s.replace(/[\s\-\:\.\/]+$/g, "");
  s = s.replace(/\s+[0-9]+$/g, "");
  s = s.replace(/[\s\-\:\.\/]+$/g, "");
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
const ASSETS_DIR = path.join(__dirname, "assets");
const HEADER_MASCOT_PATH = path.join(ASSETS_DIR, "header_mascot.png");
const BADGE_STATUS_PATH = path.join(ASSETS_DIR, "badge_status.png");
const ICON_COINS_PATH = path.join(ASSETS_DIR, "icon_coins.png");
const FOOTER_PATH = path.join(ASSETS_DIR, "footer.png");

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
// Nghiệp vụ: Gửi Thẻ VIP hoặc Tin Nhắn Chữ
// ─────────────────────────────────────────────────────────
async function handleSendVipCard({ phone, message, sendImage = true, noImage = false }) {
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
  console.log(`[BOT-VIP] Tìm thấy khách: ${targetName} (UID: ${targetUid})`);

  const cardUrl = `https://giatsayquynhon.vn/the/?phone=${cleanPhone}`;
  const cleanName = cleanCustomerName(targetName);
  const greeting = cleanName ? `KÍNH CHÀO ${cleanName.toUpperCase()}!` : "KÍNH CHÀO QUÝ KHÁCH!";
  const shortCardUrl = "giatsayquynhon.vn/the";

  const greetingLine = cleanName ? `Kính chào Quý khách ${cleanName.toUpperCase()}` : "Kính chào Quý khách";

  const cardCaption =
    message ||
    `🧺 GIẶT SẤY GOLD LAUNDRY\n` +
      `${greetingLine}\n\n` +
      `Cảm ơn Quý khách đã tin chọn dịch vụ giặt sấy Gold Laundry!\n\n` +
      `Cửa hàng trân trọng kính mời Quý khách ĐĂNG KÝ THẺ THÀNH VIÊN để nhận ngay các đặc quyền: 💳\n` +
      `• Tích lũy điểm thưởng đổi lượt giặt & quà tặng (Giặt 7 lần tặng 1 lần)\n` +
      `• Theo dõi tiến độ đơn giặt trực tuyến tiện lợi\n` +
      `• Nhận ưu đãi giảm giá độc quyền cho thành viên\n\n` +
      `👉 Đăng ký mở thẻ hoàn toàn miễn phí tại:\n` +
      `${shortCardUrl}\n\n` +
      `Hotline hỗ trợ: 0777779711\n` +
      `Kính chúc Quý khách một ngày tốt lành! 🌷`;

  const shouldSendImage = (sendImage !== false && !noImage);

  // Nếu không yêu cầu gửi ảnh (chỉ gửi tin nhắn chữ)
  if (!shouldSendImage) {
    try {
      console.log(`[BOT-MSG] Đang gửi tin nhắn chữ thuần túy tới ${targetName}...`);
      await zaloClient.sendMessage({ msg: cardCaption }, targetUid);
      console.log(`[BOT-MSG] ✓ Gửi tin nhắn chữ thành công tới ${targetName} (${cleanPhone})!`);
      return { ok: true, uid: targetUid, name: targetName };
    } catch (sendErr) {
      console.warn(`[BOT-MSG] Gửi tin trực tiếp lỗi (${sendErr.message}), thử gửi lời mời kết bạn...`);
      try {
        await zaloClient.sendFriendRequest(cardCaption.slice(0, 150), targetUid);
        return { ok: true, uid: targetUid, name: targetName, friendRequest: true };
      } catch (frErr) {
        throw new Error(`Không thể gửi tin Zalo: ${sendErr.message}`);
      }
    }
  }

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

  const headerB64 = fs.existsSync(HEADER_MASCOT_PATH)
    ? `data:image/png;base64,${fs.readFileSync(HEADER_MASCOT_PATH).toString("base64")}`
    : "";
  const badgeB64 = fs.existsSync(BADGE_STATUS_PATH)
    ? `data:image/png;base64,${fs.readFileSync(BADGE_STATUS_PATH).toString("base64")}`
    : "";
  const coinB64 = fs.existsSync(ICON_COINS_PATH)
    ? `data:image/png;base64,${fs.readFileSync(ICON_COINS_PATH).toString("base64")}`
    : "";
  const footerB64 = fs.existsSync(FOOTER_PATH)
    ? `data:image/png;base64,${fs.readFileSync(FOOTER_PATH).toString("base64")}`
    : "";

  const { Customer_Name, Complete_Date, Bill_Amount, Point, Customer_Phone } = data;
  let cleanName = cleanCustomerName(Customer_Name);
  if (!cleanName || cleanName === Customer_Phone) {
    cleanName = "Quý khách";
  }
  const phoneDisplay = Customer_Phone ? `📞 ${Customer_Phone}` : "";
  let rawAmount = parseInt(String(Bill_Amount || "0").replace(/[^0-9]/g, "")) || 0;
  const formattedAmount = rawAmount.toLocaleString("vi-VN");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Be Vietnam Pro','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif; background:transparent; width:550px; }
    .card { width:550px; background:#f0f5ff; border-radius:24px; overflow:hidden; box-shadow:0 14px 44px rgba(0,35,130,0.18); border:1.5px solid #d4e3fc; }
    
    .header-img { width:100%; height:232px; object-fit:cover; display:block; }
    
    .status-wrap { text-align:center; margin-top:3px; margin-bottom:2px; padding:0 14px; }
    .status-img { width:100%; max-width:430px; display:block; margin:0 auto; }
    
    .body { padding:4px 14px 10px; display:flex; flex-direction:column; gap:6px; }
    
    .wcard { background:white; border-radius:14px; border:1.5px solid #e0e8f8; padding:8px 14px; box-shadow:0 2px 8px rgba(0,40,160,0.04); }
    
    .cust-row { display:flex; align-items:center; gap:14px; padding:9px 16px; }
    .cust-avatar { width:46px; height:46px; border-radius:50%; flex-shrink:0; background:linear-gradient(135deg,#0d5bd7,#258cfb); display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(13,91,215,0.3); }
    .cust-info { display:flex; flex-direction:column; gap:2px; }
    .cust-name { font-size:22px; font-weight:900; color:#0d1b3e; line-height:1.2; }
    .cust-phone { color:#475569; font-size:15px; font-weight:600; display:flex; align-items:center; gap:5px; }
    
    .info-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #edf2fb; font-size:13.5px; }
    .info-row:last-child { border-bottom:none; }
    .info-lbl { color:#475569; display:flex; align-items:center; gap:8px; font-weight:500; }
    .info-val { font-size:14.5px; font-weight:700; color:#0d5bd7; }
    
    .total-card { background:linear-gradient(90deg,#0d5bd7 0%,#1570ef 100%); border-radius:14px; padding:10px 16px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 6px 18px rgba(13,91,215,0.32); }
    .total-left { display:flex; align-items:center; gap:10px; }
    .total-coin { width:48px; height:44px; object-fit:contain; }
    .total-lbl { font-size:14px; font-weight:800; color:rgba(255,255,255,0.95); text-transform:uppercase; letter-spacing:0.5px; }
    .total-amt { font-size:44px; font-weight:900; color:#ffd740; line-height:1; text-shadow:0 2px 10px rgba(0,0,0,0.3); display:inline-flex; align-items:baseline; }
    .total-curr { font-size:24px; font-weight:800; color:#ffd740; margin-left:4px; }
    
    .notice-card { background:#fffbe6; border:1.5px solid #ffe58f; border-radius:12px; padding:7px 12px; box-shadow:0 2px 6px rgba(245,158,11,0.06); display:flex; gap:8px; align-items:flex-start; }
    .notice-icon { font-size:17px; line-height:1; }
    .notice-content { flex:1; }
    .notice-title { font-size:12.5px; font-weight:800; color:#0f358a; margin-bottom:1px; }
    .notice-text { font-size:11.5px; color:#475569; line-height:1.4; font-weight:500; }
    
    .pay-card { background:white; border-radius:13px; border:1.5px solid #e0e8f8; padding:7px 12px; text-align:center; box-shadow:0 2px 8px rgba(0,40,160,0.04); }
    .pay-title { font-size:12px; font-weight:800; color:#0f358a; text-transform:uppercase; letter-spacing:0.8px; display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:4px; }
    .qr-wrap { display:inline-flex; padding:4px; background:white; border-radius:10px; border:1.5px solid #e2ebfa; box-shadow:0 3px 10px rgba(0,0,0,0.06); margin-bottom:4px; }
    .qr-wrap img { width:135px; height:135px; display:block; border-radius:6px; }
    .chips { display:flex; justify-content:center; gap:6px; }
    .chip { background:#eef4ff; border:1px solid #c8dcfc; padding:2px 10px; border-radius:16px; font-size:11px; font-weight:700; color:#0d5bd7; }
    
    .footer-img { width:100%; height:75px; object-fit:cover; display:block; margin-top:-2px; }
  </style>
</head>
<body>
  <div class="card" id="receipt">
    <img class="header-img" src="${headerB64}" />
    
    <div class="status-wrap">
      <img class="status-img" src="${badgeB64}" />
    </div>
    
    <div class="body">
      <div class="wcard cust-row">
        <div class="cust-avatar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div class="cust-info">
          <div class="cust-name">${cleanName}</div>
          ${phoneDisplay ? `<div class="cust-phone">${phoneDisplay}</div>` : ""}
        </div>
      </div>
      
      <div class="wcard" style="padding:2px 14px;">
        <div class="info-row">
          <span class="info-lbl">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Thời gian hoàn thành
          </span>
          <span class="info-val">${Complete_Date || ""}</span>
        </div>
        <div class="info-row">
          <span class="info-lbl">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Điểm tích lũy
          </span>
          <span class="info-val">${Point || "0"} điểm</span>
        </div>
      </div>
      
      <div class="total-card">
        <div class="total-left">
          <img class="total-coin" src="${coinB64}" />
          <div class="total-lbl">Tổng thanh toán</div>
        </div>
        <div>
          <span class="total-amt">${formattedAmount}<span class="total-curr">đ</span></span>
        </div>
      </div>
      
      <div class="notice-card">
        <div class="notice-icon">📦</div>
        <div class="notice-content">
          <div class="notice-title">Hướng dẫn nhận đồ</div>
          <div class="notice-text">Quý khách ghé trực tiếp cửa hàng để nhận đồ, hoặc nhắn lại tin nhắn này để được giao tận nơi (phụ phí ship).</div>
        </div>
      </div>
      
      ${
        qrBase64
          ? `
      <div class="pay-card">
        <div class="pay-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f358a" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
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
    
    <img class="footer-img" src="${footerB64}" />
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15000 });
  try {
    await page.evaluateHandle("document.fonts.ready");
  } catch (fontErr) {}
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

      // Gửi tin nhắn chữ riêng biệt kêu gọi đăng ký thành viên
      try {
        const shortCardUrl = "giatsayquynhon.vn/the";
        const ctaMessage = `💙 Cảm ơn Quý khách đã sử dụng dịch vụ của chúng tôi!\n\nQuý khách hãy đăng ký thẻ thành viên để tích điểm nhận quà và nhận ngay ưu đãi giặt 7 lần, tặng 1 lần tại:\n👉 ${shortCardUrl}`;
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log("[BOT-ORDER] Sending follow-up VIP card link to:", uid);
        await zaloClient.sendMessage({ msg: ctaMessage }, uid);
      } catch (ctaErr) {
        console.error("[BOT-ORDER] Send follow-up message error:", ctaErr.message);
      }
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
async function checkAndLogin(force = false) {
  if (force) {
    isZaloReady = false;
    isLoggingIn = false;
  }
  if (isZaloReady || isLoggingIn) return;
  isLoggingIn = true;

  try {
    let zaloInit = new Zalo();

    if (!force && fs.existsSync(ZALO_CREDENTIALS_PATH)) {
      try {
        console.log("Found Zalo credentials, attempting to login...");
        const credsRaw = await fsPromises.readFile(ZALO_CREDENTIALS_PATH, "utf8");
        const credentials = JSON.parse(credsRaw);
        zaloClient = await zaloInit.login(credentials);
        isZaloReady = true;
        console.log("✅ Zalo login successful with saved credentials!");
        await sendTelegramMessage("✅ Đăng nhập Zalo thành công (sử dụng session lưu trữ)!");
        isLoggingIn = false;
        return;
      } catch (savedLoginErr) {
        console.warn("⚠️ Saved credentials login failed, switching to QR login:", savedLoginErr.message);
        if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
          try { fs.unlinkSync(ZALO_CREDENTIALS_PATH); } catch (e) {}
        }
      }
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

// 1.0 Khởi động lại Server (PM2 tự động reload)
app.all("/api/restart", (req, res) => {
  res.json({ ok: true, message: "Đang khởi động lại dịch vụ Zalo Bot..." });
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// 1.1 Yêu cầu gửi lại mã QR đăng nhập qua Telegram
app.all(["/api/relogin", "/api/login-qr"], async (req, res) => {
  console.log("⚡ Received relogin request, regenerating QR...");
  if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
    try { fs.unlinkSync(ZALO_CREDENTIALS_PATH); } catch (e) {}
  }
  isZaloReady = false;
  checkAndLogin(true);
  res.json({
    ok: true,
    message: "Đang tạo mã QR mới và gửi đến Telegram. Vui lòng kiểm tra Telegram để quét mã!",
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
      <b>Port 5050:</b> Web Thu Ngân (quanly.html - Mời Thẻ VIP)<br>
      <b>🎂 Sinh Nhật:</b> Tự động quét 08:30 sáng (Voucher 50%)
    </p>
  </div>
</body>
</html>`);
});

// 3. Endpoint Mời Zalo Thẻ VIP hoặc gửi tin nhắn chữ
app.post(["/api/send-zalo", "/api/send-message"], async (req, res) => {
  const { phone, message, sendImage, noImage } = req.body || {};
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
    const result = await enqueueTask(() => handleSendVipCard({ phone, message, sendImage, noImage }));
    return res.json({ ok: true, data: result });
  } catch (err) {
    const errorMsg = err.message ? err.message.toLowerCase() : "";
    if (
      errorMsg.includes("not logged in") ||
      errorMsg.includes("session") ||
      errorMsg.includes("login") ||
      errorMsg.includes("auth") ||
      errorMsg.includes("zpw_sek") ||
      err.code === 600
    ) {
      console.log("Authentication error detected in send-zalo, triggering QR re-login...");
      isZaloReady = false;
      if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
        try { fs.unlinkSync(ZALO_CREDENTIALS_PATH); } catch (e) {}
      }
      checkAndLogin(true);
    }
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
      errorMsg.includes("auth") ||
      errorMsg.includes("zpw_sek") ||
      e.code === 600
    ) {
      console.log("Authentication error detected, triggering QR re-login...");
      isZaloReady = false;
      if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
        try { fs.unlinkSync(ZALO_CREDENTIALS_PATH); } catch (e) {}
      }
      checkAndLogin(true);
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// 5. API Chúc mừng Sinh Nhật Tự Động & Voucher 50%
// ─────────────────────────────────────────────────────────

// 5.1 Tra cứu danh sách sinh nhật hôm nay (hỗ trợ ?date=YYYY-MM-DD để tra cứu ngày bất kỳ)
app.get("/api/birthday/today", async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const data = await birthdayManager.getBirthdaysToday(targetDate);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5.2 Kích hoạt quét và gửi tin nhắn sinh nhật ngay lập tức
app.post("/api/birthday/send-now", async (req, res) => {
  if (!isZaloReady || !zaloClient) {
    return res.status(503).json({ ok: false, error: "Zalo Gateway chưa sẵn sàng kết nối." });
  }
  try {
    const result = await birthdayManager.runDailyBirthdayCheck({
      zaloClient,
      enqueueTask,
      sendTelegramMessage
    });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5.3 Gửi thử nghiệm lời chúc mừng sinh nhật tới số điện thoại test
app.post("/api/birthday/send-test", async (req, res) => {
  if (!isZaloReady || !zaloClient) {
    return res.status(503).json({ ok: false, error: "Zalo Gateway chưa sẵn sàng kết nối." });
  }
  const { phone, name, discount } = req.body || {};
  if (!phone) {
    return res.status(400).json({ ok: false, error: "Thiếu số điện thoại thử nghiệm." });
  }
  try {
    const member = {
      phone,
      customer_name: name || "Khách hàng thử nghiệm",
      clean_name: name || "Khách hàng thử nghiệm"
    };
    const result = await enqueueTask(() =>
      birthdayManager.sendBirthdayWishDirect({
        member,
        zaloClient,
        discountPercent: discount || 50,
        force: true
      })
    );
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// Bộ Lập Lịch Tự Động (Daily Birthday Scheduler)
// Quét và gửi tự động lúc 08:30 sáng mỗi ngày
// ─────────────────────────────────────────────────────────
let lastBirthdayRunDay = "";

setInterval(async () => {
  try {
    const now = new Date();
    const vnNow = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
    const hour = vnNow.getHours();
    const minute = vnNow.getMinutes();
    const dayStr = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, "0")}-${String(vnNow.getDate()).padStart(2, "0")}`;

    const config = birthdayManager.loadConfig();
    const targetHour = config.check_hour !== undefined ? config.check_hour : 8;
    const targetMinute = config.check_minute !== undefined ? config.check_minute : 30;

    if (hour === targetHour && minute === targetMinute && lastBirthdayRunDay !== dayStr) {
      if (isZaloReady && zaloClient) {
        console.log(`[BDAY-SCHEDULER] ⏰ Đã đến ${targetHour}:${String(targetMinute).padStart(2, "0")} sáng ngày ${dayStr}. Kích hoạt tự động quét sinh nhật...`);
        lastBirthdayRunDay = dayStr;
        await birthdayManager.runDailyBirthdayCheck({
          zaloClient,
          enqueueTask,
          sendTelegramMessage
        });
      } else {
        console.log(`[BDAY-SCHEDULER] ⚠️ Đã đến giờ quét sinh nhật nhưng Zalo chưa sẵn sàng. Sẽ kiểm tra lại trong phút tới...`);
      }
    }
  } catch (schedErr) {
    console.error("[BDAY-SCHEDULER] Lỗi bộ lập lịch sinh nhật:", schedErr.message);
  }
}, 30 * 1000);

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
