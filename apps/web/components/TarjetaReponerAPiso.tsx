"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { agruparPorPrenda, estadoTalla, ordenarPorUrgencia, type PrendaAgrupada } from "@/lib/existencias-prendas";
import type { FilaExistencias } from "@/lib/inventario-v2";
import { pidePiso } from "@/lib/piso-plan";

/* ====================================================================
   «Reponer a piso hoy» (Prioridades de hoy, 2026-09-29)

   Solo dice con qué empezar: hasta tres prendas que piden piso (las que haya, si son menos de tres) y CUÁLES de sus tallas.
   Nada decide algo nuevo: las prendas y su orden son los de la tabla (`agruparPorPrenda`, `ordenarPorUrgencia`) y «pide
   piso» es la decisión del motor del piso (`pidePiso`, `lib/piso-plan.ts`).

   Del mismo ancho que las otras tres tarjetas: cada prenda es una fila compacta (nombre y color, y sus tallas al lado o debajo), sin foto.
   ==================================================================== */

const CUANTAS = 3;
const MAX_TALLAS_EN_FILA = 5;

/** El color de cada talla que pide piso: rojo si en el piso no queda ninguna, ámbar si queda poco, apagada si tampoco hay atrás. */
const TONO_TALLA = {
  por_colgar: "bg-rojo/10 text-rojo-profundo",
  reponer: "bg-ambar/15 text-ambar-profundo",
  sin_stock: "bg-tinta/5 text-tinta/45 line-through",
  normal: "bg-tinta/5 text-tinta/65",
} as const;

/** Las tallas de una prenda que piden piso, cada una con su color y lo que hay en piso y almacén al pasar el mouse. */
function TallasQuePiden({ prenda }: { prenda: PrendaAgrupada<FilaExistencias> }) {
  const piden = prenda.tallas.filter((f) => pidePiso(f.planPiso?.accion));
  return (
    <span className="flex flex-wrap items-center gap-1">
      {piden.slice(0, MAX_TALLAS_EN_FILA).map((f) => (
        <span
          key={f.varianteId}
          title={`${f.talla ?? "Única"}: ${f.pisoDisponible ?? 0} en piso, ${f.almacenDisponible ?? 0} en almacén`}
          className={`rounded px-1.5 text-[11px] leading-[18px] tabular-nums ${TONO_TALLA[estadoTalla(f)]}`}
        >
          {f.talla ?? "Única"}
        </span>
      ))}
      {piden.length > MAX_TALLAS_EN_FILA && <span className="text-[11px] text-taupe">+{piden.length - MAX_TALLAS_EN_FILA}</span>}
    </span>
  );
}

export function TarjetaReponerAPiso({
  stock,
  onVerPrenda,
}: {
  stock: FilaExistencias[];
  /** Llevar la lista a esta prenda. */
  onVerPrenda: (prenda: PrendaAgrupada<FilaExistencias>) => void;
}) {
  const prendas = useMemo(
    () => ordenarPorUrgencia(agruparPorPrenda(stock)).filter((p) => p.tallas.some((f) => pidePiso(f.planPiso?.accion))),
    [stock]
  );
  const primeras = prendas.slice(0, CUANTAS);
  const urgente = primeras.length > 0;

  return (
    <section
      aria-label="Reponer a piso hoy"
      className={`card-cayla flex min-w-0 flex-col p-3.5 max-xl:col-span-2 sm:px-6 sm:pb-[15px] sm:pt-4 ${
        urgente ? "border-[color-mix(in_oklab,var(--color-rojo)_18%,var(--color-crema))] bg-[color-mix(in_oklab,var(--color-rojo)_3.5%,var(--color-papel))]" : ""
      }`}
    >
      <p className={`label-cayla flex items-center gap-3 text-[11px] font-bold ${urgente ? "text-rojo-profundo" : "text-taupe"}`}>
        <IconoPercha aria-hidden className={`h-[22px] w-[22px] ${urgente ? "text-rojo-profundo" : "text-taupe/80"}`} strokeWidth={1.4} />
        Reponer a piso hoy
      </p>

      {!urgente ? (
        <p className="mt-2 text-[13.5px] leading-5 text-taupe">Nada pendiente de bajar al piso</p>
      ) : (
        <div className="mt-2">
          <p className="text-[13.5px] leading-5 text-taupe">{primeras.length === 1 ? "Empieza por esta prenda" : "Empieza por estas prendas"}</p>

          <ul className="mt-1.5 space-y-0.5">
            {primeras.map((p) => (
              <li key={p.clave}>
                <button
                  type="button"
                  onClick={() => onVerPrenda(p)}
                  title={`${p.referencia}${p.color ? ` · ${p.color}` : ""}: ver esta prenda en la lista`}
                  className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-rojo/[0.06] focus-visible:bg-rojo/[0.06] focus-visible:outline-none"
                >
                  {/* El nombre y las tallas en la misma línea si caben; si no, las tallas bajan. */}
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="min-w-0 flex-1 basis-36 truncate text-[13px] font-semibold leading-snug text-tinta">
                      {p.referencia}
                      {p.color && <span className="font-normal text-taupe"> · {p.color}</span>}
                    </span>
                    <TallasQuePiden prenda={p} />
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe/50 transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
