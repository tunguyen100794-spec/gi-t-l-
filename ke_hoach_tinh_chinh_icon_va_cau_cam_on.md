# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Tinh Chỉnh Tin Nhắn: Bỏ Dấu Sao, Bỏ Icon Điện Thoại & Cập Nhật Câu Cảm Ơn

---

### 1. Mục tiêu & Phạm vi yêu cầu

* **Mục tiêu**:
  1. **Bỏ dấu sao (`✨`)**: Bỏ toàn bộ các biểu tượng ngôi sao ở tiêu đề `GIẶT SẤY GOLD LAUNDRY` để tin nhắn nhìn nhã nhặn, chuẩn phong cách doanh nghiệp.
  2. **Bỏ icon điện thoại (`📞`)**: Dòng hotline chuyển thành dạng văn bản trơn: `Hotline: 0777779711`.
  3. **Cập nhật câu cảm ơn**: Đổi thành câu đầy đủ và trang trọng:  
     **`Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.`**
* **Phạm vi áp dụng**:
  * `C:\Users\Admin\Shop_App\server.js`: Luồng in phiếu yêu cầu gửi Zalo tự động.
  * `C:\Users\Admin\Shop_App\Zalo\zalo_server.js`: Luồng API gửi Thẻ Thành Viên.

---

### 2. Mẫu tin nhắn mới sau tinh chỉnh (Preview)

Khách hàng nhận trên Zalo sẽ có diện mạo chỉn chu như sau:

```text
GIẶT SẤY GOLD LAUNDRY
Kính chào Quý khách [TÊN KHÁCH]

Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.
Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn:

👉 Mở Thẻ Thành Viên tại:
giatsayquynhon.vn/the

Hotline: 0777779711
Chúc Quý khách một ngày tốt lành!
```

---

### 3. Chi tiết các bước thực hiện

#### Bước 1: Cập nhật mẫu tin nhắn trong `server.js` và `zalo_server.js`
```javascript
const greetingLine = cleanName ? `Kính chào Quý khách ${cleanName.toUpperCase()}` : "Kính chào Quý khách";

const cardCaption = 
  `GIẶT SẤY GOLD LAUNDRY\n` +
  `${greetingLine}\n\n` +
  `Cảm ơn Quý khách đã sử dụng dịch vụ giặt sấy Gold Laundry.\n` +
  `Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn:\n\n` +
  `👉 Mở Thẻ Thành Viên tại:\n` +
  `${shortCardUrl}\n\n` +
  `Hotline: 0777779711\n` +
  `Chúc Quý khách một ngày tốt lành!`;
```

#### Bước 2: Tái khởi động dịch vụ PM2
* Chạy lệnh nạp lại tiến trình: `Restart-Service pm2.exe`.

#### Bước 3: Gửi tin nhắn kiểm thử (Test)
* Xóa cache thử nghiệm cho số `0968841577` và gửi 1 tin test để bạn kiểm tra trực tiếp trên điện thoại.

#### Bước 4: Tự động Commit & Push lên GitHub
* Đồng bộ mã nguồn lên kho https://github.com/tunguyen100794-spec/gi-t-l- theo đúng Quy tắc bắt buộc số 4.

---

### 4. Cơ chế an toàn & Khả năng tương thích

| Tiêu chí | Giải pháp đảm bảo |
| :--- | :--- |
| **Không ảnh hưởng in ấn** | Chỉ thay đổi phần văn bản gửi qua Zalo, phiếu in nhiệt ESC/POS tại quầy hoàn toàn không bị ảnh hưởng. |
| **Tự động hóa hoàn toàn** | Toàn bộ quá trình từ nạp code, restart service đến đẩy GitHub diễn ra tự động 100%. |

---

### 5. Kế hoạch kiểm thử & Nghiệm thu

1. Kiểm tra cú pháp bằng `node --check`.
2. Kiểm tra log Zalo gửi thành công tới số `0968841577`.
3. Kiểm tra diện mạo tin nhắn thực tế trên Zalo: Tiêu đề không có dấu sao, hotline không có icon điện thoại, câu cảm ơn chuẩn mẫu mới.
4. Kiểm tra Git log xác nhận commit mới đã đẩy lên GitHub.
