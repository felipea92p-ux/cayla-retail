"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { prefiereQuieto } from "@/lib/movimiento-cliente";

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

    // Una vez por cuadro, y midiendo todo antes de escribir (ADR-0623): el mouse manda 60 a 120 movimientos por segundo, y medir y
    // escribir intercalados en cada uno obligaba a recalcular la página entre medida y medida.
    let ultimo: PointerEvent | null = null;
    let cuadro = 0;
    const aplicar = () => {
      cuadro = 0;
      const e = ultimo;
      if (!e) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo) return;
      const foco = objetivo.closest<HTMLElement>(".ia-spot");
      const tarjeta = objetivo.closest<HTMLElement>(".ia-tilt");
      const iman = objetivo.closest<HTMLElement>(".ia-mag");
      const rFoco = foco?.getBoundingClientRect();
      const rTarjeta = tarjeta?.getBoundingClientRect();
      const rIman = iman?.getBoundingClientRect();
      if (foco && rFoco) {
        foco.style.setProperty("--mx", `${e.clientX - rFoco.left}px`);
        foco.style.setProperty("--my", `${e.clientY - rFoco.top}px`);
      }
      if (tarjeta && rTarjeta) {
        const x = (e.clientX - rTarjeta.left) / rTarjeta.width - 0.5;
        const y = (e.clientY - rTarjeta.top) / rTarjeta.height - 0.5;
        tarjeta.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-4px)`;
      }
      if (iman && rIman) {
        iman.style.transform = `translate(${((e.clientX - rIman.left) / rIman.width - 0.5) * 10}px, ${((e.clientY - rIman.top) / rIman.height - 0.5) * 8}px)`;
      }
    };
    const mover = (e: PointerEvent) => {
      if (!fino.matches || prefiereQuieto()) return;
      ultimo = e;
      if (!cuadro) cuadro = requestAnimationFrame(aplicar);
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
      cancelAnimationFrame(cuadro);
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerout", soltar);
      document.removeEventListener("keydown", tecla);
    };
  }, [atajoNuevo, router]);

  return null;
}
