"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
import type { ProveedorOpcion } from "@/lib/marcas";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

/**
 * Marcas del catálogo y sus proveedores (ADR-0109, `retail.marcas` +
 * `retail.marca_proveedores`). Sin proponer/aprobar (como Familias): solo un
 * Líder agrega, renombra o desactiva.
 *
 * Crear y "sumar otro proveedor a una marca" usan el MISMO formulario que Nuevo
 * producto (`NuevaMarcaForm`): una sola forma de crear una marca. Renombrar y
 * desactivar van directo a la tabla (la policy `marcas_write_lider` es el
 * candado; el trigger `fn_marcas_desactivar_candado` impide desactivar una
 * marca con productos activos y su mensaje llega tal cual).
 *
 * Una pareja marca↔proveedor NO se quita desde aquí: la llave compuesta de
 * `productos` la protege mientras haya productos, y quitarla sin productos
 * tampoco ayuda a nadie — nunca se borra en catálogos con historial.
 *
 * Responsable (ADR-0161): renombrar y desactivar/reactivar firman con UN combo
 * de la lista (arriba, junto a «+ Nueva marca»; el mismo se repite dentro del
 * modal de renombrar). Cada guardado exitoso lo vacía. Crear usa el combo propio
 * de `NuevaMarcaForm`.
 */

export type MarcaFila = {
  id: string;
  nombre: string;
  activo: boolean;
  /** Productos activos de la marca (todas sus parejas). */
  productos: number;
  proveedores: { id: string; nombre: string; productos: number }[];
};

type Modo = { tipo: "nueva" } | { tipo: "proveedor"; marca: MarcaFila } | { tipo: "renombrar"; marca: MarcaFila };

