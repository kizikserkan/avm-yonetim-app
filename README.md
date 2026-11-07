# Afium Portal

Mağaza kiracılarının **arıza bildirimi** ve **yeni personel bildirimi**
gönderebildiği, sizin (AVM yönetimi) tüm bildirimleri görüp **duyuru
yayınlayabildiğiniz** bir Android uygulaması.

Bu klasör tam çalışan bir uygulamanın kaynak kodudur. Aşağıdaki adımları
sırayla uygulayarak **gerçek, telefona kurulabilir bir .apk dosyası**
elde edeceksiniz. Hepsi ücretsizdir, kredi kartı gerekmez.

Toplam süre: ~20-30 dakika (çoğu bekleme).

---

## Genel bakış — nasıl çalışıyor?

- **Tek giriş ekranı:** Uygulamada artık tek bir "Kullanıcı Adı" / "Şifre"
  ekranı var — mağaza, teknik personel ve Yönetim hepsi aynı ekrandan
  giriş yapar, kim olduğunuzu sistem girdiğiniz kullanıcı adından
  otomatik anlar (ayrı "Mağaza Girişi" / "Yönetim Girişi" butonlarına
  gerek kalmadı).
- **Mağaza girişi:** Her kiracıya bir "mağaza kodu" ve "şifre (PIN)"
  verirsiniz; kiracı bunları kullanıcı adı/şifre olarak girer. Arıza
  bildirir, yeni personel bildirir, sizin yayınladığınız duyuruları
  görür.
- **Yönetim girişi:** Kullanıcı adı olarak `yonetim` veya `admin` yazıp kendi
  şifrenizle girersiniz; tüm mağazaların arıza taleplerini görür,
  durumlarını (Açık / İşlemde / Çözüldü) güncellersiniz, personel
  bildirimlerini görür, mağaza ekler/silersiniz ve **duyuru
  yayınlarsınız**.
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
   **`afium-portal-apk`** dosyasını indirin. İndirdiğiniz `.zip`
   dosyasının içinden **`app-debug.apk`** çıkacak — işte kurulabilir
   uygulamanız bu.

## 5) Telefona kurma

Android telefonda: indirdiğiniz `app-debug.apk` dosyasını açın. Telefon
"bilinmeyen kaynaklardan yükleme" izni isteyecektir (Play Store dışından
kurulum olduğu için normaldir) — izin verip kurulumu tamamlayın. Aynı
apk dosyasını tüm mağaza kiracılarınıza WhatsApp, e-posta vb. ile
gönderebilirsiniz.

## 6) İlk kullanım

1. Uygulamayı açın, giriş ekranında **Kullanıcı Adı** alanına `yonetim`
   (veya `admin`) yazın, **Şifre** alanına istediğiniz bir şifre girin — **ilk girişte
   yazdığınız şifre kalıcı yönetici şifreniz olarak kaydedilir.** Bu
   şifreyi bir yere not edin. (Ardından 2FA kurulumu istenir, bkz.
   aşağıdaki "İki aşamalı doğrulama" bölümü.)
2. Yönetici panelinde **"Mağazalar"** sekmesinden **+** ile her kiracı
   için bir **mağaza kodu** (örn. `M101`) ve **şifre (PIN)** (örn.
   `1234`) tanımlayın.
3. Bu kod ve PIN'i ilgili kiracıya iletin — kiracı aynı giriş ekranından
   **Kullanıcı Adı** olarak mağaza kodunu, **Şifre** olarak PIN'ini
   girip arıza/personel bildirimi yapabilir.
4. **"Duyurular"** sekmesinden istediğiniz zaman tüm kiracıların anında
   göreceği bir duyuru yayınlayabilirsiniz.

---

## 7) "Şifremi unuttum" — e-posta ile otomatik PIN sıfırlama

Mağaza giriş ekranında artık bir **"Şifremi unuttum?"** bağlantısı var.
Kiracı, mağaza kodunu ve size verdiği e-posta adresini girdiğinde sistem
otomatik olarak yeni bir PIN üretir, mağazanın kaydını günceller ve yeni
şifreyi mağazanın e-postasına gönderir. Siz de yönetim panelindeki
**"Mağazalar"** sekmesinin altında **"Şifre Sıfırlama Talepleri"**
listesinden kimin ne zaman şifre sıfırladığını görebilirsiniz.

Bunun çalışması için iki şey gerekir:

