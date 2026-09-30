"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Los gestos de respuesta del Inicio de Almacén, en UN solo lugar y por delegación (nadie se cablea pieza por pieza):
 *  · foco de luz que sigue al mouse en todo `.ia-spot` (escribe `--mx` y `--my`);
 *  · leve inclinación de la tarjeta de producto (`.ia-tilt`);
 *  · imán suave del botón «Crear producto» (`.ia-mag`);
 *  · la tecla N abre Nuevo producto (`atajoNuevo` es la ruta, o `null` si esta cuenta no la tiene).
 * Solo con mouse fino y sin «menos movimiento»: en un teléfono o con `prefers-reduced-motion` no hacen nada. La tecla N no
 * se dispara mientras se escribe en un campo ni con un modal abierto.
 */
export function EfectosInicio({ atajoNuevo }: { atajoNuevo: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const fino = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");

    const mover = (e: PointerEvent) => {
      if (!fino.matches || reducido.matches) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo) return;
      const foco = objetivo.closest<HTMLElement>(".ia-spot");
      if (foco) {
        const r = foco.getBoundingClientRect();
        foco.style.setProperty("--mx", `${e.clientX - r.left}px`);
        foco.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const tarjeta = objetivo.closest<HTMLElement>(".ia-tilt");
      if (tarjeta) {
        const r = tarjeta.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        tarjeta.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-4px)`;
      }
      const iman = objetivo.closest<HTMLElement>(".ia-mag");
      if (iman) {
        const r = iman.getBoundingClientRect();
        iman.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 10}px, ${((e.clientY - r.top) / r.height - 0.5) * 8}px)`;
      }
    };

    const soltar = (e: PointerEvent) => {
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo) return;
      for (const clase of [".ia-tilt", ".ia-mag"]) {
        const el = objetivo.closest<HTMLElement>(clase);
        if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) el.style.transform = "";
      }
    };

    const tecla = (e: KeyboardEvent) => {
      if (!atajoNuevo || e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const activo = document.activeElement;
      if (activo instanceof HTMLElement && (/^(input|textarea|select)$/i.test(activo.tagName) || activo.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      router.push(atajoNuevo);
    };

    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerout", soltar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerout", soltar);
      document.removeEventListener("keydown", tecla);
    };
  }, [atajoNuevo, router]);

  return null;
}
