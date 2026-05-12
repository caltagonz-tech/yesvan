"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    router.replace(isMobile ? "/m" : "/d");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-text-secondary">Loading...</div>
    </div>
  );
}
