'use client'

import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppStore, SceneNode } from "@/store/useAppStore"
import { cn } from "@/lib/utils"
import { ChevronRight, ChevronDown, Box, Layers, FolderPlus, GripVertical, Pencil, Download, Wand2, BrainCircuit, Settings, Loader2, Ungroup, Merge, Move, RotateCw, Maximize } from "lucide-react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { exportGLB, exportUSDZ } from "@/utils/exporters"
import { SettingsModal } from "@/components/ui/SettingsModal"
import { api } from "@/services/api"
import { captureObjectSnapshot, captureMultiviewSnapshot } from "@/utils/snapshot"
import { findNodeByUuid } from "@/utils/scene"
import * as THREE from 'three'

export function SceneGraph() {
    const {
        sceneGraph, selectedNodeIds, toggleNodeSelection, groupNodes, scene, gl, camera,
        updateNodeNames, aiSettings, hasRenamed, applyAutoGroup,
        isRenaming, setRenaming, isGrouping, setGrouping, isAnalyzing, setAnalyzing,
        setDebugImage, mergeNodes, transformMode, setTransformMode
    } = useAppStore()
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [progress, setProgress] = useState(0)

    // Smart Organize State
    const [isSmartOrganizeOpen, setIsSmartOrganizeOpen] = useState(false)
    const [objectNameInput, setObjectNameInput] = useState("")

    const handleGroup = () => {
        if (selectedNodeIds.length < 1) return
        groupNodes(selectedNodeIds)
    }

    const handleExportGLB = () => {
        if (scene) exportGLB(scene, 'phidias_model')
    }

    const handleMerge = () => {
        if (selectedNodeIds.length < 2) return
        mergeNodes()
    }

    const handleExportUSDZ = () => {
        if (scene) exportUSDZ(scene, 'phidias_model')
    }

    const handleOpenSmartOrganize = () => {
        setIsSmartOrganizeOpen(true)
        setObjectNameInput("3D Model") // Reset to default
    }

    const handleSmartOrganize = async () => {
        if (!scene) return
        setIsSmartOrganizeOpen(false) // Close dialog

        try {
            // STEP 1: Global Analysis
            setAnalyzing(true)

            // Capture whole scene for context
            // No highlight, tighter framing (1.0) and Multiview for VLM analysis
            const contextSnapshot = await captureMultiviewSnapshot(scene, scene, gl!, { highlight: false, padding: 1.0 })
            setDebugImage(contextSnapshot)

            // Ask VLM for categories
            const { categories } = await api.analyzeModel(contextSnapshot, objectNameInput, aiSettings)
            console.log("Identified Categories:", categories)

            setAnalyzing(false)
            setDebugImage(null)

            // STEP 2: Classification & Renaming
            setRenaming(true)

            const meshes: THREE.Mesh[] = []
            scene.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    meshes.push(child as THREE.Mesh)
                }
            })

            const classificationResults: { id: string, name: string, category: string }[] = []
            const nameCounts: Record<string, number> = {}

            // Process matches
            for (const mesh of meshes) {
                const box = new THREE.Box3().setFromObject(mesh)
                if (box.isEmpty()) continue

                // Use Multiview Snapshot for robust classification
                // We keep highlight enabled (default)
                // Use Multiview Snapshot for robust classification
                // We keep highlight enabled (default)
                // Reduce padding to 1.2 for a closer look
                const snapshot = await captureMultiviewSnapshot(mesh, scene, gl!, { padding: 1.5 })
                setDebugImage(snapshot)

                try {
                    const { category } = await api.classifyPart(snapshot, categories, aiSettings)
                    console.log(`[Smart Organize] Mesh ${mesh.uuid} classified as: ${category}`)

                    // Generate Name: Category_Index
                    if (!nameCounts[category]) nameCounts[category] = 0
                    nameCounts[category]++
                    const newName = `${category}_${nameCounts[category]}`

                    classificationResults.push({
                        id: mesh.uuid,
                        name: newName,
                        category: category
                    })
                } catch (e) {
                    console.error("Classification failed for mesh", mesh.uuid, e)
                }
            }

            // Apply Renames
            updateNodeNames(classificationResults.map(r => ({ id: r.id, name: r.name })))

            setRenaming(false)
            setDebugImage(null)

            // STEP 3: Grouping
            setGrouping(true)

            // Create Groups based on categories
            const groupsMap: Record<string, string[]> = {}
            classificationResults.forEach(r => {
                if (!groupsMap[r.category]) groupsMap[r.category] = []
                groupsMap[r.category].push(r.id)
            })

            const groupData = Object.entries(groupsMap).map(([name, ids]) => ({
                name: `${name}s`, // Pluralize
                ids: ids
            }))

            applyAutoGroup(groupData)

            setGrouping(false)

        } catch (error) {
            console.error("Smart Organize Failed:", error)
            setAnalyzing(false)
            setRenaming(false)
            setGrouping(false)
            setDebugImage(null)
        }
    }

    if (sceneGraph.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                <Layers className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">No model hierarchy</p>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-background/80 backdrop-blur-md border-l border-border/50">
            <div className="p-2 border-b border-border/50 bg-muted/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Layers className="w-3 h-3" /> Scene Graph
                    </h3>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleGroup}
                            disabled={selectedNodeIds.length === 0}
                            title="Group Selected"
                        >
                            <FolderPlus className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleMerge}
                            title="Merge Selected"
                            disabled={selectedNodeIds.length < 2}
                        >
                            <Merge className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setIsSettingsOpen(true)}
                            title="AI Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    title="Export"
                                >
                                    <Download className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleExportGLB}>
                                    Export as .GLB
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportUSDZ}>
                                    Export as .USDZ
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-7 text-[10px]"
                        onClick={handleOpenSmartOrganize}
                        disabled={isRenaming || isGrouping || isAnalyzing}
                        title="Smart Organize (Analyze -> Rename -> Group)"
                    >
                        {isAnalyzing ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing...</>
                        ) : isRenaming ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Renaming...</>
                        ) : isGrouping ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Grouping...</>
                        ) : (
                            <><Wand2 className="w-3 h-3 mr-1" /> Smart Organize</>
                        )}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-2">
                <div className="flex flex-col gap-1">
                    {sceneGraph.map(node => (
                        <SceneGraphNode
                            key={node.id}
                            node={node}
                            selectedIds={selectedNodeIds}
                            onSelect={toggleNodeSelection}
                            depth={0}
                        />
                    ))}
                </div>
            </ScrollArea>

            <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

            <Dialog open={isSmartOrganizeOpen} onOpenChange={setIsSmartOrganizeOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Smart Organize</DialogTitle>
                        <DialogDescription>
                            Describe the object to help the AI identify its parts correctly.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-right text-sm font-medium">Object Name</span>
                            <Input
                                id="object-name"
                                value={objectNameInput}
                                onChange={(e) => setObjectNameInput(e.target.value)}
                                className="col-span-3"
                                placeholder="e.g. Cyberpunk Car, Mech Warrior"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSmartOrganize()
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsSmartOrganizeOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSmartOrganize} disabled={!objectNameInput.trim()}>
                            <Wand2 className="w-4 h-4 mr-2" /> Start Analysis
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function SceneGraphNode({
    node,
    selectedIds,
    onSelect,
    depth
}: {
    node: SceneNode,
    selectedIds: string[],
    onSelect: (id: string, multi: boolean) => void,
    depth: number
}) {
    const { renameNode, reparentNode } = useAppStore()
    const [isExpanded, setIsExpanded] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(node.name)
    const hasChildren = node.children && node.children.length > 0
    const isSelected = selectedIds.includes(node.id)

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation()
        onSelect(node.id, e.metaKey || e.ctrlKey)
    }

    const handleRename = () => {
        if (editName.trim() && editName !== node.name) {
            renameNode(node.id, editName)
        }
        setIsEditing(false)
    }

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('nodeId', node.id)
        e.stopPropagation()
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const draggedId = e.dataTransfer.getData('nodeId')
        if (draggedId && draggedId !== node.id) {
            reparentNode(draggedId, node.id)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault() // Allow drop
    }

    return (
        <div className="flex flex-col select-none">
            <div
                className={cn(
                    "flex items-center gap-1 py-1 px-2 rounded-sm cursor-pointer transition-colors text-xs hover:bg-muted/50 group",
                    isSelected && "bg-primary/20 hover:bg-primary/30 text-primary font-medium"
                )}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                onClick={handleSelect}
                onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
                draggable
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                {/* Drag Handle Indicator (optional visual) */}
                <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing mr-1" />

                {hasChildren ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}
                        className="p-0.5 hover:bg-background/20 rounded"
                    >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                ) : (
                    <span className="w-4" /> // Spacer
                )}

                {node.children && node.children.length > 0 ? (
                    <FolderPlus className="w-3 h-3 opacity-70 text-yellow-500" />
                ) : (
                    <Box className="w-3 h-3 opacity-70" />
                )}

                {isEditing ? (
                    <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        className="h-5 text-xs py-0 px-1 w-full"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="truncate">{node.name || 'Unnamed'}</span>
                )}

                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                            e.stopPropagation()
                            setIsEditing(true)
                        }}
                        title="Rename"
                    >
                        <Pencil className="w-3 h-3" />
                    </Button>
                    <span className="text-[10px] opacity-40 font-mono">{node.type}</span>
                </div>
            </div>

            {hasChildren && isExpanded && (
                <div className="flex flex-col gap-0.5 relative">
                    {node.children!.map(child => (
                        <SceneGraphNode
                            key={child.id}
                            node={child}
                            selectedIds={selectedIds}
                            onSelect={onSelect}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

