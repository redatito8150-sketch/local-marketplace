# تقرير إصلاحات الأمن والاعتمادية — 10 أغسطس 2026

## الخلاصة التنفيذية

نُفذت سبع مراحل إصلاح داخل المستودع، دون تطبيق migrations أو الكتابة على قاعدة بيانات حية ودون نشر أو commit. أُغلقت أخطر المسارات المكتشفة في المصادقة والصلاحيات والطلبات والمخزون والخصوصية وحذف الحساب. الكود الحالي **ليس جاهزًا للنشر الإنتاجي بعد** حتى تُنفذ قائمة «المطلوب من المالك» أدناه على مشروع Staging منفصل وتُحسم النصوص القانونية.

## ما تم إصلاحه

1. **احتواء قاعدة البيانات:** تحييد migrationَي مسح البيانات، قفل جميع overloads القديمة لـ`place_order`، ومنع `anon/authenticated` من تشغيل RPC الطلبات.
2. **المصادقة:** فرض AAL2/MFA على الويب وواجهات API، استعادة تحدي MFA بعد reload، وحماية روابط الموبايل بـPKCE وstate أحادي الاستخدام وallowlist دقيقة.
3. **صلاحيات الإدارة والخصوصية العامة:** تطبيق الصلاحيات الدقيقة بدل `is_admin` العام، حماية hierarchy الأدوار، واستبدال القراءة العامة الواسعة بحدود أعمدة/واجهات عامة آمنة.
4. **سلامة الطلبات:** idempotency ذرية داخل DB، تحقق موجب للكميات والأسعار، تسعير مخدمي، منع token غير الصالح من التحول إلى guest، state machine للطلبات، وإصلاح عداد الكوبون والإلغاء بعد الشحن.
5. **المستودع والتخزين والمراجعات:** حجز مخزون المرتجعات، منع duplicate/omitted receive lines، idempotency للحركات، ضبط buckets وسياسات الرفع، قفل عداد SKU، ومنع مالك المراجعة من تعديل حقول الإشراف.
6. **الحساب والهوية والموبايل:** حذف حساب قابل للتدقيق مع تنقيح PII المحتفظ بها وطابور تنظيف Storage، مزامنة email، حماية reset-password، إصلاح schema drift لتسعير الموبايل، وإضافة خصومات المنتج/variant.
7. **المتبقي من سلامة التطبيق:** إزالة حذف المسودات من GET/RSC واستبداله بأرشفة يومية قابلة للاسترجاع، OTP ذري ومشفّر بـHMAC دون طباعة الأكواد، إصلاح العنوان الافتراضي، قيود catalog cross-product، منع تعديل البراند المعطّل، ربط/فك المالك ذريًا، وتنقية Discord/audit من PII وMarkdown injection.

أضيف أيضًا allowlist HTTPS دقيقة لعنوان API في الموبايل، قبول الشروط أثناء التسجيل مع version/time، وإصلاح أخطاء React Animated التي كانت تمنع mobile lint.

## نتائج التحقق المحلي

- Root TypeScript: ناجح.
- Root ESLint: 0 أخطاء، تحذيران قديمان في `components/reviews/ReviewActions.tsx` عن استخدام `location.href`.
- اختبارات Root المحلية: 347/347 ناجحة بعد استبعاد مجموعتي التكامل الحي.
- Mobile TypeScript: ناجح.
- Mobile ESLint: ناجح بلا أخطاء.
- Mobile tests: 30/30 ناجحة.
- `git diff --check`: ناجح.
- Next production build: compilation وTypeScript ناجحان، ثم فشل prerender عند `/new-arrivals` بسبب حظر اتصال Supabase من بيئة التنفيذ الحالية.
- محاكاة البوابة القانونية للإنتاج: فشلت كما هو مطلوب بسبب 16 placeholder قانونيًا غير محسوم.

لم تُشغل اختبارات `security.rls.test.ts` و`avatarLinking.test.ts` لأنها تحتاج Supabase حيًا وتنفذ عمليات كتابة/إنشاء مستخدمين. محاولة تشغيلها في البيئة المقيدة أعادت `fetch failed` فقط.

