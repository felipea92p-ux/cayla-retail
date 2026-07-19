"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { VarianteInteligente } from "@/lib/inteligencia";
import { MovimientoModal } from "@/components/MovimientoModal";

// Catálogo agrupado por producto (rediseño UX 2026-07-18, aprobado por Felipe):
// una fila por modelo con su stock total, expandible a la matriz de tallas/colores.
// Menos ruido que la lista plana, visión de modelo completo — como manejan catálogo
// los retail serios. Las acciones son por TAREA (Enviar/Ajustar), no un menú técnico.

type Sede = { id: string; codigo: string };

export type ProductoAgrupado = {
  productoId: string;
  referencia: string;
  familia: string | null;
  categoria: string | null;
  marca: string | null;
  variantes: VarianteInteligente[];
};

type TareaModal = { variante: VarianteInteligente; tipo: "traslado" | "ajuste" };

export function InventarioAgrupado({
  productos,
  sedeActual,
  todasLasSedes,
  almacenPropio,
  contenedoresAlmacen,
}: {
  productos: ProductoAgrupado[];
  sedeActual: Sede;
  todasLasSedes: Sede[];
  almacenPropio: { id: string; codigo: string } | null;
  contenedoresAlmacen: { id: string; codigo: string }[];
}) {
  const [q, setQ] = useState("");
  const [familia, setFamilia] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloReponer, setSoloReponer] = useState(false);
  const [soloEstancado, setSoloEstancado] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<TareaModal | null>(null);

  const familias = useMemo(
    () => [...new Set(productos.map((p) => p.familia).filter(Boolean))].sort() as string[],
    [productos]
  );
  const categorias = useMemo(
    () =>
      [...new Set(
        productos.filter((p) => !familia || p.familia === familia).map((p) => p.categoria).filter(Boolean)
      )].sort() as string[],
    [productos, familia]
  );

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return productos.filter((p) => {
      if (familia && p.familia !== familia) return false;
      if (categoria && p.categoria !== categoria) return false;
      if (soloReponer && !p.variantes.some((v) => v.reponerYa)) return false;
      if (soloEstancado && !p.variantes.some((v) => v.estancado)) return false;
      if (term) {
        const texto = `${p.referencia} ${p.categoria ?? ""} ${p.marca ?? ""} ${p.variantes
          .map((v) => `${v.sku} ${v.talla ?? ""} ${v.color ?? ""}`)
          .join(" ")}`.toLowerCase();
        if (!texto.includes(term)) return false;
      }
      return true;
    });
  }, [productos, q, familia, categoria, soloReponer, soloEstancado]);

  function toggle(productoId: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(productoId)) next.delete(productoId);
      else next.add(productoId);
      return next;
    });
  }

  const otrasSedes = [
    ...todasLasSedes.filter((s) => s.id !== sedeActual.id).map((s) => ({ ...s, esAlmacen: false })),
    ...(almacenPropio ? [{ ...almacenPropio, esAlmacen: true }] : []),
  ];

  const toggleCls = (activo: boolean) =>
    `label-cayla border px-3 py-1.5 text-[9px] transition-colors ${
      activo ? "border-tinta bg-tinta text-crema" : "border-tinta/20 text-tinta/55 hover:border-rojo hover:text-rojo"
    }`;
  const selectCls =
    "border border-tinta/20 bg-papel px-2.5 py-1.5 text-xs text-tinta outline-none transition-colors focus:border-rojo";

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrar por nombre, talla, color, código…"
        className="w-full border-b border-tinta/20 bg-transparent px-1 py-2.5 text-sm text-tinta outline-none transition-colors placeholder:text-tinta/35 focus:border-rojo"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <select value={familia} onChange={(e) => { setFamilia(e.target.value); setCategoria(""); }} className={selectCls}>
          <option value="">Familia (todas)</option>
          {familias.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={selectCls}>
          <option value="">Categoría (todas)</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className={toggleCls(soloReponer)} onClick={() => setSoloReponer((v) => !v)}>Reponer ya</button>
        <button className={toggleCls(soloEstancado)} onClick={() => setSoloEstancado((v) => !v)}>Estancado</button>
        <span className="label-cayla ml-auto text-[9px] text-tinta/40">
          {filtrados.length} modelo{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtrados.length === 0 && (
        <p className="font-display py-10 text-center text-base italic text-tinta/40">
          {productos.length === 0 ? "Aún no hay prendas cargadas." : "Sin resultados con estos filtros."}
        </p>
      )}

      {/* Cabecera de tabla (escritorio) */}
      {filtrados.length > 0 && (
        <div className="label-cayla hidden grid-cols-[1fr_110px_90px_120px] gap-3 border-b border-tinta/15 px-4 pb-2 text-[9px] text-tinta/40 sm:grid">
          <span>Producto</span>
          <span className="text-right">Stock total</span>
          <span className="text-right">Tallas</span>
          <span className="text-right">Rotación</span>
        </div>
      )}

      <div className="divide-y divide-tinta/10 border border-tinta/10 bg-papel">
        {filtrados.map((p) => {
          const stockTotal = p.variantes.reduce((a, v) => a + v.stockTotal, 0);
          const tieneReponer = p.variantes.some((v) => v.reponerYa);
          const tieneEstancado = p.variantes.some((v) => v.estancado);
          const velocidad = Math.round(p.variantes.reduce((a, v) => a + v.velocidadDiaria, 0) * 100) / 100;
          const expandido = abiertos.has(p.productoId);

          return (
            <div key={p.productoId}>
              {/* Fila de producto */}
              <button
                onClick={() => toggle(p.productoId)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sand/40 sm:grid-cols-[1fr_110px_90px_120px]"
              >
                <div>
                  <p className="text-sm font-medium text-tinta">
                    {p.referencia}
                    {tieneReponer && <span className="label-cayla ml-2 text-[8px] text-rojo">Reponer</span>}
                    {tieneEstancado && <span className="label-cayla ml-2 text-[8px] text-taupe">Estancado</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-tinta/45">
                    {[p.familia, p.categoria, p.marca].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className={`font-display text-right text-xl ${stockTotal === 0 ? "text-rojo" : "text-tinta"}`}>
                  {stockTotal}
                </p>
                <p className="hidden text-right text-xs text-tinta/50 sm:block">{p.variantes.length}</p>
                <p className="hidden text-right text-xs text-tinta/50 sm:block">
                  {velocidad > 0 ? `${velocidad}/día` : "—"}
                </p>
              </button>

              {/* Matriz de variantes */}
              {expandido && (
                <div className="border-t border-tinta/10 bg-crema px-4 py-3">
                  <div className="space-y-2">
                    {p.variantes.map((v) => (
                      <div key={v.varianteId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-tinta/5 pb-2 last:border-0 last:pb-0">
                        <Link href={`/producto/${v.varianteId}`} className="min-w-28 text-sm text-tinta hover:text-rojo">
                          {[v.talla, v.color].filter(Boolean).join(" · ") || "Única"}
                        </Link>
                        <span className="flex flex-wrap gap-px border border-tinta/10 bg-tinta/10">
                          {Object.entries(v.stockPorSede).map(([codigo, cantidad]) => (
                            <span key={codigo} className="bg-crema px-2 py-1 text-[11px] text-tinta/60">
                              {codigo} <b className="font-display text-xs text-tinta">{cantidad}</b>
                            </span>
                          ))}
                          {Object.keys(v.stockPorSede).length === 0 && (
                            <span className="bg-crema px-2 py-1 text-[11px] text-rojo">sin stock</span>
                          )}
                        </span>
                        {v.precio != null && <span className="text-xs text-tinta/55">S/{v.precio.toFixed(2)}</span>}
                        {v.reponerYa && <span className="label-cayla text-[8px] text-rojo">Reponer</span>}
                        <span className="ml-auto flex gap-2">
                          <button
                            onClick={() => setModal({ variante: v, tipo: "traslado" })}
                            className="label-cayla border border-tinta/20 px-2.5 py-1.5 text-[8px] text-tinta/70 transition-colors hover:border-rojo hover:text-rojo"
                          >
                            Enviar
                          </button>
                          <button
                            onClick={() => setModal({ variante: v, tipo: "ajuste" })}
                            className="label-cayla border border-tinta/20 px-2.5 py-1.5 text-[8px] text-tinta/70 transition-colors hover:border-rojo hover:text-rojo"
                          >
                            Ajustar
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <MovimientoModal
          varianteId={modal.variante.varianteId}
          referencia={modal.variante.referencia}
          sku={modal.variante.sku}
          sedeId={sedeActual.id}
          sedeCodigo={sedeActual.codigo}
          otrasSedes={otrasSedes}
          contenedoresAlmacen={contenedoresAlmacen}
          tipoFijo={modal.tipo}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