**A) Her mağazaya bir e-posta tanımlayın:**
Yönetim panelinde "Mağazalar" sekmesinde her kayıtta artık bir
**"Düzenle"** butonu var — mevcut mağazalarınızı açıp e-posta adreslerini
girin (e-postası olmayan mağazalarda uyarı görünür). Yeni eklediğiniz
mağazalarda e-posta alanı doğrudan formda mevcut.

**B) Ücretsiz bir EmailJS hesabı kurup bilgilerini projeye ekleyin:**
1. https://www.emailjs.com adresinde ücretsiz kaydolun (ayda 200 e-posta
   ücretsizdir, bu ölçek için fazlasıyla yeterli).
2. Sol menüden **"Email Services"** > **"Add New Service"** ile kendi
   Gmail/Outlook vb. hesabınızı bağlayın. Oluşan **Service ID**'yi not edin.
3. **"Email Templates"** > **"Create New Template"** ile yeni bir şablon
   oluşturun:
   - **To Email** alanına `{{to_email}}` yazın.
   - Konu/İçerik kısmına dilediğiniz metni yazıp içine `{{store_name}}`,
     `{{store_code}}` ve `{{new_pin}}` değişkenlerini ekleyin. Örnek:
     > Konu: Afium Portal - Yeni Şifreniz
     > İçerik: Merhaba {{store_name}} ({{store_code}}), yeni giriş
     > şifreniz: {{new_pin}}
   - Oluşan **Template ID**'yi not edin.
4. Sol üstten hesap adınıza tıklayıp **"Account"** > **"General"**
   sayfasından **Public Key**'i kopyalayın.
5. Bu depodaki **`www/emailjs-config.js`** dosyasını açıp üç
   `BURAYA_...` değerini bu üç bilgiyle değiştirin, kaydedip GitHub'a
   yükleyin (bkz. adım 3).

Bu ayarları yapmadan önce "Şifremi unuttum" denenirse, PIN yine de
sıfırlanır ve talep listede görünür, ama e-posta gönderilmez —
tarayıcı konsolunda bir uyarı yazar. Ayarları girip yeniden dağıttıktan
(GitHub'a push/upload) sonra e-postalar otomatik gitmeye başlar.

---

## 8) Duyuru push (anlık) bildirimleri — OneSignal + Cloudflare Worker

Yönetim bir duyuru yayınladığında, mağaza uygulaması kurulu olan tüm
telefonlara anlık bir bildirim gider (telefon kapalı/arka planda olsa
bile bildirim çubuğunda görünür). Bu, OneSignal (ücretsiz, kart
gerektirmeyen bir push bildirim servisi) ile kuruldu.

Tarayıcılar güvenlik nedeniyle, gönderim anahtarını doğrudan OneSignal'a
göndermemize izin vermiyor ("CORS" engeli). Bu yüzden aradan, isteği
bizim yerimize ileten küçük ve **tamamen ücretsiz, kart istemeyen** bir
"ara durak" geçirmemiz gerekiyor: **Cloudflare Workers**. Bunu bir kere
kurup unutacaksınız — sonrasında hiçbir işlem gerekmez.

### 8.1) Cloudflare hesabı açın

1. https://dash.cloudflare.com/sign-up adresine gidin, e-posta ve şifre
   ile ücretsiz hesap açın (kredi kartı istemez).
2. E-postanıza gelen doğrulama bağlantısına tıklayın.

### 8.2) Worker oluşturun

1. Cloudflare panelinde sol menüden **Workers & Pages**'e girin.
2. **Create** (veya **Create application** → **Workers** → **Create Worker**)
   düğmesine basın.
3. Worker'a bir isim verin, örneğin `afium-push`, **Deploy** deyin
   (şimdilik varsayılan örnek kodla oluşsun, birazdan değiştireceğiz).
4. Oluşan Worker'ın sayfasında **Edit code** (veya **</> Edit Code**)
   düğmesine basın; karşınıza bir kod düzenleyici gelecek.
5. Düzenleyicideki mevcut kodun tamamını silin, bu pakette gönderdiğim
   `cloudflare-worker.js` dosyasının **tamamını** yapıştırın.
6. Sağ üstten **Deploy** (veya **Save and Deploy**) deyin.

### 8.3) Gizli anahtarları girin

Worker'ın **Settings → Variables and Secrets** (bazı arayüzlerde
**Settings → Variables**) kısmına girin ve şu üç değeri ekleyin
(her biri için **Add variable/secret**):

