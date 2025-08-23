# Sephora Scraper

Công cụ crawl dữ liệu sản phẩm từ Sephora.com với hỗ trợ proxy và batch processing.

## Tính năng

### 1. Danh sách URL (Tab cũ)
- Crawl nhiều URL sản phẩm cùng lúc
- Hỗ trợ ScrapeOps proxy và proxy tùy chỉnh
- Batch processing với concurrency control
- Xuất kết quả ra file CSV

### 2. Variants Scraper (Tab mới) ⭐
- **Scrape tất cả variants của một sản phẩm**
- Tự động phát hiện các biến thể (màu sắc, kích thước, v.v.)
- Trích xuất SKU và tạo link cho từng variant
- Xuất kết quả ra file Excel với tên sản phẩm

## Cài đặt

```bash
npm install
```

## Chạy ứng dụng

### Chạy cả frontend và backend
```bash
npm run dev
```

### Chỉ chạy backend
```bash
npm run server
```

### Chỉ chạy frontend
```bash
npm start
```

## Sử dụng Variants Scraper

### Bước 1: Chuyển sang tab "Variants Scraper"
- Click vào tab "Variants Scraper" ở phía trên

### Bước 2: Nhập URL sản phẩm
- Dán URL sản phẩm Sephora vào ô input
- Ví dụ: `https://www.sephora.com/product/touchland-power-mist-hydrating-hand-sanitizer-P480529?skuId=2556751`

### Bước 3: Cấu hình proxy (khuyến nghị)
- Chọn "ScrapeOps Proxy" 
- Nhập API key của bạn
- Chọn vị trí địa lý (US hoặc Auto)

### Bước 4: Bắt đầu scrape
- Click "Bắt đầu Scrape Variants"
- Hệ thống sẽ tự động tìm tất cả variants

### Bước 5: Xuất kết quả
- Sau khi hoàn thành, click "Xuất Excel"
- File sẽ được tải về với tên: `[Tên-Sản-Phẩm]-variants.csv`

## Cấu trúc dữ liệu xuất

File Excel sẽ có 3 cột:
- **Mã SKU**: SKU với prefix "SE-" (ví dụ: SE-2556819)
- **Tên Variants**: Tên của variant (ví dụ: Beach Coco, Vanilla Blossom)
- **Link Sản Phẩm có SKU Liên Quan**: URL đầy đủ của variant

## Cách hoạt động

### Phát hiện variants
Hệ thống tìm kiếm các phần tử HTML có `data-comp="SwatchGroup "` và trích xuất:
- Tên variant từ `aria-label`
- SKU từ URL hình ảnh (`sku/s2556819+sw-62.jpg`)
- Tạo link variant mới với SKU tương ứng

### Xử lý dữ liệu
- Sử dụng ScrapeOps proxy để bypass anti-bot
- Parse HTML với Cheerio
- Tự động xử lý lỗi và retry

## Lưu ý

- **ScrapeOps API key**: Cần thiết để bypass rate limiting
- **Proxy US**: Khuyến nghị sử dụng để có kết quả tốt nhất
- **Timeout**: Mỗi request có timeout 60 giây
- **Rate limiting**: Tuân thủ giới hạn của ScrapeOps

## Troubleshooting

### Không tìm thấy variants
- Kiểm tra URL có đúng format không
- Đảm bảo sản phẩm có nhiều variants
- Thử với proxy US thay vì Auto

### Lỗi API
- Kiểm tra ScrapeOps API key
- Đảm bảo có đủ credits
- Thử lại sau vài phút

## Cấu trúc project

```
sephora-scraper/
├── src/
│   ├── components/
│   │   └── SephoraScraper.js    # Component chính với 2 tabs
│   └── styles/
│       └── SephoraScraper.css   # CSS cho UI
├── server.js                     # Backend API
└── package.json
```

## API Endpoints

- `POST /api/scrape` - Scrape một sản phẩm
- `POST /api/scrape/batch` - Scrape nhiều sản phẩm
- `POST /api/scrape/variants` - Scrape variants của sản phẩm ⭐
- `GET /health` - Kiểm tra trạng thái server
