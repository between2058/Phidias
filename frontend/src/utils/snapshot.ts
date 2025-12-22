import * as THREE from 'three'

/**
 * Captures a snapshot of a specific 3D object within its context.
 * Uses a separate scene to avoid interfering with the main application scene.
 */
interface SnapshotOptions {
    width?: number
    height?: number
    highlight?: boolean
    padding?: number
    rotationY?: number // Optional Y-axis rotation in radians
}

export const captureObjectSnapshot = (
    object: THREE.Object3D,
    root: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    options: SnapshotOptions = {}
): string => {
    const { width = 512, height = 512, highlight = true, padding = 2.0, rotationY = 0 } = options

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

    // 4. Find the target in the clone
    let targetClone: THREE.Object3D | null = null

    rootClone.traverse((node) => {
        if (node.userData.__snapshotTarget) {
            targetClone = node
            node.userData.__snapshotTarget = false // Cleanup in clone
        }
    })

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

        const distance = cameraZ * padding

        // Heuristic: Determine "Best View" based on aspect ratio
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

        // Apply optional extra rotation
        if (rotationY !== 0) {
            direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)
        }

        const position = center.clone().add(direction.multiplyScalar(distance))

        camera.position.copy(position)
        camera.lookAt(center)
    } else {
        camera.position.set(2, 2, 2)
        camera.lookAt(0, 0, 0)
    }

    // 7. Render Pass 1: Beauty Pass (Original Materials)
    const renderTarget = new THREE.WebGLRenderTarget(width, height)
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)

    const beautyBuffer = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, beautyBuffer)

    // If highlight is disabled, we stop here
    if (!highlight || !targetClone) {
        // ... (cleanup and return beautyBuffer as image)
        renderer.setRenderTarget(null)
        renderTarget.dispose()

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
            const imageData = ctx.createImageData(width, height)
            // Flip Y since WebGL is upside down relative to Canvas
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const srcIdx = (y * width + x) * 4
                    const dstIdx = ((height - y - 1) * width + x) * 4
                    imageData.data[dstIdx] = beautyBuffer[srcIdx]
                    imageData.data[dstIdx + 1] = beautyBuffer[srcIdx + 1]
                    imageData.data[dstIdx + 2] = beautyBuffer[srcIdx + 2]
                    imageData.data[dstIdx + 3] = beautyBuffer[srcIdx + 3]
                }
            }
            ctx.putImageData(imageData, 0, 0)
        }
        return canvas.toDataURL('image/png')
    }

    // 8. Render Pass 2: Mask Pass (Target White, Context Black)
    // Override materials for mask
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 })

    // Store originals? No need if we dispose scene after.
    // Set everything to black first
    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    rootClone.traverse((node: any) => {
        if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh
            originalMaterials.set(mesh, mesh.material)
            mesh.material = blackMat
        }
    })

    // Set target to white
    if (targetClone) {
        (targetClone as THREE.Object3D).traverse((node: any) => {
            if ((node as THREE.Mesh).isMesh) {
                (node as THREE.Mesh).material = whiteMat
            }
        })
    }

    // Render Mask
    renderer.render(scene, camera)
    const maskBuffer = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, maskBuffer)

    // 9. Composite: Edge Detection and Red Outline
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
        const imageData = ctx.createImageData(width, height)
        const outputData = imageData.data

        // Flip and Composite
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // WebGL Y is inverted
                const glY = y
                const canvasY = height - y - 1

                const idx = (glY * width + x) * 4
                const outIdx = (canvasY * width + x) * 4

                // Copy Beauty Pass as base
                outputData[outIdx] = beautyBuffer[idx]
                outputData[outIdx + 1] = beautyBuffer[idx + 1]
                outputData[outIdx + 2] = beautyBuffer[idx + 2]
                outputData[outIdx + 3] = beautyBuffer[idx + 3]

                // Edge Detection on Mask
                // Check if current pixel is non-black (target)
                // Actually edge = boundary between Black and White.
                // Simple dilation: If pixel is Black, check neighbors. If any neighbor is White, this is an edge. Draw Red.
                // Or: If pixel is White, check neighbors. If any neighbor is Black, this is an edge. Draw Red.

                // Let's use the second approach: Outline ON the target or ON the background? 
                // Reference uses dilation ^ mask. 
                // Mask pixels = White. 
                // Dilation = Expand White area. 
                // Dilation ^ Mask = The expanded area minus the original area = The OUTSIDE border.
                // This draws the line just OUTSIDE the object.

                // Check if current pixel is Black (Background/Context)
                // Only consider mask red channel (since it is black/white)
                const isMaskWhite = maskBuffer[idx] > 128

                if (!isMaskWhite) {
                    // Check neighbors (3x3 kernel)
                    let hasWhiteNeighbor = false

                    // Simple optional check for performance: skip if far from likely edges? No simple way.
                    // Just check 4 neighbors for speed, or 8 for quality.
                    // Note: Boundary checks needed

                    const neighbors = [
                        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
                        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
                        // Diagonals for smoother circle
                        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
                        { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
                    ]

                    for (const n of neighbors) {
                        const ny = glY + n.dy
                        const nx = x + n.dx

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = (ny * width + nx) * 4
                            if (maskBuffer[nIdx] > 128) {
                                hasWhiteNeighbor = true
                                break
                            }
                        }
                    }

                    if (hasWhiteNeighbor) {
                        // This is an edge pixel (on the outside)
                        // Make it Red. To mimic the drawing of a circle/thick line:
                        // We will set a 3x3 block around this pixel to red.
                        // Be careful with bounds.

                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const ry = canvasY + dy
                                const rx = x + dx
                                if (ry >= 0 && ry < height && rx >= 0 && rx < width) {
                                    const rIdx = (ry * width + rx) * 4
                                    // Only overwrite if not already red (optional optimization)
                                    outputData[rIdx] = 255
                                    outputData[rIdx + 1] = 0
                                    outputData[rIdx + 2] = 0
                                    outputData[rIdx + 3] = 255
                                }
                            }
                        }
                    }
                }
            }
        }
        ctx.putImageData(imageData, 0, 0)
    }

    // Cleanup
    renderer.setRenderTarget(null)
    renderTarget.dispose()

    // Clean up materials if we were to re-use scene, but we discard `scene` and `rootClone`
    // so just letting them go out of scope is fine.

    return canvas.toDataURL('image/png')
}

