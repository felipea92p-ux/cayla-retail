"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { FilasDeMas } from "@/components/ui/VerMas";
import { matricesDeRecepcion } from "@/lib/recepcion-matriz-reglas";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { fechaCorta, type RecepcionReciente } from "@/lib/compras-reglas";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { paginar } from "@/lib/paginacion";

// La primera columna es la flecha que despliega las cantidades por color y talla (el resto de la fila abre el modal).
const PLANTILLA = "sm:grid-cols-[2rem_6rem_1fr_7rem]";
// Con la columna de costo (Ingreso sin comprobante, ADR-0111): fecha · proveedor/nota · unidades · costo.
const PLANTILLA_CON_COSTO = "sm:grid-cols-[2rem_6rem_1fr_7rem_10rem]";

/** Costo unitario promedio del lote y si falta: sin costo la prenda no cuenta en el promedio ponderado y distorsiona el margen. */
export type CostoRecepcion = { costo: number | null; sinCosto: boolean };
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
export function RecepcionesRecientes({
  recepciones,
  vacio,
  costos,
  porPagina,
}: {
  recepciones: RecepcionReciente[];
  vacio: string;
  costos?: Record<string, CostoRecepcion>;
  /** Con un número, la tabla pinta esa cantidad de filas y el resto va paginado (sin ir a la base). Sin él, todas, como siempre. */
  porPagina?: number;
}) {
  const [abierta, setAbierta] = useState<RecepcionReciente | null>(null);
  const [pagina, setPagina] = useState(1);
  const [desplegadas, setDesplegadas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) =>
    setDesplegadas((prev) => {
      const n = new Set(prev);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const actual = porPagina ? paginar(recepciones, pagina, porPagina) : null;
  const visibles = actual ? actual.filas : recepciones;
  const plantilla = costos ? PLANTILLA_CON_COSTO : PLANTILLA;

  if (recepciones.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;
  }
  return (
    <>
      <Tabla>
        <Encabezado plantilla={plantilla} columnas={[{ titulo: "" }, { titulo: "Fecha" }, { titulo: costos ? "Proveedor / nota · guía" : "Proveedor · guía" }, { titulo: "Unidades", alinear: "der" }, ...(costos ? [{ titulo: "Costo" }] : [])]} />
        {visibles.flatMap((r) => {
          const abierta_ = desplegadas.has(r.loteId);
          const panel = `recibido-${r.loteId}`;
          return [
            <div key={r.loteId} className={`${fila(plantilla)} relative cursor-pointer`}>
              {/* Lo que abre el modal: un botón que cubre la fila; la flecha y el contenido van encima (el contenido no recibe el clic). */}
              <button type="button" data-guia="recibir.reciente" onClick={() => setAbierta(r)} aria-label={`Ver el detalle de ${r.proveedorNombre || r.nota || "la recepción"}`} className="absolute inset-0 z-0 h-full w-full cursor-pointer" />
              <span className={celda("izq", "pointer-events-none relative z-10 !overflow-visible sm:-ml-2 sm:self-center")}>
                <button
                  type="button"
                  data-guia="recibir.desplegar"
                  onClick={() => alternar(r.loteId)}
                  aria-expanded={abierta_}
                  aria-controls={panel}
                  aria-label={abierta_ ? "Ocultar las cantidades por color y talla" : "Ver las cantidades por color y talla"}
                  className="pointer-events-auto absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-taupe transition-colors hover:text-tinta sm:static"
                >
                  <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abierta_ ? "rotate-90" : ""}`} />
                </button>
              </span>
              <span className={celda("izq", "pointer-events-none relative text-xs tabular-nums text-tinta/65")}>{fechaCorta(r.fecha)}</span>
              <span className={celda("izq", "pointer-events-none relative")}>
                <span className="text-sm font-medium text-tinta">
                  {r.proveedorNombre || r.nota || "Sin proveedor"}
                  {r.documento ? ` · ${r.documento}` : ""}
                </span>
                <span className="block truncate text-xs text-tinta/65">
                  {r.numeroGuia ? `Guía ${r.numeroGuia}` : "Sin guía"} · {r.ubicacion}
                  {r.recibidoPor ? ` · ${r.recibidoPor}` : ""}
                </span>
              </span>
              <span className={celda("der", "pointer-events-none relative text-sm text-tinta")}>
                {r.unidades} {r.unidades === 1 ? "unidad" : "unidades"}
                <span className="block text-xs text-tinta/55">
                  {r.lineas} {r.lineas === 1 ? "línea" : "líneas"}
                </span>
              </span>
              {costos && (
                <span className={celda("izq", "pointer-events-none relative overflow-visible")}>
                  {costos[r.loteId]?.sinCosto ? (
                    <Chip tono="ambar">Sin costo</Chip>
                  ) : costos[r.loteId]?.costo != null ? (
                    <Chip tono="verde">{`S/\u00a0${costos[r.loteId].costo!.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} c/u`}</Chip>
                  ) : (
                    <span className="text-xs text-tinta/45">—</span>
                  )}
                </span>
              )}
            </div>,
            <FilasDeMas key={`${r.loteId}-d`} id={panel} abierto={abierta_} className="!border-t-0">
              <MatricesRecibidas detalle={r.detalle} />
            </FilasDeMas>,
          ];
        })}
        {actual && actual.totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs text-taupe">
            <span>
              Mostrando {actual.desde}–{actual.hasta} de {recepciones.length}
            </span>
            <PaginacionLocal pagina={actual.pagina} totalPaginas={actual.totalPaginas} onPagina={setPagina} />
          </div>
        )}
      </Tabla>

      {abierta && (
        <Modal
          conCerrar
          titulo={abierta.proveedorNombre}
          subtitulo={`${fechaCorta(abierta.fecha)} · ${abierta.numeroGuia ? `Guía ${abierta.numeroGuia}` : "Sin guía"} · ${abierta.ubicacion}${
            abierta.recibidoPor ? ` · Recibido por ${abierta.recibidoPor}` : ""
          }`}
          tamano="mediana"
          onClose={() => setAbierta(null)}
        >
          <div data-guia="recibir.detalle" className="mt-4 space-y-4">
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
                <EnlaceVer href={`/compras/factura/${abierta.compraId}`} alNavegar={() => setAbierta(null)}>
                  Ver factura completa
                </EnlaceVer>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Lo recibido de un envío por modelo: colores en filas, tallas en columnas y su total (el desplegable de cada fila). */
function MatricesRecibidas({ detalle }: { detalle: RecepcionReciente["detalle"] }) {
  const matrices = matricesDeRecepcion(detalle);
  return (
    <div className="space-y-4 bg-hueso/40 px-5 py-4 sm:pl-[3.25rem]">
      {matrices.map((m) => (
        <div key={m.modelo} className="overflow-x-auto">
          <table /* unificar-fijo: matriz color × talla de lo recibido, como las de la ficha (las matrices de tallas quedan aparte) */ className="min-w-[18rem] text-sm tabular-nums">
            <caption className="pb-1.5 text-left text-sm font-medium text-tinta">
              {m.modelo} <span className="font-normal text-taupe">· {m.total} {m.total === 1 ? "unidad" : "unidades"}</span>
            </caption>
            <thead>
              <tr className="text-xs font-normal text-taupe">
                <th scope="col" className="py-1 pr-4 text-left font-normal">Color</th>
                {m.tallas.map((t) => (
                  <th key={t} scope="col" className="px-3 py-1 text-right font-normal">{t}</th>
                ))}
                <th scope="col" className="py-1 pl-3 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {m.colores.map((c) => (
                <tr key={c.color}>
                  <th scope="row" className="py-1.5 pr-4 text-left font-normal text-tinta">{c.color}</th>
                  {m.tallas.map((t) => (
                    <td key={t} className={`px-3 py-1.5 text-right ${c.porTalla[t] ? "text-tinta" : "text-taupe"}`}>{c.porTalla[t] ?? "—"}</td>
                  ))}
                  <td className="py-1.5 pl-3 text-right font-semibold text-tinta">{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
