import * as THREE from "three";
import { ParametricGeometry } from "three/examples/jsm/geometries/ParametricGeometry.js";

const canvas = document.getElementById("three-canvas");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCompactDevice = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const pixelRatioLimit = isCompactDevice ? 2 : 1.75;

// --- SCENE SETUP ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080808, 0.04);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 18);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));

// Parallax and Scroll Groups
const parallaxGroup = new THREE.Group();
scene.add(parallaxGroup);

const scrollGroup = new THREE.Group();
parallaxGroup.add(scrollGroup);

// Master Object
const masterGroup = new THREE.Group();
scrollGroup.add(masterGroup);

// Base Math Helpers
function cmul([a, b], [c, d]) { return [a * c - b * d, a * d + b * c]; }
function cadd([a, b], [c, d]) { return [a + c, b + d]; }
function csub([a, b], [c, d]) { return [a - c, b - d]; }
function cdiv([a, b], [c, d]) {
  const denom = c * c + d * d;
  return [(a * c + b * d) / denom, (b * c - a * d) / denom];
}

// 1. Bryant-Kusner Surface
function getBryantKusner(u, v) {
  const r = u;
  const theta = v * Math.PI * 2;
  const t = [r * Math.cos(theta), r * Math.sin(theta)];

  const t2 = cmul(t, t);
  const t4 = cmul(t2, t2);
  const t3 = cmul(t2, t);
  const t6 = cmul(t3, t3);

  const sqrt5 = Math.sqrt(5);
  let D = cadd(t6, [sqrt5 * t3[0], sqrt5 * t3[1]]);
  D = csub(D, [1, 0]);

  const num1 = cmul(t, csub([1, 0], t4));
  const q1 = cdiv(num1, D);
  const g1 = -1.5 * q1[1];

  const num2 = cmul(t, cadd([1, 0], t4));
  const q2 = cdiv(num2, D);
  const g2 = -1.5 * q2[0];

  const num3 = cadd([1, 0], t6);
  const q3 = cdiv(num3, D);
  const g3 = q3[1] - 0.5;

  const norm = 1 / (g1 * g1 + g2 * g2 + g3 * g3);
  return { x: g1 * norm, y: g2 * norm, z: g3 * norm };
}

// 2. Steiner Roman Surface (Cross-Cap)
function getSteinerRoman(u, v) {
  const U = u * Math.PI; 
  const V = v * Math.PI; 
  const R = 1.3; 
  return {
    x: R * Math.sin(U) * Math.sin(2 * V),
    y: R * Math.sin(2 * U) * Math.pow(Math.cos(V), 2),
    z: R * Math.cos(2 * U) * Math.pow(Math.cos(V), 2)
  };
}

// 3. Enneper Surface
function getEnneper(u, v) {
  const u1 = (u - 0.5) * 4;
  const v1 = (v - 0.5) * 4;
  const s = 0.25;
  return {
    x: s * (u1 - Math.pow(u1, 3)/3 + u1 * Math.pow(v1, 2)),
    y: s * (v1 - Math.pow(v1, 3)/3 + v1 * Math.pow(u1, 2)),
    z: s * (Math.pow(u1, 2) - Math.pow(v1, 2))
  };
}

// 4. Fully Resolved Sphere
function getSphere(u, v) {
  const phi = u * Math.PI;
  const theta = v * Math.PI * 2;
  const R = 1.4;
  return {
    x: R * Math.sin(phi) * Math.cos(theta),
    y: R * Math.sin(phi) * Math.sin(theta),
    z: R * Math.cos(phi)
  };
}

// Interpolation Engine
const getSurfacePoint = (u, v, target, alpha = 0) => {
  let p1, p2, localAlpha;

  if (alpha < 0.333) {
    p1 = getBryantKusner(u, v);
    p2 = getSteinerRoman(u, v);
    localAlpha = alpha / 0.333;
  } else if (alpha < 0.666) {
    p1 = getSteinerRoman(u, v);
    p2 = getEnneper(u, v);
    localAlpha = (alpha - 0.333) / 0.333;
  } else {
    p1 = getEnneper(u, v);
    p2 = getSphere(u, v);
    localAlpha = (alpha - 0.666) / 0.334;
  }

  // Smoothstep easing for fluid transitions
  const easedAlpha = localAlpha * localAlpha * (3 - 2 * localAlpha);

  target.set(
    p1.x + (p2.x - p1.x) * easedAlpha,
    p1.y + (p2.y - p1.y) * easedAlpha,
    p1.z + (p2.z - p1.z) * easedAlpha
  );
};

// Keep enough detail on touch screens for a crisp object while remaining responsive.
const sliceCount = isCompactDevice ? 56 : 72;
const stackCount = isCompactDevice ? 56 : 72;
const geometry = new ParametricGeometry((u, v, t) => getSurfacePoint(u, v, t, 0), sliceCount, stackCount);
geometry.computeVertexNormals();

