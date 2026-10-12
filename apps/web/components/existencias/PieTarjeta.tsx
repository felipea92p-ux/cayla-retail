"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowLeftRight, Check, ChevronDown, ClipboardList, Eye, PencilLine, Truck, Warehouse } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import type { BotonTarjeta, ClaveAccion, OpcionMas } from "@/lib/existencias-acciones";

/* ====================================================================
   El pie de una tarjeta de Existencias (2026-10-07, maqueta `docs/maquetas/existencias-tarjeta-cajon-2026-10/`). Qué dice y qué
   ofrece lo decide `lib/existencias-acciones.ts`; aquí solo se dibuja.

   A la izquierda, lo que toca con su nombre a la vista: «Colgar en el piso» (ámbar), «Ver talla X», el aviso «Se acabó: L» (rojo,
   no es botón) o «✓ Todo en el piso». A la derecha, «Más ⌄»: se abre con un CLIC (antes se abría al pasar el mouse y con el dedo no
   había cómo), hacia arriba para que la página no crezca bajo el mouse (ADR-0185). Se cierra con un toque fuera o con Escape, que
   no sigue subiendo (CLAUDE.md, «Escape dentro de una hoja»). Reemplaza a `AccionesTarjeta` (la percha sola).
   ==================================================================== */

type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const ICONO: Record<ClaveAccion, Icono> = {
  subir: Warehouse,
  enviar: Truck,
  pedir: ArrowLeftRight,
  ajustar: PencilLine,
  ficha: ClipboardList,
};

export function PieTarjeta({
  etiqueta,
  boton,
  opciones,
  onBoton,
  onOpcion,
}: {
  /** La prenda, para el lector de pantalla («Blusa Emma Beige»). */
  etiqueta: string;
  boton: BotonTarjeta;
  opciones: readonly OpcionMas[];
  onBoton: () => void;
  onOpcion: (clave: ClaveAccion) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    // Al abrir, el foco va a la primera opción que se puede elegir: el teclado sigue con Tab.
    menu.current?.querySelector<HTMLButtonElement>("button:not([aria-disabled])")?.focus();
    return () => document.removeEventListener("pointerdown", afuera);
  }, [abierto]);

  const estiloBoton = "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-[9px] border px-3 text-[12.5px] transition-colors";
  return (
    <div ref={caja} className="relative mt-auto flex items-center gap-1.5">
      {boton.tipo === "colgar" || boton.tipo === "ver" ? (
        <button
          type="button"
          onClick={onBoton}
          aria-label={`${boton.etiqueta}: ${etiqueta}`}
          className={`${estiloBoton} flex-1 justify-center font-semibold ${
            boton.tipo === "colgar" && boton.sugerido ? "border-ambar/40 bg-ambar/[0.12] text-ambar-profundo hover:border-ambar/60" : "border-tinta/15 bg-papel text-tinta hover:border-tinta/30"
          }`}
        >
          {boton.tipo === "colgar" ? <IconoPercha aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.7} /> : <Eye aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.7} />}
          <span className="truncate">{boton.etiqueta}</span>
        </button>
      ) : (
        <span className={`flex min-w-0 flex-1 items-center gap-1.5 pl-0.5 text-[12.5px] font-semibold ${boton.tipo === "agotada" ? "text-rojo-profundo" : boton.tipo === "sinColgar" ? "text-ambar-profundo" : "text-verde"}`}>
          {boton.tipo === "ok" && <Check aria-hidden className="h-[15px] w-[15px] shrink-0" strokeWidth={2.2} />}
          <span className="truncate">{boton.etiqueta}</span>
        </span>
      )}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Más acciones de ${etiqueta}`}
        onClick={() => setAbierto((a) => !a)}
        className={`${estiloBoton} shrink-0 border-tinta/15 font-medium text-tinta hover:border-tinta/30 ${abierto ? "bg-hueso" : "bg-papel"}`}
      >
        Más
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`} strokeWidth={1.8} />
      </button>

      {abierto && (
        <div
          ref={menu}
          role="menu"
          aria-label={`Acciones de ${etiqueta}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setAbierto(false);
              caja.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();
            }
          }}
          className="anim-revelar absolute bottom-full right-0 z-30 mb-1.5 w-60 rounded-xl border border-tinta/15 bg-papel p-1.5 shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--color-sombra)_40%,transparent)]"
        >
          {opciones.map((o) => {
            const Ico = ICONO[o.clave];
            const apagada = !!o.motivo;
            return (
              <button
                key={o.clave}
                type="button"
                role="menuitem"
                // Se ve pero no se elige, y dice por qué; sigue alcanzable con el teclado (el lector de pantalla oye el motivo).
                aria-disabled={apagada || undefined}
                onClick={() => {
                  if (apagada) return;
                  setAbierto(false);
                  onOpcion(o.clave);
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors focus-visible:bg-hueso ${apagada ? "cursor-not-allowed text-tinta/45" : "text-tinta hover:bg-hueso"}`}
              >
                <Ico aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-taupe" strokeWidth={1.6} />
                <span className="min-w-0">
                  {o.etiqueta}
                  {o.motivo && <span className="mt-0.5 block text-[11.5px] leading-snug text-tinta/55">{o.motivo}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
