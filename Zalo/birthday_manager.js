const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "birthday_config.json");
const CACHE_PATH = path.join(__dirname, "sent_birthday_cache.json");

// Tải cấu hình
function loadConfig() {
  const defaultConfig = {
    api_endpoint: "https://giatsayquynhon.vn/the/api.php",
    admin_pin: "6868",
    discount_percent: 50,
    check_hour: 8,
    check_minute: 30,
    auto_send_enabled: true
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      return { ...defaultConfig, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error("[BDAY] Lỗi đọc birthday_config.json:", err.message);
  }
  return defaultConfig;
}

// Quản lý bộ đệm chống gửi trùng (Cache theo phone + year)
function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[BDAY] Lỗi đọc sent_birthday_cache.json:", err.message);
  }
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
  } catch (err) {
    console.error("[BDAY] Lỗi lưu sent_birthday_cache.json:", err.message);
  }
}

function isAlreadySent(phone, year) {
  const cache = loadCache();
  const key = `${phone}_${year}`;
  return !!cache[key];
}

function markAsSent(phone, name, year) {
  const cache = loadCache();
  const key = `${phone}_${year}`;
  cache[key] = {
    phone,
    customer_name: name,
    year,
    sent_at: new Date().toISOString()
  };
  saveCache(cache);
}

// Chuẩn hóa tên khách hàng
function cleanCustomerName(name) {
  if (!name) return "";
  let s = String(name).trim();
  s = s.replace(/(\+?84|0)?[0-9]{9,10}/g, "");
  s = s.replace(/[\*\(\)]+/g, " ");
  s = s.replace(/\s+[0-9]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Chuẩn hóa số điện thoại
function normalizePhone(phone) {
  if (!phone) return "";
  let clean = String(phone).trim().replace(/[^0-9]/g, "");
  if (clean.startsWith("84")) {
    clean = "0" + clean.slice(2);
  }
  return clean;
}

// Kiểm tra so khớp ngày sinh nhật với ngày mục tiêu (mặc định hôm nay theo giờ VN)
function isBirthdayMatch(dob, targetDate = new Date()) {
  if (!dob) return false;
  const dStr = String(dob).trim();
  if (!dStr) return false;

  // Lấy ngày và tháng mục tiêu (GMT+7)
  const vnTarget = new Date(targetDate.getTime() + (7 * 60 + targetDate.getTimezoneOffset()) * 60000);
  const targetDay = vnTarget.getDate();
  const targetMonth = vnTarget.getMonth() + 1;

  let dobDay = null;
  let dobMonth = null;

  // Trường hợp: DD/MM hoặc DD/MM/YYYY
  if (dStr.includes("/")) {
    const parts = dStr.split("/");
    if (parts.length >= 2) {
      dobDay = parseInt(parts[0], 10);
      dobMonth = parseInt(parts[1], 10);
    }
  } 
  // Trường hợp: YYYY-MM-DD hoặc DD-MM-YYYY hoặc DD-MM
  else if (dStr.includes("-")) {
    const parts = dStr.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        dobDay = parseInt(parts[2], 10);
        dobMonth = parseInt(parts[1], 10);
      } else {
        // DD-MM-YYYY
        dobDay = parseInt(parts[0], 10);
        dobMonth = parseInt(parts[1], 10);
      }
    } else if (parts.length === 2) {
      dobDay = parseInt(parts[0], 10);
      dobMonth = parseInt(parts[1], 10);
    }
  }

  if (dobDay !== null && dobMonth !== null) {
    return dobDay === targetDay && dobMonth === targetMonth;
  }
  return false;
}

