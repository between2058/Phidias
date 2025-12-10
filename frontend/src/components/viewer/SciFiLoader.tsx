'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function SciFiLoader() {
    const pointsRef = useRef<THREE.Points>(null)
    const ringRef = useRef<THREE.Mesh>(null)
    const innerRingRef = useRef<THREE.Mesh>(null)

    // Create a soft glow texture programmatically
    const glowTexture = useMemo(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 32
        canvas.height = 32
        const context = canvas.getContext('2d')
        if (context) {
            const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16)
            gradient.addColorStop(0, 'rgba(255,255,255,1)')
            gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)')
            gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)')
            gradient.addColorStop(1, 'rgba(0,0,0,0)')
            context.fillStyle = gradient
            context.fillRect(0, 0, 32, 32)
        }
        const texture = new THREE.CanvasTexture(canvas)
        texture.premultiplyAlpha = true // Fix dark outlines
        return texture
    }, [])

    // Generate points for a sphere with varied colors
    const particles = useMemo(() => {
        const count = 2500 // Increased count slightly
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)

        const colorCyan = new THREE.Color('#00f3ff')
        const colorPurple = new THREE.Color('#bd00ff') // Purple accent
        const colorWhite = new THREE.Color('#ffffff') // Sparkle accent
        const colorGold = new THREE.Color('#ffd700') // Tiny bit of gold

        for (let i = 0; i < count; i++) {
            const r = 1.6 + Math.random() * 0.6
            const theta = Math.random() * Math.PI * 2
            const phi = Math.acos(2 * Math.random() - 1)

            const x = r * Math.sin(phi) * Math.cos(theta)
            const y = r * Math.sin(phi) * Math.sin(theta)
            const z = r * Math.cos(phi)

            positions[i * 3] = x
            positions[i * 3 + 1] = y
            positions[i * 3 + 2] = z

            // Color distribution
            const rand = Math.random()
            let c = colorCyan
            if (rand > 0.90) c = colorWhite // 10% sparkles
            else if (rand > 0.80) c = colorPurple // 10% varied hue
            else if (rand > 0.78) c = colorGold // 2% rare gold

            colors[i * 3] = c.r
            colors[i * 3 + 1] = c.g
            colors[i * 3 + 2] = c.b
        }

        return { positions, colors }
    }, [])

    useFrame((state) => {
        const time = state.clock.getElapsedTime()

        if (pointsRef.current) {
            pointsRef.current.rotation.y = time * 0.15
            pointsRef.current.rotation.z = time * 0.08

            // Pulse effect (Scale)
            const scale = 1 + Math.sin(time * 2.5) * 0.08
            pointsRef.current.scale.set(scale, scale, scale)

            // Opacity/Glow pulse (requires material ref or direct access)
            const material = pointsRef.current.material as THREE.PointsMaterial
            if (material) {
                // Intermittent glow: Base opacity 0.6 + Pulse 0.4
                material.opacity = 0.6 + (Math.sin(time * 3) * 0.5 + 0.5) * 0.3
                material.size = 0.08 + (Math.sin(time * 3 + 1) * 0.5 + 0.5) * 0.03
            }
        }

        if (ringRef.current) {
            ringRef.current.rotation.x = time * 0.5
            ringRef.current.rotation.y = time * 0.2
        }

        if (innerRingRef.current) {
            innerRingRef.current.rotation.x = -time * 0.5
            innerRingRef.current.rotation.z = time * 0.1
        }
    })

    return (
        <group>
            {/* Particle Sphere */}
            <points ref={pointsRef}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={particles.positions.length / 3}
                        array={particles.positions}
                        itemSize={3}
                    />
                    <bufferAttribute
                        attach="attributes-color"
                        count={particles.colors.length / 3}
                        array={particles.colors}
                        itemSize={3}
                    />
                </bufferGeometry>
                <pointsMaterial
                    size={0.1} // Increased size for texture visibility
                    map={glowTexture}
                    vertexColors
                    transparent
                    opacity={0.8}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false} // Crucial for transparent particles looking nice
                />
            </points>

            {/* Orbital Rings */}
            <mesh ref={ringRef}>
                <torusGeometry args={[2.2, 0.01, 16, 100]} />
                <meshBasicMaterial color="#00f3ff" transparent opacity={0.15} />
            </mesh>

            <mesh ref={innerRingRef} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.8, 0.005, 16, 100]} />
                <meshBasicMaterial color="#00f3ff" transparent opacity={0.2} />
            </mesh>

            {/* Central Glow Orb (Soft Blur) */}
            <sprite scale={[3, 3, 3]}>
                <spriteMaterial
                    map={glowTexture}
                    color="#00f3ff"
                    transparent
                    opacity={0.12}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </sprite>
        </group>
    )
}
