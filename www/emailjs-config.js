/* =========================================================================
   EmailJS Ayarları — mağaza "şifremi unuttum", duyuru ve arıza bildirim
   e-postaları için
   =========================================================================
   1) https://www.emailjs.com adresinde ücretsiz bir hesap açın.
   2) "Email Services" bölümünden kendi e-posta hesabınızı (Gmail, Outlook,
      veya kendi hosting'inizin "Custom SMTP Server" seçeneğiyle herhangi
      bir SMTP hesabı) bağlayın, oluşan Service ID'yi aşağıya yapıştırın.
   3) "Email Templates" bölümünden ÜÇ ayrı şablon oluşturun:

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

      c) Arıza bildirim şablonu — "To Email" alanına yine {{to_email}},
         içeriğinde {{store_name}}, {{category}} ve {{description}}
         değişkenlerini kullanın (örn: "{{store_name}} yeni bir arıza
         bildirdi: {{category}} - {{description}}"). Template ID'yi
         EMAILJS_TICKET_TEMPLATE_ID'ye yapıştırın. Bu e-postanın kime
         gideceği (Yönetim'in kendi e-postası) uygulama içinde Yönetim
         panelindeki ⚙️ Ayarlar'dan girilir, burada ayarlanmaz.

   4) "Account" > "General" bölümünden Public Key'i kopyalayıp aşağıya
      yapıştırın.

   NOT: EmailJS'in ücretsiz planı ayda sınırlı sayıda e-posta gönderimine
   izin verir (bu sınır zamanla değişebilir, emailjs.com/pricing adresinden
   güncel rakamı kontrol edin). Mağaza sayınız, duyuru ve arıza bildirim
   sıklığınız bu sınırı aşarsa EmailJS'in ücretli planına geçmeniz
   gerekebilir.
   ========================================================================= */

const EMAILJS_PUBLIC_KEY = "BURAYA_PUBLIC_KEY";
const EMAILJS_SERVICE_ID = "BURAYA_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "BURAYA_TEMPLATE_ID";
const EMAILJS_ANNOUNCEMENT_TEMPLATE_ID = "BURAYA_DUYURU_TEMPLATE_ID";
const EMAILJS_TICKET_TEMPLATE_ID = "BURAYA_ARIZA_TEMPLATE_ID";

if (window.emailjs && EMAILJS_PUBLIC_KEY && !EMAILJS_PUBLIC_KEY.startsWith("BURAYA")) {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}