| İsim | Tür | Değer |
|---|---|---|
| `ONESIGNAL_APP_ID` | Text (düz metin olabilir) | `255154af-5c0f-4d11-9feb-0429d0c1d1cd` |
| `ONESIGNAL_REST_API_KEY` | **Secret** (gizli) seçin | OneSignal → Settings → Keys & IDs → API Keys altında **"+ Add key"** ile oluşturduğunuz anahtarın değeri (`os_v2_app_...` ile başlar). **Önemli:** bu değer sadece oluşturulduğu an bir kere gösterilir, sonra bir daha görüntülenemez — kaybederseniz eskisini silip yenisini oluşturmanız gerekir. |
| `PUSH_SECRET` | **Secret** (gizli) seçin | `ca6d8f91e5a8b432df2c994b63d2fd24895151ab0c34c99e` |

Ekledikten sonra **Save/Deploy** deyip kaydedin, sonra **"Edit code"**
sekmesine girip (koda dokunmadan) tekrar **Deploy** deyin — değişkenlerin
gerçekten devreye girmesi için bu ikinci deploy gerekiyor.

**Not:** Eski ("Legacy API Key") anahtar burada işe yaramaz — Worker,
`https://api.onesignal.com/notifications` adresini kullanıyor ve bu adres
sadece yeni tip (`os_v2_app_...`) anahtarlarla çalışıyor.

### 8.4) Worker adresini kopyalayın ve projeye ekleyin

Worker'ınızın adresi: `https://afium-push.kizikserkan.workers.dev`
(Worker sayfasının üstünde de görebilirsiniz.)

`www/push-config.js` dosyası şu şekilde olmalı:

```js
const PUSH_PROXY_URL = "https://afium-push.kizikserkan.workers.dev";
const PUSH_SECRET = "ca6d8f91e5a8b432df2c994b63d2fd24895151ab0c34c99e";
```

Bu proje zaten bu ayarlarla kurulu ve **çalışır durumda** — yukarıdaki
adımlar sadece ileride yeni bir OneSignal anahtarı oluşturmanız gerekirse
(örn. mevcut anahtar kaybolur/silinirse) referans içindir.

Değişikliği kaydedip GitHub'a yükleyin, APK'nın (ve/veya web panelinin)
yeniden oluşmasını bekleyin.

### Bilinmesi gerekenler

- Bu özellik sadece **APK'de** bildirim çubuğuna düşer; web panelinde
  duyuru zaten listede anında güncellendiği için ayrıca push gerekmez.
- Artık OneSignal'ın gönderim anahtarı (`REST API Key`) uygulama kodunda
  DEĞİL, sadece Cloudflare'daki Worker'ın gizli ayarlarında duruyor —
  öncekinden daha güvenli.
- `PUSH_SECRET`, sadece sizin uygulamanızın bu Worker'ı kullanabilmesi
  içindir; biri bunu ele geçirse bile yalnızca sahte bildirim
  gönderebilir, başka verinize erişemez.
- OneSignal panelinden (dashboard.onesignal.com → Delivery → Sent
  Messages) gönderilen bildirimlerin geçmişini görebilirsiniz.
- Cloudflare Workers ücretsiz planı günde 100.000 istek içerir — bir AVM
  duyuru sistemi için fazlasıyla yeterlidir, kredi kartı hiçbir aşamada
  istenmez.

### Arıza bildirimi push'u (yönetime)

Aynı altyapı, tersi yönde de çalışıyor: bir mağaza **arıza bildirimi**
gönderdiğinde, "Yönetim" girişini kullanan cihazlara da anlık bir bildirim
gider (📣 yerine 🔧 ikonuyla, mağaza adı ve kategori bilgisiyle).

**Önemli:** bu bildirimin yönetime düşmesi için, yönetimi kullanan
telefonda **APK içinde "Yönetim" girişiyle en az bir kez oturum açılmış**
olması gerekir (bildirim izni o an istenir ve cihaz "admin" olarak
etiketlenir). Sadece bilgisayardan web panelini kullanıyorsanız push
bildirimi almazsınız — ama arıza, panel açıkken zaten anlık olarak listeye
düşer, ayrıca push'a ihtiyaç yoktur.

### Teknik Ekip Girişi

