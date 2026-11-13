"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Las teclas del período de Tráfico (H, A, 7, M, P, C): cambian el período sin tocar el mouse. No hace nada si la persona escribe en un
 * campo, si hay una hoja o un cajón abierto, o si aprieta la tecla con Ctrl, Cmd o Alt (que son del navegador). No dibuja nada: cada
 * pastilla de período dice su tecla en su `title` y en `aria-keyshortcuts`.
 */
export function AtajosPeriodo({ teclas }: { teclas: Record<string, string> }) {
  const router = useRouter();
  useEffect(() => {
    function alApretar(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const href = teclas[e.key.toLowerCase()];
      if (!href) return;
      const en = e.target instanceof HTMLElement ? e.target : null;
      if (en && (en.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(en.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      router.push(href, { scroll: false });
    }
    document.addEventListener("keydown", alApretar);
    return () => document.removeEventListener("keydown", alApretar);
  }, [teclas, router]);
  return null;
}
