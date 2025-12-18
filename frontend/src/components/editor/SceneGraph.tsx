'use client'

import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppStore, SceneNode } from "@/store/useAppStore"
import { cn } from "@/lib/utils"
import { ChevronRight, ChevronDown, Box, Layers, FolderPlus, GripVertical, Pencil, Download, Wand2, BrainCircuit, Settings, Loader2 } from "lucide-react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { exportGLB, exportUSDZ } from "@/utils/exporters"
import { SettingsModal } from "@/components/ui/SettingsModal"
import { api } from "@/services/api"
import { captureObjectSnapshot } from "@/utils/snapshot"
import { findNodeByUuid } from "@/utils/scene"
import * as THREE from 'three'

export function SceneGraph() {
    const {
        sceneGraph, selectedNodeIds, toggleNodeSelection, groupNodes, scene, gl, camera,
        updateNodeNames, aiSettings, hasRenamed, applyAutoGroup,
        isRenaming, setRenaming, isGrouping, setGrouping
    } = useAppStore()
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [progress, setProgress] = useState(0)
    const [debugImage, setDebugImage] = useState<string | null>(null)

    const handleGroup = () => {
        if (selectedNodeIds.length < 1) return
        groupNodes(selectedNodeIds)
    }

    const handleExportGLB = () => {
        if (scene) exportGLB(scene, 'phidias_model')
    }

    const handleExportUSDZ = () => {
        if (scene) exportUSDZ(scene, 'phidias_model')
    }

    const handleAutoRename = async () => {
        if (!scene || !gl) return
        setRenaming(true)
        setProgress(0)

        // 1. Flatten nodes to iterate
        const nodesToProcess: SceneNode[] = []
        const traverse = (nodes: SceneNode[]) => {
            nodes.forEach(n => {
                nodesToProcess.push(n)
                if (n.children) traverse(n.children)
            })
        }
        traverse(sceneGraph)

        const total = nodesToProcess.length
        let processed = 0
        const updates: { id: string, name: string }[] = []

        // 2. Process each node
        for (const nodeData of nodesToProcess) {
            const obj = findNodeByUuid(scene, nodeData.id)
            if (obj && (obj as THREE.Mesh).isMesh) {
                const snapshotUrl = captureObjectSnapshot(obj, scene, gl)
                setDebugImage(snapshotUrl)

                try {
                    // Call VLM
                    const result = await api.enhanceRename(snapshotUrl, undefined, aiSettings)
                    if (result.name && !result.name.startsWith("Error")) {
                        // Check for duplicates in current batch or existing names?
                        // For now, let's just append index if duplicated in the update list
                        let newName = result.name
                        let counter = 1
                        while (updates.some(u => u.name === newName)) {
                            newName = `${result.name}_${counter++}`
                        }
                        updates.push({ id: nodeData.id, name: newName })
                    }
                } catch (e) {
                    console.error("Rename error for", nodeData.name, e)
                }
                processed++
                setProgress(Math.round((processed / total) * 100))
            }
        }

        // 3. Update Store
        if (updates.length > 0) {
            updateNodeNames(updates)
        }

        setRenaming(false)
        setDebugImage(null)
    }

    const handleAutoGroup = async () => {
        if (!scene) return
        setGrouping(true)

        try {
            // Send current hierarchy to LLM
            // To save tokens, we might want to send a simplified list of {id, name, type}
            const nodesToProcess: { id: string, name: string }[] = []
            const traverse = (nodes: SceneNode[]) => {
                nodes.forEach(n => {
                    nodesToProcess.push({ id: n.id, name: n.name })
                    if (n.children) traverse(n.children)
                })
            }
            traverse(sceneGraph)

            const result = await api.enhanceGroup(nodesToProcess, undefined, aiSettings)

            // Expecting result to have a "groups" key with list of groups
            console.log("Grouping Result:", result)

            if (result.groups && Array.isArray(result.groups)) {
                applyAutoGroup(result.groups)
            } else if (result.hierarchy && Array.isArray(result.hierarchy)) {
                // Legacy or fallback support
                applyAutoGroup(result.hierarchy)
            } else if (Array.isArray(result)) {
                applyAutoGroup(result)
            } else {
                console.warn("Unexpected grouping format", result)
            }
        } catch (e) {
            console.error("Grouping error", e)
        } finally {
            setGrouping(false)
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
                        onClick={handleAutoRename}
                        disabled={isRenaming}
                    >
                        {isRenaming ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> {progress}%</>
                        ) : (
                            <><Wand2 className="w-3 h-3 mr-1" /> Auto Rename</>
                        )}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-7 text-[10px]"
                        onClick={handleAutoGroup}
                        disabled={isGrouping}
                        title={isGrouping ? "Grouping..." : "Auto Group"}
                    >
                        {isGrouping ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <><BrainCircuit className="w-3 h-3 mr-1" /> Auto Group</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Debug Image Preview */}
            {isRenaming && debugImage && (
                <div className="p-2 border-b border-border/50 bg-muted/20 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Identifying...</span>
                    <div className="relative w-24 h-24 border border-border rounded overflow-hidden bg-black/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={debugImage} alt="Debug" className="w-full h-full object-contain" />
                    </div>
                </div>
            )}

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

