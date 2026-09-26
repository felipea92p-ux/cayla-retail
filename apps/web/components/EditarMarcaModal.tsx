"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { ComboBuscable } from "@/components/ui/ComboBuscable";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { borradorCambia, problemaEdicionMarca, sePuedeQuitar, sinTildes, type BorradorMarca, type ProveedorOpcion } from "@/lib/marcas";
import type { MarcaFila } from "@/components/MarcasLista";

/**
 * Catálogo ▸ Marcas ▸ Editar (Felipe, 2026-09-25): el nombre y quién la trae en UNA ventana y UN guardado
 * (`editar_marca`, 20260926150000 — todo o nada).
 *
 * Nada se guarda hasta «Guardar»: lo que se quita queda tachado con «Deshacer» y lo que se suma dice «se suma», para que
 * se vea qué va a pasar antes de que pase. Un proveedor con productos no ofrece «Quitar» (la base tampoco lo deja): esos
 * productos se cambian de proveedor en Productos. Un proveedor que no existe se registra desde el mismo buscador, como en
 * «Nueva marca», y queda registrado solo si la marca se guarda.
 */

/** Lo que devuelve `editar_marca`: la marca como quedó de verdad, con lo que otra persona haya sumado mientras tanto. */
export type MarcaEditada = { nombre: string; proveedores: ProveedorOpcion[] };

