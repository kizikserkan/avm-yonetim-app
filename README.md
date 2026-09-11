# AVM Yönetim Uygulaması

Mağaza kiracılarının **arıza bildirimi** ve **yeni personel bildirimi**
gönderebildiği, sizin (AVM yönetimi) tüm bildirimleri görüp **duyuru
yayınlayabildiğiniz** bir Android uygulaması.

Bu klasör tam çalışan bir uygulamanın kaynak kodudur. Aşağıdaki adımları
sırayla uygulayarak **gerçek, telefona kurulabilir bir .apk dosyası**
elde edeceksiniz. Hepsi ücretsizdir, kredi kartı gerekmez.

Toplam süre: ~20-30 dakika (çoğu bekleme).

---

## Genel bakış — nasıl çalışıyor?

- **Mağaza girişi:** Her kiracıya bir "mağaza kodu" ve "şifre (PIN)"
  verirsiniz. Kiracı bu bilgilerle uygulamaya girer; arıza bildirir,
  yeni personel bildirir, sizin yayınladığınız duyuruları görür.
- **Yönetim girişi:** Siz kendi şifrenizle girersiniz; tüm mağazaların
  arıza taleplerini görür, durumlarını (Açık / İşlemde / Çözüldü)
  güncellersiniz, personel bildirimlerini görür, mağaza ekler/silersiniz
  ve **duyuru yayınlarsınız**.
