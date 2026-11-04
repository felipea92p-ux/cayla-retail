import type { CSSProperties } from "react";
import { BarraApilada } from "@/components/ui/BarraApilada";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { Wallet } from "lucide-react";
import { soles } from "@/lib/flujo-caja-reglas";
import {
  barrasPorDia,
  barrasPorMes,
  comparacionDe,
  diaEnPalabras,
  mejorDia,
  promedioDiarioAnterior,
  promedioDiarioDelMes,
  topeDelEje,
  tramoEnPalabras,
  tramosDePago,
  type ReporteMes,
  type SeriesMes,
} from "@/lib/reportes-ventas-reglas";
import { nombreDelMes } from "@/lib/historial-cierres-reglas";
import { MesAMes } from "@/components/reportes-ventas/MesAMes";

// Los tres gráficos de «Ventas del mes» (maqueta docs/maquetas/reportes-ventas-2026-11/): ventas por día contra el promedio del mes anterior,
// mes a mes y cómo se pagó. Todo sale de `fn_reporte_ventas_series`, la hermana de la lectura de las cifras: suman lo mismo. Las piezas son las del
// sistema (ADR-0358): `BarrasTiempo` y `BarraApilada`; ningún gráfico dibujado a mano.
const PORCENTAJE = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const capitalizada = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const bloque = "anim-sube rounded-[20px] bg-papel p-5 ring-1 ring-tinta/[0.07]";

export function GraficosReporteMes({ r, s, tiendaId, corte }: { r: ReporteMes; s: SeriesMes; tiendaId: string | null; corte: string | null }) {
  const mes = { anio: Number(s.mes.slice(0, 4)), mes: Number(s.mes.slice(5, 7)) };
  const nombre = nombreDelMes(mes);
  const mejor = mejorDia(s);
  // La raya del gráfico es el promedio diario del mes pasado; si ese mes no se puede comparar (el ERP es joven y quedó a medias), es el del propio mes:
  // el gráfico nunca se queda sin su raya.
  const comparacion = comparacionDe(r);
  const contra = comparacion.hay ? comparacion.contra : null;
  const promedioAnterior = contra !== null ? promedioDiarioAnterior(r) : null;
  const promedio = promedioAnterior ?? promedioDiarioDelMes(r);
  const delMesPasado = promedioAnterior !== null && contra !== null;
  const textoRaya = promedio === null ? null : delMesPasado ? `${capitalizada(contra)}: ${soles(promedio)} al día` : `Este mes: ${soles(promedio)} al día`;
  const dias = barrasPorDia(s);
  const meses = barrasPorMes(s);
  const { total, tramos } = tramosDePago(s);
  const maxMes = Math.max(0, ...meses.map((m) => m.valor));

  return (
    <div className="space-y-4">
      <section aria-label="Ventas por día" data-guia="reportes.por-dia" className={bloque} style={{ "--i": 5 } as CSSProperties}>
        <TituloSeccion dato={mejor ? <>Mejor día: <b className="font-semibold text-tinta">{diaEnPalabras(mejor.fecha)}</b> · {soles(mejor.vendido)}</> : undefined}>
          Ventas por día
        </TituloSeccion>
        <p className="mt-0.5 text-sm text-tinta/60">{nombre} · {tramoEnPalabras(r)}</p>
        <div className="mt-4">
          <BarrasTiempo
            alto={216}
            ejes={soles}
            max={topeDelEje(Math.max(0, ...dias.map((b) => b.valor), promedio ?? 0))}
            barras={dias.map((b) => ({
              clave: b.clave,
              valor: b.valor,
              etiqueta: b.etiqueta,
              opcional: b.opcional,
              fuerte: b.fuerte,
              cifra: soles(b.valor), // la del mejor día: «S/ 8,501», no «8,500.5»
              // El fin de semana, un tono más oscuro; el mejor día, en tinta aunque caiga en sábado (lo decide `destacada`).
              tono: b.fuerte && b.clave !== mejor?.fecha ? "arena-fuerte" : undefined,
              tip: b.tip,
              aria: b.tip,
            }))}
            destacada={mejor?.fecha ?? null}
            referencia={promedio !== null && textoRaya !== null ? { valor: promedio, texto: textoRaya } : null}
            etiqueta={`Ventas por día de ${nombre}${mejor ? `. Mejor día: ${diaEnPalabras(mejor.fecha)}, ${soles(mejor.vendido)}` : ""}`}
          />
        </div>
        <ul aria-label="Qué significa cada color" className="mt-3 flex flex-wrap gap-x-[18px] gap-y-1.5 text-xs text-tinta/65">
          {mejor && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-tinta" />
              El mejor día
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "color-mix(in srgb, var(--color-tinta) 22%, var(--color-grafico-neutro))" }} />
            Sábado y domingo
          </li>
          {promedio !== null && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="w-3.5 border-t-2 border-dashed border-taupe" />
              {delMesPasado ? `Promedio diario de ${contra}` : "Promedio diario de este mes"}
            </li>
          )}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Mes a mes" data-guia="reportes.mes-a-mes" className={bloque} style={{ "--i": 6 } as CSSProperties}>
          <TituloSeccion>Mes a mes</TituloSeccion>
          <p className="mt-0.5 text-sm text-tinta/60">En soles. Toca un mes para verlo.</p>
          <div className="mt-4">
            {meses.length > 1 ? (
              <MesAMes barras={meses} elegida={s.mes.slice(0, 7)} tiendaId={tiendaId} corte={corte} max={maxMes} etiqueta={`Ventas de cada mes: ${meses.map((m) => m.tip).join("; ")}`} />
            ) : (
              <p className="rounded-xl border border-dashed border-tinta/15 px-3 py-5 text-center text-sm text-tinta/65">
                Todavía hay un solo mes con ventas: cuando haya más, los verás aquí uno al lado del otro.
              </p>
            )}
          </div>
        </section>

        <section aria-label="Cómo se pagó" data-guia="reportes.pagos" className={bloque} style={{ "--i": 7 } as CSSProperties}>
          <TituloSeccion dato={total > 0 ? <b className="font-semibold text-tinta">{soles(total)}</b> : undefined}>Cómo se pagó</TituloSeccion>
          <p className="mt-0.5 text-sm text-tinta/60">{nombre} · lo cobrado, por medio de pago</p>
          {tramos.length === 0 ? (
            <Vacio tamano="chico" icono={<Wallet />}>No hay cobros en este tramo.</Vacio>
          ) : (
            <>
              <BarraApilada
                className="mt-4"
                alto={12}
                formato={soles}
                etiqueta={`Cómo se pagó: ${tramos.map((t) => `${t.nombre} ${PORCENTAJE.format(t.parte * 100)} %`).join(", ")}`}
                segmentos={tramos.map((t) => ({ clave: t.metodo, nombre: t.nombre, valor: t.monto, color: t.color }))}
              />
              <ul className="mt-3 space-y-1.5 text-sm">
                {tramos.map((t) => (
                  <li key={t.metodo} className="flex items-center gap-2 text-tinta/70">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="flex-1 truncate">{t.nombre}</span>
                    <span className="tabular-nums text-tinta/50">{PORCENTAJE.format(t.parte * 100)} %</span>
                    <span className="w-[5.25rem] text-right tabular-nums text-tinta">{soles(t.monto)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
