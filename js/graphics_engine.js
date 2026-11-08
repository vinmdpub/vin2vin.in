/**
 * GraphicsEngine - Next-Gen WebGPU 3D Scrollytelling Visual Engine
 * Powered by Three.js WebGPURenderer with automatic WebGL2 fallback.
 * 
 * Consolidated Architecture:
 * - Reusable Model Scaler & Bounding-Box Normalizer
 * - Reusable InstancedMesh & Particle Stream Generators
 * - Adaptive Side-Aware Camera Composition & Smooth Scene Cross-Fading
 * - Interactive Cursor Tilt Micro-Physics
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Declarative Camera Choreography Table
const CAMERA_PRESETS = {
  emblem: {
    desktop: { startDist: 8.5, endDist: 7.0, height: 0.2, lookAtY: -0.6, type: 'zoom' },
    mobile:  { startDist: 12.0, endDist: 10.0, height: 0.2, lookAtY: -0.6, type: 'zoom' }
  },
  gi_tract: {
    desktop: {
      radius: 3.5,
      heightStart: 1.75,
      heightEnd: -1.65,
      lookAtYStart: 1.5,
      lookAtYEnd: -1.55,
      type: 'anatomical_journey'
    },
    mobile: {
      radius: 5.2,
      heightStart: 1.9,
      heightEnd: -1.75,
      lookAtYStart: 1.6,
      lookAtYEnd: -1.65,
      type: 'anatomical_journey'
    }
  },
  indus_seal: {
    desktop: { startDist: 8.5, endDist: 7.2, height: 0.0, lookAtY: 0.0, type: 'zoom' },
    mobile:  { startDist: 11.5, endDist: 9.8, height: 0.0, lookAtY: 0.0, type: 'zoom' }
  },
  ashokan_pillar: {
    desktop: { dist: 8.5, yStart: 1.8, yEnd: -1.8, type: 'pan_vertical' },
    mobile:  { dist: 12.0, yStart: 2.2, yEnd: -2.2, type: 'pan_vertical' }
  },
  neural_network: {
    desktop: { startDist: 10.5, endDist: 8.8, height: 1.0, type: 'zoom' },
    mobile:  { startDist: 14.0, endDist: 12.0, height: 1.2, type: 'zoom' }
  },
  latent_manifold: {
    desktop: { startDist: 11.2, endDist: 9.2, height: 1.8, type: 'zoom' },
    mobile:  { startDist: 15.0, endDist: 13.0, height: 2.2, type: 'zoom' }
  },
  cosmos: {
    desktop: { radius: 8.2, heightStart: 4.2, heightEnd: 2.0, lookAtY: -1.0, type: 'cosmos_orbit' },
    mobile:  { radius: 11.0, heightStart: 5.0, heightEnd: 2.8, lookAtY: -1.0, type: 'cosmos_orbit' }
  },
  dna: {
    desktop: { radius: 8.5, heightStart: 1.8, heightEnd: -1.2, lookAtY: 0.0, type: 'dna_spiral' },
    mobile:  { radius: 12.0, heightStart: 2.2, heightEnd: -1.0, lookAtY: 0.0, type: 'dna_spiral' }
  },
  archaeogenetics: {
    desktop: { startDist: 11.5, endDist: 9.5, height: 2.0, lookAtY: 0.0, type: 'zoom' },
    mobile:  { startDist: 15.5, endDist: 13.5, height: 2.5, lookAtY: 0.0, type: 'zoom' }
  }
};

class GraphicsEngine {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    // Loaders
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.dracoLoader.setDecoderConfig({ type: 'js' });

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.activeScene = 'emblem';
    this.sceneProgress = 0.0;
    this.isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

    this.sceneGroups = {};
    this.materials = {};
    this.models = {};
    this.neuralData = { nodes: [], pulses: [] };
    this.cosmosOriginalPos = null;
    this.clock = new THREE.Clock();

    // Reusable Vector & Transform Instances
    this.currentCamPos = new THREE.Vector3(0, 0, 10);
    this.targetCamPos = new THREE.Vector3(0, 0, 10);
    this.currentCamLookAt = new THREE.Vector3(0, 0, 0);
    this.targetCamLookAt = new THREE.Vector3(0, 0, 0);
    this.dummyTransform = new THREE.Object3D();

    this.onLoadedCallbacks = [];
    this.loadedAssets = 0;
    this.totalAssets = 4;
    this.initialized = false;

    this.groupOpacities = {};

    // Interactive Subtle Mouse Parallax & Dynamic Drag Orbit
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.drag = {
      isDragging: false,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      targetOffsetX: 0,
      targetOffsetY: 0,
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', (e) => {
        this.mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
        this.mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;

        if (this.drag.isDragging) {
          const dx = e.clientX - this.drag.startX;
          const dy = e.clientY - this.drag.startY;
          this.drag.targetOffsetX = Math.max(-0.7, Math.min(0.7, dx * 0.005));
          this.drag.targetOffsetY = Math.max(-0.4, Math.min(0.4, dy * 0.005));
        }
      });

      window.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('a, button, .hero-scroll-cue, .contact-link-item, .nav-dots, .mobile-chapter-pill, .bio-drawer, .bio-trigger-btn, .bio-backdrop')) return;
        this.drag.isDragging = true;
        this.drag.startX = e.clientX;
        this.drag.startY = e.clientY;
      });

      window.addEventListener('mouseup', () => {
        if (this.drag.isDragging) {
          this.drag.isDragging = false;
          this.drag.targetOffsetX = 0;
          this.drag.targetOffsetY = 0;
        }
      });

      // Touch Parallax & Drag Orbit for Mobile
      window.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          if (touch.target && touch.target.closest && touch.target.closest('a, button, .hero-scroll-cue, .contact-link-item, .nav-dots, .mobile-chapter-pill, .bio-drawer, .bio-trigger-btn, .bio-backdrop')) return;
          this.drag.isDragging = true;
          this.drag.startX = touch.clientX;
          this.drag.startY = touch.clientY;
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (this.drag.isDragging && e.touches.length === 1) {
          const touch = e.touches[0];
          const dx = touch.clientX - this.drag.startX;
          const dy = touch.clientY - this.drag.startY;
          this.drag.targetOffsetX = Math.max(-0.7, Math.min(0.7, dx * 0.005));
          this.drag.targetOffsetY = Math.max(-0.4, Math.min(0.4, dy * 0.005));
        }
      }, { passive: true });

      window.addEventListener('touchend', () => {
        if (this.drag.isDragging) {
          this.drag.isDragging = false;
          this.drag.targetOffsetX = 0;
          this.drag.targetOffsetY = 0;
        }
      });
    }
  }

  async init(canvas) {
    if (this.initialized && this.canvas === canvas) return;
    this.canvas = canvas;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.isMobile = width < 768;

    // 1. Scene & Perspective Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0d10');
    this.camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 10);

    // 2. WebGPU Renderer (with auto WebGL2 fallback & ACES tone mapping)
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    try {
      await this.renderer.init();
      console.log('[GraphicsEngine] Three.js WebGPURenderer active.');
    } catch (err) {
      console.warn('[GraphicsEngine] Using fallback renderer:', err);
    }

    // 3. Initialize Centralized Resources & Scenes
    this.buildMaterialLibrary();
    this.setupLighting();
    this.buildSharedParticleRiver();

    this.buildEmblemScene();
    this.buildGITractScene();
    this.buildIndusSealScene();
    this.buildAshokanPillarScene();
    this.buildNeuralNetworkScene();
    this.buildLatentManifoldScene();
    this.buildCosmosScene();
    this.buildDnaScene();
    this.buildArchaeogeneticsScene();

    // 4. Render Loop
    this.renderer.setAnimationLoop(() => {
      this.renderFrame();
    });

    this.initialized = true;
    console.log('[GraphicsEngine] All consolidated 3D scenes initialized.');
  }

  // --- REUSABLE PIPELINE HELPERS ---

  /**
   * Consolidates GLB loading, bounding-box measurement, proportional scaling,
   * coordinate recentering to (0,0,0), material enhancement, and error handling.
   */
  loadAndCenterModel({ url, targetDim, materialParams = {}, onLoaded }) {
    this.gltfLoader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // 1. Measure raw bounding box
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1.0;
        const targetScale = targetDim / maxDim;

        // 2. Proportional scale
        model.scale.setScalar(targetScale);
        model.updateMatrixWorld(true);

        // 3. Coordinate recentering to (0, 0, 0)
        const scaledBbox = new THREE.Box3().setFromObject(model);
        const scaledCenter = new THREE.Vector3();
        scaledBbox.getCenter(scaledCenter);
        model.position.set(-scaledCenter.x, -scaledCenter.y, -scaledCenter.z);

        // 4. Enhanced material traversal
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.side = THREE.DoubleSide;
            if (materialParams.roughness !== undefined) child.material.roughness = materialParams.roughness;
            if (materialParams.metalness !== undefined) child.material.metalness = materialParams.metalness;
            child.material.needsUpdate = true;
          }
        });

        this.checkAssetLoaded();
        if (onLoaded) onLoaded(model, scaledCenter);
      },
      undefined,
      (err) => console.error(`[GraphicsEngine] Failed loading model at ${url}:`, err)
    );
  }

  /**
   * Consolidates particle system generation, buffer allocations, and attribute bindings.
   */
  createParticleSystem(count, material, generatorFn) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const basePos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      generatorFn(i, pos, basePos, vel);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mesh = new THREE.Points(geo, material);
    return { mesh, geo, pos, basePos, vel, count };
  }

  /**
   * Consolidates InstancedMesh setup with transform matrix population.
   */
  createInstancedMesh(geometry, material, transforms) {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    const dummy = this.dummyTransform;

    transforms.forEach((t, i) => {
      dummy.position.copy(t.position);
      if (t.rotation) dummy.rotation.copy(t.rotation);
      if (t.scale) dummy.scale.copy(t.scale); else dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  // --- 1. CENTRALIZED MATERIAL LIBRARY ---
  buildMaterialLibrary() {
    this.materials.cyanEmissive = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.3
    });

    this.materials.goldEmissive = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffa500,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.4
    });

    this.materials.skyWireframe = new THREE.MeshStandardMaterial({
      color: 0x7df9ff,
      wireframe: true,
      emissive: 0x00ffff,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.85
    });

    this.materials.stoneColumn = new THREE.MeshStandardMaterial({
      color: 0x1f242c,
      roughness: 0.75,
      metalness: 0.2
    });

    this.materials.goldAccretion = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffa500,
      emissiveIntensity: 2.2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });

    this.materials.singularity = new THREE.MeshBasicMaterial({ color: 0x000000 });

    this.materials.synapseLine = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.35
    });

    this.materials.connectomeSynapse = new THREE.LineBasicMaterial({
      color: 0x7df9ff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending
    });

    this.materials.callosumBridge = new THREE.LineBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending
    });

    this.materials.lossLandscape = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.30
    });

    this.materials.gradientTrajectory = new THREE.LineBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.90
    });

    this.materials.ropeRingCyan = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });

    this.materials.ropeRingGold = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });

    this.materials.dnaStrandCyan = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.3
    });

    this.materials.dnaStrandGold = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xff9900,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.4
    });

    this.materials.crisprHalo = new THREE.MeshBasicMaterial({
      color: 0x7df9ff,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this.materials.archaeoStratum = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    });

    this.materials.archaeoMigration = new THREE.LineBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this.materials.particleRiver = new THREE.PointsMaterial({
      color: 0x7df9ff,
      size: 0.065,
      transparent: true,
      opacity: 0.9
    });

    this.materials.nutrientFlow = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.08,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.materials.jetStream = new THREE.PointsMaterial({
      color: 0x7df9ff,
      size: 0.09,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
  }

  // --- 2. MULTI-POINT ILLUMINATION RIG ---
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00ffff, 2.5);
    dirLight1.position.set(6, 12, 8);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight2.position.set(-6, -6, -6);
    this.scene.add(dirLight2);

    const pointCyan = new THREE.PointLight(0x00ffff, 4.0, 25);
    pointCyan.position.set(0, 2, 4);
    this.scene.add(pointCyan);

    const pointGold = new THREE.PointLight(0xffd700, 2.0, 20);
    pointGold.position.set(3, -2, 2);
    this.scene.add(pointGold);
  }

  // --- 3. UNIFIED PERSISTENT PARTICLE STREAM ---
  buildSharedParticleRiver() {
    const river = this.createParticleSystem(450, this.materials.particleRiver, (i, pos, basePos, vel) => {
      const idx = i * 3;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 1.4 + (Math.random() - 0.5) * 0.6;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      basePos[idx] = x;
      basePos[idx + 1] = y;
      basePos[idx + 2] = z;

      vel[idx] = (Math.random() - 0.5) * 0.01;
      vel[idx + 1] = (Math.random() - 0.5) * 0.01;
      vel[idx + 2] = (Math.random() - 0.5) * 0.01;
    });

    this.scene.add(river.mesh);
    this.models.sharedParticleRiver = river;
  }

  // --- SCENE 1: SIGNATURE EMBLEM (BIO-DIGITAL GEODESIC LATTICE) ---
  buildEmblemScene() {
    const group = new THREE.Group();
    this.sceneGroups['emblem'] = group;
    this.scene.add(group);

    const emblemHolder = new THREE.Group();
    group.add(emblemHolder);
    this.models.emblemShell = emblemHolder;

    // 1. Dual-Frequency Geodesic Wireframe Cage
    const geo = new THREE.IcosahedronGeometry(1.6, 2);
    const cageMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      roughness: 0.2,
      metalness: 0.8
    });
    const cage = new THREE.Mesh(geo, cageMat);
    emblemHolder.add(cage);

    // 2. Instanced Synaptic Node Vertices
    const posAttr = geo.attributes.position;
    const vertexMap = new Map();
    const nodeTransforms = [];
    const nodeGeo = new THREE.SphereGeometry(0.048, 12, 12);

    for (let i = 0; i < posAttr.count; i++) {
      const x = Number(posAttr.getX(i).toFixed(3));
      const y = Number(posAttr.getY(i).toFixed(3));
      const z = Number(posAttr.getZ(i).toFixed(3));
      const key = `${x},${y},${z}`;

      if (!vertexMap.has(key)) {
        vertexMap.set(key, true);
        nodeTransforms.push({
          position: new THREE.Vector3(x, y, z),
          scale: new THREE.Vector3(1, 1, 1)
        });
      }
    }

    const instancedNodes = this.createInstancedMesh(nodeGeo, this.materials.goldEmissive, nodeTransforms);
    emblemHolder.add(instancedNodes);

    // 3. Biological Cellular Nucleus / Luminous Inner Core
    const nucleusGeo = new THREE.SphereGeometry(0.62, 32, 32);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x0088aa,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.6,
      transparent: true,
      opacity: 0.82
    });
    const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
    emblemHolder.add(nucleus);
    this.models.emblemNucleus = nucleus;

    // 4. Inner Golden Resonance Core
    const innerGoldGeo = new THREE.IcosahedronGeometry(0.32, 1);
    const innerGold = new THREE.Mesh(innerGoldGeo, this.materials.goldEmissive);
    emblemHolder.add(innerGold);
    this.models.emblemInnerGold = innerGold;

    // 5. Helical Orbital Micro-Photon Swarm (120 particles)
    const photonCount = 120;
    const photonAngles = new Float32Array(photonCount);
    const photonRadii = new Float32Array(photonCount);
    const photonSpeeds = new Float32Array(photonCount);
    const photonHeights = new Float32Array(photonCount);

    const photonSystem = this.createParticleSystem(photonCount, this.materials.nutrientFlow, (i, pos) => {
      const theta = Math.random() * Math.PI * 2;
      const r = 1.9 + Math.random() * 0.4;
      const h = (Math.random() - 0.5) * 2.2;
      const spd = 0.8 + Math.random() * 0.8;

      photonAngles[i] = theta;
      photonRadii[i] = r;
      photonSpeeds[i] = spd;
      photonHeights[i] = h;

      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = Math.sin(theta) * r;
    });

    emblemHolder.add(photonSystem.mesh);
    this.models.emblemPhotons = {
      ...photonSystem,
      angles: photonAngles,
      radii: photonRadii,
      speeds: photonSpeeds,
      heights: photonHeights,
      count: photonCount
    };
  }

  // --- SCENE 2: GI TRACT ---
  buildGITractScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['gi_tract'] = group;
    this.scene.add(group);

    this.loadAndCenterModel({
      url: 'models/digestive_system.glb',
      targetDim: 4.2,
      materialParams: { roughness: 0.4, metalness: 0.2 },
      onLoaded: (model) => {
        group.add(model);
        this.models.giTract = model;
      }
    });

    // Luminescent Nutrient Flow Spline
    const flowCount = 75;
    const flowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 1.8, 0.05),
      new THREE.Vector3(-0.25, 1.1, 0.1),
      new THREE.Vector3(0.2, 0.4, 0.15),
      new THREE.Vector3(-0.3, -0.2, 0.1),
      new THREE.Vector3(0.2, -0.7, 0.12),
      new THREE.Vector3(-0.15, -1.2, 0.08),
      new THREE.Vector3(0.0, -1.8, 0.02)
    ]);
    const flowSystem = this.createParticleSystem(flowCount, this.materials.nutrientFlow, (i, pos, basePos) => {
      const u = i / (flowCount - 1);
      const pt = flowCurve.getPoint(u);
      pos[i * 3] = pt.x;
      pos[i * 3 + 1] = pt.y;
      pos[i * 3 + 2] = pt.z;
    });
    group.add(flowSystem.mesh);
    this.models.giFlow = { ...flowSystem, curve: flowCurve };
  }

  // --- SCENE 3: INDUS SEAL (AUTHENTIC 3D STEATITE ARTIFACT TABLET) ---
  buildIndusSealScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['indus_seal'] = group;
    this.scene.add(group);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      'models/indus_seal.jpg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;

        // 3D Ancient Steatite Seal Tablet geometry
        const width = 3.2;
        const height = 3.2;
        const depth = 0.42;
        const boxGeo = new THREE.BoxGeometry(width, height, depth, 32, 32, 8);

        // Stone side & back material
        const stoneMat = new THREE.MeshStandardMaterial({
          color: 0x3d352e,
          roughness: 0.85,
          metalness: 0.1
        });

        // High-fidelity relief textured front face
        const frontMat = new THREE.MeshStandardMaterial({
          map: texture,
          bumpMap: texture,
          bumpScale: 0.04,
          roughness: 0.55,
          metalness: 0.15
        });

        // [right, left, top, bottom, front, back]
        const materials = [stoneMat, stoneMat, stoneMat, stoneMat, frontMat, stoneMat];
        const sealMesh = new THREE.Mesh(boxGeo, materials);
        sealMesh.position.set(0, 0, 0);

        // Subtle rear boss / perforated handle characteristic of Harappan seals
        const bossGeo = new THREE.CylinderGeometry(0.5, 0.65, 0.4, 16);
        bossGeo.rotateX(Math.PI / 2);
        const bossMesh = new THREE.Mesh(bossGeo, stoneMat);
        bossMesh.position.set(0, 0, -depth / 2 - 0.18);
        sealMesh.add(bossMesh);

        group.add(sealMesh);
        this.models.indusSeal = sealMesh;
        this.models.indusSealBaseY = 0;
        this.checkAssetLoaded();
        console.log('[GraphicsEngine] Indus Seal 3D tablet textured & loaded.');
      },
      undefined,
      (err) => console.error('[GraphicsEngine] Failed loading indus_seal.jpg:', err)
    );
  }

  // --- SCENE 4: ASHOKAN PILLAR (REAL 3D MONUMENT) ---
  buildAshokanPillarScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['ashokan_pillar'] = group;
    this.scene.add(group);

    this.loadAndCenterModel({
      url: 'models/ashok_stambh.glb',
      targetDim: 5.8,
      materialParams: { roughness: 0.65, metalness: 0.15 },
      onLoaded: (model, scaledCenter) => {
        group.add(model);
        this.models.ashokanPillar = model;
        this.models.pillarBaseY = -scaledCenter.y;
      }
    });
  }

  // --- SCENE 5: THE CONNECTOME (BIOLUMINESCENT CORTICAL MANIFOLD) ---
  buildNeuralNetworkScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['neural_network'] = group;
    this.scene.add(group);

    const nodes = [];
    // 1. Generate Hemispheric Cortical Hubs (Left & Right Cerebral Hemispheres)
    // Left Hemisphere (22 nodes)
    for (let i = 0; i < 22; i++) {
      const u = (i / 21) * 1.8 - 0.9; // y range [-0.9, 0.9]
      const v = (i * 2.39996) % (Math.PI * 2); // Golden angle distribution
      const rHem = Math.sqrt(Math.max(0.05, 1.0 - u * u));
      const x = -(0.55 + 1.25 * rHem * Math.abs(Math.cos(v)));
      const y = u * 1.45 + (Math.sin(v * 2) * 0.15);
      const z = 1.65 * rHem * Math.sin(v);
      const isFrontal = z > 0.8 && y > 0.2;
      nodes.push({ pos: new THREE.Vector3(x, y, z), hemisphere: 'left', isFrontal, id: nodes.length });
    }

    // Right Hemisphere (22 nodes, symmetrical with organic noise)
    for (let i = 0; i < 22; i++) {
      const u = (i / 21) * 1.8 - 0.9;
      const v = (i * 2.39996) % (Math.PI * 2);
      const rHem = Math.sqrt(Math.max(0.05, 1.0 - u * u));
      const x = (0.55 + 1.25 * rHem * Math.abs(Math.cos(v)));
      const y = u * 1.45 + (Math.cos(v * 2) * 0.15);
      const z = 1.65 * rHem * Math.sin(v);
      const isFrontal = z > 0.8 && y > 0.2;
      nodes.push({ pos: new THREE.Vector3(x, y, z), hemisphere: 'right', isFrontal, id: nodes.length });
    }

    // Deep Limbic & Callosal Core (4 nodes)
    for (let i = 0; i < 4; i++) {
      const y = -0.4 + i * 0.28;
      const z = -0.3 + (i % 2) * 0.5;
      nodes.push({ pos: new THREE.Vector3(0.0, y, z), hemisphere: 'core', isFrontal: false, id: nodes.length });
    }

    // Instanced Nodes: Cyan for Standard Hubs, Gold for Frontal Executive Nuclei
    const cyanTransforms = nodes.filter(n => !n.isFrontal).map(n => ({ position: n.pos }));
    const goldTransforms = nodes.filter(n => n.isFrontal).map(n => ({ position: n.pos }));

    const hubGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const cyanHubs = this.createInstancedMesh(hubGeo, this.materials.cyanEmissive, cyanTransforms);
    group.add(cyanHubs);

    const goldGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const goldHubs = this.createInstancedMesh(goldGeo, this.materials.goldEmissive, goldTransforms);
    group.add(goldHubs);

    // 2. Volumetric 3D Curving Dendrite Splines (Tractography)
    const connectomeCurves = [];
    const connectomePulses = [];

    const addBezierSynapse = (p0, p1, mat, bulge = 0.3) => {
      const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      const outward = new THREE.Vector3(mid.x, mid.y * 0.5, mid.z).normalize();
      mid.addScaledVector(outward, bulge);

      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      connectomeCurves.push(curve);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(14));
      const line = new THREE.Line(lineGeo, mat);
      group.add(line);

      connectomePulses.push({
        curve,
        speed: 0.65 + Math.random() * 0.7,
        offset: Math.random()
      });
    };

    // Intra-hemispheric Nearest-Neighbor tracts
    for (let i = 0; i < nodes.length; i++) {
      const nA = nodes[i];
      if (nA.hemisphere === 'core') continue;

      let nearest = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const nB = nodes[j];
        if (nB.hemisphere === nA.hemisphere) {
          const d = nA.pos.distanceTo(nB.pos);
          nearest.push({ d, node: nB });
        }
      }
      nearest.sort((a, b) => a.d - b.d);
      for (let k = 0; k < Math.min(2, nearest.length); k++) {
        if (nearest[k].d < 1.4) {
          addBezierSynapse(nA.pos, nearest[k].node.pos, this.materials.connectomeSynapse, 0.25);
        }
      }
    }

    // Interhemispheric Corpus Callosum Arches (Golden cross-midline bridges)
    for (let i = 0; i < 6; i++) {
      const leftNode = nodes[i * 3];
      const rightNode = nodes[22 + i * 3];
      if (leftNode && rightNode) {
        addBezierSynapse(leftNode.pos, rightNode.pos, this.materials.callosumBridge, 0.55);
      }
    }

    // Connectome Action Potential Particles
    const pulseMat = new THREE.PointsMaterial({
      color: 0x7df9ff,
      size: 0.085,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const pulseSystem = this.createParticleSystem(connectomePulses.length, pulseMat, () => {});
    group.add(pulseSystem.mesh);

    this.connectomeData = {
      nodes,
      pulses: connectomePulses,
      pulsePoints: pulseSystem.mesh,
      group
    };
  }

  // --- SCENE 5B: THE LATENT MANIFOLD & LOSS LANDSCAPE ---
  buildLatentManifoldScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['latent_manifold'] = group;
    this.scene.add(group);

    // 1. Undulating Riemannian Loss Landscape Surface
    const gridRes = 40;
    const lossGeo = new THREE.PlaneGeometry(16, 16, gridRes, gridRes);
    lossGeo.rotateX(-Math.PI / 2);

    const pos = lossGeo.attributes.position.array;
    this.neuralLossOriginalPos = new Float32Array(pos.length);

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = pos[i + 2];
      const y = -1.85 
        + 0.52 * Math.sin(0.48 * x) * Math.cos(0.48 * z)
        + 0.26 * Math.cos(0.95 * x + 0.7 * z)
        - 0.85 / (1.0 + 0.15 * (x * x + z * z));
      pos[i + 1] = y;
      this.neuralLossOriginalPos[i] = x;
      this.neuralLossOriginalPos[i + 1] = y;
      this.neuralLossOriginalPos[i + 2] = z;
    }
    lossGeo.computeVertexNormals();

    const lossMesh = new THREE.Mesh(lossGeo, this.materials.lossLandscape);
    group.add(lossMesh);
    this.models.lossMesh = lossMesh;

    // 2. Gradient Descent Optimization Trajectory & Rolling Tracer
    const trajPoints = [
      new THREE.Vector3(3.4, -1.2, 3.4),
      new THREE.Vector3(2.4, -1.45, 2.0),
      new THREE.Vector3(1.3, -1.75, 0.8),
      new THREE.Vector3(0.4, -2.15, -0.2),
      new THREE.Vector3(-0.1, -2.55, 0.1),
      new THREE.Vector3(0.0, -2.65, 0.0)
    ];
    const trajCurve = new THREE.CatmullRomCurve3(trajPoints);
    const trajGeo = new THREE.BufferGeometry().setFromPoints(trajCurve.getPoints(50));
    const trajLine = new THREE.Line(trajGeo, this.materials.gradientTrajectory);
    group.add(trajLine);

    // Gradient Descent Particle Tracer
    const tracerGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const tracerMesh = new THREE.Mesh(tracerGeo, this.materials.goldEmissive);
    group.add(tracerMesh);
    this.models.gradientTracer = { mesh: tracerMesh, curve: trajCurve };

    // 3. Volumetric Transformer Latent Core (3 Concentric / Tiered Cylinders)
    // Tier 0: Input Tokens (8 nodes at y=-0.5, r=2.4)
    // Tier 1: Latent Multi-Head Representations (16 nodes in 2 offset rings, r=1.8/1.55, y=0.4/1.2)
    // Tier 2: Emergent Latent Output Crown (6 golden nodes, r=1.0, y=2.0)
    const nodes = [];

    // Tier 0
    const countT0 = 8;
    for (let i = 0; i < countT0; i++) {
      const angle = (i / countT0) * Math.PI * 2;
      const x = Math.cos(angle) * 2.4;
      const z = Math.sin(angle) * 2.4;
      const y = -0.5;
      nodes.push({ pos: new THREE.Vector3(x, y, z), tier: 0, id: nodes.length });
    }

    // Tier 1 (Ring A: 8 nodes at y=0.4, r=1.8)
    const countT1A = 8;
    for (let i = 0; i < countT1A; i++) {
      const angle = (i / countT1A) * Math.PI * 2 + (Math.PI / 8);
      const x = Math.cos(angle) * 1.8;
      const z = Math.sin(angle) * 1.8;
      const y = 0.4;
      nodes.push({ pos: new THREE.Vector3(x, y, z), tier: 1, id: nodes.length });
    }

    // Tier 1 (Ring B: 8 nodes at y=1.2, r=1.55)
    const countT1B = 8;
    for (let i = 0; i < countT1B; i++) {
      const angle = (i / countT1B) * Math.PI * 2 + (Math.PI / 4);
      const x = Math.cos(angle) * 1.55;
      const z = Math.sin(angle) * 1.55;
      const y = 1.2;
      nodes.push({ pos: new THREE.Vector3(x, y, z), tier: 1, id: nodes.length });
    }

    // Tier 2 (Golden Output Crown: 6 nodes at y=2.0, r=1.0)
    const countT2 = 6;
    for (let i = 0; i < countT2; i++) {
      const angle = (i / countT2) * Math.PI * 2;
      const x = Math.cos(angle) * 1.0;
      const z = Math.sin(angle) * 1.0;
      const y = 2.0;
      nodes.push({ pos: new THREE.Vector3(x, y, z), tier: 2, id: nodes.length });
    }

    // Instanced Nodes
    const sphereGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const hiddenTransforms = nodes.filter(n => n.tier < 2).map(n => ({ position: n.pos }));
    const hiddenMesh = this.createInstancedMesh(sphereGeo, this.materials.cyanEmissive, hiddenTransforms);
    group.add(hiddenMesh);

    const goldGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const outputTransforms = nodes.filter(n => n.tier === 2).map(n => ({ position: n.pos }));
    const outputMesh = this.createInstancedMesh(goldGeo, this.materials.goldEmissive, outputTransforms);
    group.add(outputMesh);

    // 4. Volumetric Curved Spline Synapses (DTI Tractography Arches)
    const manifoldCurves = [];
    const manifoldPulses = [];

    const addSynapseCurve = (p0, p1, bulgeFactor = 0.35) => {
      const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      const radialDir = new THREE.Vector3(mid.x, 0, mid.z).normalize();
      if (radialDir.lengthSq() < 0.001) radialDir.set(1, 0, 0);
      mid.addScaledVector(radialDir, bulgeFactor);

      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      manifoldCurves.push(curve);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(16));
      const line = new THREE.Line(lineGeo, this.materials.synapseLine);
      group.add(line);

      manifoldPulses.push({
        curve,
        speed: 0.6 + Math.random() * 0.7,
        offset: Math.random()
      });
    };

    // Connect Tier 0 to Tier 1A
    for (let i = 0; i < 8; i++) {
      const n0 = nodes[i];
      addSynapseCurve(n0.pos, nodes[8 + (i % 8)].pos, 0.35);
      addSynapseCurve(n0.pos, nodes[8 + ((i + 1) % 8)].pos, 0.4);
    }

    // Connect Tier 1A to Tier 1B (Cross-layer self-attention)
    for (let i = 0; i < 8; i++) {
      const nA = nodes[8 + i];
      addSynapseCurve(nA.pos, nodes[16 + (i % 8)].pos, 0.25);
      addSynapseCurve(nA.pos, nodes[16 + ((i + 2) % 8)].pos, 0.3);
    }

    // Connect Tier 1B to Tier 2 (Output Crown)
    for (let i = 0; i < 8; i++) {
      const nB = nodes[16 + i];
      const targetIdx = 24 + (i % 6);
      addSynapseCurve(nB.pos, nodes[targetIdx].pos, 0.35);
    }

    // Luminous Signal Action Potential Particles
    const pulseMat = new THREE.PointsMaterial({
      color: 0x7df9ff,
      size: 0.09,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const pulseSystem = this.createParticleSystem(manifoldPulses.length, pulseMat, () => {});
    group.add(pulseSystem.mesh);

    // 5. Rotary Positional Tensor Rings (RoPE Coordinate Encoders)
    const ring1Geo = new THREE.TorusGeometry(2.1, 0.018, 8, 64);
    const ring1 = new THREE.Mesh(ring1Geo, this.materials.ropeRingCyan);
    ring1.rotation.x = Math.PI * 0.25;
    ring1.rotation.y = Math.PI * 0.15;
    group.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(2.6, 0.016, 8, 64);
    const ring2 = new THREE.Mesh(ring2Geo, this.materials.ropeRingGold);
    ring2.rotation.x = -Math.PI * 0.28;
    ring2.rotation.z = Math.PI * 0.2;
    group.add(ring2);

    this.latentManifoldData = {
      nodes,
      curves: manifoldCurves,
      pulses: manifoldPulses,
      pulsePoints: pulseSystem.mesh,
      ring1,
      ring2,
      lossMesh
    };
  }

  // --- SCENE 6: COSMOS (GRAVITATIONAL VORTEX REFACTOR) ---
  buildCosmosScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['cosmos'] = group;
    this.scene.add(group);

    // 1. Black Hole Singularity Event Horizon
    const holeGeo = new THREE.SphereGeometry(0.78, 32, 32);
    const hole = new THREE.Mesh(holeGeo, this.materials.singularity);
    hole.position.set(0, -1.0, 0);
    group.add(hole);

    // 2. Luminous Einstein Photon Ring
    const photonRingGeo = new THREE.TorusGeometry(0.83, 0.025, 16, 64);
    photonRingGeo.rotateX(-Math.PI / 2);
    const photonRing = new THREE.Mesh(photonRingGeo, this.materials.goldEmissive);
    photonRing.position.set(0, -1.0, 0);
    group.add(photonRing);
    this.models.photonRing = photonRing;

    // 2b. Atmospheric Gravitational Lensing Halo Disc
    const haloGeo = new THREE.RingGeometry(0.80, 1.48, 64);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffa500,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(0, -1.0, 0);
    group.add(halo);
    this.models.cosmosHalo = halo;

    // 3. Spacetime Grid Plane with Dynamic Gravitational Well
    const gridGeo = new THREE.PlaneGeometry(18, 18, 40, 40);
    gridGeo.rotateX(-Math.PI / 2);
    this.cosmosOriginalPos = gridGeo.attributes.position.array.slice();

    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.38
    });
    const gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.position.set(0, -1.0, 0);
    group.add(gridMesh);
    this.models.cosmosGrid = gridMesh;

    // 4. Keplerian Accretion Particle Vortex
    const vortexCount = 320;
    const angles = new Float32Array(vortexCount);
    const radii = new Float32Array(vortexCount);
    const speeds = new Float32Array(vortexCount);

    const vortexSystem = this.createParticleSystem(vortexCount, this.materials.goldAccretion, (i, pos) => {
      const r = 0.95 + Math.pow(Math.random(), 1.6) * 3.2; // Denser near singularity
      const theta = Math.random() * Math.PI * 2;
      const speed = 1.8 / Math.sqrt(r * r * r); // Keplerian orbital speed
      const dip = 1.6 / (1.0 + r * 0.9);
      const y = -1.0 - dip + (Math.random() - 0.5) * 0.08;

      radii[i] = r;
      angles[i] = theta;
      speeds[i] = speed;

      pos[i * 3] = Math.cos(theta) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(theta) * r;
    });
    group.add(vortexSystem.mesh);
    this.models.cosmosVortex = { ...vortexSystem, angles, radii, speeds };

    // 5. Relativistic Polar Particle Jets
    const jetCount = 100;
    const jetSystem = this.createParticleSystem(jetCount, this.materials.jetStream, (i, pos) => {
      const sign = (i / 3) % 2 === 0 ? 1 : -1;
      const h = Math.random() * 4.0;
      const spread = (h / 4.0) * 0.25;
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = -1.0 + sign * (0.88 + h);
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    });
    group.add(jetSystem.mesh);
    this.models.cosmosJets = jetSystem;
  }

  // --- SCENE 6: DNA & GENETIC ENGINEERING (DOUBLE HELIX & CRISPR TARGETING) ---
  buildDnaScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['dna'] = group;
    this.scene.add(group);

    const dnaContainer = new THREE.Group();
    group.add(dnaContainer);

    // 1. Procedural High-Fidelity Fallback (Instant display while GLB streams)
    const proceduralFallback = new THREE.Group();
    dnaContainer.add(proceduralFallback);

    const rungs = 42;
    const heightSpan = 5.6;
    const radius = 1.35;
    const turns = 2.4;

    const strand1Points = [];
    const strand2Points = [];

    const rungGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
    rungGeo.rotateZ(Math.PI / 2);

    for (let i = 0; i < rungs; i++) {
      const t = i / (rungs - 1);
      const y = -heightSpan / 2 + t * heightSpan;
      const angle = t * Math.PI * 2 * turns;

      const p1 = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const p2 = new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius);

      strand1Points.push(p1);
      strand2Points.push(p2);

      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const dist = p1.distanceTo(p2);

      const rungMesh = new THREE.Mesh(
        rungGeo,
        i % 2 === 0 ? this.materials.dnaStrandCyan : this.materials.dnaStrandGold
      );
      rungMesh.position.copy(mid);
      rungMesh.scale.set(dist, 1, 1);
      rungMesh.lookAt(p1);
      proceduralFallback.add(rungMesh);
    }

    const curve1 = new THREE.CatmullRomCurve3(strand1Points);
    const curve2 = new THREE.CatmullRomCurve3(strand2Points);

    const tubeGeo1 = new THREE.TubeGeometry(curve1, 80, 0.075, 8, false);
    const tubeMesh1 = new THREE.Mesh(tubeGeo1, this.materials.dnaStrandCyan);
    proceduralFallback.add(tubeMesh1);

    const tubeGeo2 = new THREE.TubeGeometry(curve2, 80, 0.075, 8, false);
    const tubeMesh2 = new THREE.Mesh(tubeGeo2, this.materials.dnaStrandGold);
    proceduralFallback.add(tubeMesh2);

    // 2. CRISPR-Cas9 Precision Molecular Targeting Cursor & Spark Ring
    const crisprCursor = new THREE.Group();
    const haloGeo = new THREE.TorusGeometry(0.82, 0.03, 12, 48);
    const haloMesh = new THREE.Mesh(haloGeo, this.materials.crisprHalo);
    haloMesh.rotation.x = Math.PI / 2;
    crisprCursor.add(haloMesh);

    // CRISPR Guide RNA & Cleavage Tracer Particles
    const sparkCount = 40;
    const sparks = this.createParticleSystem(sparkCount, this.materials.nutrientFlow, (i, pos) => {
      const theta = Math.random() * Math.PI * 2;
      const rad = 0.68 + (Math.random() - 0.5) * 0.22;
      pos[i * 3] = Math.cos(theta) * rad;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
      pos[i * 3 + 2] = Math.sin(theta) * rad;
    });
    crisprCursor.add(sparks.mesh);
    group.add(crisprCursor);

    this.models.dnaHelix = {
      group,
      dnaContainer,
      crisprCursor,
      modelLoaded: false,
    };

    // 3. Load High-Fidelity 3D DNA Model (GLB converted from glTF with native upright orientation)
    this.loadAndCenterModel({
      url: 'models/dna.glb',
      targetDim: 6.6,
      materialParams: { roughness: 0.35, metalness: 0.25 },
      onLoaded: (model) => {
        // Remove procedural fallback and seamlessly mount the organic 3D DNA model
        dnaContainer.remove(proceduralFallback);
        // Model is natively upright along Y; zero rotation for true vertical orientation
        model.rotation.set(0, 0, 0);
        dnaContainer.add(model);
        this.models.dnaHelix.modelLoaded = true;
        console.log('[GraphicsEngine] High-fidelity DNA 3D model loaded & centered with native vertical geometry.');
      }
    });
  }

  // --- SCENE 7: ARCHAEOGENETICS (PALEOGENOMICS & MIGRATION LATTICE) ---
  buildArchaeogeneticsScene() {
    const group = new THREE.Group();
    group.visible = false;
    this.sceneGroups['archaeogenetics'] = group;
    this.scene.add(group);

    // 1. Prehistoric Temporal Strata Planes (3 Evolutionary Strata)
    // Level 0: Deep Prehistoric Lineage Strata (Y = -1.6)
    // Level 1: Regional Demographic Continuity (Y = -0.2)
    // Level 2: Rakhigarhi / Harappan Civilization Matrix (Y = 1.2)
    const strata = [
      { y: -1.6, r: 4.6, col: 0x00d4ff },
      { y: -0.2, r: 3.8, col: 0x7df9ff },
      { y: 1.2, r: 3.0, col: 0xffd700 }
    ];

    strata.forEach((st) => {
      const ringGeo = new THREE.RingGeometry(st.r * 0.35, st.r, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: st.col,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide
      });
      const disc = new THREE.Mesh(ringGeo, ringMat);
      disc.position.y = st.y;
      group.add(disc);
    });

    // 2. Population Gene Pool Hubs (Ancestral Genomic Loci)
    const hubs = [
      // Deep Paleolithic Roots (Y = -1.6)
      new THREE.Vector3(-2.4, -1.6, -1.2),
      new THREE.Vector3(1.8, -1.6, 2.2),
      new THREE.Vector3(0.0, -1.6, -2.5),

      // Regional Prehistoric Continuity (Y = -0.2)
      new THREE.Vector3(-1.8, -0.2, 1.4),
      new THREE.Vector3(1.5, -0.2, -1.0),

      // Indus / Harappan Civilization Apex (Y = 1.2)
      new THREE.Vector3(0.0, 1.2, 0.0),
      new THREE.Vector3(0.8, 1.2, 0.6),
      new THREE.Vector3(-0.7, 1.2, -0.5)
    ];

    const hubGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const cyanHubTransforms = hubs.slice(0, 5).map(pos => ({ position: pos }));
    const cyanHubMesh = this.createInstancedMesh(hubGeo, this.materials.cyanEmissive, cyanHubTransforms);
    group.add(cyanHubMesh);

    const goldHubGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const goldHubTransforms = hubs.slice(5).map(pos => ({ position: pos }));
    const goldHubMesh = this.createInstancedMesh(goldHubGeo, this.materials.goldEmissive, goldHubTransforms);
    group.add(goldHubMesh);

    // 3. Phylogenetic Migration Vectors (3D Bezier Curves Converging Upward)
    const migrationCurves = [];
    const migrationPulses = [];

    const addMigrationPath = (p0, p1) => {
      const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      mid.x += (Math.random() - 0.5) * 0.8;
      mid.z += (Math.random() - 0.5) * 0.8;

      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      migrationCurves.push(curve);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
      const line = new THREE.Line(lineGeo, this.materials.archaeoMigration);
      group.add(line);

      migrationPulses.push({
        curve,
        speed: 0.5 + Math.random() * 0.6,
        offset: Math.random()
      });
    };

    // Deep roots to Neolithic
    addMigrationPath(hubs[0], hubs[3]);
    addMigrationPath(hubs[1], hubs[4]);
    addMigrationPath(hubs[2], hubs[3]);

    // Neolithic to Indus Apex
    addMigrationPath(hubs[3], hubs[5]);
    addMigrationPath(hubs[4], hubs[5]);
    addMigrationPath(hubs[3], hubs[6]);
    addMigrationPath(hubs[4], hubs[7]);

    // 4. Ancestral Allele Flow Particles (aDNA Sequencing Reads Flow)
    const pulseMat = new THREE.PointsMaterial({
      color: 0xffd700,
      size: 0.09,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const pulseSystem = this.createParticleSystem(migrationPulses.length, pulseMat, () => {});
    group.add(pulseSystem.mesh);

    this.models.archaeogenetics = {
      group,
      pulses: migrationPulses,
      pulsePoints: pulseSystem.mesh
    };
  }

  checkAssetLoaded() {
    this.loadedAssets++;
    if (this.loadedAssets >= this.totalAssets) {
      this.onLoadedCallbacks.forEach((cb) => cb());
    }
  }

  onLoaded(callback) {
    if (this.loadedAssets >= this.totalAssets) {
      callback();
    } else {
      this.onLoadedCallbacks.push(callback);
    }
  }

  // --- DECLARATIVE CAMERA & SCENE STATE UPDATE ---
  updateScene(sceneName, progress, eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
    if (this.activeScene !== sceneName) {
      this.activeScene = sceneName;
    }
    this.sceneProgress = progress;

    // 2. Direct Rust WASM Vector Application OR JS Fallback Preset
    if (eyeX !== undefined && eyeY !== undefined && eyeZ !== undefined) {
      this.targetCamPos.set(eyeX, eyeY, eyeZ);
      this.targetCamLookAt.set(lookX || 0, lookY || 0, lookZ || 0);
    } else {
      const presetConfig = CAMERA_PRESETS[sceneName];
      if (!presetConfig) return;
      const cfg = this.isMobile ? presetConfig.mobile : presetConfig.desktop;

      switch (cfg.type) {
        case 'zoom': {
          const eased = THREE.MathUtils.smoothstep(progress, 0.0, 1.0);
          const dist = THREE.MathUtils.lerp(cfg.startDist, cfg.endDist, eased);
          this.targetCamPos.set(0, cfg.height || 0, dist);
          this.targetCamLookAt.set(0, cfg.lookAtY || 0, 0);
          break;
        }
        case 'anatomical_journey': {
          const eased = THREE.MathUtils.smoothstep(progress, 0.0, 1.0);
          const yCam = THREE.MathUtils.lerp(cfg.heightStart, cfg.heightEnd, eased);
          const yLook = THREE.MathUtils.lerp(cfg.lookAtYStart, cfg.lookAtYEnd, eased);
          let angle;
          if (progress <= 0.65) {
            const t1 = progress / 0.65;
            const easedT1 = THREE.MathUtils.smoothstep(t1, 0.0, 1.0);
            angle = easedT1 * Math.PI;
          } else {
            const t2 = (progress - 0.65) / 0.35;
            const easedT2 = THREE.MathUtils.smoothstep(t2, 0.0, 1.0);
            angle = Math.PI + easedT2 * Math.PI;
          }
          this.targetCamPos.set(Math.sin(angle) * cfg.radius, yCam, Math.cos(angle) * cfg.radius);
          this.targetCamLookAt.set(0, yLook, 0);
          break;
        }
        case 'pan_vertical': {
          const easedY = THREE.MathUtils.smoothstep(progress, 0.0, 1.0);
          const yPos = THREE.MathUtils.lerp(cfg.yStart, cfg.yEnd, easedY);
          this.targetCamPos.set(0, yPos, cfg.dist);
          this.targetCamLookAt.set(0, yPos - 0.4, 0);
          break;
        }
        case 'cosmos_orbit': {
          const eased = THREE.MathUtils.smoothstep(progress, 0.0, 1.0);
          const yCam = THREE.MathUtils.lerp(cfg.heightStart, cfg.heightEnd, eased);
          const angle = 0.45 + eased * 0.85;
          this.targetCamPos.set(Math.sin(angle) * cfg.radius, yCam, Math.cos(angle) * cfg.radius);
          this.targetCamLookAt.set(0, cfg.lookAtY, 0);
          break;
        }
      }
    }

    // Dynamic Cosmos Spacetime Grid Funnel Curvature
    if (sceneName === 'cosmos' && this.models.cosmosGrid && this.cosmosOriginalPos) {
      const posAttr = this.models.cosmosGrid.geometry.attributes.position;
      const arr = posAttr.array;
      const orig = this.cosmosOriginalPos;
      const cosmosProgress = Math.min(1.0, THREE.MathUtils.smoothstep(progress, 0.0, 0.85));

      for (let i = 0; i < arr.length; i += 3) {
        const x = orig[i];
        const z = orig[i + 2];
        const dist = Math.sqrt(x * x + z * z);
        const dip = 2.5 / (1.0 + dist * dist * 0.35);
        arr[i + 1] = orig[i + 1] - dip * (0.4 + cosmosProgress * 0.6);
      }
      posAttr.needsUpdate = true;
    }
  }

  onResize(width, height) {
    this.isMobile = width < 768;
    if (this.camera && this.renderer) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }
  }

  renderFrame() {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    // 1. Frame-rate independent exponential camera damping
    const lerpFactor = 1.0 - Math.exp(-6.5 * delta);
    this.currentCamPos.lerp(this.targetCamPos, lerpFactor);
    this.currentCamLookAt.lerp(this.targetCamLookAt, lerpFactor);

    // 2. Interactive Subtle Mouse Parallax & Dynamic LookAt + Drag-to-Inspect
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

    // Elastic spring for drag offset
    const dragLerp = 1.0 - Math.exp(-7.0 * delta);
    this.drag.offsetX += (this.drag.targetOffsetX - this.drag.offsetX) * dragLerp;
    this.drag.offsetY += (this.drag.targetOffsetY - this.drag.offsetY) * dragLerp;

    if (this.camera) {
      const camPos = this.currentCamPos.clone();
      const lookAtPos = this.currentCamLookAt.clone();

      camPos.x += this.mouse.x * 0.4 + this.drag.offsetX * 1.8;
      camPos.y += -this.mouse.y * 0.3 - this.drag.offsetY * 1.2;

      this.camera.position.copy(camPos);
      this.camera.lookAt(lookAtPos);
    }

    // 2b. Smooth Scene Cross-Fading & Scale Morphing
    if (this.sceneGroups) {
      const fadeLerp = 1.0 - Math.exp(-8.0 * delta);
      Object.keys(this.sceneGroups).forEach((name) => {
        const group = this.sceneGroups[name];
        if (!group) return;

        if (this.groupOpacities[name] === undefined) {
          this.groupOpacities[name] = (name === this.activeScene) ? 1.0 : 0.0;
        }

        const targetOpacity = (name === this.activeScene) ? 1.0 : 0.0;
        const currentOpacity = this.groupOpacities[name];
        const newOpacity = currentOpacity + (targetOpacity - currentOpacity) * fadeLerp;
        this.groupOpacities[name] = newOpacity;

        if (newOpacity < 0.008) {
          group.visible = false;
        } else {
          group.visible = true;
          const scaleFactor = 0.94 + 0.06 * newOpacity;
          group.scale.set(scaleFactor, scaleFactor, scaleFactor);

          if (newOpacity < 0.995) {
            group.traverse((child) => {
              if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach((mat) => {
                    mat.transparent = true;
                    if (mat.userData.baseOpacity === undefined) {
                      mat.userData.baseOpacity = mat.opacity !== undefined ? mat.opacity : 1.0;
                    }
                    mat.opacity = mat.userData.baseOpacity * newOpacity;
                  });
                } else {
                  child.material.transparent = true;
                  if (child.material.userData.baseOpacity === undefined) {
                    child.material.userData.baseOpacity = child.material.opacity !== undefined ? child.material.opacity : 1.0;
                  }
                  child.material.opacity = child.material.userData.baseOpacity * newOpacity;
                }
              }
            });
          }
        }
      });
    }

    // 3. Shared Persistent Particle Swarm Dynamics
    if (this.models.sharedParticleRiver) {
      const { mesh, pos, basePos, count } = this.models.sharedParticleRiver;
      const posAttr = mesh.geometry.attributes.position;
      const amp = this.activeScene === 'cosmos' ? 0.25 : 0.08;

      for (let i = 0; i < count * 3; i += 3) {
        pos[i + 1] = basePos[i + 1] + Math.sin(time * 1.5 + basePos[i]) * amp;
      }
      posAttr.needsUpdate = true;
      mesh.rotation.y += delta * 0.15;
    }

    // 4. Bio-Digital Geodesic Lattice Dynamics (Biological Heartbeat + Synaptic Photon Swarm)
    if (this.models.emblemShell && this.sceneGroups['emblem']?.visible) {
      this.models.emblemShell.rotation.y += delta * 0.35 + this.mouse.x * 0.012;
      this.models.emblemShell.rotation.x += delta * 0.18 - this.mouse.y * 0.012;

      // Biological Heartbeat & Cellular Breathing Rhythm
      const heartbeat = 1.0 + Math.sin(time * 2.6) * 0.035 + Math.sin(time * 5.2) * 0.012;
      this.models.emblemShell.scale.setScalar(heartbeat);

      if (this.models.emblemNucleus) {
        const nucleusPulse = 1.0 + Math.sin(time * 3.2) * 0.06;
        this.models.emblemNucleus.scale.setScalar(nucleusPulse);
      }

      if (this.models.emblemInnerGold) {
        this.models.emblemInnerGold.rotation.y -= delta * 0.8;
        this.models.emblemInnerGold.rotation.z += delta * 0.5;
      }

      if (this.models.emblemPhotons) {
        const { geo, pos, angles, radii, speeds, heights, count } = this.models.emblemPhotons;
        for (let i = 0; i < count; i++) {
          angles[i] += delta * speeds[i];
          pos[i * 3] = Math.cos(angles[i]) * radii[i];
          pos[i * 3 + 1] = heights[i] + Math.sin(time * 1.8 + i) * 0.15;
          pos[i * 3 + 2] = Math.sin(angles[i]) * radii[i];
        }
        geo.attributes.position.needsUpdate = true;
      }
    }

    // 5. GI Tract Luminescent Flow
    if (this.models.giFlow && this.sceneGroups['gi_tract']?.visible) {
      const { count, curve, geo } = this.models.giFlow;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const u = (time * 0.22 + i / count) % 1.0;
        const pt = curve.getPoint(u);
        arr[i * 3] = pt.x;
        arr[i * 3 + 1] = pt.y;
        arr[i * 3 + 2] = pt.z;
      }
      geo.attributes.position.needsUpdate = true;
    }

    // 6. Indus Seal Levitation & Interactive Cursor Tilt (Front-Facing Showcase)
    if (this.models.indusSeal && this.sceneGroups['indus_seal']?.visible) {
      this.models.indusSeal.position.y = (this.models.indusSealBaseY || 0) + Math.sin(time * 0.8) * 0.08;
      this.models.indusSeal.rotation.y = this.mouse.x * 0.08;
      this.models.indusSeal.rotation.x = -this.mouse.y * 0.06;
    }

    // 7. Ashokan Pillar Rotation & Interactive Cursor Tilt
    if (this.models.ashokanPillar && this.sceneGroups['ashokan_pillar']?.visible) {
      this.models.ashokanPillar.rotation.y += delta * 0.15 + this.mouse.x * 0.008;
      this.models.ashokanPillar.rotation.x = -this.mouse.y * 0.05;
    }

    // 8. Connectome (Neural Network): Bioluminescent Action Potential Cascades & Interactive Tilt
    if (this.connectomeData?.pulsePoints && this.sceneGroups['neural_network']?.visible) {
      const posAttr = this.connectomeData.pulsePoints.geometry.attributes.position;
      const arr = posAttr.array;
      const pulses = this.connectomeData.pulses;

      for (let i = 0; i < pulses.length; i++) {
        const p = pulses[i];
        const t = (time * p.speed + p.offset) % 1.0;
        const pt = p.curve.getPoint(t);
        arr[i * 3] = pt.x;
        arr[i * 3 + 1] = pt.y;
        arr[i * 3 + 2] = pt.z;
      }
      posAttr.needsUpdate = true;

      // Subtle biological organic float
      if (this.connectomeData.group) {
        this.connectomeData.group.rotation.y = Math.sin(time * 0.4) * 0.08 + this.mouse.x * 0.04;
        this.connectomeData.group.rotation.x = Math.cos(time * 0.3) * 0.05 - this.mouse.y * 0.03;
      }
    }

    // 8b. Latent Manifold: Undulating Loss Landscape, Gradient Descent Tracer, RoPE Rings, & Synaptic Spline Pulses
    if (this.sceneGroups['latent_manifold']?.visible && this.latentManifoldData) {
      // a. Loss Landscape Breathing Wave
      if (this.models.lossMesh && this.neuralLossOriginalPos) {
        const posAttr = this.models.lossMesh.geometry.attributes.position;
        const arr = posAttr.array;
        const orig = this.neuralLossOriginalPos;
        for (let i = 0; i < arr.length; i += 3) {
          const x = orig[i];
          const z = orig[i + 2];
          arr[i + 1] = orig[i + 1] + Math.sin(time * 1.2 + x * 0.4 + z * 0.4) * 0.06;
        }
        posAttr.needsUpdate = true;
      }

      // b. Gradient Descent Particle Rolling Along the Valley
      if (this.models.gradientTracer) {
        const { mesh, curve } = this.models.gradientTracer;
        const t = (time * 0.22) % 1.0;
        const pt = curve.getPoint(t);
        mesh.position.copy(pt);
      }

      // c. Rotary RoPE Encoders
      if (this.latentManifoldData.ring1 && this.latentManifoldData.ring2) {
        this.latentManifoldData.ring1.rotation.z += delta * 0.25;
        this.latentManifoldData.ring2.rotation.y -= delta * 0.20;
      }

      // d. Action Potential Signal Packets Traveling along 3D Bezier Splines
      if (this.latentManifoldData.pulsePoints && this.latentManifoldData.pulses) {
        const posAttr = this.latentManifoldData.pulsePoints.geometry.attributes.position;
        const arr = posAttr.array;
        const pulses = this.latentManifoldData.pulses;

        for (let i = 0; i < pulses.length; i++) {
          const p = pulses[i];
          const t = (time * p.speed + p.offset) % 1.0;
          const pt = p.curve.getPoint(t);
          arr[i * 3] = pt.x;
          arr[i * 3 + 1] = pt.y;
          arr[i * 3 + 2] = pt.z;
        }
        posAttr.needsUpdate = true;
      }
    }

    // 9. Cosmos Dynamic Spacetime Grid, Accretion Vortex & Photon Ring
    if (this.models.cosmosVortex && this.sceneGroups['cosmos']?.visible) {
      const { geo, pos, angles, radii, speeds, count } = this.models.cosmosVortex;
      for (let i = 0; i < count; i++) {
        angles[i] += delta * speeds[i];
        pos[i * 3] = Math.cos(angles[i]) * radii[i];
        pos[i * 3 + 2] = Math.sin(angles[i]) * radii[i];
      }
      geo.attributes.position.needsUpdate = true;
    }

    if (this.models.photonRing && this.sceneGroups['cosmos']?.visible) {
      this.models.photonRing.rotation.z += delta * 1.4;
    }

    if (this.models.cosmosHalo && this.sceneGroups['cosmos']?.visible) {
      this.models.cosmosHalo.rotation.z -= delta * 0.35;
    }

    if (this.models.cosmosGrid && this.sceneGroups['cosmos']?.visible) {
      this.models.cosmosGrid.rotation.y += delta * 0.05;
    }

    if (this.models.cosmosJets && this.sceneGroups['cosmos']?.visible) {
      const { count, geo, pos } = this.models.cosmosJets;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count * 3; i += 3) {
        const sign = (i / 3) % 2 === 0 ? 1 : -1;
        pos[i + 1] += sign * delta * 3.6;
        if (sign > 0 && pos[i + 1] > 3.2) pos[i + 1] = -0.1;
        if (sign < 0 && pos[i + 1] < -4.8) pos[i + 1] = -1.9;
        arr[i + 1] = pos[i + 1];
      }
      geo.attributes.position.needsUpdate = true;
    }

    // 10. DNA & Genetic Engineering: Rotation & Dynamic CRISPR Cursor Tracking
    if (this.models.dnaHelix && this.sceneGroups['dna']?.visible) {
      if (this.models.dnaHelix.dnaContainer) {
        this.models.dnaHelix.dnaContainer.rotation.y += delta * 0.45 + this.mouse.x * 0.012;
      } else {
        this.models.dnaHelix.group.rotation.y += delta * 0.45 + this.mouse.x * 0.012;
      }
      const crisprY = Math.sin(time * 0.9) * 1.8;
      this.models.dnaHelix.crisprCursor.position.y = crisprY;
      this.models.dnaHelix.crisprCursor.rotation.z += delta * 1.2;
    }

    // 11. Archaeogenetics: Population Migration Flows across Prehistoric Strata
    if (this.models.archaeogenetics && this.sceneGroups['archaeogenetics']?.visible) {
      this.models.archaeogenetics.group.rotation.y += delta * 0.12 + this.mouse.x * 0.008;
      if (this.models.archaeogenetics.pulsePoints && this.models.archaeogenetics.pulses) {
        const posAttr = this.models.archaeogenetics.pulsePoints.geometry.attributes.position;
        const arr = posAttr.array;
        const pulses = this.models.archaeogenetics.pulses;
        for (let i = 0; i < pulses.length; i++) {
          const p = pulses[i];
          const t = (time * p.speed + p.offset) % 1.0;
          const pt = p.curve.getPoint(t);
          arr[i * 3] = pt.x;
          arr[i * 3 + 1] = pt.y;
          arr[i * 3 + 2] = pt.z;
        }
        posAttr.needsUpdate = true;
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
    }
    this.initialized = false;
  }
}

// Global instance
const engine = new GraphicsEngine();
window.__GraphicsEngine = engine;

// Safe global wrappers for Rust WASM
window.initGraphics = function(canvas) {
  if (window.__GraphicsEngine) {
    window.__GraphicsEngine.init(canvas);
  }
};

window.updateGraphicsScene = function(sceneName, progress, eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  if (window.__GraphicsEngine && window.__GraphicsEngine.initialized) {
    window.__GraphicsEngine.updateScene(sceneName, progress, eyeX, eyeY, eyeZ, lookX, lookY, lookZ);
  }
};

window.resizeGraphics = function(w, h) {
  if (window.__GraphicsEngine && window.__GraphicsEngine.initialized) {
    window.__GraphicsEngine.onResize(w, h);
  }
};

window.disposeGraphics = function() {
  if (window.__GraphicsEngine) {
    window.__GraphicsEngine.dispose();
  }
};
