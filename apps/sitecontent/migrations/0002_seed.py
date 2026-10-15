from django.db import migrations

PRIVACY = {
    'az': ('Məxfilik siyasəti', """Kursum (kursum.cloud) müəllimlərin test hazırlayıb onlayn və kağız imtahan keçirməsi üçün platformadır. Bu səhifə hansı məlumatları topladığımızı, onlardan necə istifadə etdiyimizi və necə qoruduğumuzu izah edir.

## Hansı məlumatları toplayırıq
- Müəllimlər: ad, soyad, e-poçt, şifrə (yalnız şifrələnmiş şəkildə), istəyə görə fənn, təşkilat, telefon və profil şəkli.
- Şagirdlər: müəllimin daxil etdiyi ad, soyad, istifadəçi adı və şifrə. Şagirddən e-poçt tələb olunmur.
- Təhsil məlumatları: testlər, suallar, şəkillər, siniflər, imtahan cavabları, ballar və nəticələr.
- İmtahan zamanı başqa tab-a keçid sayı. Bu sayğac yalnız müəllimə nəticəni qiymətləndirməkdə kömək edir.
- Ödəniş: köçürmə çekinin şəkli və məbləğ. Kart məlumatlarınızı biz saxlamırıq.
- Texniki məlumatlar: IP ünvanı və brauzer məlumatı. Bunları təhlükəsizlik üçün (məs. şifrə təxmin cəhdlərinin qarşısını almaq) istifadə edirik.

## Məlumatlardan necə istifadə edirik
- Hesabınızı yaratmaq və sizi sistemə daxil etmək üçün.
- İmtahanları keçirmək, cavabları yoxlamaq, nəticə və karneləri göstərmək üçün.
- Abunəliyi idarə etmək və ödənişləri təsdiqləmək üçün.
- Vacib bildirişlər göndərmək üçün (e-poçt təsdiqi, şifrənin bərpası).
- Məlumatlarınızı satmırıq və reklam üçün istifadə etmirik.

## Kim görə bilər
- Şagirdin məlumatlarını və nəticələrini yalnız onu əlavə edən müəllim görür.
- Şagird yalnız öz nəticələrini, müəllimin icazə verdiyi qədər görür.
- Platformanın administratorları məlumatlara yalnız texniki dəstək və ödəniş yoxlaması üçün baxır.

## Saxlanma və təhlükəsizlik
- Məlumatlar qorunan serverdə saxlanır və bütün əlaqə HTTPS ilə şifrələnir.
- Şifrələr geri açılmayan şəkildə saxlanır, onları heç kim, o cümlədən biz də görə bilmirik.
- Müəllim sual, test və ya şagirdi silərkən onlara aid şəkillər də silinir.

## Uşaqların məlumatları
Şagird hesablarını müəllim yaradır. Müəllim şagirdin məlumatlarını daxil etməzdən əvvəl lazım olduqda valideyn və ya məktəbin razılığını almağa cavabdehdir.

## Hüquqlarınız
Məlumatlarınızın düzəldilməsini və ya hesabınızın silinməsini istəyə bilərsiniz. Bunun üçün saytın aşağı hissəsindəki əlaqə vasitələri ilə bizə yazın.

## Dəyişikliklər
Bu siyasəti yeniləyə bilərik. Ən son versiya həmişə bu səhifədədir, yenilənmə tarixi yuxarıda göstərilir."""),
    'ru': ('Политика конфиденциальности', """Kursum (kursum.cloud) — платформа, на которой учителя создают тесты и проводят онлайн- и бумажные экзамены. Здесь описано, какие данные мы собираем, как их используем и защищаем.

## Какие данные мы собираем
- Учителя: имя, фамилия, e-mail, пароль (только в зашифрованном виде), по желанию предмет, организация, телефон и фото профиля.
- Ученики: имя, фамилия, логин и пароль, которые вводит учитель. E-mail ученика не требуется.
- Учебные данные: тесты, вопросы, изображения, классы, ответы на экзаменах, баллы и результаты.
- Количество переключений вкладки во время экзамена — только чтобы помочь учителю оценить результат.
- Оплата: снимок чека перевода и сумма. Данные вашей карты мы не храним.
- Технические данные: IP-адрес и сведения о браузере — для безопасности (например, защиты от подбора пароля).

## Как мы используем данные
- Чтобы создать аккаунт и обеспечить вход в систему.
- Чтобы проводить экзамены, проверять ответы, показывать результаты и табели.
- Чтобы управлять подпиской и подтверждать оплату.
- Чтобы отправлять важные уведомления (подтверждение e-mail, восстановление пароля).
- Мы не продаём ваши данные и не используем их для рекламы.

## Кто видит данные
- Данные и результаты ученика видит только учитель, который его добавил.
- Ученик видит только свои результаты — в объёме, разрешённом учителем.
- Администраторы платформы обращаются к данным только для техподдержки и проверки оплаты.

## Хранение и безопасность
- Данные хранятся на защищённом сервере, всё соединение шифруется по HTTPS.
- Пароли хранятся в необратимом виде — их не видит никто, включая нас.
- При удалении вопроса, теста или ученика связанные с ними изображения тоже удаляются.

## Данные детей
Аккаунты учеников создаёт учитель. При необходимости учитель отвечает за получение согласия родителей или школы перед вводом данных ученика.

## Ваши права
Вы можете попросить исправить данные или удалить аккаунт. Для этого свяжитесь с нами через контакты внизу сайта.

## Изменения
Мы можем обновлять эту политику. Актуальная версия всегда на этой странице, дата обновления указана выше."""),
    'en': ('Privacy policy', """Kursum (kursum.cloud) is a platform where teachers build tests and run online and paper exams. This page explains what data we collect, how we use it and how we protect it.

## What we collect
- Teachers: first and last name, email, password (stored only in hashed form) and, optionally, subject, organization, phone and profile picture.
- Students: the first and last name, username and password entered by their teacher. No student email is required.
- Learning data: tests, questions, images, classes, exam answers, scores and results.
- How many times a student leaves the exam tab — only to help the teacher judge the result.
- Payments: a picture of the transfer receipt and the amount. We do not store your card details.
- Technical data: IP address and browser details, used for security (for example, to stop password guessing).

## How we use it
- To create your account and sign you in.
- To run exams, grade answers and show results and report cards.
- To manage your subscription and confirm payments.
- To send essential messages (email confirmation, password reset).
- We do not sell your data or use it for advertising.

## Who can see it
- A student's data and results are visible only to the teacher who added them.
- Students see only their own results, as far as their teacher allows.
- Platform administrators access data only for technical support and payment checks.

## Storage and security
- Data is kept on a protected server and every connection is encrypted with HTTPS.
- Passwords are stored one-way; nobody, including us, can read them.
- When a teacher deletes a question, test or student, the related images are deleted too.

## Children's data
Student accounts are created by teachers. Where required, the teacher is responsible for getting consent from parents or the school before entering a student's data.

## Your rights
You can ask us to correct your data or delete your account — contact us using the details at the bottom of the site.

## Changes
We may update this policy. The latest version is always on this page, with the update date shown above."""),
}