export function EditarMarcaModal({
  marca,
  proveedores,
  onGuardado,
  onClose,
}: {
  marca: MarcaFila;
  /** Proveedores activos: de aquí se suman. */
  proveedores: ProveedorOpcion[];
  onGuardado: (r: MarcaEditada) => void;
  onClose: () => void;
}) {
  const [nombre, setNombre] = useState(marca.nombre);
  const [quitar, setQuitar] = useState<string[]>([]);
  const [sumar, setSumar] = useState<string[]>([]);
  const [nuevos, setNuevos] = useState<BorradorMarca["nuevos"]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const responsable = useResponsable();

  const borrador: BorradorMarca = { nombre, quitar, sumar, nuevos };
  const nombreDe = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const opciones = proveedores
    .filter((p) => !marca.proveedores.some((x) => x.id === p.id) && !sumar.includes(p.id))
    .map((p) => ({ valor: p.id, texto: p.nombre }));
  const nombreCambia = nombre.trim().replace(/\s+/g, " ") !== marca.nombre;
  const hayConProductos = marca.proveedores.some((p) => !sePuedeQuitar(p));

  // Cualquier cambio borra el error anterior: ya no describe lo que está en pantalla.
  function cambiar(fn: () => void) {
    fn();
    setError(null);
  }

  function registrarNuevo(texto: string) {
    const t = texto.trim();
    // Si ya existe con ese nombre (sin tildes ni mayúsculas), se suma ese: registrar otro sería un duplicado.
    const existente = proveedores.find((p) => sinTildes(p.nombre) === sinTildes(t));
    if (t && existente) {
      if (!marca.proveedores.some((x) => x.id === existente.id) && !sumar.includes(existente.id)) cambiar(() => setSumar((s) => [...s, existente.id]));
      return;
    }
    if (t && nuevos.some((n) => sinTildes(n.nombre) === sinTildes(t))) return;
    cambiar(() => setNuevos((n) => [...n, { nombre: t, ruc: "" }]));
  }

  async function guardar(cerrar: () => void) {
    if (guardando) return;
    if (!borradorCambia(marca.nombre, borrador)) return cerrar();
    const problema = problemaEdicionMarca(marca.proveedores, borrador);
    if (problema) return setError(problema);
    if (!responsable.listo) return setError(responsable.motivo ?? "Elige quién hace esta operación.");

    setGuardando(true);
    setError(null);
    const { data, error: errGuardar } = await firmar(
      createClient().rpc("editar_marca", {
        p_marca_id: marca.id,
        p_nombre: nombre,
        p_sumar: sumar,
        p_quitar: quitar,
        p_sumar_nuevos: nuevos.map((n) => ({ nombre: n.nombre.trim(), ruc: n.ruc.trim() || null })),
      }),
      responsable.firma()
    );
    setGuardando(false);
    responsable.despues(errGuardar);
    if (errGuardar || !data) return setError(traducirError(errGuardar, "guardar la marca"));
    onGuardado(data as MarcaEditada);
    cerrar();
  }

  const accion = "label-cayla shrink-0 text-[10.5px] text-tinta/60 underline underline-offset-4 hover:text-rojo";

  return (
    <Modal titulo="Editar marca" subtitulo={marca.nombre} onClose={onClose} ancho="max-w-lg">
      {(cerrar) => (
        <div className="mt-4 space-y-4">
          <CampoTexto
            etiqueta="Nombre de la marca"
            value={nombre}
            onChange={(e) => cambiar(() => setNombre(e.target.value))}
            disabled={guardando}
            pie={nombreCambia ? "Cambia en todos sus productos a la vez: ninguno guarda el texto, todos apuntan a la marca." : undefined}
          />

          <div>
            <p className="label-cayla text-[11px] text-tinta/65">¿Quién la trae?</p>
            <ul className="mt-1.5 divide-y divide-tinta/10 rounded-md border border-tinta/15">
              {marca.proveedores.map((p) => {
                const quitado = quitar.includes(p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className={quitado ? "text-tinta/45 line-through" : "text-tinta"}>{p.nombre}</span>
                      <span className="ml-1.5 text-xs text-tinta/50">
                        · {quitado ? "se quita al guardar" : p.productosTotal === 0 ? "sin productos" : `${p.productosTotal} producto${p.productosTotal === 1 ? "" : "s"}`}
                      </span>
                    </span>
                    {quitado ? (
                      <button type="button" onClick={() => cambiar(() => setQuitar((q) => q.filter((x) => x !== p.id)))} className={accion}>
                        Deshacer
                      </button>
                    ) : sePuedeQuitar(p) ? (
                      <button type="button" onClick={() => cambiar(() => setQuitar((q) => [...q, p.id]))} className={accion}>
                        Quitar
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-tinta/45">Con productos</span>
                    )}
                  </li>
                );
              })}

              {sumar.map((id) => (
                <li key={id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 text-tinta">
                    {nombreDe.get(id)}
                    <span className="ml-1.5 text-xs text-verde">· se suma al guardar</span>
                  </span>
                  <button type="button" onClick={() => cambiar(() => setSumar((s) => s.filter((x) => x !== id)))} className={accion}>
                    Quitar
                  </button>
                </li>
              ))}

              {nuevos.map((n, i) => (
                <li key={i} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-verde">Proveedor nuevo · se registra al guardar</span>
                    <button type="button" onClick={() => cambiar(() => setNuevos((xs) => xs.filter((_, j) => j !== i)))} className={accion}>
                      Quitar
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_9.5rem]">
                    <input
                      aria-label="Razón social o nombre del proveedor nuevo"
                      placeholder="Razón social o nombre"
                      value={n.nombre}
                      autoFocus={!n.nombre}
                      onChange={(e) => cambiar(() => setNuevos((xs) => xs.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x))))}
                      className="caja-cayla h-10 w-full px-3 text-sm text-tinta outline-none"
                    />
                    <input
                      aria-label="RUC del proveedor nuevo (opcional)"
                      placeholder="RUC (opcional)"
                      inputMode="numeric"
                      maxLength={11}
                      value={n.ruc}
                      onChange={(e) => cambiar(() => setNuevos((xs) => xs.map((x, j) => (j === i ? { ...x, ruc: e.target.value.replace(/\D/g, "") } : x))))}
                      className="caja-cayla h-10 w-full px-3 text-sm tabular-nums text-tinta outline-none"
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-2">
              {/* `key`: se vuelve a montar vacío después de cada elección, listo para sumar otro. */}
              <ComboBuscable
                key={sumar.length + nuevos.length}
                caja
                etiquetaAccesible="Sumar un proveedor a la marca"
                marcador={`Suma otro proveedor (${opciones.length} en la lista)…`}
                valor=""
                onValor={(id) => cambiar(() => setSumar((s) => [...s, id]))}
                opciones={opciones}
                limite={6}
                crear={{
                  etiqueta: (q) => (q ? `+ Registrar «${q}» como proveedor nuevo` : "+ Registrar un proveedor nuevo"),
                  onCrear: registrarNuevo,
                }}
              />
            </div>
            {hayConProductos && (
              <p className="mt-2 text-xs text-tinta/55">Un proveedor con productos no se quita aquí: cámbiales el proveedor en Productos primero.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-rojo-profundo">
              {error}
            </p>
          )}
          <ComboResponsable control={responsable} deshabilitado={guardando} />
          <div className="flex items-center gap-3">
            <Boton peso="primario" onClick={() => void guardar(cerrar)} cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
            <button type="button" onClick={cerrar} disabled={guardando} className="label-cayla text-[11px] text-tinta/60 hover:text-tinta">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
