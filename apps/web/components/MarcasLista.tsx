"use client";

import { useState } from "react";
import { ChevronDown, SearchX, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { NuevaMarcaForm, type MarcaGuardada } from "@/components/alta-producto/NuevaMarcaForm";
import { EditarMarcaModal, type MarcaEditada } from "@/components/EditarMarcaModal";
import { filtrarMarcas, marcasDelFiltro, resumenDeMarcas, sePuedeEliminarMarca, type FiltroMarcas, type MarcaFila, type ProveedorOpcion } from "@/lib/marcas";
import { TarjetaMarca } from "@/components/marcas/TarjetaMarca";
import { ConfirmarConResponsable } from "@/components/ConfirmarConResponsable";
import { confirmacionCatalogo, type Confirmacion } from "@/lib/confirmar-catalogo";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { Buscador } from "@/components/ui/Buscador";
import { Vacio } from "@/components/ui/Vacio";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Ayuda } from "@/components/Ayuda";
import { ResumenMarcas } from "@/components/marcas/ResumenMarcas";
import { FiltrosMarcas } from "@/components/marcas/FiltrosMarcas";

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
 * «Eliminar» (Felipe, 2026-09-26: «Cayla 2» se creó por error y desactivarla no la quitaba) aparece SOLO si ningún producto
 * —activo, descontinuado o archivado como prueba— la tiene (`sePuedeEliminarMarca`): borrarla entonces no pierde historia.
 * Una marca con productos se sigue desactivando. Va por `eliminar_marca` (20260926213000, todo o nada), no por un DELETE.
 *
 * El buscador encuentra por marca o por proveedor, sin tildes («¿qué me trae
 * Saavedra?»): con 80 marcas en tarjetas, bajar buscando una no es opción.
 *
 * Responsable (ADR-0161): editar lo pide en su ventana; desactivar y reactivar van sin él (Felipe, 2026-09-29) y
 * eliminar lo pide dentro de su confirmación (`ConfirmarConResponsable`). Crear usa
 * el combo propio de `NuevaMarcaForm`.
 */

export type { MarcaFila };

/** El «!» del título (el texto de la pantalla de siempre, con una frase adaptada: desactivar y eliminar viven en «Más»). */
const AYUDA_MARCAS = (
  <Ayuda titulo="Marcas">
    De quién es cada prenda y qué proveedores la traen. Todo producto tiene una marca y un proveedor, y el proveedor tiene que traer esa marca: la base no
    deja guardar otra pareja. Una marca puede llegar por más de un proveedor. Con «Editar» cambias el nombre y quién la trae: un proveedor se quita solo si
    ninguno de sus productos lo usa. No se puede desactivar una marca con productos activos. «Eliminar» aparece solo cuando ningún producto tiene la marca
    —tampoco uno descontinuado—: si se creó por error, primero cámbiale la marca a sus productos en Productos.
  </Ayuda>
);

type Modo = { tipo: "nueva" } | { tipo: "editar"; marca: MarcaFila };

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

