"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

// Los campos compactos de cada ítem solo tenían placeholder — desaparece al
// escribir y ya no se distingue qué campo es cuál (Felipe lo notó probando
// con datos reales: costo/precio/stock mínimo se ven idénticos una vez
// llenos). Envuelve cada input con una etiqueta fija arriba, sin agregar
// una prop nueva por campo.
function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] text-neutral-400">{etiqueta}</span>
      {children}
    </label>
  );
}

export function RecibirLoteForm({
  sedeId,
  sedeCodigo,
  contenedorAlmacenId,
  contenedores,
  productosExistentes,
  variantesExistentes,
  categorias,
  proveedoresDirectorio = [],
  ordenesPendientes = [],
  produccionesPendientes = [],
}: {
  sedeId: string;
  sedeCodigo: string;
  /** Contenedor tipo 'almacen' de esta sede — a donde caen las prendas por defecto (recibidas, sin bajar a piso todavía). */
  contenedorAlmacenId: string;
  contenedores: Contenedor[];
  productosExistentes: ProductoExistente[];
  variantesExistentes: VarianteExistente[];
  categorias: Categoria[];
  proveedoresDirectorio?: { id: string; nombre: string }[];
  /** Órdenes de compra pendientes de la sede: ligarlas cierra el ciclo pedido→recibido (F2). */
  ordenesPendientes?: { id: string; proveedor: string; montoEstimado: number | null }[];
  /** Producciones del Taller en camino a esta tienda: ligarlas las marca completadas. */
  produccionesPendientes?: { id: string; descripcion: string }[];
}) {
  const router = useRouter();
  const [origen, setOrigen] = useState<OrigenLote>("taller");
  const [proveedor, setProveedor] = useState("");
  const [ordenCompraId, setOrdenCompraId] = useState("");
  const [ordenProduccionId, setOrdenProduccionId] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [nota, setNota] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ItemLote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<{ items: number; unidades: number } | null>(null);

  const contenedorDefault = contenedorAlmacenId;

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

  function agregarProductoNuevo(referenciaInicial = "") {
    const ref = referenciaInicial.trim();
    setItems((actual) => [
      ...actual,
      {
        clientId: crypto.randomUUID(),
        modo: "nuevo_producto",
        referencia: ref,
        skuPadre: ref ? slug(ref) : "",
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
      p_sede_id: sedeId,
      p_origen: origen,
      p_proveedor: origen === "proveedor" ? proveedor.trim() || undefined : undefined,
      p_orden_compra_id: origen === "proveedor" && ordenCompraId ? ordenCompraId : undefined,
      p_orden_produccion_id: origen === "taller" && ordenProduccionId ? ordenProduccionId : undefined,
      p_numero_guia: numeroGuia || undefined,
      p_nota: nota.trim() || undefined,
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
    setOk({ items: items.length, unidades: items.reduce((total, it) => total + it.cantidad, 0) });
    setItems([]);
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
            {proveedoresDirectorio.length > 0 ? (
              <>
                <select
                  value={proveedoresDirectorio.some((p) => p.nombre === proveedor) ? proveedor : proveedor ? "__otro__" : ""}
                  onChange={(e) => setProveedor(e.target.value === "__otro__" ? " " : e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="">Elegir del directorio…</option>
                  {proveedoresDirectorio.map((p) => (
                    <option key={p.id} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                  <option value="__otro__">Otro (escribir)…</option>
                </select>
                {proveedor && !proveedoresDirectorio.some((p) => p.nombre === proveedor) && (
                  <input
                    value={proveedor.trim()}
                    onChange={(e) => setProveedor(e.target.value || " ")}
                    placeholder="Nombre del proveedor nuevo"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                )}
              </>
            ) : (
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            )}
          </div>
        )}
        {origen === "taller" && produccionesPendientes.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">¿Corresponde a una producción del Taller?</label>
            <select
              value={ordenProduccionId}
              onChange={(e) => setOrdenProduccionId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">No / sin ligar</option>
              {produccionesPendientes.map((p) => (
                <option key={p.id} value={p.id}>{p.descripcion}</option>
              ))}
            </select>
            <p className="text-xs text-neutral-400">Al recibir, la producción se marca completada sola.</p>
          </div>
        )}
        {origen === "proveedor" && ordenesPendientes.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">¿Corresponde a una orden de compra?</label>
            <select
              value={ordenCompraId}
              onChange={(e) => {
                const id = e.target.value;
                setOrdenCompraId(id);
                const orden = ordenesPendientes.find((o) => o.id === id);
                if (orden) setProveedor(orden.proveedor);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">No / sin orden</option>
              {ordenesPendientes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.proveedor}
                  {o.montoEstimado != null ? ` · ~S/${o.montoEstimado.toFixed(0)}` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-400">Al recibir, la orden se marca recibida sola.</p>
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
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-neutral-700">Nota del lote</label>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej. Se pidieron 50, llegaron 46 — faltan 4, EGTI dice que llegan la próxima semana"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-neutral-400">
            Queda guardada en el lote para siempre — el sistema no compara automático lo pedido vs. lo llegado, esta
            es la forma de dejarlo registrado.
          </p>
        </div>
      </div>

      {/* Camino principal: mercadería nueva (la mayoría de un fardo). Un clic abre la
          ficha completa con talla/color/categoría desde el inicio — sin buscar primero. */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => agregarProductoNuevo()}
          className="w-full rounded-lg border-2 border-dashed border-neutral-300 px-3 py-3 text-sm font-medium text-neutral-800 hover:border-neutral-500 hover:bg-neutral-50"
        >
          + Agregar prenda nueva
        </button>

        {/* Camino secundario: reingreso de algo que ya está en el catálogo. */}
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-500">
            ¿Reingreso de algo que ya existe? Búscalo para no duplicarlo:
          </label>
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
              {resultadosVariantes.length === 0 && resultadosProductos.length === 0 && (
                <p className="px-3 py-2 text-xs text-neutral-400">
                  No hay coincidencias. Si es mercadería nueva, usa &ldquo;+ Agregar prenda nueva&rdquo; arriba.
                </p>
              )}
            </div>
          )}
        </div>
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
                  <p className="col-span-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    Producto
                  </p>
                  <Campo etiqueta="Referencia">
                    <input
                      value={it.referencia}
                      onChange={(e) => actualizar(it.clientId, "referencia", e.target.value)}
                      placeholder="Ej. Blusa manga larga"
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Familia">
                    <select
                      value={it.familia ?? ""}
                      onChange={(e) => actualizar(it.clientId, "familia", e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    >
                      <option value="">Elegir…</option>
                      {FAMILIAS.map((f) => (
                        <option key={f} value={f}>
                          {ETIQUETA_FAMILIA[f]}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Categoría">
                    <select
                      value={it.categoriaId ?? ""}
                      onChange={(e) => actualizar(it.clientId, "categoriaId", e.target.value)}
                      disabled={!it.familia}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs disabled:bg-neutral-50 disabled:text-neutral-400"
                    >
                      <option value="">{it.familia ? "Elegir…" : "Elige familia primero"}</option>
                      {categorias
                        .filter((c) => c.familia === it.familia)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Marca">
                    <input
                      value={it.marca ?? ""}
                      onChange={(e) => actualizar(it.clientId, "marca", e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Género">
                    <input
                      value={it.genero ?? ""}
                      onChange={(e) => actualizar(it.clientId, "genero", e.target.value)}
                      placeholder="Ej. Dama, Caballero, Unisex"
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                </div>
              )}

              {it.modo !== "existente" && (
                <div className="mb-2 grid grid-cols-3 gap-2">
                  <p className="col-span-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                    Prenda (talla, color y precios)
                  </p>
                  <Campo etiqueta="Talla">
                    {(() => {
                      const tallas = tallasSugeridasDe(it.categoriaId);
                      return tallas && tallas.length > 0 ? (
                        <select
                          value={it.talla}
                          onChange={(e) => actualizar(it.clientId, "talla", e.target.value)}
                          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                        >
                          <option value="">Elegir…</option>
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
                          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                        />
                      );
                    })()}
                  </Campo>
                  <Campo etiqueta="Color">
                    <input
                      value={it.color}
                      onChange={(e) => actualizar(it.clientId, "color", e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="SKU">
                    <input
                      value={it.sku}
                      onChange={(e) => actualizar(it.clientId, "sku", e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                    />
                  </Campo>
                  <Campo etiqueta="Costo S/">
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      value={it.costo}
                      onChange={(e) => actualizar(it.clientId, "costo", Number(e.target.value))}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Precio S/">
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      value={it.precio}
                      onChange={(e) => actualizar(it.clientId, "precio", Number(e.target.value))}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                  <Campo etiqueta="Stock mínimo">
                    <input
                      type="number"
                      min={0}
                      value={it.stockMinimo}
                      onChange={(e) => actualizar(it.clientId, "stockMinimo", Number(e.target.value))}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </Campo>
                </div>
              )}

              <p className="mb-0.5 text-[10px] text-neutral-400">Cantidad recibida</p>
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
          Todavía no hay contenedores creados para {sedeCodigo} — puedes recibir igual sin ubicación.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">
            ✓ Recibido: {ok.items} ítem{ok.items === 1 ? "" : "s"}, {ok.unidades} unidad{ok.unidades === 1 ? "" : "es"} en total.
          </p>
          <p className="mt-1 text-xs text-green-700">
            Quedó en tu <Link href="/inventario/almacen" className="underline">Almacén</Link> — todavía no está en el
            piso de venta. En <Link href="/inventario" className="underline">Catálogo</Link> lo vas a ver como
            &ldquo;+N en almacén&rdquo; junto al stock del modelo. Para poder venderlo, bájalo a tienda desde Almacén.
          </p>
        </div>
      )}

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
