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

  renderFatal(msg) {
    this.el.innerHTML = `<div class="auth-screen"><div class="auth-card">
      <div class="auth-logo">⚠️</div>
      <div class="auth-title">Bir sorun oluştu</div>
      <div class="auth-sub" style="white-space:pre-wrap">${escapeHtml(msg)}</div>
    </div></div>`;
  },

  /* ---------------------------------------------------------------- */
  /* TENANT LOGIN (ana giriş ekranı)                                    */
  /* ---------------------------------------------------------------- */
  renderTenantLogin() {
    this.clearListeners();
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <img class="auth-logo-img" src="img/logo.png" alt="Afium" />
          <div class="auth-title">Mağaza Girişi</div>
          <div class="auth-sub">Yönetimin size verdiği mağaza kodu ve şifre ile giriş yapın</div>
          <div class="field"><label>Mağaza Kodu</label><input id="t-code" autocapitalize="characters" placeholder="Örn: M101" /></div>
          <div class="field"><label>Şifre (PIN)</label><input id="t-pin" type="password" inputmode="numeric" placeholder="••••" /></div>
          <button class="btn" onclick="App.tenantLogin()">Giriş Yap</button>
          <button class="btn block-link" onclick="App.openForgotPinForm()">Şifremi unuttum?</button>
          <button class="btn block-link staff-link" onclick="App.renderAdminLogin()">Yönetim / Teknik Girişi</button>
        </div>
      </div>`;
    document.getElementById("t-code").focus();
  },

  async tenantLogin() {
    const code = document.getElementById("t-code").value.trim().toUpperCase();
    const pin = document.getElementById("t-pin").value.trim();
    if (!code || !pin) return this.toast("Lütfen mağaza kodu ve şifreyi girin.", "error");
    try {
      const doc = await db.collection("stores").doc(code).get();
      if (!doc.exists) return this.toast("Mağaza kodu bulunamadı.", "error");
      const data = doc.data();
      if (String(data.pin) !== pin) return this.toast("Şifre hatalı.", "error");
      this.session = { role: "tenant", storeCode: code, storeName: data.name || code };
      localStorage.setItem("avm_session", JSON.stringify(this.session));
      this.tab = "duyurular";
      this.toast("Hoş geldiniz, " + this.session.storeName, "success");
      this.renderTenantShell();
      this.tagPushRoleIfNeeded();
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
  /* ADMIN LOGIN                                                        */
  /* ---------------------------------------------------------------- */
  renderAdminLogin() {
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <img class="auth-logo-img" src="img/logo.png" alt="Afium" />
          <div class="auth-title">Yönetim Girişi</div>
          <div class="auth-sub">AVM yönetim şifrenizi girin</div>
          <div class="field"><label>Şifre</label><input id="a-pw" type="password" placeholder="••••••" /></div>
          <button class="btn" onclick="App.adminLogin()">Giriş Yap</button>
          <button class="btn block-link" onclick="App.renderTenantLogin()">‹ Mağaza girişine dön</button>
        </div>
      </div>`;
    document.getElementById("a-pw").focus();
  },

  async adminLogin() {
    const pw = document.getElementById("a-pw").value;
    if (!pw) return this.toast("Lütfen şifre girin.", "error");
    try {
      const ref = db.collection("admin").doc("main");
      const doc = await ref.get();
      if (!doc.exists) {
        // İlk kurulum: girilen şifre yönetici şifresi olarak kaydedilir.
        await ref.set({ password: pw, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        this.toast("Yönetici şifresi bu girişle oluşturuldu.", "success");
      } else if (String(doc.data().password) !== pw) {
        return this.toast("Şifre hatalı.", "error");
      }
      this.session = { role: "admin" };
      localStorage.setItem("avm_session", JSON.stringify(this.session));
      this.tab = "magazalar";
      this.renderAdminShell();
    } catch (e) {
      console.error(e);
      this.toast("Giriş yapılamadı: " + e.message, "error");
    }
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
        <div class="bottomnav">
          ${tabs.map(t => `<button class="${this.tab === t.key ? "active" : ""}" onclick="App.setTenantTab('${t.key}')"><span class="ic">${t.ic}</span>${t.label}</button>`).join("")}
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
        if (snap.empty) {
          list.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>Henüz duyuru yok.</div>`;
          return;
        }
        list.innerHTML = snap.docs.map((d) => {
          const a = d.data();
          const badge = a.priority === "Önemli" ? `<span class="badge important">Önemli</span>` : `<span class="badge normal">Duyuru</span>`;
          return `<div class="card">
            <div class="card-row"><div class="card-title">${escapeHtml(a.title || "")}</div>${badge}</div>
            <div class="card-body">${escapeHtml(a.body || "")}</div>
            <div class="card-meta">${this.fmtDate(a.createdAt)}</div>
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
        if (snap.empty) {
          list.innerHTML = `<div class="empty-state"><span class="emoji">✅</span>Aktif arıza bildiriminiz yok.<br>Sağ alttaki + butonuyla yeni bildirim oluşturun.</div>`;
          return;
        }
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
        list.innerHTML = docs.map((t) => {
          const st = STATUSES.find(s => s.key === t.status) || STATUSES[0];
          return `<div class="card">
            <div class="card-row"><div class="card-title">${escapeHtml(t.category)}</div><span class="badge ${st.cls}">${st.label}</span></div>
            <div class="card-body">${escapeHtml(t.description)}</div>
            <div class="card-meta">${this.fmtDate(t.createdAt)}</div>
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
        storeCode: this.session.storeCode,
        storeName: this.session.storeName,
        category, description,
        status: "acik",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Arıza bildirimi gönderildi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Gönderilemedi: " + e.message, "error");
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
            <div class="card-row"><div class="card-title">${escapeHtml(p.fullName)}</div><span class="badge normal">${escapeHtml(p.tc || "-")}</span></div>
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
      <div class="field"><label>T.C. Kimlik No</label><input id="p-tc" inputmode="numeric" maxlength="11" placeholder="11 haneli T.C. kimlik no" /></div>
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
      { key: "personel", ic: "🧑‍💼", label: "Personel" },
      { key: "duyurular", ic: "📣", label: "Duyurular" }
    ];
    this.el.innerHTML = `
      <div class="shell">
        <div class="topbar">
          <div><div class="title">Afium Portal</div><div class="sub">Yönetici Paneli</div></div>
          <button class="icon-btn" onclick="App.logout()">Çıkış</button>
        </div>
        <div class="content" id="admin-content"></div>
        <div class="bottomnav">
          ${tabs.map(t => `<button class="${this.tab === t.key ? "active" : ""}" onclick="App.setAdminTab('${t.key}')"><span class="ic">${t.ic}</span>${t.label}</button>`).join("")}
        </div>
      </div>`;
    this.renderAdminTab();
  },

  setAdminTab(tab) {
    this.tab = tab;
    this.renderAdminShell();
  },

  renderAdminTab() {
    const c = document.getElementById("admin-content");
    if (this.tab === "magazalar") this.adminStores(c);
    else if (this.tab === "arizalar") this.adminTickets(c);
    else if (this.tab === "personel") this.adminPersonnel(c);
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
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🏪</span>Henüz mağaza eklenmedi.<br>Sağ alttaki + butonuyla mağaza ekleyin.</div>`;
        return;
      }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
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
        if (snap.empty) {
          prList.innerHTML = `<div class="empty-state"><span class="emoji">🔑</span>Henüz şifre sıfırlama talebi olmadı.</div>`;
          return;
        }
        prList.innerHTML = snap.docs.map((d) => {
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
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
          <div class="card-body">${escapeHtml(t.description)}</div>
          <div class="card-meta">${this.fmtDate(t.createdAt)}</div>
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
  adminPersonnel(c) {
    c.innerHTML = `<div class="section-title">Gelen Personel Bildirimleri</div><div id="admin-pers-list"></div>`;
    const list = document.getElementById("admin-pers-list");
    const unsub = db.collection("personnel").onSnapshot((snap) => {
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🧑‍💼</span>Henüz personel bildirimi yok.</div>`;
        return;
      }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsVal(b.createdAt) - tsVal(a.createdAt));
      list.innerHTML = docs.map((p) => `
        <div class="card">
          <div class="card-row"><div class="card-title">${escapeHtml(p.fullName)}</div><span class="badge normal">${escapeHtml(p.storeName)}</span></div>
          <div class="card-body">T.C.: ${escapeHtml(p.tc || "-")} · Başlama: ${escapeHtml(p.startDate || "-")}</div>
          ${p.note ? `<div class="card-body">${escapeHtml(p.note)}</div>` : ""}
          <div class="card-meta">${this.fmtDate(p.createdAt)}</div>
        </div>`).join("");
    }, (err) => { console.error(err); this.toast("Kayıtlar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  /* ---- Duyurular ---- */
  adminAnnouncements(c) {
    c.innerHTML = `<div class="section-title">Yayınlanan Duyurular</div><div id="admin-ann-list"></div>`;
    c.insertAdjacentHTML("beforeend", `<button class="fab" onclick="App.openAnnouncementForm()">＋</button>`);
    const list = document.getElementById("admin-ann-list");
    const unsub = db.collection("announcements").orderBy("createdAt", "desc").onSnapshot((snap) => {
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">📣</span>Henüz duyuru yayınlamadınız.<br>Sağ alttaki + butonuyla ilk duyurunuzu yayınlayın.</div>`;
        return;
      }
      list.innerHTML = snap.docs.map((d) => {
        const a = d.data();
        const badge = a.priority === "Önemli" ? `<span class="badge important">Önemli</span>` : `<span class="badge normal">Duyuru</span>`;
        return `<div class="card">
          <div class="card-row"><div class="card-title">${escapeHtml(a.title)}</div>${badge}</div>
          <div class="card-body">${escapeHtml(a.body)}</div>
          <div class="card-meta">${this.fmtDate(a.createdAt)}</div>
          <button class="icon-action danger" style="margin-top:10px" onclick="App.deleteAnnouncement('${d.id}')">Duyuruyu Kaldır</button>
        </div>`;
      }).join("");
    }, (err) => { console.error(err); this.toast("Duyurular yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  openAnnouncementForm() {
    openModal(`
      <h3>Yeni Duyuru Yayınla</h3>
      <div class="field"><label>Başlık</label><input id="an-title" placeholder="Duyuru başlığı" /></div>
      <div class="field"><label>İçerik</label><textarea id="an-body" placeholder="Duyuru metni..."></textarea></div>
      <div class="field"><label>Öncelik</label>
        <select id="an-priority"><option>Normal</option><option>Önemli</option></select>
      </div>
      <button class="btn" onclick="App.submitAnnouncement()">Yayınla</button>
    `);
  },

  async submitAnnouncement() {
    const title = document.getElementById("an-title").value.trim();
    const body = document.getElementById("an-body").value.trim();
    const priority = document.getElementById("an-priority").value;
    if (!title || !body) return this.toast("Başlık ve içerik zorunludur.", "error");
    try {
      await db.collection("announcements").add({
        title, body, priority,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Duyuru yayınlandı.", "success");
      this.sendAnnouncementPush(title, priority);
    } catch (e) {
      this.toast("Yayınlanamadı: " + e.message, "error");
    }
  },

  async sendAnnouncementPush(title, priority) {
    if (typeof ONESIGNAL_APP_ID === "undefined" || typeof ONESIGNAL_REST_API_KEY === "undefined") return;
    if (ONESIGNAL_APP_ID.startsWith("BURAYA") || ONESIGNAL_REST_API_KEY.startsWith("BURAYA")) return;
    try {
      await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": "Key " + ONESIGNAL_REST_API_KEY
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          target_channel: "push",
          filters: [{ field: "tag", key: "role", relation: "=", value: "tenant" }],
          headings: { en: priority === "Önemli" ? "📣 Önemli Duyuru" : "📣 Yeni Duyuru" },
          contents: { en: title }
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
  }
};

function tsVal(ts) {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  return new Date(ts).getTime();
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
window._deviceReadyFired = false;
document.addEventListener("deviceready", function () {
  window._deviceReadyFired = true;
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

/* GEÇİCİ TANI BİLDİRİMİ — sorunu bulmak için, 4 saniye sonra ekranda
   OneSignal'ın durumunu gösteren bir uyarı çıkar. Sorun çözülünce bu
   blok kaldırılacak. */
setTimeout(function () {
  const info = "deviceready:" + (window._deviceReadyFired ? "EVET" : "HAYIR") +
    " | plugins:" + (window.plugins ? "VAR" : "YOK") +
    " | OneSignal:" + (window.plugins && window.plugins.OneSignal ? "VAR" : "YOK") +
    " | hazır:" + (window._oneSignalReady ? "EVET" : "HAYIR");
  console.log("[OneSignal Tanı] " + info);
  if (window.App && App.toast) App.toast(info, "error");
}, 4000);

App.init();