const material = new THREE.MeshPhysicalMaterial({
  color: 0x0a0a0a,
  emissive: 0x000000,
  metalness: 0.15,
  roughness: 0.72,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.78,
  flatShading: false,
  clearcoat: 0.2,
  clearcoatRoughness: 0.8
});
const mesh = new THREE.Mesh(geometry, material);
mesh.scale.set(1.5, 1.5, 1.5);
masterGroup.add(mesh);

const wireframeMat = new THREE.MeshBasicMaterial({
  color: 0xf1f1ec,
  transparent: true,
  opacity: isCompactDevice ? 0.13 : 0.22,
  wireframe: true,
  blending: THREE.AdditiveBlending
});
// Share the morphing geometry instead of rebuilding thousands of line edges while scrolling.
const wireframe = new THREE.Mesh(geometry, wireframeMat);
wireframe.scale.copy(mesh.scale);
masterGroup.add(wireframe);

// Neutral lighting for the monochrome plotter-like surface.
scene.add(new THREE.AmbientLight(0xffffff, 0.24));
const pointLight1 = new THREE.PointLight(0xffffff, 280);
pointLight1.position.set(5, 8, 5);
scene.add(pointLight1);
const pointLight2 = new THREE.PointLight(0xffffff, 180);
pointLight2.position.set(-5, -5, -5);
scene.add(pointLight2);
const pointLight3 = new THREE.PointLight(0xffffff, 140);
pointLight3.position.set(0, 5, 8);
scene.add(pointLight3);

// Particles for flavor
const particleGeo = new THREE.BufferGeometry();
const particleCount = isCompactDevice ? 70 : 170;
const posArray = new Float32Array(particleCount * 3);
for(let i=0; i < particleCount * 3; i++) {
  posArray[i] = (Math.random() - 0.5) * 30;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particleMat = new THREE.PointsMaterial({
  size: 0.05,
  color: 0xf1f1ec,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- SCROLL & PARALLAX LOGIC ---
let scrollY = 0;
let mouseX = 0;
let mouseY = 0;
const header = document.querySelector('.glass-header');
const scrollProgress = document.querySelector('.scroll-progress');

// Modify rotational keyframes so we can appreciate the intermediate shapes better
const keyframes = [
  { p: 0.0, rot: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(0, 0, 0) },
  { p: 0.25, rot: new THREE.Vector3(0.5, 3.14, 0.2), pos: new THREE.Vector3(-2, 1, 3) },
  { p: 0.5, rot: new THREE.Vector3(1.5, 6.28, 0.5), pos: new THREE.Vector3(2, -1, 0) },
  { p: 0.75, rot: new THREE.Vector3(2.5, 9.42, 1.4), pos: new THREE.Vector3(-1, 0, 2) },
  { p: 1.0, rot: new THREE.Vector3(3.5, 12.56, 2.0), pos: new THREE.Vector3(0, 0, 0) }
];

const updatePageChrome = () => {
  scrollY = window.scrollY;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(100, (scrollY / scrollable) * 100) : 0;
  scrollProgress?.style.setProperty('--scroll-progress', `${progress}%`);
  header?.classList.toggle('scrolled', scrollY > 24);
};

window.addEventListener("scroll", updatePageChrome, { passive: true });
updatePageChrome();

if (canHover && !prefersReducedMotion) {
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth) - 0.5;
    mouseY = (e.clientY / window.innerHeight) - 0.5;
  }, { passive: true });
}

function updateSceneLayout() {
  if (window.innerWidth >= 980) {
    masterGroup.position.set(3.25, 0, 0);
    masterGroup.scale.setScalar(1);
  } else if (window.innerWidth >= 761) {
    masterGroup.position.set(2.2, -0.2, 0);
    masterGroup.scale.setScalar(0.9);
  } else {
    masterGroup.position.set(0, 1.8, 0);
    masterGroup.scale.setScalar(0.68);
  }
}

// Resizing
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
  updateSceneLayout();
});
updateSceneLayout();

// --- RENDER LOOP ---
const clock = new THREE.Clock();

// Helper to interpolate between keyframes
function lerpVector3(v1, v2, alpha) {
  return new THREE.Vector3(
    v1.x + (v2.x - v1.x) * alpha,
    v1.y + (v2.y - v1.y) * alpha,
    v1.z + (v2.z - v1.z) * alpha
  );
}

let currentGeometryAlpha = 0;
const targetVector = new THREE.Vector3();

