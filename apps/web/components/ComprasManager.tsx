"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Órdenes de compra (F2): registrar el pedido al proveedor ANTES de que llegue.
// El ciclo se cierra solo: al recibir el lote ligado, la orden pasa a "recibida".

export type OrdenCompra = {
  id: string;
  proveedor: string;
  estado: string;
  sedeCodigo: string;
  fecha: string;
  fechaEstimada: string | null;
  montoEstimado: number | null;
  nota: string | null;
};

type Sede = { id: string; codigo: string };
type Proveedor = { id: string; nombre: string };

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

function money(n: number) {
  return "S/" + n.toFixed(2);
}

export function ComprasManager({
  ordenes,
  sedes,
  proveedores,
  esLider,
}: {
  ordenes: OrdenCompra[];
  sedes: Sede[];
  proveedores: Proveedor[];
  esLider: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [proveedorId, setProveedorId] = useState("");
  const [proveedorTexto, setProveedorTexto] = useState("");
  const [sedeId, setSedeId] = useState(sedes[0]?.id ?? "");
  const [monto, setMonto] = useState(0);
  const [fechaEstimada, setFechaEstimada] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const nombreProveedor = proveedorId
      ? proveedores.find((p) => p.id === proveedorId)?.nombre ?? proveedorTexto
      : proveedorTexto.trim();
    if (!nombreProveedor) {
      setError("Elige o escribe el proveedor");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await createClient().from("ordenes_compra").insert({
      proveedor: nombreProveedor,
      proveedor_id: proveedorId || null,
      sede_destino_id: sedeId,
      monto_estimado: monto > 0 ? monto : null,
      fecha_estimada: fechaEstimada || null,
      nota: nota || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setAbierto(false);
    setProveedorId(""); setProveedorTexto(""); setMonto(0); setFechaEstimada(""); setNota("");
    router.refresh();
  }

  async function cancelar(id: string) {
    const { error } = await createClient().from("ordenes_compra").update({ estado: "cancelada" }).eq("id", id);
    if (!error) router.refresh();
  }

  const comprometido = ordenes
    .filter((o) => o.estado === "pendiente" || o.estado === "confirmada")
    .reduce((a, o) => a + (o.montoEstimado ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-cayla text-[9px] text-tinta/45">Dinero comprometido en camino</p>
          <p className="font-display text-2xl text-tinta">{money(comprometido)}</p>
        </div>
        {esLider && (
          <button
            onClick={() => setAbierto((v) => !v)}
            className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
          >
            + Nueva orden
          </button>
        )}
      </div>

      {abierto && (
        <form onSubmit={crear} className="card-cayla p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="label-cayla text-[10px] text-tinta/50">Proveedor</label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
              >
                <option value="">Otro (escribir abajo)…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              {!proveedorId && (
                <input
                  value={proveedorTexto}
                  onChange={(e) => setProveedorTexto(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="label-cayla text-[10px] text-tinta/50">Llega a</label>
              <select
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
                className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
              >
                {sedes.map((s) => <option key={s.id} value={s.id}>{s.codigo}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label-cayla text-[10px] text-tinta/50">Monto estimado (S/)</label>
              <input
                type="number"
                min={0}
                step="0.10"
                value={monto}
                onChange={(e) => setMonto(Number(e.target.value))}
                className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label-cayla text-[10px] text-tinta/50">Fecha estimada de llegada</label>
              <input
                type="date"
                value={fechaEstimada}
                onChange={(e) => setFechaEstimada(e.target.value)}
                className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="label-cayla text-[10px] text-tinta/50">Nota</label>
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. 40 blusas + 20 jeans pactados por WhatsApp"
                className="w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {loading ? "Guardando…" : "Crear orden"}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-tinta/5 card-cayla">
        {ordenes.length === 0 && (
          <p className="font-display py-10 text-center text-base italic text-tinta/40">
            Sin órdenes de compra todavía.
          </p>
        )}
        {ordenes.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span
              className={`label-cayla text-[9px] ${
                o.estado === "recibida" ? "text-tinta/40" : o.estado === "cancelada" ? "text-tinta/30" : "text-rojo"
              }`}
            >
              {ETIQUETA_ESTADO[o.estado] ?? o.estado}
            </span>
            <span className="font-medium text-tinta">{o.proveedor}</span>
            <span className="text-tinta/50">→ {o.sedeCodigo}</span>
            {o.montoEstimado != null && <span className="text-tinta/60">{money(o.montoEstimado)}</span>}
            {o.fechaEstimada && <span className="text-tinta/45">llega ~{o.fechaEstimada}</span>}
            {o.nota && <span className="text-tinta/40">· {o.nota}</span>}
            {esLider && (o.estado === "pendiente" || o.estado === "confirmada") && (
              <button onClick={() => cancelar(o.id)} className="label-cayla ml-auto text-[9px] text-tinta/40 hover:text-rojo">
                Cancelar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
