export default function AllClearState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-5">
      <div
        className="w-[100px] h-[100px] rounded-full mb-7"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(184,238,247,0.5))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 8px 32px rgba(100, 200, 220, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
          animation: "gentleFloat 4s ease-in-out infinite",
        }}
      />
      <h2 className="font-heading font-semibold text-[22px] text-text-primary mb-2.5">
        All clear
      </h2>
      <p className="text-text-secondary text-sm leading-relaxed max-w-[240px]">
        Nothing pressing. Take a breath — you&apos;ve handled it all.
      </p>

      <style jsx>{`
        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.02); }
        }
      `}</style>
    </div>
  );
}
