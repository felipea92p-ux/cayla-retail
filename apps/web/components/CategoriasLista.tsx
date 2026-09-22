"use client";

import { useState } from "react";
import Link from "next/link";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Boton, Campo, CampoSelect, CampoTexto, SelectorMultiple } from "@/components/ui/campos";
import type { EjesPorCategoria, ValorVocabulario } from "@/lib/catalogo-v2";
import type { Familia } from "@cayla-retail/shared";
import { IconoFamilia } from "@/components/IconoFamilia";

/**
 * Las familias del negocio (Indumentaria, Calzado...), cada una con sus
 * categorías (BLU, POL, JEA…). Portado de V1 (ADR-0095) — a diferencia de
 * V1, en V2 `categorias.nombre` es único GLOBAL (no por familia): dos
 * familias no pueden tener una categoría con el mismo nombre, a propósito,
 * para no repetir el error que V1 sí permitía.
 *
 * FAMILIA YA NO ES UNA LISTA FIJA (2026-09-18, `retail.familias`). Antes
 * eran 6 valores hardcodeados en `packages/shared` (CHECK constraint en la
 * base); ahora es una tabla que un Líder edita desde `/productos/familias`
 * — el prop `familias` de este componente es esa lista (solo activas). Sin
 * proponer/aprobar como colores/tallas: agregar una familia es una decisión
 * de marca, no operativa (ver 20260918010000_familias_tabla_propia.sql).
 *
 * ALTA, EDICIÓN Y DESACTIVAR/REACTIVAR (2026-09-15). El prefijo queda fijo
 * apenas hay un producto con esa categoría (es la letra del código corto de
 * la prenda), y desactivar se bloquea si hay productos activos — el mensaje
 * con el conteo llega tal cual de `retail.desactivar_categoria`
 * (20260915160000_categorias_editar_desactivar.sql) vía `traducirError`.
 *
 * SUBCATEGORÍA OPCIONAL, UN SOLO NIVEL (2026-09-15, F3). Una categoría
 * puede tener hijas (`categoria_padre_id`) — el candado de un solo nivel y
 * la familia heredada del padre los cierra `retail.fn_valida_categoria_subcategoria`
 * (20260915224500) — esta pantalla nunca deja elegir un padre que ya sea
 * hija, ni un padre para una categoría que ya tiene hijas propias, pero el
 * candado real vive en la base, no acá.
 *
 * TALLAS/TEJIDOS/PATRONES QUE OFRECE (2026-09-17, ADR-0095).
 * `categoria_tallas`/`categoria_tejidos`/`categoria_patrones` reemplazan,
 * no amplían: una subcategoría tiene su propia lista, nunca hereda la del
 * padre. Se guarda JUNTO con el resto del formulario, un solo botón
 * ("Guardar cambios").
 *
 * REDISEÑO A TARJETAS + VISTA RÁPIDA (2026-09-17, pedido de Felipe).
 * Antes: fila de chips de texto, clic abría directo el formulario de
 * edición completo — ni colaboradores sin permiso de editar podían ver qué
 * tallas ofrecía una categoría o cuántos productos tiene. Ahora sigue la
 * misma línea visual que `ProductosGrilla` (tarjeta con ícono, elevación al
 * pasar el mouse, "Vista rápida" separada de "Editar"): un clic SIEMPRE
 * abre una vista de solo lectura (cualquier rol) con el conteo de
 * productos, subcategorías y los 3 ejes; "Editar" (solo Líder) recién ahí
 * entra al formulario de siempre, sin tocar ninguna de sus mutaciones.
 */

type Categoria = {
  id: string;
  nombre: string;
  prefijo: string | null;
  familia: Familia | null;
  activo: boolean;
  categoriaPadreId: string | null;
  notas: string | null;
};

