# Dịch vụ khuôn mặt

## Seeder đăng ký khuôn mặt giả (`facker.js`)

Tập lệnh Seeder điền vào bảng SQL Server `[dbo].[Customers]` với các phần nhúng khuôn mặt thật và các hình ảnh đại diện được ghép nối để thực thi các API `/register` và `/checkin` trong `main.js`.

### Điều kiện tiên quyết

- Các mô hình Face API có sẵn trong thư mục `models/` cục bộ (đã được đóng gói).
- SQL Server được cấu hình thông qua `dbConfig.js` (mặc định là cơ sở dữ liệu `deepface`, bảng `Customers(name NVARCHAR, descriptor NVARCHAR(MAX))`).
- Truy cập Internet để lấy ảnh chân dung từ `https://randomuser.me/`.
- Thời gian chạy Node.js có khả năng chạy các phần phụ thuộc của dự án trong `package.json`.

### Cách sử dụng

``` bash
node facker.js [totalCustomers] [--reset]
```

| Lập luận | Mô tả |
| --- | --- |
| `tổng số khách hàng` | Số lượng khách hàng tổng hợp tùy chọn để tạo. Mặc định là `100`. |
| `--đặt lại` | Cờ tùy chọn. Khi hiện diện, hãy xóa các thư mục hình đại diện hiện có (`avatart/`) và xóa tất cả các hàng khỏi `[dbo].[Customers]` trước khi gieo hạt. |

### Đầu ra

- **Cơ sở dữ liệu**: Đối với mỗi danh tính được tạo, hãy chèn (hoặc thay thế) một hàng trong `[dbo].[Customers]` lưu trữ mảng mô tả tổng hợp `name` và mã hóa JSON được trình so khớp khuôn mặt `/checkin` sử dụng.
- **Tệp hình đại diện**:  
  - Bản tải xuống gốc được lưu dưới `avatart/downloaded/customer_<index>_download.jpg`.  
  - Đã cắt, các biến thể 256×256 sẵn sàng tải lên được lưu trong `avatart/upload/customer_<index>_upload.jpg`.

### Tổng quan về quy trình

1. Tìm nạp một bức chân dung ngẫu nhiên thông qua `randomuser.me`.
2. Phát hiện khuôn mặt và tính toán bộ mô tả khuôn mặt đó bằng cách sử dụng cùng mô hình `face-api.js` như API trực tiếp.
3. Lưu cả ảnh đại diện thô và ảnh đại diện đã cắt.
4. Cập nhật bộ mô tả vào SQL Server (xóa mọi hàng hiện có có cùng tên được tạo).
5. Thử lại tối đa năm lần cho mỗi bản ghi nếu không phát hiện thấy khuôn mặt nào; hủy bỏ sau 10 lần thất bại liên tiếp.

Tiến trình được ghi lại sau mỗi ~10% số lần hoàn thành cùng với tên khách hàng mới nhất. Tổng thời gian thực hiện được in khi hoàn thành.

Chạy seeder trước khi kiểm tra API `/checkin` để đảm bảo các khuôn mặt phù hợp tồn tại trong cơ sở dữ liệu và thư mục hình đại diện.