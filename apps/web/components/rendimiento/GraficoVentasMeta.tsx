"use client";

import { useEffect, useRef, useState } from "react";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Linea, topeRedondo } from "@/components/ui/Linea";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { acumulado, avance, type DiaGrafico } from "@/lib/rendimiento-meta-reglas";

const PLANTILLA_DIAS = "grid-cols-[minmax(0,1fr)_7rem_7rem]";

/* ====================================================================
   «Ventas contra la meta» (ADR-0325, spike docs/maquetas/rendimiento-meta-2026-09/)

   Semana | Mes; el mes se ve Acumulado (¿llego o no llego?) o Por día. Lo dibujan la líder (la tienda) y, más
   adelante, la integrante (solo lo suyo): por eso todo el texto llega por props.

   DOS DECISIONES DE FELIPE (2026-09-29) QUE ESTE ARCHIVO CUMPLE:
   · El gráfico NO crece con la pantalla: altura fija (200 px en computadora, 176 en celular) y ancho medido de su
     caja. En una pantalla grande las barras siguen delgadas y el texto no se agranda; solo gana aire.
   · Cambiar Semana | Mes no mueve la página: es estado local, no navegación.

   Sin meta cargada se dibujan solo las ventas y el encabezado lo dice: nunca una marca de meta en cero.
   ==================================================================== */

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

const ALTO_PC = 200;
const ALTO_CELULAR = 176;


