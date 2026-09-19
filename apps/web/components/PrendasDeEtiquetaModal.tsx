"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Modal } from "@/components/ui/Modal";
import { Boton, CampoSelect, CampoTexto } from "@/components/ui/campos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { hoyLima } from "@/lib/etiqueta-vigencia";
import { prendasBajoCosto, type PrendaConCosto } from "@/lib/etiqueta-campana";
import {
  alternarProducto,
  alternarVariante,
  cambioEntre,
  estadoDe,
  filtrarProductos,
  marcarProductos,
  textoCambio,
  vistaPrevia,
  type ProductoEtiquetable,
} from "@/lib/etiquetar-prendas";

/**
 * «Prendas de una etiqueta»: elegir qué prendas llevan, por ejemplo, «Black Friday».
 * Se piensa por PRODUCTO (una casilla marca todas sus tallas y colores) con excepciones
 * por talla al desplegarlo; lo que viaja a la base son ids de variante, todo en una sola
 * llamada atómica (`etiquetar_variantes`, 20260919010000).
 *
 * Una etiqueta con descuento cambia el precio en caja (ADR-0108), así que antes de
 * guardar se muestra QUÉ va a pasar: cuántas prendas, cuánto baja, desde cuándo y, si
 * el descuento las deja por debajo de su costo, cuáles. Sin descuento se guarda directo.
 *
 * Los productos que ya entran por CATEGORÍA (regla de la campaña) aparecen marcados y
 * bloqueados: etiquetarlos a mano sería redundante.
 */

export type EtiquetaParaPrendas = {
  id: string;
  nombre: string;
  descuentoPct: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  categoriaIds: string[];
};

type Cargado = { productos: ProductoEtiquetable[]; iniciales: Set<string> };