Teknik ekip, ayrı bir buton/ekran değil, **aynı tek giriş ekranından**
kendi kullanıcı adı ve şifresiyle girer — sistem, girilen kullanıcı
adının bir teknik personel kaydı olduğunu otomatik tanır ve Yönetim'den
tamamen ayrı, daha sınırlı bir panele yönlendirir:

- Ortak bir şifre değil, **her teknik personelin kendi kullanıcı adı ve
  şifresi** var. Bu hesaplar Yönetim panelindeki **Teknik Personel**
  sekmesinden eklenir/düzenlenir/silinir (ad soyad, kullanıcı adı,
  şifre, telefon, işe başlama tarihi, not). Şifresini unutan bir teknik
  personel için buradan şifresini görüp değiştirebilirsiniz.
- Bir teknik personel "✓ Yapıldı" dediğinde veya not eklediğinde, bu
  işlemi kimin yaptığı ("İşlemi yapan: ...") arıza kartında hem mağazaya
  hem Yönetime görünür — kim neyi çözmüş takip edilebilir.
- Teknik ekip girişini yapan biri, **tüm mağazalardan gelen arıza
  bildirimlerini** (Yönetim panelindeki gibi, tek bir listede) görür.
  Kendi mağaza filtrelemesi yoktur.
- Her arıza için iki buton sunulur: **"✓ Yapıldı"** (durumu doğrudan
  "Çözüldü" yapar) ve **"Not Ekle"** (bir açıklama yazıp kaydeder — örn.
  "parça bekleniyor", "yarın bakılacak"). Not eklendiğinde durum
  "İşlemde"ye döner ve bu not, hem mağazanın kendi arıza ekranında hem de
  Yönetim panelindeki arıza kartında **"Teknik ekip notu:"** olarak
  görünür.
- Yeni bir arıza bildirimi geldiğinde push bildirimi artık **hem Yönetim
  hem Teknik Ekip** girişiyle oturum açmış cihazlara gider (ikisi de
  bildirim almak isterse, her ikisinde de ilgili APK girişinin en az bir
  kez yapılmış olması gerekir — bkz. yukarıdaki "Önemli" notu).

**Dikkat — Cloudflare Worker'ı da güncellemeniz gerekiyor:** Bu özelliğin
çalışması için push isteğini OneSignal'a ileten Cloudflare Worker kodu da
güncellendi (birden fazla role aynı anda bildirim gönderebilmek için).
Projedeki `www/Cloudflare worker.js` dosyası sadece bir **referans
kopyasıdır** — gerçek çalışan kod, Cloudflare'ın kendi panelindedir.
Bu yüzden:

1. Cloudflare panelinde (dash.cloudflare.com) ilgili Worker'ı açın
   ("Edit code").
2. İçindeki tüm kodu silip, bu projede size verilen güncel
   `Cloudflare worker.js` dosyasının içeriğiyle değiştirin.
3. "Deploy" / "Save and deploy" butonuna basın.

Bu adım atlanırsa, Teknik Ekip cihazlarına arıza push bildirimi gitmez
(mevcut Yönetim bildirimleri eskisi gibi çalışmaya devam eder).

### Duyurular için otomatik e-posta

Yönetim bir duyuru yayınladığında, artık push bildiriminin yanı sıra,
e-posta adresi kayıtlı olan **her mağazaya otomatik bir e-posta** da
gönderiliyor (duyurunun başlığı ve metniyle).

Bunun çalışması için EmailJS tarafında **ikinci bir şablon** gerekiyor —
"şifremi unuttum" e-postalarından ayrı, duyuru için özel bir şablon. Bu
dosyanın en üstündeki açıklamada ("Bölüm 3b") şablonun nasıl
oluşturulacağı ve hangi değişkenlerin kullanılacağı anlatılıyor;
oluşturduğunuz şablonun ID'sini `emailjs-config.js` içindeki
`EMAILJS_ANNOUNCEMENT_TEMPLATE_ID` satırına yapıştırmanız gerekiyor.

**Önemli:** `emailjs-config.js` içindeki değerler hâlâ `"BURAYA_..."`
şeklinde boşsa, EmailJS hesabı kurulmamış demektir. Kurulana kadar ne
"şifremi unuttum" e-postaları, ne duyuru e-postaları, ne de aşağıdaki
arıza bildirim e-postaları gönderilir (kod, eksik ayarı fark edip
sessizce atlar, hata vermez). Gönderimin çalışması için EmailJS'te bir
hesap açıp, bir Email Service ve **üç** Email Template (şifre
sıfırlama + duyuru + arıza bildirimi) oluşturup, beş değeri de bu
dosyaya yapıştırmanız gerekiyor — dosyanın en üstündeki adımları takip
edebilirsiniz.

