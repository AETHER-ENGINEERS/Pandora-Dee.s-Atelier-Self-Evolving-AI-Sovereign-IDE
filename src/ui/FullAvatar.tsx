import { useEffect, useRef, useState } from "react";
import { speech } from "../lib/voice.ts";

export type AvatarAsset = {
  kind: "live2d" | "vrm" | "image" | "video";
  /** Vault path of the model file (.model3.json / .vrm) or the picture. */
  entry: string;
  /** File name it came from, for showing. */
  name: string;
  /** 1 = fit the space; bigger or smaller from there. */
  scale: number;
  /** Move it up (negative) or down (positive), as a share of the height. */
  offsetY: number;
};

/** A vault file by path, so a model's own relative paths (textures, motions) resolve. */
export const avatarUrl = (entry: string) => `/api/vault/raw/${entry.split("/").map(encodeURIComponent).join("/")}`;

/** How far a character's mouth is open right now (0 when someone else is speaking). */
const mouthOf = (id: string) => {
  const s = speech.get();
  return s.who === id ? s.mouth : 0;
};

// ---------- Live2D ----------

let core: Promise<void> | null = null;
/** Live2D's Cubism Core (kept in public/vendor; see NOTICE.md), loaded once. */
function cubismCore() {
  return (core ??= new Promise<void>((resolve, reject) => {
    if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = "/vendor/live2dcubismcore.min.js";
    s.onload = () => resolve();
    s.onerror = () => {
      core = null;
      reject(new Error("Live2D's Cubism Core didn't load."));
    };
    document.head.appendChild(s);
  }));
}

/**
 * Every Live2D avatar draws through ONE shared WebGL renderer: Cubism keeps a single set of shaders, made
 * for one WebGL context, so a second context would draw nothing. Each frame the shared renderer draws each
 * avatar in turn and copies it into that avatar's own (2D) canvas.
 */
type L2DView = {
  model: import("pixi-live2d-display").Live2DModel;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  host: HTMLDivElement;
  a: AvatarAsset;
  charId: string;
};
let l2d: Promise<{ PIXI: typeof import("pixi.js"); Live2DModel: typeof import("pixi-live2d-display/cubism4").Live2DModel; renderer: import("pixi.js").Renderer }> | null = null;
const l2dViews = new Set<L2DView>();
let l2dLoop = 0;

function live2dRuntime() {
  return (l2d ??= (async () => {
    await cubismCore();
    const PIXI = await import("pixi.js");
    (window as unknown as { PIXI: unknown }).PIXI = PIXI; // pixi-live2d-display looks for it here
    const { Live2DModel } = await import("pixi-live2d-display/cubism4");
    Live2DModel.registerTicker(PIXI.Ticker);
    const renderer = new PIXI.Renderer({ width: 16, height: 16, backgroundAlpha: 0, antialias: true });
    return { PIXI, Live2DModel, renderer };
  })());
}

function drawAll(renderer: import("pixi.js").Renderer) {
  for (const v of l2dViews) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(v.host.clientWidth * dpr));
    const h = Math.max(1, Math.round(v.host.clientHeight * dpr));
    if (v.canvas.width !== w || v.canvas.height !== h) (v.canvas.width = w), (v.canvas.height = h);
    if (renderer.width !== w || renderer.height !== h) renderer.resize(w, h);
    const m = v.model;
    const base = Math.min(w / m.internalModel.originalWidth, h / m.internalModel.originalHeight);
    m.scale.set(base * (v.a.scale || 1));
    m.anchor.set(0.5, 1);
    m.position.set(w / 2, h * (1 + (v.a.offsetY || 0)));
    // the mouth follows the voice
    (m.internalModel.coreModel as unknown as { setParameterValueById?: (id: string, x: number) => void }).setParameterValueById?.("ParamMouthOpenY", Math.min(1, mouthOf(v.charId) * 1.4));
    renderer.render(m as unknown as import("pixi.js").DisplayObject);
    v.ctx.clearRect(0, 0, w, h);
    v.ctx.drawImage(renderer.view, 0, 0);
  }
  l2dLoop = l2dViews.size ? requestAnimationFrame(() => drawAll(renderer)) : 0;
}

