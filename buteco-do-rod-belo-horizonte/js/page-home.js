/* Buteco do Rod — home page rendering */
(function () {
  "use strict";
  var S = window.DOT.store;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var glyph = function (cat) {
    return ({ shawarma: "🌯", rice: "🍛", grills: "🍗", mains: "🍲", pasta: "🍝", bakery: "🥐", sides: "🍟", drinks: "🥤" })[cat] || "🍽️";
  };
  var phTone = function (i) { return ["ph--a", "ph--b", "ph--c", "ph--d", "ph--e"][i % 5]; };

  function dishCard(item, i) {
    return '<article class="dish reveal">' +
      '<div class="dish__media"><div class="ph ' + phTone(i) + '"><span>' + glyph(item.cat) + '</span>' +
        '<img src="' + item.img + '" alt="' + item.name + '" loading="lazy" data-fallback></div>' +
        (item.tags.indexOf("signature") > -1 ? '<span class="dish__tag">Especial</span>' : (item.tags.indexOf("spicy") > -1 ? '<span class="dish__tag">Quente 🔥</span>' : (item.tags.indexOf("vegan") > -1 ? '<span class="dish__tag dish__tag--vegan">Sem carne</span>' : ""))) +
      '</div>' +
      '<div class="dish__body">' +
        '<h3 class="dish__name">' + item.name + '</h3>' +
        '<p class="dish__desc">' + item.desc + '</p>' +
        '<div class="dish__foot"><span class="price">' + S.Real(item.price) + '</span>' +
        '<button class="add-btn" data-add="' + item.id + '" aria-label="Adicionar ' + item.name + ' à cesta"><i class="fa-solid fa-plus"></i> Add</button></div>' +
      '</div></article>';
  }

  document.addEventListener("dot:ready", function () {
    // services
    var sHost = $("#servicesGrid");
    if (sHost) {
      sHost.innerHTML = window.DOT_SERVICES.map(function (s) {
        return '<article class="card reveal"><div class="card__ico"><i class="' + s.icon + '"></i></div>' +
          '<h3>' + s.title + '</h3><p>' + s.text + '</p><div class="card__meta">' + s.meta + '</div></article>';
      }).join("");
    }

    // signature showcase
    var sigHost = $("#sigRow");
    if (sigHost) {
      var sigs = window.DOT_MENU.filter(function (m) { return m.tags.indexOf("signature") > -1; });
      sigHost.innerHTML = sigs.map(function (m, i) {
        return '<a class="sig reveal" href="cardápio.html#' + m.id + '">' +
          '<div class="ph ' + phTone(i + 1) + '" style="position:absolute;inset:0"><span>' + glyph(m.cat) + '</span>' +
          '<img src="' + m.img + '" alt="' + m.name + '" loading="lazy" data-fallback></div>' +
          '<span class="sig__veil"></span>' +
          '<div class="sig__text"><h3>' + m.name + '</h3><p>' + m.desc + '</p><span class="price">' + S.Real(m.price) + '</span>' +
            '<span class="sig__cta">Ver e adicionar <i class="fa-solid fa-arrow-right"></i></span></div></a>';
      }).join("");
    }

    // cardápio preview
    var host = $("#previewGrid");
    if (host) {
      var picks = ["dot-special-shawarma", "dot-signature-rice", "lebanese-shawarma", "maxi-burger", "hot-spicy-wings", "chicken-penne-pasta", "loaded-fries", "zobo"];
      host.innerHTML = picks.map(function (id, i) {
        var item = window.DOT_MENU.filter(function (m) { return m.id === id; })[0];
        return dishCard(item, i);
      }).join("");
    }

    // testimonials
    var tHost = $("#testimonialWrap");
    if (tHost) {
      tHost.innerHTML = window.DOT_TESTIMONIALS.map(function (t) {
        return '<div class="swiper-slide"><figure class="quote">' +
          '<div class="quote__stars" aria-label="' + t.stars + ' de 5 estrelas">' + "★".repeat(t.stars) + "☆".repeat(5 - t.stars) + '</div>' +
          '<blockquote style="margin:.6rem 0 0"><p>' + t.text + '</p></blockquote>' +
          '<figcaption class="quote__who"><span class="quote__av"><span class="ph ph--b"><span>' + t.glyph + '</span></span></span>' +
          '<span><strong>' + t.name + '</strong><span>' + t.role + '</span></span></figcaption>' +
          '</figure></div>';
      }).join("");
    }

    // honest stats a partir de local data (not invented marketing numbers)
    var statHost = $("#heroTrust");
    if (statHost) {
      var itens = window.DOT_MENU.length;
      statHost.innerHTML =
        '<div><strong>' + itens + '</strong><span>cardápio itens</span></div>' +
        '<div><strong>3</strong><span>credit plans</span></div>' +
        '<div><strong>48–72h</strong><span>catering notice</span></div>' +
        '<div><strong>1-tap</strong><span>Pedido pelo WhatsApp</span></div>';
    }
  });
})();