export function MarcasLista({
  marcasIniciales,
  proveedores: proveedoresIniciales,
  puedeEditar,
}: {
  marcasIniciales: MarcaFila[];
  proveedores: ProveedorOpcion[];
  puedeEditar: boolean;
}) {
  const [marcas, setMarcas] = useState(marcasIniciales);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [modo, setModo] = useState<Modo | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const responsable = useResponsable();

  const activas = marcas.filter((m) => m.activo);
  const desactivadas = marcas.filter((m) => !m.activo);

  function alGuardar(r: MarcaGuardada) {
    if (r.proveedorNuevo) setProveedores((prev) => [...prev, { id: r.proveedorId, nombre: r.proveedorNombre }]);
    setMarcas((prev) => {
      const existente = prev.find((m) => m.id === r.marcaId);
      const par = { id: r.proveedorId, nombre: r.proveedorNombre, productos: 0 };
      if (existente) {
        return prev.map((m) => (m.id === r.marcaId && !m.proveedores.some((p) => p.id === r.proveedorId) ? { ...m, proveedores: [...m.proveedores, par] } : m));
      }
      return [...prev, { id: r.marcaId, nombre: r.marcaNombre, activo: true, productos: 0, proveedores: [par] }].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    });
    avisar.exito(`${r.marcaNombre} · ${r.proveedorNombre}`, { detalle: "Guardado." });
    setModo(null);
  }

  async function renombrar(m: MarcaFila) {
    const nombre = nombreNuevo.trim();
    if (!nombre) return avisar.error("Escribe el nombre de la marca.");
    if (!responsable.listo) return avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    setTrabajando(m.id);
    const { error } = await firmar(createClient().from("marcas").update({ nombre }).eq("id", m.id), responsable.firma());
    setTrabajando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "renombrar la marca"));
    setMarcas((prev) => prev.map((x) => (x.id === m.id ? { ...x, nombre } : x)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    avisar.exito(`Marca renombrada a ${nombre}`);
    setModo(null);
  }

  async function cambiarEstado(m: MarcaFila) {
    if (!responsable.listo) return avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    setTrabajando(m.id);
    const { error } = await firmar(createClient().from("marcas").update({ activo: !m.activo }).eq("id", m.id), responsable.firma());
    setTrabajando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, m.activo ? "desactivar la marca" : "reactivar la marca"));
    setMarcas((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo: !x.activo } : x)));
    avisar.exito(m.activo ? `${m.nombre} desactivada` : `${m.nombre} reactivada`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta/70">
          {activas.length} marca{activas.length === 1 ? "" : "s"} activa{activas.length === 1 ? "" : "s"}
        </p>
        {puedeEditar && <Boton onClick={() => setModo({ tipo: "nueva" })}>+ Nueva marca</Boton>}
      </div>

      {/* Firma renombrar y desactivar/reactivar de esta lista (ADR-0161). */}
      {puedeEditar && marcas.length > 0 && <ComboResponsable control={responsable} deshabilitado={trabajando !== null} className="max-w-sm" />}

      {modo?.tipo === "nueva" && (
        <NuevaMarcaForm proveedores={proveedores} nombreExistente={(n) => marcas.find((m) => m.nombre.toLowerCase() === n.toLowerCase())?.nombre} onGuardado={alGuardar} onCancelar={() => setModo(null)} />
      )}

      {activas.length === 0 && <p className="card-cayla p-5 text-sm text-tinta/70">Todavía no hay marcas activas.</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {activas.map((m) => (
          <li key={m.id} className="card-cayla space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-medium text-tinta">{m.nombre}</p>
                <p className="text-xs text-tinta/60">{m.productos === 0 ? "Sin productos todavía" : `${m.productos} producto${m.productos === 1 ? "" : "s"} activo${m.productos === 1 ? "" : "s"}`}</p>
              </div>
              {puedeEditar && (
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNombreNuevo(m.nombre);
                      setModo({ tipo: "renombrar", marca: m });
                    }}
                    className="label-cayla text-[11px] text-tinta/60 underline underline-offset-4 hover:text-rojo"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => void cambiarEstado(m)}
                    disabled={trabajando === m.id || !responsable.listo}
                    title={responsable.motivo ?? undefined}
                    className="label-cayla text-[11px] text-tinta/60 underline underline-offset-4 hover:text-rojo disabled:opacity-40"
                  >
                    Desactivar
                  </button>
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
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => setModo({ tipo: "proveedor", marca: m })}
                  className="label-cayla mt-2 text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo"
                >
                  + Otro proveedor para {m.nombre}
                </button>
              )}
            </div>

            {modo?.tipo === "proveedor" && modo.marca.id === m.id && (
              <NuevaMarcaForm
                proveedores={proveedores.filter((p) => !m.proveedores.some((x) => x.id === p.id))}
                nombreInicial={m.nombre}
                marcaFija
                nombreExistente={() => m.nombre}
                onGuardado={alGuardar}
                onCancelar={() => setModo(null)}
              />
            )}
          </li>
        ))}
      </ul>

      {desactivadas.length > 0 && (
        <div className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/60">Desactivadas</p>
          <ul className="flex flex-wrap gap-2">
            {desactivadas.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-md border border-tinta/15 px-2.5 py-1.5 text-sm text-tinta/60">
                {m.nombre}
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => void cambiarEstado(m)}
                    disabled={trabajando === m.id || !responsable.listo}
                    title={responsable.motivo ?? undefined}
                    className="label-cayla text-[10.5px] underline underline-offset-4 hover:text-rojo disabled:opacity-40"
                  >
                    Reactivar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {modo?.tipo === "renombrar" && (
        <Modal titulo={`Renombrar ${modo.marca.nombre}`} onClose={() => setModo(null)}>
          {(cerrar) => (
            <div className="mt-4 space-y-4">
              <CampoTexto etiqueta="Nombre de la marca" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} autoFocus />
              <p className="text-xs text-tinta/60">Cambia en todos los productos de la marca a la vez: ninguno guarda el texto, todos apuntan a la marca.</p>
              <ComboResponsable control={responsable} deshabilitado={trabajando === modo.marca.id} />
              <div className="flex gap-2">
                <Boton onClick={() => void renombrar(modo.marca)} disabled={trabajando === modo.marca.id || !responsable.listo} title={responsable.motivo ?? undefined}>
                  Guardar
                </Boton>
                <button type="button" onClick={cerrar} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
