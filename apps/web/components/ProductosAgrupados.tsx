"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VarianteCatalogo } from "@/lib/catalogo-v2";

/**
 * Catálogo agrupado por producto — una fila por modelo, expandible a sus
 * variantes. Combina dos cosas de dos mundos distintos:
 *
 * - El PATRÓN viene de `trix/catalogo-vocabulario` (V1, `InventarioAgrupado.tsx`,
 *   rediseño 2026-07-18 "como manejan catálogo los retail serios"): una tabla
 *   plana con una fila por variante se vuelve ilegible pasadas ~20 filas —
 *   agrupar por modelo y expandir es lo que de verdad se lee rápido.
 * - Los DATOS son 100% de V2 (`getCatalogo()`, lib/catalogo-v2.ts). A
 *   propósito, esta pantalla NO muestra stock: en V2 "cuánto hay" es
 *   `/inventario` (por ubicación), separado de "qué existe" (`/productos`).
 *   Traer stock acá mezclaría dos conceptos que V2 separó adrede — no es una
 *   pieza que faltó portar, es una que no corresponde acá.
 */

type Producto = {
  productoId: string;
  referencia: string;
  categoria: string | null;
  variantes: VarianteCatalogo[];
};

export function ProductosAgrupados({ catalogo }: { catalogo: VarianteCatalogo[] }) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const productos = useMemo<Producto[]>(() => {
    const porProducto = new Map<string, Producto>();
    for (const v of catalogo) {
      const actual = porProducto.get(v.productoId);
      if (actual) {
        actual.variantes.push(v);
      } else {
        porProducto.set(v.productoId, {
          productoId: v.productoId,
          referencia: v.referencia,
          categoria: v.categoria,
          variantes: [v],
        });
      }
    }
    return [...porProducto.values()].sort((a, b) => a.referencia.localeCompare(b.referencia));
  }, [catalogo]);

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))].sort(),
    [productos]
  );

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return productos.filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      if (!term) return true;
      const texto = `${p.referencia} ${p.categoria ?? ""} ${p.variantes
        .map((v) => `${v.sku} ${v.talla ?? ""} ${v.color ?? ""}`)
        .join(" ")}`.toLowerCase();
      return texto.includes(term);
    });
  }, [productos, q, categoria]);

  function toggle(productoId: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(productoId)) next.delete(productoId);
      else next.add(productoId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por referencia, SKU, talla, color…"
          className="min-w-[16rem] flex-1 rounded-md border border-sand bg-papel px-3 py-2 text-sm text-tinta outline-none placeholder:text-tinta/55 focus:border-rojo"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-md border border-sand bg-papel px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
        >
          <option value="">Categoría (todas)</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Ningún producto calza con ese filtro.</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map((p) => {
            const abierto = abiertos.has(p.productoId);
            return (
              <div key={p.productoId} className="card-cayla overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-sand/30">
                  <button
                    onClick={() => toggle(p.productoId)}
                    className="flex flex-1 items-center gap-4 text-left"
                    aria-expanded={abierto}
                  >
                    <span className="flex-1 text-sm text-tinta">{p.referencia}</span>
                    <span className="text-xs text-tinta/65">{p.categoria ?? "—"}</span>
                    <span className="label-cayla text-[11px] text-tinta/55">
                      {p.variantes.length} {p.variantes.length === 1 ? "variante" : "variantes"}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-4 w-4 shrink-0 text-tinta/50 transition-transform ${abierto ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <Link href={`/productos/${p.productoId}/editar`} className="label-cayla shrink-0 text-[11px] text-tinta/65 hover:text-rojo">
                    Editar
                  </Link>
                </div>
                {abierto && (
                  <div className="border-t border-tinta/10 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-tinta/10 text-left">
                          <th className="label-cayla px-5 py-2.5 text-[11px] text-tinta/65">SKU</th>
                          <th className="label-cayla px-3 py-2.5 text-[11px] text-tinta/65">Talla</th>
                          <th className="label-cayla px-3 py-2.5 text-[11px] text-tinta/65">Color</th>
                          <th className="label-cayla px-3 py-2.5 text-right text-[11px] text-tinta/65">Precio</th>
                          <th className="label-cayla px-3 py-2.5 text-right text-[11px] text-tinta/65">Costo</th>
                          <th className="label-cayla px-5 py-2.5 text-[11px] text-tinta/65">Barras</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-tinta/10">
                        {p.variantes.map((v) => (
                          <tr key={v.varianteId} className={v.activo ? "" : "opacity-50"}>
                            <td className="px-5 py-2.5 font-mono text-xs text-tinta/75">{v.sku}</td>
                            <td className="px-3 py-2.5 text-tinta/75">{v.talla ?? "—"}</td>
                            <td className="px-3 py-2.5 text-tinta/75">
                              {v.color ? (
                                <span className="inline-flex items-center gap-1.5">
                                  {v.colorHex && (
                                    <span
                                      aria-hidden
                                      className="inline-block h-3 w-3 rounded-full border border-tinta/15"
                                      style={{ backgroundColor: v.colorHex }}
                                    />
                                  )}
                                  {v.color}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-tinta">S/{v.precio.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-tinta/65">S/{v.costo.toFixed(2)}</td>
                            <td className="px-5 py-2.5 text-xs text-tinta/65">{v.codigosBarras.join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
