"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Directorio único de proveedores (fin de las 3 copias desincronizadas de SINATRA:
// TRU tenía 295 filas, AQP/LIM 287). Edición solo Líder; todas pueden consultar.
// "Desactivar" nunca borra la fila — mueve `activo` a false (principio del
// CLAUDE.md: archivar, no borrar), y queda reversible con "Reactivar".

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
  banco: string | null;
  cuentaBancaria: string | null;
  activo: boolean;
};

type FormState = {
  nombre: string;
  ruc: string;
  marca: string;
  contacto: string;
  telefono: string;
  direccion: string;
  banco: string;
  cuentaBancaria: string;
};

// "Categoría" se quitó del formulario a propósito (por ahora): con
// `productos.proveedor_id` el vínculo real producto↔proveedor vive en el
// catálogo, y taguear categoría aparte en el proveedor duplicaba la misma
// idea de dos formas distintas. El campo sigue en la tabla (datos de SINATRA)
// y se sigue mostrando/buscando en la lista — solo no se edita desde acá.
const FORM_VACIO: FormState = {
  nombre: "", ruc: "", marca: "", contacto: "", telefono: "", direccion: "", banco: "", cuentaBancaria: "",
};

function aFormulario(p: Proveedor): FormState {
  return {
    nombre: p.nombre,
    ruc: p.ruc ?? "",
    marca: p.marca ?? "",
    contacto: p.contacto ?? "",
    telefono: p.telefono ?? "",
    direccion: p.direccion ?? "",
    banco: p.banco ?? "",
    cuentaBancaria: p.cuentaBancaria ?? "",
  };
}

export function ProveedoresManager({ proveedores, esLider }: { proveedores: Proveedor[]; esLider: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtrados = useMemo(() => {
    const base = mostrarInactivos ? proveedores : proveedores.filter((p) => p.activo);
    const term = q.trim().toLowerCase();
    if (!term) return base;
    return base.filter((p) =>
      `${p.nombre} ${p.categoria ?? ""} ${p.marca ?? ""} ${p.ruc ?? ""} ${p.contacto ?? ""}`.toLowerCase().includes(term)
    );
  }, [proveedores, q, mostrarInactivos]);

  function abrirNuevo() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError(null);
    setAbierto(true);
  }

  function abrirEditar(p: Proveedor) {
    if (!esLider) return;
    setEditandoId(p.id);
    setForm(aFormulario(p));
    setError(null);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError(null);
  }

  function campo<K extends keyof FormState>(clave: K, valor: string) {
    setForm((actual) => ({ ...actual, [clave]: valor }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const payload = {
      nombre: form.nombre.trim(),
      ruc: form.ruc.trim() || null,
      marca: form.marca.trim() || null,
      contacto: form.contacto.trim() || null,
      telefono: form.telefono.trim() || null,
      direccion: form.direccion.trim() || null,
      banco: form.banco.trim() || null,
      cuenta_bancaria: form.cuentaBancaria.trim() || null,
    };
    const supabase = createClient();
    const { error } = editandoId
      ? await supabase.from("proveedores").update(payload).eq("id", editandoId)
      : await supabase.from("proveedores").insert(payload);
    setLoading(false);
    if (error) { setError(error.message); return; }
    cerrar();
    router.refresh();
  }

  async function cambiarActivo(activo: boolean) {
    if (!editandoId) return;
    setLoading(true);
    setError(null);
    const { error } = await createClient().from("proveedores").update({ activo }).eq("id", editandoId);
    setLoading(false);
    if (error) { setError(error.message); return; }
    cerrar();
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
            onClick={abrirNuevo}
            className="label-cayla bg-tinta px-4 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo"
          >
            + Nuevo proveedor
          </button>
        )}
      </div>

      {esLider && (
        <label className="flex items-center gap-2 text-xs text-tinta/50">
          <input type="checkbox" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
      )}

      {abierto && (
        <form onSubmit={onSubmit} className="card-cayla p-5">
          <p className="label-cayla mb-3 text-[10px] text-tinta/45">{editandoId ? "Editar proveedor" : "Nuevo proveedor"}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label-cayla text-[10px] text-tinta/50">Nombre *</label>
              <input required autoFocus value={form.nombre} onChange={(e) => campo("nombre", e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">RUC</label>
              <input value={form.ruc} onChange={(e) => campo("ruc", e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Marca</label>
              <input value={form.marca} onChange={(e) => campo("marca", e.target.value)} placeholder="Línea que maneja este proveedor" className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Contacto</label>
              <input value={form.contacto} onChange={(e) => campo("contacto", e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Teléfono</label>
              <input value={form.telefono} onChange={(e) => campo("telefono", e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Dirección</label>
              <input value={form.direccion} onChange={(e) => campo("direccion", e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Banco</label>
              <input value={form.banco} onChange={(e) => campo("banco", e.target.value)} className={inputCls} /></div>
            <div><label className="label-cayla text-[10px] text-tinta/50">Cuenta bancaria</label>
              <input value={form.cuentaBancaria} onChange={(e) => campo("cuentaBancaria", e.target.value)} className={inputCls} /></div>
          </div>
          {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={cerrar} className="label-cayla flex-1 border border-tinta/25 px-3 py-2.5 text-[10px] text-tinta">Cancelar</button>
            {editandoId && (
              <button
                type="button"
                disabled={loading}
                onClick={() => cambiarActivo(!proveedores.find((p) => p.id === editandoId)?.activo)}
                className="label-cayla flex-1 border border-rojo/40 px-3 py-2.5 text-[10px] text-rojo transition-colors hover:bg-rojo/5 disabled:opacity-50"
              >
                {proveedores.find((p) => p.id === editandoId)?.activo ? "Desactivar" : "Reactivar"}
              </button>
            )}
            <button type="submit" disabled={loading} className="label-cayla flex-1 bg-tinta px-3 py-2.5 text-[10px] text-crema transition-colors hover:bg-rojo disabled:opacity-50">
              {loading ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      <p className="label-cayla text-[9px] text-tinta/40">{filtrados.length} de {proveedores.length} proveedores</p>

      <div className="divide-y divide-tinta/5 card-cayla">
        {filtrados.slice(0, 60).map((p) => (
          <div
            key={p.id}
            onClick={() => abrirEditar(p)}
            className={`px-4 py-3 ${esLider ? "cursor-pointer hover:bg-sand" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-tinta">
                {p.nombre}
                {!p.activo && <span className="label-cayla ml-2 text-[9px] text-tinta/35">inactivo</span>}
              </p>
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
