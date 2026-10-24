/**
 * server.js (ASCII + remove Vietnamese diacritics)
 * - GET  /health  -> "OK"
 * - POST /print   -> nhận JSON từ AppSheet Bot và in ESC/POS qua TCP/IP (RAW 9100)
 *
 * JSON mẫu (AppSheet Body):
 * {
 *   "title": "HOÁ ĐƠN",
 *   "customer": "Nguyễn Văn Bình",
 *   "total": 51000,
 *   "items": [
 *     { "name": "Cà phê sữa đá", "qty": 2, "price": 12000 },
 *     { "name": "Bánh mì trứng", "qty": 1, "price": 15000 }
 *   ]
 * }
 *
 * Output in sẽ tự động bỏ dấu:
 *  "HOA DON", "Nguyen Van Binh", "Ca phe sua da", ...
 */

const express = require("express");
const net = require("net");

const app = express();
app.use(express.json({ limit: "256kb" }));

// ====== CONFIG ======
const PRINTER_IP = "192.168.1.222";
const PRINTER_PORT = 9100;
const API_PORT = 3000;

// ====== ESC/POS helpers ======
const bytes = (...arr) => Buffer.from(arr);
const t = (s) => Buffer.from(String(s), "ascii"); // dùng ASCII để tránh lỗi font
const lf = () => Buffer.from("\n", "ascii");

function padRight(s, w) {
  s = String(s ?? "");
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}
function padLeft(s, w) {
  s = String(s ?? "");
  return s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
}

// Bỏ dấu tiếng Việt để in ổn định (ESC/POS thường không hỗ trợ UTF-8 có dấu)
function removeDiacritics(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu tổ hợp
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function buildBill({ title, customer, items, total }) {
  // Có thể đổi W=32 -> 42/48 nếu máy bạn in được rộng hơn
  const W = 32;
  const line = () => t("-".repeat(W) + "\n");

  // Commands
  const ESC_INIT = bytes(0x1b, 0x40);            // ESC @ reset
  const ALIGN_CENTER = bytes(0x1b, 0x61, 0x01);  // ESC a 1
  const ALIGN_LEFT = bytes(0x1b, 0x61, 0x00);    // ESC a 0
  const BOLD_ON = bytes(0x1b, 0x45, 0x01);       // ESC E 1
  const BOLD_OFF = bytes(0x1b, 0x45, 0x00);      // ESC E 0
  const FEED_3 = bytes(0x1b, 0x64, 0x03);        // ESC d 3
  const CUT = bytes(0x1d, 0x56, 0x42, 0x00);     // GS V B 0 (cut)

  const header = t(
    padRight("Mat hang", 20) + padLeft("SL", 4) + padLeft("Gia", 8) + "\n"
  );

  const rows = (items || []).map((it) => {
    const name = padRight(removeDiacritics(it?.name || ""), 20);
    const qty = padLeft(it?.qty ?? "", 4);
    const price = padLeft(it?.price ?? "", 8);
    return t(`${name}${qty}${price}\n`);
  });

  return Buffer.concat([
    ESC_INIT,

    ALIGN_CENTER,
    BOLD_ON,
    t(removeDiacritics(title || "HOA DON")),
    lf(),
    BOLD_OFF,

    line(),

    ALIGN_LEFT,
    t(`Khach: ${removeDiacritics(customer || "N/A")}\n`),
    line(),

    header,
    line(),

    ...rows,

    line(),
    BOLD_ON,
    t(padRight("Tong tien:", 24) + padLeft(total, 8) + "\n"),
    BOLD_OFF,

    lf(),
    ALIGN_CENTER,
    t("Cam on quy khach!\n"),

    FEED_3,
    CUT,
  ]);
}

function printRaw(payload) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    socket.setTimeout(5000);

    socket.connect(PRINTER_PORT, PRINTER_IP, () => {
      socket.write(payload);
      setTimeout(() => socket.end(), 300); // đợi chút rồi đóng cho chắc
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });

    socket.on("error", (e) => reject(e));
    socket.on("close", () => resolve());
  });
}

// ====== ROUTES ======
app.get("/", (req, res) => res.send("OK - use /health or POST /print"));
app.get("/health", (req, res) => res.send("OK"));

app.post("/print", async (req, res) => {
  try {
    const b = req.body || {};
    console.log("Incoming /print:", JSON.stringify(b));

    const title = removeDiacritics(b.title || "HOA DON");
    const customer = removeDiacritics(b.customer || "N/A");

    const items = Array.isArray(b.items) ? b.items : [];

    // total: nếu không gửi total thì tự tính
    const total =
      typeof b.total === "number"
        ? b.total
        : items.reduce(
            (s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0),
            0
          );

    const payload = buildBill({ title, customer, items, total });
    await printRaw(payload);

    res.json({ ok: true });
  } catch (e) {
    console.error("Print error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ====== START ======
app.listen(API_PORT, () => {
  console.log(`API listening: http://localhost:${API_PORT}`);
  console.log(`Printer target: ${PRINTER_IP}:${PRINTER_PORT}`);
});
