// @ds-adherence-ignore -- companion to image-slot.js (raw elements/hex/px by design)
/**
 * <video-slot> — user-fillable VIDEO placeholder, sibling to <image-slot>.
 *
 * Drag-drop (or click to browse) a video file; it's stored as a data URL in
 * a .video-slots.state.json sidecar via window.omelette.writeFile — the same
 * persistence pattern as image-slot.js, so a filled slot survives reload and
 * travels with share links / downloaded zips. Outside the omelette runtime
 * the slot is read-only and just plays whatever the sidecar holds.
 *
 * Because video is stored RAW (no re-encode), keep clips small — there's a
 * size cap (see MAX_BYTES). For long reels, trim/compress first or host on
 * YouTube/Vimeo instead.
 *
 * Attributes:
 *   id           Persistence key. REQUIRED to survive reload; unique per slot.
 *   radius       Corner radius in px.                      (default 0)
 *   fit          object-fit for the video: contain | cover (default 'contain')
 *   placeholder  Empty-state caption.            (default 'Drop a video file')
 *   src          Optional fallback video URL.
 *
 * Size/layout come from ordinary CSS (width/height or aspect-ratio).
 */
(() => {
  const STATE_FILE = '.video-slots.state.json';
  const ACCEPT = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  const MAX_BYTES = 50 * 1024 * 1024; // 50MB raw — keep the sidecar writable

  const subs = new Set();
  let slots = {};
  const tombstones = new Set();
  let loaded = false;
  let loadP = null;

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j === 'object') {
          const merged = Object.assign({}, j, slots);
          for (const id of tombstones) delete merged[id];
          slots = merged;
        }
        tombstones.clear();
      })
      .catch(() => {})
      .then(() => { loaded = true; subs.forEach((fn) => fn()); });
    return loadP;
  }

  let saving = false;
  let saveDirty = false;
  function save() {
    if (saving) { saveDirty = true; return; }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    Promise.resolve(w(STATE_FILE, JSON.stringify(slots)))
      .catch(() => {})
      .then(() => { saving = false; if (saveDirty) { saveDirty = false; save(); } });
  }

  function setSlot(id, val) {
    if (!id) return;
    if (val) { slots[id] = val; tombstones.delete(id); }
    else { delete slots[id]; if (!loaded) tombstones.add(id); }
    subs.forEach((fn) => fn());
    if (loaded) save(); else load().then(save);
  }
  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? { u: v } : v;
  }

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
  }

  // Normalize a YouTube / Vimeo watch URL into a privacy-friendly embed URL.
  // Returns null for anything we don't recognise.
  function toEmbed(raw) {
    try {
      const url = new URL(String(raw).trim());
      const h = url.hostname.replace(/^www\./, '');
      if (h === 'youtu.be') {
        const id = url.pathname.slice(1).split('/')[0];
        if (id) return 'https://www.youtube.com/embed/' + id;
      }
      if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
        if (url.pathname === '/watch') {
          const id = url.searchParams.get('v');
          if (id) return 'https://www.youtube.com/embed/' + id;
        }
        const m = url.pathname.match(/\/(?:embed|shorts|v|live)\/([^/?#]+)/);
        if (m) return 'https://www.youtube.com/embed/' + m[1];
      }
      if (h === 'vimeo.com') {
        const m = url.pathname.match(/(\d+)/);
        if (m) return 'https://player.vimeo.com/video/' + m[1];
      }
      if (h === 'player.vimeo.com') {
        const m = url.pathname.match(/\/video\/(\d+)/);
        if (m) return 'https://player.vimeo.com/video/' + m[1];
      }
    } catch (e) { /* not a URL */ }
    return null;
  }

  const css =
    ':host{display:block;position:relative;vertical-align:top;width:320px;height:180px;' +
    '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(0,0,0,.55)}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:#0c0c0c;border-radius:var(--r,0)}' +
    '.frame video{position:absolute;inset:0;width:100%;height:100%;display:none;background:#0c0c0c}' +
    '.frame iframe.embed{position:absolute;inset:0;width:100%;height:100%;border:0;display:none}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  cursor:pointer;user-select:none;background:rgba(0,0,0,.04)}' +
    '.empty svg{opacity:.45}' +
    '.empty .cap{max-width:90%;font-weight:500;letter-spacing:.01em}' +
    '.empty .sub{font-size:11px}' +
    '.empty .sub u{text-underline-offset:2px;text-decoration-color:rgba(0,0,0,.25)}' +
    '.empty:hover .sub u{color:rgba(0,0,0,.75);text-decoration-color:currentColor}' +
    '.ring{position:absolute;inset:0;pointer-events:none;border:1.5px dashed rgba(0,0,0,.25);' +
    '  border-radius:var(--r,0);transition:border-color .12s}' +
    ':host([data-over]) .ring{border-color:#c96442}' +
    ':host([data-over]) .empty{outline:2px solid #c96442;outline-offset:-2px;background:rgba(201,100,66,.10)}' +
    ':host([data-filled]) .ring{display:none}' +
    '.ctl{position:absolute;top:8px;right:8px;display:flex;gap:6px;opacity:0;pointer-events:none;' +
    '  transition:opacity .12s;z-index:2}' +
    ':host([data-filled][data-editable]:hover) .ctl{opacity:1;pointer-events:auto}' +
    '.ctl button{appearance:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;' +
    '  background:rgba(0,0,0,.65);color:#fff;font:11px/1 system-ui,sans-serif;backdrop-filter:blur(6px)}' +
    '.ctl button:hover{background:rgba(0,0,0,.85)}' +
    '.linkrow{display:none;flex-flow:row nowrap;gap:6px;margin-top:6px;width:92%;max-width:360px}' +
    '.linkrow input{flex:1;min-width:0;font:12px system-ui,sans-serif;padding:6px 9px;' +
    '  border:1px solid rgba(0,0,0,.2);border-radius:6px;background:#fff;color:#1a1a1a}' +
    '.linkrow input:focus{outline:none;border-color:#c96442}' +
    '.linkrow button{appearance:none;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;' +
    '  background:#1a1a1a;color:#fff;font:11px/1 system-ui,sans-serif;font-weight:600}' +
    '.linkrow button:hover{background:#000}' +
    '.err{position:absolute;left:8px;bottom:8px;right:8px;color:#b3261e;font-size:11px;' +
    '  background:rgba(255,255,255,.9);padding:4px 6px;border-radius:5px;pointer-events:none}';

  const icon =
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2" y="4" width="14" height="16" rx="2"/>' +
    '<path d="m22 7-6 4 6 4V7z"/></svg>';

  class VideoSlot extends HTMLElement {
    static get observedAttributes() {
      return ['radius', 'fit', 'placeholder', 'src', 'id'];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' + css + '</style>' +
        '<div class="frame">' +
        '  <video part="video" playsinline controls preload="metadata"></video>' +
        '  <iframe class="embed" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
        '  <div class="empty">' + icon +
        '    <div class="cap"></div>' +
        '    <div class="sub">or <u class="browse">browse files</u></div>' +
        '    <div class="sub">or <u class="linktoggle">paste a YouTube / Vimeo link</u></div>' +
        '    <div class="linkrow"><input class="urlin" type="text" placeholder="Paste link, then Enter"><button class="go" type="button">Embed</button></div>' +
        '  </div>' +
        '  <div class="ring"></div>' +
        '</div>' +
        '<div class="ctl"><button data-act="replace">Replace</button>' +
        '  <button data-act="clear">Remove</button></div>' +
        '<input type="file" accept="' + ACCEPT.join(',') + '" hidden>';
      this._frame = root.querySelector('.frame');
      this._video = root.querySelector('video');
      this._embed = root.querySelector('iframe.embed');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._subEls = root.querySelectorAll('.sub');
      this._linkrow = root.querySelector('.linkrow');
      this._urlin = root.querySelector('.urlin');
      this._input = root.querySelector('input[type=file]');
      this._err = null;
      this._depth = 0;
      this._gen = 0;
      this._subFn = () => this._render();
      this._empty.addEventListener('click', (e) => {
        if (e.target.closest('.linkrow') || e.target.classList.contains('linktoggle')) return;
        this._input.click();
      });
      root.querySelector('.linktoggle').addEventListener('click', (e) => {
        e.stopPropagation();
        const open = this._linkrow.style.display === 'flex';
        this._linkrow.style.display = open ? 'none' : 'flex';
        if (!open) setTimeout(() => this._urlin.focus(), 0);
      });
      this._urlin.addEventListener('click', (e) => e.stopPropagation());
      this._urlin.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); this._submitUrl(); }
      });
      root.querySelector('.go').addEventListener('click', (e) => { e.stopPropagation(); this._submitUrl(); });
      root.addEventListener('click', (e) => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'replace') this._input.click();
        if (act === 'clear') {
          this._gen++;
          this._local = null;
          if (this.id) setSlot(this.id, null); else this._render();
        }
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
    }

    connectedCallback() {
      if (!this.id && !VideoSlot._warned) {
        VideoSlot._warned = true;
        console.warn('<video-slot> without an id will not persist its video.');
      }
      this.addEventListener('dragenter', this);
      this.addEventListener('dragover', this);
      this.addEventListener('dragleave', this);
      this.addEventListener('drop', this);
      subs.add(this._subFn);
      load();
      this._render();
    }

    disconnectedCallback() {
      subs.delete(this._subFn);
      this.removeEventListener('dragenter', this);
      this.removeEventListener('dragover', this);
      this.removeEventListener('dragleave', this);
      this.removeEventListener('drop', this);
    }

    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        if (--this._depth <= 0) { this._depth = 0; this.removeAttribute('data-over'); }
      } else if (e.type === 'drop') {
        e.preventDefault();
        e.stopPropagation();
        this._depth = 0;
        this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) { this._ingest(f); return; }
        const t = e.dataTransfer && (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text'));
        if (t) this._embedUrl(t);
      }
    }

    async _ingest(file) {
      this._setError(null);
      const okType = ACCEPT.indexOf(file.type) >= 0 || /^video\//.test(file.type);
      if (!file || !okType) {
        this._setError('Drop an MP4, WebM, or MOV video.');
        return;
      }
      if (file.size > MAX_BYTES) {
        this._setError('Video is over 50MB — trim or compress it first.');
        return;
      }
      const gen = ++this._gen;
      try {
        const url = await fileToDataUrl(file);
        if (gen !== this._gen) return;
        const val = { u: url };
        setSlot(this.id || '', val);
        if (!this.id) { this._local = val; this._render(); }
      } catch (err) {
        if (gen !== this._gen) return;
        this._setError('Could not read that video.');
        console.warn('<video-slot> ingest failed:', err);
      }
    }

    _submitUrl() {
      const v = (this._urlin.value || '').trim();
      if (v) this._embedUrl(v);
    }

    _embedUrl(raw) {
      this._setError(null);
      const emb = toEmbed(raw);
      if (!emb) { this._setError('Paste a YouTube or Vimeo link.'); return; }
      this._gen++;
      const val = { embed: emb };
      setSlot(this.id || '', val);
      if (this._urlin) this._urlin.value = '';
      if (this._linkrow) this._linkrow.style.display = 'none';
      if (!this.id) { this._local = val; this._render(); }
    }

    _setError(msg) {
      if (this._err) { this._err.remove(); this._err = null; }
      if (!msg) return;
      const d = document.createElement('div');
      d.className = 'err'; d.textContent = msg;
      this.shadowRoot.appendChild(d);
      this._err = d;
      setTimeout(() => { if (this._err === d) { d.remove(); this._err = null; } }, 3500);
    }

    _render() {
      const n = parseFloat(this.getAttribute('radius'));
      this.style.setProperty('--r', (Number.isFinite(n) ? n : 0) + 'px');
      this._video.style.objectFit = this.getAttribute('fit') || 'contain';

      const editable = !!(window.omelette && window.omelette.writeFile);
      this.toggleAttribute('data-editable', editable);
      this._subEls.forEach((s) => { s.style.display = editable ? '' : 'none'; });
      if (!editable && this._linkrow) this._linkrow.style.display = 'none';

      const stored = this.id ? getSlot(this.id) : this._local;
      let mode = null, fileUrl = null, embedUrl = null;
      if (stored && stored.embed &&
          /^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(stored.embed)) {
        embedUrl = stored.embed; mode = 'embed';
      } else if (stored && stored.u && /^data:video\//i.test(stored.u)) {
        fileUrl = stored.u; mode = 'file';
      }
      if (!mode) {
        const srcAttr = this.getAttribute('src') || '';
        if (srcAttr) { fileUrl = srcAttr; mode = 'file'; }
      }
      this._cap.textContent = this.getAttribute('placeholder') || 'Drop a video file';

      if (mode === 'embed') {
        if (this._embed.getAttribute('src') !== embedUrl) this._embed.src = embedUrl;
        this._embed.style.display = 'block';
        this._video.style.display = 'none';
        this._video.removeAttribute('src');
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
      } else if (mode === 'file') {
        if (this._video.getAttribute('src') !== fileUrl) this._video.src = fileUrl;
        this._video.style.display = 'block';
        this._embed.style.display = 'none';
        this._embed.removeAttribute('src');
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
      } else {
        this._video.style.display = 'none';
        this._video.removeAttribute('src');
        this._embed.style.display = 'none';
        this._embed.removeAttribute('src');
        this._empty.style.display = 'flex';
        this.removeAttribute('data-filled');
      }
    }
  }

  if (!customElements.get('video-slot')) {
    customElements.define('video-slot', VideoSlot);
  }
})();