export function MarcasLista({
  marcasIniciales,
  proveedores: proveedoresIniciales,
  puedeEditar,
  sede,
}: {
  marcasIniciales: MarcaFila[];
  proveedores: ProveedorOpcion[];
  puedeEditar: boolean;
  /** La sede que se mira (línea de arriba de la cabecera). */
  sede: string;
}) {
  const [marcas, setMarcas] = useState(marcasIniciales);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [modo, setModo] = useState<Modo | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // El resumen nace colapsado (Felipe, 2026-10-10: las marcas primero) y no recuerda si quedó abierto.
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroMarcas>("activas");
  // Catálogo firma cada guardado con el combo «Responsable» (ADR-0161), pero nunca arriba de la lista: va dentro de cada
  // ventana (agregar, editar, rechazar) y los botones de un clic (aprobar, desactivar, reactivar) abren una confirmación
  // (`ConfirmarConResponsable`, textos en lib/confirmar-catalogo.ts). Aprobar, rechazar, desactivar y reactivar ya no piden
  // responsable (Felipe, 2026-09-29): se firman con su clave de `responsable-omitido.ts`; agregar y editar conservan el combo.
  const responsable = useResponsable();
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);

  const activas = marcas.filter((m) => m.activo);
  const desactivadas = marcas.filter((m) => !m.activo);
  const resumen = resumenDeMarcas(marcas);
  const activasVisibles = filtrarMarcas(marcasDelFiltro(marcas, filtro), busqueda);
  const desactivadasVisibles = filtrarMarcas(desactivadas, busqueda);
  const buscandoAlgo = busqueda.trim() !== "";
  // Contra estas pregunta el formulario «¿no será una marca que ya existe?» (las mismas que ofrece Nuevo producto).
  const existentes = activas.map((m) => ({ id: m.id, nombre: m.nombre, proveedores: m.proveedores.map((p) => p.nombre) }));

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

  // Desactivar y reactivar una marca van sin responsable (Felipe, 2026-09-29); eliminar la conserva.
  async function cambiarEstado(m: MarcaFila) {
    setTrabajando(m.id);
    const { error } = await firmar(createClient().from("marcas").update({ activo: !m.activo }).eq("id", m.id), firmaOmitida("catalogo_confirmar_estado"));
    setTrabajando(null);
    if (error) return avisar.error(traducirError(error, m.activo ? "desactivar la marca" : "reactivar la marca"));
    setMarcas((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo: !x.activo } : x)));
    avisar.exito(m.activo ? `${m.nombre} desactivada` : `${m.nombre} reactivada`);
  }

  async function eliminar(m: MarcaFila) {
    if (!responsable.listo) return avisar.error(responsable.motivo ?? "Elige quién hace esta operación.");
    setTrabajando(m.id);
    const { error } = await firmar(createClient().rpc("eliminar_marca", { p_marca_id: m.id }), responsable.firma());
    setTrabajando(null);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "eliminar la marca"));
    setMarcas((prev) => prev.filter((x) => x.id !== m.id));
    avisar.exito(`${m.nombre} eliminada`);
  }

  // Tocar el filtro puesto lo suelta (vuelve a «Todas»): una cifra que filtra se apaga como se enciende.
  const alFiltrar = (f: FiltroMarcas) => setFiltro((actual) => (actual === f && f !== "activas" ? "activas" : f));

  return (
    <div className="space-y-6">
      <div>
        {/* La cabecera de Catálogo ▸ Productos (ADR-0254); la de Marcas queda igual hasta que Felipe decida otra (CLAUDE.md). */}
        <EncabezadoPagina
          sede={sede}
          titulo={
            <>
              Marcas
              {/* Letra y altura de la frase dentro del título: el globo no hereda la serif de 46 px. */}
              <span className="ml-2.5 inline-block align-middle font-sans text-[15px] leading-normal tracking-normal">{AYUDA_MARCAS}</span>
            </>
          }
          subtitulo="De quién es cada prenda y quién la trae. Todo producto lleva una marca y un proveedor que la traiga."
          acciones={
            puedeEditar && (
              <Boton peso="primario" onClick={() => setModo({ tipo: "nueva" })}>
                + Nueva marca
              </Boton>
            )
          }
        />
        <ResumenMarcas resumen={resumen} filtro={filtro} onFiltro={alFiltrar} abierto={resumenAbierto} />
      </div>

      {modo?.tipo === "nueva" && (
        <NuevaMarcaForm proveedores={proveedores} marcas={existentes} onGuardado={alGuardar} onCancelar={() => setModo(null)} />
      )}

      {/* UNA tarjeta: buscador, filtros y lista (CLAUDE.md «Paleta y orden de pantalla»). */}
      <section className="card-cayla space-y-4 p-4 sm:p-5" aria-label="Lista de marcas">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Buscador
            valor={busqueda}
            onCambio={setBusqueda}
            placeholder="Busca una marca o un proveedor"
            etiqueta="Buscar marca o proveedor"
            atajo
            className="min-w-0 flex-1 sm:max-w-[34rem]"
          />
          <p className="text-sm text-tinta/70" aria-live="polite">
            {buscandoAlgo || filtro !== "activas" ? `${activasVisibles.length} de ${resumen.activas}` : `${resumen.activas} marcas activas`}
          </p>
          <button
            type="button"
            className="btn-cayla btn-sutil ml-auto inline-flex items-center gap-1.5"
            aria-expanded={resumenAbierto}
            aria-controls="resumen-marcas"
            onClick={() => setResumenAbierto((a) => !a)}
          >
            Resumen
            <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-300 ease-cayla motion-reduce:transition-none ${resumenAbierto ? "rotate-180" : ""}`} />
          </button>
        </div>

        {!resumenAbierto && <FiltrosMarcas resumen={resumen} filtro={filtro} onFiltro={alFiltrar} />}

      {activas.length === 0 && (
        <div className="card-cayla">
          <Vacio icono={<Tag />} titulo="Todavía no hay marcas activas">
            {puedeEditar ? "Registra la primera con «+ Nueva marca»." : "Cuando se registre una marca, aparece aquí."}
          </Vacio>
        </div>
      )}

      {activas.length > 0 && !buscandoAlgo && activasVisibles.length === 0 && (
        <Vacio icono={<Tag />} titulo="Aquí no hay marcas">
          Ninguna marca cae en este filtro. Toca «Todas» para ver las demás.
        </Vacio>
      )}

      {buscandoAlgo && activasVisibles.length + desactivadasVisibles.length === 0 && (
        <Vacio
          icono={<SearchX />}
          titulo={<>Nada coincide con «{busqueda.trim()}»</>}
          acciones={
            <Boton type="button" peso="fantasma" onClick={() => setBusqueda("")}>
              Borrar la búsqueda
            </Boton>
          }
        >
          Ninguna marca ni proveedor se llama así. Prueba con otra palabra.
        </Vacio>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {activasVisibles.map((m) => (
          <TarjetaMarca
            key={m.id}
            marca={m}
            puedeEditar={puedeEditar}
            trabajando={trabajando === m.id}
            onEditar={() => setModo({ tipo: "editar", marca: m })}
            onDesactivar={() => setConfirmando(confirmacionCatalogo("desactivar", m.nombre, () => cambiarEstado(m)))}
            onEliminar={() => setConfirmando(confirmacionCatalogo("eliminar", m.nombre, () => eliminar(m)))}
          />
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
                    className="btn-cayla btn-secundario"
                  >
                    Reactivar
                  </button>
                )}
                {puedeEditar && sePuedeEliminarMarca(m.proveedores) && (
                  <button
                    type="button"
                    onClick={() => setConfirmando(confirmacionCatalogo("eliminar", m.nombre, () => eliminar(m)))}
                    disabled={trabajando === m.id}
                    className="btn-cayla btn-peligro"
                  >
                    Eliminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      </section>

      <p className="nota-cayla">
        Una marca con productos activos no se puede desactivar. «Eliminar» aparece solo si ningún producto la tuvo, tampoco uno descontinuado: así no se pierde
        historia.
      </p>

      {modo?.tipo === "editar" && (
        <EditarMarcaModal marca={modo.marca} proveedores={proveedores} onGuardado={(r) => alEditar(modo.marca, r)} onClose={() => setModo(null)} />
      )}

      {confirmando && <ConfirmarConResponsable confirmacion={confirmando} control={confirmando.verbo === "Eliminar" ? responsable : undefined} onClose={() => setConfirmando(null)} />}
    </div>
  );
}
