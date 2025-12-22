'use client'

import { Canvas, useGraph, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Grid, Center, useGLTF, Outlines, TransformControls, Html, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Move, RotateCw, Scale, MousePointer2, Wand2, Loader2, Download, Undo, Redo } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore, SceneNode } from '@/store/useAppStore'
import { Suspense, useEffect, useMemo, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFExporter } from 'three-stdlib'
import { api, base64ToBlob } from '@/services/api'
import { SciFiLoader } from './SciFiLoader'
import { SciFiEffects } from './SciFiEffects'

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url)
    const { setThreeScene, setThreeContext, selectedNodeIds, toggleNodeSelection, scene: storedScene } = useAppStore()
    const { gl, camera } = useThree()
    const [hovered, setHover] = useState<string | null>(null)

    // Pass scene reference to store on initial load
    useEffect(() => {
        if (!storedScene && scene) {
            setThreeScene(scene)
        }
        setThreeContext(gl, camera)
    }, [scene, gl, camera, setThreeScene, setThreeContext, storedScene])

    // Use stored scene if available (for Undo/Redo), otherwise initial GLTF scene
    const renderScene = storedScene || scene

    return (
        <group
            onPointerMissed={(e) => {
                if (e.type === 'click') toggleNodeSelection('', false)
            }}
        >
            <primitive
                object={renderScene}
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

            <SelectionHighlighter scene={renderScene} selectedIds={selectedNodeIds} />
            <TransformManager scene={renderScene} selectedIds={selectedNodeIds} />

            {/* HUD Panel - Rendered here to access useFrame */}
            {selectedNodeIds.length === 1 && (
                <TransformPanelOverlay scene={renderScene} selectedId={selectedNodeIds[0]} />
            )}
        </group>
    )
}

function TransformPanelOverlay({ scene, selectedId }: { scene: THREE.Group, selectedId: string }) {
    const object = useMemo(() => scene.getObjectByProperty('uuid', selectedId), [scene, selectedId])

    // Local state for smooth UI updates
    const [position, setPosition] = useState<number[]>([0, 0, 0])
    const [rotation, setRotation] = useState<number[]>([0, 0, 0])
    const [scale, setScale] = useState<number[]>([1, 1, 1])

    // Sync with object on every frame (inactive if object missing)
    useFrame(() => {
        if (!object) return
        const p = object.position
        const r = object.rotation
        const s = object.scale

        const prec = 1000
        const newPos = [Math.round(p.x * prec) / prec, Math.round(p.y * prec) / prec, Math.round(p.z * prec) / prec]
        const newRot = [Math.round(r.x * prec) / prec, Math.round(r.y * prec) / prec, Math.round(r.z * prec) / prec]
        const newScale = [Math.round(s.x * prec) / prec, Math.round(s.y * prec) / prec, Math.round(s.z * prec) / prec]

        if (newPos.some((v, i) => v !== position[i])) setPosition(newPos)
        if (newRot.some((v, i) => v !== rotation[i])) setRotation(newRot)
        if (newScale.some((v, i) => v !== scale[i])) setScale(newScale)
    })

    const updateTransform = (key: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => {
        if (!object || isNaN(value)) return

        if (key === 'position') {
            const newPos = [...position]; newPos[axis] = value;
            object.position.set(newPos[0], newPos[1], newPos[2])
            setPosition(newPos)
        } else if (key === 'rotation') {
            const newRot = [...rotation]; newRot[axis] = value;
            object.rotation.set(newRot[0], newRot[1], newRot[2])
            setRotation(newRot)
        } else if (key === 'scale') {
            const newScale = [...scale]; newScale[axis] = value;
            object.scale.set(newScale[0], newScale[1], newScale[2])
            setScale(newScale)
        }
        object.updateMatrixWorld()
    }

    if (!object) return null

    // Use <Html fullscreen> to overlay on entire canvas, then position absolutely
    return (
        <Html fullscreen style={{ pointerEvents: 'none' }}>
            <div className="absolute bottom-4 left-4 w-60 bg-black/80 backdrop-blur border border-white/10 rounded-lg p-3 text-xs font-mono text-white shadow-xl pointer-events-auto z-50">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                    <span className="text-[#00f3ff] font-bold uppercase truncate max-w-[150px]">{object.name || 'Selected'}</span>
                </div>

                <div className="grid grid-cols-[50px_1fr] gap-2 mb-2 items-center">
                    <span className="text-neutral-400">POS</span>
                    <div className="grid grid-cols-3 gap-1">
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={position[0]} onChange={e => updateTransform('position', 0, parseFloat(e.target.value))} />
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={position[1]} onChange={e => updateTransform('position', 1, parseFloat(e.target.value))} />
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={position[2]} onChange={e => updateTransform('position', 2, parseFloat(e.target.value))} />
                    </div>
                </div>

                <div className="grid grid-cols-[50px_1fr] gap-2 mb-2 items-center">
                    <span className="text-neutral-400">ROT</span>
                    <div className="grid grid-cols-3 gap-1">
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={rotation[0]} onChange={e => updateTransform('rotation', 0, parseFloat(e.target.value))} />
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={rotation[1]} onChange={e => updateTransform('rotation', 1, parseFloat(e.target.value))} />
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={rotation[2]} onChange={e => updateTransform('rotation', 2, parseFloat(e.target.value))} />
                    </div>
                </div>

                <div className="grid grid-cols-[50px_1fr] gap-2 items-center">
                    <span className="text-neutral-400">SCL</span>
                    <div className="grid grid-cols-3 gap-1">
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={scale[0]} onChange={e => updateTransform('scale', 0, parseFloat(e.target.value))} />
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={scale[1]} onChange={e => updateTransform('scale', 1, parseFloat(e.target.value))} />
                        <input className="bg-neutral-800 rounded px-1 text-right" type="number" step="0.1" value={scale[2]} onChange={e => updateTransform('scale', 2, parseFloat(e.target.value))} />
                    </div>
                </div>
            </div>
        </Html>
    )
}

function TransformManager({ scene, selectedIds }: { scene: THREE.Group, selectedIds: string[] }) {
    const { transformMode, snapshot } = useAppStore()

    // For MVP, only handle single selection for Gizmo
    const selectedObject = useMemo(() => {
        if (selectedIds.length !== 1) return null
        return scene.getObjectByProperty('uuid', selectedIds[0])
    }, [scene, selectedIds])

    if (!selectedObject) return null

    return (
        <TransformControls
            object={selectedObject}
            mode={transformMode}
            space="local"
            onMouseDown={() => {
                // Snapshot BEFORE the transform starts
                snapshot()
            }}
        />
    )
}

function SelectionHighlighter({ scene, selectedIds }: { scene: THREE.Group, selectedIds: string[] }) {
    useEffect(() => {
        scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;

                // Validate restored userData (handle JSON restore of plain objects)
                if (mesh.userData.__originalMaterial && typeof mesh.userData.__originalMaterial.clone !== 'function') {
                    // Invalid material object (likely from JSON restore), reset it
                    mesh.userData.__originalMaterial = null;
                    delete mesh.userData.__originalMaterial;
                }

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
                    if (originalMat) {
                        const mat = Array.isArray(originalMat) ? originalMat[0].clone() : originalMat.clone();

                        if ('emissive' in mat) {
                            (mat as any).emissive.setHex(0x00ff00);
                            (mat as any).emissiveIntensity = 0.5;
                        }
                        mesh.material = mat;
                    }
                }
            }
        })

        // No cleanup needed for local map, but we should restore on unmount
        // Note: undo/redo might replace scene, so we don't strictly need to cleanup *old* scene materials 
        // if the old scene is discarded, but it's good practice.
    }, [scene, selectedIds])

    return null
}

