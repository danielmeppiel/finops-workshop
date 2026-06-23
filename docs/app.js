// Static deck shell for the "Agentic SDLC Bill" — GitHub Pages build.
// No server: slides are static files, navigation state lives in the URL hash.
(function () {
  "use strict";
  var SLIDES = window.SLIDES || [];
  var TOTAL = SLIDES.length;
  var cur = 0;

  var frame = document.getElementById("frame");
  var scaler = document.getElementById("scaler");
  var stage = document.getElementById("stage");
  var num = document.getElementById("num");
  var titleEl = document.getElementById("title");
  var prevBtn = document.getElementById("prev");
  var nextBtn = document.getElementById("next");
  var indexBtn = document.getElementById("indexBtn");
  var fsBtn = document.getElementById("fsBtn");
  var overlay = document.getElementById("overlay");
  var overlayClose = document.getElementById("overlayClose");
  var fsExit = document.getElementById("fsExit");
  var grid = document.getElementById("grid");

  document.querySelector(".counter .of").textContent = "/ " + TOTAL;

  function fit() {
    var pad = document.body.classList.contains("fs") ? 0 : 36;
    var w = stage.clientWidth - pad;
    var h = stage.clientHeight - pad;
    var s = Math.min(w / 1280, h / 720);
    if (!isFinite(s) || s <= 0) s = 1;
    scaler.style.transform = "scale(" + s + ")";
  }

  function tagFor(sl) {
    if (sl.type === "hero") return "hero";
    if (sl.type === "demo" || /_demo$|-demo-/.test(sl.id)) return "demo";
    return "";
  }

  function render() {
    var sl = SLIDES[cur];
    frame.src = "slides/" + sl.id + ".html";
    num.textContent = cur + 1;
    titleEl.textContent = sl.title || sl.id;
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === TOTAL - 1;
    fit();
    var cells = grid.querySelectorAll("button");
    for (var i = 0; i < cells.length; i++) cells[i].classList.toggle("cur", i === cur);
  }

  function setHash(i) {
    var h = "#" + (i + 1);
    if (location.hash === h) return;
    if (history.replaceState) history.replaceState(null, "", h);
    else location.hash = h;
  }

  function go(i) {
    i = Math.max(0, Math.min(TOTAL - 1, i));
    if (i === cur) return;
    cur = i;
    setHash(cur);
    render();
  }

  prevBtn.onclick = function () { go(cur - 1); };
  nextBtn.onclick = function () { go(cur + 1); };

  // Single key handler, bound to both the shell window and each slide iframe,
  // so arrow keys work even when the slide (iframe) has keyboard focus —
  // including in fullscreen presentation mode.
  function keyHandler(e) {
    if (!overlay.hidden) { if (e.key === "Escape") toggleIndex(false); return; }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
    else if (e.key === "Escape" && document.body.classList.contains("fs") && !fsElement()) { applyFs(false); }
    else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(cur + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(cur - 1); }
    else if (e.key === "Home") { go(0); }
    else if (e.key === "End") { go(TOTAL - 1); }
  }
  window.addEventListener("keydown", keyHandler);

  frame.addEventListener("load", function () {
    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (doc) doc.addEventListener("keydown", keyHandler);
    } catch (e) { /* cross-origin guard — slides are same-origin so this won't fire */ }
  });

  // Slide index overlay
  function buildGrid() {
    var html = "";
    for (var i = 0; i < TOTAL; i++) {
      var sl = SLIDES[i];
      var tag = tagFor(sl);
      var tagHtml = tag ? '<span class="tag ' + tag + '">' + tag + "</span>" : "";
      html +=
        '<button data-i="' + i + '"><span class="gi">' + (i + 1) +
        '</span><span class="gt">' + escapeHtml(sl.title || sl.id) + tagHtml + "</span></button>";
    }
    grid.innerHTML = html;
    var btns = grid.querySelectorAll("button");
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener("click", function () {
        go(parseInt(this.getAttribute("data-i"), 10));
        toggleIndex(false);
      });
    }
  }
  function toggleIndex(show) {
    overlay.hidden = show === undefined ? !overlay.hidden : !show;
    if (!overlay.hidden) render();
  }
  indexBtn.onclick = function () { toggleIndex(); };
  overlayClose.onclick = function () { toggleIndex(false); };

  // Fullscreen / presentation mode
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function requestFs(el) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    return null;
  }
  function exitFs() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    return null;
  }
  function toggleFullscreen() {
    if (fsElement()) { exitFs(); return; }
    var p = requestFs(document.documentElement);
    if (p && p.catch) p.catch(function () { applyFs(true); });
    else if (p === null) applyFs(true);
  }
  function applyFs(on) {
    document.body.classList.toggle("fs", on);
    fsBtn.textContent = on ? "⤢ Exit" : "⛶ Present";
    fsExit.hidden = !on;
    fit();
  }
  function onFsChange() { applyFs(!!fsElement()); }
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  fsBtn.onclick = toggleFullscreen;
  fsExit.onclick = toggleFullscreen;

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
  }

  function slideFromHash() {
    var m = /^#(\d+)$/.exec(location.hash || "");
    if (!m) return 0;
    return Math.min(TOTAL - 1, Math.max(0, parseInt(m[1], 10) - 1));
  }
  window.addEventListener("hashchange", function () {
    var i = slideFromHash();
    if (i !== cur) { cur = i; render(); }
  });

  window.addEventListener("resize", fit);

  cur = slideFromHash();
  setHash(cur);
  buildGrid();
  render();
})();
