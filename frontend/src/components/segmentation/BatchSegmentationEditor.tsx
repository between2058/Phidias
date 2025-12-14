'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Check, MousePointer2, Eraser, Undo, Loader2, SkipForward, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { ImageBatchItem } from '@/store/useAppStore'
import { createPortal } from 'react-dom'

interface BatchSegmentationEditorProps {
    images: ImageBatchItem[]
    isOpen: boolean
    onClose: () => void
    onComplete: (processedImages: ImageBatchItem[]) => void
}

interface Point {
    x: number
    y: number
    type: 'foreground' | 'background'
}

export function BatchSegmentationEditor({ images, isOpen, onClose, onComplete }: BatchSegmentationEditorProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [processedImages, setProcessedImages] = useState<ImageBatchItem[]>([])

    // Per-image state
    const [points, setPoints] = useState<Point[]>([])
    const [mode, setMode] = useState<'foreground' | 'background'>('foreground')
    const [isProcessing, setProcessing] = useState(false)
    const [isInitializing, setInitializing] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
    const [maskOverlayUrl, setMaskOverlayUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const imageRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    // Sync processedImages when images prop changes
    useEffect(() => {
        if (images.length > 0 && processedImages.length !== images.length) {
            setProcessedImages([...images])
            setCurrentIndex(0)
        }
    }, [images])

    // Compute current image safely
    const currentImage = images.length > 0 ? images[currentIndex] : null

    // Initialize session when image changes
    useEffect(() => {
        if (isOpen && currentImage && !sessionId) {
            initializeSession()
        }
    }, [isOpen, currentIndex, currentImage?.id])

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
        setPoints([])
        setMaskOverlayUrl(null)

        try {
            if (!currentImage) {
                throw new Error('No image selected')
            }
            const imageUrl = currentImage.originalUrl
            let blob: Blob

            if (imageUrl.startsWith('data:')) {
                const base64Data = imageUrl.split(',')[1]
                const byteCharacters = atob(base64Data)
                const byteNumbers = new Array(byteCharacters.length)
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i)
                }
                const byteArray = new Uint8Array(byteNumbers)
                blob = new Blob([byteArray], { type: 'image/png' })
            } else {
                const response = await fetch(imageUrl)
                blob = await response.blob()
            }

            const result = await api.sam3SetImage(blob)
            setSessionId(result.session_id)
            setImageSize(result.image_size)
        } catch (e) {
            console.error('Failed to initialize session:', e)
            setError(`Failed to initialize: ${(e as Error).message}`)
        } finally {
            setInitializing(false)
        }
    }

    const resetForNewImage = () => {
        if (sessionId) {
            api.sam3DeleteSession(sessionId).catch(() => { })
        }
        setSessionId(null)
        setPoints([])
        setMaskOverlayUrl(null)
        setError(null)
    }

    const getActualImageBounds = () => {
        if (!imageRef.current || !containerRef.current) return null

        const img = imageRef.current
        const container = containerRef.current
        const rect = img.getBoundingClientRect()
        const naturalWidth = img.naturalWidth
        const naturalHeight = img.naturalHeight
        const containerRect = container.getBoundingClientRect()

        const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
        const actualWidth = naturalWidth * scale
        const actualHeight = naturalHeight * scale
        const offsetX = (rect.width - actualWidth) / 2
        const offsetY = (rect.height - actualHeight) / 2

        return { actualWidth, actualHeight, offsetX, offsetY, rect, scale, naturalWidth, naturalHeight }
    }

    const handleImageClick = useCallback((e: React.MouseEvent) => {
        if (!imageRef.current || !sessionId) return

        const bounds = getActualImageBounds()
        if (!bounds) return

        const { actualWidth, actualHeight, offsetX, offsetY, rect } = bounds

        const clickX = e.clientX - rect.left - offsetX
        const clickY = e.clientY - rect.top - offsetY

        if (clickX < 0 || clickX > actualWidth || clickY < 0 || clickY > actualHeight) {
            return
        }

        const normX = clickX / actualWidth
        const normY = clickY / actualHeight

        const newPoint: Point = {
            x: normX,
            y: normY,
            type: mode
        }
        setPoints(prev => [...prev, newPoint])
    }, [mode, sessionId])

    const handlePreview = async () => {
        if (!sessionId || points.length === 0) return

        setProcessing(true)
        setError(null)
        setMaskOverlayUrl(null)

        try {
            const pixelCoords = points.map(p => [
                Math.round(p.x * (imageSize?.width || 1)),
                Math.round(p.y * (imageSize?.height || 1))
            ])
            const labels = points.map(p => p.type === 'foreground' ? 1 : 0)

            const result = await api.sam3Predict(sessionId, pixelCoords, labels, false, true)

            if (result.best_mask_base64) {
                setMaskOverlayUrl(`data:image/png;base64,${result.best_mask_base64}`)
            }
        } catch (e) {
            setError(`Preview failed: ${(e as Error).message}`)
        } finally {
            setProcessing(false)
        }
    }

    const handleSaveAndNext = async () => {
        if (!sessionId || points.length === 0) return

        setProcessing(true)
        setError(null)

        try {
            const pixelCoords = points.map(p => [
                Math.round(p.x * (imageSize?.width || 1)),
                Math.round(p.y * (imageSize?.height || 1))
            ])
            const labels = points.map(p => p.type === 'foreground' ? 1 : 0)

            const result = await api.sam3PredictAndApply(sessionId, pixelCoords, labels, maskOverlayUrl !== null)

            if (!result.rgba_base64) {
                throw new Error('No RGBA image returned')
            }

            const rgbaDataUrl = `data:image/png;base64,${result.rgba_base64}`

            // Update processed images
            const updated = [...processedImages]
            updated[currentIndex] = {
                ...updated[currentIndex],
                processedUrl: rgbaDataUrl
            }
            setProcessedImages(updated)

            // Move to next image or complete
            resetForNewImage()

            if (currentIndex < images.length - 1) {
                setCurrentIndex(currentIndex + 1)
            }
        } catch (e) {
            setError(`Save failed: ${(e as Error).message}`)
        } finally {
            setProcessing(false)
        }
    }

    const handleSkip = () => {
        const updated = [...processedImages]
        updated[currentIndex] = {
            ...updated[currentIndex],
            skipped: true
        }
        setProcessedImages(updated)

        resetForNewImage()

        if (currentIndex < images.length - 1) {
            setCurrentIndex(currentIndex + 1)
        }
    }

    const handlePrev = () => {
        if (currentIndex > 0) {
            resetForNewImage()
            setCurrentIndex(currentIndex - 1)
        }
    }

    const handleComplete = () => {
        onComplete(processedImages)
        onClose()
    }

    const handleClose = () => {
        if (sessionId) {
            api.sam3DeleteSession(sessionId).catch(() => { })
        }
        onClose()
    }

    if (!isOpen || !mounted || images.length === 0 || processedImages.length === 0 || !currentImage) return null

    const processedCount = processedImages.filter(img => img.processedUrl || img.skipped).length
    const allDone = processedCount === images.length

    return createPortal(
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="relative bg-background rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold">Batch Segmentation</h2>
                        <span className="text-sm text-muted-foreground">
                            Image {currentIndex + 1} of {images.length}
                        </span>
                        <span className="text-sm text-green-500">
                            {processedCount} processed
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleClose}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Thumbnail strip */}
                <div className="flex items-center gap-1 p-2 border-b bg-muted/30 overflow-x-auto">
                    {images.map((img, idx) => (
                        <button
                            key={img.id}
                            onClick={() => {
                                if (idx !== currentIndex) {
                                    resetForNewImage()
                                    setCurrentIndex(idx)
                                }
                            }}
                            className={cn(
                                "relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
                                idx === currentIndex ? "border-primary" : "border-transparent",
                                processedImages[idx]?.processedUrl && "ring-2 ring-green-500",
                                processedImages[idx]?.skipped && "opacity-50"
                            )}
                        >
                            <img src={processedImages[idx]?.processedUrl || img.originalUrl} className="w-full h-full object-cover" />
                            {processedImages[idx]?.processedUrl && (
                                <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-green-500" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>

                {/* Main content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Image area */}
                    <div
                        ref={containerRef}
                        className="flex-1 relative flex items-center justify-center bg-black/50 min-h-[400px] cursor-crosshair"
                        onClick={handleImageClick}
                    >
                        {isInitializing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        )}

                        {/* Image wrapper with relative positioning for mask overlay */}
                        <div className="relative">
                            <img
                                ref={imageRef}
                                src={currentImage.originalUrl}
                                alt="Edit image"
                                className="max-h-[60vh] object-contain cursor-crosshair"
                                draggable={false}
                            />

                            {/* Mask overlay */}
                            {maskOverlayUrl && (
                                <img
                                    src={maskOverlayUrl}
                                    alt="Mask"
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-50"
                                    style={{ mixBlendMode: 'screen' }}
                                />
                            )}
                        </div>

                        {/* Points */}
                        {points.map((p, i) => {
                            const bounds = getActualImageBounds()
                            if (!bounds || !imageRef.current) return null
                            const { actualWidth, actualHeight, offsetX, offsetY, rect } = bounds
                            const containerRect = containerRef.current?.getBoundingClientRect()
                            if (!containerRect) return null

                            const imgLeft = rect.left - containerRect.left + offsetX
                            const imgTop = rect.top - containerRect.top + offsetY

                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        "absolute w-3 h-3 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg",
                                        p.type === 'foreground' ? "bg-green-500" : "bg-red-500"
                                    )}
                                    style={{
                                        left: imgLeft + p.x * actualWidth,
                                        top: imgTop + p.y * actualHeight
                                    }}
                                />
                            )
                        })}

                        {error && (
                            <div className="absolute bottom-4 left-4 right-4 bg-destructive/90 text-destructive-foreground p-2 rounded text-sm">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Tools sidebar */}
                    <div className="w-48 border-l p-3 flex flex-col gap-3">
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Mode</p>
                            <div className="flex gap-1">
                                <Button
                                    variant={mode === 'foreground' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setMode('foreground')}
                                    className="flex-1 gap-1"
                                >
                                    <MousePointer2 className="w-3 h-3" />
                                    FG
                                </Button>
                                <Button
                                    variant={mode === 'background' ? 'destructive' : 'outline'}
                                    size="sm"
                                    onClick={() => setMode('background')}
                                    className="flex-1 gap-1"
                                >
                                    <Eraser className="w-3 h-3" />
                                    BG
                                </Button>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPoints([])}
                            disabled={points.length === 0}
                            className="gap-1"
                        >
                            <Undo className="w-3 h-3" />
                            Clear Points
                        </Button>

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handlePreview}
                            disabled={isProcessing || points.length === 0 || !sessionId}
                            className="gap-1"
                        >
                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Preview
                        </Button>

                        <div className="flex-1" />

                        <p className="text-xs text-muted-foreground">
                            {points.length} point{points.length !== 1 ? 's' : ''} placed
                        </p>
                    </div>
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between p-4 border-t bg-muted/30">
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrev}
                            disabled={currentIndex === 0 || isProcessing}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSkip}
                            disabled={isProcessing}
                        >
                            <SkipForward className="w-4 h-4 mr-1" />
                            Skip
                        </Button>

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSaveAndNext}
                            disabled={isProcessing || points.length === 0 || !sessionId}
                        >
                            {isProcessing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                            {currentIndex < images.length - 1 ? 'Save & Next' : 'Save'}
                        </Button>

                        {allDone && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleComplete}
                            >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Complete All
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
