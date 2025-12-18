import * as THREE from 'three'

/**
 * Captures a snapshot of a specific 3D object within its context.
 * Uses a separate scene to avoid interfering with the main application scene.
 */
export const captureObjectSnapshot = (
    object: THREE.Object3D,
    root: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    width: number = 512,
    height: number = 512
): string => {
    // 0. Mark the target object in the original scene so we can find it in the clone
    object.userData.__snapshotTarget = true

    // 1. Setup offscreen scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#333333') // Neutral background

    // 2. Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 4.0)
    dirLight.position.set(5, 5, 5)
    scene.add(dirLight)

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight2.position.set(-5, -5, -5)
    scene.add(dirLight2)

    // 3. Clone the entire root to preserve context
    const rootClone = root.clone()

    // 4. Find the target in the clone and Apply Highlight
    let targetClone: THREE.Object3D | null = null

    rootClone.traverse((node) => {
        if (node.userData.__snapshotTarget) {
            targetClone = node
            node.userData.__snapshotTarget = false // Cleanup in clone
        }
    })

    // Apply Green Highlight to Target
    if (targetClone) {
        (targetClone as THREE.Object3D).traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
                const mesh = node as THREE.Mesh
                // Clone material to avoid side effects on shared materials
                const originalMat = mesh.material
                // Handle array of materials if necessary (uncommon for simple parts but possible)
                if (Array.isArray(originalMat)) {
                    mesh.material = originalMat.map(m => {
                        const clone = m.clone()
                        if ('emissive' in clone) {
                            (clone as any).emissive.setHex(0x00ff00);
                            (clone as any).emissiveIntensity = 0.5;
                        } else {
                            (clone as any).color.setHex(0x00ff00);
                        }
                        return clone
                    })
                } else {
                    const clone = originalMat.clone()
                    if ('emissive' in clone) {
                        (clone as any).emissive.setHex(0x00ff00);
                        (clone as any).emissiveIntensity = 0.5;
                    } else {
                        // Fallback for materials without emissive (e.g. Basic)
                        (clone as any).color.setHex(0x00ff00);
                    }
                    mesh.material = clone
                }
            }
        })
    }

    // Cleanup marker in original
    object.userData.__snapshotTarget = false

    scene.add(rootClone)

    // 5. Setup Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)

    // 6. Fit Camera to Target (but keep context visible)
    if (targetClone) {
        // Calculate World Bounding Box of the target
        const box = new THREE.Box3().setFromObject(targetClone)
        const size = new THREE.Vector3()
        box.getSize(size)
        const center = new THREE.Vector3()
        box.getCenter(center)

        // Position camera relative to target center
        const maxDim = Math.max(size.x, size.y, size.z)
        const fov = camera.fov * (Math.PI / 180)
        let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2))

        const distance = cameraZ * 2.0

        // Heuristic: Determine "Best View" based on aspect ratio
        // If object is flat (one dim significantly smaller), look face-on.
        const dims = [
            { axis: 'x', val: size.x },
            { axis: 'y', val: size.y },
            { axis: 'z', val: size.z }
        ].sort((a, b) => a.val - b.val)

        let direction = new THREE.Vector3(1, 1, 1).normalize()

        // If smallest dimension is < 25% of largest, it's likely a plate/panel.
        if (dims[0].val < dims[2].val * 0.25) {
            switch (dims[0].axis) {
                case 'x': direction.set(1, 0.5, 0.5); break;
                case 'y': direction.set(0.5, 1, 0.5); break;
                case 'z': direction.set(0.5, 0.5, 1); break;
            }
        } else {
            direction.set(1, 0.8, 1)
        }

        direction.normalize()
        const position = center.clone().add(direction.multiplyScalar(distance))

        camera.position.copy(position)
        camera.lookAt(center)
    } else {
        // Fallback if something failed (shouldn't happen)
        camera.position.set(2, 2, 2)
        camera.lookAt(0, 0, 0)
    }

    // 7. Render
    const renderTarget = new THREE.WebGLRenderTarget(width, height)
    const originalSize = new THREE.Vector2()
    renderer.getSize(originalSize)

    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)

    // 8. Extract Image
    const buffer = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
        const imageData = ctx.createImageData(width, height)
        const inputData = buffer
        const outputData = imageData.data

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * 4
                const dstIdx = ((height - y - 1) * width + x) * 4

                outputData[dstIdx] = inputData[srcIdx]
                outputData[dstIdx + 1] = inputData[srcIdx + 1]
                outputData[dstIdx + 2] = inputData[srcIdx + 2]
                outputData[dstIdx + 3] = inputData[srcIdx + 3]
            }
        }
        ctx.putImageData(imageData, 0, 0)
    }

    // Cleanup
    renderer.setRenderTarget(null)
    renderTarget.dispose()
    // No explicit material dispose needed for rootClone as we let GC handle it, 
    // but the cloned highlighted materials will be lost to GC which is fine.

    return canvas.toDataURL('image/png')
}
