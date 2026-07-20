"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Tablero del Taller (descubrimiento 2026-07-19): produce en continuo, >100
// prendas/semana, etapas corte→confección→acabado, entrega directa a cada tienda.
// Avanzar una orden no toca stock: el stock nace recién cuando la tienda RECIBE
// el fardo (recibir_lote origen taller) — una sola fuente de verdad.

export type OrdenProduccion = {
  id: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  sku: string;
  cantidadPlaneada: number;
  cantidadProducida: number;
  estado: string;
  etapa: string | null;
  destinoCodigo: string | null;
  fechaInicio: string | null;
  nota: string | null;
};

type VarianteOpcion = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };
type Sede = { id: string; codigo: string };

const ETAPAS = ["corte", "confeccion", "acabado"] as const;
const ETIQUETA_ETAPA: Record<string, string> = { corte: "Corte", confeccion: "Confección", acabado: "Acabado" };

export function ProduccionManager({
  ordenes,
  variantes,
  tiendas,
  sedeTallerId,
}: {
  ordenes: OrdenProduccion[];
  variantes: VarianteOpcion[];
  tiendas: Sede[];
  sedeTallerId: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [varianteId, setVarianteId] = useState("");
  const [cantidad, setCantidad] = useState(10);
  const [destinoId, setDestinoId] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resultados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return variantes
      .filter((v) => `${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [variantes, q]);

  const seleccionada = variantes.find((v) => v.varianteId === varianteId);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!varianteId) { setError("Elige la prenda a producir"); return; }
    setLoading(true);
    setError(null);
    const { error } = await createClient().from("ordenes_produccion").insert({
      variante_id: varianteId,
      sede_id: sedeTallerId,
      cantidad_planeada: cantidad,
      estado: "en_proceso",
      etapa: "corte",
      destino_sede_id: destinoId || null,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      nota: nota || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setAbierto(false);
    setVarianteId(""); setQ(""); setCantidad(10); setNota("");
    router.refresh();
  }

  async function actualizar(
    id: string,
    cambios: { estado?: string; etapa?: string; cantidad_producida?: number; fecha_fin?: string }
  ) {
    const { error } = await createClient().from("ordenes_produccion").update(cambios).eq("id", id);
    if (!error) router.refresh();
  }

  const vivas = ordenes.filter((o) => o.estado === "en_proceso" || o.estado === "planeada");
  const cerradas = ordenes.filter((o) => o.estado === "completada" || o.estado === "cancelada").slice(0, 10);
  const enProceso = vivas.reduce((a, o) => a + o.cantidadPlaneada - o.cantidadProducida, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-cayla text-[9px] text-tinta/45">Prendas en producción</p>
          <p className="font-display text-2xl text-tinta">{enProceso}</p>
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
        >
          + Nueva producción
        </button>
      </div>

      {abierto && (
        <form onSubmit={crear} className="border border-tinta/10 bg-papel p-5">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="label-cayla text-[10px] text-tinta/50">Prenda a producir</label>
              {seleccionada ? (
                <div className="flex items-center justify-between border border-tinta/15 bg-crema px-3 py-2 text-sm">
                  <span className="text-tinta">
                    {seleccionada.referencia}{" "}
                    <span className="text-tinta/45">{[seleccionada.talla, seleccionada.color].filter(Boolean).join("/")}</span>
                  </span>
                  <button type="button" onClick={() => setVarianteId("")} className="label-cayla text-[9px] text-rojo">
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar por referencia, SKU, talla, color…"
                    className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                  />
                  {resultados.length > 0 && (
                    <div className="divide-y divide-tinta/5 border border-tinta/10 bg-crema">
                      {resultados.map((v) => (
                        <button
                          type="button"
                          key={v.varianteId}
                          onClick={() => { setVarianteId(v.varianteId); setQ(""); }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sand/40"
                        >
                          <span className="text-tinta">
                            {v.referencia} <span className="text-tinta/45">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                          </span>
                          <span className="font-mono text-[10px] text-tinta/35">{v.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-tinta/40">
                    ¿Modelo nuevo que aún no existe? Créalo primero en Inventario → Recibir (o pídemelo) — la
                    producción siempre apunta a una prenda del catálogo.
                  </p>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="label-cayla text-[10px] text-tinta/50">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
                  className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              </div>
              <div className="space-y-1.5">
                <label className="label-cayla text-[10px] text-tinta/50">Destino</label>
                <select
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
                >
                  <option value="">Por definir</option>
                  {tiendas.map((t) => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <label className="label-cayla text-[10px] text-tinta/50">Nota</label>
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              </div>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {loading ? "Creando…" : "Empezar producción"}
            </button>
          </div>
        </form>
      )}

      {/* Órdenes vivas */}
      <div className="space-y-3">
        {vivas.length === 0 && (
          <p className="font-display border border-tinta/10 bg-papel py-10 text-center text-base italic text-tinta/40">
            El Taller no tiene producciones en curso.
          </p>
        )}
        {vivas.map((o) => (
          <div key={o.id} className="border border-tinta/10 bg-papel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-tinta">
                  {o.referencia} <span className="text-tinta/45">{[o.talla, o.color].filter(Boolean).join("/")}</span>
                  {o.destinoCodigo && <span className="label-cayla ml-2 text-[8px] text-taupe">→ {o.destinoCodigo}</span>}
                </p>
                <p className="mt-0.5 text-xs text-tinta/45">
                  {o.fechaInicio && `Desde ${o.fechaInicio}`}{o.nota && ` · ${o.nota}`}
                </p>
              </div>
              <p className="font-display text-xl text-tinta">
                {o.cantidadProducida}<span className="text-tinta/35">/{o.cantidadPlaneada}</span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ETAPAS.map((et) => (
                <button
                  key={et}
                  onClick={() => actualizar(o.id, { etapa: et })}
                  className={`label-cayla border px-3 py-1.5 text-[9px] transition-colors ${
                    o.etapa === et ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/50 hover:border-rojo hover:text-rojo"
                  }`}
                >
                  {ETIQUETA_ETAPA[et]}
                </button>
              ))}
              <span className="mx-1 text-tinta/20">·</span>
              <input
                type="number"
                min={0}
                max={o.cantidadPlaneada}
                defaultValue={o.cantidadProducida}
                onBlur={(e) => {
                  const n = Math.min(o.cantidadPlaneada, Math.max(0, Number(e.target.value)));
                  if (n !== o.cantidadProducida) actualizar(o.id, { cantidad_producida: n });
                }}
                className="w-20 border border-tinta/20 bg-crema px-2 py-1.5 text-center text-xs text-tinta outline-none focus:border-rojo"
                title="Prendas terminadas hasta hoy"
              />
              <span className="text-xs text-tinta/40">terminadas</span>
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() =>
                    actualizar(o.id, {
                      estado: "completada",
                      cantidad_producida: o.cantidadPlaneada,
                      fecha_fin: new Date().toISOString().slice(0, 10),
                    })
                  }
                  className="label-cayla bg-tinta px-3 py-1.5 text-[9px] text-crema transition-colors hover:bg-rojo"
                >
                  Completar
                </button>
                <button
                  onClick={() => actualizar(o.id, { estado: "cancelada" })}
                  className="label-cayla text-[9px] text-tinta/40 hover:text-rojo"
                >
                  Cancelar
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Historial breve */}
      {cerradas.length > 0 && (
        <div>
          <h2 className="label-cayla mb-2 text-[10px] text-tinta/45">Últimas cerradas</h2>
          <div className="divide-y divide-tinta/5 border border-tinta/10 bg-papel">
            {cerradas.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-tinta/60">
                  {o.referencia} {[o.talla, o.color].filter(Boolean).join("/")}
                </span>
                <span className="label-cayla text-[9px] text-tinta/35">
                  {o.estado === "completada" ? `${o.cantidadProducida} hechas` : "cancelada"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