TERMS = {
    'az': ('İstifadə şərtləri', """Kursum platformasında qeydiyyatdan keçməklə və ondan istifadə etməklə aşağıdakı şərtləri qəbul etmiş olursunuz.

## Xidmət
Kursum müəllimlərə test hazırlamaq, sual bankı saxlamaq, onlayn və kağız imtahan keçirmək, nəticələri və analitikanı görmək imkanı verir.

## Hesablar
- Müəllim hesabını özü yaradır və məlumatlarının düzgünlüyünə cavabdehdir.
- Şagird hesablarını müəllim yaradır və şagirdlərin giriş məlumatlarını onlara özü çatdırır.
- Şifrənizi başqası ilə paylaşmayın. Hesabınızdakı bütün əməliyyatlara siz cavabdehsiniz.

## Abunəlik və ödəniş
- Yeni müəllimə bir dəfə pulsuz sınaq müddəti verilir.
- Sınaqdan sonra platformadan istifadə etmək üçün tariflərdən birini seçib ödəniş etmək lazımdır. Tarif limitləri (şagird, sinif, imtahan sayı) qiymətlər bölməsində göstərilib.
- Ödəniş köçürmə ilə edilir və çek yoxlanıldıqdan sonra abunəlik aktivləşir.
- Abunəliyi istənilən vaxt ləğv edə bilərsiniz. Ödənilmiş müddətin sonunadək platformadan istifadə etməyə davam edirsiniz.

## Məzmun
- Yüklədiyiniz suallar, şəkillər və testlər sizə məxsusdur. Onları yalnız xidməti göstərmək üçün saxlayırıq.
- Başqasının müəllif hüququnu pozan, qanunsuz və ya təhqiredici məzmun yükləmək qadağandır.

## Qadağan olunan istifadə
- Sistemə icazəsiz daxil olmağa, başqasının hesabını ələ keçirməyə və ya serveri yükləməyə cəhd etmək.
- Platformanın kodunu və ya məlumatlarını avtomatik vasitələrlə toplamaq.
- Bu şərtləri pozan hesab xəbərdarlıqsız dayandırıla bilər.

## Məsuliyyət
Platformanın fasiləsiz işləməsi üçün çalışırıq, lakin texniki fasilələr ola bilər. Nəticələrin pedaqoji qiymətləndirilməsi müəllimin məsuliyyətindədir.

## Dəyişikliklər
Bu şərtləri yeniləyə bilərik. Dəyişikliklərdən sonra platformadan istifadəni davam etdirmək yeni şərtləri qəbul etmək deməkdir.

## Əlaqə
Suallarınız üçün saytın aşağı hissəsindəki əlaqə vasitələri ilə bizə yazın."""),
    'ru': ('Условия использования', """Регистрируясь и пользуясь платформой Kursum, вы принимаете следующие условия.

## Сервис
Kursum позволяет учителям создавать тесты, вести банк вопросов, проводить онлайн- и бумажные экзамены, смотреть результаты и аналитику.

## Аккаунты
- Учитель создаёт аккаунт сам и отвечает за правильность своих данных.
- Аккаунты учеников создаёт учитель и сам передаёт им данные для входа.
- Не передавайте пароль другим. Вы отвечаете за все действия в своём аккаунте.

## Подписка и оплата
- Новому учителю один раз даётся бесплатный пробный период.
- После пробного периода для работы нужно выбрать тариф и оплатить его. Лимиты тарифов (ученики, классы, экзамены) указаны в разделе цен.
- Оплата производится переводом, подписка активируется после проверки чека.
- Подписку можно отменить в любой момент; доступ сохраняется до конца оплаченного периода.

## Контент
- Загруженные вами вопросы, изображения и тесты принадлежат вам; мы храним их только для работы сервиса.
- Запрещено загружать контент, нарушающий чужие авторские права, незаконный или оскорбительный.

## Запрещённое использование
- Попытки несанкционированного доступа, взлома чужих аккаунтов или перегрузки сервера.
- Автоматический сбор кода или данных платформы.
- Аккаунт, нарушающий эти условия, может быть заблокирован без предупреждения.

## Ответственность
Мы стремимся к бесперебойной работе платформы, но технические перерывы возможны. Педагогическая оценка результатов остаётся за учителем.

## Изменения
Мы можем обновлять эти условия. Продолжая пользоваться платформой после изменений, вы принимаете новые условия.

## Контакты
По вопросам пишите нам через контакты внизу сайта."""),
    'en': ('Terms of use', """By registering on and using Kursum you agree to the following terms.

## The service
Kursum lets teachers build tests, keep a question bank, run online and paper exams, and see results and analytics.

## Accounts
- Teachers create their own accounts and are responsible for keeping their details accurate.
- Student accounts are created by the teacher, who passes the sign-in details on to the students.
- Do not share your password. You are responsible for everything done in your account.

## Subscription and payment
- New teachers get a free trial once.
- After the trial, a plan has to be chosen and paid for. Plan limits (students, classes, exams) are shown in the pricing section.
- Payment is made by bank transfer; the subscription starts once the receipt has been checked.
- You can cancel at any time and keep access until the end of the paid period.

## Content
- The questions, images and tests you upload belong to you; we store them only to provide the service.
- Uploading content that infringes someone else's copyright, is unlawful or is abusive is not allowed.

## Prohibited use
- Trying to gain unauthorized access, take over other accounts or overload the server.
- Scraping the platform's code or data with automated tools.
- Accounts that break these terms may be suspended without notice.

## Liability
We work to keep the platform running without interruption, but technical downtime can happen. Judging results pedagogically remains the teacher's responsibility.

## Changes
We may update these terms. Continuing to use the platform after a change means you accept the new terms.

## Contact
For questions, contact us using the details at the bottom of the site."""),
}


def seed(apps, schema_editor):
    SiteSettings = apps.get_model('sitecontent', 'SiteSettings')
    LegalPage = apps.get_model('sitecontent', 'LegalPage')
    SiteSettings.objects.get_or_create(pk=1, defaults={
        'whatsapp_number': '994703678873',
        'youtube_url': 'https://www.youtube.com/@kursumapp',
    })
    for order, (slug, texts) in enumerate((('privacy', PRIVACY), ('terms', TERMS))):
        if LegalPage.objects.filter(slug=slug).exists():
            continue
        fields = {'title': texts['az'][0], 'content': texts['az'][1], 'order': order}
        for lang, (title, content) in texts.items():
            fields[f'title_{lang}'] = title
            fields[f'content_{lang}'] = content
        LegalPage.objects.create(slug=slug, **fields)


class Migration(migrations.Migration):

    dependencies = [
        ('sitecontent', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
