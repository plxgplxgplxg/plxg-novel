# Backend Architecture

## Tech Stack
- **Framework**: NestJS + TypeScript (strict mode)
- **Database**: PostgreSQL + TypeORM (synchronize mode in dev, cần migration cho production)
- **Queue**: BullMQ + Redis
- **Auth**: JWT (passport-jwt)
- **Realtime**: SSE (Server-Sent Events)

## Module Structure

```
src/
├── app.module.ts                     ← Root module
├── main.ts                           ← Bootstrap (ValidationPipe, CORS)
├── database/
│   └── entities/                     ← 5 TypeORM entities
│       ├── user.entity.ts
│       ├── book.entity.ts
│       ├── chapter.entity.ts
│       ├── segment.entity.ts
│       └── translation-job.entity.ts
├── queue/
│   ├── queue.constants.ts            ← Tên queue, config BullMQ, concurrency
│   └── queues.module.ts              ← BullMQ forRoot + registerQueue
└── modules/
    ├── auth/                         ← JWT register/login
    ├── book/                         ← CRUD + startTranslation
    ├── chapter/                      ← CRUD + upload file + retranslate
    ├── segment/                      ← Retry single segment
    ├── progress/                     ← SSE stream endpoint
    └── translation/
        ├── interfaces/               ← ITranslationProvider, IChunker, errors
        ├── providers/                ← HFInferenceProvider, FakeTranslationProvider
        ├── chunker/                  ← ChineseTextChunker (+ spec)
        └── workers/                  ← ChapterSplitWorker, TranslationWorker
```

## API Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/auth/register` | — | Đăng ký |
| POST | `/auth/login` | — | Đăng nhập |
| POST | `/books` | JWT | Tạo book |
| GET | `/books` | JWT | Danh sách book |
| GET | `/books/:id` | JWT | Chi tiết book + chapters |
| GET | `/books/:id/status` | JWT | Trạng thái tổng quan |
| POST | `/books/:id/translate` | JWT | Bắt đầu dịch (202) |
| DELETE | `/books/:id` | JWT | Soft delete |
| POST | `/books/:bookId/chapters` | JWT | Thêm chapter |
| POST | `/books/:bookId/chapters/upload` | JWT | Upload file .txt |
| GET | `/chapters/:id` | JWT | Chi tiết chapter (đọc) |
| POST | `/chapters/:id/translate` | JWT | Retry chapter (202) |
| POST | `/segments/:id/retry` | JWT | Retry segment lỗi (202) |
| GET | `/books/:id/progress-stream` | JWT | SSE stream tiến độ |

## Async Flow

```
POST /books/:id/translate
  → BookService.startTranslation()
  → chapter-split-queue ← ChapterSplitWorker
      → ChineseTextChunker.chunk()
      → Segment[] saved to DB
      → translation-queue ← TranslationWorker (concurrency=5)
          → HFInferenceProvider.translate()
          → Segment.status = done/failed
          → Chapter.completedSegments++
          → Khi tất cả xong: reassemble → Chapter.translatedContent
          → BookStatus cập nhật
          → EventEmitter.emit('chapter.progress') → SSE push
```

## Dependency Inversion

- `TranslationWorker` inject `ITranslationProvider` qua token `'ITranslationProvider'`
- `ChapterSplitWorker` inject `IChunker` qua token `'IChunker'`
- Swap provider: chỉ đổi `useClass` trong `TranslationModule`, không sửa Worker

## Cài đặt & Chạy

```bash
cd backend
cp .env.example .env   # Điền HF_TOKEN, DB, Redis credentials
npm install
npm run build          # TypeScript compile
npm run start:dev      # Dev mode (hot reload)
npm test               # Unit tests
```

## Environment Variables

| Var | Default | Mô tả |
|-----|---------|-------|
| `NODE_ENV` | `development` | Bật synchronize TypeORM khi dev |
| `PORT` | `3000` | HTTP port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | DB user |
| `DB_PASSWORD` | `postgres` | DB password |
| `DB_DATABASE` | `novel_translation` | DB name |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `JWT_SECRET` | `change-me` | JWT signing secret |
| `HF_TOKEN` | — | HuggingFace API token |
