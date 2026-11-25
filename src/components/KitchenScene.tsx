import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createDragController, dampingAlpha } from './dragController';
import { BALANCE } from '../game/balance';
import { SERVING_BAR } from '../game/recipes';

export interface KitchenSceneProps {
  position?: { x: number; y: number };
  playing?: boolean;
  activeStation?: string;
  readyToServe?: boolean;
  celebration?: number;
  className?: string;
  onReady?: () => void;
  onDirection?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  controlsEnabled?: boolean;
  onDragStateChange?: (dragging: boolean) => void;
}

const STATIONS = [
  { id: 'rice', label: 'NASI', x: 0, y: 3, color: '#f8ce58', symbol: '01', plaque: { x: -3.65, y: 0.68, z: 1.14 } },
  { id: 'filling', label: 'ISIAN', x: 2, y: 4, color: '#97ddd4', symbol: '02', plaque: { x: 0, y: 1.3, z: 3.18 } },
  { id: 'finish', label: 'TOPPING', x: 4, y: 3, color: '#f3ad9e', symbol: '03', plaque: { x: 3.65, y: 0.68, z: 1.09 } },
  { id: 'broth', label: 'KUAH', x: 0, y: 1, color: '#a6d9e5', symbol: '04', plaque: { x: -3.65, y: 0.68, z: -1.02 } },
  { id: 'protein', label: 'PROTEIN', x: 4, y: 1, color: '#c7b8dd', symbol: '05', plaque: { x: 3.65, y: 0.68, z: -1.04 } },
];

const TILE = 1.04;
const world = (value: number) => (value - 2) * TILE;

