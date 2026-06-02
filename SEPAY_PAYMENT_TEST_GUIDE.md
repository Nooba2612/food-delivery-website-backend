# Hướng dẫn chạy và test thanh toán VietQR/SePay

Tài liệu này dùng để chạy app local và test luồng thanh toán chuyển khoản tạo đơn hàng bằng VietQR và webhook SePay.

## 1. Chuẩn bị cấu hình backend

Mở file:

```text
d:\TL\NamCuoi\KienTrucTKPM\BaoCao\food-delivery-website\food-delivery-website-backend\.env
```

Kiểm tra hoặc bổ sung các biến quan trọng:

```env
PORT=5678
CLIENT_URL=http://localhost:1234

VIETQR_BANK_CODE=MB
VIETQR_ACCOUNT_NO=800019092004
VIETQR_ACCOUNT_NAME=<TEN_CHU_TAI_KHOAN>

SEPAY_WEBHOOK_TOKEN=VISTAHOTEL
SEPAY_WEBHOOK_SECRET=
PENDING_PAYMENT_TTL_MINUTES=10
```

Lưu ý:

- `VIETQR_ACCOUNT_NO` phải trùng với tài khoản ngân hàng mà SePay đang nhận giao dịch.
- Nếu SePay gửi webhook bằng `Authorization: Apikey VISTAHOTEL` thì backend cần `SEPAY_WEBHOOK_TOKEN=VISTAHOTEL`.
- Hiện file `.env` đang để `VIETQR_ACCOUNT_NO=800019092004`.

## 2. Chạy backend

Mở terminal PowerShell riêng:

```powershell
cd "d:\TL\NamCuoi\KienTrucTKPM\BaoCao\food-delivery-website\food-delivery-website-backend"
node_modules\.bin\babel-node.cmd bin\www
```

Không dùng `npm run start` nếu máy bị lỗi `nodemon spawn EPERM`.

Backend chạy thành công khi thấy:

```text
Connection to database has been established successfully.
App listening on port http://0.0.0.0:5678
```

Kiểm tra nhanh:

```powershell
curl http://localhost:5678/status
```

## 3. Chạy frontend

Mở terminal PowerShell riêng:

```powershell
cd "d:\TL\NamCuoi\KienTrucTKPM\BaoCao\food-delivery-website\food-delivery-website-frontend"
$env:BROWSER="none"
npm run start
```

Frontend chạy thành công khi mở được:

```text
http://localhost:1234
```

## 4. Chạy ngrok cho webhook

Nếu máy bị lỗi proxy `127.0.0.1:9`, hãy xóa proxy trước khi chạy ngrok.

Mở terminal PowerShell riêng:

```powershell
$env:HTTP_PROXY=""
$env:HTTPS_PROXY=""
$env:ALL_PROXY=""
$env:http_proxy=""
$env:https_proxy=""
$env:all_proxy=""
ngrok http 5678
```

Lấy URL HTTPS ở dòng `Forwarding`, ví dụ:

```text
https://abc-demo.ngrok-free.dev
```

Webhook URL sẽ là:

```text
https://<ngrok-url>/api/sepay/webhook
```

Ví dụ:

```text
https://abc-demo.ngrok-free.dev/api/sepay/webhook
```

Có thể xem ngrok UI tại:

```text
http://127.0.0.1:4040
```

Sau khi ngrok chạy thành công, làm tiếp theo thứ tự này:

1. Copy URL HTTPS ở dòng `Forwarding`
2. Ghép thành webhook URL:

```text
https://<ngrok-url>/api/sepay/webhook
```

Ví dụ với phiên ngrok hiện tại:

```text
https://explode-circulate-frequent.ngrok-free.dev/api/sepay/webhook
```

3. Vào SePay Dashboard -> `Webhooks`
4. Dán webhook URL vào ô `URL nhận webhook`
5. Chọn:
   - Loại giao dịch: `Tiền vào`
   - Định dạng dữ liệu: `JSON`
   - Bảo mật: `API Key`
   - API Key: `VISTAHOTEL`
6. Lưu cấu hình webhook
7. Giữ cửa sổ `ngrok` đang chạy, không tắt
8. Mở frontend, tạo đơn thanh toán VietQR và chuyển khoản test
9. Nếu muốn xem SePay đã gọi vào máy bạn chưa, mở:

