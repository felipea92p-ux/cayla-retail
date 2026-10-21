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
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Ayuda } from "@/components/Ayuda";

// Eficiencia del Taller (ADR-0133, F7; D-31 y D-33). «Cuánto cuesta de verdad cada prenda que sale del Taller»: materiales de lo que cerró + conversión (la
// planilla del Taller y los gastos generales, repartidos entre las prendas buenas). El período es el de la planilla (29 al 28). Sin planilla visible NO se
// inventa la conversión: se dice qué falta. Sin rojo: nada de esto es una alarma, es una medida que se compara período a período.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

// «Período a período» (<Tabla>, ADR-0358): la misma plantilla para el encabezado y cada fila; `min-w` la deja desplazarse en celular.
const PLANTILLA_PERIODOS = "grid-cols-[minmax(7rem,1.3fr)_repeat(4,minmax(6.5rem,1fr))] min-w-[34rem]";
const COLUMNAS_PERIODOS: Columna[] = [
  { titulo: "Período" },
  { titulo: "Prendas buenas", alinear: "der" },
  { titulo: "Materiales / prenda", alinear: "der" },
  { titulo: "Mano de obra y gastos / prenda", alinear: "der" },
  { titulo: "Costo / prenda", alinear: "der" },
];

const COLOR_PARTE: Record<PartePlata["clave"], string> = { planilla: "bg-tinta", materiales: "bg-tinta/60", maquila: "bg-tinta/35", gastos: "bg-tinta/18" };

function Variacion({ actual, anterior }: { actual: number | null; anterior: number | null }) {
  const v = variacion(actual, anterior);
  if (v === null) return <>sin período anterior con qué comparar</>;
  if (Math.abs(v) < 0.005) return <>igual que el período anterior</>;
  return <>{v > 0 ? "▲" : "▼"} {pct(Math.abs(v))} {v > 0 ? "más" : "menos"} que el período anterior</>;
}

