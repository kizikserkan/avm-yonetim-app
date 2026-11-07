/* =========================================================================
   Afium Portal
   Kiracı (mağaza) arıza bildirimi + personel bildirimi + yönetim duyuruları
   ========================================================================= */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const CATEGORIES = ["Elektrik", "Su Tesisatı", "Klima / Havalandırma", "Asansör / Yürüyen Merdiven", "Temizlik", "Güvenlik", "Diğer"];
const STATUSES = [
  { key: "acik", label: "Açık", cls: "open" },
  { key: "islemde", label: "İşlemde", cls: "progress" },
  { key: "cozuldu", label: "Çözüldü", cls: "done" }
];

const App = {
  el: document.getElementById("app"),
  session: null,
  tab: null,
  unsubs: [],
  cache: { stores: [], tickets: [], personnel: [], announcements: [] },

  async init() {
    try {
      const raw = localStorage.getItem("avm_session");
      this.session = raw ? JSON.parse(raw) : null;
    } catch (e) { this.session = null; }

    auth.onAuthStateChanged((user) => {
      if (user) {
        this.boot();
      }
    });
    auth.signInAnonymously().catch((err) => {
      console.error(err);
      this.renderFatal("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin ve uygulamayı yeniden açın.\n\n(" + err.message + ")");
    });
  },

  boot() {
    if (this.session && this.session.role === "tenant") {
      this.tab = "duyurular";
      this.renderTenantShell();
      this.tagPushRoleIfNeeded();
    } else if (this.session && this.session.role === "admin") {
      this.tab = "magazalar";
      this.renderAdminShell();
      this.tagPushRoleIfNeeded();
    } else if (this.session && this.session.role === "teknisyen") {
      this.tab = "arizalar";
      this.renderTechnicianShell();
      this.tagPushRoleIfNeeded();
    } else {
      this.renderTenantLogin();
    }
  },

  /* ---------------------------------------------------------------- */
  /* PUSH BİLDİRİMLERİ (OneSignal) — sadece APK'de (native) çalışır    */
  /* ---------------------------------------------------------------- */
  tagPushRoleIfNeeded() {
    if (!window._oneSignalReady || !window.plugins || !window.plugins.OneSignal) return;
    if (this.session && this.session.role === "tenant") {
      try { window.plugins.OneSignal.User.addTag("role", "tenant"); } catch (e) { console.warn(e); }
    } else if (this.session && this.session.role === "admin") {
      try { window.plugins.OneSignal.User.addTag("role", "admin"); } catch (e) { console.warn(e); }
    } else if (this.session && this.session.role === "teknisyen") {
      try { window.plugins.OneSignal.User.addTag("role", "teknisyen"); } catch (e) { console.warn(e); }
    }
  },

  clearListeners() {
    this.unsubs.forEach((fn) => { try { fn(); } catch (e) {} });
    this.unsubs = [];
  },

  logout() {
    this.clearListeners();
    this.session = null;
    localStorage.removeItem("avm_session");
    this.renderTenantLogin();
  },

  toast(msg, type) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show" + (type ? " " + type : "");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.className = "toast"; }, 2600);
  },

  fmtDate(ts) {
    if (!ts) return "";
    let d;
    if (ts.toDate) d = ts.toDate();
    else d = new Date(ts);
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  },

  /* ---------------------------------------------------------------- */
  /* T.C. Kimlik No gizleme yardımcıları — hem form alanlarında yazarken
     hem de listelerde görüntülenirken T.C. no varsayılan olarak gizli
     tutulur; "göster" butonuyla birkaç saniyeliğine açılır, sonra kendi
     kendine tekrar gizlenir.                                          */
  /* ---------------------------------------------------------------- */
  tcInputField(id, value) {
    return `<div class="field"><label>T.C. Kimlik No</label>
      <div class="tc-input-wrap">
        <input id="${id}" type="password" inputmode="numeric" maxlength="11" placeholder="11 haneli T.C. kimlik no" value="${escapeHtml(value || "")}" />
        <button type="button" class="tc-eye-btn" onclick="App.toggleTcInput(this)">👁</button>
      </div>
    </div>`;
  },

  toggleTcInput(btn) {
    const input = btn.previousElementSibling;
    clearTimeout(input._tcTimer);
    if (input.type === "password") {
      input.type = "text";
      input._tcTimer = setTimeout(() => { input.type = "password"; }, 5000);
    } else {
      input.type = "password";
    }
  },

  tcChip(tc) {
    if (!tc) return `<span class="tc-chip"><span class="tc-chip-val">-</span></span>`;
    const real = escapeHtml(tc);
    return `<span class="tc-chip" data-tc="${real}"><span class="tc-chip-val">•••••••••••</span><button type="button" class="tc-eye" onclick="App.toggleTcChip(this)">👁</button></span>`;
  },

  toggleTcChip(btn) {
    const wrap = btn.closest(".tc-chip");
    const val = wrap.querySelector(".tc-chip-val");
    clearTimeout(wrap._hideTimer);
    if (val.textContent === wrap.dataset.tc) {
      val.textContent = "•••••••••••";
    } else {
      val.textContent = wrap.dataset.tc;
      wrap._hideTimer = setTimeout(() => { val.textContent = "•••••••••••"; }, 5000);
    }
  },

  renderFatal(msg) {
    this.el.innerHTML = `<div class="auth-screen"><div class="auth-card">
      <div class="auth-logo">⚠️</div>
      <div class="auth-title">Bir sorun oluştu</div>
      <div class="auth-sub" style="white-space:pre-wrap">${escapeHtml(msg)}</div>
    </div></div>`;
  },

  /* ---------------------------------------------------------------- */
  /* GİRİŞ (tek ekran — mağaza, teknik personel, yönetim hepsi burada)  */
  /* Kullanıcı adı + şifre girilir; hangi rol olduğu otomatik anlaşılır:*/
  /* "yonetim" → Yönetim (admin/main), büyük harfe çevrilip "stores"    */
  /* koleksiyonunda aranır → Mağaza, bulunamazsa küçük harfe çevrilip   */
  /* "teknikPersonel" koleksiyonunda aranır → Teknik Ekip. Ayrı giriş   */
  /* ekranları/butonları olduğu için eskiden gerekli olan görsel ayrım  */
  /* ihtiyacı da böylece ortadan kalkmış oluyor.                        */
  /* ---------------------------------------------------------------- */
  renderTenantLogin() {
    this.clearListeners();
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <img class="auth-logo-img" src="img/logo.png" alt="Afium" />
          <div class="auth-title">Giriş Yap</div>
          <div class="auth-sub">Kullanıcı adınızı ve şifrenizi girin</div>
          <div class="field"><label>Kullanıcı Adı</label><input id="u-user" autocapitalize="none" placeholder="Mağaza kodu veya kullanıcı adı" /></div>
          <div class="field"><label>Şifre</label><input id="u-pw" type="password" placeholder="••••••" /></div>
          <button class="btn" onclick="App.unifiedLogin()">Giriş Yap</button>
          <button class="btn block-link" onclick="App.openForgotPinForm()">Şifremi unuttum?</button>
        </div>
      </div>`;
    document.getElementById("u-user").focus();
  },

  async unifiedLogin() {
    const username = document.getElementById("u-user").value.trim();
    const pw = document.getElementById("u-pw").value;
    if (!username || !pw) return this.toast("Lütfen kullanıcı adı ve şifreyi girin.", "error");
    const lower = username.toLowerCase();
    try {
      /* 1) Yönetim — sabit "yonetim" kullanıcı adı, admin/main dokümanına bakar. */
      if (lower === "yonetim") {
        const ref = db.collection("admin").doc("main");
        const doc = await ref.get();
        let data;
        if (!doc.exists) {
          // İlk kurulum: girilen şifre yönetici şifresi olarak kaydedilir.
          data = { password: pw, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
          await ref.set(data);
          this.toast("Yönetici şifresi bu girişle oluşturuldu.", "success");
        } else {
          data = doc.data();
          if (String(data.password) !== pw) return this.toast("Kullanıcı adı veya şifre hatalı.", "error");
        }
        // Şifre doğruysa, iki aşamalı doğrulama (2FA) devreye girer: daha önce
        // kurulduysa kod sorulur, kurulmadıysa önce kurulum ekranı gösterilir.
        if (data.totpEnabled && data.totpSecret) {
          this.render2faVerify(data.totpSecret);
        } else {
          this.render2faSetup();
        }
        return;
      }

      /* 2) Mağaza — kullanıcı adı büyük harfe çevrilip "stores" belge ID'si olarak aranır. */
      const storeDoc = await db.collection("stores").doc(username.toUpperCase()).get();
      if (storeDoc.exists) {
        const data = storeDoc.data();
        if (String(data.pin) !== pw) return this.toast("Kullanıcı adı veya şifre hatalı.", "error");
        const code = username.toUpperCase();
        this.session = { role: "tenant", storeCode: code, storeName: data.name || code };
        localStorage.setItem("avm_session", JSON.stringify(this.session));
        this.tab = "duyurular";
        this.toast("Hoş geldiniz, " + this.session.storeName, "success");
        this.renderTenantShell();
        this.tagPushRoleIfNeeded();
        return;
      }

      /* 3) Teknik Personel — kullanıcı adı küçük harfe çevrilip "teknikPersonel" belge ID'si olarak aranır. */
      const tkDoc = await db.collection("teknikPersonel").doc(lower).get();
      if (tkDoc.exists) {
        const data = tkDoc.data();
        if (String(data.password) !== pw) return this.toast("Kullanıcı adı veya şifre hatalı.", "error");
        this.session = { role: "teknisyen", technicianId: lower, technicianName: data.fullName || lower };
        localStorage.setItem("avm_session", JSON.stringify(this.session));
        this.tab = "arizalar";
        this.toast("Hoş geldiniz, " + this.session.technicianName, "success");
        this.renderTechnicianShell();
        this.tagPushRoleIfNeeded();
        return;
      }

      this.toast("Kullanıcı adı veya şifre hatalı.", "error");
    } catch (e) {
      console.error(e);
      this.toast("Giriş yapılamadı: " + e.message, "error");
    }
  },

  /* ---------------------------------------------------------------- */
  /* ŞİFREMİ UNUTTUM (mağaza PIN sıfırlama - e-posta ile otomatik)     */
  /* ---------------------------------------------------------------- */
  openForgotPinForm() {
    openModal(`
      <h3>Şifremi Unuttum</h3>
      <div class="auth-sub" style="text-align:left;margin-bottom:16px">Mağaza kodunuzu ve yönetime kayıtlı e-posta adresinizi girin; yeni şifreniz bu e-postaya gönderilsin.</div>
      <div class="field"><label>Mağaza Kodu</label><input id="fp-code" autocapitalize="characters" placeholder="Örn: M101" /></div>
      <div class="field"><label>Kayıtlı E-posta</label><input id="fp-email" type="email" placeholder="ornek@eposta.com" /></div>
      <button class="btn" id="fp-submit-btn" onclick="App.submitForgotPin()">Yeni Şifre Gönder</button>
    `);
  },

  async submitForgotPin() {
    const code = document.getElementById("fp-code").value.trim().toUpperCase();
    const email = document.getElementById("fp-email").value.trim().toLowerCase();
    if (!code || !email) return this.toast("Lütfen mağaza kodu ve e-posta girin.", "error");
    const btn = document.getElementById("fp-submit-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Gönderiliyor…"; }
    try {
      const doc = await db.collection("stores").doc(code).get();
      const data = doc.exists ? doc.data() : null;
      const storedEmail = data && data.email ? String(data.email).trim().toLowerCase() : "";
      if (!doc.exists || !storedEmail || storedEmail !== email) {
        throw new Error("Mağaza kodu veya e-posta hatalı.");
      }
      const newPin = String(Math.floor(1000 + Math.random() * 9000));
      await db.collection("stores").doc(code).update({ pin: newPin });
      await db.collection("pinResets").add({
        tenantId: TENANT_ID,
        storeCode: code,
        storeName: data.name || code,
        email: storedEmail,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (window.emailjs && typeof EMAILJS_SERVICE_ID !== "undefined" && !EMAILJS_SERVICE_ID.startsWith("BURAYA")) {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          to_email: storedEmail,
          store_name: data.name || code,
          store_code: code,
          new_pin: newPin
        });
      } else {
        console.warn("EmailJS yapılandırılmamış — e-posta gönderilemedi. emailjs-config.js dosyasını doldurun.");
      }
      closeModal();
      this.toast("Yeni şifreniz e-posta adresinize gönderildi.", "success");
    } catch (e) {
      console.error(e);
      this.toast(e.message || "İşlem başarısız, tekrar deneyin.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "Yeni Şifre Gönder"; }
    }
  },

  /* ---------------------------------------------------------------- */
  /* YÖNETİM GİRİŞİ — İKİ AŞAMALI DOĞRULAMA (2FA / TOTP)                */
  /* Şifre doğrulandıktan sonraki ikinci adım. Google Authenticator,    */
  /* Microsoft Authenticator vb. standart TOTP uygulamalarıyla uyumludur.*/
  /* ---------------------------------------------------------------- */
  render2faSetup() {
    this._pendingTotpSecret = TOTP.generateSecret();
    const uri = TOTP.otpAuthUri(this._pendingTotpSecret, "yonetim");
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <img class="auth-logo-img" src="img/logo.png" alt="Afium" />
          <div class="auth-title">İki Aşamalı Doğrulama Kurulumu</div>
          <div class="auth-sub">Telefonunuzda Google Authenticator, Microsoft Authenticator veya benzeri bir uygulama açın, aşağıdaki kodu okutun; sonra uygulamada beliren 6 haneli kodu girin.</div>
          <div style="display:flex;justify-content:center;margin-bottom:14px"><canvas id="totp-qr"></canvas></div>
          <div class="field"><label>QR okutamıyorsanız, manuel giriş anahtarı</label><input value="${this._pendingTotpSecret}" readonly onclick="this.select()" /></div>
          <div class="field"><label>Uygulamadaki 6 Haneli Kod</label><input id="totp-code" inputmode="numeric" maxlength="6" placeholder="000000" /></div>
          <button class="btn" onclick="App.confirmTotpSetup()">Onayla ve Girişi Tamamla</button>
          <button class="btn block-link" onclick="App.renderTenantLogin()">‹ Geri dön</button>
        </div>
      </div>`;
    if (window.QRious) {
      try {
        new QRious({ element: document.getElementById("totp-qr"), value: uri, size: 190 });
      } catch (e) {
        console.error("QR kod oluşturulamadı:", e);
      }
    }
  },

  async confirmTotpSetup() {
    const code = document.getElementById("totp-code").value;
    const ok = await TOTP.verifyCode(this._pendingTotpSecret, code);
    if (!ok) return this.toast("Kod hatalı, tekrar deneyin.", "error");
    try {
      await db.collection("admin").doc("main").update({
        totpSecret: this._pendingTotpSecret,
        totpEnabled: true
      });
      this.toast("İki aşamalı doğrulama kuruldu.", "success");
      this.completeAdminLogin();
    } catch (e) {
      console.error(e);
      this.toast("Kaydedilemedi: " + e.message, "error");
    }
  },

  render2faVerify(secret) {
    this._pendingTotpSecret = secret;
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <img class="auth-logo-img" src="img/logo.png" alt="Afium" />
          <div class="auth-title">İki Aşamalı Doğrulama</div>
          <div class="auth-sub">Doğrulama uygulamanızdaki 6 haneli kodu girin</div>
          <div class="field"><label>6 Haneli Kod</label><input id="totp-code" inputmode="numeric" maxlength="6" placeholder="000000" /></div>
          <button class="btn" onclick="App.verifyTotpLogin()">Giriş Yap</button>
          <button class="btn block-link" onclick="App.renderTenantLogin()">‹ Geri dön</button>
        </div>
      </div>`;
    document.getElementById("totp-code").focus();
  },

  async verifyTotpLogin() {
    const code = document.getElementById("totp-code").value;
    const ok = await TOTP.verifyCode(this._pendingTotpSecret, code);
    if (!ok) return this.toast("Kod hatalı.", "error");
    this.completeAdminLogin();
  },

  completeAdminLogin() {
    this.session = { role: "admin" };
    localStorage.setItem("avm_session", JSON.stringify(this.session));
    this.tab = "magazalar";
    this.renderAdminShell();
    this.tagPushRoleIfNeeded();
  },

  /* ---------------------------------------------------------------- */
  /* TENANT SHELL                                                       */
  /* ---------------------------------------------------------------- */
  renderTenantShell() {
    this.clearListeners();
    const tabs = [
      { key: "duyurular", ic: "📣", label: "Duyurular" },
      { key: "ariza", ic: "🔧", label: "Arıza" },
      { key: "personel", ic: "🧑‍💼", label: "Personel" }
    ];
    this.el.innerHTML = `
      <div class="shell">
        <div class="topbar">
          <div>
            <div class="title">${escapeHtml(this.session.storeName)}</div>
            <div class="sub">Mağaza Paneli</div>
          </div>
          <button class="icon-btn" onclick="App.logout()">Çıkış</button>
        </div>
        <div class="content" id="tenant-content"></div>
        <div class="bottomnav-wrap">
          <div class="bottomnav">
            ${tabs.map(t => `<button class="${this.tab === t.key ? "active" : ""}" onclick="App.setTenantTab('${t.key}')"><span class="ic">${t.ic}</span>${t.label}</button>`).join("")}
          </div>
          <div class="app-footer">Powered by KzkSistem</div>
        </div>
      </div>`;
    this.renderTenantTab();
  },

  setTenantTab(tab) {
    this.tab = tab;
    this.renderTenantShell();
  },

  renderTenantTab() {
    const c = document.getElementById("tenant-content");
    if (this.tab === "duyurular") this.tenantAnnouncements(c);
    else if (this.tab === "ariza") this.tenantTickets(c);
    else if (this.tab === "personel") this.tenantPersonnel(c);
  },

  tenantAnnouncements(c) {
    c.innerHTML = `<div class="section-title">Yönetimden Duyurular</div><div id="ann-list"></div>`;
    const list = document.getElementById("ann-list");
    const unsub = db.collection("announcements").orderBy("createdAt", "desc").limit(50)
      .onSnapshot((snap) => {
        const now = Date.now();
        const docs = snap.docs.filter(d => {
          const a = d.data();
          return belongsToTenant(a) && (!a.expiresAt || tsVal(a.expiresAt) > now);
        });
        if (docs.length === 0) {
          list.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>Henüz duyuru yok.</div>`;
          return;
        }
        list.innerHTML = docs.map((d) => {
          const a = d.data();
          const badge = a.priority === "Önemli" ? `<span class="badge important">Önemli</span>` : `<span class="badge normal">Duyuru</span>`;
          return `<div class="card">
            <div class="card-row"><div class="card-title">${escapeHtml(a.title || "")}</div>${badge}</div>
            <div class="card-body">${escapeHtml(a.body || "")}</div>
            <div class="card-meta">${this.fmtDate(a.createdAt)}${a.expiresAt ? " · Geçerlilik: " + this.fmtDate(a.expiresAt) : ""}</div>
          </div>`;
        }).join("");
      }, (err) => { console.error(err); this.toast("Duyurular yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  tenantTickets(c) {
    c.innerHTML = `
      <div class="section-title">Arıza Bildirimlerim</div>
      <div id="ticket-list"></div>`;
    const btnHtml = `<button class="fab" onclick="App.openTicketForm()">＋</button>`;
    c.insertAdjacentHTML("beforeend", btnHtml);
    const list = document.getElementById("ticket-list");
    const unsub = db.collection("tickets").where("storeCode", "==", this.session.storeCode)
      .onSnapshot((snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(belongsToTenant)
          .sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
        if (docs.length === 0) {
          list.innerHTML = `<div class="empty-state"><span class="emoji">✅</span>Aktif arıza bildiriminiz yok.<br>Sağ alttaki + butonuyla yeni bildirim oluşturun.</div>`;
          return;
        }
        list.innerHTML = docs.map((t) => {
          const st = STATUSES.find(s => s.key === t.status) || STATUSES[0];
          return `<div class="card">
            <div class="card-row"><div class="card-title">${escapeHtml(t.category)}</div><span class="badge ${st.cls}">${st.label}</span></div>
            <div class="ticket-time">🕐 ${this.fmtDate(t.createdAt)}</div>
            <div class="card-body">${escapeHtml(t.description)}</div>
            ${t.technicianNote ? `<div class="card-body"><strong>Teknik ekip notu:</strong> ${escapeHtml(t.technicianNote)}</div>` : ""}
            ${t.handledBy ? `<div class="card-meta">İşlemi yapan: ${escapeHtml(t.handledBy)}</div>` : ""}
          </div>`;
        }).join("");
      }, (err) => { console.error(err); this.toast("Bildirimler yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  openTicketForm() {
    openModal(`
      <h3>Yeni Arıza Bildirimi</h3>
      <div class="field"><label>Kategori</label>
        <select id="tk-cat">${CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Açıklama</label>
        <textarea id="tk-desc" placeholder="Arızayı kısaca açıklayın..."></textarea>
      </div>
      <button class="btn" onclick="App.submitTicket()">Bildirimi Gönder</button>
    `);
  },

  async submitTicket() {
    const category = document.getElementById("tk-cat").value;
    const description = document.getElementById("tk-desc").value.trim();
    if (!description) return this.toast("Lütfen açıklama girin.", "error");
    try {
      await db.collection("tickets").add({
        tenantId: TENANT_ID,
        storeCode: this.session.storeCode,
        storeName: this.session.storeName,
        category, description,
        status: "acik",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Arıza bildirimi gönderildi.", "success");
      this.sendTicketPush(this.session.storeName, category);
      this.sendTicketEmail(this.session.storeName, category, description);
    } catch (e) {
      console.error(e);
      this.toast("Gönderilemedi: " + e.message, "error");
    }
  },

  async sendTicketPush(storeName, category) {
    if (typeof PUSH_PROXY_URL === "undefined" || typeof PUSH_SECRET === "undefined") return;
    if (PUSH_PROXY_URL.startsWith("BURAYA") || PUSH_SECRET.startsWith("BURAYA")) return;
    try {
      await fetch(PUSH_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          secret: PUSH_SECRET,
          role: ["admin", "teknisyen"],
          heading: "🔧 Yeni Arıza Bildirimi",
          content: storeName + " — " + category
        })
      });
    } catch (e) {
      console.warn("Push bildirimi gönderilemedi:", e);
    }
  },

  /* Yeni arıza bildirimi açıldığında Yönetim'in kendi e-postasına da bir
     bildirim e-postası gönderilir — e-posta, Yönetim panelindeki ⚙️
     Ayarlar'dan girilir (admin/main belgesinde "email" alanı). */
  async sendTicketEmail(storeName, category, description) {
    if (!window.emailjs) return;
    if (typeof EMAILJS_SERVICE_ID === "undefined" || EMAILJS_SERVICE_ID.startsWith("BURAYA")) return;
    if (typeof EMAILJS_TICKET_TEMPLATE_ID === "undefined" || EMAILJS_TICKET_TEMPLATE_ID.startsWith("BURAYA")) return;
    try {
      const doc = await db.collection("admin").doc("main").get();
      const adminEmail = doc.exists ? (doc.data().email || "") : "";
      if (!adminEmail) return;
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TICKET_TEMPLATE_ID, {
        to_email: adminEmail,
        store_name: storeName,
        category, description
      });
    } catch (e) {
      console.warn("Arıza bildirim e-postası gönderilemedi:", e);
    }
  },

  tenantPersonnel(c) {
    c.innerHTML = `<div class="section-title">Personel Bildirimlerim</div><div id="pers-list"></div>`;
    c.insertAdjacentHTML("beforeend", `<button class="fab" onclick="App.openPersonnelForm()">＋</button>`);
    const list = document.getElementById("pers-list");
    const unsub = db.collection("personnel").where("storeCode", "==", this.session.storeCode)
      .onSnapshot((snap) => {
        if (snap.empty) {
          list.innerHTML = `<div class="empty-state"><span class="emoji">🧑‍💼</span>Henüz personel bildirimi yok.<br>Sağ alttaki + butonuyla yeni personel bildirin.</div>`;
          return;
        }
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
        list.innerHTML = docs.map((p) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${escapeHtml(p.fullName)}</div>${this.tcChip(p.tc)}</div>
            <div class="card-body">İşe başlama: ${escapeHtml(p.startDate || "-")}</div>
            ${p.note ? `<div class="card-body">${escapeHtml(p.note)}</div>` : ""}
            <div class="card-meta">${this.fmtDate(p.createdAt)}</div>
          </div>`).join("");
      }, (err) => { console.error(err); this.toast("Kayıtlar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  openPersonnelForm() {
    openModal(`
      <h3>Yeni Personel Bildirimi</h3>
      <div class="field"><label>Ad Soyad</label><input id="p-name" placeholder="Ad Soyad" /></div>
      ${this.tcInputField("p-tc")}
      <div class="field"><label>İşe Başlama Tarihi</label><input id="p-date" type="date" /></div>
      <div class="field"><label>Not (opsiyonel)</label><textarea id="p-note" placeholder="Varsa ek bilgi..."></textarea></div>
      <button class="btn" onclick="App.submitPersonnel()">Bildirimi Gönder</button>
    `);
  },

  async submitPersonnel() {
    const fullName = document.getElementById("p-name").value.trim();
    const tc = document.getElementById("p-tc").value.trim();
    const startDate = document.getElementById("p-date").value;
    const note = document.getElementById("p-note").value.trim();
    if (!fullName) return this.toast("Lütfen ad soyad girin.", "error");
    if (!/^\d{11}$/.test(tc)) return this.toast("Lütfen 11 haneli geçerli bir T.C. kimlik no girin.", "error");
    try {
      await db.collection("personnel").add({
        tenantId: TENANT_ID,
        storeCode: this.session.storeCode,
        storeName: this.session.storeName,
        fullName, tc, startDate, note,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Personel bildirimi gönderildi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Gönderilemedi: " + e.message, "error");
    }
  },

  /* ---------------------------------------------------------------- */
  /* ADMIN SHELL                                                        */
  /* ---------------------------------------------------------------- */
  renderAdminShell() {
    this.clearListeners();
    const tabs = [
      { key: "magazalar", ic: "🏪", label: "Mağazalar" },
      { key: "arizalar", ic: "🔧", label: "Arızalar" },
      { key: "magazaPersonel", ic: "🧑‍💼", label: "Mağaza Personeli" },
      { key: "teknikPersonel", ic: "👷", label: "Teknik Personel" },
      { key: "duyurular", ic: "📣", label: "Duyurular" }
    ];
    this.el.innerHTML = `
      <div class="shell">
        <div class="topbar">
          <div><div class="title">Afium Portal</div><div class="sub">Yönetici Paneli</div></div>
          <div style="display:flex;gap:8px">
            <button class="icon-btn" onclick="App.openAdminSettingsForm()">⚙️</button>
            <button class="icon-btn" onclick="App.logout()">Çıkış</button>
          </div>
        </div>
        <div class="content" id="admin-content"></div>
        <div class="bottomnav-wrap">
          <div class="bottomnav">
            ${tabs.map(t => `<button class="${this.tab === t.key ? "active" : ""}" onclick="App.setAdminTab('${t.key}')"><span class="ic">${t.ic}</span>${t.label}</button>`).join("")}
          </div>
          <div class="app-footer">Powered by KzkSistem</div>
        </div>
      </div>`;
    this.renderAdminTab();
  },

  setAdminTab(tab) {
    this.tab = tab;
    this.renderAdminShell();
  },

  /* ---- Ayarlar (Yönetim'in kendi e-postası vb.) ---- */
  async openAdminSettingsForm() {
    let email = "";
    try {
      const doc = await db.collection("admin").doc("main").get();
      if (doc.exists) email = doc.data().email || "";
    } catch (e) { console.error(e); }
    openModal(`
      <h3>Yönetim Ayarları</h3>
      <div class="auth-sub" style="text-align:left;margin-bottom:16px">Buraya girdiğiniz e-posta adresine, yeni bir arıza bildirimi açıldığında otomatik bilgilendirme e-postası gönderilir (EmailJS kurulu olmalıdır).</div>
      <div class="field"><label>Yönetim E-posta Adresi</label><input id="as-email" type="email" value="${escapeHtml(email)}" placeholder="ornek@eposta.com" /></div>
      <button class="btn" onclick="App.submitAdminSettings()">Kaydet</button>
    `);
  },

  async submitAdminSettings() {
    const email = document.getElementById("as-email").value.trim().toLowerCase();
    try {
      await db.collection("admin").doc("main").update({ email });
      closeModal();
      this.toast("Ayarlar kaydedildi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Kaydedilemedi: " + e.message, "error");
    }
  },

  renderAdminTab() {
    const c = document.getElementById("admin-content");
    if (this.tab === "magazalar") this.adminStores(c);
    else if (this.tab === "arizalar") this.adminTickets(c);
    else if (this.tab === "magazaPersonel") this.adminMagazaPersonelTab(c);
    else if (this.tab === "teknikPersonel") this.adminTeknikPersonelTab(c);
    else if (this.tab === "duyurular") this.adminAnnouncements(c);
  },

  /* ---- Mağazalar ---- */
  adminStores(c) {
    c.innerHTML = `
      <div class="section-title">Kayıtlı Mağazalar</div>
      <div class="card" id="store-list"></div>
      <div class="section-title" style="margin-top:22px">Şifre Sıfırlama Talepleri</div>
      <div id="pin-reset-list"></div>`;
    c.insertAdjacentHTML("beforeend", `<button class="fab" onclick="App.openStoreForm()">＋</button>`);
    const list = document.getElementById("store-list");
    const unsub = db.collection("stores").onSnapshot((snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
      if (docs.length === 0) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🏪</span>Henüz mağaza eklenmedi.<br>Sağ alttaki + butonuyla mağaza ekleyin.</div>`;
        return;
      }
      this._storesData = docs;
      list.innerHTML = docs.map((s) => `
        <div class="list-item">
          <div>
            <div class="list-item-main">${escapeHtml(s.name)} <span style="color:var(--muted);font-weight:500">(${escapeHtml(s.id)})</span></div>
            <div class="list-item-sub">PIN: ${escapeHtml(String(s.pin))} ${s.phone ? " · " + escapeHtml(s.phone) : ""}</div>
            <div class="list-item-sub">${s.email ? "✉️ " + escapeHtml(s.email) : "⚠️ E-posta tanımlı değil — şifre sıfırlama çalışmaz"}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="icon-action" onclick="App.openEditStoreForm('${s.id}')">Düzenle</button>
            <button class="icon-action danger" onclick="App.deleteStore('${s.id}')">Sil</button>
          </div>
        </div>`).join("");
    }, (err) => { console.error(err); this.toast("Mağazalar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);

    const prList = document.getElementById("pin-reset-list");
    const unsub2 = db.collection("pinResets").orderBy("createdAt", "desc").limit(20)
      .onSnapshot((snap) => {
        const docs = snap.docs.filter(d => belongsToTenant(d.data()));
        if (docs.length === 0) {
          prList.innerHTML = `<div class="empty-state"><span class="emoji">🔑</span>Henüz şifre sıfırlama talebi olmadı.</div>`;
          return;
        }
        prList.innerHTML = docs.map((d) => {
          const r = d.data();
          return `<div class="card">
            <div class="card-row"><div class="card-title">${escapeHtml(r.storeName || r.storeCode)}</div><span class="badge normal">${escapeHtml(r.storeCode)}</span></div>
            <div class="card-body">✉️ ${escapeHtml(r.email || "-")}</div>
            <div class="card-meta">${this.fmtDate(r.createdAt)}</div>
          </div>`;
        }).join("");
      }, (err) => { console.error(err); });
    this.unsubs.push(unsub2);
  },

  openStoreForm() {
    openModal(`
      <h3>Yeni Mağaza Ekle</h3>
      <div class="field"><label>Mağaza Kodu</label><input id="s-code" autocapitalize="characters" placeholder="Örn: M101" /></div>
      <div class="field"><label>Mağaza Adı</label><input id="s-name" placeholder="Örn: ABC Giyim" /></div>
      <div class="field"><label>Giriş Şifresi (PIN)</label><input id="s-pin" placeholder="Örn: 1234" /></div>
      <div class="field"><label>Telefon (opsiyonel)</label><input id="s-phone" type="tel" placeholder="05xx xxx xx xx" /></div>
      <div class="field"><label>E-posta (şifre sıfırlama için gerekli)</label><input id="s-email" type="email" placeholder="magaza@eposta.com" /></div>
      <button class="btn" onclick="App.submitStore()">Mağazayı Kaydet</button>
    `);
  },

  async submitStore() {
    const code = document.getElementById("s-code").value.trim().toUpperCase();
    const name = document.getElementById("s-name").value.trim();
    const pin = document.getElementById("s-pin").value.trim();
    const phone = document.getElementById("s-phone").value.trim();
    const email = document.getElementById("s-email").value.trim().toLowerCase();
    if (!code || !name || !pin) return this.toast("Kod, ad ve şifre zorunludur.", "error");
    try {
      await db.collection("stores").doc(code).set({
        tenantId: TENANT_ID,
        code, name, pin, phone, email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Mağaza kaydedildi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Kaydedilemedi: " + e.message, "error");
    }
  },

  openEditStoreForm(id) {
    const s = (this._storesData || []).find(x => x.id === id);
    if (!s) return;
    openModal(`
      <h3>Mağazayı Düzenle</h3>
      <div class="field"><label>Mağaza Kodu</label><input value="${escapeHtml(s.id)}" disabled /></div>
      <div class="field"><label>Mağaza Adı</label><input id="es-name" value="${escapeHtml(s.name || "")}" /></div>
      <div class="field"><label>Giriş Şifresi (PIN)</label><input id="es-pin" value="${escapeHtml(String(s.pin || ""))}" /></div>
      <div class="field"><label>Telefon (opsiyonel)</label><input id="es-phone" type="tel" value="${escapeHtml(s.phone || "")}" /></div>
      <div class="field"><label>E-posta (şifre sıfırlama için gerekli)</label><input id="es-email" type="email" value="${escapeHtml(s.email || "")}" /></div>
      <button class="btn" onclick="App.submitEditStore('${s.id}')">Kaydet</button>
    `);
  },

  async submitEditStore(id) {
    const name = document.getElementById("es-name").value.trim();
    const pin = document.getElementById("es-pin").value.trim();
    const phone = document.getElementById("es-phone").value.trim();
    const email = document.getElementById("es-email").value.trim().toLowerCase();
    if (!name || !pin) return this.toast("Ad ve şifre zorunludur.", "error");
    try {
      await db.collection("stores").doc(id).update({ name, pin, phone, email });
      closeModal();
      this.toast("Mağaza güncellendi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Güncellenemedi: " + e.message, "error");
    }
  },

  async deleteStore(code) {
    if (!confirm("Bu mağazayı silmek istediğinize emin misiniz?")) return;
    try {
      await db.collection("stores").doc(code).delete();
      this.toast("Mağaza silindi.", "success");
    } catch (e) {
      this.toast("Silinemedi: " + e.message, "error");
    }
  },

  /* ---- Arızalar ---- */
  adminTickets(c) {
    this._ticketFilter = this._ticketFilter || "all";
    c.innerHTML = `
      <div class="pill-tabs">
        <button class="${this._ticketFilter === "all" ? "active" : ""}" onclick="App.filterTickets('all')">Tümü</button>
        <button class="${this._ticketFilter === "acik" ? "active" : ""}" onclick="App.filterTickets('acik')">Açık</button>
        <button class="${this._ticketFilter === "islemde" ? "active" : ""}" onclick="App.filterTickets('islemde')">İşlemde</button>
        <button class="${this._ticketFilter === "cozuldu" ? "active" : ""}" onclick="App.filterTickets('cozuldu')">Çözüldü</button>
      </div>
      <div id="admin-ticket-list"></div>`;
    const list = document.getElementById("admin-ticket-list");
    const unsub = db.collection("tickets").onSnapshot((snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant);
      if (this._ticketFilter !== "all") docs = docs.filter(t => t.status === this._ticketFilter);
      docs.sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
      if (docs.length === 0) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🔧</span>Kayıt bulunamadı.</div>`;
        return;
      }
      list.innerHTML = docs.map((t) => {
        const st = STATUSES.find(s => s.key === t.status) || STATUSES[0];
        return `<div class="card">
          <div class="card-row"><div class="card-title">${escapeHtml(t.storeName)} · ${escapeHtml(t.category)}</div><span class="badge ${st.cls}">${st.label}</span></div>
          <div class="ticket-time">🕐 Açılış: ${this.fmtDate(t.createdAt)}</div>
          <div class="card-body">${escapeHtml(t.description)}</div>
          ${t.technicianNote ? `<div class="card-body"><strong>Teknik ekip notu:</strong> ${escapeHtml(t.technicianNote)}</div>` : ""}
          ${t.handledBy ? `<div class="card-meta">İşlemi yapan: ${escapeHtml(t.handledBy)}</div>` : ""}
          ${t.updatedAt ? `<div class="card-meta">Son güncelleme: ${this.fmtDate(t.updatedAt)}</div>` : ""}
          <div class="status-select-row">
            ${STATUSES.map(s => `<button class="${t.status === s.key ? "active " + s.cls : ""}" onclick="App.setTicketStatus('${t.id}','${s.key}')">${s.label}</button>`).join("")}
          </div>
        </div>`;
      }).join("");
    }, (err) => { console.error(err); this.toast("Arızalar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  filterTickets(f) {
    this._ticketFilter = f;
    this.renderAdminTab();
  },

  async setTicketStatus(id, status) {
    try {
      await db.collection("tickets").doc(id).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      this.toast("Durum güncellendi.", "success");
    } catch (e) {
      this.toast("Güncellenemedi: " + e.message, "error");
    }
  },

  /* ---- Personel ---- */
  /* İki ayrı liste var: mağazaların bildirdiği kendi personeli (salt okunur,
     "personnel" koleksiyonu) ve Yönetim'in AVM'nin kendi teknik/bakım
     personelini kaydettiği liste ("teknikPersonel" koleksiyonu — buradan
     ekleme/düzenleme/silme yapılabilir). Karışmasınlar diye alt menüde
     ayrı birer ikonları var; pill-tab yok artık. */
  adminMagazaPersonelTab(c) {
    c.innerHTML = `
      <div class="section-title">Mağazalardan Gelen Personel Bildirimleri</div>
      <div id="admin-pers-list"></div>`;
    this.adminStorePersonnelList(document.getElementById("admin-pers-list"));
  },

  adminTeknikPersonelTab(c) {
    c.innerHTML = `
      <div class="section-title">Teknik Personel</div>
      <div id="admin-pers-list"></div>`;
    c.insertAdjacentHTML("beforeend", `<button class="fab" onclick="App.openTeknikPersonelForm()">＋</button>`);
    this.adminTeknikPersonelList(document.getElementById("admin-pers-list"));
  },

  adminStorePersonnelList(list) {
    const unsub = db.collection("personnel").onSnapshot((snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant)
        .sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
      if (docs.length === 0) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🧑‍💼</span>Henüz personel bildirimi yok.</div>`;
        return;
      }
      list.innerHTML = docs.map((p) => `
        <div class="card">
          <div class="card-row"><div class="card-title">${escapeHtml(p.fullName)}</div><span class="badge normal">${escapeHtml(p.storeName)}</span></div>
          <div class="card-body">T.C.: ${this.tcChip(p.tc)} · Başlama: ${escapeHtml(p.startDate || "-")}</div>
          ${p.note ? `<div class="card-body">${escapeHtml(p.note)}</div>` : ""}
          <div class="card-meta">${this.fmtDate(p.createdAt)}</div>
        </div>`).join("");
    }, (err) => { console.error(err); this.toast("Kayıtlar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  /* ---- Teknik Personel (Yönetim'in kendi kaydettiği teknik/bakım ekibi) ----
     Her teknik personelin artık kendi kullanıcı adı + şifresi var (T.C. ile
     ilgisi yok — T.C. gizleme sadece mağazadan gelen personel bildirimlerinde
     kullanılıyor). Kullanıcı adı, Firestore'da belge ID'si olarak tutulur,
     bu yüzden tekil olmak zorunda ve giriş sırasında doğrudan aranır. */
  adminTeknikPersonelList(list) {
    const unsub = db.collection("teknikPersonel").onSnapshot((snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant)
        .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "tr"));
      if (docs.length === 0) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🔧</span>Henüz teknik personel eklenmedi.<br>Sağ alttaki + butonuyla ekleyin.</div>`;
        return;
      }
      this._teknikPersonelData = docs;
      list.innerHTML = docs.map((p) => `
        <div class="list-item">
          <div>
            <div class="list-item-main">${escapeHtml(p.fullName)}</div>
            <div class="list-item-sub">Kullanıcı adı: ${escapeHtml(p.id)}${p.phone ? " · " + escapeHtml(p.phone) : ""}</div>
            <div class="list-item-sub">${p.startDate ? "İşe başlama: " + escapeHtml(p.startDate) : ""}${p.note ? " · " + escapeHtml(p.note) : ""}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="icon-action" onclick="App.openTeknikPersonelForm('${p.id}')">Düzenle</button>
            <button class="icon-action danger" onclick="App.deleteTeknikPersonel('${p.id}')">Sil</button>
          </div>
        </div>`).join("");
    }, (err) => { console.error(err); this.toast("Kayıtlar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  openTeknikPersonelForm(username) {
    const p = username ? (this._teknikPersonelData || []).find(x => x.id === username) : null;
    openModal(`
      <h3>${p ? "Teknik Personeli Düzenle" : "Yeni Teknik Personel Ekle"}</h3>
      <div class="field"><label>Kullanıcı Adı (girişte kullanılır)</label><input id="tp-user" ${p ? "disabled" : ""} value="${p ? escapeHtml(p.id) : ""}" autocapitalize="none" placeholder="Örn: ahmet.teknik" /></div>
      <div class="field"><label>Ad Soyad</label><input id="tp-name" value="${p ? escapeHtml(p.fullName || "") : ""}" placeholder="Ad Soyad" /></div>
      <div class="field"><label>Giriş Şifresi</label><input id="tp-pw" value="${p ? escapeHtml(p.password || "") : ""}" placeholder="Örn: 1234" /></div>
      <div class="field"><label>Telefon (opsiyonel)</label><input id="tp-phone" type="tel" value="${p ? escapeHtml(p.phone || "") : ""}" placeholder="05xx xxx xx xx" /></div>
      <div class="field"><label>İşe Başlama Tarihi</label><input id="tp-date" type="date" value="${p ? escapeHtml(p.startDate || "") : ""}" /></div>
      <div class="field"><label>Not (opsiyonel)</label><textarea id="tp-note" placeholder="Varsa ek bilgi...">${p ? escapeHtml(p.note || "") : ""}</textarea></div>
      <button class="btn" onclick="App.submitTeknikPersonel(${p ? "true" : "false"})">Kaydet</button>
    `);
  },

  async submitTeknikPersonel(isEdit) {
    const username = document.getElementById("tp-user").value.trim().toLowerCase();
    const fullName = document.getElementById("tp-name").value.trim();
    const password = document.getElementById("tp-pw").value.trim();
    const phone = document.getElementById("tp-phone").value.trim();
    const startDate = document.getElementById("tp-date").value;
    const note = document.getElementById("tp-note").value.trim();
    if (!username || !fullName || !password) return this.toast("Kullanıcı adı, ad soyad ve şifre zorunludur.", "error");
    try {
      if (isEdit) {
        await db.collection("teknikPersonel").doc(username).update({ fullName, password, phone, startDate, note });
      } else {
        const existing = await db.collection("teknikPersonel").doc(username).get();
        if (existing.exists) return this.toast("Bu kullanıcı adı zaten kullanılıyor, başka bir tane seçin.", "error");
        await db.collection("teknikPersonel").doc(username).set({
          tenantId: TENANT_ID,
          fullName, password, phone, startDate, note,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      closeModal();
      this.toast(isEdit ? "Teknik personel güncellendi." : "Teknik personel eklendi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Kaydedilemedi: " + e.message, "error");
    }
  },

  async deleteTeknikPersonel(id) {
    if (!confirm("Bu teknik personeli silmek istediğinize emin misiniz?")) return;
    try {
      await db.collection("teknikPersonel").doc(id).delete();
      this.toast("Silindi.", "success");
    } catch (e) {
      this.toast("Silinemedi: " + e.message, "error");
    }
  },

  /* ---- Duyurular ----
     Duyuru oluştururken opsiyonel bir "geçerlilik bitiş tarihi/saati"
     girilebilir. Bu süre dolduğunda duyuru silinmez, sadece hem mağaza hem
     Yönetim'in "Aktif" listesinden otomatik kalkar (düşer); Yönetim
     "Süresi Geçmiş" sekmesinden geçmiş duyuruları yine görüp silebilir. */
  adminAnnouncements(c) {
    this._annView = this._annView || "active";
    c.innerHTML = `
      <div class="pill-tabs">
        <button class="${this._annView === "active" ? "active" : ""}" onclick="App.setAnnouncementsView('active')">Aktif</button>
        <button class="${this._annView === "expired" ? "active" : ""}" onclick="App.setAnnouncementsView('expired')">Süresi Geçmiş</button>
      </div>
      <div id="admin-ann-list"></div>`;
    c.insertAdjacentHTML("beforeend", `<button class="fab" onclick="App.openAnnouncementForm()">＋</button>`);
    const list = document.getElementById("admin-ann-list");
    const unsub = db.collection("announcements").orderBy("createdAt", "desc").onSnapshot((snap) => {
      const now = Date.now();
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant);
      docs = docs.filter(a => {
        const expired = a.expiresAt && tsVal(a.expiresAt) <= now;
        return this._annView === "expired" ? expired : !expired;
      });
      if (docs.length === 0) {
        list.innerHTML = this._annView === "expired"
          ? `<div class="empty-state"><span class="emoji">🗓️</span>Süresi geçmiş duyuru yok.</div>`
          : `<div class="empty-state"><span class="emoji">📣</span>Henüz duyuru yayınlamadınız.<br>Sağ alttaki + butonuyla ilk duyurunuzu yayınlayın.</div>`;
        return;
      }
      list.innerHTML = docs.map((a) => {
        const badge = a.priority === "Önemli" ? `<span class="badge important">Önemli</span>` : `<span class="badge normal">Duyuru</span>`;
        return `<div class="card">
          <div class="card-row"><div class="card-title">${escapeHtml(a.title)}</div>${badge}</div>
          <div class="card-body">${escapeHtml(a.body)}</div>
          <div class="card-meta">${this.fmtDate(a.createdAt)}${a.expiresAt ? " · Geçerlilik: " + this.fmtDate(a.expiresAt) : ""}</div>
          <button class="icon-action danger" style="margin-top:10px" onclick="App.deleteAnnouncement('${a.id}')">Duyuruyu Kaldır</button>
        </div>`;
      }).join("");
    }, (err) => { console.error(err); this.toast("Duyurular yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  setAnnouncementsView(v) {
    this._annView = v;
    this.renderAdminTab();
  },

  openAnnouncementForm() {
    openModal(`
      <h3>Yeni Duyuru Yayınla</h3>
      <div class="field"><label>Başlık</label><input id="an-title" placeholder="Duyuru başlığı" /></div>
      <div class="field"><label>İçerik</label><textarea id="an-body" placeholder="Duyuru metni..."></textarea></div>
      <div class="field"><label>Öncelik</label>
        <select id="an-priority"><option>Normal</option><option>Önemli</option></select>
      </div>
      <div class="field"><label>Geçerlilik Bitiş Tarihi/Saati (opsiyonel)</label><input id="an-expires" type="datetime-local" /></div>
      <button class="btn" onclick="App.submitAnnouncement()">Yayınla</button>
    `);
  },

  async submitAnnouncement() {
    const title = document.getElementById("an-title").value.trim();
    const body = document.getElementById("an-body").value.trim();
    const priority = document.getElementById("an-priority").value;
    const expiresVal = document.getElementById("an-expires").value;
    if (!title || !body) return this.toast("Başlık ve içerik zorunludur.", "error");
    try {
      const data = {
        tenantId: TENANT_ID,
        title, body, priority,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (expiresVal) {
        data.expiresAt = firebase.firestore.Timestamp.fromDate(new Date(expiresVal));
      }
      await db.collection("announcements").add(data);
      closeModal();
      this.toast("Duyuru yayınlandı.", "success");
      this.sendAnnouncementPush(title, priority);
      this.sendAnnouncementEmails(title, body);
    } catch (e) {
      this.toast("Yayınlanamadı: " + e.message, "error");
    }
  },

  async sendAnnouncementEmails(title, body) {
    if (!window.emailjs) return;
    if (typeof EMAILJS_SERVICE_ID === "undefined" || EMAILJS_SERVICE_ID.startsWith("BURAYA")) return;
    if (typeof EMAILJS_ANNOUNCEMENT_TEMPLATE_ID === "undefined" || EMAILJS_ANNOUNCEMENT_TEMPLATE_ID.startsWith("BURAYA")) return;
    try {
      const snap = await db.collection("stores").get();
      const stores = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant).filter(s => s.email);
      for (const s of stores) {
        try {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_ANNOUNCEMENT_TEMPLATE_ID, {
            to_email: s.email,
            store_name: s.name || s.id,
            title, body
          });
        } catch (e) {
          console.warn("Duyuru e-postası gönderilemedi (" + s.id + "):", e);
        }
      }
    } catch (e) {
      console.warn("Mağaza listesi alınamadı, duyuru e-postaları gönderilemedi:", e);
    }
  },

  async sendAnnouncementPush(title, priority) {
    if (typeof PUSH_PROXY_URL === "undefined" || typeof PUSH_SECRET === "undefined") return;
    if (PUSH_PROXY_URL.startsWith("BURAYA") || PUSH_SECRET.startsWith("BURAYA")) return;
    try {
      await fetch(PUSH_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          secret: PUSH_SECRET,
          role: "tenant",
          heading: priority === "Önemli" ? "📣 Önemli Duyuru" : "📣 Yeni Duyuru",
          content: title
        })
      });
    } catch (e) {
      console.warn("Push bildirimi gönderilemedi:", e);
    }
  },

  async deleteAnnouncement(id) {
    if (!confirm("Bu duyuruyu kaldırmak istediğinize emin misiniz?")) return;
    try {
      await db.collection("announcements").doc(id).delete();
      this.toast("Duyuru kaldırıldı.", "success");
    } catch (e) {
      this.toast("Kaldırılamadı: " + e.message, "error");
    }
  },

  /* ---------------------------------------------------------------- */
  /* TEKNİK EKİP PANELİ (arızaları onaylama / not düşme)                */
  /* ---------------------------------------------------------------- */
  renderTechnicianShell() {
    this.clearListeners();
    this.el.innerHTML = `
      <div class="shell">
        <div class="topbar">
          <div><div class="title">Afium Portal</div><div class="sub">Teknik Ekip · ${escapeHtml((this.session && this.session.technicianName) || "")}</div></div>
          <button class="icon-btn" onclick="App.logout()">Çıkış</button>
        </div>
        <div class="content" id="tech-content"></div>
        <div class="app-footer-standalone">Powered by KzkSistem</div>
      </div>`;
    this.technicianTickets(document.getElementById("tech-content"));
  },

  technicianTickets(c) {
    this._techFilter = this._techFilter || "acik";
    c.innerHTML = `
      <div class="pill-tabs">
        <button class="${this._techFilter === "acik" ? "active" : ""}" onclick="App.filterTechnicianTickets('acik')">Açık</button>
        <button class="${this._techFilter === "islemde" ? "active" : ""}" onclick="App.filterTechnicianTickets('islemde')">İşlemde</button>
        <button class="${this._techFilter === "all" ? "active" : ""}" onclick="App.filterTechnicianTickets('all')">Tümü</button>
      </div>
      <div id="tech-ticket-list"></div>`;
    const list = document.getElementById("tech-ticket-list");
    const unsub = db.collection("tickets").onSnapshot((snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToTenant);
      if (this._techFilter !== "all") docs = docs.filter(t => t.status === this._techFilter);
      docs.sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
      this._techTicketsData = docs;
      if (docs.length === 0) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">✅</span>Bu listede arıza yok.</div>`;
        return;
      }
      list.innerHTML = docs.map((t) => {
        const st = STATUSES.find(s => s.key === t.status) || STATUSES[0];
        const isDone = t.status === "cozuldu";
        return `<div class="card">
          <div class="card-row"><div class="card-title">${escapeHtml(t.storeName)} · ${escapeHtml(t.category)}</div><span class="badge ${st.cls}">${st.label}</span></div>
          <div class="ticket-time">🕐 Açılış: ${this.fmtDate(t.createdAt)}</div>
          <div class="card-body">${escapeHtml(t.description)}</div>
          ${t.technicianNote ? `<div class="card-body"><strong>Not:</strong> ${escapeHtml(t.technicianNote)}</div>` : ""}
          ${t.handledBy ? `<div class="card-meta">İşlemi yapan: ${escapeHtml(t.handledBy)}</div>` : ""}
          ${!isDone ? `
          <div class="status-select-row">
            <button class="active done" onclick="App.technicianMarkDone('${t.id}')">✓ Yapıldı</button>
            <button onclick="App.openTechnicianNoteForm('${t.id}')">Not Ekle</button>
          </div>` : ""}
        </div>`;
      }).join("");
    }, (err) => { console.error(err); this.toast("Arızalar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  filterTechnicianTickets(f) {
    this._techFilter = f;
    this.technicianTickets(document.getElementById("tech-content"));
  },

  async technicianMarkDone(id) {
    try {
      await db.collection("tickets").doc(id).update({
        status: "cozuldu",
        handledBy: (this.session && this.session.technicianName) || "Teknik Ekip",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      this.toast("Arıza yapıldı olarak işaretlendi.", "success");
    } catch (e) {
      this.toast("Güncellenemedi: " + e.message, "error");
    }
  },

  openTechnicianNoteForm(id) {
    const t = ((this._techTicketsData || [])).find(x => x.id === id);
    openModal(`
      <h3>Not Ekle</h3>
      <div class="auth-sub" style="text-align:left;margin-bottom:16px">Bu arıza neden henüz yapılmadı? Mağaza ve yönetim bu notu görebilecek.</div>
      <div class="field"><label>Not</label><textarea id="tn-note" placeholder="Örn: Yedek parça bekleniyor...">${escapeHtml((t && t.technicianNote) || "")}</textarea></div>
      <button class="btn" onclick="App.submitTechnicianNote('${id}')">Kaydet</button>
    `);
  },

  async submitTechnicianNote(id) {
    const note = document.getElementById("tn-note").value.trim();
    if (!note) return this.toast("Lütfen bir not girin.", "error");
    try {
      await db.collection("tickets").doc(id).update({
        technicianNote: note,
        status: "islemde",
        handledBy: (this.session && this.session.technicianName) || "Teknik Ekip",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Not kaydedildi.", "success");
    } catch (e) {
      this.toast("Kaydedilemedi: " + e.message, "error");
    }
  }
};

function tsVal(ts) {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  return new Date(ts).getTime();
}

/* Çok kiracılı (multi-tenant) altyapıya ileride geçiş için: bir kaydın bu
   AVM'ye (TENANT_ID) ait olup olmadığını kontrol eder. Henüz tenantId
   alanı olmayan eski kayıtlar da (bu alan eklenmeden önce oluşturulmuş
   olabilirler) geriye dönük uyumluluk için "bu AVM'ye ait" sayılır. */
function belongsToTenant(data) {
  return !data.tenantId || data.tenantId === TENANT_ID;
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openModal(innerHtml) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "modal-backdrop";
  wrap.onclick = (e) => { if (e.target === wrap) closeModal(); };
  wrap.innerHTML = `<div class="modal-sheet"><button class="modal-close" onclick="closeModal()">✕</button>${innerHtml}</div>`;
  document.body.appendChild(wrap);
}
function closeModal() {
  const el = document.getElementById("modal-backdrop");
  if (el) el.remove();
}

/* OneSignal push bildirimleri — sadece native (APK) ortamında "deviceready"
   olayı tetiklenir, web'de (tarayıcı) hiçbir şey olmaz, bu normaldir. */
window._oneSignalReady = false;
document.addEventListener("deviceready", function () {
  if (!window.plugins || !window.plugins.OneSignal) return;
  if (typeof ONESIGNAL_APP_ID === "undefined" || ONESIGNAL_APP_ID.startsWith("BURAYA")) return;
  try {
    window.plugins.OneSignal.initialize(ONESIGNAL_APP_ID);
    window.plugins.OneSignal.Notifications.requestPermission(false);
    window._oneSignalReady = true;
    App.tagPushRoleIfNeeded();
  } catch (e) {
    console.error("OneSignal başlatılamadı:", e);
  }
}, false);

App.init();
