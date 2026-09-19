"use client";

import { useMemo, useState } from "react";
import { IconoFamilia } from "@/components/IconoFamilia";
import type { Familia } from "@cayla-retail/shared";
import type { CategoriaAlta, FamiliaAlta } from "@/lib/alta-producto-datos";

// El primer paso: ¿QUÉ producto es? Dos toques (familia → categoría) o una
// búsqueda que salta directo. Decidido con Felipe (2026-09-18): tarjetas por
// defecto, y la caja de búsqueda como atajo para quien ya conoce el nombre.
//
// Tarjetas y no un <select>: una categoría equivocada arrastra prefijo de
// código, tallas, tejidos y patrones — es el error más caro del alta, y una
// lista desplegable de 40 nombres lo hace fácil de cometer y difícil de ver.

function sinTildes(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function nombreVisible(c: CategoriaAlta): string {
  return c.padreNombre ? `${c.padreNombre} › ${c.nombre}` : c.nombre;
}

export function ArbolCategoria({
  familias,
  categorias,
  categoriaId,
  onElegir,
  onCambiar,
}: {
  familias: FamiliaAlta[];
  categorias: CategoriaAlta[];
  categoriaId: string;
  onElegir: (id: string) => void;
  onCambiar: () => void;
}) {
  const [familiaAbierta, setFamiliaAbierta] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const porFamilia = useMemo(() => {
    const out: Record<string, CategoriaAlta[]> = {};
    for (const c of categorias) if (c.familia) (out[c.familia] ??= []).push(c);
    return out;
  }, [categorias]);

  const elegida = categorias.find((c) => c.id === categoriaId) ?? null;
  const familiaDeElegida = elegida ? familias.find((f) => f.codigo === elegida.familia) : null;

  if (elegida) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-tinta/20 bg-tinta/[0.03] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <IconoFamilia familia={(elegida.familia as Familia) ?? null} className="h-6 w-6 text-tinta/70" />
          <div>
            <p className="text-sm font-medium text-tinta">
              {familiaDeElegida?.nombre ?? "Sin familia"} <span className="text-tinta/40">›</span> {nombreVisible(elegida)}
            </p>
            {elegida.prefijo && <p className="text-xs text-tinta/60">Código empieza con {elegida.prefijo}-</p>}
          </div>
        </div>
        <button type="button" onClick={onCambiar} className="label-cayla text-[11px] text-tinta/70 underline underline-offset-4 hover:text-rojo">
          Cambiar
        </button>
      </div>
    );
  }

  const q = sinTildes(busqueda);
  const resultados = q
    ? categorias
        .filter((c) => c.familia && sinTildes(`${c.nombre} ${c.padreNombre ?? ""}`).includes(q))
        .slice(0, 8)
    : [];
  const categoriasDeLaFamilia = familiaAbierta ? (porFamilia[familiaAbierta] ?? []) : [];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="buscar-categoria" className="sr-only">
          Buscar una categoría
        </label>
        <input
          id="buscar-categoria"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Busca: botines, vestidos, relojes…"
          autoComplete="off"
          className="w-full rounded-md border border-tinta/15 bg-transparent px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/50 focus:border-tinta/50"
        />
        {q && (
          <ul className="mt-2 divide-y divide-tinta/10 rounded-md border border-tinta/15">
            {resultados.length === 0 && <li className="px-3 py-2 text-sm text-tinta/60">Nada se llama así. Prueba con las familias de abajo.</li>}
            {resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onElegir(c.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-tinta hover:bg-tinta/[0.04]"
                >
                  <span>{nombreVisible(c)}</span>
                  <span className="text-xs text-tinta/55">{familias.find((f) => f.codigo === c.familia)?.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="label-cayla mb-2 text-[11px] text-tinta/60">Familia</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {familias.map((f) => {
            const activa = familiaAbierta === f.codigo;
            const n = (porFamilia[f.codigo] ?? []).length;
            return (
              <button
                key={f.codigo}
                type="button"
                aria-pressed={activa}
                onClick={() => setFamiliaAbierta(activa ? null : f.codigo)}
                className={`flex min-h-20 flex-col items-start justify-between gap-2 rounded-md border p-3 text-left transition-colors ${
                  activa ? "border-tinta bg-tinta/[0.07]" : "border-tinta/15 hover:border-tinta/40"
                }`}
              >
                <IconoFamilia familia={f.codigo as Familia} className="h-5 w-5 text-tinta/70" />
                <span>
                  <span className="block text-sm font-medium leading-tight text-tinta">{f.nombre}</span>
                  <span className="text-xs text-tinta/55">
                    {n} categoría{n === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {familiaAbierta && (
        <div>
          <p className="label-cayla mb-2 text-[11px] text-tinta/60">Categoría</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {categoriasDeLaFamilia.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onElegir(c.id)}
                className="min-h-11 rounded-md border border-tinta/15 px-3 py-2 text-left text-sm text-tinta transition-colors hover:border-tinta hover:bg-tinta/[0.04]"
              >
                {nombreVisible(c)}
              </button>
            ))}
            {categoriasDeLaFamilia.length === 0 && <p className="col-span-full text-sm text-tinta/60">Esta familia todavía no tiene categorías activas.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
