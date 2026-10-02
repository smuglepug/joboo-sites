/* Dot Café — menu page: filter, search, sort, add to basket */
(function () {
  "use strict";
  var S = window.DOT.store;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var glyph = function (cat) {
    return ({ shawarma: "🌯", rice: "🍛", grills: "🍗", mains: "🍲", pasta: "🍝", bakery: "🥐", sides: "🍟", drinks: "🥤" })[cat] || "🍽️";
  };
  var phTone = function (i) { return ["ph--a", "ph--b", "ph--c", "ph--d", "ph--e"][i % 5]; };
  var active = "all", query = "", sort = "featured";

  function match(item) {
    if (active !== "all" && item.cat !== active) return false;
    if (query && (item.name + " " + item.desc).toLowerCase().indexOf(query) === -1) return false;
    return true;
  }

  function render() {
    var host = $("#menuGrid");
    if (!host) return;
    var list = window.DOT_MENU.filter(match);
    if (sort === "low") list.sort(function (a, b) { return a.price - b.price; });
    if (sort === "high") list.sort(function (a, b) { return b.price - a.price; });
    if (sort === "az") list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (sort === "featured") list.sort(function (a, b) {
      return (b.tags.indexOf("signature") > -1) - (a.tags.indexOf("signature") > -1);
    });

    if (!list.length) {
      host.innerHTML = '<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-magnifying-glass"></i>' +
        '<h3 style="font-size:1rem">Nothing matched</h3><p>Try another word, or ask Dot on WhatsApp — we cook off-menu on request.</p></div>';
      return;
    }

    host.innerHTML = list.map(function (item, i) {
      var tag = item.tags.indexOf("signature") > -1 ? '<span class="dish__tag">Signature</span>'
        : item.tags.indexOf("spicy") > -1 ? '<span class="dish__tag">Hot 🔥</span>'
        : item.tags.indexOf("vegan") > -1 ? '<span class="dish__tag dish__tag--vegan">No meat</span>' : "";
      var cat = window.DOT_CATEGORIES.filter(function (c) { return c.id === item.cat; })[0];
      return '<article class="dish reveal is-in" id="' + item.id + '">' +
        '<div class="dish__media"><div class="ph ' + phTone(i) + '"><span>' + glyph(item.cat) + '</span>' +
          '<img src="' + item.img + '" alt="' + item.name + '" loading="lazy" data-fallback></div>' + tag + '</div>' +
        '<div class="dish__body">' +
          '<h3 class="dish__name">' + item.name + '</h3>' +
          '<p class="dish__desc">' + item.desc + '</p>' +
          '<div class="dish__foot"><span class="price">' + S.naira(item.price) + '<small>' + (cat ? cat.label : "") + '</small></span>' +
          '<button class="add-btn" data-add="' + item.id + '" aria-label="Add ' + item.name + ' to basket"><i class="fa-solid fa-plus"></i> Add</button></div>' +
        '</div></article>';
    }).join("");
    var count = $("#menuCount");
    if (count) count.textContent = list.length + " item" + (list.length === 1 ? "" : "s") + " shown";
  }

  document.addEventListener("dot:ready", function () {
    var fHost = $("#menuFilters");
    if (fHost) {
      fHost.innerHTML = window.DOT_CATEGORIES.map(function (c) {
        return '<button class="chip' + (c.id === "all" ? " is-active" : "") + '" data-cat="' + c.id + '">' + c.label + '</button>';
      }).join("");
      $$("button", fHost).forEach(function (b) {
        b.addEventListener("click", function () {
          active = b.getAttribute("data-cat");
          $$("button", fHost).forEach(function (x) { x.classList.remove("is-active"); });
          b.classList.add("is-active");
          render();
        });
      });
    }
    var search = $("#menuSearch");
    if (search) search.addEventListener("input", function () { query = search.value.trim().toLowerCase(); render(); });
    var sortSel = $("#menuSort");
    if (sortSel) sortSel.addEventListener("change", function () { sort = sortSel.value; render(); });
    render();
    if (location.hash) {
      var el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ block: "center" });
    }
  });
})();
