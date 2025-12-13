'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Paperclip, Bot, User, Sparkles, Loader2, Settings2, X, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, base64ToBlob } from '@/services/api'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import ReactMarkdown from 'react-markdown'
import { SegmentationEditor } from '@/components/segmentation/SegmentationEditor'

export function ChatInterface() {
    const {
        messages, addMessage, isGenerating, setGenerating, selectedModel, setGlbUrl,
        generationParams, setGenerationParam, attachments, addAttachment, clearAttachments
    } = useAppStore()

    const [inputValue, setInputValue] = useState('')
    const [editingImage, setEditingImage] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const glbInputRef = useRef<HTMLInputElement>(null)

    const handleSegmentationConfirm = (originalImageUrl: string, maskedImageUrl: string) => {
        // Add the masked result to chat
        addMessage({
            id: Date.now().toString(),
            role: 'system',
            content: "**Segmentation Complete**\n\nHere is your processed asset (RGBA with mask). Choose a model to generate 3D:",
            attachments: [maskedImageUrl],
            actions: [
                {
                    label: "🚀 Generate (Trellis)",
                    onClick: () => {
                        clearAttachments()
                        addAttachment(maskedImageUrl)
                        // Trigger generation with Trellis
                        setInputValue("Generating 3D with Trellis...")
                        setTimeout(() => handleManualGenerate(maskedImageUrl, 'Trellis'), 100)
                    }
                },
                {
                    label: "✨ Generate (SAM-3D)",
                    variant: "secondary",
                    onClick: () => {
                        // Trigger generation with SAM-3D using both images
                        handleSam3DGenerate(originalImageUrl, maskedImageUrl)
                    }
                }
            ]
        })
    }

    // SAM3D specific generation handler
    const handleSam3DGenerate = async (originalImage: string, maskedImage: string) => {
        setGenerating(true)
        try {
            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: "Generating 3D with **SAM-3D**... This may take a while."
            })

            const response = await api.generateSam3D(originalImage, maskedImage, generationParams.sam3d.points_per_side)

            let systemMessageContent = "SAM-3D generation complete."
            if (response.glb_data) {
                const blob = base64ToBlob(response.glb_data)
                const url = URL.createObjectURL(blob)
                useAppStore.getState().setGlbUrl(url)
                systemMessageContent += " Loaded into viewer."
            }

            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: systemMessageContent
            })
        } catch (error) {
            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: `Error: SAM-3D generation failed. ${(error as Error).message}`
            })
        } finally {
            setGenerating(false)
        }
    }

    // New helper to trigger generation programmatically
    const handleManualGenerate = async (attachment: string, model: string) => {
        setGenerating(true)
        try {
            // Use specific params
            const params = model === 'Trellis' ? generationParams.trellis : generationParams.sam3d

            // Image-to-3D
            const response = await api.generateImage3D(attachment, model, params, [attachment])

            let systemMessageContent = `Generated 3D model with ${model}.`
            if (response.glb_data) {
                const blob = base64ToBlob(response.glb_data)
                const url = URL.createObjectURL(blob)
                useAppStore.getState().setGlbUrl(url)
                systemMessageContent += " Loaded into viewer."
            }

            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: systemMessageContent
            })
        } catch (error) {
            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: `Error: Failed to generate. ${(error as Error).message}`
            })
        } finally {
            setGenerating(false)
            setInputValue('')
        }
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        Array.from(files).forEach(file => {
            if (file.name.endsWith('.glb')) {
                // Direct GLB Viewer Load
                const url = URL.createObjectURL(file)
                setGlbUrl(url)
                addMessage({
                    id: Date.now().toString(),
                    role: 'system',
                    content: `Loaded local file: ${file.name}`
                })
            } else if (file.type.startsWith('image/')) {
                // Add to attachments for generation
                const reader = new FileReader()
                reader.onload = (ev) => {
                    if (ev.target?.result) {
                        const base64 = ev.target.result as string
                        // addAttachment(base64) // Don't auto-attach to global state immediately, let user decide action?
                        // Actually, users might want to type with it. Keeping auto-attach is fine, but we ALSO show the card.
                        addAttachment(base64)

                        // Smart Context: Suggest Next Steps
                        addMessage({
                            id: Date.now().toString(),
                            role: 'system',
                            content: `**Image Uploaded**\n\nWhat would you like to do?`,
                            actions: [
                                {
                                    label: "🚀 Generate 3D (Trellis)",
                                    onClick: () => {
                                        setInputValue("Generating 3D model (Trellis)...")
                                        setTimeout(() => handleManualGenerate(base64, 'Trellis'), 100)
                                    }
                                },
                                {
                                    label: "🖱️ Interactive Seg",
                                    variant: "outline",
                                    onClick: () => {
                                        setEditingImage(base64)
                                    }
                                }
                            ]
                        })
                    }
                }
                reader.readAsDataURL(file)
            }
        })

        // Reset input
        e.target.value = ''
    }

    // Auto-scroll to bottom on new message
    useEffect(() => {
        if (scrollRef.current) {
            // @ts-ignore - ScrollArea ref handling
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight
            }
        }
    }, [messages])



    const handleSend = async () => {
        if (!inputValue.trim() && attachments.length === 0) return

        const currentAttachments = [...attachments]
        // Add user message with attachments visual
        let content = inputValue
        if (attachments.length > 0) {
            content += ` [${attachments.length} Images Attached]`
        }

        addMessage({
            id: Date.now().toString(),
            role: 'user',
            content: content,
            attachments: currentAttachments
        })

        const prompt = inputValue

        setInputValue('')
        clearAttachments()
        setGenerating(true)

        // Default to Trellis for text input
        const modelToUse = 'Trellis'
        const params = generationParams.trellis

        try {
            let response

            // Determine API call based on attachments
            if (currentAttachments.length > 0) {
                // Image-to-3D (Defaulting to Trellis if just sent via enter)
                response = await api.generateImage3D(currentAttachments[0], modelToUse, params, currentAttachments)
            } else {
                // Text-to-3D
                response = await api.generateText3D(prompt, modelToUse, params)
            }

            let systemMessageContent = `Generated 3D model with ${modelToUse}.`
            if (response.glb_data) {
                const blob = base64ToBlob(response.glb_data)
                const url = URL.createObjectURL(blob)
                useAppStore.getState().setGlbUrl(url)
                systemMessageContent += " Loaded into viewer."
            }

            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: systemMessageContent
            })
        } catch (error) {
            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: `Error: Failed to generate model. ${(error as Error).message}`
            })
        } finally {
            setGenerating(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const [settingsTab, setSettingsTab] = useState<'trellis' | 'sam3d' | 'p3sam'>('trellis')

    return (
        <div className="flex flex-col h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-border/40 bg-card/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="Phidias Logo" className="w-8 h-8 rounded-lg object-cover" />
                        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                            Phidias Studio
                        </h1>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Settings Popover */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9 border-dashed">
                                    <Settings2 className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                                <div className="grid gap-4">
                                    <div className="space-y-2 border-b border-border pb-2">
                                        <h4 className="font-medium leading-none">Global Settings</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Configure parameters for all models.
                                        </p>
                                    </div>

                                    {/* Simple Tabs */}
                                    <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                        <button
                                            onClick={() => setSettingsTab('trellis')}
                                            className={cn("flex-1 text-xs py-1.5 rounded-md transition-all", settingsTab === 'trellis' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                                        >
                                            Trellis
                                        </button>
                                        <button
                                            onClick={() => setSettingsTab('sam3d')}
                                            className={cn("flex-1 text-xs py-1.5 rounded-md transition-all", settingsTab === 'sam3d' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                                        >
                                            SAM-3D
                                        </button>
                                        <button
                                            onClick={() => setSettingsTab('p3sam')}
                                            className={cn("flex-1 text-xs py-1.5 rounded-md transition-all", settingsTab === 'p3sam' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                                        >
                                            P3-SAM
                                        </button>
                                    </div>

                                    {settingsTab === 'trellis' && (
                                        <div className="grid gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="seed">Seed</Label>
                                                    <span className="text-xs text-muted-foreground">{generationParams.trellis.seed}</span>
                                                </div>
                                                <Input
                                                    id="seed"
                                                    type="number"
                                                    value={generationParams.trellis.seed}
                                                    onChange={(e) => setGenerationParam('trellis', 'seed', parseInt(e.target.value))}
                                                    className="h-8"
                                                />
                                            </div>

                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Simplify Ratio ({generationParams.trellis.simplify})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.trellis.simplify]}
                                                    max={1}
                                                    step={0.01}
                                                    onValueChange={(v) => setGenerationParam('trellis', 'simplify', v[0])}
                                                />
                                            </div>

                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Steps (Sparse: {generationParams.trellis.ss_sampling_steps})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.trellis.ss_sampling_steps]}
                                                    max={50}
                                                    step={1}
                                                    onValueChange={(v) => setGenerationParam('trellis', 'ss_sampling_steps', v[0])}
                                                />
                                            </div>

                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Guidance (CFG: {generationParams.trellis.ss_guidance_strength})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.trellis.ss_guidance_strength]}
                                                    max={20}
                                                    step={0.1}
                                                    onValueChange={(v) => setGenerationParam('trellis', 'ss_guidance_strength', v[0])}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {settingsTab === 'sam3d' && (
                                        <div className="grid gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Points Per Side ({generationParams.sam3d.points_per_side})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.sam3d.points_per_side]}
                                                    max={64}
                                                    step={1}
                                                    onValueChange={(v) => setGenerationParam('sam3d', 'points_per_side', v[0])}
                                                />
                                            </div>
                                            <div className="py-2 text-center text-xs text-muted-foreground">
                                                SAM-3D settings are currently placeholders.
                                            </div>
                                        </div>
                                    )}

                                    {settingsTab === 'p3sam' && (
                                        <div className="grid gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Point Num ({generationParams.p3sam.point_num})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.p3sam.point_num]}
                                                    max={200000}
                                                    step={1000}
                                                    onValueChange={(v) => setGenerationParam('p3sam', 'point_num', v[0])}
                                                />
                                            </div>
                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Prompt Num ({generationParams.p3sam.prompt_num})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.p3sam.prompt_num]}
                                                    max={1000}
                                                    step={10}
                                                    onValueChange={(v) => setGenerationParam('p3sam', 'prompt_num', v[0])}
                                                />
                                            </div>
                                            <div className="grid gap-4 py-2">
                                                <div className="flex items-center justify-between">
                                                    <Label>Threshold ({generationParams.p3sam.threshold})</Label>
                                                </div>
                                                <Slider
                                                    defaultValue={[generationParams.p3sam.threshold]}
                                                    max={1}
                                                    step={0.01}
                                                    onValueChange={(v) => setGenerationParam('p3sam', 'threshold', v[0])}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between py-2">
                                                <Label>Post Process</Label>
                                                <button
                                                    onClick={() => setGenerationParam('p3sam', 'post_process', !generationParams.p3sam.post_process)}
                                                    className={cn(
                                                        "w-10 h-5 rounded-full transition-colors relative",
                                                        generationParams.p3sam.post_process ? "bg-primary" : "bg-muted"
                                                    )}
                                                >
                                                    <span className={cn(
                                                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                                                        generationParams.p3sam.post_process && "translate-x-5"
                                                    )} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 w-full min-h-0 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-4 min-h-[50px]">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full px-6 animate-in fade-in duration-500 space-y-8 mt-10">
                            <div className="text-center space-y-2">
                                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
                                    Create something extraordinary.
                                </h2>
                                <p className="text-muted-foreground">Select a mode to begin your creation journey.</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4 w-full">
                                <button
                                    onClick={() => {
                                        if (inputRef.current) {
                                            inputRef.current.focus()
                                        }
                                    }}
                                    className="group relative flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/20"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center group-hover:from-blue-500/30 group-hover:to-purple-500/30 transition-colors border border-white/10">
                                        <div className="text-3xl">Aa</div>
                                    </div>
                                    <div className="text-center space-y-1">
                                        <h3 className="font-semibold text-lg">Text to 3D</h3>
                                        <p className="text-xs text-muted-foreground">Describe your vision with words</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group relative flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald/10 hover:border-emerald-500/20"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center group-hover:from-emerald-500/30 group-hover:to-teal-500/30 transition-colors border border-white/10">
                                        <ImageIcon className="w-8 h-8 opacity-80" />
                                    </div>
                                    <div className="text-center space-y-1">
                                        <h3 className="font-semibold text-lg">Image to 3D</h3>
                                        <p className="text-xs text-muted-foreground">Transform existing 2D assets</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => glbInputRef.current?.click()}
                                    className="group relative flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/10 hover:border-orange-500/20"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-yellow-500/20 flex items-center justify-center group-hover:from-orange-500/30 group-hover:to-yellow-500/30 transition-colors border border-white/10">
                                        <Sparkles className="w-8 h-8 opacity-80" />
                                    </div>
                                    <div className="text-center space-y-1">
                                        <h3 className="font-semibold text-lg">Part Segmentation</h3>
                                        <p className="text-xs text-muted-foreground">Segment 3D model with P3-SAM</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex w-full gap-3 text-sm",
                                msg.role === 'user' ? "justify-end" : "justify-start"
                            )}
                        >
                            {msg.role === 'system' && (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                    <Bot className="w-4 h-4 text-primary" />
                                </div>
                            )}

                            <div
                                className={cn(
                                    "relative px-4 py-3 rounded-2xl max-w-[85%]",
                                    msg.role === 'user'
                                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                                        : "bg-muted/50 border border-border/50 rounded-tl-sm"
                                )}
                            >
                                <div className="flex flex-col gap-2">
                                    <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4">
                                        <ReactMarkdown
                                            components={{
                                                p: ({ node, ...props }) => <p dir="auto" {...props} />,
                                                a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4" {...props} />
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {msg.attachments.map((src, i) => (
                                                <img
                                                    key={i}
                                                    src={src}
                                                    alt="attachment"
                                                    className="h-20 w-auto rounded-md object-cover border border-white/20"
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {msg.actions && msg.actions.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-primary/10">
                                            {msg.actions.map((action, i) => (
                                                <Button
                                                    key={i}
                                                    variant={action.variant || "secondary"}
                                                    size="sm"
                                                    onClick={action.onClick}
                                                    className="h-7 text-xs"
                                                >
                                                    {action.label}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                    ))}

                    {isGenerating && (
                        <div className="flex w-full gap-3 justify-start animate-pulse">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4 text-primary" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl bg-muted/50 border border-border/50 rounded-tl-sm flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"></span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea >

            {/* Input Area */}
            <div className="p-4 border-t border-border/40 bg-background/50 backdrop-blur-sm" >
                {/* ... existing input area content ... */}
                {
                    attachments.length > 0 && (
                        <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                            {attachments.map((src, i) => (
                                <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-border group shrink-0">
                                    <img src={src} className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => {
                                            // Simple remove logic could go here, but omitted for MVP strictness
                                        }}
                                        className="absolute top-0 right-0 p-0.5 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )
                }

                <div className="relative flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".png,.jpg,.jpeg,.webp"
                        multiple
                        onChange={handleFileUpload}
                        disabled={isGenerating}
                    />
                    <input
                        type="file"
                        ref={glbInputRef}
                        className="hidden"
                        accept=".glb"
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            // Load into viewer first
                            const url = URL.createObjectURL(file)
                            setGlbUrl(url)

                            addMessage({
                                id: Date.now().toString(),
                                role: 'system',
                                content: `**GLB Loaded for Segmentation**\n\nFile: ${file.name}\n\nClick the button below to run P3-SAM segmentation, or use the Magic Wand tool in the viewer.`,
                                actions: [
                                    {
                                        label: "🪄 Run P3-SAM Segmentation",
                                        onClick: () => {
                                            // Trigger segmentation via Viewer3D's Magic Wand logic
                                            addMessage({
                                                id: Date.now().toString(),
                                                role: 'system',
                                                content: "Please use the **Magic Wand** button in the 3D viewer (top-left) to run P3-SAM segmentation on this model."
                                            })
                                        }
                                    }
                                ]
                            })

                            e.target.value = ''
                        }}
                        disabled={isGenerating}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload Image or GLB"
                        disabled={isGenerating}
                    >
                        <Paperclip className="w-5 h-5" />
                    </Button>
                    <Input
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            attachments.length > 0
                                ? "Describe changes or hit send (Trellis)..."
                                : "Type prompt for Trellis..."
                        }
                        className="flex-1 bg-secondary/50 border-0 h-10 px-4 rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:shadow-[0_0_20px_rgba(0,255,255,0.3)]"
                        disabled={isGenerating}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={(!inputValue.trim() && attachments.length === 0) || isGenerating}
                        size="icon"
                        className={cn(
                            "h-10 w-10 rounded-xl transition-all",
                            (inputValue.trim() || attachments.length > 0) ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "bg-muted text-muted-foreground"
                        )}
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
                <div className="mt-2 text-[10px] text-center text-muted-foreground/60">
                    Press Enter to generate with Trellis · Supports multimodal input
                </div>
            </div >

            <SegmentationEditor
                isOpen={!!editingImage}
                imageUrl={editingImage || ""}
                onClose={() => setEditingImage(null)}
                onConfirm={handleSegmentationConfirm}
            />
        </div>
    )
}
