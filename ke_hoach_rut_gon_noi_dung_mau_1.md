# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Rút Gọn Nội Dung Mẫu 1 - Cô Đọng & Tinh Tế Cho Màn Hình Zalo Mobile

---

### 1. Mục tiêu điều chỉnh

* Giữ nguyên phong cách ngắt dòng thanh lịch của **Mẫu 1**.
* Cắt gọt các từ ngữ dài dòng, lược bớt các câu văn lặp lại để tin nhắn **ngắn hơn khoảng 40%**, khách nhìn vào là đọc được ngay trong 3 giây.
* Đường link `giatsayquynhon.vn/the` và số hotline `0777779711` vẫn giữ vị trí trọng tâm, dễ bấm.

---

### 2. Các phương án rút gọn đề xuất

#### 🌟 LỰA CHỌN 1.1: Rút gọn cân đối (Đầy đủ lễ phép & Siêu thoáng) — *Khuyên dùng*
Gộp lời cảm ơn và tặng thẻ thành một đoạn cô đọng:

```text
✨ GIẶT SẤY GOLD LAUNDRY ✨
Kính chào Quý khách [TÊN KHÁCH]!

Cảm ơn Quý khách đã gửi đồ hôm nay. Cửa hàng thân gửi tặng Quý khách THẺ VIP để tích điểm & theo dõi đơn giặt:

👉 Mở Thẻ VIP tại:
giatsayquynhon.vn/the

📞 Hotline: 0777779711
Chúc Quý khách một ngày tốt lành! 🌸
```

---

#### ⚡ LỰA CHỌN 1.2: Siêu ngắn gọn (Tối giản tối đa)
Chỉ giữ lại lời chào, mục đích tặng thẻ và đường link:

```text
✨ GIẶT SẤY GOLD LAUNDRY ✨
Kính chào Quý khách [TÊN KHÁCH]!

Cửa hàng thân gửi Thẻ VIP tích điểm & xem tiến độ giặt của Quý khách:

👉 giatsayquynhon.vn/the

Hotline hỗ trợ: 0777779711
Cảm ơn và chúc Quý khách một ngày vui vẻ! 🌸
```

---

### 3. Chi tiết các bước thực hiện

1. **Bước 1**: Cập nhật mẫu tin nhắn đã chọn vào `server.js` và `Zalo/zalo_server.js`.
2. **Bước 2**: Tái khởi động PM2.
3. **Bước 3**: Xóa cache và bắn 1 tin test qua số `0968841577` để bạn kiểm tra độ dài thực tế trên màn hình Zalo.
4. **Bước 4**: Tự động Commit & Push lên GitHub `gi-t-l-`.
