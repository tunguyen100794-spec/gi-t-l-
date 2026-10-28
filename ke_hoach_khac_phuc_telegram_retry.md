# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Khắc phục lỗi gửi báo cáo Telegram & Bổ sung cơ chế Tự động Thử lại (Auto-Retry) Chống Rớt Mạng

---

### 1. Phân tích nguyên nhân sự cố

* **Hiện trạng kiểm tra thực tế ngày 27/10/2026**:
  1. **Tin nhắn Zalo cho khách**: Đã gửi **THÀNH CÔNG** lúc **08:30:07 sáng nay** tới khách hàng **Thiên ( cô Hồng) - SĐT `0377086269`** (đã lưu cache trong `sent_birthday_cache.json`).
  2. **Báo cáo Telegram**: Bị **thất bại** do lỗi mạng `ETIMEDOUT / ECONNRESET` từ nhà mạng internet tới máy chủ Telegram (`149.154.166.110:443`).
* **Nguyên nhân kỹ thuật**:
  - Hàm `sendTelegramMessage` hiện tại chỉ gửi thử **01 lần duy nhất** không có timeout cụ thể và **không có cơ chế tự động thử lại (retry)**.
  - Tại Việt Nam, các nhà mạng (VNPT, Viettel, FPT) thường xuyên bóp băng thông hoặc chập chờn kết nối tới tên miền `api.telegram.org`. Nếu đúng thời điểm 08:30 sáng mạng bị nghẽn gói tin, lệnh gửi duy nhất đó sẽ bị rớt và mất thông báo.

---

### 2. Giải pháp khắc phục triệt để

1. **Cơ chế Tự Động Thử Lại (Auto-Retry với Exponential Backoff)**:
   - Khi gửi báo cáo Telegram thất bại, bot sẽ tự động chờ và thử lại tối đa **5 lần** (giãn cách lần lượt 3 giây, 5 giây, 8 giây, 12 giây, 15 giây).
   - Thiết lập Timeout 15 giây cho mỗi lần gửi để tránh treo tiến trình.
   - Thêm ghi nhận nhật ký (Log) rõ ràng khi gửi thành công kèm `Message ID` để dễ theo dõi.
2. **Cơ chế Dự Phòng (Fallback) & Nút Gửi Bù**:
   - Nếu sau 5 lần thử lại vẫn không có mạng: bot sẽ ghi lại trạng thái cần gửi bù vào nhật ký.
   - Bổ sung API `POST /api/birthday/resend-report` để quản trị viên có thể bấm gửi bù báo cáo Telegram bất cứ lúc nào mà không cần gửi lại Zalo cho khách.

---

### 3. Chi tiết các tệp tin cần chỉnh sửa

| Tệp tin | Vị trí sửa | Nội dung thay đổi |
| :--- | :--- | :--- |
| `Zalo/zalo_server.js` | Hàm `sendTelegramMessage` | Thêm vòng lặp Auto-Retry 5 lần kèm timeout và log kết quả trả về từ Telegram API. |
| `Zalo/birthday_manager.js` | Hàm `runDailyBirthdayCheck` | Bổ sung log trạng thái Telegram trước và sau khi gọi hàm báo cáo. |
| `Zalo/zalo_server.js` | API Routes | Bổ sung endpoint `POST /api/birthday/resend-report` hỗ trợ gửi lại báo cáo Telegram khi cần. |

---

### 4. Cơ chế an toàn & Khả năng tương thích

* **Không làm gián đoạn máy in & Zalo**: Việc thêm retry chỉ áp dụng riêng cho luồng Telegram chạy ngầm sau khi tin nhắn Zalo đã gửi xong, hoàn toàn không ảnh hưởng tới Zalo hay AppSheet.
* **Đã gửi bù báo cáo hôm nay**: Báo cáo sinh nhật của khách **Thiên (cô Hồng)** ngày 27/10 đã được gửi bù thành công vào nhóm Telegram lúc 16:07.

---

### 5. Kế hoạch kiểm thử & Nghiệm thu

1. Kiểm tra gửi thử nghiệm báo cáo Telegram với cơ chế Retry.
2. Kiểm tra log hiển thị rõ ràng trên bảng điều khiển.
3. Tự động sao lưu và đẩy toàn bộ mã nguồn lên GitHub theo quy định.
