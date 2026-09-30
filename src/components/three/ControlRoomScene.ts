import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FLOORS, ZONES, zoneKey, type Floor, type Zone, type ZoneKey } from "@/shared/fleet";
import { CRITICAL, zoneStatus, type StatusCode } from "@/shared/status";
import type { TelemetryStore } from "@/lib/telemetry-store";

// Imperative three.js scene: 4 halls (floors) x 6 zones x 3 racks, one LED per device. All
// 10,000 LEDs are ONE InstancedMesh; a tick only rewrites the colours of LEDs whose state
// changed. React never re-renders for scene updates.

export type Pick = { kind: "device"; idx: number } | { kind: "zone"; zone: Zone; floor: Floor } | null;

const HALL_GAP = 3.4;
const ZONE_GAP = 3.6;
const LED_COLS = 7;

const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

export class ControlRoomScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly world = new THREE.Group();
  private readonly leds: THREE.InstancedMesh;
  private readonly marker: THREE.Mesh;
  private readonly strips = new Map<ZoneKey, THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>>();
  private readonly glows = new Map<ZoneKey, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  private readonly hitTargets: THREE.Object3D[] = [];
  private readonly positions: Float32Array;
  private readonly colorKey: Uint8Array;
  private readonly dummy = new THREE.Object3D();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly home = { cam: new THREE.Vector3(3, 8, 12.5), target: new THREE.Vector3(0, 1, 0) };
  private readonly sweep: THREE.Mesh;
  private palette: THREE.Color[] = [];
  private dimmed: THREE.Color[] = [];
  private pulsing = new Set<number>();
  private focusTarget: THREE.Vector3 | null = null;
  private frame = 0;
  private disposed = false;
  private hoverZone: ZoneKey | null = null;
  private selectedZone: ZoneKey | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: TelemetryStore,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.prepend(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.enableZoom = false; // ctrl + wheel below, so page scroll still works
    this.controls.minDistance = 4;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      this.focusTarget = null;
    });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.5, 0.3);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.scene.add(this.world);
    const n = store.devices.length;
    this.positions = new Float32Array(n * 3);
    this.colorKey = new Uint8Array(n).fill(255);
    this.buildRoom();
    this.sweep = this.buildSweep();

    this.leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.06, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    this.leds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      this.placeLed(i, 1);
      this.leds.setColorAt(i, new THREE.Color(0));
    }
    this.world.add(this.leds);

    this.marker = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 40), new THREE.MeshBasicMaterial({ toneMapped: false }));
    const beam = new THREE.CylinderGeometry(0.01, 0.01, 3, 6);
    beam.translate(0, 1.5, 0);
    this.marker.add(new THREE.Mesh(beam, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 })));
    this.marker.visible = false;
    this.world.add(this.marker);

    this.applyTheme();
    this.resetView();
    this.renderer.domElement.addEventListener("wheel", this.onWheel, { passive: false });
    this.frame = requestAnimationFrame(this.loop);
  }

  /* ---------------- public API ---------------- */

  resize(w: number, h: number): void {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.zoom = Math.min(1, this.camera.aspect / 1.5);
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
  }

  /** Recolour LEDs from the store; `matches` dims devices outside the current filter. */
  update(matches: ((i: number) => boolean) | null): void {
    const { store } = this;
    const n = store.devices.length;
    let dirty = false;
    const nextPulse = new Set<number>();
    for (let i = 0; i < n; i++) {
      const st = (store.status[i] ?? 0) as StatusCode;
      const on = !matches || matches(i);
      const key = st + (on ? 0 : 4);
      if (st === CRITICAL && on) nextPulse.add(i);
      if (this.colorKey[i] === key) continue;
      this.colorKey[i] = key;
      this.leds.setColorAt(i, on ? this.palette[st]! : this.dimmed[st]!);
      dirty = true;
    }
    if (dirty && this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
    for (const i of this.pulsing) if (!nextPulse.has(i)) this.placeLed(i, 1);
    this.pulsing = nextPulse;
    this.leds.instanceMatrix.needsUpdate = true;
    this.updateZones();
  }

  setSelectedZone(zone: Zone | null, floor: Floor | null): void {
    this.selectedZone = zone && floor ? zoneKey(zone, floor) : null;
    this.updateZones();
  }

  focus(idx: number | null): void {
    if (idx === null) {
      this.marker.visible = false;
      this.focusTarget = this.home.target.clone();
      return;
    }
    this.marker.position.set(this.positions[idx * 3]!, this.positions[idx * 3 + 1]!, this.positions[idx * 3 + 2]!);
    this.marker.visible = true;
    this.focusTarget = this.marker.position.clone();
    this.controls.autoRotate = false;
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  get autoRotate(): boolean {
    return this.controls.autoRotate;
  }

  resetView(): void {
    this.camera.position.copy(this.home.cam);
    this.focusTarget = this.home.target.clone();
    this.controls.autoRotate = true;
  }

  pick(clientX: number, clientY: number): Pick {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const led = this.raycaster.intersectObject(this.leds, false)[0];
    if (led?.instanceId !== undefined) return { kind: "device", idx: led.instanceId };
    const hit = this.raycaster.intersectObjects(this.hitTargets, false)[0];
    const zk = hit?.object.userData.zone as ZoneKey | undefined;
    if (!zk) return null;
    return { kind: "zone", zone: zk[0] as Zone, floor: Number(zk[1]) as Floor };
  }

  setHoverZone(zk: ZoneKey | null): void {
    if (this.hoverZone === zk) return;
    this.hoverZone = zk;
    this.updateZones();
  }

  /** Re-read colours from CSS variables after a dark/light switch. */
  applyTheme(): void {
    const light = document.documentElement.dataset.theme === "light";
    this.palette = [cssVar("--st-normal"), cssVar("--st-warning"), cssVar("--st-critical"), cssVar("--st-offline")].map((c, k) => {
      const col = new THREE.Color(c);
      return k === 0 && !light ? col.multiplyScalar(0.55) : col;
    });
    this.dimmed = this.palette.map((c) => c.clone().multiplyScalar(light ? 0.35 : 0.12));
    const bg = new THREE.Color(cssVar("--surface"));
    this.scene.background = bg;
    this.scene.fog = new THREE.FogExp2(bg, light ? 0.015 : 0.022);
    this.bloom.strength = light ? 0 : 0.5;
    (this.marker.material as THREE.MeshBasicMaterial).color.set(cssVar("--accent"));
    this.colorKey.fill(255);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.renderer.domElement.removeEventListener("wheel", this.onWheel);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ---------------- internals ---------------- */

  private buildRoom(): void {
    const accent = cssVar("--accent");
    const accent2 = cssVar("--accent-2");
    this.world.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(6, 12, 8);
    this.world.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x0d0c0a, metalness: 0.6, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    this.world.add(floor);
    const grid = new THREE.GridHelper(40, 66, accent, 0x3a3226);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    grid.position.y = 0.005;
    this.world.add(grid);

    const rackMat = new THREE.MeshStandardMaterial({ color: 0x1b1813, metalness: 0.8, roughness: 0.35 });
    const edgeMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.18 });
    const rackGeo = new THREE.BoxGeometry(0.95, 2.3, 1);
    const rackEdges = new THREE.EdgesGeometry(rackGeo);

    const byZone = new Map<ZoneKey, number[]>();
    for (const d of this.store.devices) {
      const k = zoneKey(d.zone, d.floor);
      const list = byZone.get(k) ?? [];
      list.push(d.idx);
      byZone.set(k, list);
    }

    FLOORS.forEach((f, fi) => {
      const z = (fi - 1.5) * HALL_GAP;
      const aisle = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.9), new THREE.MeshBasicMaterial({ color: accent2, transparent: true, opacity: 0.1 }));
      aisle.rotation.x = -Math.PI / 2;
      aisle.position.set(0, 0.01, z + 1.25);
      this.world.add(aisle);
      this.world.add(this.label(`HALL ${f}`, accent, -12.3, 1.2, z, 0.9));

      ZONES.forEach((zone, ci) => {
        const zk = zoneKey(zone, f);
        const zx = (ci - 2.5) * ZONE_GAP;
        const ids = byZone.get(zk) ?? [];
        const per = Math.ceil(ids.length / 3);

        const strip = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 1.05), new THREE.MeshBasicMaterial({ toneMapped: false }));
        strip.position.set(zx, 2.36, z);
        strip.userData.zone = zk;
        this.strips.set(zk, strip);
        this.hitTargets.push(strip);
        this.world.add(strip);

        const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(zx, 0.02, z + 0.2);
        this.glows.set(zk, glow);
        this.world.add(glow);
        this.world.add(this.label(zk, cssVar("--text-muted"), zx, 2.75, z, 0.55));

        for (let r = 0; r < 3; r++) {
          const rx = zx + (r - 1) * 1.02;
          const rack = new THREE.Mesh(rackGeo, rackMat);
          rack.position.set(rx, 1.15, z);
          rack.userData.zone = zk;
          this.hitTargets.push(rack);
          this.world.add(rack);
          const e = new THREE.LineSegments(rackEdges, edgeMat);
          e.position.copy(rack.position);
          this.world.add(e);
          ids.slice(r * per, (r + 1) * per).forEach((i, k) => {
            this.positions[i * 3] = rx - 0.36 + (k % LED_COLS) * 0.12;
            this.positions[i * 3 + 1] = 0.2 + Math.floor(k / LED_COLS) * 0.105;
            this.positions[i * 3 + 2] = z + 0.52;
          });
        }
      });
    });
  }

  private buildSweep(): THREE.Mesh {
    const sweep = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: cssVar("--accent"), transparent: true, opacity: 0.12, depthWrite: false }));
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.y = 0.02;
    this.world.add(sweep);
    return sweep;
  }

  private label(text: string, color: string, x: number, y: number, z: number, scale: number): THREE.Sprite {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      g.font = "600 34px monospace";
      g.fillStyle = color;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 128, 34);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    sprite.scale.set(2 * scale, 0.5 * scale, 1);
    sprite.position.set(x, y, z);
    return sprite;
  }

  private placeLed(i: number, scale: number): void {
    this.dummy.position.set(this.positions[i * 3]!, this.positions[i * 3 + 1]!, this.positions[i * 3 + 2]!);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.leds?.setMatrixAt(i, this.dummy.matrix);
  }

  private updateZones(): void {
    const s = this.store.summary;
    if (!s) return;
    for (const [zk, strip] of this.strips) {
      const st = zoneStatus(s.byZone[zk]);
      const on = this.selectedZone === zk || this.hoverZone === zk;
      strip.material.color.copy(this.palette[st] ?? new THREE.Color(0x888888));
      const glow = this.glows.get(zk);
      if (glow) {
        glow.material.color.copy(this.palette[st] ?? new THREE.Color(0x888888));
        glow.material.opacity = on ? 0.35 : st === 2 ? 0.28 : st === 1 ? 0.12 : 0;
      }
    }
  }

  private readonly onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const off = this.camera.position.clone().sub(this.controls.target);
    const d = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, off.length() * (e.deltaY > 0 ? 1.1 : 0.9)));
    this.camera.position.copy(this.controls.target).add(off.setLength(d));
  };

  private readonly loop = (t: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    if (this.focusTarget) {
      this.controls.target.lerp(this.focusTarget, 0.08);
      if (this.controls.target.distanceTo(this.focusTarget) < 0.01) this.focusTarget = null;
    }
    this.controls.update();
    this.sweep.position.x = Math.sin(t * 0.0004) * 11;
    if (this.pulsing.size) {
      const s = 1.4 + 0.9 * Math.abs(Math.sin(t * 0.004));
      for (const i of this.pulsing) this.placeLed(i, s);
      this.leds.instanceMatrix.needsUpdate = true;
    }
    if (this.marker.visible) {
      this.marker.lookAt(this.camera.position);
      this.marker.rotation.z = t * 0.003;
    }
    this.composer.render();
  };
}
