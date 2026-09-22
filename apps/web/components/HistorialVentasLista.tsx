"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { DetalleVentaModal } from "@/components/DetalleVentaModal";
import { ESTADO_ETIQUETA, ETIQUETA_TIPO, type EstadoComprobante } from "@/lib/comprobantes-reglas";
import { soles } from "@/lib/compras-reglas";
import { etiquetaDia } from "@/lib/movimientos-reglas";
import { nombreCortoSede } from "@/lib/stock-por-sede";
import { agruparPorDia, subtituloDePrendas, titulosDePrendas, type FilaHistorial, type PrendaDeVenta } from "@/lib/ventas-historial-reglas";

// La lista de Ventas ▸ Historial (ADR-0147), con la misma línea que Cambios y Devoluciones (Atelier): un
// hilo taupe baja por la izquierda, cada día es un nudo sobre él y sus ventas cuelgan a la derecha en una
// hoja de papel. La unidad es la venta —no la prenda—: su título son los nombres de las prendas (serif, lo
// más grande), y debajo van la talla y el color, y una sola línea chica con hora, tienda, quién compró y
// quién vendió. A la derecha, el comprobante con su estado y el total con la forma de pago.
//
// Cada venta lleva por delante un racimo de miniaturas: la foto de la prenda si la hay (hoy solo el 30 % de
// lo vendido la tiene) y, si no, un mosaico del COLOR vendido — el color siempre existe. Se lee de un vistazo
// de qué colores fue la venta. Al tocar la fila se abre el detalle de siempre (`DetalleVentaModal`), que se
// lee de la base al abrir.
//
// El total de cada día viene de la serie de TODO el rango, no de las filas de esta página: un día partido
// entre dos páginas muestra el mismo total en las dos. Una venta anulada se ve apagada y tachada; sigue en
// el libro (una venta no se borra) pero no cuenta en ninguna cifra.
//
// Tres anchos, cada uno determinista, medidos sobre el ancho de LA COLUMNA (consulta de contenedor) y no sobre el de la
// ventana —con el pulso en un lateral, la columna de ventas es más angosta que la pantalla—: angosto, el racimo y el texto
// arriba y, debajo, el comprobante y el total; desde 30 rem el total arriba a la derecha (como un precio) y el comprobante en
// una segunda línea bajo el texto; y desde 54 rem cuatro columnas.
//
// La fila NO es un <button>: el botón que abre el detalle cubre la fila entera (`absolute inset-0`).

const TONO_COMPROBANTE: Record<EstadoComprobante, TonoChip> = {
  aceptado: "verde",
  enviado: "ambar",
  pendiente: "ambar",
  pendiente_reintento: "ambar",
  rechazado: "rojo",
  anulado: "apagado",
  no_emitido: "apagado",
  interna: "apagado",
};

const ventas = (n: number) => `${n.toLocaleString("es-PE")} ${n === 1 ? "venta" : "ventas"}`;

