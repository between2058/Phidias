'use client'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useAppStore, ModelType } from "@/store/useAppStore"
import { Badge } from "@/components/ui/badge"

const MODELS: { id: ModelType; name: string; description: string }[] = [
    { id: 'Trellis', name: 'Trellis', description: 'Text-to-3D & Image-to-3D' },
    { id: 'SAM-3D', name: 'SAM-3D', description: 'Image-to-3D Generation' },
    { id: 'SAM1', name: 'SAM 1', description: '2D Image Segmentation' },
    { id: 'P3-SAM', name: 'P3-SAM', description: '3D Part Segmentation' },
]

export function ModelSelector() {
    const { selectedModel, setModel } = useAppStore()

    return (
        <div className="flex flex-col gap-2 p-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Model
            </label>
            <Select value={selectedModel || ""} onValueChange={(v) => setModel(v as ModelType)}>
                <SelectTrigger className="w-full bg-secondary/50 border-0 focus:ring-1 ring-primary/20 transition-all hover:bg-secondary/80">
                    <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                    {MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="cursor-pointer">
                            <div className="flex flex-col items-start py-1">
                                <span className="font-semibold text-sm">{model.name}</span>
                                <span className="text-[10px] text-muted-foreground">{model.description}</span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px] h-5 bg-background/50 backdrop-blur">
                    v0.1
                </Badge>
                <span className="text-[10px] text-muted-foreground truncate">
                    {MODELS.find(m => m.id === selectedModel)?.description || "No model selected"}
                </span>
            </div>
        </div>
    )
}
