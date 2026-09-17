"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { fechaCorta, type RecepcionReciente } from "@/lib/compras-reglas";

const PLANTILLA = "sm:grid-cols-[6rem_1fr_7rem]";
const PLANTILLA_DETALLE = "sm:grid-cols-[1fr_5rem]";

/**
 * Listado de recepciones ya hechas (`getRecepcionesRecientes`) — con o sin
 * factura, la misma tabla para las dos pantallas de "Recibir mercadería"
 * (2026-09-17). Antes de esto, ninguna de las dos dejaba ver qué había
 * entrado: `/compras/recibir` solo mostraba lo pendiente, y
 * `/inventario/recibir` era siempre un formulario en blanco.
 *
 * Cada fila abre un modal con el detalle (2026-09-17, a pedido de Felipe):
 * qué prenda y cuánto, no solo el total. El detalle ya viene cargado desde
 * `getRecepcionesRecientes` (mismo query, sin round-trip al abrir) — con
 * ≤30 lotes por página no vale la pena pedirlo aparte.
 */
export function RecepcionesRecientes({ recepciones, vacio }: { recepciones: RecepcionReciente[]; vacio: string }) {
  const [abierta, setAbierta] = useState<RecepcionReciente | null>(null);

  if (recepciones.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;
  }
  return (
    <>
      <Tabla>
        <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Fecha" }, { titulo: "Proveedor · guía" }, { titulo: "Unidades", alinear: "der" }]} />
        {recepciones.map((r) => (
          <button
            key={r.loteId}
            type="button"
            onClick={() => setAbierta(r)}
            className={`${fila(PLANTILLA)} w-full text-left transition-colors hover:bg-tinta/[0.03]`}
          >
            <span className={celda("izq", "text-xs tabular-nums text-tinta/65")}>{fechaCorta(r.fecha)}</span>
            <span className={celda("izq")}>
              <span className="text-sm font-medium text-tinta">
                {r.proveedorNombre}
                {r.documento ? ` · ${r.documento}` : ""}
              </span>
              <span className="block truncate text-xs text-tinta/65">
                {r.numeroGuia ? `Guía ${r.numeroGuia}` : "Sin guía"} · {r.ubicacion}
                {r.recibidoPor ? ` · ${r.recibidoPor}` : ""}
              </span>
            </span>
            <span className={celda("der", "text-sm text-tinta")}>
              {r.unidades} {r.unidades === 1 ? "unidad" : "unidades"}
              <span className="block text-xs text-tinta/55">
                {r.lineas} {r.lineas === 1 ? "línea" : "líneas"}
              </span>
            </span>
          </button>
        ))}
      </Tabla>

      {abierta && (
        <Modal
          titulo={abierta.proveedorNombre}
          subtitulo={`${fechaCorta(abierta.fecha)} · ${abierta.numeroGuia ? `Guía ${abierta.numeroGuia}` : "Sin guía"} · ${abierta.ubicacion}${
            abierta.recibidoPor ? ` · Recibido por ${abierta.recibidoPor}` : ""
          }`}
          ancho="max-w-lg"
          onClose={() => setAbierta(null)}
        >
          <div className="mt-4 space-y-4">
            <Tabla>
              <Encabezado plantilla={PLANTILLA_DETALLE} columnas={[{ titulo: "Prenda" }, { titulo: "Cantidad", alinear: "der" }]} />
              {abierta.detalle.map((l, i) => (
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

            {abierta.nota && (
              <p className="text-sm text-tinta/65">
                <span className="label-cayla text-[11px]">Nota · </span>
                {abierta.nota}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-tinta/10 pt-3">
              <p className="text-xs text-tinta/55">
                {abierta.unidades} {abierta.unidades === 1 ? "unidad" : "unidades"} en total
              </p>
              {abierta.conFactura && abierta.compraId && (
                // Cierra este modal antes de navegar: la ruta de factura abre SU
                // propio modal interceptado, y sin esto quedaban los dos apilados.
                <Link
                  href={`/compras/factura/${abierta.compraId}`}
                  onClick={() => setAbierta(null)}
                  className="label-cayla text-[11px] text-rojo hover:underline"
                >
                  Ver factura completa →
                </Link>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
