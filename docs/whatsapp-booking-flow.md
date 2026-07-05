# دليل التشغيل - نظام الحجز التلقائي الكامل

## 1. رفع الباك إند
1. ارفع مجلد `dental-booking` على Railway (نفس طريقة مشروع n8n عندك).
2. أنشئ قاعدة بيانات PostgreSQL على Railway.
3. عدّل `.env` بالقيم الحقيقية (`DATABASE_URL`, `GREEN_API_ID_INSTANCE`, `GREEN_API_TOKEN`).
4. طبّق المخططين بالترتيب:
   ```
   psql "$DATABASE_URL" -f database/001_initial_schema.sql
   psql "$DATABASE_URL" -f database/002_conversation_state.sql
   ```
5. ثبّت الحزم وشغّل:
   ```
   npm install
   npm start
   ```
6. تأكد يشتغل: `https://your-app.up.railway.app/health` لازم يرجع `{ "ok": true }`.
   السكجولر (التذكير التلقائي) يشتغل تلقائياً مع السيرفر، يفحص كل ساعة.

## 2. ربط n8n (صار بسيط جداً الحين)
كل منطق المحادثة (تسجيل مريض، عرض الخدمات، حساب الأوقات، تثبيت الحجز، الإلغاء)
صار داخل الباك إند بملف `server/whatsapp-bot.js`. الـ workflow صار 3 خطوات بس:

1. **Webhook** يستقبل من Green API.
2. **Function node** يستخرج `whatsapp_number` و `text`.
3. **HTTP Request** إلى `{{BACKEND_URL}}/api/whatsapp/incoming` يرجعله `{ reply }`.
4. **HTTP Request** ثاني يرسل الـ `reply` عبر Green API `sendMessage`.

الخطوات:
1. بلوحة n8n: **Import from File** → اختار `n8n/workflows/booking-flow.json`.
2. ضيف Environment Variables بـ n8n: `BACKEND_URL`, `GREEN_API_ID_INSTANCE`, `GREEN_API_TOKEN`.
3. فعّل الـ workflow، انسخ رابط الـ webhook.
4. اربطه بلوحة Green API كـ Incoming Webhook.

## 3. تدفق المحادثة الكامل (مبني بالكود)
1. مريض جديد يكتب أي شي → يسأله عن اسمه → يسجله.
2. يعرضله قائمة الخدمات مرقمة → يختار برقم.
3. يسأله عن اليوم المناسب ("اليوم"/"بكرة"/تاريخ) → يعرضله الأوقات المتاحة فعلياً حسب دوام الطبيب.
4. يختار الوقت برقم → ينحجز الموعد فوراً بقاعدة البيانات (مع حماية من التعارض).
5. أي وقت يكدر يكتب "الغاء" → يعرضله مواعيده القادمة → يلغي الي يريده.
6. تذكير تلقائي عبر واتساب قبل 24 ساعة من كل موعد (سكجولر بالسيرفر).

## 4. اختبار محلي بدون واتساب فعلي
تكدر تختبر منطق البوت مباشرة بـ curl:
```bash
curl -X POST https://your-app.up.railway.app/api/whatsapp/incoming \
  -H "Content-Type: application/json" \
  -d '{"whatsapp_number":"9647701234567","text":"مرحبا"}'
```
جرب ترسل رسائل متتالية بنفس الرقم وتابع كيف يتغير الرد حسب كل خطوة.

## 5. الخطوة الجاية (اختيارية)
- ربط لوحة استقبال (واجهة React) تعرض المواعيد لحظياً بدل ما يشوفها المدير بقاعدة البيانات مباشرة.
- دعم أكثر من طبيب (الكود جاهز بس محدد بطبيب واحد بالـ MVP، بخطوة `getSingleDoctor`).
- إضافة صلاحيات ومصادقة (JWT) قبل ربط أي لوحة إدارة فعلية بالإنتاج.

## 6. تشغيل لوحة الاستقبال (الواجهة)

1. أنشئ أول مستخدم مدير بعد رفع الباك إند:
   ```
   BOOTSTRAP_ADMIN_USERNAME=admin BOOTSTRAP_ADMIN_PASSWORD=غيّرها_قبل_الإنتاج npm run create-admin
   ```
2. جهّز الواجهة محلياً للتجربة:
   ```
   cd frontend
   npm install
   cp .env.example .env   # عدّل VITE_API_URL لرابط الباك إند
   npm run dev
   ```
3. للنشر: `npm run build` بمجلد frontend يطلعلك مجلد `dist` تكدر ترفعه على Railway (كـ static site) أو Vercel أو Netlify.

⚠️ ملاحظة: بيئة التطوير الحالية ما عندها اتصال إنترنت، فما كدرت أشغّل `npm install` و`npm run build` فعلياً هنا لأتحقق منها. راجع الكود قبل النشر الفعلي، وشغّل `npm run build` بجهازك للتأكد قبل لا ترفعها.
