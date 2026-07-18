"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ORIGENES_LOTE, FAMILIAS, type OrigenLote, type Familia } from "@cayla-retail/shared";

type Contenedor = { id: string; codigo: string; tipo: string };
type Categoria = { id: string; familia: string; nombre: string; tallasSugeridas: string[] | null };
type ProductoExistente = { id: string; referencia: string; categoriaId: string | null };
type VarianteExistente = { varianteId: string; sku: string; referencia: string; talla: string | null; color: string | null };

type Modo = "existente" | "nueva_variante" | "nuevo_producto";

type ItemLote = {
  clientId: string;
  modo: Modo;
  varianteId?: string;
  productoId?: string;
  referencia: string;
  skuPadre?: string;
  sku: string;
  familia?: Familia;
  categoriaId?: string;
  genero?: string;
  marca?: string;
  temporada?: string;
  talla: string;
  color: string;
  costo: number;
  precio: number;
  stockMinimo: number;
  cantidad: number;
  contenedorId: string;
};

const ETIQUETA_FAMILIA: Record<Familia, string> = {
  indumentaria: "Indumentaria",
  calzado: "Calzado",
  accesorios: "Accesorios",
  bisuteria: "Bisutería",
  belleza: "Belleza",
  papeleria: "Papelería",
};

