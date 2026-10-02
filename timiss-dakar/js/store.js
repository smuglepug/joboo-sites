/* ==========================================================================
   Timiss — store.js
   The data layer. Today: localStorage (single device, no server needed).
   --------------------------------------------------------------------------
   Everything that touches money or history goes through DOT.store, so
   swapping in a real backend later = reimplementing these methods against
   config.backend.apiBaseUrl. See README → "Going live → data layer".

   Ledger rules (there is exactly one definition of each term):
     spendable  = balance + bonus          (can be spent right now)
     balance    = principal credits        (your own money, as credit)
     bonus      = promotional credits      (earned à partir de a plan tier)
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
    escrow: [],   // {id, kind:"plan"|"commande", amount, bonusCredit, label, ref, status, at, releasedAt}
    cart: [],     // {id, qty}
    commandes: [],   // {id, ref, articles, total, status, payment, delivery, at, releasedAt, note}
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
      console.warn("[Timiss] Could not read local data, starting fresh.", e);
      return clone(DEFAULT_STATE);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("[Timiss] Could not save local data.", e); }
    listeners.forEach(function (fn) { try { fn(state); } catch (err) { console.error(err); } });
  }

  function subscribe(fn) { listeners.push(fn); fn(state); }

  /* ---------- money helpers ---------- */
  function XOF(n) {
    var v = Math.round(Number(n) || 0);
    return CFG.business.currencySymbol + v.toLocaleString("en-NG");
  }
  function spendable() { return state.balance + state.bonus; }
  function escrowHeld() {
    return state.escrow.filter(function (e) { return e.status === "held"; })
      .reduce(function (s, e) { return s + e.amount + (e.bonusCredit || 0); }, 0);
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
  function planForMontant(amount) {
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
    XOF: XOF,
    planById: planById,
    planForMontant: planForMontant,
    bonusFor: bonusFor,
    subscribe: subscribe,
    money: XOF,

    /* --- profile --- */
    setProfile: function (patch) { Object.assign(state.profile, patch); save(); },

    /* --- cart --- */
    cart: function () { return state.cart; },
    cartCount: function () { return state.cart.reduce(function (s, l) { return s + l.qty; }, 0); },
    cartLines: function () {
      return state.cart.map(function (l) {
        var item = window.DOT_MENU.filter(function (m) { return m.id === l.id; })[0];
        if (!item) return null;
        return { id: item.id, name: item.name, price: item.price, qty: l.qty, cat: item.cat, img: item.img, lineTotal: item.price * l.qty };
      }).filter(Boolean);
    },
    cartTotal: function () {
      return api.cartLines().reduce(function (s, l) { return s + l.lineTotal; }, 0);
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

      if (amount <= 0) { res.reason = "Saisissez un montant à recharger."; return res; }
      if (!plan) { res.reason = "Choisissez d\'abord un forfait."; return res; }
      if (amount < plan.minTopUp) {
        res.reason = plan.name + " commence à " + XOF(plan.minTopUp) + " par rechargement. Réduisez le forfait ou ajoutez.";
        return res;
      }
      var calc = bonusFor(amount, plan);
      res.bonus = calc.bonus;

      if (opts.mode === "escrow") {
        state.escrow.push({
          id: uid("esc"), kind: "plan", planId: plan.id, label: plan.name + " rechargements",
          amount: amount, bonusCredit: calc.bonus, status: "held", at: now(), ref: uid("DC-ESC").toUpperCase()
        });
        record({
          type: "escrow_hold", sign: "hold", title: "Payment hold — " + plan.name,
          detail: XOF(amount) + " + " + XOF(calc.bonus) + " bonus held until you confirm delivery.",
          amount: amount + calc.bonus
        });
        res.ok = true; res.mode = "escrow"; save(); return res;
      }

      state.balance += amount;
      record({ type: "topup", sign: "in", title: "Top-ups — " + plan.name, detail: "Paid via demo checkout", amount: amount });
      if (calc.bonus > 0) {
        state.bonus += calc.bonus;
        record({ type: "bonus", sign: "in", title: "Crédit bonus (" + Math.round(calc.rate * 100) + "%)", detail: plan.name + " tier reward", amount: calc.bonus });
      }
      res.ok = true; res.mode = "direct"; save(); return res;
    },

    releaseEscrow: function (id) {
      var e = state.escrow.filter(function (x) { return x.id === id; })[0];
      if (!e || e.status !== "held") return { ok: false, reason: "Rien à libérer." };
      e.status = "released"; e.releasedAt = now();
      if (e.kind === "plan") {
        state.balance += e.amount;
        state.bonus += (e.bonusCredit || 0);
        record({ type: "escrow_release", sign: "in", title: "Escrow released — " + e.label,
          detail: XOF(e.amount) + " + " + XOF(e.bonusCredit || 0) + " bonus moved to spendable credits.",
          amount: e.amount + (e.bonusCredit || 0) });
      } else {
        record({ type: "commande", sign: "out", title: "Commande paid à partir de escrow — " + e.label,
          detail: "Released on delivery confirmation (" + (e.ref || "") + ")", amount: e.amount });
      }
      save(); return { ok: true, escrow: e };
    },

    /* --- commandes --- */
    placeCommande: function (o) {
      var lines = api.cartLines();
      if (!lines.length) return { ok: false, reason: "Votre commande est vide." };
      var total = api.cartTotal();
      var ref = "DC-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10);
      var payment = o.payment || "whatsapp";

      if (payment === "wallet" || payment === "wallet-escrow") {
        if (spendable() < total) {
          return { ok: false, reason: "Crédits insuffisants (" + XOF(spendable()) + " of " + XOF(total) + "). Rechargez ou payez à la livraison." };
        }
      }
      if (payment === "wallet") {
        var fromBonus = Math.min(state.bonus, total);
        state.bonus -= fromBonus;
        state.balance -= (total - fromBonus);
        record({ type: "commande", sign: "out", title: "Commande " + ref + " payée avec le portefeuille",
          detail: lines.map(function (l) { return l.qty + "× " + l.name; }).join(", "), amount: total });
      }
      if (payment === "wallet-escrow") {
        // credits leave spendable and are held until you confirm delivery
        var holdBonus = Math.min(state.bonus, total);
        state.bonus -= holdBonus;
        state.balance -= (total - holdBonus);
        state.escrow.push({
          id: uid("esc"), kind: "commande", label: "Commande " + ref, ref: ref,
          amount: total, bonusCredit: 0, status: "held", at: now()
        });
        record({ type: "escrow_hold", sign: "hold", title: "Commande " + ref + " — crédits conservés jusqu\'à confirmation",
          detail: "Conservé jusqu\'à ce que vous confirmiez la livraison.", amount: total });
      }

      var commande = {
        id: uid("ord"), ref: ref, articles: lines, total: total, status: "placed",
        payment: payment, delivery: o.delivery || {}, note: o.note || "",
        customer: { name: o.name || "", phone: o.phone || "" }, at: now()
      };
      state.commandes.unshift(commande);
      state.cart = [];
      save();
      return { ok: true, commande: commande, total: total };
    },

    confirmLivraison: function (commandeId) {
      var commande = state.commandes.filter(function (x) { return x.id === commandeId; })[0];
      if (!commande) return { ok: false, reason: "Commande introuvable." };
      commande.status = "delivered";
      commande.deliveredAt = now();
      var hold = state.escrow.filter(function (e) { return e.kind === "commande" && e.ref === commande.ref && e.status === "held"; })[0];
      if (hold) api.releaseEscrow(hold.id);
      else record({ type: "commande", sign: "info", title: "Livraison confirmée — " + commande.ref,
        detail: "Payé à la livraison via WhatsApp.", amount: commande.total });
      save();
      return { ok: true, commande: commande };
    },

    cancelOrder: function (commandeId) {
      var commande = state.commandes.filter(function (x) { return x.id === commandeId; })[0];
      if (!commande) return { ok: false };
      commande.status = "cancelled";
      var hold = state.escrow.filter(function (e) { return e.kind === "commande" && e.ref === commande.ref && e.status === "held"; })[0];
      if (hold) { hold.status = "released"; hold.releasedAt = now(); state.balance += hold.amount; }
      if (commande.payment === "wallet") { state.balance += commande.total; }
      record({ type: "refund", sign: "in", title: "Commande " + commande.ref + " cancelled — refunded",
        detail: commande.payment === "whatsapp" ? "Aucun débit (payé à la livraison)." : "Crédits rendus utilisables.", amount: commande.payment === "whatsapp" ? 0 : commande.total });
      save(); return { ok: true };
    },

    /* --- analytics for the dashboard --- */
    weekSpend: function () {
      var since = Date.now() - 7 * 24 * 3600 * 1000;
      return state.tx.filter(function (t) { return (t.type === "commande") && t.sign === "out" && new Date(t.at).getTime() >= since; })
        .reduce(function (s, t) { return s + t.amount; }, 0);
    },
    spendByGroup: function () {
      var out = {};
      state.commandes.forEach(function (o) {
        if (o.status === "cancelled") return;
        o.articles.forEach(function (l) {
          var g = (window.DOT_SPEND_GROUPS[l.cat] || "Other");
          out[g] = (out[g] || 0) + l.lineTotal;
        });
      });
      // wallet-funded transactions also count if commandes were paid without cart history
      return Object.keys(out).map(function (k) { return { label: k, value: out[k] }; })
        .sort(function (a, b) { return b.value - a.value; });
    },
    activeCommandes: function () {
      return state.commandes.filter(function (o) { return o.status === "placed"; });
    },
    heldEscrow: function () {
      return state.escrow.filter(function (e) { return e.status === "held"; });
    },

    /* --- demo helpers (clearly labelled in the UI) --- */
    loadSampleData: function () {
      if (state.balance || state.bonus || state.commandes.length) {
        return { ok: false, reason: "Les données d\'exemple ne se chargent que dans un portefeuille vide." };
      }
      var plan = planById("wallet-wednesday");
      state.balance += 250000;
      record({ type: "topup", sign: "in", title: "Top-ups — Wallet Wednesday (sample)", detail: "Demo checkout", amount: 250000 });
      state.bonus += 17500;
      record({ type: "bonus", sign: "in", title: "Crédit bonus (7%)", detail: "Wallet Wednesday tier reward", amount: 17500 });
      var picks = ["dot-special-shawarma", "dot-signature-rice", "zobo", "loaded-fries", "meat-pie"];
      picks.forEach(function (id, i) {
        var item = window.DOT_MENU.filter(function (m) { return m.id === id; })[0];
        var qty = i % 2 ? 2 : 1;
        var total = item.price * qty;
        state.commandes.push({
          id: uid("ord"), ref: "DC-SAMPLE" + (i + 1), status: i === 4 ? "placed" : "delivered",
          payment: "wallet", total: total, at: new Date(Date.now() - (i + 1) * 26 * 3600 * 1000).toISOString(),
          articles: [{ id: item.id, name: item.name, price: item.price, qty: qty, cat: item.cat, img: item.img, lineTotal: total }],
          delivery: { mode: "delivery", hostel: "Bâtiment C", room: "C214" }, note: "Commande d\'exemple"
        });
        state.balance -= total;
        record({ type: "commande", sign: "out", title: "Commande DC-SAMPLE" + (i + 1) + " payée avec le portefeuille", detail: qty + "× " + item.name, amount: total });
      });
      state.escrow.push({ id: uid("esc"), kind: "commande", label: "Commande DC-SAMPLE5", ref: "DC-SAMPLE5", amount: 1600, bonusCredit: 0, status: "held", at: now() });
      record({ type: "escrow_hold", sign: "hold", title: "Commande DC-SAMPLE5 — crédits conservés jusqu\'à confirmation", detail: "Held until delivery is confirmed.", amount: 1600 });
      return { ok: true };
    },
    resetAll: function () { localStorage.removeItem(KEY); window.location.reload(); },

    /* --- export --- */
    toCSV: function () {
      var rows = [["Date", "Type", "Title", "Detail", "Montant (XOF)", "Direction", "Spendable after", "Escrow after"]];
      state.tx.forEach(function (t) {
        rows.push([t.at, t.type, t.title, t.detail, t.amount, t.sign, t.balanceAfter, t.escrowAfter]);
      });
      return rows.map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\n");
    },

    /* --- WhatsApp deep link builder (the "seamless messaging integration") --- */
    buildCommandeLink: function (o) {
      var lines = o.articles || api.cartLines();
      var total = lines.reduce(function (s, l) { return s + l.lineTotal; }, 0);
      var b = CFG.business;
      var msg = [];
      msg.push("*NEW ORDER — " + b.name + "* 🍽️");
      msg.push("Ref: " + (o.ref || "(pending)"));
      msg.push("");
      msg.push("*Commande:*");
      lines.forEach(function (l, i) {
        msg.push((i + 1) + ". " + l.name + " × " + l.qty + " — " + XOF(l.lineTotal));
      });
      msg.push("");
      msg.push("*Total: " + XOF(total) + "*");
      msg.push("");
      msg.push("*Fulfilment:* " + (o.delivery && o.delivery.mode === "delivery" ? "Livraison locally" : "À emporter at our counter"));
      if (o.delivery && o.delivery.mode === "delivery") {
        msg.push("*Address:* " + (o.delivery.hostel || "—"));
        msg.push("*Room:* " + (o.delivery.room || "—"));
      }
      msg.push("*Paiement:* " + (o.paymentLabel || "Pay on delivery (WhatsApp)"));
      if (o.name) msg.push("*Name:* " + o.name);
      if (o.phone) msg.push("*Phone:* " + o.phone);
      if (o.note) { msg.push(""); msg.push("*Note:* " + o.note); }
      msg.push("");
      msg.push(b.assistantTriggerWord ? "Sent à partir de dotcafeltd.com commande builder — replying as “" + b.assistantTriggerWord + "”." : "Sent à partir de the Timiss commande builder.");
      return b.whatsappLink + "?text=" + encodeURIComponent(msg.join("\n"));
    },

    buildQuickLink: function () {
      var b = CFG.business;
      return b.whatsappLink + "?text=" + encodeURIComponent(
        "Timiss 👋 — I'd like to commande à partir de " + b.name + " (" + b.location + ")."
      );
    }
  };

  window.DOT = window.DOT || {};
  window.DOT.store = api;
})();
