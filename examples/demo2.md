---
title: glide demo 2 — every slide is HTML
css: ./demo2.css
---

<!-- layout: center -->

# Every slide is HTML

So a slide can hold video, iframes, canvases and its own `<script>`.

This deck tries each kind of content and notes how it fares in three modes:
**HIC** (Chrome with HTML-in-Canvas), **fallback** (no HIC: dom-to-canvas), and **--no-gpu** (plain DOM).

<p class="result">✅ works · ⚠️ works with a catch · ❌ broken · 🌐 needs network</p>

---
<!-- layout: two-column -->

## Image

<p class="tests">Tests: raw <code>&lt;img&gt;</code> (left) and markdown <code>![]()</code> (right).</p>

<img src="glide.png" class="w-100"/>

|||

![amagi](amagi.jpg)

<p class="result">HIC ✅ · fallback ✅ · --no-gpu ✅</p>

---

## Video

<p class="tests">Tests: <code>&lt;video autoplay muted loop playsinline&gt;</code> with a local mp4.</p>

<video src="test.mp4" autoplay muted loop playsinline class="center w-60"></video>

<p class="result">HIC ✅ captured, plays, transitions work · fallback ⚠️ plain DOM, no transition (dom-to-canvas draws a grey box) · --no-gpu ✅</p>

---

## Animated GIF

<p class="tests">Tests: an animated GIF keeps moving.</p>

<img src="doge.gif" class="center w-30"/>

<p class="result">HIC ✅ keeps moving, transitions work · fallback ⚠️ plain DOM, no transition (dom-to-canvas draws one frame) · --no-gpu ✅</p>

---

## YouTube 🌐

<p class="tests">Tests: a cross-origin <code>&lt;iframe&gt;</code>.</p>

<iframe class="center" width="640" height="360" src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&mute=1" title="Big Buck Bunny" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>

<p class="result">HIC ⚠️ plain DOM, no transition (a cross-origin iframe is captured blank) · fallback ⚠️ same · --no-gpu ✅</p>

---

## p5.js 🌐

<p class="tests">Tests: a library from a CDN (<code>&lt;script src&gt;</code>), then an inline script in p5 instance mode, removed on unmount.</p>

<div id="p5-host" class="center" style="width: 640px; height: 360px"></div>

<script src="https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.min.js"></script>
<script>
  const host = Glide.currentSlide().querySelector("#p5-host");
  window.__frames = window.__frames || {};
  const inst = new p5((p) => {
    p.setup = () => p.createCanvas(640, 360);
    p.draw = () => {
      window.__frames.p5 = (window.__frames.p5 || 0) + 1;
      p.background(30, 30, 46);
      p.noStroke();
      for (let i = 0; i < 16; i++) {
        const a = p.frameCount * 0.02 + (i * p.TWO_PI) / 16;
        p.fill(203, 166, 247, 200);
        p.circle(320 + Math.cos(a) * 140, 180 + Math.sin(a * 2) * 100, 24);
      }
    };
  }, host);
  Glide.onUnmount(() => inst.remove());
</script>

<p class="result">HIC ✅ in the GPU stage at the right size, transitions show it (vfx-js redraws nested canvases) · fallback ⚠️ plain DOM · --no-gpu ✅ · loop stops on unmount in all modes</p>

---

## WebGL2

<p class="tests">Tests: a raw WebGL2 shader on a <code>&lt;canvas&gt;</code>, drawn every frame; the context is released on unmount.</p>

<div class="center" style="width: 640px"><canvas id="gl" width="640" height="360" style="width: 100%"></canvas></div>

