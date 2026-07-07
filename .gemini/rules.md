Đây là project Novel Translation System. Trước khi viết bất kỳ dòng code nào, agent BẮT BUỘC phải tuân thủ:

1. **AGENT.md** (root project): Quy tắc làm việc bắt buộc — kiến trúc SOLID, không comment trong code, chuẩn TypeScript strict, quy trình git, definition of done.

2. **design.md** (root project): Design system duy nhất — mọi quyết định UI/UX phải tuân theo token và nguyên tắc trong file này. Không tự chế màu, spacing, font-size ngoài những gì được định nghĩa.

3. **novel-translation-system-spec.md** (root project): Nguồn sự thật về data model, luồng nghiệp vụ, API contract.

Thứ tự ưu tiên khi có mâu thuẫn: AGENT.md > design.md > novel-translation-system-spec.md.

Checklist bắt buộc trước mỗi thay đổi:
- Đọc AGENT.md nếu chạm tới bất kỳ code nào
- Đọc design.md nếu chạm tới frontend
- Đọc novel-translation-system-spec.md nếu chạm tới data model, API, hoặc business logic
