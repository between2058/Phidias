import { create } from 'zustand'
import * as THREE from 'three'
import { parseSceneGraph, findNodeByUuid } from '@/utils/scene'

export type ModelType = 'SAM1' | 'SAM-3D' | 'Trellis' | 'P3-SAM' | null

export interface MessageAction {
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link'
}

export interface ImageBatchItem {
    id: string
    originalUrl: string
    processedUrl?: string
    skipped?: boolean
}

export interface Message {
    id: string
    role: 'user' | 'system'
    content: string
    attachments?: string[] // Base64 strings
    actions?: MessageAction[]
    imageBatch?: ImageBatchItem[]  // For multi-image batches
}

export interface SceneNode {
    id: string
    name: string
    type: string
    children?: SceneNode[]
}

export interface AISettings {
    vlmBaseUrl: string
    vlmApiKey: string
    vlmModel: string
    llmBaseUrl: string
    llmApiKey: string
    llmModel: string
}

interface AppState {
    selectedModel: ModelType
    messages: Message[]
    isGenerating: boolean
    currentGlbUrl: string | null

    sceneGraph: SceneNode[]
    selectedNodeIds: string[]
    hasRenamed: boolean

    isRenaming: boolean
    isGrouping: boolean
    isSegmenting: boolean
    setRenaming: (isRenaming: boolean) => void
    setGrouping: (isGrouping: boolean) => void
    setSegmenting: (isSegmenting: boolean) => void

    // Three.js scene reference
    scene: THREE.Group | null
    gl: THREE.WebGLRenderer | null
    camera: THREE.Camera | null

    // Transform State
    transformMode: 'translate' | 'rotate' | 'scale'

    setModel: (model: ModelType) => void
    addMessage: (message: Message) => void
    setGenerating: (isGenerating: boolean) => void
    setGlbUrl: (url: string | null) => void

    setSceneGraph: (nodes: SceneNode[]) => void
    setSelectedNodes: (ids: string[]) => void
    toggleNodeSelection: (id: string, multiSelect?: boolean) => void

    // Editor Actions
    setThreeScene: (scene: THREE.Group) => void
    setThreeContext: (gl: THREE.WebGLRenderer, camera: THREE.Camera) => void
    renameNode: (id: string, newName: string) => void
    groupNodes: (ids: string[]) => void
    reparentNode: (childId: string, parentId: string) => void
    // Generation Params
    generationParams: {
        trellis: {
            seed: number
            simplify: number
            ss_sampling_steps: number
            ss_guidance_strength: number
            slat_sampling_steps: number
            slat_guidance_strength: number
        }
        sam3d: {
            points_per_side: number
        }
        p3sam: {
            point_num: number
            prompt_num: number
            threshold: number
            post_process: boolean
        }
    }
    setGenerationParam: (model: 'trellis' | 'sam3d' | 'p3sam', key: string, value: number | boolean) => void

    // Attachments
    attachments: string[] // Base64 strings
    addAttachment: (base64: string) => void
    clearAttachments: () => void

    setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void

    // AI Settings
    aiSettings: AISettings
    setAiSettings: (settings: AISettings) => void

    // Auto Rename/Group Actions
    updateNodeNames: (updates: { id: string, name: string }[]) => void
    setHasRenamed: (hasRenamed: boolean) => void
    applyAutoGroup: (hierarchy: any[]) => void
}

