const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testReceipt() {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const qrPath = path.join(__dirname, 'qr.png');
  let qrBase64 = '';
  if (fs.existsSync(qrPath)) {
    qrBase64 = `data:image/png;base64,${fs.readFileSync(qrPath).toString('base64')}`;
  }

  const displayName = 'Hà';
  const Customer_Phone = '0869127867';
  const Complete_Date = '01/05/2026 21:36';
  const rawAmount = 69000;
  const formattedAmount = rawAmount.toLocaleString('vi-VN');
  const Point = '219';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Be Vietnam Pro',sans-serif; background:transparent; width:560px; }

    .card {
      width:560px;
      background:#f0f5ff;
      border-radius:24px;
      overflow:hidden;
      box-shadow:0 16px 48px rgba(0,30,120,0.18);
    }

    /* ── HEADER ── */
    .header {
      background: linear-gradient(160deg, #0a2d8f 0%, #1245c8 55%, #1a6fe0 100%);
      padding: 32px 30px 0;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    /* Subtle radial shine */
    .header::before {
      content:'';
      position:absolute; top:-60px; left:50%; transform:translateX(-50%);
      width:460px; height:260px;
      background:radial-gradient(ellipse, rgba(255,255,255,0.10) 0%, transparent 70%);
    }
    /* Large faded circle decoration */
    .hc { position:absolute; border-radius:50%; background:rgba(255,255,255,0.06); }
    .hc1 { width:220px;height:220px; top:-80px;right:-60px; }
    .hc2 { width:140px;height:140px; bottom:20px;left:-40px; }

    .sparkles {
      position:relative; z-index:2;
      display:flex; justify-content:center; align-items:center; gap:8px;
      margin-bottom:10px;
    }
    .sparkle-icon { color:#ffd740; font-size:22px; }
    .sparkle-icon.sm { font-size:14px; }

    .brand-name {
      position:relative; z-index:2;
      font-size:46px; font-weight:900;
      color:#ffffff;
      letter-spacing:1px;
      line-height:1;
      text-shadow:0 3px 16px rgba(0,0,0,0.2);
    }
    .brand-sub {
      position:relative; z-index:2;
      font-size:13px; font-weight:400;
      letter-spacing:2px; text-transform:uppercase;
      color:rgba(255,255,255,0.75);
      margin-top:8px; margin-bottom:20px;
    }

    /* Wave bottom */
    .wave { position:relative; z-index:2; line-height:0; margin-top:4px; }
    .wave svg { display:block; width:100%; }

    /* ── STATUS BAR ── */
    .status-bar {
      background:#f0f5ff;
      padding:14px 24px;
      display:flex; align-items:center; justify-content:center; gap:14px;
    }
    .status-line {
      flex:1; height:2px;
      background:linear-gradient(90deg, transparent, #1245c8 80%);
      border-radius:2px;
    }
    .status-line.right {
      background:linear-gradient(90deg, #1245c8 20%, transparent);
    }
    .status-diamond {
      width:9px;height:9px;border-radius:2px;
      background:#1245c8;transform:rotate(45deg);flex-shrink:0;
    }
    .status-text {
      font-size:18px; font-weight:900;
      color:#1245c8;
      text-transform:uppercase; letter-spacing:1px;
      white-space:nowrap;
    }

    /* ── BODY ── */
    .body { padding:10px 16px 18px; display:flex; flex-direction:column; gap:10px; }

    /* Card */
    .wcard {
      background:white; border-radius:16px;
      border:1.5px solid #e0e8f8;
      padding:14px 18px;
      box-shadow:0 2px 10px rgba(0,40,160,0.05);
    }

    /* Customer */
    .cust-row { display:flex; align-items:center; gap:14px; }
    .cust-avatar {
      width:50px;height:50px;border-radius:50%;flex-shrink:0;
      background:linear-gradient(135deg,#1245c8,#2d8ef5);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 12px rgba(18,69,200,0.3);
    }
    .cust-name { font-size:18px;font-weight:800;color:#0d1b3e; }
    .cust-phone { font-size:13px;color:#6b7db3;margin-top:3px;display:flex;align-items:center;gap:5px; }

    /* Info rows */
    .info-card { padding:4px 18px; }
    .info-row {
      display:flex;justify-content:space-between;align-items:center;
      padding:10px 0; border-bottom:1px solid #edf2fb;
    }
    .info-row:last-child { border-bottom:none; }
    .info-lbl { font-size:14px;color:#555;display:flex;align-items:center;gap:8px; }
    .info-val { font-size:15px;font-weight:800;color:#1245c8; }

    /* Total */
    .total-card {
      background:linear-gradient(90deg,#0e3dc7 0%,#1a6fe0 100%);
      border-radius:16px; padding:16px 20px;
      display:flex; align-items:center; justify-content:space-between;
      box-shadow:0 8px 22px rgba(14,61,199,0.35);
    }
    .total-lbl { font-size:14px;font-weight:700;color:rgba(255,255,255,0.9);text-transform:uppercase;letter-spacing:0.5px; }
    .total-amt { font-size:36px;font-weight:900;color:#ffffff;line-height:1; }
    .total-curr { font-size:20px;font-weight:700;color:rgba(255,255,255,0.9);margin-left:4px; }

    /* Notice */
    .notice-card {
      background:#ffffff;border:1.5px solid #e0e8f8;border-left:4px solid #1245c8;border-radius:16px;padding:15px 20px;box-shadow:0 2px 10px rgba(0,40,160,0.05);
    }
    .notice-title {
      font-size:14px;font-weight:800;color:#1245c8;
      display:flex;align-items:center;gap:8px;margin-bottom:6px;
    }
    .notice-text { font-size:13px;color:#4a5e8a;line-height:1.6; }

    /* Payment */
    .pay-card { background:white;border-radius:16px;border:1.5px solid #e0e8f8;padding:18px 18px;text-align:center; box-shadow:0 2px 10px rgba(0,40,160,0.05); }
    .pay-title {
      font-size:14px;font-weight:800;color:#1245c8;
      text-transform:uppercase;letter-spacing:1px;
      display:flex;align-items:center;justify-content:center;gap:8px;
      margin-bottom:4px;
    }
    .pay-sub { font-size:12px;color:#8899bb;margin-bottom:14px; }
    .qr-wrap {
      display:inline-flex;padding:8px;background:white;
      border-radius:12px;border:1.5px solid #e0e8f8;
      box-shadow:0 4px 14px rgba(0,0,0,0.08);margin-bottom:14px;
    }
    .qr-wrap img { width:170px;height:170px;display:block;border-radius:6px; }
    .chips { display:flex;justify-content:center;gap:8px; }
    .chip {
      background:#f0f5ff;border:1.5px solid #c8d8f8;
      padding:5px 14px;border-radius:20px;
      font-size:12px;font-weight:700;color:#1245c8;
    }

    /* Footer */
    .footer {
      background:linear-gradient(90deg,#0a2d8f,#1245c8);
      padding:14px 20px;text-align:center;
    }
    .footer-text {
      font-size:13px;color:rgba(255,255,255,0.85);
      display:inline-flex;align-items:center;gap:6px;
    }
    .footer-brand { font-weight:800;color:#fff; }
    .footer-heart { color:#ff5252; }
  </style>
</head>
<body>
  <div class="card" id="receipt">

    <!-- HEADER -->
    <div class="header">
      <div class="hc hc1"></div>
      <div class="hc hc2"></div>

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

    <!-- STATUS -->
    <div class="status-bar">
      <div class="status-line"></div>
      <div class="status-diamond"></div>
      <div class="status-text">Hoàn thành đơn hàng</div>
      <div class="status-diamond"></div>
      <div class="status-line right"></div>
    </div>

    <!-- BODY -->
    <div class="body">

      <!-- Customer -->
      <div class="wcard cust-row">
        <div class="cust-avatar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div>
          <div class="cust-name">${displayName}</div>
        </div>
      </div>

      <!-- Info -->
      <div class="wcard info-card" style="padding-left:18px;padding-right:18px;">
        <div class="info-row">
          <span class="info-lbl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Thời gian hoàn thành
          </span>
          <span class="info-val">${Complete_Date}</span>
        </div>
        <div class="info-row">
          <span class="info-lbl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Điểm tích lũy
          </span>
          <span class="info-val">${Point} điểm</span>
        </div>
      </div>

      <!-- Total -->
      <div class="total-card">
        <div class="total-lbl">Tổng thanh toán</div>
        <div>
          <span class="total-amt">${formattedAmount}</span><span class="total-curr">đ</span>
        </div>
      </div>

      <!-- Notice -->
      <div class="notice-card">
        <div class="notice-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1245c8" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          Hướng dẫn nhận đồ
        </div>
        <div class="notice-text">Quý khách ghé trực tiếp cửa hàng để nhận đồ, hoặc nhắn lại tin nhắn này để được giao tận nơi (phụ phí ship).</div>
      </div>

      <!-- QR Payment -->
      ${qrBase64 ? `
      <div class="pay-card">
        <div class="pay-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1245c8" stroke-width="2">
            <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
          Thanh toán chuyển khoản
        </div>
        <div class="qr-wrap"><img src="${qrBase64}"/></div>
        <div class="chips">
          <span class="chip">MB</span>
          <span class="chip">0394135248</span>
          <span class="chip">LE THI DIEU MANH</span>
        </div>
      </div>` : ''}

    </div>

    <!-- FOOTER -->
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

  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  const el = await page.$('#receipt');
  await el.screenshot({ path: path.join(__dirname, 'last_test_receipt.png'), omitBackground: true });
  await browser.close();
  console.log('Done!');
}

testReceipt().catch(console.error);


