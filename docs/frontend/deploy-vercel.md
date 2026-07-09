# Deploy frontend len Vercel

Tai lieu nay ap dung cho frontend trong thu muc `frontend/` cua repo nay.

## 1. Trang thai code hien tai

Frontend da duoc chinh de phu hop voi Vercel:

- `frontend/vite.config.ts` dung `base: '/'`
- `frontend/src/App.tsx` lay `basename` tu `import.meta.env.BASE_URL`
- `frontend/vercel.json` da rewrite moi route ve `index.html` de React Router khong bi 404 khi refresh

Backend hien dang duoc fallback toi:

- `https://plxg-novel-backend-production.up.railway.app`

Neu muon doi backend, chi can set `VITE_API_URL` tren Vercel.

## 2. Cach deploy bang Vercel Dashboard

1. Push code len GitHub.
2. Vao `https://vercel.com/new`.
3. Import repository `plxg-novel`.
4. O buoc cau hinh project:
   - Framework Preset: `Vite`
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. Trong phan Environment Variables, them:
   - `VITE_API_URL=https://plxg-novel-backend-production.up.railway.app`
6. Bam `Deploy`.

## 3. Cach deploy bang Vercel CLI

Chay tu root repo:

```bash
cd /Users/plxg/workspace/plxg-novel/frontend
vercel login
vercel
```

Khi CLI hoi:

- Set up and deploy: `Y`
- Scope: chon account/team cua ban
- Link to existing project: chon theo nhu cau
- Project name: vi du `plxg-novel-frontend`
- Directory: giu nguyen vi dang dung trong `frontend/`

Sau khi tao project, them env:

```bash
vercel env add VITE_API_URL production
vercel env add VITE_API_URL preview
```

Gia tri:

```bash
https://plxg-novel-backend-production.up.railway.app
```

Deploy production:

```bash
vercel --prod
```

## 4. Nhung diem can kiem tra sau deploy

1. Mo domain Vercel va test cac route:
   - `/`
   - `/login`
   - `/register`
   - `/books/:bookId`
2. Refresh truc tiep o route con de xac nhan khong bi 404.
3. Dang nhap va kiem tra tab Network xem request da di toi backend Railway chua.
4. Neu request loi:
   - xem `VITE_API_URL` da dung chua
   - xem backend Railway co dang chay khong
   - kiem tra tren browser console co loi mixed content hay khong

## 5. Khi nao can doi them

- Neu backend doi domain, cap nhat `VITE_API_URL` tren Vercel roi redeploy.
- Neu muon dung custom domain, gan domain trong dashboard Vercel sau khi deployment thanh cong.
- Neu sau nay can deploy app duoi subpath thay vi root domain, doi `base` trong `vite.config.ts` va dam bao `BASE_URL` khop voi path do.
