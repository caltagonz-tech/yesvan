"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { href: "/d", label: "Dashboard", icon: "dashboard" },
  { href: "/d/students", label: "Students", icon: "school" },
  { href: "/d/leads", label: "Leads", icon: "person_search" },
  { href: "/d/hosts", label: "Hosts", icon: "home" },
  { href: "/d/drivers", label: "Drivers", icon: "directions_car" },
  { href: "/d/universities", label: "Universities", icon: "account_balance" },
  { href: "/d/payments", label: "Payments", icon: "payments" },
  { href: "/d/email", label: "Email", icon: "mail" },
  { href: "/d/calendar", label: "Calendar", icon: "calendar_month" },
  { href: "/d/checklists", label: "Checklists", icon: "checklist" },
  { href: "/d/captures", label: "Captures", icon: "inbox" },
  { href: "/d/processes", label: "Processes", icon: "account_tree" },
  { href: "/d/settings", label: "Settings", icon: "settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 h-screen sticky top-0 flex flex-col border-r border-gray-200 bg-white/80 backdrop-blur-xl">
      <div className="px-5 py-5 flex items-center justify-between">
        <h1 className="font-heading font-bold text-lg tracking-tight text-text-primary">
          YES Vancity
        </h1>
        <NotificationBell variant="desktop" />
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/d"
              ? pathname === "/d"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent/10 text-text-primary"
                  : "text-text-secondary hover:bg-gray-100 hover:text-text-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
