/* =========================================================================
   Push Bildirim Ara Sunucusu (Cloudflare Worker) Ayarları
   -------------------------------------------------------------------------
   Duyuru yayınlandığında bildirim isteği artık doğrudan OneSignal'a değil,
   bu adrese gidiyor. Bu küçük "ara durak" (Cloudflare Worker), isteği
   bizim yerimize güvenli şekilde OneSignal'a iletiyor.

   Aşağıdaki iki değeri, Cloudflare Worker'ı kurduktan sonra dolduracaksınız.
   Adım adım talimat için README.md dosyasındaki "Bölüm 8" kısmına bakın.
   ========================================================================= */

const PUSH_PROXY_URL = "https://afium-push.kizikserkan.workers.dev"; // örn: https://afium-push.kullaniciadi.workers.dev
const PUSH_SECRET = "ca6d8f91e5a8b432df2c994b63d2fd24895151ab0c34c99e";