export const useAppStore = create<AppState>((set, get) => ({
    selectedModel: 'Trellis', // Default to Trellis for context, but not strict
    messages: [],
    isGenerating: false,
    currentGlbUrl: null,

    sceneGraph: [],
    selectedNodeIds: [],
    hasRenamed: false,
    scene: null,
    gl: null,
    camera: null,
    transformMode: 'translate',

    isRenaming: false,
    isGrouping: false,
    isSegmenting: false,

    setRenaming: (isRenaming) => set({ isRenaming }),
    setGrouping: (isGrouping) => set({ isGrouping }),
    setSegmenting: (isSegmenting) => set({ isSegmenting }),

    // Defaults
    generationParams: {
        trellis: {
            seed: 1,
            simplify: 0.95,
            ss_sampling_steps: 12,
            ss_guidance_strength: 7.5,
            slat_sampling_steps: 12,
            slat_guidance_strength: 7.5,
        },
        sam3d: {
            points_per_side: 32
        },
        p3sam: {
            point_num: 100000,
            prompt_num: 400,
            threshold: 0.95,
            post_process: true
        }
    },
    attachments: [],

    setModel: (model) => set({ selectedModel: model }),
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    setGenerating: (isGenerating) => set({ isGenerating }),
    setGlbUrl: (url) => set({ currentGlbUrl: url }),

    setSceneGraph: (nodes) => set({ sceneGraph: nodes }),
    setSelectedNodes: (ids) => set({ selectedNodeIds: ids }),
    toggleNodeSelection: (id, multiSelect) => set((state) => {
        const isSelected = state.selectedNodeIds.includes(id)
        if (multiSelect) {
            return {
                selectedNodeIds: isSelected
                    ? state.selectedNodeIds.filter(n => n !== id)
                    : [...state.selectedNodeIds, id]
            }
        }
        return { selectedNodeIds: isSelected ? [] : [id] }
    }),

    setThreeScene: (scene) => {
        set({ scene })
        set({ sceneGraph: scene.children.map(parseSceneGraph) })
    },

    setThreeContext: (gl, camera) => set({ gl, camera }),

    renameNode: (id, newName) => {
        const { scene } = get()
        if (!scene) return

        const node = findNodeByUuid(scene, id)
        if (node) {
            node.name = newName
            // Refresh graph
            set({ sceneGraph: scene.children.map(parseSceneGraph) })
        }
    },

    groupNodes: (ids) => {
        const { scene } = get()
        if (!scene || ids.length === 0) return

        const nodesToGroup: THREE.Object3D[] = []
        ids.forEach(id => {
            const node = findNodeByUuid(scene, id)
            if (node && node.parent) nodesToGroup.push(node)
        })

        if (nodesToGroup.length === 0) return

        // Create new group
        const newGroup = new THREE.Group()
        newGroup.name = 'New Group'

        // Determine parent (use the parent of the first node as the insertion point)
        const commonParent = nodesToGroup[0].parent
        if (commonParent) {
            commonParent.add(newGroup)

            nodesToGroup.forEach(node => {
                newGroup.add(node) // This automatically removes from old parent
            })

            // Select the new group
            set({ selectedNodeIds: [newGroup.uuid] })
            // Refresh graph
            set({ sceneGraph: scene.children.map(parseSceneGraph) })
        }
    },

    reparentNode: (childId, parentId) => {
        const { scene } = get()
        if (!scene) return

        const child = findNodeByUuid(scene, childId)
        const parent = findNodeByUuid(scene, parentId)

        if (child && parent && child !== parent) {
            // Prevent cycles (if parent is a descendant of child)
            let curr = parent
            while (curr.parent) {
                if (curr.parent === child) return
                curr = curr.parent
            }

            parent.add(child)
            set({ sceneGraph: scene.children.map(parseSceneGraph) })
        }
    },

    setTransformMode: (mode) => set({ transformMode: mode }),

    setGenerationParam: (model, key, value) => set((state) => ({
        generationParams: {
            ...state.generationParams,
            [model]: {
                ...state.generationParams[model],
                [key]: value
            }
        }
    })),

    addAttachment: (base64) => set((state) => ({ attachments: [...state.attachments, base64] })),
    clearAttachments: () => set({ attachments: [] }),

    aiSettings: {
        // vlmBaseUrl: 'http://172.18.246.59:54188/v1',
        // vlmApiKey: 'none',
        // vlmModel: 'zai-org/GLM-4.6V-Flash',
        vlmBaseUrl: 'http://172.18.212.157:31234/v1',
        vlmApiKey: 'none',
        vlmModel: 'gemma 3 12b',
        llmBaseUrl: 'http://172.18.212.157:31199/v1',
        llmApiKey: 'none',
        llmModel: 'LLAMA 3.3 70B'
    },
    setAiSettings: (settings) => set({ aiSettings: settings }),

    updateNodeNames: (updates) => {
        const { scene } = get()
        if (!scene) return

        let updated = false
        updates.forEach(({ id, name }) => {
            const node = findNodeByUuid(scene, id)
            if (node) {
                node.name = name
                updated = true
            }
        })

        if (updated) {
            set({ sceneGraph: scene.children.map(parseSceneGraph), hasRenamed: true })
        }
    },
    setHasRenamed: (hasRenamed) => set({ hasRenamed }),
    applyAutoGroup: (data) => {
        const { scene } = get()
        if (!scene) return

        // 1. Handle Flat Groups List (New method)
        if (Array.isArray(data)) {
            // Data is [{name: "Group Name", ids: ["uuid1", ...]}]
            data.forEach((groupData: any) => {
                if (groupData.name && Array.isArray(groupData.ids)) {
                    // Create Group
                    const group = new THREE.Group()
                    group.name = groupData.name
                    scene.add(group)

                    // Move parts into group
                    groupData.ids.forEach((id: string) => {
                        const obj = findNodeByUuid(scene, id)
                        if (obj) {
                            group.add(obj)
                        }
                    })
                }
            })
            set({ sceneGraph: scene.children.map(parseSceneGraph) })
            return
        }

        // 2. Handle Recursive Hierarchy (Legacy/Fallback)
        const hierarchy = Array.isArray(data) ? data : (data as any).hierarchy
        if (!hierarchy) return

        // Helper to process nodes recursively
        const processNode = (nodeData: any, parent: THREE.Object3D) => {
            if (nodeData.type === 'Group') {
                // Create new group
                const group = new THREE.Group()
                group.name = nodeData.name
                parent.add(group)

                // Process children
                if (nodeData.children && Array.isArray(nodeData.children)) {
                    nodeData.children.forEach((child: any) => processNode(child, group))
                }
            } else if (nodeData.type === 'Mesh') {
                if (nodeData.ids && Array.isArray(nodeData.ids)) {
                    if (nodeData.ids.length === 1) {
                        // Single mesh - find and move
                        const mesh = findNodeByUuid(scene, nodeData.ids[0])
                        if (mesh) {
                            mesh.name = nodeData.name // Update name if LLM refined it
                            parent.add(mesh)
                        }
                    } else if (nodeData.ids.length > 1) {
                        // Multiple meshes in a 'Mesh' node? Treat as a group.
                        const group = new THREE.Group()
                        group.name = nodeData.name
                        parent.add(group)
                        nodeData.ids.forEach((id: string) => {
                            const mesh = findNodeByUuid(scene, id)
                            if (mesh) group.add(mesh)
                        })
                    }
                }
            }
        }

        if (Array.isArray(hierarchy)) {
            hierarchy.forEach(node => processNode(node, scene))
        }

        // Trigger update
        set({ sceneGraph: scene.children.map(parseSceneGraph) })
    }
}))
