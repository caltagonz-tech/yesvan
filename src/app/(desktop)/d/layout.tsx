"use client";

import Sidebar from "@/components/desktop/Sidebar";
import FeedbackOverlay from "@/components/desktop/FeedbackOverlay";
import { FeedbackModeProvider } from "@/components/desktop/FeedbackModeContext";

function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
      <FeedbackOverlay />
    </div>
  );
}

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeedbackModeProvider>
      <DesktopShell>{children}</DesktopShell>
    </FeedbackModeProvider>
  );
}