// Dynamically morph geometry based on scroll (resolving singularities)
function updateSurfaceMorph(alpha) {
  // Only update if alpha actually changed significantly to save CPU
  const morphStep = isCompactDevice ? 0.02 : 0.009;
  if (Math.abs(currentGeometryAlpha - alpha) < morphStep) return;
  currentGeometryAlpha = alpha;
  
  const pos = geometry.attributes.position;
  let idx = 0;
  for (let i = 0; i <= stackCount; i++) {
    const v = i / stackCount;
    for (let j = 0; j <= sliceCount; j++) {
      const u = j / sliceCount;
      getSurfacePoint(u, v, targetVector, alpha);
      pos.setXYZ(idx++, targetVector.x, targetVector.y, targetVector.z);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function updateScrollAnimation() {
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
  // Prevent division by zero if page can't scroll
  const scrollPercent = scrollHeight > 0 ? scrollY / scrollHeight : 0;
  
  // Find current and next keyframe
  let startFrame = keyframes[0];
  let endFrame = keyframes[keyframes.length - 1];
  let localAlpha = 0;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (scrollPercent >= keyframes[i].p && scrollPercent <= keyframes[i+1].p) {
      startFrame = keyframes[i];
      endFrame = keyframes[i+1];
      const range = endFrame.p - startFrame.p;
      localAlpha = range > 0 ? (scrollPercent - startFrame.p) / range : 0;
      break;
    }
  }

  // Smooth interpolation using easing
  const easeAlpha = localAlpha * localAlpha * (3 - 2 * localAlpha); // smoothstep
  
  const targetRot = lerpVector3(startFrame.rot, endFrame.rot, easeAlpha);
  const targetPos = lerpVector3(startFrame.pos, endFrame.pos, easeAlpha);

  // Apply smooth damping towards target
  scrollGroup.rotation.x += (targetRot.x - scrollGroup.rotation.x) * 0.1;
  scrollGroup.rotation.y += (targetRot.y - scrollGroup.rotation.y) * 0.1;
  scrollGroup.rotation.z += (targetRot.z - scrollGroup.rotation.z) * 0.1;

  scrollGroup.position.x += (targetPos.x - scrollGroup.position.x) * 0.1;
  scrollGroup.position.y += (targetPos.y - scrollGroup.position.y) * 0.1;
  scrollGroup.position.z += (targetPos.z - scrollGroup.position.z) * 0.1;

  // Morph the surface: fully Bryant-Kusner at 0.0, resolving fully into inflated shape near 1.0!
  const targetMorphAlpha = scrollPercent;
  updateSurfaceMorph(targetMorphAlpha);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Subtle continuous rotation for life
  if (!prefersReducedMotion) {
    masterGroup.rotation.y += 0.05 * dt;
    masterGroup.rotation.x += 0.03 * dt;
  }
  
  // Slowly rotate particles
  if (!prefersReducedMotion) particles.rotation.y -= 0.02 * dt;

  // Parallax based on mouse
  const pTargetX = mouseY * 0.5;
  const pTargetY = mouseX * 0.5;
  parallaxGroup.rotation.x += (pTargetX - parallaxGroup.rotation.x) * 0.05;
  parallaxGroup.rotation.y += (pTargetY - parallaxGroup.rotation.y) * 0.05;

  // Scroll Animation interpolation
  updateScrollAnimation();

  renderer.render(scene, camera);
}
animate();

// --- INTERSECTION OBSERVER FOR REVEAL & NAV ---
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');

const observerOptions = {
  root: null,
  rootMargin: '-15% 0px -35% 0px',
  threshold: 0.08
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    // Reveal text card
    if (entry.isIntersecting) {
      const card = entry.target.querySelector('.content-card');
      if(card) card.classList.add('revealed');
      
      // Update nav active state
      const id = entry.target.getAttribute('id');
      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + id) {
          link.classList.add('active');
        }
      });
    }
  });
}, observerOptions);

sections.forEach(section => observer.observe(section));

// Mobile navigation and smooth section changes
const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.getElementById('main-nav');

function closeMenu() {
  mainNav?.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Open navigation');
}

menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav?.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const themeToggle = document.querySelector('.theme-toggle');
const themeLabel = document.querySelector('.theme-label');
const themeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  wireframeMat.opacity = isLight
    ? (isCompactDevice ? 0.3 : 0.46)
    : (isCompactDevice ? 0.13 : 0.22);
  particleMat.opacity = isLight ? 0.25 : 0.18;
  themeLabel.textContent = isLight ? 'Dark' : 'Light';
  themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeColor?.setAttribute('content', isLight ? '#ffffff' : '#050505');

  if (persist) {
    try {
      localStorage.setItem('jan-site-theme', theme);
    } catch (_) {}
  }
}

applyTheme(document.documentElement.dataset.theme || 'dark');

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme, true);
});

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const id = link.getAttribute('href').substring(1);
    const targetSection = document.getElementById(id);
    if(targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth' });
    }
    closeMenu();
  });
});

document.getElementById('current-year').textContent = new Date().getFullYear();
