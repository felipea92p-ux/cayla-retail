"use client";

import { ArrowRight, Check, CheckCircle2, Clock, ReceiptText } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import {
  agruparPorCompra,
  agruparPorDia,
  descripcionEntregada,
  estadoPrendaVendida,
  etiquetaDia,
  varianteLegible,
  type EstadoPrenda,
} from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";
import { codigoPrenda } from "@/lib/prenda-reglas";

export function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** El estado de una prenda vendida, siempre con palabra e ícono — nunca solo color. */
export function EstadoPrendaChip({ estado }: { estado: EstadoPrenda }) {
  const icono =
    estado.clave === "completado" ? (
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
    ) : estado.clave === "por_vencer" || estado.clave === "dentro_del_plazo" ? (
      <Clock className="h-3.5 w-3.5" aria-hidden />
    ) : null;
  return (
    <Chip tono={estado.tono} versalitas={false}>
      {icono}
      {estado.texto}
    </Chip>
  );
}

/**
 * Las compras con sus prendas, agrupadas por día (2026-09-18). La unidad es la COMPRA
 * —la clienta trae UNA boleta—, pero dentro de ella manda la prenda: su nombre es lo más
 * grande de la fila; la boleta, la hora y la vendedora van una sola vez, arriba y
 * chicas. Sin bordes entre filas: espacio y un fondo al pasar el mouse separan igual.
 */
export function CambiosVentas({
  lineas,
  ahora,
  onIniciar,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  onIniciar: (linea: LineaVentaReciente) => void;
}) {
  return (
    <div className="space-y-8">
      {agruparPorDia(lineas, ahora).map((dia) => (
        <section key={dia.etiqueta} aria-label={dia.etiqueta} className="space-y-3">
          <h3 className="text-sm font-semibold text-tinta/70">{dia.etiqueta}</h3>
          {agruparPorCompra(dia.lineas).map((compra) => (
            <TarjetaCompra key={compra.ventaId} lineas={compra.lineas} ahora={ahora} onIniciar={onIniciar} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** La línea de datos de una compra: qué comprobante y cuándo (lo que la colaboradora
 *  cruza con el papel), y después quién vendió y a quién. En celular el segundo grupo
 *  va apilado: con separadores en fila, un "·" quedaba colgando al final del renglón. */
export function MetaCompra({ compra, dia }: { compra: LineaVentaReciente; dia?: string }) {
  const detalles = [compra.vendedorNombre && `Vendido por ${compra.vendedorNombre}`, compra.clienta, compra.sedeVenta].filter(
    (d): d is string => !!d
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-tinta/70">
      <span className="flex items-center gap-2">
        {compra.comprobante ? (
          <span className="font-semibold text-tinta">{compra.comprobante}</span>
        ) : (
          <Chip tono="neutro" versalitas={false}>
            <ReceiptText className="h-3.5 w-3.5" aria-hidden />
            Sin comprobante
          </Chip>
        )}
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">
          {dia ? `${dia} ` : ""}
          {formatearHora(compra.creadoEn)}
        </span>
      </span>
      {detalles.length > 0 && (
        <span className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
          {detalles.map((d, i) => (
            <span key={d} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="hidden sm:inline">
                  ·
                </span>
              )}
              {d}
            </span>
          ))}
        </span>
      )}
      {compra.anulada && <Chip tono="apagado" versalitas={false}>Venta anulada</Chip>}
    </div>
  );
}

function TarjetaCompra({ lineas, ahora, onIniciar }: { lineas: LineaVentaReciente[]; ahora: Date; onIniciar: (l: LineaVentaReciente) => void }) {
  const compra = lineas[0]!;
  return (
    <article className="anim-revelar rounded-xl bg-papel ring-1 ring-tinta/[0.07]">
      <header className="px-5 pb-1 pt-4">
        <MetaCompra compra={compra} />
      </header>
      <ul className="px-2 pb-2">
        {lineas.map((l) => (
          <FilaPrenda key={l.ventaItemId} linea={l} ahora={ahora} onIniciar={() => onIniciar(l)} />
        ))}
      </ul>
    </article>
  );
}

function FilaPrenda({ linea, ahora, onIniciar }: { linea: LineaVentaReciente; ahora: Date; onIniciar: () => void }) {
  const estado = estadoPrendaVendida(linea, ahora);
  return (
    <li
      className={`flex flex-col gap-3 rounded-lg px-3 py-3.5 transition-colors duration-200 hover:bg-crema/70 sm:flex-row sm:items-center sm:gap-4 ${
        linea.coincideConBusqueda ? "bg-crema/80" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <MiniaturaPrenda fotoUrl={linea.fotoUrl} colorHex={linea.colorHex} tamano="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-tinta">
            {linea.referencia}
            {linea.coincideConBusqueda && <span className="sr-only"> (la prenda buscada)</span>}
          </p>
          <p className="text-sm text-tinta/75">{varianteLegible(linea)}</p>
          <p className="mt-1 text-xs text-tinta/70">
            <span className="font-mono">{codigoPrenda(linea)}</span> · {soles(linea.precioUnitario)}
            {linea.cantidad > 1 && ` · compró ${linea.cantidad}`}
          </p>
          {linea.cambiosHechos.map((c, i) => (
            <p key={i} className="mt-1 flex items-center gap-1.5 text-xs text-verde-profundo">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {linea.cantidad > 1 ? `${c.cantidad} cambiada${c.cantidad === 1 ? "" : "s"}` : "Cambiada"} por {descripcionEntregada(c, linea.productoId)} ·{" "}
              {etiquetaDia(c.creadoEn, ahora).toLowerCase()} {formatearHora(c.creadoEn)}
            </p>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pl-16 sm:flex-col sm:flex-nowrap sm:items-end sm:justify-center sm:pl-0">
        <EstadoPrendaChip estado={estado} />
        {estado.cambiable && (
          <button
            type="button"
            onClick={onIniciar}
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold text-tinta ring-1 ring-tinta/20 transition-colors duration-200 hover:bg-tinta hover:text-crema focus-visible:bg-tinta focus-visible:text-crema"
          >
            Iniciar cambio
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}