export function HistorialVentasLista({
  filas,
  hoyLima,
  totalesPorDia,
}: {
  filas: FilaHistorial[];
  hoyLima: string;
  /** Lo vendido y cuántas ventas hubo en cada día del rango completo; vacío si no se pudo calcular. */
  totalesPorDia: Record<string, { ventas: number; total: number }>;
}) {
  const [abierta, setAbierta] = useState<FilaHistorial | null>(null);
  const dias = agruparPorDia(filas);

  return (
    <>
      <div className="@container relative pl-8 sm:pl-11">
        <span aria-hidden className="hilo-vertical absolute bottom-0 left-[11px] top-1.5 w-[1.5px] bg-gradient-to-b from-taupe to-taupe/15" />
        <div className="space-y-8">
          {dias.map((dia, d) => {
            const etiqueta = etiquetaDia(dia.fecha, hoyLima);
            const delDia = totalesPorDia[dia.fecha];
            return (
              <section key={dia.fecha} aria-label={etiqueta} className="anim-sube space-y-3.5" style={{ "--i": Math.min(d + 3, 12) } as CSSProperties}>
                <h3 className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="relative text-[11.5px] font-semibold uppercase tracking-[0.16em] text-taupe-profundo">
                    <span aria-hidden className="absolute -left-7 -top-px flex h-3.5 w-3.5 items-center justify-center rounded-full bg-crema ring-[1.5px] ring-taupe sm:-left-10">
                      <span className="h-1.5 w-1.5 rounded-full bg-taupe" />
                    </span>
                    {etiqueta}
                  </span>
                  <span className="text-xs text-tinta/60">
                    {delDia && delDia.total > 0 ? (
                      <>
                        <span className="font-display text-lg tabular-nums text-tinta">{soles(delDia.total)}</span> · {ventas(delDia.ventas)}
                      </>
                    ) : (
                      ventas(dia.filas.length)
                    )}
                  </span>
                </h3>
                <div className="rounded-[20px] bg-papel ring-1 ring-tinta/[0.07]">
                  <ul className="p-1.5">
                    {dia.filas.map((v) => (
                      <FilaVenta key={v.id} v={v} onAbrir={() => setAbierta(v)} />
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {abierta && (
        <DetalleVentaModal ventaId={abierta.id} vendedor={abierta.vendedor} ubicacionNombre={abierta.ubicacion} onClose={() => setAbierta(null)} />
      )}
    </>
  );
}

function FilaVenta({ v, onAbrir }: { v: FilaHistorial; onAbrir: () => void }) {
  const apagado = v.anulada ? "text-tinta/50" : "text-tinta";
  const subtitulo = subtituloDePrendas(v.piezas, v.unidades);
  const meta = [v.hora, nombreCortoSede(v.ubicacion), v.clienta ?? "Cliente varios", v.vendedor && `Vendido por ${v.vendedor}`].filter(Boolean).join(" · ");
  return (
    <li className="group relative rounded-2xl transition-colors duration-200 hover:bg-tinta/[0.025] focus-within:bg-tinta/[0.025] [&+&]:border-t [&+&]:border-dashed [&+&]:border-tinta/10">
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Ver el detalle de la venta de las ${v.hora} en ${v.ubicacion}, ${soles(v.total)}${v.anulada ? ", anulada" : ""}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 @[30rem]:grid @[30rem]:grid-cols-[auto_minmax(0,1fr)_auto] @[30rem]:items-start @[30rem]:gap-y-2 @[30rem]:px-5 @[54rem]:grid-cols-[auto_minmax(0,1fr)_11.5rem_8.5rem] @[54rem]:items-center">
        <div className="@[30rem]:row-span-2 @[54rem]:row-span-1">
          <Racimo piezas={v.piezas} anulada={v.anulada} />
        </div>

        <div className="min-w-0 flex-1 basis-56 @[30rem]:col-start-2 @[30rem]:row-start-1 @[30rem]:basis-auto">
          <p className={`font-display line-clamp-1 text-[19px] leading-tight ${apagado}`} title={v.prendas}>
            {titulosDePrendas(v.piezas)}
          </p>
          {subtitulo && <p className={`mt-0.5 text-sm ${v.anulada ? "text-tinta/40" : "text-tinta/70"}`}>{subtitulo}</p>}
          <p className="mt-1 truncate text-xs text-tinta/55" title={meta}>
            {meta}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @[30rem]:col-span-2 @[30rem]:col-start-2 @[30rem]:row-start-2 @[54rem]:col-span-1 @[54rem]:col-start-3 @[54rem]:row-start-1 @[54rem]:flex-col @[54rem]:items-start @[54rem]:gap-1">
          {v.anulada && <Chip tono="rojo">Anulada</Chip>}
          {/* Solo aparece con el toggle «Con datos de prueba» activo (D-54, ADR-0159): sin él, esta fila
              ni siquiera llega de la base — así que no hace falta un tono de alerta, solo distinguirla. */}
          {v.esPrueba && <Chip tono="neutro">Prueba</Chip>}
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
        </div>

        <div className="ml-auto text-right @[30rem]:col-start-3 @[30rem]:row-start-1 @[30rem]:ml-0 @[54rem]:col-start-4">
          <p className={`font-display text-[22px] leading-none tabular-nums ${v.anulada ? "text-tinta/45 line-through" : "text-tinta"}`}>{soles(v.total)}</p>
          {v.pagos && <p className="mt-1 text-xs text-tinta/55">{v.pagos}</p>}
        </div>
      </div>
    </li>
  );
}

/** Hasta tres miniaturas encimadas —la primera arriba— y un «+N» si hay más: una paleta de la venta. */
function Racimo({ piezas, anulada }: { piezas: PrendaDeVenta[]; anulada: boolean }) {
  const visibles = piezas.slice(0, 3);
  const resto = piezas.length - visibles.length;
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center transition-transform duration-500 ease-[var(--ease-cayla)] group-hover:scale-105 ${anulada ? "opacity-45 saturate-50" : ""}`}
    >
      {visibles.map((p, i) => (
        <span key={i} className={`relative ${i > 0 ? "-ml-3.5" : ""}`} style={{ zIndex: visibles.length - i }}>
          <Miniatura p={p} />
        </span>
      ))}
      {resto > 0 && (
        <span className="ml-1.5 flex h-10 w-10 items-center justify-center rounded-lg bg-sand text-xs font-semibold text-tinta/70 ring-2 ring-papel">+{resto}</span>
      )}
    </span>
  );
}

/** La foto de la prenda o, sin ella, un mosaico de su color (con un filete interior para que un beige o un blanco no desaparezcan sobre el papel). */
function Miniatura({ p }: { p: PrendaDeVenta }) {
  const base = "block h-10 w-10 rounded-lg ring-2 ring-papel";
  if (p.fotoUrl) return <Image src={p.fotoUrl} alt="" width={40} height={40} unoptimized className={`${base} object-cover`} />;
  return <span className={`${base} shadow-[inset_0_0_0_1px_rgba(26,26,24,0.12)]`} style={{ background: p.colorHex ?? "var(--color-sand)" }} />;
}
