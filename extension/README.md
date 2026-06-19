# WXT/React development source

Đây là mã nguồn phát triển của extension với WXT, React, Tailwind và Radix UI.

```powershell
npm install
npm run check
npm run build
```

Khi npm registry chưa khả dụng, dùng bản Manifest V3 đã chuẩn bị sẵn tại `..\extension_dist`.

- `entrypoints/background.ts`: gọi Local API.
- `entrypoints/content.ts`: Shadow DOM overlay trên YouTube.
- `entrypoints/popup`: popup React.
- `components/ui`: component UI theo mô hình shadcn/Radix.
