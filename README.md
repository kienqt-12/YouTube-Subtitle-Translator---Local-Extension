# YouTube Subtitle Translator - Local Extension

Extension Chrome/Edge hiển thị phụ đề dịch trực tiếp trên video YouTube. Dự án chỉ chạy local, không tải video, không encode và không xuất MP4.

## Cấu trúc

- `extension_dist/`: extension Manifest V3 dùng ngay bằng **Load unpacked**.
- `extension/`: mã nguồn WXT + React + Tailwind dành cho phát triển.
- `backend/local_server.py`: HTTP API local bằng thư viện chuẩn Python.
- `subtitle_core.py`: lấy caption, khử lặp, ghép câu, dịch và chia thời gian.
- `run_extension_backend.bat`: khởi động backend local.
- `setup_extension.bat`: tạo môi trường và cài dependencies khi chuyển sang máy khác.

## Yêu cầu

- Windows 10/11.
- Python 3.11 trở lên và đã chọn **Add Python to PATH** khi cài.
- Chrome hoặc Microsoft Edge.
- Kết nối Internet để lấy caption và dịch nội dung.

## Tải từ GitHub và cài đặt

Mở PowerShell hoặc Command Prompt:

```powershell
git clone <repository-url>
cd translate
setup_extension.bat
```

Thay `<repository-url>` bằng URL repository GitHub của dự án. `setup_extension.bat` sẽ:

1. Tạo thư mục `venv` nếu máy chưa có.
2. Cài các thư viện trong `requirements.txt`.
3. Hiển thị đường dẫn extension cần nạp vào trình duyệt.

Nếu không dùng Git, tải **Code → Download ZIP**, giải nén rồi chạy `setup_extension.bat` trong thư mục dự án.

## Nạp extension vào trình duyệt một lần

1. Chrome: mở `chrome://extensions`. Edge: mở `edge://extensions`.
2. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn thư mục:

Chọn thư mục `extension_dist` nằm trong thư mục dự án vừa clone hoặc giải nén. Ví dụ:

```text
<thu-muc-du-an>\extension_dist
```

5. Ghim biểu tượng **YouTube Subtitle Translator AI** lên thanh công cụ.

## Sử dụng hằng ngày

1. Nhấp đúp `run_extension_backend.bat` và giữ cửa sổ đó mở.
2. Mở hoặc tải lại một video YouTube có caption công khai.
3. Mở popup extension; trạng thái phải là **Backend local đang chạy**.
4. Chọn ngôn ngữ, nhịp ngắt câu, cỡ chữ, màu, nền và vị trí.
5. Bấm **Áp dụng vào video**.

Phụ đề được đồng bộ với `video.currentTime` và hiển thị bằng Shadow DOM ngay trên player. Nút `↻` dịch lại video và bỏ qua cache hiện tại.

Trong lần dịch đầu, extension hiển thị tiến trình ngay trên video: giai đoạn đang lấy caption, ghép câu, số câu đã dịch và thời gian hoàn thành ước tính. ETA được tính từ tốc độ dịch thực tế nên có thể tự điều chỉnh trong quá trình chạy.

Extension lưu tối đa 12 video đã dịch trong `chrome.storage.local`. Khi xem lại cùng video, ngôn ngữ và nhịp câu, phụ đề được tải gần như tức thì mà không cần dịch lại. Backend đóng gói nhiều câu trong mỗi request và chỉ chạy tối đa 2 request đồng thời, giúp lần dịch đầu nhanh nhưng tránh bị Google giới hạn vì gửi quá nhiều request.

## Phạm vi local

Backend chỉ bind tại:

```text
http://127.0.0.1:8765
```

Nó không lắng nghe trên địa chỉ LAN và không cho thiết bị khác truy cập. Dữ liệu caption vẫn cần kết nối Internet để lấy từ YouTube và dịch qua Google Translate.

## Cài trên máy khác

Không sao chép thư mục `venv` từ máy cũ. Trên máy mới:

1. Cài Python 3.11 trở lên.
2. Clone repository hoặc tải ZIP từ GitHub.
3. Chạy `setup_extension.bat` để tạo `venv` riêng cho máy đó.
4. Nạp thư mục `extension_dist` bằng **Load unpacked**.

## Cập nhật phiên bản mới từ GitHub

```powershell
git pull
setup_extension.bat
```

Sau đó mở trang quản lý extension và bấm nút **Reload / Tải lại** trên extension.

Khi cập nhật thuật toán backend, hãy đóng cửa sổ backend cũ rồi mở lại `run_extension_backend.bat`. Tải lại tab YouTube để content script phiên bản mới được áp dụng.

## Những thư mục không đẩy lên GitHub

File `.gitignore` ở thư mục gốc tự động bỏ qua:

- `venv/`: toàn bộ môi trường Python và thư viện đã cài.
- `node_modules/`: dependencies Node/WXT.
- `extension/.output/`, `extension/.wxt/`: build và cache WXT.
- `__pycache__/`, `.pytest_cache/`: cache Python và kiểm thử.
- `.npm-cache/`, log, file tạm và thiết lập IDE cá nhân.

Không xóa hoặc ignore `extension_dist/`, vì đây là bản extension đã chuẩn bị sẵn để người tải từ GitHub dùng ngay.

## Xử lý sự cố

- Backend chưa chạy: mở `run_extension_backend.bat`.
- Extension mới cài nhưng chưa hoạt động: tải lại tab YouTube.
- Không có phụ đề: kiểm tra video có caption công khai.
- Bản dịch cũ còn trong RAM: bấm nút `↻` trong popup.
