const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Copy of the function from zalo_server.js
async function generateReceiptImage(data, qrImagePath, outputPath) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Load logo as base64
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

  // Format Bill_Amount with small underlined "đ"
  let formattedBill = (Bill_Amount || '0') + 'đ';
  formattedBill = formattedBill.replace('đ', '<span style="font-size:20px; text-decoration:underline; vertical-align:top; margin-left:2px;">đ</span>');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Be Vietnam Pro', 'Segoe UI', Tahoma, sans-serif;
      background: transparent;
      padding: 0;
      width: 500px;
    }
    .card {
      width: 500px;
      background: #f4f8ff;
      border-radius: 30px;
      overflow: hidden;
      box-shadow: 0 15px 50px rgba(0,0,0,0.15);
      position: relative;
    }
    
    /* ══════ HEADER ══════ */
    .header {
      background: linear-gradient(180deg, #1fa2ff 0%, #0076d6 100%);
      height: 290px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 20px;
      overflow: visible;
    }
    
    /* Bubbles */
    .bubble {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(255,255,255,0.1));
      box-shadow: inset 0 0 10px rgba(255,255,255,0.3);
      border: 1px solid rgba(255,255,255,0.6);
    }
    .bubble-1 { width: 50px; height: 50px; top: 30px; left: 40px; }
    .bubble-2 { width: 30px; height: 30px; top: 100px; left: 80px; }
    .bubble-3 { width: 15px; height: 15px; top: 160px; left: 40px; }
    .bubble-4 { width: 60px; height: 60px; top: 20px; right: 40px; }
    .bubble-5 { width: 25px; height: 25px; top: 90px; right: 80px; }
    .bubble-6 { width: 15px; height: 15px; top: 140px; right: 40px; }
    
    /* Clouds at bottom of header */
    .clouds-container {
      position: absolute;
      bottom: -1px; /* overlap to prevent gap */
      left: 0;
      width: 100%;
      height: 80px;
      overflow: hidden;
      z-index: 2;
    }
    .cloud {
      position: absolute;
      background: #f4f8ff;
      border-radius: 50%;
    }
    .cloud-1 { width: 140px; height: 140px; bottom: -70px; left: -30px; }
    .cloud-2 { width: 200px; height: 200px; bottom: -100px; left: 60px; }
    .cloud-3 { width: 180px; height: 180px; bottom: -90px; right: 50px; }
    .cloud-4 { width: 140px; height: 140px; bottom: -70px; right: -30px; }

    /* Logo */
    .logo-container {
      position: relative;
      z-index: 1;
      width: 250px;
      height: 250px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      background: white; /* Fallback if logo is transparent */
      padding: 5px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }
    .logo-container img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }

    /* ══════ TITLES ══════ */
    .title-section {
      text-align: center;
      position: relative;
      z-index: 10;
      margin-top: -30px; /* Pull up onto clouds */
      padding-bottom: 20px;
    }
    .tagline-capsule {
      display: inline-block;
      background: #003399;
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 24px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      box-shadow: 0 4px 10px rgba(0,51,153,0.3);
    }
    .badge-gold {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: linear-gradient(90deg, #ffd75e 0%, #f7b000 100%);
      color: #003399;
      font-size: 18px;
      font-weight: 900;
      padding: 10px 40px;
      border-radius: 30px;
      box-shadow: 0 4px 15px rgba(247,176,0,0.4);
      text-transform: uppercase;
    }
    .sparkle { color: #ffffff; font-size: 18px; line-height: 1; }

    /* ══════ BODY ══════ */
    .content-body {
      padding: 0 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    .card-white {
      background: white;
      border-radius: 16px;
      border: 1px solid #eef2f8;
      padding: 15px 20px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.02);
    }
    
    /* Customer box */
    .customer-box {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .customer-avatar {
      width: 55px; height: 55px;
      background: #ffcc00;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 10px rgba(255,204,0,0.3);
    }
    .customer-details h2 { font-size: 20px; color: #001f3f; font-weight: 800; }
    .customer-details p { font-size: 14px; color: #555; margin-top: 4px; display: flex; align-items: center; gap: 6px; }

    /* Info rows */
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f4f9;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { font-size: 14px; color: #555; display: flex; align-items: center; gap: 8px; }
    .info-value { font-size: 15px; font-weight: 800; color: #003399; }

    /* Total box */
    .total-box {
      background: #0046ad;
      border-radius: 16px;
      padding: 15px 20px;
      display: flex;
      align-items: center;
      gap: 15px;
      color: white;
      box-shadow: 0 8px 20px rgba(0,70,173,0.3);
    }
    .total-icon {
      width: 44px; height: 44px;
      background: white;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .total-label { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; flex-grow: 1; }
    .total-amount { font-size: 30px; font-weight: 900; color: #ffcc00; }

    /* Notice box */
    .notice-box {
      background: #fffdf5;
      border: 1px solid #ffeba1;
      border-radius: 16px;
      padding: 15px 20px;
    }
    .notice-header { font-weight: 800; color: #856404; font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .notice-text { font-size: 13px; color: #856404; line-height: 1.5; }

    /* ══════ PAYMENT ══════ */
    .payment-section {
      text-align: center;
      background: white;
      border-radius: 16px;
      border: 1px solid #eef2f8;
      padding: 20px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.02);
      position: relative;
    }
    .payment-title { font-size: 15px; font-weight: 800; color: #0046ad; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 6px; }
    .payment-sub { font-size: 12px; color: #888; margin-bottom: 15px; }
    .qr-container {
      display: inline-block;
      background: white;
      padding: 5px;
      border-radius: 10px;
      border: 1px solid #eef2f8;
    }
    .qr-container img { width: 170px; height: 170px; display: block; border-radius: 6px; }
    
    .bank-tags { display: flex; justify-content: center; gap: 8px; margin-top: 15px; }
    .bank-tag { background: #f4f8ff; border: 1px solid #d0daff; padding: 5px 15px; border-radius: 20px; font-size: 11px; font-weight: 700; color: #0046ad; }

    /* ══════ FOOTER ══════ */
    .footer {
      background: #003399;
      color: white;
      padding: 30px 20px 20px;
      text-align: center;
      position: relative;
      margin-top: 20px;
    }
    .footer-curve {
      position: absolute;
      top: -20px; left: 0; width: 100%; height: 21px;
      background: transparent;
      overflow: hidden;
    }
    .footer-curve::after {
      content: '';
      position: absolute;
      top: 0; left: -10%; width: 120%; height: 60px;
      background: #003399;
      border-radius: 100% 100% 0 0;
    }
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
      
      <div class="logo-container">
        ${logoBase64 ? `<img src="${logoBase64}" />` : '<div style="font-size:100px;">🧺</div>'}
      </div>
      
      <div class="clouds-container">
        <div class="cloud cloud-1"></div>
        <div class="cloud cloud-2"></div>
        <div class="cloud cloud-3"></div>
        <div class="cloud cloud-4"></div>
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
      <!-- Customer -->
      <div class="card-white customer-box">
        <div class="customer-avatar">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#003399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </div>
        <div class="customer-details">
          <h2>${displayName}</h2>
          <p>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#d32f2f"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            ${Customer_Phone || ''}
          </p>
        </div>
      </div>

      <!-- Info -->
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#f7b000" stroke="#f7b000" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Điểm tích lũy
          </span>
          <span class="info-value" style="color:#f7b000;">${Point || '0'} điểm</span>
        </div>
      </div>

      <!-- Total -->
      <div class="total-box">
        <div class="total-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0046ad" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><circle cx="12" cy="14" r="4"/><path d="M8 8h.01M12 8h.01M16 8h.01"/></svg>
        </div>
        <div class="total-label">Tổng thanh toán</div>
        <div class="total-amount">${formattedBill}</div>
      </div>

      <!-- Notice -->
      <div class="notice-box">
        <div class="notice-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#856404" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          Hướng dẫn nhận đồ
        </div>
        <div class="notice-text">Quý khách ghé trực tiếp cửa hàng để nhận đồ, hoặc nhắn lại tin nhắn này để được giao tận nơi (phụ phí ship).</div>
      </div>

      <!-- QR -->
      ${qrBase64 ? `
      <div class="payment-section">
        <div class="payment-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7b000" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          THANH TOÁN CHUYỂN KHOẢN
        </div>
        <div class="payment-sub">Quét mã QR bên dưới — EXIMBANK • STK: 11667799</div>
        <div class="qr-container">
          <img src="${qrBase64}" />
        </div>
        <div class="bank-tags">
          <span class="bank-tag">EXIMBANK</span>
          <span class="bank-tag">11667799</span>
          <span class="bank-tag">NGUYEN THI THU THAO</span>
        </div>
      </div>` : ''}
    </div>

    <!-- FOOTER -->
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

async function runTest() {
  const data = {
    Customer_Name: "Đinh Thị Danh",
    Complete_Date: "04/05/2026 09:30",
    Bill_Amount: "45,000",
    Point: "4",
    Customer_Phone: "0383097378"
  };
  const qrImagePath = path.join(__dirname, 'test_qr.png'); // assuming test_qr.png exists
  const outputPath = path.join(__dirname, 'latest_design_test.png');
  await generateReceiptImage(data, qrImagePath, outputPath);
  console.log("Done generating test receipt:", outputPath);
}

runTest();
