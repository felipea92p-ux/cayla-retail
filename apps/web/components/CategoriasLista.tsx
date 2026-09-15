"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
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
 */

type Categoria = { id: string; nombre: string; prefijo: string | null; familia: Familia | null; activo: boolean };

const ETIQUETA_FAMILIA: Record<Familia, string> = {
  indumentaria: "Indumentaria",
  calzado: "Calzado",
  accesorios: "Accesorios",
  bisuteria: "Bisutería",
  belleza: "Belleza",
  papeleria: "Papelería",
};

const OPCIONES_FAMILIA = FAMILIAS.map((f) => ({ valor: f, texto: ETIQUETA_FAMILIA[f] }));

type Borrador = { id: string | null; nombre: string; prefijo: string; familia: Familia };
const VACIO: Borrador = { id: null, nombre: "", prefijo: "", familia: "indumentaria" };

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

  const editando = borrador?.id !== null && borrador?.id !== undefined;
  const activas = categorias.filter((c) => c.activo);
  const desactivadas = categorias.filter((c) => !c.activo);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/categorias", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: borrador.id ?? undefined, nombre: borrador.nombre, familia: borrador.familia, prefijo: borrador.prefijo }),
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
      };
      setCategorias((actual) => {
        const sinEsta = actual.filter((c) => c.id !== guardada.id);
        return [...sinEsta, guardada].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
      avisar.exito(editando ? `Categoría ${guardada.nombre} actualizada` : `Categoría ${guardada.nombre} agregada`);
      setBorrador(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
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
      if (c.activo) setBorrador(null);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <div className="space-y-3">
      {FAMILIAS.map((f) => {
        const deLaFamilia = activas.filter((c) => c.familia === f);
        return (
          <section key={f} className="card-cayla p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-tinta">{ETIQUETA_FAMILIA[f]}</p>
              <p className="text-[11px] text-tinta/65">
                {deLaFamilia.length} {deLaFamilia.length === 1 ? "categoría" : "categorías"}
              </p>
            </div>
            {deLaFamilia.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {deLaFamilia.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!puedeEditar}
                    onClick={() => setBorrador({ id: c.id, nombre: c.nombre, prefijo: c.prefijo ?? "", familia: c.familia ?? f })}
                    className={`flex items-center gap-2 rounded-lg border border-tinta/10 bg-papel py-1.5 pl-2 pr-3 text-sm text-tinta ${
                      puedeEditar ? "hover:border-rojo/40 hover:text-rojo" : ""
                    }`}
                  >
                    <span className="rounded bg-sand px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-tinta/65">
                      {c.prefijo ?? "—"}
                    </span>
                    {c.nombre}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs italic text-tinta/65">Sin categorías todavía.</p>
            )}
          </section>
        );
      })}

      {puedeEditar && !borrador && (
        <Boton peso="fantasma" onClick={() => setBorrador(VACIO)} className="w-full">
          + Agregar categoría
        </Boton>
      )}

      {borrador && (
        <section className="card-cayla anim-entrada p-5">
          <p className="font-display text-lg text-tinta">{editando ? "Editar categoría" : "Nueva categoría"}</p>
          <p className="mt-1 text-xs text-tinta/65">
            {editando ? "El prefijo ya no se puede cambiar si hay productos con esta categoría." : "Queda disponible de inmediato en Productos."}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
            <CampoSelect
              etiqueta="Familia"
              valor={borrador.familia}
              onValor={(v) => setBorrador({ ...borrador, familia: v })}
              opciones={OPCIONES_FAMILIA}
            />
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
              <Boton peso="fantasma" onClick={() => setBorrador(null)} disabled={guardando}>
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
