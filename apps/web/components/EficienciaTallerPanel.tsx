"use client";

import { useState } from "react";
import Link from "next/link";
import { soles } from "@/lib/compras-reglas";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Pestanas } from "@/components/ui/Pestanas";
import { repartoDelGasto, variacion, type EficienciaPeriodo, type PartePlata } from "@/lib/eficiencia-reglas";
import type { EstadoPlanilla } from "@/lib/eficiencia";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";

// Eficiencia del Taller (ADR-0133, F7; D-31 y D-33). «Cuánto cuesta de verdad cada prenda que sale del Taller»: materiales de lo que cerró + conversión (la
// planilla de Dynamic y los gastos generales, repartidos entre las prendas buenas). El período es el de la planilla (29 al 28). Sin planilla visible NO se
// inventa la conversión: se dice qué falta. Sin rojo: nada de esto es una alarma, es una medida que se compara período a período.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

const COLOR_PARTE: Record<PartePlata["clave"], string> = { planilla: "bg-tinta", materiales: "bg-tinta/60", maquila: "bg-tinta/35", gastos: "bg-tinta/18" };

function Variacion({ actual, anterior }: { actual: number | null; anterior: number | null }) {
  const v = variacion(actual, anterior);
  if (v === null) return <>sin período anterior con qué comparar</>;
  if (Math.abs(v) < 0.005) return <>igual que el período anterior</>;
  return <>{v > 0 ? "▲" : "▼"} {pct(Math.abs(v))} {v > 0 ? "más" : "menos"} que el período anterior</>;
}