function useAnchoMedido() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.floor(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

type Etiquetas = {
  /** «Ventas de la sede» / «Tus ventas». */
  ventas: string;
  /** «Meta del día». */
  meta: string;
  /** «Ventas acumuladas». */
  ventasAcum: string;
  /** «Meta acumulada». */
  metaAcum: string;
  /** Lo que dice la primera columna del tooltip y de la tabla: «Ventas». */
  tooltip: string;
  /** «la meta de» → «72 % de la meta de S/ 30,000». */
  deMeta: string;
  /** Lectura para el lector de pantalla: «Ventas de la sede». */
  aria: string;
};

export function GraficoVentasMeta({
  titulo,
  semana,
  mes,
  inicial,
  etiquetas,
  nota,
}: {
  titulo: string;
  semana: DiaGrafico[];
  mes: DiaGrafico[];
  inicial: "semana" | "mes";
  etiquetas: Etiquetas;
  nota?: string;
}) {
  const [modo, setModo] = useState<"semana" | "mes">(inicial);
  const [sub, setSub] = useState<"acum" | "dia">("acum");
  const [ref, ancho] = useAnchoMedido();

  const esMes = modo === "mes";
  const dias = esMes ? mes : semana;
  const alto = ancho > 0 && ancho < 520 ? ALTO_CELULAR : ALTO_PC;
  const total = dias.reduce((s, d) => s + (d.valor ?? 0), 0);
  const hayMeta = dias.some((d) => d.meta !== null);
  const meta = hayMeta ? dias.reduce((s, d) => s + (d.meta ?? 0), 0) : null;
  const acum = esMes && sub === "acum";
  const pct = avance(total, meta);

  return (
    <section className="space-y-3" aria-label={titulo} data-guia="rendimiento.grafico">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TituloSeccion>{titulo}</TituloSeccion>
        <div className="flex flex-wrap items-center gap-2">
          {/* Semana o Mes es el período (píldora); Acumulado o Por día, el mismo mes de otra forma (segmento de modo). ADR-0358. */}
          <div role="group" aria-label="Período del gráfico" className="flex flex-wrap items-center gap-2">
            {(
              [
                ["semana", "Semana"],
                ["mes", "Mes"],
              ] as const
            ).map(([clave, texto]) => (
              <button
                key={clave}
                type="button"
                aria-pressed={modo === clave}
                data-guia={clave === "mes" ? "rendimiento.grafico-mes" : "rendimiento.grafico-semana"}
                onClick={() => setModo(clave)}
                className="pildora-cayla"
              >
                {texto}
              </button>
            ))}
          </div>
          {esMes && (
            <SegmentoDeslizante
              forma="modo"
              etiqueta="Cómo ver el mes"
              valor={sub}
              onCambio={(k) => setSub(k as "acum" | "dia")}
              opciones={[
                { clave: "acum", etiqueta: "Acumulado" },
                { clave: "dia", etiqueta: "Por día" },
              ]}
            />
          )}
        </div>
      </div>

      <div className="card-cayla p-5">
        <p className="text-sm text-tinta">
          <b className="font-display text-xl font-normal tabular-nums">{SOLES.format(total)}</b>{" "}
          <span className="text-taupe">{esMes ? "en el mes" : "en 7 días"}</span>
        </p>
        <p className="mt-0.5 text-xs text-taupe">
          {meta !== null && pct !== null ? `${pct} % de ${etiquetas.deMeta} ${SOLES.format(meta)}` : "Sin meta cargada: solo se ven las ventas"}
        </p>
        {nota && <p className="mt-0.5 text-xs text-taupe">{nota}</p>}

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-taupe" aria-label="Leyenda">
          {acum ? (
            <>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-4 bg-tinta" />
                {etiquetas.ventasAcum}
              </li>
              {hayMeta && (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-taupe" />
                  {etiquetas.metaAcum}
                </li>
              )}
            </>
          ) : (
            <>
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-3 w-2 rounded-t-sm bg-tinta" />
                {etiquetas.ventas}
              </li>
              {hayMeta && (
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-taupe" />
                  {etiquetas.meta}
                </li>
              )}
            </>
          )}
        </ul>

        {/* La caja mide el ancho real; la altura no cambia nunca con la pantalla. Las piezas del sistema (ronda 14 de /unificar). */}
        <div ref={ref} className="mt-2">
          {acum ? <Acumulado dias={mes} alto={alto} etiquetas={etiquetas} hayMeta={hayMeta} /> : <Barras dias={dias} alto={alto} etiquetas={etiquetas} esMes={esMes} />}
        </div>

        <details className="mt-3 text-xs text-taupe">
          <summary className="cursor-pointer select-none underline underline-offset-2 hover:no-underline">Ver como tabla</summary>
          {/* La tabla del sistema (ADR-0358, ronda 7). */}
          <Tabla className="mt-2 max-h-64 overflow-y-auto">
            <div role="table" aria-label={`${titulo}, día por día`} className="divide-y divide-sand tabular-nums">
              <Encabezado
                siempre
                plantilla={PLANTILLA_DIAS}
                columnas={[{ titulo: "Día" }, { titulo: etiquetas.tooltip, alinear: "der" }, { titulo: "Meta", alinear: "der" }]}
              />
              {dias.map((d) => (
                <div key={d.fecha} role="row" className={fila(PLANTILLA_DIAS, "text-tinta")}>
                  <span role="rowheader" className={celda()}>
                    {d.titulo}
                  </span>
                  <span role="cell" className={celda("der", "text-right")}>
                    {d.valor === null ? "—" : SOLES.format(d.valor)}
                  </span>
                  <span role="cell" className={celda("der", "text-right")}>
                    {d.meta === null ? "—" : SOLES.format(d.meta)}
                  </span>
                </div>
              ))}
            </div>
          </Tabla>
        </details>
      </div>
    </section>
  );
}

function acumuladoDe(mes: DiaGrafico[], i: number): { ventas: number | null; meta: number } {
  const a = acumulado(mes);
  return { ventas: a.ventas[i], meta: a.meta[i] };
}

/** Lo que dice el globito de un día (en las barras y en la línea). */
function TipDia({ dia, acumulado: ac, etiquetas }: { dia: DiaGrafico; acumulado: { ventas: number | null; meta: number } | null; etiquetas: Etiquetas }) {
  const lineas: string[] = [];
  if (ac) {
    lineas.push(`${etiquetas.ventasAcum}: ${ac.ventas === null ? "—" : SOLES.format(ac.ventas)}`);
    lineas.push(ac.meta > 0 ? `${etiquetas.metaAcum}: ${SOLES.format(ac.meta)}${ac.ventas !== null ? ` (${avance(ac.ventas, ac.meta)} %)` : ""}` : "Sin meta cargada");
  } else if (dia.valor === null) {
    lineas.push("Día por venir");
    lineas.push(dia.meta !== null ? `${etiquetas.meta}: ${SOLES.format(dia.meta)}` : "Sin meta cargada");
  } else {
    lineas.push(`${etiquetas.tooltip}: ${SOLES.format(dia.valor)}`);
    lineas.push(dia.meta !== null ? `${etiquetas.meta}: ${SOLES.format(dia.meta)} (${avance(dia.valor, dia.meta)} %)` : "Sin meta cargada");
  }
  return (
    <>
      <b className="block font-semibold">
        {dia.titulo}
        {dia.hoy ? ", hasta ahora" : ""}
      </b>
      {lineas.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </>
  );
}

/** Las ventas de cada día con la meta de cada uno: las barras por tiempo del sistema, el mejor día en tinta con su cifra. */
function Barras({ dias, alto, etiquetas, esMes }: { dias: DiaGrafico[]; alto: number; etiquetas: Etiquetas; esMes: boolean }) {
  const mejor = dias.reduce((b, d, i) => ((d.valor ?? 0) > (dias[b].valor ?? 0) ? i : b), 0);
  return (
    <BarrasTiempo
      alto={alto - 24}
      barras={dias.map((d) => ({
        clave: d.fecha,
        valor: d.valor ?? 0,
        etiqueta: d.etiqueta ?? "",
        fuerte: d.hoy,
        meta: d.meta,
        cifra: NUM.format(Math.round(d.valor ?? 0)),
        tip: <TipDia dia={d} acumulado={null} etiquetas={etiquetas} />,
      }))}
      destacada={(dias[mejor]?.valor ?? 0) > 0 ? dias[mejor].fecha : null}
      etiqueta={`${etiquetas.aria} ${esMes ? "por día del mes" : "de los últimos siete días"}, contra la meta de cada día`}
    />
  );
}

/** Lo vendido en el mes, acumulado, contra la meta acumulada: la línea del sistema. */
function Acumulado({ dias, alto, etiquetas, hayMeta }: { dias: DiaGrafico[]; alto: number; etiquetas: Etiquetas; hayMeta: boolean }) {
  const n = dias.length;
  const a = acumulado(dias);
  const fin = a.meta[n - 1] ?? 0;
  const serie = a.ventas.flatMap((v, i) => (v === null ? [] : [{ x: i, y: v }]));
  const ultimo = serie.at(-1)?.y ?? 0;
  const conMeta = hayMeta && fin > 0;
  return (
    <Linea
      serie={ultimo > 0 ? serie : []}
      referencia={conMeta ? a.meta.map((m, i) => ({ x: i, y: m })) : null}
      desde={0}
      hasta={Math.max(n - 1, 1)}
      maxY={topeRedondo(Math.max(fin, ultimo, 100))}
      marcasX={dias.flatMap((d, i) => (d.etiqueta ? [{ x: i, texto: d.etiqueta, fuerte: d.hoy }] : []))}
      formatoY={(v) => NUM.format(Math.round(v))}
      cifra={ultimo > 0 ? NUM.format(Math.round(ultimo)) : null}
      cifraReferencia={conMeta ? { valor: NUM.format(Math.round(fin)), texto: "meta" } : null}
      leer={(x) => <TipDia dia={dias[x]} acumulado={acumuladoDe(dias, x)} etiquetas={etiquetas} />}
      alto={alto}
      etiqueta={`${etiquetas.ventasAcum} del mes${conMeta ? " contra la meta acumulada" : ""}`}
      vacio="Sin ventas todavía este mes"
    />
  );
}
