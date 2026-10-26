"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Ayuda } from "@/components/Ayuda";
import { calcular, enteroES, solesES, type FilaPlan } from "@/lib/plan-compra-reglas";
import { simular } from "@/lib/plan-compra-propuesta";

// «¿Y si la campaña vende distinto?» (ADR-0372, act. 2026-10-12 · lo rescatado de Toolio e Increff): mover el multiplicador del bueno y el %
// de lo que sobra y ver al instante cuánto se compraría y si cabe en el tope. Solo simula: no guarda nada. Usa la misma cuenta que el Plan.
// Abajo, el acceso a Análisis ▸ Qué pedir para la prenda exacta (eso ya existe: no se repite aquí).

export function SimuladorPlan({ filas, tope, recuperoDefecto, veAnalisis }: { filas: readonly FilaPlan[]; tope: number | null; recuperoDefecto: number | null; veAnalisis: boolean }) {
  // Con lo que ya hay y lo que ya viene en órdenes: la misma cuenta que «Comprar» en la tabla.
  const lineas = filas.flatMap((f) => (f.linea ? [{ ...f.linea, stock: f.stock + f.enCamino }] : []));
  const [mult, setMult] = useState(30);
  const [rec, setRec] = useState(recuperoDefecto ?? 40);
  if (lineas.length === 0) return null;
  const hoy = lineas.reduce((a, l) => {
    const c = calcular(l, l.stock);
    return { prendas: a.prendas + c.comprar, inversion: a.inversion + c.inversion };
  }, { prendas: 0, inversion: 0 });
  const sim = simular(lineas, mult / 10, rec, calcular);
  const dif = sim.inversion - hoy.inversion;
  return (
    <section data-guia="presupuesto.simulador" className="card-cayla grid gap-5 p-5">
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.13em] text-taupe">
          ¿Y si la campaña vende distinto?
          <Ayuda titulo="El simulador">
            <span className="block">Cambia, para todas las categorías con plan a la vez, el «bueno» (cuántas veces un mes normal) y a qué % se vende lo que sobra, y mira cuánto se compraría.</span>
            <span className="mt-2 block">Solo simula: lo guardado en cada categoría no cambia. Cuántas veces un día normal vendió cada tienda en cada campaña está en la pestaña Historial.</span>
          </Ayuda>
        </p>
        <label className="block text-sm text-tinta/80">
          Un mes bueno vende <b className="font-semibold text-tinta">×{(mult / 10).toFixed(1)}</b> uno normal
          <input type="range" min={15} max={35} value={mult} onChange={(e) => setMult(Number(e.target.value))} className="mt-1 block w-full accent-tinta" />
        </label>
        <label className="block text-sm text-tinta/80">
          Lo que sobra se vende al <b className="font-semibold text-tinta">{rec} %</b> del precio
          <input type="range" min={10} max={90} step={5} value={rec} onChange={(e) => setRec(Number(e.target.value))} className="mt-1 block w-full accent-tinta" />
        </label>
      </div>
      <div className="space-y-2">
        <p className="font-display text-[24px] leading-tight text-tinta">
          Comprarías {enteroES.format(sim.prendas)} prendas por {solesES(sim.inversion)}.
        </p>
        <p className="text-sm text-tinta/75">
          Con tu plan de hoy: {enteroES.format(hoy.prendas)} por {solesES(hoy.inversion)} ({dif >= 0 ? "+" : "−"}
          {solesES(Math.abs(dif))}).
          {tope !== null && (sim.inversion > tope ? ` Te pasarías ${solesES(sim.inversion - tope)} del tope.` : ` Te quedarían ${solesES(tope - sim.inversion)} del tope.`)}
        </p>
        {veAnalisis && (
          <Link href="/gestion/analisis?vista=pedir" className="inline-flex items-center gap-1 text-sm text-pizarra underline-offset-2 hover:underline">
            Qué pedir, prenda por prenda, en Análisis
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