export function EficienciaTallerPanel({ periodos, estadoPlanilla, hayGastos }: { periodos: EficienciaPeriodo[]; estadoPlanilla: EstadoPlanilla; hayGastos: boolean }) {
  const [clave, setClave] = useState(periodos[0]?.ventana.clave ?? "");
  const i = Math.max(0, periodos.findIndex((p) => p.ventana.clave === clave));
  const actual = periodos[i];
  const anterior = periodos[i + 1] ?? null;
  const reparto = actual ? repartoDelGasto(actual) : [];

  return (
    <div className="space-y-6">
      {/* «Hoy | Eficiencia»: las dos miradas del líder sobre el Taller (ADR-0133, F6 y F7), con la pestaña de vista del sistema
          (ADR-0358). Eficiencia NO es una fila del lateral (el menú de Producción está en su tope de hijas): se llega desde aquí. */}
      <Pestanas
        etiquetaAccesible="Miradas del Taller"
        idIndicador="produccion-miradas"
        activa="eficiencia"
        items={[
          { clave: "hoy", etiqueta: "Hoy", href: "/produccion", ayuda: "Qué necesita mi decisión" },
          { clave: "eficiencia", etiqueta: "Eficiencia", href: "/produccion/eficiencia", ayuda: "Cuánto cuesta cada prenda" },
        ]}
      />
      <div className="anim-entra">
        <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Eficiencia del Taller</h1>
        <p className="mt-1 max-w-2xl text-sm text-tinta/65">
          Cuánto cuesta de verdad cada prenda que sale del Taller: la tela, los avíos y la maquila de lo que cerró, más lo que cuesta transformarlo —la planilla y los gastos del Taller— repartido entre las prendas buenas.
        </p>
      </div>

      {estadoPlanilla === "sin_vista" && (
        <p className="rounded-md bg-sand/60 px-3 py-2.5 text-sm text-tinta/80">
          Todavía no está conectada la planilla de Dynamic (falta pegar <code className="font-mono text-xs">20260921160000_planilla_por_sede.sql</code>). Mientras tanto se muestran los materiales por prenda; el costo completo aparecerá solo.
        </p>
      )}
      {estadoPlanilla === "vacia" && (
        <p className="rounded-md bg-sand/60 px-3 py-2.5 text-sm text-tinta/80">
          No hay planilla del Taller para mostrar: Dynamic solo se la enseña a quien allá es admin o líder, o todavía no hay períodos pagados. Se muestran los últimos meses con los materiales por prenda; sin la planilla no se calcula la conversión ni el costo total.
        </p>
      )}

      {periodos.length > 1 && (
        // El período es un filtro de un valor: la píldora del sistema (ADR-0358).
        <div role="group" aria-label="Período" className="pildoras-desliza gap-2 sm:flex-wrap">
          {periodos.map((p) => (
            <button key={p.ventana.clave} type="button" aria-pressed={clave === p.ventana.clave} onClick={() => setClave(p.ventana.clave)} className="pildora-cayla shrink-0">
              {p.ventana.etiqueta}
            </button>
          ))}
        </div>
      )}

      {actual && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TarjetaCifra
              punto="verde"
              etiqueta="Prendas buenas"
              className="anim-entra"
              style={{ ["--i" as string]: 0 }}
              valor={actual.prendasBuenas === 0 ? null : <CifraQueCuenta valor={actual.prendasBuenas} alMontar />}
            >
              {actual.ordenesCerradas === 0 ? "ninguna orden cerrada en el período" : `${plural(actual.ordenesCerradas, "orden cerrada", "órdenes cerradas")}${actual.calidad !== null ? ` · ${pct(actual.calidad)} salió buena` : ""}`}
            </TarjetaCifra>
            <TarjetaCifra
              punto="verde"
              etiqueta="Costo por prenda"
              className="anim-entra"
              style={{ ["--i" as string]: 1 }}
              valor={actual.costoPorPrenda === null ? null : <CifraQueCuenta valor={actual.costoPorPrenda} formato="soles" alMontar />}
            >
              {actual.costoPorPrenda === null ? (actual.prendasBuenas === 0 ? "sin prendas no hay costo por prenda" : "falta la planilla para el costo completo") : <Variacion actual={actual.costoPorPrenda} anterior={anterior?.costoPorPrenda ?? null} />}
            </TarjetaCifra>
            <TarjetaCifra
              punto="verde"
              etiqueta="Materiales por prenda"
              className="anim-entra"
              style={{ ["--i" as string]: 2 }}
              valor={actual.materialesPorPrenda === null ? null : <CifraQueCuenta valor={actual.materialesPorPrenda} formato="soles" alMontar />}
            >
              {actual.materialesPorPrenda === null ? "sin prendas cerradas" : <Variacion actual={actual.materialesPorPrenda} anterior={anterior?.materialesPorPrenda ?? null} />}
            </TarjetaCifra>
            <TarjetaCifra
              punto="verde"
              etiqueta="Conversión por prenda"
              className="anim-entra"
              style={{ ["--i" as string]: 3 }}
              valor={actual.conversionPorPrenda === null ? null : <CifraQueCuenta valor={actual.conversionPorPrenda} formato="soles" alMontar />}
            >
              {actual.conversionPorPrenda === null ? "planilla y gastos ÷ prendas buenas" : <Variacion actual={actual.conversionPorPrenda} anterior={anterior?.conversionPorPrenda ?? null} />}
            </TarjetaCifra>
          </div>

          <section aria-label="En qué se fue la plata" className="card-cayla space-y-3 p-5">
            <div>
              <h2 className="font-display text-xl text-tinta">¿En qué se fue la plata del Taller?</h2>
              <p className="text-xs text-tinta/65">Período {actual.ventana.etiqueta}. Lo que gastó el Taller: la planilla, los gastos generales y los materiales y la maquila de lo que cerró.</p>
            </div>
            {reparto.length === 0 ? (
              <p className="text-sm text-tinta/70">No hay gasto del Taller registrado en este período.</p>
            ) : (
              <>
                {/* La barra es `<BarraApilada>` (ADR-0358): cada parte del gasto, con el mismo color que su fila de abajo. */}
                <BarraApilada alto={12} etiqueta="Reparto del gasto del Taller" segmentos={reparto.map((p) => ({ clave: p.clave, nombre: p.etiqueta, valor: p.parte, clase: COLOR_PARTE[p.clave] }))} />
                <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {reparto.map((p) => (
                    <li key={p.clave} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="flex items-center gap-2 text-tinta/80">
                        <MuestraTramo clase={COLOR_PARTE[p.clave]} className="h-2 w-2 rounded-full" />
                        {p.etiqueta}
                      </span>
                      <span className="tabular-nums text-tinta">
                        {soles(p.monto)} <small className="text-xs text-tinta/60">{pct(p.parte)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                {actual.gastosPorCategoria.length > 0 && (
                  <p className="text-xs text-tinta/65">Gastos generales: {actual.gastosPorCategoria.map((g) => `${g.categoria} ${soles(g.total)}`).join(" · ")}.</p>
                )}
              </>
            )}
            {actual.planilla !== null && <p className="text-xs text-tinta/60">Planilla: costo total para CAYLA (sueldos, provisiones de gratificación, CTS y vacaciones, y aportes) de {plural(actual.ventana.planilla?.personas ?? 0, "persona", "personas")}, tal como la pagó Dynamic.</p>}
            {!hayGastos && (
              <p className="text-xs text-tinta/60">
                Alquiler y servicios del Taller aparecerán aquí cuando se registren como gastos del Taller en Finanzas (modelo de gastos, ADR-0117); Producción no lleva una tabla aparte.
              </p>
            )}
          </section>

          <section aria-label="Entregas" className="card-cayla space-y-2 p-5">
            <h2 className="font-display text-xl text-tinta">Entregas del período</h2>
            {actual.ordenesCerradas === 0 ? (
              <p className="text-sm text-tinta/70">Ninguna orden se cerró en este período.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm text-tinta/80">
                <Chip tono="verde">{plural(actual.entregas.aTiempo, "a tiempo", "a tiempo")}</Chip>
                <Chip tono={actual.entregas.tarde > 0 ? "ambar" : "neutro"}>{plural(actual.entregas.tarde, "tarde", "tarde")}</Chip>
                {actual.entregas.sinFecha > 0 && <Chip tono="apagado">{plural(actual.entregas.sinFecha, "sin fecha de entrega", "sin fecha de entrega")}</Chip>}
                <small className="text-xs text-tinta/60">cerrada a tiempo = cerrada en o antes de su fecha de entrega</small>
              </div>
            )}
          </section>

          {periodos.length > 1 && (
            <section aria-label="Tendencia" className="space-y-2">
              <h2 className="font-display text-xl text-tinta">Período a período</h2>
              <div className="card-cayla overflow-x-auto">
                <table className="w-full min-w-[34rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-tinta/10 text-left">
                      <th className="label-cayla px-4 py-2.5 text-[11px] font-normal text-tinta/65">Período</th>
                      <th className="label-cayla px-3 py-2.5 text-right text-[11px] font-normal text-tinta/65">Prendas buenas</th>
                      <th className="label-cayla px-3 py-2.5 text-right text-[11px] font-normal text-tinta/65">Materiales / prenda</th>
                      <th className="label-cayla px-3 py-2.5 text-right text-[11px] font-normal text-tinta/65">Conversión / prenda</th>
                      <th className="label-cayla px-4 py-2.5 text-right text-[11px] font-normal text-tinta/65">Costo / prenda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((p) => (
                      <tr key={p.ventana.clave} className={`border-b border-tinta/10 last:border-b-0 ${p.ventana.clave === actual.ventana.clave ? "bg-sand/40" : ""}`}>
                        <td className="px-4 py-2.5 text-tinta">{p.ventana.etiqueta}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.prendasBuenas || <span className="text-tinta/45">—</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.materialesPorPrenda !== null ? soles(p.materialesPorPrenda) : <span className="text-tinta/45">—</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{p.conversionPorPrenda !== null ? soles(p.conversionPorPrenda) : <span className="text-tinta/45">—</span>}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{p.costoPorPrenda !== null ? soles(p.costoPorPrenda) : <span className="font-normal text-tinta/45">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <p className="text-xs text-tinta/60">
        Las prendas segundas no se cuentan: el costo de lo que salió mal lo pagan las buenas. Para ver cuánto rinde la tela de cada modelo, mira{" "}
        <Link href="/produccion" className="underline underline-offset-2 hover:text-rojo">
          el Resumen
        </Link>{" "}
        y el análisis de insumos al abrir una orden.
      </p>
    </div>
  );
}
