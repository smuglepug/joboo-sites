/* ==========================================================================
   Asharti BBQ Nights — store.js
   The data layer. Today: localStorage (single device, no server needed).
   --------------------------------------------------------------------------
   Everything that touches money or history goes through DOT.store, so
   swapping in a real backend later = reimplementing these methods against
   config.backend.apiBaseUrl. See README → "Going live → data layer".

   Ledger rules (there is exactly one definition of each term):
     spendable  = balance + bonus          (can be spent right now)
     balance    = principal credits        (your own money, as credit)
     bonus      = promotional credits      (earned से शुरू a plan tier)
     escrow     = credits held, not spendable until you release them
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.DOT_CAFE_CONFIG;
  var KEY = "dotcafe.v1";
  var listeners = [];

  var DEFAULT_STATE = {
    version: 1,
    createdAt: new Date().toISOString(),
    profile: { name: "", phone: "", email: "", hostel: "", room: "" },
    balance: 0,
    bonus: 0,
    escrow: [],   // {id, kind:"plan"|"ऑर्डर", amount, bonusक्रेडिट, label, ref, status, at, releasedAt}
    cart: [],     // {id, qty}
    ऑर्डरs: [],   // {id, ref, आइटम, total, status, payment, delivery, at, releasedAt, note}
    tx: [],       // {id, at, type, title, detail, amount, balanceAfter, escrowAfter, sign}
    prefs: { notificationsRequested: false, lastPlanId: "chop-life" }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return (p || "id") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function now() { return new Date().toISOString(); }

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT_STATE);
      var parsed = JSON.parse(raw);
      // shallow-merge so new fields appear for existing users
      var merged = Object.assign(clone(DEFAULT_STATE), parsed);
      merged.profile = Object.assign(clone(DEFAULT_STATE.profile), parsed.profile || {});
      merged.prefs = Object.assign(clone(DEFAULT_STATE.prefs), parsed.prefs || {});
      return merged;
    } catch (e) {
      console.warn("[Asharti BBQ Nights] Could not read local data, starting fresh.", e);
      return clone(DEFAULT_STATE);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("[Asharti BBQ Nights] Could not save local data.", e); }
    listeners.forEach(function (fn) { try { fn(state); } catch (err) { console.error(err); } });
  }

  function subscribe(fn) { listeners.push(fn); fn(state); }

  /* ---------- money helpers ---------- */
  function Rupee(n) {
    var v = Math.round(Number(n) || 0);
    return CFG.business.currencySymbol + v.toLocaleString("en-NG");
  }
  function spendable() { return state.balance + state.bonus; }
  function escrowHeld() {
    return state.escrow.filter(function (e) { return e.status === "held"; })
      .reduce(function (s, e) { return s + e.amount + (e.bonusक्रेडिट || 0); }, 0);
  }
  function escrowPrincipal() {
    return state.escrow.filter(function (e) { return e.status === "held"; })
      .reduce(function (s, e) { return s + e.amount; }, 0);
  }
  function bonusHeld() { return escrowHeld() - escrowPrincipal(); }

  /* ---------- ledger ---------- */
  function record(tx) {
    var entry = Object.assign({
      id: uid("tx"), at: now(), type: "adjustment", title: "", detail: "",
      amount: 0, sign: "info", balanceAfter: spendable(), escrowAfter: escrowHeld()
    }, tx);
    state.tx.unshift(entry);
    if (state.tx.length > 500) state.tx.length = 500;
    return entry;
  }

  function planById(id) {
    var plans = CFG.wallet.plans;
    for (var i = 0; i < plans.length; i++) if (plans[i].id === id) return plans[i];
    return null;
  }
  function planForराशि(amount) {
    // highest tier whose minimum the amount reaches
    var eligible = CFG.wallet.plans.filter(function (p) { return amount >= p.minTopUp; });
    if (!eligible.length) return null;
    return eligible.sort(function (a, b) { return b.bonusRate - a.bonusRate; })[0];
  }
  function bonusFor(amount, plan) {
    var rate = plan ? plan.bonusRate : 0;
    return { rate: rate, bonus: Math.round(amount * rate) };
  }

  /* ================= PUBLIC API ================= */
  var api = {
    /* --- read --- */
    get: function () { return state; },
    spendable: spendable,
    escrowHeld: escrowHeld,
    escrowPrincipal: escrowPrincipal,
    bonusHeld: bonusHeld,
    Rupee: Rupee,
    planById: planById,
    planForराशि: planForराशि,
    bonusFor: bonusFor,
    subscribe: subscribe,
    money: Rupee,

    /* --- profile --- */
    setProfile: function (patch) { Object.assign(state.profile, patch); save(); },

    /* --- cart --- */
    cart: function () { return state.cart; },
    cartCount: function () { return state.cart.reduce(function (s, l) { return s + l.qty; }, 0); },
    cartLines: function () {
      return state.cart.map(function (l) {
        var item = window.DOT_MENU.filter(function (m) { return m.id === l.id; })[0];
        if (!item) return null;
        return { id: item.id, name: item.name, price: item.price, qty: l.qty, cat: item.cat, img: item.img, lineकुल: item.price * l.qty };
      }).filter(Boolean);
    },
    cartकुल: function () {
      return api.cartLines().reduce(function (s, l) { return s + l.lineकुल; }, 0);
    },
    addToCart: function (id, qty) {
      var line = state.cart.filter(function (l) { return l.id === id; })[0];
      if (line) line.qty += (qty || 1); else state.cart.push({ id: id, qty: qty || 1 });
      save(); return api.cartCount();
    },
    setQty: function (id, qty) {
      var i = state.cart.findIndex(function (l) { return l.id === id; });
      if (i < 0) return;
      if (qty <= 0) state.cart.splice(i, 1); else state.cart[i].qty = qty;
      save();
    },
    clearCart: function () { state.cart = []; save(); },

    /* --- wallet --- */
    topUp: function (opts) {
      var amount = Math.round(Number(opts.amount) || 0);
      var plan = planById(opts.planId);
      var res = { ok: false, reason: "", bonus: 0, plan: plan };

      if (amount <= 0) { res.reason = "टॉप अप राशि डालें।"; return res; }
      if (!plan) { res.reason = "पहले वॉलेट प्लान चुनें।"; return res; }
      if (amount < plan.minTopUp) {
        res.reason = plan.name + " से शुरू " + Rupee(plan.minTopUp) + " प्रति टॉप अप। प्लान घटाएं या और जोड़ें।";
        return res;
      }
      var calc = bonusFor(amount, plan);
      res.bonus = calc.bonus;

      if (opts.mode === "escrow") {
        state.escrow.push({
          id: uid("esc"), kind: "plan", planId: plan.id, label: plan.name + " टॉप अप",
          amount: amount, bonusक्रेडिट: calc.bonus, status: "held", at: now(), ref: uid("DC-ESC").toUpperCase()
        });
        record({
          type: "escrow_hold", sign: "hold", title: "Payment hold — " + plan.name,
          detail: Rupee(amount) + " + " + Rupee(calc.bonus) + " bonus held until you confirm delivery.",
          amount: amount + calc.bonus
        });
        res.ok = true; res.mode = "escrow"; save(); return res;
      }

      state.balance += amount;
      record({ type: "topup", sign: "in", title: "Wallet टॉप अप — " + plan.name, detail: "Paid via demo checkout", amount: amount });
      if (calc.bonus > 0) {
        state.bonus += calc.bonus;
        record({ type: "bonus", sign: "in", title: "बोनस क्रेडिट (" + Math.round(calc.rate * 100) + "%)", detail: plan.name + " tier reward", amount: calc.bonus });
      }
      res.ok = true; res.mode = "direct"; save(); return res;
    },

    releaseEscrow: function (id) {
      var e = state.escrow.filter(function (x) { return x.id === id; })[0];
      if (!e || e.status !== "held") return { ok: false, reason: "कुछ जारी करने को नहीं है।" };
      e.status = "released"; e.releasedAt = now();
      if (e.kind === "plan") {
        state.balance += e.amount;
        state.bonus += (e.bonusक्रेडिट || 0);
        record({ type: "escrow_release", sign: "in", title: "Escrow released — " + e.label,
          detail: Rupee(e.amount) + " + " + Rupee(e.bonusक्रेडिट || 0) + " bonus moved to spendable credits.",
          amount: e.amount + (e.bonusक्रेडिट || 0) });
      } else {
        record({ type: "ऑर्डर", sign: "out", title: "ऑर्डर एस्क्रो से भुगतान — " + e.label,
          detail: "डिलीवरी पुष्टि पर जारी (" + (e.ref || "") + ")", amount: e.amount });
      }
      save(); return { ok: true, escrow: e };
    },

    /* --- ऑर्डरs --- */
    placeऑर्डर: function (o) {
      var lines = api.cartLines();
      if (!lines.length) return { ok: false, reason: "आपका ऑर्डर खाली है।" };
      var total = api.cartकुल();
      var ref = "DC-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10);
      var payment = o.payment || "whatsapp";

      if (payment === "wallet" || payment === "wallet-escrow") {
        if (spendable() < total) {
          return { ok: false, reason: "पर्याप्त क्रेडिट नहीं (" + Rupee(spendable()) + " of " + Rupee(total) + ")। टॉप अप करें या डिलीवरी पर दें।" };
        }
      }
      if (payment === "wallet") {
        var fromबोनस = Math.min(state.bonus, total);
        state.bonus -= fromबोनस;
        state.balance -= (total - fromबोनस);
        record({ type: "ऑर्डर", sign: "out", title: "ऑर्डर " + ref + " वॉलेट से भुगतान",
          detail: lines.map(function (l) { return l.qty + "× " + l.name; }).join(", "), amount: total });
      }
      if (payment === "wallet-escrow") {
        // credits leave spendable and are held until you confirm delivery
        var holdबोनस = Math.min(state.bonus, total);
        state.bonus -= holdबोनस;
        state.balance -= (total - holdबोनस);
        state.escrow.push({
          id: uid("esc"), kind: "ऑर्डर", label: "ऑर्डर " + ref, ref: ref,
          amount: total, bonusक्रेडिट: 0, status: "held", at: now()
        });
        record({ type: "escrow_hold", sign: "hold", title: "ऑर्डर " + ref + " — क्रेडिट डिलीवरी की पुष्टि तक रोके गए",
          detail: "जब तक आप खाना पहुंचने की पुष्टि न करें, तब तक रोका जाएगा।", amount: total });
      }

      var ऑर्डर = {
        id: uid("ord"), ref: ref, आइटम: lines, total: total, status: "placed",
        payment: payment, delivery: o.delivery || {}, note: o.note || "",
        customer: { name: o.name || "", phone: o.phone || "" }, at: now()
      };
      state.ऑर्डरs.unshift(ऑर्डर);
      state.cart = [];
      save();
      return { ok: true, ऑर्डर: ऑर्डर, total: total };
    },

    confirmडिलीवरी: function (ऑर्डरId) {
      var ऑर्डर = state.ऑर्डरs.filter(function (x) { return x.id === ऑर्डरId; })[0];
      if (!ऑर्डर) return { ok: false, reason: "ऑर्डर नहीं मिला।" };
      ऑर्डर.status = "delivered";
      ऑर्डर.deliveredAt = now();
      var hold = state.escrow.filter(function (e) { return e.kind === "ऑर्डर" && e.ref === ऑर्डर.ref && e.status === "held"; })[0];
      if (hold) api.releaseEscrow(hold.id);
      else record({ type: "ऑर्डर", sign: "info", title: "डिलीवरी की पुष्टि — " + ऑर्डर.ref,
        detail: "व्हाट्सएप के जरिए डिलीवरी पर भुगतान।", amount: ऑर्डर.total });
      save();
      return { ok: true, ऑर्डर: ऑर्डर };
    },

    cancelOrder: function (ऑर्डरId) {
      var ऑर्डर = state.ऑर्डरs.filter(function (x) { return x.id === ऑर्डरId; })[0];
      if (!ऑर्डर) return { ok: false };
      ऑर्डर.status = "cancelled";
      var hold = state.escrow.filter(function (e) { return e.kind === "ऑर्डर" && e.ref === ऑर्डर.ref && e.status === "held"; })[0];
      if (hold) { hold.status = "released"; hold.releasedAt = now(); state.balance += hold.amount; }
      if (ऑर्डर.payment === "wallet") { state.balance += ऑर्डर.total; }
      record({ type: "refund", sign: "in", title: "ऑर्डर " + ऑर्डर.ref + " cancelled — refunded",
        detail: ऑर्डर.payment === "whatsapp" ? "कोई वॉलेट शुल्क नहीं (डिलीवरी पर भुगतान)।" : "क्रेडिट वापस उपयोग योग्य हो गए।", amount: ऑर्डर.payment === "whatsapp" ? 0 : ऑर्डर.total });
      save(); return { ok: true };
    },

    /* --- analytics for the dashboard --- */
    weekSpend: function () {
      var since = Date.now() - 7 * 24 * 3600 * 1000;
      return state.tx.filter(function (t) { return (t.type === "ऑर्डर") && t.sign === "out" && new Date(t.at).getTime() >= since; })
        .reduce(function (s, t) { return s + t.amount; }, 0);
    },
    spendByGroup: function () {
      var out = {};
      state.ऑर्डरs.forEach(function (o) {
        if (o.status === "cancelled") return;
        o.आइटम.forEach(function (l) {
          var g = (window.DOT_SPEND_GROUPS[l.cat] || "Other");
          out[g] = (out[g] || 0) + l.lineकुल;
        });
      });
      // wallet-funded transactions also count if ऑर्डरs were paid without cart history
      return Object.keys(out).map(function (k) { return { label: k, value: out[k] }; })
        .sort(function (a, b) { return b.value - a.value; });
    },
    activeऑर्डरs: function () {
      return state.ऑर्डरs.filter(function (o) { return o.status === "placed"; });
    },
    heldEscrow: function () {
      return state.escrow.filter(function (e) { return e.status === "held"; });
    },

    /* --- demo helpers (clearly labelled in the UI) --- */
    loadSampleData: function () {
      if (state.balance || state.bonus || state.ऑर्डरs.length) {
        return { ok: false, reason: "नमूना डेटा केवल खाली वॉलेट में लोड होता है।" };
      }
      var plan = planById("wallet-wednesday");
      state.balance += 250000;
      record({ type: "topup", sign: "in", title: "Wallet टॉप अप — Wallet Wednesday (sample)", detail: "Demo checkout", amount: 250000 });
      state.bonus += 17500;
      record({ type: "bonus", sign: "in", title: "बोनस क्रेडिट (7%)", detail: "Wallet Wednesday tier reward", amount: 17500 });
      var picks = ["dot-special-shawarma", "dot-signature-rice", "zobo", "loaded-fries", "meat-pie"];
      picks.forEach(function (id, i) {
        var item = window.DOT_MENU.filter(function (m) { return m.id === id; })[0];
        var qty = i % 2 ? 2 : 1;
        var total = item.price * qty;
        state.ऑर्डरs.push({
          id: uid("ord"), ref: "DC-SAMPLE" + (i + 1), status: i === 4 ? "placed" : "delivered",
          payment: "wallet", total: total, at: new Date(Date.now() - (i + 1) * 26 * 3600 * 1000).toISOString(),
          आइटम: [{ id: item.id, name: item.name, price: item.price, qty: qty, cat: item.cat, img: item.img, lineकुल: total }],
          delivery: { mode: "delivery", hostel: "ब्लॉक C", room: "C214" }, note: "नमूना ऑर्डर"
        });
        state.balance -= total;
        record({ type: "ऑर्डर", sign: "out", title: "ऑर्डर DC-SAMPLE" + (i + 1) + " वॉलेट से भुगतान", detail: qty + "× " + item.name, amount: total });
      });
      state.escrow.push({ id: uid("esc"), kind: "ऑर्डर", label: "ऑर्डर DC-SAMPLE5", ref: "DC-SAMPLE5", amount: 1600, bonusक्रेडिट: 0, status: "held", at: now() });
      record({ type: "escrow_hold", sign: "hold", title: "ऑर्डर DC-SAMPLE5 — क्रेडिट डिलीवरी की पुष्टि तक रोके गए", detail: "Held until delivery is confirmed.", amount: 1600 });
      return { ok: true };
    },
    resetAll: function () { localStorage.removeItem(KEY); window.location.reload(); },

    /* --- export --- */
    toCSV: function () {
      var rows = [["Date", "Type", "Title", "Detail", "राशि (INR)", "Direction", "Spendable after", "Escrow after"]];
      state.tx.forEach(function (t) {
        rows.push([t.at, t.type, t.title, t.detail, t.amount, t.sign, t.balanceAfter, t.escrowAfter]);
      });
      return rows.map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\n");
    },

    /* --- WhatsApp deep link builder (the "seamless messaging integration") --- */
    buildऑर्डरLink: function (o) {
      var lines = o.आइटम || api.cartLines();
      var total = lines.reduce(function (s, l) { return s + l.lineकुल; }, 0);
      var b = CFG.business;
      var msg = [];
      msg.push("*NEW ORDER — " + b.name + "* 🍽️");
      msg.push("Ref: " + (o.ref || "(pending)"));
      msg.push("");
      msg.push("*ऑर्डर:*");
      lines.forEach(function (l, i) {
        msg.push((i + 1) + ". " + l.name + " × " + l.qty + " — " + Rupee(l.lineकुल));
      });
      msg.push("");
      msg.push("*कुल: " + Rupee(total) + "*");
      msg.push("");
      msg.push("*Fulfilment:* " + (o.delivery && o.delivery.mode === "delivery" ? "डिलीवरी locally" : "पिकअप at our counter"));
      if (o.delivery && o.delivery.mode === "delivery") {
        msg.push("*Address:* " + (o.delivery.hostel || "—"));
        msg.push("*Room:* " + (o.delivery.room || "—"));
      }
      msg.push("*भुगतान:* " + (o.paymentLabel || "Pay on delivery (WhatsApp)"));
      if (o.name) msg.push("*Name:* " + o.name);
      if (o.phone) msg.push("*Phone:* " + o.phone);
      if (o.note) { msg.push(""); msg.push("*Note:* " + o.note); }
      msg.push("");
      msg.push(b.assistantTriggerWord ? "Sent से शुरू dotcafeltd.com ऑर्डर builder — replying as “" + b.assistantTriggerWord + "”." : "Sent से शुरू the Asharti BBQ Nights ऑर्डर builder.");
      return b.whatsappLink + "?text=" + encodeURIComponent(msg.join("\n"));
    },

    buildQuickLink: function () {
      var b = CFG.business;
      return b.whatsappLink + "?text=" + encodeURIComponent(
        "Asharti 👋 — I'd like to ऑर्डर से शुरू " + b.name + " (" + b.location + ")."
      );
    }
  };

  window.DOT = window.DOT || {};
  window.DOT.store = api;
})();
