"use client";

import { useMemo, type CSSProperties } from "react";
import { ChartColumn } from "lucide-react";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { diaYHoraLima } from "@/lib/fechas-lima";
import {
  asignacionDeVista,
  ETIQUETA_MOTIVO,
  etiquetaDeHora,
  prendasPorVentaEnDias,
  repartePorHoras,
  ventasPorHoraEnDias,
  type CambioMeta,
  type FilaDetalle,
  type PersonaMeta,
} from "@/lib/rendimiento-meta-reglas";
import type { Tramo } from "@/lib/rendimiento-vista-reglas";

const SOLES = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Lo que ya existía en Rendimiento (ADR-0325, Felipe 2026-10-03) y sigue aquí, en vidrio y con los días elegidos: en qué franja vende la TIENDA, cuántas prendas
 * se lleva cada compra, cómo está repartida la meta y los cambios de meta. Las horas son de la tienda a propósito: sirven para repartir turnos, no para juzgar a
 * nadie (por eso no cambian al elegir a una persona).
 */
export function DetalleRendimiento({
  nombre,
  personas,
  detalle,
  historial,
  tramo,
  tramoTexto,
  metaSedeMes,
}: {
  nombre: string;
  personas: readonly PersonaMeta[];
  /** `null`: la base no lo entregó, y esas dos medidas no se dibujan (nunca como 0). */
  detalle: FilaDetalle[] | null;
  historial: CambioMeta[];
  tramo: Tramo;
  tramoTexto: string;
  metaSedeMes: number | null;
}) {
  const porHora = useMemo(() => (detalle ? ventasPorHoraEnDias(detalle, tramo) : null), [detalle, tramo]);
  const prendas = useMemo(() => (detalle ? prendasPorVentaEnDias(detalle, tramo) : null), [detalle, tramo]);
  const porHoras = repartePorHoras([...personas]);
  const asignacion = asignacionDeVista([...personas], "mes", metaSedeMes);

  return (
    <div className="mesa">
      <div className="mesa-medidas">
        {porHora && (
          <section className="mesa-placa liquido mesa-horas" aria-label="Ventas por hora de la tienda" data-guia="rendimiento.por-hora">
            <p className="label-cayla text-[11px] text-tinta/65">Ventas por hora de la tienda, {tramoTexto}</p>
            {porHora.mejor ? (
              <>
                <BarrasTiempo
                  className="mt-3"
                  alto={112}
                  barras={porHora.horas.map((h, i) => ({
                    clave: String(h.hora),
                    valor: h.total,
                    etiqueta: i === 0 || i === porHora.horas.length - 1 ? etiquetaDeHora(h.hora) : "",
                    tip: `${etiquetaDeHora(h.hora)} · ${SOLES.format(h.total)} · ${h.ventas} ${plural(h.ventas, "venta", "ventas")}`,
                    cifra: SOLES.format(h.total),
                  }))}
                  destacada={String(porHora.mejor.hora)}
                  etiqueta={`Ventas por hora, ${tramoTexto}. La mejor hora fue ${etiquetaDeHora(porHora.mejor.hora)}, con ${SOLES.format(porHora.mejor.total)}.`}
                />
                <p className="mt-2 text-sm text-tinta/65">
                  La mejor franja fue la de las <b className="font-semibold text-tinta">{etiquetaDeHora(porHora.mejor.hora)}</b>: {SOLES.format(porHora.mejor.total)} en {porHora.mejor.ventas}{" "}
                  {plural(porHora.mejor.ventas, "venta", "ventas")}. Sirve para repartir turnos, no para juzgar a nadie.
                </p>
              </>
            ) : (
              <Vacio tamano="chico" alinear="izquierda" className="mt-1 px-0" icono={<ChartColumn />}>
                Sin ventas {tramoTexto}: todavía no hay horas que mirar.
              </Vacio>
            )}
          </section>
        )}
        {prendas && (
          <div className="liquido" style={{ borderRadius: 20 } as CSSProperties} data-guia="rendimiento.prendas">
            <TarjetaCifra etiqueta="Prendas por venta" className="h-full" valor={prendas.porVenta !== null ? prendas.porVenta.toLocaleString("es-PE", { maximumFractionDigits: 1 }) : null}>
              {prendas.porVenta !== null ? `${prendas.prendas} ${plural(prendas.prendas, "prenda", "prendas")} en ${prendas.ventas} ${plural(prendas.ventas, "venta", "ventas")}, ${tramoTexto}. Las devoluciones no restan.` : "Sin ventas todavía"}
            </TarjetaCifra>
          </div>
        )}
      </div>
      {detalle === null && <p className="nota-cayla">No se pudieron leer las ventas por hora ahora. Lo demás de esta pantalla sí está al día.</p>}

      {metaSedeMes === null ? (
        <p className="nota-cayla">
          Sin meta de la sede, aquí solo ves lo vendido. Cárgala en <b>Configuración ▸ Tiendas y caja</b> y se reparte sola, por horas.
        </p>
      ) : (
        <p className="nota-cayla" data-guia="rendimiento.reparto">
          {asignacion.tipo !== "sin_meta" && (
            <>
              Asignado a {personas.length === 1 ? "1 persona" : `las ${personas.length}`}: <b>{SOLES.format(asignacion.asignado)}</b> de <b>{SOLES.format(asignacion.metaSede)}</b> de {nombre} este mes
              {asignacion.tipo === "cuadra" && ", y cuadra"}
              {asignacion.tipo === "faltan" && `: faltan ${SOLES.format(asignacion.diferencia)} por asignar`}
              {asignacion.tipo === "pasa" && `: se pasa por ${SOLES.format(-asignacion.diferencia)}`}.{" "}
            </>
          )}
          {porHoras ? "Se reparte por horas programadas." : `${nombre} no tiene horarios cargados en Dynamic: la meta se reparte en partes iguales entre quienes marcaron asistencia, y solo cuenta los días ya marcados.`}
        </p>
      )}

      <Historial cambios={historial} />
    </div>
  );
}

function Historial({ cambios }: { cambios: CambioMeta[] }) {
  return (
    <details className="mesa-placa liquido mesa-historial" data-guia="rendimiento.historial">
      <summary data-guia="rendimiento.historial-abrir">
        <TituloSeccion nivel={3} cuenta={cambios.length}>
          Cambios de meta
        </TituloSeccion>
        <Chip tono="neutro" versalitas={false}>
          no se borran
        </Chip>
      </summary>
      <ul>
        {cambios.length === 0 && <li className="text-sm text-taupe">Todavía nadie cambió una meta este mes.</li>}
        {cambios.map((c) => {
          const { dia, hora } = diaYHoraLima(c.creadoEn);
          const motivo = c.motivo === "otro" && c.detalle ? `Otro: ${c.detalle}` : (ETIQUETA_MOTIVO[c.motivo] ?? c.motivo);
          return (
            <li key={c.id} className="grid grid-cols-[5.5rem_1fr] gap-3 text-sm">
              <span className="tabular-nums text-taupe">
                {dia} · {hora}
              </span>
              <div>
                <p className="text-tinta">
                  <span className="font-medium">{c.persona}</span>: <span className="tabular-nums">{SOLES.format(c.metaAntes)} → {c.meta === null ? "automática" : SOLES.format(c.meta)}</span> <span className="text-taupe">al mes</span>
                </p>
                <p className="text-taupe">
                  {c.cambiadoPor} · {motivo}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
