import * as THREE from 'three'
import { GLTFExporter, USDZExporter } from 'three-stdlib'

export const downloadFile = (blob: Blob, filename: string) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

export const exportGLB = (scene: THREE.Object3D, fileName = 'model') => {
    const exporter = new GLTFExporter()
    exporter.parse(
        scene,
        (result) => {
            if (result instanceof ArrayBuffer) {
                const blob = new Blob([result], { type: 'model/gltf-binary' })
                downloadFile(blob, `${fileName}.glb`)
            } else {
                const blob = new Blob([JSON.stringify(result)], { type: 'application/json' })
                downloadFile(blob, `${fileName}.gltf`)
            }
        },
        (error) => {
            console.error('An error happened during GLB export:', error)
        },
        { binary: true }
    )
}

export const exportUSDZ = async (scene: THREE.Object3D, fileName = 'model') => {
    try {
        const exporter = new USDZExporter()
        // Clone scene to avoid modifying the live view during cleanup
        const clonedScene = scene.clone()

        // Sanitize the scene for USDZ export requirements
        clonedScene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh

                // 1. Sanitize Material
                const material = mesh.material
                if (material) {
                    const mats = Array.isArray(material) ? material : [material]
                    mats.forEach(mat => {
                        if ('opacity' in mat && (mat.opacity === undefined || mat.opacity === null)) {
                            mat.opacity = 1.0
                        }
                        if ('roughness' in mat && (mat as any).roughness === undefined) {
                            (mat as any).roughness = 1.0
                        }
                        if ('metalness' in mat && (mat as any).metalness === undefined) {
                            (mat as any).metalness = 0.0
                        }
                    })
                }

                // 2. Sanitize Geometry (Fix for "undefined is not an object" on array access)
                if (mesh.geometry) {
                    // Clone to ensure we don't mess with original and to de-interleave if possible
                    const originalGeo = mesh.geometry
                    const geo = originalGeo.clone()

                    // Check main attributes
                    const attributes = ['position', 'normal', 'uv', 'color']
                    attributes.forEach(key => {
                        const attr = geo.attributes[key]
                        if (attr) {
                            // Ensure it's a Float32BufferAttribute
                            if (!(attr instanceof THREE.BufferAttribute)) {
                                // Re-create as BufferAttribute if it's some other type (Interleaved, etc)
                                try {
                                    const array = new Float32Array(attr.array)
                                    geo.setAttribute(key, new THREE.BufferAttribute(array, attr.itemSize, attr.normalized))
                                } catch (e) {
                                    // If fail, delete attribute to prevent crash
                                    geo.deleteAttribute(key)
                                }
                            }

                            // Validate length vs count
                            const expectedLength = attr.count * attr.itemSize
                            if (attr.array.length < expectedLength) {
                                // Pad array if too short
                                const newArray = new Float32Array(expectedLength)
                                newArray.set(attr.array as Float32Array)
                                geo.setAttribute(key, new THREE.BufferAttribute(newArray, attr.itemSize))
                            }
                        }
                    })

                    mesh.geometry = geo
                }
            }
        })

        const array = await exporter.parse(clonedScene)
        const blob = new Blob([array as any], { type: 'model/vnd.usdz+zip' })
        downloadFile(blob, `${fileName}.usdz`)
    } catch (error) {
        console.error('An error happened during USDZ export:', error)
        // Re-throw or handle UI notification here
        alert(`Export failed: ${error}`)
    }
}
