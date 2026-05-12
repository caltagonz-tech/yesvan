"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/m", icon: "home", label: "Home" },
  { href: "/m/data", icon: "view_list", label: "Data" },
  { href: "/m/settings", icon: "settings", label: "Settings" },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      className="min-h-screen relative"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, var(--bg-grad-1) 0%, transparent 50%), radial-gradient(circle at 80% 100%, var(--bg-grad-2) 0%, transparent 50%), radial-gradient(circle at 50% 50%, var(--bg-grad-3) 0%, transparent 70%), #fafafa",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-12 pb-28">
        {children}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center justify-around gap-2 w-72 h-[60px] rounded-[30px] z-50"
        style={{
          background: "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 8px 24px rgba(80, 50, 130, 0.12)",
        }}
      >
        {navItems.map((item) => {
          const isActive = item.href === "/m" ? pathname === "/m" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`p-2 transition-transform active:scale-90 ${isActive ? "text-text-primary" : "text-text-tertiary"}`}
            >
              <span className={`material-symbols-outlined text-2xl ${isActive ? "" : ""}`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span>
            </Link>
          );
        })}

        {/* FAB - Add new */}
        <Link href="/m/intake"
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center -mt-4 text-white transition-transform hover:scale-105 active:scale-92"
          style={{
            background: "linear-gradient(145deg, var(--accent), #9b7aff)",
            border: "3px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 6px 20px rgba(155, 122, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
          }}
        >
          <span className="material-symbols-outlined text-[26px] font-semibold">add</span>
        </Link>
      </nav>
    </div>
  );
}
