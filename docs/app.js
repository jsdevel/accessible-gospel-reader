(() => {
  // ---- Best-effort portrait lock ----
  async function tryLockPortrait(){
    try{ if (screen.orientation?.lock) await screen.orientation.lock("portrait"); }catch(_){}
  }
  window.addEventListener("load", tryLockPortrait);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tryLockPortrait(); });

  // ---- DOM ----
  const refTitleEl = document.getElementById("refTitle");
  const refCVEl = document.getElementById("refCV");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const listEl = document.getElementById("list");
  const crumbsEl = document.getElementById("crumbs");
  const verseEl = document.getElementById("verse");
  const contentScroll = document.getElementById("contentScroll");
  const bottombarEl = document.getElementById("bottombar");

  const btnBack = document.getElementById("btnBack");
  const btnUp = document.getElementById("btnUp");
  const btnForward = document.getElementById("btnForward");

  const btnPrevSeg = document.getElementById("btnPrevSeg");
  const btnReplaySeg = document.getElementById("btnReplaySeg");
  const btnNextSeg = document.getElementById("btnNextSeg");

  const btnGear = document.getElementById("btnGear");
  const modalBack = document.getElementById("modalBack");
  const btnCloseSettings = document.getElementById("btnCloseSettings");

  const ctlSpeed = document.getElementById("speed");
  const ctlSpeedVal = document.getElementById("speedVal");
  const ctlFont = document.getElementById("fontSize");
  const ctlFontVal = document.getElementById("fontVal");
  const ctlMaxWords = document.getElementById("maxWords");
  const ctlHlColor = document.getElementById("hlColor");
  const ctlHlStyle = document.getElementById("hlStyle");
  const ctlVoice = document.getElementById("voice");
  const ctlVoiceHelp = document.getElementById("voiceHelp");

  const btnSpeedMinus = document.getElementById("speedMinus");
  const btnSpeedPlus = document.getElementById("speedPlus");
  const btnFontMinus = document.getElementById("fontMinus");
  const btnFontPlus = document.getElementById("fontPlus");
  const btnWordsMinus = document.getElementById("wordsMinus");
  const btnWordsPlus = document.getElementById("wordsPlus");

  // ---- Preferences (player) ----
  const PREFS_KEY = "glr_prefs_v1";
  const Prefs = {
    rate: 0.90,
    fontPx: null,
    maxWords: 0,
    hlColor: "#ffe27a",
    hlStyle: "soft",
    voiceURI: ""
  };

  function savePrefs(){
    try{ localStorage.setItem(PREFS_KEY, JSON.stringify(Prefs)); }catch(_){}
  }
  function loadPrefs(){
    try{
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      if (typeof data.rate === "number") Prefs.rate = Math.min(1.5, Math.max(0.5, data.rate));
      if (typeof data.fontPx === "number" || data.fontPx === null) Prefs.fontPx = data.fontPx;
      if (typeof data.maxWords === "number") Prefs.maxWords = Math.min(40, Math.max(0, Math.floor(data.maxWords)));
      if (typeof data.hlColor === "string") Prefs.hlColor = data.hlColor;
      if (typeof data.hlStyle === "string") Prefs.hlStyle = data.hlStyle;
      if (typeof data.voiceURI === "string") Prefs.voiceURI = data.voiceURI;
    }catch(_){}
  }

  function hexToRgba(hex, alpha){
    try{
      const h = (hex || "").replace("#","").trim();
      if (h.length !== 6) return null;
      const r = parseInt(h.slice(0,2),16);
      const g = parseInt(h.slice(2,4),16);
      const b = parseInt(h.slice(4,6),16);
      if ([r,g,b].some(n => Number.isNaN(n))) return null;
      return `rgba(${r},${g},${b},${alpha})`;
    }catch(_){ return null; }
  }

  function applyPrefs(){
    if (Prefs.fontPx && Prefs.fontPx > 0) verseEl.style.fontSize = Prefs.fontPx + "px";
    else verseEl.style.fontSize = "";

    document.documentElement.style.setProperty("--hl", Prefs.hlColor);
    const bg = hexToRgba(Prefs.hlColor, Prefs.hlStyle === "bold" ? 0.28 : 0.16) || "rgba(255,226,122,.18)";
    document.documentElement.style.setProperty("--hlBg", bg);


    const preview = document.getElementById("hlPreview");
    if (preview){
      const pbg = hexToRgba(Prefs.hlColor, Prefs.hlStyle === "bold" ? 0.35 : 0.18) || bg;
      preview.style.background = pbg;
      preview.style.color = Prefs.hlColor;
      preview.style.outline = `2px solid ${hexToRgba(Prefs.hlColor, 0.35) || "rgba(255,255,255,.12)"}`;
      preview.style.outlineOffset = "1px";
    }

    ctlSpeed.value = String(Prefs.rate);
    ctlSpeedVal.textContent = `${Prefs.rate.toFixed(2)}x`;
    ctlFont.value = String(Prefs.fontPx ?? 32);
    ctlFontVal.textContent = Prefs.fontPx ? `${Prefs.fontPx}px` : "Auto";
    ctlMaxWords.value = String(Prefs.maxWords);
    ctlHlColor.value = Prefs.hlColor;
    ctlHlStyle.value = Prefs.hlStyle;
  }

  function openSettings(){
    modalBack.classList.add("show");
    modalBack.setAttribute("aria-hidden","false");
    // Hide gear while sheet is open so it doesn't overlap controls
    btnGear.style.display = "none";
    applyPrefs();
  }
  function closeSettings(){
    modalBack.classList.remove("show");
    modalBack.setAttribute("aria-hidden","true");
    // Restore gear only if we're still in player view
    btnGear.style.display = (verseEl.style.display !== "none") ? "flex" : "none";
  }

  // ---- Voice cache (fixes saved voice not being applied) ----
  let VOICES = [];

  function refreshVoices(){
    try{
      VOICES = speechSynthesis.getVoices?.() || [];
    }catch(_){
      VOICES = [];
    }
    return VOICES;
  }

  function pickVoice(){
    if (!VOICES.length) refreshVoices();

    const want = Prefs.voiceURI;
    if (want){
      const exact = VOICES.find(v => v.voiceURI === want);
      if (exact) return exact;

      // Some browsers change voiceURI across sessions; try a looser match
      const loose = VOICES.find(v => (v.voiceURI || "").includes(want) || (want || "").includes(v.voiceURI));
      if (loose) return loose;
    }

    const enUS = VOICES.find(v => (v.lang || "").replace("_","-") === "en-US");
    const fallback =
      enUS ||
      VOICES.find(v => (v.lang || "").startsWith("en-")) ||
      VOICES.find(v => v.default) ||
      VOICES[0] ||
      null;

    return fallback;
  }



  const UI = {
    setRef: (title, cv="") => { 
      refTitleEl.textContent = title; 
      if (cv.length > 20) {
        const lastColon = cv.lastIndexOf(":");
        if (lastColon > 0) {
            let ch = cv.substring(0, lastColon);
            const v = cv.substring(lastColon);
            if (ch.length > 16) ch = ch.slice(0, 15) + "…";
            refCVEl.textContent = ch + v;
        } else {
            refCVEl.textContent = cv.slice(0, 18) + "…";
        }
      } else {
        refCVEl.textContent = cv;
      }
    },
    setStatus: (t) => statusEl.textContent = t,
    hint: (t) => {
      hintEl.textContent = t;
      hintEl.classList.add("show");
      clearTimeout(UI._ht);
      UI._ht = setTimeout(() => hintEl.classList.remove("show"), 800);
    },
    showNav: () => {
      listEl.style.display = "";
      crumbsEl.style.display = "";
      verseEl.style.display = "none";
      bottombarEl.style.display = "none";
      btnGear.style.display = "none";
    },
    showPlayer: () => {
      listEl.style.display = "none";
      crumbsEl.style.display = "none";
      verseEl.style.display = "";
      bottombarEl.style.display = "";
      btnGear.style.display = "flex";
    },
    resetScroll: () => contentScroll.scrollTo({top:0, behavior:"instant"})
  };

  // ---- Fetch + cache ----
  const jsonCache = new Map();
  async function fetchJson(url){
    if (url && url.startsWith('custom://')) return await EpubLib.getChapter(url);
    if (jsonCache.has(url)) return jsonCache.get(url);
    const res = await fetch(url, {cache:"force-cache"});
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    jsonCache.set(url, data);
    return data;
  }
  function normalizeHref(href){
    if (!href) return href;
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    if (href.startsWith("/")) return href.slice(1);
    return href;
  }

  // ---- App state ----
  const App = {
    navRoot: null,

    // current drilldown selection
    sel: { workIndex:null, bookIndex:null, segmentIndex:null },

    // current chapter JSON when in player/chapter
    chapterJson: null,
    verseIndex: 0,

    // player TTS segment state
    speaking: false,
    segments: [],
    segSpans: [],
    segIndex: 0,

    // internal history stack
    hist: [],
    histIndex: -1,
  };


  // ---- Persistence (localStorage) ----
  const STORAGE_KEY = "glr_state_v1";

  function saveAppState(){
    try{
      const payload = {
        v: 1,
        ts: Date.now(),
        hist: App.hist,
        histIndex: App.histIndex
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }catch(_){}
  }

  function loadAppState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return null;
      if (!Array.isArray(data.hist) || typeof data.histIndex !== "number") return null;
      return data;
    }catch(_){
      return null;
    }
  }


  function isPlayerView(){ return verseEl.style.display !== "none"; }

  // ---- History helpers ----
  function canBack(){ return App.histIndex > 0; }
  function canForward(){ return App.histIndex < App.hist.length - 1; }

  function pushState(st){
    App.hist.splice(App.histIndex + 1);
    App.hist.push(JSON.parse(JSON.stringify(st)));
    App.histIndex = App.hist.length - 1;
    updateTopButtons();
    saveAppState();
  }

  function currentState(){ return App.hist[App.histIndex] || null; }

  function restoreState(st){
    if (!st || !App.navRoot) return;
    const v = st.view;

    if (v === "home") return renderHome(false);
    if (v === "scriptures_root") return renderScripturesRoot(false);
    if (v === "work") return renderWork(st.workIndex, false);
    if (v === "book") return renderBook(st.workIndex, st.bookIndex, false);
    if (v === "chapter") return renderChapter(st.workIndex, st.bookIndex, st.segmentIndex, false);
    if (v === "player") return renderPlayerFromState(st, false);
  }

  // ---- UI rendering primitives ----
  function renderCrumbs(items){
    crumbsEl.innerHTML = "";
    items.forEach(it => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = it.label;
      if (it.onClick) b.addEventListener("click", it.onClick);
      crumbsEl.appendChild(b);
    });
  }

  function renderCards(items){
    listEl.innerHTML = "";
    items.forEach(it => {
      const card = document.createElement("div");
      card.className = "card";
      card.setAttribute("role","button");
      card.setAttribute("tabindex","0");

      const meta = document.createElement("div");
      meta.className = "meta";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = it.title || "";

      meta.appendChild(title);

      if (it.sub){
        const sub = document.createElement("div");
        sub.className = "sub";
        sub.textContent = it.sub;
        meta.appendChild(sub);
      }

      const chev = document.createElement("div");
      chev.className = "chev";
      chev.textContent = it.chev ?? "›";

      card.appendChild(meta);
      card.appendChild(chev);

      let pressTimer;
      let longPressed = false;

      const go = (e) => {
        if (longPressed) { e?.preventDefault(); return; }
        if (it.onClick) it.onClick(e);
      };

      if (it.onLongPress) {
        const startPress = (e) => {
          if (e.type !== "touchstart" && e.button !== 0) return;
          longPressed = false;
          pressTimer = setTimeout(() => {
            longPressed = true;
            if (navigator.vibrate) try { navigator.vibrate(40); } catch(err){}
            it.onLongPress(e);
          }, 600);
        };
        const cancelPress = () => {
          if (pressTimer) clearTimeout(pressTimer);
          pressTimer = null;
        };

        card.addEventListener("mousedown", startPress);
        card.addEventListener("touchstart", startPress, {passive: true});
        
        card.addEventListener("mouseup", cancelPress);
        card.addEventListener("mouseleave", cancelPress);
        card.addEventListener("touchend", cancelPress);
        card.addEventListener("touchcancel", cancelPress);
        card.addEventListener("touchmove", cancelPress, {passive: true});
        card.addEventListener("contextmenu", (e) => {
            // Prevent right click popping up over our long-press on some devices
            if (longPressed) e.preventDefault();
        });
      }
      
      card.addEventListener("click", go);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); }
      });

      listEl.appendChild(card);
    });

    UI.resetScroll();
  }

  // ---- Player (segments + TTS) ----

  function sanitizeTextForSpeech(text){
    return String(text || "")
      // Drop pilcrow/paragraph symbols and other non-spoken formatting chars
      .replace(/[¶⁋§￼�]/gu, " ")
      // Drop invisible/control/private-use/surrogate characters
      .replace(/[\p{C}]/gu, " ")
      .replace(/[​-‍⁠﻿]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitIntoSegments(text){
    const s = sanitizeTextForSpeech(text);
    if (!s) return [];

    const re = /[^,;:.!?]+(?:[,;:.!?]+|$)/g;
    const base = (s.match(re) || []).map(x => x.trim()).filter(Boolean);

    const maxW = Prefs.maxWords || 0;
    if (maxW <= 0) return base;

    const out = [];
    for (const seg of base){
      const words = seg.split(/\s+/).filter(Boolean);
      if (words.length <= maxW){
        out.push(seg);
        continue;
      }
      for (let i = 0; i < words.length; i += maxW){
        out.push(words.slice(i, i + maxW).join(" "));
      }
    }
    return out;
  }

  function renderSegmentWords(span, segText){
    const words = segText.split(/\s+/).filter(Boolean);
    span.textContent = "";
    words.forEach((w, idx) => {
      const ws = document.createElement("span");
      ws.className = "word " + (idx % 2 === 0 ? "w0" : "w1");
      ws.textContent = w;
      span.appendChild(ws);
      if (idx < words.length - 1) span.appendChild(document.createTextNode(" "));
    });
  }

  function stopSpeech(){
    try{ speechSynthesis.cancel(); }catch(_){}
    App.speaking = false;
    updateTopButtons();
    updateBottomButtons();
  }

  function makeUtterance(text){
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = Prefs.rate;

    const v = pickVoice();
    if (v) u.voice = v;

    return u;
  }

  function setActiveSegment(i){
    if (App.segSpans[App.segIndex]) App.segSpans[App.segIndex].classList.remove("active");
    App.segIndex = Math.max(0, Math.min(i, App.segments.length - 1));
    if (App.segSpans[App.segIndex]) App.segSpans[App.segIndex].classList.add("active");
    App.segSpans[App.segIndex]?.scrollIntoView({block:"center", inline:"nearest", behavior:"smooth"});
    updateBottomButtons();
  }

  function speakSegment(i){
    if (!App.segments.length) return;
    stopSpeech();
    setActiveSegment(i);

    const segText = App.segments[App.segIndex];
    App.speaking = true;
    UI.setStatus(`${App.segIndex + 1}/${App.segments.length}`);
    UI.hint("Speaking…");
    updateTopButtons();
    updateBottomButtons();

    refreshVoices();
    const u = makeUtterance(segText);
    u.onend = () => {
      App.speaking = false;
      UI.setStatus("Ready");
      updateTopButtons();
      updateBottomButtons();
    };
    u.onerror = () => {
      App.speaking = false;
      UI.setStatus("TTS error");
      updateTopButtons();
      updateBottomButtons();
    };
    speechSynthesis.speak(u);
  }

  function renderPlayerText(verseText){
    UI.showPlayer();
    verseEl.innerHTML = "";

    App.segments = splitIntoSegments(verseText);
    App.segSpans = [];
    App.segIndex = 0;

    App.segments.forEach((seg, idx) => {
      const span = document.createElement("span");
      span.className = "seg";
      renderSegmentWords(span, seg);
      span.addEventListener("click", () => speakSegment(idx));
      verseEl.appendChild(span);
      verseEl.appendChild(document.createTextNode(" "));
      App.segSpans.push(span);
    });

    App.segSpans[0]?.classList.add("active");
    updateBottomButtons();
    UI.setStatus("Ready");
    UI.resetScroll();
  }

  function rerenderCurrentVerse(){
    if (!isPlayerView() || !App.chapterJson) return;
    const verses = App.chapterJson.verses || [];
    const v = verses[App.verseIndex] || {};
    renderPlayerText(v.text || "");
    updateTopButtons();
    savePrefs();
  }

  function updateBottomButtons(){
    const noSegs = App.segments.length === 0;
    btnPrevSeg.disabled = App.speaking || noSegs || App.segIndex <= 0;
    btnNextSeg.disabled = App.speaking || noSegs || App.segIndex >= App.segments.length - 1;
    btnReplaySeg.disabled = App.speaking || noSegs;
  }

  // ---- Top button enable/disable ----
  function updateTopButtons(){
    // ▲ always enabled once nav is loaded
    btnUp.disabled = !App.navRoot;

    if (isPlayerView()){
      const verses = App.chapterJson?.verses || [];
      btnBack.disabled = App.speaking || App.verseIndex <= 0 || verses.length === 0;
      btnForward.disabled = App.speaking || verses.length === 0 || App.verseIndex >= verses.length - 1;
      return;
    }

    // not in player -> history
    btnBack.disabled = !canBack();
    btnForward.disabled = !canForward();
  }

  // ---- Navigation renders ----
  function renderHome(push=true){
    stopSpeech();
    UI.showNav();
    UI.setRef("Library");
    UI.setStatus("Choose a collection");

    renderCrumbs([{label:"Library", onClick: () => renderHome()}]);

    const cards = [];
    if (App.navRoot?.scriptures?.works) {
      cards.push({
        title: "Scriptures",
        sub: "Sacred Texts",
        chev: "›",
        onClick: () => renderScripturesRoot()
      });
    }

    const works = App.navRoot?.scriptures?.works || [];
    works.forEach((w, idx) => {
      if (w.isCustom) {
        cards.push({
          title: w.title,
          sub: "EPUB Collection (Long-press to delete)",
          chev: "›",
          onClick: () => renderWork(idx),
          onLongPress: async () => {
              if (window.confirm(`Delete the custom collection '${w.title}' and all its books?`)) {
                  try {
                      await EpubLib.deleteCollection(w.title);
                      App.navRoot.scriptures.works = App.navRoot.scriptures.works.filter(work => work.title !== w.title || !work.isCustom);
                      renderHome(false);
                  } catch(e) {
                      alert("Error deleting collection.");
                  }
              }
          }
        });
      }
    });
    
    cards.push({
      title: "+ Upload EPUB",
      sub: "Import from device",
      onClick: () => {
        const modal = document.getElementById("epubModal");
        if (modal) {
          modal.classList.add("show");
          modal.setAttribute("aria-hidden", "false");
        }
      }
    });

    renderCards(cards);

    if (push) pushState({view:"home"});
  }

  function renderScripturesRoot(push=true){
    stopSpeech();
    UI.showNav();
    UI.setRef("Scriptures");
    UI.setStatus("Choose a work");

    renderCrumbs([
      {label:"Library", onClick: () => renderHome()},
      {label:"Scriptures", onClick: () => renderScripturesRoot()}
    ]);

    const works = App.navRoot?.scriptures?.works || [];
    const cards = [];
    works.forEach((w, idx) => {
      if (!w.isCustom) {
        cards.push({
          title: w.title,
          sub: "Work",
          chev: "›",
          onClick: () => renderWork(idx)
        });
      }
    });

    renderCards(cards);

    if (push) pushState({view:"scriptures_root"});
  }

  function renderWork(workIndex, push=true){
    stopSpeech();
    UI.showNav();

    const work = App.navRoot.scriptures.works[workIndex];
    App.sel.workIndex = workIndex;
    App.sel.bookIndex = null;
    App.sel.segmentIndex = null;

    UI.setRef(work.title);
    UI.setStatus("Choose a book");

    const crumbs = [{label:"Library", onClick: () => renderHome()}];
    if (!work.isCustom) {
      crumbs.push({label:"Scriptures", onClick: () => renderScripturesRoot()});
    }
    crumbs.push({label: work.title, onClick: () => renderWork(workIndex)});
    renderCrumbs(crumbs);

    const books = work.books || [];
    renderCards(books.map((b, bookIndex) => ({
      title: b.title,
      sub: `${b.segments?.length || 0} chapter(s)`,
      onClick: () => renderBook(workIndex, bookIndex)
    })));

    if (push) pushState({view:"work", workIndex});
  }

  function renderBook(workIndex, bookIndex, push=true){
    stopSpeech();
    UI.showNav();

    const work = App.navRoot.scriptures.works[workIndex];
    const book = work.books[bookIndex];

    App.sel.workIndex = workIndex;
    App.sel.bookIndex = bookIndex;
    App.sel.segmentIndex = null;

    UI.setRef(book.title);
    UI.setStatus("Choose a chapter");

    const crumbs = [{label:"Library", onClick: () => renderHome()}];
    if (!work.isCustom) {
      crumbs.push({label:"Scriptures", onClick: () => renderScripturesRoot()});
    }
    crumbs.push({label: work.title, onClick: () => renderWork(workIndex)});
    crumbs.push({label: book.title, onClick: () => renderBook(workIndex, bookIndex)});
    renderCrumbs(crumbs);

    const segs = book.segments || [];
    
    let firstChapterIndex = 0;
    let explicitStart = segs.findIndex(s => /chapter\s*1\b|chapter\s*one\b|chapter\s*i\b|prologue/i.test(s.title));
    if (explicitStart !== -1) {
        firstChapterIndex = explicitStart;
    } else {
        let firstChap = segs.findIndex(s => /chapter\s*[0-9ivxlc]+/i.test(s.title));
        if (firstChap !== -1) {
            firstChapterIndex = firstChap;
        } else {
            const frontMatterRegex = /^(cover|title page|title|copyright|dedication|preface|contents|table of contents|introduction|foreword|acknowledgements|half title|about the author|also by|praise for)/i;
            const normalizedBookTitle = book.title ? book.title.replace(/[^a-z0-9]/gi, '').toLowerCase() : '';

            for(let i=0; i<segs.length; i++) {
                const normTitle = segs[i].title.replace(/[^a-z0-9]/gi, '').toLowerCase();
                if (!frontMatterRegex.test(segs[i].title) && (!normalizedBookTitle || normTitle !== normalizedBookTitle)) {
                    firstChapterIndex = i;
                    break;
                }
            }
        }
    }

    let realChapterCounter = 1;
    
    renderCards(segs.map((seg, segmentIndex) => {
      let subtitle = "";
      if (segmentIndex < firstChapterIndex) {
          subtitle = "Front Matter";
      } else {
          subtitle = `Chapter ${realChapterCounter++}`;
      }
      
      return {
        title: seg.title,
        sub: subtitle,
        onClick: () => renderChapter(workIndex, bookIndex, segmentIndex)
      };
    }));

    if (push) pushState({view:"book", workIndex, bookIndex});
  }

  async function renderChapter(workIndex, bookIndex, segmentIndex, push=true){
    stopSpeech();
    UI.showNav();

    const work = App.navRoot.scriptures.works[workIndex];
    const book = work.books[bookIndex];
    const seg = book.segments[segmentIndex];
    const url = normalizeHref(seg.href);

    App.sel.workIndex = workIndex;
    App.sel.bookIndex = bookIndex;
    App.sel.segmentIndex = segmentIndex;

    UI.setRef(book.title);
    UI.setStatus(`Loading ${seg.title}…`);

    const crumbs = [{label:"Library", onClick: () => renderHome()}];
    if (!work.isCustom) {
      crumbs.push({label:"Scriptures", onClick: () => renderScripturesRoot()});
    }
    crumbs.push({label: work.title, onClick: () => renderWork(workIndex)});
    crumbs.push({label: book.title, onClick: () => renderBook(workIndex, bookIndex)});
    crumbs.push({label: seg.title, onClick: () => renderChapter(workIndex, bookIndex, segmentIndex)});
    renderCrumbs(crumbs);

    try{
      const ch = await fetchJson(url);
      App.chapterJson = ch;
      App.verseIndex = 0;

      const verses = ch.verses || [];
      UI.setStatus(`Choose a verse (${verses.length})`);

      renderCards(verses.map((v, verseIdx) => {
        const text = (v.text || "").trim();
        const preview = text.length > 80 ? text.slice(0,80) + "…" : text;
        return {
          title: `${seg.title}:${verseIdx + 1}`,
          sub: preview,
          onClick: () => renderPlayerVerse(workIndex, bookIndex, segmentIndex, verseIdx, ch)
        };
      }));

      if (push) pushState({view:"chapter", workIndex, bookIndex, segmentIndex});
      updateTopButtons();
    }catch(err){
      UI.setStatus("Failed to load chapter");
      renderCards([{
        title: "Could not load JSON",
        sub: String(err?.message || err),
        onClick: () => renderBook(workIndex, bookIndex)
      }]);
      updateTopButtons();
    }
  }

  function renderPlayerVerse(workIndex, bookIndex, segmentIndex, verseIdx, chapterJson, push=true){
    stopSpeech();

    const work = App.navRoot.scriptures.works[workIndex];
    const book = work.books[bookIndex];
    const seg = book.segments[segmentIndex];

    App.sel.workIndex = workIndex;
    App.sel.bookIndex = bookIndex;
    App.sel.segmentIndex = segmentIndex;

    App.chapterJson = chapterJson;
    App.verseIndex = verseIdx;

    const verseObj = (chapterJson.verses || [])[verseIdx] || {};
    const verseText = verseObj.text || "";

    UI.setRef(`${book.title}`, `${seg.title}:${verseIdx + 1}`);
    renderPlayerText(verseText);

    if (push) pushState({view:"player", workIndex, bookIndex, segmentIndex, verseIndex: verseIdx});
    updateTopButtons();
  }

  async function renderPlayerFromState(st, push=true){
    // Re-fetch chapter json (cached) then open verse
    const {workIndex, bookIndex, segmentIndex} = st;
    const verseIdx = st.verseIndex;

    const work = App.navRoot.scriptures.works[workIndex];
    const book = work.books[bookIndex];
    const seg = book.segments[segmentIndex];
    const url = normalizeHref(seg.href);

    UI.setRef(`${book.title}`, `${seg.title}:${verseIdx + 1}`);
    UI.setStatus("Loading verse…");
    UI.showPlayer();

    try{
      const ch = await fetchJson(url);
      App.chapterJson = ch;
      App.verseIndex = verseIdx;
      App.sel.workIndex = workIndex;
      App.sel.bookIndex = bookIndex;
      App.sel.segmentIndex = segmentIndex;

      const verseObj = (ch.verses || [])[verseIdx] || {};
      renderPlayerText(verseObj.text || "");

      if (push) pushState({view:"player", workIndex, bookIndex, segmentIndex, verseIndex: verseIdx});
      updateTopButtons();
    }catch(err){
      await renderChapter(workIndex, bookIndex, segmentIndex, push);
      UI.setStatus("Failed to load verse");
      updateTopButtons();
    }
  }

  // ---- Verse navigation in player ----
  function moveVerse(delta){
    const verses = App.chapterJson?.verses || [];
    const next = App.verseIndex + delta;
    if (next < 0 || next >= verses.length) return;

    const {workIndex, bookIndex, segmentIndex} = App.sel;
    if (workIndex == null || bookIndex == null || segmentIndex == null) return;

    renderPlayerVerse(workIndex, bookIndex, segmentIndex, next, App.chapterJson);
  }

  // ---- Up one level ----
  async function goUpOneLevel(){
    if (!App.navRoot) return;

    const st = currentState();
    if (!st) return;

    if (st.view === "player"){
      // back to chapter verse list
      return renderChapter(st.workIndex, st.bookIndex, st.segmentIndex);
    }
    if (st.view === "chapter"){
      return renderBook(st.workIndex, st.bookIndex);
    }
    if (st.view === "book"){
      return renderWork(st.workIndex);
    }
    if (st.view === "work"){
      const w = App.navRoot.scriptures.works[st.workIndex];
      return w.isCustom ? renderHome() : renderScripturesRoot();
    }
    if (st.view === "scriptures_root"){
      return renderHome();
    }
    // home -> no-op
  }

  // ---- Event handlers ----

  // ---- Settings UI ----
  btnGear.onclick = () => openSettings();
  btnCloseSettings.onclick = () => closeSettings();
  modalBack.addEventListener("click", (e) => { if (e.target === modalBack) closeSettings(); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalBack.classList.contains("show")) closeSettings(); });

  function populateVoices(){
    const voices = refreshVoices();
    ctlVoice.innerHTML = "";
    if (!voices.length){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No voices available";
      ctlVoice.appendChild(opt);
      ctlVoice.disabled = true;
      ctlVoiceHelp.textContent = "Your browser hasn't provided voices yet.";
      return;
    }
    ctlVoice.disabled = false;
    ctlVoiceHelp.textContent = `${voices.length} voice(s) available`;

    const preferred = Prefs.voiceURI;
    for (const v of voices){
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})${v.default ? " • default" : ""}`;
      ctlVoice.appendChild(opt);
    }
    if (preferred && voices.some(v => v.voiceURI === preferred)){
      ctlVoice.value = preferred;
    } else {
      if (preferred && voices.some(v => v.voiceURI === preferred)) {
        ctlVoice.value = preferred;
      } else {
        // Prefer en-US voice
        const enUS = voices.find(v => v.lang.replace("_","-") === "en-US");
        const fallback =
          enUS ||
          voices.find(v => v.lang.startsWith("en-")) ||
          voices.find(v => v.default) ||
          voices[0];

        Prefs.voiceURI = fallback?.voiceURI || "";
        ctlVoice.value = Prefs.voiceURI;
        savePrefs();
      }
      ctlVoice.value = Prefs.voiceURI;
      savePrefs();
    }
  }

  if (typeof speechSynthesis !== "undefined"){
    speechSynthesis.onvoiceschanged = () => { refreshVoices(); populateVoices(); };
  }

  function clampNumber(value, min, max, fallback){
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function updateSpeedFromInput(){
    Prefs.rate = clampNumber(ctlSpeed.value, 0.5, 1.5, Prefs.rate);
    ctlSpeed.value = Prefs.rate.toFixed(2);
    ctlSpeedVal.textContent = `${Prefs.rate.toFixed(2)}x`;
    savePrefs();
  }

  function updateFontFromInput(){
    const val = Math.round(clampNumber(ctlFont.value, 18, 54, Prefs.fontPx ?? 32));
    if (val <= 18){ Prefs.fontPx = null; ctlFontVal.textContent = "Auto"; }
    else { Prefs.fontPx = val; ctlFontVal.textContent = `${val}px`; }
    ctlFont.value = String(val);
    applyPrefs();
    rerenderCurrentVerse();
  }

  function updateMaxWordsFromInput(){
    Prefs.maxWords = Math.min(40, Math.max(0, Math.floor(Number(ctlMaxWords.value) || 0)));
    ctlMaxWords.value = String(Prefs.maxWords);
    rerenderCurrentVerse();
  }

  ctlSpeed.addEventListener("input", updateSpeedFromInput);
  ctlSpeed.addEventListener("change", updateSpeedFromInput);

  ctlFont.addEventListener("input", updateFontFromInput);
  ctlFont.addEventListener("change", updateFontFromInput);

  ctlMaxWords.addEventListener("input", updateMaxWordsFromInput);
  ctlMaxWords.addEventListener("change", updateMaxWordsFromInput);

  ctlHlColor.addEventListener("input", () => {
    Prefs.hlColor = ctlHlColor.value || Prefs.hlColor;
    applyPrefs();
    savePrefs();
  });

  ctlHlStyle.addEventListener("change", () => {
    Prefs.hlStyle = ctlHlStyle.value || "soft";
    applyPrefs();
    savePrefs();
  });

  ctlVoice.addEventListener("change", () => {
    Prefs.voiceURI = ctlVoice.value || "";
    savePrefs();
  });

  btnSpeedMinus.onclick = () => { ctlSpeed.stepDown(); updateSpeedFromInput(); };
  btnSpeedPlus.onclick = () => { ctlSpeed.stepUp(); updateSpeedFromInput(); };
  btnFontMinus.onclick = () => { ctlFont.stepDown(); updateFontFromInput(); };
  btnFontPlus.onclick = () => { ctlFont.stepUp(); updateFontFromInput(); };
  btnWordsMinus.onclick = () => { ctlMaxWords.stepDown(); updateMaxWordsFromInput(); };
  btnWordsPlus.onclick = () => { ctlMaxWords.stepUp(); updateMaxWordsFromInput(); };

  btnPrevSeg.onclick = () => speakSegment(App.segIndex - 1);
  btnReplaySeg.onclick = () => speakSegment(App.segIndex);
  btnNextSeg.onclick = () => speakSegment(App.segIndex + 1);

  btnBack.onclick = () => {
    if (isPlayerView()) moveVerse(-1);
    else if (canBack()) { App.histIndex--; restoreState(App.hist[App.histIndex]); updateTopButtons(); saveAppState(); }
  };

  btnForward.onclick = () => {
    if (isPlayerView()) moveVerse(1);
    else if (canForward()) { App.histIndex++; restoreState(App.hist[App.histIndex]); updateTopButtons(); saveAppState(); }
  };

  btnUp.onclick = () => goUpOneLevel();

  // Stop speech when leaving
  window.addEventListener("pagehide", stopSpeech);

  // Disable iPhone Safari pinch zoom / page gesture behavior
  document.addEventListener("gesturestart", (e) => e.preventDefault(), {passive:false});
  document.addEventListener("gesturechange", (e) => e.preventDefault(), {passive:false});
  document.addEventListener("gestureend", (e) => e.preventDefault(), {passive:false});

  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, {passive:false});

  document.addEventListener("touchmove", (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, {passive:false});

  // ---- Init ----
  async function init(){
    loadPrefs();
    applyPrefs();
    if (typeof speechSynthesis !== "undefined"){ refreshVoices(); populateVoices(); }

    updateTopButtons();
    if (typeof speechSynthesis === "undefined"){
      UI.setStatus("No TTS");
      btnPrevSeg.disabled = btnReplaySeg.disabled = btnNextSeg.disabled = true;
    }

    try{
      // NOTE: If opened as file://, fetch may be blocked. Serve over HTTP.
      App.navRoot = await fetchJson("nav.json");
      if (!App.navRoot.scriptures) App.navRoot.scriptures = { works: [] };
      
      try {
        if (typeof EpubLib !== "undefined") {
          const customWorks = await EpubLib.getLibraryNav();
          if (customWorks && customWorks.length) {
            customWorks.forEach(w => w.isCustom = true);
            App.navRoot.scriptures.works.push(...customWorks);
          }
          
          const btnCloseEpub = document.getElementById("btnCloseEpub");
          const epubModal = document.getElementById("epubModal");
          const btnSaveEpub = document.getElementById("btnSaveEpub");
          const epubFile = document.getElementById("epubFile");
          const epubTitle = document.getElementById("epubTitle");
          const epubCollection = document.getElementById("epubCollection");

          if (btnCloseEpub) btnCloseEpub.onclick = () => { epubModal.classList.remove('show'); epubModal.setAttribute('aria-hidden', 'true'); };
          
          if (btnSaveEpub) {
            btnSaveEpub.onclick = async () => {
              if (!epubFile.files.length) return alert("Select an EPUB file.");
              btnSaveEpub.disabled = true;
              btnSaveEpub.textContent = "Parsing...";
              try {
                const col = epubCollection.value.trim() || "Personal Study";
                const title = epubTitle.value.trim() || epubFile.files[0].name.replace('.epub','');
                const newWorks = await EpubLib.parseEpubBlob(epubFile.files[0], col, title);
                
                newWorks.forEach(w => w.isCustom = true);
                App.navRoot.scriptures.works = App.navRoot.scriptures.works.filter(w => !newWorks.some(nw => nw.title === w.title));
                App.navRoot.scriptures.works.push(...newWorks);
                
                epubModal.classList.remove('show');
                epubModal.setAttribute('aria-hidden', 'true');
                if (currentState()?.view === "home") renderHome(false);
              } catch(err) {
                alert("Error parsing EPUB: " + err);
              }
              btnSaveEpub.disabled = false;
              btnSaveEpub.textContent = "Import & Save";
            };
          }

          if (epubFile) {
            epubFile.onchange = async () => {
              if (epubFile.files.length) {
                const name = epubFile.files[0].name.replace('.epub','');
                epubTitle.value = "Scanning...";
                epubCollection.value = "";
                try {
                    const zip = await window.JSZip.loadAsync(epubFile.files[0]);
                    const containerFile = zip.file("META-INF/container.xml");
                    const containerXml = await containerFile.async("string");
                    const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
                    const opfPath = containerDoc.querySelector("rootfile").getAttribute("full-path");
                    const opfFile = zip.file(opfPath);
                    const opfXml = await opfFile.async("string");
                    const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
                    
                    let titleText = name;
                    let authorText = "Personal Study";
                    
                    const titleNode = opfDoc.getElementsByTagName("dc:title")[0] || opfDoc.getElementsByTagName("title")[0];
                    if (titleNode && titleNode.textContent) titleText = titleNode.textContent.trim();
                    
                    const creatorNode = opfDoc.getElementsByTagName("dc:creator")[0] || opfDoc.getElementsByTagName("creator")[0];
                    if (creatorNode && creatorNode.textContent) authorText = creatorNode.textContent.trim();
                    
                    epubTitle.value = titleText;
                    epubCollection.value = authorText;
                } catch(err) {
                    epubTitle.value = name;
                    epubCollection.value = "Personal Study";
                }
              }
            };
          }
        }
      } catch (err) {
        console.error("Failed to load epub tools", err);
      }

      const persisted = loadAppState();
      if (persisted && persisted.hist.length){
        App.hist = persisted.hist;
        App.histIndex = Math.min(Math.max(persisted.histIndex, 0), persisted.hist.length - 1);
        // Restore last view
        const st = currentState();
        if (st) restoreState(st);
        updateTopButtons();
      } else {
        renderHome(true);
        updateTopButtons();
      }
    }catch(err){
      UI.showNav();
      UI.setRef("Scriptures");
      UI.setStatus("Could not load nav.json");
      renderCrumbs([{label:"Scriptures"}]);
      renderCards([{
        title: "nav.json not found / blocked",
        sub: "Tip: serve this folder over HTTP (python -m http.server) so fetch() can read nav.json.",
      },{
        title: "Error details",
        sub: String(err?.message || err),
      }]);
      updateTopButtons();
      pushState({view:"home"});
    }
  }

  init();
})();
