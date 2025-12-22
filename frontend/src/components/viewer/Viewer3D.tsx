'use client'

import { Canvas, useGraph, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Grid, Center, useGLTF, Outlines } from '@react-three/drei'
import { useAppStore, SceneNode } from '@/store/useAppStore'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url)
    const { setThreeScene, setThreeContext, selectedNodeIds, toggleNodeSelection } = useAppStore()
    const { gl, camera } = useThree()
    const [hovered, setHover] = useState<string | null>(null)

    // Pass scene reference to store
    useEffect(() => {
        setThreeScene(scene)
        setThreeContext(gl, camera)
    }, [scene, gl, camera, setThreeScene, setThreeContext])

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

                // Store original material in userData if not already there
                if (!mesh.userData.__originalMaterial) {
                    mesh.userData.__originalMaterial = mesh.material;
                }

                const isSelected = selectedIds.includes(mesh.uuid);

                // Reset to original before applying logic (idempotency)
                if (mesh.userData.__originalMaterial) {
                    mesh.material = mesh.userData.__originalMaterial;
                }

                if (isSelected) {
                    // Clone and make emissive
                    const originalMat = mesh.material;
                    const mat = Array.isArray(originalMat) ? originalMat[0].clone() : originalMat.clone();

                    if ('emissive' in mat) {
                        (mat as any).emissive.setHex(0x00ff00);
                        (mat as any).emissiveIntensity = 0.5;
                    }
                    mesh.material = mat;
                }
            }
        })

        // No cleanup needed for local map, but we should restore on unmount
        return () => {
            scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                    const mesh = obj as THREE.Mesh;
                    if (mesh.userData.__originalMaterial) {
                        mesh.material = mesh.userData.__originalMaterial;
                    }
                }
            });
        }
    }, [scene, selectedIds])

    return null
}

import { SciFiLoader } from './SciFiLoader'
import { SciFiEffects } from './SciFiEffects'

// ... existing imports ...

import { Wand2, Loader2, Download } from 'lucide-react'
import { GLTFExporter } from 'three-stdlib'
import { api, base64ToBlob } from '@/services/api'
import { Button } from '@/components/ui/button'

export function Viewer3D() {
    const { currentGlbUrl, isGenerating, setGlbUrl, scene: threeScene, isSegmenting, setSegmenting, debugImage } = useAppStore()

    const handleSegmentation = async () => {
        if (!threeScene) return
        setSegmenting(true)

        try {
            // 1. Export current scene to GLB
            const exporter = new GLTFExporter()
            const glbBlob = await new Promise<Blob>((resolve, reject) => {
                exporter.parse(
                    threeScene,
                    (result) => {
                        const output = result as ArrayBuffer
                        resolve(new Blob([output], { type: 'model/gltf-binary' }))
                    },
                    (error) => reject(error),
                    { binary: true }
                )
            })

            // 2. Convert to Base64
            const reader = new FileReader()
            reader.readAsDataURL(glbBlob)
            reader.onloadend = async () => {
                const base64data = reader.result as string
                const base64Content = base64data.split(',')[1]

                try {
                    // 3. Call API
                    const response = await api.segment3D(base64Content)

                    if (response.glb_data) {
                        // 4. Load new GLB
                        const newBlob = base64ToBlob(response.glb_data)
                        const newUrl = URL.createObjectURL(newBlob)
                        setGlbUrl(newUrl)
                        console.log("Segmentation complete. Loaded new model.")
                    }
                } catch (e) {
                    console.error("API Error:", e)
                } finally {
                    setSegmenting(false)
                }
            }
        } catch (e) {
            console.error("Export Error:", e)
            setSegmenting(false)
        }
    }

    return (
        <div className="h-full w-full bg-neutral-900 rounded-lg overflow-hidden relative group">
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
                                    <SciFiEffects />
                                </Center>
                            )}
                        </Suspense>
                    </>
                )}
            </Canvas>

            {/* Status Overlay */}
            {!isGenerating && (
                <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded text-xs backdrop-blur font-mono pointer-events-none">
                    {currentGlbUrl ? 'Model Loaded' : 'Viewer Ready'}
                </div>
            )}

            {/* Toolbar Overlay */}
            {!isGenerating && currentGlbUrl && (
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleSegmentation}
                        disabled={isSegmenting}
                        className="h-8 w-8 bg-black/50 hover:bg-black/70 backdrop-blur border border-white/10 text-white"
                        title="Auto Segment (P3-SAM)"
                    >
                        {isSegmenting ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Wand2 className="w-4 h-4" />}
                    </Button>
                </div>
            )}

            {/* Vision Input Preview (Bottom Left) */}
            {debugImage && (
                <div className="absolute bottom-4 left-4 p-2 bg-black/80 border border-white/20 rounded max-w-[200px] z-50 pointer-events-none backdrop-blur-md">
                    <p className="text-[10px] text-[#00f3ff] mb-1 font-mono uppercase tracking-wider">AI Vision Input</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={debugImage} className="w-full h-auto rounded border border-white/10" />
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
