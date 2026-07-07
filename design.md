# design.md — Design System

> File này là nguồn sự thật DUY NHẤT cho mọi quyết định UI/UX trong dự án.
> Mọi thay đổi frontend phải tuân theo token và nguyên tắc ở đây. Không tự
> chế màu, spacing, font-size ngoài những gì được định nghĩa. Nếu thiếu
> trường hợp cụ thể, suy ra từ token gần nhất — không bịa giá trị mới.
>
> Bản cập nhật này đồng bộ hoá tài liệu với giao diện thực tế đang chạy
> (trang tổng hợp review) — nền tối, không có light mode, phong cách
> editorial/tạp chí về đêm thay vì dashboard trung tính.

---

## 1. Tinh Thần Thiết Kế

Sản phẩm là trang tổng hợp review truyện — trải nghiệm phải giống **một tạp
chí điện tử về đêm**, nhiều lớp gradient mờ ảo, chữ serif làm điểm nhấn thị
giác. Ba từ khóa chỉ đạo mọi quyết định thiết kế:

| Từ khóa | Ý nghĩa áp dụng |
|---|---|
| **U ẩn (Moody)** | Nền luôn tối (`--bg`), không có light mode. Ánh sáng đến từ các đốm gradient màu hồng/xanh lá/tím mờ ảo (radial-gradient), không dùng nền phẳng đơn sắc ở khu vực hero. |
| **Sang trọng — biên tập (Editorial)** | Tiêu đề luôn dùng serif nghiêng/thường (Playfair Display), tạo cảm giác tạp chí. Chữ thường (UI, mô tả) dùng sans gọn (Be Vietnam Pro) để tương phản với serif. |
| **Có chiều sâu (Crafted)** | Card, modal, filter panel đều có border mờ + shadow lớn + backdrop-blur để tạo cảm giác nổi trên nền tối, không phẳng. Motion mượt (ease-out 0.18–0.35s), không giật cục. |

Tham chiếu phong cách: trang landing tối kiểu editorial/webzine (ánh sáng
neon dịu, glassmorphism nhẹ), tiêu đề lớn serif ở giữa màn hình, card có
"header màu" tương phản mạnh với "thân card" tối.

---

## 2. Design Tokens

### 2.1. Màu sắc

Chỉ có **một theme tối duy nhất** (biến ở `:root`, không có `.dark`/light
mode). Không hardcode hex trong component — luôn dùng qua biến CSS.

```css
:root {
  /* Nền & bề mặt */
  --bg: #0d0911;
  --surface: #17111d;
  --surface2: #21172a;

  /* Viền */
  --border: rgba(255, 0, 168, 0.14);
  --border2: rgba(181, 139, 227, 0.22);

  /* Chữ */
  --text: #f7f0f6;
  --muted: #b9adbc;

  /* Màu điểm nhấn (accent) */
  --accent: #FDB3C2;          /* accent chính — hồng pastel, dùng cho CTA, active, số điểm */
  --accent-primary: #FDB3C2;  /* alias của --accent */
  --pink: #FDB3C2;            /* alias của --accent */
  --teal: #19d3a2;            /* accent phụ — dùng cho badge OE, thể loại "oe" */
  --accent-secondary: #19d3a2; /* alias của --teal */
  --purple: #b58be3;
  --accent-purple: #b58be3;
  --accent-blue: #7c8fd6;
  --neutral-light: #d9d9d9;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.18);
  --shadow-lg: 0 20px 44px rgba(0, 0, 0, 0.24);
}
```

**Quy tắc dùng màu:**
- `--accent` (hồng pastel) là màu hành động/nhấn mạnh chính: nút chọn active
  trong filter, liên kết nav khi hover, con số điểm đánh giá, nút phân trang
  đang chọn.
- `--teal` chỉ dùng cho các trạng thái/tag mang nghĩa "OE" (open ending) —
  không dùng lẫn với `--accent`.
- `--purple` / `--accent-blue` dùng cho các tag/badge phụ không thuộc nhóm
  trạng thái chính (ví dụ nhãn "BE", liên kết phân loại phụ).
- Toàn bộ nền luôn là biến thể của `--bg` / `--surface` / `--surface2`,
  không dùng trắng thuần hay xám trung tính sáng ở bất kỳ đâu.
- Card "meta" (khối bên trái/trên của thẻ) là **ngoại lệ duy nhất được phép
  sáng màu**: dùng `radial-gradient` từ hồng sáng (`#FFBAE8`) sang hồng đậm
  (`#D671AB`) rồi tối dần về `#231A2C`, để tạo điểm nhấn thị giác nổi bật
  giữa một bố cục chủ đạo tối.
