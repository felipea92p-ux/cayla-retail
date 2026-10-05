"use client";

import { MiniaturaPrenda, categoriaDe } from "@/components/ui/PrendaCelda";
import { IconoPercha } from "@/components/ui/IconoPercha";
import { textoDeRitmo, type PrendaParaColgar, type RitmoDePrenda } from "@/lib/existencias-colgar-primero";
import type { FilaExistencias } from "@/lib/inventario-v2";
import type { PrendaAgrupada } from "@/lib/existencias-prendas";

/* ====================================================================
   «Colgar primero» (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`): las tres prendas que más conviene colgar hoy,
   en el orden de la lista del día, con el aro de cuántas semanas dura lo que hay. Cada una abre «Colgar en el piso» del modelo entero.
   La lógica (qué prendas, en qué orden, qué dice el ritmo) es de `lib/existencias-colgar-primero.ts`; aquí solo se dibuja.
   ==================================================================== */

const LARGO_ARO = 2 * Math.PI * 13;

/** El aro de semanas: lleno hasta 6 semanas, verde desde 2, ámbar con 1 o menos (se acaba). Sin ritmo medido, no se dibuja. */
function AroSemanas({ ritmo }: { ritmo: RitmoDePrenda }) {
  if (ritmo.tipo !== "medido") return null;
  const semanas = Math.max(0, Math.round(ritmo.semanas));
  const lleno = Math.min(1, ritmo.semanas / 6);
  const color = ritmo.semanas <= 1 ? "var(--color-ambar)" : "var(--color-verde)";
  return (
    <span className="relative inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 34 34" className="h-full w-full">
        <circle cx="17" cy="17" r="13" fill="none" stroke="var(--color-hueso)" strokeWidth="4" />
        <circle
          cx="17"
          cy="17"
          r="13"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(lleno * LARGO_ARO).toFixed(1)} ${LARGO_ARO.toFixed(1)}`}
          transform="rotate(-90 17 17)"
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-tinta">{Number.isFinite(semanas) ? semanas : "+"}</span>
    </span>
  );
}

export function ColgarPrimero({
  prendas,
  alReponer,
  pisoSinCuadrar = false,
}: {
  prendas: readonly PrendaParaColgar<FilaExistencias>[];
  /** Abre «Colgar en el piso» con el modelo de esa prenda; `origen` es el botón, para devolverle el foco al cerrar la ventana. */
  alReponer: (prenda: PrendaAgrupada<FilaExistencias>, origen: HTMLElement) => void;
  /** El piso de la sede todavía no se cuadró (ADR-0328, decisión 5): el motor no manda a colgar nada, porque podría ser algo que ya cuelga.
   *  La franja no se esconde: dice cuándo va a aparecer, para que su ausencia no se lea como un error. */
  pisoSinCuadrar?: boolean;
}) {
  if (prendas.length === 0 && pisoSinCuadrar) {
    return (
      <section aria-label="Colgar primero" className="mb-3.5">
        <h2 className="label-cayla mb-1 text-[11px] text-taupe">Colgar primero</h2>
        <p className="text-[12.5px] leading-snug text-taupe">Aparece cuando se cuadre el piso de esta sede: hasta entonces no se sabe qué ya cuelga y qué falta colgar.</p>
      </section>
    );
  }
  if (prendas.length === 0) return null;
  return (
    <section aria-label="Colgar primero" className="mb-3.5">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="label-cayla text-[11px] text-taupe">Colgar primero</h2>
        <p className="text-[12.5px] text-taupe">Lo que más se vende y falta en el piso</p>
      </header>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
        {prendas.map((r, i) => {
          const p = r.prenda;
          const ritmo = textoDeRitmo(r.ritmo);
          const faltan = r.tallasPorColgar.join(", ");
          return (
            <button
              key={p.clave}
              type="button"
              onClick={(e) => alReponer(p, e.currentTarget)}
              aria-label={`${i + 1}. Colgar ${p.referencia}${p.color ? ` ${p.color}` : ""}: faltan ${faltan}.${ritmo ? ` ${ritmo}` : ""}`}
              className="card-cayla grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 p-2 text-left transition-colors hover:border-tinta/25 focus-visible:outline-2 focus-visible:outline-tinta/40"
            >
              <span aria-hidden className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ambar/[0.13] text-xs font-bold text-ambar-profundo">
                {i + 1}
              </span>
              <MiniaturaPrenda fotoUrl={p.fotoUrl} colorHex={p.colorHex} tamano="md" {...categoriaDe(p)} />
              <span className="min-w-0">
                <b className="block truncate text-sm font-semibold leading-tight text-tinta">
                  {p.referencia}
                  {p.color ? ` · ${p.color}` : ""}
                </b>
                <small className="block truncate text-xs text-taupe">
                  Faltan {faltan}
                  {r.ritmo.tipo === "medido" && <> · {r.ritmo.porSemana < 1 ? "menos de 1" : Math.round(r.ritmo.porSemana)} por semana</>}
                </small>
                {r.ritmo.tipo !== "medido" && ritmo && <small className="block truncate text-xs text-taupe/80">{ritmo}</small>}
              </span>
              {r.ritmo.tipo === "medido" ? <AroSemanas ritmo={r.ritmo} /> : <IconoPercha aria-hidden className="h-[18px] w-[18px] text-ambar-profundo" strokeWidth={1.6} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
