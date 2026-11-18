"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  RotateLeft01Icon,
  SparklesIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

interface ThreeModelViewerProps {
  url: string;
  name?: string;
  className?: string;
}

export function ThreeModelViewer({ url, name, className = "" }: ThreeModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Strict format check for GLB / GLTF
    const cleanUrl = url.toLowerCase().split("?")[0];
    if (!cleanUrl.endsWith(".glb") && !cleanUrl.endsWith(".gltf")) {
      setError("Only .glb or .gltf 3D formats are supported.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 240;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.2, 3.5);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. OrbitControls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 2.0;
    controls.maxDistance = 20;
    controls.minDistance = 0.5;
    controlsRef.current = controls;

    // 5. Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight1.position.set(5, 8, 6);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa5b4fc, 1.2);
    dirLight2.position.set(-5, -3, -4);
    scene.add(dirLight2);

    // 6. GLTF / GLB Loader
    const loader = new GLTFLoader();
    let loadedModel: THREE.Group | null = null;

    loader.load(
      url,
      (gltf) => {
        loadedModel = gltf.scene;

        // Auto-center & auto-scale to fit viewport
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.0 / maxDim;

        loadedModel.scale.set(scale, scale, scale);
        loadedModel.position.x = -center.x * scale;
        loadedModel.position.y = -center.y * scale;
        loadedModel.position.z = -center.z * scale;

        scene.add(loadedModel);
        setLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => {
        console.error("Three.js GLTF load error:", err);
        setError("Failed to load 3D model. Check GLB/GLTF file.");
        setLoading(false);
      }
    );

    // 7. Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    });
    resizeObserver.observe(container);

    // 9. Cleanup
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.dispose();

      if (loadedModel) {
        loadedModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.geometry?.dispose();
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((m) => m.dispose());
            } else {
              mesh.material?.dispose();
            }
          }
        });
      }

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [url]);

  // Sync autoRotate state
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  const handleResetCamera = () => {
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(0, 1.2, 3.5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className={`relative w-full h-full min-h-[220px] bg-zinc-950/80 rounded-2xl overflow-hidden group ${className}`}>
      {/* 3D Canvas Mount Point */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-sm z-10">
          <div className="size-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mb-2" />
          <p className="text-xs text-white/80 font-medium">Loading 3D Asset…</p>
          {loadProgress > 0 && (
            <p className="text-[10px] text-white/40 mt-0.5">{loadProgress}%</p>
          )}
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 p-4 text-center z-10">
          <p className="text-xs text-red-400 font-medium mb-1">3D Preview Unavailable</p>
          <p className="text-[11px] text-white/50">{error}</p>
        </div>
      )}

      {/* Top Floating Controls on Hover */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/90 border border-white/15 rounded-xl p-1 backdrop-blur-md shadow-lg z-20">
          <button
            onClick={() => setAutoRotate((prev) => !prev)}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              autoRotate ? "text-emerald-400 bg-emerald-500/20" : "text-white/60 hover:text-white"
            }`}
            title={autoRotate ? "Pause Auto-Rotation" : "Enable Auto-Rotation"}
          >
            <HugeiconsIcon icon={RotateLeft01Icon} className="size-3.5" />
          </button>

          <button
            onClick={handleResetCamera}
            className="p-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Reset Camera View"
          >
            <HugeiconsIcon icon={ViewIcon} className="size-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Model Badge */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/60 border border-white/10 backdrop-blur-sm pointer-events-none text-[10px] text-white/80">
        <HugeiconsIcon icon={SparklesIcon} className="size-3 text-emerald-400" />
        <span className="font-medium truncate max-w-[150px]">{name || "3D GLTF Model"}</span>
      </div>
    </div>
  );
}