// Lấy danh sách hội viên từ Webapp Thẻ Thành Viên
async function fetchMembersFromWebapp() {
  const config = loadConfig();
  const urlActivated = `${config.api_endpoint}?action=get_members_dashboard&pin=${encodeURIComponent(config.admin_pin)}&filter=activated&limit=2000`;
  const urlAll = `${config.api_endpoint}?action=get_members_dashboard&pin=${encodeURIComponent(config.admin_pin)}&filter=all&limit=2000`;

  let membersMap = new Map();

  // 1. Lấy nhóm activated (ưu tiên cao nhất, luôn có dob)
  try {
    const resAct = await globalThis.fetch(urlActivated);
    if (resAct.ok) {
      const dataAct = await resAct.json();
      if (dataAct.status === "success" && Array.isArray(dataAct.members)) {
        for (const m of dataAct.members) {
          const p = normalizePhone(m.phone);
          if (p) membersMap.set(p, m);
        }
      }
    }
  } catch (err) {
    console.error("[BDAY] Lỗi tải danh sách hội viên activated:", err.message);
  }

  // 2. Lấy thêm nhóm all để bao quát toàn bộ khách hàng
  try {
    const resAll = await globalThis.fetch(urlAll);
    if (resAll.ok) {
      const dataAll = await resAll.json();
      if (dataAll.status === "success" && Array.isArray(dataAll.members)) {
        for (const m of dataAll.members) {
          const p = normalizePhone(m.phone);
          if (p && !membersMap.has(p)) {
            membersMap.set(p, m);
          }
        }
      }
    }
  } catch (err) {
    console.error("[BDAY] Lỗi tải danh sách hội viên all:", err.message);
  }

  return Array.from(membersMap.values());
}

// Lấy danh sách khách hàng có sinh nhật vào ngày chỉ định
async function getBirthdaysToday(targetDate = new Date()) {
  const members = await fetchMembersFromWebapp();
  const vnTarget = new Date(targetDate.getTime() + (7 * 60 + targetDate.getTimezoneOffset()) * 60000);
  const currentYear = vnTarget.getFullYear();
  const dayStr = String(vnTarget.getDate()).padStart(2, "0");
  const monthStr = String(vnTarget.getMonth() + 1).padStart(2, "0");
  const dateFormatted = `${dayStr}/${monthStr}/${currentYear}`;

  const birthdayMembers = [];

  for (const m of members) {
    if (isBirthdayMatch(m.dob, targetDate)) {
      const phone = normalizePhone(m.phone);
      const isSent = isAlreadySent(phone, currentYear);
      birthdayMembers.push({
        phone,
        customer_name: m.customer_name || "Quý khách",
        clean_name: cleanCustomerName(m.customer_name) || "Quý khách",
        dob: m.dob,
        points: m.points || 0,
        tier: m.tier || "member",
        tier_name: m.tier_name || "Thành viên",
        is_sent: isSent
      });
    }
  }

  return {
    target_date: dateFormatted,
    day_month: `${dayStr}/${monthStr}`,
    year: currentYear,
    total_found: birthdayMembers.length,
    members: birthdayMembers
  };
}

