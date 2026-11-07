/* =========================================================================
   EmailJS Ayarları — mağaza "şifremi unuttum" ve duyuru e-postaları için
   =========================================================================
   1) https://www.emailjs.com adresinde ücretsiz bir hesap açın.
   2) "Email Services" bölümünden kendi e-posta hesabınızı (Gmail vb.)
      bağlayın, oluşan Service ID'yi aşağıya yapıştırın.
   3) "Email Templates" bölümünden İKİ ayrı şablon oluşturun:

      a) Şifre sıfırlama şablonu — "To Email" alanına {{to_email}},
         içeriğinde {{store_name}}, {{store_code}} ve {{new_pin}}
         değişkenlerini kullanın (örn: "Merhaba {{store_name}}, yeni
         şifreniz: {{new_pin}}"). Template ID'yi EMAILJS_TEMPLATE_ID'ye
         yapıştırın.

      b) Duyuru şablonu — "To Email" alanına yine {{to_email}},
         içeriğinde {{store_name}}, {{title}} ve {{body}} değişkenlerini
         kullanın (örn: "Merhaba {{store_name}}, yeni bir duyuru:
         {{title}} - {{body}}"). Template ID'yi
         EMAILJS_ANNOUNCEMENT_TEMPLATE_ID'ye yapıştırın.

   4) "Account" > "General" bölümünden Public Key'i kopyalayıp aşağıya
      yapıştırın.

   NOT: EmailJS'in ücretsiz planı ayda sınırlı sayıda e-posta gönderimine
   izin verir (bu sınır zamanla değişebilir, emailjs.com/pricing adresinden
   güncel rakamı kontrol edin). Mağaza sayınız ve duyuru sıklığınız bu
   sınırı aşarsa EmailJS'in ücretli planına geçmeniz gerekebilir.
   ========================================================================= */

const EMAILJS_PUBLIC_KEY = "BURAYA_PUBLIC_KEY";
const EMAILJS_SERVICE_ID = "BURAYA_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "BURAYA_TEMPLATE_ID";
const EMAILJS_ANNOUNCEMENT_TEMPLATE_ID = "BURAYA_DUYURU_TEMPLATE_ID";

if (window.emailjs && EMAILJS_PUBLIC_KEY && !EMAILJS_PUBLIC_KEY.startsWith("BURAYA")) {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}
