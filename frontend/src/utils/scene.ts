import * as THREE from 'three'
import { SceneNode } from '@/store/useAppStore'

export const parseSceneGraph = (obj: THREE.Object3D): SceneNode => {
    return {
        id: obj.uuid,
        name: obj.name || `Node_${obj.uuid.slice(0, 4)}`,
        type: obj.type,
        children: obj.children.map(parseSceneGraph)
    }
}

export const findNodeByUuid = (root: THREE.Object3D, uuid: string): THREE.Object3D | null => {
    if (root.uuid === uuid) return root

    for (const child of root.children) {
        const found = findNodeByUuid(child, uuid)
        if (found) return found
    }
    return null
}
