/*
 * Midnight Music Card for Home Assistant
 * Portrait media player card for wall tablets: big transport controls + source list.
 * Works with any media_player entity (uses source_list / select_source).
 * No dependencies, no build step. Midnight design system: AMOLED black, honey #FFC857,
 * Mona Sans + Spline Sans Mono.
 */
const MMC_VERSION = "1.1.0";

const F = {
  PAUSE: 1, SEEK: 2, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32,
  TURN_ON: 128, TURN_OFF: 256, VOLUME_STEP: 1024, SELECT_SOURCE: 2048,
  STOP: 4096, PLAY: 16384, SHUFFLE: 32768, REPEAT: 262144,
};

const P = {
  play: "M8,5.14V19.14L19,12.14L8,5.14Z",
  pause: "M14,19H18V5H14M6,19H10V5H6V19Z",
  next: "M16,18H18V6H16M6,18L14.5,12L6,6V18Z",
  prev: "M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z",
  stop: "M18,18H6V6H18V18Z",
  shuffle: "M17,3L22.25,7.5L17,12L22.25,16.5L17,21V18H14.26L11.44,15.18L13.56,13.06L15.5,15H17V9H15.5L6.5,18H2V15H5.26L14.26,6H17V3M2,6H6.5L9.32,8.82L7.2,10.94L5.26,9H2V6Z",
  repeat: "M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z",
  repeatOne: "M13,15V9H12L10,10V11H11.5V15M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z",
  vol: "M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z",
  mute: "M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z",
  minus: "M19,13H5V11H19V13Z",
  plus: "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
  power: "M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",
  note: "M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z",
  idle: "M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z",
  check: "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z",
  menu: "M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z",
};

// Fallback cover when a track has no artwork: dusk gradient with a honey record (Midnight palette).
const FALLBACK_ART = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#28144a"/><stop offset=".5" stop-color="#6a3330"/><stop offset="1" stop-color="#be5c18"/>' +
  '</linearGradient></defs><rect width="600" height="600" fill="url(#g)"/>' +
  '<circle cx="300" cy="300" r="150" fill="#FFC857"/><circle cx="300" cy="300" r="30" fill="#140a22"/></svg>');

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (sec) => {
  if (!isFinite(sec) || sec < 0) return "--:--";
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
};

function loadFonts() {
  if (document.getElementById("mmc-fonts")) return;
  const l = document.createElement("link");
  l.id = "mmc-fonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400..800&family=Spline+Sans+Mono:wght@400;500&display=swap";
  document.head.appendChild(l);
}

/* Same as wall-card: keep the kiosk query string across page switches, then let HA route. */
function navigateTo(path) {
  const search = window.location.search;
  const url = search && path.indexOf("?") === -1 ? path + search : path;
  history.pushState(null, "", url);
  window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true, detail: { replace: false } }));
}

/* Same as wall-card's hide_header: true/"always", "fully" (inside Fully Kiosk),
   "kiosk" (URL had ?kiosk this session), "auto" (either). Edit mode always shows it. */
