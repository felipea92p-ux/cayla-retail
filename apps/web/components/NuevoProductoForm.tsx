"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FAMILIAS, type Familia } from "@cayla-retail/shared";
import { traducirError } from "@/lib/error-escritura";
import type { ColorElegible } from "@/lib/conteo";

type Categoria = { id: string; familia: string; nombre: string; tallasSugeridas: string[] | null };
type Proveedor = { id: string; nombre: string };

type Fila = {
  key: string;
  talla: string | null;
  /** El nombre canónico del vocabulario (0046). Solo para leerlo y armar el SKU. */
  color: string | null;
  /** El código de tres letras que la RPC resuelve contra `colores` — el dato de verdad. */
  colorId: string | null;
  sku: string;
  costo: number;
  precio: number;
  precioOferta: number | "";
  stockMinimo: number;
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

function claveCombo(talla: string | null, colorId: string | null) {
  return `${talla ?? ""}||${colorId ?? ""}`;
}

export function NuevoProductoForm({
  categorias,
  proveedores,
  colores: vocabulario,
}: {
  categorias: Categoria[];
  proveedores: Proveedor[];
  /** El vocabulario cerrado de colores (0046, ADR-0024). Un color que no está acá no existe. */
  colores: ColorElegible[];
}) {
  const router = useRouter();

  const [referencia, setReferencia] = useState("");
  const [skuPadre, setSkuPadre] = useState("");
  const [skuPadreTocado, setSkuPadreTocado] = useState(false);
  const [familia, setFamilia] = useState<Familia | "">("");
  const [categoriaId, setCategoriaId] = useState("");
  const [marca, setMarca] = useState("");
  const [genero, setGenero] = useState("");
  const [temporada, setTemporada] = useState("");
  const [proveedorId, setProveedorId] = useState("");

  const [tallas, setTallas] = useState<string[]>([]);
  const [tallaNueva, setTallaNueva] = useState("");
  // Los colores elegidos son entradas del vocabulario, nunca texto: hasta el 2026-09-11
  // este formulario aceptaba «azul» a mano, la RPC lo guardaba tal cual y la variante
  // nacía sin código corto (docs/ESTANDAR-TALLA-Y-COLOR.md, mecanismo 1).
  const [colores, setColores] = useState<ColorElegible[]>([]);
  const [colorNuevo, setColorNuevo] = useState("");

  const [costoBase, setCostoBase] = useState(0);
  const [precioBase, setPrecioBase] = useState(0);
  const [stockMinimoBase, setStockMinimoBase] = useState(0);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  function onReferenciaChange(valor: string) {
    setReferencia(valor);
    if (!skuPadreTocado) setSkuPadre(slug(valor));
  }

  function onCategoriaChange(id: string) {
    setCategoriaId(id);
    const sugeridas = categorias.find((c) => c.id === id)?.tallasSugeridas;
    if (sugeridas && sugeridas.length > 0) setTallas(sugeridas);
  }

  function agregarTalla() {
    const t = tallaNueva.trim();
    if (!t || tallas.includes(t)) return;
    setTallas((actual) => [...actual, t]);
    setTallaNueva("");
  }

  function agregarColor() {
    const elegido = vocabulario.find((c) => c.codigo === colorNuevo);
    if (!elegido || colores.some((c) => c.codigo === elegido.codigo)) return;
    setColores((actual) => [...actual, elegido]);
    setColorNuevo("");
  }
  const coloresDisponibles = vocabulario.filter((c) => !colores.some((x) => x.codigo === c.codigo));

  // Genera la matriz talla × color a partir de lo elegido — conserva las filas
  // ya generadas que sigan aplicando (si ya editaste su precio/SKU a mano no
  // se pierde al agregar una talla más) y agrega solo las combinaciones nuevas.
  function generarVariantes() {
    setFilas((actual) => {
      const porClave = new Map(actual.map((f) => [claveCombo(f.talla, f.colorId), f]));
      const listaTallas = tallas.length > 0 ? tallas : [null];
      const listaColores: (ColorElegible | null)[] = colores.length > 0 ? colores : [null];
      return listaTallas.flatMap((talla) =>
        listaColores.map((color) => {
          const existente = porClave.get(claveCombo(talla, color?.codigo ?? null));
          if (existente) return existente;
          // El SKU lleva el código del color (AZM), no su nombre: es más corto y no cambia
          // si un día se renombra el color en el vocabulario.
          const sku = [skuPadre, talla, color?.codigo].filter(Boolean).map((p) => slug(String(p))).join("-") || skuPadre;
          return {
            key: crypto.randomUUID(),
            talla,
            color: color?.nombre ?? null,
            colorId: color?.codigo ?? null,
            sku,
            costo: costoBase,
            precio: precioBase,
            precioOferta: "",
            stockMinimo: stockMinimoBase,
          };
        })
      );
    });
  }

  function aplicarPreciosBase() {
    setFilas((actual) => actual.map((f) => ({ ...f, costo: costoBase, precio: precioBase, stockMinimo: stockMinimoBase })));
  }

  function actualizarFila(key: string, campo: keyof Fila, valor: string | number) {
    setFilas((actual) => actual.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)));
  }

  function quitarFila(key: string) {
    setFilas((actual) => actual.filter((f) => f.key !== key));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!referencia.trim()) {
      setError("Falta el nombre del producto (referencia)");
      return;
    }
    if (!skuPadre.trim()) {
      setError("Falta el SKU del producto");
      return;
    }
    if (filas.length === 0) {
      setError('Agrega al menos una talla o color y toca "Generar variantes"');
      return;
    }
    if (filas.some((f) => !f.sku.trim())) {
      setError("Todas las variantes necesitan SKU");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: errRpc } = await supabase.rpc("crear_producto_con_variantes", {
      p_sku_padre: skuPadre.trim(),
      p_referencia: referencia.trim(),
      p_categoria_id: categoriaId || undefined,
      p_genero: genero.trim() || undefined,
      p_marca: marca.trim() || undefined,
      p_temporada: temporada.trim() || undefined,
      p_proveedor_id: proveedorId || undefined,
      p_variantes: filas.map((f) => ({
        sku: f.sku.trim(),
        talla: f.talla || undefined,
        // La RPC (0059) resuelve `colorId` contra el vocabulario y guarda el nombre canónico;
        // `color` texto sigue existiendo solo para clientes viejos y acá ya no se manda.
        colorId: f.colorId || undefined,
        costo: f.costo,
        precio: f.precio,
        precioOferta: f.precioOferta === "" ? undefined : f.precioOferta,
        stockMinimo: f.stockMinimo,
      })),
    });
    setLoading(false);

    if (errRpc) {
      setError(traducirError(errRpc, "crear el producto"));
      return;
    }
    setOk(`"${referencia}" creado con ${filas.length} variante${filas.length === 1 ? "" : "s"}.`);
    router.push("/inventario");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ==================== Datos del producto ==================== */}
      <div className="card-cayla space-y-3 p-4">
        <p className="label-cayla text-[11px] text-tinta/65">Producto</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Referencia (nombre del modelo)</label>
            <input
              value={referencia}
              onChange={(e) => onReferenciaChange(e.target.value)}
              placeholder="Ej. Reflixme"
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">SKU del modelo</label>
            <input
              value={skuPadre}
              onChange={(e) => {
                setSkuPadre(e.target.value);
                setSkuPadreTocado(true);
              }}
              placeholder="Se sugiere solo desde la referencia"
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm font-mono text-tinta outline-none focus:border-rojo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Familia</label>
            <select
              value={familia}
              onChange={(e) => {
                setFamilia(e.target.value as Familia);
                setCategoriaId("");
              }}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Elegir…</option>
              {FAMILIAS.map((f) => (
                <option key={f} value={f}>
                  {ETIQUETA_FAMILIA[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Categoría</label>
            <select
              value={categoriaId}
              onChange={(e) => onCategoriaChange(e.target.value)}
              disabled={!familia}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo disabled:bg-sand disabled:text-tinta/65"
            >
              <option value="">{familia ? "Elegir…" : "Elige familia primero"}</option>
              {categorias
                .filter((c) => c.familia === familia)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Marca</label>
            <input
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Opcional"
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Género</label>
            <select
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Elegir…</option>
              <option value="Dama">Dama</option>
              <option value="Caballero">Caballero</option>
              <option value="Unisex">Unisex</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Temporada</label>
            <input
              value={temporada}
              onChange={(e) => setTemporada(e.target.value)}
              placeholder="Ej. Verano 2026"
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Proveedor habitual</label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Sin proveedor específico</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <p className="text-xs text-tinta/65">
              De quién viene normalmente este modelo — no bloquea recibirlo de otro proveedor después.
            </p>
          </div>
        </div>
      </div>

      {/* ==================== Tallas y colores ==================== */}
      <div className="card-cayla space-y-4 p-4">
        <p className="label-cayla text-[11px] text-tinta/65">Tallas y colores</p>

        <div className="space-y-2">
          <label className="text-sm text-tinta/80">Tallas</label>
          {categoriaId && categorias.find((c) => c.id === categoriaId)?.tallasSugeridas == null && (
            <p className="text-xs text-tinta/65">Esta categoría no tiene tallas sugeridas — agrégalas a mano.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {tallas.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTallas((actual) => actual.filter((x) => x !== t))}
                className="border border-tinta/25 bg-sand px-2.5 py-1 text-xs text-tinta hover:border-rojo hover:text-rojo"
                title="Quitar talla"
              >
                {t} ×
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tallaNueva}
              onChange={(e) => setTallaNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarTalla();
                }
              }}
              placeholder="Agregar talla (ej. M)"
              className="flex-1 border border-tinta/20 bg-crema px-3 py-1.5 text-sm text-tinta outline-none focus:border-rojo"
            />
            <button type="button" onClick={agregarTalla} className="label-cayla rounded-md border border-tinta/25 px-3 py-1.5 text-[11px] text-tinta hover:border-rojo hover:text-rojo">
              + Agregar
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-tinta/80" htmlFor="nuevo-color">Colores</label>
          <div className="flex flex-wrap gap-1.5">
            {colores.map((c) => (
              <button
                key={c.codigo}
                type="button"
                onClick={() => setColores((actual) => actual.filter((x) => x.codigo !== c.codigo))}
                className="inline-flex items-center gap-1.5 border border-tinta/25 bg-sand px-2.5 py-1 text-xs text-tinta hover:border-rojo hover:text-rojo"
                title="Quitar color"
              >
                {c.hex && <span aria-hidden className="inline-block h-3 w-3 border border-tinta/20" style={{ backgroundColor: c.hex }} />}
                {c.nombre} <span className="font-mono text-[10px] text-tinta/55">{c.codigo}</span> ×
              </button>
            ))}
          </div>
          {/* Un color que no está en el vocabulario no se puede teclear: se agrega en
              Inventario → Vocabulario (solo Líder), no acá con un nombre suelto. */}
          <div className="flex gap-2">
            <select
              id="nuevo-color"
              value={colorNuevo}
              onChange={(e) => setColorNuevo(e.target.value)}
              className="flex-1 border border-tinta/20 bg-crema px-3 py-1.5 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Elegir un color del vocabulario…</option>
              {coloresDisponibles.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.nombre} ({c.codigo})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={agregarColor}
              disabled={!colorNuevo}
              className="label-cayla rounded-md border border-tinta/25 px-3 py-1.5 text-[11px] text-tinta hover:border-rojo hover:text-rojo disabled:opacity-40"
            >
              + Agregar
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-tinta/10 pt-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Costo S/ (por defecto)</label>
            <input
              type="number"
              min={0}
              step="0.10"
              value={costoBase}
              onChange={(e) => setCostoBase(Number(e.target.value))}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Precio S/ (por defecto)</label>
            <input
              type="number"
              min={0}
              step="0.10"
              value={precioBase}
              onChange={(e) => setPrecioBase(Number(e.target.value))}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-tinta/80">Stock mínimo (por defecto)</label>
            <input
              type="number"
              min={0}
              value={stockMinimoBase}
              onChange={(e) => setStockMinimoBase(Number(e.target.value))}
              className="w-full border border-tinta/20 bg-crema px-3 py-2 text-sm text-tinta outline-none focus:border-rojo"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generarVariantes}
            className="label-cayla rounded-md bg-tinta px-4 py-2.5 text-[11px] text-crema hover:bg-rojo"
          >
            Generar variantes ({(tallas.length || 1) * (colores.length || 1)})
          </button>
          {filas.length > 0 && (
            <button
              type="button"
              onClick={aplicarPreciosBase}
              className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta hover:border-rojo hover:text-rojo"
            >
              Aplicar costo/precio/mínimo a todas
            </button>
          )}
        </div>
      </div>

      {/* ==================== Tabla de variantes generadas ==================== */}
      {filas.length > 0 && (
        <div className="card-cayla space-y-2 overflow-x-auto p-4">
          <p className="label-cayla text-[11px] text-tinta/65">Variantes ({filas.length})</p>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-tinta/65">
                <th className="pb-2 pr-2">Talla</th>
                <th className="pb-2 pr-2">Color</th>
                <th className="pb-2 pr-2">SKU</th>
                <th className="pb-2 pr-2">Costo S/</th>
                <th className="pb-2 pr-2">Precio S/</th>
                <th className="pb-2 pr-2">Stock mín.</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.key} className="border-t border-tinta/10">
                  <td className="py-1.5 pr-2 text-tinta/80">{f.talla ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-tinta/80">{f.color ?? "—"}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={f.sku}
                      onChange={(e) => actualizarFila(f.key, "sku", e.target.value)}
                      className="w-32 border border-tinta/20 bg-crema px-2 py-1 text-xs font-mono text-tinta outline-none focus:border-rojo"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      value={f.costo}
                      onChange={(e) => actualizarFila(f.key, "costo", Number(e.target.value))}
                      className="w-20 border border-tinta/20 bg-crema px-2 py-1 text-xs text-tinta outline-none focus:border-rojo"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={0}
                      step="0.10"
                      value={f.precio}
                      onChange={(e) => actualizarFila(f.key, "precio", Number(e.target.value))}
                      className="w-20 border border-tinta/20 bg-crema px-2 py-1 text-xs text-tinta outline-none focus:border-rojo"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={0}
                      value={f.stockMinimo}
                      onChange={(e) => actualizarFila(f.key, "stockMinimo", Number(e.target.value))}
                      className="w-16 border border-tinta/20 bg-crema px-2 py-1 text-xs text-tinta outline-none focus:border-rojo"
                    />
                  </td>
                  <td className="py-1.5">
                    <button type="button" onClick={() => quitarFila(f.key)} className="text-xs text-rojo/70 hover:text-rojo">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-tinta/65">
            Quita las combinaciones que no existen físicamente (ej. no fabricas XL en Blanco).
          </p>
        </div>
      )}

      {error && <p className="text-sm text-rojo">{error}</p>}
      {ok && <p className="text-sm text-tinta/80">{ok}</p>}

      <button
        type="submit"
        disabled={loading || filas.length === 0}
        className="label-cayla rounded-md w-full bg-tinta px-4 py-3 text-[11px] text-crema hover:bg-rojo disabled:opacity-50"
      >
        {loading ? "Creando…" : `Crear producto (${filas.length} variante${filas.length === 1 ? "" : "s"})`}
      </button>
      <p className="text-center text-xs text-tinta/65">
        El producto queda en el catálogo con 0 unidades en todas las sedes — para ingresar stock usa
        &ldquo;Recibir mercadería&rdquo;. La foto se agrega después, desde la ficha del producto.
      </p>
    </form>
  );
}
