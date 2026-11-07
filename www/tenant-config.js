/* =========================================================================
   Tenant (AVM) Kimliği
   -------------------------------------------------------------------------
   Şu an uygulama tek bir AVM (Afium) için çalışıyor. Ama ileride bu
   uygulamayı başka AVM'lere de kurmak/satmak istersek diye, her kayıt
   oluşturulurken hangi AVM'ye ait olduğu baştan bu kimlikle etiketleniyor.

   Bugün tek kiracı (tenant) olduğu için pratikte bir fark yaratmaz — ama
   ileride ikinci bir AVM eklendiğinde, var olan binlerce kaydı geriye
   dönük etiketlemek yerine zaten hazır olur. Bu dosya, gerçek çok
   kiracılı (multi-tenant) bir yapıya geçilene kadar atılan "ucuz
   sigorta" adımlarından biridir.
   ========================================================================= */
const TENANT_ID = "afium";

