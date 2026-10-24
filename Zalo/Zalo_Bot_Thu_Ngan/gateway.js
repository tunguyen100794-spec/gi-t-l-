const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Zalo, ThreadType, LoginQRCallbackEventType } = require('zca-js');

// Thử nạp jimp nếu có, nếu không sẽ dùng bộ vẽ đồ họa System.Drawing có sẵn của Windows
let Jimp = null;
try {
    const jimpPkg = require('jimp');
    Jimp = jimpPkg.Jimp || jimpPkg;
} catch (e) {
    console.log('[BOT] Jimp chưa cài đặt, hệ thống sẽ dùng bộ vẽ đồ họa Windows native System.Drawing.');
}

const PORT = 5050;
const SESSION_FILE = path.join(__dirname, 'session.json');

const app = express();
app.use(cors());
app.use(express.json());

let currentApi = null;
let botStatus = 'starting'; // 'starting' | 'qr_waiting' | 'logging_in' | 'ready' | 'error'
let currentQR = null;
let currentAccount = null;
let statusMessage = 'Đang khởi động hệ thống...';

// Simple queue for rate-limiting messages (2.5s between sends)
const sendQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || sendQueue.length === 0) return;
    isProcessingQueue = true;

    while (sendQueue.length > 0) {
        const item = sendQueue.shift();
        try {
            const res = await doSendMessage(item.phone, item.message);
            item.resolve(res);
        } catch (err) {
            item.reject(err);
        }
        // Wait 2.5s before next send to keep Zalo safe
        if (sendQueue.length > 0) {
            await new Promise(r => setTimeout(r, 2500));
        }
    }

    isProcessingQueue = false;
}

function queueSendMessage(phone, message) {
    return new Promise((resolve, reject) => {
        sendQueue.push({ phone, message, resolve, reject });
        processQueue();
    });
}

// Ghép Mã QR vào Phôi Thẻ VIP (Hoạt động 100% trên mọi máy Windows)
async function composeVipCard(templatePath, qrPath, outPath) {
    if (Jimp) {
        try {
            const card = await Jimp.read(templatePath);
            const qrImg = await Jimp.read(qrPath);
            card.composite(qrImg, 262, 859);
            await card.write(outPath);
            if (fs.existsSync(outPath)) return true;
        } catch (jimpErr) {
            console.warn('[BOT] Jimp ghép ảnh thất bại, chuyển sang bộ vẽ Windows:', jimpErr.message);
        }
    }

    // Bộ vẽ dự phòng: Windows PowerShell System.Drawing (Có sẵn trên mọi máy Windows)
    try {
        const { execSync } = require('child_process');
        const normTpl = templatePath.replace(/\\/g, '/');
        const normQr = qrPath.replace(/\\/g, '/');
        const normOut = outPath.replace(/\\/g, '/');
        
        const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $t = [System.Drawing.Bitmap]::FromFile('${normTpl}'); $q = [System.Drawing.Bitmap]::FromFile('${normQr}'); $g = [System.Drawing.Graphics]::FromImage($t); $dest = [System.Drawing.Rectangle]::new(262, 859, 175, 175); $src = [System.Drawing.Rectangle]::new(0, 0, $q.Width, $q.Height); $g.DrawImage($q, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel); $g.Dispose(); $q.Dispose(); $t.Save('${normOut}', [System.Drawing.Imaging.ImageFormat]::Png); $t.Dispose()"`;
        execSync(psCmd);
        return fs.existsSync(outPath);
    } catch (psErr) {
        console.error('[BOT] Lỗi vẽ ảnh qua Windows System.Drawing:', psErr.message);
        return false;
    }
}

