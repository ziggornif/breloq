<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import type { KeychainGeometry } from '../geometry/keychain';
  import type { KeychainParams } from '../params';
  import { buildMeshes, buildLaserMeshes } from '../mesh/keychain3d';
  import type { Mesh } from '../mesh/extrude';

  let { geometry, params }: { geometry: KeychainGeometry; params: KeychainParams } = $props();

  let host: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let group = new THREE.Group();
  let framedFor = '';
  let meshError = $state<string | null>(null);

  const TEXTURE_MM = 50; // 1 répétition de texture = 50 mm de bois

  let woodTexture: THREE.CanvasTexture | null = null;
  function getWoodTexture(): THREE.CanvasTexture {
    if (woodTexture) return woodTexture;
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#d9b27c';
    ctx.fillRect(0, 0, size, size);
    // veines horizontales, périodiques en x et y pour un raccord sans couture
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 90; i++) {
      const y0 = rnd() * size;
      const amp = 2 + rnd() * 8;
      const freq = 1 + Math.floor(rnd() * 3);
      const ph = rnd() * Math.PI * 2;
      const light = rnd() < 0.5;
      ctx.strokeStyle = light ? `rgba(255,235,200,${0.08 + rnd() * 0.15})` : `rgba(120,76,32,${0.06 + rnd() * 0.2})`;
      ctx.lineWidth = 0.6 + rnd() * 2;
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        for (let x = 0; x <= size; x += 8) {
          const y = y0 + dy + amp * Math.sin((x / size) * Math.PI * 2 * freq + ph);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() - 0.5) * 18;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    woodTexture = t;
    return t;
  }

  function disposeWood() {
    woodTexture?.dispose();
    woodTexture = null;
  }

  /** wood = null : couleur unie (3D print). Sinon bois : UV planaires en mm sur les faces haut/bas, tranches brûlées. */
  function toThree(m: Mesh, color: string, wood: { map: THREE.Texture; tint: string } | null): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
    g.setIndex(m.indices);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    if (!wood) return new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));

    const pos = flat.getAttribute('position');
    const nor = flat.getAttribute('normal');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / TEXTURE_MM;
      uv[i * 2 + 1] = pos.getY(i) / TEXTURE_MM;
    }
    flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // groupes par triangle : 0 = faces haut/bas, 1 = tranches
    flat.clearGroups();
    let start = 0;
    let cur = -1;
    for (let t = 0; t < pos.count / 3; t++) {
      const mat = Math.abs(nor.getZ(t * 3)) > 0.5 ? 0 : 1;
      if (mat !== cur) {
        if (cur !== -1) flat.addGroup(start * 3, (t - start) * 3, cur);
        start = t;
        cur = mat;
      }
    }
    if (cur !== -1) flat.addGroup(start * 3, pos.count - start * 3, cur);
    const caps = new THREE.MeshStandardMaterial({ map: wood.map, color: wood.tint, roughness: 0.85 });
    const sides = new THREE.MeshStandardMaterial({ color: '#4a2c14', roughness: 0.95 });
    return new THREE.Mesh(flat, [caps, sides]);
  }

  function clearGroup() {
    for (const c of [...group.children]) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      // la texture est partagée : elle n'est libérée qu'à la destruction du composant
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
      group.remove(m);
    }
  }

  $effect(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(devicePixelRatio);
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-50, -80, 150);
    scene.add(sun, group);
    camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    controls = new OrbitControls(camera, renderer.domElement);

    const ro = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    ro.observe(host);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      clearGroup();
      controls.dispose();
      disposeWood();
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
      framedFor = '';
    };
  });

  $effect(() => {
    try {
      if (params.mode === 'laser') {
        const m = buildLaserMeshes(geometry);
        clearGroup();
        const map = getWoodTexture();
        group.add(toThree(m.base, '', { map, tint: '#ffffff' }), toThree(m.letters, '', { map, tint: '#ffe2b8' }));
      } else {
        const m = buildMeshes(geometry, params);
        clearGroup();
        group.add(toThree(m.base, params.baseColor, null), toThree(m.letters, params.lettersColor, null));
      }
      meshError = null;
    } catch (e) {
      clearGroup();
      meshError = `Aperçu 3D impossible : ${(e as Error).message}`;
      return;
    }

    const key = `${Math.round(geometry.width)}x${Math.round(geometry.height)}`;
    if (key !== framedFor) {
      framedFor = key;
      const cx = geometry.width / 2;
      const cy = -geometry.height / 2;
      const size = Math.max(geometry.width, geometry.height);
      controls.target.set(cx, cy, 0);
      camera.position.set(cx, cy - size * 1.2, size * 1.4);
    }
  });
</script>

<div class="wrap">
  <div class="host" bind:this={host}></div>
  {#if meshError}<p class="err">{meshError}</p>{/if}
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; }
  .err { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; margin: 0; padding: 16px; text-align: center; color: var(--muted); pointer-events: none; }
  .host { width: 100%; height: 100%; min-height: 300px; }
</style>
