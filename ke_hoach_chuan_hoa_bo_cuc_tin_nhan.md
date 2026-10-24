# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Tối Ưu Bố Cục & Ngắt Dòng Thẩm Mỹ Cho Tin Nhắn Thẻ VIP Zalo

---

### 1. Phân tích nguyên nhân bố cục bị lộn xộn

* Màn hình điện thoại Zalo có độ rộng khung chat hẹp (trung bình chỉ chứa khoảng **30 - 38 ký tự trên 1 dòng**).
* Khi các câu quá dài (ví dụ câu dài 80-90 ký tự), Zalo sẽ tự động bẻ gãy từ xuống dòng tự do (auto-wrap), dẫn đến hiện tượng:
  * Từ ngữ bị ngắt lưng chừng, rớt chữ đơn lẻ xuống dòng dưới.
  * Đường link bị đẩy rớt một nửa đuôi xuống dòng mới nhìn rất xấu.
  * Thiếu các khoảng trống (dòng trắng) tạo cảm giác dày đặc chữ, khó đọc.

---

### 2. Các phương án bố cục đề xuất (Đã canh chuẩn độ rộng Zalo Mobile)

#### 🌟 MẪU 1: Căn dòng hiện đại, thanh lịch (Khuyên dùng nhất)
Ngắt nhịp câu tự nhiên, đường link đứng riêng 1 dòng độc lập cực kỳ nổi bật:

```text
✨ GIẶT SẤY GOLD LAUNDRY ✨
Kính chào Quý khách [TÊN KHÁCH]!

Cảm ơn Quý khách đã tin tưởng gửi đồ tại cửa hàng hôm nay.

Cửa hàng thân gửi tặng Quý khách THẺ THÀNH VIÊN VIP ĐIỆN TỬ để tích điểm và theo dõi tiến độ giặt sấy.

👉 Đăng ký & mở Thẻ VIP tại:
giatsayquynhon.vn/the

📞 Hotline hỗ trợ: 0777779711
Kính chúc Quý khách một ngày tốt lành! 🌸
```

---

#### 📋 MẪU 2: Dạng danh sách tiện ích (Rõ ràng, chuyên nghiệp)
Liệt kê lợi ích của Thẻ VIP bằng dấu gạch đầu dòng, khách nhìn vào thấy ngay giá trị:

```text
🧺 GOLD LAUNDRY KÍNH CHÀO [TÊN KHÁCH]!

Cảm ơn Quý khách đã ghé cửa hàng hôm nay. Chúng tôi thân gửi tặng Quý khách Thẻ VIP điện tử:
• Theo dõi tiến độ giặt sấy trực tiếp
• Tự động tích điểm đổi quà & ưu đãi

👉 Nhấn vào đây để mở Thẻ VIP:
giatsayquynhon.vn/the

Hotline: 0777779711
Chúc Quý khách một ngày nhiều niềm vui!
```

---

#### ⚡ MẪU 3: Tối giản, siêu ngắn gọn (Dễ đọc nhất)
Lược bớt từ ngữ rườm rà, tập trung vào hành động mở thẻ:

```text
✨ GOLD LAUNDRY XIN CHÀO [TÊN KHÁCH]!

Cảm ơn Quý khách đã gửi đồ tại cửa hàng. Thân gửi Quý khách Thẻ VIP điện tử để tích điểm và nhận ưu đãi:

👉 Mở Thẻ VIP: giatsayquynhon.vn/the
Hotline hỗ trợ: 0777779711

Kính chúc Quý khách một ngày thật vui vẻ! ❤️
```

---

### 3. Chi tiết các bước thực hiện

1. **Bước 1**: Cập nhật mẫu tin nhắn đã chọn vào `C:\Users\Admin\Shop_App\server.js` và `C:\Users\Admin\Shop_App\Zalo\zalo_server.js`.
2. **Bước 2**: Tái khởi động PM2 để áp dụng thay đổi.
3. **Bước 3**: Xóa cache gửi thử nghiệm và bắn 1 tin test trực tiếp tới số `0968841577` để bạn xem thực tế trên điện thoại.
4. **Bước 4**: Tự động Commit & Push cập nhật lên GitHub theo Quy tắc bắt buộc.