// El nombre visible de cada familia (ej. "Accesorios y Complementos") ya no
// se hardcodea acá: viene de `retail.familias` (20260918010000) — un Líder
// la edita desde /productos/familias sin tocar código. `familias` es el
// prop con esa lista (solo activas: una familia no se puede desactivar con
// categorías activas colgando, así que siempre hay una fila para todo `f`).
type FamiliaOpcion = { codigo: string; nombre: string };

const SIN_PADRE = "__ninguna__";

type Borrador = { id: string | null; nombre: string; prefijo: string; familia: Familia; notas: string; categoriaPadreId: string | null };
const borradorVacio = (familias: FamiliaOpcion[]): Borrador => ({
  id: null,
  nombre: "",
  prefijo: "",
  familia: familias[0]?.codigo ?? "",
  notas: "",
  categoriaPadreId: null,
});

/** `tallaHabitualIds`: la curva habitual (20260918230100) — las tallas que vienen MARCADAS al crear un producto. Siempre un subconjunto de `tallaIds`. */
type EjesDraft = { tallaIds: string[]; tallaHabitualIds: string[]; tejidoIds: string[]; patronIds: string[] };
const EJES_VACIO: EjesDraft = { tallaIds: [], tallaHabitualIds: [], tejidoIds: [], patronIds: [] };

