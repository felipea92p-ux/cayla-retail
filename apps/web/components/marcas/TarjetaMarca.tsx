"use client";

import type { CSSProperties } from "react";
import { Resaltado } from "@/components/ui/Resaltado";
import { MenuAcciones, type ItemMenu } from "@/components/ui/MenuAcciones";
import { estadoDeMarca, monogramaDeMarca, sePuedeEliminarMarca, textoEstadoMarca, type EstadoMarca, type MarcaFila } from "@/lib/marcas";

/** El cuadrito de la marca. Su color DICE EL ESTADO (no decora): verde = la usamos, hueso = nadie la ha usado, ámbar = no se puede
 *  usar (sin proveedor), punteado = desactivada. Solo tokens: es estado, no color de una prenda. */
const CLASE_MONOGRAMA: Record<EstadoMarca, string> = {
  con: "bg-verde/15 text-verde-profundo",
  sin: "bg-hueso text-taupe",
  "sin-proveedor": "bg-ambar/15 text-ambar-profundo",
  desactivada: "border border-dashed border-tinta/30 text-taupe",
};
const CLASE_FRASE: Record<EstadoMarca, string> = {
  con: "text-verde-profundo",
  sin: "text-tinta/70",
  "sin-proveedor": "font-medium text-ambar-profundo",
  desactivada: "text-tinta/70",
};

/**
 * La tarjeta de una marca en Catálogo ▸ Marcas (ADR-0373): el estado se ve sin leer (monograma de color), el nombre manda, la
 * cifra de productos es un dato de apoyo (compacta, Felipe 2026-10-10) y lo peligroso vive en «Más ▾» —con el motivo a la vista
 * cuando no se puede— en vez de dos botones rojos por tarjeta (con 89 marcas eran 178: el rojo vale máximo 2 por pantalla).
 *
 * La tarjeta no decide nada de negocio: avisa con `onEditar`, `onDesactivar`, `onReactivar` y `onEliminar`, y la lista decide
 * qué confirma y qué firma. Los candados reales siguen siendo `fn_marcas_desactivar_candado` y `eliminar_marca`: el motivo
 * solo avisa antes de ir a la base, con datos que la pantalla ya tiene.
 */
export function TarjetaMarca({
  marca: m,
  puedeEditar,
  trabajando,
  busqueda = "",
  indice = 0,
  destello = false,
  saliendo = false,
  onEditar,
  onDesactivar,
  onReactivar,
  onEliminar,
}: {
  marca: MarcaFila;
  puedeEditar: boolean;
  /** Hay un guardado de esta marca en curso: sus botones se apagan. */
  trabajando: boolean;
  /** Lo que se escribió en el buscador: se marca donde coincide. */
  busqueda?: string;
  /** Su lugar en la página: las primeras doce entran escalonadas. */
  indice?: number;
  /** Acaba de guardarse o de elegirse: destella una vez. */
  destello?: boolean;
  /** La base ya dijo que sí a desactivarla o eliminarla: se encoge antes de salir de la lista. */
  saliendo?: boolean;
  onEditar: () => void;
  onDesactivar: () => void;
  onReactivar: () => void;
  onEliminar: () => void;
}) {
  const estado = estadoDeMarca(m);
  const puedeEliminar = sePuedeEliminarMarca(m.proveedores);
  const items: ItemMenu[] = [];
  if (estado !== "desactivada") {
    items.push({
      clave: "desactivar",
      etiqueta: "Desactivar",
      peligro: true,
      onSelect: onDesactivar,
      motivo: m.productos > 0 ? `Tiene ${m.productos} producto${m.productos === 1 ? "" : "s"} activo${m.productos === 1 ? "" : "s"}: primero cámbialos de marca` : undefined,
    });
  }
  items.push({
    clave: "eliminar",
    etiqueta: "Eliminar",
    peligro: true,
    onSelect: onEliminar,
    motivo: puedeEliminar ? undefined : "Un producto la tuvo, aunque esté descontinuado",
  });

  return (
    <li
      className={`marca-entra rounded-2xl border border-sand bg-crema p-3.5 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-tinta/30 hover:bg-papel motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${destello ? "marca-destello" : ""} ${saliendo ? "marca-sale" : ""}`}
      style={{ "--i": Math.min(indice, 11) } as CSSProperties}
      data-marca={m.id}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className={`font-display grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-lg font-semibold ${CLASE_MONOGRAMA[estado]}`}>
          {monogramaDeMarca(m.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-xl leading-tight text-tinta [overflow-wrap:anywhere]">
              <Resaltado texto={m.nombre} busqueda={busqueda} />
            </p>
            <p className="mt-0.5 shrink-0 whitespace-nowrap" aria-label={`${m.productos} productos activos`}>
              <b className={`font-display text-lg font-semibold tabular-nums ${m.productos === 0 ? "text-taupe" : "text-tinta"}`}>{m.productos}</b>
              <span className="ml-1 text-xs text-tinta/65">{m.productos === 1 ? "producto" : "productos"}</span>
            </p>
          </div>
          <p className={`text-[12.5px] ${CLASE_FRASE[estado]}`}>{textoEstadoMarca(m)}</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-1.5">
          {m.proveedores.length > 0 && <span className="label-cayla mr-0.5 text-[10px] text-tinta/65">La trae</span>}
          {m.proveedores.map((p) => (
            // Una línea siempre: un nombre largo se corta con «…» (el nombre entero va en el título) en vez de doblarse dentro de la
            // píldora y volverla un óvalo de cinco renglones en una tarjeta angosta.
            <span key={p.id} title={`${p.nombre} · ${p.productos} productos`} className="inline-flex min-w-0 max-w-full items-baseline rounded-full border border-tinta/25 bg-papel px-2.5 py-0.5 text-[12.5px] text-tinta/80">
              <span className="min-w-0 truncate">
                <Resaltado texto={p.nombre} busqueda={busqueda} />
              </span>
              <span className="ml-1.5 shrink-0 text-taupe">· {p.productos} prod.</span>
            </span>
          ))}
        </div>
        {puedeEditar && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {estado === "desactivada" ? (
              <button type="button" onClick={onReactivar} disabled={trabajando} className="btn-cayla btn-secundario">
                Reactivar
              </button>
            ) : (
              <button type="button" onClick={onEditar} className={`btn-cayla ${estado === "sin-proveedor" ? "btn-primario" : "btn-secundario"}`}>
                {estado === "sin-proveedor" ? "Agregar proveedor" : "Editar"}
              </button>
            )}
            {(estado !== "desactivada" || puedeEliminar) && <MenuAcciones etiqueta={`Más acciones de ${m.nombre}`} texto="Más" items={estado === "desactivada" ? items.filter((i) => i.clave === "eliminar") : items} deshabilitado={trabajando} />}
          </div>
        )}
      </div>
    </li>
  );
}
