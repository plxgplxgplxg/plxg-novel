# AGENT.md — Quy Tắc Làm Việc Cho Coding Agent

> Đọc file này TRƯỚC khi viết bất kỳ dòng code nào. Đây là hợp đồng bắt buộc,
> không phải gợi ý. Nếu có mâu thuẫn giữa AGENT.md và ý kiến cá nhân của agent
> về "cách hay hơn", AGENT.md luôn thắng — trừ khi người dùng chỉ định khác.

Tài liệu nghiệp vụ gốc: `novel-translation-system-spec.md` (nguồn sự thật về
data model, luồng nghiệp vụ, API contract). File này chỉ quy định **cách viết
code**, không lặp lại nghiệp vụ.

---

## 0. Quy tắc bắt buộc đọc trước khi động vào Frontend

**Bất kỳ thay đổi nào chạm tới `frontend/` (component, style, layout, page mới,
sửa UI cũ) đều BẮT BUỘC phải đọc `design.md` trước.** Không tự suy diễn màu sắc,
spacing, font, hay bố cục. Nếu `design.md` chưa quy định trường hợp cụ thể đang
gặp, agent phải suy ra từ các nguyên tắc chung trong `design.md` (token, tỉ lệ,
tinh thần thiết kế) — không được bịa ra style rời rạc, không dùng giá trị tùy
tiện (magic number cho màu/spacing/font-size).

Checklist trước khi commit code frontend:
- [ ] Đã đọc `design.md`, phần liên quan đến component/trang đang sửa.
- [ ] Màu, spacing, radius, shadow, font lấy từ design token trong `design.md`,
      không hardcode giá trị mới.
- [ ] Trạng thái (pending/translating/done/failed...) dùng đúng màu & icon quy
      định trong `design.md`, nhất quán toàn app.
- [ ] Responsive đúng breakpoint quy định.

---

## 1. Nguyên Tắc Kiến Trúc

Tuân thủ nghiêm ngặt SOLID như mô tả trong spec gốc:

- **Single Responsibility**: 1 class/service/hook chỉ làm đúng 1 việc. Nếu tên
  hàm phải dùng chữ "and" để mô tả (`splitAndTranslate`), tách ra làm 2.
- **Open/Closed**: Không sửa code cũ để thêm tính năng mới nếu có thể mở rộng
  qua interface/strategy (ví dụ: thêm `ITranslationProvider` mới, không sửa
  `HFInferenceProvider`).
- **Liskov Substitution**: Mọi implementation của cùng 1 interface phải hoán
  đổi được cho nhau mà không phá vỡ hành vi caller.
- **Interface Segregation**: Interface nhỏ, chia theo trách nhiệm
  (`IChunker`, `ITranslationProvider`, `IJobRepository`...), không gộp interface
  "God object".
- **Dependency Inversion**: Service tầng trên (business logic) chỉ phụ thuộc
  interface, không import trực tiếp BullMQ, HF SDK, hay driver DB cụ thể.
  Wiring cụ thể chỉ nằm ở tầng module/factory.

Backend module structure, data model, API contract: theo đúng mục 3, 6, 7 trong
`novel-translation-system-spec.md`. Không tự đổi tên bảng, tên field, tên
endpoint đã định nghĩa trong spec.

---

## 2. Quy Tắc Code — KHÔNG COMMENT

**Không viết comment trong code, ở bất kỳ ngôn ngữ nào (TS, JS, SQL, JSX...).**

Điều này bao gồm:
- Không comment giải thích logic (`// tính tổng segment`).
- Không comment đầu file/class mô tả mục đích.
- Không JSDoc/TSDoc trên hàm, kể cả interface public.
- Không để lại code chết dạng comment (`// old code`).
- Không TODO/FIXME dạng comment — nếu có việc còn dang dở, báo cáo trực tiếp
  cho người dùng trong phần tóm tắt câu trả lời, không nhét vào code.