export default function Viewer3D() {
    const {
        currentGlbUrl, isGenerating, setGlbUrl, scene: threeScene,
        isSegmenting, setSegmenting, debugImage,
        transformMode, setTransformMode, undo, redo, setSelectedNodes, selectedNodeIds
    } = useAppStore()

    // Undo/Redo & Esc Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setSelectedNodes([])
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault()
                if (e.shiftKey) {
                    redo()
                } else {
                    undo()
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undo, redo, setSelectedNodes])

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
            <Canvas
                shadows
                camera={{ position: [2, 2, 5], fov: 50 }}
                dpr={[1, 2]}
                onPointerMissed={(e) => {
                    // Start deselect if clicked on background (and not on a mesh)
                    if (e.type === 'click') {
                        console.log("Canvas onPointerMissed fired")
                        setSelectedNodes([])
                    }
                }}
            >
                <color attach="background" args={['#111']} />
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} />

                {isGenerating ? (
                    <SciFiLoader />
                ) : (
                    <>
                        <Grid
                            infiniteGrid
                            fadeDistance={50}
                            sectionColor="#444"
                            cellColor="#222"
                            raycast={() => null}
                        />
                        <OrbitControls makeDefault />
                        <Environment preset="city" />

                        {/* Compass - increased top margin to 100px */}
                        <GizmoHelper alignment="top-right" margin={[80, 100]}>
                            <GizmoViewport axisColors={['#9d4b4b', '#2f7f4f', '#3b5b9d']} labelColor="white" />
                        </GizmoHelper>

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
                <div className="absolute top-4 left-4 flex flex-col gap-2 z-50">
                    {/* Transform Controls */}
                    <div className="flex items-center gap-1 bg-black/60 p-1 rounded-lg border border-white/10 backdrop-blur-md shadow-lg pointer-events-auto">
                        <Button
                            variant={transformMode === 'translate' ? 'secondary' : 'ghost'}
                            size="icon"
                            className={`h-8 w-8 ${transformMode === 'translate' ? 'text-black bg-white hover:bg-white/90' : 'text-white hover:bg-white/20'}`}
                            onClick={() => setTransformMode('translate')}
                            title="Translate (Move)"
                        >
                            <Move className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={transformMode === 'rotate' ? 'secondary' : 'ghost'}
                            size="icon"
                            className={`h-8 w-8 ${transformMode === 'rotate' ? 'text-black bg-white hover:bg-white/90' : 'text-white hover:bg-white/20'}`}
                            onClick={() => setTransformMode('rotate')}
                            title="Rotate"
                        >
                            <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={transformMode === 'scale' ? 'secondary' : 'ghost'}
                            size="icon"
                            className={`h-8 w-8 ${transformMode === 'scale' ? 'text-black bg-white hover:bg-white/90' : 'text-white hover:bg-white/20'}`}
                            onClick={() => setTransformMode('scale')}
                            title="Scale"
                        >
                            <Scale className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Undo/Redo */}
                    <div className="flex items-center gap-1 bg-black/60 p-1 rounded-lg border border-white/10 backdrop-blur-md shadow-lg pointer-events-auto">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={undo} title="Undo (Ctrl+Z)">
                            <Undo className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={redo} title="Redo (Ctrl+Shift+Z)">
                            <Redo className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleSegmentation}
                        disabled={isSegmenting}
                        className="h-8 w-8 bg-black/50 hover:bg-black/70 backdrop-blur border border-white/10 text-white pointer-events-auto mt-1"
                        title="Auto Part Segmentation"
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
