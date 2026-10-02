/* ==========================================================================
   Sushi Naka — store.js
   The data layer. Today: localStorage (single device, no server needed).
   --------------------------------------------------------------------------
   Everything that touches money or history goes through DOT.store, so
   swapping in a real backend later = reimplementing these methods against
   config.backend.apiBaseUrl. See README → "Going live → data layer".

   Ledger rules (there is exactly one definition of each term):
     spendable  = balance + bonus          (can be spent right now)
     balance    = principal credits        (your own money, as credit)
     bonus      = promotional credits      (earned a partir de a plan tier)
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
    escrow: [],   // {id, kind:"plan"|"pedido", amount, bonusCredit, label, ref, status, at, releasedAt}
    cart: [],     // {id, qty}
    pedidos: [],   // {id, ref, itens, total, status, payment, delivery, at, releasedAt, note}
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
      console.warn("[Sushi Naka] Não foi possível ler os dados locais, começando do zero.", e);
      return clone(DEFAULT_STATE);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("[Sushi Naka] Não foi possível salvar os dados locais.", e); }
    listeners.forEach(function (fn) { try { fn(state); } catch (err) { console.error(err); } });
  }

  function subscribe(fn) { listeners.push(fn); fn(state); }

  /* ---------- money helpers ---------- */
  function Real(n) {
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
  function planForValor(amount) {
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
    Real: Real,
    planById: planById,
    planForValor: planForValor,
    bonusFor: bonusFor,
    subscribe: subscribe,
    money: Real,

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

      if (amount <= 0) { res.reason = "Informe um valor para recarregar."; return res; }
      if (!plan) { res.reason = "Escolha um plano primeiro."; return res; }
      if (amount < plan.minTopUp) {
        res.reason = plan.name + " começa em " + Real(plan.minTopUp) + " por recarga. Reduza o plano ou adicione mais.";
        return res;
      }
      var calc = bonusFor(amount, plan);
      res.bonus = calc.bonus;

      if (opts.mode === "escrow") {
        state.escrow.push({
          id: uid("esc"), kind: "plan", planId: plan.id, label: plan.name + " recargas",
          amount: amount, bonusCredit: calc.bonus, status: "held", at: now(), ref: uid("DC-ESC").toUpperCase()
        });
        record({
          type: "escrow_hold", sign: "hold", title: "Payment hold — " + plan.name,
          detail: Real(amount) + " + " + Real(calc.bonus) + " bonus held until you confirm delivery.",
          amount: amount + calc.bonus
        });
        res.ok = true; res.mode = "escrow"; save(); return res;
      }

      state.balance += amount;
      record({ type: "topup", sign: "in", title: "Wallet recargas — " + plan.name, detail: "Paid via demo checkout", amount: amount });
      if (calc.bonus > 0) {
        state.bonus += calc.bonus;
        record({ type: "bonus", sign: "in", title: "Crédito bônus (" + Math.round(calc.rate * 100) + "%)", detail: plan.name + " tier reward", amount: calc.bonus });
      }
      res.ok = true; res.mode = "direct"; save(); return res;
    },

    releaseEscrow: function (id) {
      var e = state.escrow.filter(function (x) { return x.id === id; })[0];
      if (!e || e.status !== "held") return { ok: false, reason: "Nada a liberar." };
      e.status = "released"; e.releasedAt = now();
      if (e.kind === "plan") {
        state.balance += e.amount;
        state.bonus += (e.bonusCredit || 0);
        record({ type: "escrow_release", sign: "in", title: "Escrow released — " + e.label,
          detail: Real(e.amount) + " + " + Real(e.bonusCredit || 0) + " bonus moved to spendable credits.",
          amount: e.amount + (e.bonusCredit || 0) });
      } else {
        record({ type: "pedido", sign: "out", title: "Pedido pago do escrow — " + e.label,
          detail: "Liberado na confirmação da entrega (" + (e.ref || "") + ")", amount: e.amount });
      }
      save(); return { ok: true, escrow: e };
    },

    /* --- pedidos --- */
    placePedido: function (o) {
      var lines = api.cartLines();
      if (!lines.length) return { ok: false, reason: "Seu pedido está vazio." };
      var total = api.cartTotal();
      var ref = "DC-" + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10);
      var payment = o.payment || "whatsapp";

      if (payment === "wallet" || payment === "wallet-escrow") {
        if (spendable() < total) {
          return { ok: false, reason: "Créditos insuficientes (" + Real(spendable()) + " of " + Real(total) + "). Recarregue ou pague na entrega." };
        }
      }
      if (payment === "wallet") {
        var fromBônus = Math.min(state.bonus, total);
        state.bonus -= fromBônus;
        state.balance -= (total - fromBônus);
        record({ type: "pedido", sign: "out", title: "Pedido " + ref + " pago com a carteira",
          detail: lines.map(function (l) { return l.qty + "× " + l.name; }).join(", "), amount: total });
      }
      if (payment === "wallet-escrow") {
        // credits leave spendable and are held until you confirm delivery
        var holdBônus = Math.min(state.bonus, total);
        state.bonus -= holdBônus;
        state.balance -= (total - holdBônus);
        state.escrow.push({
          id: uid("esc"), kind: "pedido", label: "Pedido " + ref, ref: ref,
          amount: total, bonusCredit: 0, status: "held", at: now()
        });
        record({ type: "escrow_hold", sign: "hold", title: "Pedido " + ref + " — créditos ficam retidos até a confirmação",
          detail: "Retido até você confirmar que a comida chegou.", amount: total });
      }

      var pedido = {
        id: uid("ord"), ref: ref, itens: lines, total: total, status: "placed",
        payment: payment, delivery: o.delivery || {}, note: o.note || "",
        customer: { name: o.name || "", phone: o.phone || "" }, at: now()
      };
      state.pedidos.unshift(pedido);
      state.cart = [];
      save();
      return { ok: true, pedido: pedido, total: total };
    },

    confirmEntrega: function (pedidoId) {
      var pedido = state.pedidos.filter(function (x) { return x.id === pedidoId; })[0];
      if (!pedido) return { ok: false, reason: "Pedido não encontrado." };
      pedido.status = "delivered";
      pedido.deliveredAt = now();
      var hold = state.escrow.filter(function (e) { return e.kind === "pedido" && e.ref === pedido.ref && e.status === "held"; })[0];
      if (hold) api.releaseEscrow(hold.id);
      else record({ type: "pedido", sign: "info", title: "Entrega confirmada — " + pedido.ref,
        detail: "Pago na entrega pelo WhatsApp.", amount: pedido.total });
      save();
      return { ok: true, pedido: pedido };
    },

    cancelOrder: function (pedidoId) {
      var pedido = state.pedidos.filter(function (x) { return x.id === pedidoId; })[0];
      if (!pedido) return { ok: false };
      pedido.status = "cancelled";
      var hold = state.escrow.filter(function (e) { return e.kind === "pedido" && e.ref === pedido.ref && e.status === "held"; })[0];
      if (hold) { hold.status = "released"; hold.releasedAt = now(); state.balance += hold.amount; }
      if (pedido.payment === "wallet") { state.balance += pedido.total; }
      record({ type: "refund", sign: "in", title: "Pedido " + pedido.ref + " cancelled — refunded",
        detail: pedido.payment === "whatsapp" ? "Sem cobrança na carteira (pago na entrega)." : "Créditos devolvidos para uso.", amount: pedido.payment === "whatsapp" ? 0 : pedido.total });
      save(); return { ok: true };
    },

    /* --- analytics for the dashboard --- */
    weekSpend: function () {
      var since = Date.now() - 7 * 24 * 3600 * 1000;
      return state.tx.filter(function (t) { return (t.type === "pedido") && t.sign === "out" && new Date(t.at).getTime() >= since; })
        .reduce(function (s, t) { return s + t.amount; }, 0);
    },
    spendByGroup: function () {
      var out = {};
      state.pedidos.forEach(function (o) {
        if (o.status === "cancelled") return;
        o.itens.forEach(function (l) {
          var g = (window.DOT_SPEND_GROUPS[l.cat] || "Other");
          out[g] = (out[g] || 0) + l.lineTotal;
        });
      });
      // wallet-funded transactions also count if pedidos were paid without cart history
      return Object.keys(out).map(function (k) { return { label: k, value: out[k] }; })
        .sort(function (a, b) { return b.value - a.value; });
    },
    activePedidos: function () {
      return state.pedidos.filter(function (o) { return o.status === "placed"; });
    },
    heldEscrow: function () {
      return state.escrow.filter(function (e) { return e.status === "held"; });
    },

    /* --- demo helpers (clearly labelled in the UI) --- */
    loadSampleData: function () {
      if (state.balance || state.bonus || state.pedidos.length) {
        return { ok: false, reason: "Os dados de exemplo só carregam em uma carteira vazia." };
      }
      var plan = planById("wallet-wednesday");
      state.balance += 250000;
      record({ type: "topup", sign: "in", title: "Wallet recargas — Wallet Wednesday (sample)", detail: "Demo checkout", amount: 250000 });
      state.bonus += 17500;
      record({ type: "bonus", sign: "in", title: "Crédito bônus (7%)", detail: "Wallet Wednesday tier reward", amount: 17500 });
      var picks = ["dot-special-shawarma", "dot-signature-rice", "zobo", "loaded-fries", "meat-pie"];
      picks.forEach(function (id, i) {
        var item = window.DOT_MENU.filter(function (m) { return m.id === id; })[0];
        var qty = i % 2 ? 2 : 1;
        var total = item.price * qty;
        state.pedidos.push({
          id: uid("ord"), ref: "DC-SAMPLE" + (i + 1), status: i === 4 ? "placed" : "delivered",
          payment: "wallet", total: total, at: new Date(Date.now() - (i + 1) * 26 * 3600 * 1000).toISOString(),
          itens: [{ id: item.id, name: item.name, price: item.price, qty: qty, cat: item.cat, img: item.img, lineTotal: total }],
          delivery: { mode: "delivery", hostel: "Bloco C", room: "C214" }, note: "Pedido de exemplo"
        });
        state.balance -= total;
        record({ type: "pedido", sign: "out", title: "Pedido DC-SAMPLE" + (i + 1) + " pago com a carteira", detail: qty + "× " + item.name, amount: total });
      });
      state.escrow.push({ id: uid("esc"), kind: "pedido", label: "Pedido DC-SAMPLE5", ref: "DC-SAMPLE5", amount: 1600, bonusCredit: 0, status: "held", at: now() });
      record({ type: "escrow_hold", sign: "hold", title: "Pedido DC-SAMPLE5 — créditos ficam retidos até a confirmação", detail: "Held until delivery is confirmed.", amount: 1600 });
      return { ok: true };
    },
    resetAll: function () { localStorage.removeItem(KEY); window.location.reload(); },

    /* --- export --- */
    toCSV: function () {
      var rows = [["Date", "Type", "Title", "Detail", "Valor (BRL)", "Direction", "Spendable after", "Escrow after"]];
      state.tx.forEach(function (t) {
        rows.push([t.at, t.type, t.title, t.detail, t.amount, t.sign, t.balanceAfter, t.escrowAfter]);
      });
      return rows.map(function (r) {
        return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\n");
    },

    /* --- WhatsApp deep link builder (the "seamless messaging integration") --- */
    buildPedidoLink: function (o) {
      var lines = o.itens || api.cartLines();
      var total = lines.reduce(function (s, l) { return s + l.lineTotal; }, 0);
      var b = CFG.business;
      var msg = [];
      msg.push("*NEW ORDER — " + b.name + "* 🍽️");
      msg.push("Ref: " + (o.ref || "(pending)"));
      msg.push("");
      msg.push("*Pedido:*");
      lines.forEach(function (l, i) {
        msg.push((i + 1) + ". " + l.name + " × " + l.qty + " — " + Real(l.lineTotal));
      });
      msg.push("");
      msg.push("*Total: " + Real(total) + "*");
      msg.push("");
      msg.push("*Fulfilment:* " + (o.delivery && o.delivery.mode === "delivery" ? "Entrega locally" : "Retirada at our counter"));
      if (o.delivery && o.delivery.mode === "delivery") {
        msg.push("*Address:* " + (o.delivery.hostel || "—"));
        msg.push("*Room:* " + (o.delivery.room || "—"));
      }
      msg.push("*Pagamento:* " + (o.paymentLabel || "Pay on delivery (WhatsApp)"));
      if (o.name) msg.push("*Name:* " + o.name);
      if (o.phone) msg.push("*Phone:* " + o.phone);
      if (o.note) { msg.push(""); msg.push("*Note:* " + o.note); }
      msg.push("");
      msg.push(b.assistantTriggerWord ? "Sent a partir de dotcafeltd.com pedido builder — replying as “" + b.assistantTriggerWord + "”." : "Sent a partir de the Sushi Naka pedido builder.");
      return b.whatsappLink + "?text=" + encodeURIComponent(msg.join("\n"));
    },

    buildQuickLink: function () {
      var b = CFG.business;
      return b.whatsappLink + "?text=" + encodeURIComponent(
        "Sushi 👋 — I'd like to pedido a partir de " + b.name + " (" + b.location + ")."
      );
    }
  };

  window.DOT = window.DOT || {};
  window.DOT.store = api;
})();