- Không bao giờ dùng màu ngoài bảng token, kể cả khi "chỉ thử nghiệm".

### 2.2. Typography

Hai font family, mục đích tách biệt rõ:

```css
--font-serif: 'Playfair Display', Georgia, serif;
--font-sans: 'Be Vietnam Pro', system-ui, sans-serif;
```

- `--font-serif`: dùng cho **mọi tiêu đề** — logo, h1 hero, tiêu đề modal,
  tiêu đề card truyện (`.card-title`), con số điểm đánh giá lớn (`.sc-n`).
  Có thể dùng dạng in nghiêng (`font-style: italic`) để nhấn 1 cụm từ trong
  tiêu đề hero (ví dụ từ khóa chủ đề).
- `--font-sans`: **toàn bộ phần còn lại** — nav, button, input, badge, tag,
  nội dung mô tả/review, meta info. Trọng lượng mặc định của body là `300`
  (Light) để tạo cảm giác thanh mảnh, tương phản với serif đậm ở tiêu đề.

Type scale tham khảo (không bắt buộc `rem` cố định như hệ dashboard, ưu
tiên `clamp()` cho tiêu đề hero để responsive mượt):

| Token | Size | Font | Dùng cho |
|---|---|---|---|
| `--text-hero` | `clamp(2.8rem, 7vw, 5.5rem)` | serif, 400 | Tiêu đề hero |
| `--text-modal-title` | 1.8rem | serif, 400 | Tiêu đề trong modal chi tiết |
| `--text-card-title` | 1.22rem | serif, 400 | Tiêu đề card (tên truyện) |
| `--text-score` | 2.7rem (card) / 1.6rem (modal) | serif, 400 | Con số điểm đánh giá |
| `--text-body` | 0.87rem–1rem | sans, 300–400 | Nội dung review, mô tả |
| `--text-small` | 0.75–0.8rem | sans, 400 | Meta info, excerpt, tag |
| `--text-caption` | 0.6–0.7rem | sans, 500, uppercase, letter-spacing rộng | Badge, label, eyebrow text |
| `--text-nav` | 0.78rem | sans, uppercase, letter-spacing .12em | Menu điều hướng |

Quy tắc:
- Mỗi trang chỉ 1 tiêu đề hero (`--text-hero`).
- Eyebrow/label nhỏ phía trên tiêu đề lớn luôn viết hoa, letter-spacing
  rộng (`.16em`–`.2em`), màu `--accent` hoặc `--muted`.
- Không dùng quá 2 font family trong toàn app (giữ nguyên nguyên tắc gốc).

### 2.3. Spacing

Không dùng thang 4px cứng nhắc như hệ dashboard — layout theo khối lớn
(section) với padding rem linh hoạt, nhưng vẫn giữ nhất quán theo cặp giá
trị sau:

```
--space-tight: .35rem   /* gap giữa badge/tag nhỏ */
--space-xs: .5rem       /* gap trong 1 nhóm control nhỏ */
--space-sm: .85rem      /* padding trong card nhỏ, gap giữa filter group */
--space-md: 1.2rem      /* padding chuẩn trong card/modal section */
--space-lg: 2rem        /* padding ngang trong modal, khoảng cách block lớn */
--space-xl: 3rem        /* padding ngang cấp trang (nav, controls, grid-section) */
--space-2xl: 5rem       /* padding trên/dưới các section lớn (hero, grid-section) */
```

- Trên mobile (`≤768px`), toàn bộ padding cấp trang giảm về `1–1.4rem`.
- Khoảng cách giữa các card trong grid: `1.3rem` (desktop) → `.75rem`
  (mobile 2 cột).

### 2.4. Bo góc & độ nổi

```
--radius-input: 8–10px    -- input, link-btn, nút đóng modal
--radius-pill: 100px      -- mọi button dạng pill (filter, tag, badge, tab, phân trang)
--radius-card: 22px       -- card review (16px trên mobile)
--radius-modal: 16px      -- modal (12px trên mobile)
--radius-panel: 16px      -- filter panel
```

Shadow: `--shadow-sm` cho phần tử tĩnh nhỏ, `--shadow-md` cho card ở trạng
thái nghỉ, `--shadow-lg` khi hover card hoặc cho modal/overlay nổi trên nội
dung. Card khi hover: dịch nhẹ lên (`translateY(-3px)`) + đổi shadow, không
đổi màu nền.

