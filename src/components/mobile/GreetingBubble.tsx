"use client";

type GreetingBubbleProps = {
  message: string;
};

export default function GreetingBubble({ message }: GreetingBubbleProps) {
  return (
    <div className="relative mb-6">
      <div
        className="rounded-3xl px-5 py-[18px]"
        style={{
          background: "var(--bubble-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.7)",
          boxShadow: "0 4px 20px rgba(100, 200, 220, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        }}
      >
        <p
          className="text-[15px] leading-relaxed text-text-primary"
          dangerouslySetInnerHTML={{ __html: message }}
        />
      </div>
      {/* Bubble tail */}
      <div
        className="absolute -bottom-2 left-6 w-4 h-4 rotate-45"
        style={{
          background: "var(--bubble-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255, 255, 255, 0.7)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.7)",
        }}
      />
    </div>
  );
}
