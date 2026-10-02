/* ==========================================================================
   SACRAMENTO Beer Truck Gutierrez — app.js
   Shared UI: nav, mobile cardápio, cart drawer, checkout, demo payment modal,
   toasts + Web Notification API alerts, service worker registration.
   ========================================================================== */
(function () {
  "use strict";
  var CFG = window.DOT_CAFE_CONFIG;
  var S = window.DOT.store;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var Real = S.Real;

  /* ---------------- Toasts + system notifications ---------------- */
  var toastWrap = null;
  function ensureToastWrap() {
    if (toastWrap) return toastWrap;
    toastWrap = document.createElement("div");
    toastWrap.className = "toast-wrap";
    toastWrap.setAttribute("role", "region");
    toastWrap.setAttribute("aria-label", "Notifications");
    document.body.appendChild(toastWrap);
    return toastWrap;
  }

  function toast(opts) {
    var type = opts.type || "info";
    var icons = { success: "fa-solid fa-circle-check", error: "fa-solid fa-circle-exclamation", info: "fa-solid fa-bell", warn: "fa-solid fa-triangle-exclamation" };
    var wrap = ensureToastWrap();
    var node = document.createElement("div");
    node.className = "toast toast--" + type;
    node.setAttribute("role", "status");
    node.innerHTML =
      '<div class="toast__ico"><i class="' + (icons[type] || icons.info) + '"></i></div>' +
      '<div><div class="toast__title"></div><div class="toast__msg"></div></div>' +
      '<button class="toast__x" aria-label="Dispensar notificação"><i class="fa-solid fa-xmark"></i></button>';
    $(".toast__title", node).textContent = opts.title || "";
    $(".toast__msg", node).textContent = opts.msg || "";
    $(".toast__x", node).addEventListener("click", function () { out(node); });
    wrap.appendChild(node);
    setTimeout(function () { out(node); }, opts.duration || 5200);
    function out(n) {
      if (!n.parentNode) return;
      n.classList.add("is-out");
      setTimeout(function () { n.remove(); }, 260);
    }
    return node;
  }

  /* Pagamento / pedido alerts: in-app toast + real Notification API when allowed */
  function notify(title, body, opts) {
    opts = opts || {};
    toast({ type: opts.type || "info", title: title, msg: body, duration: opts.duration });
    try {
      if (CFG.push.enabled !== false && "Notification" in window && Notification.permission === "granted") {
        var n = new Notification(title, {
          body: body,
          tag: opts.tag || "dotcafe",
          icon: opts.icon || "assets/icon.svg",
          badge: "assets/icon.svg"
        });
        setTimeout(function () { n.close(); }, 8000);
      }
    } catch (e) { /* Notification not supported (e.g. file:// on some browsers) */ }
  }

  function requestNotifications() {
    return new Promise(function (resolve) {
      if (!("Notification" in window)) { resolve("unsupported"); return; }
      if (Notification.permission === "granted") { resolve("granted"); return; }
      Notification.requestPermission().then(function (p) {
        S.get().prefs.notificationsRequested = true;
        resolve(p);
      }).catch(function () { resolve("denied"); });
    });
  }

  /* ---------------- Service worker (Web Push scaffold) ---------------- */
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") {
      console.info("[SACRAMENTO Beer Truck Gutierrez] Service worker needs http(s). Run a local server (see README) to test sw.js / push.");
      return;
    }
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      console.info("[SACRAMENTO Beer Truck Gutierrez] Service worker registered:", reg.scope);
      window.DOT_SW_REG = reg;
    }).catch(function (err) { console.warn("[SACRAMENTO Beer Truck Gutierrez] SW registration failed:", err); });
  }

  /* ---------------- Nav ---------------- */
  function initNav() {
    var nav = $(".navbar");
    if (nav) {
      var onScroll = function () {
        if (window.scrollY > 12) nav.classList.add("is-scrolled");
        else nav.classList.remove("is-scrolled");
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    // mark current page
    var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    $$(".nav-links a, .tabbar a, .mobile-cardápio a.m-link").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("/").pop().toLowerCase();
      if (href && href === here) a.setAttribute("aria-current", "page");
    });

    // mobile cardápio
    var burger = $(".hamburger");
    if (burger) {
      var scrim = document.createElement("div");
      scrim.className = "nav-scrim";
      var cardápio = document.createElement("aside");
      cardápio.className = "mobile-cardápio";
      cardápio.setAttribute("aria-label", "Navegação do celular");
      cardápio.innerHTML =
        '<div class="mobile-cardápio__head">' +
          '<div class="brand"><span class="brand__mark">SACRAMENTO</span>' +
            '<span class="brand__text"><span class="brand__name">SACRAMENTO Beer Truck Gutierrez</span><span class="brand__tag">Fresh · Flavorful · Irresistible</span></span>' +
          '</div>' +
          '<button class="mobile-cardápio__close" aria-label="Fechar cardápio"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<nav class="stack">' +
          '<a class="m-link" href="index.html"><i class="fa-solid fa-house"></i> Início</a>' +
          '<a class="m-link" href="cardápio.html"><i class="fa-solid fa-utensils"></i> Cardápio e Pedido</a>' +
          '<a class="m-link" href="wallet.html"><i class="fa-solid fa-wallet"></i> Carteira e Planos</a>' +
          '<a class="m-link" href="dashboard.html"><i class="fa-solid fa-chart-pie"></i> Meu Painel</a>' +
          '<a class="m-link" href="index.html#services"><i class="fa-solid fa-truck-fast"></i> Entrega e Encomendas</a>' +
          '<a class="m-link" href="terms.html"><i class="fa-solid fa-scale-balanced"></i> Termos e Legal</a>' +
        '</nav>' +
        '<div class="m-foot">' +
          '<a class="btn btn--wa btn--block" href="' + S.buildQuickLink() + '" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Falar no WhatsApp</a>' +
          '<p style="margin:.9rem 0 0">' + CFG.business.location + '<br>' + CFG.business.whatsappNumber + '</p>' +
        '</div>';
      document.body.appendChild(scrim);
      document.body.appendChild(cardápio);

      var openMenu = function () {
        cardápio.classList.add("is-open"); scrim.classList.add("is-open");
        document.body.classList.add("no-scroll");
        burger.setAttribute("aria-expanded", "true");
        var c = $(".mobile-cardápio__close", cardápio); if (c) c.focus();
      };
      var closeMenu = function () {
        cardápio.classList.remove("is-open"); scrim.classList.remove("is-open");
        document.body.classList.remove("no-scroll");
        burger.setAttribute("aria-expanded", "false");
      };
      burger.addEventListener("click", openMenu);
      scrim.addEventListener("click", closeMenu);
      $(".mobile-cardápio__close", cardápio).addEventListener("click", closeMenu);
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
      $$("a", cardápio).forEach(function (a) { a.addEventListener("click", closeMenu); });
      window.DOT_closeMobileCardápio = closeMenu;
    }

    // Bottom tab bar removed at client request — mobile navigation lives in
    // the navbar (cart + hamburger drawer) and the hero CTA.

    // floating WhatsApp — removed: redundant with the hero trust chip, the
        // mobile-cardápio "Falar com SACRAMENTO" button, the cart drawer and the footer.
      }

  function updateChrome() {
    var count = S.cartCount();
    $$("#cartBadge, #tabCartBadge").forEach(function (b) {
      b.textContent = count;
      if (count > 0) b.removeAttribute("hidden"); else b.setAttribute("hidden", "hidden");
    });
    var chip = $("#navWalletChip");
    if (chip) {
      chip.innerHTML = '<i class="fa-solid fa-wallet"></i> <strong>' + Real(S.spendable()) + '</strong>';
      chip.setAttribute("aria-label", "Saldo da carteira " + Real(S.spendable()));
    }
    if (drawerBody) renderCart();
  }

  /* ---------------- Cart drawer ---------------- */
  var drawer = null, drawerBody = null, drawerFoot = null, cartScrim = null;

  function ensureDrawer() {
    if (drawer) return;
    cartScrim = document.createElement("div");
    cartScrim.className = "drawer-scrim";
    drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Sua cesta de pedidos");
    drawer.innerHTML =
      '<div class="drawer__head">' +
        '<i class="fa-solid fa-basket-shopping"></i><h2>Sua cesta de pedidos</h2>' +
        '<button class="icon-btn js-close-cart" aria-label="Fechar cesta"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="drawer__body" id="cartBody"></div>' +
      '<div class="drawer__foot" id="cartFoot"></div>';
    document.body.appendChild(cartScrim);
    document.body.appendChild(drawer);
    drawerBody = $("#cartBody", drawer);
    drawerFoot = $("#cartFoot", drawer);
    cartScrim.addEventListener("click", closeCart);
    $(".js-close-cart", drawer).addEventListener("click", closeCart);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCart(); });
  }

  function openCart() {
    ensureDrawer();
    renderCart();
    drawer.classList.add("is-open");
    cartScrim.classList.add("is-open");
    document.body.classList.add("no-scroll");
  }
  function closeCart() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    cartScrim.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
  }

  function renderCart() {
    if (!drawerBody) return;
    var lines = S.cartLines();
    var total = S.cartTotal();
    if (!lines.length) {
      drawerBody.innerHTML =
        '<div class="empty"><i class="fa-solid fa-basket-shopping"></i>' +
        '<h3 style="font-size:1rem">Sua cesta está vazia</h3>' +
        '<p>Adicionar something a partir de the cardápio — the SACRAMENTO Special Shawarma is a good place to start.</p>' +
        '<a class="btn btn--dark btn--sm" href="cardápio.html">Ver o cardápio</a></div>';
      drawerFoot.innerHTML =
        '<a class="btn btn--wa btn--block" href="' + S.buildQuickLink() + '" target="_blank" rel="noopener">' +
        '<i class="fa-brands fa-whatsapp"></i> Tire uma dúvida</a>';
      return;
    }
    drawerBody.innerHTML = lines.map(function (l) {
      return '<div class="cart-line">' +
        '<div class="cart-line__thumb"><div class="ph ph--b"><span>' + glyphFor(l.cat) + '</span>' + imgTag(l) + '</div></div>' +
        '<div><p class="cart-line__name">' + l.name + '</p>' +
          '<div class="cart-line__meta">' + Real(l.price) + ' each · ' + Real(l.lineTotal) + '</div>' +
          '<div class="qty"><button data-dec="' + l.id + '" aria-label="Reduzir ' + l.name + '"><i class="fa-solid fa-minus"></i></button>' +
          '<span aria-live="polite">' + l.qty + '</span>' +
          '<button data-inc="' + l.id + '" aria-label="Adicionar outro ' + l.name + '"><i class="fa-solid fa-plus"></i></button>' +
          '<button data-del="' + l.id + '" aria-label="Removerr ' + l.name + '" style="width:auto;padding:0 .5rem;bpedido-radius:12px">Remover</button></div>' +
        '</div>' +
        '<div class="tx__amt">' + Real(l.lineTotal) + '</div>' +
      '</div>';
    }).join("");

    var delivery = S.get().pedidos.length ? "" : "";
    void delivery;
    drawerFoot.innerHTML =
      '<div class="receipt" style="margin-bottom:.9rem"><div class="receipt__row"><span>Items (' + S.cartCount() + ')</span><span>' + Real(total) + '</span></div>' +
      '<div class="receipt__row"><span>Entrega</span><span>Local area — free</span></div>' +
      '<div class="receipt__row receipt__row--total"><span>Total</span><span>' + Real(total) + '</span></div></div>' +
      '<div class="btn-row"><button class="btn btn--wa btn--block" id="jsReviewBtn"><i class="fa-brands fa-whatsapp"></i> Revisar e enviar pedido</button></div>' +
      '<button class="btn btn--outline btn--block btn--sm" id="jsClearCart" style="margin-top:.5rem">Esvaziar cesta</button>';

    $$("[data-inc]", drawerBody).forEach(function (b) {
      b.addEventListener("click", function () { S.addToCart(b.getAttribute("data-inc"), 1); });
    });
    $$("[data-dec]", drawerBody).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-dec");
        var line = S.cart().filter(function (l) { return l.id === id; })[0];
        S.setQty(id, (line ? line.qty : 1) - 1);
      });
    });
    $$("[data-del]", drawerBody).forEach(function (b) {
      b.addEventListener("click", function () { S.setQty(b.getAttribute("data-del"), 0); });
    });
    var rev = $("#jsReviewBtn", drawerFoot);
    if (rev) rev.addEventListener("click", openCheckout);
    $("#jsClearCart", drawerFoot).addEventListener("click", function () {
      S.clearCart();
      toast({ type: "info", title: "Basket cleared", msg: "Nothing was sent to the kitchen." });
    });
  }

  function glyphFor(cat) {
    return ({ shawarma: "🌯", rice: "🍛", grills: "🍗", mains: "🍲", pasta: "🍝", bakery: "🥐", sides: "🍟", drinks: "🥤" })[cat] || "🍽️";
  }
  function imgTag(l) {
    if (!l.img) return "";
    return '<img src="' + l.img + '" alt="' + l.name + '" loading="lazy" data-fallback>';
    return "";
  }

  /* ---------------- Checkout modal (pedido → WhatsApp) ---------------- */
  function openCheckout() {
    var lines = S.cartLines();
    if (!lines.length) return;
    var total = S.cartTotal();
    var canWallet = S.spendable() >= total;
    var p = S.get().profile;

    var rows = lines.map(function (l) {
      return '<div class="receipt__row"><span>' + l.name + ' × ' + l.qty + '</span><span>' + Real(l.lineTotal) + '</span></div>';
    }).join("");

    openModal({
      title: "Review & send your pedido",
      icon: "fa-solid fa-receipt",
      body:
        '<div class="receipt" style="margin-bottom:1.1rem">' + rows +
          '<div class="receipt__row receipt__row--total"><span>Total a pagar</span><span>' + Real(total) + '</span></div></div>' +
        '<div class="field"><label for="coName">Seu nome *</label><input class="input" id="coName" value="' + esc(p.name) + '" placeholder="e.g. Amaka Obi" autocomplete="name" required></div>' +
        '<div class="field"><label for="coPhone">Telefone / WhatsApp *</label><input class="input" id="coPhone" type="tel" value="' + esc(p.phone) + '" placeholder="080..." autocomplete="tel" required></div>' +
        '<div class="field"><label>Como você quer receber?</label>' +
          '<div class="toggle" id="coMode" role="group" aria-label="Forma de recebimento">' +
            '<button type="button" class="is-active" data-mode="delivery"><i class="fa-solid fa-truck-fast"></i> Entrega local</button>' +
            '<button type="button" data-mode="pickup"><i class="fa-solid fa-store"></i> Retirada</button>' +
          '</div></div>' +
        '<div id="coEntregaFields">' +
          '<div class="field"><label for="coHostel">Prédio / bloco *</label><input class="input" id="coHostel" value="' + esc(p.hostel) + '" placeholder="e.g. Bloco C, the main building"></div>' +
          '<div class="field"><label for="coRoom">Número do quarto / sala *</label><input class="input" id="coRoom" value="' + esc(p.room) + '" placeholder="e.g. C214"></div>' +
        '</div>' +
        '<div class="field"><label>Pagamento</label>' +
          '<div class="stack" style="gap:.5rem">' +
            walletOption("whatsapp", "Pay on delivery (via WhatsApp)", "No credit charge — you pay SACRAMENTO when the food arrives.", true) +
            walletOption("wallet", "Pay a partir de my credit — " + Real(S.spendable()) + " available", canWallet ? "Deducted immediately and logged in your history." : "Not enough spendable credits for this pedido.", canWallet) +
            walletOption("wallet-escrow", "Hold until delivery", canWallet ? "Credits leave your spendable balance and are released when you confirm delivery." : "Not enough spendable credits for this pedido.", canWallet) +
          '</div></div>' +
        '<div class="field" style="margin-bottom:0"><label for="coNote">Mais algo? (opcional)</label><textarea class="textarea" id="coNote" rows="2" placeholder="Extra pepper, no onions, call when you reach..."></textarea></div>' +
        '<p class="muted" style="font-size:.78rem;margin:.9rem 0 0"><i class="fa-brands fa-whatsapp"></i> This builds a WhatsApp message with your full itemised pedido and opens it in your WhatsApp app — nothing is sent until you tap send there.</p>',
      footer:
        '<button class="btn btn--wa" id="coSend"><i class="fa-brands fa-whatsapp"></i> Enviar pedido no WhatsApp</button>' +
        '<button class="btn btn--outline" id="coCancelar">Continuar editando</button>',
      onMount: function (modal) {
        var mode = "delivery";
        $$("#coMode button", modal).forEach(function (b) {
          b.addEventListener("click", function () {
            $$("#coMode button", modal).forEach(function (x) { x.classList.remove("is-active"); });
            b.classList.add("is-active");
            mode = b.getAttribute("data-mode");
            $("#coEntregaFields", modal).style.display = mode === "delivery" ? "" : "none";
          });
        });
        $("#coCancelar", modal).addEventListener("click", closeModal);
        $("#coSend", modal).addEventListener("click", function () {
          var name = $("#coName", modal).value.trim();
          var phone = $("#coPhone", modal).value.trim();
          if (!name || !phone) {
            toast({ type: "error", title: "Almost there", msg: "Adicionar your name and phone number so SACRAMENTO can reach you." });
            (!name ? $("#coName", modal) : $("#coPhone", modal)).focus();
            return;
          }
          var hostel = $("#coHostel", modal) ? $("#coHostel", modal).value.trim() : "";
          var room = $("#coRoom", modal) ? $("#coRoom", modal).value.trim() : "";
          if (mode === "delivery" && (!hostel || !room)) {
            toast({ type: "error", title: "Detalhes da entrega", msg: "A entrega local precisa do seu endereço." });
            (!hostel ? $("#coHostel", modal) : $("#coRoom", modal)).focus();
            return;
          }
          var payment = ($("input[name='coPay']:checked", modal) || {}).value || "whatsapp";
          var labels = {
            "whatsapp": "Pay on delivery (WhatsApp)",
            "wallet": "Credit — paid upfront",
            "wallet-escrow": "Credit held until delivery"
          };
          S.setProfile({ name: name, phone: phone, hostel: hostel, room: room });

          var res = S.placePedido({
            delivery: { mode: mode, hostel: hostel, room: room },
            payment: payment, name: name, phone: phone,
            note: $("#coNote", modal).value.trim(),
            paymentLabel: labels[payment]
          });
          if (!res.ok) {
            toast({ type: "error", title: "Pedido not placed", msg: res.reason });
            return;
          }
          var url = S.buildPedidoLink({
            itens: res.pedido.itens, ref: res.pedido.ref, delivery: res.pedido.delivery,
            paymentLabel: labels[payment], name: name, phone: phone, note: res.pedido.note
          });
          window.open(url, "_blank", "noopener");
          closeModal();
          closeCart();
          notify("Pedido " + res.pedido.ref + " sent to SACRAMENTO Beer Truck Gutierrez", Real(res.total) + " · " + (mode === "delivery" ? "delivery to " + hostel : "pickup at our counter") + ". Track it on your dashboard.", { type: "success", tag: "pedido" });
          setTimeout(updateChrome, 60);
        });
      }
    });
  }

  function walletOption(value, title, hint, enabled) {
    return '<label style="display:flex;gap:.7rem;align-itens:flex-start;bpedido:1.5px solid var(--line);bpedido-radius:10px;padding:.7rem .85rem;' +
      (enabled ? "" : "opacity:.55;") + '">' +
      '<input type="radio" name="coPay" value="' + value + '"' + (value === "whatsapp" ? " checked" : "") + (enabled ? "" : " disabled") + ' style="margin-top:.35rem">' +
      '<span><strong style="font-size:.9rem">' + title + '</strong><br><small class="muted">' + hint + '</small></span></label>';
  }

  /* ---------------- Modal plumbing ---------------- */
  var modalScrim = null;
  function openModal(o) {
    closeModal();
    modalScrim = document.createElement("div");
    modalScrim.className = "modal-scrim";
    modalScrim.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">' +
        '<div class="modal__head"><div class="card__ico" style="margin:0;width:44px;height:44px"><i class="' + (o.icon || "fa-solid fa-circle-info") + '"></i></div>' +
        '<div><h3>' + o.title + '</h3>' + (o.sub ? '<p class="muted mb-0" style="font-size:.85rem">' + o.sub + '</p>' : "") + '</div>' +
        '<button class="icon-btn js-modal-x" aria-label="Fechar" style="margin-left:auto;background:#f3eeee;bpedido-color:var(--line);color:var(--ink)"><i class="fa-solid fa-xmark"></i></button></div>' +
        '<div class="modal__body">' + o.body + '</div>' +
        (o.footer ? '<div class="modal__foot">' + o.footer + '</div>' : "") +
      '</div>';
    document.body.appendChild(modalScrim);
    requestAnimationFrame(function () { modalScrim.classList.add("is-open"); });
    document.body.classList.add("no-scroll");
    $(".js-modal-x", modalScrim).addEventListener("click", closeModal);
    modalScrim.addEventListener("click", function (e) { if (e.target === modalScrim) closeModal(); });
    document.addEventListener("keydown", onEsc);
    var focusable = modalScrim.querySelector("input,button,textarea,select");
    if (focusable) setTimeout(function () { focusable.focus(); }, 120);
    if (o.onMount) o.onMount(modalScrim);
  }
  function onEsc(e) { if (e.key === "Escape") closeModal(); }
  function closeModal() {
    if (!modalScrim) return;
    modalScrim.remove();
    modalScrim = null;
    document.body.classList.remove("no-scroll");
    document.removeEventListener("keydown", onEsc);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /* ---------------- DEMO payment modal ---------------- */
  function demoCheckout(o) {
    var pay = CFG.payments;
    var provider = pay.providers[pay.provider] || {};
    var isLive = pay.mode === "live";
    openModal({
      title: isLive ? "Complete payment" : "Demo checkout",
      sub: o.sub || (o.amount ? Real(o.amount) + (o.bonus ? " + " + Real(o.bonus) + " bonus credit" : "") : ""),
      icon: "fa-solid fa-credit-card",
      body:
        '<div class="demo-banner"><i class="fa-solid fa-flask"></i><span><strong>MODO DEMO — nenhum dinheiro de verdade.</strong>' +
        'This is a simulated gateway. To take real payments, set <code>payments.mode = "live"</code> and paste your Paystack / Flutterwave public key in <code>js/config.js</code> (payments.providers.' + pay.provider + '.publicKey).</span></div>' +
        '<div class="card-mock"><div style="display:flex;justify-content:space-between;align-itens:center"><i class="fa-solid fa-wifi"></i><span style="font-size:.75rem;letter-spacing:.14em">' + (pay.provider === "paystack" ? "PAYSTACK" : "FLUTTERWAVE") + ' · TEST</span></div>' +
          '<div class="card-mock__num">•••• •••• •••• 4242</div>' +
          '<div class="card-mock__row"><span>' + esc(S.get().profile.name || "SACRAMENTO") + '</span><span>12 / 29</span></div>' +
        '</div>' +
        (o.amount ? '<div class="receipt"><div class="receipt__row"><span>Valor</span><span>' + Real(o.amount) + '</span></div>' +
          (o.bonus ? '<div class="receipt__row receipt__row--bonus"><span>Crédito bônus</span><span>+' + Real(o.bonus) + '</span></div>' : "") +
          '<div class="receipt__row receipt__row--total"><span>Creditado na carteira</span><span>' + Real((o.amount || 0) + (o.bonus || 0)) + '</span></div></div>' : "") +
        '<label style="display:flex;gap:.6rem;align-itens:flex-start;margin-top:1rem;font-size:.85rem"><input type="checkbox" id="vsSim" checked style="margin-top:.3rem"> Simulate a successful payment (untick to see the failure path)</label>',
      footer:
        '<button class="btn" id="vsPay"><i class="fa-solid fa-lock"></i> Pay ' + (o.amount ? Real(o.amount) : "") + ' (demo)</button>' +
        '<button class="btn btn--outline" id="vsCancelar">Cancelar</button>',
      onMount: function (modal) {
        $("#vsCancelar", modal).addEventListener("click", function () {
          closeModal();
          if (o.onCancel) o.onCancel();
        });
        $("#vsPay", modal).addEventListener("click", function () {
          var btn = $("#vsPay", modal);
          var success = $("#vsSim", modal).checked;
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Processing…';
          setTimeout(function () {
            closeModal();
            if (success) { if (o.onSuccess) o.onSuccess("DEMO-" + Math.random().toString(36).slice(2, 10).toUpperCase()); }
            else {
              toast({ type: "error", title: "Pagamento failed (demo)", msg: "No charge was made. Try again or use a different method." });
              if (o.onCancel) o.onCancel();
            }
          }, pay.demoDelayMs || 1400);
        });
      }
    });
  }

  /* ---------------- Image fallbacks ---------------- */
  function attachImageFallback() {
      var PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>" +
        "<rect width='400' height='400' fill='#3b141c'/>" +
        "<text x='50%' y='50%' fill='#f3961c' font-size='150' text-anchor='middle' dominant-baseline='middle'>\uD83C\uDF7D</text>" +
        "</svg>");
      document.addEventListener("error", function (e) {
              var t = e.target;
              if (t && t.tagName === "IMG" && t.hasAttribute("data-fallback") && t.src !== PLACEHOLDER) {
                t.src = PLACEHOLDER;   // keep the card's visual structure instead of a broken-image gap
                t.removeAttribute("data-fallback");
              }
            }, true);
          }

  /* ---------------- Reveal on scroll (progressive enhancement) ---------------- */
  function initReveal() {
    var itens = $$(".reveal");
    if (!itens.length) return;
    if (!("IntersectionObserver" in window)) return;   // content stays visible

    var fired = false;
    var io = new IntersectionObserver(function (entries) {
      fired = true;
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    document.documentElement.classList.add("js-reveal");

    function watch(root) {
      var list = root.matches && root.matches(".reveal") ? [root] : $$(".reveal:not(.is-in)", root);
      list.forEach(function (i) { io.observe(i); });
    }
    itens.forEach(function (i) { io.observe(i); });

    // Page scripts inject cards after load — keep watching the DOM so
    // dynamically created .reveal elements are observed too.
    if ("MutationObserver" in window) {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) {
            if (n.nodeType === 1) watch(n);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    // Safety net: if the observer never reports (throttled/background tab or a
    // broken browser), stop hiding content entirely rather than leaving blanks.
    setTimeout(function () {
      if (!fired) {
        document.documentElement.classList.remove("js-reveal");
        io.disconnect();
      }
    }, 1800);
    window.addEventListener("pageshow", function () {
      setTimeout(function () {
        if (!fired) document.documentElement.classList.remove("js-reveal");
      }, 600);
    });
  }

  /* ---------------- Delegated events ---------------- */
  function initDelegates() {
    document.addEventListener("click", function (e) {
      var openCartBtn = e.target.closest(".js-open-cart");
      if (openCartBtn) { e.preventDefault(); openCart(); return; }
      var allow = e.target.closest(".js-allow-notifications");
      if (allow) {
        e.preventDefault();
        requestNotifications().then(function (r) {
          toast(r === "granted"
            ? { type: "success", title: "Alerts are on 🎉", msg: "Pagamento and pedido alerts will show up as system notifications." }
            : { type: "info", title: "Alerts stayed off", msg: "Your browser blocked notifications — in-app alerts still work." });
        });
        return;
      }
      var add = e.target.closest("[data-add]");
      if (add) {
        e.preventDefault();
        var id = add.getAttribute("data-add");
        S.addToCart(id, 1);
        var item = window.DOT_MENU.filter(function (m) { return m.id === id; })[0];
        add.classList.add("is-added");
        add.innerHTML = '<i class="fa-solid fa-check"></i> Added';
        setTimeout(function () {
          add.classList.remove("is-added");
          add.innerHTML = '<i class="fa-solid fa-plus"></i> Add';
        }, 1400);
        toast({ type: "success", title: "Added à cesta", msg: (item ? item.name : "Item") + " · " + S.cartCount() + " item(s) · " + Real(S.cartTotal()), duration: 2800 });
        return;
      }
      var q = e.target.closest("[data-quick-pedido]");
      if (q) { e.preventDefault(); S.addToCart(q.getAttribute("data-quick-pedido"), 1); openCart(); }
    });
  }

  /* ---------------- Swiper (testimonials) ---------------- */
  function initSwiper() {
    var el = $(".swiper");
    if (!el) return;
    if (typeof window.Swiper === "function") {
      new window.Swiper(".swiper", {
        slidesPerView: 1.05, spaceBetween: 18, grabCursor: true,
        pagination: { el: ".swiper-pagination", clickable: true },
        navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" },
        breakpoints: { 700: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } }
      });
    } else {
      // offline / CDN blocked → horizontal scroll fallback (still usable)
      var wrap = $(".swiper-wrapper");
      if (wrap) { wrap.classList.add("no-swiper"); $(".swiper-pagination") && $(".swiper-pagination").remove(); }
    }
  }

  /* ---------------- Especial page transition ----------------
     Every internal tap covers the screen with a branded veil, then the next
     page fades in underneath it. Calm and smooth — never a hard cut. */
  function initTransitions() {
    var veil = document.getElementById("pageVeil");
    if (!veil) return;
    var MIN_VEIL = 320;   // veil is fully opaque before the page swaps

    // Drive the veil with inline styles so the cascade can never strand it.
    function showVeil() { veil.style.opacity = "1"; veil.style.pointerEvents = "all"; }
    function hideVeil() { veil.style.opacity = "0"; veil.style.pointerEvents = "none"; }

    if (veil.classList.contains("is-on")) {
      // We came a partir de another page: reveal the fully-rendered page gently.
      sessionStorage.removeItem("dot-nav");
      veil.classList.add("is-on");
      showVeil();
      setTimeout(hideVeil, 480);
    } else {
      sessionStorage.removeItem("dot-nav");
      hideVeil();
    }

    function internal(a) {
      if (!a || !a.getAttribute) return false;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#") return false;          // in-page anchor
      if (a.target === "_blank" || a.hasAttribute("download")) return false;
      if (/^(?:https?:)?\/\//i.test(href)) return false;           // external
      if (/^(?:mailto:|tel:|javascript:)/i.test(href)) return false;
      if (a.host && location.host && a.host !== location.host) return false;
      return true;
    }

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest("a") : null;
      if (!internal(a)) return;
      e.preventDefault();
      sessionStorage.setItem("dot-nav", "1");
      veil.classList.add("is-on");
      showVeil();
      var href = a.getAttribute("href");
      setTimeout(function () { location.href = href; }, MIN_VEIL);
    }, true);

    // Back/forward: never leave the veil stuck on screen.
    window.addEventListener("pageshow", function (ev) {
      if (ev.persisted) { veil.classList.remove("is-on"); hideVeil(); }
    });
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    initNav();
    initTransitions();
    attachImageFallback();
    initReveal();
    initDelegates();
    registerSW();
    S.subscribe(updateChrome);
    window.addEventListener("load", initSwiper);
    window.DOTUI = {
      toast: toast, notify: notify, openCart: openCart, closeCart: closeCart,
      openModal: openModal, closeModal: closeModal, demoCheckout: demoCheckout,
      requestNotifications: requestNotifications, esc: esc, Real: Real, glyphFor: glyphFor
    };
    document.dispatchEvent(new CustomEvent("dot:ready"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
