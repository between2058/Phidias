'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Check, MousePointer2, Eraser, Undo, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SegmentationEditorProps {
    imageUrl: string
    isOpen: boolean
    onClose: () => void
    onConfirm: (originalImageUrl: string, maskedImageUrl: string) => void
}

interface Point {
    x: number
    y: number
    type: 'foreground' | 'background'
}

export function SegmentationEditor({ imageUrl, isOpen, onClose, onConfirm }: SegmentationEditorProps) {
    const [points, setPoints] = useState<Point[]>([])
    const [mode, setMode] = useState<'foreground' | 'background'>('foreground')
    const [isProcessing, setProcessing] = useState(false)
    const [maskUrl, setMaskUrl] = useState<string | null>(null)

    const imageRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Portal support
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    if (!isOpen || !mounted) return null

    const handleImageClick = (e: React.MouseEvent) => {
        if (!imageRef.current) return

        const rect = imageRef.current.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        const y = (e.clientY - rect.top) / rect.height

        setPoints([...points, { x, y, type: mode }])

        // Mock processing trigger
        // In real impl, we would debounce this and send points to backend
    }

    const handleRunSegmentation = async () => {
        setProcessing(true)

        // Simulate API call to /segment/2d
        setTimeout(() => {
            setProcessing(false)
            // For MVP/Dry-Run, we just pretend we created a mask. 
            // In a real app we'd overlay the mask returned from backend.
            // Here we'll just toggle a specific state to show "Result"
            setMaskUrl(imageUrl) // using original as placeholder for "result"
        }, 1500)
    }

    const handleConfirm = () => {
        if (!maskUrl || !imageRef.current) {
            onClose()
            return
        }

        // Create canvas to generate RGBA image with alpha mask
        const canvas = document.createElement('canvas')
        const img = imageRef.current
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')

        if (!ctx) {
            onClose()
            return
        }

        // Draw original image
        ctx.drawImage(img, 0, 0)

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        // For now, since we don't have real segmentation, 
        // we'll create a simple mask based on the clicked points
        // In production, this would come from the segmentation API

        // Create mask based on foreground points (simplified - just set alpha for demo)
        // Real implementation would use the actual mask from API
        for (let i = 0; i < data.length; i += 4) {
            // Keep full opacity for all pixels in this mock
            // Real impl would set alpha based on actual mask
            data[i + 3] = 255  // Alpha channel
        }

        // Apply foreground/background logic based on points
        // This is a simplified version - real implementation uses API mask
        if (points.length > 0) {
            // For demo: invert alpha for area around background points
            const bgPoints = points.filter(p => p.type === 'background')
            for (const point of bgPoints) {
                const px = Math.floor(point.x * canvas.width)
                const py = Math.floor(point.y * canvas.height)
                const radius = 50  // Simplified radius

                for (let y = Math.max(0, py - radius); y < Math.min(canvas.height, py + radius); y++) {
                    for (let x = Math.max(0, px - radius); x < Math.min(canvas.width, px + radius); x++) {
                        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
                        if (dist < radius) {
                            const idx = (y * canvas.width + x) * 4
                            data[idx + 3] = 0  // Set alpha to 0 (transparent)
                        }
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0)

        // Export as RGBA PNG
        const maskedDataUrl = canvas.toDataURL('image/png')

        // Pass both original and masked
        // Signature: onConfirm(originalImageUrl, maskedImageUrl)
        onConfirm(imageUrl, maskedDataUrl)
        onClose()
    }



    // Use Portal to escape parent container constraints (e.g. narrow chat width)
    const { createPortal } = require('react-dom')

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
            <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-semibold">Interactive Segmentation</h2>
                        <p className="text-sm text-muted-foreground">Click to define objects. Green = Foreground, Red = Background.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Main Editor */}
                <div className="flex-1 relative bg-secondary/20 flex items-center justify-center overflow-hidden" ref={containerRef}>
                    <div className="relative">
                        <img
                            ref={imageRef}
                            src={imageUrl}
                            alt="Segmentation Target"
                            className="max-h-[60vh] object-contain select-none cursor-crosshair"
                            onClick={handleImageClick}
                            draggable={false}
                        />

                        {/* Render Points */}
                        {points.map((p, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border border-white shadow-sm pointer-events-none",
                                    p.type === 'foreground' ? "bg-green-500" : "bg-red-500"
                                )}
                                style={{
                                    left: `${p.x * 100}%`,
                                    top: `${p.y * 100}%`
                                }}
                            />
                        ))}

                        {/* Mask Overlay (Placeholder visual) */}
                        {maskUrl && (
                            <div className="absolute inset-0 bg-green-500/20 pointer-events-none animate-in fade-in duration-500" />
                        )}
                    </div>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-t border-border bg-card flex justify-center gap-4">
                    <div className="flex items-center gap-2 mr-8 bg-muted/50 p-1 rounded-lg">
                        <Button
                            variant={mode === 'foreground' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setMode('foreground')}
                            className={cn(mode === 'foreground' && "bg-green-500/10 text-green-500 hover:bg-green-500/20")}
                        >
                            <MousePointer2 className="w-4 h-4 mr-2" />
                            Foreground
                        </Button>
                        <Button
                            variant={mode === 'background' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setMode('background')}
                            className={cn(mode === 'background' && "bg-red-500/10 text-red-500 hover:bg-red-500/20")}
                        >
                            <Eraser className="w-4 h-4 mr-2" />
                            Background
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setPoints(points.slice(0, -1))} title="Undo">
                            <Undo className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleRunSegmentation}
                            disabled={points.length === 0 || isProcessing}
                            variant="outline"
                        >
                            {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Run Segment
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={!maskUrl}
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            Apply Mask
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