async function startLive2D(host: HTMLDivElement, a: AvatarAsset, charId: string) {
  const { Live2DModel, renderer } = await live2dRuntime();
  const model = await Live2DModel.from(avatarUrl(a.entry), { autoInteract: false });
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const view: L2DView = { model, ctx: canvas.getContext("2d")!, canvas, host, a, charId };
  l2dViews.add(view);
  if (!l2dLoop) l2dLoop = requestAnimationFrame(() => drawAll(renderer));
  // the eyes follow the pointer
  const look = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    model.focus((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  };
  window.addEventListener("pointermove", look);
  return () => {
    window.removeEventListener("pointermove", look);
    l2dViews.delete(view);
    model.destroy();
    canvas.remove();
  };
}

// ---------- VRM (3D) ----------

async function startVrm(host: HTMLDivElement, a: AvatarAsset, charId: string) {
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(1, 2, 2);
  scene.add(sun);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(avatarUrl(a.entry));
  const vrm = gltf.userData.vrm as import("@pixiv/three-vrm").VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // older VRMs face the other way
  scene.add(vrm.scene);
  // stand relaxed instead of the T-pose
  const bone = (n: string) => vrm.humanoid?.getNormalizedBoneNode(n as never);
  const lArm = bone("leftUpperArm");
  const rArm = bone("rightUpperArm");
  // (normalized bones share one set of axes for VRM 0 and 1: negative z lowers the left arm)
  if (lArm) lArm.rotation.z = -1.2;
  if (rArm) rArm.rotation.z = 1.2;
  // frame the whole figure
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const height = box.max.y - box.min.y || 1.6;
  const fit = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    const dist = (height * 1.12) / (2 * Math.tan((camera.fov * Math.PI) / 360)) / (a.scale || 1);
    const midY = box.min.y + height / 2 - (a.offsetY || 0) * height;
    camera.position.set(0, midY, dist);
    camera.lookAt(0, midY, 0);
    camera.updateProjectionMatrix();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  const clock = new THREE.Clock();
  let blinkAt = 2;
  let raf = 0;
  const spine = bone("spine");
  const head = bone("head");
  const loop = () => {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    if (spine) spine.rotation.z = Math.sin(t * 0.8) * 0.03; // breathing sway
    if (head) head.rotation.y = Math.sin(t * 0.37) * 0.08;
    const em = vrm.expressionManager;
    if (em) {
      const since = t - blinkAt;
      em.setValue("blink", since > 0 && since < 0.16 ? Math.sin((since / 0.16) * Math.PI) : 0);
      if (since > 0.16) blinkAt = t + 2 + Math.random() * 4;
      em.setValue("aa", Math.min(1, mouthOf(charId) * 1.3));
    }
    vrm.update(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    VRMUtils.deepDispose(vrm.scene);
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/** A character's full avatar: Live2D, VRM, or an animated picture or video. */
export function FullAvatar({ charId, a, className = "" }: { charId: string; a: AvatarAsset; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (a.kind !== "live2d" && a.kind !== "vrm") return;
    const el = host.current;
    if (!el) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    setError("");
    (a.kind === "live2d" ? startLive2D : startVrm)(el, a, charId)
      .then((s) => (cancelled ? s() : (stop = s)))
      .catch((e) => !cancelled && setError(`That ${a.kind === "live2d" ? "Live2D model" : "VRM model"} couldn't be shown (${e instanceof Error ? e.message.slice(0, 120) : String(e)}). Try another file in their profile.`));
    return () => {
      cancelled = true;
      stop?.();
      el.replaceChildren();
    };
  }, [a.kind, a.entry, a.scale, a.offsetY, charId]);

  if (a.kind === "image")
    return <img className={`full-avatar img ${className}`} src={avatarUrl(a.entry)} alt="" draggable={false} style={{ transform: `translateY(${(a.offsetY || 0) * 100}%) scale(${a.scale || 1})` }} />;
  if (a.kind === "video")
    return <video className={`full-avatar img ${className}`} src={avatarUrl(a.entry)} autoPlay loop muted playsInline style={{ transform: `translateY(${(a.offsetY || 0) * 100}%) scale(${a.scale || 1})` }} />;
  return (
    <div className={`full-avatar ${className}`}>
      <div ref={host} className="full-avatar-stage" />
      {error ? <div className="full-avatar-error small">{error}</div> : null}
    </div>
  );
}