<script>
  window.__frames = window.__frames || {};
  const cv = Glide.currentSlide().querySelector("#gl");
  const gl = cv.getContext("webgl2");
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
    void main() {
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform float time;
    uniform vec2 res;
    out vec4 color;
    void main() {
      vec2 uv = gl_FragCoord.xy / res;
      color = vec4(0.5 + 0.5 * cos(time + uv.xyx * 6.0 + vec3(0, 2, 4)), 1.0);
    }`));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const uTime = gl.getUniformLocation(prog, "time");
  gl.uniform2f(gl.getUniformLocation(prog, "res"), cv.width, cv.height);
  let raf = 0;
  const loop = (t) => {
    window.__frames.gl = (window.__frames.gl || 0) + 1;
    gl.uniform1f(uTime, t / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  Glide.onUnmount(() => {
    cancelAnimationFrame(raf);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  });
</script>

<p class="result">HIC ✅ in the GPU stage at the right size, transitions show it · fallback ⚠️ plain DOM · --no-gpu ✅ · loop stops and context is released on unmount</p>

---

## 2D canvas + pointer

<p class="tests">Tests: a 2D canvas that follows the pointer. Clicking it must not turn the page.</p>

<div class="center" style="width: 640px"><canvas id="trail" width="640" height="360" style="width: 100%; background: #11111b; border-radius: 8px"></canvas></div>

<script>
  window.__frames = window.__frames || {};
  const c = Glide.currentSlide().querySelector("#trail");
  const g = c.getContext("2d");
  let x = -100, y = -100, raf = 0;
  c.addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    x = ((e.clientX - r.left) / r.width) * c.width;
    y = ((e.clientY - r.top) / r.height) * c.height;
  });
  c.addEventListener("click", () => { c.dataset.clicks = String(Number(c.dataset.clicks || 0) + 1); });
  const loop = () => {
    window.__frames.trail = (window.__frames.trail || 0) + 1;
    g.fillStyle = "rgba(17, 17, 27, 0.15)";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f9e2af";
    g.beginPath();
    g.arc(x, y, 18, 0, Math.PI * 2);
    g.fill();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  Glide.onUnmount(() => cancelAnimationFrame(raf));
</script>

<p class="result">HIC ✅ drawn and follows the pointer (Chrome 156 without hit testing: ⚠️ drawn, but the pointer does not reach it) · fallback ⚠️ plain DOM · --no-gpu ✅ · clicks on the canvas do not turn the page</p>

---

## Form controls

<p class="tests">Tests: typing, a range slider and a button. Arrow keys and Space belong to the focused control; Esc gives them back to the deck.</p>

<div class="row">
  <label>Name <input id="name" value="glide" style="font-size: 0.8rem"/></label>
  <output id="hello" style="font-size: 0.9rem">Hello, glide!</output>
</div>
<div class="row" style="margin-top: 1rem">
  <input id="size" type="range" min="20" max="300" value="80" style="width: 40%"/>
  <div id="box" style="width: 80px; height: 80px; background: #a6e3a1; border-radius: 8px"></div>
</div>
<div class="row" style="margin-top: 1rem">
  <button id="count" style="font-size: 0.8rem">clicked 0 times</button>
</div>

<script>
  const s = Glide.currentSlide();
  const name = s.querySelector("#name");
  name.addEventListener("input", () => { s.querySelector("#hello").textContent = `Hello, ${name.value}!`; });
  const size = s.querySelector("#size");
  size.addEventListener("input", () => {
    const box = s.querySelector("#box");
    box.style.width = box.style.height = `${size.value}px`;
  });
  let n = 0;
  const btn = s.querySelector("#count");
  btn.addEventListener("click", () => { btn.textContent = `clicked ${++n} times`; });
</script>

<p class="result">HIC ✅ typing, slider drag and button work, keys stay in the control (Chrome 156 needs experimental web platform features for clicks; without them ⚠️ plain DOM) · fallback ⚠️ plain DOM · --no-gpu ✅</p>

---

## CSS animation + hover

<p class="tests">Tests: an infinite <code>@keyframes</code> animation, and a <code>:hover</code> style with a transition.</p>

<style>
  .spin { width: 120px; height: 120px; background: #89b4fa; border-radius: 16px; animation: spin 2s linear infinite; }
  .hover-me { padding: 1rem 2rem; background: #45475a; border-radius: 12px; transition: background 0.3s, transform 0.3s; }
  .hover-me:hover { background: #f38ba8; transform: scale(1.1); }
</style>

<div class="row" style="height: 50vh">
  <div class="spin"></div>
  <div class="hover-me" data-glide-interactive>hover me</div>
</div>

<p class="result">HIC ✅ animation and hover (Chrome 156 without hit testing: ⚠️ plain DOM) · fallback ⚠️ plain DOM · --no-gpu ✅</p>

---

## SVG

<p class="tests">Tests: SMIL <code>&lt;animate&gt;</code> (left) and a CSS-animated SVG shape (right).</p>

<style>
  .svg-rot { transform-origin: 60px 60px; animation: spin 3s linear infinite; }
</style>

<div class="row">
<svg width="240" height="240" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="20" fill="#fab387">
    <animate attributeName="r" values="10;50;10" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>
<svg width="240" height="240" viewBox="0 0 120 120">
  <rect class="svg-rot" x="30" y="30" width="60" height="60" rx="8" fill="#94e2d5"/>
</svg>
</div>

<p class="result">HIC ✅ both move · fallback ⚠️ plain DOM (dom-to-canvas freezes SMIL) · --no-gpu ✅</p>

---

## Audio

<p class="tests">Tests: <code>&lt;audio controls&gt;</code> and a button that plays it from script. No pixels to capture, only controls.</p>

<div class="row">
  <audio id="beep" controls src="beep.m4a"></audio>
  <button id="play" style="font-size: 0.8rem">play from script</button>
</div>

<script>
  const s = Glide.currentSlide();
  const a = s.querySelector("#beep");
  s.querySelector("#play").addEventListener("click", () => { a.currentTime = 0; a.play(); });
</script>

<p class="result">HIC ✅ controls show, play from script works (Chrome 156 without hit testing: ⚠️ plain DOM) · fallback ⚠️ plain DOM · --no-gpu ✅</p>

---

## Same-origin iframe

<p class="tests">Tests: a local page in an <code>&lt;iframe&gt;</code> with its own CSS animation and a button.</p>

<iframe class="center" src="demo2-frame.html" width="640" height="300" style="border: 0; border-radius: 8px"></iframe>

<p class="result">HIC ✅ captured with its animation; its button works (Chrome 156 without hit testing: ⚠️ plain DOM) · fallback ⚠️ plain DOM · --no-gpu ✅</p>

---

## Details, links, selection

<p class="tests">Tests: a <code>&lt;details&gt;</code> toggle, a link, and selecting text with the mouse.</p>

<details>
<summary>Click to open</summary>
<p>Hidden text, shown after the toggle.</p>
</details>

A [link to glide](https://github.com/fand/glide) opens in this tab.

<p id="selectable">Drag across this sentence to select it.</p>

<p class="result">HIC ✅ toggle, link and selection work · fallback ⚠️ plain DOM · --no-gpu ✅</p>

---

## Scroll box

<p class="tests">Tests: an element that scrolls inside the slide (wheel over it).</p>

<div id="scroller" data-glide-interactive style="height: 40vh; overflow: auto; background: #181825; padding: 0 1rem; border-radius: 8px">
<p>Line 1</p><p>Line 2</p><p>Line 3</p><p>Line 4</p><p>Line 5</p><p>Line 6</p><p>Line 7</p><p>Line 8</p><p>Line 9</p><p>Line 10</p><p>Line 11</p><p>Line 12</p><p>Line 13</p><p>Line 14</p><p>Line 15</p><p>Line 16</p><p>Line 17</p><p>Line 18</p><p>Line 19</p><p>Line 20 (the end)</p>
</div>

<p class="result">HIC ✅ the box scrolls and re-captures · fallback ⚠️ plain DOM (dom-to-canvas loses the scroll position) · --no-gpu ✅</p>

---

## Web Component

<p class="tests">Tests: a custom element with shadow DOM that updates itself (a clock), defined once per page.</p>

<glide-clock></glide-clock>

<script>
  if (!customElements.get("glide-clock")) {
    customElements.define("glide-clock", class extends HTMLElement {
      connectedCallback() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>span { font: 2.5rem monospace; color: #f5c2e7; }</style><span></span>`;
        const span = root.querySelector("span");
        const tick = () => { span.textContent = new Date().toISOString().slice(11, 22); };
        tick();
        this.timer = setInterval(tick, 50);
      }
      disconnectedCallback() {
        clearInterval(this.timer);
      }
    });
  }
