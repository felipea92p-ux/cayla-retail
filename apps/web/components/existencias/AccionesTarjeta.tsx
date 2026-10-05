"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Ellipsis, PencilLine, SquareArrowOutUpRight, Table2, TriangleAlert, Warehouse } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { accionDelIcono, type ClaveAccion, type FilaAccion } from "@/lib/existencias-acciones";

/* ====================================================================
   Las acciones de una tarjeta de Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`).

   UN icono: la acción que le toca a la prenda (Colgar en el piso, resaltada); sin nada que colgar, «⋯». Al pasar el mouse por él, o al enfocarlo
   con el teclado, se abre HACIA ARRIBA una ventana con todas las acciones y su nombre, la del icono incluida (`lib/existencias-acciones.ts`
   decide qué filas lleva y cuáles se ven apagadas). En tablet, que no tiene mouse, un botón «⋯» al lado abre la misma ventana con un toque.

   Se abre con CSS (hover y `focus-within`) y no con estado, para que pasar el mouse no vuelva a dibujar la tarjeta; el estado `abierto`
   solo sirve al toque. La ventana está pegada al icono (`pb-2` dentro de la misma caja): el mouse no pierde el hover al cruzar el
   hueco. Movimiento corto y sin rebote (ADR-0136). El `hover:` de Tailwind v4 ya solo vale donde hay mouse.
   ==================================================================== */

type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const ICONO: Record<ClaveAccion, Icono> = {
  colgar: IconoPercha,
  subir: Warehouse,
  enviar: SquareArrowOutUpRight,
  ajustar: PencilLine,
  danada: TriangleAlert,
  detalle: Table2,
};

export function AccionesTarjeta({ etiqueta, filas, alElegir }: { etiqueta: string; filas: readonly FilaAccion[]; alElegir: (clave: ClaveAccion) => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const principal = accionDelIcono(filas);

  // Un toque fuera, o Escape, cierra la ventana abierta con el dedo.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const IconoPrincipal = principal ? ICONO[principal.clave] : Ellipsis;
  const clasesIcono =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors";

  return (
    <div ref={caja} className="group/acciones relative inline-flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={principal ? `${principal.etiqueta} · más acciones de ${etiqueta}` : `Más acciones de ${etiqueta}`}
        onClick={() => {
          // Con una acción sugerida, el icono la hace; sin ella solo abre la ventana (el único caso del toque sin «⋯»).
          if (principal) alElegir(principal.clave);
          else setAbierto((a) => !a);
        }}
        className={`${clasesIcono} ${
          principal ? "border-ambar/40 bg-ambar/[0.13] text-ambar-profundo hover:border-ambar/60" : "border-tinta/15 bg-papel text-taupe hover:border-tinta/30 hover:text-tinta"
        }`}
      >
        <IconoPrincipal aria-hidden className="h-[19px] w-[19px]" strokeWidth={1.6} />
      </button>

      {/* Solo donde no hay mouse (tablet, celular): el «⋯» que abre la ventana con un toque. Con mouse, el hover ya la abre. */}
      <button
        type="button"
        aria-label={`Más acciones de ${etiqueta}`}
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`${clasesIcono} border-tinta/15 bg-papel text-taupe hover:text-tinta [@media(hover:hover)]:hidden ${abierto ? "bg-hueso text-tinta" : ""}`}
      >
        <Ellipsis aria-hidden className="h-[19px] w-[19px]" strokeWidth={1.6} />
      </button>

      <div
        role="menu"
        aria-label={`Acciones de ${etiqueta}`}
        className={`absolute bottom-full right-0 z-30 translate-y-1.5 pb-2 opacity-0 transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none invisible group-hover/acciones:visible group-hover/acciones:translate-y-0 group-hover/acciones:opacity-100 group-focus-within/acciones:visible group-focus-within/acciones:translate-y-0 group-focus-within/acciones:opacity-100 ${
          abierto ? "!visible !translate-y-0 !opacity-100" : ""
        }`}
      >
        <div className="w-56 rounded-xl border border-tinta/15 bg-papel p-1.5 shadow-lg">
          {filas.map((f) => {
            const Ico = ICONO[f.clave];
            const apagada = !!f.motivo;
            return (
              <div key={f.clave}>
                {f.aparte && <hr className="my-1 border-tinta/10" />}
                <button
                  type="button"
                  role="menuitem"
                  // Se ve pero no se elige, y dice por qué: sigue alcanzable con el teclado (un lector de pantalla oye el motivo).
                  aria-disabled={apagada || undefined}
                  onClick={() => {
                    if (apagada) return;
                    setAbierto(false);
                    alElegir(f.clave);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-hueso ${
                    apagada ? "cursor-not-allowed text-tinta/45" : f.sugerida ? "bg-ambar/[0.13] font-semibold text-ambar-profundo hover:bg-ambar/20" : "text-tinta hover:bg-hueso"
                  }`}
                >
                  <Ico aria-hidden className={`mt-0.5 h-[17px] w-[17px] shrink-0 ${f.sugerida && !apagada ? "text-ambar-profundo" : "text-taupe"}`} strokeWidth={1.6} />
                  <span className="min-w-0">
                    {f.etiqueta}
                    {f.motivo && <span className="mt-0.5 block text-[11.5px] font-normal leading-snug text-tinta/55">{f.motivo}</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
