"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { diaMes, hoyLima } from "@/lib/fechas-lima";
import type { LineaRecepcion } from "@/lib/compras-reglas";
import type { RecepcionDeCompra } from "@/lib/compras-indicadores";
import { agruparPorEnvio, type EnvioDeLote, type GrupoRecepcion } from "@/lib/envio-reglas";

// Pestaña «Recibidas recientemente» (maqueta 06): qué llegó contra cada comprobante, con su
// resultado (completa o cuánto faltó) y la demora entre la emisión y la llegada. Antes esta
// pestaña era una lista fija de las últimas 15 guías con solo fecha, proveedor y unidades: no
// decía si la entrega llegó completa ni cuánto tardó — justo lo que sirve para decidir con qué
// proveedor conviene volver a pedir.
//
// Una guía que cubre dos comprobantes aparece dos veces (una fila por comprobante). El detalle
// (prenda por prenda) sale de `getRecepcionesRecientes` y viaja ya cargado: con ≤ 30 filas no
// vale la pena un viaje al abrir el modal.
//
// ENVÍOS (ADR-0113): las filas de un mismo envío de VARIOS proveedores —una sola guía— se agrupan bajo una
// cabecera («Envío de 3 proveedores · Guía …») en vez de salir como filas sueltas. La cabecera suma lo que llegó y
// lo que faltó; si la lista cortó el envío (el tope de filas), no pinta totales de una parte. Las recepciones de
// antes de los envíos y las de un solo proveedor siguen como filas normales.

// Fecha · Proveedor·comprobante·guía · Llegó/facturado · Resultado · Demora · Recibió · flecha
const PLANTILLA = "sm:grid-cols-[6rem_1fr_9.5rem_5.75rem_7.5rem_6.25rem_1rem]";
const PLANTILLA_DETALLE = "sm:grid-cols-[1fr_5rem]";