function mmcShouldHideHeader(mode) {
  if (!mode) return false;
  if (/[?&]edit=1\b/.test(window.location.search)) return false;
  const inFully = typeof window.fully !== "undefined";
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

/* Same style element id as wall-card, so the two cards share one header switch. */
function mmcSetHeaderHidden(hide) {
  try {
    const main = document.querySelector("home-assistant")?.shadowRoot?.querySelector("home-assistant-main")?.shadowRoot;
    const panel = main?.querySelector("ha-panel-lovelace") || main?.querySelector("partial-panel-resolver")?.querySelector("ha-panel-lovelace");
    const root = panel?.shadowRoot?.querySelector("hui-root")?.shadowRoot;
    if (!root) return;
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
  } catch (e) { /* best effort */ }
}

const STYLE = `
:host { display:block;
  --mmc-bg:#000; --mmc-surface:#0C0C0C; --mmc-raised:#161616; --mmc-line:#222;
  --mmc-text:#F4F4F2; --mmc-muted:#8C8C88; --mmc-faint:#4A4A47;
  --mmc-accent:#FFC857; --mmc-on-accent:#000; --mmc-accent-dim:rgba(255,200,87,.12);
  --mmc-sans:"Mona Sans",system-ui,sans-serif; --mmc-mono:"Spline Sans Mono",ui-monospace,monospace;
}
* { box-sizing:border-box; }
[hidden] { display:none !important; }
ha-card { display:flex; flex-direction:column; width:100%; gap:20px; padding:24px 24px 16px;
  background:var(--mmc-bg); color:var(--mmc-text); font-family:var(--mmc-sans);
  border:none; border-radius:var(--ha-card-border-radius,0); overflow:hidden;
  height:var(--mmc-height,auto); -webkit-tap-highlight-color:transparent; user-select:none; }
button { font:inherit; color:inherit; background:none; border:0; padding:0; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; touch-action:manipulation; }
button:disabled { opacity:.25; cursor:default; }
svg { width:100%; height:100%; fill:currentColor; display:block; }

.players { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; flex:none; }
.players::-webkit-scrollbar { display:none; }
.chip { flex:none; height:44px; padding:0 18px; border-radius:22px; border:1px solid var(--mmc-line);
  font-size:15px; font-weight:600; color:var(--mmc-muted); white-space:nowrap; }
.chip.on { background:var(--mmc-accent); border-color:var(--mmc-accent); color:var(--mmc-on-accent); }
.chip .dot { width:8px; height:8px; border-radius:50%; background:var(--mmc-accent); margin-right:8px; }
.chip.on .dot { background:var(--mmc-on-accent); }

.top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex:none; }
.eyebrow { font-family:var(--mmc-mono); font-size:13px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--mmc-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.eyebrow b { color:var(--mmc-accent); font-weight:500; }
.power { width:48px; height:48px; padding:11px; border-radius:50%; border:1px solid var(--mmc-line); color:var(--mmc-muted); flex:none; }
.power.on { color:var(--mmc-accent); border-color:var(--mmc-accent); }
.top-btns { display:flex; gap:10px; flex:none; }
.power.idle-btn { border-color:transparent; color:var(--mmc-muted); padding:10px; }
.power.idle-btn:active { color:var(--mmc-text); }

.art { position:relative; align-self:center; width:min(100%, var(--mmc-art, 40vh)); aspect-ratio:1; flex:none;
  border-radius:20px; background:var(--mmc-raised); overflow:hidden; }
.art img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.art .ph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--mmc-faint); }
.art .ph svg { width:28%; height:28%; }

.meta { text-align:center; flex:none; min-width:0; cursor:pointer; }
.title { font-size:30px; font-weight:750; line-height:1.15; letter-spacing:-.01em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.artist { margin-top:6px; font-size:19px; font-weight:500; color:var(--mmc-muted);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.progress { flex:none; }
.bar { position:relative; height:28px; display:flex; align-items:center; }
.bar .track { width:100%; height:6px; border-radius:3px; background:var(--mmc-raised); overflow:hidden; }
.bar .prog { height:100%; width:0; background:var(--mmc-accent); border-radius:3px; }
.bar.seek { cursor:pointer; }
.times { display:flex; justify-content:space-between; font-family:var(--mmc-mono); font-size:13px; color:var(--mmc-muted); }

.controls { display:flex; align-items:center; justify-content:space-between; flex:none; padding:10px 4px; margin-top:auto; }
ha-card { position:relative; }
/* blurred artwork background for the main view */
.bg { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; }
.bg-img { position:absolute; left:50%; top:50%; width:25%; height:25%; background:center/cover no-repeat;
  filter:blur(10px) saturate(1.5); transform:translate(-50%,-50%) scale(5.2); opacity:0; transition:opacity .8s; }
.bg-img.on { opacity:.85; }
.bg-shade { position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.74) 0%, rgba(0,0,0,.66) 45%, rgba(0,0,0,.9) 100%); }
ha-card > :not(.bg):not(.amb) { position:relative; z-index:1; }
.list:not(.grid) .src:not(.on) { background:rgba(0,0,0,.28); }
.src.on { box-shadow:inset 0 0 0 1.5px var(--mmc-accent); background:rgba(0,0,0,.45); }
.sources { border-bottom-color:rgba(255,255,255,.1); }
.ctl { width:64px; height:64px; padding:16px; border-radius:50%; color:var(--mmc-muted); }
.ctl.on { color:var(--mmc-accent); background:var(--mmc-accent-dim); }
.skip { width:88px; height:88px; padding:20px; border-radius:50%; color:var(--mmc-text); }
.skip:active, .ctl:active { background:var(--mmc-raised); }
.play { width:120px; height:120px; padding:34px; border-radius:50%; background:var(--mmc-accent); color:var(--mmc-on-accent); }
.play:active { transform:scale(.96); }

.volume { display:flex; align-items:center; gap:14px; flex:none; margin-top:4px; }
.volume .ic { width:48px; height:48px; padding:12px; flex:none; color:var(--mmc-muted); border-radius:50%; }
.volume .ic.muted { color:var(--mmc-accent); }
.volume .pct { width:48px; text-align:right; font-family:var(--mmc-mono); font-size:14px; color:var(--mmc-muted); flex:none; }
.volume .steps { display:flex; gap:12px; flex:1; }
.volume .steps button { flex:1; height:52px; border-radius:14px; background:var(--mmc-raised); }
.volume .steps svg { width:24px; height:24px; }
input[type=range] { -webkit-appearance:none; appearance:none; flex:1; height:40px; background:transparent; margin:0; --v:0%; }
input[type=range]::-webkit-slider-runnable-track { height:8px; border-radius:4px;
  background:linear-gradient(to right, var(--mmc-accent) var(--v), var(--mmc-raised) var(--v)); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:28px; height:28px; margin-top:-10px;
  border-radius:50%; background:var(--mmc-text); border:0; }
input[type=range]::-moz-range-track { height:8px; border-radius:4px; background:var(--mmc-raised); }
input[type=range]::-moz-range-progress { height:8px; border-radius:4px; background:var(--mmc-accent); }
input[type=range]::-moz-range-thumb { width:28px; height:28px; border-radius:50%; background:var(--mmc-text); border:0; }

.sources { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; border-bottom:1px solid var(--mmc-line); padding-bottom:12px; }
.sources-head { display:flex; justify-content:space-between; align-items:baseline; padding:0 4px 8px;
  font-family:var(--mmc-mono); font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--mmc-muted); }
.list { overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; max-height:var(--mmc-list-max, 340px); min-height:0; flex:1 1 auto; scrollbar-width:none; }
/* fill mode: card takes a fixed height (e.g. 100vh); artwork shrinks so the source list always fits */
ha-card.fill .art { flex:1 1 0; min-height:120px; width:auto; max-width:100%; }
ha-card.fill .sources { flex:0 0 auto; }
ha-card.fill .list { height:var(--mmc-list-max, clamp(180px, 27vh, 380px)); max-height:none; }
ha-card.fill.noart .sources { flex:1 1 0; }
ha-card.fill.noart .list { height:auto; flex:1 1 0; }
.list::-webkit-scrollbar { display:none; }
.list.grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; align-content:start; }
.src { width:100%; min-height:64px; padding:0 16px; gap:14px; justify-content:flex-start; text-align:left;
  border-radius:14px; font-size:19px; font-weight:550; }
.list:not(.grid) .src + .src { margin-top:4px; }
.list.grid .src { background:var(--mmc-surface); }
.src:active { background:var(--mmc-raised); }
.src .n { font-family:var(--mmc-mono); font-size:13px; color:var(--mmc-faint); width:22px; flex:none; }
.src .label { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.src .tick { width:24px; height:24px; flex:none; color:var(--mmc-accent); visibility:hidden; }
.src.on { background:var(--mmc-accent-dim); color:var(--mmc-accent); }
.src.on .n { color:var(--mmc-accent); }
.src.on .tick { visibility:visible; }
.src.pending { opacity:.55; }
.empty { padding:18px 4px; color:var(--mmc-faint); font-size:16px; }
.unavail { opacity:.4; pointer-events:none; }
/* burn-in nudge (same clock-based offset as wall-card): moves the content, never the card */
ha-card > :not(.bg):not(.amb), .amb-body { transform:translate(var(--mmc-bx, 0px), var(--mmc-by, 0px)); }
:host(.mmc-snap) { overflow:visible; }

/* bottom page switcher, matching wall-card's tabs (main view only; the idle view covers it) */
/* The tabs are placed exactly where wall-card draws them (see _layoutNav): compact 1:1 layout on
   cards under 720px wide, otherwise wall-card's 800px artboard scaled to the screen. */
ha-card.has-nav { padding-bottom:var(--mmc-nav-space, 74px); }
ha-card > div.nav.nav { position:absolute; left:0; top:0; z-index:2; display:grid; gap:8px; transform-origin:0 0;
  font:400 12px/1 var(--mmc-mono); letter-spacing:.08em; text-transform:uppercase; }
.nav-item { box-sizing:content-box; height:44px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:999px;
  border:1px solid rgba(244,244,242,.14); color:rgba(244,244,242,.55); cursor:pointer; user-select:none;
  touch-action:manipulation; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; background:rgba(0,0,0,.28); }
ha-card > div.nav.nav.classic { gap:10px; font-size:13px; }
.nav.classic .nav-item { height:auto; display:block; padding:14px 0; text-align:center; }
.nav-item.active { border-color:var(--mmc-accent); background:var(--mmc-accent-soft, rgba(255,200,87,.14)); color:var(--mmc-accent); cursor:default; }
.nav-item.disabled { opacity:.38; cursor:default; }
/* the tab you just touched: solid honey, no transition, so it shows on the very next frame */
.nav-item.pressed { border-color:var(--mmc-accent); background:var(--mmc-accent); color:var(--mmc-on-accent); transition:none; }

/* simple "now playing" view */
.amb { position:absolute; inset:0; z-index:5; background:#000; overflow:hidden; display:flex; animation:mmc-fade .6s ease-out; }
@keyframes mmc-fade { from { opacity:0; } }
.amb-bg { position:absolute; left:50%; top:50%; width:25%; height:25%; background:center/cover no-repeat;
  filter:blur(10px) saturate(1.6); transform:translate(-50%,-50%) scale(5.2); opacity:.9; }
.amb-shade { position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,.25) 40%, rgba(0,0,0,.88) 100%); }
/* idle view: artwork + title centred on screen; controls + progress bar anchored near the bottom */
/* equal top/bottom rows keep artwork + title centred; in the bottom row the progress bar sits near
   the edge and the controls are centred between the title and the progress bar */
.amb-body { position:relative; flex:1; min-width:0; display:grid; grid-template-rows:1fr auto 1fr;
  padding:0 28px; }
.amb-bottom { display:flex; flex-direction:column; align-items:center; min-height:0;
  padding-bottom:var(--mmc-amb-bottom, 22px); }
.amb-ctl-wrap { flex:1; width:100%; display:flex; flex-direction:column; align-items:center; min-height:0; }
/* 2:3 split: controls sit a little nearer the title than the progress bar, which reads as centred
   because the big play button carries more visual weight than the thin bar below it */
.amb-ctl-wrap::before { content:""; flex:var(--mmc-amb-ctl-above, 2); }
.amb-ctl-wrap::after { content:""; flex:var(--mmc-amb-ctl-below, 3); }
/* lifted together (keeping their spacing) so the artwork's lower edge sits mid-screen; the progress bar stays put */
.amb-center, .amb-ctl { transform:translateY(calc(var(--mmc-amb-lift, 0px) * -1)); }
.amb-center { display:flex; flex-direction:column; align-items:center; gap:22px; width:100%; min-width:0; }
.amb-art { position:relative; width:min(100%, 58vh, var(--mmc-amb-art, 260px)); aspect-ratio:1; flex:none; border-radius:24px; overflow:hidden;
  background:var(--mmc-raised); box-shadow:0 24px 64px rgba(0,0,0,.55); cursor:pointer; }
.amb-art img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.amb-art .ph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--mmc-faint); }
.amb-art .ph svg { width:28%; height:28%; }
/* title/artist block can be nudged down with ambient_title_offset without moving anything else */
.amb-meta { width:100%; text-align:center; min-width:0; text-shadow:0 1px 12px rgba(0,0,0,.45);
  transform:translateY(var(--mmc-amb-title-offset, 0px)); }
/* song title: one line, trailed off (…) past 3 artwork widths or the screen edge */
.amb-title { font-size:32px; font-weight:750; letter-spacing:-.01em; line-height:1.15; margin:0 auto;
  max-width:var(--mmc-amb-title-w, 100%); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
/* artist line: scrolls when wider than 2 artwork widths, then restarts from the beginning */
.amb-artist { margin:6px auto 0; max-width:var(--mmc-amb-artist-w, 100%); font-size:19px; font-weight:500;
  color:rgba(244,244,242,.72); white-space:nowrap; overflow:hidden; }
.amb-artist-in { display:inline-block; }
.amb-artist.marquee { text-align:left;
  -webkit-mask-image:linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
  mask-image:linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%); }
.amb-artist.marquee .amb-artist-in { padding:0 16px; animation:mmc-marquee var(--mmc-mq-dur, 10s) linear infinite; }
@keyframes mmc-marquee {
  0%, 16% { transform:translateX(0); opacity:1; }
  80% { transform:translateX(var(--mmc-mq-dist, 0px)); opacity:1; }
  88% { transform:translateX(var(--mmc-mq-dist, 0px)); opacity:0; }
  88.01% { transform:translateX(0); opacity:0; }
  96%, 100% { transform:translateX(0); opacity:1; } }
.amb-bar { width:100%; }
.amb-track { width:100%; height:5px; border-radius:3px; background:rgba(255,255,255,.18); overflow:hidden; }
.amb-times { display:flex; justify-content:space-between; margin-top:8px; font-family:var(--mmc-mono); font-size:13px; color:rgba(244,244,242,.7); }
.amb { --amb-accent:var(--mmc-accent); --amb-on-accent:var(--mmc-on-accent); --amb-accent-dim:rgba(255,200,87,.16); }
.amb-prog { height:100%; width:0; background:var(--amb-accent); transition:background-color .8s; }
.amb .amb-play { background:var(--amb-accent); color:var(--amb-on-accent); transition:background-color .8s, color .8s; }
.amb-track { background:var(--amb-accent-dim) !important; }
.amb-ctl { display:flex; align-items:center; justify-content:space-between; width:100%; max-width:480px; }
.amb-ctl .ctl { color:rgba(244,244,242,.8); }
.amb-ctl .ctl.on { color:var(--amb-accent); background:var(--amb-accent-dim); }
.amb-ctl .skip { color:var(--mmc-text); }
@media (max-height:1100px) {
  ha-card { gap:14px; padding-top:18px; }
  .play { width:104px; height:104px; padding:30px; }
  .skip { width:80px; height:80px; padding:18px; }
  .title { font-size:26px; }
}
/* compact portrait tablets, e.g. Galaxy Tab A 8.0 (600x960 CSS px) */
@media (max-height:1000px) {
  ha-card { gap:12px; padding:16px 20px 18px; }
  .chip { height:40px; }
  .power { width:44px; height:44px; padding:10px; }
  .title { font-size:24px; }
  .artist { margin-top:4px; font-size:17px; }
  .src { min-height:56px; font-size:18px; }
  .sources { padding-bottom:8px; }
  .sources-head { padding-bottom:6px; }
  ha-card.fill:not(.noart) .list { height:var(--mmc-list-max, clamp(150px, 23vh, 240px)); }
  .amb-body { padding:0 24px; }
  .amb-center { gap:18px; }
  .amb-title { font-size:28px; }
  .amb-artist { font-size:18px; }
}
`;

class MidnightMusicCard extends HTMLElement {
  static getStubConfig(hass) {
    const e = Object.keys(hass?.states || {}).find((id) => id.startsWith("media_player."));
    return { entity: e || "media_player.example" };
  }

  setConfig(config) {
    if (!config || (!config.entity && !(config.entities && config.entities.length))) {
      throw new Error("Set 'entity' (or 'entities') to a media_player");
    }
    const players = (config.entities || []).map((e) => (typeof e === "string" ? { entity: e } : e));
    if (config.entity && !players.some((p) => p.entity === config.entity)) players.unshift({ entity: config.entity });
    this._config = {
      show_volume: true, show_progress: true, show_shuffle_repeat: true, show_power: true,
      source_layout: "list", ...config,
    };
    this._players = players;
    this._active = this._active && players.some((p) => p.entity === this._active) ? this._active : players[0].entity;
    this._srcFilter = config.sources
      ? config.sources.map((s) => (typeof s === "string" ? { source: s } : s))
      : null;
    this._built = false;
    this._snapTrim = 0;
    this._lastObj = null;
    this._srcKey = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) { this._render(); return; }
    const obj = hass.states[this._active];
    if (obj && this._lastObj && obj !== this._lastObj && obj.last_updated !== this._lastObj.last_updated) {
      // A live state change: its server timestamp is roughly "now" on the server.
      const sample = Date.now() - Date.parse(obj.last_updated);
      if (isFinite(sample)) this._skew = this._skew == null ? sample : Math.min(this._skew, sample);
    }
    if (obj && this._rawPrev && this._rawPrev !== obj && this._rawPrev.entity_id === obj.entity_id) this._checkTrackEnd(this._rawPrev, obj);
    if (obj) this._rawPrev = obj;
    const chipsChanged = this._players.length > 1 && this._players.some((p) => hass.states[p.entity] !== this._chipObjs?.[p.entity]);
    if (obj !== this._lastObj || chipsChanged) this._update();
  }

  connectedCallback() {
    loadFonts(); this._startTick();
    if (!this._onResize) this._onResize = () => { this._fit(); this._layoutNav(); this._layoutAmbText(); };
    window.addEventListener("resize", this._onResize);
    window.addEventListener("orientationchange", this._onResize);
    clearInterval(this._burn);
    // the shift step comes from the clock, so every page (wall-card too) moves together
    if (this._config?.burn_in_protection) this._burn = setInterval(() => this._burnIn(), 30 * 1000);
    this._burnIn();
    clearInterval(this._hdr); this._hdr = null;
    if (this._config?.hide_header) {
      // re-checked every second so edit mode brings the header straight back
      const apply = () => mmcSetHeaderHidden(mmcShouldHideHeader(this._config?.hide_header));
      apply();
      this._hdr = setInterval(apply, 1000);
    }
    this._navGoing = false;
    this._resetNav();
    this._scheduleFit();
  }
  disconnectedCallback() {
    clearInterval(this._tick); this._tick = null;
    clearInterval(this._burn); this._burn = null;
    clearInterval(this._hdr); this._hdr = null;
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("orientationchange", this._onResize);
  }

  // Default height mode "fit": fill the screen from wherever the card starts down to the bottom
  // edge, so it works with or without the HA header / kiosk mode, without any config.
  _fitMode() {
    const h = this._config && this._config.height;
    return h === undefined || h === null || h === "fit";
  }

  _scheduleFit() {
    requestAnimationFrame(() => this._fit());
    // HA finishes laying out views (header, sidebar, card columns) after first paint.
    [250, 1000, 3000].forEach((t) => setTimeout(() => this._fit(), t));
  }

  _fit() {
    if (!this.isConnected || !this._config || !this._fitMode() || !this.$) return;
    const c = this._config;
    const rect = this.getBoundingClientRect();
    const pageTop = rect.top + (window.scrollY || 0);
    const gap = Number(c.bottom_gap ?? 0);
    let h = Math.max(480, Math.floor(window.innerHeight - pageTop - gap));
    // Snap to the screen, same rule as wall-card: when the card (almost) fills the screen, draw it
    // from the screen's own corner so the tabs land on the same pixels whatever view pads it.
    const snapGap = 24;
    const snap = c.snap_to_screen !== false &&
      rect.left >= 0 && rect.left <= snapGap && pageTop >= 0 && pageTop <= snapGap &&
      Math.abs(window.innerWidth - rect.right) <= snapGap;
    let offX = 0, offY = 0, w = null, cardH = h;
    if (snap) {
      offX = -Math.round(rect.left); offY = -Math.round(pageTop);
      w = window.innerWidth;
      cardH = Math.max(480, window.innerHeight - gap);
    }
    // the host keeps the card's own box; a snapped card reaches past it. Give back any padding the
    // view adds below the card so the page never ends up a few pixels taller than the screen.
    const trim = snap ? (this._snapTrim || 0) : 0;
    const hostH = snap ? Math.max(0, cardH + offY - trim) : null;
    const sig = [cardH, offX, offY, w, hostH, snap].join("|");
    if (sig === this._fitSig) return;
    this._fitSig = sig;
    this._fitH = cardH;
    this.style.setProperty("--mmc-height", cardH + "px");
    const card = this.$.card;
    card.style.width = w ? w + "px" : "";
    card.style.transform = offX || offY ? `translate(${offX}px,${offY}px)` : "";
    this.style.height = hostH != null ? hostH + "px" : "";
    this.classList.toggle("mmc-snap", snap);
    this._layoutNav();
    if (snap) {
      requestAnimationFrame(() => {
        const doc = document.scrollingElement || document.documentElement;
        const over = Math.round(doc.scrollHeight - window.innerHeight);
        if (over > 0 && over <= 64) { this._snapTrim = (this._snapTrim || 0) + over; this._fitSig = ""; this._fit(); }
      });
    }
  }

  // Burn-in protection, identical to wall-card: an 8-step offset that follows the clock (5 min per
  // step), so this page and the wall-card pages are always shifted by exactly the same amount.
  _burnIn() {
    let bx = 0, by = 0;
    if (this._config?.burn_in_protection) {
      const shift = Math.floor(Date.now() / (5 * 60 * 1000)) % 8;
      bx = (shift % 4) * 2 - 3;
      by = Math.floor(shift / 4) * 4 - 2;
    }
    if (bx) this.style.setProperty("--mmc-bx", bx + "px"); else this.style.removeProperty("--mmc-bx");
    if (by) this.style.setProperty("--mmc-by", by + "px"); else this.style.removeProperty("--mmc-by");
  }

  // Put the tabs on exactly the pixels wall-card uses, by redoing its artboard maths:
  // compact (card < 720px wide, or layout: compact): 1:1, 20px from the sides, 12px from the bottom,
  // 46px tall tabs; otherwise the 800px artboard (56px sides, 32px bottom, 13px text) scaled to fit.
  _layoutNav() {
    const nav = this.$?.nav, card = this.$?.card;
    if (!nav || nav.hidden || !card) return;
    const c = this._config;
    const w = card.offsetWidth || this.getBoundingClientRect().width || window.innerWidth;
    const h = this._fitMode() && this._fitH ? this._fitH : card.offsetHeight;
    if (!w || !h) return;
    const mode = String(c.layout || "auto");
    const compact = mode === "compact" || (mode !== "tablet" && w < 720);
    let scale, aw, ah, dx = 0, side, bottom, navH;
    if (compact) {
      scale = 1; aw = w; ah = Math.max(560, h); side = 20; bottom = 12; navH = 46;
    } else {
      scale = w / 800; aw = 800;
      ah = Math.round(Math.min(1280 * 1.3, Math.max(1280 * 0.8, h / scale)));
      scale = Math.min(scale, h / ah);
      dx = Math.max(0, Math.round((w - aw * scale) / 2));
      side = 56; bottom = 32; navH = 43;
    }
    const top = ah - bottom - navH; // in artboard px
    const x = dx + side * scale, y = top * scale;
    nav.classList.toggle("classic", !compact);
    nav.style.width = aw - 2 * side + "px";
    nav.style.transform = `translate(calc(${x}px + var(--mmc-bx, 0px) * ${scale}), calc(${y}px + var(--mmc-by, 0px) * ${scale}))` +
      (scale === 1 ? "" : ` scale(${scale})`);
    // keep the rest of the card clear of the tabs
    this.style.setProperty("--mmc-nav-space", Math.round(h - y + (compact ? 16 : 20 * scale)) + "px");
  }

  /* ---- page switcher (ported from wall-card) ---- */
  // The tab lights up on the first touch (pointerdown) and the switch starts on release, one frame
  // later, so the highlight is on screen before Home Assistant gets busy building the next page.
  _wireNavItem(el, path) {
    const press = () => {
      const nav = this.$.nav;
      nav.querySelectorAll(".nav-item.active").forEach((a) => { a.classList.remove("active"); a.classList.add("was-active"); });
      nav.querySelectorAll(".nav-item.pressed").forEach((a) => a.classList.remove("pressed"));
      el.classList.add("pressed");
    };
    const go = () => {
      if (this._navGoing) return;
      this._navGoing = true;
      requestAnimationFrame(() => setTimeout(() => { this._navGoing = false; navigateTo(path); }, 0));
    };
    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", () => {
      if (el.classList.contains("pressed")) { this._navUpAt = Date.now(); go(); }
    });
    // a finger that slides off the tab cancels, like a normal button
    el.addEventListener("pointercancel", () => this._resetNav());
    el.addEventListener("pointerleave", (ev) => { if (ev.pointerType !== "mouse" || ev.buttons) this._resetNav(); });
    el.addEventListener("click", () => {
      if (this._navGoing || Date.now() - (this._navUpAt || 0) < 800) return;
      press(); go();
    });
  }

  // back from another page: show this page's own tab again
  _resetNav() {
    const nav = this.$?.nav;
    if (!nav) return;
    nav.querySelectorAll(".nav-item.pressed").forEach((a) => a.classList.remove("pressed"));
    nav.querySelectorAll(".nav-item.was-active").forEach((a) => { a.classList.remove("was-active"); a.classList.add("active"); });
  }

  _buildNav() {
    const nav = this.$?.nav;
    if (!nav) return;
    const items = this._config.nav;
    if (!Array.isArray(items) || !items.length) { nav.hidden = true; return; }
    nav.hidden = false;
    nav.textContent = "";
    nav.style.gridTemplateColumns = `repeat(${items.length}, minmax(0, 1fr))`;
    const here = window.location.pathname.toLowerCase();
    const panels = this._hass?.panels;
    items.forEach((item) => {
      const el = document.createElement("span");
      el.className = "nav-item";
      el.textContent = item.label || "";
      const path = item.path;
      const slug = path ? String(path).replace(/^\//, "").split("/")[0] : "";
      // HA silently redirects an unknown dashboard to the default one; dim the tab instead
      const knownSlug = !panels || !slug || Object.prototype.hasOwnProperty.call(panels, slug);
      if (!path || !knownSlug) {
        el.classList.add("disabled");
        if (path) el.title = `No dashboard at "/${slug}"`;
      } else if (path.toLowerCase() === here || here.endsWith(path.toLowerCase())) {
        el.classList.add("active");
      } else {
        this._wireNavItem(el, path);
      }
      nav.appendChild(el);
    });
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: "full", min_columns: 6, rows: "auto" }; }

  _startTick() {
    if (this._tick) return;
    this._tick = setInterval(() => { this._updateProgress(); this._checkAmbient(); }, 1000);
  }

  _ambientTimeout() {
    const c = this._config;
    if (!c || c.ambient === false) return 0;
    return Number(c.ambient_timeout ?? 60);
  }

  _checkAmbient() {
    const t = this._ambientTimeout(), o = this._lastObj;
    if (!t || this._ambient || !this.$ || !o || o.state !== "playing") return;
    const since = Math.max(this._lastTouch || 0, this._playingSince || 0);
    if (Date.now() - since >= t * 1000) this._setAmbient(true);
  }

  _setAmbient(on) {
    if (!this.$) return;
    this._ambient = on;
    this.$.amb.hidden = !on;
    if (on && !this._lastObj) return;
    this._lastTouch = Date.now();
    if (on) {
      this._updateAmbient(this._viewObj || this._lastObj); this._updateProgress();
      requestAnimationFrame(() => this._layoutAmbText());
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this._layoutAmbText());
    }
  }

  // Material You-style palette for the idle view: pick the artwork's most prominent vivid hue and
  // derive light "tone 80" accent + dark "tone 15" on-accent colours from it. Falls back to honey.
  _applyArtColors() {
    const amb = this.$ && this.$.amb, img = this.$ && this.$.ambImg;
    if (!amb) return;
    const reset = () => ["--amb-accent", "--amb-on-accent", "--amb-accent-dim"].forEach((k) => amb.style.removeProperty(k));
    if (this._config.ambient_colors === "midnight" || !img || !img.naturalWidth) return reset();
    let data;
    try {
      const cv = this._cv || (this._cv = document.createElement("canvas"));
      cv.width = cv.height = 32;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, 32, 32);
      data = cx.getImageData(0, 0, 32, 32).data;
    } catch (e) { return reset(); } // cross-origin artwork without CORS: keep honey
    const bins = Array.from({ length: 18 }, () => ({ w: 0, h: 0, s: 0 }));
    let grey = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
      total++;
      if (d < 0.08 || l < 0.08 || l > 0.95) { grey++; continue; }
      const s = d / (1 - Math.abs(2 * l - 1));
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const w = s * (1 - Math.abs(l - 0.55)); // favour vivid mid-tone pixels
      const bin = bins[Math.floor(h / 20) % 18];
      // average hue on the circle via vector sum
      bin.w += w; bin.s += s * w;
      bin.x = (bin.x || 0) + Math.cos(h * Math.PI / 180) * w;
      bin.y = (bin.y || 0) + Math.sin(h * Math.PI / 180) * w;
    }
    const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
    if (!best.w || grey / total > 0.92) {
      amb.style.setProperty("--amb-accent", "hsl(0 0% 88%)");
      amb.style.setProperty("--amb-on-accent", "hsl(0 0% 10%)");
      amb.style.setProperty("--amb-accent-dim", "hsla(0, 0%, 100%, .16)");
      return;
    }
    const hue = Math.round((Math.atan2(best.y, best.x) * 180 / Math.PI + 360) % 360);
    const sat = Math.round(Math.min(85, Math.max(40, (best.s / best.w) * 100)));
    amb.style.setProperty("--amb-accent", `hsl(${hue} ${sat}% 74%)`);
    amb.style.setProperty("--amb-on-accent", `hsl(${hue} ${Math.round(sat * 0.6)}% 14%)`);
    amb.style.setProperty("--amb-accent-dim", `hsla(${hue}, ${sat}%, 74%, .2)`);
  }

  _fallbackArt() {
    const fb = this._config.fallback_artwork;
    return fb === false ? "" : typeof fb === "string" ? fb : FALLBACK_ART;
  }

  // Load artwork with retries: Sonos/HA often serve a track's cover a moment after the track starts,
  // so a first failure shows the fallback and we try again a few times (cache-busted).
  // onState(url) gets the loaded URL, or "" after a failure (show fallback for now).
  _probeArt(url, isCurrent, onState) {
    const delays = this._config.artwork_retry_delays || [1500, 4000, 10000];
    const attempt = (n) => {
      if (!isCurrent()) return;
      const img = new Image();
      const u = n === 0 ? url : url + (url.includes("?") ? "&" : "?") + "mmc_retry=" + Date.now();
      img.onload = () => { if (isCurrent()) onState(u); };
      img.onerror = () => {
        if (!isCurrent()) return;
        if (n === 0) onState("");
        if (n < delays.length) setTimeout(() => attempt(n + 1), delays[n]);
      };
      img.src = u;
    };
    attempt(0);
  }

  // Main-view blurred background: only show an image that actually loads, else the fallback cover.
  _loadBg(url) {
    const el = this.$ && this.$.bgImg;
    if (!el) return;
    const token = (this._bgToken = (this._bgToken || 0) + 1);
    const show = (u) => {
      if (token !== this._bgToken) return;
      if (u) el.style.backgroundImage = "url(" + JSON.stringify(u) + ")";
      el.classList.toggle("on", !!u);
    };
    if (!url) return show("");
    if (url.startsWith("data:")) return show(url);
    this._probeArt(url, () => token === this._bgToken, (u) => {
      if (u) return show(u);
      const fb = this._fallbackArt(); show(fb && fb !== url ? fb : "");
    });
  }

  // While Sonos switches tracks/favorites it briefly reports no media (or idle). Keep showing the
  // previous track for a few seconds instead of flashing "Nothing playing"; give up after the hold
  // time, or straight away if the player is switched off.
  _holdMedia(obj) {
    const a = obj.attributes, hold = Number(this._config.hold_media_seconds ?? 8) * 1000;
    const MEDIA = ["media_title", "media_artist", "media_album_name", "media_series_title", "media_channel",
      "entity_picture", "entity_picture_local", "media_duration", "media_position", "media_position_updated_at", "media_content_id"];
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
    this._holdT = setTimeout(() => this._update(), left + 50);
    const attrs = { ...a };
    MEDIA.forEach((k) => { if (h.attrs[k] != null) attrs[k] = h.attrs[k]; });
    return { ...obj, state: ["idle", "unknown", "on", "buffering"].includes(obj.state) ? h.state : obj.state, attributes: attrs };
  }

  // Artwork URL for a state: the player's own picture, else the fallback cover while something is loaded.
  _artFor(obj) {
    if (!obj) return "";
    const a = obj.attributes, s = obj.state;
    const real = a.entity_picture_local || a.entity_picture;
    if (real) return real;
    const fb = this._config.fallback_artwork;
    if (fb === false) return "";
    const active = ["playing", "paused", "buffering", "on"].includes(s) || !!a.media_title;
    return active ? (typeof fb === "string" ? fb : FALLBACK_ART) : "";
  }

  // Long-title handling for the idle view (needs real sizes, so it runs once the view is visible).
  // Lift artwork + title + controls (not the progress bar) so the artwork's lower edge sits at
  // `ambient_art_bottom` (share of the screen height, default 0.5 = middle). Measured with offsetTop,
  // which ignores the lift itself, so repeated calls don't drift.
  _liftAmb() {
    const $ = this.$, v = this._config.ambient_art_bottom;
    const body = $.amb.querySelector(".amb-body");
    let lift = 0;
    if (v !== false && v !== null && body) {
      const frac = Number(v ?? 0.5);
      let top = 0;
      for (let el = $.ambArt; el && el !== body; el = el.offsetParent) top += el.offsetTop;
      const artBottom = top + $.ambArt.offsetHeight;
      lift = Math.max(0, Math.round(artBottom - body.clientHeight * frac));
    }
    $.amb.style.setProperty("--mmc-amb-lift", lift + "px");
  }

  _layoutAmbText() {
    const $ = this.$;
    if (!$ || !this._ambient) return;
    const artW = $.ambArt.getBoundingClientRect().width;
    if (!artW) return;
    $.amb.style.setProperty("--mmc-amb-art-w", Math.round(artW) + "px");
    this._liftAmb();
    const c = this._config;
    $.amb.style.setProperty("--mmc-amb-title-w", Math.round(artW * Number(c.ambient_title_max_widths ?? 3)) + "px");
    $.amb.style.setProperty("--mmc-amb-artist-w", Math.round(artW * Number(c.ambient_artist_max_widths ?? 2)) + "px");
    $.ambTitle.textContent = this._ambTitleFull || "";
    $.ambTitle.title = this._ambTitleFull || "";
    // Artist: scroll (then restart) if wider than its box.
    $.ambArtist.classList.remove("marquee");
    const over = $.ambArtistIn.scrollWidth - $.ambArtist.clientWidth;
    if (over > 2 && this._config.ambient_marquee !== false) {
      $.ambArtist.classList.add("marquee");
      const dist = $.ambArtistIn.scrollWidth - $.ambArtist.clientWidth; // includes marquee padding
      $.ambArtist.style.setProperty("--mmc-mq-dist", -dist + "px");
      // ~30px/s while moving; the moving part is 64% of the cycle, the rest is pauses and the restart fade
      $.ambArtist.style.setProperty("--mmc-mq-dur", Math.max(7, dist / 30 / 0.64).toFixed(1) + "s");
    }
  }

  _updateAmbient(obj) {
    const $ = this.$;
    if (!$ || !this._ambient || !obj) return;
    const a = obj.attributes, f = a.supported_features || 0;
    const t = $.title.textContent, ar = $.artist.textContent;
    if (t !== this._ambTitleFull || ar !== this._ambArtistFull) {
      this._ambTitleFull = t; this._ambArtistFull = ar;
      $.ambTitle.textContent = t;
      $.ambArtistIn.textContent = ar;
      this._layoutAmbText();
    }
    const pic = this._artFor(obj);
    if (this._ambPic !== pic) {
      this._ambPic = pic;
      if (!pic) $.ambBg.style.backgroundImage = "none";
      if (pic && pic.startsWith("data:")) $.ambImg.setAttribute("src", pic);
      else if (pic) {
        const tok = (this._ambToken = (this._ambToken || 0) + 1);
        this._probeArt(pic, () => tok === this._ambToken && this._ambPic === pic, (u) => {
          const fb = this._fallbackArt();
          if (u) $.ambImg.setAttribute("src", u);
          else if (fb) $.ambImg.setAttribute("src", fb);
          else { $.ambImg.removeAttribute("src"); $.ambImg.hidden = true; $.ambPh.hidden = false; }
        });
      }
      else { $.ambImg.removeAttribute("src"); $.ambImg.hidden = true; $.ambPh.hidden = false; this._applyArtColors(); }
    }
    $.ambPlay.innerHTML = svg(obj.state === "playing" ? (f & F.PAUSE ? P.pause : P.stop) : P.play);
    const canSrc = this._canSkipSource(obj);
    this.shadowRoot.querySelector(".amb-prev").disabled = !(f & F.PREVIOUS) && !canSrc;
    this.shadowRoot.querySelector(".amb-next").disabled = !(f & F.NEXT) && !canSrc;
    const rep = this.shadowRoot.querySelector(".amb-repeat");
    rep.style.visibility = f & F.REPEAT ? "visible" : "hidden";
    rep.classList.toggle("on", !!a.repeat && a.repeat !== "off");
    rep.innerHTML = svg(a.repeat === "one" ? P.repeatOne : P.repeat);
  }

  _call(service, data = {}) {
    if (!this._hass) return Promise.resolve();
    return Promise.resolve(this._hass.callService("media_player", service, { entity_id: this._active, ...data }));
  }

  // Sources the prev/next fallback may step through (e.g. Sonos favorites), in list order.
  _skipList(obj) {
    const ex = (this._config.skip_sources_exclude || ["TV", "Line-in", "Line in"]).map((x) => String(x).toLowerCase());
    const base = this._sourceItems(obj).map((i) => i.source).filter((x) => !ex.includes(String(x).toLowerCase()));
    // Only step between favorites of the same kind: from a single song to other single songs,
    // never into a playlist/album (whose own tracks would then take over the skip buttons).
    if (this._config.skip_same_type === false) return base;
    const kinds = this._favKinds && this._favKinds[obj.entity_id] && this._favKinds[obj.entity_id].map;
    if (!kinds) return base;
    const cur = this._currentSource(obj, base);
    const kind = cur && kinds[cur];
    return kind ? base.filter((x) => kinds[x] === kind) : base;
  }

  // Ask HA's media browser which favorites are single tracks, playlists/albums or radio stations.
  // Works for Sonos (favorites are grouped by type); other players simply skip this.
  async _loadFavoriteKinds(entity) {
    const hass = this._hass;
    if (!hass || !hass.callWS || this._config.skip_same_type === false) return;
    this._favKinds = this._favKinds || {};
    const prev = this._favKinds[entity];
    if (prev && (prev.loading || Date.now() - prev.at < 15 * 60 * 1000)) return;
    this._favKinds[entity] = { at: Date.now(), loading: true, map: prev && prev.map };
    const kindOf = (id) => {
      id = String(id || "");
      if (/musicTrack|audioItem\.(?!audioBroadcast)/i.test(id)) return "track";
      if (/audioBroadcast|radio/i.test(id)) return "radio";
      return "list"; // playlists, albums, containers
    };
    try {
      const browse = (type, id) => hass.callWS({ type: "media_player/browse_media", entity_id: entity, media_content_type: type, media_content_id: id });
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

  // Which list entry is playing. Sonos often leaves `source` empty while a favorite plays, so also
  // match the track/channel/playlist name, then fall back to the source this card last selected.
  _currentSource(obj, list, useMemory = true) {
    if (!obj) return null;
    const a = obj.attributes;
    list = list || this._sourceItems(obj).map((i) => i.source);
    if (a.source && list.includes(a.source)) return a.source;
    const norm = (x) => String(x ?? "").trim().toLowerCase();
    for (const cand of [a.media_title, a.media_channel, a.media_playlist, a.media_album_name]) {
      if (!cand) continue;
      const hit = list.find((x) => norm(x) === norm(cand));
      if (hit) return hit;
    }
    if (!useMemory) return null;
    const last = this._lastSelected(obj.entity_id);
    return last && list.includes(last) ? last : null;
  }

  _lastSelected(entity) {
    if (this._lastSel && this._lastSel[entity]) return this._lastSel[entity];
    try { return localStorage.getItem("mmc-last-source:" + entity); } catch (e) { return null; }
  }

  _rememberSource(entity, src) {
    this._lastSel = this._lastSel || {};
    this._lastSel[entity] = src;
    try { localStorage.setItem("mmc-last-source:" + entity, src); } catch (e) { /* ignore */ }
  }

  _canSkipSource(obj) {
    if (!obj || this._config.skip_sources === false) return false;
    const list = this._skipList(obj);
    const cur = this._currentSource(obj, list);
    // Playing a playlist/album favorite: skip buttons stay with its own tracks, never jump favorites.
    const kinds = this._favKinds && this._favKinds[obj.entity_id] && this._favKinds[obj.entity_id].map;
    if (kinds && cur && kinds[cur] === "list") return false;
    return list.length > 1 && list.includes(cur);
  }

  // Which favorite to switch to. With shuffle on (the player's shuffle setting, as toggled in the main
  // view), pick a random one not played recently; "previous" walks back through what was played.
  _pickNextSource(obj, list, start, dir) {
    const shuffle = obj.attributes.shuffle ?? this._shuffleWanted;
    if (!shuffle) return list[(list.indexOf(start) + dir + list.length) % list.length];
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

  // Step to the neighbouring favorite. If Sonos can't play it (e.g. "… couldn't be found"), remember
  // it as broken for a while and keep going in the same direction, without an error toast.
  // Auto-advance: a single-song Sonos favorite has no queue, so Sonos just stops when it ends.
  // When a known single-song favorite stops on its own (it was playing and had reached the end of
  // the track) and repeat is off, start the next favorite, following shuffle like the next button.
  _checkTrackEnd(prev, obj) {
    const c = this._config;
    if (c.auto_advance === false || prev.state !== "playing" || !["idle", "paused"].includes(obj.state)) return;
    const a = prev.attributes;
    if ((obj.attributes.repeat ?? a.repeat ?? "off") !== "off") return;
    const dur = Number(a.media_duration);
    if (!dur || a.media_position == null || !a.media_position_updated_at) return;
    const elapsed = (Date.now() - (this._skew || 0) - Date.parse(a.media_position_updated_at)) / 1000;
    const pos = Number(a.media_position) + (isFinite(elapsed) ? Math.max(0, elapsed) : 0);
    if (pos < dur - Number(c.auto_advance_margin ?? 4)) return; // paused by hand mid-song
    if (!this._canSkipSource(prev)) return;
    const kinds = this._favKinds && this._favKinds[prev.entity_id] && this._favKinds[prev.entity_id].map;
    const src = this._currentSource(prev, null, false);
    if (!kinds || !src || kinds[src] !== "track") return;
    if (this._advancedAt && Date.now() - this._advancedAt < 5000) return;
    this._advancedAt = Date.now();
    this._selectAdjacentSource(prev, 1, src);
  }

  _selectAdjacentSource(obj, dir, from = null, tries = 0) {
    this._broken = this._broken || {};
    const now = Date.now();
    const list = this._skipList(obj).filter((x) => !(this._broken[x] > now) || x === from);
    const start = from || this._currentSource(obj, list);
    const i = list.indexOf(start);
    if (i < 0 || list.length < 2 || tries >= list.length - 1) return;
    const src = this._pickNextSource(obj, list, start, dir);
    if (!src || src === start) return;
    const entity = this._active;
    this._pending = src;
    this._markSources(obj);
    this._rememberSource(entity, src);
    const hass = this._hass;
    const call = hass.callWS
      ? hass.callWS({ type: "call_service", domain: "media_player", service: "select_source",
          service_data: { source: src }, target: { entity_id: entity } })
      : Promise.resolve(hass.callService("media_player", "select_source", { entity_id: entity, source: src }));
    call.catch((err) => {
      console.warn("midnight-music-card: favorite failed, skipping it:", src, err && err.message);
      this._broken[src] = Date.now() + Number(this._config.broken_source_minutes ?? 60) * 60000;
      if (this._active !== entity) return;
      this._pending = null;
      this._selectAdjacentSource(this._hass.states[entity] || obj, dir, src, tries + 1);
    });
  }

  // Next/previous track. Single-song favorites (e.g. Sonos favorites) have a one-item queue, so the
  // player ignores next/previous. If the track hasn't changed shortly after, step to the
  // neighbouring source in the list instead.
  _skip(dir) {
    const o = this._hass?.states[this._active];
    if (!o) return;
    const f = o.attributes.supported_features || 0;
    const supported = dir > 0 ? f & F.NEXT : f & F.PREVIOUS;
    const fallback = this._canSkipSource(o);
    if (!supported) { if (fallback) this._selectAdjacentSource(o, dir); return; }
    // Known single-song (or radio) favorite: Sonos can't skip within it, so switch favorites at once.
    // Only when we're sure what's playing (source/title match, not just the remembered last tap).
    const kinds = this._favKinds && this._favKinds[o.entity_id] && this._favKinds[o.entity_id].map;
    const sure = kinds && this._currentSource(o, null, false);
    if (fallback && sure && (kinds[sure] === "track" || kinds[sure] === "radio")) { this._selectAdjacentSource(o, dir); return; }
    const key = (x) => [x?.attributes.media_content_id, x?.attributes.media_title, x?.attributes.media_artist].join("|");
    const before = key(o), entity = this._active;
    let done = false;
    const check = () => {
      if (done) return; done = true;
      const now = this._hass?.states[entity];
      if (this._active !== entity || !now || key(now) !== before) return;
      if (this._canSkipSource(now) && this._currentSource(now) === this._currentSource(o)) this._selectAdjacentSource(now, dir);
    };
    this._call(dir > 0 ? "media_next_track" : "media_previous_track").catch(() => { if (fallback) check(); });
    if (fallback) setTimeout(check, Number(this._config.skip_sources_delay ?? 2500));
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const c = this._config;
    const fit = this._fitMode(), fixed = !fit && c.height !== "auto";
    this._fitH = null; this._fitSig = "";
    if (!fit) { this.style.height = ""; this.classList.remove("mmc-snap"); }
    this._ambPic = this._bgPic = this._ambTitleFull = this._ambArtistFull = undefined; // fresh DOM
    if (fixed) this.style.setProperty("--mmc-height", c.height);
    else this.style.removeProperty("--mmc-height");
    if (c.art_size) this.style.setProperty("--mmc-art", c.art_size);
    const sp = Number(c.ambient_controls_position ?? 0.4); // share of the gap above the controls
    if (sp > 0 && sp < 1) {
      this.style.setProperty("--mmc-amb-ctl-above", String(sp));
      this.style.setProperty("--mmc-amb-ctl-below", String(1 - sp));
    }
    const to = c.ambient_title_offset;
    if (to != null) this.style.setProperty("--mmc-amb-title-offset", typeof to === "number" ? to + "px" : to);
    else this.style.removeProperty("--mmc-amb-title-offset");
    const aa = c.ambient_art_size;
    if (aa != null) this.style.setProperty("--mmc-amb-art", typeof aa === "number" ? aa + "px" : aa);
    else this.style.removeProperty("--mmc-amb-art");
    if (c.sources_max_height) this.style.setProperty("--mmc-list-max", c.sources_max_height);
    const chips = this._players.length > 1
      ? `<div class="players">${this._players.map((p) => `<button class="chip" data-entity="${esc(p.entity)}"><span class="dot" hidden></span><span class="cn"></span></button>`).join("")}</div>`
      : "";
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
<ha-card class="${fit || fixed ? "fill" : ""}${c.show_artwork === true ? "" : " noart"}${Array.isArray(c.nav) && c.nav.length ? " has-nav" : ""}">
  <div class="bg"><div class="bg-img"></div><div class="bg-shade"></div></div>
  ${chips}
  <div class="top"><div class="eyebrow"></div>
    <div class="top-btns"><button class="power" title="Power">${svg(P.power)}</button>
    <button class="power idle-btn" title="Now playing view">${svg(P.idle)}</button></div></div>
  <div class="sources"><span class="count" hidden></span>
    <div class="list${c.source_layout === "grid" ? " grid" : ""}"></div></div>
  <div class="art"><div class="ph">${svg(P.note)}</div><img alt="" hidden></div>
  <div class="meta"><div class="title"></div><div class="artist"></div></div>
  <div class="progress"><div class="bar"><div class="track"><div class="prog"></div></div></div>
    <div class="times"><span class="pos"></span><span class="dur"></span></div></div>
  <div class="controls">
    <button class="ctl shuffle" title="Shuffle">${svg(P.shuffle)}</button>
    <button class="skip prev" title="Previous">${svg(P.prev)}</button>
    <button class="play" title="Play/Pause">${svg(P.play)}</button>
    <button class="skip next" title="Next">${svg(P.next)}</button>
    <button class="ctl repeat" title="Repeat">${svg(P.repeat)}</button>
  </div>
  <div class="volume">
    <button class="ic mute" title="Mute">${svg(P.vol)}</button>
    <input type="range" min="0" max="100" step="1" aria-label="Volume">
    <div class="steps" hidden><button class="vdown" title="Volume down">${svg(P.minus)}</button><button class="vup" title="Volume up">${svg(P.plus)}</button></div>
    <div class="pct"></div>
  </div>
  <div class="nav" hidden></div>
  <div class="amb" hidden>
    <div class="amb-bg"></div><div class="amb-shade"></div>
    <div class="amb-body">
      <div class="amb-spacer"></div>
      <div class="amb-center">
      <div class="amb-art" title="Open player"><div class="ph">${svg(P.note)}</div><img alt="" hidden></div>
      <div class="amb-meta"><div class="amb-title"></div><div class="amb-artist"><span class="amb-artist-in"></span></div></div>
      </div>
      <div class="amb-bottom">
      <div class="amb-ctl-wrap"><div class="amb-ctl">
        <button class="ctl amb-menu" title="Open player">${svg(P.menu)}</button>
        <button class="skip amb-prev" title="Previous">${svg(P.prev)}</button>
        <button class="play amb-play" title="Play/Pause">${svg(P.play)}</button>
        <button class="skip amb-next" title="Next">${svg(P.next)}</button>
        <button class="ctl amb-repeat" title="Repeat">${svg(P.repeat)}</button>
      </div></div>
      <div class="amb-bar"><div class="amb-track"><div class="amb-prog"></div></div>
        <div class="amb-times"><span class="amb-pos"></span><span class="amb-dur"></span></div></div>
      </div>
    </div>
  </div>
</ha-card>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.$ = {
      card: $("ha-card"), eyebrow: $(".eyebrow"), power: $(".power"), img: $(".art img"), ph: $(".art .ph"),
      meta: $(".meta"), title: $(".title"), artist: $(".artist"), progress: $(".progress"), bar: $(".bar"),
      fill: $(".prog"), pos: $(".pos"), dur: $(".dur"), controls: $(".controls"), shuffle: $(".shuffle"),
      prev: $(".prev"), play: $(".play"), next: $(".next"), repeat: $(".repeat"), volume: $(".volume"),
      mute: $(".mute"), range: $("input[type=range]"), steps: $(".steps"), pct: $(".pct"),
      nav: $(".nav"), sources: $(".sources"), list: $(".list"), count: $(".count"), art: $(".art"),
      amb: $(".amb"), bgImg: $(".bg-img"), ambBg: $(".amb-bg"), ambArt: $(".amb-art"), ambImg: $(".amb-art img"), ambPh: $(".amb-art .ph"),
      ambTitle: $(".amb-title"), ambCenter: $(".amb-center"), ambArtist: $(".amb-artist"), ambArtistIn: $(".amb-artist-in"), ambBar: $(".amb-bar"), ambPos: $(".amb-pos"), ambDur: $(".amb-dur"), ambProg: $(".amb-prog"), ambPlay: $(".amb-play"),
    };
    this.$.img.addEventListener("load", () => { this.$.img.hidden = false; this.$.ph.hidden = true; });
    this.$.img.addEventListener("error", () => { this.$.img.hidden = true; this.$.ph.hidden = false; });
    this.$.ambImg.addEventListener("load", () => {
      this.$.ambImg.hidden = false; this.$.ambPh.hidden = true;
      this.$.ambBg.style.backgroundImage = "url(" + JSON.stringify(this.$.ambImg.getAttribute("src")) + ")";
      this._applyArtColors();
    });
    this.$.ambImg.addEventListener("error", () => {
      const fb = this._config.fallback_artwork === false ? "" : (typeof this._config.fallback_artwork === "string" ? this._config.fallback_artwork : FALLBACK_ART);
      if (fb && this.$.ambImg.getAttribute("src") !== fb) { this.$.ambImg.setAttribute("src", fb); return; }
      this.$.ambImg.hidden = true; this.$.ambPh.hidden = false;
    });
    this._lastTouch = Date.now();
    this._ambient = false;
    this._bind();
    this._buildNav();
    this._burnIn();
    requestAnimationFrame(() => this._layoutNav());
    clearInterval(this._burn); this._burn = null;
    if (c.burn_in_protection && this.isConnected) this._burn = setInterval(() => this._burnIn(), 30 * 1000);
    this._built = true;
    this._lastObj = null;
    this._srcKey = null;
    this._update();
    if (fit) this._scheduleFit();
  }

  _bind() {
    const $ = this.$;
    const st = () => this._hass?.states[this._active];
    const playPause = () => {
      const o = st(); if (!o) return;
      const f = o.attributes.supported_features || 0;
      if (o.state === "off" && f & F.TURN_ON) return this._call("turn_on");
      if (o.state === "playing") return this._call(f & F.PAUSE ? "media_pause" : "media_stop");
      this._call("media_play");
    };
    $.play.addEventListener("click", playPause);
    $.ambPlay.addEventListener("click", playPause);
    this.shadowRoot.querySelector(".amb-prev").addEventListener("click", () => this._skip(-1));
    this.shadowRoot.querySelector(".amb-next").addEventListener("click", () => this._skip(1));
    $.ambArt.addEventListener("click", () => this._setAmbient(false));
    this.shadowRoot.querySelector(".idle-btn").addEventListener("click", () => this._setAmbient(true));
    $.card.addEventListener("pointerdown", () => { this._lastTouch = Date.now(); }, { passive: true, capture: true });
    $.prev.addEventListener("click", () => this._skip(-1));
    $.next.addEventListener("click", () => this._skip(1));
    $.shuffle.addEventListener("click", () => {
      this._shuffleWanted = !(st()?.attributes.shuffle ?? this._shuffleWanted);
      this._call("shuffle_set", { shuffle: this._shuffleWanted });
    });
    const cycleRepeat = () => {
      const order = ["off", "all", "one"];
      const cur = st()?.attributes.repeat || "off";
      this._call("repeat_set", { repeat: order[(order.indexOf(cur) + 1) % 3] });
    };
    this.shadowRoot.querySelector(".amb-repeat").addEventListener("click", cycleRepeat);
    this.shadowRoot.querySelector(".amb-menu").addEventListener("click", () => this._setAmbient(false));
    $.repeat.addEventListener("click", () => {
      const order = ["off", "all", "one"];
      const cur = st()?.attributes.repeat || "off";
      this._call("repeat_set", { repeat: order[(order.indexOf(cur) + 1) % 3] });
    });
    $.power.addEventListener("click", () => {
      const o = st(); if (!o) return;
      this._call(o.state === "off" || o.state === "standby" ? "turn_on" : "turn_off");
    });
    $.mute.addEventListener("click", () => this._call("volume_mute", { is_volume_muted: !st()?.attributes.is_volume_muted }));
    $.range.addEventListener("input", () => {
      this._dragging = true;
      $.range.style.setProperty("--v", $.range.value + "%");
      $.pct.textContent = $.range.value + "%";
    });
    $.range.addEventListener("change", () => {
      this._dragging = false;
      this._call("volume_set", { volume_level: Number($.range.value) / 100 });
    });
    this.shadowRoot.querySelector(".vup").addEventListener("click", () => this._call("volume_up"));
    this.shadowRoot.querySelector(".vdown").addEventListener("click", () => this._call("volume_down"));
    $.bar.addEventListener("click", (ev) => {
      const o = st(); if (!o) return;
      const f = o.attributes.supported_features || 0, d = o.attributes.media_duration;
      if (!(f & F.SEEK) || !d) return;
      const r = $.bar.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      this._call("media_seek", { seek_position: Math.round(frac * d) });
    });
    $.meta.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: this._active } }));
    });
    $.list.addEventListener("click", (ev) => {
      const b = ev.target.closest(".src"); if (!b) return;
      const src = b.dataset.source;
      this._pending = src;
      this._markSources(this._hass?.states[this._active]);
      const o = st();
      if (o && (o.state === "off" || o.state === "standby") && (o.attributes.supported_features & F.TURN_ON)) {
        this._call("turn_on");
      }
      this._rememberSource(this._active, src);
      this._call("select_source", { source: src });
      clearTimeout(this._pendingT);
      this._pendingT = setTimeout(() => { this._pending = null; this._markSources(st()); }, 6000);
    });
    const chips = this.shadowRoot.querySelector(".players");
    if (chips) chips.addEventListener("click", (ev) => {
      const b = ev.target.closest(".chip"); if (!b) return;
      this._active = b.dataset.entity;
      this._lastObj = null; this._srcKey = null; this._pending = null; this._prevState = null;
      this._update();
    });
  }

  _name(id, obj) {
    const p = this._players.find((x) => x.entity === id);
    return p?.name || obj?.attributes.friendly_name || id;
  }

  _update() {
    const $ = this.$, hass = this._hass, c = this._config;
    if (!$ || !hass) return;
    let obj = hass.states[this._active];
    this._lastObj = obj;

    if (this._players.length > 1) {
      this._chipObjs = {};
      this.shadowRoot.querySelectorAll(".chip").forEach((b) => {
        const o = hass.states[b.dataset.entity];
        this._chipObjs[b.dataset.entity] = o;
        b.classList.toggle("on", b.dataset.entity === this._active);
        b.querySelector(".cn").textContent = this._name(b.dataset.entity, o);
        b.querySelector(".dot").hidden = o?.state !== "playing";
      });
    }

    if (!obj) {
      $.eyebrow.textContent = "Entity not found: " + this._active;
      $.card.querySelectorAll(".controls,.volume,.progress,.sources").forEach((e) => e.classList.add("unavail"));
      return;
    }
    obj = this._holdMedia(obj);
    this._viewObj = obj;
    const a = obj.attributes, f = a.supported_features || 0, s = obj.state;
    if (s === "playing" && this._prevState !== "playing") this._playingSince = Date.now();
    this._prevState = s;
    const unavailable = s === "unavailable" || s === "unknown";
    const off = s === "off" || s === "standby";
    [$.controls, $.volume, $.progress].forEach((e) => e.classList.toggle("unavail", unavailable));
    $.sources.classList.toggle("unavail", unavailable);

    const stateLabel = { playing: "Playing", paused: "Paused", idle: "Idle", on: "On", off: "Off", standby: "Standby", buffering: "Buffering", unavailable: "Unavailable" }[s] || s;
    $.eyebrow.innerHTML = c.status_details
      ? `<b>${esc(stateLabel)}</b> · ${esc(this._name(this._active, obj))}${a.source ? " · " + esc(a.source) : ""}`
      : `<b>${esc(stateLabel)}</b>`;
    $.power.hidden = !c.show_power || !(f & (F.TURN_ON | F.TURN_OFF));
    $.power.classList.toggle("on", !off && !unavailable);

    const title = a.media_title || (off ? "Off" : a.source || (s === "idle" ? "Nothing playing" : stateLabel));
    const artist = [a.media_artist || a.media_series_title, c.show_album ? a.media_album_name : null]
      .filter(Boolean).join(" · ") || a.app_name || "";
    $.title.textContent = title;
    $.artist.textContent = artist || " ";

    const pic = !off && this._artFor(obj);
    const bgPic = (!off && c.background !== false && pic) || "";
    if (this._bgPic !== bgPic) {
      this._bgPic = bgPic;
      this._loadBg(bgPic);
    }
    if (c.show_artwork !== true) $.art.hidden = true;
    else if (pic) {
      if ($.img.getAttribute("src") !== pic) $.img.setAttribute("src", pic);
    } else {
      $.img.removeAttribute("src"); $.img.hidden = true; $.ph.hidden = false;
    }

    const playing = s === "playing";
    $.play.innerHTML = svg(playing ? (f & F.PAUSE ? P.pause : P.stop) : P.play);
    $.play.disabled = !(f & (F.PLAY | F.PAUSE | F.STOP | F.TURN_ON));
    const canSrc = this._canSkipSource(obj);
    $.prev.disabled = (!(f & F.PREVIOUS) && !canSrc) || off;
    $.next.disabled = (!(f & F.NEXT) && !canSrc) || off;
    const sr = c.show_shuffle_repeat;
    $.shuffle.style.visibility = sr && f & F.SHUFFLE ? "visible" : "hidden";
    $.repeat.style.visibility = sr && f & F.REPEAT ? "visible" : "hidden";
    $.shuffle.classList.toggle("on", !!a.shuffle);
    $.repeat.classList.toggle("on", !!a.repeat && a.repeat !== "off");
    $.repeat.innerHTML = svg(a.repeat === "one" ? P.repeatOne : P.repeat);

    const showVol = c.show_volume && f & (F.VOLUME_SET | F.VOLUME_STEP | F.VOLUME_MUTE);
    $.volume.hidden = !showVol;
    if (showVol) {
      const hasSet = !!(f & F.VOLUME_SET);
      $.range.hidden = !hasSet;
      $.steps.hidden = hasSet || !(f & F.VOLUME_STEP);
      $.mute.disabled = !(f & F.VOLUME_MUTE);
      $.mute.innerHTML = svg(a.is_volume_muted ? P.mute : P.vol);
      $.mute.classList.toggle("muted", !!a.is_volume_muted);
      if (!this._dragging) {
        const v = Math.round((a.volume_level ?? 0) * 100);
        $.range.value = v;
        $.range.style.setProperty("--v", v + "%");
        $.pct.textContent = hasSet && a.volume_level != null ? v + "%" : "";
      }
    }

    $.bar.classList.toggle("seek", !!(f & F.SEEK));
    this._updateProgress();
    this._renderSources(obj);
    if (this._config.skip_sources !== false && (a.source_list || []).length) this._loadFavoriteKinds(this._active);
    if (this._ambient) {
      if (["off", "standby", "idle", "unavailable", "unknown"].includes(s)) {
        // Sonos briefly reports idle/unknown while switching tracks or favorites; only leave the
        // idle view if the player stays stopped for a while.
        if (!this._exitT) this._exitT = setTimeout(() => {
          this._exitT = null;
          const now = this._hass?.states[this._active];
          if (this._ambient && (!now || ["off", "standby", "idle", "unavailable", "unknown"].includes(now.state))) this._setAmbient(false);
        }, Number(c.ambient_exit_delay ?? 20) * 1000);
      } else {
        if (this._exitT) { clearTimeout(this._exitT); this._exitT = null; }
      }
      this._updateAmbient(obj);
    }
  }

  _updateProgress() {
    const $ = this.$, obj = this._viewObj || this._lastObj;
    if (!$ || !obj) return;
    const a = obj.attributes, d = a.media_duration;
    const show = this._config.show_progress && d > 0;
    $.progress.hidden = !show;
    $.ambBar.style.visibility = show ? "visible" : "hidden";
    if (!show) return;
    let pos = Number(a.media_position) || 0;
    if (obj.state === "playing" && a.media_position_updated_at) {
      // Correct for the tablet clock differing from the HA server clock; otherwise a tablet that
      // runs behind computes a negative position and the bar never fills.
      const elapsed = (Date.now() - (this._skew || 0) - Date.parse(a.media_position_updated_at)) / 1000;
      if (isFinite(elapsed)) pos += Math.max(0, elapsed);
    }
    pos = Math.max(0, Math.min(pos, d));
    $.fill.style.width = (pos / d) * 100 + "%";
    if (this._ambient) {
      $.ambProg.style.width = (pos / d) * 100 + "%";
      $.ambPos.textContent = fmt(pos);
      $.ambDur.textContent = fmt(d);
    }
    $.pos.textContent = fmt(pos);
    $.dur.textContent = fmt(d);
  }

  _sourceItems(obj) {
    const list = obj.attributes.source_list || [];
    if (!this._srcFilter) return list.map((s) => ({ source: s, name: s }));
    return this._srcFilter
      .filter((x) => !list.length || list.includes(x.source))
      .map((x) => ({ source: x.source, name: x.name || x.source }));
  }

  _renderSources(obj) {
    const $ = this.$, f = obj.attributes.supported_features || 0;
    const supported = !!(f & F.SELECT_SOURCE) || (obj.attributes.source_list || []).length > 0;
    if (this._config.show_sources === false) { $.sources.hidden = true; return; }
    const items = supported ? this._sourceItems(obj) : [];
    const key = this._active + "|" + items.map((i) => i.source + "=" + i.name).join("\u0001");
    if (key !== this._srcKey) {
      this._srcKey = key;
      $.count.textContent = items.length ? String(items.length).padStart(2, "0") : "";
      $.list.innerHTML = items.length
        ? items.map((it, i) => `<button class="src" data-source="${esc(it.source)}"><span class="n">${String(i + 1).padStart(2, "0")}</span><span class="label">${esc(it.name)}</span><span class="tick">${svg(P.check)}</span></button>`).join("")
        : `<div class="empty">${supported ? "No sources reported by this player." : "This player doesn't support source selection."}</div>`;
    }
    this._markSources(obj);
  }

  _markSources(obj) {
    if (!this.$ || !obj) return;
    const cur = this._currentSource(obj, null, false);
    if (this._pending && this._pending === cur) { this._pending = null; clearTimeout(this._pendingT); }
    this.$.list.querySelectorAll(".src").forEach((b) => {
      b.classList.toggle("on", b.dataset.source === cur);
      b.classList.toggle("pending", b.dataset.source === this._pending);
    });
  }
}

if (!customElements.get("midnight-music-card")) {
  customElements.define("midnight-music-card", MidnightMusicCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "midnight-music-card",
    name: "Midnight Music Card",
    description: "Portrait media player with large controls and a source list, for wall tablets.",
    preview: true,
  });
  console.info(`%c MIDNIGHT-MUSIC-CARD %c ${MMC_VERSION} `, "background:#FFC857;color:#000;font-weight:700", "background:#000;color:#FFC857");
}
