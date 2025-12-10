'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Paperclip, Bot, User, Sparkles, Loader2, Settings2, X, Image as ImageIcon } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
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

export function ChatInterface() {
    const {
        messages, addMessage, isGenerating, setGenerating, selectedModel, setGlbUrl,
        generationParams, setGenerationParam, attachments, addAttachment, clearAttachments
    } = useAppStore()

    const [inputValue, setInputValue] = useState('')
    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

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
                        addAttachment(ev.target.result as string) // Base64
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

    // Auto-Welcome Message on Model Selection
    useEffect(() => {
        if (!selectedModel) return

        if (selectedModel === 'Trellis') {
            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: `**Trellis Mode Activated**\n\n- **Text-to-3D**: Type a description to generate a model.\n- **Image-to-3D**: Upload an image to transform it into 3D.\n- **Multi-Image**: Upload 3+ images for higher fidelity.\n\nUse the settings (gear icon) to adjust steps and guidance.`
            })
        }
    }, [selectedModel])

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

        try {
            if (!selectedModel) {
                throw new Error("No model selected")
            }

            let response

            // Determine API call based on attachments
            if (currentAttachments.length > 0) {
                // Image-to-3D
                response = await api.generateImage3D(currentAttachments[0], selectedModel, generationParams, currentAttachments)
            } else {
                // Text-to-3D
                response = await api.generateText3D(prompt, selectedModel, generationParams)
            }

            let systemMessageContent = `Generated 3D model with ${selectedModel}.`
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

    return (
        <div className="flex flex-col h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* Header */}
            <div className="p-4 border-b border-border/40 bg-card/10">
                <div className="flex items-center gap-3 mb-4">
                    <img src="/logo.jpg" alt="Phidias Logo" className="w-8 h-8 rounded-lg object-cover" />
                    <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Phidias Studio
                    </h1>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <ModelSelector />
                    </div>
                    {/* Settings Popover */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" className="h-9 w-9 border-dashed">
                                <Settings2 className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-medium leading-none">Generation Settings</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Configure parameters for {selectedModel}.
                                    </p>
                                </div>
                                {selectedModel === 'Trellis' ? (
                                    <div className="grid gap-2">
                                        <div className="grid gap-4 py-2">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="seed">Seed</Label>
                                                <span className="text-xs text-muted-foreground">{generationParams.seed}</span>
                                            </div>
                                            <Input
                                                id="seed"
                                                type="number"
                                                value={generationParams.seed}
                                                onChange={(e) => setGenerationParam('seed', parseInt(e.target.value))}
                                                className="h-8"
                                            />
                                        </div>

                                        <div className="grid gap-4 py-2">
                                            <div className="flex items-center justify-between">
                                                <Label>Simplify Ratio ({generationParams.simplify})</Label>
                                            </div>
                                            <Slider
                                                defaultValue={[generationParams.simplify]}
                                                max={1}
                                                step={0.01}
                                                onValueChange={(v) => setGenerationParam('simplify', v[0])}
                                            />
                                        </div>

                                        <div className="grid gap-4 py-2">
                                            <div className="flex items-center justify-between">
                                                <Label>Steps (Sparse: {generationParams.ss_sampling_steps})</Label>
                                            </div>
                                            <Slider
                                                defaultValue={[generationParams.ss_sampling_steps]}
                                                max={50}
                                                step={1}
                                                onValueChange={(v) => setGenerationParam('ss_sampling_steps', v[0])}
                                            />
                                        </div>

                                        <div className="grid gap-4 py-2">
                                            <div className="flex items-center justify-between">
                                                <Label>Guidance (CFG: {generationParams.ss_guidance_strength})</Label>
                                            </div>
                                            <Slider
                                                defaultValue={[generationParams.ss_guidance_strength]}
                                                max={20}
                                                step={0.1}
                                                onValueChange={(v) => setGenerationParam('ss_guidance_strength', v[0])}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-4 text-center text-sm text-muted-foreground">
                                        No configurable settings for {selectedModel} yet.
                                    </div>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-4 min-h-[50px]">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground mt-10 opacity-50">
                            <Sparkles className="w-12 h-12 mb-2 stroke-1" />
                            <p className="text-sm">Select a model and start creating.</p>
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
            < div className="p-4 border-t border-border/40 bg-background/50 backdrop-blur-sm" >
                {/* Attachment Previews */}
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
                        accept=".glb,.png,.jpg,.jpeg,.webp"
                        multiple
                        onChange={handleFileUpload}
                        disabled={!selectedModel || isGenerating}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload Image or GLB"
                        disabled={!selectedModel || isGenerating}
                    >
                        <Paperclip className="w-5 h-5" />
                    </Button>
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            !selectedModel
                                ? "Select a model to start..."
                                : attachments.length > 0
                                    ? "Describe changes or hit send..."
                                    : "Describe what you want to create..."
                        }
                        className="flex-1 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/20 h-10 px-4 rounded-xl"
                        disabled={!selectedModel || isGenerating}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={(!inputValue.trim() && attachments.length === 0) || isGenerating || !selectedModel}
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
                    Press Enter to generate · Supports multimodal input
                </div>
            </div >
        </div >
    )
}
