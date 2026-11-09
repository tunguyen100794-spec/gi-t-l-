const { Zalo } = require("zalo-api-final");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const ZALO_CREDENTIALS_PATH = path.join(__dirname, "zalo_credentials.json");
const ZALO_QR_PATH = path.join(__dirname, "qr.png");
const TELEGRAM_TOKEN = "8418080766:AAGd8gRJyffpFQKUFoXshNnoc7jMoB6-BBI";
const TELEGRAM_CHAT_ID = "-1003447493989";

async function sendTelegramMessage(text) {
  try {
    const nodeFetch = require("node-fetch");
    const fetchFn = nodeFetch.default || nodeFetch;
    await fetchFn(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (err) {
    console.error("sendTelegramMessage error:", err.message);
  }
}

async function sendTelegramQR(qrPath, maxRetries = 5) {
  const FormData = require("form-data");
  const nodeFetch = require("node-fetch");
  const fetchFn = nodeFetch.default || nodeFetch;
  const delays = [3000, 5000, 8000, 12000, 15000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[TELEGRAM-QR] Đang gửi mã QR đăng nhập tới nhóm Gold Laundry (Lần ${attempt}/${maxRetries})...`);
      const form = new FormData();
      form.append("chat_id", TELEGRAM_CHAT_ID);
      form.append("photo", fs.createReadStream(qrPath));
      form.append("caption", "🔐 Vui lòng quét mã QR này bằng Zalo Hotline để đăng nhập hệ thống.");

      const response = await fetchFn(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
        method: "POST",
        body: form,
        headers: typeof form.getHeaders === "function" ? form.getHeaders() : undefined,
        timeout: 30000,
      });
      const result = await response.json();
      if (result.ok) {
        console.log(`[TELEGRAM-QR] ✓ Gửi mã QR thành công (Message ID: ${result.result.message_id})!`);
        return result;
      } else {
        console.error(`[TELEGRAM-QR] Lỗi phản hồi từ Telegram API (Lần ${attempt}):`, result);
      }
    } catch (err) {
      console.error(`[TELEGRAM-QR] Lỗi kết nối gửi mã QR (Lần ${attempt}/${maxRetries}):`, err.message);
    }

    if (attempt < maxRetries) {
      const waitMs = delays[attempt - 1] || 5000;
      console.log(`[TELEGRAM-QR] Chờ ${waitMs / 1000}s trước khi thử lại...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  return null;
}

async function main() {
  console.log("Khởi tạo tiến trình đăng nhập QR Zalo...");
  const zaloInit = new Zalo();

  try {
    await zaloInit.loginQR(
      {
        qrPath: ZALO_QR_PATH,
      },
      async (event) => {
        if (event.type === 0) {
          console.log("Mã QR đã được tạo, đang lưu và gửi vào Telegram...");
          await event.actions.saveToFile(ZALO_QR_PATH);
          await sendTelegramQR(ZALO_QR_PATH);
          console.log("✅ Đã gửi mã QR qua Telegram thành công. Chờ bạn quét mã trên điện thoại...");
        } else if (event.type === 4) {
          console.log("✅ Đã nhận thông tin đăng nhập! Đang lưu session mới...");
          await fsPromises.writeFile(ZALO_CREDENTIALS_PATH, JSON.stringify(event.data, null, 2));
          console.log("✅ Đã lưu zalo_credentials.json thành công!");
          await sendTelegramMessage("✅ Đăng nhập Zalo thành công! Hệ thống đã được cấp lại quyền hoạt động.");
          process.exit(0);
        }
      }
    );
  } catch (err) {
    console.error("Lỗi đăng nhập QR:", err);
    await sendTelegramMessage("❌ Lỗi tạo mã QR: " + err.message);
    process.exit(1);
  }
}

main();
