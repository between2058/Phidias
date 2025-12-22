'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '@/store/useAppStore'
import { Text, Instances, Instance } from '@react-three/drei'

// Shader for the scanning effect
const scanShader = {
    uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color('#00f3ff') },
        scanHeight: { value: 0 },
        boundsMax: { value: 0 },
        boundsMin: { value: 0 }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
            vUv = uv;
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform float scanHeight;
        varying vec2 vUv;
        varying vec3 vPos;

        void main() {
            // Horizontal scan line
            float scanWidth = 0.2;
            float dist = abs(vPos.y - scanHeight);
            float alpha = 1.0 - smoothstep(0.0, scanWidth, dist);
            
            // Grid pattern
            float grid = step(0.98, fract(vPos.x * 10.0)) + step(0.98, fract(vPos.z * 10.0));
            
            // Vertical pulse
            float pulse = sin(vPos.y * 10.0 - time * 5.0) * 0.5 + 0.5;

            // Cyberpunk Gradient: Mix Cyan and Pink based on height
            vec3 neonPink = vec3(1.0, 0.0, 0.6); // #ff0099
            vec3 neonCyan = vec3(0.0, 0.95, 1.0); // #00f3ff
            vec3 mixedColor = mix(neonCyan, neonPink, sin(vPos.y + time) * 0.5 + 0.5);

            vec3 finalColor = mixedColor + grid * 0.5 + pulse * 0.2;
            float finalAlpha = alpha * 0.6 + grid * 0.2;

            if (finalAlpha < 0.05) discard;

            gl_FragColor = vec4(finalColor, finalAlpha);
        }
    `
}

function ScanningEffect({ bounds, label }: { bounds: THREE.Box3, label?: string }) {
    const meshRef = useRef<THREE.Mesh>(null)
    const materialRef = useRef<THREE.ShaderMaterial>(null)

    // Calculate size
    const size = useMemo(() => {
        const s = new THREE.Vector3()
        bounds.getSize(s)
        return [Math.max(s.x, s.z) * 1.5, Math.max(s.y, 2.0)] // Width, Height
    }, [bounds])

    useFrame((state) => {
        const time = state.clock.getElapsedTime()
        if (materialRef.current) {
            // Scan moves up and down
            const height = size[1] as number
            const y = (Math.sin(time * 2.0) * 0.5 + 0.5) * height - height / 2 + (bounds.min.y + bounds.max.y) / 2
            materialRef.current.uniforms.scanHeight.value = y
            materialRef.current.uniforms.time.value = time
        }
    })

    return (
        <group>
            <mesh ref={meshRef} position={[0, (bounds.max.y + bounds.min.y) / 2, 0]}>
                <cylinderGeometry args={[size[0] as number, size[0] as number, size[1] as number, 32, 1, true]} />
                <shaderMaterial
                    ref={materialRef}
                    args={[scanShader]}
                    transparent
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            {label && (
                <Text
                    position={[0, bounds.max.y + 0.5, 0]}
                    fontSize={0.25}
                    color="#00f3ff"
                    anchorX="center"
                    anchorY="bottom"
                >
                    {label}
                </Text>
            )}
        </group>
    )
}

function PointCloudScan({ bounds }: { bounds: THREE.Box3 }) {
    const pointsRef = useRef<THREE.Points>(null)

    const particles = useMemo(() => {
        const count = 1500
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)

        const size = new THREE.Vector3()
        bounds.getSize(size)
        const center = new THREE.Vector3()
        bounds.getCenter(center)

        // Palette
        const c1 = new THREE.Color('#39ff14') // Acid Green
        const c2 = new THREE.Color('#00f3ff') // Cyan
        const c3 = new THREE.Color('#ff0099') // Neon Pink
        const c4 = new THREE.Color('#fff000') // Yellow

        // Add padding
        const pad = 1.5
        const rx = size.x * pad * 0.5
        const ry = size.y * pad * 0.5
        const rz = size.z * pad * 0.5

        for (let i = 0; i < count; i++) {
            positions[i * 3] = center.x + (Math.random() - 0.5) * 2 * rx
            positions[i * 3 + 1] = center.y + (Math.random() - 0.5) * 2 * ry
            positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * 2 * rz

            // Random Color
            const r = Math.random()
            let c = c1
            if (r > 0.75) c = c2
            if (r > 0.90) c = c3
            if (r > 0.98) c = c4

            colors[i * 3] = c.r
            colors[i * 3 + 1] = c.g
            colors[i * 3 + 2] = c.b
        }
        return { positions, colors }
    }, [bounds])

    useFrame((state) => {
        const t = state.clock.getElapsedTime()
        if (pointsRef.current) {
            pointsRef.current.rotation.y = t * 0.15
            const mat = pointsRef.current.material as THREE.PointsMaterial
            mat.opacity = 0.7 + Math.sin(t * 4) * 0.2
            mat.size = 0.06 + Math.sin(t * 8) * 0.02
        }
    })

    return (
        <group>
            <points ref={pointsRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        args={[particles.positions, 3]}
                    />
                    <bufferAttribute
                        attach="attributes-color"
                        args={[particles.colors, 3]}
                    />
                </bufferGeometry>
                <pointsMaterial
                    vertexColors
                    size={0.06}
                    transparent
                    opacity={0.8}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </points>
            <Text
                position={[0, bounds.max.y + 0.5, 0]}
                fontSize={0.25}
                color="#39ff14"
                anchorX="center"
                anchorY="bottom"
            >
                IDENTIFYING OBJECTS...
            </Text>
        </group>
    )
}

function ClusterField({ bounds }: { bounds: THREE.Box3 }) {
    const groupRef = useRef<THREE.Group>(null)

    // Create random nodes
    const nodes = useMemo(() => {
        const count = 20
        const data = []
        const colors = ['#bd00ff', '#ff0099', '#00f3ff']

        const size = new THREE.Vector3()
        bounds.getSize(size)
        const center = new THREE.Vector3()
        bounds.getCenter(center)

        const maxDim = Math.max(size.x, size.y, size.z) * 0.8

        for (let i = 0; i < count; i++) {
            data.push({
                offset: [
                    (Math.random() - 0.5) * 2 * maxDim,
                    (Math.random() - 0.5) * 2 * maxDim,
                    (Math.random() - 0.5) * 2 * maxDim
                ],
                speed: Math.random() * 0.5 + 0.2,
                color: colors[Math.floor(Math.random() * colors.length)]
            })
        }
        return data
    }, [bounds])

    useFrame((state) => {
        const t = state.clock.getElapsedTime()
        if (groupRef.current) {
            groupRef.current.rotation.y = Math.sin(t * 0.2) * 0.2
            groupRef.current.children.forEach((child, i) => {
                // Wiggle nodes
                if (i < nodes.length) {
                    const node = nodes[i]
                    child.position.y = node.offset[1] + Math.sin(t * node.speed + i) * 0.2
                }
            })
        }
    })

    return (
        <group ref={groupRef} position={[0, (bounds.max.y + bounds.min.y) / 2, 0]}>
            {nodes.map((n, i) => (
                <mesh key={i} position={[n.offset[0], n.offset[1], n.offset[2]]}>
                    <icosahedronGeometry args={[0.08, 0]} />
                    <meshBasicMaterial color={n.color} />
                </mesh>
            ))}

            {/* Connecting Lines */}
            <mesh>
                <icosahedronGeometry args={[Math.max(bounds.max.x, 2), 1]} />
                <meshBasicMaterial color="#ff0099" wireframe transparent opacity={0.1} />
            </mesh>

            <Text
                position={[0, bounds.max.y / 2 + 1.2, 0]} // Relative to group center, pushed up
                fontSize={0.25}
                color="#ff0099"
                anchorX="center"
                anchorY="bottom"
            >
                Analyzing the parts...
            </Text>
        </group>
    )
}

export function SciFiEffects() {
    const { isSegmenting, isRenaming, isGrouping, isAnalyzing, scene } = useAppStore()

    const bounds = useMemo(() => {
        if (!scene) return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1))
        const box = new THREE.Box3().setFromObject(scene)
        if (box.isEmpty()) return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1))
        return box
    }, [scene])

    return (
        <group>
            {isSegmenting && <ScanningEffect bounds={bounds} label="SEGMENTING..." />}
            {isAnalyzing && <ScanningEffect bounds={bounds} label="ANALYZING STRUCTURE..." />}
            {isRenaming && <PointCloudScan bounds={bounds} />}
            {isGrouping && <ClusterField bounds={bounds} />}
        </group>
    )
}
