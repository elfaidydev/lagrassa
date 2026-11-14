# لا غراسا — منيو رقمي

موقع ثابت (HTML/CSS/JS) لعرض منيو المطعم على التابلت أو عبر QR.

## تشغيل محلي

```bash
npm install
npm start
```

يفتح على `http://localhost:3000`.

## البناء للنشر (GitHub Pages أو أي استضافة ثابتة)

```bash
npm install
npm run build
```

المخرجات في مجلد `dist/` — ارفعه كما هو (أو اربطه بـ GitHub Pages من فرع `gh-pages` أو من مجلد `/docs` حسب إعدادات الريبو).

```bash
npm run preview   # معاينة dist على http://localhost:4173
```

### GitHub Pages (مثال)

1. ارفع المشروع على الريبو الذي سترسله.
2. **Settings → Pages → Build and deployment**: اختر المصدر **GitHub Actions** (لو Deploy فشل بـ 404، الصفحة كانت غير مفعّلة — فعّلها من الرابط أعلاه ثم أعد تشغيل الـ workflow).
3. عند كل `push` على `main` (أو `master`)، الوركفلو `.github/workflows/deploy-pages.yml` يشغّل `npm run build` وينشر مجلد `dist/`.
4. المسارات في المشروع نسبية (`./`) وتعمل من جذر الدومين أو من مسار فرعي مثل `https://user.github.io/repo-name/`.

### ما الذي يُستبعد من البناء؟

- `node_modules/` وملفات السيرفر المحلي
- `assets/img/` (صور ديمو قديمة غير مستخدمة)
- `assets/logo.svg` (غير مستخدم)
- `.DS_Store` و`.env`

## التخزين المؤقت للصور

- **Intro**: يحمّل فقط شاشة البداية + صور قسم **باستا** قبل رفع الستارة.
- **أثناء العرض**: كل صنف يبدأ بطبق فاضي (`placeholder-plate.svg`) مع مؤشر تحميل صغير، ثم تستبدل بالصورة عند الجاهزية.
- **Service Worker** (`sw.js`): `menu.json` وملفات الواجهة **network-first** (تحديث فوري بعد النشر)، والصور **cache + تحديث بالخلفية** للسرعة.
- **بعد الإنترو**: باقي الأقسام تُحمّل في الخلفية (`requestIdleCallback`).
- **`npm run build`**: يولّد `BUILD_ID` تلقائياً من محتوى المنيو والملفات ويحذف كاش النسخ القديمة على الأجهزة عند فتح الرابط.

## محتوى المنيو

عدّل `menu.json` ثم أعد `npm run build`. الصور في `assets/products/`.
