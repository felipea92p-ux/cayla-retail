"use client";

import { sePuedeEliminarMarca, textoProductosMarca, type MarcaFila } from "@/lib/marcas";

/**
 * La tarjeta de una marca en Catálogo ▸ Marcas: nombre, cuántos productos tiene, quién la trae y sus acciones.
 *
 * Sale de `MarcasLista` sin cambiar cómo se ve (ADR-0372, actividad 1): primero se vuelve fácil el cambio, después se cambia
 * (Beck). La tarjeta no decide nada de negocio: avisa con `onEditar`, `onDesactivar` y `onEliminar`, y la lista decide qué
 * confirma y qué firma.
 */
export function TarjetaMarca({
  marca: m,
  puedeEditar,
  trabajando,
  onEditar,
  onDesactivar,
  onEliminar,
}: {
  marca: MarcaFila;
  puedeEditar: boolean;
  /** Hay un guardado de esta marca en curso: sus botones se apagan. */
  trabajando: boolean;
  onEditar: () => void;
  onDesactivar: () => void;
  onEliminar: () => void;
}) {
  return (
    <li className="card-cayla space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <p className="text-base font-medium text-tinta">{m.nombre}</p>
          <p className="text-xs text-tinta/60">{textoProductosMarca(m.productos, m.proveedores.reduce((n, p) => n + p.productosTotal, 0))}</p>
        </div>
        {puedeEditar && (
          <div className="flex shrink-0 gap-3">
            <button type="button" onClick={onEditar} className="label-cayla text-[11px] text-tinta/60 underline underline-offset-4 hover:text-rojo">
              Editar
            </button>
            <button type="button" onClick={onDesactivar} disabled={trabajando} className="btn-cayla btn-peligro">
              Desactivar
            </button>
            {sePuedeEliminarMarca(m.proveedores) && (
              <button type="button" onClick={onEliminar} disabled={trabajando} className="btn-cayla btn-peligro">
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="label-cayla text-[10.5px] text-tinta/55">La trae</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {m.proveedores.map((p) => (
            <li key={p.id} className="rounded-md border border-tinta/15 px-2 py-1 text-xs text-tinta/80">
              {p.nombre}
              <span className="ml-1.5 text-tinta/45">· {p.productos} prod.</span>
            </li>
          ))}
          {m.proveedores.length === 0 && <li className="text-xs text-rojo-profundo">Sin proveedor: no se puede usar en un producto.</li>}
        </ul>
      </div>
    </li>
  );
}
