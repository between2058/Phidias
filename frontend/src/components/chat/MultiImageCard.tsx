'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Images, Scissors, Box, Loader2, Check, SkipForward } from 'lucide-react'
import { ImageBatchItem } from '@/store/useAppStore'

interface MultiImageCardProps {
    images: ImageBatchItem[]
    onBatchEdit: () => void
    onGenerateTrellis: () => void
    onGenerateSam3D: () => void
    isProcessing?: boolean
}

export function MultiImageCard({
    images,
    onBatchEdit,
    onGenerateTrellis,
    onGenerateSam3D,
    isProcessing = false
}: MultiImageCardProps) {
    const processedCount = images.filter(img => img.processedUrl || img.skipped).length
    const allProcessed = processedCount === images.length
    const hasAnyProcessed = images.some(img => img.processedUrl)

    // Only enable SAM3D if all images have been processed (not just skipped)
    const canUseSam3D = images.every(img => img.processedUrl)

    return (
        <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
            {/* Thumbnail Grid */}
            <div className="p-3 border-b border-border/40">
                <div className="flex items-center gap-2 mb-2">
                    <Images className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                        {images.length} Images
                        {processedCount > 0 && (
                            <span className="text-muted-foreground ml-1">
                                ({processedCount}/{images.length} processed)
                            </span>
                        )}
                    </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                    {images.slice(0, 8).map((img, idx) => (
                        <div
                            key={img.id}
                            className={cn(
                                "relative aspect-square rounded-md overflow-hidden bg-secondary/30",
                                img.processedUrl && "ring-2 ring-green-500/50",
                                img.skipped && "opacity-50"
                            )}
                        >
                            <img
                                src={img.processedUrl || img.originalUrl}
                                alt={`Image ${idx + 1}`}
                                className="w-full h-full object-cover"
                            />
                            {img.processedUrl && (
                                <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full p-0.5">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                            )}
                            {img.skipped && (
                                <div className="absolute top-0.5 right-0.5 bg-gray-500 rounded-full p-0.5">
                                    <SkipForward className="w-2.5 h-2.5 text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    {images.length > 8 && (
                        <div className="aspect-square rounded-md bg-secondary/50 flex items-center justify-center">
                            <span className="text-xs text-muted-foreground font-medium">
                                +{images.length - 8}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="p-3 flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onBatchEdit}
                    disabled={isProcessing || allProcessed}
                    className="gap-1.5"
                >
                    {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Scissors className="w-3.5 h-3.5" />
                    )}
                    {allProcessed ? 'Already Processed' : 'Batch Segment'}
                </Button>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onGenerateTrellis}
                    disabled={isProcessing}
                    className="gap-1.5"
                >
                    <Box className="w-3.5 h-3.5" />
                    Trellis Multi-Image
                </Button>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onGenerateSam3D}
                    disabled={isProcessing || !canUseSam3D}
                    className="gap-1.5"
                    title={!canUseSam3D ? "All images must be segmented first" : undefined}
                >
                    <Box className="w-3.5 h-3.5" />
                    SAM3D Batch
                </Button>
            </div>
        </div>
    )
}
