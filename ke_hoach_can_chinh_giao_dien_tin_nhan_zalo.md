# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Khắc Phục Triệt Để Lỗi Nhảy Dòng Vô Tội Vạ Trên Giao Diện Tin Nhắn Zalo

---

### 1. Nguyên nhân kỹ thuật chính xác tại sao chữ bị nhảy dòng lộn xộn

Qua phân tích cơ chế hiển thị của ứng dụng Zalo trên điện thoại (Zalo Mobile):
* Hiện tại hệ thống đang gửi ảnh kèm chú thích trong cùng 1 tin nhắn (`{ msg: caption, attachments: [ảnh] }`).
* Khi gửi kèm ảnh, Zalo sẽ **bóp khung chữ lại theo bề ngang của bức ảnh** (chiều rộng chỉ còn khoảng 200 - 240px, thay vì 360px như tin nhắn thường).
* Do bề ngang quá hẹp, các câu dài như *"Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry."* bị Zalo ép bẻ gãy từ vô tội vạ (thành 3-4 dòng lửng lơ), làm giao diện trông rất vụn vặt và mất thẩm mỹ.

---

### 2. Các giải pháp khắc phục triệt để

```mermaid
graph TD
    A["Nguyên nhân: Chữ bị bóp dưới chân ảnh (200px)"] --> B{"Chọn giải pháp"}
    
    B -->|Giải pháp 1 (Khuyên dùng - Đẹp nhất)| C["TÁCH RIÊNG 2 TIN:<br/>1. Gửi Ảnh Thẻ VIP sắc nét<br/>2. Gửi Tin nhắn chữ bong bóng chat chuẩn (Full Width)"]
    B -->|Giải pháp 2| D["GIỮ CHUNG 1 TIN:<br/>Chủ động ngắt dòng cực ngắn (mỗi dòng 4-5 từ) để Zalo không tự bẻ chữ"]
    
    C --> E["Kết quả: Bong bóng chat Zalo to rõ, ngắt dòng chuẩn 100%, link xanh cực kỳ dễ bấm"]
    D --> F["Kết quả: Chữ nằm gọn dưới ảnh, ngắn gọn vừa khít"]
```

---

#### 🌟 GIẢI PHÁP 1: Tách riêng 1 Ảnh Thẻ VIP + 1 Tin Nhắn Chữ (Khuyên dùng - Chuẩn giao diện Zalo nhất)
Hệ thống sẽ gửi liền 2 tin:
1. **Tin 1**: Bức ảnh Thẻ VIP điện tử sang trọng.
2. **Tin 2**: Tin nhắn chữ hiển thị trong bong bóng chat Zalo tiêu chuẩn (độ rộng tối đa, font chữ to rõ, canh lề hoàn hảo):

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

#### 📐 GIẢI PHÁP 2: Chủ động ngắt dòng siêu ngắn (Nếu vẫn muốn giữ chung 1 ảnh)
Chủ động chèn `\n` sau mỗi 3-5 từ để chữ không bao giờ bị Zalo tự động bẻ ngang:

```text
🧺 GIẶT SẤY GOLD LAUNDRY
Kính chào Quý khách [TÊN KHÁCH]

Cảm ơn Quý khách đã sử dụng
dịch vụ giặt sấy Gold Laundry.

Cửa hàng gửi tặng Quý khách
THẺ THÀNH VIÊN tích điểm: 💳

👉 Mở Thẻ Thành Viên tại:
giatsayquynhon.vn/the

Hotline: 0777779711
Kính chúc Quý khách tốt lành! 🌷
```

---

### 3. Chi tiết các bước thực hiện

1. **Bước 1**: Cập nhật logic gửi trong [server.js](file:///C:/Users/Admin/Shop_App/server.js) và [zalo_server.js](file:///C:/Users/Admin/Shop_App/Zalo/zalo_server.js):
   * Nếu chọn Giải pháp 1: Gửi 1 tin ảnh trước, ngay sau đó gửi 1 tin text riêng biệt.
   * Nếu chọn Giải pháp 2: Căn dòng siêu ngắn cho caption.
2. **Bước 2**: Tái khởi động PM2 Service.
3. **Bước 3**: Xóa cache và bắn ngay 1 tin test trực tiếp qua số `0968841577` để bạn cầm điện thoại kiểm tra thực tế.
4. **Bước 4**: Tự động Commit & Push lên GitHub `gi-t-l-`.
