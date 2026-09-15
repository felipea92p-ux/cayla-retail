"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, Campo, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { FAMILIAS, type Familia } from "@cayla-retail/shared";

/**
 * Las 6 familias fijas, cada una con sus categorías (BLU, POL, JEA…).
 * Portado de V1 (ADR-0035) — a diferencia de V1, en V2 `categorias.nombre`
 * es único GLOBAL (no por familia): dos familias no pueden tener una
 * categoría con el mismo nombre, a propósito, para no repetir el error que
 * V1 sí permitía.
 *
 * ALTA, EDICIÓN Y DESACTIVAR/REACTIVAR (2026-09-15). El prefijo queda fijo
 * apenas hay un producto con esa categoría (es la letra del código corto de
 * la prenda), y desactivar se bloquea si hay productos activos — el mensaje
 * con el conteo llega tal cual de `retail.desactivar_categoria`
 * (20260915160000_categorias_editar_desactivar.sql) vía `traducirError`.
 *
 * SUBCATEGORÍA OPCIONAL, UN SOLO NIVEL (2026-09-15, F3). Una categoría
 * puede tener hijas (`categoria_padre_id`) — la mayoría no las tiene y se ve
 * exactamente igual que antes (un chip suelto, sin agrupar). Cuando SÍ
 * tiene, sus hijas se dibujan en un clúster junto al chip del padre. El
 * candado de un solo nivel y la familia heredada del padre los cierra
 * `retail.fn_valida_categoria_subcategoria` (20260915224500) — esta
 * pantalla nunca deja elegir un padre que ya sea hija, ni un padre para una
 * categoría que ya tiene hijas propias, pero el candado real vive en la
 * base, no acá.
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

const ETIQUETA_FAMILIA: Record<Familia, string> = {
  indumentaria: "Indumentaria",
  calzado: "Calzado",
  accesorios: "Accesorios",
  bisuteria: "Bisutería",
  belleza: "Belleza",
  papeleria: "Papelería",
};

const OPCIONES_FAMILIA = FAMILIAS.map((f) => ({ valor: f, texto: ETIQUETA_FAMILIA[f] }));
const SIN_PADRE = "__ninguna__";

type Borrador = { id: string | null; nombre: string; prefijo: string; familia: Familia; notas: string; categoriaPadreId: string | null };
const VACIO: Borrador = { id: null, nombre: "", prefijo: "", familia: "indumentaria", notas: "", categoriaPadreId: null };

function ChipCategoria({
  c,
  onClick,
  disabled,
  chica = false,
}: {
  c: Categoria;
  onClick: () => void;
  disabled: boolean;
  chica?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border border-tinta/10 bg-papel pl-2 pr-3 text-tinta ${
        chica ? "py-1 text-xs" : "py-1.5 text-sm"
      } ${disabled ? "" : "hover:border-rojo/40 hover:text-rojo"}`}
    >
      <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tinta/65">{c.prefijo ?? "—"}</span>
      {c.nombre}
    </button>
  );
}

export function CategoriasLista({
  categoriasIniciales,
  puedeEditar,
}: {
  categoriasIniciales: Categoria[];
  puedeEditar: boolean;
}) {
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState({ nombre: "", prefijo: "" });
  const [subGuardando, setSubGuardando] = useState(false);

  const editando = borrador?.id !== null && borrador?.id !== undefined;
  const activas = categorias.filter((c) => c.activo);
  const desactivadas = categorias.filter((c) => !c.activo);

  function abrirBorrador(b: Borrador | null) {
    setBorrador(b);
    setSubDraft({ nombre: "", prefijo: "" });
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, activo: !c.activo }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${c.activo ? "desactivar" : "reactivar"} la categoría.`);
        return;
      }
      setCategorias((actual) => actual.map((x) => (x.id === c.id ? { ...x, activo: !c.activo } : x)));
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
      {FAMILIAS.map((f) => {
        const raicesDeLaFamilia = activas.filter((c) => c.familia === f && esRaizVisible(c));
        return (
          <section key={f} className="card-cayla p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-tinta">{ETIQUETA_FAMILIA[f]}</p>
              <p className="text-[11px] text-tinta/65">
                {raicesDeLaFamilia.length} {raicesDeLaFamilia.length === 1 ? "categoría" : "categorías"}
              </p>
            </div>
            {raicesDeLaFamilia.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-start gap-2">
                {raicesDeLaFamilia.map((c) => {
                  const hijas = hijasDe(c.id);
                  const chip = (
                    <ChipCategoria
                      c={c}
                      disabled={!puedeEditar}
                      onClick={() =>
                        abrirBorrador({
                          id: c.id,
                          nombre: c.nombre,
                          prefijo: c.prefijo ?? "",
                          familia: c.familia ?? f,
                          notas: c.notas ?? "",
                          categoriaPadreId: c.categoriaPadreId,
                        })
                      }
                    />
                  );
                  // Sin hijas: el chip queda exactamente como antes de esta
                  // migración (`display: contents` lo saca del layout del
                  // envoltorio, participa del wrap como si fuera el único hijo
                  // directo). Con hijas: se agrupan en un clúster visible.
                  if (hijas.length === 0) return <div key={c.id} className="contents">{chip}</div>;
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-tinta/10 bg-sand/30 p-1.5">
                      {chip}
                      {hijas.map((h) => (
                        <ChipCategoria
                          key={h.id}
                          c={h}
                          chica
                          disabled={!puedeEditar}
                          onClick={() =>
                            abrirBorrador({
                              id: h.id,
                              nombre: h.nombre,
                              prefijo: h.prefijo ?? "",
                              familia: h.familia ?? f,
                              notas: h.notas ?? "",
                              categoriaPadreId: h.categoriaPadreId,
                            })
                          }
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs italic text-tinta/65">Sin categorías todavía.</p>
            )}
          </section>
        );
      })}

      {puedeEditar && !borrador && (
        <Boton peso="fantasma" onClick={() => abrirBorrador(VACIO)} className="w-full">
          + Agregar categoría
        </Boton>
      )}

      {borrador && (
        <section className="card-cayla anim-entrada p-5">
          <p className="font-display text-lg text-tinta">{editando ? "Editar categoría" : "Nueva categoría"}</p>
          <p className="mt-1 text-xs text-tinta/65">
            {editando ? "El prefijo ya no se puede cambiar si hay productos con esta categoría." : "Queda disponible de inmediato en Productos."}
          </p>

          <div className="mt-4 space-y-4">
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
                  <p className="mt-1.5 flex h-9 items-center text-sm text-tinta/65">{ETIQUETA_FAMILIA[borrador.familia]} (heredada)</p>
                </div>
              ) : (
                <CampoSelect
                  etiqueta="Familia"
                  valor={borrador.familia}
                  onValor={(v) => setBorrador({ ...borrador, familia: v })}
                  opciones={OPCIONES_FAMILIA}
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
                    <ChipCategoria
                      key={h.id}
                      c={h}
                      chica
                      disabled={!puedeEditar}
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
                    />
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
                    disabled={!subDraft.nombre.trim() || subDraft.prefijo.length !== 3 || !borrador.id}
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

          <div className="mt-5 flex items-center justify-between gap-2">
            {editando ? (
              <button
                type="button"
                onClick={() => {
                  const c = categorias.find((x) => x.id === borrador.id);
                  if (c) cambiarEstado(c);
                }}
                disabled={cambiandoId === borrador.id}
                className="text-xs text-rojo hover:underline"
              >
                {cambiandoId === borrador.id ? "Desactivando…" : "Desactivar categoría"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Boton peso="fantasma" onClick={() => abrirBorrador(null)} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton peso="primario" onClick={guardar} cargando={guardando} disabled={!borrador.nombre.trim() || borrador.prefijo.length !== 3}>
                {editando ? "Guardar cambios" : "Guardar categoría"}
              </Boton>
            </div>
          </div>
        </section>
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
