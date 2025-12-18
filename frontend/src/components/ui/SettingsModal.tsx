import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppStore } from "@/store/useAppStore"
import { useState, useEffect } from "react"
import { Separator } from "@/components/ui/separator"

interface SettingsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
    const { aiSettings, setAiSettings } = useAppStore()

    // Local state for form
    const [settings, setSettings] = useState(aiSettings)

    // Sync from store when opening
    useEffect(() => {
        if (open) {
            setSettings(aiSettings)
        }
    }, [open, aiSettings])

    const handleSave = () => {
        setAiSettings(settings)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-background text-foreground border-border">
                <DialogHeader>
                    <DialogTitle>AI Settings</DialogTitle>
                    <DialogDescription>
                        Configure API providers for Auto-Renaming and Auto-Grouping.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-4">
                        <h4 className="font-medium leading-none flex items-center gap-2">
                            Vision Language Model (VLM)
                            <span className="text-xs font-normal text-muted-foreground">(for Renaming)</span>
                        </h4>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="vlm-url" className="text-right">
                                Base URL
                            </Label>
                            <Input
                                id="vlm-url"
                                placeholder="https://api.openai.com/v1"
                                className="col-span-3"
                                value={settings.vlmBaseUrl}
                                onChange={(e) => setSettings({ ...settings, vlmBaseUrl: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="vlm-key" className="text-right">
                                API Key
                            </Label>
                            <Input
                                id="vlm-key"
                                type="password"
                                placeholder="sk-..."
                                className="col-span-3"
                                value={settings.vlmApiKey}
                                onChange={(e) => setSettings({ ...settings, vlmApiKey: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="vlm-model" className="text-right">Model</Label>
                            <Input
                                id="vlm-model"
                                placeholder="gpt-4o"
                                className="col-span-3"
                                value={settings.vlmModel}
                                onChange={(e) => setSettings({ ...settings, vlmModel: e.target.value })}
                            />
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                        <h4 className="font-medium leading-none flex items-center gap-2">
                            Large Language Model (LLM)
                            <span className="text-xs font-normal text-muted-foreground">(for Grouping)</span>
                        </h4>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="llm-url" className="text-right">
                                Base URL
                            </Label>
                            <Input
                                id="llm-url"
                                placeholder="https://api.openai.com/v1"
                                className="col-span-3"
                                value={settings.llmBaseUrl}
                                onChange={(e) => setSettings({ ...settings, llmBaseUrl: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="llm-key" className="text-right">
                                API Key
                            </Label>
                            <Input
                                id="llm-key"
                                type="password"
                                placeholder="sk-..."
                                className="col-span-3"
                                value={settings.llmApiKey}
                                onChange={(e) => setSettings({ ...settings, llmApiKey: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="llm-model" className="text-right">Model</Label>
                            <Input
                                id="llm-model"
                                placeholder="gpt-4o"
                                className="col-span-3"
                                value={settings.llmModel}
                                onChange={(e) => setSettings({ ...settings, llmModel: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