export function EficienciaTallerPanel({
  periodos,
  estadoPlanilla,
  hayGastos,
  sede,
}: {
  periodos: EficienciaPeriodo[];
  estadoPlanilla: EstadoPlanilla;
  hayGastos: boolean;
  /** La sede de la línea de arriba de la cabecera (el Taller). */
  sede: string;
}) {
  const [clave, setClave] = useState(periodos[0]?.ventana.clave ?? "");
  const i = Math.max(0, periodos.findIndex((p) => p.ventana.clave === clave));
  const actual = periodos[i];
  const anterior = periodos[i + 1] ?? null;
  const reparto = actual ? repartoDelGasto(actual) : [];

  return (
    <div className="space-y-6">
      {/* La cabecera de todo el ERP menos Finanzas (ADR-0358, Felipe 2026-10-14). Eficiencia es una pestaña del Resumen, no una fila
          del menú: su título es el nombre de la pestaña y lo suyo va en la frase. */}
      <EncabezadoPagina
        sede={sede}
        titulo="Eficiencia"
        subtitulo="Cuánto cuesta de verdad cada prenda que sale del Taller: la tela, los avíos y los servicios de afuera de lo que pasó al stock, más lo que cuesta transformarlo —la planilla y los gastos del Taller— repartido entre las prendas buenas."
      />

      {/* «Hoy | Eficiencia»: las dos miradas del líder sobre el Taller (ADR-0133, F6 y F7), con la pestaña de vista del sistema
          (ADR-0358). Eficiencia NO es una fila del lateral (el menú de Producción está en su tope de hijas): se llega desde aquí. */}
      <Pestanas
        etiquetaAccesible="Miradas del Taller"
        idIndicador="produccion-miradas"
        guia="produccion.miradas"
        activa="eficiencia"
        items={[
          { clave: "hoy", etiqueta: "Hoy", href: "/produccion", ayuda: "Qué necesita mi decisión" },
          { clave: "eficiencia", etiqueta: "Eficiencia", href: "/produccion/eficiencia", ayuda: "Cuánto cuesta cada prenda" },
        ]}
      />

      {estadoPlanilla === "sin_vista" && (
        <p data-guia="prod-eficiencia.aviso-planilla" className="rounded-md bg-sand/60 px-3 py-2.5 text-sm text-tinta/80">
          Todavía no se puede leer la planilla del Taller. Mientras tanto se muestran los materiales por prenda; el costo completo aparecerá solo cuando se pueda leer.
        </p>
      )}
      {estadoPlanilla === "vacia" && (
        <p data-guia="prod-eficiencia.aviso-planilla" className="rounded-md bg-sand/60 px-3 py-2.5 text-sm text-tinta/80">
          No hay planilla del Taller para mostrar: o todavía no hay períodos pagados, o tu cuenta no la puede ver (la ve quien administra al personal). Se muestran los últimos meses con los materiales por prenda; sin la planilla no se calcula lo de mano de obra y gastos ni el costo total.
        </p>
      )}

      {periodos.length > 1 && (
        // El período es un filtro de un valor: la píldora del sistema (ADR-0358).
        <div data-guia="prod-eficiencia.periodos" role="group" aria-label="Período" className="pildoras-desliza gap-2 sm:flex-wrap">
          {periodos.map((p, n) => (
            <button key={p.ventana.clave} type="button" data-guia={n === 0 ? "prod-eficiencia.periodo-actual" : n === 1 ? "prod-eficiencia.periodo-otro" : undefined} aria-pressed={clave === p.ventana.clave} onClick={() => setClave(p.ventana.clave)} className="pildora-cayla shrink-0">
              {p.ventana.etiqueta}
            </button>
          ))}
        </div>
      )}

      {actual && (
        <>
          <div data-guia="prod-eficiencia.cifras" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              etiqueta="Mano de obra y gastos por prenda"
              ayuda={
                <Ayuda titulo="¿Qué es esto?">
                  Es lo que cuesta transformar la tela en prenda, más allá de los materiales: la planilla del Taller y sus gastos del período, repartidos entre las prendas buenas que salieron. Una segunda o una faltante sube el de las demás.
                </Ayuda>
              }
              className="anim-entra"
              style={{ ["--i" as string]: 3 }}
              valor={actual.conversionPorPrenda === null ? null : <CifraQueCuenta valor={actual.conversionPorPrenda} formato="soles" alMontar />}
            >
              {actual.conversionPorPrenda === null ? "sin planilla que repartir" : <Variacion actual={actual.conversionPorPrenda} anterior={anterior?.conversionPorPrenda ?? null} />}
            </TarjetaCifra>
          </div>

          <section data-guia="prod-eficiencia.reparto" aria-label="En qué se fue la plata" className="card-cayla space-y-3 p-5">
            <div>
              <TituloSeccion>¿En qué se fue la plata del Taller?</TituloSeccion>
              <p className="text-xs text-tinta/65">Período {actual.ventana.etiqueta}. Lo que gastó el Taller: la planilla, los gastos generales y los materiales y los servicios de afuera de lo que pasó al stock.</p>
            </div>
            {reparto.length === 0 ? (
              <p className="text-sm text-tinta/70">No hay gasto del Taller registrado en este período.</p>
            ) : (
              <>
                {/* La barra es `<BarraApilada>` (ADR-0358): cada parte del gasto, con el mismo color que su fila de abajo. */}
                <BarraApilada alto={12} etiqueta="Reparto del gasto del Taller" formato={soles} segmentos={reparto.map((p) => ({ clave: p.clave, nombre: p.etiqueta, valor: p.monto, clase: COLOR_PARTE[p.clave] }))} />
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
            {actual.planilla !== null && <p className="text-xs text-tinta/60">Planilla: costo total para CAYLA (sueldos, provisiones de gratificación, CTS y vacaciones, y aportes) de {plural(actual.ventana.planilla?.personas ?? 0, "persona", "personas")}, tal como se pagó.</p>}
            {!hayGastos && (
              <p className="text-xs text-tinta/60">
                Alquiler y servicios del Taller aparecerán aquí cuando se registren como gastos del Taller en Finanzas (modelo de gastos, ADR-0117); Producción no lleva una tabla aparte.
              </p>
            )}
          </section>

          <section data-guia="prod-eficiencia.entregas" aria-label="Entregas" className="card-cayla space-y-2 p-5">
            <TituloSeccion>Entregas del período</TituloSeccion>
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
            <section data-guia="prod-eficiencia.tendencia" aria-label="Tendencia" className="space-y-2">
              <TituloSeccion>Período a período</TituloSeccion>
              {/* La tabla es <Tabla> (ADR-0358, ronda 7). `siempre`: en celular se desplaza dentro de su tarjeta en vez de apilarse, como antes. */}
              <Tabla>
                <Encabezado siempre columnas={COLUMNAS_PERIODOS} plantilla={PLANTILLA_PERIODOS} />
                {periodos.map((p) => (
                  <div key={p.ventana.clave} role="row" className={fila(PLANTILLA_PERIODOS, `text-[13px] ${p.ventana.clave === actual.ventana.clave ? "bg-sand/40" : ""}`)}>
                    <span className={celda("izq", "text-tinta")}>{p.ventana.etiqueta}</span>
                    <span className={celda("der")}>{p.prendasBuenas || <span className="text-tinta/45">—</span>}</span>
                    <span className={celda("der")}>{p.materialesPorPrenda !== null ? soles(p.materialesPorPrenda) : <span className="text-tinta/45">—</span>}</span>
                    <span className={celda("der")}>{p.conversionPorPrenda !== null ? soles(p.conversionPorPrenda) : <span className="text-tinta/45">—</span>}</span>
                    <span className={celda("der", "font-semibold")}>{p.costoPorPrenda !== null ? soles(p.costoPorPrenda) : <span className="font-normal text-tinta/45">—</span>}</span>
                  </div>
                ))}
              </Tabla>
            </section>
          )}
        </>
      )}

      <p data-guia="prod-eficiencia.nota" className="text-xs text-tinta/60">
        Las prendas segundas no se cuentan: el costo de lo que salió mal lo pagan las buenas. Para ver cuánto rinde la tela de cada modelo, mira{" "}
        <Link href="/produccion" className="btn-enlace">
          el Resumen
        </Link>{" "}
        y el análisis de insumos al abrir una orden.
      </p>
    </div>
  );
}
