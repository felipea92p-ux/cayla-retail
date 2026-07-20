"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Receta de costo del Taller (descubrimiento 2026-07-19): tela y avíos con precio
// de referencia + mano de obra = costo sugerido del modelo. NO es inventario de
// insumos (eso quedó para después): es la calculadora que evita costear "al ojo".
// Solo Líder: el costo es información sensible.

export type ItemReceta = {
  id: string;
  insumo: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number | null;
};

export function RecetaCosto({
  productoId,
  items,
  costoManoObra,
  costoActual,
}: {
  productoId: string;
  items: ItemReceta[];
  costoManoObra: number | null;
  costoActual: number | null; // costo vigente de la variante que se está viendo
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [insumo, setInsumo] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [unidad, setUnidad] = useState("m");
  const [precio, setPrecio] = useState(0);
  const [manoObra, setManoObra] = useState(costoManoObra ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const costoInsumos = items.reduce((a, i) => a + i.cantidad * (i.precioUnitario ?? 0), 0);
  const sugerido = Math.round((costoInsumos + (costoManoObra ?? 0)) * 100) / 100;

  async function agregarItem(e: React.FormEvent) {
    e.preventDefault();
    if (!insumo.trim()) return;
    setLoading(true);
    const { error } = await createClient().from("bom_items").insert({
      producto_id: productoId,
      insumo: insumo.trim(),
      cantidad_requerida: cantidad,
      unidad,
      precio_unitario: precio || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setInsumo(""); setCantidad(1); setPrecio(0);
    router.refresh();
  }

  async function quitarItem(id: string) {
    const { error } = await createClient().from("bom_items").delete().eq("id", id);
    if (!error) router.refresh();
  }

  async function guardarManoObra() {
    const { error } = await createClient().from("productos").update({ costo_mano_obra: manoObra || null }).eq("id", productoId);
    if (error) setError(error.message);
    else router.refresh();
  }

  async function aplicarCosto() {
    setLoading(true);
    const { error } = await createClient().from("variantes").update({ costo: sugerido }).eq("producto_id", productoId);
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.refresh();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="label-cayla border border-tinta/25 px-3 py-2 text-[9px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
      >
        Receta de costo{sugerido > 0 ? ` · S/${sugerido.toFixed(2)}` : ""}
      </button>
    );
  }

  return (
    <div className="border border-tinta/10 bg-papel p-4">
      <div className="flex items-center justify-between">
        <p className="label-cayla text-[10px] text-tinta/50">Receta de costo del modelo</p>
        <button onClick={() => setAbierto(false)} className="label-cayla text-[9px] text-tinta/40 hover:text-rojo">
          Cerrar
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-3 divide-y divide-tinta/5 border border-tinta/10 bg-crema">
          {items.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-tinta">
                {i.insumo} <span className="text-tinta/45">· {i.cantidad} {i.unidad}</span>
                {i.precioUnitario != null && <span className="text-tinta/45"> × S/{i.precioUnitario.toFixed(2)}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-tinta/60">S/{(i.cantidad * (i.precioUnitario ?? 0)).toFixed(2)}</span>
                <button onClick={() => quitarItem(i.id)} className="label-cayla text-[8px] text-rojo">Quitar</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={agregarItem} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 text-[10px] text-tinta/50">
          Insumo
          <input value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="Ej. Tela chalis"
            className="mt-1 w-full border-b border-tinta/20 bg-transparent px-1 py-1.5 text-sm text-tinta outline-none focus:border-rojo" />
        </label>
        <label className="w-16 text-[10px] text-tinta/50">
          Cant.
          <input type="number" min={0} step="0.01" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}
            className="mt-1 w-full border-b border-tinta/20 bg-transparent px-1 py-1.5 text-sm text-tinta outline-none focus:border-rojo" />
        </label>
        <label className="w-16 text-[10px] text-tinta/50">
          Unidad
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)}
            className="mt-1 w-full border-b border-tinta/20 bg-transparent px-1 py-1.5 text-sm text-tinta outline-none focus:border-rojo" />
        </label>
        <label className="w-20 text-[10px] text-tinta/50">
          S/ unit.
          <input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(Number(e.target.value))}
            className="mt-1 w-full border-b border-tinta/20 bg-transparent px-1 py-1.5 text-sm text-tinta outline-none focus:border-rojo" />
        </label>
        <button type="submit" disabled={loading} className="label-cayla border border-tinta/25 px-3 py-2 text-[9px] text-tinta hover:border-rojo hover:text-rojo disabled:opacity-50">
          + Agregar
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-tinta/10 pt-3">
        <label className="text-[10px] text-tinta/50">
          Mano de obra (S/ por prenda)
          <input type="number" min={0} step="0.10" value={manoObra} onChange={(e) => setManoObra(Number(e.target.value))} onBlur={guardarManoObra}
            className="mt-1 w-28 border-b border-tinta/20 bg-transparent px-1 py-1.5 text-sm text-tinta outline-none focus:border-rojo" />
        </label>
        <div className="ml-auto text-right">
          <p className="label-cayla text-[9px] text-tinta/45">Costo sugerido</p>
          <p className="font-display text-2xl text-tinta">S/{sugerido.toFixed(2)}</p>
          {costoActual != null && (
            <p className="text-xs text-tinta/45">actual: S/{costoActual.toFixed(2)}</p>
          )}
        </div>
      </div>

      {sugerido > 0 && (
        <button
          onClick={aplicarCosto}
          disabled={loading}
          className="label-cayla mt-3 w-full bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50"
        >
          Aplicar S/{sugerido.toFixed(2)} como costo a todas las tallas/colores del modelo
        </button>
      )}

      {error && <p className="mt-2 text-xs text-rojo">{error}</p>}
    </div>
  );
}