- Veriler **Firebase (Google'ın ücretsiz bulut veritabanı)** üzerinde
  saklanır — böylece herkesin gördüğü veriler anlık olarak güncellenir.
- Uygulama, **GitHub Actions** adında ücretsiz bir servis kullanılarak
  otomatik olarak gerçek bir `.apk` dosyasına dönüştürülür.

---

## 1) Firebase projesi oluşturun (ücretsiz)

1. https://console.firebase.google.com adresine gidip Google hesabınızla
   giriş yapın.
2. **"Proje ekle" (Add project)** deyip bir isim verin (örn: `avm-yonetim`).
   Google Analytics'i kapatabilirsiniz, gerekli değil.
3. Proje açıldıktan sonra sol menüden **Build > Firestore Database**'e
   girin, **"Create database"** deyin, konum olarak size yakın bir
   bölge seçin (örn. `eur3 (europe-west)`), **"Start in production
   mode"** seçeneğiyle devam edin.
4. Firestore açıldıktan sonra üstteki **"Rules"** sekmesine gidin,
   içeriği silip bu depodaki **`firestore.rules`** dosyasının içeriğini
   yapıştırın ve **"Publish"** deyin.
5. Sol menüden **Build > Authentication**'a girin, **"Get started"**
   deyin, **"Sign-in method"** sekmesinden **"Anonymous"** sağlayıcısını
   bulup **etkinleştirin (Enable)** ve kaydedin.
   (Bu, uygulamanın arka planda otomatik ve şifresiz bir "oturum"
   açmasını sağlar; kiracılar bunu hiç görmez.)
6. Sol üstteki dişli simgesinden **"Project settings"**e girin, en alta
   inip **"Your apps"** bölümünde **`</>` (Web)** simgesine tıklayın,
   bir takma ad girip **"Register app"** deyin.
7. Karşınıza çıkan `firebaseConfig = {...}` kod bloğunu kopyalayın.

## 2) Firebase bilgilerinizi projeye yapıştırın

Bu depodaki **`www/firebase-config.js`** dosyasını açın ve 1. adımda
kopyaladığınız değerlerle `BURAYA_...` yazan yerleri değiştirin.
Örnek:

```js
const firebaseConfig = {
  apiKey: "AIzaSyD...........",
  authDomain: "avm-yonetim.firebaseapp.com",
  projectId: "avm-yonetim",
  storageBucket: "avm-yonetim.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

## 3) Kodu GitHub'a yükleyin

1. https://github.com adresinde ücretsiz bir hesap açın (yoksa).
2. Sağ üstten **"+" > "New repository"** ile yeni, **boş** bir repo
   oluşturun (örn. adı: `avm-yonetim-app`). "Public" veya "Private"
   fark etmez, ikisi de ücretsizdir.
3. Bilgisayarınızda bu proje klasöründe bir terminal açıp şu komutları
   sırayla çalıştırın (GitHub'ın size verdiği repo adresini kullanın):

```bash
git init
git add .
git commit -m "İlk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/avm-yonetim-app.git
git push -u origin main
```

> Terminal kullanmaya alışkın değilseniz: GitHub'ın web arayüzünden
> "uploading an existing file" seçeneğiyle bu klasördeki tüm dosya ve
> alt klasörleri (gizli `.github` klasörü dahil) sürükleyip
> bırakabilirsiniz.

## 4) APK otomatik olarak oluşsun

Kod GitHub'a yüklendiği anda, depodaki `.github/workflows/build-apk.yml`
dosyası devreye girer ve GitHub'ın ücretsiz sunucularında uygulamanızı
gerçek bir `.apk` dosyasına derler.

1. GitHub'da reponuzun üstündeki **"Actions"** sekmesine gidin.
2. **"APK Oluştur"** adlı çalışmayı göreceksiniz (birkaç dakika sürer,
   sarı nokta biterse yeşil tik olur).
3. Çalışma bitince üzerine tıklayın, en altta **"Artifacts"** bölümünde
   **`avm-yonetim-apk`** dosyasını indirin. İndirdiğiniz `.zip`
   dosyasının içinden **`app-debug.apk`** çıkacak — işte kurulabilir
   uygulamanız bu.

## 5) Telefona kurma

Android telefonda: indirdiğiniz `app-debug.apk` dosyasını açın. Telefon
"bilinmeyen kaynaklardan yükleme" izni isteyecektir (Play Store dışından
kurulum olduğu için normaldir) — izin verip kurulumu tamamlayın. Aynı
apk dosyasını tüm mağaza kiracılarınıza WhatsApp, e-posta vb. ile
gönderebilirsiniz.

## 6) İlk kullanım

1. Uygulamayı açın, **"Yönetim Girişi"**ni seçin, istediğiniz bir şifre
   girin — **ilk girişte yazdığınız şifre kalıcı yönetici şifreniz
   olarak kaydedilir.** Bu şifreyi bir yere not edin.
2. Yönetici panelinde **"Mağazalar"** sekmesinden **+** ile her kiracı
   için bir **mağaza kodu** (örn. `M101`) ve **şifre (PIN)** (örn.
   `1234`) tanımlayın.
3. Bu kod ve PIN'i ilgili kiracıya iletin — kiracı **"Mağaza Girişi"**
   ile bu bilgilerle uygulamaya girip arıza/personel bildirimi yapabilir.
4. **"Duyurular"** sekmesinden istediğiniz zaman tüm kiracıların anında
   göreceği bir duyuru yayınlayabilirsiniz.

---

## Güncelleme yapmak isterseniz

Kod üzerinde değişiklik yapıp (örn. yeni bir arıza kategorisi eklemek)
`git push` ile GitHub'a gönderdiğinizde, yeni bir `.apk` otomatik olarak
"Actions" sekmesinde oluşur. Bana da tekrar gelip "şunu ekle/değiştir"
diyebilirsiniz; ben kodu güncleyip size tekrar gönderirim, siz sadece
GitHub'a yeniden yüklersiniz.

## Bilinen sınırlamalar (dürüstçe belirtelim)

- Bu, bir **başlangıç (MVP) sürümüdür**. Mağaza girişleri basit bir
  kod+PIN sistemidir; çok teknik bir kullanıcı, tarayıcı geliştirici
  araçlarıyla teorik olarak başka bir mağazanın verisine erişebilir.
  Normal kullanımda (kiracılarınız uygulamayı olduğu gibi kullandığı
  sürece) bu bir sorun yaratmaz. İleride tam izole, banka seviyesinde
  güvenlik isterseniz, her mağaza için ayrı kimlik doğrulama (Firebase
  Authentication + sunucu taraflı kurallar) eklenebilir — isterseniz bu
  geliştirmeyi de birlikte yapabiliriz.
- Üretilen `.apk` bir "debug" imzalıdır — Google Play Store'a yüklemek
  için değil, doğrudan telefonlara kurmak (sideload) için uygundur. Play
  Store'da yayınlamak isterseniz ayrı bir imzalama süreci gerekir, bunu
  da birlikte kurgulayabiliriz.
- Firebase'in ücretsiz katmanı (Spark planı) bu kullanım ölçeği
  (bir AVM'nin mağaza sayısı) için fazlasıyla yeterlidir.
