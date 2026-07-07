# design.md — Design System

> File này là nguồn sự thật DUY NHẤT cho mọi quyết định UI/UX trong dự án.
> Mọi thay đổi frontend phải tuân theo token và nguyên tắc ở đây. Không tự
> chế màu, spacing, font-size ngoài những gì được định nghĩa. Nếu thiếu
> trường hợp cụ thể, suy ra từ token gần nhất — không bịa giá trị mới.

---

## 1. Tinh Thần Thiết Kế

Sản phẩm là nơi đọc truyện dịch — trải nghiệm phải giống **một thư viện số
hiện đại**, không phải một dashboard kỹ thuật. Ba từ khóa chỉ đạo mọi quyết
định thiết kế:

| Từ khóa | Ý nghĩa áp dụng |
|---|---|
| **Tĩnh tại (Calm)** | Nền trung tính, tương phản vừa đủ, không dùng màu chói. Trang đọc truyện phải giảm mỏi mắt khi đọc dài. |
| **Chính xác (Precise)** | Trạng thái job/segment/chapter luôn rõ ràng bằng màu + icon + text, không mập mờ. Đây là hệ thống xử lý bất đồng bộ nhiều bước — người dùng phải luôn biết "đang ở đâu". |
| **Có chiều sâu (Crafted)** | Chi tiết nhỏ (motion, shadow, khoảng trắng) được chăm chút, tránh cảm giác "Bootstrap mặc định". Đây là tiêu chuẩn thiết kế 4.0 — tinh gọn, hiện đại, không thừa chi tiết trang trí vô nghĩa. |

Tham chiếu phong cách: giao diện đọc kiểu Kindle/Readwise kết hợp control
panel kiểu Linear/Vercel Dashboard — nhiều khoảng trắng, typography làm chủ
đạo, màu sắc dùng để truyền tải trạng thái chứ không trang trí.

---

## 2. Design Tokens

### 2.1. Màu sắc

Dùng biến CSS (`:root` cho light, `.dark` cho dark mode). Không hardcode hex
trong component — luôn dùng qua token.

```css
:root {
  --color-bg: #FAFAF8;
  --color-bg-elevated: #FFFFFF;
  --color-bg-subtle: #F1F0EC;
  --color-border: #E4E2DB;
  --color-border-strong: #D2CFC4;

  --color-text-primary: #1C1B18;
  --color-text-secondary: #5C594F;
  --color-text-tertiary: #948F80;

  --color-brand: #B5482C;
  --color-brand-hover: #9C3C23;
  --color-brand-subtle: #FBE9E3;

  --color-accent: #2E5C50;
  --color-accent-subtle: #E4EFEA;

  --color-success: #2E7D4F;
  --color-success-subtle: #E3F3E8;
  --color-warning: #B8791B;
  --color-warning-subtle: #FBF0DD;
  --color-danger: #C23A2E;
  --color-danger-subtle: #FAE5E2;
  --color-info: #3568B0;
  --color-info-subtle: #E5EDF9;

  --shadow-sm: 0 1px 2px rgba(28, 27, 24, 0.06);
  --shadow-md: 0 4px 12px rgba(28, 27, 24, 0.08);
  --shadow-lg: 0 12px 32px rgba(28, 27, 24, 0.12);
}

.dark {
  --color-bg: #15140F;
  --color-bg-elevated: #1E1C16;
  --color-bg-subtle: #262319;
  --color-border: #37331F;
  --color-border-strong: #4A4531;

  --color-text-primary: #F2F0E8;
  --color-text-secondary: #B8B29F;
  --color-text-tertiary: #7C7768;

  --color-brand: #E36A46;
  --color-brand-hover: #EF8464;
  --color-brand-subtle: #382019;

  --color-accent: #6FAE9A;
  --color-accent-subtle: #1D2E28;

  --color-success: #5FBF83;
  --color-success-subtle: #1B2E20;
  --color-warning: #E3AC4C;
  --color-warning-subtle: #332512;
  --color-danger: #E8695C;
  --color-danger-subtle: #3A1D19;
  --color-info: #6FA0DE;
  --color-info-subtle: #1B2434;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.45);
}
```

