"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Hilo } from "@/components/ui/campos";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
import { EditarMarcaModal, type MarcaEditada } from "@/components/EditarMarcaModal";
import { filtrarMarcas, type ProveedorOpcion } from "@/lib/marcas";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";

/**
 * Marcas del catálogo y sus proveedores (ADR-0109, `retail.marcas` +
 * `retail.marca_proveedores`). Sin proponer/aprobar (como Familias): solo un
 * Líder agrega, renombra o desactiva.
 *
 * Crear usa el MISMO formulario que Nuevo producto (`NuevaMarcaForm`): una sola
 * forma de crear una marca. «Editar» (Felipe, 2026-09-25) abre UNA ventana con el
 * nombre y quién la trae (`EditarMarcaModal` → `editar_marca`, todo o nada): ahí
 * se renombra, se suma un proveedor —de la lista o uno nuevo— y se quita el que se
 * puso por error, solo si ningún producto usa esa pareja. Desactivar va directo a
 * la tabla (la policy es el candado; el trigger `fn_marcas_desactivar_candado`
 * impide desactivar una marca con productos activos y su mensaje llega tal cual).
 *
 * El buscador encuentra por marca o por proveedor, sin tildes («¿qué me trae
 * Saavedra?»): con 80 marcas en tarjetas, bajar buscando una no es opción.
 *
 * Responsable (ADR-0161): editar lo pide en su ventana; desactivar y reactivar,
 * en una confirmación con el combo adentro (`ConfirmarConResponsable`). Crear usa
 * el combo propio de `NuevaMarcaForm`.
 */

export type MarcaFila = {
  id: string;
  nombre: string;
  activo: boolean;
  /** Productos activos de la marca (todas sus parejas). */
  productos: number;
  /** `productos`: los activos (lo que se muestra). `productosTotal`: también los descontinuados — mientras haya uno, la
   *  pareja no se puede quitar (la llave de `productos` la sigue citando). */
  proveedores: { id: string; nombre: string; productos: number; productosTotal: number }[];
};

type Modo = { tipo: "nueva" } | { tipo: "editar"; marca: MarcaFila };

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

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
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // con el combo adentro (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Cada guardado lo vuelve a como vino.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);

  const activas = marcas.filter((m) => m.activo);
  const desactivadas = marcas.filter((m) => !m.activo);
  const activasVisibles = filtrarMarcas(activas, busqueda);
  const desactivadasVisibles = filtrarMarcas(desactivadas, busqueda);
  const buscandoAlgo = busqueda.trim() !== "";

  function alGuardar(r: MarcaGuardada) {
    if (r.proveedorNuevo) setProveedores((prev) => [...prev, { id: r.proveedorId, nombre: r.proveedorNombre }]);
    setMarcas((prev) => {
      const existente = prev.find((m) => m.id === r.marcaId);
      const par = { id: r.proveedorId, nombre: r.proveedorNombre, productos: 0, productosTotal: 0 };
      if (existente) {
        return prev.map((m) => (m.id === r.marcaId && !m.proveedores.some((p) => p.id === r.proveedorId) ? { ...m, proveedores: [...m.proveedores, par] } : m));
      }
      return [...prev, { id: r.marcaId, nombre: r.marcaNombre, activo: true, productos: 0, proveedores: [par] }].sort(porNombre);
    });
    avisar.exito(`${r.marcaNombre} · ${r.proveedorNombre}`, { detalle: "Guardado." });
    setModo(null);
  }

  // La tarjeta pinta lo que devolvió la base (con lo que otra persona haya sumado mientras tanto), no el borrador de la
  // ventana. Los conteos de productos se conservan; un proveedor recién sumado no tiene ninguno.
  function alEditar(m: MarcaFila, r: MarcaEditada) {
    const registrados = r.proveedores.filter((p) => !m.proveedores.some((x) => x.id === p.id) && !proveedores.some((x) => x.id === p.id));
    if (registrados.length > 0) setProveedores((prev) => [...prev, ...registrados].sort(porNombre));
    setMarcas((prev) =>
      prev
        .map((x) =>
          x.id !== m.id
            ? x
            : {
                ...x,
                nombre: r.nombre,
                proveedores: r.proveedores.map((p) => {
                  const antes = x.proveedores.find((y) => y.id === p.id);
                  return { id: p.id, nombre: p.nombre, productos: antes?.productos ?? 0, productosTotal: antes?.productosTotal ?? 0 };
                }),
              }
        )
        .sort(porNombre)
    );
    avisar.exito(`${r.nombre} guardada`, { detalle: r.proveedores.map((p) => p.nombre).join(" · ") });
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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-sm text-tinta/70" aria-live="polite">
          {buscandoAlgo ? `${activasVisibles.length} de ` : ""}
          {activas.length} marca{activas.length === 1 ? "" : "s"} activa{activas.length === 1 ? "" : "s"}
        </p>
        <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search aria-hidden className="pointer-events-none absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tinta/40" />
            <input
              type="search"
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              onFocus={() => setBuscando(true)}
              onBlur={() => setBuscando(false)}
              placeholder="Marca o proveedor"
              aria-label="Buscar marca o proveedor"
              className="h-9 w-full bg-transparent pl-6 pr-6 text-sm text-tinta outline-none placeholder:text-tinta/55 [&::-webkit-search-cancel-button]:hidden"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                aria-label="Borrar búsqueda"
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-tinta/40 transition-colors hover:text-tinta"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
            <Hilo activo={buscando} />
          </div>
          {puedeEditar && (
            <Boton className="shrink-0" onClick={() => setModo({ tipo: "nueva" })}>
              + Nueva marca
            </Boton>
          )}
        </div>
      </div>

      {modo?.tipo === "nueva" && (
        <NuevaMarcaForm proveedores={proveedores} nombreExistente={(n) => marcas.find((m) => m.nombre.toLowerCase() === n.toLowerCase())?.nombre} onGuardado={alGuardar} onCancelar={() => setModo(null)} />
      )}

      {activas.length === 0 && <p className="card-cayla p-5 text-sm text-tinta/70">Todavía no hay marcas activas.</p>}

      {buscandoAlgo && activasVisibles.length + desactivadasVisibles.length === 0 && (
        <div className="card-cayla flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-tinta/75">Ninguna marca ni proveedor coincide con «{busqueda.trim()}».</p>
          <Boton peso="discreto" className="px-3 py-1.5 text-[11px]" onClick={() => setBusqueda("")}>
            Quitar búsqueda
          </Boton>
        </div>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {activasVisibles.map((m) => (
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
                    onClick={() => setModo({ tipo: "editar", marca: m })}
                    className="label-cayla text-[11px] text-tinta/60 underline underline-offset-4 hover:text-rojo"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(confirmacionCatalogo("desactivar", m.nombre, () => cambiarEstado(m)))}
                    disabled={trabajando === m.id}
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
            </div>
          </li>
        ))}
      </ul>

      {desactivadasVisibles.length > 0 && (
        <div className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/60">Desactivadas</p>
          <ul className="flex flex-wrap gap-2">
            {desactivadasVisibles.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-md border border-tinta/15 px-2.5 py-1.5 text-sm text-tinta/60">
                {m.nombre}
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => setConfirmando(confirmacionCatalogo("reactivar", m.nombre, () => cambiarEstado(m)))}
                    disabled={trabajando === m.id}
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

      {modo?.tipo === "editar" && (
        <EditarMarcaModal marca={modo.marca} proveedores={proveedores} onGuardado={(r) => alEditar(modo.marca, r)} onClose={() => setModo(null)} />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={responsable} onClose={() => setConfirmando(null)} />}
    </div>
  );
}