### 2.5. Breakpoints

```
--bp-mobile: 768px   -- dưới mốc này: grid 2 cột, nav cuộn ngang, modal full padding nhỏ
```

Chỉ cần 1 breakpoint chính cho trang review (mobile ↔ desktop). Không cần
chia nhỏ tablet/desktop-nhỏ như hệ dashboard vì bố cục chính là grid card
tự động co giãn (`repeat(auto-fill, minmax(360px, 1fr))`).

---

## 3. Motion

- Duration: `.18s` cho hover/focus & mở-đóng modal, `.2s` cho hover card/
  button, `.3s` cho icon xoay (mũi tên filter), `.35s` cho mở/đóng
  filter-panel (dùng kỹ thuật `grid-template-rows: 0fr → 1fr`).
- Easing mặc định: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out) cho transition
  xuất hiện/mở rộng.
- Card xuất hiện khi load: fade + trượt lên nhẹ (`translateY(14px)→0`),
  stagger theo `animation-delay` tăng dần theo vị trí trong danh sách.
- Overlay/modal: fade `opacity` + trượt `translateY(12px)→0`; khi đóng dùng
  class `closing-fast` để tắt hẳn transition, tránh giật khi đóng nhanh
  liên tục.
- Scroll-hint ở hero: bounce nhẹ lặp vô hạn (`2.5s ease-in-out infinite`),
  đây là animation trang trí **duy nhất** được phép vì nó gợi ý một hành
  động cụ thể (cuộn xuống), không phải hiệu ứng thuần trang trí.
- Tôn trọng `prefers-reduced-motion`: tắt toàn bộ animation/transition
  không thiết yếu.

---

## 4. Component Chuẩn

### 4.1. Navigation (nav cố định trên cùng)

- `position: fixed`, nền `--bg` với alpha 0.9 + `backdrop-filter: blur(8px)`,
  border-bottom mờ `--border`.
- Logo dùng `--font-serif`, màu `--accent`.
- Menu item: `--font-sans`, uppercase, letter-spacing `.12em`, màu `--muted`
  → hover đổi sang `--accent`, không đổi nền.
- Trên mobile: menu cuộn ngang, ẩn scrollbar.

### 4.2. Hero

- `min-height: 100vh`, căn giữa cả ngang và dọc.
- Nền là 3 lớp `radial-gradient` mờ (hồng/teal/xanh lam) đặt lệch vị trí,
  không phải ảnh hay màu phẳng.
- Eyebrow text nhỏ phía trên tiêu đề, có 2 gạch ngang 2 bên (`::before`/
  `::after`).
- Tiêu đề dùng `--text-hero`, có thể in nghiêng 1 cụm bằng `--accent`.
- Bên dưới có hàng thống kê nhanh (số liệu lớn serif + label sans nhỏ).
- Scroll-hint ở đáy hero, bounce lặp.

### 4.3. Filter Panel

- Container: nền gradient trắng mờ rất nhẹ trên `--surface`, border
  `--border`, radius `--radius-panel`, shadow lớn.
- **Header luôn hiển thị** (không ẩn khi đóng), click để toggle mở/đóng
  toàn bộ phần thân filter. Có badge tròn đếm số filter đang active
  (`--accent` nền, chữ tối).
- **Phần thân (collapsible)**: dùng `grid-template-rows: 0fr/1fr` để mở
  mượt, không dùng `max-height` cứng.
- Mỗi nhóm filter có `group-title` (label uppercase nhỏ, `--muted`) bên
  trái + các nút chọn dạng pill bên phải.
- Nút filter (`.fbtn`): mặc định viền `--border2`, nền trong suốt, chữ
  `--muted`. Trạng thái `on`: nền `--accent`, chữ tối, có shadow màu accent
  nhẹ để nổi bật.
- Nút reset filter: viền + chữ `--accent-blue`, tách biệt về màu với nhóm
  filter thường để tránh nhầm là 1 lựa chọn filter.
- **Quick bar** (luôn hiển thị dưới header, không phụ thuộc trạng thái
  mở/đóng panel): 1 ô search dạng pill (icon kính lúp bên trái, nền
  `--surface`) + số lượng kết quả dạng text nhỏ `--muted`.

### 4.4. Tabs

