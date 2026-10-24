# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Bổ Sung Icon Sinh Động & Tinh Tế Cho Tin Nhắn Thẻ Thành Viên Zalo

---

### 1. Mục tiêu điều chỉnh

* Giữ nguyên các yêu cầu đã chốt:
  * Không dùng dấu sao `✨` ở tiêu đề.
  * Không dùng icon điện thoại `📞` ở hotline (chữ trơn: `Hotline: 0777779711`).
  * Câu cảm ơn chuẩn: `Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.`
* Bổ sung các icon sinh động, ấm áp, đúng tính chất dịch vụ giặt ủi chăm sóc khách hàng:
  * Icon giỏ đồ giặt sạch thơm: **`🧺`**
  * Icon vẫy tay chào thân thiện: **`👋`**
  * Icon hộp quà tặng thẻ / thẻ điện tử: **`🎁`** hoặc **`💳`**
  * Icon hoa chúc tốt lành: **`🌸`**

---

### 2. Các phương án phối icon đề xuất

#### 🌟 LỰA CHỌN A: Thân thiện, ấm áp (Khuyên dùng nhất)
```text
🧺 GIẶT SẤY GOLD LAUNDRY
Kính chào Quý khách [TÊN KHÁCH] 👋

Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.
Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn: 🎁

👉 Mở Thẻ Thành Viên tại:
giatsayquynhon.vn/the

Hotline: 0777779711
Chúc Quý khách một ngày thật nhiều niềm vui! 🌸
```

---

#### 💳 LỰA CHỌN B: Sang trọng, chuẩn phong cách thành viên
```text
🧺 GIẶT SẤY GOLD LAUNDRY
Kính chào Quý khách [TÊN KHÁCH]

Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.
Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn giặt: 💳

👉 Mở Thẻ Thành Viên tại:
giatsayquynhon.vn/the

Hotline: 0777779711
Kính chúc Quý khách một ngày tốt lành! 🌷
```

---

### 3. Chi tiết các bước thực hiện

1. **Bước 1**: Cập nhật mẫu tin nhắn đã chọn vào `server.js` và `Zalo/zalo_server.js`.
2. **Bước 2**: Tái khởi động PM2 Service.
3. **Bước 3**: Xóa cache và gửi tin nhắn kiểm thử trực tiếp tới số `0968841577` để bạn xem thực tế trên điện thoại.
4. **Bước 4**: Tự động Commit & Push lên GitHub `gi-t-l-`.
