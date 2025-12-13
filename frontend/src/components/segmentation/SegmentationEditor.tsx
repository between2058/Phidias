'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Check, MousePointer2, Eraser, Undo, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

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

const API_BASE_URL = 'http://localhost:8000'

export function SegmentationEditor({ imageUrl, isOpen, onClose, onConfirm }: SegmentationEditorProps) {
    const [points, setPoints] = useState<Point[]>([])
    const [mode, setMode] = useState<'foreground' | 'background'>('foreground')
    const [isProcessing, setProcessing] = useState(false)
    const [isInitializing, setInitializing] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
    const [maskOverlayUrl, setMaskOverlayUrl] = useState<string | null>(null)
    const [rgbaImageUrl, setRgbaImageUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const imageRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Portal support
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    // Initialize session when editor opens
    useEffect(() => {
        if (isOpen && !sessionId && imageUrl) {
            initializeSession()
        }
    }, [isOpen, imageUrl])

    // Cleanup session on close
    useEffect(() => {
        return () => {
            if (sessionId) {
                api.sam3DeleteSession(sessionId).catch(() => { })
            }
        }
    }, [sessionId])

    const initializeSession = async () => {
        setInitializing(true)
        setError(null)
        try {
            // Convert image URL to Blob
            const response = await fetch(imageUrl)
            const blob = await response.blob()

            // Call API to set image
            const result = await api.sam3SetImage(blob)
            setSessionId(result.session_id)
            setImageSize(result.image_size)
        } catch (e) {
            setError(`Failed to initialize: ${(e as Error).message}`)
        } finally {
            setInitializing(false)
        }
    }

    // Calculate the actual rendered image area within the img element (handles object-fit: contain)
    const getActualImageBounds = useCallback(() => {
        if (!imageRef.current) return null

        const img = imageRef.current
        const rect = img.getBoundingClientRect()
        const naturalRatio = img.naturalWidth / img.naturalHeight
        const displayRatio = rect.width / rect.height

        let actualWidth: number, actualHeight: number, offsetX: number, offsetY: number

        if (naturalRatio > displayRatio) {
            // Image is wider than container - letterboxing on top/bottom
            actualWidth = rect.width
            actualHeight = rect.width / naturalRatio
            offsetX = 0
            offsetY = (rect.height - actualHeight) / 2
        } else {
            // Image is taller than container - letterboxing on left/right
            actualHeight = rect.height
            actualWidth = rect.height * naturalRatio
            offsetX = (rect.width - actualWidth) / 2
            offsetY = 0
        }

        return { actualWidth, actualHeight, offsetX, offsetY, rect }
    }, [])

    const handleImageClick = useCallback((e: React.MouseEvent) => {
        if (!imageRef.current || !sessionId) return

        const bounds = getActualImageBounds()
        if (!bounds) return

        const { actualWidth, actualHeight, offsetX, offsetY, rect } = bounds

        // Calculate click position relative to actual image area
        const clickX = e.clientX - rect.left - offsetX
        const clickY = e.clientY - rect.top - offsetY

        // Check if click is within actual image bounds
        if (clickX < 0 || clickX > actualWidth || clickY < 0 || clickY > actualHeight) {
            return // Clicked outside the actual image (in letterbox area)
        }

        // Normalize to 0-1 range based on actual image dimensions
        const x = clickX / actualWidth
        const y = clickY / actualHeight

        setPoints(prev => [...prev, { x, y, type: mode }])
    }, [mode, sessionId, getActualImageBounds])

    const handleRunSegmentation = async () => {
        if (!sessionId || points.length === 0) return

        setProcessing(true)
        setError(null)
        setMaskOverlayUrl(null)

        try {
            // Convert normalized points to pixel coordinates
            const pixelCoords = points.map(p => [
                Math.round(p.x * (imageSize?.width || 1)),
                Math.round(p.y * (imageSize?.height || 1))
            ])
            const labels = points.map(p => p.type === 'foreground' ? 1 : 0)

            // Call predict API
            const result = await api.sam3Predict(
                sessionId,
                pixelCoords,
                labels,
                false,  // usePreviousMask
                true    // multimaskOutput
            )

            // Display best mask overlay
            if (result.best_mask) {
                setMaskOverlayUrl(`${API_BASE_URL}${result.best_mask}`)
            }
        } catch (e) {
            setError(`Segmentation failed: ${(e as Error).message}`)
        } finally {
            setProcessing(false)
        }
    }

    const handleApplyMask = async () => {
        if (!sessionId || points.length === 0) return

        setProcessing(true)
        setError(null)

        try {
            // Convert normalized points to pixel coordinates
            const pixelCoords = points.map(p => [
                Math.round(p.x * (imageSize?.width || 1)),
                Math.round(p.y * (imageSize?.height || 1))
            ])
            const labels = points.map(p => p.type === 'foreground' ? 1 : 0)

            // Call predict_and_apply API
            const result = await api.sam3PredictAndApply(
                sessionId,
                pixelCoords,
                labels,
                maskOverlayUrl !== null  // usePreviousMask if we have an overlay
            )

            // Get the full RGBA image URL
            const fullRgbaUrl = `${API_BASE_URL}${result.rgba_image}`
            setRgbaImageUrl(fullRgbaUrl)

            // Fetch the RGBA image and convert to data URL
            const rgbaResponse = await fetch(fullRgbaUrl)
            const rgbaBlob = await rgbaResponse.blob()
            const rgbaDataUrl = await blobToDataURL(rgbaBlob)

            // Pass both original and masked to parent
            onConfirm(imageUrl, rgbaDataUrl)
            handleClose()
        } catch (e) {
            setError(`Apply mask failed: ${(e as Error).message}`)
        } finally {
            setProcessing(false)
        }
    }

    const handleClose = () => {
        // Cleanup
        if (sessionId) {
            api.sam3DeleteSession(sessionId).catch(() => { })
        }
        setSessionId(null)
        setPoints([])
        setMaskOverlayUrl(null)
        setRgbaImageUrl(null)
        setError(null)
        onClose()
    }

    const handleReset = () => {
        setPoints([])
        setMaskOverlayUrl(null)
        setRgbaImageUrl(null)
    }

    if (!isOpen || !mounted) return null

    // Use Portal to escape parent container constraints
    const { createPortal } = require('react-dom')

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
            <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-semibold">Interactive Segmentation (SAM3)</h2>
                        <p className="text-sm text-muted-foreground">
                            {isInitializing ? "Initializing..." :
                                sessionId ? "Click to define objects. Green = Foreground, Red = Background." :
                                    "Failed to initialize session."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {sessionId && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                {imageSize?.width} × {imageSize?.height}
                            </span>
                        )}
                        <Button variant="ghost" size="icon" onClick={handleClose}>
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-500 text-sm">
                        {error}
                    </div>
                )}

                {/* Main Editor */}
                <div className="flex-1 relative bg-secondary/20 flex items-center justify-center overflow-hidden" ref={containerRef}>
                    {isInitializing ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span>Loading image...</span>
                        </div>
                    ) : (
                        <div className="relative">
                            <img
                                ref={imageRef}
                                src={imageUrl}
                                alt="Segmentation Target"
                                className="max-h-[60vh] object-contain select-none cursor-crosshair"
                                onClick={handleImageClick}
                                draggable={false}
                            />

                            {/* Mask Overlay */}
                            {maskOverlayUrl && (
                                <img
                                    src={maskOverlayUrl}
                                    alt="Mask Overlay"
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-50"
                                    style={{ mixBlendMode: 'screen' }}
                                />
                            )}

                            {/* Render Points */}
                            {points.map((p, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border border-white shadow-sm pointer-events-none",
                                        p.type === 'foreground' ? "bg-green-500" : "bg-red-500"
                                    )}
                                    style={{
                                        // Points are normalized 0-1, position them within the img element
                                        // Since img uses object-fit:contain, we use % which works correctly
                                        left: `${p.x * 100}%`,
                                        top: `${p.y * 100}%`
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Toolbar */}
                <div className="p-4 border-t border-border bg-card flex justify-center gap-4">
                    <div className="flex items-center gap-2 mr-8 bg-muted/50 p-1 rounded-lg">
                        <Button
                            variant={mode === 'foreground' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setMode('foreground')}
                            className={cn(mode === 'foreground' && "bg-green-500/10 text-green-500 hover:bg-green-500/20")}
                            disabled={!sessionId}
                        >
                            <MousePointer2 className="w-4 h-4 mr-2" />
                            Foreground
                        </Button>
                        <Button
                            variant={mode === 'background' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setMode('background')}
                            className={cn(mode === 'background' && "bg-red-500/10 text-red-500 hover:bg-red-500/20")}
                            disabled={!sessionId}
                        >
                            <Eraser className="w-4 h-4 mr-2" />
                            Background
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPoints(points.slice(0, -1))}
                            title="Undo"
                            disabled={points.length === 0}
                        >
                            <Undo className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleReset}
                            title="Reset"
                            disabled={points.length === 0}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleRunSegmentation}
                            disabled={points.length === 0 || isProcessing || !sessionId}
                            variant="outline"
                        >
                            {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Preview
                        </Button>
                        <Button
                            onClick={handleApplyMask}
                            disabled={points.length === 0 || isProcessing || !sessionId}
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

// Helper function to convert Blob to Data URL
function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}
