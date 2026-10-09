<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import type { KeychainGeometry } from '../geometry/keychain';
  import type { KeychainParams } from '../params';
  import { buildMeshes } from '../mesh/keychain3d';
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

  function toThree(m: Mesh, color: string): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
    g.setIndex(m.indices);
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    return new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  }

  function clearGroup() {
    for (const c of [...group.children]) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
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
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
      framedFor = '';
    };
  });

  $effect(() => {
    try {
      const m = buildMeshes(geometry, params);
      clearGroup();
      group.add(toThree(m.base, params.baseColor), toThree(m.letters, params.lettersColor));
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