export function CategoriasLista({
  categoriasIniciales,
  puedeEditar,
  universo,
  ejesPorCategoria: ejesPorCategoriaInicial,
  familias,
  productosPorCategoria,
}: {
  categoriasIniciales: Categoria[];
  puedeEditar: boolean;
  universo: { tallas: ValorVocabulario[]; tejidos: ValorVocabulario[]; patrones: ValorVocabulario[] };
  ejesPorCategoria: EjesPorCategoria;
  familias: FamiliaOpcion[];
  productosPorCategoria: Record<string, number>;
}) {
  const etiquetaFamilia = (codigo: Familia) => familias.find((f) => f.codigo === codigo)?.nombre ?? codigo;
  const opcionesFamilia = familias.map((f) => ({ valor: f.codigo, texto: f.nombre }));
  // Cambiar las categorías es Catálogo, operación de tienda (ADR-0161): UN combo «Responsable» firma todo lo que se
  // guarda desde esta lista (arriba, para «Reactivar»; el mismo al pie del modal, para guardar, sumar subcategoría o
  // desactivar) y cada guardado exitoso lo vacía.
  const responsable = useResponsable();
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState({ nombre: "", prefijo: "" });
  const [subGuardando, setSubGuardando] = useState(false);
  // Qué categoría está en "Vista rápida" (solo lectura, cualquier rol) —
  // separado de `borrador`: un clic en la tarjeta abre esto, nunca el
  // formulario directamente. `abrirBorrador` sigue siendo el único camino
  // al formulario de edición real.
  const [viendoId, setViendoId] = useState<string | null>(null);
  // Copia local de lo que YA ofrece cada categoría — igual que `categorias`,
  // arranca del prop y se actualiza sola tras cada guardado, así reabrir el
  // modal de la misma categoría en la misma sesión muestra lo recién
  // guardado en vez de la foto del primer render.
  const [ejesPorCategoria, setEjesPorCategoria] = useState(ejesPorCategoriaInicial);
  const [ejesDraft, setEjesDraft] = useState<EjesDraft>(EJES_VACIO);

  const editando = borrador?.id !== null && borrador?.id !== undefined;
  const activas = categorias.filter((c) => c.activo);
  const desactivadas = categorias.filter((c) => !c.activo);
  const viendo = categorias.find((c) => c.id === viendoId) ?? null;

  function abrirBorrador(b: Borrador | null) {
    setViendoId(null);
    setBorrador(b);
    setSubDraft({ nombre: "", prefijo: "" });
    setEjesDraft(
      b?.id
        ? {
            tallaIds: (ejesPorCategoria.tallas[b.id] ?? []).map((v) => v.id),
            tallaHabitualIds: ejesPorCategoria.habituales[b.id] ?? [],
            tejidoIds: (ejesPorCategoria.tejidos[b.id] ?? []).map((v) => v.id),
            patronIds: (ejesPorCategoria.patrones[b.id] ?? []).map((v) => v.id),
          }
        : EJES_VACIO
    );
  }

  // Una hija "visible como raíz" cubre el caso raro de que su padre se haya
  // desactivado: sigue activa, así que tiene que aparecer en algún lado en
  // vez de perderse (principio 2 — cero estados inconsistentes).
  function esRaizVisible(c: Categoria) {
    if (!c.categoriaPadreId) return true;
    const padre = categorias.find((p) => p.id === c.categoriaPadreId);
    return !padre || !padre.activo;
  }
  const hijasDe = (padreId: string) => activas.filter((c) => c.categoriaPadreId === padreId);

  // Candidatas a "categoría padre" en el selector de alta: solo raíces
  // activas — una hija no puede a su vez ser padre (candado real en la
  // base; acá solo evitamos ofrecer una opción que la base va a rechazar).
  const raicesElegibles = activas.filter((c) => c.categoriaPadreId === null);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({
          id: borrador.id ?? undefined,
          nombre: borrador.nombre,
          familia: borrador.familia,
          prefijo: borrador.prefijo,
          notas: borrador.notas,
          categoriaPadreId: borrador.categoriaPadreId ?? undefined,
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${editando ? "editar" : "agregar"} la categoría.`);
        return;
      }
      const guardada: Categoria = {
        id: datos.categoria.id,
        nombre: datos.categoria.nombre,
        prefijo: datos.categoria.prefijo,
        familia: datos.categoria.familia ?? borrador.familia,
        activo: true,
        categoriaPadreId: datos.categoria.categoriaPadreId ?? borrador.categoriaPadreId ?? null,
        notas: datos.categoria.notas ?? (borrador.notas.trim() || null),
      };
      setCategorias((actual) => {
        const sinEsta = actual.filter((c) => c.id !== guardada.id);
        return [...sinEsta, guardada].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });

      // Tallas/tejidos/patrones se guardan en la MISMA acción — antes vivían
      // en un botón aparte dentro del mismo modal, y el botón grande de
      // abajo ("Guardar cambios", el que cualquiera espera que cierre el
      // formulario guardando todo) los descartaba en silencio mostrando
      // igual un aviso de éxito. Dos botones de guardar en el mismo modal
      // era el error de diseño, no una falta de atención de quien hacía
      // clic — se resuelve juntándolos en uno solo, no agregando una
      // advertencia encima.
      if (editando) {
        const resEjes = await fetch("/api/productos/categorias/ejes", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...responsable.encabezados() },
          body: JSON.stringify({ categoriaId: guardada.id, ...ejesDraft }),
        });
        if (!resEjes.ok) {
          const datosEjes = await resEjes.json().catch(() => null);
          avisar.error(datosEjes?.error ?? "La categoría se guardó, pero no se pudieron guardar las tallas/tejidos/patrones. Reintenta editándola de nuevo.");
          // La categoría sí quedó guardada (y el modal se cierra): reintentar es otra operación, con combo vacío.
          responsable.despues(null);
          abrirBorrador(null);
          return;
        }
        setEjesPorCategoria((actual) => ({
          tallas: { ...actual.tallas, [guardada.id]: universo.tallas.filter((v) => ejesDraft.tallaIds.includes(v.id)) },
          // La curva habitual que se acaba de guardar (actualizar_categoria_ejes).
          habituales: { ...actual.habituales, [guardada.id]: ejesDraft.tallaHabitualIds },
          tejidos: { ...actual.tejidos, [guardada.id]: universo.tejidos.filter((v) => ejesDraft.tejidoIds.includes(v.id)) },
          patrones: { ...actual.patrones, [guardada.id]: universo.patrones.filter((v) => ejesDraft.patronIds.includes(v.id)) },
        }));
      }

      responsable.despues(null);

      avisar.exito(editando ? `Categoría ${guardada.nombre} actualizada` : `Categoría ${guardada.nombre} agregada`);
      abrirBorrador(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarSubcategoria(padre: { id: string; familia: Familia }) {
    if (!subDraft.nombre.trim() || subDraft.prefijo.length !== 3) return;
    setSubGuardando(true);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({
          nombre: subDraft.nombre,
          familia: padre.familia,
          prefijo: subDraft.prefijo,
          categoriaPadreId: padre.id,
        }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? "No se pudo agregar la subcategoría.");
        return;
      }
      const nueva: Categoria = {
        id: datos.categoria.id,
        nombre: datos.categoria.nombre,
        prefijo: datos.categoria.prefijo,
        familia: datos.categoria.familia ?? padre.familia,
        activo: true,
        categoriaPadreId: datos.categoria.categoriaPadreId ?? padre.id,
        notas: null,
      };
      setCategorias((actual) => [...actual, nueva]);
      responsable.despues(null);
      avisar.exito(`Subcategoría ${nueva.nombre} agregada`);
      setSubDraft({ nombre: "", prefijo: "" });
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setSubGuardando(false);
    }
  }

  async function cambiarEstado(c: Categoria) {
    setCambiandoId(c.id);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ id: c.id, activo: !c.activo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${c.activo ? "desactivar" : "reactivar"} la categoría.`);
        return;
      }
      setCategorias((actual) => actual.map((x) => (x.id === c.id ? { ...x, activo: !c.activo } : x)));
      responsable.despues(null);
      avisar.exito(c.activo ? `${c.nombre} desactivada` : `${c.nombre} reactivada`, {
        detalle: c.activo ? "Deja de aparecer al crear productos; el historial se conserva." : "Vuelve a estar disponible para productos nuevos.",
      });
      if (c.activo) abrirBorrador(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  const hijasDeEditada = editando && borrador ? hijasDe(borrador.id!) : [];

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {desactivadas.length > 0 ? <ComboResponsable control={responsable} deshabilitado={cambiandoId !== null} hacia="abajo" className="w-full max-w-xs" /> : <span />}
          <button
            type="button"
            onClick={() => abrirBorrador(borradorVacio(familias))}
            className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Agregar categoría
          </button>
        </div>
      )}

      {familias.map(({ codigo: f }) => {
        const raicesDeLaFamilia = activas.filter((c) => c.familia === f && esRaizVisible(c));
        return (
          <section key={f} className="card-cayla p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-tinta/70">
                <IconoFamilia familia={f} className="h-[18px] w-[18px]" />
                <p className="text-sm font-medium text-tinta">{etiquetaFamilia(f)}</p>
              </div>
              <p className="text-[11px] text-tinta/65">
                {raicesDeLaFamilia.length} {raicesDeLaFamilia.length === 1 ? "categoría" : "categorías"}
              </p>
            </div>
            {raicesDeLaFamilia.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {raicesDeLaFamilia.map((c) => (
                  <TarjetaCategoria
                    key={c.id}
                    c={c}
                    productos={productosPorCategoria[c.id] ?? 0}
                    subcategorias={hijasDe(c.id).length}
                    onClick={() => setViendoId(c.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs italic text-tinta/65">Sin categorías todavía.</p>
            )}
          </section>
        );
      })}

      {viendo && (
        <VistaRapidaCategoria
          categoria={viendo}
          familia={viendo.familia}
          nombreFamilia={viendo.familia ? etiquetaFamilia(viendo.familia) : null}
          productos={productosPorCategoria[viendo.id] ?? 0}
          hijas={hijasDe(viendo.id)}
          padre={viendo.categoriaPadreId ? categorias.find((c) => c.id === viendo.categoriaPadreId) ?? null : null}
          tallas={ejesPorCategoria.tallas[viendo.id] ?? []}
          tallasHabituales={ejesPorCategoria.habituales[viendo.id] ?? []}
          tejidos={ejesPorCategoria.tejidos[viendo.id] ?? []}
          patrones={ejesPorCategoria.patrones[viendo.id] ?? []}
          puedeEditar={puedeEditar}
          onClose={() => setViendoId(null)}
          onVerHija={(id) => setViendoId(id)}
          onEditar={() =>
            abrirBorrador({
              id: viendo.id,
              nombre: viendo.nombre,
              prefijo: viendo.prefijo ?? "",
              familia: viendo.familia ?? "indumentaria",
              notas: viendo.notas ?? "",
              categoriaPadreId: viendo.categoriaPadreId,
            })
          }
        />
      )}

      {borrador && (
        <Modal
          titulo={editando ? "Editar categoría" : "Nueva categoría"}
          subtitulo={
            editando
              ? "El prefijo ya no se puede cambiar si hay productos con esta categoría."
              : "Queda disponible de inmediato en Productos."
          }
          ancho="max-w-xl"
          onClose={() => abrirBorrador(null)}
        >
          {(cerrar) => (
            <>
          <div className="mt-5 space-y-4">
            {!editando && (
              <CampoSelect
                etiqueta="Categoría padre (opcional)"
                valor={borrador.categoriaPadreId ?? SIN_PADRE}
                onValor={(v) => {
                  if (v === SIN_PADRE) {
                    setBorrador({ ...borrador, categoriaPadreId: null });
                    return;
                  }
                  const padre = raicesElegibles.find((c) => c.id === v);
                  setBorrador({ ...borrador, categoriaPadreId: v, familia: padre?.familia ?? borrador.familia });
                }}
                opciones={[
                  { valor: SIN_PADRE, texto: "— Ninguna (categoría de primer nivel) —" },
                  ...raicesElegibles.map((c) => ({ valor: c.id, texto: c.nombre })),
                ]}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
              {borrador.categoriaPadreId ? (
                <div>
                  <p className="label-cayla text-[11px] text-tinta/65">Familia</p>
                  <p className="mt-1.5 flex h-9 items-center text-sm text-tinta/65">{etiquetaFamilia(borrador.familia)} (heredada)</p>
                </div>
              ) : (
                <CampoSelect
                  etiqueta="Familia"
                  valor={borrador.familia}
                  onValor={(v) => setBorrador({ ...borrador, familia: v })}
                  opciones={opcionesFamilia}
                />
              )}
              <CampoTexto
                etiqueta="Nombre"
                value={borrador.nombre}
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                placeholder="Ej. Chalecos"
              />
              <CampoTexto
                etiqueta="Prefijo (3 letras)"
                mono
                value={borrador.prefijo}
                maxLength={3}
                onChange={(e) => setBorrador({ ...borrador, prefijo: e.target.value.toUpperCase() })}
                placeholder="CHA"
              />
            </div>

            <Campo etiqueta="Notas internas (opcional)">
              <textarea
                value={borrador.notas}
                onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })}
                rows={2}
                maxLength={2000}
                placeholder="Solo la ve el equipo — nunca la clienta."
                className="w-full resize-none rounded-md border border-tinta/15 bg-papel px-2.5 py-2 text-sm text-tinta outline-none placeholder:text-tinta/45 focus:border-rojo/50"
              />
            </Campo>
          </div>

          {editando && !borrador.categoriaPadreId && (
            <div className="mt-5 border-t border-tinta/10 pt-4">
              <p className="label-cayla text-[11px] text-tinta/65">Subcategorías</p>
              {hijasDeEditada.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {hijasDeEditada.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() =>
                        abrirBorrador({
                          id: h.id,
                          nombre: h.nombre,
                          prefijo: h.prefijo ?? "",
                          familia: h.familia ?? borrador.familia,
                          notas: h.notas ?? "",
                          categoriaPadreId: h.categoriaPadreId,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-tinta/10 bg-papel py-1 pl-1.5 pr-2.5 text-xs text-tinta hover:border-rojo/40 hover:text-rojo"
                    >
                      <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tinta/65">{h.prefijo ?? "—"}</span>
                      {h.nombre}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs italic text-tinta/65">Sin subcategorías todavía.</p>
              )}
              {puedeEditar && (
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1">
                    <CampoTexto
                      etiqueta="Nueva subcategoría"
                      value={subDraft.nombre}
                      onChange={(e) => setSubDraft({ ...subDraft, nombre: e.target.value })}
                      placeholder="Ej. Vestidos largos"
                    />
                  </div>
                  <div className="w-24">
                    <CampoTexto
                      etiqueta="Prefijo"
                      mono
                      value={subDraft.prefijo}
                      maxLength={3}
                      onChange={(e) => setSubDraft({ ...subDraft, prefijo: e.target.value.toUpperCase() })}
                      placeholder="VLA"
                    />
                  </div>
                  <Boton
                    peso="fantasma"
                    cargando={subGuardando}
                    disabled={!subDraft.nombre.trim() || subDraft.prefijo.length !== 3 || !borrador.id || !responsable.listo}
                    title={responsable.motivo ?? undefined}
                    onClick={() => guardarSubcategoria({ id: borrador.id!, familia: borrador.familia })}
                  >
                    + Agregar
                  </Boton>
                </div>
              )}
            </div>
          )}

          {editando && borrador.categoriaPadreId && (
            <p className="mt-3 text-xs text-tinta/65">
              Es subcategoría de{" "}
              <span className="font-medium text-tinta">
                {categorias.find((c) => c.id === borrador.categoriaPadreId)?.nombre ?? "una categoría"}
              </span>
              .
            </p>
          )}

          {editando && (
            <div className="mt-5 space-y-4 border-t border-tinta/10 pt-4">
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Tallas que ofrece</p>
                {universo.tallas.length > 0 ? (
                  <div className="mt-1.5">
                    <SelectorMultiple
                      opciones={universo.tallas.map((v) => ({ valor: v.id, texto: v.texto }))}
                      seleccionadas={ejesDraft.tallaIds}
                      // Quitar una talla también la saca de la curva: la habitual es siempre un subconjunto de las que ofrece.
                      onCambio={(v) => setEjesDraft({ ...ejesDraft, tallaIds: v, tallaHabitualIds: ejesDraft.tallaHabitualIds.filter((id) => v.includes(id)) })}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-tinta/65">Todavía no hay tallas aprobadas.</p>
                )}
                {ejesDraft.tallaIds.length > 0 && (
                  <div className="mt-3">
                    <p className="label-cayla text-[11px] text-tinta/65">Curva habitual</p>
                    <p className="mt-0.5 text-xs text-tinta/60">Las que vienen marcadas de antemano al crear un producto de esta categoría.</p>
                    <div className="mt-1.5">
                      <SelectorMultiple
                        opciones={universo.tallas.filter((v) => ejesDraft.tallaIds.includes(v.id)).map((v) => ({ valor: v.id, texto: v.texto }))}
                        seleccionadas={ejesDraft.tallaHabitualIds}
                        onCambio={(v) => setEjesDraft({ ...ejesDraft, tallaHabitualIds: v })}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Tejidos que ofrece</p>
                {universo.tejidos.length > 0 ? (
                  <div className="mt-1.5">
                    <SelectorMultiple
                      opciones={universo.tejidos.map((v) => ({ valor: v.id, texto: v.texto }))}
                      seleccionadas={ejesDraft.tejidoIds}
                      onCambio={(v) => setEjesDraft({ ...ejesDraft, tejidoIds: v })}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-tinta/65">Todavía no hay tejidos aprobados.</p>
                )}
              </div>
              <div>
                <p className="label-cayla text-[11px] text-tinta/65">Patrones que ofrece</p>
                {universo.patrones.length > 0 ? (
                  <div className="mt-1.5">
                    <SelectorMultiple
                      opciones={universo.patrones.map((v) => ({ valor: v.id, texto: v.texto }))}
                      seleccionadas={ejesDraft.patronIds}
                      onCambio={(v) => setEjesDraft({ ...ejesDraft, patronIds: v })}
                    />
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs italic text-tinta/65">Todavía no hay patrones aprobados.</p>
                )}
              </div>
              {puedeEditar && <p className="text-xs text-tinta/55">Se guarda junto con el resto al pulsar &ldquo;Guardar cambios&rdquo;.</p>}
            </div>
          )}

          <ComboResponsable control={responsable} deshabilitado={guardando || subGuardando || cambiandoId !== null} className="mt-5" />
          <div className="mt-5 flex items-center justify-between gap-2">
            {editando ? (
              <button
                type="button"
                onClick={() => {
                  const c = categorias.find((x) => x.id === borrador.id);
                  if (c) cambiarEstado(c);
                }}
                disabled={cambiandoId === borrador.id || !responsable.listo}
                title={responsable.motivo ?? undefined}
                className="text-xs text-rojo hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {cambiandoId === borrador.id ? "Desactivando…" : "Desactivar categoría"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Boton peso="fantasma" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton peso="primario" onClick={guardar} cargando={guardando} disabled={!borrador.nombre.trim() || borrador.prefijo.length !== 3 || !responsable.listo} title={responsable.motivo ?? undefined}>
                {editando ? "Guardar cambios" : "Guardar categoría"}
              </Boton>
            </div>
          </div>
            </>
          )}
        </Modal>
      )}

      {desactivadas.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivadas — no aparecen al crear productos nuevos</p>
          <div className="card-cayla flex flex-wrap gap-2 p-5">
            {desactivadas.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-2 rounded-lg border border-tinta/10 bg-papel py-1.5 pl-2 pr-3 text-sm text-tinta/60"
              >
                <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tinta/50">{c.prefijo ?? "—"}</span>
                {c.nombre}
                {puedeEditar && (
                  <Boton
                    peso="discreto"
                    className="px-2 py-1 text-[10.5px]"
                    cargando={cambiandoId === c.id}
                    disabled={!responsable.listo}
                    title={responsable.motivo ?? undefined}
                    onClick={() => cambiarEstado(c)}
                  >
                    Reactivar
                  </Boton>
                )}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Tarjeta de categoría — mismo gesto que `TarjetaProducto` en
 *  `ProductosGrilla.tsx` (elevación + sombra al pasar el mouse), pero sin
 *  foto: el ícono de familia hace ese trabajo. Siempre clickeable, para
 *  cualquier rol — ver qué ofrece una categoría es lectura, no requiere
 *  ser Líder (RLS de `categorias_select` ya lo permite). */
function TarjetaCategoria({
  c,
  productos,
  subcategorias,
  onClick,
}: {
  c: Categoria;
  productos: number;
  subcategorias: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-cayla group flex flex-col items-start gap-3 p-3.5 text-left transition-transform duration-260 ease-cayla hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex w-full items-center justify-between">
        <span className="rounded-md bg-sand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tinta/70">{c.prefijo ?? "—"}</span>
        <IconoFamilia familia={c.familia} className="h-5 w-5 text-tinta/30 transition-colors group-hover:text-tinta/55" />
      </div>
      <div>
        <p className="font-display text-[15px] leading-tight text-tinta">{c.nombre}</p>
        <p className="label-cayla mt-1 text-[11px] text-tinta/65">
          {subcategorias > 0 ? `${subcategorias} sub · ` : ""}
          {productos === 0 ? "sin productos" : `${productos} ${productos === 1 ? "producto" : "productos"}`}
        </p>
      </div>
    </button>
  );
}

/** La "vuelta de tuerca": clic en una tarjeta ya no cae directo al
 *  formulario. Cae acá primero — mismo molde que `VistaRapidaModal` de
 *  Productos (bloque de ícono a la izquierda, datos + acciones a la
 *  derecha) — y "Editar" recién ahí entra al formulario real. */
function VistaRapidaCategoria({
  categoria,
  familia,
  nombreFamilia,
  productos,
  hijas,
  padre,
  tallas,
  tallasHabituales,
  tejidos,
  patrones,
  puedeEditar,
  onClose,
  onVerHija,
  onEditar,
}: {
  categoria: Categoria;
  familia: Familia | null;
  /** Nombre visible de la familia, ya resuelto contra `retail.familias` por quien llama. */
  nombreFamilia: string | null;
  productos: number;
  hijas: Categoria[];
  padre: Categoria | null;
  tallas: ValorVocabulario[];
  tallasHabituales: string[];
  tejidos: ValorVocabulario[];
  patrones: ValorVocabulario[];
  puedeEditar: boolean;
  onClose: () => void;
  onVerHija: (id: string) => void;
  onEditar: () => void;
}) {
  return (
    <Modal titulo={categoria.nombre} subtitulo={familia ? (nombreFamilia ?? familia) : "Sin familia asignada"} onClose={onClose} ancho="max-w-lg">
      <div className="mt-1 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-sand/60 text-tinta/60">
            <IconoFamilia familia={familia} className="h-8 w-8" />
          </div>
          <span className="rounded-md bg-sand px-2 py-1 font-mono text-xs font-semibold text-tinta/70">{categoria.prefijo ?? "—"}</span>
        </div>

        <div className="space-y-4">
          <Link
            href={`/productos?cat=${categoria.id}`}
            className="group flex items-center justify-between rounded-lg border border-tinta/10 bg-papel px-3 py-2.5 transition-colors hover:border-rojo/40"
          >
            <span className="text-sm text-tinta">
              {productos === 0 ? "Sin productos todavía" : `${productos} ${productos === 1 ? "producto activo" : "productos activos"}`}
            </span>
            <span className="label-cayla text-[10px] text-tinta/55 group-hover:text-rojo">Ver en Productos →</span>
          </Link>

          {padre && (
            <p className="text-xs text-tinta/65">
              Subcategoría de <span className="font-medium text-tinta">{padre.nombre}</span>
            </p>
          )}

          {hijas.length > 0 && (
            <div>
              <p className="label-cayla text-[10.5px] text-tinta/55">Subcategorías</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {hijas.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onVerHija(h.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-tinta/10 bg-papel py-1 pl-1.5 pr-2.5 text-xs text-tinta hover:border-rojo/40 hover:text-rojo"
                  >
                    <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tinta/65">{h.prefijo ?? "—"}</span>
                    {h.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <GrupoEjes titulo="Tallas" valores={tallas} marcados={tallasHabituales} />
          <GrupoEjes titulo="Tejidos" valores={tejidos} />
          <GrupoEjes titulo="Patrones" valores={patrones} />

          {categoria.notas && (
            <div>
              <p className="label-cayla text-[10.5px] text-tinta/55">Notas internas</p>
              <p className="mt-1 text-xs text-tinta/70">{categoria.notas}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-tinta/10 pt-4">
        <Boton peso="fantasma" onClick={onClose}>
          Cerrar
        </Boton>
        {puedeEditar && (
          <Boton peso="primario" onClick={onEditar}>
            Editar
          </Boton>
        )}
      </div>
    </Modal>
  );
}

function GrupoEjes({ titulo, valores, marcados }: { titulo: string; valores: ValorVocabulario[]; /** Los que vienen marcados de antemano (la curva habitual). */ marcados?: string[] }) {
  if (valores.length === 0) return null;
  const hayMarcados = !!marcados && marcados.length > 0;
  return (
    <div>
      <p className="label-cayla text-[10.5px] text-tinta/55">{titulo}{hayMarcados && " · ✓ = curva habitual"}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {valores.map((v) => (
          <Chip key={v.id} tono="neutro">
            {marcados?.includes(v.id) && "✓ "}
            {v.texto}
          </Chip>
        ))}
      </div>
    </div>
  );
}