**Quy tắc dùng màu:**
- `--color-brand` (đỏ đất nung) chỉ dùng cho hành động chính (CTA chính,
  link đang active, nút "Bắt đầu dịch"). Không dùng cho trạng thái.
- `--color-accent` (xanh rêu) dùng cho điểm nhấn phụ, không phải hành động.
- Trạng thái luôn map cố định, dùng xuyên suốt toàn app — xem bảng mục 4.5.
- Không bao giờ dùng màu ngoài bảng token, kể cả khi "chỉ thử nghiệm".

### 2.2. Typography

Hai font family, mục đích tách biệt rõ:

```css
--font-ui: 'Inter', -apple-system, 'Segoe UI', sans-serif;
--font-reading: 'Source Serif 4', 'Noto Serif', Georgia, serif;
```

- `--font-ui`: toàn bộ giao diện điều khiển (nav, form, dashboard, nút, bảng).
- `--font-reading`: CHỈ dùng cho nội dung chương truyện trong Reader
  (`translated_content`). Đọc serif dài giảm mỏi mắt hơn sans-serif.

Type scale (dùng `rem`, base 16px):

| Token | Size | Line-height | Weight | Dùng cho |
|---|---|---|---|---|
| `--text-display` | 2.5rem | 1.15 | 700 | Tiêu đề trang lớn (hero, tên sách trang chi tiết) |
| `--text-h1` | 1.875rem | 1.25 | 700 | Tiêu đề trang |
| `--text-h2` | 1.5rem | 1.3 | 600 | Tiêu đề section |
| `--text-h3` | 1.125rem | 1.4 | 600 | Tiêu đề card/block |
| `--text-body` | 1rem | 1.6 | 400 | Nội dung UI mặc định |
| `--text-small` | 0.875rem | 1.5 | 400 | Meta info, label phụ |
| `--text-caption` | 0.75rem | 1.4 | 500 | Badge, timestamp, uppercase label |
| `--text-reading` | 1.125rem | 1.85 | 400 | Nội dung chương truyện (Reader) |

Quy tắc: mỗi trang chỉ tối đa 1 `--text-display` hoặc `--text-h1`. Không
skip cấp bậc heading (h1 → h3 không qua h2) trừ trong card nhỏ độc lập.

### 2.3. Spacing

Thang 4px, dùng nhất quán, không dùng giá trị lẻ ngoài thang:

```
--space-1: 4px    --space-2: 8px     --space-3: 12px
--space-4: 16px   --space-5: 20px    --space-6: 24px
--space-8: 32px   --space-10: 40px   --space-12: 48px
--space-16: 64px  --space-20: 80px
```

- Padding trong component nhỏ (button, input): `--space-2` đến `--space-4`.
- Khoảng cách giữa các block trong 1 section: `--space-6`.
- Khoảng cách giữa các section: `--space-12` đến `--space-16`.

### 2.4. Bo góc & độ nổi

```
--radius-sm: 6px     -- input, badge nhỏ
--radius-md: 10px    -- button, card nhỏ
--radius-lg: 16px    -- card lớn, modal
--radius-full: 999px -- pill trạng thái, avatar
```

Shadow: dùng `--shadow-sm` cho card tĩnh, `--shadow-md` khi hover, `--shadow-lg`
chỉ cho modal/dropdown nổi trên nội dung.

### 2.5. Breakpoints

```
--bp-sm: 640px    -- mobile lớn
--bp-md: 768px    -- tablet
--bp-lg: 1024px   -- desktop nhỏ
--bp-xl: 1280px   -- desktop
--bp-2xl: 1536px  -- màn lớn
```

Mobile-first: viết style mặc định cho mobile, dùng `min-width` media query để
mở rộng lên desktop.

---

## 3. Motion

