import { Ayuda } from "@/components/Ayuda";
import { enteroES } from "@/lib/plan-compra-reglas";
import type { ComoVa } from "@/lib/plan-compra-resultados";

// «¿Cómo va?» (ADR-0372, act. 2026-10-12 · lo que los compradores de moda llaman WSSI, en una pregunta): durante la campaña, lo vendido
// contra lo que el plan esperaba a hoy y dónde termina si sigue así. El plan «a hoy» tiene la forma de la misma campaña el año pasado
// (Navidad vende más al final). Solo lee.

const W = 520;
const H = 200;

export function ComoVaCampana({ c, conForma }: { c: ComoVa; /** El plan a hoy siguió la forma del año pasado (si no, días parejos). */ conForma: boolean }) {
  const max = Math.max(1, c.planTotal ?? 0, c.proyeccion, c.vendido) * 1.08;
  const X = (i: number) => 16 + (i / Math.max(1, c.dias - 1)) * (W - 32);
  const Y = (v: number) => H - 14 - (v / max) * (H - 30);
  const linea = (arr: readonly number[], desde = 0) => arr.map((v, i) => `${i ? "L" : "M"}${X(i + desde).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const hoyI = c.medidos - 1;
  const dif = c.diferencia;
  const veredicto =
    c.medidos === 0 ? "La campaña recién empieza."
    : dif === null ? `Si sigue así, termina en ${enteroES.format(c.proyeccion)} prendas.`
    : dif >= 0.02 ? `Vas +${Math.round(dif * 100)} %: por encima del plan.`
    : dif <= -0.05 ? `Vas −${Math.round(-dif * 100)} %: por debajo del plan.`
    : "Vas en el plan.";
  return (
    <section className="card-cayla grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.13em] text-taupe">
          ¿Cómo va?
          <Ayuda titulo="¿Cómo va?">
            <span className="block">Lo vendido hasta ayer en todas las tiendas, contra lo que el plan (la suma de los «normal» de cada categoría) esperaba a hoy.</span>
            <span className="mt-2 block">
              {conForma
                ? "Lo esperado a hoy sigue la forma de esta misma campaña el año pasado: si el año pasado se vendió más al final, el plan también lo espera al final."
                : "No hay la misma campaña el año pasado con qué darle forma: se reparte parejo entre los días."}
            </span>
            <span className="mt-2 block">«Si sigue así» proyecta lo vendido con esa misma forma hasta el último día.</span>
          </Ayuda>
        </p>
        <p className="font-display text-[26px] leading-tight text-tinta">{veredicto}</p>
        <p className="text-sm text-tinta/75">
          {c.medidos > 0 && (
            <>
              Vendiste <b className="font-semibold text-tinta">{enteroES.format(c.vendido)}</b> en {c.medidos} de {c.dias} días
              {c.esperado !== null && <> (el plan esperaba {enteroES.format(c.esperado)})</>}. Si sigue así, terminas en{" "}
              <b className="font-semibold text-tinta">{enteroES.format(c.proyeccion)}</b>
              {c.planTotal !== null && <>; el plan pide {enteroES.format(c.planTotal)}</>}.
            </>
          )}
          {c.planTotal === null && " Esta campaña no tiene plan armado: no hay contra qué comparar."}
        </p>
      </div>
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Lo vendido acumulado contra el plan" className="h-auto w-full">
          <line x1="16" x2={W - 16} y1={H - 14} y2={H - 14} className="stroke-sand" />
          {c.plan && <path d={linea(c.plan)} fill="none" strokeWidth="2" strokeDasharray="6 5" className="stroke-pizarra" />}
          {c.medidos > 0 && c.medidos < c.dias && (
            <path d={linea(c.proyectado.slice(hoyI), hoyI)} fill="none" strokeWidth="2.5" strokeDasharray="3 4" className="stroke-rojo" strokeOpacity="0.4" />
          )}
          {c.medidos > 0 && <path d={linea(c.real)} fill="none" strokeWidth="3" className="stroke-rojo" />}
          {c.medidos > 0 && <circle cx={X(hoyI)} cy={Y(c.real[hoyI])} r="5" className="fill-rojo" />}
        </svg>
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-taupe">
          {c.plan && <span>– – Plan</span>}
          <span className="text-rojo-profundo">— Vendido</span>
          {c.medidos < c.dias && <span>··· Si sigue así</span>}
        </p>
      </div>
    </section>
  );
}
