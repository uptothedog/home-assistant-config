/*!
 * wall-card.js - Minimalist wall tablet cards for Home Assistant
 * Design: Midnight (AMOLED black, honey #FFC857, Mona Sans + Spline Sans Mono)
 * Layout: "Editorial stack", 800x1280 portrait artboard. On narrow screens such as
 * the Galaxy Tab A 8 (600x960 CSS px) the portrait pages switch to a compact
 * layout drawn at 1:1 instead of shrinking the big artboard, and they fill the
 * screen height.
 *
 * Defines three cards from one resource file:
 *   custom:wall-card           - home page (clock, weather, tiles, departures)
 *   custom:wall-card-controls  - device list with filters and scenes
 *   custom:wall-card-vacuum    - vacuum status, map, suction, consumables
 *   custom:wall-card-desk      - full-screen desktop page or wallpaper (1:1, mouse)
 *
 * Plain custom elements. No build step, no HACS required.
 */

const WALL_CARD_VERSION = "5.1.15";

const FONT_URL_DEFAULT =
  "https://fonts.googleapis.com/css2?family=Mona+Sans:wght@200..900&family=Spline+Sans+Mono:wght@400;500&display=swap";

const ART_W = 800;
const ART_H = 1280;

/* below this card width the portrait pages use the compact 1:1 layout */
const COMPACT_BELOW = 720;

/* ------------------------------------------------------------------ utils */

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const pick = (obj, path) => {
  if (!obj || !path) return undefined;
  return String(path)
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
};

const domainOf = (entityId) => String(entityId || "").split(".")[0];

const titleCase = (s) =>
  String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/* accent colours arrive as hex, but the design tints backgrounds at 14% */
function rgba(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 3 && h.length !== 6) return hex;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* Take an extracted colour and re-tone it: keep the hue, put a floor and ceiling
   on saturation, and pin the lightness. Simply darkening the source instead makes
   a dark album cover produce a tint indistinguishable from the plain tile, and a
   bright one produce a tint that wrecks the text contrast. Pinning gives every
   cover the same readable weight. */
function toneFrom(c, light) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let sat = 0;
  if (d) {
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const s = d ? Math.min(0.6, Math.max(0.32, sat)) : 0;
  const hue = (t) => {
    let x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const q = light < 0.5 ? light * (1 + s) : light + s - light * s;
    const p = 2 * light - q;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const out = s === 0
    ? [light, light, light]
    : [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
  return `rgb(${out.map((v) => Math.round(v * 255)).join(",")})`;
}

/* "#1a1814" -> "26,24,20", so CSS can mix tones with rgba(var(--wc-ink), .5) */
function rgbTriplet(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return "244,244,242";
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function ensureFonts(url) {
  if (!url || url === "none") return;
  const id = "wall-card-fonts";
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.getAttribute("href") !== url) existing.setAttribute("href", url);
    return;
  }
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
}

/* Is this browser a kiosk device, rather than the machine you edit from?
 *   true / "always"  hide everywhere
 *   "fully"          only inside Fully Kiosk
 *   "kiosk"          only when the URL carries ?kiosk
 *   "auto"           either of the above two
 *   false            never
 * Dashboard edit mode always wins, so the header can never lock you out. */
function shouldHideHeader(mode) {
  if (!mode) return false;
  if (/[?&]edit=1\b/.test(window.location.search)) return false;
  const inFully = typeof window.fully !== "undefined";
  /* remember ?kiosk for this browser session, so it still counts after Home
     Assistant redirects to a URL without it (e.g. dashboard -> its first view) */
  let marked = /[?&]kiosk\b/.test(window.location.search);
  try {
    if (marked) sessionStorage.setItem("wall-card-kiosk", "1");
    else marked = sessionStorage.getItem("wall-card-kiosk") === "1";
  } catch (e) { /* storage blocked */ }
  const m = String(mode);
  if (mode === true || m === "true" || m === "always") return true;
  if (m === "fully") return inFully;
  if (m === "kiosk") return marked;
  if (m === "auto") return inFully || marked;
  return false;
}

/* Walks the Lovelace shadow tree and shows or hides the app header. Best effort. */
function setHaHeaderHidden(hide) {
  try {
    const main = document
      .querySelector("home-assistant")
      ?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot;
    const panel =
      main?.querySelector("ha-panel-lovelace") ||
      main?.querySelector("partial-panel-resolver")?.querySelector("ha-panel-lovelace");
    const root = panel?.shadowRoot?.querySelector("hui-root")?.shadowRoot;
    if (!root) return false;
    const existing = root.getElementById("wall-card-kiosk");
    if (hide && !existing) {
      const style = document.createElement("style");
      style.id = "wall-card-kiosk";
      style.textContent =
        ":host { --header-height: 0px !important; }" +
        ".header, app-header, ha-app-layout > app-header { display: none !important; }" +
        "#view, hui-view, .view { padding-top: 0 !important; min-height: 100vh !important; }";
      root.appendChild(style);
    } else if (!hide && existing) {
      existing.remove();
    }
    return true;
  } catch (e) {
    return false;
  }
}

/* Hides the sidebar (and the space it takes) for kiosk screens. Only changes
   how this browser shows the page; nothing is saved to the user's profile. */
function setHaSidebarHidden(hide) {
  try {
    const main = document
      .querySelector("home-assistant")
      ?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot;
    if (!main) return false;
    const put = (root, id, css) => {
      if (!root) return;
      const existing = root.getElementById ? root.getElementById(id) : root.querySelector("#" + id);
      if (hide && !existing) {
        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
        root.appendChild(style);
      } else if (!hide && existing) {
        existing.remove();
      }
    };
    put(main, "wall-card-kiosk-sidebar",
      ":host { --mdc-drawer-width: 0px !important; }" +
      "ha-sidebar { display: none !important; }" +
      "ha-drawer { --mdc-drawer-width: 0px !important; }");
    /* the drawer reserves its own width for the page next to it, and draws a
       hairline on its edge; take both away inside the drawer itself */
    put(main.querySelector("ha-drawer")?.shadowRoot, "wall-card-kiosk-drawer",
      ".mdc-drawer, aside { display: none !important; }" +
      ".mdc-drawer-app-content { margin-left: 0 !important; margin-right: 0 !important;" +
      " padding-left: 0 !important; padding-right: 0 !important; width: 100% !important; }");
    return true;
  } catch (e) {
    return false;
  }
}

/* Keep the marker query string across page switches, or a kiosk tablet would
   grow its header back the moment you tapped a tab. */
function navigateTo(path) {
  const search = window.location.search;
  const url = search && path.indexOf("?") === -1 ? path + search : path;
  history.pushState(null, "", url);
  window.dispatchEvent(
    new CustomEvent("location-changed", {
      bubbles: true,
      composed: true,
      detail: { replace: false },
    })
  );
}

/* ------------------------------------------------------------ icon defaults */

const DOMAIN_ICON = {
  light: "mdi:lightbulb",
  switch: "mdi:power-plug",
  fan: "mdi:fan",
  climate: "mdi:thermostat",
  cover: "mdi:window-shutter",
  lock: "mdi:lock",
  media_player: "mdi:television",
  sensor: "mdi:gauge",
  binary_sensor: "mdi:radiobox-blank",
  vacuum: "mdi:robot-vacuum",
  scene: "mdi:palette",
  script: "mdi:script-text",
  button: "mdi:gesture-tap-button",
  input_boolean: "mdi:toggle-switch",
  automation: "mdi:robot",
  humidifier: "mdi:air-humidifier",
  water_heater: "mdi:water-boiler",
  camera: "mdi:cctv",
};

/* which filter chip an entity falls under */
const DOMAIN_CATEGORY = {
  light: "Lights",
  climate: "Climate",
  humidifier: "Climate",
  water_heater: "Climate",
  fan: "Climate",
  cover: "Covers",
  media_player: "Media",
  lock: "Security",
  alarm_control_panel: "Security",
  camera: "Security",
  binary_sensor: "Security",
  sensor: "Sensor",
  switch: "Appliances",
  input_boolean: "Appliances",
  scene: "Scenes",
  script: "Scenes",
  button: "Scenes",
  automation: "Scenes",
  vacuum: "Appliances",
};

const CATEGORY_ORDER = [
  "All", "Lights", "Climate", "Covers", "Media", "Security", "Appliances", "Sensor", "Scenes",
];

/* -------------------------------------------------------------- weather map */

const COND_ICON = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

const COND_ICON_NIGHT = {
  sunny: "mdi:weather-night",
  partlycloudy: "mdi:weather-night-partly-cloudy",
};

const COND_LABEL = {
  "clear-night": "Clear",
  cloudy: "Cloudy",
  exceptional: "Exceptional",
  fog: "Fog",
  hail: "Hail",
  lightning: "Lightning",
  "lightning-rainy": "Thunder showers",
  partlycloudy: "Partly cloudy",
  pouring: "Pouring",
  rainy: "Rainy",
  snowy: "Snow",
  "snowy-rainy": "Sleet",
  sunny: "Sunny",
  windy: "Windy",
  "windy-variant": "Windy",
};

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

/* ---------------------------------------------------------------- shared css */

const SHARED_CSS = `
:host {
  /* Midnight tokens */
  --wc-sans: "Mona Sans", "Roboto", system-ui, sans-serif;
  --wc-mono: "Spline Sans Mono", ui-monospace, Menlo, monospace;
  --wc-ink: 244,244,242;
  --wc-surface: #0C0C0C;
  --wc-raised: #161616;
  --wc-on-accent: #000;
  --wc-danger: #FF6B57;
  display: block;
  width: 100%;
  height: 100%;
  background: var(--wc-bg, #000);
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
.stage {
  position: relative;
  width: 100%;
  background: var(--wc-bg, #000);
  overflow: hidden;
}
:host(.wc-snap), :host(.wc-snap) .stage { overflow: visible; }
/* The artboard is laid out at its own size and then scaled into the stage. On
   the compact layout the scale is exactly 1, so text is drawn crisp and the
   browser never has to resample a big layer. No will-change here: on a cheap
   tablet that keeps a full-screen texture alive for nothing. */
.artboard {
  position: absolute;
  left: 0;
  top: 0;
  width: ${ART_W}px;
  height: ${ART_H}px;
  overflow: hidden;
  background: var(--wc-bg, #000);
  transform-origin: 0 0;
}
.pad {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  font-family: var(--wc-sans);
  color: var(--wc-fg, #F4F4F2);
  -webkit-font-smoothing: antialiased;
}
.hidden { display: none !important; }
.tap { cursor: pointer; }
.rule { height: 1px; background: var(--wc-line, rgba(var(--wc-ink),.12)); }

/* the eyebrow line shared by every page */
.eyebrow {
  font: 500 15px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.55);
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--wc-accent); flex: none; }

/* bottom page switcher */
.nav {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
  font: 400 13px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase;
}
.nav-item {
  padding: 14px 0; text-align: center; border-radius: 999px;
  border: 1px solid rgba(var(--wc-ink),.14);
  color: rgba(var(--wc-ink),.55);
  cursor: pointer; user-select: none;
  text-decoration: none;
}
.nav-item.active {
  border-color: var(--wc-accent);
  background: var(--wc-accent-dim, var(--wc-accent-soft));
  color: var(--wc-accent);
  cursor: default;
}
.nav-item.disabled { opacity: .38; cursor: default; }
/* the tab you just touched: solid honey, no transition, so it shows on the
   very next frame */
.nav-item.pressed {
  border-color: var(--wc-accent);
  background: var(--wc-accent);
  color: var(--wc-on-accent);
  transition: none;
}

/* long press to switch off: sink a little while held (GPU transform only) */
.lp { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; transition: transform .15s ease-out; }
.lp.lp-hold { transform: scale(.965); transition: transform .55s cubic-bezier(.2,.6,.3,1); }

/* hide scrollbars but keep scrolling */
.noscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.noscroll::-webkit-scrollbar { width: 0; height: 0; }

/* sticky tab bar, shared by the fluid phone layouts */
.wc-foot {
  position: sticky; bottom: 0;
  padding: 12px 20px 26px; background: var(--wc-bg, #000);
  border-top: 1px solid rgba(var(--wc-ink),.09);
}
.wc-foot .nav { gap: 8px; font-size: 11px; letter-spacing: .06em; }
.wc-foot .nav-item { padding: 12px 0; }
.no-nav .wc-foot { display: none; }
.no-nav .p-body, .no-nav .cbody { padding-bottom: 32px; }

/* ---- compact portrait layout (e.g. Galaxy Tab A 8, 600x960) ---- */
.compact .eyebrow { font-size: 13px; }
.compact .dot { width: 6px; height: 6px; }
.compact .nav { gap: 8px; font-size: 12px; }
.compact .nav-item { padding: 0; height: 44px; display: flex; align-items: center; justify-content: center; }
`;

/* =========================================================== shared base class */

class WallBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
    this._shift = 0;
  }

  /* subclasses override */
  get _defaults() { return {}; }
  _template() { return ""; }
  _collect() {}
  _update() {}
  get _tickMs() { return 10000; }

  setConfig(config) {
    if (!config) throw new Error("wall-card: missing configuration");
    this._config = Object.assign(
      {
        accent: "#FFC857",
        background: "#000",
        foreground: "#F4F4F2",
        time_format: "24",
        font_url: FONT_URL_DEFAULT,
        hide_header: false,
        burn_in_protection: false,
        layout: "auto",
        height: "fit",
        bottom_gap: 0,
      },
      typeof this._defaultsFor === "function" ? this._defaultsFor(config) : this._defaults,
      config
    );
    this._fitSig = "";
    this._propSig = "";
    this._snapTrim = 0;
    ensureFonts(this._config.font_url);
    this._built = false;
    this._onConfig?.();
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    this._restartTick();
    this._startKiosk();
    if (this._hass) this._render();
  }

  getCardSize() { return 24; }

  /* hide_header / hide_sidebar. Started from both setConfig and connect, so it
     works whichever Home Assistant does first, and follows config edits. */
  _startKiosk() {
    clearInterval(this._hdr);
    this._hdr = null;
    const c = this._config;
    if (!this.isConnected || !c || !(c.hide_header || c.hide_sidebar)) return;
    const apply = () => {
      setHaHeaderHidden(!!c.hide_header && shouldHideHeader(c.hide_header));
      setHaSidebarHidden(!!c.hide_sidebar && shouldHideHeader(c.hide_sidebar));
    };
    apply();
    this._hdr = setInterval(apply, 1000);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._onFirstHass?.();
    this._render();
  }

  get hass() { return this._hass; }

  connectedCallback() {
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this);
    this._onWinResize = () => this._fit();
    window.addEventListener("resize", this._onWinResize);
    this._restartTick();
    /* re-evaluated on a timer so entering edit mode brings the header straight
       back, and leaving it hides the header again without a reload */
    this._startKiosk();
    if (this._config?.burn_in_protection) {
      /* the shift step comes from the clock, not a per-card counter, so every
         page is offset by exactly the same amount and switching pages never
         makes the tabs jump */
      this._burn = setInterval(() => this._fit(), 30 * 1000);
    }
    this._onConnect?.();
    this._navGoing = false;
    this._resetNav();
    this._scheduleFit();
  }

  /* Home Assistant finishes laying out the view (header, sidebar, kiosk mode)
     after the first paint, so measure again a few times. */
  _scheduleFit() {
    requestAnimationFrame(() => this._fit());
    [250, 1000, 3000].forEach((t) => setTimeout(() => this._fit(), t));
  }

  disconnectedCallback() {
    this._ro?.disconnect();
    clearInterval(this._tick);
    clearInterval(this._hdr);
    /* leaving the page: give the header and sidebar back to other dashboards */
    if (this._hdr) {
      setHaHeaderHidden(false);
      setHaSidebarHidden(false);
    }
    this._hdr = null;
    clearInterval(this._burn);
    window.removeEventListener("resize", this._onWinResize);
    this._onDisconnect?.();
  }

  _restartTick() {
    clearInterval(this._tick);
    if (!this.isConnected) return;
    this._tick = setInterval(() => this._render(), this._tickMs);
  }

  /* Fixed-artboard cards scale to fit. Fluid cards (the phone page) lay out
     naturally instead, because a phone viewport is not a known size. */
  get _fluid() { return false; }

  _build() {
    const css = `<style>${SHARED_CSS}${this.constructor.CSS || ""}</style>`;
    if (this._fluid) {
      this.shadowRoot.innerHTML = css + this._template();
      this._el = { nav: this.shadowRoot.querySelector(".nav") };
    } else {
      const [aw, ah] = this._artSize;
      this.shadowRoot.innerHTML =
        css + `<div class="stage" style="height:${ah}px"><div class="artboard" style="width:${aw}px;height:${ah}px">` +
        `${this._template()}</div></div>`;
      this._el = {
        stage: this.shadowRoot.querySelector(".stage"),
        art: this.shadowRoot.querySelector(".artboard"),
        nav: this.shadowRoot.querySelector(".nav"),
      };
    }
    this._collect();
    this._buildNav();
    this._built = true;
    this._fitSig = "";
    this._scheduleFit();
  }

  _q(sel) { return this.shadowRoot.querySelector(sel); }

  get _artSize() { return [ART_W, ART_H]; }

  /* Portrait pages that have a compact layout and can stretch to the screen height */
  get _canCompact() { return false; }

  /* Height the card should take. Default "fit": from where the card starts to
     the bottom of the screen, so it works with or without the HA header and
     kiosk mode. A number (px) fixes it; "auto" keeps the artboard's own ratio. */
  _targetHeight(rect) {
    const c = this._config || {};
    const mode = c.height == null ? "fit" : c.height;
    if (mode === "auto") return null;
    const fixed = num(mode);
    if (fixed != null && fixed > 0) return fixed;
    const top = Math.max(0, rect.top + (window.scrollY || 0));
    const gap = num(c.bottom_gap) || 0;
    return Math.max(320, Math.floor(window.innerHeight - top - gap));
  }

  _fit() {
    if (this._fluid || !this._el || !this._el.art) return;
    const [baseW, baseH] = this._artSize;
    const rect = this.getBoundingClientRect();
    let w = rect.width || this.clientWidth;
    if (!w || w < 50) w = window.innerWidth;
    w = Math.floor(w);
    let h = this._targetHeight(rect);

    const c = this._config || {};

    /* Snap to the screen. Dashboard views put a few pixels of padding around
       cards, and panel, masonry and sections views each use a different amount,
       so the same card lands a few pixels apart from page to page and the tabs
       jump when you switch. When the card already (almost) fills the screen,
       draw it from the screen's own top-left corner instead, so every page
       lines up exactly whatever view it sits in. `snap_to_screen: false` opts out. */
    const pageTop = rect.top + (window.scrollY || 0);
    const snapGap = 24;
    const snap = c.snap_to_screen !== false && h != null &&
      (c.height == null || c.height === "fit") &&
      rect.left >= 0 && rect.left <= snapGap && pageTop >= 0 && pageTop <= snapGap &&
      Math.abs(window.innerWidth - rect.right) <= snapGap;
    let offX = 0;
    let offY = 0;
    if (snap) {
      offX = -Math.round(rect.left);
      offY = -Math.round(pageTop);
      w = window.innerWidth;
      h = Math.max(320, window.innerHeight - (num(c.bottom_gap) || 0));
    }
    const mode = String(c.layout || "auto");
    const compact = this._canCompact &&
      (mode === "compact" || (mode !== "tablet" && w < COMPACT_BELOW));

    let aw;
    let ah;
    let scale;
    if (compact) {
      /* draw at 1:1 on the real screen size */
      aw = w;
      ah = Math.max(560, h || Math.round((w * baseH) / baseW));
      scale = 1;
    } else if (this._canCompact && h) {
      /* the big artboard, stretched to the screen's proportions so it fills
         the height instead of leaving bands; flex spacers absorb the change */
      scale = w / baseW;
      aw = baseW;
      ah = Math.round(Math.min(baseH * 1.3, Math.max(baseH * 0.8, h / scale)));
      scale = Math.min(scale, h / ah);
    } else {
      aw = baseW;
      ah = baseH;
      scale = h ? Math.min(w / aw, h / ah) : w / aw;
    }

    let dx = 0;
    let dy = 0;
    /* burn-in nudge moves the content inside the artboard, never the artboard
       itself, so it can't push past the screen edge and make the page scroll */
    let bx = 0;
    let by = 0;
    if (c.burn_in_protection) {
      this._shift = Math.floor(Date.now() / (5 * 60 * 1000)) % 8;
      bx = (this._shift % 4) * 2 - 3;
      by = Math.floor(this._shift / 4) * 4 - 2;
    }
    /* centre horizontally when the artboard is narrower than the card */
    dx += Math.max(0, Math.round((w - aw * scale) / 2));
    dx += offX;
    dy += offY;
    /* the stage keeps the card's own box; a snapped artboard reaches past it */
    /* when snapped, also give back any padding the view adds below the card,
       so the page never becomes a few pixels taller than the screen (which
       would let a swipe scroll everything by that much) */
    const trim = snap ? (this._snapTrim || 0) : 0;
    const stageH = Math.max(0, Math.round(ah * scale) + offY - trim);

    const sig = [aw, ah, scale, dx, dy, bx, by, stageH, compact, snap].join("|");
    if (sig === this._fitSig) return;
    this._fitSig = sig;
    const art = this._el.art;
    art.style.width = aw + "px";
    art.style.height = ah + "px";
    art.style.transform = scale === 1 && !dx && !dy
      ? "none"
      : `translate(${dx}px,${dy}px) scale(${scale})`;
    const inner = art.firstElementChild;
    if (inner) inner.style.transform = bx || by ? `translate(${bx}px,${by}px)` : "";
    art.classList.toggle("compact", compact);
    art.classList.toggle("short", compact && ah < 900);
    this._el.stage.style.height = stageH + "px";
    this.classList.toggle("wc-snap", snap);
    if (snap) {
      requestAnimationFrame(() => {
        const doc = document.scrollingElement || document.documentElement;
        const over = Math.round(doc.scrollHeight - window.innerHeight);
        if (over > 0 && over <= 64) {
          this._snapTrim = (this._snapTrim || 0) + over;
          this._fitSig = "";
          this._fit();
        }
      });
    }
    this._onFit?.(compact);
  }

  /* ---- page switcher ---- */

  /* Instant feedback for the tabs. A cheap tablet can take a moment to build
     the next page, so the tab lights up on the first touch (pointerdown, which
     arrives before the browser's own click handling), and the switch starts on
     release instead of waiting for the click event. The switch itself is
     started one frame later so the highlight is on screen before Home
     Assistant gets busy. */
  _wireNavItem(el, path) {
    el.style.touchAction = "manipulation";
    const press = () => {
      const nav = this._el.nav;
      nav.querySelectorAll(".nav-item.active").forEach((a) => {
        a.classList.remove("active");
        a.classList.add("was-active");
      });
      nav.querySelectorAll(".nav-item.pressed").forEach((a) => a.classList.remove("pressed"));
      el.classList.add("pressed");
    };
    const go = () => {
      if (this._navGoing) return;
      this._navGoing = true;
      requestAnimationFrame(() => setTimeout(() => {
        this._navGoing = false;
        navigateTo(path);
      }, 0));
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", () => {
      if (el.classList.contains("pressed")) { this._navUpAt = Date.now(); go(); }
    });
    /* a finger that slides off the tab cancels, like a normal button */
    el.addEventListener("pointercancel", () => this._resetNav());
    el.addEventListener("pointerleave", (ev) => {
      if (ev.pointerType !== "mouse" || ev.buttons) this._resetNav();
    });
    /* keyboard and anything that doesn't send pointer events */
    el.addEventListener("click", () => {
      if (this._navGoing || Date.now() - (this._navUpAt || 0) < 800) return;
      press();
      go();
    });
  }

  /* back from another page: show this page's own tab again */
  _resetNav() {
    const nav = this._el?.nav;
    if (!nav) return;
    nav.querySelectorAll(".nav-item.pressed").forEach((a) => a.classList.remove("pressed"));
    nav.querySelectorAll(".nav-item.was-active").forEach((a) => {
      a.classList.remove("was-active");
      a.classList.add("active");
    });
  }

  _buildNav() {
    const nav = this._el.nav;
    if (!nav) return;
    const items = this._config.nav;
    if (!Array.isArray(items) || !items.length) {
      nav.classList.add("hidden");
      return;
    }
    nav.classList.remove("hidden");
    nav.textContent = "";
    nav.style.gridTemplateColumns = `repeat(${items.length}, minmax(0, 1fr))`;
    const here = window.location.pathname.toLowerCase();
    const panels = this._hass?.panels;
    const unknown = [];

    items.forEach((item) => {
      const el = document.createElement("span");
      el.className = "nav-item";
      el.textContent = item.label || "";
      const path = item.path;
      const slug = path ? String(path).replace(/^\//, "").split("/")[0] : "";
      /* Home Assistant silently redirects an unknown dashboard to the default
         one, which looks like the card misbehaving. Dim the tab instead. */
      const knownSlug = !panels || !slug || Object.prototype.hasOwnProperty.call(panels, slug);

      if (!path) {
        el.classList.add("disabled");
      } else if (!knownSlug) {
        el.classList.add("disabled");
        el.title = `No dashboard at "/${slug}"`;
        unknown.push(path);
      } else if (path.toLowerCase() === here || here.endsWith(path.toLowerCase())) {
        el.classList.add("active");
      } else {
        this._wireNavItem(el, path);
      }
      nav.appendChild(el);
    });

    if (unknown.length && panels) {
      console.warn(
        "wall-card: no dashboard matches " + unknown.join(", ") +
        ". Dashboard URLs on this system: " + Object.keys(panels).sort().join(", ")
      );
    }
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._built) this._build();
    const c = this._config;
    /* hass updates arrive many times a second; only touch styles when the
       config actually changed, and leave measuring to resize events */
    const propSig = [c.accent, c.background, c.foreground, c.line_color].join("|");
    if (propSig !== this._propSig) {
      this._propSig = propSig;
      this.style.setProperty("--wc-accent", c.accent);
      this.style.setProperty("--wc-accent-soft", rgba(c.accent, 0.14));
      this.style.setProperty("--wc-accent-fill", rgba(c.accent, 0.34));
      this.style.setProperty("--wc-bg", c.background);
      this.style.setProperty("--wc-line", c.line_color || "rgba(var(--wc-ink),.12)");
      this.style.setProperty("--wc-fg", c.foreground);
      this.style.setProperty("--wc-ink", rgbTriplet(c.foreground));
    }
    this._update();
    if (!this._fitSig) this._fit();
  }

  /* ---- long press: turn a device off ---- */

  /* Is there something to switch off? Only for things where "off" is safe and
     obvious: never locks, alarms or covers. */
  _isActive(st) {
    if (!st) return false;
    const d = domainOf(st.entity_id);
    const s = st.state;
    if (s === "unavailable" || s === "unknown") return false;
    switch (d) {
      case "climate":
      case "water_heater":
      case "humidifier":
        return s !== "off";
      case "media_player":
        return s === "playing" || (this._mpCanOff(st) && !["off", "standby", "idle"].includes(s));
      case "vacuum":
        return s === "cleaning" || s === "paused";
      case "light":
      case "switch":
      case "fan":
      case "input_boolean":
      case "siren":
        return s === "on";
      default:
        return false;
    }
  }

  _mpCanOff(st) {
    return ((num(st?.attributes?.supported_features) || 0) & 256) !== 0;
  }

  _turnOff(st) {
    const id = st.entity_id;
    switch (domainOf(id)) {
      case "climate":
        return this._call("climate", "set_hvac_mode", { entity_id: id, hvac_mode: "off" });
      case "media_player":
        /* speakers like Sonos have no power switch, so "off" means pause */
        return this._mpCanOff(st)
          ? this._call("media_player", "turn_off", { entity_id: id })
          : this._call("media_player", "media_pause", { entity_id: id });
      case "vacuum":
        return this._call("vacuum", "return_to_base", { entity_id: id });
      default:
        return this._call("homeassistant", "turn_off", { entity_id: id });
    }
  }

  /* Hold a tile or row (~0.55 s) to switch its device off. The tile sinks a
     little while held (a GPU transform), the phone buzzes when it fires, and
     the tap that would normally follow is swallowed so nothing else opens.
     If the device is already off, a hold is just a normal tap. */
  _wireLongOff(node, getEntity, ignore) {
    if (!node || node.__wcLong || this._config?.long_press === false) return;
    node.__wcLong = true;
    node.classList.add("lp");
    let timer = null;
    let fired = false;
    let sx = 0;
    let sy = 0;
    const clear = () => {
      clearTimeout(timer);
      timer = null;
      node.classList.remove("lp-hold");
    };
    node.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0) return;
      fired = false;
      clear();
      if (ignore && ev.target.closest && ev.target.closest(ignore)) return;
      const id = getEntity();
      const st = id ? this._hass?.states?.[id] : null;
      if (!this._isActive(st)) return;
      sx = ev.clientX;
      sy = ev.clientY;
      node.classList.add("lp-hold");
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        node.classList.remove("lp-hold");
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { /* noop */ }
        const now = this._hass?.states?.[id];
        if (now && this._isActive(now)) this._turnOff(now);
      }, num(this._config?.long_press_ms) || 550);
    });
    node.addEventListener("pointermove", (ev) => {
      if (timer && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) clear();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => node.addEventListener(t, clear));
    /* capture phase on the tile, so its buttons never see the click */
    node.addEventListener("click", (ev) => {
      if (!fired) return;
      fired = false;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }, true);
    node.addEventListener("contextmenu", (ev) => { if (fired || timer) ev.preventDefault(); });
  }

  /* ---- music: previous / next with the Midnight Music Card's favorite skip ----
   * Same behaviour and options as midnight-music-card:
   *   skip_sources (true), skip_same_type (true), skip_sources_exclude,
   *   skip_sources_delay (2500 ms), broken_source_minutes (60), sources.
   * Sonos favorites that are single songs have a one-item queue, so the player
   * ignores next/previous; then we step to the neighbouring favorite instead.
   * The last chosen favorite is shared with the music card (same storage key). */

  _mmSourceList(obj) {
    const list = obj.attributes?.source_list || [];
    const cfg = Array.isArray(this._config.sources) ? this._config.sources : null;
    if (!cfg) return list.slice();
    return cfg
      .map((x) => (typeof x === "string" ? x : x && x.source))
      .filter((x) => x && (!list.length || list.includes(x)));
  }

  _mmKinds(entity) {
    return this._favKinds && this._favKinds[entity] && this._favKinds[entity].map;
  }

  _mmSkipList(obj) {
    const ex = (this._config.skip_sources_exclude || ["TV", "Line-in", "Line in"]).map((x) => String(x).toLowerCase());
    const base = this._mmSourceList(obj).filter((x) => !ex.includes(String(x).toLowerCase()));
    if (this._config.skip_same_type === false) return base;
    const kinds = this._mmKinds(obj.entity_id);
    if (!kinds) return base;
    const cur = this._mmCurrentSource(obj, base);
    const kind = cur && kinds[cur];
    return kind ? base.filter((x) => kinds[x] === kind) : base;
  }

  async _mmLoadKinds(entity) {
    const hass = this._hass;
    if (!hass || !hass.callWS || this._config.skip_sources === false || this._config.skip_same_type === false) return;
    this._favKinds = this._favKinds || {};
    const prev = this._favKinds[entity];
    if (prev && (prev.loading || Date.now() - prev.at < 15 * 60 * 1000)) return;
    this._favKinds[entity] = { at: Date.now(), loading: true, map: prev && prev.map };
    const kindOf = (id) => {
      id = String(id || "");
      if (/musicTrack|audioItem\.(?!audioBroadcast)/i.test(id)) return "track";
      if (/audioBroadcast|radio/i.test(id)) return "radio";
      return "list";
    };
    try {
      const browse = (type, id) => hass.callWS({
        type: "media_player/browse_media", entity_id: entity, media_content_type: type, media_content_id: id,
      });
      const root = await browse("favorites", "");
      const map = {};
      for (const node of root.children || []) {
        if (node.can_expand && node.media_content_type === "favorites_folder") {
          const kind = kindOf(node.media_content_id);
          const folder = node.children && node.children.length ? node : await browse(node.media_content_type, node.media_content_id);
          for (const it of folder.children || []) map[it.title] = kind;
        } else if (node.title) {
          map[node.title] = node.can_expand ? "list" : node.media_class === "track" ? "track" : kindOf(node.media_content_id);
        }
      }
      this._favKinds[entity] = { at: Date.now(), map: Object.keys(map).length ? map : null };
    } catch (e) {
      this._favKinds[entity] = { at: Date.now(), map: prev && prev.map };
    }
  }

  _mmCurrentSource(obj, list, useMemory = true) {
    if (!obj) return null;
    const a = obj.attributes || {};
    list = list || this._mmSourceList(obj);
    if (a.source && list.includes(a.source)) return a.source;
    const norm = (x) => String(x ?? "").trim().toLowerCase();
    const kinds = this._mmKinds(obj.entity_id);
    const last = this._mmLastSelected(obj.entity_id);
    const qs = num(a.queue_size);
    for (const cand of [a.media_title, a.media_channel, a.media_playlist, a.media_album_name]) {
      if (!cand) continue;
      const hit = list.find((x) => norm(x) === norm(cand));
      if (!hit) continue;
      /* A song that is also saved as its own favorite can come up while a
         playlist plays. If a playlist was picked last and the queue holds more
         than this one song, it is still that playlist playing. */
      if (cand === a.media_title && kinds && kinds[hit] === "track" && qs !== 1) {
        if (last && last !== hit && list.includes(last) && kinds[last] === "list") return useMemory ? last : null;
        if (qs != null && qs > 1) continue;
      }
      return hit;
    }
    if (!useMemory) return null;
    return last && list.includes(last) ? last : null;
  }

  _mmLastSelected(entity) {
    if (this._lastSel && this._lastSel[entity]) return this._lastSel[entity];
    try { return localStorage.getItem("mmc-last-source:" + entity); } catch (e) { return null; }
  }

  _mmRemember(entity, src) {
    this._lastSel = this._lastSel || {};
    this._lastSel[entity] = src;
    try { localStorage.setItem("mmc-last-source:" + entity, src); } catch (e) { /* ignore */ }
  }

  _mmCanSkipSource(obj) {
    if (!obj || this._config.skip_sources === false) return false;
    const list = this._mmSkipList(obj);
    const cur = this._mmCurrentSource(obj, list);
    const kinds = this._mmKinds(obj.entity_id);
    if (kinds && cur && kinds[cur] === "list") return false;
    return list.length > 1 && list.includes(cur);
  }

  _mmPick(obj, list, start, dir) {
    if (!obj.attributes?.shuffle) return list[(list.indexOf(start) + dir + list.length) % list.length];
    const e = obj.entity_id;
    this._shuf = this._shuf || {};
    const st = this._shuf[e] || (this._shuf[e] = { hist: [], played: new Set() });
    if (dir < 0) {
      while (st.hist.length) {
        const back = st.hist.pop();
        if (back !== start && list.includes(back)) return back;
      }
    }
    st.played.add(start);
    let pool = list.filter((x) => x !== start && !st.played.has(x));
    if (!pool.length) { st.played = new Set([start]); pool = list.filter((x) => x !== start); }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (dir > 0) { st.hist.push(start); if (st.hist.length > 50) st.hist.shift(); }
    st.played.add(pick);
    return pick;
  }

  _mmSelectAdjacent(obj, dir, from = null, tries = 0) {
    this._broken = this._broken || {};
    const now = Date.now();
    const entity = obj.entity_id;
    const list = this._mmSkipList(obj).filter((x) => !(this._broken[x] > now) || x === from);
    const start = from || this._mmCurrentSource(obj, list);
    if (list.indexOf(start) < 0 || list.length < 2 || tries >= list.length - 1) return;
    const src = this._mmPick(obj, list, start, dir);
    if (!src || src === start) return;
    this._mmRemember(entity, src);
    const hass = this._hass;
    const call = hass.callWS
      ? hass.callWS({ type: "call_service", domain: "media_player", service: "select_source",
          service_data: { source: src }, target: { entity_id: entity } })
      : Promise.resolve(hass.callService("media_player", "select_source", { entity_id: entity, source: src }));
    call.catch((err) => {
      console.warn("wall-card: favorite failed, skipping it:", src, err && err.message);
      this._broken[src] = Date.now() + Number(this._config.broken_source_minutes ?? 60) * 60000;
      this._mmSelectAdjacent(this._hass.states[entity] || obj, dir, src, tries + 1);
    });
  }

  _mmSkip(entity, dir) {
    const o = entity ? this._hass?.states?.[entity] : null;
    if (!o) return;
    const f = num(o.attributes?.supported_features) || 0;
    const supported = dir > 0 ? f & 32 : f & 16;
    const fallback = this._mmCanSkipSource(o);
    if (!supported) { if (fallback) this._mmSelectAdjacent(o, dir); return; }
    const kinds = this._mmKinds(entity);
    const sure = kinds && this._mmCurrentSource(o, null, false);
    if (fallback && sure && (kinds[sure] === "track" || kinds[sure] === "radio")) {
      this._mmSelectAdjacent(o, dir);
      return;
    }
    const key = (x) => [x?.attributes?.media_content_id, x?.attributes?.media_title, x?.attributes?.media_artist].join("|");
    const before = key(o);
    let done = false;
    const check = () => {
      if (done) return;
      done = true;
      const now = this._hass?.states?.[entity];
      if (!now || key(now) !== before) return;
      if (this._mmCanSkipSource(now) && this._mmCurrentSource(now) === this._mmCurrentSource(o)) this._mmSelectAdjacent(now, dir);
    };
    const svc = dir > 0 ? "media_next_track" : "media_previous_track";
    const hass = this._hass;
    const call = hass.callWS
      ? hass.callWS({ type: "call_service", domain: "media_player", service: svc, target: { entity_id: entity } })
      : Promise.resolve(hass.callService("media_player", svc, { entity_id: entity }));
    call.catch(() => { if (fallback) check(); });
    if (fallback) setTimeout(check, Number(this._config.skip_sources_delay ?? 2500));
  }

  /* While Sonos switches favorites it briefly reports no track. Keep showing
     the previous one for hold_media_seconds (8) instead of flashing empty. */
  _mmHold(obj) {
    const a = obj.attributes || {};
    const hold = Number(this._config.hold_media_seconds ?? 8) * 1000;
    if (a.media_title || a.media_artist) {
      this._held = { entity: obj.entity_id, state: obj.state, attrs: a };
      this._missingSince = null;
      return obj;
    }
    const h = this._held;
    if (!hold || !h || h.entity !== obj.entity_id || ["off", "standby", "unavailable"].includes(obj.state)) return obj;
    if (!this._missingSince) this._missingSince = Date.now();
    const left = hold - (Date.now() - this._missingSince);
    if (left <= 0) return obj;
    clearTimeout(this._holdT);
    this._holdT = setTimeout(() => this._render(), left + 50);
    const attrs = { ...a };
    ["media_title", "media_artist", "media_album_name", "media_channel", "entity_picture", "media_content_id"]
      .forEach((k) => { if (h.attrs[k] != null) attrs[k] = h.attrs[k]; });
    return {
      ...obj,
      state: ["idle", "unknown", "on", "buffering"].includes(obj.state) ? h.state : obj.state,
      attributes: attrs,
    };
  }

  /* ---- shared helpers ---- */

  _locale() {
    return this._hass?.locale?.language || navigator.language || "en";
  }

  _fmtTime(date) {
    return new Intl.DateTimeFormat(this._locale(), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: String(this._config.time_format) === "12",
    }).format(date);
  }

  _stateLabel(stateObj, fallback) {
    if (!stateObj) return fallback ?? "--";
    if (this._hass?.formatEntityState) {
      try {
        const s = this._hass.formatEntityState(stateObj);
        if (s) return s;
      } catch (e) { /* fall through */ }
    }
    return titleCase(stateObj.state);
  }

  _iconFor(stateObj, entityId, override) {
    if (override) return override;
    if (stateObj?.attributes?.icon) return stateObj.attributes.icon;
    return DOMAIN_ICON[domainOf(entityId || stateObj?.entity_id)] || "mdi:help-circle-outline";
  }

  _call(domain, service, data) {
    try {
      this._hass.callService(domain, service, data);
    } catch (e) {
      console.error("wall-card: service call failed", domain, service, e);
    }
  }

  _moreInfo(entityId) {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      })
    );
  }

  _parseWhen(raw) {
    if (raw == null) return null;

    const n = typeof raw === "number"
      ? raw
      : (/^\d+$/.test(String(raw).trim()) ? Number(raw) : null);

    if (n != null) {
      /* Digitransit and HSL feeds report seconds since midnight, which is far
         too small to be an epoch. Under ~2 days in seconds, read it that way. */
      if (n < 200000) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setSeconds(n);
        if (d.getTime() < Date.now() - 6 * 3600e3) d.setDate(d.getDate() + 1);
        return d;
      }
      const d = new Date(n > 1e11 ? n : n * 1000);
      return isNaN(d.getTime()) ? null : d;
    }

    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const d = new Date();
      d.setHours(+m[1], +m[2], +(m[3] || 0), 0);
      if (d.getTime() < Date.now() - 6 * 3600e3) d.setDate(d.getDate() + 1);
      return d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  _relTime(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    return `${Math.round(hrs / 24)} d ago`;
  }
}

/* ==================================================== card 1: home / wall-card */

class WallCard extends WallBase {
  constructor() {
    super();
    this._forecast = [];
    this._unsub = null;
    this._sigForecast = "";
    this._sigDepLen = -1;
  }

  static getStubConfig(hass) {
    const weather = Object.keys(hass?.states || {}).find((e) => e.startsWith("weather."));
    return { type: "custom:wall-card", weather: weather || "weather.home" };
  }

  get _defaults() {
    return { seconds: false, footer_left: "Home Assistant" };
  }

  get _canCompact() { return true; }

  get _tickMs() { return this._config?.seconds ? 1000 : 10000; }

  _onConfig() {
    this._sigForecast = "";
    this._sigDepLen = -1;
    if (this._weatherWas && this._weatherWas !== this._config.weather) {
      this._unsubscribeForecast();
      this._forecast = [];
    }
    this._weatherWas = this._config.weather;
  }

  _onFirstHass() { this._subscribeForecast(); }
  _onConnect() { this._subscribeForecast(); }
  _onDisconnect() { this._unsubscribeForecast(); }

  _subscribeForecast() {
    const id = this._config?.weather;
    if (!this._hass || !id || this._unsub || !this.isConnected) return;
    const conn = this._hass.connection;
    if (!conn?.subscribeMessage) return;
    try {
      this._unsub = conn.subscribeMessage(
        (msg) => {
          this._forecast = (msg && msg.forecast) || [];
          this._render();
        },
        { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: id }
      );
      this._unsub.catch(() => { this._unsub = null; });
    } catch (e) {
      this._unsub = null;
    }
  }

  _unsubscribeForecast() {
    if (!this._unsub) return;
    const p = this._unsub;
    this._unsub = null;
    try { p.then((f) => typeof f === "function" && f()).catch(() => {}); } catch (e) { /* noop */ }
  }

  static CSS = `
.pad.home { padding: 64px 56px 32px; }
.datebar { display: flex; align-items: center; gap: 14px; }
.clockrow { margin-top: 34px; display: flex; align-items: flex-start; }
/* proportional figures on purpose: Mona Sans's tabular set has a slashed zero */
.clock {
  font: 450 232px/.82 var(--wc-sans);
  letter-spacing: -.045em;
}
.home .rule { margin-top: 44px; }
.now { margin-top: 38px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.now-left { display: flex; align-items: flex-start; gap: 18px; }
.now-icon {
  --mdc-icon-size: 100px; width: 100px; height: 100px; margin-left: -8px;
  color: var(--wc-accent); flex: none; line-height: .85;
}
.now-temp { font: 450 116px/.85 var(--wc-sans); letter-spacing: -.04em; }
.now-right { text-align: right; padding-bottom: 10px; }
.now-cond { font: 500 26px/1.2 var(--wc-sans); }
.now-meta {
  margin-top: 8px; font: 400 18px/1.2 var(--wc-sans);
  color: rgba(var(--wc-ink),.58); letter-spacing: .04em;
}
.forecast {
  margin-top: 40px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
}
.fc { box-sizing: border-box; padding: 26px 4px 4px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.fc + .fc { border-left: 1px solid var(--wc-line, rgba(var(--wc-ink),.12)); }
.fc-day { font: 500 14px/1 var(--wc-mono); letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.fc-cond { font: 400 15px/1.2 var(--wc-sans); color: rgba(var(--wc-ink),.62); }
.fc-t { font: 600 34px/1 var(--wc-sans); letter-spacing: -.02em; }
.fc-lo { color: rgba(var(--wc-ink),.52); }
.spacer { flex: 1; min-height: 20px; }
.bottom { margin: 0 -26px; display: grid; grid-template-columns: 1fr 1fr; }
.tile { box-sizing: border-box; padding: 30px 26px 26px; }
.tile + .tile { border-left: 1px solid var(--wc-line, rgba(var(--wc-ink),.12)); }
.tile.solo { border-left: 0; }
.tile-label { font: 500 13px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.tile-row { margin-top: 16px; display: flex; align-items: baseline; gap: 8px; }
.tile-value { font: 600 46px/1 var(--wc-sans); letter-spacing: -.03em; }
.tile-unit { font: 400 20px/1 var(--wc-sans); color: rgba(var(--wc-ink),.6); }
.tile-sub { margin-top: 10px; font: 400 16px/1.3 var(--wc-sans); color: rgba(var(--wc-ink),.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dep { grid-column: 1 / -1; box-sizing: border-box; padding: 30px 26px 24px; border-top: 1px solid var(--wc-line, rgba(var(--wc-ink),.12)); }
.dep.solo { border-top: 0; }
.dep-head { display: flex; align-items: center; justify-content: space-between; }
.dep-title { display: flex; align-items: center; gap: 11px; font: 500 13px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.dep-title ha-icon { --mdc-icon-size: 19px; width: 19px; height: 19px; color: var(--wc-accent); }
.dep-sub { font: 400 15px/1 var(--wc-sans); letter-spacing: .1em; color: rgba(var(--wc-ink),.5); }
.dep-list { margin-top: 6px; }
.dep-row { display: flex; align-items: center; gap: 20px; padding: 17px 0 15px; border-bottom: 1px solid rgba(var(--wc-ink),.09); }
.dep-line { min-width: 58px; padding: 5px 0; text-align: center; border: 1px solid rgba(var(--wc-ink),.28); border-radius: 6px; font: 500 22px/1 var(--wc-sans); color: var(--wc-fg); }
.dep-dest { flex: 1; font: 400 21px/1.2 var(--wc-sans); color: rgba(var(--wc-ink),.82); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dep-time { font: 400 19px/1 var(--wc-sans); color: rgba(var(--wc-ink),.6); }
.dep-mins { min-width: 96px; text-align: right; font: 600 34px/1 var(--wc-sans); letter-spacing: -.02em; }
.dep-mins small { font-size: 17px; color: rgba(var(--wc-ink),.6); }
.footer {
  margin-top: 36px; display: flex; justify-content: space-between;
  font: 400 13px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.5);
}
/* the footer sits above the tabs so the tabs line up with the other pages */
.home .footer + .nav { margin-top: 18px; }

/* ---- compact (600 px wide tablets) ---- */
.compact .pad.home { padding: 28px 20px 12px; }
.compact .datebar { gap: 10px; }
.compact .clock { font-size: 176px; }
.compact.short .clock { font-size: 140px; }
.compact .clockrow { margin-top: 26px; }
.compact.short .clockrow { margin-top: 18px; }
.compact .forecast { margin-top: 26px; }
.compact.short .forecast { margin-top: 18px; }
.compact .home .rule { margin-top: 26px; }
.compact .now { margin-top: 22px; gap: 16px; }
.compact .now-left { gap: 12px; }
.compact .now-icon { --mdc-icon-size: 64px; width: 64px; height: 64px; margin-left: -4px; }
.compact .now-temp { font-size: 76px; }
.compact .now-right { padding-bottom: 4px; }
.compact .now-cond { font-size: 20px; }
.compact .now-meta { margin-top: 6px; font-size: 14px; }
.compact .fc { padding: 16px 4px 2px; gap: 8px; }
.compact .fc-day { font-size: 12px; }
.compact .fc-cond { font-size: 13px; }
.compact .fc-t { font-size: 24px; }
.compact .bottom { margin: 0 -16px; }
.compact .tile { padding: 18px 16px 16px; }
.compact .tile-label { font-size: 12px; }
.compact .tile-row { margin-top: 10px; gap: 6px; }
.compact .tile-value { font-size: 34px; }
.compact .tile-unit { font-size: 15px; }
.compact .tile-sub { margin-top: 6px; font-size: 13px; }
.compact .dep { padding: 18px 16px 10px; }
.compact .dep-title { gap: 8px; font-size: 12px; }
.compact .dep-title ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; }
.compact .dep-sub { font-size: 13px; }
.compact .dep-list { margin-top: 2px; }
.compact .dep-row { gap: 14px; padding: 11px 0 10px; }
.compact .dep-line { min-width: 46px; padding: 5px 4px; font-size: 16px; }
.compact .dep-dest { font-size: 16px; }
.compact .dep-time { font-size: 14px; }
.compact .dep-mins { min-width: 64px; font-size: 24px; }
.compact .dep-mins small { font-size: 13px; }
.compact .footer { margin-top: 14px; font-size: 11px; }
.compact .home .footer + .nav { margin-top: 12px; }
`;

  _template() {
    return `
      <div class="pad home">
        <div class="datebar"><span class="dot"></span><span class="eyebrow date"></span></div>
        <div class="clockrow"><span class="clock">--:--</span></div>
        <div class="rule"></div>
        <div class="now">
          <div class="now-left">
            <ha-icon class="now-icon"></ha-icon>
            <span class="now-temp">--&deg;</span>
          </div>
          <div class="now-right">
            <div class="now-cond">--</div>
            <div class="now-meta"></div>
          </div>
        </div>
        <div class="forecast"></div>
        <div class="spacer"></div>
        <div class="bottom">
          <div class="tile tile-a">
            <div class="tile-label"></div>
            <div class="tile-row"><span class="tile-value">--</span><span class="tile-unit"></span></div>
            <div class="tile-sub"></div>
          </div>
          <div class="tile tile-b">
            <div class="tile-label"></div>
            <div class="tile-row"><span class="tile-value">--</span><span class="tile-unit"></span></div>
            <div class="tile-sub"></div>
          </div>
          <div class="dep">
            <div class="dep-head">
              <span class="dep-title"><ha-icon icon="mdi:bus"></ha-icon><span class="dep-title-text">Next departures</span></span>
              <span class="dep-sub"></span>
            </div>
            <div class="dep-list"></div>
          </div>
        </div>
        <div class="footer"><span class="f-left"></span><span class="f-right"></span></div>
        <div class="nav hidden"></div>
      </div>`;
  }

  _collect() {
    const q = (s) => this._q(s);
    Object.assign(this._el, {
      date: q(".date"),
      clock: q(".clock"),
      icon: q(".now-icon"),
      temp: q(".now-temp"),
      cond: q(".now-cond"),
      meta: q(".now-meta"),
      forecast: q(".forecast"),
      tileA: q(".tile-a"),
      tileB: q(".tile-b"),
      dep: q(".dep"),
      depList: q(".dep-list"),
      depSub: q(".dep-sub"),
      depTitle: q(".dep-title-text"),
      bottom: q(".bottom"),
      fLeft: q(".f-left"),
      fRight: q(".f-right"),
    });
  }

  /* ---- units ---- */

  _tempUnit() {
    const w = this._hass?.states?.[this._config.weather];
    return (
      this._config.units ||
      w?.attributes?.temperature_unit ||
      this._hass?.config?.unit_system?.temperature ||
      "°C"
    );
  }

  _convTemp(value, sourceUnit) {
    const n = num(value);
    if (n === null) return null;
    const target = this._tempUnit();
    const src = sourceUnit || target;
    if (src === target) return n;
    if (src.indexOf("C") >= 0 && target.indexOf("F") >= 0) return (n * 9) / 5 + 32;
    if (src.indexOf("F") >= 0 && target.indexOf("C") >= 0) return ((n - 32) * 5) / 9;
    return n;
  }

  _deg(value, sourceUnit) {
    const n = this._convTemp(value, sourceUnit);
    return n === null ? "--°" : Math.round(n) + "°";
  }

  _isNight() {
    const sun = this._hass?.states?.["sun.sun"];
    if (sun) return sun.state === "below_horizon";
    const h = new Date().getHours();
    return h < 6 || h >= 21;
  }

  _condIcon(cond) {
    if (this._isNight() && COND_ICON_NIGHT[cond]) return COND_ICON_NIGHT[cond];
    return COND_ICON[cond] || "mdi:weather-cloudy";
  }

  _condLabel(cond, stateObj) {
    if (this._hass?.formatEntityState && stateObj) {
      try {
        const s = this._hass.formatEntityState(stateObj);
        if (s && s !== stateObj.state) return s;
      } catch (e) { /* fall through */ }
    }
    return COND_LABEL[cond] || (cond ? String(cond).replace(/-/g, " ") : "--");
  }

  _update() {
    const c = this._config;
    const el = this._el;
    const now = new Date();

    try {
      el.date.textContent = new Intl.DateTimeFormat(this._locale(), {
        weekday: "long", day: "numeric", month: "long",
      }).format(now);
    } catch (e) {
      el.date.textContent = now.toDateString();
    }

    const opts = { hour: "2-digit", minute: "2-digit", hour12: String(c.time_format) === "12" };
    if (c.seconds) opts.second = "2-digit";
    el.clock.textContent = new Intl.DateTimeFormat(this._locale(), opts)
      .format(now)
      .replace(/\s?(AM|PM)/i, (m) => m.toLowerCase());

    this._renderWeather();
    this._renderTiles();
    this._renderDepartures();

    el.fLeft.textContent = c.footer_left || "";
    el.fRight.textContent = c.footer_right || "Synced " + this._fmtTime(now);
  }

  _renderWeather() {
    const el = this._el;
    const w = this._hass.states?.[this._config.weather];
    if (!w) {
      el.icon.setAttribute("icon", "mdi:weather-cloudy-alert");
      el.temp.textContent = "--°";
      el.cond.textContent = this._config.weather ? "Unavailable" : "No weather entity";
      el.meta.textContent = this._config.weather || "Set weather: in the card config";
      el.forecast.classList.add("hidden");
      return;
    }
    const a = w.attributes || {};
    const srcUnit = a.temperature_unit;
    el.icon.setAttribute("icon", this._condIcon(w.state));
    el.temp.textContent = this._deg(a.temperature, srcUnit);
    el.cond.textContent = this._condLabel(w.state, w);

    const fc = this._forecast.length ? this._forecast : a.forecast || [];
    const today = fc[0] || {};
    const hi = today.temperature != null ? today.temperature : today.native_temperature;
    const lo = today.templow != null ? today.templow : today.native_templow;
    const parts = [];
    if (hi != null) parts.push("H " + this._deg(hi, srcUnit));
    if (lo != null) parts.push("L " + this._deg(lo, srcUnit));
    const ws = num(a.wind_speed);
    if (ws != null) {
      const unit = a.wind_speed_unit || "km/h";
      const bear = num(a.wind_bearing);
      const dir = bear == null ? "" : " " + COMPASS[Math.round((bear % 360) / 22.5) % 16];
      parts.push(Math.round(ws) + " " + unit + dir);
    }
    const hum = num(a.humidity);
    if (parts.length < 2 && hum != null) parts.push(Math.round(hum) + "% rh");
    el.meta.textContent = parts.join(" · ");

    const skip = fc.length > 3 ? 1 : 0;
    const days = fc.slice(skip, skip + 3);
    const sig = JSON.stringify(days.map((d) => [d.datetime, d.condition, d.temperature, d.templow]));
    if (sig !== this._sigForecast) {
      this._sigForecast = sig;
      el.forecast.textContent = "";
      days.forEach((d) => {
        let day = "";
        try {
          day = new Intl.DateTimeFormat(this._locale(), { weekday: "short" }).format(new Date(d.datetime));
        } catch (e) { /* noop */ }
        const cell = document.createElement("div");
        cell.className = "fc";
        const dayEl = document.createElement("span");
        dayEl.className = "fc-day";
        dayEl.textContent = day;
        const condEl = document.createElement("span");
        condEl.className = "fc-cond";
        condEl.textContent = this._condLabel(d.condition);
        const tEl = document.createElement("span");
        tEl.className = "fc-t";
        tEl.textContent = this._deg(d.temperature != null ? d.temperature : d.native_temperature);
        const loEl = document.createElement("span");
        loEl.className = "fc-lo";
        loEl.textContent = " / " + this._deg(d.templow != null ? d.templow : d.native_templow);
        tEl.appendChild(loEl);
        cell.appendChild(dayEl);
        cell.appendChild(condEl);
        cell.appendChild(tEl);
        el.forecast.appendChild(cell);
      });
    }
    el.forecast.classList.toggle("hidden", days.length === 0);
  }

  _fillTile(node, cfg) {
    node.onclick = null;
    node.classList.remove("tap");
    if (!cfg) {
      node.classList.add("hidden");
      return false;
    }
    node.classList.remove("hidden");
    const q = (s) => node.querySelector(s);
    const st = cfg.entity ? this._hass.states?.[cfg.entity] : null;
    const name = cfg.label || st?.attributes?.friendly_name || cfg.entity || "";
    q(".tile-label").textContent = name;

    let value = cfg.value;
    let unit = cfg.unit;
    if (value == null && st) {
      const isTemp = st.attributes?.device_class === "temperature";
      if (isTemp) {
        value = this._deg(st.state, st.attributes?.unit_of_measurement);
      } else {
        // respect the entity's display precision setting, like HA's own cards do
        const n = num(st.state);
        const prec = this._hass.entities?.[cfg.entity]?.display_precision;
        value = n != null && prec != null ? n.toFixed(prec) : st.state;
      }
      if (unit == null && !isTemp) unit = st.attributes?.unit_of_measurement || "";
    }
    q(".tile-value").textContent = value == null || value === "" ? "--" : value;

    if (unit == null && cfg.secondary) {
      const s2 = this._hass.states?.[cfg.secondary];
      const n2 = s2 ? num(s2.state) : null;
      unit = n2 == null ? "" : Math.round(n2) + (s2.attributes?.unit_of_measurement || "");
      if (unit && s2.attributes?.device_class === "humidity") unit += " rh";
    }
    q(".tile-unit").textContent = unit || "";

    let sub = cfg.sub || "";
    if (!sub && cfg.sub_entity) {
      const s3 = this._hass.states?.[cfg.sub_entity];
      if (s3) {
        const action = s3.attributes?.hvac_action;
        const word = action ? String(action).replace(/_/g, " ") : this._stateLabel(s3);
        const who = s3.attributes?.friendly_name;
        sub = who ? who + " " + word.toLowerCase() : titleCase(word);
      }
    }
    q(".tile-sub").textContent = sub;

    if (cfg.entity) {
      node.classList.add("tap");
      node.onclick = () => this._moreInfo(cfg.entity);
    }
    return true;
  }

  _renderTiles() {
    const c = this._config;
    const left = c.tile_left || (c.temperature ? {
      entity: c.temperature,
      label: c.climate_label,
      secondary: c.humidity,
      sub: c.climate_sub,
      sub_entity: c.climate,
    } : null);
    this._fillTile(this._el.tileA, left);

    let right = c.tile_right;
    if (!right && Array.isArray(c.lights) && c.lights.length) {
      const on = c.lights.map((e) => this._hass.states?.[e]).filter((s) => s && s.state === "on");
      const names = on.map((s, i) => {
        const raw = (s.attributes?.friendly_name || s.entity_id.split(".")[1]).replace(/_/g, " ");
        return i === 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw.toLowerCase();
      });
      right = {
        label: c.lights_label || "Lights",
        value: String(on.length),
        unit: "on",
        sub: names.length ? names.join(", ") : "All off",
      };
    }
    this._fillTile(this._el.tileB, right);
  }

  _renderDepartures() {
    const el = this._el;
    const cfg = this._config.departures;
    if (!cfg || !cfg.entity) {
      el.dep.classList.add("hidden");
      this._syncBottom();
      return;
    }
    const st = this._hass.states?.[cfg.entity];
    const f = Object.assign(
      { line: "line", destination: "destination", time: "time", minutes: "minutes" },
      cfg.fields || {}
    );
    let rows = pick(st?.attributes, cfg.attribute || "departures");
    if (!Array.isArray(rows)) rows = [];
    rows = rows.slice(0, cfg.count || 3);

    el.dep.classList.remove("hidden");
    el.depTitle.textContent = cfg.title || "Next departures";
    el.depSub.textContent = cfg.subtitle || st?.attributes?.friendly_name || cfg.entity;

    if (rows.length !== this._sigDepLen) {
      this._sigDepLen = rows.length;
      el.depList.textContent = "";
      if (!rows.length) {
        const d = document.createElement("div");
        d.className = "dep-row";
        const span = document.createElement("span");
        span.className = "dep-dest";
        span.textContent = st ? "No departures" : "Sensor unavailable";
        d.appendChild(span);
        el.depList.appendChild(d);
      }
      rows.forEach(() => {
        const d = document.createElement("div");
        d.className = "dep-row";
        ["dep-line", "dep-dest", "dep-time", "dep-mins"].forEach((cls) => {
          const s = document.createElement("span");
          s.className = cls;
          d.appendChild(s);
        });
        el.depList.appendChild(d);
      });
    }

    const nodes = el.depList.querySelectorAll(".dep-row");
    rows.forEach((r, i) => {
      const n = nodes[i];
      if (!n) return;
      const lineEl = n.querySelector(".dep-line");
      if (!lineEl) return;
      const when = this._parseWhen(pick(r, f.time));
      let mins = num(pick(r, f.minutes));
      if (mins == null && when) mins = Math.max(0, Math.round((when - Date.now()) / 60000));
      lineEl.textContent = pick(r, f.line) ?? "--";
      n.querySelector(".dep-dest").textContent = pick(r, f.destination) ?? "";
      n.querySelector(".dep-time").textContent = when ? this._fmtTime(when) : "";
      const minsEl = n.querySelector(".dep-mins");
      minsEl.textContent = mins == null ? "--" : String(mins);
      if (mins != null) {
        const small = document.createElement("small");
        small.textContent = " min";
        minsEl.appendChild(small);
      }
    });

    this._syncBottom();
  }

  _syncBottom() {
    const el = this._el;
    const aOn = !el.tileA.classList.contains("hidden");
    const bOn = !el.tileB.classList.contains("hidden");
    const depOn = !el.dep.classList.contains("hidden");
    el.bottom.classList.toggle("hidden", !aOn && !bOn && !depOn);
    /* a lone tile spans the row, otherwise the empty cell shows as a grey block */
    el.tileA.style.gridColumn = aOn && !bOn ? "1 / -1" : "";
    el.tileB.style.gridColumn = bOn && !aOn ? "1 / -1" : "";
    el.tileB.classList.toggle("solo", bOn && !aOn);
    el.dep.classList.toggle("solo", !aOn && !bOn);
  }
}

/* ============================================ card 2: wall-card-controls */

class WallCardControls extends WallBase {
  constructor() {
    super();
    this._filter = "All";
    this._sig = "";
  }

  static getStubConfig() {
    return { type: "custom:wall-card-controls", rooms: [] };
  }

  get _defaults() {
    return { title: "Home", eyebrow: "Controls", max_width: 520 };
  }

  /* the tablet page is a scaled artboard; the phone page lays out fluidly */
  get _fluid() { return this._config?.layout === "phone"; }

  get _canCompact() { return true; }

  get _tickMs() { return 30000; }

  _onConfig() { this._sig = ""; }

  static CSS = `
.pad.controls { padding: 56px 56px 32px; }
.c-head { display: flex; align-items: center; justify-content: space-between; }
.c-head-left { display: flex; align-items: center; gap: 14px; }
.c-active {
  font: 400 15px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.5);
}
.c-title-row { margin-top: 26px; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.c-title { font: 650 76px/.95 var(--wc-sans); letter-spacing: -.035em; white-space: nowrap; }
.c-title-right {
  padding-bottom: 12px; text-align: right;
  font: 400 17px/1.45 var(--wc-sans); color: rgba(var(--wc-ink),.55);
}
.c-filters {
  margin: 26px -56px 0; padding: 0 56px; display: flex; gap: 8px; overflow-x: auto;
}
.chip {
  flex: none; padding: 11px 16px; border-radius: 999px;
  border: 1px solid rgba(var(--wc-ink),.14); background: transparent;
  font: 500 12px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.55);
  cursor: pointer; user-select: none;
}
.chip.active { border-color: var(--wc-accent); background: var(--wc-accent); color: var(--wc-on-accent); }
.controls .rule { margin-top: 22px; }
.c-list { flex: 1; overflow-y: auto; margin: 0 -8px; padding: 0 8px; }
.c-group { padding: 24px 0 2px; }
.c-group-head { display: flex; align-items: baseline; justify-content: space-between; }
.c-room { font: 500 13px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.c-summary { font: 400 14px/1 var(--wc-sans); letter-spacing: .12em; color: rgba(var(--wc-ink),.45); }
.c-row { display: flex; align-items: center; gap: 20px; padding: 18px 0 16px; border-bottom: 1px solid rgba(var(--wc-ink),.09); }
.c-icon { --mdc-icon-size: 30px; width: 34px; height: 30px; flex: none; color: rgba(var(--wc-ink),.34); }
.c-icon.on { color: var(--wc-accent); }
.c-main { flex: 1; min-width: 0; }
.c-name { display: block; font: 400 22px/1.15 var(--wc-sans); color: var(--wc-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-sub { display: block; margin-top: 6px; font: 400 15px/1 var(--wc-sans); letter-spacing: .06em; color: rgba(var(--wc-ink),.55); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ctl-dim {
  width: 170px; height: 34px; border-radius: 8px; background: var(--wc-raised);
  position: relative; overflow: hidden; flex: none; cursor: pointer;
}
.ctl-dim-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--wc-accent-fill); }
.ctl-dim-pct { position: absolute; right: 10px; top: 9px; font: 500 15px/1 var(--wc-sans); color: rgba(var(--wc-ink),.75); }

.ctl-climate { display: flex; align-items: center; gap: 14px; flex: none; }
.ctl-round {
  --mdc-icon-size: 20px; width: 44px; height: 44px; border-radius: 50%;
  border: 1px solid rgba(var(--wc-ink),.18); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.75); cursor: pointer;
}
.ctl-set { min-width: 86px; text-align: center; font: 600 30px/1 var(--wc-sans); letter-spacing: -.02em; color: var(--wc-accent); }
.ctl-set.off { color: rgba(var(--wc-ink),.4); }

.ctl-cover { display: flex; align-items: center; gap: 8px; flex: none; }
.ctl-sq {
  --mdc-icon-size: 24px; width: 48px; height: 44px; border-radius: 10px;
  border: 1px solid rgba(var(--wc-ink),.18); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.7); cursor: pointer;
}
.ctl-sq.mid { --mdc-icon-size: 18px; color: rgba(var(--wc-ink),.6); }
.ctl-sq.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }

.ctl-reading { flex: none; font: 600 30px/1 var(--wc-sans); letter-spacing: -.02em; color: rgba(var(--wc-ink),.45); }
.ctl-reading.live { color: var(--wc-accent); }

.ctl-action {
  flex: none; padding: 13px 22px; border-radius: 10px; border: 1px solid rgba(var(--wc-ink),.18);
  font: 500 12px/1 var(--wc-mono); letter-spacing: .08em;
  text-transform: uppercase; color: rgba(var(--wc-ink),.7); cursor: pointer;
}

.ctl-pill {
  width: 74px; height: 38px; border-radius: 19px; background: rgba(var(--wc-ink),.07);
  border: 1px solid rgba(var(--wc-ink),.18); position: relative; flex: none; cursor: pointer;
  transition: background .18s;
}
.ctl-pill.on { background: var(--wc-accent); border-color: var(--wc-accent); }
.ctl-knob {
  position: absolute; top: 4px; left: 4px; width: 28px; height: 28px; border-radius: 50%;
  background: rgba(var(--wc-ink),.55); transform: translateX(0); transition: transform .18s;
}
.ctl-pill.on .ctl-knob { background: #000; transform: translateX(36px); }

.c-empty { padding: 40px 0; text-align: center; font: 400 17px/1.4 var(--wc-sans); color: rgba(var(--wc-ink),.4); }

.c-scenes { margin-top: 20px; display: flex; gap: 10px; }
.scene {
  flex: 1; height: 60px; border-radius: 16px; border: 1px solid rgba(var(--wc-ink),.14);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  cursor: pointer; color: rgba(var(--wc-ink),.62);
}
.scene.active { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.scene ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; }
.scene span { font: 500 12px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; }
.controls .nav { margin-top: 24px; }

/* ---- phone layout: same rows, phone-sized ---- */
.cphone {
  display: flex; flex-direction: column; min-height: 100dvh;
  max-width: var(--wc-max, 520px); margin: 0 auto;
  background: var(--wc-bg, #000);
  /* .pad supplies these in the artboard layout; the fluid wrapper must too */
  font-family: var(--wc-sans);
  color: var(--wc-fg, #F4F4F2);
  -webkit-font-smoothing: antialiased;
}
.cbody { flex: 1; padding: var(--wc-pad-top, 26px) 20px 8px; }
.cphone .c-active { font-size: 11px; letter-spacing: .18em; }
.cphone .c-title-row { margin-top: 16px; }
.cphone .c-title { font-size: 42px; line-height: .95; letter-spacing: -.035em; }
.cphone .c-title-right { padding-bottom: 5px; font-size: 12px; line-height: 1.4; }
.cphone .c-filters { margin: 20px -20px 0; padding: 0 20px; gap: 7px; }
.cphone .chip { padding: 9px 13px; font-size: 11px; letter-spacing: .16em; }
.cphone .rule { margin-top: 16px; }
.cphone .c-list { flex: none; overflow: visible; margin: 0; padding: 0; }
.cphone .c-group { padding: 18px 0 2px; }
.cphone .c-room { font-size: 11px; }
.cphone .c-summary { font-size: 12px; }
.cphone .c-row { gap: 12px; padding: 14px 0 12px; }
.cphone .c-icon { --mdc-icon-size: 24px; width: 26px; height: 24px; }
.cphone .c-name { font-size: 16px; }
.cphone .c-sub { margin-top: 4px; font-size: 12px; }

.cphone .ctl-dim { width: 96px; height: 30px; border-radius: 6px; }
.cphone .ctl-dim-pct { right: 8px; top: 8px; font-size: 13px; }

.cphone .ctl-climate { gap: 8px; }
.cphone .ctl-round { --mdc-icon-size: 17px; width: 36px; height: 36px; }
.cphone .ctl-set { min-width: 58px; font-size: 22px; }

.cphone .ctl-cover { gap: 6px; }
.cphone .ctl-sq { --mdc-icon-size: 20px; width: 40px; height: 38px; border-radius: 9px; }
.cphone .ctl-sq.mid { --mdc-icon-size: 15px; }

.cphone .ctl-reading { font-size: 22px; }
.cphone .ctl-action { padding: 10px 14px; font-size: 10px; letter-spacing: .16em; }

.cphone .ctl-pill { width: 52px; height: 30px; border-radius: 15px; }
.cphone .ctl-knob { top: 3px; left: 3px; width: 22px; height: 22px; }
.cphone .ctl-pill.on .ctl-knob { transform: translateX(22px); }

.cphone .c-scenes { margin-top: 16px; gap: 8px; }
.cphone .scene { height: 54px; border-radius: 14px; gap: 5px; }
.cphone .scene ha-icon { --mdc-icon-size: 19px; width: 19px; height: 19px; }
.cphone .scene span { font-size: 10px; letter-spacing: .14em; }
.cphone .c-empty { font-size: 15px; padding: 28px 0; }
/* ---- compact (600 px wide tablets) ---- */
.compact .pad.controls { padding: 26px 20px 12px; }
.compact .c-active { font-size: 12px; }
.compact .c-title-row { margin-top: 16px; }
.compact .c-title { font-size: 48px; }
.compact .c-title-right { padding-bottom: 6px; font-size: 13px; }
.compact .c-filters { margin: 18px -20px 0; padding: 0 20px; }
.compact .chip { height: 40px; padding: 0 14px; display: flex; align-items: center; font-size: 12px; }
.compact .controls .rule { margin-top: 16px; }
.compact .c-list { margin: 0 -4px; padding: 0 4px; }
.compact .c-group { padding: 16px 0 2px; }
.compact .c-room, .compact .c-summary { font-size: 12px; }
.compact .c-row { gap: 14px; padding: 0; min-height: 64px; }
.compact .c-icon { --mdc-icon-size: 24px; width: 26px; height: 24px; }
.compact .c-name { font-size: 17px; }
.compact .c-sub { margin-top: 4px; font-size: 13px; }
.compact .ctl-dim { width: 104px; height: 32px; }
.compact .ctl-dim-pct { right: 8px; top: 9px; font-size: 13px; }
.compact .ctl-climate { gap: 8px; }
.compact .ctl-round { --mdc-icon-size: 18px; width: 40px; height: 40px; }
.compact .ctl-set { min-width: 62px; font-size: 22px; }
.compact .ctl-cover { gap: 6px; }
.compact .ctl-sq { --mdc-icon-size: 22px; width: 44px; height: 40px; }
.compact .ctl-sq.mid { --mdc-icon-size: 16px; }
.compact .ctl-reading { font-size: 22px; }
.compact .ctl-action { padding: 12px 16px; font-size: 11px; }
.compact .ctl-pill { width: 56px; height: 32px; border-radius: 16px; }
.compact .ctl-knob { top: 3px; left: 3px; width: 24px; height: 24px; }
.compact .ctl-pill.on .ctl-knob { transform: translateX(24px); }
.compact .c-empty { font-size: 15px; padding: 28px 0; }
.compact .c-scenes { margin-top: 14px; gap: 8px; }
.compact .scene { height: 56px; border-radius: 14px; gap: 5px; }
.compact .scene ha-icon { --mdc-icon-size: 19px; width: 19px; height: 19px; }
.compact .scene span { font-size: 11px; }
.compact .controls .nav { margin-top: 14px; }
`;

  _template() {
    const inner = `
        <div class="c-head">
          <span class="c-head-left"><span class="dot"></span><span class="eyebrow c-eyebrow">Controls</span></span>
          <span class="c-active"></span>
        </div>
        <div class="c-title-row">
          <span class="c-title">Home</span>
          <span class="c-title-right"><span class="c-power"></span><br><span class="c-updated"></span></span>
        </div>
        <div class="c-filters noscroll"></div>
        <div class="rule"></div>
        <div class="c-list noscroll"></div>
        <div class="c-scenes"></div>`;

    if (this._fluid) {
      return `<div class="cphone"><div class="cbody">${inner}</div>` +
             `<div class="wc-foot"><div class="nav hidden"></div></div></div>`;
    }
    return `<div class="pad controls">${inner}<div class="nav hidden"></div></div>`;
  }

  _collect() {
    const q = (s) => this._q(s);
    Object.assign(this._el, {
      eyebrow: q(".c-eyebrow"),
      active: q(".c-active"),
      title: q(".c-title"),
      power: q(".c-power"),
      updated: q(".c-updated"),
      wrap: q(".cphone") || q(".pad"),
      filters: q(".c-filters"),
      list: q(".c-list"),
      scenes: q(".c-scenes"),
    });
  }

  /* ---- config -> flat device list ---- */

  _devices() {
    const rooms = Array.isArray(this._config.rooms) ? this._config.rooms : [];
    const out = [];
    rooms.forEach((room) => {
      const roomName = room.name || "Other";
      (room.entities || []).forEach((raw) => {
        const cfg = typeof raw === "string" ? { entity: raw } : raw || {};
        if (!cfg.entity) return;
        const st = this._hass.states?.[cfg.entity];
        const domain = domainOf(cfg.entity);
        out.push({
          room: roomName,
          cfg,
          st,
          domain,
          name: cfg.name || st?.attributes?.friendly_name || cfg.entity,
          category: cfg.category || DOMAIN_CATEGORY[domain] || "Appliances",
        });
      });
    });
    return out;
  }

  _isOn(d) {
    const st = d.st;
    if (!st) return false;
    switch (d.domain) {
      case "climate":
      case "water_heater":
      case "humidifier":
        return st.state !== "off" && st.state !== "unavailable";
      case "cover":
        return num(st.attributes?.current_position) > 0 || st.state === "open";
      case "lock":
        return st.state === "locked";
      case "sensor":
      case "binary_sensor":
      case "camera":
        return false;
      case "media_player":
        return st.state !== "off" && st.state !== "standby" && st.state !== "unavailable";
      default:
        return st.state === "on";
    }
  }

  _controlKind(d) {
    if (d.cfg.control) return d.cfg.control;
    switch (d.domain) {
      case "climate":
      case "water_heater":
        return "climate";
      case "cover":
        return "cover";
      case "sensor":
      case "binary_sensor":
        return "reading";
      case "camera":
        return "action";
      case "scene":
      case "script":
      case "button":
      case "automation":
        return "action";
      case "light":
        return d.st?.attributes?.supported_color_modes?.some((m) =>
          ["brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"].includes(m)
        ) ? "light" : "toggle";
      default:
        return "toggle";
    }
  }

  _subFor(d) {
    const st = d.st;
    if (!st) return "Unavailable";
    if (d.cfg.sub) return d.cfg.sub;
    switch (d.domain) {
      case "climate": {
        const cur = num(st.attributes?.current_temperature);
        const mode = titleCase(st.state);
        return cur == null ? mode : `${mode} · now ${cur.toFixed(1)}°`;
      }
      case "cover": {
        const p = num(st.attributes?.current_position);
        if (p == null) return titleCase(st.state);
        return p === 0 ? "Closed" : p === 100 ? "Open" : `${p}% open`;
      }
      case "lock":
        return st.state === "locked" ? "Locked" : "Unlocked";
      case "light": {
        if (st.state !== "on") return "Off";
        const b = num(st.attributes?.brightness);
        return b == null ? "On" : `${Math.round((b / 255) * 100)}%`;
      }
      case "media_player": {
        if (st.state === "playing" && st.attributes?.media_title) return st.attributes.media_title;
        return titleCase(st.state);
      }
      case "sensor":
      case "binary_sensor":
        return this._relTime(st.last_changed);
      case "camera":
        return "Live feed";
      default:
        return st.state === "on" ? "On" : titleCase(st.state);
    }
  }

  _readingFor(d) {
    const st = d.st;
    if (!st) return "--";
    const unit = st.attributes?.unit_of_measurement;
    const n = num(st.state);
    if (n != null) return `${Math.round(n * 10) / 10}${unit ? " " + unit : ""}`;
    return this._stateLabel(st);
  }

  /* ---- actions ---- */

  _toggle(d) {
    const st = d.st;
    if (!st) return;
    const id = d.cfg.entity;
    switch (d.domain) {
      case "lock":
        return this._call("lock", st.state === "locked" ? "unlock" : "lock", { entity_id: id });
      case "media_player":
        return this._call("media_player", this._isOn(d) ? "turn_off" : "turn_on", { entity_id: id });
      case "climate":
        return this._call("climate", "set_hvac_mode", {
          entity_id: id,
          hvac_mode: st.state === "off" ? (d.cfg.hvac_mode || "heat") : "off",
        });
      default:
        return this._call(d.domain, "toggle", { entity_id: id });
    }
  }

  _setBrightness(d, pct) {
    this._call("light", "turn_on", {
      entity_id: d.cfg.entity,
      brightness_pct: Math.max(1, Math.min(100, Math.round(pct))),
    });
  }

  _nudgeTemp(d, delta) {
    const st = d.st;
    const cur = num(st?.attributes?.temperature);
    if (cur == null) return;
    const step = num(st.attributes?.target_temp_step) || 0.5;
    const min = num(st.attributes?.min_temp) ?? 5;
    const max = num(st.attributes?.max_temp) ?? 35;
    const next = Math.max(min, Math.min(max, cur + delta * step));
    this._call(d.domain, "set_temperature", { entity_id: d.cfg.entity, temperature: next });
  }

  _runAction(d) {
    const id = d.cfg.entity;
    switch (d.domain) {
      case "scene": return this._call("scene", "turn_on", { entity_id: id });
      case "script": return this._call("script", "turn_on", { entity_id: id });
      case "automation": return this._call("automation", "trigger", { entity_id: id });
      case "button": return this._call("button", "press", { entity_id: id });
      default: return this._moreInfo(id);
    }
  }

  /* ---- render ---- */

  _update() {
    const el = this._el;
    const c = this._config;
    el.eyebrow.textContent = c.eyebrow || "Controls";
    el.title.textContent = c.title || "Home";
    if (this._fluid) {
      this.style.setProperty("--wc-max", (num(c.max_width) || 520) + "px");
      this.style.setProperty("--wc-pad-top", (num(c.padding_top) ?? 26) + "px");
      el.wrap.classList.toggle("no-nav", !(Array.isArray(c.nav) && c.nav.length));
    }

    const devices = this._devices();
    const activeCount = devices.filter((d) => this._isOn(d) && this._controlKind(d) !== "reading").length;
    el.active.textContent = `${activeCount} device${activeCount === 1 ? "" : "s"} on`;

    const powerSt = c.power_entity ? this._hass.states?.[c.power_entity] : null;
    const p = powerSt ? num(powerSt.state) : null;
    el.power.textContent =
      p == null ? `${devices.length} devices` : `${Math.round(p)} ${powerSt.attributes?.unit_of_measurement || "W"} in use`;
    el.updated.textContent = "Updated " + this._fmtTime(new Date());

    this._renderFilters(devices);
    this._renderList(devices);
    this._renderScenes();
  }

  _renderFilters(devices) {
    const el = this._el.filters;
    const present = [];
    devices.forEach((d) => { if (!present.includes(d.category)) present.push(d.category); });
    const cats = ["All"].concat(
      CATEGORY_ORDER.filter((c) => c !== "All" && present.includes(c))
    ).concat(present.filter((c) => !CATEGORY_ORDER.includes(c)));

    if (!cats.includes(this._filter)) this._filter = "All";
    const sig = cats.join("|") + "::" + this._filter;
    if (sig === this._sigFilters) return;
    this._sigFilters = sig;

    el.textContent = "";
    cats.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "chip" + (name === this._filter ? " active" : "");
      chip.textContent = name;
      chip.addEventListener("click", () => {
        this._filter = name;
        this._sigFilters = "";
        this._sig = "";
        this._render();
      });
      el.appendChild(chip);
    });
  }

  _renderList(devices) {
    const el = this._el.list;
    const visible = this._filter === "All" ? devices : devices.filter((d) => d.category === this._filter);

    /* rebuild only when the set of rows changes; otherwise patch in place so
       scroll position and slider drags survive a state update */
    const sig = visible.map((d) => d.room + "/" + d.cfg.entity + "/" + this._controlKind(d)).join("|");
    if (sig !== this._sig) {
      this._sig = sig;
      el.textContent = "";
      this._rows = new Map();

      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "c-empty";
        empty.textContent = devices.length
          ? "Nothing in this category"
          : "No rooms configured. Add a rooms: block to the card.";
        el.appendChild(empty);
      }

      const rooms = [];
      visible.forEach((d) => { if (!rooms.includes(d.room)) rooms.push(d.room); });
      rooms.forEach((room) => {
        const group = document.createElement("div");
        group.className = "c-group";
        const head = document.createElement("div");
        head.className = "c-group-head";
        const rn = document.createElement("span");
        rn.className = "c-room";
        rn.textContent = room;
        const summary = document.createElement("span");
        summary.className = "c-summary";
        head.appendChild(rn);
        head.appendChild(summary);
        group.appendChild(head);
        group.__summary = summary;
        group.__room = room;

        visible.filter((d) => d.room === room).forEach((d) => {
          group.appendChild(this._buildRow(d));
        });
        el.appendChild(group);
      });
      this._groups = Array.from(el.querySelectorAll(".c-group"));
    }

    /* patch values */
    visible.forEach((d) => this._patchRow(d));
    (this._groups || []).forEach((g) => {
      const items = visible.filter((d) => d.room === g.__room);
      const ctl = items.filter((d) => this._controlKind(d) !== "reading");
      const on = ctl.filter((d) => this._isOn(d)).length;
      g.__summary.textContent = ctl.length ? `${on} / ${ctl.length} active` : `${items.length} sensors`;
    });
  }

  _buildRow(d) {
    const row = document.createElement("div");
    row.className = "c-row";
    const kind = this._controlKind(d);

    const icon = document.createElement("ha-icon");
    icon.className = "c-icon";
    row.appendChild(icon);

    const main = document.createElement("span");
    main.className = "c-main";
    const name = document.createElement("span");
    name.className = "c-name";
    name.textContent = d.name;
    const sub = document.createElement("span");
    sub.className = "c-sub";
    main.appendChild(name);
    main.appendChild(sub);
    main.addEventListener("click", () => this._moreInfo(d.cfg.entity));
    main.classList.add("tap");
    row.appendChild(main);

    const refs = { row, icon, sub, kind };

    if (kind === "light") {
      const dim = document.createElement("span");
      dim.className = "ctl-dim";
      const fill = document.createElement("span");
      fill.className = "ctl-dim-fill";
      const pct = document.createElement("span");
      pct.className = "ctl-dim-pct";
      dim.appendChild(fill);
      dim.appendChild(pct);
      dim.addEventListener("click", (ev) => {
        const r = dim.getBoundingClientRect();
        this._setBrightness(d, ((ev.clientX - r.left) / r.width) * 100);
      });
      row.appendChild(dim);
      refs.dimWrap = dim;
      refs.fill = fill;
      refs.pct = pct;
    }

    if (kind === "climate") {
      const wrap = document.createElement("span");
      wrap.className = "ctl-climate";
      const minus = document.createElement("ha-icon");
      minus.className = "ctl-round";
      minus.setAttribute("icon", "mdi:minus");
      minus.addEventListener("click", () => this._nudgeTemp(d, -1));
      const set = document.createElement("span");
      set.className = "ctl-set";
      const plus = document.createElement("ha-icon");
      plus.className = "ctl-round";
      plus.setAttribute("icon", "mdi:plus");
      plus.addEventListener("click", () => this._nudgeTemp(d, 1));
      wrap.appendChild(minus);
      wrap.appendChild(set);
      wrap.appendChild(plus);
      row.appendChild(wrap);
      refs.set = set;
    }

    if (kind === "cover") {
      const wrap = document.createElement("span");
      wrap.className = "ctl-cover";
      const up = document.createElement("ha-icon");
      up.className = "ctl-sq";
      up.setAttribute("icon", "mdi:chevron-up");
      up.addEventListener("click", () => this._call("cover", "open_cover", { entity_id: d.cfg.entity }));
      const stop = document.createElement("ha-icon");
      stop.className = "ctl-sq mid";
      stop.setAttribute("icon", "mdi:stop");
      stop.addEventListener("click", () => this._call("cover", "stop_cover", { entity_id: d.cfg.entity }));
      const down = document.createElement("ha-icon");
      down.className = "ctl-sq";
      down.setAttribute("icon", "mdi:chevron-down");
      down.addEventListener("click", () => this._call("cover", "close_cover", { entity_id: d.cfg.entity }));
      wrap.appendChild(up);
      wrap.appendChild(stop);
      wrap.appendChild(down);
      row.appendChild(wrap);
      refs.up = up;
      refs.down = down;
    }

    if (kind === "reading") {
      const r = document.createElement("span");
      r.className = "ctl-reading";
      row.appendChild(r);
      refs.reading = r;
    }

    if (kind === "action") {
      const b = document.createElement("span");
      b.className = "ctl-action";
      b.textContent = d.cfg.action_label || "Run";
      b.addEventListener("click", () => this._runAction(d));
      row.appendChild(b);
      refs.action = b;
    }

    /* climate rows are driven by the +/- pair alone, as in the design */
    if (kind === "toggle" || kind === "light") {
      const pill = document.createElement("span");
      pill.className = "ctl-pill";
      const knob = document.createElement("span");
      knob.className = "ctl-knob";
      pill.appendChild(knob);
      pill.addEventListener("click", () => this._toggle(d));
      row.appendChild(pill);
      refs.pill = pill;
    }

    /* hold the row to switch the device off (not while using its slider or buttons) */
    this._wireLongOff(row, () => d.cfg.entity, ".ctl-dim, .ctl-climate, .ctl-cover, .ctl-action");
    this._rows.set(d.cfg.entity + "@" + d.room, refs);
    return row;
  }

  _patchRow(d) {
    const refs = this._rows?.get(d.cfg.entity + "@" + d.room);
    if (!refs) return;
    const on = this._isOn(d);
    refs.icon.setAttribute("icon", this._iconFor(d.st, d.cfg.entity, d.cfg.icon));
    refs.icon.classList.toggle("on", on);
    refs.sub.textContent = this._subFor(d);

    if (refs.pill) refs.pill.classList.toggle("on", on);

    if (refs.fill) {
      const b = num(d.st?.attributes?.brightness);
      const pct = d.st?.state === "on" && b != null ? Math.round((b / 255) * 100) : 0;
      refs.fill.style.width = pct + "%";
      refs.pct.textContent = pct + "%";
      refs.dimWrap.style.display = d.st?.state === "on" ? "" : "none";
    }

    if (refs.set) {
      const t = num(d.st?.attributes?.temperature);
      refs.set.textContent = t == null ? "--" : t.toFixed(1) + "°";
      refs.set.classList.toggle("off", d.st?.state === "off");
    }

    if (refs.up) {
      const p = num(d.st?.attributes?.current_position);
      refs.up.classList.toggle("on", p === 100);
      refs.down.classList.toggle("on", p === 0);
    }

    if (refs.reading) {
      refs.reading.textContent = this._readingFor(d);
      const idle = ["idle", "ready", "off", "unavailable", "standby"].includes(
        String(d.st?.state || "").toLowerCase()
      );
      refs.reading.classList.toggle("live", !idle);
    }
  }

  _renderScenes() {
    const el = this._el.scenes;
    const scenes = Array.isArray(this._config.scenes) ? this._config.scenes : [];
    if (!scenes.length) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const sig = scenes.map((s) => s.entity || s.name).join("|");
    if (sig !== this._sigScenes) {
      this._sigScenes = sig;
      el.textContent = "";
      scenes.forEach((s) => {
        const b = document.createElement("span");
        b.className = "scene";
        const ic = document.createElement("ha-icon");
        ic.setAttribute("icon", s.icon || "mdi:palette");
        const label = document.createElement("span");
        label.textContent = s.name || "";
        b.appendChild(ic);
        b.appendChild(label);
        b.addEventListener("click", () => {
          if (!s.entity) return;
          const dom = domainOf(s.entity);
          if (dom === "script") this._call("script", "turn_on", { entity_id: s.entity });
          else if (dom === "automation") this._call("automation", "trigger", { entity_id: s.entity });
          else if (dom === "button") this._call("button", "press", { entity_id: s.entity });
          else this._call("scene", "turn_on", { entity_id: s.entity });
          this._activeScene = s.name;
          this._render();
        });
        el.appendChild(b);
      });
      this._sceneNodes = Array.from(el.children);
    }
    const active = this._activeScenes(scenes);
    (this._sceneNodes || []).forEach((node, i) => {
      node.classList.toggle("active", !!scenes[i] && active.has(scenes[i].name));
    });
  }

  /* Which scene buttons light up.
   *
   * A scene entity has no on/off state; its state is the timestamp of the last
   * time it was activated. So the honest reading of "which scene is the house
   * in" is the most recently activated of the configured scenes. That survives a
   * reload and reflects scenes fired by voice, phone or automation, which the
   * design's local last-tapped flag did not.
   *
   * Scripts are different: they really do run, so highlight them while running.
   */
  _activeScenes(scenes) {
    const out = new Set();
    let newest = null;
    let newestAt = -1;

    scenes.forEach((s) => {
      if (!s.entity) return;
      const st = this._hass.states?.[s.entity];
      if (!st) return;

      if (domainOf(s.entity) === "script" && st.state === "on") {
        out.add(s.name);
        return;
      }
      const t = Date.parse(st.state);
      if (Number.isFinite(t) && t > newestAt) {
        newestAt = t;
        newest = s.name;
      }
    });

    if (newest) {
      /* scene_window: minutes after which nothing stays lit. 0 means no limit. */
      const win = num(this._config.scene_window) || 0;
      if (!win || Date.now() - newestAt <= win * 60000) out.add(newest);
    } else if (!out.size && this._activeScene) {
      /* nothing exposes usable state, so fall back to the last tap */
      out.add(this._activeScene);
    }
    return out;
  }
}

/* ============================================== card 3: wall-card-vacuum */

/* VacuumEntityFeature bits, so a button for an unsupported action can be hidden */
const VAC_FEAT = { RETURN_HOME: 16, LOCATE: 512, CLEAN_SPOT: 1024 };

const VAC_WORD = {
  docked: "Docked",
  cleaning: "Cleaning",
  paused: "Paused",
  returning: "Returning",
  idle: "Idle",
  error: "Error",
  unavailable: "Offline",
};

class WallCardVacuum extends WallBase {
  static getStubConfig(hass) {
    const v = Object.keys(hass?.states || {}).find((e) => e.startsWith("vacuum."));
    return { type: "custom:wall-card-vacuum", entity: v || "vacuum.robot" };
  }

  get _defaults() {
    return { map_label: "Ground floor", map_refresh: 10 };
  }

  get _canCompact() { return true; }

  get _tickMs() { return 10000; }

  _onConfig() { this._sigStats = ""; this._sigParts = ""; this._sigFan = ""; }

  static CSS = `
.pad.vac { padding: 56px 56px 32px; }
.v-head { display: flex; align-items: center; justify-content: space-between; }
.v-head-left { display: flex; align-items: center; gap: 14px; }
.v-batt {
  display: flex; align-items: center; gap: 9px;
  font: 500 15px/1 var(--wc-sans);
  letter-spacing: .14em; color: rgba(var(--wc-ink),.6);
}
.v-batt ha-icon { --mdc-icon-size: 21px; width: 21px; height: 21px; color: var(--wc-accent); }
.v-status { margin-top: 26px; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.v-word { font: 650 80px/.92 var(--wc-sans); letter-spacing: -.04em; }
.v-status-right {
  padding-bottom: 12px; text-align: right;
  font: 400 17px/1.45 var(--wc-sans); color: rgba(var(--wc-ink),.6);
}
.v-bar { margin-top: 26px; height: 4px; border-radius: 2px; background: rgba(var(--wc-ink),.1); overflow: hidden; }
/* scaled, not resized, so the animation runs on the GPU without relayout */
.v-bar-fill { height: 4px; width: 100%; background: var(--wc-accent); transform-origin: 0 50%; transform: scaleX(0); transition: transform .3s; }
.v-stats { margin: 28px -28px 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.v-stat { box-sizing: border-box; padding: 26px 28px 24px; display: flex; flex-direction: column; gap: 11px; }
.v-stat + .v-stat { border-left: 1px solid var(--wc-line, rgba(var(--wc-ink),.12)); }
.v-stat-label { font: 500 12.5px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.v-stat-value { font: 600 38px/1 var(--wc-sans); letter-spacing: -.03em; }
.v-stat-value small { font-size: 17px; color: rgba(var(--wc-ink),.6); }
.v-map {
  margin-top: 26px; flex: 1; min-height: 0; border: 1px solid rgba(var(--wc-ink),.12);
  border-radius: 14px; position: relative; overflow: hidden;
  background: repeating-linear-gradient(135deg, rgba(var(--wc-ink),.05) 0 2px, transparent 2px 11px);
}
.v-map img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.v-map-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; text-align: center;
}
.v-map-empty ha-icon { --mdc-icon-size: 40px; width: 40px; height: 40px; color: rgba(var(--wc-ink),.4); }
.v-map-empty span { font: 400 13px/1.5 var(--wc-mono); letter-spacing: .1em; color: rgba(var(--wc-ink),.55); white-space: pre-line; }
.v-map-label {
  position: absolute; left: 18px; top: 16px;
  font: 500 12px/1 var(--wc-mono);
  letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.5);
}
.v-suction { margin-top: 26px; }
.v-suction-label { font: 500 13px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.v-fan { margin-top: 14px; display: flex; border-radius: 12px; overflow: hidden; }
.v-fan-seg {
  flex: 1; box-sizing: border-box; padding: 15px 0; text-align: center;
  font: 500 13px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); cursor: pointer;
}
.v-fan-seg + .v-fan-seg { border-left: 1px solid var(--wc-line, rgba(var(--wc-ink),.12)); }
.v-fan-seg.on { background: var(--wc-accent-soft); color: var(--wc-accent); }
.v-actions { margin-top: 22px; display: flex; gap: 12px; }
.v-primary {
  flex: 1.6; height: 76px; border-radius: 18px; background: var(--wc-accent);
  display: flex; align-items: center; justify-content: center; gap: 12px; cursor: pointer;
}
.v-primary ha-icon { --mdc-icon-size: 26px; width: 26px; height: 26px; color: #000; }
.v-primary span { font: 600 16px/1 var(--wc-mono); letter-spacing: .2em; text-transform: uppercase; color: #000; }
.v-dock {
  flex: 1; height: 76px; border-radius: 18px; border: 1px solid rgba(var(--wc-ink),.16);
  display: flex; align-items: center; justify-content: center; gap: 11px; cursor: pointer;
}
.v-dock ha-icon { --mdc-icon-size: 24px; width: 24px; height: 24px; color: rgba(var(--wc-ink),.75); }
.v-dock span { font: 500 15px/1 var(--wc-mono); letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.75); }
.v-spot {
  width: 76px; height: 76px; border-radius: 18px; border: 1px solid rgba(var(--wc-ink),.16);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.v-spot ha-icon { --mdc-icon-size: 26px; width: 26px; height: 26px; color: rgba(var(--wc-ink),.75); }
.v-parts { margin-top: 26px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.v-part { display: flex; flex-direction: column; gap: 9px; }
.v-part-head { display: flex; align-items: baseline; justify-content: space-between; }
.v-part-label { font: 500 11.5px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.55); }
.v-part-pct { font: 400 15px/1 var(--wc-sans); color: rgba(var(--wc-ink),.8); }
.v-part-pct.low { color: var(--wc-accent); }
.v-part-track { height: 3px; background: rgba(var(--wc-ink),.1); }
.v-part-fill { height: 3px; background: rgba(var(--wc-ink),.45); }
.v-part-fill.low { background: var(--wc-accent); }
.vac .nav { margin-top: 26px; }

/* ---- compact (600 px wide tablets) ---- */
.compact .pad.vac { padding: 26px 20px 12px; }
.compact .v-batt { font-size: 13px; gap: 6px; }
.compact .v-batt ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
.compact .v-status { margin-top: 16px; gap: 14px; }
.compact .v-word { font-size: 52px; }
.compact .v-status-right { padding-bottom: 6px; font-size: 13px; }
.compact .v-bar { margin-top: 16px; }
.compact .v-stats { margin: 14px -16px 0; }
.compact .v-stat { padding: 14px 16px 12px; gap: 8px; }
.compact .v-stat-label { font-size: 11px; }
.compact .v-stat-value { font-size: 28px; }
.compact .v-stat-value small { font-size: 13px; }
.compact .v-map { margin-top: 14px; }
.compact .v-map-label { left: 14px; top: 12px; font-size: 11px; }
.compact .v-suction { margin-top: 16px; }
.compact .v-suction-label { font-size: 12px; }
.compact .v-fan { margin-top: 10px; }
.compact .v-fan-seg { padding: 0; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
.compact .v-actions { margin-top: 14px; gap: 8px; }
.compact .v-primary, .compact .v-dock { height: 60px; border-radius: 16px; gap: 10px; }
.compact .v-spot { width: 60px; height: 60px; border-radius: 16px; }
.compact .v-primary span { font-size: 14px; }
.compact .v-dock span { font-size: 13px; }
.compact .v-primary ha-icon, .compact .v-spot ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; }
.compact .v-dock ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; }
.compact .v-parts { margin-top: 16px; gap: 12px; }
.compact .v-part-label { font-size: 11px; letter-spacing: .04em; }
.compact .v-part-pct { font-size: 13px; }
.compact .vac .nav { margin-top: 16px; }
`;

  _template() {
    return `
      <div class="pad vac">
        <div class="v-head">
          <span class="v-head-left"><span class="dot v-dot"></span><span class="eyebrow v-name"></span></span>
          <span class="v-batt"><ha-icon class="v-batt-icon"></ha-icon><span class="v-batt-pct">--%</span></span>
        </div>
        <div class="v-status">
          <span class="v-word">--</span>
          <span class="v-status-right"><span class="v-sub"></span><br><span class="v-sub2"></span></span>
        </div>
        <div class="v-bar"><div class="v-bar-fill"></div></div>
        <div class="v-stats"></div>
        <div class="v-map">
          <img class="v-map-img hidden" alt="">
          <div class="v-map-empty">
            <ha-icon icon="mdi:floor-plan"></ha-icon>
            <span class="v-map-text"></span>
          </div>
          <span class="v-map-label"></span>
        </div>
        <div class="v-suction">
          <div class="v-suction-label">Suction</div>
          <div class="v-fan"></div>
        </div>
        <div class="v-actions">
          <span class="v-primary"><ha-icon class="v-primary-icon"></ha-icon><span class="v-primary-label"></span></span>
          <span class="v-dock"><ha-icon icon="mdi:home-import-outline"></ha-icon><span>Dock</span></span>
          <span class="v-spot v-btn-spot"><ha-icon icon="mdi:target-variant"></ha-icon></span>
          <span class="v-spot v-btn-locate"><ha-icon icon="mdi:map-marker"></ha-icon></span>
        </div>
        <div class="v-parts"></div>
        <div class="nav hidden"></div>
      </div>`;
  }

  _collect() {
    const q = (s) => this._q(s);
    Object.assign(this._el, {
      dot: q(".v-dot"),
      name: q(".v-name"),
      battIcon: q(".v-batt-icon"),
      battPct: q(".v-batt-pct"),
      word: q(".v-word"),
      sub: q(".v-sub"),
      sub2: q(".v-sub2"),
      barFill: q(".v-bar-fill"),
      stats: q(".v-stats"),
      mapImg: q(".v-map-img"),
      mapEmpty: q(".v-map-empty"),
      mapText: q(".v-map-text"),
      mapLabel: q(".v-map-label"),
      fan: q(".v-fan"),
      primary: q(".v-primary"),
      primaryIcon: q(".v-primary-icon"),
      primaryLabel: q(".v-primary-label"),
      dock: q(".v-dock"),
      spot: q(".v-btn-spot"),
      locate: q(".v-btn-locate"),
      parts: q(".v-parts"),
    });

    /* a failed fetch would otherwise leave the browser's broken-image glyph
       sitting in the middle of the panel */
    this._el.mapImg.addEventListener("error", () => {
      this._mapFailed = true;
      this._showMapPlaceholder(
        (this._config.map_entity || this._config.map_camera || "map") + "\nimage failed to load"
      );
    });
    this._el.mapImg.addEventListener("load", () => {
      this._mapFailed = false;
      this._el.mapEmpty.classList.add("hidden");
      this._el.mapImg.classList.remove("hidden");
    });

    this._el.primary.addEventListener("click", () => this._primaryAction());
    this._el.dock.addEventListener("click", () =>
      this._call("vacuum", "return_to_base", { entity_id: this._config.entity }));
    this._el.spot.addEventListener("click", () =>
      this._call("vacuum", "clean_spot", { entity_id: this._config.entity }));
    this._el.locate.addEventListener("click", () =>
      this._call("vacuum", "locate", { entity_id: this._config.entity }));
    this._el.word.classList.add("tap");
    this._el.word.addEventListener("click", () => this._moreInfo(this._config.entity));
  }

  _vac() { return this._hass.states?.[this._config.entity]; }

  _primaryAction() {
    const st = this._vac();
    if (!st) return;
    const id = this._config.entity;
    if (st.state === "cleaning") return this._call("vacuum", "pause", { entity_id: id });
    return this._call("vacuum", "start", { entity_id: id });
  }

  _update() {
    const el = this._el;
    const c = this._config;
    const st = this._vac();

    el.name.textContent = c.name || st?.attributes?.friendly_name || c.entity || "Vacuum";

    const state = st ? st.state : "unavailable";
    const cleaning = state === "cleaning";
    el.dot.style.background = cleaning ? "var(--wc-accent)" : "rgba(var(--wc-ink),.35)";
    el.word.textContent = VAC_WORD[state] || titleCase(state);

    /* battery: newer integrations publish a separate sensor instead of an
       attribute on the vacuum entity, so prefer battery_entity when given */
    const batt = this._battery(st);
    const charging = this._isCharging(state);
    el.battPct.textContent = batt == null ? "--%" : Math.round(batt) + "%";
    el.battIcon.setAttribute("icon", this._battIcon(batt, charging));

    /* status detail lines */
    const [s1, s2] = this._statusLines(st, state);
    el.sub.textContent = s1;
    el.sub2.textContent = s2;

    /* progress bar */
    const progSt = c.progress_entity ? this._hass.states?.[c.progress_entity] : null;
    const prog = progSt ? num(progSt.state) : batt;
    el.barFill.style.transform = `scaleX(${(prog == null ? 0 : Math.max(0, Math.min(100, prog))) / 100})`;

    this._renderButtons(st);
    this._renderStats();
    this._renderMap(state);
    this._renderFan(st);
    this._renderPrimary(state);
    this._renderParts();
  }

  _battery(st) {
    const id = this._config.battery_entity;
    if (id) {
      const b = this._hass.states?.[id];
      const n = b ? num(b.state) : null;
      if (n != null) return n;
    }
    return num(st?.attributes?.battery_level);
  }

  _isCharging(state) {
    const id = this._config.charging_entity;
    if (id) {
      const c = this._hass.states?.[id];
      if (c) return c.state === "on";
    }
    return state === "docked" || state === "charging";
  }

  _battIcon(batt, charging) {
    if (batt == null) return "mdi:battery-unknown";
    const step = Math.round(batt / 10) * 10;
    if (charging) return step >= 100 ? "mdi:battery-charging-100" : `mdi:battery-charging-${step || 10}`;
    if (step >= 100) return "mdi:battery";
    if (step <= 0) return "mdi:battery-alert";
    return `mdi:battery-${step}`;
  }

  _statusLines(st, state) {
    const c = this._config;
    if (!st) return ["Entity unavailable", c.entity || "Set entity: in the card config"];
    const fan = st.attributes?.fan_speed;
    const err = st.attributes?.error;
    switch (state) {
      case "cleaning": return [c.cleaning_label || "Cleaning run in progress", fan ? fan + " suction" : ""];
      case "paused": return ["Paused mid-run", "Resume or send home"];
      case "returning": return ["Heading to the dock", "Run saved"];
      case "error": return [err || "Needs attention", "Check the robot"];
      case "docked": {
        const last = this._lastRunText();
        const b = this._battery(st);
        return [last || "Charging", b == null ? "On the dock" : `Battery ${Math.round(b)}%`];
      }
      default: return [titleCase(state), fan ? fan + " suction" : ""];
    }
  }

  _lastRunText() {
    const id = this._config.last_clean_end;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) return "";
    const d = new Date(st.state);
    if (isNaN(d.getTime())) return "";
    return "Charging · last run " + this._fmtTime(d);
  }

  /* An entity that cannot do something should not offer a button for it.
     When supported_features is missing we assume yes rather than hide. */
  _supports(st, bit) {
    const f = num(st?.attributes?.supported_features);
    return f == null ? true : (f & bit) !== 0;
  }

  _renderButtons(st) {
    const c = this._config;
    const show = (node, cfgKey, bit) => {
      const wanted = c[cfgKey] !== false;
      node.classList.toggle("hidden", !(wanted && this._supports(st, bit)));
    };
    show(this._el.dock, "show_dock", VAC_FEAT.RETURN_HOME);
    show(this._el.spot, "show_spot", VAC_FEAT.CLEAN_SPOT);
    show(this._el.locate, "show_locate", VAC_FEAT.LOCATE);
  }

  _renderStats() {
    const el = this._el.stats;
    const defs = Array.isArray(this._config.stats) ? this._config.stats : [];
    if (!defs.length) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.style.gridTemplateColumns = `repeat(${defs.length}, minmax(0, 1fr))`;
    const sig = defs.map((s) => s.entity || s.label).join("|");
    if (sig !== this._sigStats) {
      this._sigStats = sig;
      el.textContent = "";
      defs.forEach(() => {
        const cell = document.createElement("div");
        cell.className = "v-stat";
        const l = document.createElement("span");
        l.className = "v-stat-label";
        const v = document.createElement("span");
        v.className = "v-stat-value";
        cell.appendChild(l);
        cell.appendChild(v);
        el.appendChild(cell);
      });
      this._statNodes = Array.from(el.children);
    }
    defs.forEach((def, i) => {
      const node = this._statNodes[i];
      if (!node) return;
      const st = def.entity ? this._hass.states?.[def.entity] : null;
      node.querySelector(".v-stat-label").textContent =
        def.label || st?.attributes?.friendly_name || def.entity || "";
      const n = st ? num(st.state) : null;
      const value = n == null ? (st ? st.state : "--") : String(Math.round(n));
      const unit = def.unit != null ? def.unit : st?.attributes?.unit_of_measurement || "";
      const v = node.querySelector(".v-stat-value");
      v.textContent = value;
      if (unit) {
        const small = document.createElement("small");
        small.textContent = " " + unit;
        v.appendChild(small);
      }
    });
  }

  _renderMap(state) {
    const el = this._el;
    const id = this._config.map_entity || this._config.map_camera;
    const ent = id ? this._hass.states?.[id] : null;
    el.mapLabel.textContent = this._config.map_label || "";

    /* Both camera and image entities publish a signed entity_picture path, so
       use that rather than hand-building a proxy URL. The official Roborock
       integration serves its map as an image entity, which has no camera proxy. */
    const pic = ent?.attributes?.entity_picture;

    if (!ent || !pic) {
      this._showMapPlaceholder(
        !id
          ? "no map entity configured\nset map_entity: in the card config"
          : !ent
            ? `${id}\nnot found`
            : `${id}\nhas no image to show`
      );
      return;
    }

    const domain = domainOf(ent.entity_id);
    let bust;
    if (domain === "image") {
      /* an image entity's state is the timestamp of the latest picture */
      bust = ent.state;
    } else if (state === "cleaning") {
      bust = Math.floor(Date.now() / ((num(this._config.map_refresh) || 10) * 1000));
    } else {
      bust = ent.last_updated || "static";
    }
    /* a data: URI carries its payload in the path, so a query would corrupt it */
    const src = pic.startsWith("data:")
      ? pic
      : pic + (pic.indexOf("?") === -1 ? "?" : "&") + "c=" + encodeURIComponent(bust);

    if (src !== this._mapSrc) {
      this._mapSrc = src;
      el.mapImg.src = src;
    }
    if (!this._mapFailed) {
      el.mapEmpty.classList.add("hidden");
      el.mapImg.classList.remove("hidden");
    }
  }

  _showMapPlaceholder(text) {
    this._el.mapImg.classList.add("hidden");
    this._el.mapEmpty.classList.remove("hidden");
    this._el.mapText.textContent = text;
  }

  _renderFan(st) {
    const el = this._el.fan;
    const list = this._config.fan_speeds || st?.attributes?.fan_speed_list || [];
    if (!list.length) {
      el.parentElement.classList.add("hidden");
      return;
    }
    el.parentElement.classList.remove("hidden");
    const sig = list.join("|");
    if (sig !== this._sigFan) {
      this._sigFan = sig;
      el.textContent = "";
      list.forEach((name) => {
        const seg = document.createElement("span");
        seg.className = "v-fan-seg";
        seg.textContent = name;
        seg.addEventListener("click", () =>
          this._call("vacuum", "set_fan_speed", { entity_id: this._config.entity, fan_speed: name }));
        el.appendChild(seg);
      });
      this._fanNodes = Array.from(el.children);
    }
    const current = st?.attributes?.fan_speed;
    (this._fanNodes || []).forEach((n, i) => n.classList.toggle("on", list[i] === current));
  }

  _renderPrimary(state) {
    const el = this._el;
    const cleaning = state === "cleaning";
    el.primaryIcon.setAttribute("icon", cleaning ? "mdi:pause" : "mdi:play");
    el.primaryLabel.textContent = cleaning ? "Pause" : state === "paused" ? "Resume" : "Start clean";
  }

  _renderParts() {
    const el = this._el.parts;
    const defs = Array.isArray(this._config.consumables) ? this._config.consumables : [];
    if (!defs.length) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.style.gridTemplateColumns = `repeat(${Math.min(defs.length, 4)}, minmax(0, 1fr))`;
    const sig = defs.map((d) => d.entity || d.label).join("|");
    if (sig !== this._sigParts) {
      this._sigParts = sig;
      el.textContent = "";
      defs.forEach(() => {
        const p = document.createElement("div");
        p.className = "v-part";
        p.innerHTML =
          '<div class="v-part-head"><span class="v-part-label"></span><span class="v-part-pct"></span></div>' +
          '<div class="v-part-track"><div class="v-part-fill"></div></div>';
        el.appendChild(p);
      });
      this._partNodes = Array.from(el.children);
    }
    const threshold = num(this._config.consumable_warn) ?? 45;
    defs.forEach((def, i) => {
      const node = this._partNodes[i];
      if (!node) return;
      const st = def.entity ? this._hass.states?.[def.entity] : null;
      const raw = st ? num(st.state) : null;
      node.querySelector(".v-part-label").textContent =
        def.label || st?.attributes?.friendly_name || def.entity || "";
      const pctEl = node.querySelector(".v-part-pct");
      const fill = node.querySelector(".v-part-fill");

      /* Some integrations report a percentage left, others report hours or
         minutes left. Give a `max` and the card converts to a percentage;
         overdue sensors go negative, which clamps to zero. */
      const max = num(def.max);
      let n = raw;
      if (max && max > 0 && raw != null) n = (raw / max) * 100;
      if (n != null) n = Math.max(0, Math.min(100, n));

      pctEl.textContent = n == null ? "--" : Math.round(n) + "%";
      fill.style.width = (n == null ? 0 : n) + "%";
      const low = n != null && n < threshold;
      pctEl.classList.toggle("low", low);
      fill.classList.toggle("low", low);
    });
  }
}

/* ================================================ card 4: wall-card-phone */

const FAN_NAMES = ["Off", "Low", "Medium", "High"];

const ALARM_LABEL = {
  disarmed: "Disarmed · all clear",
  armed_home: "Armed · home mode",
  armed_away: "Armed · away mode",
  armed_night: "Armed · night mode",
  armed_vacation: "Armed · vacation mode",
  arming: "Arming…",
  pending: "Entry delay",
  triggered: "Triggered",
};

class WallCardPhone extends WallBase {
  static getStubConfig() {
    return { type: "custom:wall-card-phone" };
  }

  get _fluid() { return true; }

  get _defaults() {
    return { eyebrow: "At home", camera_refresh: 10, max_width: 520 };
  }

  get _tickMs() { return 10000; }

  _onConfig() { this._sigScenes = ""; this._sigCams = ""; }

  static CSS = `
:host { display: block; width: 100%; height: auto; }
.phone {
  display: flex; flex-direction: column;
  min-height: 100dvh;
  max-width: var(--wc-max, 520px);
  margin: 0 auto;
  font-family: var(--wc-sans);
  color: var(--wc-fg, #F4F4F2);
  background: var(--wc-bg, #000);
  -webkit-font-smoothing: antialiased;
}
.p-body { flex: 1; padding: var(--wc-pad-top, 26px) 20px 8px; }
/* with no tab bar the content would otherwise sit on the screen edge */


.p-head { display: flex; align-items: center; justify-content: space-between; }
.p-head-left { display: flex; align-items: center; gap: 10px; }
.p-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--wc-accent); flex: none; }
.p-eyebrow, .p-active {
  font: 500 11px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.5);
}
.p-active { font-weight: 400; letter-spacing: .18em; }

.p-greetrow { margin-top: 16px; display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; }
.p-greet {
  font: 650 clamp(30px, 10vw, 42px)/.95 var(--wc-sans);
  letter-spacing: -.035em; white-space: nowrap;
  min-width: 0; overflow: hidden; text-overflow: ellipsis;
  /* a line-height under 1 puts descenders outside the line box, where the
     overflow rule that gives us the ellipsis would clip them */
  padding-bottom: 8px;
}
.p-lines {
  /* never let a long greeting squeeze these into a stack of wrapped fragments */
  /* bottom padding matches the greeting's, so the two stay aligned */
  flex: none; padding-bottom: 13px; text-align: right;
  font: 400 12px/1.4 var(--wc-sans); color: rgba(var(--wc-ink),.5);
}

/* camera */
.p-cam { margin-top: 20px; border-radius: 20px; overflow: hidden; border: 1px solid rgba(var(--wc-ink),.12); background: var(--wc-surface); }
.p-cam-view {
  position: relative; height: 190px;
  background: linear-gradient(160deg, #161616 0%, #0C0C0C 60%, #111 100%);
  display: flex; align-items: center; justify-content: center;
}
.p-cam-view img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.p-cam-view.tappable { cursor: pointer; }
.p-privacy {
  position: absolute; top: 14px; right: 14px;
  --mdc-icon-size: 16px; width: 32px; height: 32px; border-radius: 999px;
  background: rgba(0,0,0,.72); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.7);
}
.p-privacy.on { color: var(--wc-accent); }
.p-privacy.tappable { cursor: pointer; }
.p-cam-ph { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.p-cam-empty { --mdc-icon-size: 44px; width: 44px; height: 44px; color: rgba(var(--wc-ink),.18); }
.p-cam-ph-text {
  font: 500 10px/1 var(--wc-mono);
  letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.35);
}
.p-cam-ph.priv .p-cam-empty { color: var(--wc-accent); opacity: .5; }
.p-cam-ph.priv .p-cam-ph-text { color: var(--wc-accent); opacity: .75; }
.p-live {
  position: absolute; top: 14px; left: 14px; display: flex; align-items: center; gap: 7px;
  padding: 6px 11px; border-radius: 999px; background: rgba(0,0,0,.72);
}
.p-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--wc-danger); display: block; }
.p-live span { font: 500 10px/1 var(--wc-mono); letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.85); }
.p-cam-hint {
  position: absolute; bottom: 14px; right: 14px;
  font: 400 11px/1 var(--wc-sans); letter-spacing: .14em; color: rgba(var(--wc-ink),.5);
}
.p-cam-foot { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; gap: 10px; }
.p-cam-name { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.p-cam-name b { font: 400 16px/1 var(--wc-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-cam-name span { font: 400 12px/1 var(--wc-sans); color: rgba(var(--wc-ink),.5); }
.p-cam-pick { display: flex; gap: 8px; flex: none; }
.p-cam-btn {
  --mdc-icon-size: 19px; width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(var(--wc-ink),.14); background: transparent;
  display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.6); cursor: pointer;
}
.p-cam-btn.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }

/* shared tile look */
.ptile {
  border-radius: 20px; border: 1px solid rgba(var(--wc-ink),.12);
  background: rgba(var(--wc-ink),.03); padding: 16px; box-sizing: border-box;
}
.ptile.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); }
.ptile .p-ic { --mdc-icon-size: 26px; width: 26px; height: 26px; color: rgba(var(--wc-ink),.45); flex: none; }
.ptile.on .p-ic { color: var(--wc-accent); }
.p-state {
  font: 500 10px/1 var(--wc-mono);
  letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.62);
}
.ptile.on .p-state { color: var(--wc-accent); }
.p-title { font: 400 17px/1 var(--wc-sans); }

/* alarm */
.p-alarm { margin-top: 12px; display: flex; align-items: center; gap: 14px; cursor: pointer; }
.p-alarm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.p-alarm-main b { font: 400 17px/1 var(--wc-sans); }
.p-alarm-main span { font: 400 12px/1 var(--wc-sans); letter-spacing: .06em; color: rgba(var(--wc-ink),.55); }
.p-pill {
  width: 62px; height: 34px; border-radius: 17px; background: rgba(var(--wc-ink),.07);
  border: 1px solid rgba(var(--wc-ink),.18); position: relative; flex: none;
}
.ptile.on .p-pill { background: var(--wc-accent); border-color: var(--wc-accent); }
.p-knob {
  position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%;
  background: rgba(var(--wc-ink),.55); transform: translateX(0); transition: transform .18s;
}
.ptile.on .p-knob { background: #000; transform: translateX(28px); }

/* tile grid */
.p-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.p-sq { min-height: 132px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; }
.p-sq-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.p-sq-bot { display: flex; flex-direction: column; gap: 8px; }
.p-steps { display: flex; gap: 5px; }
.p-steps i { flex: 1; height: 4px; border-radius: 2px; background: rgba(var(--wc-ink),.12); display: block; }
.p-steps i.on { background: var(--wc-accent); }

.p-ac-bot { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.p-ac-left { display: flex; flex-direction: column; gap: 6px; }
.p-set { font: 600 26px/1 var(--wc-sans); letter-spacing: -.02em; color: rgba(var(--wc-ink),.4); }
.ptile.on .p-set { color: var(--wc-fg, #F4F4F2); }
.p-ac-btns { display: flex; gap: 6px; }
.p-mini {
  --mdc-icon-size: 16px; width: 34px; height: 34px; border-radius: 10px;
  border: 1px solid rgba(var(--wc-ink),.18); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.75); cursor: pointer;
}

/* media */
.p-media { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 14px; position: relative; overflow: hidden; }
.p-media.art { border-color: rgba(var(--wc-ink),.16); }
.p-media-bg {
  position: absolute; inset: 0; pointer-events: none;
  opacity: 0; transition: opacity .45s ease;
}
.p-media-bg.show { opacity: 1; }
/* light blur on a quarter-size layer, scaled up: looks the same as a big
   blur but costs a fraction of the GPU time on a low-end tablet */
.p-media-bg.blur {
  inset: auto; left: 50%; top: 50%; width: 25%; height: 25%;
  background-size: cover; background-position: center;
  filter: blur(8px) saturate(1.5); transform: translate(-50%,-50%) scale(5.2);
}
.p-media-scrim { position: absolute; inset: 0; pointer-events: none; background: rgba(0,0,0,.62); opacity: 0; }
.p-media-scrim.show { opacity: 1; }
.p-media-top, .p-media-btns { position: relative; z-index: 1; }
.p-media-top { display: flex; align-items: center; gap: 14px; }
.p-art {
  width: 52px; height: 52px; border-radius: 14px; background: rgba(var(--wc-ink),.07);
  display: flex; align-items: center; justify-content: center; flex: none; overflow: hidden;
}
.p-art img { width: 100%; height: 100%; object-fit: cover; }
.p-art ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; color: rgba(var(--wc-ink),.45); }
.ptile.on .p-art ha-icon { color: var(--wc-accent); }
.p-media-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.p-media-txt b { font: 400 16px/1.15 var(--wc-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-media-txt span { font: 400 12px/1 var(--wc-sans); color: rgba(var(--wc-ink),.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-media-btns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.p-mbtn {
  --mdc-icon-size: 20px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(var(--wc-ink),.14); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.7); cursor: pointer;
}
.p-mbtn.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }

/* vacuum */
.p-vac { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; }
.p-vac-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.p-vac-txt b { font: 400 16px/1 var(--wc-sans); }
.p-vac-txt span { font: 400 12px/1 var(--wc-sans); color: rgba(var(--wc-ink),.5); }
.p-run {
  padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(var(--wc-ink),.14);
  font: 500 10px/1 var(--wc-mono); letter-spacing: .2em;
  text-transform: uppercase; color: rgba(var(--wc-ink),.7); cursor: pointer; flex: none;
}
.ptile.on .p-run { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.p-dock {
  --mdc-icon-size: 19px; width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(var(--wc-ink),.14); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink),.7); cursor: pointer; flex: none;
}

/* lighting */
.p-sec { margin-top: 22px; display: flex; align-items: baseline; justify-content: space-between; }
.p-sec b { font: 500 11px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.p-sec span { font: 400 12px/1 var(--wc-sans); letter-spacing: .1em; color: rgba(var(--wc-ink),.45); }
.p-scenes { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.p-scene {
  border-radius: 16px; border: 1px solid rgba(var(--wc-ink),.12); background: transparent;
  padding: 14px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px;
  cursor: pointer; color: rgba(var(--wc-ink),.6);
}
.p-scene.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.p-scene ha-icon { --mdc-icon-size: 21px; width: 21px; height: 21px; }
.p-scene span { font: 500 10px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; text-align: center; }

.p-tail { height: 16px; }

/* pinned tab bar */
`;

  _template() {
    return `
      <div class="phone">
        <div class="p-body">
          <div class="p-head">
            <span class="p-head-left"><span class="p-dot"></span><span class="p-eyebrow"></span></span>
            <span class="p-active"></span>
          </div>

          <div class="p-greetrow">
            <span class="p-greet"></span>
            <span class="p-lines"><span class="p-indoor"></span><br><span class="p-outdoor"></span></span>
          </div>

          <div class="p-cam hidden">
            <div class="p-cam-view">
              <img class="p-cam-img hidden" alt="">
              <span class="p-cam-ph">
                <ha-icon class="p-cam-empty" icon="mdi:cctv"></ha-icon>
                <span class="p-cam-ph-text"></span>
              </span>
              <span class="p-live"><i></i><span>Live</span></span>
              <ha-icon class="p-privacy hidden"></ha-icon>
              <span class="p-cam-hint"></span>
            </div>
            <div class="p-cam-foot">
              <span class="p-cam-name"><b></b><span></span></span>
              <span class="p-cam-pick"></span>
            </div>
          </div>

          <div class="ptile p-alarm hidden">
            <ha-icon class="p-ic p-alarm-icon"></ha-icon>
            <span class="p-alarm-main"><b>Alarm system</b><span></span></span>
            <span class="p-pill"><span class="p-knob"></span></span>
          </div>

          <div class="p-grid">
            <div class="ptile p-sq p-fan hidden">
              <span class="p-sq-top"><ha-icon class="p-ic" icon="mdi:fan"></ha-icon><span class="p-state"></span></span>
              <span class="p-sq-bot">
                <span class="p-title">Fan</span>
                <span class="p-steps"><i></i><i></i><i></i></span>
              </span>
            </div>

            <div class="ptile p-sq p-ac hidden">
              <span class="p-sq-top"><ha-icon class="p-ic" icon="mdi:air-conditioner"></ha-icon><span class="p-state p-ac-state"></span></span>
              <span class="p-ac-bot">
                <span class="p-ac-left"><span class="p-title">A/C</span><span class="p-set"></span></span>
                <span class="p-ac-btns">
                  <ha-icon class="p-mini p-ac-down" icon="mdi:minus"></ha-icon>
                  <ha-icon class="p-mini p-ac-up" icon="mdi:plus"></ha-icon>
                </span>
              </span>
            </div>

            <div class="ptile p-media hidden">
              <span class="p-media-bg"></span>
              <span class="p-media-scrim"></span>
              <span class="p-media-top">
                <span class="p-art"><img class="p-art-img hidden" alt=""><ha-icon icon="mdi:music"></ha-icon></span>
                <span class="p-media-txt"><b></b><span></span></span>
              </span>
              <span class="p-media-btns">
                <ha-icon class="p-mbtn p-prev" icon="mdi:skip-previous"></ha-icon>
                <ha-icon class="p-mbtn p-play" icon="mdi:play"></ha-icon>
                <ha-icon class="p-mbtn p-next" icon="mdi:skip-next"></ha-icon>
              </span>
            </div>

            <div class="ptile p-vac hidden">
              <ha-icon class="p-ic" icon="mdi:robot-vacuum"></ha-icon>
              <span class="p-vac-txt"><b>Vacuum</b><span></span></span>
              <span class="p-run"></span>
              <ha-icon class="p-dock" icon="mdi:home-import-outline"></ha-icon>
            </div>
          </div>

          <div class="p-sec p-light-head hidden"><b>Lighting</b><span></span></div>
          <div class="p-scenes hidden"></div>
          <div class="p-tail"></div>
        </div>

        <div class="wc-foot"><div class="nav hidden"></div></div>
      </div>`;
  }

  _collect() {
    const q = (sel) => this._q(sel);
    Object.assign(this._el, {
      eyebrow: q(".p-eyebrow"),
      active: q(".p-active"),
      greet: q(".p-greet"),
      indoor: q(".p-indoor"),
      outdoor: q(".p-outdoor"),

      phone: q(".phone"),
      foot: q(".wc-foot"),
      cam: q(".p-cam"),
      camView: q(".p-cam-view"),
      camPh: q(".p-cam-ph"),
      camPhText: q(".p-cam-ph-text"),
      camLive: q(".p-live"),
      camPrivacy: q(".p-privacy"),
      camImg: q(".p-cam-img"),
      camEmpty: q(".p-cam-empty"),
      camHint: q(".p-cam-hint"),
      camName: q(".p-cam-name b"),
      camSub: q(".p-cam-name span"),
      camPick: q(".p-cam-pick"),

      alarm: q(".p-alarm"),
      alarmIcon: q(".p-alarm-icon"),
      alarmSub: q(".p-alarm-main span"),

      fan: q(".p-fan"),
      fanState: q(".p-fan .p-state"),
      fanSteps: q(".p-fan .p-steps"),

      ac: q(".p-ac"),
      acState: q(".p-ac-state"),
      acSet: q(".p-ac .p-set"),
      acUp: q(".p-ac-up"),
      acDown: q(".p-ac-down"),

      media: q(".p-media"),
      mediaBg: q(".p-media-bg"),
      mediaScrim: q(".p-media-scrim"),
      art: q(".p-art"),
      artImg: q(".p-art-img"),
      track: q(".p-media-txt b"),
      trackSub: q(".p-media-txt span"),
      prev: q(".p-prev"),
      play: q(".p-play"),
      next: q(".p-next"),

      vac: q(".p-vac"),
      vacSub: q(".p-vac-txt span"),
      run: q(".p-run"),
      dock: q(".p-dock"),

      lightHead: q(".p-light-head"),
      sceneSub: q(".p-light-head span"),
      scenes: q(".p-scenes"),
    });

    const el = this._el;
    el.camImg.addEventListener("error", () => {
      el.camImg.classList.add("hidden");
      el.camPh.classList.remove("hidden");
    });
    el.camImg.addEventListener("load", () => {
      if (this._camTapState === "on") return;
      el.camImg.classList.remove("hidden");
      el.camPh.classList.add("hidden");
    });

    /* The badge always opens the privacy switch. The picture opens the big
       camera view, except when privacy is on and there is nothing to look at,
       where the only useful action is the switch that unblocks it. */
    el.camPrivacy.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (this._camTap) this._moreInfo(this._camTap);
    });
    el.camView.addEventListener("click", () => {
      const blocked = this._camTapState === "on";
      if (this._camTap && (blocked || !this._camExpand)) return this._moreInfo(this._camTap);
      if (this._camEntity) return this._moreInfo(this._camEntity);
      if (this._camTap) this._moreInfo(this._camTap);
    });
    el.alarm.addEventListener("click", () => this._toggleAlarm());
    el.fan.addEventListener("click", () => this._cycleFan());
    el.acState.addEventListener("click", (ev) => { ev.stopPropagation(); this._toggleAc(); });
    el.acUp.addEventListener("click", (ev) => { ev.stopPropagation(); this._nudgeAc(1); });
    el.acDown.addEventListener("click", (ev) => { ev.stopPropagation(); this._nudgeAc(-1); });
    el.prev.addEventListener("click", () => this._mmSkip(this._config.media_player, -1));
    el.next.addEventListener("click", () => this._mmSkip(this._config.media_player, 1));
    el.play.addEventListener("click", () => this._media("media_play_pause"));
    el.run.addEventListener("click", (ev) => { ev.stopPropagation(); this._vacRun(); });

    /* hold a tile to switch its device off */
    this._wireLongOff(el.fan, () => this._config.fan);
    this._wireLongOff(el.ac, () => this._config.climate, ".p-ac-btns");
    this._wireLongOff(el.media, () => this._config.media_player, ".p-media-btns");
    this._wireLongOff(el.vac, () => this._config.vacuum, ".p-run, .p-dock");
    el.dock.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._call("vacuum", "return_to_base", { entity_id: this._config.vacuum });
    });
    el.vac.addEventListener("click", () => this._moreInfo(this._config.vacuum));
    el.media.addEventListener("click", (ev) => {
      if (ev.target.closest(".p-media-btns")) return;
      this._moreInfo(this._config.media_player);
    });
  }

  /* -------------------------------------------------------------- actions */

  _toggleAlarm() {
    const id = this._config.alarm;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) return;
    if (domainOf(id) !== "alarm_control_panel") return this._call(domainOf(id), "toggle", { entity_id: id });
    const armed = st.state !== "disarmed";
    const data = { entity_id: id };
    if (this._config.alarm_code) data.code = String(this._config.alarm_code);
    this._call(
      "alarm_control_panel",
      armed ? "alarm_disarm" : this._config.alarm_arm_service || "alarm_arm_away",
      data
    );
  }

  _fanLevel(st) {
    if (!st || st.state !== "on") return 0;
    const pct = num(st.attributes?.percentage);
    if (pct == null) return 3;
    return pct <= 0 ? 0 : pct <= 34 ? 1 : pct <= 67 ? 2 : 3;
  }

  _cycleFan() {
    const id = this._config.fan;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) return;
    const next = (this._fanLevel(st) + 1) % 4;
    if (next === 0) return this._call("fan", "turn_off", { entity_id: id });
    this._call("fan", "turn_on", { entity_id: id, percentage: [0, 33, 67, 100][next] });
  }

  _toggleAc() {
    const id = this._config.climate;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) return;
    this._call("climate", "set_hvac_mode", {
      entity_id: id,
      hvac_mode: st.state === "off" ? (this._config.climate_mode || "cool") : "off",
    });
  }

  _nudgeAc(delta) {
    const id = this._config.climate;
    const st = id ? this._hass.states?.[id] : null;
    const cur = num(st?.attributes?.temperature);
    if (cur == null) return;
    const step = num(st.attributes?.target_temp_step) || 0.5;
    const min = num(st.attributes?.min_temp) ?? 16;
    const max = num(st.attributes?.max_temp) ?? 30;
    this._call("climate", "set_temperature", {
      entity_id: id,
      temperature: Math.max(min, Math.min(max, cur + delta * step)),
    });
  }

  _media(service) {
    const id = this._config.media_player;
    if (id) this._call("media_player", service, { entity_id: id });
  }

  _vacRun() {
    const id = this._config.vacuum;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) return;
    this._call("vacuum", st.state === "cleaning" ? "pause" : "start", { entity_id: id });
  }

  /* -------------------------------------------------------------- render */

  _update() {
    const c = this._config;
    const el = this._el;
    this.style.setProperty("--wc-max", (num(c.max_width) || 520) + "px");
    this.style.setProperty("--wc-pad-top", (num(c.padding_top) ?? 18) + "px");
    const hasNav = Array.isArray(c.nav) && c.nav.length > 0;
    el.phone.classList.toggle("no-nav", !hasNav);

    el.eyebrow.textContent = c.eyebrow || "At home";
    el.greet.textContent = c.greeting || this._greeting();

    this._renderLines();
    this._renderCamera();
    this._renderAlarm();
    this._renderFan();
    this._renderAc();
    this._renderMedia();
    this._renderVacuum();
    this._renderScenes();

    el.active.textContent = this._activeCount() + " active";
  }

  /* One word, so the weather lines beside it always have room at phone width.
     Override with `greeting:` for something longer. */
  _greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Night";
    if (h < 12) return "Morning";
    if (h < 18) return "Afternoon";
    return "Evening";
  }

  _activeCount() {
    const c = this._config;
    const on = (id, test) => {
      const st = id ? this._hass.states?.[id] : null;
      return st ? test(st) : false;
    };
    let n = 0;
    if (on(c.fan, (s) => s.state === "on")) n++;
    if (on(c.climate, (s) => s.state !== "off" && s.state !== "unavailable")) n++;
    if (on(c.media_player, (s) => s.state === "playing")) n++;
    if (on(c.vacuum, (s) => s.state === "cleaning")) n++;
    if (on(c.alarm, (s) => s.state !== "disarmed")) n++;
    return n;
  }

  _renderLines() {
    const c = this._config;
    const el = this._el;
    const t = c.indoor_temperature ? this._hass.states?.[c.indoor_temperature] : null;
    const h = c.indoor_humidity ? this._hass.states?.[c.indoor_humidity] : null;
    const inParts = [];
    if (t && num(t.state) != null) inParts.push(`${Math.round(num(t.state) * 10) / 10}°`);
    if (h && num(h.state) != null) inParts.push(`${Math.round(num(h.state))}%`);
    el.indoor.textContent = inParts.length ? "Inside " + inParts.join(" · ") : "";

    const w = c.weather ? this._hass.states?.[c.weather] : null;
    if (!w) {
      el.outdoor.textContent = "";
      return;
    }
    const temp = num(w.attributes?.temperature);
    const cond = COND_LABEL[w.state] || titleCase(w.state);
    el.outdoor.textContent =
      "Outside " + (temp == null ? "" : Math.round(temp) + "° · ") + cond.toLowerCase();
  }

  _renderCamera() {
    const c = this._config;
    const el = this._el;
    const cfg = c.camera;
    if (!cfg || !(cfg.entity || (cfg.cameras || []).length)) {
      el.cam.classList.add("hidden");
      return;
    }
    el.cam.classList.remove("hidden");

    const list = (cfg.cameras && cfg.cameras.length)
      ? cfg.cameras
      : [{ entity: cfg.entity, icon: "mdi:cctv" }];

    if (this._camPick == null || !list.some((x) => x.entity === this._camPick)) {
      this._camPick = (cfg.entity && list.some((x) => x.entity === cfg.entity))
        ? cfg.entity
        : list[0].entity;
    }

    const sig = list.map((x) => x.entity).join("|");
    if (sig !== this._sigCams) {
      this._sigCams = sig;
      el.camPick.textContent = "";
      list.forEach((item) => {
        const b = document.createElement("ha-icon");
        b.className = "p-cam-btn";
        b.setAttribute("icon", item.icon || "mdi:cctv");
        b.addEventListener("click", () => {
          this._camPick = item.entity;
          this._render();
        });
        el.camPick.appendChild(b);
      });
      this._camNodes = Array.from(el.camPick.children);
    }
    (this._camNodes || []).forEach((n, i) => n.classList.toggle("on", list[i].entity === this._camPick));
    el.camPick.classList.toggle("hidden", list.length < 2);

    const picked = list.find((x) => x.entity === this._camPick) || list[0];
    const st = this._hass.states?.[picked.entity];
    el.camName.textContent =
      picked.name || st?.attributes?.friendly_name || picked.entity || "Camera";

    /* tapping the picture opens more-info for whatever entity is named here,
       which gives a plain toggle for something like a Tapo privacy switch */
    const tapId = picked.tap_entity || cfg.tap_entity;
    const tapSt = tapId ? this._hass.states?.[tapId] : null;
    this._camTap = tapId || null;
    this._camTapState = tapSt ? tapSt.state : null;
    this._camEntity = picked.entity || null;
    this._camExpand = cfg.expand !== false;
    el.camView.classList.toggle("tappable", !!(tapId || this._camEntity));
    if (tapSt) {
      el.camPrivacy.classList.add("tappable");
      el.camPrivacy.classList.remove("hidden");
      el.camPrivacy.setAttribute(
        "icon",
        picked.tap_icon || cfg.tap_icon || this._iconFor(tapSt, tapId)
      );
      el.camPrivacy.classList.toggle("on", tapSt.state === "on");
    } else {
      el.camPrivacy.classList.add("hidden");
    }

    /* A Tapo camera serves its own "privacy mode on" frame, which looks out of
       place here. Draw our own placeholder and stop requesting new frames. */
    const blocked = this._camTapState === "on";
    el.camLive.classList.toggle("hidden", blocked);
    el.camPh.classList.toggle("priv", blocked);
    if (blocked) {
      el.camImg.classList.add("hidden");
      el.camPh.classList.remove("hidden");
      el.camEmpty.setAttribute("icon", cfg.privacy_icon || "mdi:eye-off-outline");
      el.camPhText.textContent = cfg.privacy_text || "Privacy mode on";
      el.camHint.textContent = "";
      this._camSrc = null;
    } else {
      el.camEmpty.setAttribute("icon", cfg.placeholder_icon || "mdi:cctv");
      el.camPhText.textContent = "";
    }

    const motionId = picked.motion || cfg.motion;
    const motion = motionId ? this._hass.states?.[motionId] : null;
    el.camSub.textContent = motion ? "Last motion " + this._relTime(motion.last_changed) : "";

    if (blocked) return;

    const pic = st?.attributes?.entity_picture;
    if (!pic) {
      el.camImg.classList.add("hidden");
      el.camPh.classList.remove("hidden");
      el.camHint.textContent = st ? "no snapshot" : "camera unavailable";
      return;
    }
    el.camHint.textContent = "";
    const bucket = Math.floor(Date.now() / ((num(c.camera_refresh) || 10) * 1000));
    const src = pic.startsWith("data:")
      ? pic
      : pic + (pic.indexOf("?") === -1 ? "?" : "&") + "c=" + bucket;
    if (src !== this._camSrc) {
      this._camSrc = src;
      el.camImg.src = src;
    }
  }

  _renderAlarm() {
    const el = this._el;
    const id = this._config.alarm;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.alarm.classList.add("hidden");
      return;
    }
    el.alarm.classList.remove("hidden");
    const armed = st.state !== "disarmed";
    el.alarm.classList.toggle("on", armed);
    el.alarmIcon.setAttribute("icon", armed ? "mdi:shield-home" : "mdi:shield-off-outline");
    el.alarmSub.textContent = ALARM_LABEL[st.state] || this._stateLabel(st);
  }

  _renderFan() {
    const el = this._el;
    const id = this._config.fan;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.fan.classList.add("hidden");
      return;
    }
    el.fan.classList.remove("hidden");
    const lvl = this._fanLevel(st);
    el.fan.classList.toggle("on", lvl > 0);
    el.fanState.textContent = FAN_NAMES[lvl];
    Array.from(el.fanSteps.children).forEach((bar, i) => bar.classList.toggle("on", lvl >= i + 1));
  }

  _renderAc() {
    const el = this._el;
    const id = this._config.climate;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.ac.classList.add("hidden");
      return;
    }
    el.ac.classList.remove("hidden");
    const on = st.state !== "off" && st.state !== "unavailable";
    el.ac.classList.toggle("on", on);
    el.acState.textContent = titleCase(st.state);
    const t = num(st.attributes?.temperature);
    el.acSet.textContent = t == null ? "--" : t.toFixed(1) + "°";
  }

  _renderMedia() {
    const el = this._el;
    const id = this._config.media_player;
    const raw = id ? this._hass.states?.[id] : null;
    if (!raw) {
      el.media.classList.add("hidden");
      return;
    }
    const st = this._mmHold(raw);
    if (this._config.skip_sources !== false && (raw.attributes?.source_list || []).length) this._mmLoadKinds(id);
    el.media.classList.remove("hidden");
    const playing = st.state === "playing";
    el.media.classList.toggle("on", playing);
    el.play.setAttribute("icon", playing ? "mdi:pause" : "mdi:play");
    el.play.classList.toggle("on", playing);

    const a = st.attributes || {};
    el.track.textContent = a.media_title || this._stateLabel(st);
    const bits = [];
    if (a.media_artist) bits.push(a.media_artist);
    /* artist only by default; `show_player_name: true` adds the speaker name */
    if (this._config.show_player_name && a.friendly_name) bits.push(a.friendly_name);
    el.trackSub.textContent = bits.join(" · ");

    const pic = a.entity_picture;
    if (pic) {
      if (pic !== this._artSrc) {
        this._artSrc = pic;
        el.artImg.src = pic;
      }
      el.artImg.classList.remove("hidden");
    } else {
      el.artImg.classList.add("hidden");
    }

    /* Keep the artwork colour while a track is merely loaded, not only while it
       is running, so pausing does not drain the tile. */
    this._applyArtBackground(this._hasTrack(st) ? pic : null);
  }

  _hasTrack(st) {
    const state = st.state;
    if (["playing", "paused", "buffering"].indexOf(state) >= 0) return true;
    /* some players sit in a generic state with a track still cued up */
    if (["off", "idle", "standby", "unavailable", "unknown"].indexOf(state) >= 0) return false;
    return !!st.attributes?.media_title;
  }

  /* Album art here is often tiny, so rather than showing the picture we pull
     its dominant colours and paint a Material-style gradient. That is immune to
     the source resolution. `media_art: blur` shows the picture blurred instead,
     and is also the fallback when the canvas cannot be read. */
  _applyArtBackground(pic) {
    const el = this._el;
    const mode = this._config.media_art || "gradient";

    if (!pic || mode === "none") {
      el.mediaBg.classList.remove("show");
      el.mediaScrim.classList.remove("show");
      el.media.classList.remove("art");
      this._artBgSrc = null;
      return;
    }
    if (pic === this._artBgSrc) return;
    this._artBgSrc = pic;

    if (mode === "blur") return this._artBlur(pic);

    this._artPalette(pic, (colours) => {
      if (pic !== this._artBgSrc) return;
      if (!colours) {
        console.debug("wall-card: could not read artwork colours, falling back to blur");
        return this._artBlur(pic);
      }
      const [c1, c2] = colours;
      const lift = num(this._config.media_art_strength);
      const k = lift == null ? 1 : Math.max(0.2, Math.min(2, lift));
      el.mediaBg.style.backgroundImage =
        `linear-gradient(135deg, ${toneFrom(c1, 0.19 * k)} 0%, ${toneFrom(c2, 0.11 * k)} 100%)`;
      el.mediaBg.className = "p-media-bg show";
      el.mediaScrim.classList.remove("show");
      el.media.classList.add("art");
    });
  }

  _artBlur(pic) {
    const el = this._el;
    el.mediaBg.style.backgroundImage = `url("${pic}")`;
    el.mediaBg.className = "p-media-bg blur show";
    el.mediaScrim.classList.add("show");
    el.media.classList.add("art");
  }

  _artPalette(src, cb) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => cb(null);
    img.onload = () => {
      try {
        const n = 24;
        const cv = document.createElement("canvas");
        cv.width = n;
        cv.height = n;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, n, n);
        const d = ctx.getImageData(0, 0, n, n).data;

        /* coarse 3-bit-per-channel buckets, weighted towards saturated pixels
           so a mostly-black sleeve still yields its one real colour */
        const bins = new Map();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
          const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
          const e = bins.get(key) || { n: 0, w: 0, r: 0, g: 0, b: 0 };
          e.n++;
          e.w += 1 + sat * 2;
          e.r += r; e.g += g; e.b += b;
          bins.set(key, e);
        }
        const sorted = Array.from(bins.values()).sort((a, b) => b.w - a.w);
        if (!sorted.length) return cb(null);
        const avg = (e) => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)];
        cb([avg(sorted[0]), avg(sorted[1] || sorted[0])]);
      } catch (e) {
        cb(null);
      }
    };
    img.src = src;
  }

  _renderVacuum() {
    const el = this._el;
    const id = this._config.vacuum;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.vac.classList.add("hidden");
      return;
    }
    el.vac.classList.remove("hidden");
    const cleaning = st.state === "cleaning";
    el.vac.classList.toggle("on", cleaning);

    const battId = this._config.vacuum_battery;
    const b = battId ? num(this._hass.states?.[battId]?.state) : num(st.attributes?.battery_level);
    const word = VAC_WORD[st.state] || titleCase(st.state);
    el.vacSub.textContent = b == null ? word : `${word} · ${Math.round(b)}%`;
    el.run.textContent = cleaning ? "Pause" : st.state === "paused" ? "Resume" : "Run";
  }

  _renderScenes() {
    const el = this._el;
    const scenes = Array.isArray(this._config.scenes) ? this._config.scenes : [];
    if (!scenes.length) {
      el.scenes.classList.add("hidden");
      el.lightHead.classList.add("hidden");
      return;
    }
    el.scenes.classList.remove("hidden");
    el.lightHead.classList.remove("hidden");

    const sig = scenes.map((s) => s.entity || s.name).join("|");
    if (sig !== this._sigScenes) {
      this._sigScenes = sig;
      el.scenes.textContent = "";
      scenes.forEach((s) => {
        const b = document.createElement("span");
        b.className = "p-scene";
        const ic = document.createElement("ha-icon");
        ic.setAttribute("icon", s.icon || "mdi:palette");
        const label = document.createElement("span");
        label.textContent = s.name || "";
        b.appendChild(ic);
        b.appendChild(label);
        b.addEventListener("click", () => {
          if (!s.entity) return;
          const dom = domainOf(s.entity);
          if (dom === "script") this._call("script", "turn_on", { entity_id: s.entity });
          else if (dom === "automation") this._call("automation", "trigger", { entity_id: s.entity });
          else if (dom === "button") this._call("button", "press", { entity_id: s.entity });
          else if (dom === "light" || dom === "switch") this._call(dom, "toggle", { entity_id: s.entity });
          else this._call("scene", "turn_on", { entity_id: s.entity });
          this._activeScene = s.name;
          this._render();
        });
        if (s.entity && ["light", "switch", "fan", "input_boolean"].includes(domainOf(s.entity))) {
          this._wireLongOff(b, () => s.entity);
        }
        el.scenes.appendChild(b);
      });
      this._sceneNodes = Array.from(el.scenes.children);
    }

    const active = WallCardControls.prototype._activeScenes.call(this, scenes);
    (this._sceneNodes || []).forEach((node, i) => {
      node.classList.toggle("on", !!scenes[i] && active.has(scenes[i].name));
    });
    const names = scenes.filter((s) => active.has(s.name)).map((s) => s.name);
    this._el.sceneSub.textContent = names.length ? names[0] : "";
  }
}

/* ================================================== card 5: wall-card-out */

const ALARMO_LABEL = {
  disarmed: "Disarmed",
  armed_home: "Armed · home",
  armed_away: "Armed · away",
  armed_night: "Armed · night",
  armed_vacation: "Armed · vacation",
  armed_custom_bypass: "Armed · custom",
  arming: "Arming",
  pending: "Entry delay",
  triggered: "Triggered",
  unavailable: "Unavailable",
};

class WallCardOut extends WallBase {
  constructor() {
    super();
    this._hours = [];
    this._unsub = null;
    this._code = "";
    this._padOpen = false;
    this._pendingSince = 0;
    this._codeError = "";
  }

  static getStubConfig() {
    return { type: "custom:wall-card-out" };
  }

  get _fluid() { return true; }

  get _defaults() {
    return { eyebrow: "Out the door", hours: 6, max_width: 520, door_name: "Front door" };
  }

  /* countdowns need to stay honest, so tick every 20s */
  get _tickMs() { return 20000; }

  _onConfig() {
    this._sigDeps = -1;
    this._sigHours = "";
    if (this._weatherWas && this._weatherWas !== this._config.weather) {
      this._unsubscribeForecast();
      this._hours = [];
    }
    this._weatherWas = this._config.weather;
  }

  _onFirstHass() { this._subscribeForecast(); }
  _onConnect() { this._subscribeForecast(); }
  _onDisconnect() { this._unsubscribeForecast(); }

  _subscribeForecast() {
    const id = this._config?.weather;
    if (!this._hass || !id || this._unsub || !this.isConnected) return;
    const conn = this._hass.connection;
    if (!conn?.subscribeMessage) return;
    try {
      this._unsub = conn.subscribeMessage(
        (msg) => {
          this._hours = (msg && msg.forecast) || [];
          this._render();
        },
        { type: "weather/subscribe_forecast", forecast_type: "hourly", entity_id: id }
      );
      this._unsub.catch(() => { this._unsub = null; });
    } catch (e) {
      this._unsub = null;
    }
  }

  _unsubscribeForecast() {
    if (!this._unsub) return;
    const p = this._unsub;
    this._unsub = null;
    try { p.then((f) => typeof f === "function" && f()).catch(() => {}); } catch (e) { /* noop */ }
  }

  static CSS = `
.out {
  display: flex; flex-direction: column; min-height: 100dvh;
  max-width: var(--wc-max, 520px); margin: 0 auto;
  background: var(--wc-bg, #000);
  font-family: var(--wc-sans);
  color: var(--wc-fg, #F4F4F2);
  -webkit-font-smoothing: antialiased;
}
.obody { flex: 1; padding: var(--wc-pad-top, 26px) 20px 8px; }

.o-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.o-hours:not(.hidden) + .o-head { margin-top: 20px; }
.o-head-left { display: flex; align-items: center; gap: 10px; flex: none; }
.o-head-left .eyebrow { white-space: nowrap; }
.o-stop { flex: 1; min-width: 0; text-align: right; }
.o-stop {
  font: 400 11px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.5);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.out .eyebrow { font-size: 11px; }

/* hero: the next departure */
.o-hero { margin-top: 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; }
.o-mins {
  font: 650 clamp(52px, 17vw, 72px)/.9 var(--wc-sans);
  letter-spacing: -.04em;
}
.o-mins small { font-size: 22px; letter-spacing: 0; color: rgba(var(--wc-ink),.55); }
.o-hero-right { flex: none; text-align: right; padding-bottom: 7px; min-width: 0; }
.o-hero-line {
  display: inline-block; min-width: 44px; padding: 4px 9px; text-align: center;
  border: 1px solid rgba(var(--wc-ink),.28); border-radius: 6px;
  font: 500 17px/1 var(--wc-sans);
}
.o-hero-dest {
  margin-top: 7px; font: 400 13px/1.3 var(--wc-sans);
  color: rgba(var(--wc-ink),.6); max-width: 190px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.o-lead {
  margin-top: 16px; font: 500 10px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.5);
}
.o-lead.now { color: var(--wc-accent); }
.o-none { margin-top: 18px; font: 400 17px/1.4 var(--wc-sans); color: rgba(var(--wc-ink),.45); }

/* the following departures */
.o-deps { margin-top: 20px; }
.o-dep {
  display: flex; align-items: center; gap: 12px; padding: 12px 0 11px;
  border-top: 1px solid rgba(var(--wc-ink),.09);
}
.o-dep-line {
  min-width: 40px; padding: 4px 0; text-align: center;
  border: 1px solid rgba(var(--wc-ink),.22); border-radius: 6px;
  font: 500 14px/1 var(--wc-sans);
  color: rgba(var(--wc-ink),.85); flex: none;
}
.o-dep-dest {
  flex: 1; min-width: 0; font: 400 15px/1.2 var(--wc-sans);
  color: rgba(var(--wc-ink),.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.o-dep-time { font: 400 13px/1 var(--wc-sans); color: rgba(var(--wc-ink),.5); }
.o-dep-mins { min-width: 52px; text-align: right; font: 400 19px/1 var(--wc-sans); }
.o-dep-mins small { font-size: 11px; color: rgba(var(--wc-ink),.55); }

/* hourly weather */
.o-hours {
  margin: 0 -20px; padding: 0 20px; display: flex; gap: 8px; overflow-x: auto;
}
.o-hour {
  flex: none; width: 58px; border-radius: 14px; border: 1px solid rgba(var(--wc-ink),.1);
  padding: 11px 0 10px; display: flex; flex-direction: column; align-items: center; gap: 7px;
}
.o-hour-t { font: 500 10px/1 var(--wc-sans); letter-spacing: .14em; color: rgba(var(--wc-ink),.5); }
.o-hour ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; color: var(--wc-accent); }
.o-hour-deg { font: 400 17px/1 var(--wc-sans); }
.o-hour-rain { font: 400 9px/1 var(--wc-sans); letter-spacing: .1em; color: rgba(var(--wc-ink),.45); }

/* tiles */
.o-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.o-tile {
  border-radius: 20px; border: 1px solid rgba(var(--wc-ink),.12);
  background: rgba(var(--wc-ink),.03); padding: 16px; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 12px; min-height: 104px;
  justify-content: space-between;
}
.o-tile.alert { border-color: var(--wc-accent); background: var(--wc-accent-soft); }
.o-tile.missing, .o-crow.missing { opacity: .4; }
.o-crow.missing .o-cpill { display: none; }
.o-miss { font-family: var(--wc-mono); font-size: 11px; letter-spacing: 0; }
.o-tile ha-icon.o-ic { --mdc-icon-size: 24px; width: 24px; height: 24px; color: rgba(var(--wc-ink),.45); }
.o-tile.alert ha-icon.o-ic { color: var(--wc-accent); }
.o-tile b { display: block; font: 400 16px/1 var(--wc-sans); }
.o-tile span.o-sub { display: block; margin-top: 6px; font: 400 12px/1.3 var(--wc-sans); color: rgba(var(--wc-ink),.55); }

/* alarm */
.o-alarm { grid-column: 1 / -1; gap: 14px; }
.o-alarm-top { display: flex; align-items: center; gap: 14px; }
.o-alarm-txt { flex: 1; min-width: 0; }
.o-act {
  flex: none; padding: 12px 16px; border-radius: 12px;
  border: 1px solid rgba(var(--wc-ink),.16);
  font: 500 10px/1 var(--wc-mono);
  letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink),.75); cursor: pointer;
}
.o-act.primary { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }

.o-pad { display: none; }
.o-pad.open { display: block; }
.o-dots { display: flex; justify-content: center; gap: 9px; height: 10px; margin-bottom: 12px; }
.o-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(var(--wc-ink),.18); display: block; }
.o-dots i.on { background: var(--wc-accent); }
.o-keys { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.o-key {
  height: 50px; border-radius: 14px; border: 1px solid rgba(var(--wc-ink),.12);
  display: flex; align-items: center; justify-content: center;
  font: 400 21px/1 var(--wc-sans);
  color: var(--wc-fg, #F4F4F2); cursor: pointer; user-select: none;
}
.o-key.util { --mdc-icon-size: 19px; color: rgba(var(--wc-ink),.6); }
.o-key.go { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.o-err {
  margin-top: 10px; text-align: center;
  font: 500 10px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: var(--wc-danger);
  min-height: 10px;
}
/* before you go */
.o-sec { margin-top: 22px; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.o-sec b { font: 500 11px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink),.6); }
.o-sec span { font: 400 12px/1 var(--wc-sans); letter-spacing: .1em; color: rgba(var(--wc-ink),.45); }
.o-alloff {
  padding: 8px 12px; border-radius: 10px; border: 1px solid var(--wc-accent);
  background: var(--wc-accent-soft); color: var(--wc-accent);
  font: 500 10px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; cursor: pointer; flex: none;
}
.o-check { margin-top: 8px; }
.o-crow {
  display: flex; align-items: center; gap: 12px; padding: 13px 0 12px;
  border-bottom: 1px solid rgba(var(--wc-ink),.09);
}
.o-crow ha-icon.o-cic { --mdc-icon-size: 22px; width: 24px; height: 22px; flex: none; color: rgba(var(--wc-ink),.32); }
.o-crow.on ha-icon.o-cic { color: var(--wc-accent); }
.o-cmain { flex: 1; min-width: 0; }
.o-cmain b { display: block; font: 400 16px/1.15 var(--wc-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.o-cmain span { display: block; margin-top: 4px; font: 400 12px/1 var(--wc-sans); color: rgba(var(--wc-ink),.5); }
.o-crow.on .o-cmain span { color: var(--wc-accent); }
.o-cpill {
  width: 52px; height: 30px; border-radius: 15px; background: rgba(var(--wc-ink),.07);
  border: 1px solid rgba(var(--wc-ink),.18); position: relative; flex: none; cursor: pointer;
  transition: background .18s;
}
.o-crow.on .o-cpill { background: var(--wc-accent); border-color: var(--wc-accent); }
.o-cknob {
  position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
  background: rgba(var(--wc-ink),.55); transform: translateX(0); transition: transform .18s;
}
.o-crow.on .o-cknob { background: #000; transform: translateX(22px); }
.o-tail { height: 16px; }
`;

  _template() {
    return `
      <div class="out">
        <div class="obody">
          <div class="o-hours noscroll hidden"></div>

          <div class="o-head">
            <span class="o-head-left"><span class="p-dot o-dot"></span><span class="eyebrow o-eyebrow"></span></span>
            <span class="o-stop"></span>
          </div>

          <div class="o-hero hidden">
            <span class="o-mins"></span>
            <span class="o-hero-right">
              <span class="o-hero-line"></span>
              <span class="o-hero-dest"></span>
            </span>
          </div>
          <div class="o-lead hidden"></div>
          <div class="o-none hidden"></div>

          <div class="o-deps"></div>

          <div class="o-grid">
            <div class="o-tile o-motion hidden">
              <ha-icon class="o-ic o-motion-icon" icon="mdi:motion-sensor"></ha-icon>
              <span><b class="o-motion-name"></b><span class="o-sub o-motion-sub"></span></span>
            </div>

            <div class="o-tile o-alarm hidden">
              <div class="o-alarm-top">
                <ha-icon class="o-ic o-alarm-icon"></ha-icon>
                <span class="o-alarm-txt"><b class="o-alarm-name">Alarm</b><span class="o-sub o-alarm-sub"></span></span>
                <span class="o-act o-alarm-act"></span>
              </div>
              <div class="o-pad">
                <div class="o-dots"></div>
                <div class="o-keys"></div>
                <div class="o-err"></div>
              </div>
            </div>
          </div>

          <div class="o-sec o-check-head hidden"><b></b><span class="o-check-right"></span></div>
          <div class="o-check hidden"></div>

          <div class="o-tail"></div>
        </div>
        <div class="wc-foot"><div class="nav hidden"></div></div>
      </div>`;
  }

  _collect() {
    const q = (sel) => this._q(sel);
    Object.assign(this._el, {
      wrap: q(".out"),
      grid: q(".o-grid"),
      eyebrow: q(".o-eyebrow"),
      stop: q(".o-stop"),
      hero: q(".o-hero"),
      mins: q(".o-mins"),
      heroLine: q(".o-hero-line"),
      heroDest: q(".o-hero-dest"),
      lead: q(".o-lead"),
      none: q(".o-none"),
      checkHead: q(".o-check-head"),
      checkTitle: q(".o-check-head b"),
      checkRight: q(".o-check-right"),
      check: q(".o-check"),
      deps: q(".o-deps"),
      hours: q(".o-hours"),


      motion: q(".o-motion"),
      motionName: q(".o-motion-name"),
      motionSub: q(".o-motion-sub"),

      alarm: q(".o-alarm"),
      alarmIcon: q(".o-alarm-icon"),
      alarmSub: q(".o-alarm-sub"),
      alarmAct: q(".o-alarm-act"),
      pad: q(".o-pad"),
      dots: q(".o-dots"),
      keys: q(".o-keys"),
      err: q(".o-err"),
    });

    this._el.alarmAct.addEventListener("click", () => this._alarmAction());
    this._el.alarm.addEventListener("click", (ev) => {
      if (ev.target.closest(".o-act") || ev.target.closest(".o-pad")) return;
      this._moreInfo(this._config.alarm);
    });
    this._buildKeys();
  }

  _buildKeys() {
    const el = this._el.keys;
    el.textContent = "";
    const add = (label, cls, fn, icon) => {
      const k = document.createElement(icon ? "ha-icon" : "span");
      k.className = "o-key" + (cls ? " " + cls : "");
      if (icon) k.setAttribute("icon", icon);
      else k.textContent = label;
      k.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); });
      el.appendChild(k);
    };
    for (let n = 1; n <= 9; n++) add(String(n), "", () => this._digit(String(n)));
    add("", "util", () => this._backspace(), "mdi:backspace-outline");
    add("0", "", () => this._digit("0"));
    add("", "go util", () => this._submit(), "mdi:check");
  }

  /* ------------------------------------------------------------ keypad */

  _digit(d) {
    if (this._code.length >= 12) return;
    this._code += d;
    this._codeError = "";
    this._render();
  }

  _backspace() {
    this._code = this._code.slice(0, -1);
    this._codeError = "";
    this._render();
  }

  _alarmState() {
    const id = this._config.alarm;
    return id ? this._hass.states?.[id] : null;
  }

  _needsCode(st) {
    if (!st) return false;
    const fmt = st.attributes?.code_format;
    if (!fmt) return false;
    if (fmt !== "number") return false;           /* a text code needs a real keyboard */
    const armed = st.state !== "disarmed";
    if (armed) return true;                        /* disarming nearly always needs one */
    return st.attributes?.code_arm_required !== false;
  }

  _alarmAction() {
    const st = this._alarmState();
    if (!st) return;
    if (st.attributes?.code_format === "text") return this._moreInfo(this._config.alarm);
    if (this._needsCode(st)) {
      this._padOpen = !this._padOpen;
      this._code = "";
      this._codeError = "";
      return this._render();
    }
    this._sendAlarm(st, null);
  }

  _submit() {
    const st = this._alarmState();
    if (!st || !this._code) return;
    this._sendAlarm(st, this._code);
  }

  _sendAlarm(st, code) {
    const data = { entity_id: this._config.alarm };
    if (code) data.code = code;
    const armed = st.state !== "disarmed";
    this._call(
      "alarm_control_panel",
      armed ? "alarm_disarm" : this._config.alarm_arm_service || "alarm_arm_away",
      data
    );
    /* Alarmo does not report a bad code back to us, so treat "nothing changed"
       as a failure after a grace period rather than pretending it worked */
    this._pendingSince = Date.now();
    this._pendingFrom = st.state;
    this._code = "";
    this._codeError = "";
    this._render();
  }

  /* ------------------------------------------------------------ render */

  _update() {
    const c = this._config;
    const el = this._el;
    this.style.setProperty("--wc-max", (num(c.max_width) || 520) + "px");
    this.style.setProperty("--wc-pad-top", (num(c.padding_top) ?? 26) + "px");
    el.wrap.classList.toggle("no-nav", !(Array.isArray(c.nav) && c.nav.length));

    el.eyebrow.textContent = c.eyebrow || "Out the door";
    this._renderDepartures();
    this._renderHours();
    this._renderDoors();
    this._renderMotion();
    this._renderAlarm();
    this._renderCheck();
  }

  _departureRows() {
    const cfg = this._config.departures;
    if (!cfg || !cfg.entity) return [];
    const st = this._hass.states?.[cfg.entity];
    const f = Object.assign(
      { line: "line", destination: "destination", time: "time", minutes: "minutes" },
      cfg.fields || {}
    );
    let rows = pick(st?.attributes, cfg.attribute || "departures");
    if (!Array.isArray(rows)) rows = [];
    return rows.slice(0, (cfg.count || 3) + 4).map((r) => {
      const when = this._parseWhen(pick(r, f.time));
      let mins = num(pick(r, f.minutes));
      if (mins == null && when) mins = Math.max(0, Math.round((when - Date.now()) / 60000));
      return {
        line: pick(r, f.line) ?? "--",
        dest: pick(r, f.destination) ?? "",
        when,
        mins,
      };
    });
  }

  _renderDepartures() {
    const el = this._el;
    const cfg = this._config.departures;
    const rows = this._departureRows();

    el.stop.textContent =
      cfg?.subtitle ||
      (cfg?.entity ? this._hass.states?.[cfg.entity]?.attributes?.friendly_name || "" : "");

    if (!rows.length) {
      el.hero.classList.add("hidden");
      el.lead.classList.add("hidden");
      el.none.classList.remove("hidden");
      el.none.textContent = cfg?.entity ? "No departures right now" : "No departures sensor configured";
      el.deps.textContent = "";
      this._sigDeps = -1;
      return;
    }

    el.none.classList.add("hidden");
    el.hero.classList.remove("hidden");

    /* The number people actually need is when to leave, not when the bus goes.
       If the walk no longer fits before the next one, show the next one you can
       still catch rather than a countdown you have already lost. */
    const walk = Math.max(0, num(this._config.walk_time) ?? 5);
    let idx = rows.findIndex((r) => r.mins != null && r.mins - walk >= 0);
    if (idx < 0) idx = 0;

    const first = rows[idx];
    const leave = first.mins == null ? null : first.mins - walk;

    el.mins.textContent = leave == null ? "--" : String(Math.max(0, leave));
    const small = document.createElement("small");
    small.textContent = " min";
    el.mins.appendChild(small);
    el.heroLine.textContent = first.line;
    el.heroDest.textContent =
      first.dest + (first.when ? " · " + this._fmtTime(first.when) : "");

    el.lead.classList.remove("hidden");
    if (!walk) {
      el.lead.textContent = "Departs in";
      el.lead.classList.remove("now");
    } else if (leave != null && leave <= 0) {
      el.lead.textContent = "Leave now";
      el.lead.classList.add("now");
    } else {
      el.lead.textContent = `Leave in · ${walk} min walk`;
      el.lead.classList.remove("now");
    }

    const rest = rows.slice(idx + 1, idx + 1 + Math.max(0, (cfg.count || 3) - 1));
    if (rest.length !== this._sigDeps) {
      this._sigDeps = rest.length;
      el.deps.textContent = "";
      rest.forEach(() => {
        const d = document.createElement("div");
        d.className = "o-dep";
        ["o-dep-line", "o-dep-dest", "o-dep-time", "o-dep-mins"].forEach((cls) => {
          const sp = document.createElement("span");
          sp.className = cls;
          d.appendChild(sp);
        });
        el.deps.appendChild(d);
      });
    }
    const nodes = el.deps.querySelectorAll(".o-dep");
    rest.forEach((r, i) => {
      const n = nodes[i];
      if (!n) return;
      n.querySelector(".o-dep-line").textContent = r.line;
      n.querySelector(".o-dep-dest").textContent = r.dest;
      n.querySelector(".o-dep-time").textContent = r.when ? this._fmtTime(r.when) : "";
      const m = n.querySelector(".o-dep-mins");
      m.textContent = r.mins == null ? "--" : String(r.mins);
      if (r.mins != null) {
        const sm = document.createElement("small");
        sm.textContent = " min";
        m.appendChild(sm);
      }
    });
  }

  _renderHours() {
    const el = this._el.hours;
    const w = this._config.weather ? this._hass.states?.[this._config.weather] : null;
    const want = Math.max(1, Math.min(12, num(this._config.hours) || 6));
    /* older Home Assistant builds, and any setup where the subscription is
       unavailable, still publish a forecast attribute */
    const src = this._hours.length ? this._hours : (w?.attributes?.forecast || []);
    const list = src.slice(0, want);
    if (!w || !list.length) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");

    const sig = list.map((h) => h.datetime + "|" + h.condition + "|" + h.temperature).join(",");
    if (sig === this._sigHours) return;
    this._sigHours = sig;

    el.textContent = "";
    const night = this._isNight();
    list.forEach((h) => {
      const cell = document.createElement("div");
      cell.className = "o-hour";

      const t = document.createElement("span");
      t.className = "o-hour-t";
      try {
        t.textContent = new Intl.DateTimeFormat(this._locale(), {
          hour: "2-digit",
          minute: "2-digit",
          hour12: String(this._config.time_format) === "12",
        }).format(new Date(h.datetime));
      } catch (e) {
        t.textContent = "";
      }

      const ic = document.createElement("ha-icon");
      const cond = h.condition;
      ic.setAttribute("icon", (night && COND_ICON_NIGHT[cond]) || COND_ICON[cond] || "mdi:weather-cloudy");

      const deg = document.createElement("span");
      deg.className = "o-hour-deg";
      const tt = num(h.temperature != null ? h.temperature : h.native_temperature);
      deg.textContent = tt == null ? "--°" : Math.round(tt) + "°";

      cell.appendChild(t);
      cell.appendChild(ic);
      cell.appendChild(deg);

      const pop = num(h.precipitation_probability);
      if (pop != null && pop >= 10) {
        const r = document.createElement("span");
        r.className = "o-hour-rain";
        r.textContent = Math.round(pop) + "%";
        cell.appendChild(r);
      }
      el.appendChild(cell);
    });
  }

  _isNight() {
    const sun = this._hass?.states?.["sun.sun"];
    if (sun) return sun.state === "below_horizon";
    const h = new Date().getHours();
    return h < 6 || h >= 21;
  }

  _doorList() {
    const c = this._config;
    if (Array.isArray(c.doors) && c.doors.length) {
      return c.doors.map((d) => (typeof d === "string" ? { entity: d } : d || {}));
    }
    return c.door ? [{ entity: c.door, name: c.door_name }] : [];
  }

  _renderDoors() {
    const el = this._el;
    const list = this._doorList().filter((d) => d.entity);
    this._warnMissing(list.map((d) => d.entity));

    const sig = list.map((d) => d.entity).join("|");
    if (sig !== this._sigDoors) {
      this._sigDoors = sig;
      Array.from(el.grid.querySelectorAll(".o-door")).forEach((n) => n.remove());
      this._doorNodes = list.map((d) => {
        const tile = document.createElement("div");
        tile.className = "o-tile o-door";
        tile.innerHTML =
          '<ha-icon class="o-ic o-door-icon"></ha-icon>' +
          '<span><b class="o-door-name"></b><span class="o-sub o-door-sub"></span></span>';
        tile.addEventListener("click", () => this._moreInfo(d.entity));
        el.grid.insertBefore(tile, el.motion);
        return tile;
      });
    }

    list.forEach((d, i) => {
      const tile = this._doorNodes[i];
      if (!tile) return;
      const st = this._hass.states?.[d.entity];
      if (!st) {
        tile.classList.add("missing");
        tile.classList.remove("alert");
        tile.querySelector(".o-door-icon").setAttribute("icon", "mdi:help-circle-outline");
        tile.querySelector(".o-door-name").textContent = d.name || "Unknown entity";
        const sub = tile.querySelector(".o-door-sub");
        sub.textContent = d.entity;
        sub.classList.add("o-miss");
        return;
      }
      tile.classList.remove("missing");
      tile.querySelector(".o-door-sub").classList.remove("o-miss");
      const open = st.state === "on";
      tile.classList.toggle("alert", open);
      tile.querySelector(".o-door-icon").setAttribute(
        "icon",
        d.icon || (open ? "mdi:door-open" : "mdi:door-closed")
      );
      tile.querySelector(".o-door-name").textContent =
        d.name || st.attributes?.friendly_name || "Door";
      tile.querySelector(".o-door-sub").textContent =
        (open ? "Open" : "Closed") + " · " + this._relTime(st.last_changed);
    });
  }

  /* ---- the leaving checklist ---- */

  _checkList() {
    const cfg = this._config.check;
    const raw = Array.isArray(cfg) ? cfg : (cfg && cfg.entities) || [];
    const list = raw
      .map((e) => (typeof e === "string" ? { entity: e } : e || {}))
      .filter((e) => e.entity);
    this._warnMissing(list.map((e) => e.entity));
    return list;
  }

  /* A mistyped entity used to vanish without trace, which reads as "the card is
     broken" rather than "that id does not exist". Name them instead. */
  _warnMissing(ids) {
    const unknown = ids.filter((id) => id && !this._hass.states?.[id]);
    if (!unknown.length) return;
    const key = unknown.sort().join(",");
    if (key === this._warnedMissing) return;
    this._warnedMissing = key;
    console.warn("wall-card-out: no such entity: " + unknown.join(", "));
  }

  _checkOn(st) {
    const s = st.state;
    if (s === "on" || s === "open" || s === "playing" || s === "cleaning") return true;
    if (["off", "closed", "idle", "standby", "unavailable", "unknown", "docked", "paused"].indexOf(s) >= 0) {
      return false;
    }
    /* climate and similar: anything that is not off counts as on */
    return domainOf(st.entity_id) === "climate";
  }

  _renderCheck() {
    const el = this._el;
    const cfg = this._config.check;
    const list = this._checkList();
    if (!list.length) {
      el.checkHead.classList.add("hidden");
      el.check.classList.add("hidden");
      return;
    }
    el.checkHead.classList.remove("hidden");
    el.check.classList.remove("hidden");
    el.checkTitle.textContent = (cfg && cfg.title) || "Before you go";

    const sig = list.map((d) => d.entity).join("|");
    if (sig !== this._sigCheck) {
      this._sigCheck = sig;
      el.check.textContent = "";
      this._checkNodes = list.map((d) => {
        const row = document.createElement("div");
        row.className = "o-crow";
        row.innerHTML =
          '<ha-icon class="o-cic"></ha-icon>' +
          '<span class="o-cmain"><b></b><span></span></span>' +
          '<span class="o-cpill"><span class="o-cknob"></span></span>';
        row.querySelector(".o-cmain").addEventListener("click", () => this._moreInfo(d.entity));
        row.querySelector(".o-cpill").addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._call("homeassistant", "toggle", { entity_id: d.entity });
        });
        this._wireLongOff(row, () => d.entity);
        el.check.appendChild(row);
        return row;
      });
    }

    let onCount = 0;
    list.forEach((d, i) => {
      const row = this._checkNodes[i];
      if (!row) return;
      const st = this._hass.states?.[d.entity];
      if (!st) {
        row.classList.add("missing");
        row.classList.remove("on");
        row.querySelector(".o-cic").setAttribute("icon", "mdi:help-circle-outline");
        row.querySelector(".o-cmain b").textContent = d.name || "Unknown entity";
        const sub = row.querySelector(".o-cmain span");
        sub.textContent = d.entity;
        sub.classList.add("o-miss");
        return;
      }
      row.classList.remove("missing");
      row.querySelector(".o-cmain span").classList.remove("o-miss");
      const on = this._checkOn(st);
      if (on) onCount++;
      row.classList.toggle("on", on);
      row.querySelector(".o-cic").setAttribute("icon", this._iconFor(st, d.entity, d.icon));
      row.querySelector(".o-cmain b").textContent =
        d.name || st.attributes?.friendly_name || d.entity;
      row.querySelector(".o-cmain span").textContent = this._stateLabel(st);
    });

    /* the header doubles as the one action that matters on the way out */
    el.checkRight.textContent = "";
    const allowAllOff = !cfg || cfg.all_off !== false;
    if (onCount && allowAllOff) {
      const b = document.createElement("span");
      b.className = "o-alloff";
      b.textContent = `Turn ${onCount} off`;
      b.addEventListener("click", () => {
        this._call("homeassistant", "turn_off", {
          entity_id: list.map((d) => d.entity),
        });
      });
      el.checkRight.appendChild(b);
    } else {
      el.checkRight.textContent = onCount ? `${onCount} on` : "All off";
    }
  }

  _renderMotion() {
    const el = this._el;
    const id = this._config.motion;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.motion.classList.add("hidden");
      return;
    }
    el.motion.classList.remove("hidden");
    const active = st.state === "on";
    el.motion.classList.toggle("alert", active);
    el.motionName.textContent = this._config.motion_name || st.attributes?.friendly_name || "Motion";
    el.motionSub.textContent = active ? "Detected now" : "Last " + this._relTime(st.last_changed);
  }

  _renderAlarm() {
    const el = this._el;
    const st = this._alarmState();
    if (!st) {
      el.alarm.classList.add("hidden");
      return;
    }
    el.alarm.classList.remove("hidden");

    const state = st.state;
    const armed = state !== "disarmed";
    const busy = state === "arming" || state === "pending";
    el.alarm.classList.toggle("alert", armed);
    el.alarmIcon.setAttribute(
      "icon",
      state === "triggered" ? "mdi:shield-alert"
        : armed ? "mdi:shield-home"
        : "mdi:shield-off-outline"
    );
    el.alarmSub.textContent = ALARMO_LABEL[state] || titleCase(state);

    /* resolve a pending code attempt */
    if (this._pendingSince) {
      if (state !== this._pendingFrom) {
        this._pendingSince = 0;
        this._padOpen = false;
        this._codeError = "";
      } else if (Date.now() - this._pendingSince > 4000) {
        this._pendingSince = 0;
        this._codeError = "Incorrect code";
      }
    }

    el.alarmAct.textContent = busy
      ? ALARMO_LABEL[state]
      : armed ? "Disarm" : (this._config.arm_label || "Arm away");
    el.alarmAct.classList.toggle("primary", this._padOpen || busy);

    const showPad = this._padOpen && this._needsCode(st);
    el.pad.classList.toggle("open", showPad);
    if (!showPad) return;

    const len = this._code.length;
    const want = Math.max(len, num(st.attributes?.code_length) || 4);
    if (el.dots.children.length !== want) {
      el.dots.textContent = "";
      for (let i = 0; i < want; i++) el.dots.appendChild(document.createElement("i"));
    }
    Array.from(el.dots.children).forEach((d, i) => d.classList.toggle("on", i < len));
    el.err.textContent = this._codeError;
  }
}

/* ================================================== card 6: wall-card-hub */

/* MediaPlayerEntityFeature bits we care about */
const MP_FEAT = {
  PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32,
  TURN_ON: 128, TURN_OFF: 256, VOLUME_STEP: 1024, PLAY: 16384,
};

const HUB_W = 1024;
const HUB_H = 600;

class WallCardHub extends WallBase {
  constructor() {
    super();
    this._forecast = [];
    this._unsub = null;
    this._sigFc = "";
    this._sigAir = "";
    this._sigDeps = -1;
  }

  static getStubConfig(hass) {
    const weather = Object.keys(hass?.states || {}).find((e) => e.startsWith("weather."));
    return { type: "custom:wall-card-hub", weather: weather || "weather.home" };
  }

  get _artSize() { return [HUB_W, HUB_H]; }

  /* Midnight (black) by default like the other cards. `theme: light` brings
     back the warm paper ground this card used to have. */
  _defaultsFor(config) {
    const light = config && config.theme === "light";
    return {
      background: light ? "#f4f2ec" : "#000",
      foreground: light ? "#1a1814" : "#F4F4F2",
      accent: light ? "#8a7526" : "#FFC857",
      seconds: false,
    };
  }

  get _tickMs() { return this._config?.seconds ? 1000 : 10000; }

  _onConfig() {
    this._sigFc = "";
    this._sigAir = "";
    this._sigDeps = -1;
    if (this._weatherWas && this._weatherWas !== this._config.weather) {
      this._unsubscribeForecast();
      this._forecast = [];
    }
    this._weatherWas = this._config.weather;
  }

  _onFirstHass() { this._subscribeForecast(); }
  _onConnect() { this._subscribeForecast(); }
  _onDisconnect() { this._unsubscribeForecast(); }

  _subscribeForecast() {
    const id = this._config?.weather;
    if (!this._hass || !id || this._unsub || !this.isConnected) return;
    const conn = this._hass.connection;
    if (!conn?.subscribeMessage) return;
    try {
      this._unsub = conn.subscribeMessage(
        (msg) => { this._forecast = (msg && msg.forecast) || []; this._render(); },
        { type: "weather/subscribe_forecast", forecast_type: "daily", entity_id: id }
      );
      this._unsub.catch(() => { this._unsub = null; });
    } catch (e) { this._unsub = null; }
  }

  _unsubscribeForecast() {
    if (!this._unsub) return;
    const p = this._unsub;
    this._unsub = null;
    try { p.then((f) => typeof f === "function" && f()).catch(() => {}); } catch (e) { /* noop */ }
  }

  static CSS = `
/* Every tone is mixed from --ink, so the same stylesheet works on a light
   ground here and on the dark ground the other cards use. */
.hub {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  padding: 34px 40px 30px;
  font-family: var(--wc-sans);
  color: rgb(var(--wc-ink));
  background: var(--wc-bg);
  -webkit-font-smoothing: antialiased;
}
.h-cols { flex: 1; display: grid; grid-template-columns: 1.15fr 1fr 1.1fr; min-height: 0; }
/* a column must never spill onto the footer, however much is configured */
.h-col { padding: 0 30px; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.h-col + .h-col { border-left: 1px solid rgba(var(--wc-ink), .13); }
.h-col:first-child { padding-left: 0; }
.h-col:last-child { padding-right: 0; }

.h-eyebrow {
  font: 500 12px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink), .5);
}
.h-rule { height: 1px; background: rgba(var(--wc-ink), .13); }

/* column one: time and weather */
.h-date { display: flex; align-items: center; gap: 12px; }
.h-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--wc-accent); flex: none; }
.h-clock {
  margin-top: 14px;
  font: 450 104px/.84 var(--wc-sans);
  letter-spacing: -.045em;
}
.h-wx { margin-top: 26px; display: flex; align-items: flex-start; gap: 14px; }
.h-wx-icon { --mdc-icon-size: 58px; width: 58px; height: 58px; color: var(--wc-accent); flex: none; margin-left: -4px; }
.h-wx-temp { font: 450 62px/.82 var(--wc-sans); letter-spacing: -.04em; }
.h-wx-txt { margin-top: 10px; display: flex; flex-direction: column; min-width: 0; }
.h-wx-cond { display: block; font: 500 17px/1.2 var(--wc-sans); }
.h-wx-meta { display: block; margin-top: 5px; font: 400 13px/1.3 var(--wc-sans); color: rgba(var(--wc-ink), .55); }
.h-fc { margin-top: 24px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.h-fc-cell { padding: 14px 0 0; display: flex; flex-direction: column; gap: 7px; align-items: center; }
.h-fc-cell + .h-fc-cell { border-left: 1px solid rgba(var(--wc-ink), .13); }
.h-fc-day { font: 500 11px/1 var(--wc-mono); letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink), .55); }
.h-fc-ic { --mdc-icon-size: 20px; width: 20px; height: 20px; color: rgba(var(--wc-ink), .5); }
.h-fc-t { font: 400 20px/1 var(--wc-sans); }
.h-fc-lo { color: rgba(var(--wc-ink), .45); }

/* column two: air and climate */
.h-air { margin-top: 18px; display: flex; flex-direction: column; }
.h-stat { padding: 15px 0; border-bottom: 1px solid rgba(var(--wc-ink), .1); }
.h-stat-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.h-stat-label { font: 500 11px/1 var(--wc-mono); letter-spacing: .2em; text-transform: uppercase; color: rgba(var(--wc-ink), .55); }
.h-band {
  padding: 4px 9px; border-radius: 999px;
  font: 500 10px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase;
  border: 1px solid rgba(var(--wc-ink), .18); color: rgba(var(--wc-ink), .55);
}
.h-band.warn { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.h-band.bad { border-color: var(--wc-danger); background: rgba(255,107,87,.12); color: var(--wc-danger); }
.h-stat-val { margin-top: 9px; font: 600 38px/1 var(--wc-sans); letter-spacing: -.03em; }
.h-stat-val small { font-size: 15px; color: rgba(var(--wc-ink), .5); }

.h-ac { margin-top: auto; padding-top: 18px; }
.h-ac-row { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
.h-ac-set { flex: 1; font: 600 40px/1 var(--wc-sans); letter-spacing: -.03em; }
.h-ac-set.off { color: rgba(var(--wc-ink), .35); }
.h-round {
  --mdc-icon-size: 20px; width: 46px; height: 46px; border-radius: 50%;
  border: 1px solid rgba(var(--wc-ink), .2); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink), .7); cursor: pointer; flex: none;
}
.h-ac-sub { margin-top: 8px; font: 400 13px/1 var(--wc-sans); color: rgba(var(--wc-ink), .55); }

/* column three: music and departures */
/* daylight, which swings from six to nineteen hours this far north */
.h-sun { margin-top: 26px; }
.h-sun-track {
  margin-top: 14px; height: 4px; border-radius: 2px;
  background: rgba(var(--wc-ink), .13); position: relative;
}
.h-sun-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--wc-accent); }
.h-sun-dot {
  position: absolute; top: -5px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--wc-accent); border: 3px solid var(--wc-bg); transform: translateX(-50%);
}
.h-sun-ends {
  margin-top: 12px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font: 400 13px/1 var(--wc-sans); color: rgba(var(--wc-ink), .55);
 
}
.h-sun-note { color: rgb(var(--wc-ink)); }

/* scenes */
.h-scenes { margin-top: auto; padding-top: 24px; }
.h-scene-grid { margin-top: 14px; display: grid; gap: 8px; }
.h-scene {
  height: 58px; border-radius: 14px; border: 1px solid rgba(var(--wc-ink), .16);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
  cursor: pointer; color: rgba(var(--wc-ink), .6);
}
.h-scene.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.h-scene ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; }
.h-scene span { font: 500 10px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; }

.h-media { display: flex; flex-direction: column; }
.h-media-row { margin-top: 14px; display: flex; align-items: center; gap: 14px; }
.h-media-txt { flex: 1; min-width: 0; }
.h-media-txt b { display: block; font: 400 19px/1.2 var(--wc-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-media-txt span { display: block; margin-top: 5px; font: 400 13px/1 var(--wc-sans); color: rgba(var(--wc-ink), .55); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-media-btns { margin-top: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.h-mbtn {
  --mdc-icon-size: 20px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(var(--wc-ink), .16); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink), .65); cursor: pointer;
}
.h-mbtn.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }

/* volume, shared by the music and TV blocks */
.h-vol { margin-top: 12px; display: flex; align-items: center; gap: 10px; }
.h-vol-btn {
  --mdc-icon-size: 19px; width: 44px; height: 44px; border-radius: 12px; flex: none;
  border: 1px solid rgba(var(--wc-ink), .16); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink), .65); cursor: pointer;
}
.h-vol-btn.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.h-vol-track {
  flex: 1; min-width: 0; height: 44px; border-radius: 12px; cursor: pointer;
  background: rgba(var(--wc-ink), .07); border: 1px solid rgba(var(--wc-ink), .12);
  position: relative; overflow: hidden;
}
.h-vol-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--wc-accent-soft); }
.h-vol-pct {
  position: absolute; right: 12px; top: 0; bottom: 0; display: flex; align-items: center;
  font: 400 14px/1 var(--wc-sans);
  color: rgba(var(--wc-ink), .7);
}
.h-vol-muted .h-vol-fill { background: rgba(var(--wc-ink), .1); }

/* phone battery */
.h-phone { margin-top: 26px; }
.h-phone-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.h-phone-name {
  font: 400 12px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink), .45);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.h-phone-row { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; }
.h-phone-pct { font: 600 38px/1 var(--wc-sans); letter-spacing: -.03em; }
.h-phone-icon { --mdc-icon-size: 26px; width: 26px; height: 26px; color: rgba(var(--wc-ink), .45); }
.h-phone.charging .h-phone-icon { color: var(--wc-accent); }
.h-phone-track { margin-top: 12px; height: 4px; border-radius: 2px; background: rgba(var(--wc-ink), .13); overflow: hidden; }
.h-phone-fill { display: block; height: 4px; border-radius: 2px; background: rgba(var(--wc-ink), .45); }
.h-phone.charging .h-phone-fill { background: var(--wc-accent); }
.h-phone.low .h-phone-fill { background: var(--wc-danger); }
.h-phone.low .h-phone-pct { color: var(--wc-danger); }
.h-phone-sub { margin-top: 10px; font: 400 13px/1 var(--wc-sans); color: rgba(var(--wc-ink), .55); }

.h-deps { margin-top: auto; padding-top: 20px; }
.h-dep { display: flex; align-items: center; gap: 12px; padding: 11px 0 10px; border-top: 1px solid rgba(var(--wc-ink), .1); }
.h-dep-line {
  min-width: 40px; padding: 4px 0; text-align: center;
  border: 1px solid rgba(var(--wc-ink), .25); border-radius: 6px;
  font: 500 14px/1 var(--wc-sans); flex: none;
}
.h-dep-dest { flex: 1; min-width: 0; font: 400 15px/1.2 var(--wc-sans); color: rgba(var(--wc-ink), .75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-dep-mins { font: 400 20px/1 var(--wc-sans); }
.h-dep-mins small { font-size: 11px; color: rgba(var(--wc-ink), .5); }

.h-foot {
  margin-top: 22px; display: flex; justify-content: space-between;
  font: 400 11px/1 var(--wc-mono);
  letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink), .4);
}
`;

  _template() {
    return `
      <div class="hub">
        <div class="h-cols">

          <div class="h-col h-col-a">
            <div class="h-date"><span class="h-dot"></span><span class="h-eyebrow h-date-txt"></span></div>
            <div class="h-clock">--:--</div>
            <div class="h-wx">
              <ha-icon class="h-wx-icon"></ha-icon>
              <span class="h-wx-temp">--&deg;</span>
              <span class="h-wx-txt">
                <span class="h-wx-cond"></span>
                <span class="h-wx-meta"></span>
              </span>
            </div>
            <div class="h-fc"></div>
            <div class="h-sun hidden">
              <div class="h-eyebrow">Daylight</div>
              <div class="h-sun-track"><span class="h-sun-fill"></span><span class="h-sun-dot"></span></div>
              <div class="h-sun-ends">
                <span class="h-sun-rise"></span>
                <span class="h-sun-note"></span>
                <span class="h-sun-set"></span>
              </div>
            </div>
            <div class="h-scenes hidden">
              <div class="h-eyebrow h-scene-label">Scenes</div>
              <div class="h-scene-grid"></div>
            </div>
          </div>

          <div class="h-col h-col-b">
            <div class="h-eyebrow">Air</div>
            <div class="h-air"></div>
            <div class="h-ac hidden">
              <div class="h-eyebrow h-ac-label">Climate</div>
              <div class="h-ac-row">
                <span class="h-ac-set">--</span>
                <ha-icon class="h-round h-ac-down" icon="mdi:minus"></ha-icon>
                <ha-icon class="h-round h-ac-up" icon="mdi:plus"></ha-icon>
              </div>
              <div class="h-ac-sub"></div>
            </div>
          </div>

          <div class="h-col h-col-c">
            <div class="h-media hidden">
              <div class="h-eyebrow">Now playing</div>
              <div class="h-media-row">
                <span class="h-media-txt"><b></b><span></span></span>
              </div>
              <div class="h-media-btns">
                <ha-icon class="h-mbtn h-prev" icon="mdi:skip-previous"></ha-icon>
                <ha-icon class="h-mbtn h-play" icon="mdi:play"></ha-icon>
                <ha-icon class="h-mbtn h-next" icon="mdi:skip-next"></ha-icon>
              </div>
              <div class="h-vol h-mvol hidden">
                <ha-icon class="h-vol-btn h-mvol-mute hidden" icon="mdi:volume-high"></ha-icon>
                <span class="h-vol-track h-mvol-track">
                  <span class="h-vol-fill"></span><span class="h-vol-pct"></span>
                </span>
              </div>
            </div>

            <div class="h-phone hidden">
              <div class="h-phone-head">
                <span class="h-eyebrow">Phone</span>
                <span class="h-phone-name"></span>
              </div>
              <div class="h-phone-row">
                <span class="h-phone-pct">--%</span>
                <ha-icon class="h-phone-icon"></ha-icon>
              </div>
              <div class="h-phone-track"><span class="h-phone-fill"></span></div>
              <div class="h-phone-sub"></div>
            </div>

            <div class="h-deps hidden">
              <div class="h-eyebrow h-dep-head"></div>
              <div class="h-dep-list"></div>
            </div>
          </div>

        </div>
        <div class="h-foot"><span class="h-foot-l"></span><span class="h-foot-r"></span></div>
      </div>`;
  }

  _collect() {
    const q = (sel) => this._q(sel);
    Object.assign(this._el, {
      dateTxt: q(".h-date-txt"),
      clock: q(".h-clock"),
      wxIcon: q(".h-wx-icon"),
      wxTemp: q(".h-wx-temp"),
      wxCond: q(".h-wx-cond"),
      wxMeta: q(".h-wx-meta"),
      fc: q(".h-fc"),

      sun: q(".h-sun"),
      sunFill: q(".h-sun-fill"),
      sunDot: q(".h-sun-dot"),
      sunRise: q(".h-sun-rise"),
      sunSet: q(".h-sun-set"),
      sunNote: q(".h-sun-note"),
      scenes: q(".h-scenes"),
      sceneLabel: q(".h-scene-label"),
      sceneGrid: q(".h-scene-grid"),
      air: q(".h-air"),
      ac: q(".h-ac"),
      acSet: q(".h-ac-set"),
      acUp: q(".h-ac-up"),
      acDown: q(".h-ac-down"),
      acSub: q(".h-ac-sub"),

      media: q(".h-media"),
      track: q(".h-media-txt b"),
      trackSub: q(".h-media-txt span"),
      prev: q(".h-prev"),
      play: q(".h-play"),
      next: q(".h-next"),

      mvol: q(".h-mvol"),
      mvolTrack: q(".h-mvol-track"),
      mvolMute: q(".h-mvol-mute"),
      phone: q(".h-phone"),
      phoneName: q(".h-phone-name"),
      phonePct: q(".h-phone-pct"),
      phoneIcon: q(".h-phone-icon"),
      phoneFill: q(".h-phone-fill"),
      phoneSub: q(".h-phone-sub"),
      deps: q(".h-deps"),
      depHead: q(".h-dep-head"),
      depList: q(".h-dep-list"),

      footL: q(".h-foot-l"),
      footR: q(".h-foot-r"),
    });

    const el = this._el;
    el.acUp.addEventListener("click", () => this._nudge(1));
    el.acDown.addEventListener("click", () => this._nudge(-1));
    el.prev.addEventListener("click", () => this._mmSkip(this._config.media_player, -1));
    el.next.addEventListener("click", () => this._mmSkip(this._config.media_player, 1));
    el.play.addEventListener("click", () => this._media("media_play_pause"));
    el.mvolTrack.addEventListener("click", (ev) =>
      this._setVolume(this._config.media_player, el.mvolTrack, ev));
    el.mvolMute.addEventListener("click", () => this._toggleMute(this._config.media_player));
  }

  _nudge(delta) {
    const id = this._config.climate;
    const st = id ? this._hass.states?.[id] : null;
    const cur = num(st?.attributes?.temperature);
    if (cur == null) return;
    const step = num(st.attributes?.target_temp_step) || 0.5;
    const min = num(st.attributes?.min_temp) ?? 16;
    const max = num(st.attributes?.max_temp) ?? 30;
    this._call("climate", "set_temperature", {
      entity_id: id,
      temperature: Math.max(min, Math.min(max, cur + delta * step)),
    });
  }

  _media(service) {
    const id = this._config.media_player;
    if (id) this._call("media_player", service, { entity_id: id });
  }

  _isNight() {
    const sun = this._hass?.states?.["sun.sun"];
    if (sun) return sun.state === "below_horizon";
    const h = new Date().getHours();
    return h < 6 || h >= 21;
  }

  _condIcon(cond) {
    if (this._isNight() && COND_ICON_NIGHT[cond]) return COND_ICON_NIGHT[cond];
    return COND_ICON[cond] || "mdi:weather-cloudy";
  }

  _deg(v) {
    const n = num(v);
    return n == null ? "--°" : Math.round(n) + "°";
  }

  _update() {
    const c = this._config;
    const el = this._el;
    this.style.setProperty("--wc-ink", rgbTriplet(c.foreground));

    const now = new Date();
    try {
      el.dateTxt.textContent = new Intl.DateTimeFormat(this._locale(), {
        weekday: "long", day: "numeric", month: "long",
      }).format(now);
    } catch (e) {
      el.dateTxt.textContent = now.toDateString();
    }
    const opts = { hour: "2-digit", minute: "2-digit", hour12: String(c.time_format) === "12" };
    if (c.seconds) opts.second = "2-digit";
    el.clock.textContent = new Intl.DateTimeFormat(this._locale(), opts)
      .format(now).replace(/\s?(AM|PM)/i, (m) => m.toLowerCase());

    this._renderWeather();
    this._renderAir();
    this._renderClimate();
    this._renderSun();
    this._renderMedia();
    this._renderPhone();
    this._renderScenes();
    this._renderDepartures();

    el.footL.textContent = c.footer_left || "Home Assistant";
    el.footR.textContent = c.footer_right || "Updated " + this._fmtTime(now);
  }

  _renderWeather() {
    const el = this._el;
    const w = this._config.weather ? this._hass.states?.[this._config.weather] : null;
    if (!w) {
      el.wxIcon.setAttribute("icon", "mdi:weather-cloudy-alert");
      el.wxCond.textContent = "No weather entity";
      el.wxMeta.textContent = "";
      el.fc.classList.add("hidden");
      return;
    }
    const a = w.attributes || {};
    el.wxIcon.setAttribute("icon", this._condIcon(w.state));
    el.wxTemp.textContent = this._deg(a.temperature);
    el.wxCond.textContent = COND_LABEL[w.state] || titleCase(w.state);

    const fc = this._forecast.length ? this._forecast : a.forecast || [];
    const today = fc[0] || {};
    const bits = [];
    if (today.temperature != null) bits.push("H " + this._deg(today.temperature));
    if (today.templow != null) bits.push("L " + this._deg(today.templow));
    const ws = num(a.wind_speed);
    if (ws != null) bits.push(Math.round(ws) + " " + (a.wind_speed_unit || "km/h"));
    el.wxMeta.textContent = bits.join(" · ");

    const skip = fc.length > 3 ? 1 : 0;
    const days = fc.slice(skip, skip + 3);
    el.fc.classList.toggle("hidden", !days.length);
    const sig = days.map((d) => d.datetime + d.condition + d.temperature).join("|");
    if (sig === this._sigFc) return;
    this._sigFc = sig;
    el.fc.textContent = "";
    days.forEach((d) => {
      const cell = document.createElement("div");
      cell.className = "h-fc-cell";
      let day = "";
      try {
        day = new Intl.DateTimeFormat(this._locale(), { weekday: "short" }).format(new Date(d.datetime));
      } catch (e) { /* noop */ }
      const dEl = document.createElement("span");
      dEl.className = "h-fc-day";
      dEl.textContent = day;
      const ic = document.createElement("ha-icon");
      ic.className = "h-fc-ic";
      ic.setAttribute("icon", COND_ICON[d.condition] || "mdi:weather-cloudy");
      const t = document.createElement("span");
      t.className = "h-fc-t";
      t.textContent = this._deg(d.temperature);
      const lo = document.createElement("span");
      lo.className = "h-fc-lo";
      lo.textContent = " / " + this._deg(d.templow);
      t.appendChild(lo);
      cell.appendChild(dEl);
      cell.appendChild(ic);
      cell.appendChild(t);
      el.fc.appendChild(cell);
    });
  }

  _airList() {
    const c = this._config;
    if (Array.isArray(c.air) && c.air.length) {
      return c.air.map((a) => (typeof a === "string" ? { entity: a } : a || {}));
    }
    const out = [];
    if (c.indoor_temperature) out.push({ entity: c.indoor_temperature, label: "Inside" });
    if (c.indoor_humidity) out.push({ entity: c.indoor_humidity, label: "Humidity" });
    return out;
  }

  /* good_below / fair_below turn a bare number into something you can read at a
     glance, which is the whole point of an air sensor on a desk */
  _band(def, n) {
    if (n == null) return null;
    const good = num(def.good_below);
    const fair = num(def.fair_below);
    if (good == null && fair == null) return null;
    if (good != null && n < good) return { text: def.good_label || "Good", cls: "" };
    if (fair != null && n < fair) return { text: def.fair_label || "Fair", cls: "warn" };
    return { text: def.poor_label || "Poor", cls: "bad" };
  }

  _renderAir() {
    const el = this._el.air;
    const list = this._airList();
    const sig = list.map((d) => d.entity).join("|");
    if (sig !== this._sigAir) {
      this._sigAir = sig;
      el.textContent = "";
      this._airNodes = list.map(() => {
        const row = document.createElement("div");
        row.className = "h-stat";
        row.innerHTML =
          '<div class="h-stat-top"><span class="h-stat-label"></span><span class="h-band hidden"></span></div>' +
          '<div class="h-stat-val">--</div>';
        el.appendChild(row);
        return row;
      });
    }
    list.forEach((d, i) => {
      const row = this._airNodes[i];
      if (!row) return;
      const st = d.entity ? this._hass.states?.[d.entity] : null;
      const n = st ? num(st.state) : null;
      row.querySelector(".h-stat-label").textContent =
        d.label || st?.attributes?.friendly_name || d.entity || "";
      const val = row.querySelector(".h-stat-val");
      val.textContent = n == null ? (st ? st.state : "--") : String(Math.round(n * 10) / 10);
      const unit = d.unit != null ? d.unit : st?.attributes?.unit_of_measurement || "";
      if (unit) {
        const sm = document.createElement("small");
        sm.textContent = " " + unit;
        val.appendChild(sm);
      }
      const band = this._band(d, n);
      const bEl = row.querySelector(".h-band");
      bEl.classList.toggle("hidden", !band);
      if (band) {
        bEl.textContent = band.text;
        bEl.className = "h-band " + band.cls;
      }
    });
  }

  _renderClimate() {
    const el = this._el;
    const id = this._config.climate;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.ac.classList.add("hidden");
      return;
    }
    el.ac.classList.remove("hidden");
    const t = num(st.attributes?.temperature);
    el.acSet.textContent = t == null ? "--" : t.toFixed(1) + "°";
    el.acSet.classList.toggle("off", st.state === "off");
    const cur = num(st.attributes?.current_temperature);
    el.acSub.textContent =
      titleCase(st.state) + (cur == null ? "" : " · now " + cur.toFixed(1) + "°");
  }

  /* sun.sun only publishes the NEXT rising and setting, so today's window has to
     be reconstructed from which of the two comes first. */
  _dayWindow(st) {
    const rise = new Date(st.attributes?.next_rising);
    const set = new Date(st.attributes?.next_setting);
    if (isNaN(rise.getTime()) || isNaN(set.getTime())) return null;
    const DAY = 864e5;
    if (st.state === "above_horizon") {
      return { sunrise: new Date(rise.getTime() - DAY), sunset: set, up: true };
    }
    /* below the horizon: before dawn the next rising leads, after dusk it trails */
    if (rise < set) return { sunrise: rise, sunset: set, up: false };
    return { sunrise: rise, sunset: new Date(set.getTime() + DAY), up: false };
  }

  _dur(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  _renderSun() {
    const el = this._el;
    if (this._config.daylight === false) {
      el.sun.classList.add("hidden");
      return;
    }
    const st = this._hass.states?.["sun.sun"];
    const win = st ? this._dayWindow(st) : null;
    if (!win) {
      el.sun.classList.add("hidden");
      return;
    }
    el.sun.classList.remove("hidden");

    const now = Date.now();
    const a = win.sunrise.getTime();
    const b = win.sunset.getTime();
    const span = Math.max(1, b - a);
    const pct = Math.max(0, Math.min(100, ((now - a) / span) * 100));

    el.sunRise.textContent = this._fmtTime(win.sunrise);
    el.sunSet.textContent = this._fmtTime(win.sunset);
    el.sunFill.style.width = pct + "%";
    el.sunDot.style.left = pct + "%";
    el.sunDot.classList.toggle("hidden", !win.up);

    if (win.up) {
      el.sunNote.textContent = "Sunset in " + this._dur(b - now);
    } else if (now < a) {
      el.sunNote.textContent = "Sunrise in " + this._dur(a - now);
    } else {
      el.sunNote.textContent = this._dur(span) + " of light";
    }
  }

  _renderScenes() {
    const el = this._el;
    const scenes = Array.isArray(this._config.scenes) ? this._config.scenes : [];
    if (!scenes.length) {
      el.scenes.classList.add("hidden");
      return;
    }
    el.scenes.classList.remove("hidden");
    el.sceneLabel.textContent = this._config.scenes_label || "Scenes";
    /* four is what this column fits on one row; beyond that they wrap */
    const per = Math.min(scenes.length, num(this._config.scenes_per_row) || 4);
    el.sceneGrid.style.gridTemplateColumns = `repeat(${per}, minmax(0, 1fr))`;

    const sig = scenes.map((x) => x.entity || x.name).join("|");
    if (sig !== this._sigScenes) {
      this._sigScenes = sig;
      el.sceneGrid.textContent = "";
      scenes.forEach((x) => {
        const b = document.createElement("span");
        b.className = "h-scene";
        const ic = document.createElement("ha-icon");
        ic.setAttribute("icon", x.icon || "mdi:palette");
        const label = document.createElement("span");
        label.textContent = x.name || "";
        b.appendChild(ic);
        b.appendChild(label);
        b.addEventListener("click", () => {
          if (!x.entity) return;
          const dom = domainOf(x.entity);
          if (dom === "script") this._call("script", "turn_on", { entity_id: x.entity });
          else if (dom === "automation") this._call("automation", "trigger", { entity_id: x.entity });
          else if (dom === "button") this._call("button", "press", { entity_id: x.entity });
          else if (dom === "light" || dom === "switch") this._call(dom, "toggle", { entity_id: x.entity });
          else this._call("scene", "turn_on", { entity_id: x.entity });
          this._activeScene = x.name;
          this._render();
        });
        el.sceneGrid.appendChild(b);
      });
      this._sceneNodes = Array.from(el.sceneGrid.children);
    }
    const active = WallCardControls.prototype._activeScenes.call(this, scenes);
    (this._sceneNodes || []).forEach((node, i) => {
      node.classList.toggle("on", !!scenes[i] && active.has(scenes[i].name));
    });
  }

  _renderMedia() {
    const el = this._el;
    const id = this._config.media_player;
    const st = id ? this._hass.states?.[id] : null;
    if (!st) {
      el.media.classList.add("hidden");
      return;
    }
    el.media.classList.remove("hidden");
    const playing = st.state === "playing";
    el.play.setAttribute("icon", playing ? "mdi:pause" : "mdi:play");
    el.play.classList.toggle("on", playing);
    const a = st.attributes || {};
    el.track.textContent = a.media_title || this._stateLabel(st);
    const bits = [];
    if (a.media_artist) bits.push(a.media_artist);
    /* artist only by default; `show_player_name: true` adds the speaker name */
    if (this._config.show_player_name && a.friendly_name) bits.push(a.friendly_name);
    el.trackSub.textContent = bits.join(" · ");

    const canSet = this._supports(st, MP_FEAT.VOLUME_SET);
    const canMute = this._supports(st, MP_FEAT.VOLUME_MUTE);
    el.mvol.classList.toggle("hidden", !canSet && !canMute);
    el.mvolTrack.classList.toggle("hidden", !canSet);
    el.mvolMute.classList.toggle("hidden", !canMute);
    el.mvolMute.setAttribute("icon", a.is_volume_muted ? "mdi:volume-off" : "mdi:volume-high");
    el.mvolMute.classList.toggle("on", !!a.is_volume_muted);
    if (canSet) this._paintVolume(el.mvol, el.mvolTrack, st);
  }

  _supports(st, bit) {
    const f = num(st?.attributes?.supported_features);
    return f == null ? false : (f & bit) !== 0;
  }

  _setVolume(id, track, ev) {
    if (!id) return;
    const r = track.getBoundingClientRect();
    const level = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    this._call("media_player", "volume_set", {
      entity_id: id,
      volume_level: Math.round(level * 100) / 100,
    });
  }

  _toggleMute(id) {
    const st = id ? this._hass.states?.[id] : null;
    if (!st) return;
    this._call("media_player", "volume_mute", {
      entity_id: id,
      is_volume_muted: !st.attributes?.is_volume_muted,
    });
  }

  _paintVolume(row, track, st) {
    const muted = !!st?.attributes?.is_volume_muted;
    const lvl = num(st?.attributes?.volume_level);
    const pct = lvl == null ? 0 : Math.round(lvl * 100);
    track.querySelector(".h-vol-fill").style.width = muted ? "100%" : pct + "%";
    track.querySelector(".h-vol-pct").textContent = muted ? "Muted" : pct + "%";
    row.classList.toggle("h-vol-muted", muted);
  }

  /* The companion app publishes battery level and state as separate sensors, and
     the state sensor's wording varies by platform, so match loosely. */
  _phoneCfg() {
    const c = this._config.phone;
    if (!c) return null;
    return typeof c === "string" ? { battery: c } : c;
  }

  _isCharging(cfg) {
    const st = cfg.charging ? this._hass.states?.[cfg.charging] : null;
    if (!st) return false;
    const v = String(st.state).toLowerCase();
    return v === "on" || v === "charging" || v === "full";
  }

  _phoneBattIcon(pct, charging) {
    if (pct == null) return "mdi:battery-unknown";
    const step = Math.round(pct / 10) * 10;
    if (charging) return step >= 100 ? "mdi:battery-charging-100" : `mdi:battery-charging-${step || 10}`;
    if (step >= 100) return "mdi:battery";
    if (step <= 0) return "mdi:battery-alert";
    return `mdi:battery-${step}`;
  }

  _renderPhone() {
    const el = this._el;
    const cfg = this._phoneCfg();
    const st = cfg?.battery ? this._hass.states?.[cfg.battery] : null;
    if (!st) {
      el.phone.classList.add("hidden");
      return;
    }
    el.phone.classList.remove("hidden");

    const pct = num(st.state);
    const charging = this._isCharging(cfg);
    const low = pct != null && pct <= (num(cfg.low_below) ?? 20) && !charging;

    el.phone.classList.toggle("charging", charging);
    el.phone.classList.toggle("low", low);
    el.phoneName.textContent = cfg.name || st.attributes?.friendly_name || "";
    el.phonePct.textContent = pct == null ? "--%" : Math.round(pct) + "%";
    el.phoneIcon.setAttribute("icon", this._phoneBattIcon(pct, charging));
    el.phoneFill.style.width = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + "%";

    const bits = [];
    const state = cfg.charging ? this._hass.states?.[cfg.charging] : null;
    if (state) bits.push(titleCase(state.state));
    else bits.push(charging ? "Charging" : "On battery");
    if (cfg.extra) {
      const ex = this._hass.states?.[cfg.extra];
      if (ex) bits.push(this._stateLabel(ex));
    }
    bits.push("updated " + this._relTime(st.last_changed));
    el.phoneSub.textContent = bits.join(" · ");
  }

  _renderDepartures() {
    const el = this._el;
    const cfg = this._config.departures;
    if (!cfg || !cfg.entity) {
      el.deps.classList.add("hidden");
      return;
    }
    const st = this._hass.states?.[cfg.entity];
    const f = Object.assign(
      { line: "line", destination: "destination", time: "time", minutes: "minutes" },
      cfg.fields || {}
    );
    let rows = pick(st?.attributes, cfg.attribute || "departures");
    if (!Array.isArray(rows)) rows = [];
    rows = rows.slice(0, cfg.count || 3);

    el.deps.classList.remove("hidden");
    el.depHead.textContent = cfg.subtitle || st?.attributes?.friendly_name || "Departures";

    if (rows.length !== this._sigDeps) {
      this._sigDeps = rows.length;
      el.depList.textContent = "";
      rows.forEach(() => {
        const d = document.createElement("div");
        d.className = "h-dep";
        ["h-dep-line", "h-dep-dest", "h-dep-mins"].forEach((cls) => {
          const sp = document.createElement("span");
          sp.className = cls;
          d.appendChild(sp);
        });
        el.depList.appendChild(d);
      });
    }
    const nodes = el.depList.querySelectorAll(".h-dep");
    rows.forEach((r, i) => {
      const n = nodes[i];
      if (!n) return;
      const when = this._parseWhen(pick(r, f.time));
      let mins = num(pick(r, f.minutes));
      if (mins == null && when) mins = Math.max(0, Math.round((when - Date.now()) / 60000));
      n.querySelector(".h-dep-line").textContent = pick(r, f.line) ?? "--";
      n.querySelector(".h-dep-dest").textContent = pick(r, f.destination) ?? "";
      const m = n.querySelector(".h-dep-mins");
      m.textContent = mins == null ? "--" : String(mins);
      if (mins != null) {
        const sm = document.createElement("small");
        sm.textContent = " min";
        m.appendChild(sm);
      }
    });
  }
}

/* ================================================= card 7: wall-card-desk */

/* A full-screen landscape page for a desktop computer. Unlike the tablet
   pages it is not a scaled artboard: it is laid out 1:1 at the real screen
   size (four columns on a big monitor, two or one when the window is
   narrower) and it is meant for a mouse: hover states, drag or scroll-wheel
   sliders, right-click for an entity's details. It builds on the hub card, so
   weather, air, climate, music, phone, daylight and scenes share its code. */

const DESK_HISTORY_MS = 15 * 60 * 1000;

/* states that mean "nothing going on" for a ticker alert's `when` entity */
const DESK_QUIET = ["", "0", "0.0", "off", "false", "no", "none", "unknown", "unavailable", "disarmed", "ok", "normal"];

class WallCardDesk extends WallCardHub {
  constructor() {
    super();
    this._hist = {};
    this._histAt = 0;
    this._histSig = "";
    this._sigTicker = "";
  }

  static getStubConfig(hass) {
    const weather = Object.keys(hass?.states || {}).find((e) => e.startsWith("weather."));
    return { type: "custom:wall-card-desk", weather: weather || "weather.home" };
  }

  get _fluid() { return true; }

  _defaultsFor(config) {
    return Object.assign(super._defaultsFor(config), { chart_hours: 24 });
  }

  _onConfig() {
    super._onConfig();
    this._lookSig = "";
    this._histAt = 0;
    this._histSig = "";
    this._sigRooms = "";
    this._sigLights = "";
    this._sigDevs = "";
    this._sigFavs = "";
    this._sigTicker = "";
    this._sigBrief = "";
  }

  _onFirstHass() { super._onFirstHass(); this._loadHistory(); }
  _onConnect() {
    super._onConnect();
    clearInterval(this._histTimer);
    this._histTimer = setInterval(() => this._loadHistory(true), DESK_HISTORY_MS);
  }
  _onDisconnect() {
    super._onDisconnect();
    clearInterval(this._histTimer);
    clearInterval(this._pomoT);
    this._pomoT = null;
    (this._ovT || []).forEach(clearTimeout);
    this._ovT = null;
    this._restoreOverlays();
  }

  /* volume is set by the drag/wheel slider below, not the hub's click */
  _setVolume() {}

  /* Fill the screen from the card's top edge down. On a wide window the page is
     exactly the screen tall and the panels share that height (their lists
     scroll inside them); narrow or short windows grow and scroll instead. */
  _fit() {
    const d = this._el && this._el.desk;
    if (!d) return;
    const rect = this.getBoundingClientRect();
    const w = rect.width || this.clientWidth || window.innerWidth;
    /* Kiosk/wallpaper: cover the whole browser window from its own corner,
       whatever space Home Assistant's header or sidebar still reserves. */
    const full = this._fullScreen();
    this._fullWas = full;
    d.classList.toggle("d-full", full);
    const narrow = (full ? window.innerWidth : w) < 900;
    d.classList.toggle("d-mid", w < 1240 && !narrow);
    d.classList.toggle("d-narrow", narrow);
    const h = full ? window.innerHeight : this._targetHeight(rect);
    if (h == null) {
      d.style.height = "";
      d.style.minHeight = "";
    } else if (!narrow && h >= 600) {
      d.style.height = h + "px";
      d.style.minHeight = "";
    } else {
      d.style.height = "";
      d.style.minHeight = h + "px";
    }
    this._fitSig = "desk";
    this._layoutTicker();
    if (full) {
      /* a few probes while Home Assistant finishes laying out; never
         periodically, so a dialog you open later is never touched */
      if (!this._ovT) {
        this._clearOverlays();
        this._ovT = [1000, 3000, 8000].map((t) => setTimeout(() => this._clearOverlays(), t));
      }
    } else {
      (this._ovT || []).forEach(clearTimeout);
      this._ovT = null;
      this._restoreOverlays();
    }
  }

  /* In full-screen mode the card sits under whatever Home Assistant still
     draws on top of the page, e.g. an emptied sidebar that keeps its edge line
     and swallows clicks. Probe the screen, find anything above the card that
     isn't part of it, and hide it (put back when full-screen ends). */
  _clearOverlays() {
    if (!this.isConnected) return;
    const chain = new Set();
    for (let n = this; n; n = n.parentNode || n.host) chain.add(n);
    const hidden = (this._ovHidden = this._ovHidden || []);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const xs = [];
    for (let x = 4; x < W; x += 24) xs.push(x);
    [0.2, 0.5, 0.8].forEach((fy) => {
      const y = Math.round(H * fy);
      xs.forEach((x) => {
        let root = document;
        for (let depth = 0; depth < 30 && root; depth++) {
          const el = root.elementFromPoint(x, y);
          if (!el || el === this) return;
          if (this.shadowRoot.contains(el)) return;
          if (!chain.has(el)) {
            /* something on top of the card: hide it, unless it's the whole page */
            if (el === document.documentElement || el === document.body) return;
            if (/dialog|toast|snackbar|tooltip|menu|popover|notification/i.test(el.tagName)) return;
            if (!hidden.some((h) => h.el === el)) {
              hidden.push({ el, vis: el.style.visibility, pe: el.style.pointerEvents });
              el.style.setProperty("visibility", "hidden", "important");
              el.style.setProperty("pointer-events", "none", "important");
            }
            return;
          }
          if (!el.shadowRoot || el.shadowRoot === root) return;
          root = el.shadowRoot;
        }
      });
    });
  }

  _restoreOverlays() {
    (this._ovHidden || []).forEach((h) => {
      h.el.style.visibility = h.vis;
      h.el.style.pointerEvents = h.pe;
    });
    this._ovHidden = [];
  }

  /* full_screen follows hide_header unless set on its own (same values) */
  _fullScreen() {
    const c = this._config || {};
    const mode = c.full_screen != null ? c.full_screen : c.hide_header;
    return !!mode && shouldHideHeader(mode);
  }

  static CSS = WallCardHub.CSS + `
:host { height: auto; overflow: visible; }
.desk.d-full { position: fixed; left: 0; top: 0; width: 100vw; z-index: 7; }
.desk {
  position: relative; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 16px;
  padding: 28px var(--d-edge, 32px) var(--d-bottom, 28px);
  font-family: var(--wc-sans); color: rgb(var(--wc-ink));
  background-color: var(--wc-bg);
  background-image: var(--d-wall, none);
  background-size: cover; background-position: center;
  -webkit-font-smoothing: antialiased;
}

/* ---- liquid glass: frosted, a touch of tint, a bright rim on top ---- */
.d-glass {
  position: relative; isolation: isolate; border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255,255,255,.11) 0%, rgba(255,255,255,.035) 45%, rgba(255,255,255,.07) 100%),
    rgba(10,10,12,var(--d-glass-alpha, .38));
  -webkit-backdrop-filter: blur(var(--d-blur, 26px)) saturate(170%);
  backdrop-filter: blur(var(--d-blur, 26px)) saturate(170%);
  border: 1px solid rgba(255,255,255,.14);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.24),
    inset 0 -1px 0 rgba(255,255,255,.05),
    inset 1px 0 0 rgba(255,255,255,.06),
    0 18px 50px rgba(0,0,0,.32);
}
.d-glass::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: -1;
  background: radial-gradient(70% 55% at 10% 0%, rgba(255,255,255,.13), transparent 62%);
}
.no-glass .d-glass {
  background: none; border: 0; box-shadow: none; border-radius: 0;
  -webkit-backdrop-filter: none; backdrop-filter: none;
}
.no-glass .d-glass::before { display: none; }

/* ---- header: time, greeting, weather ---- */
.d-head {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 400px);
  gap: 56px; align-items: start;
}
/* clock and greeting sit together, starting level with the outside temperature */
.d-left { display: flex; align-items: flex-end; gap: 56px; min-width: 0; }
.d-head .h-clock { font-size: 100px; margin-top: 10px; }
.d-head .h-date { margin-top: 0; }
.d-hello { padding-bottom: 6px; min-width: 0; }
.d-greet { font: 450 38px/1.1 var(--wc-sans); letter-spacing: -.025em; }
.d-brief {
  margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px 28px;
  font: 400 16px/1.35 var(--wc-sans); color: rgba(var(--wc-ink), .6);
}
.d-brief { color: rgba(var(--wc-ink), var(--d-brief-op, .55)); }
.d-brief b { font-weight: 500; color: inherit; }
/* status: honey text with a softly pulsing warning icon */
.d-brief .d-status { color: var(--wc-accent); display: inline-flex; align-items: center; gap: 10px; }
.d-brief .d-status b { font-weight: 500; line-height: 1; }
/* ha-icon's inner svg sits on the text baseline by default; flex centres it */
.d-status ha-icon {
  --mdc-icon-size: var(--d-status-icon, 24px); width: var(--d-status-icon, 24px); height: var(--d-status-icon, 24px);
  display: flex; align-items: center; justify-content: center; flex: none; line-height: 0;
  margin: -4px 0; animation: d-pulse 2.4s ease-in-out infinite;
}
.d-status ha-icon > * { display: block; }
@keyframes d-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .d-status ha-icon { animation: none; } }
/* quiet status: same grey as the rest of the brief, steady dimmed check */
.d-brief .d-status.d-quiet { color: inherit; }
.d-status.d-quiet ha-icon { animation: none; opacity: .7; }
.d-brief { min-height: calc(16px * 1.35); }
.d-brief.d-empty { visibility: hidden; }
.d-wx { padding-bottom: 4px; }
.d-wx .h-wx { margin-top: 0; }
.d-wx .h-fc { margin-top: 12px; }
.d-wx .h-fc-cell { padding-top: 8px; gap: 6px; }

/* ---- ticker ---- */
/* the header and ticker share one edge-to-edge glass band that ends at the
   ticker's lower line */
.d-top {
  flex: none; margin: -28px calc(-1 * var(--d-edge, 32px)) 4px; display: flex; flex-direction: column;
  box-shadow: 0 18px 50px rgba(0,0,0,.28);
}
.d-top > .d-glass { border-radius: 0; border: 0; box-shadow: none; }
/* the header can be blurred less than the ticker, so more of the wallpaper shows */
.d-top > .d-head.d-glass {
  -webkit-backdrop-filter: blur(var(--d-head-blur, var(--d-blur, 26px))) saturate(170%);
  backdrop-filter: blur(var(--d-head-blur, var(--d-blur, 26px))) saturate(170%);
}
/* ticker_position: top puts the rolling text above the header */
.tick-top .d-tick { order: -1; border-top: 0; }
.d-top .d-head { padding: 22px calc(var(--d-edge, 32px) + 26px) 22px; }
.d-tick {
  display: flex; align-items: center; gap: 18px; height: 48px; padding: 0 calc(var(--d-edge, 32px) + 26px);
  border-top: 1px solid rgba(255,255,255,.14); border-bottom: 1px solid rgba(255,255,255,.14);
}
.no-glass .d-top { margin: 0 0 4px; }
.no-glass .d-top .d-head { padding: 8px 0 26px; }
.no-glass .d-tick { padding: 0; border-color: rgba(var(--wc-ink), .13); }
.d-tick-label {
  flex: none; display: flex; align-items: center; gap: 10px;
  font: 500 11px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase;
  color: rgba(var(--wc-ink), .5);
}
.d-tick-label .h-dot { background: rgba(var(--wc-ink), .35); }
.d-tick.alert .d-tick-label { color: var(--wc-danger); }
.d-tick.alert .d-tick-label .h-dot { background: var(--wc-danger); animation: d-pulse 1.6s ease-in-out infinite; }
.d-tick-win {
  flex: 1; min-width: 0; overflow: hidden; white-space: nowrap;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(90deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent);
}
.d-tick-track { display: inline-flex; will-change: transform; }
.d-tick-track.run { animation: d-roll var(--d-dur, 30s) linear infinite; }
.d-tick-win:hover .d-tick-track { animation-play-state: paused; }
.d-tick-copy { display: inline-flex; align-items: center; flex: none; }
.d-tick-item { font: 400 15px/1 var(--wc-sans); color: rgba(var(--wc-ink), .78); }
.d-tick-item b { font-weight: 500; color: rgb(var(--wc-ink)); }
.d-tick.alert .d-tick-item { color: rgb(var(--wc-ink)); }
.d-tick-sep { width: var(--d-tick-gap, 72px); flex: none; }
@keyframes d-roll { from { transform: translateX(0); } to { transform: translateX(var(--d-shift, -50%)); } }
@keyframes d-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@media (prefers-reduced-motion: reduce) {
  .d-tick-track.run { animation: none; }
  .d-tick-win { text-overflow: ellipsis; }
}

/* ---- body: widget panel on the left, music on the right, wallpaper between ---- */
.d-body { flex: 1; min-height: 0; display: flex; gap: 16px; align-items: stretch; }
.d-side { flex: 0 1 var(--d-side-w, 440px); min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.d-side-in {
  flex: 1; min-height: 0; overflow-y: auto; padding: 24px 26px 22px;
  display: flex; flex-direction: column; scrollbar-width: none; gap: var(--d-gap, 26px);
}
.d-side-in::-webkit-scrollbar { width: 0; }
.no-glass .d-side-in { padding: 8px 0 0; }
.d-spacer { flex: 1 1 0; min-width: 0; }
.d-col-music { flex: 0 1 var(--d-music-w, 440px); min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.d-side-in > * { margin-top: 0; }
.d-side .d-devs:empty, .d-side .h-air:empty { display: none; }
.d-side .h-eyebrow { display: block; }
.d-side .h-sun { margin-top: 0; }
.d-side .h-scenes { margin-top: auto; padding-top: 0; }
/* side_dividers: a hairline between the blocks, with the spacing on both sides */
.d-dividers .d-side-in > :not(.d-first) { border-top: 1px solid rgba(var(--wc-ink), var(--d-div-op, .14)); padding-top: var(--d-gap, 26px); }
.desk.d-dividers .d-rooms > .d-room:last-child { border-bottom: 0; padding-bottom: 0; }
.d-side .h-scene { height: 52px; }

/* climate: rooms with a 24 h chart */
.d-room { padding: 16px 0 14px; border-bottom: 1px solid rgba(var(--wc-ink), .1); }
.d-room-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.d-room-meta { font: 400 13px/1 var(--wc-sans); color: rgba(var(--wc-ink), .55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.d-room-meta .warn { color: var(--wc-accent); }
.d-room-meta .bad { color: var(--wc-danger); }
.d-room-row { margin-top: 10px; display: flex; align-items: flex-end; gap: 18px; }
.d-room-temp { flex: none; font: 600 38px/1 var(--wc-sans); letter-spacing: -.03em; cursor: pointer; }
.d-room-temp small { font-size: 15px; color: rgba(var(--wc-ink), .5); }
.d-spark { position: relative; flex: 1; min-width: 0; height: 46px; cursor: crosshair; }
.d-col-climate .d-room-row { align-items: stretch; }
.d-col-climate .d-room-temp { align-self: flex-end; }
.d-side .d-spark { height: var(--d-spark-h, 58px); }
.d-spark svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.d-spark .l { fill: none; stroke: var(--wc-accent); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.d-spark .a { stroke: none; }
.d-spark-x { position: absolute; top: -4px; bottom: 0; width: 1px; background: rgba(var(--wc-ink), .3); display: none; pointer-events: none; }
.d-spark-dot {
  position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--wc-accent);
  box-shadow: 0 0 0 2px var(--wc-bg); transform: translate(-50%, -50%); display: none; pointer-events: none;
}
.d-spark-tip {
  position: absolute; bottom: calc(100% + 8px); padding: 5px 8px; border-radius: 6px;
  background: var(--wc-raised); border: 1px solid rgba(var(--wc-ink), .14);
  font: 500 11px/1 var(--wc-mono); color: rgb(var(--wc-ink)); white-space: nowrap;
  display: none; pointer-events: none; z-index: 2;
}
.d-spark.hover .d-spark-x, .d-spark.hover .d-spark-dot, .d-spark.hover .d-spark-tip { display: block; }
.d-spark-range {
  margin-top: 8px; display: flex; justify-content: space-between;
  font: 400 10px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; color: rgba(var(--wc-ink), .4);
}
.d-col-climate .h-air { margin-top: 0; }
.d-col-climate .h-ac { padding-top: 22px; }

/* desk: lamp, lights, devices, scenes */
.d-lamp { margin-top: 18px; display: flex; align-items: center; gap: 14px; }
.d-sq {
  --mdc-icon-size: 24px; width: 52px; height: 52px; border-radius: 14px; flex: none;
  border: 1px solid rgba(var(--wc-ink), .16); display: flex; align-items: center; justify-content: center;
  color: rgba(var(--wc-ink), .6); cursor: pointer; box-sizing: border-box;
}
.on > .d-sq, .d-sq.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.d-main { flex: 1; min-width: 0; }
.d-main b { display: block; font: 400 19px/1.2 var(--wc-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-main span { display: block; margin-top: 5px; font: 400 13px/1.2 var(--wc-sans); color: rgba(var(--wc-ink), .55); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-slider, .desk .h-vol-track { cursor: ew-resize; touch-action: none; user-select: none; }
.d-slider {
  margin-top: 12px; height: 44px; border-radius: 12px; position: relative; overflow: hidden;
  background: rgba(var(--wc-ink), .07); border: 1px solid rgba(var(--wc-ink), .12);
}
.d-slider-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--wc-accent-fill); }
.d-slider.off .d-slider-fill { background: rgba(var(--wc-ink), .08); }
.d-slider-pct { position: absolute; right: 12px; top: 0; bottom: 0; display: flex; align-items: center; font: 400 14px/1 var(--wc-sans); color: rgba(var(--wc-ink), .75); }

.d-lights { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 8px; }
.d-light {
  height: 54px; padding: 0 12px; border-radius: 14px; box-sizing: border-box;
  border: 1px solid rgba(var(--wc-ink), .16); display: flex; align-items: center; gap: 10px;
  cursor: pointer; color: rgba(var(--wc-ink), .6); min-width: 0; user-select: none;
}
.d-light ha-icon { --mdc-icon-size: 20px; width: 20px; height: 20px; flex: none; }
.d-light .d-lt { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.d-light .d-lt b { font: 400 14px/1 var(--wc-sans); color: rgba(var(--wc-ink), .85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-light .d-lt span { font: 500 10px/1 var(--wc-mono); letter-spacing: .08em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-light.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.d-light.na { opacity: .4; }

.d-devs { margin-top: 18px; }
.d-col-climate .d-devs { margin-top: 22px; }

/* focus timer */
.d-pomo-head { display: flex; align-items: center; justify-content: space-between; }
.d-pomo-dots { display: flex; gap: 6px; }
.d-pomo-dots i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid rgba(var(--wc-ink), .35); box-sizing: border-box; }
.d-pomo-dots i.on { background: var(--wc-accent); border-color: var(--wc-accent); }
.d-pomo-row { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.d-pomo-time { font: 500 44px/1 var(--wc-sans); letter-spacing: -.03em; color: rgba(var(--wc-ink), .85); }
.d-pomo.run .d-pomo-time { color: rgb(var(--wc-ink)); }
.d-pomo.paused .d-pomo-time { color: rgba(var(--wc-ink), .45); }
.d-pomo-btns { display: flex; gap: 8px; flex: none; }
.d-pomo-btns .h-mbtn { width: 44px; }
.d-pomo-btns .h-mbtn.on { background: var(--wc-accent); color: var(--wc-on-accent); border-color: var(--wc-accent); }
.d-pomo-track { margin-top: 12px; height: 4px; border-radius: 2px; background: rgba(var(--wc-ink), .13); overflow: hidden; }
.d-pomo-fill { display: block; height: 100%; background: var(--wc-accent); transform-origin: 0 50%; transform: scaleX(0); transition: transform 1s linear; }
.d-pomo.brk .d-pomo-fill { background: rgba(var(--wc-ink), .6); }
.d-pomo-foot { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.d-pomo-phases { display: flex; gap: 6px; flex: none; }
.d-pomo-phases span {
  padding: 5px 9px; border-radius: 999px; border: 1px solid rgba(var(--wc-ink), .16); cursor: pointer;
  font: 500 10px/1 var(--wc-mono); letter-spacing: .06em; text-transform: uppercase; color: rgba(var(--wc-ink), .55);
}
.d-pomo-phases span.on { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.d-pomo-sub { font: 400 13px/1.2 var(--wc-sans); color: rgba(var(--wc-ink), .55); text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-dev { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid rgba(var(--wc-ink), .1); cursor: pointer; user-select: none; }
.d-dev:last-child { border-bottom: 1px solid rgba(var(--wc-ink), .1); }
.d-dev ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; flex: none; color: rgba(var(--wc-ink), .4); }
.d-dev.on ha-icon { color: var(--wc-accent); }
.d-dev .d-main b { font-size: 16px; }
.d-sw { width: 40px; height: 24px; border-radius: 999px; background: rgba(var(--wc-ink), .14); position: relative; flex: none; transition: background .2s; }
.d-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: rgba(var(--wc-ink), .7); transition: transform .2s; }
.d-dev.on .d-sw { background: var(--wc-accent); }
.d-dev.on .d-sw::after { transform: translateX(16px); background: var(--wc-on-accent); }

/* music: its own panel, tinted from the album art (Material You style) */
.d-music {
  position: relative; flex: 1; min-height: 0; border-radius: 28px; overflow: hidden;
  background: #0e0e0e; border: 1px solid rgba(255,255,255,.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 18px 50px rgba(0,0,0,.32);
}
.d-music.hidden { display: none; }
.d-music-bg {
  position: absolute; inset: 0; pointer-events: none; transition: background .8s ease;
  background: radial-gradient(120% 70% at 0% 0%, #3a2f14 0%, transparent 62%), linear-gradient(160deg, #1f1a10 0%, #0e0e0e 100%);
}
.d-music-in { position: relative; height: 100%; box-sizing: border-box; padding: 26px 26px 14px; display: flex; flex-direction: column; }
.d-music .h-eyebrow { color: rgba(var(--wc-ink), .6); }
.d-np { margin-top: 18px; display: flex; align-items: center; gap: 18px; }
.d-art {
  --mdc-icon-size: 36px; width: 112px; height: 112px; border-radius: 16px; flex: none; overflow: hidden;
  background: rgba(var(--wc-ink), .08); display: flex; align-items: center; justify-content: center; color: rgba(var(--wc-ink), .35);
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
}
.d-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.d-np .h-media-row { margin-top: 0; flex: 1; min-width: 0; }
.d-np .h-media-txt b { font-size: 21px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.d-np .h-media-txt span { font-size: 14px; color: rgba(var(--wc-ink), .65); }
.d-music .h-media-btns { margin-top: 20px; }
.d-music .h-mbtn, .d-music .h-vol-btn { border-color: rgba(var(--wc-ink), .14); background: rgba(var(--wc-ink), .05); }
.d-music .h-mbtn.h-play { background: rgba(var(--wc-ink), .1); }
.d-music .h-mbtn.h-play.on { border-color: var(--wc-accent); background: var(--wc-accent); color: var(--wc-on-accent); }
.d-music .h-vol-track { background: rgba(var(--wc-ink), .06); border-color: rgba(var(--wc-ink), .1); }
.d-music .h-vol-fill { background: var(--wc-accent-fill); }
.d-favs { margin-top: 22px; flex: 1; min-height: 120px; display: flex; flex-direction: column; }
.d-fav-list {
  margin: 8px -10px 0; padding: 0 10px 18px; flex: 1; min-height: 0; overflow-y: auto;
  overflow-x: hidden; scrollbar-width: none;
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 28px), transparent);
  mask-image: linear-gradient(180deg, #000 calc(100% - 28px), transparent);
}
.d-fav-list::-webkit-scrollbar { width: 0; height: 0; display: none; }
.d-fav-list { cursor: grab; touch-action: pan-y; }
.d-fav-list.d-dragging { cursor: grabbing; user-select: none; }
.d-fav {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin: 0 -12px; border-radius: 12px;
  cursor: pointer; font: 400 15px/1.2 var(--wc-sans); color: rgba(var(--wc-ink), .8);
}
.d-fav span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-fav ha-icon { --mdc-icon-size: 16px; width: 16px; height: 16px; flex: none; color: rgba(var(--wc-ink), .35); }
.d-fav.on { background: var(--wc-accent-soft); color: var(--wc-accent); }
.d-fav-group { padding: 14px 0 4px; }
.d-fav-group:first-child { padding-top: 2px; }
.d-music .d-repeat.on, .d-music .d-shuffle.on { color: var(--wc-accent); border-color: var(--wc-accent); }
.d-fav.on ha-icon { color: var(--wc-accent); }

/* home */
.d-alarm, .d-vac-row { margin-top: 12px; display: flex; align-items: center; gap: 14px; }
.d-alarm { cursor: pointer; }
.d-alarm.armed .d-sq { border-color: var(--wc-accent); background: var(--wc-accent-soft); color: var(--wc-accent); }
.d-alarm.trig .d-sq { border-color: var(--wc-danger); background: rgba(255,107,87,.12); color: var(--wc-danger); }
.d-alarm.busy .d-sq { animation: d-pulse 1.6s ease-in-out infinite; }
.d-vac-row .d-main { cursor: pointer; }
.d-vac-btns { display: flex; gap: 8px; flex: none; }
.d-vac-btns .h-mbtn { width: 44px; }
.d-note-txt {
  margin-top: 12px; font: 400 15px/1.5 var(--wc-sans); color: rgba(var(--wc-ink), .75);
  white-space: pre-line; max-height: 9em; overflow-y: auto; scrollbar-width: thin;
}

/* footer */
.d-foot { margin-top: 22px; align-items: center; gap: 24px; }
.d-foot .nav { flex: 0 1 560px; }

/* mouse */
@media (hover: hover) {
  .h-mbtn:not(.on):hover, .h-round:hover, .h-vol-btn:not(.on):hover, .d-sq:not(.on):hover,
  .h-scene:not(.on):hover, .d-light:not(.on):hover {
    border-color: rgba(var(--wc-ink), .38); color: rgb(var(--wc-ink));
  }
  .on > .d-sq:hover, .d-light.on:hover, .h-scene.on:hover, .h-mbtn.on:hover { background: var(--wc-accent-fill); }
  .d-pomo-phases span:not(.on):hover { border-color: rgba(var(--wc-ink), .38); color: rgb(var(--wc-ink)); }
  .d-fav:not(.on):hover { background: rgba(var(--wc-ink), .07); }
  .d-dev:hover .d-main b, .d-alarm:hover .d-main b, .d-vac-row .d-main:hover b { color: var(--wc-accent); }
  .nav-item:not(.active):not(.disabled):hover { border-color: rgba(var(--wc-ink), .38); color: rgb(var(--wc-ink)); }
}

/* smaller windows: weather drops under the clock */
.d-mid .d-head { grid-template-columns: minmax(0, 1fr); }
.d-mid .d-wx { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr; gap: 40px; align-items: end; }
.d-mid .d-wx .h-fc { margin-top: 0; }

/* narrow: everything stacked */
.desk.d-narrow { padding: 16px; }
.d-narrow .d-head { grid-template-columns: 1fr; gap: 22px; }
.d-narrow .d-left { flex-direction: column; align-items: flex-start; gap: 22px; }
.d-narrow .d-top { margin: -16px -16px 4px; }
.d-narrow .d-top .d-head { padding: 24px 22px; }
.d-narrow .d-tick { padding: 0 22px; }
.d-narrow .d-head .h-clock { font-size: 88px; }
.d-narrow .d-greet { font-size: 30px; }
.d-narrow .d-body { flex-direction: column; }
.d-narrow .d-side, .d-narrow .d-col-music { flex: none; }
.d-narrow .d-spacer { display: none; }
.d-narrow .d-fav-list { max-height: 340px; }
.d-narrow .d-music-in { padding: 20px 18px 10px; }
.d-narrow .d-foot { flex-wrap: wrap; }
`;

  _template() {
    return `
      <div class="desk">
        <div class="d-top">
        <header class="d-head d-glass">
          <div class="d-left">
          <div class="d-time">
            <div class="h-date"><span class="h-dot"></span><span class="h-eyebrow h-date-txt"></span></div>
            <div class="h-clock">--:--</div>
          </div>
          <div class="d-hello">
            <div class="d-greet"></div>
            <div class="d-brief"></div>
          </div>
          </div>
          <div class="d-wx">
            <div class="h-wx tap">
              <ha-icon class="h-wx-icon"></ha-icon>
              <span class="h-wx-temp">--&deg;</span>
              <span class="h-wx-txt"><span class="h-wx-cond"></span><span class="h-wx-meta"></span></span>
            </div>
            <div class="h-fc"></div>
          </div>
        </header>

        <div class="d-tick d-glass hidden">
          <span class="d-tick-label"><span class="h-dot"></span><span class="d-tick-name"></span></span>
          <span class="d-tick-win"><span class="d-tick-track"></span></span>
        </div>

        </div>

        <div class="d-body">
          <aside class="d-side d-glass">
            <div class="d-side-in d-col-climate">
              <div class="d-blk d-climate-sec">
                <span class="h-eyebrow d-climate-label">Climate</span>
                <div class="d-rooms"></div>
                <div class="d-devs"></div>
                <div class="h-air"></div>
                <div class="h-ac hidden">
                  <div class="h-eyebrow h-ac-label">Air conditioning</div>
                  <div class="h-ac-row">
                    <span class="h-ac-set tap">--</span>
                    <ha-icon class="h-round h-ac-down" icon="mdi:minus"></ha-icon>
                    <ha-icon class="h-round h-ac-up" icon="mdi:plus"></ha-icon>
                  </div>
                  <div class="h-ac-sub"></div>
                </div>
              </div>
              <div class="d-blk d-desk-sec">
                <span class="h-eyebrow d-desk-label">Desk</span>
                <div class="d-lamp-blk hidden">
                  <div class="d-lamp">
                    <ha-icon class="d-sq d-lamp-ic"></ha-icon>
                    <span class="d-main tap"><b></b><span></span></span>
                  </div>
                  <div class="d-slider d-lamp-slider"><span class="d-slider-fill"></span><span class="d-slider-pct"></span></div>
                </div>
                <div class="d-lights"></div>
              </div>
              <div class="d-blk d-pomo hidden">
                <div class="d-pomo-head"><span class="h-eyebrow d-pomo-label">Focus timer</span><span class="d-pomo-dots"></span></div>
                <div class="d-pomo-row">
                  <span class="d-pomo-time">25:00</span>
                  <span class="d-pomo-btns">
                    <ha-icon class="h-mbtn d-pomo-go" icon="mdi:play"></ha-icon>
                    <ha-icon class="h-mbtn d-pomo-reset" icon="mdi:restore" title="Reset"></ha-icon>
                    <ha-icon class="h-mbtn d-pomo-skip" icon="mdi:skip-next" title="Skip to next"></ha-icon>
                  </span>
                </div>
                <div class="d-pomo-track"><span class="d-pomo-fill"></span></div>
                <div class="d-pomo-foot">
                  <span class="d-pomo-phases"><span data-p="focus"></span><span data-p="short"></span><span data-p="long"></span></span>
                  <span class="d-pomo-sub"></span>
                </div>
              </div>
              <div class="d-blk d-alarm-blk hidden">
                <div class="h-eyebrow">Alarm</div>
                <div class="d-alarm">
                  <ha-icon class="d-sq" icon="mdi:shield-home-outline"></ha-icon>
                  <span class="d-main"><b></b><span></span></span>
                </div>
              </div>
              <div class="d-blk h-phone hidden">
                <div class="h-phone-head"><span class="h-eyebrow">Phone</span><span class="h-phone-name"></span></div>
                <div class="h-phone-row"><span class="h-phone-pct">--%</span><ha-icon class="h-phone-icon"></ha-icon></div>
                <div class="h-phone-track"><span class="h-phone-fill"></span></div>
                <div class="h-phone-sub"></div>
              </div>
              <div class="d-blk d-vac hidden">
                <div class="h-eyebrow">Vacuum</div>
                <div class="d-vac-row">
                  <span class="d-main"><b></b><span></span></span>
                  <span class="d-vac-btns">
                    <ha-icon class="h-mbtn d-vac-go" icon="mdi:play"></ha-icon>
                    <ha-icon class="h-mbtn d-vac-dock" icon="mdi:home-import-outline"></ha-icon>
                  </span>
                </div>
              </div>
              <div class="d-blk d-note hidden">
                <div class="h-eyebrow d-note-label">Note</div>
                <div class="d-note-txt"></div>
              </div>
              <div class="h-sun hidden">
                <div class="h-eyebrow">Daylight</div>
                <div class="h-sun-track"><span class="h-sun-fill"></span><span class="h-sun-dot"></span></div>
                <div class="h-sun-ends"><span class="h-sun-rise"></span><span class="h-sun-note"></span><span class="h-sun-set"></span></div>
              </div>
              <div class="h-scenes hidden">
                <div class="h-eyebrow h-scene-label">Scenes</div>
                <div class="h-scene-grid"></div>
              </div>
              <div class="h-deps hidden"><div class="h-eyebrow h-dep-head"></div><div class="h-dep-list"></div></div>
            </div>
          </aside>
          <div class="d-spacer"></div>
          <section class="d-col-music">
            <div class="h-media d-music hidden">
              <div class="d-music-bg"></div>
              <div class="d-music-in">
                <div class="h-eyebrow">Now playing</div>
                <div class="d-np">
                  <span class="d-art tap"><ha-icon icon="mdi:music"></ha-icon></span>
                  <div class="h-media-row"><span class="h-media-txt"><b></b><span></span></span></div>
                </div>
                <div class="h-media-btns">
                  <ha-icon class="h-mbtn h-prev" icon="mdi:skip-previous"></ha-icon>
                  <ha-icon class="h-mbtn h-play" icon="mdi:play"></ha-icon>
                  <ha-icon class="h-mbtn h-next" icon="mdi:skip-next"></ha-icon>
                </div>
                <div class="h-vol h-mvol hidden">
                  <ha-icon class="h-vol-btn h-mvol-mute hidden" icon="mdi:volume-high"></ha-icon>
                  <span class="h-vol-track h-mvol-track"><span class="h-vol-fill"></span><span class="h-vol-pct"></span></span>
                  <ha-icon class="h-vol-btn d-shuffle hidden" icon="mdi:shuffle-disabled" title="Shuffle"></ha-icon>
                  <ha-icon class="h-vol-btn d-repeat hidden" icon="mdi:repeat-off" title="Repeat"></ha-icon>
                </div>
                <div class="d-favs hidden">
                  <div class="h-eyebrow d-favs-label">Sources</div>
                  <div class="d-fav-list"></div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="h-foot d-foot"><span class="h-foot-l"></span><div class="nav hidden"></div><span class="h-foot-r"></span></div>
      </div>`;
  }

  _collect() {
    super._collect();
    const q = (s) => this._q(s);
    Object.assign(this._el, {
      desk: q(".desk"),
      sideIn: q(".d-side-in"),
      climateSec: q(".d-climate-sec"),
      deskSec: q(".d-desk-sec"),
      greet: q(".d-greet"),
      brief: q(".d-brief"),
      wx: q(".d-wx .h-wx"),
      tick: q(".d-tick"),
      tickName: q(".d-tick-name"),
      tickWin: q(".d-tick-win"),
      tickTrack: q(".d-tick-track"),
      climateLabel: q(".d-climate-label"),
      rooms: q(".d-rooms"),
      deskLabel: q(".d-desk-label"),
      lampBlk: q(".d-lamp-blk"),
      lamp: q(".d-lamp"),
      lampIc: q(".d-lamp-ic"),
      lampName: q(".d-lamp .d-main b"),
      lampSub: q(".d-lamp .d-main span"),
      lampMain: q(".d-lamp .d-main"),
      lampSlider: q(".d-lamp-slider"),
      lights: q(".d-lights"),
      devs: q(".d-devs"),
      art: q(".d-art"),
      favs: q(".d-favs"),
      music: q(".d-music"),
      musicBg: q(".d-music-bg"),
      favsLabel: q(".d-favs-label"),
      favList: q(".d-fav-list"),
      repeat: q(".d-repeat"),
      shuffle: q(".d-shuffle"),
      alarmBlk: q(".d-alarm-blk"),
      alarm: q(".d-alarm"),
      alarmIc: q(".d-alarm .d-sq"),
      alarmName: q(".d-alarm .d-main b"),
      alarmSub: q(".d-alarm .d-main span"),
      vac: q(".d-vac"),
      vacMain: q(".d-vac-row .d-main"),
      vacName: q(".d-vac-row .d-main b"),
      vacSub: q(".d-vac-row .d-main span"),
      vacGo: q(".d-vac-go"),
      vacDock: q(".d-vac-dock"),
      pomo: q(".d-pomo"),
      pomoLabel: q(".d-pomo-label"),
      pomoDots: q(".d-pomo-dots"),
      pomoTime: q(".d-pomo-time"),
      pomoGo: q(".d-pomo-go"),
      pomoReset: q(".d-pomo-reset"),
      pomoSkip: q(".d-pomo-skip"),
      pomoFill: q(".d-pomo-fill"),
      pomoSub: q(".d-pomo-sub"),
      pomoPhases: Array.from(this.shadowRoot.querySelectorAll(".d-pomo-phases span")),
      note: q(".d-note"),
      noteLabel: q(".d-note-label"),
      noteTxt: q(".d-note-txt"),
    });
    const el = this._el;
    const c = () => this._config;

    el.pomoGo.addEventListener("click", () => this._pomoAction("go"));
    el.pomoReset.addEventListener("click", () => this._pomoAction("reset"));
    el.pomoSkip.addEventListener("click", () => this._pomoAction("skip"));
    el.pomoPhases.forEach((b) => b.addEventListener("click", () => this._pomoAction(b.dataset.p)));
    el.wx.addEventListener("click", () => c().weather && this._moreInfo(c().weather));
    el.acSet.addEventListener("click", () => c().climate && this._moreInfo(c().climate));

    /* desk lamp: square toggles, name opens details, slider sets brightness */
    el.lampIc.addEventListener("click", () => {
      const id = this._lampId();
      if (id) this._call("light", "toggle", { entity_id: id });
    });
    el.lampMain.addEventListener("click", () => this._lampId() && this._moreInfo(this._lampId()));
    this._wireSlider(el.lampSlider, ".d-slider-fill", ".d-slider-pct", {
      get: () => {
        const st = this._hass?.states?.[this._lampId()];
        if (!st) return null;
        return st.state === "on" ? Math.round(((num(st.attributes?.brightness) ?? 255) / 255) * 100) : 0;
      },
      set: (v) => {
        const id = this._lampId();
        if (!id) return;
        if (v <= 0) this._call("light", "turn_off", { entity_id: id });
        else this._call("light", "turn_on", { entity_id: id, brightness_pct: Math.max(1, v) });
      },
    });

    /* volume: drag or scroll instead of the hub's single click */
    this._wireSlider(el.mvolTrack, ".h-vol-fill", ".h-vol-pct", {
      get: () => {
        const st = this._hass?.states?.[c().media_player];
        const v = num(st?.attributes?.volume_level);
        return v == null ? null : Math.round(v * 100);
      },
      set: (v) => c().media_player && this._call("media_player", "volume_set", {
        entity_id: c().media_player, volume_level: v / 100,
      }),
    });

    this._wireDragScroll(el.favList);
    el.repeat.addEventListener("click", () => {
      const id = c().media_player;
      const st = id ? this._hass?.states?.[id] : null;
      if (!st) return;
      const order = ["off", "all", "one"];
      const next = order[(order.indexOf(st.attributes?.repeat || "off") + 1) % 3];
      this._call("media_player", "repeat_set", { entity_id: id, repeat: next });
    });
    el.shuffle.addEventListener("click", () => {
      const id = c().media_player;
      const st = id ? this._hass?.states?.[id] : null;
      if (!st) return;
      this._call("media_player", "shuffle_set", { entity_id: id, shuffle: !st.attributes?.shuffle });
    });
    el.art.addEventListener("click", () => c().media_player && this._moreInfo(c().media_player));
    el.alarm.addEventListener("click", () => c().alarm && this._moreInfo(c().alarm));
    el.vacMain.addEventListener("click", () => this._vacCfg() && this._moreInfo(this._vacCfg().entity));
    el.vacGo.addEventListener("click", () => {
      const v = this._vacCfg();
      const st = v ? this._hass.states?.[v.entity] : null;
      if (!st) return;
      this._call("vacuum", st.state === "cleaning" ? "pause" : "start", { entity_id: v.entity });
    });
    el.vacDock.addEventListener("click", () => {
      const v = this._vacCfg();
      if (v) this._call("vacuum", "return_to_base", { entity_id: v.entity });
    });
  }

  /* A horizontal slider for the mouse: press and drag, or click anywhere, or
     scroll the wheel over it. Shows the new value straight away and ignores
     incoming states for a moment so the bar doesn't jump back while HA catches up. */
  _wireSlider(track, fillSel, pctSel, { get, set, step = 5 }) {
    if (!track) return;
    let drag = false;
    let val = 0;
    let wheelT = null;
    const at = (ev) => {
      const r = track.getBoundingClientRect();
      return Math.max(0, Math.min(100, Math.round(((ev.clientX - r.left) / r.width) * 100)));
    };
    const show = (v) => {
      track._hold = Date.now() + 2500;
      const f = track.querySelector(fillSel);
      const p = track.querySelector(pctSel);
      if (f) f.style.width = v + "%";
      if (p) p.textContent = v + "%";
    };
    track.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0) return;
      drag = true;
      try { track.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      val = at(ev);
      show(val);
    });
    track.addEventListener("pointermove", (ev) => { if (drag) { val = at(ev); show(val); } });
    const end = () => { if (!drag) return; drag = false; show(val); set(val); };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    track.addEventListener("wheel", (ev) => {
      const cur = track._hold > Date.now() && track._last != null ? track._last : get();
      if (cur == null) return;
      ev.preventDefault();
      const v = Math.max(0, Math.min(100, cur + (ev.deltaY < 0 ? step : -step)));
      track._last = v;
      show(v);
      clearTimeout(wheelT);
      wheelT = setTimeout(() => set(v), 220);
    }, { passive: false });
  }

  /* Grab and drag a list to scroll it, for wallpaper hosts (like Lively) that
     pass clicks and drags through but not the scroll wheel. A drag never
     counts as a click on the row under it. */
  _wireDragScroll(list) {
    if (!list) return;
    let startY = 0;
    let startTop = 0;
    let down = false;
    let moved = false;
    let reportsButtons = false;
    list.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0) return;
      down = true;
      /* Some wallpaper hosts (Lively) forward moves with buttons = 0 even while
         the mouse is held, so only trust "button up" once a move has reported
         the button as down. */
      reportsButtons = false;
      moved = false;
      startY = ev.clientY;
      startTop = list.scrollTop;
    });
    list.addEventListener("pointermove", (ev) => {
      if (!down) return;
      /* the button is already up (released outside, or the host swallowed
         pointerup): stop dragging instead of following the mouse */
      if (ev.buttons > 0) reportsButtons = true;
      else if (reportsButtons) { end(); return; }
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) > 6) {
        moved = true;
        try { list.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
        list.classList.add("d-dragging");
      }
      if (moved) list.scrollTop = startTop - dy;
    });
    function end(ev) {
      down = false;
      list.classList.remove("d-dragging");
      if (ev && ev.pointerId != null) { try { list.releasePointerCapture(ev.pointerId); } catch (e) { /* noop */ } }
      /* a drag that ended without a click on the list must not eat the next click */
      if (moved) setTimeout(() => { moved = false; }, 0);
    }
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
    window.addEventListener("pointerup", () => { if (down) end(); }, true);
    window.addEventListener("mouseup", () => { if (down) end(); }, true);
    window.addEventListener("blur", () => { if (down) end(); });
    list.addEventListener("click", (ev) => {
      if (moved) { ev.stopPropagation(); ev.preventDefault(); moved = false; }
    }, true);
  }

  _sliderBusy(track) { return track && track._hold > Date.now(); }

  _update() {
    super._update();
    this._renderGreeting();
    this._renderTicker();
    this._renderRooms();
    this._renderLamp();
    this._renderLights();
    this._renderDevices();
    this._renderFavorites();
    this._renderAlarm();
    this._renderVacuum();
    this._renderNote();
    this._renderPomo();
    const c = this._config;
    this._el.climateLabel.textContent = c.climate_label || "Climate";
    this._el.deskLabel.textContent = c.desk_label || "Desk";
    this._el.climateLabel.classList.toggle("hidden", c.climate_label === false);
    this._el.footL.textContent = c.footer_left || "Home Assistant";
    this._applyLook();
    this._tidySide();
    /* entering or leaving edit mode switches full-screen on the next update */
    if (this._fullScreen() !== this._fullWas) this._fit();
  }

  /* wallpaper, glass and panel widths: only touched when the config changes */
  _applyLook() {
    const c = this._config;
    const sig = [c.panel_edge, c.panel_bottom, c.side_spacing, c.side_dividers, c.status?.icon_size, c.brief_opacity, c.ticker_gap, c.ticker_position, c.header_blur, c.background_image, c.glass, c.glass_opacity, c.glass_blur, c.side_width, c.music_width, c.footer, !!c.nav].join("|");
    if (sig === this._lookSig) return;
    this._lookSig = sig;
    const d = this._el.desk;
    const css = (k, v) => (v == null || v === "" ? d.style.removeProperty(k) : d.style.setProperty(k, v));
    const img = c.background_image;
    css("--d-wall", img ? `url("${String(img).replace(/"/g, "%22")}")` : null);
    d.classList.toggle("no-glass", c.glass === false);
    d.classList.toggle("tick-top", c.ticker_position === "top");
    const hb = num(c.header_blur);
    css("--d-head-blur", hb == null ? null : hb + "px");
    const op = num(c.glass_opacity);
    css("--d-glass-alpha", op == null ? null : String(Math.max(0, Math.min(1, op))));
    const bl = num(c.glass_blur);
    css("--d-blur", bl == null ? null : bl + "px");
    const px = (v) => (num(v) != null ? num(v) + "px" : v || null);
    css("--d-side-w", px(c.side_width));
    css("--d-edge", px(c.panel_edge));
    css("--d-bottom", px(c.panel_bottom));
    css("--d-tick-gap", px(c.ticker_gap));
    css("--d-gap", px(c.side_spacing));
    css("--d-status-icon", px(c.status?.icon_size));
    const dv = c.side_dividers;
    this._el.desk?.classList.toggle("d-dividers", !!dv);
    css("--d-div-op", typeof dv === "number" ? String(Math.max(0, Math.min(1, dv))) : null);
    const bo = num(c.brief_opacity);
    css("--d-brief-op", bo == null ? null : String(Math.max(0, Math.min(1, bo))));
    css("--d-music-w", px(c.music_width));
    /* the footer is off unless asked for, or there are page tabs to show */
    this._q(".d-foot").classList.toggle("hidden", !(c.footer === true || (Array.isArray(c.nav) && c.nav.length)));
  }

  /* hide sections with nothing configured, and drop the top gap of the first one */
  _tidySide() {
    const el = this._el;
    const c = this._config;
    el.climateSec.classList.toggle("hidden",
      !this._roomList().length && !(c.devices || []).length && !this._airList().length && !c.climate);
    el.deskSec.classList.toggle("hidden", !c.desk_light && !(c.lights || []).length);
    let first = true;
    Array.from(el.sideIn.children).forEach((n) => {
      const shown = !n.classList.contains("hidden");
      n.classList.toggle("d-first", shown && first);
      if (shown) first = false;
    });
  }

  /* ---- greeting and the short brief under it ---- */

  _timeGreeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  _valueOf(def) {
    const st = def.entity ? this._hass.states?.[def.entity] : null;
    if (!st) return null;
    const raw = def.attribute ? st.attributes?.[def.attribute] : st.state;
    if (raw == null || raw === "" || raw === "unknown" || raw === "unavailable") return null;
    if (def.attribute) return String(raw);
    const n = num(raw);
    if (n != null && def.unit !== false) {
      const unit = def.unit != null ? def.unit : st.attributes?.unit_of_measurement || "";
      const digits = def.decimals != null ? num(def.decimals) : (Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 1);
      return n.toFixed(digits) + (unit ? (unit === "%" ? "%" : " " + unit) : "");
    }
    return this._stateLabel(st);
  }

  _renderGreeting() {
    const c = this._config;
    const el = this._el;
    let g = "";
    if (c.greeting) {
      const st = this._hass.states?.[c.greeting];
      if (st && !["unknown", "unavailable", ""].includes(st.state)) g = st.state;
    }
    if (!g) g = this._timeGreeting();
    g = g.replace(/[\s,]+$/, "");
    const line = c.name ? `${g}, ${c.name}` : g;
    if (el.greet.textContent !== line) el.greet.textContent = line;

    /* status: one honey line with a pulsing warning icon, first in the brief,
       shown only while it is active (same rules as ticker alerts) */
    const sc = c.status ? (typeof c.status === "string" ? { entity: c.status } : c.status) : null;
    /* active: honey + pulsing icon. Quiet: the helper's own text (e.g.
       "Nothing currently needs attention") in the grey brief tone with a calm
       check, so the line never disappears and the greeting stays put.
       `idle: false` hides it while quiet; `idle_text` overrides the text. */
    let status = null, quiet = false;
    if (sc) {
      if (this._alertActive(sc)) status = this._alertText(sc);
      else if (sc.idle !== false) {
        status = sc.idle_text != null ? String(sc.idle_text) : this._alertText({ entity: sc.entity, attribute: sc.attribute });
        quiet = !!status;
      }
    }

    const items = (Array.isArray(c.brief) ? c.brief : [])
      .filter((d) => !sc || (typeof d === "string" ? d : d?.entity) !== sc.entity);
    const parts = items.map((d) => {
      d = typeof d === "string" ? { entity: d } : d || {};
      const v = this._valueOf(d);
      if (v == null && d.unknown == null) return null;
      return { label: d.label || "", value: v == null ? String(d.unknown) : v };
    }).filter(Boolean);
    if (status) parts.unshift(quiet
      ? { status: true, quiet: true, value: status, icon: sc.idle_icon || "mdi:check-circle-outline" }
      : { status: true, value: status, icon: sc.icon || "mdi:alert" });
    const sig = JSON.stringify(parts);
    if (sig === this._sigBrief) return;
    this._sigBrief = sig;
    el.brief.textContent = "";
    /* keep the line's height whenever a brief or status is configured, so an
       empty moment never drops the greeting (it sits on the bottom edge) */
    el.brief.classList.toggle("hidden", !parts.length && !sc && !items.length);
    el.brief.classList.toggle("d-empty", !parts.length);
    parts.forEach((p) => {
      const s = document.createElement("span");
      if (p.status) {
        s.className = p.quiet ? "d-status d-quiet" : "d-status";
        const ic = document.createElement("ha-icon");
        ic.setAttribute("icon", p.icon);
        s.appendChild(ic);
      }
      if (p.label) s.appendChild(document.createTextNode(p.label + " "));
      const b = document.createElement("b");
      b.textContent = p.value;
      s.appendChild(b);
      el.brief.appendChild(s);
    });
  }

  /* ---- the rolling ticker ----
   * When anything in `ticker.alerts` is active it shows those, in red, as HOME.
   * Otherwise it rolls a weather summary (plus any `ticker.extra` lines). */

  _alertActive(a) {
    const id = a.when || (a.text == null ? a.entity : null);
    if (!id) return !!a.text;
    const st = this._hass.states?.[id];
    if (!st) return false;
    const s = String(st.state);
    if (a.state != null) return [].concat(a.state).map(String).includes(s);
    if (a.state_not != null) return ![].concat(a.state_not).map(String).includes(s);
    if (a.above != null) return num(s) != null && num(s) > num(a.above);
    if (a.below != null) return num(s) != null && num(s) < num(a.below);
    if (num(s) != null) return num(s) !== 0;
    return !DESK_QUIET.includes(s.toLowerCase());
  }

  _alertText(a) {
    if (a.text != null) return String(a.text);
    const st = a.entity ? this._hass.states?.[a.entity] : null;
    if (!st) return null;
    const raw = a.attribute ? st.attributes?.[a.attribute] : st.state;
    if (raw == null || raw === "" || raw === "unknown" || raw === "unavailable") return null;
    return (a.prefix || "") + (a.attribute ? String(raw) : this._stateLabel(st));
  }

  /* The weather as a short spoken bulletin: full sentences, numbers said the
     way a presenter would, and only the details worth mentioning. */
  _weatherLines() {
    const c = this._config;
    const w = c.weather ? this._hass.states?.[c.weather] : null;
    if (!w) return [];
    const a = w.attributes || {};
    const out = [];
    const deg = (v) => {
      const n = Math.round(num(v));
      if (!Number.isFinite(n)) return "";
      const word = Math.abs(n) === 1 ? "degree" : "degrees";
      return n < 0 ? `minus ${-n} ${word}` : `${n} ${word}`;
    };
    const bare = (v) => {
      const n = Math.round(num(v));
      return n < 0 ? `minus ${-n}` : String(n);
    };
    const NOW = {
      sunny: "sunny", "clear-night": "clear", partlycloudy: "partly cloudy", cloudy: "cloudy",
      rainy: "raining", pouring: "pouring", snowy: "snowing", "snowy-rainy": "sleeting",
      fog: "foggy", hail: "hailing", lightning: "stormy", "lightning-rainy": "stormy with rain",
      windy: "windy", "windy-variant": "windy and cloudy", exceptional: "unusual out there",
    };
    const NOUN = {
      sunny: "sunshine", "clear-night": "clear skies", partlycloudy: "a mix of sun and cloud",
      cloudy: "grey skies", rainy: "rain", pouring: "heavy rain", snowy: "snow",
      "snowy-rainy": "sleet", fog: "fog", hail: "hail", lightning: "thunderstorms",
      "lightning-rainy": "thunderstorms and rain", windy: "strong winds", "windy-variant": "wind and cloud",
      exceptional: "unusual weather",
    };
    const WET = { rainy: "rain", pouring: "rain", "lightning-rainy": "rain", snowy: "snow", "snowy-rainy": "sleet", hail: "hail" };
    const place = c.ticker?.place ? ` in ${c.ticker.place}` : "";

    /* Three long, flowing sentences: right now, the next day or so, and
       further ahead with the sun. Each clause is added only when it has data. */
    const join = (parts) => {
      const p = parts.filter(Boolean);
      if (p.length < 2) return p[0] || "";
      return p.slice(0, -1).join(", ") + " and " + p[p.length - 1];
    };

    /* right now: temperature, feels-like, wind and notable humidity */
    {
      const parts = [];
      if (num(a.temperature) != null) {
        let s = `It's ${deg(a.temperature)} and ${NOW[w.state] || titleCase(w.state).toLowerCase()}${place} right now`;
        const feels = num(a.apparent_temperature);
        if (feels != null && Math.abs(feels - a.temperature) >= 2) s += `, though it feels more like ${bare(feels)}`;
        parts.push(s);
      }
      let ws = num(a.wind_speed);
      let wind = "";
      if (ws != null) {
        const unit = String(a.wind_speed_unit || "km/h").toLowerCase();
        const ms = unit.includes("m/s") ? ws : unit.includes("mph") ? ws * 0.447 : unit.includes("kn") ? ws * 0.514 : ws / 3.6;
        const b = num(a.wind_bearing);
        const DIRS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
        const from = b == null ? "" : ` from the ${DIRS[Math.round(b / 45) % 8]}`;
        const spoken = unit.includes("m/s") ? `${Math.round(ws)} metres per second`
          : unit.includes("mph") ? `${Math.round(ws)} miles an hour`
          : unit.includes("kn") ? `${Math.round(ws)} knots` : `${Math.round(ws)} kilometres an hour`;
        if (ms < 0.5) wind = "the air is completely still";
        else if (ms < 3.4) wind = `there's barely a breeze${from}`;
        else if (ms < 5.5) wind = `there's a gentle breeze${from} at ${spoken}`;
        else if (ms < 8) wind = `there's a fresh breeze${from} at ${spoken}`;
        else if (ms < 14) wind = `it's properly windy, ${spoken}${from}`;
        else wind = `it's blowing a stormy ${spoken}${from}, so hold on to your hat`;
        const gust = num(a.wind_gust_speed);
        if (gust != null && ms >= 3.4 && gust > ws * 1.4) wind += ` with gusts up to ${Math.round(gust)}`;
      }
      const hum = num(a.humidity);
      let damp = "";
      if (hum != null && hum >= 90) damp = `it's a damp one at ${Math.round(hum)} percent humidity`;
      else if (hum != null && hum <= 30) damp = `the air is dry at just ${Math.round(hum)} percent humidity`;
      const tail = join([wind, damp]);
      if (parts.length && tail) out.push(`${parts[0]}, while ${tail}.`);
      else if (parts.length) out.push(parts[0] + ".");
      else if (tail) out.push(tail.charAt(0).toUpperCase() + tail.slice(1) + ".");
    }

    /* forecast */
    const fc = this._forecast.length ? this._forecast : a.forecast || [];
    const sameDay = (d, off) => {
      const x = new Date();
      x.setDate(x.getDate() + off);
      return d && new Date(d.datetime).toDateString() === x.toDateString();
    };
    const today = fc.find((d) => sameDay(d, 0));
    const tomorrow = fc.find((d) => sameDay(d, 1));
    const after = fc.find((d) => sameDay(d, 2));
    /* what falls: snow, sleet and hail come from the condition; otherwise
       (rain, or a dry-looking condition with a chance of something) the
       day's temperatures decide, so a cold day says snow, not rain */
    const tUnit = String(a.temperature_unit || this._hass.config?.unit_system?.temperature || "°C");
    const toC = (v) => { const n = num(v); return n == null ? null : /F/i.test(tUnit) ? (n - 32) * 5 / 9 : n; };
    const chance = (d) => {
      const p = num(d?.precipitation_probability);
      if (p == null || p < 30) return null;
      const cond = d?.condition;
      let kind = cond && WET[cond] && WET[cond] !== "rain" ? WET[cond] : null;
      if (!kind) {
        const hi = toC(d?.temperature), lo = toC(d?.templow);
        if (hi != null && hi <= 0.5) kind = "snow";
        else if (hi != null && hi <= 3 || lo != null && lo <= 0 && (hi == null || hi <= 5)) kind = "sleet or snow";
        else kind = "rain";
      }
      const n = Math.round(p);
      return { p: n, a: n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90) ? "an" : "a", kind };
    };
    /* a rainy day that's cold enough is named by what will actually fall */
    const noun = (d) => {
      const ch = /^(rainy|pouring)$/.test(d?.condition) ? chance(d) : null;
      if (ch && ch.kind !== "rain") return d.condition === "pouring" ? `heavy ${ch.kind}` : ch.kind;
      return NOUN[d?.condition] || "changeable weather";
    };
    const KIT = { rain: ", so keep an umbrella handy", snow: ", so the roads may be slippery",
      "sleet or snow": ", so watch out for slippery roads", sleet: ", so watch out for slippery roads", hail: ", so keep the car under cover" };
    const hour = new Date().getHours();

    /* the next day or so, in one sentence */
    {
      let first = "";
      if (today) {
        const ch = chance(today);
        if (hour < 15 && today.temperature != null) {
          first = `Today tops out at ${deg(today.temperature)}`;
          if (ch) first += ` with ${ch.a} ${ch.p} percent chance of ${ch.kind}`;
        } else if (today.templow != null) {
          first = `Tonight it drops to ${deg(today.templow)}`;
          if (ch) first += ` with ${ch.a} ${ch.p} percent chance of ${ch.kind}`;
        }
      }
      let second = "";
      if (tomorrow) {
        second = `${first ? "tomorrow" : "Tomorrow"} brings ${noun(tomorrow)}`;
        if (tomorrow.temperature != null && tomorrow.templow != null) {
          second += ` with a high of ${bare(tomorrow.temperature)} and a low of ${bare(tomorrow.templow)}`;
        } else if (tomorrow.temperature != null) {
          second += ` at around ${deg(tomorrow.temperature)}`;
        }
        const t0 = num(today?.temperature);
        const t1 = num(tomorrow.temperature);
        if (t0 != null && t1 != null && Math.abs(t1 - t0) >= 3) {
          second += `, noticeably ${t1 > t0 ? "warmer" : "colder"} than today`;
        }
        const ch = chance(tomorrow);
        if (ch) {
          second += `, and there's ${ch.a} ${ch.p} percent chance of ${ch.kind}${ch.p >= 70 ? KIT[ch.kind] || "" : ""}`;
        }
      }
      if (first && second) out.push(`${first}, while ${second}.`);
      else if (first || second) out.push(`${first || second}.`);
    }

    /* further ahead, plus the sun */
    {
      let ahead = "";
      if (after) {
        let day = "";
        try { day = new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date(after.datetime)); } catch (e) { /* noop */ }
        ahead = `Looking further ahead, ${day || "the day after"} should see ${noun(after)}`;
        if (after.temperature != null) ahead += ` at around ${deg(after.temperature)}`;
      }
      let sunTxt = "";
      const sun = this._hass.states?.["sun.sun"];
      const win = sun ? this._dayWindow(sun) : null;
      if (win) {
        const say = (ms) => {
          const mins = Math.max(0, Math.round(ms / 60000));
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          const hs = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
          const msx = m ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
          return [hs, msx].filter(Boolean).join(" and ") || "a moment";
        };
        if (win.up) {
          sunTxt = `the sun sets at ${this._fmtTime(win.sunset)}, in ${say(win.sunset - Date.now())}`;
        } else {
          const when = win.sunrise.toDateString() === new Date().toDateString() ? "today" : "tomorrow";
          sunTxt = `sunrise is at ${this._fmtTime(win.sunrise)}, with ${say(win.sunset - win.sunrise)} of daylight ${when}`;
        }
      }
      if (ahead && sunTxt) out.push(`${ahead}, and in the meantime ${sunTxt}.`);
      else if (ahead) out.push(ahead + ".");
      else if (sunTxt) out.push(sunTxt.charAt(0).toUpperCase() + sunTxt.slice(1) + ".");
    }
    return out;
  }

  _renderTicker() {
    const el = this._el;
    const t = this._config.ticker;
    if (t === false) { el.tick.classList.add("hidden"); return; }
    const cfg = t && typeof t === "object" ? t : {};
    const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

    const alerts = (Array.isArray(cfg.alerts) ? cfg.alerts : [])
      .map((a) => (typeof a === "string" ? { entity: a } : a || {}))
      .filter((a) => this._alertActive(a))
      .map((a) => this._alertText(a))
      .filter(Boolean)
      .map(esc);

    let lines;
    const alert = alerts.length > 0;
    if (alert) {
      lines = alerts;
    } else {
      lines = cfg.weather === false ? [] : this._weatherLines().map(esc);
      (Array.isArray(cfg.extra) ? cfg.extra : []).forEach((x) => {
        const v = this._alertText(typeof x === "string" ? { entity: x } : x || {});
        if (v) lines.push(esc(v));
      });
    }
    el.tick.classList.toggle("hidden", !lines.length);
    if (!lines.length) return;
    const label = alert ? (cfg.alert_label || "Home") : (cfg.label || "Weather");
    const sig = (alert ? "!" : "") + label + "|" + lines.join("|");
    if (sig === this._sigTicker) return;
    this._sigTicker = sig;
    el.tick.classList.toggle("alert", alert);
    el.tickName.textContent = label;
    /* one copy of the text, with a separator at its end so the loop is seamless */
    const copy = lines.map((l) => `<span class="d-tick-item">${l}</span><span class="d-tick-sep"></span>`).join("");
    this._tickCopy = `<span class="d-tick-copy">${copy}</span>`;
    el.tickTrack.innerHTML = this._tickCopy;
    this._tickW = 0;
    requestAnimationFrame(() => this._layoutTicker());
  }

  /* Repeat the copy until it covers the window twice, then roll exactly one
     copy's width per loop at a steady speed (ticker.speed px/s, default 60). */
  _layoutTicker() {
    const el = this._el;
    if (!el || !el.tickTrack || !this._tickCopy || el.tick.classList.contains("hidden")) return;
    const first = el.tickTrack.firstElementChild;
    const cw = first ? first.getBoundingClientRect().width : 0;
    const ww = el.tickWin.getBoundingClientRect().width;
    if (!cw || !ww) return;
    if (Math.round(cw) === this._tickW && Math.round(ww) === this._tickWinW) return;
    this._tickW = Math.round(cw);
    this._tickWinW = Math.round(ww);
    const copies = Math.max(2, Math.ceil(ww / cw) + 1);
    el.tickTrack.innerHTML = this._tickCopy.repeat(copies);
    const speed = num(this._config.ticker?.speed) || 60;
    el.tickTrack.style.setProperty("--d-shift", -cw + "px");
    el.tickTrack.style.setProperty("--d-dur", Math.max(8, cw / speed).toFixed(1) + "s");
    el.tickTrack.classList.remove("run");
    void el.tickTrack.offsetWidth;
    el.tickTrack.classList.add("run");
  }

  /* ---- rooms with a 24 hour temperature chart ---- */

  _roomList() {
    return (Array.isArray(this._config.rooms) ? this._config.rooms : []).map((r) => r || {});
  }

  _chartIds() {
    return this._roomList().map((r) => r.temperature).filter(Boolean);
  }

  async _loadHistory(force) {
    const ids = this._chartIds();
    const hass = this._hass;
    if (!ids.length || !hass?.callWS || this._histBusy) return;
    const sig = ids.join("|");
    if (!force && sig === this._histSig && Date.now() - this._histAt < DESK_HISTORY_MS) return;
    this._histBusy = true;
    const hours = num(this._config.chart_hours) || 24;
    try {
      const res = await hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - hours * 3600e3).toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const out = {};
      ids.forEach((id) => {
        out[id] = (res?.[id] || []).map((p) => {
          const t = p.lu != null ? p.lu * 1000 : p.lc != null ? p.lc * 1000 : Date.parse(p.last_updated || p.last_changed);
          const v = num(p.s != null ? p.s : p.state);
          return Number.isFinite(t) && v != null ? [t, v] : null;
        }).filter(Boolean);
      });
      this._hist = out;
      this._histSig = sig;
      this._histAt = Date.now();
      this._sigCharts = "";
      this._render();
    } catch (e) {
      console.warn("wall-card-desk: could not load history", e && e.message);
      this._histAt = Date.now();
      this._histSig = sig;
    } finally {
      this._histBusy = false;
    }
  }

  _renderRooms() {
    const el = this._el;
    const rooms = this._roomList();
    const sig = rooms.map((r) => [r.name, r.temperature, r.humidity].join(",")).join("|");
    if (sig !== this._sigRooms) {
      this._sigRooms = sig;
      this._sigCharts = "";
      el.rooms.textContent = "";
      this._roomNodes = rooms.map((r, i) => {
        const n = document.createElement("div");
        n.className = "d-room";
        n.innerHTML = `
          <div class="d-room-top"><span class="h-stat-label"></span><span class="d-room-meta"></span></div>
          <div class="d-room-row">
            <span class="d-room-temp">--</span>
            <span class="d-spark">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="d-g${i}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="var(--wc-accent)" stop-opacity=".22"/>
                  <stop offset="1" stop-color="var(--wc-accent)" stop-opacity="0"/>
                </linearGradient></defs>
                <path class="a" fill="url(#d-g${i})"></path><path class="l"></path>
              </svg>
              <span class="d-spark-x"></span><span class="d-spark-dot"></span><span class="d-spark-tip"></span>
            </span>
          </div>
          <div class="d-spark-range"><span class="d-r-l"></span><span class="d-r-r"></span></div>`;
        n.querySelector(".d-room-temp").addEventListener("click", () => r.temperature && this._moreInfo(r.temperature));
        this._wireSpark(n.querySelector(".d-spark"), r);
        el.rooms.appendChild(n);
        return n;
      });
      el.rooms.classList.toggle("hidden", !rooms.length);
      if (rooms.length) this._loadHistory();
    }

    const hours = num(this._config.chart_hours) || 24;
    const chartSig = this._histAt + "|" + Math.floor(Date.now() / 300000) + "|" +
      rooms.map((r) => this._hass.states?.[r.temperature]?.state).join(",");
    const redraw = chartSig !== this._sigCharts;
    this._sigCharts = chartSig;

    rooms.forEach((r, i) => {
      const n = this._roomNodes[i];
      if (!n) return;
      const t = r.temperature ? this._hass.states?.[r.temperature] : null;
      n.querySelector(".h-stat-label").textContent = r.name || t?.attributes?.friendly_name || "";
      const tv = num(t?.state);
      const temp = n.querySelector(".d-room-temp");
      temp.textContent = tv == null ? "--" : tv.toFixed(1) + "°";

      const meta = [];
      const h = r.humidity ? this._hass.states?.[r.humidity] : null;
      if (num(h?.state) != null) meta.push(`${Math.round(num(h.state))}% humidity`);
      (Array.isArray(r.extra) ? r.extra : []).forEach((x) => {
        x = typeof x === "string" ? { entity: x } : x || {};
        const st = x.entity ? this._hass.states?.[x.entity] : null;
        if (!st) return;
        const v = num(st.state);
        const band = this._band(x, v);
        const label = x.label || st.attributes?.friendly_name || "";
        const val = v == null ? this._stateLabel(st) : String(Math.round(v * 10) / 10);
        meta.push(band
          ? `${label} <span class="${band.cls}">${band.text.toLowerCase()}</span>`
          : `${label} ${val}`);
      });
      const metaEl = n.querySelector(".d-room-meta");
      const html = meta.join(" · ");
      if (metaEl.innerHTML !== html) metaEl.innerHTML = html;

      if (!redraw) return;
      const pts = (this._hist[r.temperature] || []).slice();
      if (tv != null) pts.push([Date.now(), tv]);
      n._pts = pts;
      const svg = n.querySelector("svg");
      const lineP = svg.querySelector(".l");
      const areaP = svg.querySelector(".a");
      if (pts.length < 2) {
        lineP.setAttribute("d", "");
        areaP.setAttribute("d", "");
        n.querySelector(".d-r-l").textContent = this._histAt ? "No history" : "";
        n.querySelector(".d-r-r").textContent = "";
        return;
      }
      const t0 = Date.now() - hours * 3600e3;
      const t1 = Date.now();
      let lo = Infinity;
      let hi = -Infinity;
      pts.forEach((p) => { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
      const pad = Math.max(0.3, (hi - lo) * 0.12);
      n._scale = { t0, t1, lo: lo - pad, hi: hi + pad };
      const x = (t) => ((Math.max(t0, t) - t0) / (t1 - t0)) * 100;
      const y = (v) => 100 - ((v - n._scale.lo) / (n._scale.hi - n._scale.lo)) * 100;
      /* a sensor reports only when it changes, so draw it as steps that hold
         each value until the next one */
      let d = `M${x(pts[0][0]).toFixed(2)},${y(pts[0][1]).toFixed(2)}`;
      for (let k = 1; k < pts.length; k++) {
        d += `L${x(pts[k][0]).toFixed(2)},${y(pts[k - 1][1]).toFixed(2)}L${x(pts[k][0]).toFixed(2)},${y(pts[k][1]).toFixed(2)}`;
      }
      lineP.setAttribute("d", d);
      areaP.setAttribute("d", `${d}L100,100L${x(pts[0][0]).toFixed(2)},100Z`);
      n.querySelector(".d-r-l").textContent = `${hours} h`;
      n.querySelector(".d-r-r").textContent = `${lo.toFixed(1)}° – ${hi.toFixed(1)}°`;
    });
  }

  _wireSpark(spark, room) {
    const node = () => spark.closest(".d-room");
    const tip = spark.querySelector(".d-spark-tip");
    const xl = spark.querySelector(".d-spark-x");
    const dot = spark.querySelector(".d-spark-dot");
    spark.addEventListener("pointermove", (ev) => {
      const n = node();
      const pts = n && n._pts;
      const s = n && n._scale;
      if (!pts || pts.length < 2 || !s) return;
      const r = spark.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const t = s.t0 + fx * (s.t1 - s.t0);
      let v = pts[0][1];
      for (const p of pts) { if (p[0] <= t) v = p[1]; else break; }
      const px = fx * 100;
      const py = 100 - ((v - s.lo) / (s.hi - s.lo)) * 100;
      xl.style.left = px + "%";
      dot.style.left = px + "%";
      dot.style.top = py + "%";
      tip.textContent = `${this._fmtTime(new Date(t))}  ${v.toFixed(1)}°`;
      tip.style.left = px + "%";
      tip.style.transform = fx < 0.18 ? "translateX(0)" : fx > 0.82 ? "translateX(-100%)" : "translateX(-50%)";
      spark.classList.add("hover");
    });
    spark.addEventListener("pointerleave", () => spark.classList.remove("hover"));
    spark.addEventListener("click", () => room.temperature && this._moreInfo(room.temperature));
  }

  /* ---- desk lamp ---- */

  _lampCfg() {
    const l = this._config.desk_light;
    if (!l) return null;
    return typeof l === "string" ? { entity: l } : l;
  }

  _lampId() { return this._lampCfg()?.entity; }

  _renderLamp() {
    const el = this._el;
    const cfg = this._lampCfg();
    const st = cfg ? this._hass.states?.[cfg.entity] : null;
    el.lampBlk.classList.toggle("hidden", !st);
    if (!st) return;
    const on = st.state === "on";
    const pct = on ? Math.round(((num(st.attributes?.brightness) ?? 255) / 255) * 100) : 0;
    el.lamp.classList.toggle("on", on);
    el.lampIc.setAttribute("icon", cfg.icon || (on ? "mdi:desk-lamp-on" : "mdi:desk-lamp"));
    el.lampName.textContent = cfg.name || st.attributes?.friendly_name || "Desk lamp";
    const sub = [on ? "On" : this._stateLabel(st)];
    const k = num(st.attributes?.color_temp_kelvin);
    if (on && k) sub.push(Math.round(k / 100) * 100 + " K");
    el.lampSub.textContent = sub.join(" · ");
    el.lampSlider.classList.toggle("off", !on);
    if (!this._sliderBusy(el.lampSlider)) {
      el.lampSlider.querySelector(".d-slider-fill").style.width = pct + "%";
      el.lampSlider.querySelector(".d-slider-pct").textContent = on ? pct + "%" : "Off";
    }
  }

  /* hub paints volume on every update; leave the bar alone while it's dragged */
  _paintVolume(row, track, st) {
    if (this._sliderBusy(track)) return;
    super._paintVolume(row, track, st);
  }

  /* ---- light chips ---- */

  _renderLights() {
    const el = this._el;
    const list = (Array.isArray(this._config.lights) ? this._config.lights : [])
      .map((x) => (typeof x === "string" ? { entity: x } : x || {}));
    const sig = list.map((x) => x.entity + (x.name || "")).join("|");
    if (sig !== this._sigLights) {
      this._sigLights = sig;
      el.lights.textContent = "";
      this._lightNodes = list.map((x) => {
        const b = document.createElement("span");
        b.className = "d-light";
        b.title = "Click to switch, right-click for details";
        b.innerHTML = '<ha-icon></ha-icon><span class="d-lt"><b></b><span></span></span>';
        b.addEventListener("click", () => this._call("homeassistant", "toggle", { entity_id: x.entity }));
        b.addEventListener("contextmenu", (ev) => { ev.preventDefault(); this._moreInfo(x.entity); });
        el.lights.appendChild(b);
        return b;
      });
      el.lights.classList.toggle("hidden", !list.length);
    }
    list.forEach((x, i) => {
      const b = this._lightNodes[i];
      const st = this._hass.states?.[x.entity];
      const on = st?.state === "on";
      b.classList.toggle("on", on);
      b.classList.toggle("na", !st || st.state === "unavailable");
      b.querySelector("ha-icon").setAttribute("icon", this._iconFor(st, x.entity, x.icon));
      b.querySelector("b").textContent = x.name || st?.attributes?.friendly_name || x.entity;
      const bri = num(st?.attributes?.brightness);
      b.querySelector(".d-lt span").textContent = !st ? "Missing" : on
        ? (bri != null ? Math.round((bri / 255) * 100) + "%" : "On")
        : this._stateLabel(st);
    });
  }

  /* ---- devices: fan, humidifier, switches ---- */

  _renderDevices() {
    const el = this._el;
    const list = (Array.isArray(this._config.devices) ? this._config.devices : [])
      .map((x) => (typeof x === "string" ? { entity: x } : x || {}));
    const sig = list.map((x) => x.entity + (x.name || "")).join("|");
    if (sig !== this._sigDevs) {
      this._sigDevs = sig;
      el.devs.textContent = "";
      this._devNodes = list.map((x) => {
        const r = document.createElement("div");
        r.className = "d-dev";
        r.title = "Click to switch, right-click for details";
        r.innerHTML = '<ha-icon></ha-icon><span class="d-main"><b></b><span></span></span><span class="d-sw"></span>';
        r.addEventListener("click", () => {
          const dom = domainOf(x.entity);
          if (["climate", "vacuum", "media_player", "lock", "alarm_control_panel", "sensor", "binary_sensor"].includes(dom)) {
            this._moreInfo(x.entity);
          } else if (dom === "scene" || dom === "script") {
            this._call(dom, "turn_on", { entity_id: x.entity });
          } else {
            this._call("homeassistant", "toggle", { entity_id: x.entity });
          }
        });
        r.addEventListener("contextmenu", (ev) => { ev.preventDefault(); this._moreInfo(x.entity); });
        el.devs.appendChild(r);
        return r;
      });
      el.devs.classList.toggle("hidden", !list.length);
    }
    list.forEach((x, i) => {
      const r = this._devNodes[i];
      const st = this._hass.states?.[x.entity];
      const on = !!st && !["off", "unavailable", "unknown", "idle", "standby"].includes(st.state);
      r.classList.toggle("on", on);
      r.querySelector("ha-icon").setAttribute("icon", this._iconFor(st, x.entity, x.icon));
      r.querySelector("b").textContent = x.name || st?.attributes?.friendly_name || x.entity;
      const sub = [st ? this._stateLabel(st) : "Missing"];
      const a = st?.attributes || {};
      if (on && num(a.percentage) != null) sub.push(Math.round(a.percentage) + "%");
      if (on && num(a.humidity) != null && domainOf(x.entity) === "humidifier") sub.push("target " + Math.round(a.humidity) + "%");
      if (on && a.preset_mode) sub.push(titleCase(a.preset_mode));
      r.querySelector(".d-main span").textContent = sub.join(" · ");
    });
  }

  /* ---- music: artwork, held title, favorites ---- */

  _renderMedia() {
    const el = this._el;
    const id = this._config.media_player;
    const raw = id ? this._hass.states?.[id] : null;
    el.media.classList.toggle("hidden", !raw);
    if (!raw) { this._mkStop(); return; }
    /* keep showing the previous track during Sonos's favorite-switch gap */
    const st = this._mmHold(raw);
    if ((raw.attributes?.source_list || []).length && this._config.skip_sources !== false) {
      const before = this._mmKinds(id);
      const p = this._mmLoadKinds(id);
      /* redraw once when the favorite types first arrive, so the list groups */
      if (p && p.then) p.then(() => { if (this._mmKinds(id) !== before && this._hass) this._render(); });
    }
    const a = st.attributes || {};
    const playing = st.state === "playing";
    el.play.setAttribute("icon", playing ? "mdi:pause" : "mdi:play");
    el.play.classList.toggle("on", playing);
    el.track.textContent = a.media_title || (playing ? "Playing" : "Nothing playing");
    const bits = [];
    if (a.media_artist) bits.push(a.media_artist);
    if (this._config.show_player_name && a.friendly_name) bits.push(a.friendly_name);
    if (!bits.length && !a.media_title) bits.push(this._stateLabel(raw));
    el.trackSub.textContent = bits.join(" · ");

    const canSet = this._supports(raw, MP_FEAT.VOLUME_SET);
    const canMute = this._supports(raw, MP_FEAT.VOLUME_MUTE);
    el.mvol.classList.toggle("hidden", !canSet && !canMute);
    el.mvolTrack.classList.toggle("hidden", !canSet);
    el.mvolMute.classList.toggle("hidden", !canMute);
    el.mvolMute.setAttribute("icon", raw.attributes?.is_volume_muted ? "mdi:volume-off" : "mdi:volume-high");
    el.mvolMute.classList.toggle("on", !!raw.attributes?.is_volume_muted);
    if (canSet) this._paintVolume(el.mvol, el.mvolTrack, raw);
    /* repeat / shuffle toggles, opt-in with repeat_button / shuffle_button */
    const feat = num(raw.attributes?.supported_features) || 0;
    const rep = this._config.repeat_button && (feat & 262144 || raw.attributes?.repeat != null);
    const shf = this._config.shuffle_button && (feat & 32768 || raw.attributes?.shuffle != null);
    el.repeat.classList.toggle("hidden", !rep);
    el.shuffle.classList.toggle("hidden", !shf);
    if (rep || shf) el.mvol.classList.remove("hidden");
    if (rep) {
      const r = raw.attributes?.repeat || "off";
      el.repeat.setAttribute("icon", r === "one" ? "mdi:repeat-once" : r === "all" ? "mdi:repeat" : "mdi:repeat-off");
      el.repeat.classList.toggle("on", r !== "off");
      el.repeat.title = r === "one" ? "Repeat one" : r === "all" ? "Repeat all" : "Repeat off";
    }
    if (shf) {
      const s = !!raw.attributes?.shuffle;
      el.shuffle.setAttribute("icon", s ? "mdi:shuffle" : "mdi:shuffle-disabled");
      el.shuffle.classList.toggle("on", s);
    }

    const pic = a.entity_picture_local || a.entity_picture;
    const url = pic ? (this._hass.hassUrl ? this._hass.hassUrl(pic) : pic) : "";
    if (url !== this._artUrl) {
      this._artUrl = url;
      this._musicColors(url);
      el.art.textContent = "";
      if (url) {
        const img = document.createElement("img");
        img.alt = "";
        img.onerror = () => { el.art.innerHTML = '<ha-icon icon="mdi:music"></ha-icon>'; };
        img.src = url;
        el.art.appendChild(img);
      } else {
        el.art.innerHTML = '<ha-icon icon="mdi:music"></ha-icon>';
      }
    }
    this._mediaKeys(raw);
  }

  /* ---- keyboard media keys (media_keys: true) ----
   * Registers the page with the system media controls (Windows' media flyout
   * and the keyboard's play / next / previous keys) through the browser's
   * Media Session API. Browsers only route keys to a page that is playing
   * audio, so a silent loop plays in the background; the keys then control
   * the Sonos. Windows gives the keys to the most recently active media app,
   * so a song playing on the computer itself still takes them. */

  _mediaKeys(raw) {
    const on = !!this._config.media_keys && !!raw && typeof navigator !== "undefined" && "mediaSession" in navigator;
    if (!on) { this._mkStop(); return; }
    if (!this._mk) this._mkStart();
    const a = raw.attributes || {};
    const ms = navigator.mediaSession;
    const sig = [a.media_title, a.media_artist, a.media_album_name, this._artUrl].join("|");
    if (sig !== this._mk.sig) {
      this._mk.sig = sig;
      try {
        ms.metadata = new MediaMetadata({
          title: a.media_title || a.friendly_name || "Music",
          artist: a.media_artist || "",
          album: a.media_album_name || "",
          artwork: this._artUrl ? [{ src: this._artUrl, sizes: "512x512" }] : [],
        });
      } catch (e) { /* older browsers */ }
    }
    try { ms.playbackState = raw.state === "playing" ? "playing" : "paused"; } catch (e) { /* noop */ }
  }

  _mkStart() {
    /* 10 s of 8 kHz silence, looped; Chromium ignores very short clips */
    const n = 80000;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, "data"); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    const audio = document.createElement("audio");
    audio.loop = true;
    audio.src = url;
    this._mk = { audio, url, sig: "" };

    const ms = navigator.mediaSession;
    const ent = () => this._config.media_player;
    const svc = (s) => () => ent() && this._call("media_player", s, { entity_id: ent() });
    const set = (k, fn) => { try { ms.setActionHandler(k, fn); } catch (e) { /* unsupported action */ } };
    set("play", svc("media_play"));
    set("pause", svc("media_pause"));
    set("stop", svc("media_pause"));
    set("nexttrack", () => this._mmSkip(ent(), 1));
    set("previoustrack", () => this._mmSkip(ent(), -1));

    const go = () => audio.play().catch(() => { /* autoplay blocked until a click */ });
    go();
    /* if the browser blocked autoplay, start on the first click or key press */
    this._mkKick = () => { if (this._mk && this._mk.audio.paused) go(); };
    window.addEventListener("pointerdown", this._mkKick, true);
    window.addEventListener("keydown", this._mkKick, true);
  }

  _mkStop() {
    const m = this._mk;
    if (!m) return;
    this._mk = null;
    try { m.audio.pause(); m.audio.removeAttribute("src"); m.audio.load(); } catch (e) { /* noop */ }
    URL.revokeObjectURL(m.url);
    window.removeEventListener("pointerdown", this._mkKick, true);
    window.removeEventListener("keydown", this._mkKick, true);
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      ["play", "pause", "stop", "nexttrack", "previoustrack"].forEach((k) => { try { ms.setActionHandler(k, null); } catch (e) { /* noop */ } });
      try { ms.metadata = null; ms.playbackState = "none"; } catch (e) { /* noop */ }
    }
  }

  disconnectedCallback() {
    if (super.disconnectedCallback) super.disconnectedCallback();
    this._mkStop();
  }

  /* Tint the music panel from the cover: a dark two-tone ground and a light
     accent in the same hue, like the music card's idle view. Grey or missing
     covers keep Midnight's honey. `music_colors: midnight` turns it off. */
  _musicColors(url) {
    const panel = this._el.music;
    const bg = this._el.musicBg;
    const midnight = () => {
      bg.style.background = "";
      ["--wc-accent", "--wc-accent-soft", "--wc-accent-fill"].forEach((p) => panel.style.removeProperty(p));
    };
    if (!url || this._config.music_colors === "midnight") { midnight(); return; }
    WallCardPhone.prototype._artPalette.call(this, url, (cols) => {
      if (url !== this._artUrl) return;
      if (!cols) { midnight(); return; }
      const [c1, c2] = cols;
      const chroma = (c) => Math.max(...c) - Math.min(...c);
      const lead = chroma(c1) >= 24 ? c1 : chroma(c2) >= 24 ? c2 : null;
      const second = lead === c1 ? c2 : c1;
      bg.style.background =
        `radial-gradient(120% 70% at 0% 0%, ${toneFrom(lead || c1, 0.24)} 0%, transparent 62%), ` +
        `linear-gradient(160deg, ${toneFrom(lead || c1, 0.15)} 0%, ${toneFrom(second, 0.07)} 100%)`;
      if (!lead) {
        ["--wc-accent", "--wc-accent-soft", "--wc-accent-fill"].forEach((p) => panel.style.removeProperty(p));
        return;
      }
      const acc = toneFrom(lead, 0.74);
      const alpha = (x) => acc.replace("rgb(", "rgba(").replace(")", `,${x})`);
      panel.style.setProperty("--wc-accent", acc);
      panel.style.setProperty("--wc-accent-soft", alpha(0.16));
      panel.style.setProperty("--wc-accent-fill", alpha(0.36));
    });
  }

  _renderFavorites() {
    const el = this._el;
    const c = this._config;
    const st = c.media_player ? this._hass.states?.[c.media_player] : null;
    if (c.favorites === false || !st) { el.favs.classList.add("hidden"); return; }
    const all = this._mmSourceList(st);
    const max = num(c.favorites_count);
    let list = max ? all.slice(0, max) : all;
    el.favs.classList.toggle("hidden", !list.length);
    if (!list.length) return;
    const names = {};
    (Array.isArray(c.sources) ? c.sources : []).forEach((x) => { if (x && x.source) names[x.source] = x.name; });

    /* Playlists first, then single songs, then radio, using the Sonos
       favorite types read from the media browser. favorites_group: false
       keeps one plain list in the player's own order. */
    const kinds = c.favorites_group === false ? null : this._mmKinds(c.media_player);
    const L = Object.assign({ list: "Playlists", track: "Songs", radio: "Radio", other: "Other" }, c.favorites_labels || {});
    let groups = null;
    if (kinds) {
      /* favorites_order: e.g. [list, radio, track]; anything left out goes last */
      const alias = { playlists: "list", playlist: "list", songs: "track", song: "track", tracks: "track" };
      const want = (Array.isArray(c.favorites_order) ? c.favorites_order : ["list", "radio", "track"])
        .map((k) => alias[String(k).toLowerCase()] || String(k).toLowerCase());
      const order = [...new Set([...want, "list", "radio", "track", "other"])].filter((k) => ["list", "track", "radio", "other"].includes(k));
      const by = { list: [], track: [], radio: [], other: [] };
      list.forEach((s) => by[["list", "track", "radio"].includes(kinds[s]) ? kinds[s] : "other"].push(s));
      groups = order.filter((k) => by[k].length).map((k) => ({ k, items: by[k] }));
      if (groups.length < 2) groups = null;
      else list = groups.flatMap((g) => g.items);
    }
    el.favsLabel.textContent = c.favorites_label || "Sources";
    el.favsLabel.classList.toggle("hidden", !!groups);

    /* an icon per favorite type; favorites_icons overrides them */
    const kindMap = this._mmKinds(c.media_player) || {};
    const IC = Object.assign({ list: "mdi:playlist-music", track: "mdi:music-note", radio: "mdi:radio", other: "mdi:play-circle-outline" },
      c.favorites_icons || {});
    const iconOf = (src) => IC[["list", "track", "radio"].includes(kindMap[src]) ? kindMap[src] : "other"] || IC.other;
    const sig = Object.keys(kindMap).length + ":" + JSON.stringify(IC) + (groups ? groups.map((g) => g.k + ":" + g.items.join("|")).join("/") : list.join("|")) + JSON.stringify(L);
    if (sig !== this._sigFavs) {
      this._sigFavs = sig;
      el.favList.textContent = "";
      const row = (src) => {
        const r = document.createElement("div");
        r.className = "d-fav";
        r.innerHTML = '<ha-icon icon="mdi:play-circle-outline"></ha-icon><span></span>';
        r.querySelector("span").textContent = names[src] || src;
        r.addEventListener("click", () => {
          this._mmRemember(c.media_player, src);
          this._call("media_player", "select_source", { entity_id: c.media_player, source: src });
          this._render();
        });
        el.favList.appendChild(r);
        return r;
      };
      this._favNodes = [];
      if (groups) {
        groups.forEach((g) => {
          const h = document.createElement("div");
          h.className = "h-eyebrow d-fav-group";
          h.textContent = L[g.k];
          el.favList.appendChild(h);
          g.items.forEach((s) => this._favNodes.push(row(s)));
        });
      } else {
        list.forEach((s) => this._favNodes.push(row(s)));
      }
    }
    const cur = this._mmCurrentSource(st, all);
    const playing = st.state === "playing";
    list.forEach((src, i) => {
      const r = this._favNodes[i];
      const on = src === cur;
      r.classList.toggle("on", on);
      r.querySelector("ha-icon").setAttribute("icon", on && playing ? "mdi:volume-high" : iconOf(src));
    });
  }

  /* ---- focus timer (Pomodoro) ----
   * Runs on an HA timer helper when `pomodoro.entity` is set, so it survives a
   * reload, shows the same on every screen and automations can react to it
   * (timer.started / timer.finished). Without an entity it runs in this browser.
   * The card keeps the phase (focus / short / long break) and today's count. */

  _pomoCfg() {
    const p = this._config.pomodoro;
    if (!p) return null;
    const o = typeof p === "string" ? { entity: p } : p === true ? {} : p;
    return Object.assign({ focus: 25, short_break: 5, long_break: 15, rounds: 4 }, o);
  }

  _pomoKey() { return "wcd-pomo:" + (this._pomoCfg()?.entity || "local"); }

  _pomoMem() {
    if (this._pomoM && this._pomoM.key === this._pomoKey()) return this._pomoM;
    let m = {};
    try { m = JSON.parse(localStorage.getItem(this._pomoKey())) || {}; } catch (e) { m = {}; }
    m.key = this._pomoKey();
    this._pomoM = m;
    return m;
  }

  _pomoSave(m) {
    this._pomoM = m;
    try { localStorage.setItem(this._pomoKey(), JSON.stringify(m)); } catch (e) { /* private mode */ }
  }

  _hms(v) {
    if (v == null) return null;
    const p = String(v).split(":").map(Number);
    if (p.some((x) => !Number.isFinite(x))) return null;
    while (p.length < 3) p.unshift(0);
    return ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
  }

  _pomoLen(cfg, phase) {
    const mins = phase === "short" ? cfg.short_break : phase === "long" ? cfg.long_break : cfg.focus;
    return (num(mins) || 25) * 60000;
  }

  _pomoState() {
    const cfg = this._pomoCfg();
    const m = this._pomoMem();
    let phase = m.phase || "focus";
    if (cfg.entity) {
      const st = this._hass.states?.[cfg.entity];
      if (!st) return { missing: true, phase, status: "idle", total: this._pomoLen(cfg, phase), left: this._pomoLen(cfg, phase) };
      const a = st.attributes || {};
      const total = this._hms(a.duration) || this._pomoLen(cfg, phase);
      /* started from somewhere else: work out the phase from its length */
      if (st.state !== "idle" && !m.phase) {
        phase = ["focus", "short", "long"].find((p) => this._pomoLen(cfg, p) === total) || "focus";
      }
      if (st.state === "active") {
        const end = Date.parse(a.finishes_at);
        const left = Number.isFinite(end) ? end - Date.now() : this._hms(a.remaining) || 0;
        return { phase, status: "active", total, left: Math.max(0, left), endsAt: Number.isFinite(end) ? end : Date.now() + left };
      }
      if (st.state === "paused") return { phase, status: "paused", total, left: this._hms(a.remaining) || 0 };
      return { phase, status: "idle", total: this._pomoLen(cfg, phase), left: this._pomoLen(cfg, phase) };
    }
    const total = m.total || this._pomoLen(cfg, phase);
    if (m.status === "active") return { phase, status: "active", total, left: Math.max(0, m.endsAt - Date.now()), endsAt: m.endsAt };
    if (m.status === "paused") return { phase, status: "paused", total, left: m.remaining || 0 };
    return { phase, status: "idle", total: this._pomoLen(cfg, phase), left: this._pomoLen(cfg, phase) };
  }

  _pomoFmtDur(ms) {
    const s = Math.round(ms / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }

  _pomoAction(what) {
    const cfg = this._pomoCfg();
    if (!cfg) return;
    const m = this._pomoMem();
    const s = this._pomoState();
    const id = cfg.entity;
    const startNew = () => {
      const total = this._pomoLen(cfg, s.phase);
      m.phase = s.phase;
      if (id) this._call("timer", "start", { entity_id: id, duration: this._pomoFmtDur(total) });
      else Object.assign(m, { status: "active", total, endsAt: Date.now() + total });
      this._unlockChime();
    };
    if (what === "go") {
      if (s.status === "active") {
        if (id) this._call("timer", "pause", { entity_id: id });
        else Object.assign(m, { status: "paused", remaining: Math.max(0, m.endsAt - Date.now()) });
      } else if (s.status === "paused") {
        if (id) this._call("timer", "start", { entity_id: id });
        else Object.assign(m, { status: "active", endsAt: Date.now() + (m.remaining || 0) });
      } else {
        startNew();
      }
    } else if (what === "reset") {
      if (id) this._call("timer", "cancel", { entity_id: id });
      Object.assign(m, { status: "idle" });
    } else if (what === "skip") {
      if (id && s.status !== "idle") this._call("timer", "cancel", { entity_id: id });
      m.status = "idle";
      m.phase = s.phase === "focus" ? this._pomoBreakAfter(cfg, m, false) : "focus";
    } else if (["focus", "short", "long"].includes(what)) {
      if (s.status !== "idle") {
        if (id) this._call("timer", "cancel", { entity_id: id });
      }
      m.status = "idle";
      m.phase = what;
    }
    this._pomoSave(m);
    this._pomoIgnoreUntil = Date.now() + 2000;
    this._renderPomo();
  }

  _pomoBreakAfter(cfg, m, counted) {
    const rounds = Math.max(1, num(cfg.rounds) || 4);
    const n = (m.done || 0) + (counted ? 0 : 1);
    return n > 0 && n % rounds === 0 ? "long" : "short";
  }

  /* a timer that ran out: count it, move to the next phase and chime */
  _pomoFinished() {
    const cfg = this._pomoCfg();
    const m = this._pomoMem();
    const today = new Date().toDateString();
    if (m.day !== today) { m.day = today; m.done = 0; }
    const was = m.phase || "focus";
    if (was === "focus") {
      m.done = (m.done || 0) + 1;
      m.phase = this._pomoBreakAfter(cfg, m, true);
    } else {
      m.phase = "focus";
    }
    m.status = "idle";
    this._pomoSave(m);
    this._chime(was === "focus");
    if (cfg.auto_start) setTimeout(() => this._pomoAction("go"), 1200);
  }

  /* browsers only allow sound after a click, so the start button warms it up */
  _unlockChime() {
    if (this._pomoCfg()?.sound === false) return;
    try {
      this._audio = this._audio || new (window.AudioContext || window.webkitAudioContext)();
      if (this._audio.state === "suspended") this._audio.resume();
    } catch (e) { /* no audio */ }
  }

  _chime(focusDone) {
    if (this._pomoCfg()?.sound === false || !this._audio) return;
    try {
      const ctx = this._audio;
      const notes = focusDone ? [659.3, 880] : [880, 659.3];
      notes.forEach((f, i) => {
        const t = ctx.currentTime + i * 0.22;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 1);
      });
    } catch (e) { /* no audio */ }
  }

  _renderPomo() {
    const el = this._el;
    const cfg = this._pomoCfg();
    el.pomo.classList.toggle("hidden", !cfg);
    if (!cfg) { clearInterval(this._pomoT); this._pomoT = null; return; }
    let s = this._pomoState();

    /* noticed it run out: HA timer went idle near its end, or the local one hit zero */
    const prev = this._pomoPrev;
    if (Date.now() > (this._pomoIgnoreUntil || 0)) {
      const ranOut = s.status === "active" && s.left <= 0 && !cfg.entity;
      const haDone = cfg.entity && prev && prev.status === "active" && s.status === "idle" &&
        Date.now() >= prev.endsAt - 3000;
      if (ranOut || haDone) {
        this._pomoFinished();
        s = this._pomoState();
      }
    }
    this._pomoPrev = { status: s.status, endsAt: s.endsAt };

    const sec = Math.ceil(s.left / 1000);
    const mm = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, "0");
    el.pomoTime.textContent = `${mm}:${ss}`;
    el.pomo.classList.toggle("run", s.status === "active");
    el.pomo.classList.toggle("paused", s.status === "paused");
    el.pomo.classList.toggle("brk", s.phase !== "focus");
    el.pomoGo.setAttribute("icon", s.status === "active" ? "mdi:pause" : "mdi:play");
    el.pomoGo.classList.toggle("on", s.status === "active");
    el.pomoGo.title = s.status === "active" ? "Pause" : s.status === "paused" ? "Resume" : "Start";
    const frac = s.total ? Math.max(0, Math.min(1, 1 - s.left / s.total)) : 0;
    el.pomoFill.style.transform = `scaleX(${frac})`;

    const names = { focus: "Focus", short: "Break", long: "Long break" };
    let sub;
    if (s.missing) sub = `No ${cfg.entity}`;
    else if (s.status === "active") sub = `Ends ${this._fmtTime(new Date(s.endsAt))}`;
    else if (s.status === "paused") sub = "Paused";
    else sub = s.phase === "focus" ? "Ready" : "Break time";
    el.pomo.title = names[s.phase];
    el.pomoSub.textContent = sub;

    el.pomoPhases.forEach((b) => b.classList.toggle("on", b.dataset.p === s.phase));
    el.pomoPhases.forEach((b) => {
      const min = Math.round(this._pomoLen(cfg, b.dataset.p) / 60000);
      b.textContent = (b.dataset.p === "focus" ? "Focus " : b.dataset.p === "short" ? "Break " : "Long ") + min;
    });

    const m = this._pomoMem();
    const rounds = Math.max(1, num(cfg.rounds) || 4);
    const done = m.day === new Date().toDateString() ? (m.done || 0) : 0;
    const inSet = done === 0 ? 0 : done % rounds || rounds;
    if (el.pomoDots.childElementCount !== rounds) {
      el.pomoDots.textContent = "";
      for (let i = 0; i < rounds; i++) el.pomoDots.appendChild(document.createElement("i"));
    }
    Array.from(el.pomoDots.children).forEach((d, i) => d.classList.toggle("on", i < inSet));
    el.pomoDots.title = `${done} focus ${done === 1 ? "session" : "sessions"} today`;

    /* once a second while it runs, otherwise the card's normal tick */
    if (s.status === "active" && !this._pomoT) {
      this._pomoT = setInterval(() => this._renderPomo(), 1000);
    } else if (s.status !== "active" && this._pomoT) {
      clearInterval(this._pomoT);
      this._pomoT = null;
    }
  }

  /* ---- home column ---- */

  _renderAlarm() {
    const el = this._el;
    const id = this._config.alarm;
    const st = id ? this._hass.states?.[id] : null;
    el.alarmBlk.classList.toggle("hidden", !st);
    if (!st) return;
    const s = st.state;
    el.alarm.classList.toggle("armed", s.startsWith("armed"));
    el.alarm.classList.toggle("trig", s === "triggered");
    el.alarm.classList.toggle("busy", s === "arming" || s === "pending");
    el.alarmIc.setAttribute("icon",
      s === "triggered" ? "mdi:alarm-light" :
      s.startsWith("armed") ? "mdi:shield-lock" :
      s === "arming" || s === "pending" ? "mdi:shield-sync" : "mdi:shield-home-outline");
    el.alarmName.textContent = this._stateLabel(st);
    el.alarmSub.textContent = "Since " + this._fmtTime(new Date(st.last_changed)) + " · click for keypad";
  }

  _vacCfg() {
    const v = this._config.vacuum;
    if (!v) return null;
    return typeof v === "string" ? { entity: v } : v;
  }

  _renderVacuum() {
    const el = this._el;
    const v = this._vacCfg();
    const st = v ? this._hass.states?.[v.entity] : null;
    el.vac.classList.toggle("hidden", !st);
    if (!st) return;
    el.vacName.textContent = v.name || st.attributes?.friendly_name || "Vacuum";
    const bits = [this._stateLabel(st)];
    const bat = v.battery ? num(this._hass.states?.[v.battery]?.state) : num(st.attributes?.battery_level);
    if (bat != null) bits.push(Math.round(bat) + "% battery");
    el.vacSub.textContent = bits.join(" · ");
    const cleaning = st.state === "cleaning";
    el.vacGo.setAttribute("icon", cleaning ? "mdi:pause" : "mdi:play");
    el.vacGo.classList.toggle("on", cleaning);
    el.vacGo.title = cleaning ? "Pause" : "Start cleaning";
    el.vacDock.title = "Send home";
  }

  _renderPhone() {
    super._renderPhone();
    /* the block already says "Phone"; don't repeat it as the name */
    const n = this._el.phoneName;
    n.classList.toggle("hidden", /^phone$/i.test(n.textContent.trim()));
  }

  _renderNote() {
    const el = this._el;
    const n = this._config.note;
    const cfg = !n ? null : typeof n === "string" ? { entity: n } : n;
    const st = cfg?.entity ? this._hass.states?.[cfg.entity] : null;
    const raw = st ? (cfg.attribute ? st.attributes?.[cfg.attribute] : st.state) : null;
    const text = raw == null || ["", "unknown", "unavailable"].includes(String(raw)) ? "" : String(raw).trim();
    el.note.classList.toggle("hidden", !text);
    if (!text) return;
    el.noteLabel.textContent = cfg.label || "Note";
    if (el.noteTxt.textContent !== text) el.noteTxt.textContent = text;
  }
}

/* ------------------------------------------------------------------ register */

const CARDS = [
  ["wall-card", WallCard, "Wall Card", "Home page: clock, weather, sensor tiles, departures."],
  ["wall-card-controls", WallCardControls, "Wall Card Controls", "Device list with category filters and scenes."],
  ["wall-card-vacuum", WallCardVacuum, "Wall Card Vacuum", "Vacuum status, live map, suction and consumables."],
  ["wall-card-phone", WallCardPhone, "Wall Card Phone", "Phone-sized home page: camera, alarm, tiles and scenes."],
  ["wall-card-out", WallCardOut, "Wall Card Out the Door", "Departures, hourly weather, door, motion and alarm keypad."],
  ["wall-card-hub", WallCardHub, "Wall Card Hub", "Landscape 1024x600 desk display: clock, air, climate, music, departures."],
  ["wall-card-desk", WallCardDesk, "Wall Card Desk", "Full-screen desktop page or wallpaper: greeting, alert/weather ticker, glass widget panel, music panel."],
];

CARDS.forEach(([tag, cls]) => {
  if (!customElements.get(tag)) customElements.define(tag, cls);
});

window.customCards = window.customCards || [];
CARDS.forEach(([tag, , name, description]) => {
  if (!window.customCards.some((c) => c.type === tag)) {
    window.customCards.push({ type: tag, name, description, preview: false });
  }
});

console.info(
  "%c WALL-CARD %c " + WALL_CARD_VERSION + " ",
  "background:#FFC857;color:#000;font-weight:700",
  "background:#000;color:#F4F4F2"
);