- Duration mặc định: `150ms` cho hover/focus, `250ms` cho mở/đóng panel,
  `350ms` cho page transition.
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out) cho mọi transition xuất
  hiện; `cubic-bezier(0.4, 0, 1, 1)` (ease-in) cho biến mất.
- Progress bar (dịch chương): animate `width` mượt, không nhảy giật; khi đạt
  100% có hiệu ứng pulse nhẹ 1 lần rồi chuyển sang badge "Hoàn thành".
- Không dùng animation trang trí không phục vụ mục đích truyền tải trạng thái
  (không confetti, không bounce quá đà).
- Tôn trọng `prefers-reduced-motion`: tắt toàn bộ animation không thiết yếu.

---

## 4. Component Chuẩn

### 4.1. Button

| Variant | Nền | Chữ | Dùng cho |
|---|---|---|---|
| Primary | `--color-brand` | trắng | Hành động chính duy nhất/section ("Bắt đầu dịch") |
| Secondary | `--color-bg-elevated` + border `--color-border-strong` | `--color-text-primary` | Hành động phụ ("Hủy", "Xem chi tiết") |
| Ghost | trong suốt | `--color-text-secondary` | Hành động nhẹ trong bảng/list |
| Danger | `--color-danger` | trắng | Xóa book/chapter |

- Kích thước chuẩn: height 40px (`md`), 32px (`sm`) trong bảng dày đặc.
- Radius `--radius-md`. Padding ngang `--space-4`.
- Trạng thái `disabled`: opacity 0.5, không đổi màu nền.
- Trạng thái loading: spinner thay icon, giữ nguyên width (tránh layout shift).

### 4.2. Card

- Nền `--color-bg-elevated`, border 1px `--color-border`, radius `--radius-lg`,
  padding `--space-6`, shadow `--shadow-sm`.
- Hover (nếu clickable): shadow → `--shadow-md`, border → `--color-border-strong`,
  transition 150ms.

### 4.3. Input / Form

- Height 40px, border 1px `--color-border-strong`, radius `--radius-sm`.
- Focus: border `--color-brand`, ring 3px `--color-brand-subtle`.
- Error: border `--color-danger`, text lỗi `--text-small` màu `--color-danger`
  ngay dưới input, kèm icon cảnh báo.
- Label luôn ở trên input, `--text-small` weight 500, màu `--color-text-secondary`.

### 4.4. Progress Bar

- Track: `--color-bg-subtle`, height 8px, radius `--radius-full`.
- Fill: gradient nhẹ từ `--color-brand` sang `--color-accent` khi đang chạy;
  chuyển hẳn sang `--color-success` khi 100%.
- Luôn kèm text số liệu bên cạnh: `142/200 đoạn (71%)`, không chỉ hiện bar trơn.

### 4.5. Status Badge (bắt buộc dùng nhất quán toàn app)

Trạng thái Book/Chapter/Segment/TranslationJob dùng chung 1 bộ mapping màu,
không được định nghĩa lại riêng ở từng nơi:

| Trạng thái | Màu nền | Màu chữ | Icon |
|---|---|---|---|
| `draft` / `pending` | `--color-bg-subtle` | `--color-text-secondary` | vòng tròn rỗng |
| `queued` / `splitting` | `--color-info-subtle` | `--color-info` | đồng hồ cát |
| `processing` / `translating` / `running` | `--color-brand-subtle` | `--color-brand` | spinner xoay |
| `partial` | `--color-warning-subtle` | `--color-warning` | nửa vòng tròn |
| `done` / `completed` | `--color-success-subtle` | `--color-success` | dấu tick |
| `failed` | `--color-danger-subtle` | `--color-danger` | dấu cảnh báo |

Badge: `--text-caption`, uppercase, padding `4px 10px`, radius `--radius-full`.

### 4.6. Navigation

- Sidebar cố định trên desktop (≥ `--bp-lg`): width 240px, nền `--color-bg-subtle`.
- Dưới `--bp-lg`: sidebar thu gọn thành bottom nav hoặc drawer trượt từ trái.
- Mục active: chữ `--color-brand`, nền `--color-brand-subtle`, radius `--radius-md`.

