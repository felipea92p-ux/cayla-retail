"use client";

import { useState } from "react";
import { Tabla, fila } from "@/components/ui/Tabla";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
import { ESTADO_ETIQUETA, ETIQUETA_TIPO, type EstadoComprobante } from "@/lib/comprobantes-reglas";
import { soles } from "@/lib/compras-reglas";
import { etiquetaDia } from "@/lib/movimientos-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { agruparPorDia, type FilaHistorial } from "@/lib/ventas-historial-reglas";

// La lista de Ventas ▸ Historial, agrupada por día de Lima (ADR-0144). Una fila por venta —no por
// prenda— con lo que se viene a buscar: cuándo y dónde, qué se llevó (y a quién y quién lo vendió),
// si tiene boleta o factura, y cuánto fue y cómo se pagó. Al tocarla se abre el detalle de siempre
// (`DetalleVentaModal`: prendas, pagos, vuelto y reimpresión del comprobante), que se lee de la base
// al abrir — la fila no carga más de lo que dibuja.
//
// La fila NO es un <button>: el botón que abre el detalle cubre la fila entera (`absolute inset-0`),
// igual que en Movimientos. Una venta anulada se ve tachada y apagada: sigue en el libro (una venta
// no se borra) pero no cuenta en los totales de la pantalla.
//
// Columnas desde `lg` (1024 px): con el lateral abierto el contenido útil mide ~650 px a esa
// anchura, y seis columnas pedían 860 — la tabla se desbordaba con scroll lateral en tablet y en
// laptops chicas. Son cuatro, con dos líneas cada una (quién compró/vendió bajo las prendas; la
// forma de pago bajo el total). Por debajo de `lg` la fila se apila como una tarjeta: nada se oculta.
const PLANTILLA = "lg:grid-cols-[5.5rem_minmax(11rem,1fr)_10.5rem_8rem]";

const TONO_COMPROBANTE: Record<EstadoComprobante, TonoChip> = {
  aceptado: "verde",
  enviado: "ambar",
  pendiente: "ambar",
  rechazado: "rojo",
  anulado: "apagado",
  no_emitido: "apagado",
};

const TITULO = "label-cayla text-[11px] text-tinta/55";

export function HistorialVentasLista({ filas, hoyLima }: { filas: FilaHistorial[]; hoyLima: string }) {
  const [abierta, setAbierta] = useState<FilaHistorial | null>(null);
  const dias = agruparPorDia(filas);

  return (
    <>
      <Tabla>
        <div className={`hidden gap-x-4 px-5 py-2 lg:grid ${PLANTILLA}`} role="row">
          <span className={TITULO} role="columnheader">
            Hora
          </span>
          <span className={TITULO} role="columnheader">
            Prendas · clienta · vendedor
          </span>
          <span className={TITULO} role="columnheader">
            Comprobante
          </span>
          <span className={`${TITULO} text-right`} role="columnheader">
            Total · pago
          </span>
        </div>
        {dias.map((dia) => (
          <div key={dia.fecha} className="divide-y divide-tinta/10">
            <div className="flex items-baseline justify-between bg-tinta/[0.03] px-5 py-1.5">
              <span className="label-cayla text-[11px] text-tinta">{etiquetaDia(dia.fecha, hoyLima)}</span>
              <span className="text-xs text-tinta/55">
                {dia.filas.length} {dia.filas.length === 1 ? "venta" : "ventas"}
              </span>
            </div>
            {dia.filas.map((v) => (
              <FilaVenta key={v.id} v={v} onAbrir={() => setAbierta(v)} />
            ))}
          </div>
        ))}
      </Tabla>

      {abierta && (
        <DetalleVentaModal ventaId={abierta.id} vendedor={abierta.vendedor} ubicacionNombre={abierta.ubicacion} onClose={() => setAbierta(null)} />
      )}
    </>
  );
}

function FilaVenta({ v, onAbrir }: { v: FilaHistorial; onAbrir: () => void }) {
  const apagado = v.anulada ? "text-tinta/50" : "text-tinta";
  const quien = [v.clienta ?? "Cliente varios", v.vendedor].filter(Boolean).join(" · ");
  return (
    <div className={fila(PLANTILLA, "relative transition-colors hover:bg-tinta/[0.03] focus-within:bg-tinta/[0.03] lg:items-start")}>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver el detalle de la venta de las ${v.hora} en ${v.ubicacion}, ${soles(v.total)}${v.anulada ? ", anulada" : ""}`}
        className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
      />

      <span className="flex min-w-0 items-baseline gap-2 lg:block">
        <span className={`font-display text-base tabular-nums ${apagado}`}>{v.hora}</span>
        <span className="label-cayla block truncate text-[10px] text-tinta/55" title={v.ubicacion}>
          {nombreCortoSede(v.ubicacion)}
        </span>
      </span>

      <span className="min-w-0">
        {/* Sin `block`: `line-clamp-2` ya fija su propio `display` y `block` lo pisaba (se veían 3 líneas). */}
        <span className={`line-clamp-2 break-words text-sm leading-snug ${apagado}`} title={v.prendas}>
          {v.prendas || "—"}
        </span>
        <span className="mt-0.5 block truncate text-xs text-tinta/55" title={quien}>
          {quien}
        </span>
      </span>

      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {v.anulada && <Chip tono="rojo">Anulada</Chip>}
        {v.comprobante ? (
          <>
            <span className={`text-xs font-medium ${apagado}`}>
              {ETIQUETA_TIPO[v.comprobante.tipo]} {v.comprobante.numero}
            </span>
            {!v.anulada && <Chip tono={TONO_COMPROBANTE[v.comprobante.estado]}>{ESTADO_ETIQUETA[v.comprobante.estado]}</Chip>}
          </>
        ) : (
          !v.anulada && <Chip tono="ambar">Sin comprobante</Chip>
        )}
      </span>

      {/* En pantalla ancha el pago va en la segunda línea, bajo el total; apilada, junto a él. */}
      <span className="flex flex-wrap items-baseline gap-x-2 lg:block lg:text-right">
        <span className={`whitespace-nowrap text-sm tabular-nums lg:block ${v.anulada ? "text-tinta/45 line-through" : "font-medium text-tinta"}`}>
          {soles(v.total)}
        </span>
        {v.pagos && <span className="text-xs text-tinta/55 lg:block">{v.pagos}</span>}
      </span>
    </div>
  );
}