/** A secondary view for browsers that cannot create a WebGL context. */
function CpuKitchen({ position = { x: 2, y: 2 }, playing = false, activeStation, readyToServe = false, controlsEnabled = false, onDirection, onReady, onDragStateChange }: KitchenSceneProps) {
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef(createDragController({ repeatMs: BALANCE.moveCooldownMs + 10 }));
  const current = useRef({ playing, controlsEnabled, onDirection, onReady, onDragStateChange });
  current.current = { playing, controlsEnabled, onDirection, onReady, onDragStateChange };
  const stop = () => {
    const pointerId = drag.current.snapshot().pointerId;
    drag.current.end();
    if (pointerId !== null) {
      try { if (board.current?.hasPointerCapture(pointerId)) board.current.releasePointerCapture(pointerId); } catch { /* The browser may have already released capture. */ }
      current.current.onDragStateChange?.(false);
    }
  };
  useEffect(() => {
    current.current.onReady?.();
    const timer = window.setInterval(() => {
      const state = current.current;
      if (!state.playing || !state.controlsEnabled) return;
      const direction = drag.current.tick(performance.now());
      if (direction) state.onDirection?.(direction);
    }, 30);
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(timer); stop();
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => { if (!playing || !controlsEnabled) stop(); }, [playing, controlsEnabled]);
  const enabled = playing && controlsEnabled;
  const symbols: Record<string, string> = { rice: '🍚', filling: '🥒', finish: '✨', broth: '🍜', protein: '🐟' };
  return <div className="cpu-kitchen">
    <span className="cpu-kitchen-note">Mode ringan · browser ini tidak menyediakan WebGL</span>
    <div ref={board} className="cpu-kitchen-board" role="group" aria-label="Dapur lima kali lima. Gunakan tombol panah atau seret untuk bergerak."
      style={{ touchAction: enabled ? 'none' : 'pan-y' }}
      onPointerDown={event => {
        if (!enabled || !event.isPrimary || event.button !== 0 || !drag.current.begin(event.pointerId, event.clientX, event.clientY)) return;
        event.preventDefault();
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Board events still work while the pointer remains inside. */ }
        onDragStateChange?.(true);
      }}
      onPointerMove={event => { if (drag.current.snapshot().pointerId === event.pointerId) { event.preventDefault(); drag.current.move(event.pointerId, event.clientX, event.clientY); } }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
      {Array.from({ length: 25 }, (_, index) => {
        const x = index % 5, y = 4 - Math.floor(index / 5);
        const station = STATIONS.find(item => item.x === x && item.y === y);
        const serving = x === SERVING_BAR.x && y === SERVING_BAR.y;
        const next = playing && (serving ? readyToServe : !readyToServe && Boolean(station) && activeStation === station?.id);
        return <div key={index} className={`cpu-kitchen-cell ${(x + y) % 2 ? 'alternate' : ''} ${station || serving ? 'station' : ''} ${next ? 'next' : ''}`}
          style={station || serving ? { backgroundColor: station?.color || '#f3ad9e' } : undefined}>
          {station && <><span aria-hidden="true">{symbols[station.id]}</span><strong>{station.label}</strong></>}
          {serving && <><span aria-hidden="true">↓</span><strong>BAR SAJI</strong></>}
        </div>;
      })}
      <div className="cpu-kitchen-chef" role="img" aria-label={`Koki di kolom ${position.x + 1}, baris ${5 - position.y}`} style={{ transform: `translate(${position.x * 100}%, ${(4 - position.y) * 100}%)` }}>
        <svg viewBox="0 0 74 84" aria-hidden="true"><ellipse cx="37" cy="75" rx="23" ry="5" fill="#17171426"/><path d="M19 68c0-18 4-27 18-27s18 9 18 27" fill="#e55549" stroke="#983c32" strokeWidth="2"/><path d="M29 47h16v21H29z" fill="#fffdf7"/><path d="M27 67v8m20-8v8" stroke="#263b36" strokeWidth="7" strokeLinecap="round"/><circle cx="37" cy="33" r="17" fill="#edb787" stroke="#9c603c" strokeWidth="1.5"/><path d="M22 24v-9c-11-7-1-20 8-12 3-9 16-9 20 0 12-5 18 10 8 15v6Z" fill="#fffdf7" stroke="#8a9c8b" strokeWidth="1.5"/><path d="M23 21h33v6H23z" fill="#fffdf7"/><circle cx="31" cy="34" r="1.6" fill="#41372c"/><circle cx="44" cy="34" r="1.6" fill="#41372c"/><path d="M32 41q6 6 11-1" stroke="#a1533a" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
      </div>
    </div>
    <div className="cpu-kitchen-controls" role="group" aria-label="Gerakkan koki">
      {(['left', 'up', 'down', 'right'] as const).map(direction => <button key={direction} type="button" disabled={!enabled} aria-label={`Gerak ${ { left: 'kiri', up: 'atas', down: 'bawah', right: 'kanan' }[direction] }`} onClick={() => onDirection?.(direction)}>{ { left: '←', up: '↑', down: '↓', right: '→' }[direction] }</button>)}
    </div>
  </div>;
}

/** Procedural kitchen geometry with a locally hosted game logo. */
export default function KitchenScene({
  position = { x: 2, y: 2 },
  playing = false,
  activeStation,
  readyToServe = false,
  celebration = 0,
  className = '',
  onReady,
  onDirection,
  controlsEnabled = false,
  onDragStateChange,
}: KitchenSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const joystick = useRef<HTMLDivElement>(null);
  const joystickThumb = useRef<HTMLDivElement>(null);
  const stopDrag = useRef<() => void>(() => {});
  const latest = useRef({ position, playing, activeStation, readyToServe, celebration, onReady, onDirection, controlsEnabled, onDragStateChange });
  latest.current = { position, playing, activeStation, readyToServe, celebration, onReady, onDirection, controlsEnabled, onDragStateChange };
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!playing || !controlsEnabled || unavailable) stopDrag.current();
  }, [playing, controlsEnabled, unavailable]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Dapur Sushi Rush 3D. Seret untuk bergerak. Setelah bahan lengkap, ikuti panah ke Bar saji di depan untuk menyajikan pesanan.');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // Local finger motion steers a floating stick. The frame loop emits one
    // grid move at a time, with a margin above the engine's integer cooldown.
    const drag = createDragController({ repeatMs: BALANCE.moveCooldownMs + 10 });
    const showPointer = () => {
      const { anchor, offset } = drag.snapshot();
      const bounds = container.getBoundingClientRect();
      if (joystick.current) {
        joystick.current.style.left = `${anchor.x - bounds.left}px`;
        joystick.current.style.top = `${anchor.y - bounds.top}px`;
        joystick.current.style.opacity = '1';
      }
      if (joystickThumb.current) joystickThumb.current.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    };
    const stopPointer = () => {
      const capturedPointer = drag.snapshot().pointerId;
      drag.end();
      if (joystick.current) joystick.current.style.opacity = '0';
      if (joystickThumb.current) joystickThumb.current.style.transform = 'translate(0px, 0px)';
      if (capturedPointer !== null) {
        try {
          if (renderer.domElement.hasPointerCapture(capturedPointer)) renderer.domElement.releasePointerCapture(capturedPointer);
        } catch { /* Capture may already be gone after a browser cancellation. */ }
        latest.current.onDragStateChange?.(false);
      }
    };
    stopDrag.current = stopPointer;
    const emitHop = (now: number) => {
      if (!drag.isActive()) return;
      const current = latest.current;
      if (!current.playing || !current.controlsEnabled || !current.onDirection) { stopPointer(); return; }
      const direction = drag.tick(now);
      if (direction) current.onDirection(direction);
    };
    const pointerDown = (event: PointerEvent) => {
      const current = latest.current;
      if (!event.isPrimary || !current.playing || !current.controlsEnabled || !current.onDirection || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (!drag.begin(event.pointerId, event.clientX, event.clientY)) return;
      event.preventDefault();
      try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* Window release listener still stops the drag. */ }
      showPointer();
      current.onDragStateChange?.(true);
    };
    const pointerMove = (event: PointerEvent) => {
      if (drag.snapshot().pointerId !== event.pointerId) return;
      event.preventDefault();
      drag.move(event.pointerId, event.clientX, event.clientY);
      showPointer();
    };
    const pointerEnd = (event: PointerEvent) => { if (event.pointerId === drag.snapshot().pointerId) stopPointer(); };
    const visibilityChange = () => { if (document.hidden) stopPointer(); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    // Window movement is also a fallback when a browser declines capture.
    window.addEventListener('pointermove', pointerMove, { passive: false });
    renderer.domElement.addEventListener('lostpointercapture', pointerEnd);
    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerEnd);
    window.addEventListener('blur', stopPointer);
    document.addEventListener('visibilitychange', visibilityChange);

    const scene = new THREE.Scene();
    // The camera views the front from negative z, so mirror the architecture to
    // keep board +x moving toward screen-right for keyboard and touch controls.
    scene.scale.x = -1;
    const camera = new THREE.OrthographicCamera(-6.2, 6.2, 6.2, -6.2, 0.1, 100);
    camera.position.set(-8, 10, -11);
    camera.lookAt(0, 1, 0);

    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const textures: THREE.Texture[] = [];
    const mat = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.push(material);
      return material;
    };
    const palette = {
      cream: mat('#fffdf7'), ivory: mat('#fffdf7'), red: mat('#e55549'), orange: mat('#f48b78'),
      dark: mat('#171714'), black: mat('#171714'), wood: mat('#c89b65'), woodLight: mat('#f3d6a1'),
      gold: mat('#f8ce58', 0.5, 0.15), sage: mat('#97ddd4'), nori: mat('#285b45'),
      salmon: mat('#f79678'), flesh: mat('#f3bf93'), metal: mat('#a2b1a3', 0.42, 0.45),
      blue: mat('#97ddd4'), plum: mat('#bca6cf'),
    };

    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = scene) => {
      geometries.push(geometry);
      const object = new THREE.Mesh(geometry, material);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    const box = (w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => {
      const object = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
      object.position.set(x, y, z);
      return object;
    };
    const cylinder = (top: number, bottom: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene, segments = 20) => {
      const object = mesh(new THREE.CylinderGeometry(top, bottom, h, segments), material, parent);
      object.position.set(x, y, z);
      return object;
    };
    const sphere = (radius: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene, segments = 14) => {
      const object = mesh(new THREE.SphereGeometry(radius, segments, 10), material, parent);
      object.position.set(x, y, z);
      return object;
    };
    const line = (points: THREE.Vector3[], material: THREE.Material, radius = 0.016, parent: THREE.Object3D = scene) => {
      const curve = new THREE.CatmullRomCurve3(points);
      return mesh(new THREE.TubeGeometry(curve, 24, radius, 5, false), material, parent);
    };
    const canvasTexture = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      draw(ctx);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      return texture;
    };
    const sign = (texture: THREE.Texture, w: number, h: number, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
      materials.push(material);
      const object = mesh(new THREE.PlaneGeometry(w, h), material, parent);
      object.position.set(x, y, z);
      object.castShadow = false;
      object.receiveShadow = false;
      return object;
    };

    scene.add(new THREE.AmbientLight('#fff5dc', 1.25));
    const hemisphere = new THREE.HemisphereLight('#fff4d9', '#b5b492', 2.4);
    scene.add(hemisphere);
    const sunlight = new THREE.DirectionalLight('#fff0ca', 4.2);
    sunlight.position.set(-5, 10, -6);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -7;
    sunlight.shadow.camera.right = 7;
    sunlight.shadow.camera.top = 7;
    sunlight.shadow.camera.bottom = -7;
    sunlight.shadow.normalBias = 0.035;
    sunlight.shadow.bias = -0.0002;
    scene.add(sunlight);
    const fillLight = new THREE.DirectionalLight('#f8b17c', 1.4);
    fillLight.position.set(6, 4, 4);
    scene.add(fillLight);

    // A floating architectural model in the website's yellow, mint and paper.
    box(7.65, 0.32, 7.65, palette.gold, 0, -0.29, -0.02);
    box(7.8, 0.12, 7.8, palette.dark, 0, -0.5, -0.02);
    box(7.5, 0.14, 7.5, palette.cream, 0, -0.07, -0.02);
    box(7.52, 0.035, 0.07, palette.gold, 0, -0.26, -3.86);
    const borderTile = mat('#e3ebdd');
    for (let gx = -3; gx <= 3; gx += 1) {
      for (let gz = -3; gz <= 3; gz += 1) {
        box(1.025, 0.045, 1.025, (gx + gz) % 2 === 0 ? palette.ivory : borderTile, gx * TILE, 0.02, gz * TILE);
      }
    }

    // The playable five-by-five board stays clear of the kitchen furniture.
    const tileCream = mat('#fff7df');
    const tileSage = mat('#d4eee4');
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const station = STATIONS.find((item) => item.x === x && item.y === y);
        const isServingBar = x === SERVING_BAR.x && y === SERVING_BAR.y;
        const material = station ? mat(station.color) : isServingBar ? mat('#f3ad9e') : (x + y) % 2 === 0 ? tileCream : tileSage;
        box(0.99, 0.055, 0.99, material, world(x), 0.068, world(y));
        // Subtle inset markings make hopping lanes immediately visible.
        if (!station && !isServingBar) {
          const dot = cylinder(0.034, 0.034, 0.004, borderTile, world(x), 0.098, world(y), scene, 8);
          dot.castShadow = false;
        }
      }
    }

    // Rear wall, sign and wave motif.
    box(7.65, 2.8, 0.17, palette.dark, 0, 1.35, 3.68);
    box(7.75, 0.12, 0.23, palette.wood, 0, 2.8, 3.67);
    box(7.65, 0.2, 0.07, palette.gold, 0, 0.14, 3.56);
    box(0.14, 2.8, 2.1, palette.dark, -3.77, 1.35, 2.72);
    for (let row = 0; row < 4; row += 1) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < 50; i += 1) {
        const x = -3.7 + (i / 49) * 7.4;
        points.push(new THREE.Vector3(x, 0.55 + row * 0.13 + Math.sin(x * 2.2 + row * 0.4) * 0.16, 3.575));
      }
      line(points, row === 0 ? palette.gold : palette.sage, 0.015);
    }
    box(3.6, 1.5, 0.06, palette.cream, -0.1, 1.93, 3.54);
    const logoTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}sushi-rush-logo.svg`);
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(logoTexture);
    const logo = sign(logoTexture, 3.1, 1.42, -0.1, 1.94, 3.50);
    logo.rotation.y = Math.PI;
    logo.scale.x = -1;

    // Brass rails and a wall shelf with pastel containers.
    box(1.1, 0.08, 0.4, palette.woodLight, -2.92, 1.8, 3.35);
    for (let i = 0; i < 3; i += 1) {
      cylinder(0.11, 0.12, 0.31, i === 1 ? palette.red : palette.cream, -3.24 + i * 0.32, 2.0, 3.32);
      cylinder(0.12, 0.12, 0.045, palette.wood, -3.24 + i * 0.32, 2.18, 3.32);
    }
    box(1.15, 0.055, 0.38, palette.woodLight, 2.8, 1.81, 3.35);
    for (let i = 0; i < 3; i += 1) {
      cylinder(0.085, 0.075, 0.37, i === 1 ? palette.red : palette.gold, 2.45 + i * 0.35, 2.02, 3.32);
      cylinder(0.035, 0.035, 0.07, palette.dark, 2.45 + i * 0.35, 2.24, 3.32);
    }

    const counter = (x: number, z: number, w: number, d: number, color = palette.sage) => {
      const group = new THREE.Group(); scene.add(group); group.position.set(x, 0, z);
      box(w, 0.73, d, color, 0, 0.4, 0, group);
      box(w + 0.1, 0.12, d + 0.1, palette.woodLight, 0, 0.83, 0, group);
      box(w + 0.12, 0.04, d + 0.12, palette.cream, 0, 0.91, 0, group);
      box(w - 0.08, 0.06, d + 0.03, palette.dark, 0, 0.09, 0, group);
      return group;
    };
    // Furniture is outside the movement grid; each colored tile remains reachable.
    counter(-3.11, 1.14, 0.8, 3.8);
    counter(3.11, 1.14, 0.8, 3.8);
    counter(0, 3.11, 5.65, 0.8, palette.gold);
    // Cabinet panel details.
    for (const side of [-1, 1]) {
      for (let z = -0.1; z <= 2.8; z += 0.95) {
        box(0.025, 0.56, 0.82, palette.cream, side * 2.7, 0.44, z);
        box(0.035, 0.025, 0.19, palette.gold, side * 2.67, 0.61, z);
      }
    }

    const bowl = (x: number, y: number, z: number, radius = 0.2, material = palette.cream, parent: THREE.Object3D = scene) => {
      cylinder(radius, radius * 0.65, radius * 0.65, material, x, y, z, parent);
      cylinder(radius * 0.87, radius * 0.87, 0.012, palette.dark, x, y + radius * 0.34, z, parent);
      const rim = mesh(new THREE.TorusGeometry(radius * 0.94, 0.018, 6, 24), material, parent);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, y + radius * 0.35, z);
      return rim;
    };
    const sushi = (x: number, y: number, z: number, rotation = 0, parent: THREE.Object3D = scene) => {
      const roll = new THREE.Group(); parent.add(roll); roll.position.set(x, y, z); roll.rotation.y = rotation;
      cylinder(0.105, 0.105, 0.14, palette.nori, 0, 0.07, 0, roll, 14);
      cylinder(0.083, 0.083, 0.012, palette.ivory, 0, 0.145, 0, roll, 14);
      box(0.07, 0.016, 0.06, palette.salmon, -0.018, 0.156, 0, roll);
      box(0.025, 0.018, 0.046, palette.sage, 0.033, 0.157, 0.025, roll);
      return roll;
    };

    // Rice station: wooden hangiri, visible rice and paddle.
    cylinder(0.38, 0.34, 0.25, palette.wood, -3.12, 1.04, 1.11);
    cylinder(0.33, 0.33, 0.025, palette.ivory, -3.12, 1.18, 1.11);
    const hangiriRim = mesh(new THREE.TorusGeometry(0.355, 0.025, 6, 24), palette.gold);
    hangiriRim.rotation.x = Math.PI / 2; hangiriRim.position.set(-3.12, 1.18, 1.11);
    for (let i = 0; i < 9; i += 1) {
      sphere(0.043, palette.ivory, -3.3 + (i % 3) * 0.16, 1.21, 0.94 + Math.floor(i / 3) * 0.16);
    }
    const paddle = box(0.1, 0.035, 0.43, palette.woodLight, -2.94, 1.28, 1.13);
    paddle.rotation.z = -0.28; paddle.rotation.y = -0.5;

    // Broth station: pot, knobs and softly floating steam.
    box(0.68, 0.08, 0.65, palette.dark, -3.1, 0.98, -1.02);
    cylinder(0.255, 0.24, 0.3, palette.metal, -3.1, 1.16, -1.02);
    cylinder(0.225, 0.225, 0.016, palette.gold, -3.1, 1.32, -1.02);
    for (const offset of [-1, 1]) box(0.13, 0.055, 0.09, palette.dark, -3.1 + offset * 0.29, 1.22, -1.02);
    const steamMaterial = new THREE.MeshBasicMaterial({ color: '#fff5df', transparent: true, opacity: 0.38, depthWrite: false });
    materials.push(steamMaterial);
    const steams = [-0.13, 0.03, 0.17].map((offset, index) => {
      const steam = line([
        new THREE.Vector3(-3.1 + offset, 1.41, -1.02),
        new THREE.Vector3(-3.1 + offset + 0.055, 1.59, -1.02),
        new THREE.Vector3(-3.1 + offset - 0.025, 1.78 + index * 0.05, -1.02),
      ], steamMaterial, 0.018);
      return steam;
    });

    // Fresh filling station with bamboo preparation mat and ingredients.
    box(1.06, 0.035, 0.55, palette.wood, 0, 0.98, 3.11);
    for (let i = 0; i < 14; i += 1) {
      box(0.043, 0.023, 0.49, palette.woodLight, -0.46 + i * 0.072, 1.01, 3.11);
    }
    box(0.53, 0.015, 0.34, palette.nori, 0, 1.03, 3.1);
    box(0.4, 0.025, 0.25, palette.ivory, 0, 1.049, 3.1);
    box(0.3, 0.025, 0.055, palette.salmon, 0, 1.073, 3.05);
    box(0.3, 0.03, 0.035, palette.sage, 0, 1.076, 3.13);
    bowl(-1.02, 1.02, 3.1, 0.21, palette.cream);
    cylinder(0.16, 0.16, 0.02, palette.sage, -1.02, 1.1, 3.1);
    bowl(0.96, 1.02, 3.1, 0.2, palette.blue);

    // Topping station: rolls and sauce bottles, with neat wooden trays.
    box(0.64, 0.035, 0.8, palette.wood, 3.1, 0.98, 1.09);
    for (let i = 0; i < 4; i += 1) sushi(2.95 + (i % 2) * 0.28, 1.0, 0.89 + Math.floor(i / 2) * 0.32);
    for (let i = 0; i < 2; i += 1) {
      cylinder(0.08, 0.075, 0.3, i === 0 ? palette.gold : palette.red, 3.15 + i * 0.25, 1.1, 2.0);
      cylinder(0.025, 0.035, 0.09, palette.cream, 3.15 + i * 0.25, 1.3, 2.0);
    }
    // Protein station: salmon slices, a knife and nori.
    box(0.68, 0.045, 0.68, palette.woodLight, 3.11, 0.98, -1.04);
    for (let i = 0; i < 4; i += 1) {
      const salmon = box(0.42, 0.055, 0.105, palette.salmon, 3.1, 1.04, -1.24 + i * 0.13);
      salmon.rotation.y = -0.18;
      const stripe = box(0.31, 0.008, 0.012, palette.cream, 3.1, 1.072, -1.24 + i * 0.13);
      stripe.rotation.y = -0.18;
    }
    box(0.06, 0.025, 0.3, palette.metal, 3.36, 1.03, -1.15);
    box(0.065, 0.04, 0.15, palette.dark, 3.36, 1.04, -0.91);

    // Counter-mounted plaques stay outside the playable floor in this camera.
    // Keep the target rings clear, including the near-side counter labels.
    const stationHighlights: { id: string; ring: THREE.Mesh; lamp: THREE.Mesh; lampBaseY: number; label: THREE.Sprite }[] = [];
    STATIONS.forEach((station) => {
      const texture = canvasTexture(512, 144, (ctx) => {
        ctx.fillStyle = '#171714';
        ctx.beginPath(); ctx.roundRect(4, 4, 504, 136, 24); ctx.fill();
        ctx.fillStyle = station.color; ctx.fillRect(20, 24, 8, 96);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fffdf7'; ctx.font = '800 100px Poppins, Arial, sans-serif';
        ctx.fillText(station.label, 270, 78);
      });
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
      materials.push(material);
      const label = new THREE.Sprite(material);
      label.position.set(station.plaque.x, station.plaque.y, station.plaque.z);
      label.scale.set(1, 0.28, 1);
      label.renderOrder = 8;
      scene.add(label);
      const ringMaterial = new THREE.MeshBasicMaterial({ color: '#f6ce59', transparent: true, opacity: 0.9, depthWrite: false });
      materials.push(ringMaterial);
      const ring = mesh(new THREE.RingGeometry(0.37, 0.46, 24), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(world(station.x), 0.112, world(station.y));
      ring.visible = false;
      const lampBaseY = station.plaque.y + 0.2;
      const lamp = sphere(0.055, palette.gold, station.plaque.x, lampBaseY, station.plaque.z);
      lamp.visible = false;
      stationHighlights.push({ id: station.id, ring, lamp, lampBaseY, label });
    });

    // The serving bar is a destination of its own, never an ingredient station.
    const barTexture = canvasTexture(512, 144, (ctx) => {
      ctx.fillStyle = SERVING_BAR.color;
      ctx.beginPath(); ctx.roundRect(4, 4, 504, 136, 24); ctx.fill();
      ctx.fillStyle = '#f8ce58'; ctx.fillRect(20, 24, 8, 96);
      ctx.fillStyle = '#fffdf7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 76px Poppins, Arial, sans-serif'; ctx.fillText('BAR SAJI', 267, 78);
    });
    const barLabelMaterial = new THREE.SpriteMaterial({ map: barTexture, depthTest: false, transparent: true });
    materials.push(barLabelMaterial);
    const barLabel = new THREE.Sprite(barLabelMaterial);
    // The front apron projects below the delivery tile; the counter top would
    // project back over its circle, particularly on a narrow mobile viewport.
    barLabel.position.set(world(SERVING_BAR.x), 0.32, -3.8);
    barLabel.renderOrder = 9;
    scene.add(barLabel);
    const barRingMaterial = new THREE.MeshBasicMaterial({ color: SERVING_BAR.color, transparent: true, opacity: 0.95, depthWrite: false });
    const barInnerMaterial = new THREE.MeshBasicMaterial({ color: '#f8ce58', transparent: true, opacity: 0.95, depthWrite: false });
    materials.push(barRingMaterial, barInnerMaterial);
    const barRing = mesh(new THREE.RingGeometry(0.4, 0.49, 32), barRingMaterial);
    const barInnerRing = mesh(new THREE.RingGeometry(0.28, 0.35, 32), barInnerMaterial);
    for (const ring of [barRing, barInnerRing]) {
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(world(SERVING_BAR.x), 0.123, world(SERVING_BAR.y));
      ring.castShadow = false; ring.receiveShadow = false; ring.visible = false;
    }

    // Floor arrows follow reachable lane steps: down to the front row, then
    // across to the bar. No diagonal shortcut or movement is implied.
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-0.085, -0.22); arrowShape.lineTo(0.085, -0.22);
    arrowShape.lineTo(0.085, -0.015); arrowShape.lineTo(0.23, -0.015);
    arrowShape.lineTo(0, 0.27); arrowShape.lineTo(-0.23, -0.015);
    arrowShape.lineTo(-0.085, -0.015); arrowShape.closePath();
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    arrowGeometry.rotateX(-Math.PI / 2);
    const pathArrows: THREE.Group[] = [];
    const pathMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i += 1) {
      const arrow = new THREE.Group(); scene.add(arrow); arrow.visible = false;
      const outline = mesh(arrowGeometry.clone(), barRingMaterial, arrow);
      outline.scale.set(1.28, 1, 1.28); outline.position.y = 0.129;
      const fill = mesh(arrowGeometry.clone(), barInnerMaterial, arrow);
      fill.position.y = 0.135;
      for (const part of [outline, fill]) { part.castShadow = false; part.receiveShadow = false; }
      pathMeshes.push(outline, fill); pathArrows.push(arrow);
    }
    arrowGeometry.dispose();

    // Front serving counter, textured apron panel, trays and ramen.
    counter(0, -3.22, 5.8, 0.63);
    box(5.68, 0.46, 0.025, palette.dark, 0, 0.43, -3.55);
    for (let i = 0; i < 7; i += 1) {
      const points = [];
      for (let j = 0; j < 24; j += 1) {
        const x = -2.75 + (j / 23) * 5.5;
        points.push(new THREE.Vector3(x, 0.32 + i * 0.043 + Math.sin(x * 2.3 + i * 0.3) * 0.052, -3.572));
      }
      line(points, i % 3 === 0 ? palette.gold : palette.sage, 0.007);
    }
    const frontTexture = canvasTexture(512, 144, (ctx) => {
      ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, 512, 144);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e55549'; ctx.font = '800 60px Poppins, Arial, sans-serif';
      ctx.fillText('BAR SAJI', 256, 94);
    });
    const frontSign = sign(frontTexture, 1.65, 0.46, 0, 0.45, -3.59);
    frontSign.rotation.y = Math.PI;
    frontSign.scale.x = -1;
    box(0.92, 0.055, 0.44, palette.dark, -1.38, 0.99, -3.23);
    for (let i = 0; i < 4; i += 1) sushi(-1.69 + i * 0.21, 1.02, -3.23);
    bowl(1.1, 1.03, -3.23, 0.27, palette.red);
    cylinder(0.21, 0.21, 0.014, palette.gold, 1.1, 1.13, -3.23);
    const egg = sphere(0.09, palette.ivory, 1.15, 1.14, -3.26);
    egg.scale.set(1, 0.4, 1.2);
    cylinder(0.043, 0.043, 0.012, palette.gold, 1.15, 1.18, -3.26);
    for (let i = 0; i < 3; i += 1) box(0.055, 0.015, 0.035, palette.nori, 0.98 + i * 0.055, 1.15, -3.14);
    for (let i = 0; i < 2; i += 1) {
      const chopstick = box(0.024, 0.024, 0.53, palette.woodLight, 1.55 + i * 0.09, 1.01, -3.24);
      chopstick.rotation.y = -0.2;
    }

    // Red stools add life to the front corners without hiding the board.
    for (const x of [-2.3, 2.3]) {
      cylinder(0.28, 0.28, 0.12, palette.red, x, 0.53, -3.88);
      cylinder(0.045, 0.05, 0.42, palette.dark, x, 0.27, -3.88);
      cylinder(0.23, 0.25, 0.055, palette.dark, x, 0.06, -3.88);
    }

    // A little plant softens the counter corner.
    cylinder(0.17, 0.12, 0.27, palette.cream, -3.1, 1.1, 2.55);
    for (let i = 0; i < 6; i += 1) {
      const leaf = sphere(0.12, palette.nori, -3.1 + Math.sin(i * 2) * 0.13, 1.42 + (i % 2) * 0.1, 2.55 + Math.cos(i * 2) * 0.1);
      leaf.scale.set(0.4, 1.9, 0.6);
      leaf.rotation.z = Math.sin(i * 2) * 0.8;
    }

    // Pendant lamps: a low-poly ceiling silhouette with a warm brass interior.
    for (const x of [-2.8, 0, 2.8]) {
      cylinder(0.018, 0.018, 0.6, palette.dark, x, 3.58, 2.55, scene, 8);
      cylinder(0.065, 0.34, 0.26, palette.red, x, 3.16, 2.55, scene, 16);
      cylinder(0.29, 0.29, 0.015, palette.gold, x, 3.027, 2.55);
      sphere(0.07, palette.ivory, x, 3.01, 2.55);
    }

    // Batch the static architecture by material so mobile GPUs draw a few dozen
    // surfaces instead of issuing a separate draw call for every kitchen detail.
    const movingMeshes = new Set<THREE.Object3D>([
      ...steams,
      ...stationHighlights.flatMap((station) => [station.ring, station.lamp]),
      barRing, barInnerRing, ...pathMeshes,
    ]);
    const staticBatches = new Map<THREE.Material, THREE.Mesh[]>();
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || movingMeshes.has(object) || Array.isArray(object.material) || object.material.transparent) return;
      const batch = staticBatches.get(object.material) || [];
      batch.push(object);
      staticBatches.set(object.material, batch);
    });
    staticBatches.forEach((objects, material) => {
      const inverseScene = scene.matrixWorld.clone().invert();
      const parts = objects.map((object) => object.geometry.clone().applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverseScene, object.matrixWorld),
      ));
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!geometry) return;
      objects.forEach((object) => object.removeFromParent());
      mesh(geometry, material);
    });

    // Friendly chef, made from a small collection of geometric shapes.
    const chef = new THREE.Group(); scene.add(chef);
    chef.position.set(world(latest.current.position.x), 0.1, world(latest.current.position.y));
    const chefBody = new THREE.Group(); chef.add(chefBody);
    box(0.24, 0.33, 0.22, palette.dark, -0.15, 0.26, 0.02, chefBody);
    box(0.24, 0.33, 0.22, palette.dark, 0.15, 0.26, 0.02, chefBody);
    box(0.27, 0.13, 0.37, palette.black, -0.15, 0.12, -0.045, chefBody);
    box(0.27, 0.13, 0.37, palette.black, 0.15, 0.12, -0.045, chefBody);
    const jacket = cylinder(0.23, 0.29, 0.49, palette.ivory, 0, 0.67, 0, chefBody, 10);
    jacket.scale.z = 0.85;
    box(0.39, 0.39, 0.06, palette.red, 0, 0.58, -0.22, chefBody);
    box(0.04, 0.4, 0.045, palette.red, -0.14, 0.76, -0.213, chefBody);
    box(0.04, 0.4, 0.045, palette.red, 0.14, 0.76, -0.213, chefBody);
    box(0.17, 0.09, 0.035, palette.orange, 0, 0.56, -0.259, chefBody);
    cylinder(0.09, 0.1, 0.15, palette.flesh, 0, 0.98, 0, chefBody);
    const head = sphere(0.25, palette.flesh, 0, 1.18, -0.01, chefBody, 20);
    head.scale.set(1, 1.05, 0.93);
    const hair = sphere(0.254, palette.dark, 0, 1.28, 0.026, chefBody, 16);
    hair.scale.set(1, 0.6, 0.88);
    sphere(0.056, palette.flesh, -0.24, 1.17, -0.005, chefBody);
    sphere(0.056, palette.flesh, 0.24, 1.17, -0.005, chefBody);
    for (const side of [-1, 1]) {
      sphere(0.025, palette.dark, side * 0.086, 1.205, -0.228, chefBody, 10);
      const brow = box(0.055, 0.012, 0.014, palette.dark, side * 0.086, 1.266, -0.219, chefBody);
      brow.rotation.z = side * 0.12;
    }
    sphere(0.043, palette.flesh, 0, 1.16, -0.25, chefBody);
    const smile = line([
      new THREE.Vector3(-0.048, 1.1, -0.231), new THREE.Vector3(0, 1.087, -0.245), new THREE.Vector3(0.048, 1.1, -0.231),
    ], palette.dark, 0.009, chefBody);
    smile.castShadow = false;
    const neckerchief = mesh(new THREE.ConeGeometry(0.11, 0.17, 3), palette.red, chefBody);
    neckerchief.position.set(0, 0.92, -0.19); neckerchief.rotation.z = Math.PI;
    const hatBand = cylinder(0.243, 0.244, 0.16, palette.ivory, 0, 1.44, 0.015, chefBody);
    hatBand.scale.z = 0.9;
    for (const [x, y, z, r] of [[0, 1.6, 0.015, 0.26], [-0.18, 1.6, 0.01, 0.19], [0.18, 1.6, 0.01, 0.19], [0, 1.66, 0.13, 0.19]]) {
      sphere(r, palette.ivory, x, y, z, chefBody, 16);
    }
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); chefBody.add(arm); arm.position.set(side * 0.28, 0.83, 0);
      const sleeve = cylinder(0.115, 0.095, 0.29, palette.ivory, side * 0.045, -0.12, 0, arm, 10);
      sleeve.rotation.z = side * 0.25;
      sphere(0.095, palette.flesh, side * 0.084, -0.29, -0.015, arm);
      arm.rotation.x = -0.18;
      arms.push(arm);
    }
    const playerRing = mesh(new THREE.RingGeometry(0.32, 0.38, 32), palette.gold);
    playerRing.rotation.x = -Math.PI / 2;
    playerRing.position.set(chef.position.x, 0.115, chef.position.z);

    // Warm paper flecks animate only when an order is served.
    const confettiColors = [palette.gold, palette.red, palette.sage, palette.cream];
    const confetti: { object: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
    for (let i = 0; i < 22; i += 1) {
      const object = box(0.07, 0.12, 0.012, confettiColors[i % 4]);
      object.visible = false; object.castShadow = false;
      confetti.push({ object, velocity: new THREE.Vector3(), life: 0 });
    }

    let frame = 0;
    let previousTime = 0;
    let movement = 0;
    let stridePhase = 0;
    let facing = 0;
    let observedCelebration = latest.current.celebration;
    let firstFrame = true;
    let disposed = false;
    let stationLabelWidth = 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resize = () => {
      if (disposed) return;
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      // Keep the complete board visible on both the portrait game and wide hero.
      const vertical = Math.max(9.7, 11.2 / aspect);
      stationLabelWidth = Math.max(1, (52 * vertical * aspect) / width);
      camera.left = (-vertical * aspect) / 2;
      camera.right = (vertical * aspect) / 2;
      camera.top = vertical / 2;
      camera.bottom = -vertical / 2;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const animate = (milliseconds: number) => {
      if (disposed) return;
      const time = milliseconds / 1000;
      const delta = Math.min(Math.max(previousTime ? time - previousTime : 1 / 60, 0), 0.1);
      previousTime = time;
      emitHop(milliseconds);
      const current = latest.current;
      const targetX = world(Math.max(0, Math.min(4, current.position.x)));
      const targetZ = world(Math.max(0, Math.min(4, current.position.y)));
      const dx = targetX - chef.position.x;
      const dz = targetZ - chef.position.z;
      const distance = Math.hypot(dx, dz);
      const positionAlpha = dampingAlpha(delta, 24);
      const previousX = chef.position.x;
      const previousZ = chef.position.z;
      if (distance > 0.004) {
        facing = Math.atan2(-dx, -dz);
        chef.position.x += dx * positionAlpha;
        chef.position.z += dz * positionAlpha;
      } else {
        chef.position.x = targetX;
        chef.position.z = targetZ;
      }
      movement += ((distance > 0.02 ? 1 : 0) - movement) * dampingAlpha(delta, 18);
      stridePhase += Math.hypot(chef.position.x - previousX, chef.position.z - previousZ) * Math.PI / TILE;
      const angleDelta = Math.atan2(Math.sin(facing - chef.rotation.y), Math.cos(facing - chef.rotation.y));
      chef.rotation.y += angleDelta * dampingAlpha(delta, 22);
      chef.position.y = 0.1 + (reducedMotion ? 0 : Math.sin(stridePhase) ** 2 * 0.045 * movement);
      chefBody.rotation.z = reducedMotion ? 0 : Math.sin(stridePhase * 2) * 0.025 * movement;
      chefBody.rotation.x = reducedMotion ? 0 : Math.sin(time * 2.3) * 0.012 * (1 - movement);
      arms.forEach((arm, i) => { arm.rotation.x = -0.18 + (reducedMotion ? 0 : Math.sin(stridePhase * 2 + i * Math.PI) * 0.22 * movement); });
      playerRing.position.x = chef.position.x;
      playerRing.position.z = chef.position.z;
      const ringScale = 1 + (reducedMotion ? 0 : Math.sin(time * 3) * 0.04);
      playerRing.scale.setScalar(ringScale);

      stationHighlights.forEach((station) => {
        const selected = current.activeStation === station.id && current.playing;
        station.ring.visible = selected;
        station.lamp.visible = selected;
        station.label.scale.set(stationLabelWidth, stationLabelWidth * (144 / 512), 1);
        if (selected) {
          const scale = reducedMotion ? 1 : 1 + Math.sin(time * 5) * 0.06;
          station.ring.scale.setScalar(scale);
          station.lamp.position.y = station.lampBaseY + (reducedMotion ? 0 : Math.sin(time * 5) * 0.025);
        }
      });

      const delivering = current.playing && current.readyToServe;
      barRing.visible = delivering;
      barInnerRing.visible = delivering;
      const barLabelWidth = Math.max(1.1, stationLabelWidth * 1.05);
      barLabel.scale.set(barLabelWidth, barLabelWidth * (144 / 512), 1);
      const barPulse = reducedMotion ? 1 : 1 + Math.sin(time * 5) * 0.045;
      barRing.scale.setScalar(barPulse);
      barInnerRing.scale.setScalar(2 - barPulse);
      pathArrows.forEach((arrow) => { arrow.visible = false; });
      if (delivering) {
        let x = Math.max(0, Math.min(4, Math.round(current.position.x)));
        let y = Math.max(0, Math.min(4, Math.round(current.position.y)));
        let arrowIndex = 0;
        const placeArrow = (fromX: number, fromY: number, toX: number, toY: number) => {
          const arrow = pathArrows[arrowIndex++];
          if (!arrow) return;
          arrow.visible = true;
          arrow.position.set((world(fromX) + world(toX)) / 2, 0, (world(fromY) + world(toY)) / 2);
          arrow.rotation.y = toY < fromY ? 0 : toX > fromX ? -Math.PI / 2 : Math.PI / 2;
        };
        while (y > SERVING_BAR.y) { placeArrow(x, y, x, y - 1); y -= 1; }
        while (x !== SERVING_BAR.x) {
          const nextX = x + Math.sign(SERVING_BAR.x - x);
          placeArrow(x, y, nextX, y); x = nextX;
        }
      }
      steams.forEach((steam, i) => {
        steam.position.y = reducedMotion ? 0 : Math.sin(time * 1.8 + i) * 0.04;
        steam.scale.x = reducedMotion ? 1 : 1 + Math.sin(time * 1.5 + i) * 0.02;
      });

      if (current.celebration !== observedCelebration) {
        observedCelebration = current.celebration;
        confetti.forEach((piece, index) => {
          const angle = (index / confetti.length) * Math.PI * 2;
          piece.object.position.set(chef.position.x, 1.4, chef.position.z);
          piece.object.visible = true;
          piece.velocity.set(Math.sin(angle) * (0.9 + (index % 3) * 0.3), 2 + (index % 4) * 0.3, Math.cos(angle) * (0.9 + (index % 3) * 0.3));
          piece.life = 1.2;
        });
      }
      confetti.forEach((piece) => {
        if (piece.life <= 0) return;
        piece.life -= delta;
        piece.velocity.y -= delta * 4.5;
        piece.object.position.addScaledVector(piece.velocity, delta);
        piece.object.rotation.x += delta * 4;
        piece.object.rotation.z += delta * 3;
        if (piece.life <= 0) piece.object.visible = false;
      });

      renderer.render(scene, camera);
      if (firstFrame) { firstFrame = false; latest.current.onReady?.(); }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopPointer();
      disposed = true;
      window.cancelAnimationFrame(frame);
      setUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    return () => {
      stopPointer();
      stopDrag.current = () => {};
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('lostpointercapture', pointerEnd);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      window.removeEventListener('blur', stopPointer);
      document.removeEventListener('visibilitychange', visibilityChange);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      sunlight.shadow.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={host} className={`kitchen-scene ${className}`} style={{ width: '100%', height: '100%', position: 'relative', touchAction: playing && controlsEnabled && !unavailable ? 'none' : 'pan-y', cursor: playing && controlsEnabled && !unavailable ? 'grab' : 'default', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div ref={joystick} className="drag-joystick" aria-hidden="true" style={{ position: 'absolute', zIndex: 4, width: 78, height: 78, marginLeft: -39, marginTop: -39, opacity: 0, pointerEvents: 'none', border: '2px solid #17171455', borderRadius: '50%', background: '#fffdf75c', boxShadow: '0 0 0 6px #fffdf729', display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'absolute', inset: 13, border: '1px dashed #17171466', borderRadius: '50%' }}/>
        <div ref={joystickThumb} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f8ce58', border: '2px solid #171714', boxShadow: '0 2px 6px #17171425', willChange: 'transform' }}/>
      </div>
      {unavailable && <CpuKitchen position={position} playing={playing} activeStation={activeStation} readyToServe={readyToServe} controlsEnabled={controlsEnabled} onDirection={onDirection} onReady={onReady} onDragStateChange={onDragStateChange} />}
    </div>
  );
}
