"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { PERIODOS_INGRESOS, hrefIngresos, type PeriodoIngresos } from "@/lib/ingresos-reglas";

// El rango de la pestaña «Ingresos»: tres períodos rápidos (píldoras del sistema, ADR-0358) y «Elegir fechas», que abre
// «Desde» y «Hasta». La pregunta nace cuando llega un fardo —«desde el día que llegó hasta hoy»—, así que con fechas a medida
// el «Hasta» ya viene en hoy. Los campos dicen la fecha que rige aunque venga de un período rápido: el control no miente.
export function SelectorRangoIngresos({ periodo, desde, hasta }: { periodo: PeriodoIngresos; desde: string; hasta: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const verFechas = periodo === "fechas" || abierto;
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Período de los ingresos" data-guia="movimientos.ingresos-periodo" className="flex flex-wrap items-center gap-1.5">
        {PERIODOS_INGRESOS.map((o) => (
          <Link
            key={o.valor}
            href={hrefIngresos({ periodo: o.valor })}
            replace
            onClick={() => setAbierto(false)}
            aria-current={!verFechas && periodo === o.valor ? "page" : undefined}
            className="pildora-cayla shrink-0"
          >
            {o.etiqueta}
          </Link>
        ))}
        {/* Un toque abre los campos y otro los guarda: con fechas a medida en la URL siempre están a la vista. */}
        <button type="button" onClick={() => setAbierto((a) => !a)} aria-pressed={verFechas} data-guia="movimientos.ingresos-fechas" className="pildora-cayla shrink-0">
          Elegir fechas
        </button>
      </div>
      {verFechas && (
        <div className="anim-revelar flex flex-wrap items-end gap-x-4 gap-y-1 rounded-xl bg-hueso/70 px-4 py-2.5">
          <div className="w-40 sm:w-44">
            <CampoFecha etiqueta="Desde" valor={desde} onValor={(v) => v && router.push(hrefIngresos({ desde: v, hasta }))} />
          </div>
          <div className="w-40 sm:w-44">
            <CampoFecha etiqueta="Hasta" valor={hasta} onValor={(v) => v && router.push(hrefIngresos({ desde, hasta: v }))} />
          </div>
        </div>
      )}
    </div>
  );
}
