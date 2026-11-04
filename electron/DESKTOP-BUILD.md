# ساخت نسخه دسکتاپ ویندوز (ATLAS)

نسخه دسکتاپ یک **اینستالر آفلاین NSIS** است؛ کاربر به اینترنت، Node یا Bun نیاز ندارد.

## معماری

- `electron/main.js` — فرآیند اصلی Electron. **سرور را داخل خودش اجرا می‌کند** (بدون `spawn`، بدون `bun.exe`).
- `electron/server.cjs` — سرور HTTP خالص Node: فایل‌های SPA از `dist` را سرو می‌کند و `/api/projects` را روی یک فایل JSON می‌دهد.
  - داده‌ها در `%APPDATA%/atlas-fire-safety/data/projects.json` ذخیره می‌شوند.
  - پنجره روی `http://127.0.0.1:<port>` بارگذاری می‌شود (پورت آزاد، به‌صورت خودکار).
- `electron/make-desktop-dist.mjs` — بسته `dist-desktop` را می‌سازد:
  - پیشوند `/p/<projectId>/` (مخصوص پیش‌نمایش ابری) را به `/` تبدیل می‌کند. **بدون این کار همه CSS/JS با ۴۰۴ برمی‌گردند و پنجره سفید می‌شود.**
  - فونت‌های فارسی وزیرمتن را دانلود و به‌صورت محلی باندل می‌کند تا اپ کاملاً آفلاین باشد.
  - آرشیوهای زائد (`*.zip`, `*.tar.gz`) را از بسته حذف می‌کند (حجم اینستالر از ۴۱۶MB به ۸۹MB رسید).

## پیش‌نیازها (فقط برای ساخت، نه برای اجرا)

- Linux با `wine`/`wine32` (برای `rcedit` روی آیکون exe) — نصب: `apt-get install -y --no-install-recommends wine wine64 wine32:i386` پس از `dpkg --add-architecture i386`
- `npm install` داخل پوشه `electron/`

## دستور ساخت

```bash
cd electron
node make-desktop-dist.mjs      # 1) ساخت بسته آفلاین dist-desktop
npx electron-builder --win nsis --x64   # 2) ساخت اینستالر
```

خروجی: `release/ATLAS - Fire Protection Design Setup 1.0.0.exe`

## نکات

- اینستالر **امضا نشده** است؛ ویندوز ممکن است پیام SmartScreen نشان دهد → «More info» → «Run anyway».
- برای دیدن پنجره در حالت توسعه: `NODE_ENV=development npx electron .` (نیاز به Vite روی پورت 5173).
