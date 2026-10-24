# KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN - CẬP NHẬT)
## Chuẩn Hóa Tên Khách Hàng, Hotline & Nội Dung Tin Nhắn Thẻ VIP Zalo

---

### 1. Mục tiêu & Phạm vi yêu cầu (Đã tiếp thu đầy đủ góp ý)

1. **Làm sạch Tên khách hàng**: Tự động loại bỏ số điện thoại đính kèm phía sau và các ký hiệu dấu sao `*` hoặc số lần giặt ở đuôi tên do nhân viên nhập trên AppSheet.
   * *Ví dụ thực tế*:
     * `"Thảo 0968841577 1"` ➔ Chuyển thành: **`"Thảo"`**
     * `"Kim Bình 0392782619*"` ➔ Chuyển thành: **`"Kim Bình"`**
     * `"Anh Tuấn 0374705746* 2"` ➔ Chuyển thành: **`"Anh Tuấn"`**
     * Nếu tên chỉ toàn số hoặc rỗng ➔ Fallback thành: **`"QUÝ KHÁCH"`**
2. **Chuẩn hóa văn phong**: Thay thế toàn bộ từ **"tiệm"** thành **"cửa hàng"**.
3. **Số điện thoại Hotline**: Viết liền hoàn toàn, không có khoảng cách: **`0777779711`** (thay vì `0777 77 97 11`).
4. **Rút gọn link đăng ký Thẻ VIP**: Rút gọn bỏ tiền tố `https://` thành:
   `giatsayquynhon.vn/the/?phone=[SĐT]`  
   *(Trên Zalo điện thoại, link này vẫn tự động nhận diện màu xanh và khách hàng bấm vào mở thẻ 100% bình thường, tin nhắn nhìn ngắn gọn và tinh tế hơn rất nhiều).*
* **Phạm vi áp dụng**:
  * `C:\Users\Admin\Shop_App\server.js`: Luồng gửi Thẻ VIP tự động khi in phiếu giặt (`POST /goldlaundry/print-request`).
  * `C:\Users\Admin\Shop_App\Zalo\zalo_server.js`: Luồng gửi Thẻ VIP từ API Zalo Gateway (`POST /api/send-zalo`).

---

### 2. Mẫu tin nhắn chuẩn hóa hoàn chỉnh (Preview)

Khách hàng nhận trên Zalo sẽ có định dạng chính xác như sau:

> ✨ **GIẶT SẤY GOLD LAUNDRY KÍNH CHÀO [TÊN KHÁCH]!** ✨
> 
> Cảm ơn Quý khách đã tin tưởng gửi đồ tại **cửa hàng** hôm nay!
> 
> **Cửa hàng** thân gửi tặng Quý khách **THẺ THÀNH VIÊN VIP ĐIỆN TỬ** để tích điểm và theo dõi trạng thái đơn giặt.
> 
> 👉 **Nhấn vào đây để đăng ký thẻ thành viên:**
> `giatsayquynhon.vn/the/?phone=[SĐT]`
> 
> Hotline hỗ trợ: **0777779711**. Kính chúc Quý khách một ngày tốt lành!

---

### 3. Chi tiết các bước thực hiện

#### Bước 1: Xây dựng hàm làm sạch tên chuyên dụng `cleanCustomerName(name)`
Thêm hàm xử lý vào cả `server.js` và `zalo_server.js`:
```javascript
function cleanCustomerName(name) {
  if (!name) return "";
  let s = String(name).trim();
  // 1. Loại bỏ số điện thoại (chuỗi từ 9 - 11 chữ số liên tục)
  s = s.replace(/(\+?84|0)?[0-9]{9,10}/g, "");
  // 2. Loại bỏ dấu sao (*) và các ký tự đặc biệt ở cuối
  s = s.replace(/[\*\(\)]+/g, " ");
  s = s.replace(/\s+[0-9]+$/g, ""); // Xóa số đếm lần giặt ở đuôi tên
  // 3. Chuẩn hóa khoảng trắng
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
```

#### Bước 2: Cập nhật mẫu tin nhắn trong `server.js` và `zalo_server.js`
```javascript
const cleanName = cleanCustomerName(customerName);
const greeting = cleanName ? `KÍNH CHÀO ${cleanName.toUpperCase()}!` : "KÍNH CHÀO QUÝ KHÁCH!";
const shortCardUrl = `giatsayquynhon.vn/the/?phone=${cleanPhone}`;

const cardCaption = 
  `✨ GIẶT SẤY GOLD LAUNDRY ${greeting} ✨\n` +
  `Cảm ơn Quý khách đã tin tưởng gửi đồ tại cửa hàng hôm nay!\n` +
  `Cửa hàng thân gửi tặng Quý khách THẺ THÀNH VIÊN VIP ĐIỆN TỬ để tích điểm và theo dõi trạng thái đơn giặt.\n` +
  `👉 Nhấn vào đây để đăng ký thẻ thành viên: ${shortCardUrl}\n` +
  `Hotline hỗ trợ: 0777779711. Kính chúc Quý khách một ngày tốt lành!`;
```

#### Bước 3: Tái khởi động PM2 và Tự động Git Commit & Push lên GitHub
1. Tái khởi động tiến trình: `pm2 restart all`.
2. Tự động đồng bộ lên GitHub theo Quy tắc bắt buộc:
   * `git add .`
   * `git commit -m "feat: Chuan hoa ten khach, doi xunh ho cua hang, hotline lien so va rut gon link the VIP"`
   * `git push`

---

### 4. Cơ chế an toàn & Khả năng tương thích

| Tiêu chí | Giải pháp đảm bảo |
| :--- | :--- |
| **Bảo toàn dữ liệu in ấn** | Phiếu in vật lý tại quầy vẫn giữ nguyên thông tin thô do nhân viên nhập để thợ xem ghi chú. Chỉ lọc tên khi gửi lời chào Zalo. |
| **Tương thích link trên Zalo** | Dạng link rút gọn `giatsayquynhon.vn/the/?phone=...` vẫn được Zalo tự động nhận diện là liên kết web (hyperlink), khách chỉ cần chạm vào là mở thẻ. |
| **Không ảnh hưởng AppSheet** | Toàn bộ xử lý nằm trong máy chủ Node.js cục bộ, không thay đổi công thức hay webhook trên AppSheet. |

---

### 5. Kế hoạch kiểm thử & Nghiệm thu (Test Plan)

1. **Kiểm thử lọc tên**: Chạy test với dữ liệu thô: `"Thảo 0968841577 1"` ➔ Kết quả: `"THẢO"`.
2. **Kiểm thử gửi tin nhắn Zalo thực tế**:
   * Mô phỏng in phiếu giặt với:
     `{ customer: "Kim Bình 0392782619* 2", phone: "0374705746" }`
   * *Kỳ vọng nhận trên Zalo*:
     * Tiêu đề: `✨ GIẶT SẤY GOLD LAUNDRY KÍNH CHÀO KIM BÌNH! ✨`
     * Chữ "cửa hàng" xuất hiện đúng vị trí.
     * Link rút gọn: `giatsayquynhon.vn/the/?phone=0374705746`.
     * Hotline viết liền: `0777779711`.
3. **Kiểm tra tự động đẩy GitHub**: Xác nhận mã nguồn tự động cập nhật lên repo `gi-t-l-`.