**Not — Gmail zorunlu değil:** "Email Services" eklerken Gmail'e mecbur
değilsiniz; EmailJS'te **"Custom SMTP Server"** seçeneğiyle kendi
hosting'inizin (veya herhangi bir sağlayıcının) SMTP bilgilerini
(sunucu adresi, port, kullanıcı adı, şifre) girerek kendi e-posta
hesabınızı da bağlayabilirsiniz. Bu bilgileri hosting sağlayıcınızın
"e-posta ayarları" sayfasından alabilirsiniz (POP3 ile aynı hesap,
gönderim için SMTP bilgisi kullanılır).

### Arıza bildirimi açıldığında Yönetim'e e-posta

Bir mağaza yeni bir arıza bildirdiğinde, push bildiriminin yanı sıra
artık **Yönetim'in kendi e-postasına** da otomatik bir bilgilendirme
e-postası gidiyor. E-posta adresinizi, Yönetim panelinde sağ üstteki
**⚙️ (Ayarlar)** ikonuna basıp açılan ekrandan girip kaydedebilirsiniz.

Bunun için EmailJS'te **üçüncü bir şablon** (arıza bildirimi şablonu)
oluşturup ID'sini `emailjs-config.js` içindeki
`EMAILJS_TICKET_TEMPLATE_ID` satırına yapıştırmanız gerekiyor — dosyanın
en üstündeki "3c" adımına bakabilirsiniz. ⚙️ Ayarlar'dan e-posta
girilmemişse veya bu şablon ayarlanmamışsa, bildirim sessizce
gönderilmez (hata vermez), sadece push bildirimi çalışmaya devam eder.

### Duyurularda geçerlilik bitiş tarihi

Yeni bir duyuru yayınlarken artık opsiyonel bir **"Geçerlilik Bitiş
Tarihi/Saati"** girilebiliyor. Bu alan boş bırakılırsa duyuru eskisi gibi
süresiz görünür. Bir tarih/saat girilirse, o an geçtiğinde duyuru
**silinmez** ama hem mağazaların hem Yönetim'in gördüğü aktif duyuru
listesinden otomatik olarak kalkar. Yönetim panelinde "Duyurular"
sekmesine artık **Aktif / Süresi Geçmiş** şeklinde iki sekme eklendi —
süresi geçmiş bir duyuruyu görmek veya kalıcı olarak silmek isterseniz
"Süresi Geçmiş" sekmesinden ulaşabilirsiniz.

### Yönetim girişinde iki aşamalı doğrulama (2FA)

Yönetim şifresi doğru girildikten sonra artık ikinci bir adım daha var:
Google Authenticator, Microsoft Authenticator veya benzeri bir
doğrulama uygulamasından alınan 6 haneli kod.

- **İlk kurulum:** Şifreyle giriş yaptığınızda, henüz 2FA kurulmamışsa
  ekranda bir QR kod ve "manuel giriş anahtarı" belirir. Telefonunuzda
  bir doğrulayıcı (authenticator) uygulaması açıp bu QR kodu okutun (veya
  anahtarı elle girin); uygulamada beliren 6 haneli kodu girip
  onayladığınızda kurulum tamamlanır ve girişiniz biter.
- **Sonraki girişler:** Şifreden sonra doğrudan "6 haneli kod" ekranı
  gelir; doğrulayıcı uygulamanızdaki güncel kodu girersiniz.
- **Telefonu/uygulamayı kaybederseniz:** Yönetim şifresinde olduğu gibi,
  kurtarma yolu Firebase Console'dur. Firestore → `admin/main` belgesine
  gidip `totpSecret` ve `totpEnabled` alanlarını silin (veya
  `totpEnabled` değerini `false` yapın); bir sonraki girişte 2FA kurulum
  ekranı yeniden açılır ve yeni bir telefon/uygulama ile kurabilirsiniz.
  Şifrenin kendisi bundan etkilenmez.
- Bu özellik yalnızca **Yönetim girişi** içindir, mağaza ve Teknik Ekip
  girişlerinde 2FA yoktur.

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
