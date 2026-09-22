"use client";

import { useState } from "react";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";

/**
 * Familias del negocio (Indumentaria, Calzado, Accesorios y Complementos...).
 *
 * A diferencia de Colores/Tallas/Tejidos/Patrones/Etiquetas: SIN proponer/
 * aprobar. Agregar una familia es una decisión de marca (la última vez,
 * ADR-0096, exigió investigar cómo la nombran Zara/H&M/Hermès antes de
 * decidir) — no algo que se resuelve con un clic al catalogar una prenda.
 * Solo un Líder la agrega/edita/desactiva, mismo patrón que Categorías
 * (`retail.familias`, 20260918010000_familias_tabla_propia.sql).
 *
 * El código (`codigo`, ej. 'indumentaria') nunca se edita acá — lo autogenera
 * la base desde el nombre al crearla, y es lo que `categorias.familia`
 * referencia como FK. Desactivar se bloquea en la base si alguna categoría
 * activa todavía la usa (fn_familias_desactivar_candado); el mensaje llega
 * tal cual vía `traducirError`.
 */

export type Familia = {
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  categoriasActivas: number;
};

type Borrador = { codigo: string | null; nombre: string };

export function FamiliasLista({
  familiasIniciales,
  puedeEditar,
}: {
  familiasIniciales: Familia[];
  puedeEditar: boolean;
}) {
  // Cambiar las familias es Catálogo, operación de tienda (ADR-0161): UN combo «Responsable» firma todo lo que se
  // guarda desde esta lista (arriba; el mismo se repite en el modal) y cada guardado exitoso lo vacía.
  const responsable = useResponsable();
  const [familias, setFamilias] = useState(familiasIniciales);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoCodigo, setCambiandoCodigo] = useState<string | null>(null);

  const editando = borrador?.codigo !== null && borrador?.codigo !== undefined;
  const activas = familias.filter((f) => f.activo).sort((a, b) => a.orden - b.orden);
  const desactivadas = familias.filter((f) => !f.activo);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/productos/familias", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ codigo: borrador.codigo ?? undefined, nombre: borrador.nombre }),
      });
      const datos = await res.json();
      if (!res.ok) {
        avisar.error(datos.error ?? `No se pudo ${editando ? "editar" : "agregar"} la familia.`);
        return;
      }
      const guardada: Familia = {
        codigo: datos.familia.codigo,
        nombre: datos.familia.nombre,
        activo: datos.familia.activo,
        orden: datos.familia.orden,
        categoriasActivas: editando ? (familias.find((f) => f.codigo === datos.familia.codigo)?.categoriasActivas ?? 0) : 0,
      };
      setFamilias((actual) => [...actual.filter((f) => f.codigo !== guardada.codigo), guardada]);
      setBorrador(null);
      responsable.despues(null);
      avisar.exito(editando ? "Familia editada." : "Familia agregada — ya está disponible en Categorías.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(f: Familia) {
    setCambiandoCodigo(f.codigo);
    try {
      const res = await fetch("/api/productos/familias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...responsable.encabezados() },
        body: JSON.stringify({ codigo: f.codigo, activo: !f.activo }),
      });
      const datos = await res.json().catch(() => null);
      if (!res.ok) {
        avisar.error(datos?.error ?? `No se pudo ${f.activo ? "desactivar" : "reactivar"} la familia.`);
        return;
      }
      setFamilias((actual) => actual.map((x) => (x.codigo === f.codigo ? { ...x, activo: !f.activo } : x)));
      responsable.despues(null);
    } finally {
      setCambiandoCodigo(null);
    }
  }

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ComboResponsable control={responsable} deshabilitado={cambiandoCodigo !== null} hacia="abajo" className="w-full max-w-xs" />
          <button
            type="button"
            onClick={() => setBorrador({ codigo: null, nombre: "" })}
            className="label-cayla rounded-md bg-tinta px-4 py-3 text-[11px] text-crema transition-colors hover:bg-rojo"
          >
            + Agregar familia
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activas.map((f) => (
          <div key={f.codigo} className="card-cayla flex items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-medium text-tinta">{f.nombre}</p>
              <p className="mt-0.5 text-[11px] text-tinta/65">
                {f.categoriasActivas} {f.categoriasActivas === 1 ? "categoría" : "categorías"}
              </p>
            </div>
            {puedeEditar && (
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Boton peso="discreto" className="px-2.5 py-1.5 text-[10.5px]" onClick={() => setBorrador({ codigo: f.codigo, nombre: f.nombre })}>
                  Editar
                </Boton>
                <Boton
                  peso="discreto"
                  className="px-2.5 py-1.5 text-[10.5px] text-rojo/70 hover:text-rojo"
                  cargando={cambiandoCodigo === f.codigo}
                  disabled={!responsable.listo}
                  title={responsable.motivo ?? undefined}
                  onClick={() => cambiarEstado(f)}
                >
                  Desactivar
                </Boton>
              </div>
            )}
          </div>
        ))}
      </div>

      {borrador && (
        <Modal
          titulo={editando ? "Editar familia" : "Nueva familia"}
          subtitulo={
            editando
              ? "El código interno no cambia — solo lo que ve la persona."
              : "Queda disponible de inmediato al crear o editar una categoría."
          }
          onClose={() => setBorrador(null)}
        >
          {(cerrar) => (
            <>
              <div className="mt-5 space-y-4">
                <CampoTexto
                  etiqueta="Nombre"
                  value={borrador.nombre}
                  onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                  placeholder="Ej. Hogar y Decoración"
                  autoFocus
                />
              </div>
              <ComboResponsable control={responsable} deshabilitado={guardando} className="mt-5" />
              <div className="mt-6 flex justify-end gap-2">
                <Boton peso="fantasma" onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  cargando={guardando}
                  disabled={!borrador.nombre.trim() || !responsable.listo}
                  title={responsable.motivo ?? undefined}
                  onClick={async () => {
                    await guardar();
                    cerrar();
                  }}
                >
                  {editando ? "Guardar cambios" : "Agregar familia"}
                </Boton>
              </div>
            </>
          )}
        </Modal>
      )}

      {desactivadas.length > 0 && (
        <section className="space-y-2">
          <p className="label-cayla text-[11px] text-tinta/65">Desactivadas — no aparecen al elegir familia en Categorías</p>
          <div className="card-cayla flex flex-wrap gap-2 p-5">
            {desactivadas.map((f) => (
              <span
                key={f.codigo}
                className="flex items-center gap-2 rounded-lg border border-tinta/10 bg-papel py-1.5 pl-3 pr-3 text-sm text-tinta/60"
              >
                {f.nombre}
                {puedeEditar && (
                  <Boton
                    peso="discreto"
                    className="px-2 py-1 text-[10.5px]"
                    cargando={cambiandoCodigo === f.codigo}
                    disabled={!responsable.listo}
                    title={responsable.motivo ?? undefined}
                    onClick={() => cambiarEstado(f)}
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