async function doSendMessage(phone, message) {
    if (!currentApi || botStatus !== 'ready') {
        throw new Error('Zalo Gateway chưa sẵn sàng hoặc chưa đăng nhập.');
    }

    let cleanPhone = (phone || '').toString().trim().replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('84')) {
        cleanPhone = '0' + cleanPhone.slice(2);
    }
    if (!cleanPhone) {
        throw new Error('Số điện thoại không hợp lệ.');
    }

    console.log(`[BOT] Đang tìm kiếm khách hàng SĐT: ${cleanPhone}`);
    let user = null;
    try {
        user = await currentApi.findUser(cleanPhone);
    } catch (findErr) {
        console.error(`[BOT] Lỗi tìm user ${cleanPhone}:`, findErr.message);
        throw new Error(`Không tìm thấy Zalo của số ${cleanPhone} (khách chưa đăng ký hoặc chặn tìm kiếm qua SĐT).`);
    }

    if (!user || (!user.uid && !user.userId)) {
        throw new Error(`Không tìm thấy tài khoản Zalo với SĐT ${cleanPhone}.`);
    }

    const targetUid = user.uid || user.userId;
    const targetName = user.display_name || user.displayName || user.zalo_name || cleanPhone;
    console.log(`[BOT] Tìm thấy khách hàng: ${targetName} (UID: ${targetUid}). Chuẩn bị Thẻ VIP...`);

    const cardUrl = `https://giatsayquynhon.vn/the/?phone=${cleanPhone}`;
    const cardCaption = `✨ GIẶT SẤY GOLD LAUNDRY KÍNH CHÀO ${targetName.toUpperCase()}! ✨\n` +
        `Tiệm thân gửi Quý khách THẺ THÀNH VIÊN VIP ĐIỆN TỬ với rất nhiều đặc quyền hấp dẫn.\n` +
        `👉 Chạm vào đây để mở Thẻ VIP ngay: ${cardUrl}\n` +
        `Hotline hỗ trợ: 0777 77 97 11. Kính chúc Quý khách một ngày tốt lành!`;

    // 1. Tạo ảnh Thẻ VIP hoàn chỉnh
    const templatePath = path.join(__dirname, 'vip_card_full.png');
    const tempQrPath = path.join(__dirname, `temp_qr_${cleanPhone}_${Date.now()}.png`);
    const finalCardPath = path.join(__dirname, `card_${cleanPhone}_${Date.now()}.png`);
    let finalSendPath = null;

    try {
        // Tạo QR code trước
        await QRCode.toFile(tempQrPath, cardUrl, {
            width: 175,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' }
        });

        if (fs.existsSync(templatePath)) {
            const composed = await composeVipCard(templatePath, tempQrPath, finalCardPath);
            if (composed && fs.existsSync(finalCardPath)) {
                finalSendPath = finalCardPath;
                console.log(`[BOT] ✓ Đã ghép xong bức ảnh Thẻ VIP hoàn chỉnh cho ${cleanPhone}`);
            }
        }

        // Nếu không ghép được phôi thì dùng trực tiếp ảnh QR
        if (!finalSendPath && fs.existsSync(tempQrPath)) {
            finalSendPath = tempQrPath;
        }
    } catch (genErr) {
        console.error('[BOT] Lỗi tạo ảnh:', genErr.message);
    }

    // 2. Gửi ĐÚNG 1 TIN NHẮN DUY NHẤT: Bức ảnh Thẻ VIP kèm Chú thích link mở thẻ
    try {
        if (finalSendPath && fs.existsSync(finalSendPath)) {
            console.log(`[BOT] Đang gửi 1 bức ảnh Thẻ VIP duy nhất tới ${targetName}...`);
            await currentApi.sendMessage({
                msg: cardCaption,
                attachments: [ finalSendPath ]
            }, targetUid, ThreadType.User);
            console.log(`[BOT] ✓ Gửi thành công ảnh Thẻ VIP tới ${targetName} (${cleanPhone})!`);
        } else {
            console.log(`[BOT] Gửi tin nhắn chữ tới ${targetName}...`);
            await currentApi.sendMessage(message || cardCaption, targetUid, ThreadType.User);
            console.log(`[BOT] ✓ Gửi tin nhắn thành công tới ${targetName} (${cleanPhone})`);
        }
    } catch (sendErr) {
        console.error(`[BOT] Gửi tin thất bại: ${sendErr.message}`);
        // Thử gửi qua lời mời kết bạn nếu bị chặn tin nhắn người lạ
        try {
            console.log(`[BOT] Thử gửi qua Lời mời kết bạn Zalo...`);
            await currentApi.sendFriendRequest(cardCaption.slice(0, 150), targetUid);
            console.log(`[BOT] ✓ Đã gửi lời mời kết bạn kèm tin nhắn tới ${targetName}`);
            return { ok: true, uid: targetUid, name: targetName, friendRequest: true };
        } catch (frErr) {
            console.error(`[BOT] Gửi lời mời kết bạn cũng thất bại: ${frErr.message}`);
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

// Start Zalo Bot
async function initZaloBot(forceQR = false) {
    botStatus = 'starting';
    currentQR = null;
    statusMessage = 'Đang khởi tạo kết nối Zalo...';

    const zalo = new Zalo({
        selfListen: false,
        checkUpdate: false,
        logging: true,
        imageMetadataGetter: async (filePath) => {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                width: 700,
                height: 1280
            };
        }
    });

    if (!forceQR && fs.existsSync(SESSION_FILE)) {
        try {
            console.log('[BOT] Tìm thấy file phiên đăng nhập cũ (session.json). Đang khôi phục...');
            statusMessage = 'Đang khôi phục phiên đăng nhập trước...';
            botStatus = 'logging_in';

            const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            currentApi = await zalo.login(sessionData);

            botStatus = 'ready';
            currentQR = null;
            currentAccount = {
                uid: currentApi.getOwnId ? currentApi.getOwnId() : 'Hotline Zalo'
            };
            statusMessage = `Đã kết nối thành công tài khoản Zalo (UID: ${currentAccount.uid})`;
            console.log(`[BOT] ✓ ${statusMessage}`);
            return;
        } catch (err) {
            console.warn('[BOT] Phiên đăng nhập cũ đã hết hạn:', err.message);
            fs.unlinkSync(SESSION_FILE);
        }
    }

    // Start QR Login
    startQRLogin(zalo);
}

function startQRLogin(zalo) {
    botStatus = 'qr_waiting';
    statusMessage = 'Đang tạo mã QR để đăng nhập...';
    console.log('[BOT] Khởi động chế độ quét mã QR...');

    zalo.loginQR({}, (event) => {
        if (!event) return;

        if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
            console.log('[BOT] Đã tạo mã QR mới! Quét mã trên điện thoại hotline.');
            currentQR = event.data.image;
            botStatus = 'qr_waiting';
            statusMessage = 'Vui lòng mở Zalo Hotline và quét mã QR trên màn hình.';
        } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
            console.log(`[BOT] Đã quét QR bởi: ${event.data.display_name}. Vui lòng bấm Xác nhận trên điện thoại!`);
            botStatus = 'logging_in';
            statusMessage = `Đã quét bởi ${event.data.display_name}. Hãy nhấn 'Đăng nhập' trên điện thoại!`;
        } else if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
            console.warn('[BOT] Đăng nhập QR bị từ chối.');
            botStatus = 'error';
            statusMessage = 'Đăng nhập bị từ chối trên điện thoại. Bấm nút dưới để tạo lại mã QR.';
        } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
            console.warn('[BOT] Mã QR đã hết hạn.');
            botStatus = 'error';
            statusMessage = 'Mã QR đã hết hạn. Đang tạo mã mới...';
            if (event.actions && event.actions.retry) {
                event.actions.retry();
            }
        } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
            console.log('[BOT] Đã lấy thông tin đăng nhập thành công! Lưu session.json...');
            try {
                fs.writeFileSync(SESSION_FILE, JSON.stringify(event.data, null, 2), 'utf8');
            } catch (saveErr) {
                console.error('[BOT] Không thể lưu session.json:', saveErr.message);
            }
        }
    }).then((api) => {
        currentApi = api;
        botStatus = 'ready';
        currentQR = null;
        currentAccount = {
            uid: currentApi.getOwnId ? currentApi.getOwnId() : 'Hotline Zalo'
        };
        statusMessage = `Đã kết nối thành công tài khoản Zalo (UID: ${currentAccount.uid})`;
        console.log(`[BOT] ✓ ${statusMessage}`);
    }).catch((err) => {
        console.error('[BOT] Lỗi đăng nhập QR:', err.message);
        botStatus = 'error';
        statusMessage = `Lỗi: ${err.message}`;
    });
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        ok: true,
        status: botStatus,
        message: statusMessage,
        account: currentAccount,
        hasQr: !!currentQR,
        qrImage: currentQR ? `data:image/png;base64,${currentQR}` : null
    });
});

