/* =========================================================================
   AVM Yönetim Uygulaması
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
    } else if (this.session && this.session.role === "admin") {
      this.tab = "magazalar";
      this.renderAdminShell();
    } else {
      this.renderRoleSelect();
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
    this.renderRoleSelect();
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
  /* ROLE SELECT                                                       */
  /* ---------------------------------------------------------------- */
  renderRoleSelect() {
    this.clearListeners();
    this.el.innerHTML = `
      <div class="shell">
        <div class="topbar"><div class="title">🏬 AVM Yönetim</div></div>
        <div class="content" style="padding-top:24px">
          <div class="role-picker">
            <button class="role-btn" onclick="App.renderTenantLogin()">
              <span class="emoji">🏪</span>
              <span>Mağaza Girişi<br><span style="font-weight:400;font-size:12px;color:var(--muted)">Arıza / personel bildirimi</span></span>
              <span class="arrow">›</span>
            </button>
            <button class="role-btn" onclick="App.renderAdminLogin()">
              <span class="emoji">🛠️</span>
              <span>Yönetim Girişi<br><span style="font-weight:400;font-size:12px;color:var(--muted)">AVM yönetimi</span></span>
              <span class="arrow">›</span>
            </button>
          </div>
        </div>
      </div>`;
  },

  /* ---------------------------------------------------------------- */
  /* TENANT LOGIN                                                       */
  /* ---------------------------------------------------------------- */
  renderTenantLogin() {
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-logo">🏪</div>
          <div class="auth-title">Mağaza Girişi</div>
          <div class="auth-sub">Yönetimin size verdiği mağaza kodu ve şifre ile giriş yapın</div>
          <div class="field"><label>Mağaza Kodu</label><input id="t-code" autocapitalize="characters" placeholder="Örn: M101" /></div>
          <div class="field"><label>Şifre (PIN)</label><input id="t-pin" type="password" inputmode="numeric" placeholder="••••" /></div>
          <button class="btn" onclick="App.tenantLogin()">Giriş Yap</button>
          <button class="btn block-link" onclick="App.renderRoleSelect()">‹ Geri</button>
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
    } catch (e) {
      console.error(e);
      this.toast("Giriş yapılamadı: " + e.message, "error");
    }
  },

  /* ---------------------------------------------------------------- */
  /* ADMIN LOGIN                                                        */
  /* ---------------------------------------------------------------- */
  renderAdminLogin() {
    this.el.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-logo">🛠️</div>
          <div class="auth-title">Yönetim Girişi</div>
          <div class="auth-sub">AVM yönetim şifrenizi girin</div>
          <div class="field"><label>Şifre</label><input id="a-pw" type="password" placeholder="••••••" /></div>
          <button class="btn" onclick="App.adminLogin()">Giriş Yap</button>
          <button class="btn block-link" onclick="App.renderRoleSelect()">‹ Geri</button>
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
            <div class="card-row"><div class="card-title">${escapeHtml(p.fullName)}</div><span class="badge normal">${escapeHtml(p.position || "")}</span></div>
            <div class="card-body">📞 ${escapeHtml(p.phone || "-")} &nbsp;·&nbsp; İşe başlama: ${escapeHtml(p.startDate || "-")}</div>
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
      <div class="field"><label>Pozisyon</label><input id="p-pos" placeholder="Örn: Satış Danışmanı" /></div>
      <div class="field"><label>Telefon</label><input id="p-phone" type="tel" placeholder="05xx xxx xx xx" /></div>
      <div class="field"><label>İşe Başlama Tarihi</label><input id="p-date" type="date" /></div>
      <div class="field"><label>Not (opsiyonel)</label><textarea id="p-note" placeholder="Varsa ek bilgi..."></textarea></div>
      <button class="btn" onclick="App.submitPersonnel()">Bildirimi Gönder</button>
    `);
  },

  async submitPersonnel() {
    const fullName = document.getElementById("p-name").value.trim();
    const position = document.getElementById("p-pos").value.trim();
    const phone = document.getElementById("p-phone").value.trim();
    const startDate = document.getElementById("p-date").value;
    const note = document.getElementById("p-note").value.trim();
    if (!fullName) return this.toast("Lütfen ad soyad girin.", "error");
    try {
      await db.collection("personnel").add({
        storeCode: this.session.storeCode,
        storeName: this.session.storeName,
        fullName, position, phone, startDate, note,
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
          <div><div class="title">AVM Yönetim</div><div class="sub">Yönetici Paneli</div></div>
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
    c.innerHTML = `<div class="section-title">Kayıtlı Mağazalar</div><div class="card" id="store-list"></div>`;
    c.insertAdjacentHTML("beforeend", `<button class="fab" onclick="App.openStoreForm()">＋</button>`);
    const list = document.getElementById("store-list");
    const unsub = db.collection("stores").onSnapshot((snap) => {
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state"><span class="emoji">🏪</span>Henüz mağaza eklenmedi.<br>Sağ alttaki + butonuyla mağaza ekleyin.</div>`;
        return;
      }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));
      list.innerHTML = docs.map((s) => `
        <div class="list-item">
          <div>
            <div class="list-item-main">${escapeHtml(s.name)} <span style="color:var(--muted);font-weight:500">(${escapeHtml(s.id)})</span></div>
            <div class="list-item-sub">PIN: ${escapeHtml(String(s.pin))} ${s.phone ? " · " + escapeHtml(s.phone) : ""}</div>
          </div>
          <button class="icon-action danger" onclick="App.deleteStore('${s.id}')">Sil</button>
        </div>`).join("");
    }, (err) => { console.error(err); this.toast("Mağazalar yüklenemedi.", "error"); });
    this.unsubs.push(unsub);
  },

  openStoreForm() {
    openModal(`
      <h3>Yeni Mağaza Ekle</h3>
      <div class="field"><label>Mağaza Kodu</label><input id="s-code" autocapitalize="characters" placeholder="Örn: M101" /></div>
      <div class="field"><label>Mağaza Adı</label><input id="s-name" placeholder="Örn: ABC Giyim" /></div>
      <div class="field"><label>Giriş Şifresi (PIN)</label><input id="s-pin" placeholder="Örn: 1234" /></div>
      <div class="field"><label>Telefon (opsiyonel)</label><input id="s-phone" type="tel" placeholder="05xx xxx xx xx" /></div>
      <button class="btn" onclick="App.submitStore()">Mağazayı Kaydet</button>
    `);
  },

  async submitStore() {
    const code = document.getElementById("s-code").value.trim().toUpperCase();
    const name = document.getElementById("s-name").value.trim();
    const pin = document.getElementById("s-pin").value.trim();
    const phone = document.getElementById("s-phone").value.trim();
    if (!code || !name || !pin) return this.toast("Kod, ad ve şifre zorunludur.", "error");
    try {
      await db.collection("stores").doc(code).set({
        code, name, pin, phone,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      closeModal();
      this.toast("Mağaza kaydedildi.", "success");
    } catch (e) {
      console.error(e);
      this.toast("Kaydedilemedi: " + e.message, "error");
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
          <div class="card-body">${escapeHtml(p.position || "")} · 📞 ${escapeHtml(p.phone || "-")} · Başlama: ${escapeHtml(p.startDate || "-")}</div>
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
    } catch (e) {
      this.toast("Yayınlanamadı: " + e.message, "error");
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

App.init();
