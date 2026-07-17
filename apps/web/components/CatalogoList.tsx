"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { VarianteInteligente } from "@/lib/inteligencia";
import { MovimientoModal } from "@/components/MovimientoModal";

type Sede = { id: string; codigo: string };

const SIN_FILTRO = "";
type Orden = "referencia" | "stock" | "velocidad" | "diasSinVenta";

function valoresUnicos(variantes: VarianteInteligente[], campo: "categoria" | "marca" | "talla" | "color" | "estado") {
  const set = new Set<string>();
  variantes.forEach((v) => {
    const val = v[campo];
    if (val) set.add(val);
  });
  return [...set].sort();
}

export function CatalogoList({
  variantes,
  sedeActual,
  todasLasSedes,
  esLider,
  almacenPropio,
  contenedoresAlmacen,
}: {
  variantes: VarianteInteligente[];
  sedeActual: Sede;
  todasLasSedes: Sede[];
  esLider: boolean;
  almacenPropio: { id: string; codigo: string } | null;
  contenedoresAlmacen: { id: string; codigo: string }[];
}) {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState(SIN_FILTRO);
  const [marca, setMarca] = useState(SIN_FILTRO);
  const [talla, setTalla] = useState(SIN_FILTRO);
  const [color, setColor] = useState(SIN_FILTRO);
  const [estado, setEstado] = useState(SIN_FILTRO);
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [soloEstancado, setSoloEstancado] = useState(false);
  const [soloReponerYa, setSoloReponerYa] = useState(false);
  const [orden, setOrden] = useState<Orden>("referencia");
  const [abierto, setAbierto] = useState<VarianteInteligente | null>(null);

  const categorias = useMemo(() => valoresUnicos(variantes, "categoria"), [variantes]);
  const marcas = useMemo(() => valoresUnicos(variantes, "marca"), [variantes]);
  const tallas = useMemo(() => valoresUnicos(variantes, "talla"), [variantes]);
  const colores = useMemo(() => valoresUnicos(variantes, "color"), [variantes]);
  const estados = useMemo(() => valoresUnicos(variantes, "estado"), [variantes]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = variantes.filter((v) => {
      if (term && !`${v.sku} ${v.referencia} ${v.categoria ?? ""} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
        return false;
      if (categoria && v.categoria !== categoria) return false;
      if (marca && v.marca !== marca) return false;
      if (talla && v.talla !== talla) return false;
      if (color && v.color !== color) return false;
      if (estado && v.estado !== estado) return false;
      if (soloBajoStock && v.stockTotal > v.stockMinimo) return false;
      if (soloEstancado && !v.estancado) return false;
      if (soloReponerYa && !v.reponerYa) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      if (orden === "stock") return b.stockTotal - a.stockTotal;
      if (orden === "velocidad") return b.velocidadDiaria - a.velocidadDiaria;
      if (orden === "diasSinVenta") return (b.diasSinSalida ?? -1) - (a.diasSinSalida ?? -1);
      return a.referencia.localeCompare(b.referencia);
    });
    return out;
  }, [variantes, q, categoria, marca, talla, color, estado, soloBajoStock, soloEstancado, soloReponerYa, orden]);

  const otrasSedes = [
    ...todasLasSedes.filter((s) => s.id !== sedeActual.id).map((s) => ({ ...s, esAlmacen: false })),
    ...(almacenPropio ? [{ ...almacenPropio, esAlmacen: true }] : []),
  ];

  const selectCls = "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700";
  const toggleCls = (activo: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-medium ${activo ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`;

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar prenda, color, categoría, SKU…"
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm"
      />

      <div className="flex flex-wrap gap-1.5">
        <button className={toggleCls(soloBajoStock)} onClick={() => setSoloBajoStock((v) => !v)}>
          Bajo stock
        </button>
        <button className={toggleCls(soloEstancado)} onClick={() => setSoloEstancado((v) => !v)}>
          Estancado
        </button>
        <button className={toggleCls(soloReponerYa)} onClick={() => setSoloReponerYa((v) => !v)}>
          Reponer ya
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={selectCls}>
          <option value="">Categoría (todas)</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className={selectCls}>
          <option value="">Marca (todas)</option>
          {marcas.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={talla} onChange={(e) => setTalla(e.target.value)} className={selectCls}>
          <option value="">Talla (todas)</option>
          {tallas.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={color} onChange={(e) => setColor(e.target.value)} className={selectCls}>
          <option value="">Color (todos)</option>
          {colores.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectCls}>
          <option value="">Estado (todos)</option>
          {estados.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={selectCls}>
          <option value="referencia">Orden: referencia</option>
          <option value="stock">Orden: stock total</option>
          <option value="velocidad">Orden: velocidad de venta</option>
          <option value="diasSinVenta">Orden: días sin venta</option>
        </select>
      </div>

      <p className="text-xs text-neutral-400">{filtradas.length} de {variantes.length} referencias</p>

      {filtradas.length === 0 && (
        <p className="py-8 text-center text-sm italic text-neutral-400">
          {variantes.length === 0 ? "Aún no hay prendas cargadas." : "Sin resultados con estos filtros."}
        </p>
      )}

      <div className="space-y-2">
        {filtradas.map((v) => (
          <div key={v.varianteId} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/producto/${v.varianteId}`} className="text-sm font-medium text-neutral-900 hover:underline">
                    {v.referencia}
                  </Link>
                  {v.reponerYa && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                      Reponer ya
                    </span>
                  )}
                  {v.estancado && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Estancado
                    </span>
                  )}
                  {esLider && v.claseABC && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                      Clase {v.claseABC}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {[v.talla, v.color, v.categoria].filter(Boolean).join(" · ")}
                </p>
                {v.precio != null && (
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Costo S/{v.costo?.toFixed(2)} · Precio S/{v.precio.toFixed(2)}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-neutral-400">
                  {v.velocidadDiaria > 0 ? `${v.velocidadDiaria}/día` : "Sin ventas recientes"}
                  {v.diasInventario != null && ` · ${v.diasInventario}d de inventario`}
                </p>
                <p className="mt-1 font-mono text-[11px] text-neutral-300">{v.sku}</p>
              </div>
              <button
                onClick={() => setAbierto(v)}
                className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
              >
                Mover
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {todasLasSedes.map((s) => (
                <span
                  key={s.id}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    s.id === sedeActual.id
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {s.codigo} <b>{v.stockPorSede[s.codigo] ?? 0}</b>
                </span>
              ))}
            </div>

            {v.sugerenciaTraslado && (
              <p className="mt-2 text-xs text-blue-700">
                Sugerencia: trasladar a {v.sugerenciaTraslado.sedeDestinoCodigo} desde {v.sugerenciaTraslado.sedeOrigenCodigo} (tiene {v.sugerenciaTraslado.stockOrigen} unidades)
              </p>
            )}
          </div>
        ))}
      </div>

      {abierto && (
        <MovimientoModal
          varianteId={abierto.varianteId}
          referencia={abierto.referencia}
          sku={abierto.sku}
          sedeId={sedeActual.id}
          sedeCodigo={sedeActual.codigo}
          otrasSedes={otrasSedes}
          contenedoresAlmacen={contenedoresAlmacen}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}
