# Rota 81 kalıcı kayıt kurulumu

## 1. Veritabanı tablosunu oluşturun

Supabase projesinde **SQL Editor → New query** sayfasını açın. `supabase/schema.sql` dosyasının tamamını yapıştırıp **Run** düğmesine basın. Bu tablo, her oturum açmış kullanıcı için yalnızca kendi planlayıcı verisini saklar.

## 2. E-posta doğrulama adreslerini ayarlayın

Supabase **Authentication → URL Configuration** bölümünde:

- **Site URL:** üretim uygulamasının kalıcı adresi (ör. `https://v2-rota81.vercel.app`)
- **Redirect URLs:** aynı adres ve önizleme için `https://v2-rota81.vercel.app/**`

Yalnızca gerçekten kullandığınız Vercel alan adlarını izin listesine ekleyin. E-posta doğrulama açık kalabilir.

## 3. Değişkenleri ekleyin

Supabase **Connect** penceresinden Project URL ve publishable key değerlerini alın. Proje klasöründe `.env.local` dosyası oluşturup şunları girin:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Aynı iki değişkeni Vercel’de **v2-rota81 → Settings → Environment Variables** bölümüne **Production** ve **Preview** için ekleyin, ardından yeniden deploy edin. Gizli `sb_secret_...` anahtarını tarayıcı değişkeni olarak eklemeyin.

## 4. İlk giriş ve eski kayıtların aktarımı

Eski rehber bilgilerini tuttuğunuz aynı tarayıcı ve aynı Vercel adresinden uygulamayı açın. Önce **Arşivle (.json)** ile yedek alın. İlk kez giriş yaparken **Hesap oluştur** seçeneğini kullanın; doğrulama e-postasındaki bağlantıdan sonra uygulamaya dönüp giriş yapın. İlk bulut kaydı, o tarayıcıdaki mevcut uygulama durumunu Supabase'e aktarır. Alt köşede bulut kaydı başarıyla göründüğünü doğrulamadan tarayıcı verilerini temizlemeyin.

Diğer bilgisayar ve tarayıcılarda aynı hesapla giriş yapın. Değişiklikler otomatik olarak hesabınıza kaydedilir. Ek yedek için uygulamanın JSON dışa aktarma özelliğini kullanmaya devam edin.
