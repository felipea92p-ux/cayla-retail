"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Directorio único de proveedores (fin de las 3 copias desincronizadas de SINATRA:
// TRU tenía 295 filas, AQP/LIM 287). Edición solo Líder; todas pueden consultar.

export type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  categoria: string | null;
  marca: string | null;
  score: number | null;
  contacto: string | null;
  telefono: string | null;
  direccion: string | null;
};

export function ProveedoresManager({ proveedores, esLider }: { proveedores: Proveedor[]; esLider: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ruc, setRuc] = useState("");
  const [categoria, setCategoria] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contacto, setContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return proveedores;
    return proveedores.filter((p) =>
      `${p.nombre} ${p.categoria ?? ""} ${p.marca ?? ""} ${p.ruc ?? ""} ${p.contacto ?? ""}`.toLowerCase().includes(term)
    );
  }, [proveedores, q]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().from("proveedores").insert({
      nombre: nombre.trim(),
      ruc: ruc || null,
      categoria: categoria || null,
      telefono: telefono || null,
      contacto: contacto || null,
      direccion: direccion || null,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setAbierto(false);
    setNombre(""); setRuc(""); setCategoria(""); setTelefono(""); setContacto(""); setDireccion("");
    router.refresh();
  }

  const inputCls = "w-full border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none focus:border-rojo";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proveedor, categoría, RUC…"
          className="min-w-52 flex-1 border-b border-tinta/20 bg-transparent px-1 py-2 text-sm text-tinta outline-none placeholder:text-tinta/35 focus:border-rojo"
        />
        {esLider && (
          <button
            onClick={() => setAbierto((v) => !v)}
            className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
          >
            + Nuevo proveedor
          </button>
        )}
      </div>

      {abierto && (
        <form onSubmit={onSubmit} className="card-cayla p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label-cayla text-[10px] text-tinta/50">Nombre *</label>
              <input required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">RUC</label>
              <input value={ruc} onChange={(e) => setRuc(e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Categoría</label>
              <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej. Blusas, Bisutería" className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Contacto</label>
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Teléfono</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Dirección</label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} /></div>
          </div>
          {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta">Cancelar</button>
            <button type="submit" disabled={loading} className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      <p className="label-cayla text-[9px] text-tinta/40">{filtrados.length} de {proveedores.length} proveedores</p>

      <div className="divide-y divide-tinta/5 card-cayla">
        {filtrados.slice(0, 60).map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-tinta">{p.nombre}</p>
              {p.score != null && <span className="label-cayla text-[9px] text-taupe">score {p.score}</span>}
            </div>
            <p className="mt-0.5 text-xs text-tinta/45">
              {[p.categoria, p.marca, p.ruc && `RUC ${p.ruc}`, p.telefono, p.contacto].filter(Boolean).join(" · ") || "Sin datos adicionales"}
            </p>
            {p.direccion && <p className="mt-0.5 text-xs text-tinta/35">{p.direccion}</p>}
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="font-display py-8 text-center text-base italic text-tinta/40">Sin proveedores aún.</p>
        )}
      </div>
      {filtrados.length > 60 && (
        <p className="text-xs text-tinta/40">Mostrando 60 — afina la búsqueda para ver el resto.</p>
      )}
    </div>
  );
}