Lý do: code phải tự giải thích được bằng tên biến, tên hàm, cấu trúc rõ ràng.
Nếu thấy cần comment để code dễ hiểu, đó là dấu hiệu phải đặt lại tên hoặc tách
hàm nhỏ hơn, không phải thêm comment.

Ngoại lệ DUY NHẤT: license header bắt buộc do công cụ tự sinh (nếu có) —
không tự thêm, chỉ giữ nguyên nếu do generator tạo ra.

### Đặt tên thay cho comment

```ts
// SAI — cần comment mới hiểu
function calc(s: Segment[]): number {
  // đếm số segment đã dịch xong
  return s.filter(x => x.status === 'done').length;
}

// ĐÚNG — tên đã tự giải thích, không cần comment
function countCompletedSegments(segments: Segment[]): number {
  return segments.filter(segment => segment.status === 'done').length;
}
```

### Chuẩn code khác

- TypeScript strict mode bật toàn bộ (`strict: true`), không dùng `any` trừ khi
  bất khả kháng khi tương tác với dữ liệu bên ngoài chưa validate — và ngay sau
  đó phải narrow bằng schema (zod/class-validator).
- Tên biến/hàm: tiếng Anh, rõ nghĩa, không viết tắt tùy tiện. Domain term theo
  đúng thuật ngữ trong spec (Book, Chapter, Segment, TranslationJob...).
- Hàm ngắn, mỗi hàm 1 mức trừu tượng. Ưu tiên early return, tránh lồng if sâu
  quá 2 cấp.
- Không magic number/string — khai báo constant/enum có tên rõ ràng
  (`MAX_SEGMENT_LENGTH = 120`, không viết số `120` rải rác trong code).
- Xử lý lỗi tường minh theo đúng bảng "Error Handling & Edge Cases" trong spec
  gốc — không nuốt lỗi bằng `catch {}` rỗng.
- Mọi async job/worker phải idempotent — chạy lại không được tạo dữ liệu trùng
  hoặc lệch trạng thái.
- Validate input ở boundary (controller/DTO), domain layer luôn nhận dữ liệu
  đã sạch.

---

## 3. Testing

- Unit test bắt buộc cho: `ChineseTextChunker`, mọi `ITranslationProvider`
  implementation (dùng mock/fake cho HF API), reassembly logic ghép segment.
- Test đặt cạnh file nguồn: `foo.service.ts` → `foo.service.spec.ts`.
- Không comment trong test code cũng áp dụng — tên `describe`/`it` phải mô tả
  đủ rõ hành vi đang test.
- Mock provider (`FakeTranslationProvider`) dùng cho test worker, không gọi
  mạng thật trong unit test.

---

## 4. Git & Quy Trình

- Commit message ngắn gọn, tiếng Anh, dạng mệnh lệnh: `Add chapter split worker`,
  không phải `Added` hay `Adding`.
- Mỗi commit là 1 thay đổi logic hoàn chỉnh, build được, test pass.
- Không commit file `.env`, credentials, hay dữ liệu test lớn.
- Migration DB: mỗi thay đổi schema là 1 migration riêng, có thể rollback.

---

## 5. Định Nghĩa Hoàn Thành (Definition of Done)

Một task được coi là xong khi:
1. Code build không lỗi, không warning TypeScript.
2. Unit test liên quan pass.
3. Không có comment nào trong code (tự rà lại trước khi báo hoàn thành).
4. Nếu có đổi frontend: đã đối chiếu với `design.md`.
5. Endpoint/behaviour khớp đúng spec trong `novel-translation-system-spec.md`.
6. Không để lại code chết, import thừa, biến không dùng.

---

## 6. Khi Không Chắc Chắn

Nếu spec nghiệp vụ và design.md không đủ thông tin để quyết định (ví dụ: tên
biến CSS mới, hành vi edge case chưa liệt kê), agent chọn phương án nhất quán
nhất với phần còn lại của hệ thống, ghi rõ giả định đã chọn khi báo cáo kết
quả, thay vì tự ý bịa ra quy ước mới không giải thích.