export function RecepcionesCompraLista({
  recepciones,
  detalles,
  nombres,
  vacio,
  enlaceAlComprobante = true,
  envios,
  limite,
}: {
  recepciones: RecepcionDeCompra[];
  /** Prenda por prenda de cada guía, por `loteId` (puede faltar para las más antiguas). */
  detalles: Record<string, LineaRecepcion[]>;
  /** Quién recibió, por `loteId` (ya resuelto a nombre). */
  nombres: Record<string, string>;
  vacio: string;
  /** El detalle del comprobante es de Compras (solo líder): quien cuenta sin ser líder no lo ve, y un enlace que lo devuelve al Inicio no sirve. */
  enlaceAlComprobante?: boolean;
  /** A qué envío pertenece cada lote (por `loteId`). Sin esto —o sin lotes de envíos— la lista sale como siempre. */
  envios?: Record<string, EnvioDeLote>;
  /** El tope de filas con que se pidió la lista: si se llenó, el último envío puede estar cortado. */
  limite?: number;
}) {
  const [abierta, setAbierta] = useState<RecepcionDeCompra | null>(null);

  if (recepciones.length === 0) return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;

  const grupos = agruparPorEnvio(recepciones, envios ?? {}, { llegoAlLimite: limite != null && recepciones.length >= limite });

  function filaRecepcion(r: RecepcionDeCompra, dentroDeEnvio: boolean) {
    const completa = r.faltante <= 0;
    return (
      <button
        key={`${r.loteId}-${r.compraId}`}
        type="button"
        onClick={() => setAbierta(r)}
        className={`${fila(PLANTILLA)} group w-full text-left transition-colors hover:bg-tinta/[0.03] ${dentroDeEnvio ? "border-l-2 border-tinta/15" : ""}`}
      >
        <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(hoyLima(new Date(r.fechaRecepcion)))}</span>
        <span className={celda("izq")}>
          <span className="text-sm text-tinta">
            {r.proveedorNombre} <span className="ml-1 text-xs tabular-nums text-tinta/65">{r.documento}</span>
          </span>
          <span className="block truncate text-xs text-tinta/55">
            Guía {r.numeroGuia ?? "—"} · {r.ubicacionNombre}
          </span>
        </span>
        <span className={celda("der", "text-sm text-tinta")}>
          {r.unidadesLlegaron} / {r.unidadesFacturadas}
        </span>
        <span className={celda("izq", "overflow-visible")}>
          <Chip tono={completa ? "verde" : "ambar"}>{completa ? "Completa" : `Faltan ${r.faltante}`}</Chip>
        </span>
        <span className={celda("der", "text-sm text-tinta")}>{r.diasDemora === 1 ? "1 día" : `${r.diasDemora} días`}</span>
        <span className={celda("izq", "text-sm text-tinta/65")}>{nombres[r.loteId] ?? "—"}</span>
        <span aria-hidden className="hidden text-right text-base leading-none text-tinta/30 transition-colors group-hover:text-rojo sm:block">
          ›
        </span>
      </button>
    );
  }

  function cabeceraEnvio(g: Extract<GrupoRecepcion, { tipo: "envio" }>) {
    const completo = g.faltante <= 0;
    return (
      <div key={`envio-${g.envioId}`} className={`${fila(PLANTILLA)} bg-tinta/[0.035]`}>
        <span className={celda("izq", "text-sm tabular-nums text-tinta")}>{diaMes(hoyLima(new Date(g.fechaRecepcion)))}</span>
        <span className={celda("izq")}>
          <span className="text-sm font-medium text-tinta">Envío de {g.proveedores} proveedores</span>
          <span className="block truncate text-xs text-tinta/55">
            Guía {g.numeroGuia ?? "—"} · {g.ubicacionNombre}
            {g.parcial ? " · esta lista muestra solo una parte" : ""}
          </span>
        </span>
        <span className={celda("der", "text-sm text-tinta")}>{g.parcial ? "" : `${g.unidadesLlegaron} / ${g.unidadesFacturadas}`}</span>
        <span className={celda("izq", "overflow-visible")}>{g.parcial ? null : <Chip tono={completo ? "verde" : "ambar"}>{completo ? "Completo" : `Faltan ${g.faltante}`}</Chip>}</span>
        <span aria-hidden className={celda("der")} />
        <span className={celda("izq", "text-sm text-tinta/65")}>{nombres[g.filas[0].loteId] ?? "—"}</span>
        <span aria-hidden className="hidden sm:block" />
      </div>
    );
  }

  return (
    <>
      <Tabla>
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[
            { titulo: "Fecha" },
            { titulo: "Proveedor · comprobante · guía" },
            { titulo: "Llegó / facturado", alinear: "der" },
            { titulo: "Resultado" },
            { titulo: "Demora", alinear: "der" },
            { titulo: "Recibió" },
            { titulo: "" },
          ]}
        />
        {grupos.map((g) =>
          g.tipo === "suelta" ? (
            filaRecepcion(g.fila, false)
          ) : (
            <Fragment key={`envio-${g.envioId}`}>
              {cabeceraEnvio(g)}
              {g.filas.map((r) => filaRecepcion(r, true))}
            </Fragment>
          )
        )}
      </Tabla>

      {abierta && (
        <Modal
          titulo={abierta.proveedorNombre}
          subtitulo={`${diaMes(hoyLima(new Date(abierta.fechaRecepcion)))} · ${abierta.numeroGuia ? `Guía ${abierta.numeroGuia}` : "Sin guía"} · ${abierta.ubicacionNombre}${
            nombres[abierta.loteId] ? ` · Recibido por ${nombres[abierta.loteId]}` : ""
          }`}
          ancho="max-w-lg"
          onClose={() => setAbierta(null)}
        >
          <div className="mt-4 space-y-4">
            {(detalles[abierta.loteId] ?? []).length > 0 ? (
              <Tabla>
                <Encabezado plantilla={PLANTILLA_DETALLE} columnas={[{ titulo: "Prenda" }, { titulo: "Cantidad", alinear: "der" }]} />
                {(detalles[abierta.loteId] ?? []).map((l, i) => (
                  <div key={i} className={fila(PLANTILLA_DETALLE)}>
                    <span className={celda("izq", "text-sm text-tinta")}>
                      {l.referencia}
                      {l.sku ? ` · ${l.sku}` : ""}
                      <span className="block truncate text-xs text-tinta/65">{[l.talla, l.color].filter(Boolean).join("/") || "—"}</span>
                    </span>
                    <span className={celda("der", "text-sm tabular-nums text-tinta")}>{l.cantidad}</span>
                  </div>
                ))}
              </Tabla>
            ) : (
              <p className="text-sm text-tinta/65">El detalle prenda por prenda de esta guía ya no está en la lista reciente. Ábrelo desde el comprobante.</p>
            )}
            <div className="flex items-center justify-between border-t border-tinta/10 pt-3">
              <p className="text-xs text-tinta/55">
                {abierta.unidadesLlegaron} de {abierta.unidadesFacturadas} unidades del comprobante {abierta.documento}
              </p>
              {/* Cierra este modal antes de navegar: la ruta de comprobante abre SU propio modal interceptado, y sin esto quedaban los dos apilados. */}
              {enlaceAlComprobante && (
                <Link href={`/compras/factura/${abierta.compraId}`} onClick={() => setAbierta(null)} className="label-cayla text-[11px] text-rojo hover:underline">
                  Ver comprobante completo →
                </Link>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