// Tạo nội dung tin nhắn Zalo chúc mừng sinh nhật
function buildBirthdayMessage(member, discountPercent = 50, targetDate = new Date()) {
  const vnTarget = new Date(targetDate.getTime() + (7 * 60 + targetDate.getTimezoneOffset()) * 60000);
  const targetYear = vnTarget.getFullYear();
  const targetMonth = vnTarget.getMonth() + 1;
  const monthStr = String(targetMonth).padStart(2, "0");
  
  // Tính ngày cuối cùng của tháng sinh nhật (ví dụ tháng 10 -> ngày 31, tháng 2 -> 28 hoặc 29)
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endOfMonthFormatted = `${lastDay}/${monthStr}/${targetYear}`;

  const cleanName = member.clean_name || cleanCustomerName(member.customer_name) || "QUÝ KHÁCH";
  const upperName = cleanName.toUpperCase();
  const phone = normalizePhone(member.phone);
  const voucherCode = `SINHNHAT50-${phone}`;

  return `🎂 GOLD LAUNDRY KÍNH CHÚC MỪNG SINH NHẬT ${upperName}! 🎉\n\n` +
    `Gold Laundry (282 Diên Hồng) thân gửi tới Quý khách lời chúc tuổi mới luôn ngập tràn niềm vui, nhiều sức khỏe, may mắn và luôn rạng ngời với những bộ trang phục tinh tươm nhất! 🌷\n\n` +
    `🎁 MÓN QUÀ SINH NHẬT ĐẶC QUYỀN DÀNH TẶNG BẠN:\n` +
    `👉 VOUCHER GIẢM ${discountPercent}% ĐƠN HÀNG (DÙNG 1 LẦN DUY NHẤT)!\n` +
    `(Áp dụng giảm ${discountPercent}% cho 01 đơn giặt bất kỳ: giặt sấy, sấy gấp, giặt chăn ga mền khi ghé tiệm hoặc đặt giao nhận)\n\n` +
    `• Mã ưu đãi: ${voucherCode}\n` +
    `• Thời hạn áp dụng: Đến hết ngày ${endOfMonthFormatted} (Trong suốt tháng sinh nhật)\n` +
    `• Điều kiện: Áp dụng 01 lần duy nhất trong tháng sinh nhật\n\n` +
    `Quý khách chỉ cần đọc SĐT hoặc đưa tin nhắn này cho thu ngân khi gửi đồ để được giảm giá ${discountPercent}% trực tiếp trên hóa đơn nhé!\n\n` +
    `Hotline hỗ trợ: 0777 77 97 11\n` +
    `Kính chúc Quý khách một ngày sinh nhật thật ấm áp và ý nghĩa! 💖`;
}

// Gửi tin nhắn chúc mừng sinh nhật cho 1 khách hàng cụ thể
async function sendBirthdayWishDirect({ member, zaloClient, discountPercent = 50, force = false, targetDate = new Date() }) {
  if (!zaloClient) {
    throw new Error("Zalo Gateway chưa sẵn sàng kết nối.");
  }

  const phone = normalizePhone(member.phone);
  if (!phone || phone.length < 9) {
    throw new Error(`Số điện thoại không hợp lệ: ${member.phone}`);
  }

  const vnTarget = new Date(targetDate.getTime() + (7 * 60 + targetDate.getTimezoneOffset()) * 60000);
  const currentYear = vnTarget.getFullYear();

  if (!force && isAlreadySent(phone, currentYear)) {
    return { ok: true, skipped: true, reason: `Đã gửi chúc mừng sinh nhật cho ${phone} trong năm ${currentYear}.` };
  }

  console.log(`[BDAY] Đang tìm kiếm Zalo của khách sinh nhật: ${phone} (${member.customer_name})`);
  const userResult = await zaloClient.findUser(phone);
  if (!userResult || (!userResult.uid && !userResult.userId)) {
    throw new Error(`Không tìm thấy Zalo cho số điện thoại ${phone}`);
  }

  const targetUid = userResult.uid || userResult.userId;
  const targetName = userResult.display_name || userResult.displayName || member.customer_name || phone;
  const messageText = buildBirthdayMessage(member, discountPercent, targetDate);

  console.log(`[BDAY] Đang gửi tin nhắn Zalo chúc mừng sinh nhật tới ${targetName} (${phone})...`);
  try {
    await zaloClient.sendMessage({ msg: messageText }, targetUid);
    console.log(`[BDAY] ✓ Gửi thành công tin nhắn Zalo sinh nhật tới ${targetName} (${phone})!`);
  } catch (sendErr) {
    console.warn(`[BDAY] Gửi tin trực tiếp lỗi (${sendErr.message}), thử gửi lời mời kết bạn...`);
    try {
      await zaloClient.sendFriendRequest(messageText.slice(0, 150), targetUid);
      console.log(`[BDAY] ✓ Đã gửi lời mời kết bạn chúc mừng sinh nhật tới ${targetName} (${phone})`);
    } catch (frErr) {
      throw new Error(`Lỗi gửi tin Zalo: ${sendErr.message}`);
    }
  }

  markAsSent(phone, member.customer_name, currentYear);
  return { ok: true, uid: targetUid, name: targetName, phone };
}

