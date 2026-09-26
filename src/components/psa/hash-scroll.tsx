"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// App-Router scrollt bei Anker-Links auf derselben Seite nicht zuverlässig.
// Dieser Effekt scrollt beim Hash-Wechsel (und initial) zum Ziel-Element.
export function HashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    function scrollToHash() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, [pathname]);

  return null;
}
