/* =========================================================================
   OneSignal Ayarları — mağazalara push (anlık) bildirim göndermek için.
   Bu, sadece cihazın OneSignal'a KAYDOLMASI için kullanılan Uygulama
   Kimliği'dir (App ID). Bu değer gizli değildir, olduğu gibi kalabilir.

   Gönderim anahtarı (REST API Key) artık burada DEĞİL — güvenlik ve
   CORS sorunu yüzünden Cloudflare Worker'a (bkz. push-config.js ve
   README.md Bölüm 8) taşındı.
   ========================================================================= */

const ONESIGNAL_APP_ID = "255154af-5c0f-4d11-9feb-0429d0c1d1cd";
