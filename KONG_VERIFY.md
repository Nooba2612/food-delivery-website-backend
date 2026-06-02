# Checklist Kiểm Tra Kong

## Demo Rate Limiter

Chạy trước:

`docker compose up -d --build`

Sau đó chạy lệnh PowerShell sau để demo giới hạn request cho `/api/chat`:

```powershell
1..15 | ForEach-Object {
  try {
    $resp = Invoke-WebRequest `
      -Uri "http://localhost:8000/api/chat" `
      -Method Post `
      -ContentType "application/json" `
      -Body '{"message":"hi","chatHistory":[],"sessionId":"demo-rate-limit-lite"}' `
      -ErrorAction Stop
    $code = [int]$resp.StatusCode
  } catch {
    $code = [int]$_.Exception.Response.StatusCode.value__
  }

  Write-Host "$_ -> $code"
  if ($code -eq 429) { break }
}
```

Kỳ vọng:

- Nếu rate limit đang đặt là `10` request/phút/IP thì khoảng request `11` sẽ bắt đầu ra `429`
- Điều đó chứng minh Kong đã chặn spam từ client trước khi request tiếp tục dồn vào backend

## Demo Retry

Lệnh PowerShell sau sẽ tạm dừng `backend`, gọi `GET /status` qua Kong, in ra mã lỗi và thời gian chờ, rồi bật `backend` lại:

```powershell
docker stop eatsy_backend
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  Invoke-WebRequest -Uri "http://localhost:8000/status" -Method Get -ErrorAction Stop | Out-Null
  $code = 200
} catch {
  $code = [int]$_.Exception.Response.StatusCode.value__
}
$sw.Stop()
Write-Host "HTTP $code"
Write-Host ("Elapsed: {0:N2}s" -f $sw.Elapsed.TotalSeconds)
docker start eatsy_backend
```

Kỳ vọng:

- Kết quả thường là `HTTP 502`, `503`, hoặc `504`
- Dòng `Elapsed` sẽ không phải `0.x` giây mà thường là vài giây
- Điều đó cho thấy Kong không fail ngay, mà có retry khi upstream `backend` tạm thời lỗi hoặc không phản hồi

## Lệnh Hay Dùng

Khởi động toàn bộ stack:

```bash
docker compose up -d --build
```

Khởi động lại riêng `backend` sau khi sửa code hoặc `.env`:

```bash
docker compose up -d --build backend
```

Dừng toàn bộ stack:

```bash
docker compose down
```

Xem container nào đang chạy:

```bash
docker compose ps
```

Xem log realtime của `backend`:

```bash
docker logs -f eatsy_backend
```

Xem log realtime của `kong`:

```bash
docker logs -f eatsy_kong
```

Kiểm tra nhanh backend sống chưa:

```bash
curl http://localhost:5678/status
```

Kiểm tra nhanh qua Kong:

```bash
curl http://localhost:8000/status
```

Reload lại Kong sau khi sửa `kong.yaml`:

```bash
docker compose up -d --force-recreate kong
```

Vào shell trong container `backend`:

```bash
docker exec -it eatsy_backend sh
```

Vào MySQL trong container:

```bash
docker exec -it eatsy_mysql mysql -uroot -prootpassword
```

Seed lại dữ liệu MySQL thủ công:

```bash
npm run seed:mysql
```

Reindex dữ liệu Qdrant:

```bash
npm run reindex:qdrant:dishes
```

## Demo Chịu Tải Server

Chạy lệnh sau để bắn `1000` request vào endpoint `/status` qua Kong:

```bash
npx autocannon -c 100 -a 1000 http://localhost:8000/status
```

Kỳ vọng:

- Hệ thống xử lý hết `1000` request
- Không có lỗi request
- Có thể nhìn nhanh vào `Avg Latency`, `Req/Sec`, và dòng tổng kết cuối

Các chỉ số nên chỉ vào khi demo:

- `1k requests in ...s`: tổng thời gian xử lý hết 1000 request
- `Req/Sec`: số request xử lý mỗi giây
- `Latency Avg`: độ trễ trung bình

Ví dụ cách nói:

- “Em dùng `autocannon` bắn 1000 request vào `/status` qua Kong với 100 kết nối đồng thời.”
- “Nếu hệ thống xử lý hết request nhanh, không lỗi, và độ trễ trung bình vẫn ổn, thì chứng minh server chịu tải cơ bản tốt.”

Bạn có thể phân biệt 3 mức demo:

1000 request, 100 connection: hệ thống ổn
10000 request, 500 connection: chưa lỗi nhưng latency tăng mạnh
30000 request, 1500 connection: bắt đầu lỗi timeout thật
Đây là câu nói ngắn gọn nhất:

“Khi tải vừa phải, server xử lý ổn. Khi tăng lên 1500 kết nối đồng thời và 30.000 request, hệ thống bắt đầu xuất hiện timeout, nghĩa là đã chạm ngưỡng chịu tải.”