</script>

<p class="result">HIC ✅ the clock ticks · fallback ⚠️ plain DOM · --no-gpu ✅</p>

---

## three.js 🌐

<p class="tests">Tests: a <code>type="module"</code> script importing three.js from a CDN.</p>

<div id="three-host" class="center" style="width: 640px; height: 360px"></div>

<script type="module">
  import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js";
  window.__frames = window.__frames || {};
  const host = Glide.currentSlide().querySelector("#three-host");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(640, 360);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 10);
  camera.position.z = 3;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
  scene.add(cube);
  renderer.setAnimationLoop(() => {
    window.__frames.three = (window.__frames.three || 0) + 1;
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.02;
    renderer.render(scene, camera);
  });
  Glide.onUnmount(() => {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    renderer.forceContextLoss();
  });
</script>

<p class="result">HIC ✅ in the GPU stage at the right size, transitions show it · fallback ⚠️ plain DOM · --no-gpu ✅ · loop and context released on unmount</p>

---

## Summary

<p class="result">HIC with <code>--enable-blink-features=CanvasDrawElement</code>. Chrome 156 sends clicks into the GPU stage only with experimental web platform features ("+hit"); Chrome 159 does without. "plain" = shown as plain DOM above the GPU stage: works, but the transition into and out of it is a cut.</p>

| Content | Chrome 159 | 156 +hit | 156 | fallback | --no-gpu |
| --- | --- | --- | --- | --- | --- |
| image | ✅ | ✅ | ✅ | ✅ | ✅ |
| video | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
| GIF | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
| YouTube 🌐 | ⚠️ plain | ⚠️ plain | ⚠️ plain | ⚠️ plain | ✅ |
| p5.js 🌐 | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
| WebGL2 | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
| 2D canvas + pointer | ✅ | ✅ | ⚠️ no pointer | ⚠️ plain | ✅ |
| form controls | ✅ | ✅ | ⚠️ plain | ⚠️ plain | ✅ |
| CSS animation + hover | ✅ | ✅ | ⚠️ plain | ⚠️ plain | ✅ |
| SVG (SMIL, CSS) | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
| audio | ✅ | ✅ | ⚠️ plain | ⚠️ plain | ✅ |
| same-origin iframe | ✅ | ✅ | ⚠️ plain | ⚠️ plain | ✅ |
| details, links, selection | ✅ | ✅ | ⚠️ plain | ⚠️ plain | ✅ |
| scroll box | ✅ | ✅ | ⚠️ plain | ⚠️ plain | ✅ |
| Web Component | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
| three.js 🌐 | ✅ | ✅ | ✅ | ⚠️ plain | ✅ |
