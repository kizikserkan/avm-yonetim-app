/* =========================================================================
   Afium Portal — Push Bildirim Ara Sunucusu (Cloudflare Worker)
   -------------------------------------------------------------------------
   Bu dosyanın TAMAMINI Cloudflare Workers'daki kod düzenleyiciye
   yapıştıracaksınız. Kurulum adımları için README.md "Bölüm 8"e bakın.

   Bu Worker, uygulamadan gelen "duyuru yayınlandı" isteğini alır, gizli
   OneSignal REST API anahtarını EKLEYEREK OneSignal'a iletir ve sonucu
   geri döner. Anahtar burada, tarayıcıya hiç gönderilmeyen bir "Secret"
   (Cloudflare panelinde ayarlanacak) olarak saklanır.
   ========================================================================= */

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Sadece POST kabul edilir." }), { status: 405, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Geçersiz istek gövdesi." }), { status: 400, headers: cors });
    }

    if (!env.PUSH_SECRET || body.secret !== env.PUSH_SECRET) {
      return new Response(JSON.stringify({ error: "Yetkisiz istek." }), { status: 401, headers: cors });
    }

    const targetRole = (body.role === "admin") ? "admin" : "tenant";

    try {
      const osRes = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": "Key " + env.ONESIGNAL_REST_API_KEY
        },
        body: JSON.stringify({
          app_id: env.ONESIGNAL_APP_ID,
          target_channel: "push",
          filters: [{ field: "tag", key: "role", relation: "=", value: targetRole }],
          headings: { en: body.heading || "📣 Duyuru" },
          contents: { en: body.content || "" }
        })
      });
      const text = await osRes.text();
      return new Response(text, { status: osRes.status, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
    }
  }
};
