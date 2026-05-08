import React, { useEffect, useRef, useState } from 'react';
import { Layers, ZoomIn, ZoomOut, RotateCw, Eye, EyeOff } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type GlassMesh = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  originalOpacity: number;
  originalTransparent: boolean;
};

export function BuildingView() {
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [showUiOverlay, setShowUiOverlay] = useState(true);
  const [isAutoRotate, setIsAutoRotate] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [selectedRoomName, setSelectedRoomName] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const selectedMeshRef = useRef<THREE.Mesh | null>(null);
  const glbModelRef = useRef<THREE.Object3D | null>(null);
  const glassMeshesRef = useRef<GlassMesh[]>([]);
  const initialCameraPositionRef = useRef(new THREE.Vector3(12, 10, 15));
  const initialTargetRef = useRef(new THREE.Vector3(0, 2, 0));

  const floors = [
    { id: 5, name: 'Roof', sensors: 12, status: 'optimal' },
    { id: 4, name: 'Floor 3', sensors: 45, status: 'optimal' },
    { id: 3, name: 'Floor 2', sensors: 48, status: 'warning' },
    { id: 2, name: 'Floor 1', sensors: 52, status: 'optimal' },
    { id: 1, name: 'Ground Floor', sensors: 38, status: 'optimal' },
    { id: 0, name: 'Basement', sensors: 24, status: 'optimal' },
  ];

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let isDisposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera.position.copy(initialCameraPositionRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0xffffff, 1);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(18, 24, 12);
    scene.add(dirLight);
    scene.add(new THREE.GridHelper(60, 60, 0xd4d4d8, 0xe4e4e7));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(initialTargetRef.current);
    controlsRef.current = controls;

    const setInteriorGlassMode = (enabled: boolean) => {
      glassMeshesRef.current.forEach(({ mesh, material, originalOpacity, originalTransparent }) => {
        if (enabled) {
          material.transparent = true;
          material.opacity = 0.03;
          material.depthWrite = false;
          mesh.renderOrder = 2;
        } else {
          material.transparent = originalTransparent;
          material.opacity = originalOpacity;
          material.depthWrite = true;
          mesh.renderOrder = 0;
        }
        material.needsUpdate = true;
      });
    };

    const focusObject = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) * 0.6 || 2;

      const direction = camera.position.clone().sub(controls.target).normalize();
      const targetPosition = center.clone().add(direction.multiplyScalar(Math.max(radius * 0.9, 1.2)));
      targetPosition.y += Math.max(size.y * 0.05, 0.35);

      camera.position.copy(targetPosition);
      controls.target.copy(center);
      controls.update();
    };

    const clearSelectionAndRestore = () => {
      const selected = selectedMeshRef.current;
      if (selected && selected.material && !Array.isArray(selected.material) && 'emissive' in selected.material) {
        (selected.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      }
      selectedMeshRef.current = null;
      setSelectedRoomName(null);
      setInteriorGlassMode(false);
      camera.position.copy(initialCameraPositionRef.current);
      controls.target.copy(initialTargetRef.current);
      controls.update();
    };

    const loader = new GLTFLoader();
    loader.load(
      '/models/building.glb',
      (gltf) => {
        if (isDisposed) return;

        const loaded = gltf.scene;
        glbModelRef.current = loaded;
        glassMeshesRef.current = [];

        const box = new THREE.Box3().setFromObject(loaded);
        const center = box.getCenter(new THREE.Vector3());
        loaded.position.sub(center);

        loaded.traverse((obj) => {
          if (!(obj as THREE.Mesh).isMesh) return;
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          const material = mesh.material;
          if (!material || Array.isArray(material)) return;
          const stdMat = material as THREE.MeshStandardMaterial;

          const label = `${mesh.name} ${stdMat.name}`.toLowerCase();
          const looksLikeGlass =
            label.includes('glass') ||
            label.includes('window') ||
            label.includes('vitre') ||
            label.includes('fenetre') ||
            (typeof stdMat.opacity === 'number' && stdMat.opacity < 0.75);

          if (looksLikeGlass) {
            glassMeshesRef.current.push({
              mesh,
              material: stdMat,
              originalOpacity: stdMat.opacity,
              originalTransparent: stdMat.transparent,
            });
          }
        });

        scene.add(loaded);
        setModelError(null);
      },
      undefined,
      () => {
        if (isDisposed) return;
        setModelError('Modele introuvable: ajoutez public/models/building.glb');
      }
    );

    const onPointerClick = (event: MouseEvent) => {
      if (!glbModelRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const hits = raycasterRef.current.intersectObjects([glbModelRef.current], true);
      if (hits.length === 0) {
        clearSelectionAndRestore();
        return;
      }

      const clickedMesh = hits[0].object as THREE.Mesh;
      const clickedMat = clickedMesh.material;
      if (clickedMat && !Array.isArray(clickedMat) && 'emissive' in clickedMat) {
        if (selectedMeshRef.current && selectedMeshRef.current.material && !Array.isArray(selectedMeshRef.current.material)) {
          (selectedMeshRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        }
        (clickedMat as THREE.MeshStandardMaterial).emissive.setHex(0x444444);
      }
      selectedMeshRef.current = clickedMesh;
      setSelectedRoomName(clickedMesh.name?.trim() || 'Salle selectionnee');

      // Enter room: make glass almost invisible
      setInteriorGlassMode(true);
      focusObject(clickedMesh);
    };

    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    renderer.domElement.addEventListener('click', onPointerClick);
    window.addEventListener('resize', handleResize);

    const animate = () => {
      if (isDisposed) return;
      controls.autoRotate = isAutoRotate;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      isDisposed = true;
      renderer.domElement.removeEventListener('click', onPointerClick);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      glbModelRef.current = null;
      selectedMeshRef.current = null;
      glassMeshesRef.current = [];
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isAutoRotate]);

  const zoomIn = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(0.9);
    camera.position.copy(controls.target.clone().add(dir));
  };

  const zoomOut = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(1.1);
    camera.position.copy(controls.target.clone().add(dir));
  };

  const exitRoom = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    glassMeshesRef.current.forEach(({ mesh, material, originalOpacity, originalTransparent }) => {
      material.transparent = originalTransparent;
      material.opacity = originalOpacity;
      material.depthWrite = true;
      material.needsUpdate = true;
      mesh.renderOrder = 0;
    });

    if (selectedMeshRef.current?.material && !Array.isArray(selectedMeshRef.current.material) && 'emissive' in selectedMeshRef.current.material) {
      (selectedMeshRef.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
    }
    selectedMeshRef.current = null;
    setSelectedRoomName(null);
    camera.position.copy(initialCameraPositionRef.current);
    controls.target.copy(initialTargetRef.current);
    controls.update();
  };

  return (
    <div className="soft-page p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">3D Building Model</h2>
        <p className="text-zinc-400">Interactive building visualization and sensor mapping</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-3 bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Building Model</h3>
            <div className="flex items-center gap-2">
              <button onClick={zoomIn} className="p-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-all">
                <ZoomIn className="w-5 h-5 text-zinc-400" />
              </button>
              <button onClick={zoomOut} className="p-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-all">
                <ZoomOut className="w-5 h-5 text-zinc-400" />
              </button>
              <button
                onClick={() => setIsAutoRotate((prev) => !prev)}
                className="p-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-all"
              >
                <RotateCw className="w-5 h-5 text-zinc-400" />
              </button>
              <button
                onClick={() => setShowUiOverlay((prev) => !prev)}
                className="p-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-all"
              >
                {showUiOverlay ? <Eye className="w-5 h-5 text-zinc-400" /> : <EyeOff className="w-5 h-5 text-zinc-400" />}
              </button>
              <button
                onClick={exitRoom}
                className="px-3 py-2 bg-zinc-800/60 hover:bg-zinc-700/60 rounded-lg transition-all text-xs text-zinc-200"
              >
                Sortir
              </button>
            </div>
          </div>

          <div className="relative bg-white rounded-lg h-[600px] overflow-hidden">
            <div ref={containerRef} className="absolute inset-0" />
            {showUiOverlay && (
              <div className="absolute right-4 top-4 rounded-lg border border-zinc-300 bg-white/95 px-3 py-2 text-xs text-zinc-700">
                 Clic salle: entrer | Sortir: restaurer vitres
              </div>
            )}

            {(selectedRoomName || modelError) && (
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-xl border border-zinc-300 rounded-lg p-4 max-w-xs">
                {modelError ? (
                  <p className="text-sm text-amber-700">{modelError}</p>
                ) : (
                  <div>
                    <h4 className="text-zinc-800 font-semibold mb-2">{selectedRoomName}</h4>
                    <p className="text-xs text-zinc-500">Mode interieur actif (verre masque)</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-4">Building Floors</h3>
            <div className="space-y-2">
              {floors.map((floor) => (
                <button
                  key={floor.id}
                  onClick={() => setSelectedFloor(floor.id === selectedFloor ? null : floor.id)}
                  className={`w-full p-3 rounded-lg border transition-all ${
                    selectedFloor === floor.id
                      ? 'bg-blue-500/20 border-blue-500/50 text-white'
                      : 'bg-zinc-800/30 border-zinc-800/50 text-zinc-400 hover:border-zinc-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      <span className="font-medium">{floor.name}</span>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${floor.status === 'optimal' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  </div>
                  <div className="mt-2 text-xs text-left">
                    <span className="text-zinc-500">{floor.sensors} sensors</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