- Dùng khi nội dung có nhiều nguồn/nhóm (ví dụ "Convert/Edit" vs "Ngoại
  văn"). Nút dạng pill giống filter nhưng đặt riêng 1 hàng phía trên filter
  panel.
- Tab active: nền `--accent`, chữ tối, kèm số lượng nhỏ mờ trong ngoặc.
- Tab không active: viền `--border2`, chữ `--muted`, hover đổi viền/chữ
  sang `--accent` nhưng **không** đổi nền (phân biệt rõ với trạng thái
  active).

### 4.5. Card (Review Card)

- Bố cục lưới: cột trái/trên là **card-meta** (khối màu sáng), phần còn lại
  là **card-body** (nền tối). Trên desktop: 2 cột ngang (meta 128px cố
  định + body co giãn). Trên mobile: xếp dọc (meta trên, body dưới).
- `border-radius: var(--radius-card)`, `overflow: hidden`, border mờ màu
  hồng đậm hơn bình thường (`rgba(254,89,136,.26)`) để tách biệt khỏi nền.
- Hover: border sáng hơn, `translateY(-3px)`, shadow tăng cấp — không đổi
  màu nền.
- **card-meta**: nền radial-gradient hồng sáng → tối; chứa badge trạng thái
  (góc trên), khối điểm đánh giá (số lớn serif + sao nhỏ uppercase), và
  dòng phân loại ngắn (thời kỳ · quan hệ) ở đáy.
- **card-body**: nền gradient tối 2 lớp; chứa tag thể loại (pill nhỏ viền
  mờ), tiêu đề serif, đoạn trích 3 dòng (`line-clamp: 3`), và footer chia
  cách bằng border mờ chứa sao nhỏ + preview review đầu tiên.
- Card xuất hiện với animation fade-up so le (`animation-delay` tăng dần).

### 4.6. Badge & Tag

Hai loại khác nhau, không dùng lẫn:

| Loại | Dùng cho | Style |
|---|---|---|
| **Badge** | Trạng thái (tình trạng truyện, kết thúc BE/OE...) | Nền màu theo bảng 4.7, chữ uppercase nhỏ, pill, đặt ở card-meta/modal |
| **Tag** | Thể loại, phân loại (nhiều tag/item) | Viền mờ trong suốt, chữ nhỏ hơn badge, pill, đặt ở card-body/modal. Có biến thể `.ht` (huyết thống — viền/chữ `--accent`), `.oe` (viền/chữ `--teal`), `.hit` (đang được filter chọn — nền `--accent` mờ + chữ sáng) |

### 4.7. Status Badge Color Map (bắt buộc dùng nhất quán toàn app)

| Trạng thái | Nền | Chữ |
|---|---|---|
| Đã hoàn thành | `rgba(10,80,60,.70)` | `#4fffd4` |
| Còn tiếp / đang tiếp tục | `rgba(40,50,110,.70)` | `#aab8ff` |
| Chưa rõ | `rgba(40,30,55,.70)` | `#ddd0e8` |
| BE / Drop / Tạm ngưng | `rgba(100,10,60,.70)` | `#ffaadd` |
| OE / tag phụ trung tính | `rgba(70,40,110,.70)` | `#d8aaff` |
| OG (Original Work) | `rgba(1,64,104,1)` | `#EBE5CD` |

Không tự thêm màu trạng thái mới ngoài bảng — nếu phát sinh trạng thái mới
trong dữ liệu, map vào nhóm gần nghĩa nhất.

### 4.8. Modal (Review Detail)

- Overlay: nền `rgba(6,5,4,.9)` + `backdrop-filter: blur(10px)`, fade in/out
  `.18s`.
- Modal: nền `--surface`, viền `--border2`, radius `--radius-modal`,
  `max-width: 680px`, cuộn dọc nội bộ nếu nội dung dài, scrollbar mảnh màu
  `--border2`.
- Nút đóng: `position: sticky` trong modal (luôn nổi khi cuộn), hình vuông
  bo góc nhỏ, nền `--surface2`.
- Cấu trúc nội dung modal theo thứ tự cố định: tag/badge → tiêu đề serif →
  divider mờ → lưới info 4 cột (quan hệ, thời kỳ, kết thúc, điểm đánh giá)
  → divider → khối "Giới thiệu" (nếu có, nền `--surface2`, viền trái màu
  accent, chữ nghiêng) → khối "Review" (nhiều đoạn văn) → nút link đọc
  truyện (dạng `link-btn`, viền + chữ `--accent`, nền `--surface2`).
- Mỗi heading nhỏ trong modal (`.m-hd`) là uppercase + letter-spacing rộng,
  màu `--accent`, có 1 đường kẻ mờ kéo dài hết chiều rộng bên phải chữ.

### 4.9. Button / Link chung

| Variant | Style | Dùng cho |
|---|---|---|
| Pill filter/tab | Viền `--border2`, nền trong suốt → khi active: nền `--accent`, chữ tối | Filter, tab, phân trang |
| Reset | Viền + chữ `--accent-blue` | Xoá toàn bộ filter |
| Link-btn | Viền + chữ `--accent`, nền `--surface2`, icon kèm chữ | CTA mở liên kết ngoài (đọc truyện) |
| Nav random/button ẩn | Không nền, không viền, chữ `--muted` → hover `--accent` | Hành động phụ trong nav |

Không có variant "Danger" mặc định trong hệ này (trang không có thao tác
xoá dữ liệu ở giao diện người dùng) — nếu cần trong tương lai, dùng tông đỏ
gần với nhóm màu badge "Drop" (`#ffaadd` trên `rgba(100,10,60,.70)`), không
tự chế đỏ mới.

### 4.10. Pagination

- Dạng pill giống filter, căn giữa, có nút `‹ Trước` / `Sau ›` và số trang.
- Trang active: nền `--accent`, chữ tối, đậm.
- Trang bị disable (đầu/cuối danh sách): `opacity: .3`, `cursor: default`.
- Dấu `…` khi rút gọn dải số trang dài: màu `--muted`, không phải button.

---

## 5. Thiết Kế Theo Trang

### 5.1. Trang danh sách review (trang chính)

- Cấu trúc theo thứ tự: Nav cố định → Hero full-screen → Tabs → Filter
  panel (header luôn hiện, thân đóng mặc định) → Grid card → Pagination →
  Footer.
- Grid card: `repeat(auto-fill, minmax(360px, 1fr))`, tự động co giãn theo
  chiều rộng màn hình, không giới hạn cứng số cột trên desktop.
- Trên mobile: cố định 2 cột, card chuyển sang bố cục dọc (meta trên,
  body dưới), giảm cỡ chữ tiêu đề/tag để vẫn đọc được trong không gian hẹp.
- Số lượng kết quả hiển thị realtime ngay dưới ô search khi filter/tìm
  kiếm thay đổi (`X / Y bài review`).

### 5.2. Modal chi tiết (mở từ card)

- Không chuyển trang — mở overlay trên cùng ngữ cảnh đang xem (giữ vị trí
  cuộn của trang phía sau).
- Đóng bằng: click nút ✕, click ra ngoài overlay, hoặc phím `Esc`.
- Nội dung dài (nhiều đoạn review) phải cuộn được trong modal, không tràn
  ra ngoài viewport (`max-height: 90vh`).

---

## 6. Accessibility

- Tương phản chữ/nền tối thiểu WCAG AA (4.5:1 cho text thường, 3:1 cho text
  lớn ≥ 24px) — đặc biệt lưu ý vì nền tối + chữ màu nhạt (`--muted`) dễ vi
  phạm ngưỡng này, cần kiểm tra riêng từng cặp màu khi thêm state mới.
- Mọi icon-only button (nút đóng modal, icon search, nút random) phải có
  `aria-label` hoặc text ẩn cho screen reader.
- Focus state luôn hiển thị rõ, không dùng `outline: none` mà không thay
  bằng ring/border thay thế.
- Tôn trọng `prefers-reduced-motion` — tắt animation stagger của card,
  bounce của scroll-hint, và mọi transition không thiết yếu.
- Modal khi mở phải khóa scroll của `body` và trả lại khi đóng (đã áp dụng
  qua `document.body.style.overflow`).

---

## 7. Việc KHÔNG Được Làm

- Không tạo light mode / theme sáng cho trang này — hệ thống chỉ có 1 theme
  tối duy nhất.
- Không hardcode màu/spacing/font ngoài token ở mục 2.
- Không tạo thêm màu trạng thái mới ngoài bảng 4.7 — nếu có trạng thái mới
  trong dữ liệu, map vào nhóm gần nghĩa nhất.
- Không dùng nhiều hơn 2 font family trong toàn app (serif tiêu đề + sans
  còn lại).
- Không nhầm lẫn giữa **Badge** (trạng thái, 1 giá trị) và **Tag** (phân
  loại/thể loại, nhiều giá trị) — hai loại có style và mục đích khác nhau,
  không dùng thay thế cho nhau.
- Không thiết kế rời rạc giữa các trang — mọi trang mới phải tái sử dụng
  component ở mục 4 trước khi nghĩ đến tạo component mới.