### 4.7. Toast / Notification

- Góc dưới-phải trên desktop, top trên mobile.
- 4 loại theo màu bảng 4.5 (info/success/warning/danger), auto-dismiss 4s trừ
  danger (phải bấm đóng tay).

---

## 5. Thiết Kế Theo Trang

### 5.1. Trang Upload / Tạo Truyện

- Layout 1 cột, max-width 720px, căn giữa — đây là tác vụ tuần tự, không cần
  dashboard rộng.
- Form tạo Book ở trên cùng (title, upload file / paste text).
- Sau khi tách chương, hiện **preview list chương dạng card compact**: số thứ
  tự, tiêu đề gốc, số ký tự — cho phép xóa/sửa từng chương trước khi confirm.
- Nút "Bắt đầu dịch" là Primary button, cố định cuối trang (sticky) khi list
  chương dài.

### 5.2. Trang Dashboard

- Layout lưới card, mỗi Book là 1 card: bìa (hoặc placeholder chữ cái đầu tên
  sách trên nền `--color-accent-subtle`), title, badge trạng thái, progress
  bar tổng.
- Click card → expand accordion danh sách chương (không chuyển trang, giữ
  context), mỗi dòng chương có badge trạng thái riêng + nút Retry nếu failed.
- Kết nối SSE ngay khi vào trang; nếu SSE lỗi, tự động fallback polling 3s —
  hiển thị chấm nhỏ màu `--color-text-tertiary` ở góc "Cập nhật trực tiếp" /
  "Đang polling" để người dùng biết chế độ đang dùng.

### 5.3. Trang Đọc Truyện (Reader)

- Đây là trang quan trọng nhất về trải nghiệm đọc — ưu tiên tuyệt đối cho nội
  dung:
  - Max-width vùng đọc: 680px, căn giữa, padding hai bên rộng trên mobile.
  - Font `--font-reading`, size `--text-reading`, màu chữ `--color-text-primary`
    trên nền `--color-bg` (không dùng nền trắng thuần trong dark mode).
  - Thanh điều khiển (chương trước/sau, cỡ chữ, theme) ẩn mặc định, hiện khi
    hover/tap vào vùng trên cùng — tránh chiếm chỗ khi đọc.
  - Chương đang dịch dở (`partial`/`translating`): hiện banner nhẹ trên đầu
    nội dung "Chương đang được dịch, một số đoạn có thể chưa đầy đủ" — không
    dùng màu danger, dùng `--color-warning-subtle`.
- Không hiện sidebar/nav phụ trong chế độ đọc — chỉ nút quay lại Dashboard góc
  trên trái.

---

## 6. Accessibility

- Tương phản chữ/nền tối thiểu WCAG AA (4.5:1 cho text thường, 3:1 cho text
  lớn ≥ 24px).
- Mọi icon-only button phải có `aria-label`.
- Focus state luôn hiển thị rõ (không `outline: none` mà không thay thế bằng
  ring khác).
- SSE realtime update phải đi kèm `aria-live="polite"` ở vùng progress để
  screen reader đọc được thay đổi trạng thái.
- Cỡ chữ trang Reader phải điều chỉnh được (tối thiểu 3 mức: nhỏ/vừa/lớn).

---

## 7. Việc KHÔNG Được Làm

- Không hardcode màu/spacing/font ngoài token ở mục 2.
- Không tạo thêm màu trạng thái mới ngoài bảng 4.5 — nếu có trạng thái mới
  trong data model, map vào nhóm gần nghĩa nhất (ví dụ trạng thái mới dạng
  "đang chờ" → dùng nhóm `pending`).
- Không dùng nhiều hơn 2 font family trong toàn app.
- Không thiết kế rời rạc giữa các trang — mọi trang mới phải tái sử dụng
  component ở mục 4 trước khi nghĩ đến tạo component mới.
