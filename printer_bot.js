const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const ping = require('ping');

const token = '8418080766:AAGd8gRJyffpFQKUFoXshNnoc7jMoB6-BBI';
const chatId = '-1003447493989';
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1BekpeEuzbpZ1NzE2X5lb90Mn2gNKcZ8l8BiCFLbJbJU/gviz/tq?tqx=out:csv&sheet=Printer';

const bot = new TelegramBot(token, {polling: true});

async function getActivePrinterIp() {
    try {
        const response = await axios.get(sheetUrl);
        const lines = response.data.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            // Dòng có dạng: "P002","Máy 2","192.168.1.235","ON"
            // Tách theo dấu phẩy và xóa dấu nháy kép
            const parts = line.split(',').map(p => p.replace(/^"|"$/g, ''));
            
            // parts[3] là Status
            if (parts.length >= 4 && parts[3] === 'ON') {
                return { name: parts[1], ip: parts[2] };
            }
        }
        return null;
    } catch (error) {
        console.error("Lỗi khi tải Google Sheet:", error.message);
        return null;
    }
}

async function checkPrinterAndNotify(manualCheck = false) {
    const printer = await getActivePrinterIp();
    
    if (!printer) {
        if (manualCheck) {
            bot.sendMessage(chatId, "Không tìm thấy máy in nào đang bật (ON) trên Google Sheet.");
        }
        return;
    }

    try {
        const res = await ping.promise.probe(printer.ip, { timeout: 3 });
        
        if (res.alive) {
            if (manualCheck) {
                bot.sendMessage(chatId, `✅ Máy in [${printer.name}] (IP: ${printer.ip}) đang hoạt động tốt.`);
            }
        } else {
            bot.sendMessage(chatId, `❌ CẢNH BÁO: Không thể kết nối tới máy in [${printer.name}] (IP: ${printer.ip})! Vui lòng kiểm tra lại.`);
        }
    } catch (err) {
        console.error("Lỗi khi ping:", err.message);
        bot.sendMessage(chatId, `⚠️ Lỗi khi thực hiện kiểm tra máy in [${printer.name}] (IP: ${printer.ip}).`);
    }
}

// Lắng nghe lệnh từ Telegram
bot.onText(/\/check_printer/, (msg) => {
    // Chỉ xử lý nếu tin nhắn đến từ đúng group
    if (msg.chat.id.toString() === chatId) {
        bot.sendMessage(chatId, "Đang kiểm tra kết nối máy in, vui lòng đợi...");
        checkPrinterAndNotify(true);
    } else {
        bot.sendMessage(msg.chat.id, "Bot này chỉ hoạt động trong group đã cấu hình.");
    }
});

// Tự động kiểm tra định kỳ mỗi 5 phút (300000 ms)
setInterval(() => {
    checkPrinterAndNotify(false); // false nghĩa là kiểm tra tự động, chỉ nhắn khi lỗi
}, 5 * 60 * 1000);

console.log("Bot đang chạy... Đã thiết lập kiểm tra định kỳ mỗi 5 phút và lệnh /check_printer");
