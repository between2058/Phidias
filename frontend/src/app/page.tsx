import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ChatInterface } from "@/components/chat/ChatInterface"
import { Viewer3D } from "@/components/viewer/Viewer3D"
import { SceneGraph } from "@/components/editor/SceneGraph"

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
          <ChatInterface />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={70}>
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={75} className="relative">
              <div className="h-full w-full p-2">
                <Viewer3D />
              </div>
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              <SceneGraph />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
