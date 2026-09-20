"use client";

import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { Chip } from "@/components/ui/Chip";
import {
  desgloseCosto,
  estadoEntrega,
  etapaActual,
  etapasDe,
  semaforoMargen,
  type EstadoEntrega,
} from "@/lib/produccion-reglas";
import type { OrdenProduccion } from "@/lib/produccion";

// Una orden en el tablero (ADR-0133, F2): qué es, dónde está, si llega, y —solo para el líder— cuánto cuesta.
// Es un botón: tocarla abre el panel. Sin animación en bucle (regla de la pantalla: la única es el punto «vivo»
// del Chip): la etapa actual se ve por su color, no porque parpadee.

const TONO_SEMAFORO = { gana: "bg-verde", filo: "bg-ambar", pierde: "bg-rojo" } as const;
const TEXTO_SEMAFORO = { gana: "Gana", filo: "Al filo", pierde: "Pierde" } as const;

export function semaforoDeOrden(o: Pick<OrdenProduccion, "precioVenta" | "costoUnitario">) {
  const s = semaforoMargen(o.precioVenta, o.costoUnitario);
  return s ? { ...s, clase: TONO_SEMAFORO[s.tono], texto: TEXTO_SEMAFORO[s.tono] } : null;
}

/** «Entrega pasada · 3 d», «Entrega hoy», «Entrega en 2 d» o la fecha sin alarma. */
export function ChipEntrega({ entrega }: { entrega: EstadoEntrega }) {
  if (entrega.tipo === "vencida") return <Chip tono="rojo">Entrega pasada · {entrega.dias} d</Chip>;
  if (entrega.tipo === "pronto") return <Chip tono="ambar">{entrega.dias === 0 ? "Entrega hoy" : `Entrega en ${entrega.dias} d`}</Chip>;
  return null;
}

export function OrdenTarjeta({
  orden,
  esLider,
  hoy,
  indice,
  onAbrir,
  refTarjeta,
}: {
  orden: OrdenProduccion;
  esLider: boolean;
  hoy: string;
  indice: number;
  onAbrir: () => void;
  refTarjeta?: (el: HTMLElement | null) => void;
}) {
  const etapas = etapasDe(orden.esMuestra);
  const actual = etapaActual(orden.etapas, orden.esMuestra);
  const entrega = estadoEntrega(orden.fechaEntrega, hoy);
  const sem = semaforoDeOrden(orden);
  const costo = desgloseCosto(orden.costoTela, orden.costoAvios, orden.costoMaquila);
  const conMaquila = actual !== "listo" && orden.etapas[actual] === "tercerizado";
  const sinCosto = costo.total === 0;

  return (
    <button
      ref={refTarjeta}
      type="button"
      onClick={onAbrir}
      style={{ ["--i" as string]: indice }}
      className="card-cayla alza-cayla anim-entra block w-full p-3.5 text-left"
      aria-label={`${orden.referencia}, ${orden.cantidadPlan} prendas`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display break-words text-lg leading-tight text-tinta">{orden.referencia}</h3>
          <p className="mt-0.5 text-xs text-tinta/65">
            {[orden.categoria, `${orden.cantidadPlan} prendas`].filter(Boolean).join(" · ")}
          </p>
        </div>
        {esLider && (
          <div className="shrink-0 text-right">
            <p className="font-display text-lg leading-tight tabular-nums text-tinta">{sinCosto ? "—" : soles(orden.costoUnitario)}</p>
            <p className="whitespace-nowrap text-[10.5px] text-tinta/65">costo / prenda</p>
          </div>
        )}
      </div>

      {/* Etapas: hecha = verde, tercerizada = ámbar, la actual se ve más oscura que las pendientes. */}
      <div className="mb-2.5 mt-3 flex gap-1" aria-hidden>
        {etapas.map((e) => {
          const estado = orden.etapas[e.clave];
          const clase =
            estado === "hecho" ? "bg-verde" : estado === "tercerizado" ? "bg-ambar/50" : e.clave === actual ? "bg-tinta/40" : "bg-sand";
          return <span key={e.clave} title={e.etiqueta} className={`h-[5px] flex-1 rounded-full ${clase}`} />;
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs text-tinta/65">
        <span>{orden.fechaEntrega ? `entrega ${diaMes(orden.fechaEntrega)}` : "sin fecha de entrega"}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <ChipEntrega entrega={entrega} />
          {conMaquila ? (
            <Chip tono="ambar">Maquila externa</Chip>
          ) : esLider && orden.costoTela + orden.costoAvios === 0 ? (
            <Chip tono="ambar">Sin insumos</Chip>
          ) : esLider && sem ? (
            <span className="inline-flex items-center gap-1.5 text-tinta/75">
              <span aria-hidden className={`h-2 w-2 rounded-full ${sem.clase}`} />
              {sem.texto} {Math.round(sem.margen * 100)}%
            </span>
          ) : null}
        </span>
      </div>

      {esLider && !sinCosto && (
        <div className="mt-2.5 flex h-1 gap-px overflow-hidden rounded-full bg-tinta/10" aria-hidden>
          {costo.partes.map((p, i) =>
            p.parte > 0 ? (
              <span
                key={p.clave}
                className={`anim-crece-x block h-full ${p.clave === "tela" ? "bg-tinta" : p.clave === "avios" ? "bg-taupe" : "bg-tinta/25"}`}
                style={{ width: `${p.parte * 100}%`, ["--i" as string]: indice + i }}
              />
            ) : null
          )}
        </div>
      )}
    </button>
  );
}
