import { create } from 'zustand'
import * as THREE from 'three'
import { parseSceneGraph, findNodeByUuid } from '@/utils/scene'

export type ModelType = 'SAM1' | 'SAM-3D' | 'Trellis' | 'P3-SAM'

export interface Message {
    id: string
    role: 'user' | 'system'
    content: string
    attachmentUrl?: string
}

export interface SceneNode {
    id: string
    name: string
    type: string
    children?: SceneNode[]
}

interface AppState {
    selectedModel: ModelType
    messages: Message[]
    isGenerating: boolean
    currentGlbUrl: string | null

    sceneGraph: SceneNode[]
    selectedNodeIds: string[]

    // Three.js scene reference
    scene: THREE.Group | null

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
    renameNode: (id: string, newName: string) => void
    groupNodes: (ids: string[]) => void
    reparentNode: (childId: string, parentId: string) => void
    setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void
}

export const useAppStore = create<AppState>((set, get) => ({
    selectedModel: 'Trellis',
    messages: [],
    isGenerating: false,
    currentGlbUrl: null,

    sceneGraph: [],
    selectedNodeIds: [],
    scene: null,
    transformMode: 'translate',

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

    setTransformMode: (mode) => set({ transformMode: mode })
}))