## المطلوب من المالك قبل الإنتاج

### P0 — ممنوع النشر قبل إتمامها

1. إنشاء backup موثوق لقاعدة البيانات، ثم مشروع **Staging disposable** منفصل. لا تشغّل `supabase db push` مباشرة على Production.
2. إصلاح migration history/baseline على Staging: السلسلة القديمة لا تزال غير قابلة لإعادة البناء من الصفر بشكل موثوق، والبيئة الحية كانت متوقفة عند تاريخ أقدم من ملفات Git. استخرج baseline من schema الحية بعد مراجعة، reconcile history، ثم اختبر replay كامل وschema diff يساوي صفرًا.
3. تطبيق migrations الجديدة `20260810000002` حتى `20260810000008` على Staging فقط أولًا، ومراجعة logs/counts وrollback plan قبل Production.
4. تشغيل مجموعتي الاختبار الحي على Staging، ثم اختبارات concurrency للطلب/الكوبون/المستودع وMFA وحذف الحساب وdeep links على أجهزة حقيقية.
5. استكمال 16 قيمة قانونية حقيقية في الصفحات بمراجعة قانونية. القائمة الدقيقة موجودة في `docs/legal-placeholders-todo.md`. بوابة Production ستمنع النشر حتى اكتمالها.

### إعدادات Supabase وStorage

6. مراجعة `pg_proc`, grants وRLS الحية والتأكد أن كل RPC حساس service-role only، وبالأخص جميع overloads لـ`place_order` وOTP والصيانة.
7. التحقق حيًا من buckets: `brand-application-documents` خاص، `review-images` بقيوده الجديدة، و`product-images` بإعدادات MIME/size/policies المناسبة.
8. ضبط redirect allowlist بروابط دقيقة فقط؛ حذف أي `https://*.vercel.app/auth/callback` عام. راجع email confirmation وSecure Email Change وMFA policies في Dashboard.

### Secrets والبنية التشغيلية

9. ضبط `CRON_SECRET` طويل في Vercel والتأكد أن `/api/cron/storage-cleanup` يعمل يوميًا؛ المهمة تنظف الملفات وتؤرشف المسودات المنتهية دون حذفها.
10. ضبط `EXPO_PUBLIC_API_BASE_URL` و`EXPO_PUBLIC_API_ALLOWED_HOST` على نفس hostname الإنتاجي الدقيق. التطبيق يرفض إرسال Bearer token لأي origin آخر.
11. أبقِ `SMS_VERIFICATION_ENABLED=false` حتى اختيار مزود SMS فعلي. عند التفعيل اضبط HTTPS endpoint وtoken و`PHONE_OTP_PEPPER` عشوائيًا بطول 32+ حرفًا، واختبر failover/rate limits.
12. أكمل Universal/App Links: AASA بـApple Team ID و`assetlinks.json` ببصمات SHA-256 لشهادات الإصدار، أضف مسارات الموبايل إلى Supabase، ثم نفذ native rebuild واختبار iOS/Android.
13. راجع صلاحيات قنوات Discord وretention/DPA. إن لم تُعتمد كوجهة تشغيلية، اترك webhooks غير مضبوطة؛ الكود no-op عند غيابها.

## مخاطر متبقية أو غير مثبتة

- migration baseline/history drift هو أكبر مانع تقني متبقٍ ولا يمكن حله بأمان دون schema/history الحية وStaging.
- لا يمكن إثبات RLS/grants/bucket flags الفعلية من Git وحده.
- إعدادات Supabase/Google/Vercel وملفات association خارج المستودع تحتاج تحققًا يدويًا.
- النصوص القانونية تحتاج صاحب قرار/مستشار قانوني؛ الإصلاح البرمجي يمنع نشر placeholders لكنه لا يخترع قيمًا قانونية.
- اختبار البناء النهائي يحتاج بيئة تستطيع الوصول إلى Supabase المخصص لـStaging.

## حالة المستودع

التغييرات غير staged وغير committed. الملف الموجود مسبقًا `.claude/settings.local.json` لم يُعدّل. لم يحدث أي deploy أو push أو كتابة على Production.