app.post('/api/re-login', (req, res) => {
    if (fs.existsSync(SESSION_FILE)) {
        try { fs.unlinkSync(SESSION_FILE); } catch(e){}
    }
    currentApi = null;
    initZaloBot(true);
    res.json({ ok: true, message: 'Đang khởi động lại tiến trình tạo mã QR...' });
});

app.post('/api/send-zalo', async (req, res) => {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
        return res.status(400).json({ ok: false, error: 'Thiếu số điện thoại hoặc nội dung tin nhắn.' });
    }

    if (botStatus !== 'ready' || !currentApi) {
        return res.status(503).json({
            ok: false,
            error: 'Zalo Hotline trên máy thu ngân chưa sẵn sàng. Hãy mở trang quản trị http://localhost:5050 để quét mã QR.'
        });
    }

    try {
        const result = await queueSendMessage(phone, message);
        return res.json({ ok: true, data: result });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message || 'Lỗi gửi tin nhắn Zalo' });
    }
});

// Web Dashboard UI
app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zalo Gateway - Giặt Sấy Gold Laundry</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; max-width: 520px; width: 100%; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
        .logo-wrap { width: 64px; height: 64px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 30px; margin-bottom: 16px; box-shadow: 0 10px 15px -3px rgba(245, 158, 11, 0.3); }
        h1 { font-size: 20px; font-weight: 800; color: #fbbf24; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
        .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; margin-bottom: 24px; }
        .badge-ready { background: #064e3b; color: #34d399; border: 1px solid #059669; }
        .badge-waiting { background: #78350f; color: #fbbf24; border: 1px solid #d97706; }
        .badge-error { background: #7f1d1d; color: #f87171; border: 1px solid #dc2626; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; }
        .qr-box { background: white; padding: 16px; border-radius: 16px; display: inline-block; margin-bottom: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .qr-box img { display: block; width: 240px; height: 240px; }
        .instructions { font-size: 14px; color: #cbd5e1; line-height: 1.6; margin-bottom: 20px; background: #0f172a; padding: 14px; border-radius: 12px; border: 1px solid #334155; text-align: left; }
        .instructions ol { padding-left: 20px; }
        .btn { background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
        .btn:hover { background: #1d4ed8; }
        .btn-danger { background: #dc2626; }
        .btn-danger:hover { background: #b91c1c; }
        .test-box { margin-top: 24px; border-top: 1px solid #334155; padding-top: 20px; text-align: left; }
        .test-title { font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 10px; text-transform: uppercase; }
        .input-group { display: flex; gap: 8px; margin-bottom: 8px; }
        .input { background: #0f172a; border: 1px solid #334155; color: white; padding: 10px 14px; border-radius: 8px; font-size: 13px; flex: 1; }
        .input:focus { outline: none; border-color: #f59e0b; }
        .status-msg { font-size: 12px; color: #94a3b8; margin-top: 6px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo-wrap">🧺</div>
        <h1>Zalo Gateway Thu Ngân</h1>
        <div class="subtitle">Giặt Sấy Gold Laundry - 0777 77 97 11</div>

        <div id="statusBadge" class="badge badge-waiting">
            <span class="dot"></span> <span id="statusText">Đang kiểm tra...</span>
        </div>

        <div id="qrSection" style="display: none;">
            <div class="qr-box">
                <img id="qrImg" src="" alt="Mã QR Zalo" />
            </div>
            <div class="instructions">
                <div style="font-weight: 700; margin-bottom: 6px; color: #fbbf24;">👉 HƯỚNG DẪN QUÉT MÃ:</div>
                <ol>
                    <li>Mở ứng dụng <b>Zalo trên điện thoại hotline (0777 77 97 11)</b>.</li>
                    <li>Bấm biểu tượng <b>Quét mã QR</b> góc trên bên phải màn hình.</li>
                    <li>Hướng camera vào mã QR ở trên -> Bấm <b>Đăng nhập</b>.</li>
                </ol>
            </div>
            <button class="btn" onclick="reLogin()">🔄 Tạo lại mã QR mới</button>
        </div>

        <div id="readySection" style="display: none;">
            <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
            <div style="font-size: 16px; font-weight: 700; color: #34d399; margin-bottom: 8px;">Zalo Hotline Đã Sẵn Sàng!</div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">
                Mỗi khi bạn bấm <b>"💬 Mời Zalo"</b> trên trang Thu Ngân (quanly.html), tin nhắn thẻ VIP kèm link tra cứu sẽ tự động gửi trực tiếp tới khách hàng.
            </p>
            <button class="btn btn-danger" onclick="reLogin()">Đăng xuất / Đổi tài khoản Zalo</button>

            <div class="test-box">
                <div class="test-title">🧪 Kiểm tra gửi tin nhắn thử nghiệm:</div>
                <div class="input-group">
                    <input id="testPhone" class="input" placeholder="Nhập SĐT khách thử (VD: 0777779711)" value="0777779711" />
                </div>
                <div class="input-group">
                    <input id="testMsg" class="input" placeholder="Nội dung tin nhắn" value="✨ [TEST] Gold Laundry xin chào Quý Khách!" />
                    <button class="btn" onclick="sendTest()" id="btnTest">Gửi thử</button>
                </div>
                <div id="testResult" class="status-msg"></div>
            </div>
        </div>
    </div>

    <script>
        let currentLoadedQr = null;
        async function checkStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                const badge = document.getElementById('statusBadge');
                const text = document.getElementById('statusText');
                const qrSec = document.getElementById('qrSection');
                const readySec = document.getElementById('readySection');
                const qrImg = document.getElementById('qrImg');

                if (data.status === 'ready') {
                    badge.className = 'badge badge-ready';
                    text.innerText = 'ĐÃ SẴN SÀNG HOẠT ĐỘNG';
                    qrSec.style.display = 'none';
                    readySec.style.display = 'block';
                } else if (data.status === 'qr_waiting') {
                    badge.className = 'badge badge-waiting';
                    text.innerText = data.message || 'CHỜ QUÉT MÃ QR';
                    if (data.qrImage && currentLoadedQr !== data.qrImage) {
                        currentLoadedQr = data.qrImage;
                        qrImg.src = data.qrImage;
                    }
                    if (qrSec.style.display !== 'block') {
                        qrSec.style.display = 'block';
                    }
                    readySec.style.display = 'none';
                } else if (data.status === 'logging_in') {
                    badge.className = 'badge badge-waiting';
                    text.innerText = data.message || 'ĐANG ĐĂNG NHẬP...';
                } else {
                    badge.className = 'badge badge-error';
                    text.innerText = data.message || 'LỖI KẾT NỐI';
                }
            } catch (err) {
                document.getElementById('statusBadge').className = 'badge badge-error';
                document.getElementById('statusText').innerText = 'Không thể kết nối máy chủ Gateway';
            }
        }

        async function reLogin() {
            if (!confirm('Bạn có chắc muốn đăng xuất hoặc tạo lại mã QR đăng nhập Zalo?')) return;
            await fetch('/api/re-login', { method: 'POST' });
            checkStatus();
        }

        async function sendTest() {
            const phone = document.getElementById('testPhone').value.trim();
            const message = document.getElementById('testMsg').value.trim();
            const resEl = document.getElementById('testResult');
            const btn = document.getElementById('btnTest');

            if (!phone || !message) {
                alert('Vui lòng nhập SĐT và nội dung');
                return;
            }

            btn.disabled = true;
            btn.innerText = 'Đang gửi...';
            resEl.innerText = 'Đang gửi tin nhắn qua Zalo...';

            try {
                const res = await fetch('/api/send-zalo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, message })
                });
                const data = await res.json();
                if (data.ok) {
                    resEl.innerHTML = '<span style="color: #34d399;">✓ Gửi thành công tới ' + (data.data.name || phone) + '!</span>';
                } else {
                    resEl.innerHTML = '<span style="color: #f87171;">✗ Lỗi: ' + (data.error || 'Thất bại') + '</span>';
                }
            } catch (e) {
                resEl.innerHTML = '<span style="color: #f87171;">✗ Lỗi kết nối: ' + e.message + '</span>';
            } finally {
                btn.disabled = false;
                btn.innerText = 'Gửi thử';
            }
        }

        checkStatus();
        setInterval(checkStatus, 2500);
    </script>
</body>
</html>`;
    res.send(html);
});

// Start Express Server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`✨ GOLD LAUNDRY ZALO BOT GATEWAY SẴN SÀNG! ✨`);
    console.log(`URL Dashboard: http://127.0.0.1:${PORT}`);
    console.log(`API Endpoint:  http://127.0.0.1:${PORT}/api/send-zalo`);
    console.log(`====================================================`);
    
    // Tự động mở trình duyệt sau khi server đã mở cổng thành công
    setTimeout(() => {
        try {
            const { exec } = require('child_process');
            exec(`start http://127.0.0.1:${PORT}`);
        } catch (e) {}
    }, 1000);

    initZaloBot();
});

server.on('error', (err) => {
    console.error(`[LỖI CỔNG 5050]:`, err.message);
    if (err.code === 'EADDRINUSE') {
        console.error(`Cổng ${PORT} đang bị một ứng dụng khác chiếm giữ.`);
    }
});
