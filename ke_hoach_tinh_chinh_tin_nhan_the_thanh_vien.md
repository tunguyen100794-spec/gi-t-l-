# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)
## Tinh Chỉnh Tin Nhắn: Bỏ Dấu "!" Sau Tên Khách, Rút Ngắn Câu & Đổi 100% "Thẻ Thành Viên"

---

### 1. Chi tiết 3 điểm cần tinh chỉnh theo góp ý

1. **Bỏ dấu chấm than `!` sau tên khách**:
   * *Trước đây*: `Kính chào Quý khách THẢO!`
   * *Sửa thành*: **`Kính chào Quý khách THẢO`** (hoặc `Kính chào Quý khách` nếu không có tên).
2. **Rút ngắn câu văn dài**:
   * *Trước đây (quá dài, 115 ký tự)*: `Cảm ơn Quý khách đã gửi đồ hôm nay. Cửa hàng thân gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn giặt:`
   * *Rút ngắn lại cực gọn*:
     `Cảm ơn Quý khách đã gửi đồ hôm nay.`
     `Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn:`
3. **Đổi 100% sang "THẺ THÀNH VIÊN"**:
   * Không còn bất kỳ từ "Thẻ VIP" nào trong tin nhắn.
   * Dòng mở thẻ: **`👉 Mở Thẻ Thành Viên tại:`**

---

### 2. Mẫu tin nhắn hoàn chỉnh sau tinh chỉnh (Preview)

```text
✨ GIẶT SẤY GOLD LAUNDRY ✨
Kính chào Quý khách [TÊN KHÁCH]

Cảm ơn Quý khách đã gửi đồ hôm nay.
Cửa hàng gửi tặng Quý khách THẺ THÀNH VIÊN để tích điểm & theo dõi đơn:

👉 Mở Thẻ Thành Viên tại:
giatsayquynhon.vn/the

📞 Hotline: 0777779711
Chúc Quý khách một ngày tốt lành! 🌸
```

---

### 3. Kế hoạch triển khai & Nghiệm thu

1. **Bước 1**: Cập nhật mẫu tin nhắn vào `server.js` và `Zalo/zalo_server.js`.
2. **Bước 2**: Tái khởi động PM2 Service.
3. **Bước 3**: Xóa cache và bắn 1 tin test trực tiếp tới số `0968841577` để bạn xem thực tế trên điện thoại.
4. **Bước 4**: Tự động Commit & Push lên GitHub `gi-t-l-`.
