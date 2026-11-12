/* ──────────────────────────────────────────────────────────────
   WebGL atmosphere (three.js): a warm spotlight behind the dish plus floating
   flour / candle-dust bokeh. It reacts to the wheel (a kick of wind in the
   direction of travel, and a pulse of light) and to pointer parallax.
   Sits behind the dishes, never blocks input, pauses when the tab is hidden.
   ────────────────────────────────────────────────────────────── */
import * as THREE from "three";

export function createFX(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" }); }
  catch { return null; }                                       /* no WebGL: the menu still works */
  const dprCap = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dprCap);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const U = {
    uTime: { value: 0 }, uKick: { value: 0 }, uPulse: { value: 0 }, uAspect: { value: 1 }, uPx: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Color("#e8dcc4") }, uTint: { value: new THREE.Color("#2a3324") },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRadius: { value: 0.3 }, uDpr: { value: dprCap }, uIntro: { value: 0 },
  };

  /* 1. spotlight: a full-screen quad with a soft radial glow around the dish */
  const bgScene = new THREE.Scene();
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  bgScene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: `
        precision mediump float; varying vec2 vUv;
        uniform vec2 uCenter, uPx; uniform float uRadius, uAspect, uPulse, uTime, uIntro; uniform vec3 uColor;
        void main(){
          vec2 d = (vUv - uCenter - uPx * 0.012) * vec2(uAspect, 1.);
          float r = length(d) / uRadius;
          float glow = exp(-r * r * 1.15);
          float halo = exp(-pow(abs(r - 1.12), 2.) * 14.) * .35;          /* faint ring just outside the crust */
          float breathe = .92 + .08 * sin(uTime * .8);
          float a = (glow * (.45 + uPulse * .4) + halo * (.5 + uPulse)) * breathe * uIntro;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    })
  ));

  /* 2. bokeh dust */
  const area = () => innerWidth * innerHeight;
  const COUNT = Math.round(Math.min(220, Math.max(70, area() / 9000)));
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos.set([(Math.random() - .5) * 2, (Math.random() - .5) * 2, Math.random()], i * 3);
    seed.set([Math.random() * 6.283, .4 + Math.random(), .5 + Math.random() * 1.5], i * 3);   /* phase, speed, size */
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  const dust = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aSeed; uniform float uTime, uKick, uAspect, uDpr, uIntro; uniform vec2 uPx;
      varying float vA;
      void main(){
        float depth = position.z;                                   /* 0 far .. 1 near */
        vec2 p = position.xy;
        p.y = mod(p.y + .5 + uTime * .018 * aSeed.y * (.4 + depth), 2.) - 1.;
        p.x += sin(uTime * .25 * aSeed.y + aSeed.x) * .04 + uKick * (.15 + depth * .5);
        p.x = mod(p.x + 1., 2.) - 1.;
        p += uPx * (.012 + depth * .03);
        gl_Position = vec4(p, 0., 1.);
        float tw = .55 + .45 * sin(uTime * 1.3 * aSeed.y + aSeed.x * 3.);
        gl_PointSize = (3. + depth * 14. * aSeed.z) * uDpr;
        vA = tw * (.25 + depth * .55) * uIntro;
      }`,
    fragmentShader: `
      precision mediump float; varying float vA; uniform vec3 uColor;
      void main(){
        float d = length(gl_PointCoord - .5) * 2.;
        float a = smoothstep(1., .25, d) * vA * .9;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  }));
  const dustScene = new THREE.Scene(); dustScene.add(dust);

  /* sizing */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    U.uAspect.value = w / h;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  /* loop */
  const clock = new THREE.Clock();
  let kickTarget = 0, pulseTarget = 0, px = new THREE.Vector2(), pxT = new THREE.Vector2(), introT = 0, running = true;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), .05);
    U.uTime.value += dt;
    kickTarget *= Math.pow(.02, dt);                                   /* wind decays */
    pulseTarget *= Math.pow(.05, dt);
    U.uKick.value += (kickTarget - U.uKick.value) * Math.min(1, dt * 4);
    U.uPulse.value += (pulseTarget - U.uPulse.value) * Math.min(1, dt * 6);
    px.lerp(pxT, Math.min(1, dt * 3)); U.uPx.value.copy(px);
    U.uIntro.value += (introT - U.uIntro.value) * Math.min(1, dt * 1.2);
    renderer.clear();
    renderer.render(bgScene, bgCam);
    renderer.render(dustScene, bgCam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); requestAnimationFrame(frame); }
  });

  const tmp = new THREE.Color();
  return {
    /* centre and radius in 0..1 of the canvas (y from the top) */
    setCenter(x, y, r) { U.uCenter.value.set(x, 1 - y); U.uRadius.value = r; },
    setTint(hex) { tmp.set(hex); U.uTint.value.copy(tmp); },
    kick(dir) { kickTarget = dir * -.9; pulseTarget = 1; },
    parallax(x, y) { pxT.set(x, -y); },
    show() { introT = 1; },
  };
}