// Chạy tiến trình quét và gửi tự động hàng ngày
async function runDailyBirthdayCheck({ zaloClient, enqueueTask, sendTelegramMessage }) {
  const config = loadConfig();
  if (!config.auto_send_enabled) {
    console.log("[BDAY-AUTO] Tự động gửi sinh nhật đang tạm tắt trong cấu hình.");
    return { ok: true, message: "Disabled" };
  }

  if (!zaloClient) {
    console.warn("[BDAY-AUTO] Zalo Gateway chưa sẵn sàng, sẽ thử lại sau.");
    return { ok: false, message: "Zalo not ready" };
  }

  console.log("[BDAY-AUTO] Bắt đầu quét danh sách khách sinh nhật hôm nay từ webapp...");
  let birthdayData = null;
  try {
    birthdayData = await getBirthdaysToday();
  } catch (err) {
    console.error("[BDAY-AUTO] Lỗi quét danh sách sinh nhật:", err.message);
    return { ok: false, error: err.message };
  }

  const { target_date, day_month, year, total_found, members } = birthdayData;
  console.log(`[BDAY-AUTO] Tìm thấy ${total_found} khách hàng có sinh nhật hôm nay (${day_month}).`);

  if (total_found === 0) {
    return { ok: true, total_found: 0, sent_count: 0 };
  }

  const pendingMembers = members.filter(m => !m.is_sent);
  if (pendingMembers.length === 0) {
    console.log("[BDAY-AUTO] Tất cả khách sinh nhật hôm nay đều đã được gửi tin trước đó.");
    return { ok: true, total_found, sent_count: 0, message: "All already sent" };
  }

  console.log(`[BDAY-AUTO] Có ${pendingMembers.length} khách chưa gửi tin. Đưa vào hàng đợi Rate-Limiting...`);

  const results = [];
  for (const m of pendingMembers) {
    try {
      const res = await enqueueTask(() =>
        sendBirthdayWishDirect({
          member: m,
          zaloClient,
          discountPercent: config.discount_percent || 50,
          force: false
        })
      );
      results.push({ phone: m.phone, name: m.customer_name, success: true, res });
    } catch (err) {
      console.error(`[BDAY-AUTO] Gửi thất bại cho ${m.phone}:`, err.message);
      results.push({ phone: m.phone, name: m.customer_name, success: false, error: err.message });
    }
  }

  // Báo cáo tóm tắt về Telegram Bot quản lý tiệm
  if (sendTelegramMessage && results.length > 0) {
    const successCount = results.filter(r => r.success).length;
    let teleMsg = `🎂 [SINH NHẬT HÔM NAY - ${day_month}]:\n`;
    teleMsg += `Đã tự động gửi Zalo chúc mừng kèm Voucher 50% tới ${successCount}/${results.length} khách hàng:\n\n`;

    results.forEach((r, idx) => {
      const icon = r.success ? "✅" : "❌";
      teleMsg += `${idx + 1}. ${icon} ${r.name} (${r.phone})${r.success ? "" : ` - Lỗi: ${r.error}`}\n`;
    });

    teleMsg += `\n🎁 Voucher giảm giá 50% áp dụng duy nhất hôm nay (${target_date}).`;
    try {
      await sendTelegramMessage(teleMsg);
    } catch (teleErr) {
      console.error("[BDAY-AUTO] Lỗi gửi báo cáo Telegram:", teleErr.message);
    }
  }

  return {
    ok: true,
    total_found,
    sent_count: results.filter(r => r.success).length,
    results
  };
}

module.exports = {
  loadConfig,
  loadCache,
  isBirthdayMatch,
  fetchMembersFromWebapp,
  getBirthdaysToday,
  buildBirthdayMessage,
  sendBirthdayWishDirect,
  runDailyBirthdayCheck
};
