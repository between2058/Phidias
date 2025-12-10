'use client'

import { Canvas, useGraph } from '@react-three/fiber'
import { OrbitControls, Environment, Grid, Center, useGLTF, Outlines } from '@react-three/drei'
import { useAppStore, SceneNode } from '@/store/useAppStore'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url)
    const { setThreeScene, selectedNodeIds, toggleNodeSelection } = useAppStore()
    const [hovered, setHover] = useState<string | null>(null)

    // Pass scene reference to store
    useEffect(() => {
        setThreeScene(scene)
    }, [scene, setThreeScene])

    // Memoize selection material or outline logic
    // For MVP, we will traverse and clone materials or use Outlines component on selected meshes

    return (
        <group
            onPointerMissed={(e) => {
                if (e.type === 'click') toggleNodeSelection('', false)
            }}
        >
            <primitive
                object={scene}
                onClick={(e: any) => {
                    e.stopPropagation()
                    // Find the mesh that was clicked
                    const mesh = e.object
                    toggleNodeSelection(mesh.uuid, e.metaKey || e.ctrlKey)
                }}
                onPointerOver={(e: any) => {
                    e.stopPropagation()
                    setHover(e.object.uuid)
                }}
                onPointerOut={(e: any) => {
                    e.stopPropagation()
                    setHover(null)
                }}
            />

            {/* Render outlines for selected objects */}
            {selectedNodeIds.map(id => {
                const obj = scene.getObjectByProperty('uuid', id)
                if (obj && (obj as THREE.Mesh).isMesh) {
                    return (
                        <mesh key={id} geometry={(obj as THREE.Mesh).geometry} position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
                            {/* We need to match the transform of the object. 
                            However, the primitive is already in the scene. 
                            A simpler way for MVP is to just rely on the selection state 
                            and maybe change emission or use a Selection wrapper.
                            For now, let's try a direct approach: Traverse and modify material emissions? 
                            No, that's destructive. 
                            Let's use a helper component to highlight.
                        */}
                        </mesh>
                    )
                }
                return null
            })}
            <SelectionHighlighter scene={scene} selectedIds={selectedNodeIds} />
        </group>
    )
}

function SelectionHighlighter({ scene, selectedIds }: { scene: THREE.Group, selectedIds: string[] }) {
    // This is a quick way to highlight. In production, use PostProcessing Selection.
    // For MVP, we will manually clone and render a wireframe or outline.
    // Actually, `drei` has <Outlines> but it needs to be inside a mesh.
    // Let's optimize: When traversing the scene, we can conditionally wrap meshes.
    // But since we use <primitive object={scene} />, we can't easily wrap inner meshes.
    // We will use a useEffect to update materials emissive color as a visual feedback for now.

    useEffect(() => {
        const originalMaterials = new Map<string, THREE.Material | THREE.Material[]>();
        const modifiedMaterials: THREE.Material[] = [];

        scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                // Store original if not stored
                if (!originalMaterials.has(mesh.uuid)) {
                    originalMaterials.set(mesh.uuid, mesh.material);
                }

                const isSelected = selectedIds.includes(mesh.uuid);
                if (isSelected) {
                    // Clone and make emissive
                    const originalMat = mesh.material;
                    const mat = Array.isArray(originalMat) ? originalMat[0].clone() : originalMat.clone();

                    if ('emissive' in mat) {
                        (mat as any).emissive.setHex(0x00ff00);
                        (mat as any).emissiveIntensity = 0.5;
                    }
                    mesh.material = mat;
                    modifiedMaterials.push(mat);
                } else {
                    // Restore
                    if (originalMaterials.has(mesh.uuid)) {
                        mesh.material = originalMaterials.get(mesh.uuid)!;
                    }
                }
            }
        })

        return () => {
            // Cleanup cloned materials
            modifiedMaterials.forEach(mat => mat.dispose());

            // Restore all originals on unmount/change
            scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                    const mesh = obj as THREE.Mesh;
                    if (originalMaterials.has(mesh.uuid)) {
                        mesh.material = originalMaterials.get(mesh.uuid)!;
                    }
                }
            });
        }
    }, [scene, selectedIds])

    return null
}

import { SciFiLoader } from './SciFiLoader'

// ... existing imports ...

export function Viewer3D() {
    const { currentGlbUrl, isGenerating } = useAppStore()

    return (
        <div className="h-full w-full bg-neutral-900 rounded-lg overflow-hidden relative">
            <Canvas camera={{ position: [2, 2, 5], fov: 50 }} dpr={[1, 2]}> {/* Adjusted Camera for better loader view */}
                <color attach="background" args={['#111']} />
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} />

                {isGenerating ? (
                    <SciFiLoader />
                ) : (
                    <>
                        <Grid infiniteGrid fadeDistance={50} sectionColor="#444" cellColor="#222" />
                        <OrbitControls makeDefault />
                        <Environment preset="city" />
                        <Suspense fallback={null}>
                            {currentGlbUrl && (
                                <Center>
                                    <Model url={currentGlbUrl} />
                                </Center>
                            )}
                        </Suspense>
                    </>
                )}
            </Canvas>

            {!isGenerating && (
                <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded text-xs backdrop-blur font-mono">
                    {currentGlbUrl ? 'Model Loaded' : 'Viewer Ready'}
                </div>
            )}

            {isGenerating && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[#00f3ff] font-mono text-sm tracking-widest animate-pulse">
                    GENERATING ASSET...
                </div>
            )}
        </div>
    )
}
