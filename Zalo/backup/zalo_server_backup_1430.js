const express = require("express");
const { Zalo } = require("zalo-api-final");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const puppeteer = require("puppeteer");

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
app.use(express.json({ limit: "1024kb" }));

const ZALO_CREDENTIALS_PATH = path.join(__dirname, "zalo_credentials.json");
const ZALO_QR_PATH = path.join(__dirname, "qr.png");
let zaloClient = null;
let isZaloReady = false;

// Hàm gửi tin nhắn Telegram
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
        text: messageText
      })
    });
    const result = await response.json();
    if (!result.ok) {
      console.error("Failed to send Telegram text message:", result);
    }
  } catch (error) {
    console.error("Error sending Telegram text message:", error);
  }
}

// Hàm gửi QR qua Telegram
async function sendTelegramQR(qrPath) {
  const token = "8418080766:AAGd8gRJyffpFQKUFoXshNnoc7jMoB6-BBI";
  const chatId = "-1003447493989";
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  const FormData = require("form-data");
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", fs.createReadStream(qrPath));
  form.append("caption", "Vui lòng quét mã QR này bằng Zalo để đăng nhập.");

  try {
    const nodeFetch = require("node-fetch");
    const fetchFn = nodeFetch.default || nodeFetch;
    const response = await fetchFn(url, {
      method: "POST",
      body: form,
      headers: typeof form.getHeaders === "function" ? form.getHeaders() : undefined
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
// Tạo ảnh receipt đẹp bằng Puppeteer (Gold Laundry style)
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// Tạo ảnh receipt đẹp bằng Puppeteer (Gold Laundry style)
// ─────────────────────────────────────────────────────────
async function generateReceiptImage(data, qrImagePath, outputPath) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const logoPath = path.join(__dirname, 'Logo.png');
  let logoBase64 = '';
  if (fs.existsSync(logoPath)) {
    logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
  }

  let qrBase64 = '';
  if (qrImagePath && fs.existsSync(qrImagePath)) {
    const qrBuffer = fs.readFileSync(qrImagePath);
    qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
  }

  const { Customer_Name, Complete_Date, Bill_Amount, Point, Customer_Phone } = data;
  const displayName = Customer_Name || Customer_Phone || 'Khách hàng';

  let rawAmount = parseInt(String(Bill_Amount || '0').replace(/[^0-9]/g, '')) || 0;
  let formattedBill = rawAmount.toLocaleString('vi-VN') + 'đ';
  formattedBill = formattedBill.replace('đ', '<span style="font-size:20px;text-decoration:underline;vertical-align:top;margin-left:2px;">đ</span>');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Be Vietnam Pro', 'Segoe UI', Tahoma, sans-serif; background: transparent; padding: 0; width: 620px; }
    .card { width: 620px; background: #f8fbff; border-radius: 30px; overflow: hidden; box-shadow: 0 15px 50px rgba(0,0,0,0.15); position: relative; }

    .header { background: linear-gradient(180deg, #0a5eb8 0%, #1595e7 100%); height: 230px; position: relative; display: flex; flex-direction: column; align-items: center; padding-top: 10px; overflow: hidden; }
    .bubble { position: absolute; border-radius: 50%; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(255,255,255,0.2)); box-shadow: inset 0 0 10px rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.7); }
    .bubble-1 { width: 50px; height: 50px; top: 30px; left: 40px; }
    .bubble-2 { width: 30px; height: 30px; top: 100px; left: 80px; }
    .bubble-3 { width: 15px; height: 15px; top: 160px; left: 40px; }
    .bubble-4 { width: 60px; height: 60px; top: 20px; right: 40px; }
    .bubble-5 { width: 25px; height: 25px; top: 90px; right: 80px; }
    .bubble-6 { width: 15px; height: 15px; top: 140px; right: 40px; }
    .clouds-container { position: absolute; bottom: -5px; left: 0; width: 100%; height: 80px; z-index: 2; }
    .cloud { position: absolute; background: #f8fbff; border-radius: 50%; }
    .cloud-1 { width: 150px; height: 150px; bottom: -80px; left: -40px; }
    .cloud-2 { width: 220px; height: 220px; bottom: -120px; left: 70px; }
    .cloud-3 { width: 190px; height: 190px; bottom: -110px; right: 50px; }
    .cloud-4 { width: 150px; height: 150px; bottom: -80px; right: -40px; }
    .logo-container { position: relative; z-index: 5; width: 190px; height: 190px; display: flex; justify-content: center; align-items: center; border-radius: 50%; background: white; padding: 0; box-shadow: 0 5px 20px rgba(0,0,0,0.15); }
    .logo-container img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }

    .title-section { text-align: center; position: relative; z-index: 10; margin-top: -10px; padding-bottom: 14px; }
    .tagline-capsule { display: inline-block; background: #003399; color: white; font-size: 12px; font-weight: 600; padding: 6px 26px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; box-shadow: 0 4px 10px rgba(0,51,153,0.2); }
    .badge-gold { display: inline-flex; align-items: center; gap: 12px; background: linear-gradient(90deg, #ffde59 0%, #ff914d 100%); color: #002244; font-size: 18px; font-weight: 900; padding: 10px 45px; border-radius: 30px; box-shadow: 0 5px 15px rgba(255,145,77,0.4); text-transform: uppercase; }
    .sparkle { color: #ffffff; font-size: 20px; line-height: 1; }

    .content-body { padding: 0 20px 16px; display: flex; flex-direction: column; gap: 10px; }
    .card-white { background: white; border-radius: 16px; border: 1px solid #eef2f8; padding: 15px 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
    .customer-box { display: flex; align-items: center; gap: 15px; }
    .customer-avatar { width: 55px; height: 55px; background: #ffcc00; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(255,204,0,0.3); border: 2px solid white; }
    .customer-details h2 { font-size: 20px; color: #001f3f; font-weight: 800; }
    .customer-details p { font-size: 14px; color: #555; margin-top: 4px; display: flex; align-items: center; gap: 6px; }

    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f4f9; }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-size: 14px; color: #555; display: flex; align-items: center; gap: 8px; }
    .info-value { font-size: 15px; font-weight: 800; color: #003399; }

    .total-box { background: #0046ad; border-radius: 16px; padding: 15px 20px; display: flex; align-items: center; gap: 15px; color: white; box-shadow: 0 8px 20px rgba(0,70,173,0.3); }
    .total-icon { width: 44px; height: 44px; background: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .total-label { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; flex-grow: 1; }
    .total-amount { font-size: 32px; font-weight: 900; color: #ffcc00; }

    .notice-box { background: #fffdf5; border: 1px solid #ffeba1; border-radius: 16px; padding: 15px 20px; }
    .notice-header { font-weight: 800; color: #856404; font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .notice-text { font-size: 13px; color: #856404; line-height: 1.5; }

    .payment-section { text-align: center; background: white; border-radius: 16px; border: 1px solid #eef2f8; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
    .payment-title { font-size: 15px; font-weight: 800; color: #0046ad; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 6px; }
    .payment-sub { font-size: 12px; color: #888; margin-bottom: 15px; }
    .qr-container { display: inline-block; background: white; padding: 5px; border-radius: 10px; border: 1px solid #eef2f8; }
    .qr-container img { width: 170px; height: 170px; display: block; border-radius: 6px; }
    .bank-tags { display: flex; justify-content: center; gap: 8px; margin-top: 15px; }
    .bank-tag { background: #f8fbff; border: 1px solid #d0daff; padding: 5px 15px; border-radius: 20px; font-size: 11px; font-weight: 700; color: #0046ad; }

    .footer { background: #003399; color: white; padding: 20px 20px 16px; text-align: center; position: relative; margin-top: 10px; }
    .footer-curve { position: absolute; top: -20px; left: 0; width: 100%; height: 21px; background: transparent; overflow: hidden; }
    .footer-curve::after { content: ''; position: absolute; top: 0; left: -10%; width: 120%; height: 60px; background: #003399; border-radius: 100% 100% 0 0; }
    .footer-text { font-size: 13px; opacity: 0.9; }
    .footer-brand { color: #ffcc00; font-weight: 900; font-size: 18px; margin-top: 4px; }
    .footer-heart { color: #ff4444; margin-left: 4px; }
  </style>
</head>
<body>
  <div class="card" id="receipt">
    <div class="header">
      <div class="bubble bubble-1"></div>
      <div class="bubble bubble-2"></div>
      <div class="bubble bubble-3"></div>
      <div class="bubble bubble-4"></div>
      <div class="bubble bubble-5"></div>
      <div class="bubble bubble-6"></div>
      <div class="clouds-container">
        <div class="cloud cloud-1"></div>
        <div class="cloud cloud-2"></div>
        <div class="cloud cloud-3"></div>
        <div class="cloud cloud-4"></div>
      </div>
      <div class="logo-container">
        ${logoBase64 ? `<img src="${logoBase64}" />` : '<div style="font-size:80px;">🧺</div>'}
      </div>
    </div>

    <div class="title-section">
      <div class="tagline-capsule">DỊCH VỤ GIẶT ỦI SẤY CAO CẤP</div>
      <br/>
      <div class="badge-gold">
        <span class="sparkle">✦</span>
        HOÀN THÀNH ĐƠN HÀNG
        <span class="sparkle">✦</span>
      </div>
    </div>

    <div class="content-body">
      <div class="card-white customer-box">
        <div class="customer-avatar">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#003399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="customer-details">
          <h2>${displayName}</h2>
          <p>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#d32f2f">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
            ${Customer_Phone || ''}
          </p>
        </div>
      </div>

      <div class="card-white" style="padding: 5px 20px;">
        <div class="info-row">
          <span class="info-label">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Thời gian hoàn thành
          </span>
          <span class="info-value">${Complete_Date || ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff914d" stroke="#ff914d" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Điểm tích lũy
          </span>
          <span class="info-value" style="color:#ff914d;">${Point || '0'} điểm</span>
        </div>
      </div>

      <div class="total-box">
        <div class="total-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0046ad" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><circle cx="12" cy="14" r="4"/><path d="M8 8h.01M12 8h.01M16 8h.01"/></svg>
        </div>
        <div class="total-label">Tổng thanh toán</div>
        <div class="total-amount">${formattedBill}</div>
      </div>

      <div class="notice-box">
        <div class="notice-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          Hướng dẫn nhận đồ
        </div>
        <div class="notice-text">Quý khách ghé trực tiếp cửa hàng để nhận đồ, hoặc nhắn lại tin nhắn này để được giao tận nơi (phụ phí ship).</div>
      </div>

      ${qrBase64 ? `
      <div class="payment-section">
        <div class="payment-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff914d" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          THANH TOÁN CHUYỂN KHOẢN
        </div>
        <div class="payment-sub">Quét mã QR bên dưới — VIB • STK: 191264</div>
        <div class="qr-container"><img src="${qrBase64}" /></div>
        <div class="bank-tags">
          <span class="bank-tag">VIB Bank</span>
          <span class="bank-tag">191264</span>
          <span class="bank-tag">Nguyễn An Tú</span>
        </div>
      </div>` : ''}
    </div>

    <div class="footer">
      <div class="footer-curve"></div>
      <div class="footer-text">Cảm ơn quý khách đã tin tưởng</div>
      <div class="footer-brand">Gold Laundry <span class="footer-heart">❤</span></div>
    </div>
  </div>
</body>
</html>`;

  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  const element = await page.$('#receipt');
  await element.screenshot({ path: outputPath, omitBackground: true });
  await browser.close();
}
async function initZalo() {
  let zaloInit = new Zalo();

  const doQRLogin = async () => {
    console.log("Starting QR login...");
    zaloClient = await zaloInit.loginQR(
      {
        qrPath: ZALO_QR_PATH,
      },
      async (event) => {
        if (event.type === 0) { // QRCodeGenerated
          console.log(`Scan the Zalo QR code at: ${ZALO_QR_PATH}`);
          await event.actions.saveToFile(ZALO_QR_PATH);
          await sendTelegramQR(ZALO_QR_PATH);
        } else if (event.type === 4) { // GotLoginInfo
          console.log("Got Zalo login info, saving to credentials...");
          await fsPromises.writeFile(ZALO_CREDENTIALS_PATH, JSON.stringify(event.data, null, 2));
        }
      }
    );
    isZaloReady = true;
    console.log("✅ Zalo login successful via QR!");
    await sendTelegramMessage("✅ Đăng nhập Zalo thành công (thông qua quét mã QR)!");
  };

  try {
    if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
      console.log("Found Zalo credentials, attempting to login...");
      const credsRaw = await fsPromises.readFile(ZALO_CREDENTIALS_PATH, "utf8");
      const credentials = JSON.parse(credsRaw);
      zaloClient = await zaloInit.login(credentials);
      isZaloReady = true;
      console.log("✅ Zalo login successful with saved credentials!");
      await sendTelegramMessage("✅ Đăng nhập Zalo thành công (sử dụng session lưu trữ)!");
    } else {
      console.log("No Zalo credentials found.");
      await doQRLogin();
    }
  } catch (error) {
    console.error("❌ Zalo login failed:", error);
    await sendTelegramMessage("❌ Đăng nhập Zalo thất bại: " + error.message + ". Yêu cầu quét mã QR mới...");
    try {
      if (fs.existsSync(ZALO_CREDENTIALS_PATH)) {
        fs.unlinkSync(ZALO_CREDENTIALS_PATH);
      }
      zaloInit = new Zalo(); // Khởi tạo lại Zalo client để tránh lỗi state cũ
      await doQRLogin();
    } catch (qrError) {
      console.error("❌ Zalo QR login failed:", qrError);
      await sendTelegramMessage("❌ Đăng nhập Zalo qua QR thất bại: " + qrError.message);
    }
  }
}

// Khởi tạo Zalo tự động
initZalo();

// Endpoint để AppSheet gọi webhook
app.post("/webhook/zalo", async (req, res) => {
  if (!isZaloReady || !zaloClient) {
    return res.status(500).json({ ok: false, error: "Zalo client is not ready yet" });
  }

  try {
    const { 
      Customer_Phone, 
      Customer_Name, 
      Complete_Date, 
      Bill_Amount, 
      Point 
    } = req.body;

    if (!Customer_Phone) {
      return res.status(400).json({ ok: false, error: "Missing Customer_Phone" });
    }

    const friendRequestText = `Chào anh/chị, em là quản lý của Gold Laundry. Em xin phép kết nối Zalo để tiện hỗ trợ dịch vụ giặt sấy khi anh/chị cần ạ.`;

    const testPhone = "0967475767"; // Cố định số điện thoại để test
    console.log("Finding Zalo user for phone:", testPhone, "(Original AppSheet:", Customer_Phone, ")");
    const userResult = await zaloClient.findUser(testPhone);
    
    if (!userResult || !userResult.uid) {
      console.error("Cannot find user with phone", testPhone);
      return res.status(404).json({ ok: false, error: "Cannot find user with phone " + testPhone });
    }
    
    const uid = userResult.uid;
    console.log("Found Zalo UID:", uid, "for phone:", Customer_Phone);

    let cleanAmount = 0;
    if (Bill_Amount) {
      cleanAmount = String(Bill_Amount).replace(/[^0-9]/g, '');
    }

    const qrImagePath = path.join(__dirname, `qr_pay_${Date.now()}.png`);
    
    // Tạo nội dung chuyển khoản: Tên khách (bỏ dấu) + SĐT
    let cleanName = removeVietnameseTones(Customer_Name || "");
    cleanName = cleanName.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    
    let addInfoString = cleanName ? `${cleanName} chuyen khoan` : `chuyen khoan ${Customer_Phone}`;
    // Cắt bớt nếu nội dung quá dài (chuẩn NAPAS thường giới hạn ~50 ký tự)
    if (addInfoString.length > 50) {
        addInfoString = addInfoString.substring(0, 50);
    }
    const addInfo = encodeURIComponent(addInfoString);
    
    // Đổi 'compact2' thành 'compact' hoặc 'qr_only' để ảnh nhỏ lại và đẹp hơn
    const qrUrl = `https://img.vietqr.io/image/VIB-191264-compact.png?amount=${cleanAmount}&addInfo=${addInfo}&accountName=NGUYEN%20AN%20TU`;

    console.log("Downloading QR code from:", qrUrl);
    let hasQr = false;
    try {
      await downloadImage(qrUrl, qrImagePath);
      hasQr = true;
    } catch (err) {
      console.error("Failed to download QR code:", err);
    }

    // Tạo ảnh receipt đẹp rồi gửi 1 tin nhắn duy nhất
    const receiptImagePath = path.join(__dirname, `receipt_${Date.now()}.png`);
    const debugPath = path.join(__dirname, "last_test_receipt.png");
    try {
      await generateReceiptImage(
        { Customer_Name, Complete_Date, Bill_Amount, Point, Customer_Phone },
        hasQr ? qrImagePath : null,
        receiptImagePath
      );
      // Copy to debug path for inspection
      fs.copyFileSync(receiptImagePath, debugPath);
      console.log("Debug: Saved copy to", debugPath);
    } catch (imgErr) {
      console.error("Failed to generate receipt image:", imgErr);
    }

    console.log("Sending Zalo message to:", uid);
    if (fs.existsSync(receiptImagePath)) {
      await zaloClient.sendMessage({ msg: "", attachments: [receiptImagePath] }, uid);
      // Giữ lại ảnh để test font
      // try { fs.unlinkSync(receiptImagePath); } catch (e) { console.error("Delete receipt img error:", e); }
    }
    // Xoá QR tạm nếu có
    if (hasQr) {
      try { fs.unlinkSync(qrImagePath); } catch (e) { console.error("Delete QR img error:", e); }
    }
    
    console.log("Sending Zalo friend request to:", uid);
    try {
        await zaloClient.sendFriendRequest(friendRequestText, uid);
    } catch (friendReqError) {
        console.error("Send friend request error (might already be friends):", friendReqError.message);
    }

    res.json({ ok: true, message: "Zalo message sent successfully to " + Customer_Phone });
  } catch (e) {
    console.error("Zalo webhook error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = 3001;
const server = app.listen(PORT, () => {
  console.log(`Zalo Bot Server is running on port ${PORT}`);
  console.log(`Configure Cloudflare Tunnel for gold-zalo.vtechqn.online to point to http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use! Kill the existing process first.`);
    console.error(`   Run: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});
