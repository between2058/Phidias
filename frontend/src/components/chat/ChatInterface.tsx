'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Paperclip, Bot, User, Sparkles, Loader2 } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { cn } from '@/lib/utils'
import { api, base64ToBlob } from '@/services/api'

export function ChatInterface() {
    const { messages, addMessage, isGenerating, setGenerating, selectedModel, setGlbUrl } = useAppStore()
    const [inputValue, setInputValue] = useState('')
    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.name.endsWith('.glb')) {
            addMessage({
                id: Date.now().toString(),
                role: 'system',
                content: "Error: Please upload a Valid .glb file."
            })
            return
        }

        const url = URL.createObjectURL(file)
        setGlbUrl(url)
        addMessage({
            id: Date.now().toString(),
            role: 'system',
            content: `Loaded local file: ${file.name}`
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
        if (!inputValue.trim()) return

        // Add user message
        addMessage({
            id: Date.now().toString(),
            role: 'user',
            content: inputValue
        })
        const prompt = inputValue
        setInputValue('')
        setGenerating(true)

        try {
            const response = await api.generateText3D(prompt, selectedModel)

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
                <ModelSelector />
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
                                {msg.content}
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
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t border-border/40 bg-background/50 backdrop-blur-sm">
                <div className="relative flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".glb"
                        onChange={handleFileUpload}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        title="Upload GLB"
                    >
                        <Paperclip className="w-5 h-5" />
                    </Button>
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe what you want to create..."
                        className="flex-1 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/20 h-10 px-4 rounded-xl"
                        disabled={isGenerating}
                    />
                    <Button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isGenerating}
                        size="icon"
                        className={cn(
                            "h-10 w-10 rounded-xl transition-all",
                            inputValue.trim() ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "bg-muted text-muted-foreground"
                        )}
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
                <div className="mt-2 text-[10px] text-center text-muted-foreground/60">
                    Press Enter to generate · Supports multimodal input
                </div>
            </div>
        </div>
    )
}