export function PrendasDeEtiquetaModal({
  etiqueta,
  prendasConCosto,
  onClose,
  onAplicado,
}: {
  etiqueta: EtiquetaParaPrendas;
  /** Solo un Líder recibe costos; con la lista vacía simplemente no hay aviso de costo. */
  prendasConCosto: PrendaConCosto[];
  onClose: () => void;
  /** Con el conjunto final de variantes etiquetadas a mano y lo que realmente cambió. */
  onAplicado: (finales: string[], resultado: { agregadas: number; quitadas: number }) => void;
}) {
  const [carga, setCarga] = useState<{ estado: "cargando" } | { estado: "error"; mensaje: string } | ({ estado: "listo" } & Cargado)>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState("");
  const [categoriaId, setCategoriaId] = useState("todas");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const porCategoria = useMemo(() => new Set(etiqueta.categoriaIds), [etiqueta.categoriaIds]);

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCarga({ estado: "cargando" });
      const supabase = createClient();
      const { data, error } = await supabase
        .from("productos")
        .select(
          `id, referencia, descripcion, categoria_id, categoria:categorias ( nombre ),
           variantes ( id, activo, color:colores ( nombre ), talla:tallas ( valor ), variante_etiquetas ( etiqueta_id ) )`,
        )
        .eq("estado", "activo")
        .order("referencia");
      if (!vigente) return;
      if (error) {
        setCarga({ estado: "error", mensaje: traducirError(error, "cargar las prendas") });
        return;
      }
      const iniciales = new Set<string>();
      const productos: ProductoEtiquetable[] = (data ?? [])
        .map((p) => ({
          id: p.id,
          referencia: p.referencia,
          descripcion: p.descripcion,
          categoriaId: p.categoria_id,
          categoria: p.categoria?.nombre ?? "Sin categoría",
          variantes: (p.variantes ?? [])
            .filter((v) => v.activo)
            .map((v) => {
              if ((v.variante_etiquetas ?? []).some((e) => e.etiqueta_id === etiqueta.id)) iniciales.add(v.id);
              return { id: v.id, talla: v.talla?.valor ?? null, color: v.color?.nombre ?? null };
            }),
        }))
        .filter((p) => p.variantes.length > 0);
      setMarcadas(new Set(iniciales));
      setCarga({ estado: "listo", productos, iniciales });
    })();
    return () => {
      vigente = false;
    };
  }, [etiqueta.id, intento]);

  // Referencias estables: si fueran un `[]`/`new Set()` nuevo en cada render mientras carga,
  // los `useMemo` de abajo se recalcularían todo el tiempo.
  const productos = useMemo(() => (carga.estado === "listo" ? carga.productos : []), [carga]);
  const iniciales = useMemo(() => (carga.estado === "listo" ? carga.iniciales : new Set<string>()), [carga]);
  const visibles = useMemo(
    () => filtrarProductos(productos, { texto, categoriaId: categoriaId === "todas" ? null : categoriaId }),
    [productos, texto, categoriaId],
  );
  // Lo que se puede tocar: los que NO entran ya por categoría.
  const editables = visibles.filter((p) => !(p.categoriaId && porCategoria.has(p.categoriaId)));

  const opcionesCategoria = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const p of productos) if (p.categoriaId) vistas.set(p.categoriaId, p.categoria);
    return [
      { valor: "todas", texto: "Todas las categorías" },
      ...[...vistas].sort((a, b) => a[1].localeCompare(b[1], "es")).map(([valor, texto]) => ({ valor, texto })),
    ];
  }, [productos]);

  const cambio = cambioEntre(iniciales, marcadas);
  const hayCambio = cambio.agregar.length + cambio.quitar.length > 0;
  const vista = vistaPrevia(etiqueta, cambio.agregar.length, hoyLima());
  const bajoCosto = etiqueta.descuentoPct !== null && cambio.agregar.length > 0
    ? prendasBajoCosto(etiqueta.descuentoPct, prendasConCosto, new Set(), new Set(cambio.agregar))
    : [];

  async function aplicar() {
    setGuardando(true);
    try {
      const { data, error } = await createClient().rpc("etiquetar_variantes", {
        p_cambios: [{ etiqueta_id: etiqueta.id, agregar: cambio.agregar, quitar: cambio.quitar }],
      });
      if (error) {
        avisar.error(traducirError(error, "etiquetar las prendas"));
        setConfirmando(false);
        return;
      }
      const r = data as { agregadas: number; quitadas: number };
      const partes = [
        r.agregadas > 0 ? `${r.agregadas} ${r.agregadas === 1 ? "prenda etiquetada" : "prendas etiquetadas"}` : null,
        r.quitadas > 0 ? `${r.quitadas} ${r.quitadas === 1 ? "prenda liberada" : "prendas liberadas"}` : null,
      ].filter(Boolean);
      avisar.exito(`«${etiqueta.nombre}»: ${partes.join(" y ") || "sin cambios"}`);
      onAplicado([...marcadas], r);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  }

  const subtitulo =
    etiqueta.descuentoPct === null
      ? "Etiqueta informativa: no cambia ningún precio."
      : `${etiqueta.descuentoPct} % de descuento — se aplica solo en Vender a las prendas que elijas.`;

  return (
    <Modal titulo={`Prendas de «${etiqueta.nombre}»`} subtitulo={subtitulo} ancho="max-w-2xl" onClose={onClose}>
      {(cerrar) =>
        confirmando && vista ? (
          <div className="mt-5 space-y-4">
            <div className={`rounded-lg border p-4 ${vista.sinEfectoHoy ? "border-tinta/15 bg-tinta/[0.03]" : "border-ambar/40 bg-ambar/10"}`}>
              <p className="text-sm font-medium text-tinta">{vista.titulo}</p>
              <p className="mt-1 text-sm text-tinta/75">{vista.detalle}</p>
              {bajoCosto.length > 0 && (
                <p className="mt-2 text-sm text-ambar">
                  Por debajo del costo: {bajoCosto.length} {bajoCosto.length === 1 ? "prenda" : "prendas"}
                  {bajoCosto.length <= 3 ? ` (${bajoCosto.map((b) => b.nombre).join(", ")})` : ""}.
                </p>
              )}
              {cambio.quitar.length > 0 && <p className="mt-2 text-xs text-tinta/65">Además liberarás {cambio.quitar.length} {cambio.quitar.length === 1 ? "prenda" : "prendas"}.</p>}
            </div>
            <div className="flex gap-2">
              <Boton peso="fantasma" className="flex-1" onClick={() => setConfirmando(false)} disabled={guardando}>
                Volver
              </Boton>
              <Boton peso="primario" className="flex-1" onClick={aplicar} cargando={guardando}>
                Sí, aplicar
              </Boton>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <CampoTexto etiqueta="Buscar" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Referencia, nombre o categoría" autoComplete="off" />
              <CampoSelect etiqueta="Categoría" valor={categoriaId} onValor={setCategoriaId} opciones={opcionesCategoria} />
            </div>

            {carga.estado === "cargando" && <p className="py-10 text-center text-sm text-tinta/60">Cargando prendas…</p>}
            {carga.estado === "error" && (
              <div className="space-y-3 py-8 text-center">
                <p className="text-sm text-tinta/75">{carga.mensaje}</p>
                <Boton peso="discreto" onClick={() => setIntento((n) => n + 1)}>
                  Reintentar
                </Boton>
              </div>
            )}

            {carga.estado === "listo" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tinta/65">
                  <span className="tabular-nums">
                    {visibles.length} {visibles.length === 1 ? "producto" : "productos"} · {marcadas.size} {marcadas.size === 1 ? "prenda marcada" : "prendas marcadas"}
                  </span>
                  <span className="flex gap-3">
                    <button type="button" disabled={editables.length === 0} onClick={() => setMarcadas(marcarProductos(editables, marcadas, true))} className="label-cayla text-[10px] text-tinta/75 underline-offset-4 hover:text-tinta hover:underline disabled:opacity-40">
                      Marcar visibles
                    </button>
                    <button type="button" disabled={editables.length === 0} onClick={() => setMarcadas(marcarProductos(editables, marcadas, false))} className="label-cayla text-[10px] text-tinta/75 underline-offset-4 hover:text-tinta hover:underline disabled:opacity-40">
                      Soltar visibles
                    </button>
                  </span>
                </div>

                {visibles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-tinta/60">Ningún producto coincide con ese filtro.</p>
                ) : (
                  <ul className="max-h-[42vh] divide-y divide-tinta/10 overflow-y-auto rounded-lg border border-tinta/10">
                    {visibles.map((p) => {
                      const heredada = !!p.categoriaId && porCategoria.has(p.categoriaId);
                      const estado = heredada ? "todas" : estadoDe(p, marcadas);
                      const abierto = abiertos.has(p.id);
                      const n = p.variantes.filter((v) => marcadas.has(v.id)).length;
                      return (
                        <li key={p.id}>
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <Casilla
                              estado={estado}
                              disabled={heredada || guardando}
                              etiqueta={`${p.referencia}: marcar todas las prendas`}
                              onChange={() => setMarcadas(alternarProducto(p, marcadas))}
                            />
                            <button
                              type="button"
                              aria-expanded={abierto}
                              onClick={() => setAbiertos((a) => { const s = new Set(a); if (!s.delete(p.id)) s.add(p.id); return s; })}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-tinta">
                                  <span className="font-mono text-xs text-tinta/65">{p.referencia}</span> {p.descripcion}
                                </span>
                                <span className="block text-[11px] text-tinta/55">{p.categoria}</span>
                              </span>
                              {heredada ? (
                                <span className="label-cayla shrink-0 rounded-full bg-tinta/5 px-2 py-0.5 text-[9px] text-tinta/65">Por categoría</span>
                              ) : (
                                <span className="shrink-0 text-[11px] tabular-nums text-tinta/60">
                                  {n}/{p.variantes.length}
                                </span>
                              )}
                              <ChevronRight className={`h-4 w-4 shrink-0 text-tinta/40 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
                            </button>
                          </div>
                          {abierto && (
                            <ul className="space-y-1 bg-tinta/[0.02] px-3 pb-3 pl-11">
                              {p.variantes.map((v) => (
                                <li key={v.id}>
                                  <label className={`flex items-center gap-2.5 py-1 text-sm ${heredada ? "text-tinta/50" : "cursor-pointer text-tinta/80"}`}>
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-tinta"
                                      checked={heredada || marcadas.has(v.id)}
                                      disabled={heredada || guardando}
                                      onChange={() => setMarcadas(alternarVariante(v.id, marcadas))}
                                    />
                                    {[v.talla, v.color].filter(Boolean).join(" · ") || "Única"}
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {porCategoria.size > 0 && (
                  <p className="text-xs text-tinta/60">Los productos «Por categoría» ya reciben esta etiqueta por la regla de la campaña; no hace falta marcarlos.</p>
                )}
              </>
            )}

            <div className="space-y-3 border-t border-tinta/10 pt-4">
              <p className="text-sm text-tinta/75" aria-live="polite">{textoCambio(cambio, productos)}</p>
              <div className="flex gap-2">
                <Boton peso="fantasma" className="flex-1" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton
                  peso="primario"
                  className="flex-1"
                  disabled={!hayCambio || carga.estado !== "listo"}
                  cargando={guardando}
                  onClick={() => (vista ? setConfirmando(true) : aplicar())}
                >
                  {vista ? "Revisar y aplicar" : "Aplicar"}
                </Boton>
              </div>
            </div>
          </div>
        )
      }
    </Modal>
  );
}

/** Casilla con estado «a medias» (el atributo `indeterminate` solo existe por script). */
function Casilla({ estado, disabled, etiqueta, onChange }: { estado: "todas" | "algunas" | "ninguna"; disabled: boolean; etiqueta: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "algunas";
  }, [estado]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={etiqueta}
      className="h-4 w-4 shrink-0 accent-tinta"
      checked={estado === "todas"}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
