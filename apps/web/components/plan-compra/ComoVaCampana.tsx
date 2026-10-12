"use client";

import { useState } from "react";
import { Ayuda } from "@/components/Ayuda";
import { Modal } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { enteroES } from "@/lib/plan-compra-reglas";
import type { ComoVa } from "@/lib/plan-compra-resultados";

// «¿Cómo va?» (ADR-0372, act. 2026-10-12 · lo que los compradores de moda llaman WSSI, en una pregunta): durante la campaña, lo vendido
// contra lo que el plan esperaba a hoy y dónde termina si sigue así. Es la PRIMERA tarjeta de cifras de Resultados (Felipe: la franja suelta
// «no quedaba bien»): el veredicto es la cifra; la curva, a un toque, en una hoja. El plan «a hoy» tiene la forma de la misma campaña el año
// pasado (Navidad vende más al final). Solo lee.

const W = 560;
const H = 220;

function Curva({ c }: { c: ComoVa }) {
  const max = Math.max(1, c.planTotal ?? 0, c.proyeccion, c.vendido) * 1.08;
  const X = (i: number) => 16 + (i / Math.max(1, c.dias - 1)) * (W - 32);
  const Y = (v: number) => H - 14 - (v / max) * (H - 30);
  const linea = (arr: readonly number[], desde = 0) => arr.map((v, i) => `${i ? "L" : "M"}${X(i + desde).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const hoyI = c.medidos - 1;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lo vendido acumulado contra el plan" className="h-auto w-full">
        <line x1="16" x2={W - 16} y1={H - 14} y2={H - 14} className="stroke-sand" />
        {c.plan && <path d={linea(c.plan)} fill="none" strokeWidth="2" strokeDasharray="6 5" className="stroke-pizarra" />}
        {c.medidos < c.dias && <path d={linea(c.proyectado.slice(hoyI), hoyI)} fill="none" strokeWidth="2.5" strokeDasharray="3 4" className="stroke-rojo" strokeOpacity="0.4" />}
        <path d={linea(c.real)} fill="none" strokeWidth="3" className="stroke-rojo" />
        <circle cx={X(hoyI)} cy={Y(c.real[hoyI])} r="5" className="fill-rojo" />
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-taupe">
        {c.plan && <span>– – Plan</span>}
        <span className="text-rojo-profundo">— Vendido</span>
        {c.medidos < c.dias && <span>··· Si sigue así</span>}
      </p>
    </div>
  );
}

export function TarjetaComoVa({
  c,
  conForma,
  piden,
  de = null,
}: {
  c: ComoVa;
  conForma: boolean;
  /** Cuántas categorías piden más o piden impulso (la tabla de abajo). */
  piden: number;
  /** La tienda elegida (sus ventas contra su parte del plan); null = toda CAYLA. */
  de?: string | null;
}) {
  const [abierta, setAbierta] = useState(false);
  const dif = c.diferencia;
  const valor = c.medidos === 0 ? "Empieza" : dif === null ? `${enteroES.format(c.proyeccion)}` : `${dif >= 0 ? "+" : "−"}${Math.abs(Math.round(dif * 100))} %`;
  const tono = dif === null || c.medidos === 0 ? undefined : dif >= 0.02 ? "text-verde" : dif <= -0.05 ? "text-rojo-profundo" : undefined;
  const frase =
    c.medidos === 0 ? "La campaña recién empieza."
    : dif === null ? "prendas si sigue así (sin plan con qué comparar)"
    : dif >= 0.02 ? "por encima del plan"
    : dif <= -0.05 ? "por debajo del plan"
    : "en el plan";
  return (
    <>
      <TarjetaCifra
        etiqueta={de ? `¿Cómo va ${de}?` : "¿Cómo va?"}
        valor={valor}
        tono={tono}
        ayuda={
          <Ayuda titulo="¿Cómo va?">
            <span className="block">
              {de
                ? `Lo vendido hasta ayer en ${de}, contra lo que su parte del plan esperaba a hoy. Su parte sale del mismo reparto del Plan: según lo que vende cada tienda, con su mínimo.`
                : "Lo vendido hasta ayer en todas las tiendas, contra lo que el plan (la suma de los «normal» de cada categoría) esperaba a hoy."}
            </span>
            <span className="mt-2 block">
              {conForma ? "Lo esperado a hoy sigue la forma de esta misma campaña el año pasado." : "Sin la misma campaña el año pasado, lo esperado se reparte parejo entre los días."}
            </span>
          </Ayuda>
        }
        accion={c.medidos > 0 ? { texto: "Ver la curva", onClick: () => setAbierta(true) } : undefined}
        pie={piden > 0 ? <span className="text-ambar-profundo">{piden === 1 ? "1 categoría pide atención ↓" : `${piden} categorías piden atención ↓`}</span> : c.medidos > 0 ? "Ninguna categoría pide nada hoy" : undefined}
      >
        <span className="block">{frase}</span>
        {/* Sin plan, «861 de —» no dice nada: la cifra grande ya es lo que termina vendiéndose. */}
        {c.medidos > 0 && c.esperado !== null && (
          <span className="block text-tinta/65">
            {enteroES.format(c.vendido)} de {c.esperado !== null ? `${enteroES.format(c.esperado)} esperadas` : "—"} · termina en {enteroES.format(c.proyeccion)}
            {c.planTotal !== null && ` de ${enteroES.format(c.planTotal)}`}
          </span>
        )}
      </TarjetaCifra>
      {abierta && (
        <Modal titulo={de ? `¿Cómo va ${de}?` : "¿Cómo va la campaña?"} subtitulo={`Día ${c.medidos} de ${c.dias}: lo vendido contra el plan, y dónde termina si sigue así.`} onClose={() => setAbierta(false)} variante="hoja" ancho="max-w-2xl" conCerrar>
          <Curva c={c} />
        </Modal>
      )}
    </>
  );
}