/**
 * Captures 4 snapshots of the object from different angles (0, 90, 180, 270 degrees)
 * and stitches them into a single 2x2 grid image.
 */
/**
 * Captures 4 snapshots of the object from different angles (0, 90, 180, 270 degrees)
 * and stitches them into a single 2x2 grid image.
 */
export const captureMultiviewSnapshot = async (
    object: THREE.Object3D,
    root: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    options: SnapshotOptions = {}
): Promise<string> => {
    const { width = 512, height = 512 } = options

    // Capture 4 views
    const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5]
    const snapshots: HTMLImageElement[] = []

    for (const angle of angles) {
        // Use synchronous capture but we need to wait for image loading
        // We can create a new options object for each rotation
        const snapshotUrl = captureObjectSnapshot(object, root, renderer, { ...options, rotationY: angle })

        const img = new Image()
        img.src = snapshotUrl
        await new Promise((resolve) => { img.onload = resolve })
        snapshots.push(img)
    }

    // Stitch into 2x2 grid
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    if (ctx) {
        const w2 = width / 2
        const h2 = height / 2

        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, width, height)

        // Logical Order:
        // TL (0) | TR (90)
        // -------+--------
        // BL (270)| BR (180) 

        ctx.drawImage(snapshots[0], 0, 0, w2, h2)      // Top-Left: Front
        ctx.drawImage(snapshots[1], w2, 0, w2, h2)     // Top-Right: Right
        ctx.drawImage(snapshots[3], 0, h2, w2, h2)     // Bottom-Left: Left
        ctx.drawImage(snapshots[2], w2, h2, w2, h2)    // Bottom-Right: Back
    }

    return canvas.toDataURL('image/png')
}