function slug(texto: string) {
  return texto
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const ETIQUETA_ORIGEN: Record<OrigenLote, string> = { taller: "Taller propio", proveedor: "Proveedor externo" };

export function RecibirLoteForm({
  sedeAlmacenId,
  sedeAlmacenCodigo,
  contenedores,
  productosExistentes,
  variantesExistentes,
  categorias,
}: {
  sedeAlmacenId: string;
  sedeAlmacenCodigo: string;
  contenedores: Contenedor[];
  productosExistentes: ProductoExistente[];
  variantesExistentes: VarianteExistente[];
  categorias: Categoria[];
}) {
  const router = useRouter();
  const [origen, setOrigen] = useState<OrigenLote>("taller");
  const [proveedor, setProveedor] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ItemLote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const contenedorDefault = contenedores[0]?.id ?? "";

  const resultadosVariantes = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return variantesExistentes
      .filter((v) => `${v.sku} ${v.referencia} ${v.talla ?? ""} ${v.color ?? ""}`.toLowerCase().includes(term))
      .slice(0, 5);
  }, [variantesExistentes, q]);

  const resultadosProductos = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return productosExistentes.filter((p) => p.referencia.toLowerCase().includes(term)).slice(0, 5);
  }, [productosExistentes, q]);

  function agregarExistente(v: VarianteExistente) {
    setItems((actual) => [
      ...actual,
      {
        clientId: crypto.randomUUID(),
        modo: "existente",
        varianteId: v.varianteId,
        referencia: v.referencia,
        sku: v.sku,
        talla: v.talla ?? "",
        color: v.color ?? "",
        costo: 0,
        precio: 0,
        stockMinimo: 0,
        cantidad: 1,
        contenedorId: contenedorDefault,
      },
    ]);
    setQ("");
  }

  function agregarNuevaVarianteDeProducto(p: ProductoExistente) {
    setItems((actual) => [
      ...actual,
      {
        clientId: crypto.randomUUID(),
        modo: "nueva_variante",
        productoId: p.id,
        referencia: p.referencia,
        categoriaId: p.categoriaId ?? undefined,
        sku: "",
        talla: "",
        color: "",
        costo: 0,
        precio: 0,
        stockMinimo: 0,
        cantidad: 1,
        contenedorId: contenedorDefault,
      },
    ]);
    setQ("");
  }

  function agregarProductoNuevo() {
    setItems((actual) => [
      ...actual,
      {
        clientId: crypto.randomUUID(),
        modo: "nuevo_producto",
        referencia: q.trim(),
        skuPadre: q.trim() ? slug(q.trim()) : "",
        sku: "",
        talla: "",
        color: "",
        costo: 0,
        precio: 0,
        stockMinimo: 0,
        cantidad: 1,
        contenedorId: contenedorDefault,
      },
    ]);
    setQ("");
  }

  function actualizar(clientId: string, campo: keyof ItemLote, valor: string | number) {
    setItems((actual) =>
      actual.map((it) => {
        if (it.clientId !== clientId) return it;
        const next = { ...it, [campo]: valor };
        // Auto-sugerir sku cuando ya hay suficiente info, sin pisar si el usuario ya lo editó a mano.
        if ((campo === "talla" || campo === "color" || campo === "referencia") && !it.sku) {
          const base = next.skuPadre || slug(next.referencia || "");
          next.sku = [base, next.talla, next.color].filter(Boolean).join("-");
        }
        if (campo === "referencia" && next.modo === "nuevo_producto") {
          next.skuPadre = slug(String(valor));
        }
        // Cambiar de familia invalida la categoría elegida (pertenece a la familia anterior).
        if (campo === "familia") {
          next.categoriaId = "";
        }
        return next;
      })
    );
  }

  function tallasSugeridasDe(categoriaId?: string): string[] | null {
    if (!categoriaId) return null;
    return categorias.find((c) => c.id === categoriaId)?.tallasSugeridas ?? null;
  }

  function quitar(clientId: string) {
    setItems((actual) => actual.filter((it) => it.clientId !== clientId));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      setError("Agrega al menos una prenda al lote");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("recibir_lote", {
      p_sede_id: sedeAlmacenId,
      p_origen: origen,
      p_proveedor: origen === "proveedor" ? proveedor || undefined : undefined,
      p_numero_guia: numeroGuia || undefined,
      p_items: items.map((it) => ({
        variante_id: it.modo === "existente" ? it.varianteId : undefined,
        producto_id: it.modo === "nueva_variante" ? it.productoId : undefined,
        sku_padre: it.modo === "nuevo_producto" ? it.skuPadre : undefined,
        sku: it.modo !== "existente" ? it.sku : undefined,
        referencia: it.modo === "nuevo_producto" ? it.referencia : undefined,
        categoria_id: it.modo === "nuevo_producto" ? it.categoriaId : undefined,
        genero: it.modo === "nuevo_producto" ? it.genero : undefined,
        marca: it.modo === "nuevo_producto" ? it.marca : undefined,
        temporada: it.modo === "nuevo_producto" ? it.temporada : undefined,
        talla: it.modo !== "existente" ? it.talla || undefined : undefined,
        color: it.modo !== "existente" ? it.color || undefined : undefined,
        costo: it.modo !== "existente" ? it.costo : undefined,
        precio: it.modo !== "existente" ? it.precio : undefined,
        stock_minimo: it.modo !== "existente" ? it.stockMinimo : undefined,
        cantidad: it.cantidad,
        contenedor_id: it.contenedorId || undefined,
      })),
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setItems([]);
    setOk(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">Origen</label>
          <select
            value={origen}
            onChange={(e) => setOrigen(e.target.value as OrigenLote)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {ORIGENES_LOTE.map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_ORIGEN[o]}
              </option>
            ))}
          </select>
        </div>
        {origen === "proveedor" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Proveedor</label>
            <input
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-neutral-700">N° de guía (referencial)</label>
          <input
            value={numeroGuia}
            onChange={(e) => setNumeroGuia(e.target.value)}
            placeholder="Opcional"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-700">Buscar prenda para agregar al lote</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Referencia, SKU, talla, color…"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        {q.trim() && (
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {resultadosVariantes.map((v) => (
              <button
                type="button"
                key={v.varianteId}
                onClick={() => agregarExistente(v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                <span>
                  {v.referencia} <span className="text-neutral-400">{[v.talla, v.color].filter(Boolean).join("/")}</span>
                </span>
                <span className="text-xs text-neutral-400">restock</span>
              </button>
            ))}
            {resultadosProductos.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => agregarNuevaVarianteDeProducto(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                <span>{p.referencia}</span>
                <span className="text-xs text-neutral-400">nueva talla/color</span>
              </button>
            ))}
            <button
              type="button"
              onClick={agregarProductoNuevo}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-50"
            >
              <span>+ Crear producto nuevo: &ldquo;{q.trim()}&rdquo;</span>
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.clientId} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium text-neutral-900">
                  {it.modo === "nuevo_producto" ? it.referencia || "(nuevo producto)" : it.referencia}
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    {it.modo === "existente" ? "restock" : it.modo === "nueva_variante" ? "nueva variante" : "producto nuevo"}
                  </span>
                </p>
                <button type="button" onClick={() => quitar(it.clientId)} className="text-xs text-red-500">
                  Quitar
                </button>
              </div>

              {it.modo === "nuevo_producto" && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    value={it.referencia}
                    onChange={(e) => actualizar(it.clientId, "referencia", e.target.value)}
                    placeholder="Referencia"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <select
                    value={it.familia ?? ""}
                    onChange={(e) => actualizar(it.clientId, "familia", e.target.value)}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  >
                    <option value="">Familia…</option>
                    {FAMILIAS.map((f) => (
                      <option key={f} value={f}>
                        {ETIQUETA_FAMILIA[f]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={it.categoriaId ?? ""}
                    onChange={(e) => actualizar(it.clientId, "categoriaId", e.target.value)}
                    disabled={!it.familia}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:bg-neutral-50 disabled:text-neutral-400"
                  >
                    <option value="">Categoría…</option>
                    {categorias
                      .filter((c) => c.familia === it.familia)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </select>
                  <input
                    value={it.marca ?? ""}
                    onChange={(e) => actualizar(it.clientId, "marca", e.target.value)}
                    placeholder="Marca"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <input
                    value={it.genero ?? ""}
                    onChange={(e) => actualizar(it.clientId, "genero", e.target.value)}
                    placeholder="Género"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                </div>
              )}

              {it.modo !== "existente" && (
                <div className="mb-2 grid grid-cols-3 gap-2">
                  {(() => {
                    const tallas = tallasSugeridasDe(it.categoriaId);
                    return tallas && tallas.length > 0 ? (
                      <select
                        value={it.talla}
                        onChange={(e) => actualizar(it.clientId, "talla", e.target.value)}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      >
                        <option value="">Talla…</option>
                        {tallas.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={it.talla}
                        onChange={(e) => actualizar(it.clientId, "talla", e.target.value)}
                        placeholder="Talla"
                        className="rounded border border-neutral-300 px-2 py-1 text-xs"
                      />
                    );
                  })()}
                  <input
                    value={it.color}
                    onChange={(e) => actualizar(it.clientId, "color", e.target.value)}
                    placeholder="Color"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <input
                    value={it.sku}
                    onChange={(e) => actualizar(it.clientId, "sku", e.target.value)}
                    placeholder="SKU"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.10"
                    value={it.costo}
                    onChange={(e) => actualizar(it.clientId, "costo", Number(e.target.value))}
                    placeholder="Costo S/"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.10"
                    value={it.precio}
                    onChange={(e) => actualizar(it.clientId, "precio", Number(e.target.value))}
                    placeholder="Precio S/"
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    value={it.stockMinimo}
                    onChange={(e) => actualizar(it.clientId, "stockMinimo", Number(e.target.value))}
                    placeholder="Stock mín."
                    className="rounded border border-neutral-300 px-2 py-1 text-xs"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={it.cantidad}
                  onChange={(e) => actualizar(it.clientId, "cantidad", Number(e.target.value))}
                  className="w-16 rounded border border-neutral-300 px-1.5 py-1 text-center text-xs"
                />
                <span className="text-xs text-neutral-400">en</span>
                <select
                  value={it.contenedorId}
                  onChange={(e) => actualizar(it.clientId, "contenedorId", e.target.value)}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
                >
                  <option value="">Sin contenedor</option>
                  {contenedores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {contenedores.length === 0 && (
        <p className="text-xs text-amber-600">
          Todavía no hay contenedores creados para el almacén {sedeAlmacenCodigo} — puedes recibir igual sin ubicación.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-600">Lote recibido correctamente.</p>}

      <button
        type="submit"
        disabled={loading || items.length === 0}
        className="w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {loading ? "Guardando…" : `Recibir lote (${items.length} ítem${items.length === 1 ? "" : "s"})`}
      </button>
    </form>
  );
}
