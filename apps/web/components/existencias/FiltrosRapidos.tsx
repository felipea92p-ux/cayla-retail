"use client";

import { type ComponentType } from "react";
import { LayoutGrid, PackageX, ShoppingBag, TriangleAlert } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { Calculando } from "@/components/Esqueleto";
import { ATAJOS_RAPIDOS, atajoElegido, cuentaDeAtajo, rotuloDeAtajo, type ClaveRapida } from "@/lib/existencias-rapidos";
import type { ClaveUrl, ConteosFiltros, FiltrosElegidos } from "@/lib/existencias-filtros";

/* ====================================================================
   Atajos de filtro de Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`): cinco botones bajo el buscador
   para lo que más se pregunta en el piso (los dos «Recomendados» salieron el 2026-11-26, `docs/maquetas/existencias-sin-ruido-2026-11/`). Escriben los mismos filtros que el panel «Filtros» (`lib/existencias-rapidos.ts`).

   Siempre con su nombre a la vista (2026-10-06): el modo «solo iconos» obligaba a pasar el mouse o adivinar qué era cada figura, y en
   una tablet no hay mouse. Bajo 1280 px (tablet, celular, ventana angosta) la fila se desliza de lado, con el borde derecho desvanecido
   para avisar que sigue: partida en dos o tres líneas se veía amontonada. Desde 1280 px caben en una.

   Con el piso sin cuadrar (`enPausa` > 0), «Por colgar» no se dibuja (2026-11-26, «Existencias sin ruido»): el motor no manda a colgar
   nada porque podría ser algo que ya cuelga (ADR-0328, decisión 5), así que el botón no filtraba nada. Hasta entonces llevaba una pausa
   en vez de un «0» que parecía «todo listo»; el aviso del piso (la banda del barrido o la franja) ya dice por qué. Con un «Por colgar»
   ya elegido (un enlace viejo), el botón se queda para que se vea qué está puesto y se pueda volver a «Todo».
   ==================================================================== */

type Icono = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

const ICONO: Record<ClaveRapida, Icono> = {
  todo: LayoutGrid,
  por_colgar: IconoPercha,
  sin_stock_atras: PackageX,
  apartadas: ShoppingBag,
  danadas: TriangleAlert,
};

/** El tono de cada botón encendido: ámbar lo que hay que hacer, pizarra lo informativo (el rojo se reserva a lo vencido, ADR-0169). */
const TONO_ENCENDIDO: Record<ClaveRapida, string> = {
  todo: "border-tinta bg-tinta text-crema",
  por_colgar: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
  sin_stock_atras: "border-pizarra/40 bg-pizarra/10 text-pizarra",
  apartadas: "border-pizarra/40 bg-pizarra/10 text-pizarra",
  danadas: "border-ambar/45 bg-ambar/[0.13] text-ambar-profundo",
};

export function FiltrosRapidos({
  elegidos,
  conteos,
  onCambiar,
  enPausa = 0,
  calculando = false,
}: {
  elegidos: Pick<FiltrosElegidos, "hoy" | "condicion">;
  conteos: Pick<ConteosFiltros, "hoy" | "condicion">;
  onCambiar: (cambios: Partial<Record<ClaveUrl, string | null>>) => void;
  /** Tallas que esperan el cuadre del piso: «Por colgar» no se dibuja. */
  enPausa?: number;
  /** «Hoy» viene en camino (Existencias en dos tiempos): «Por colgar» y «Sin stock atrás» guardan el lugar de su cifra, sin un 0 que no se sabe. */
  calculando?: boolean;
}) {
  const encendido = atajoElegido(elegidos);

  return (
    <div
      data-guia="existencias.atajos"
      role="group"
      aria-label="Atajos de filtro"
      className="scroll-cayla -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-0.5 max-xl:pr-8 max-xl:[mask-image:linear-gradient(90deg,#000_calc(100%-2rem),transparent)] xl:flex-wrap xl:overflow-visible"
    >
      {ATAJOS_RAPIDOS.map((a) => {
        const Icono = ICONO[a.clave];
        const cuenta = cuentaDeAtajo(a.clave, conteos);
        const puesto = encendido === a.clave;
        // Lo que cuenta el plan del piso: mientras llega, su cifra se calcula (el botón sigue sirviendo: la lista lo dice).
        const delPlan = a.clave === "por_colgar" || a.clave === "sin_stock_atras";
        const esperando = calculando && delPlan;
        // Piso en pausa: el botón no filtraría nada (ver arriba). Si ya está puesto, se queda para poder quitarlo.
        if (!esperando && a.clave === "por_colgar" && enPausa > 0 && !puesto) return null;
        const rotulo = esperando ? `${a.texto}: calculando` : rotuloDeAtajo(a, cuenta);
        return (
          <span key={a.clave} className="contents">
            <button
              type="button"
              aria-pressed={puesto}
              aria-label={rotulo}
              title={a.ayuda}
              onClick={() => onCambiar(a.cambios)}
              className={`area-dedo inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full border pl-2.5 pr-2 text-sm transition-colors ${
                puesto ? TONO_ENCENDIDO[a.clave] : "border-tinta/15 bg-papel text-tinta/75 hover:border-tinta/30 hover:text-tinta"
              }`}
            >
              <Icono aria-hidden className="h-4 w-4 shrink-0" />
              <span>{a.texto}</span>
              {esperando ? (
                <span aria-hidden className="ml-0.5 inline-flex">
                  <Calculando className="h-4 w-6 rounded-full" />
                </span>
              ) : (
                cuenta !== null && (
                  <b aria-hidden className={`ml-0.5 rounded-full px-[5px] text-sm font-semibold leading-[18px] tabular-nums ${puesto ? "bg-tinta/10" : "vd-gota-chica text-tinta/75"}`}>
                    {cuenta.toLocaleString("es-PE")}
                  </b>
                )
              )}
            </button>
          </span>
        );
      })}
    </div>
  );
}