```text
http://127.0.0.1:4040
```

## 5. Cấu hình webhook trên SePay

Vào SePay Dashboard -> `Webhooks` -> sửa hoặc tạo webhook.

Tab **Cơ bản**:

- Kích hoạt webhook: `Bật`
- URL nhận webhook: `https://<ngrok-url>/api/sepay/webhook`
- Loại giao dịch: `Tiền vào`
- Định dạng dữ liệu: `JSON`
- Tự động gửi lại khi server trả lỗi: nên bật khi test

Tab **Tài khoản**:

- Khi test nhanh, chọn `Tất cả tài khoản`
- Nếu chọn tùy chỉnh, phải đảm bảo webhook áp dụng cho tài khoản `800019092004`
- Nếu giao dịch trong SePay có cột `Tài khoản ảo` là `-` thì không nên lọc theo VA

Tab **Bảo mật**:

- Phương thức xác thực: `API Key`
- API Key: `VISTAHOTEL`

Backend chấp nhận header:

```http
Authorization: Apikey VISTAHOTEL
```

## 6. Test thanh toán

1. Mở frontend `http://localhost:1234`
2. Đăng nhập user
3. Thêm món vào giỏ hàng
4. Checkout
5. Chọn phương thức `Chuyển khoản qua VietQR`
6. Bấm đặt hàng để tạo QR
7. Kiểm tra QR modal:
   - Số tài khoản phải là `800019092004`
   - Nội dung phải có mã dạng `PAY...`
8. Chuyển khoản đúng số tiền và đúng nội dung `PAY...`

Khi webhook thành công:

- Terminal backend sẽ in:

```text
[SePay webhook] received
POST /api/sepay/webhook 200
```

- Frontend polling `/api/payments/:id/status` sẽ nhận `payment_status: paid`
- Modal QR tự động đóng
- App điều hướng sang trang thành công có `orderId`

## 7. Debug nhanh

Nếu modal không đóng:

1. Kiểm tra backend còn chạy không:

```powershell
curl http://localhost:5678/status
```

2. Kiểm tra ngrok còn chạy không:

```text
http://127.0.0.1:4040
```

3. Kiểm tra terminal backend có dòng này không:

```text
[SePay webhook] received
```

Nếu không có dòng trên, SePay chưa gửi webhook vào backend.

4. Vào SePay -> `Webhooks` -> `Lịch sử gửi`:

- Không có lịch sử: filter webhook hoặc tài khoản đang sai, hoặc cần tạo giao dịch mới sau khi cập nhật webhook
- Lỗi `401`: API Key không khớp `VISTAHOTEL`
- Lỗi `400`: payload không có mã `PAY...` hoặc số tiền không đủ
- Lỗi `500`: xem terminal backend để lấy stack trace

5. Kiểm tra payment mới nhất trong DB nếu cần:

```powershell
cd "d:\TL\NamCuoi\KienTrucTKPM\BaoCao\food-delivery-website\food-delivery-website-backend"
node -e "require('dotenv').config(); require('@babel/register')({extensions:['.js']}); const {pendingPaymentModel}=require('./src/models'); pendingPaymentModel.findAll({order:[['createdAt','DESC']],limit:5}).then(rows=>{console.log(JSON.stringify(rows.map(r=>({payment_id:r.payment_id,payment_code:r.payment_code,payment_status:r.payment_status,total_amount:Number(r.total_amount),account_no:r.account_no,order_id:r.order_id,createdAt:r.createdAt})),null,2)); process.exit(0);}).catch(e=>{console.error(e); process.exit(1);})"
```

## 8. Lưu ý

- Mỗi lần ngrok restart, URL HTTPS có thể đổi. Nếu đổi URL, phải cập nhật lại webhook trên SePay.
- Giao dịch cũ thường không tự gửi lại webhook sau khi sửa cấu hình. Hãy tạo đơn mới và chuyển khoản mới.
- Mã thanh toán hết hạn sau `PENDING_PAYMENT_TTL_MINUTES`, mặc định là 10 phút.
- Nội dung chuyển khoản bắt buộc phải có mã `PAY...` để backend match đúng payment session.
