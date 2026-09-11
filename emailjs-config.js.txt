/* =========================================================================
   EmailJS Ayarları — mağaza "şifremi unuttum" e-postaları için
   =========================================================================
   1) https://www.emailjs.com adresinde ücretsiz bir hesap açın.
   2) "Email Services" bölümünden kendi e-posta hesabınızı (Gmail vb.)
      bağlayın, oluşan Service ID'yi aşağıya yapıştırın.
   3) "Email Templates" bölümünden yeni bir şablon oluşturun. Şablonun
      "To Email" alanına {{to_email}} yazın; içeriğinde de dilediğiniz
      gibi {{store_name}}, {{store_code}} ve {{new_pin}} değişkenlerini
      kullanabilirsiniz (örn: "Merhaba {{store_name}}, yeni şifreniz:
      {{new_pin}}"). Oluşan Template ID'yi aşağıya yapıştırın.
   4) "Account" > "General" bölümünden Public Key'i kopyalayıp aşağıya
      yapıştırın.
   ========================================================================= */

const EMAILJS_PUBLIC_KEY = "BURAYA_PUBLIC_KEY";
const EMAILJS_SERVICE_ID = "BURAYA_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "BURAYA_TEMPLATE_ID";

if (window.emailjs && EMAILJS_PUBLIC_KEY && !EMAILJS_PUBLIC_KEY.startsWith("BURAYA")) {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}
