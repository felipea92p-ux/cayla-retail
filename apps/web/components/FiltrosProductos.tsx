"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Banknote, CircleCheck, PackageSearch, Palette, Shirt, Tag, Truck } from "lucide-react";
import { Slider } from "radix-ui";
import { CampoTexto } from "@/components/ui/campos";
import { BotonFiltros, DesplegablePildora, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SenalBuscando, useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { ORDENES_DESPLEGABLE, ROTULO_ORDEN_PRODUCTOS, leerOrdenProductos } from "@/lib/productos-orden";
import { SIN_EN_URL } from "@/lib/marcas";

// Filtros de /productos. Mismo patrón que `FiltrosMovimientos.tsx`: viven en
// la URL, la página es un Server Component que filtra en Postgres
// (fn_productos/fn_productos_resumen), y cambiar un filtro vuelve a la
// página 1 — un filtro nuevo sobre "página 7" case casi siempre en vacío.
type Opcion = { id: string; nombre: string };
type OpcionColor = Opcion & { hex: string | null };

const PRECIO_MIN = 0;
const PRECIO_MAX = 999;

/** Una sola forma desde el 2026-09-28 (ADR-0254, pedido de Felipe): buscador + botón «Filtros» que despliega el panel
 *  de píldoras, en la Grilla y en la Tabla. Nació como el modo `compacto` de la Grilla (2026-09-17, tres pasadas: a
 *  Felipe le gustaba más plegado). La tarjeta de nueve campos que usaba la Tabla se borró: dos pieles del mismo filtro
 *  en la misma pantalla hacían que cambiar de vista pareciera cambiar de sistema. */
export function FiltrosProductos({
  categorias,
  colores,
  marcas,
  proveedores,
}: {
  categorias: Opcion[];
  colores: OpcionColor[];
  /** Marcas y proveedores activos (ADR-0109): filtrar el catálogo por de quién es y quién lo trae. */
  marcas: Opcion[];
  proveedores: Opcion[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [precioMin, setPrecioMin] = useState(params.get("precioMin") ?? "");
  const [precioMax, setPrecioMax] = useState(params.get("precioMax") ?? "");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const primera = useRef(true);
  const { buscando, buscar } = useBusquedaEnUrl();
  const etiquetaBuscar = (
    <span className="flex items-baseline justify-between gap-2">
      Buscar
      <SenalBuscando activo={buscando} />
    </span>
  );

  /** `tipeado`: viene del buscador o del precio (se escribió o se arrastró): navega sin el loader, con «Buscando…». */
  function aplicar(cambios: Record<string, string>, { tipeado = false } = {}) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("pagina");
    const qs = p.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (tipeado) buscar(href);
    else router.push(href);
  }

  // Búsqueda y precio se mandan solos al dejar de tipear/arrastrar (350 ms) —
  // el slider de precio solo llama a `setPrecioMin`/`setPrecioMax` en cada
  // paso, este mismo efecto hace de debounce para los dos, sin lógica propia.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      const cambios: Record<string, string> = {};
      if ((params.get("q") ?? "") !== busqueda.trim()) cambios.q = busqueda.trim();
      if ((params.get("precioMin") ?? "") !== precioMin.trim()) cambios.precioMin = precioMin.trim();
      if ((params.get("precioMax") ?? "") !== precioMax.trim()) cambios.precioMax = precioMax.trim();
      if (Object.keys(cambios).length > 0) aplicar(cambios, { tipeado: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, precioMin, precioMax]);

  const cat = params.get("cat");
  const marca = params.get("marca");
  const proveedor = params.get("proveedor");
  const color = params.get("color");
  const estado = params.get("estado");
  const stock = params.get("stock");
  const orden = params.get("orden");

  const chips: { texto: string; quitar: Record<string, string> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: { q: "" } });
  const ordenLeido = leerOrdenProductos(orden);
  if (ordenLeido) chips.push({ texto: ROTULO_ORDEN_PRODUCTOS[ordenLeido], quitar: { orden: "" } });
  if (cat) chips.push({ texto: categorias.find((c) => c.id === cat)?.nombre ?? "Categoría", quitar: { cat: "" } });
  // Con prefijo: una marca y su proveedor pueden llamarse igual («Adidas» / «Adidas»), y dos botones que dicen lo mismo no se distinguen.
  // `sin` = los productos que todavía no tienen marca / proveedor (ADR-0283).
  if (marca) chips.push({ texto: `Marca: ${marca === SIN_EN_URL ? "sin marca" : (marcas.find((m) => m.id === marca)?.nombre ?? "—")}`, quitar: { marca: "" } });
  if (proveedor) chips.push({ texto: `Proveedor: ${proveedor === SIN_EN_URL ? "sin proveedor" : (proveedores.find((p) => p.id === proveedor)?.nombre ?? "—")}`, quitar: { proveedor: "" } });
  if (color) chips.push({ texto: colores.find((c) => c.id === color)?.nombre ?? "Color", quitar: { color: "" } });
  if (estado) chips.push({ texto: estado === "activo" ? "Activo" : "Descontinuado", quitar: { estado: "" } });
  if (stock) {
    chips.push({
      texto: stock === "sin_stock" ? "Sin stock" : stock === "bajo" ? "Stock bajo" : "Pedir a proveedor",
      quitar: { stock: "" },
    });
  }
  if (precioMin || precioMax) {
    chips.push({
      texto:
        precioMin && precioMax
          ? `S/${precioMin} – S/${precioMax}`
          : precioMin
            ? `Desde S/${precioMin}`
            : `Hasta S/${precioMax}`,
      quitar: { precioMin: "", precioMax: "" },
    });
  }

  const bloqueChips = chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={Object.keys(c.quitar).join("|")}
          type="button"
          onClick={() => {
            if ("q" in c.quitar) setBusqueda("");
            if ("precioMin" in c.quitar) {
              setPrecioMin("");
              setPrecioMax("");
            }
            aplicar(c.quitar);
          }}
          className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
          aria-label={`Quitar filtro ${c.texto}`}
        >
          {c.texto}
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setBusqueda("");
          setPrecioMin("");
          setPrecioMax("");
          router.push(pathname);
        }}
        className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
      >
        Limpiar todo
      </button>
    </div>
  );

  const activos = [cat, marca, proveedor, color, estado, stock, orden, precioMin || precioMax ? "precio" : ""].filter(Boolean).length;
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <CampoTexto
            etiqueta={etiquetaBuscar}
            trabajando={buscando}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Prenda, código o código de barras…"
            autoComplete="off"
            type="search"
          />
        </div>
        {/* Mismo ritmo vertical que `Campo` (etiqueta + mt-1.5 + control) para
            que el botón quede a la altura del input, no de toda la columna. */}
        <div className="shrink-0">
          <span aria-hidden className="label-cayla block text-[11px] text-transparent">
            {" "}
          </span>
          <BotonFiltros abierto={panelAbierto} activos={activos} onClick={() => setPanelAbierto((v) => !v)} />
        </div>
      </div>

      {panelAbierto && (
        <PanelPildoras>
          <BotonesOrdenPrecio orden={orden} onOrden={(v) => aplicar({ orden: v })} />

          {/* Recientes, antiguos y vendidos (Felipe, 2026-09-29). El mismo parámetro `orden` que las flechas de precio: si
              hay una de precio activa, aquí queda «Por nombre», que es apagar cualquiera de las dos. */}
          <DesplegablePildora
            icono={ArrowUpDown}
            etiqueta="Ordenar"
            valor={(ORDENES_DESPLEGABLE as readonly string[]).includes(orden ?? "") ? (orden as string) : TODOS}
            onValor={(v) => aplicar({ orden: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Por nombre (A–Z)" },
              ...ORDENES_DESPLEGABLE.map((o) => ({ valor: o as string, texto: ROTULO_ORDEN_PRODUCTOS[o] })),
            ]}
          />

          <DesplegablePildora
            icono={Shirt}
            etiqueta="Categoría"
            valor={cat ?? TODOS}
            onValor={(v) => aplicar({ cat: v === TODOS ? "" : v })}
            opciones={[{ valor: TODOS, texto: "Todas" }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))]}
          />

          <DesplegablePildora
            icono={Tag}
            etiqueta="Marca"
            valor={marca ?? TODOS}
            onValor={(v) => aplicar({ marca: v === TODOS ? "" : v })}
            opciones={[{ valor: TODOS, texto: "Todas" }, { valor: SIN_EN_URL, texto: "Sin marca" }, ...marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]}
          />

          <DesplegablePildora
            icono={Truck}
            etiqueta="Proveedor"
            valor={proveedor ?? TODOS}
            onValor={(v) => aplicar({ proveedor: v === TODOS ? "" : v })}
            opciones={[{ valor: TODOS, texto: "Todos" }, { valor: SIN_EN_URL, texto: "Sin proveedor" }, ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))]}
          />

          <DesplegablePildora
            icono={Palette}
            etiqueta="Color"
            valor={color ?? TODOS}
            onValor={(v) => aplicar({ color: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todos" },
              ...colores.map((c) => ({
                valor: c.id,
                texto: c.nombre,
                icono: <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/15" style={{ background: c.hex ?? "#d8d3c7" }} />,
              })),
            ]}
          />

          <DesplegablePildora
            icono={CircleCheck}
            etiqueta="Estado"
            valor={estado ?? TODOS}
            onValor={(v) => aplicar({ estado: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todos" },
              { valor: "activo", texto: "Activo" },
              { valor: "descontinuado", texto: "Descontinuado" },
            ]}
          />

          <DesplegablePildora
            icono={PackageSearch}
            etiqueta="Stock"
            valor={stock ?? TODOS}
            onValor={(v) => aplicar({ stock: v === TODOS ? "" : v })}
            opciones={[
              { valor: TODOS, texto: "Todos" },
              { valor: "sin_stock", texto: "Sin stock" },
              { valor: "bajo", texto: "Stock bajo" },
              { valor: "reponer", texto: "Pedir a proveedor" },
            ]}
          />

          <PildoraPrecio
            precioMin={precioMin}
            precioMax={precioMax}
            onCambiar={(min, max) => {
              setPrecioMin(min);
              setPrecioMax(max);
            }}
          />
        </PanelPildoras>
      )}

      {bloqueChips}
    </div>
  );
}

/** Orden por precio (2026-09-17, pedido de Felipe: nada de texto tipo
 *  "Relevancia" — dos flechas, cada una clicable por separado, cada una
 *  sabe si está activa). Clic en la activa la apaga (vuelve al orden de
 *  siempre); clic en la otra la reemplaza — nunca las dos a la vez, es
 *  lo mismo que ya hacía el desplegable que reemplaza. El color (rojo
 *  cuando está activa) es la única marca visual; el tooltip (mismo
 *  patrón que ya usa `PuntoDeVentaCatalogo.tsx`) dice qué hace cada una
 *  para quien no lo adivine solo con la flecha. */
function BotonesOrdenPrecio({ orden, onOrden }: { orden: string | null; onOrden: (v: string) => void }) {
  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex shrink-0 items-center px-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOrden(orden === "precio_asc" ? "" : "precio_asc")}
              aria-pressed={orden === "precio_asc"}
              aria-label="Ordenar por precio: menor a mayor"
              className={`flex h-9 w-7 items-center justify-center transition-colors ${
                orden === "precio_asc" ? "text-rojo" : "text-tinta/40 hover:text-tinta/70"
              }`}
            >
              <ArrowUp aria-hidden className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={4}>Precio: menor a mayor</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onOrden(orden === "precio_desc" ? "" : "precio_desc")}
              aria-pressed={orden === "precio_desc"}
              aria-label="Ordenar por precio: mayor a menor"
              className={`flex h-9 w-7 items-center justify-center transition-colors ${
                orden === "precio_desc" ? "text-rojo" : "text-tinta/40 hover:text-tinta/70"
              }`}
            >
              <ArrowDown aria-hidden className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={4}>Precio: mayor a menor</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Precio como rango de arrastre en vez de dos casillas — pedido de Felipe.
 *  `value`/`onCambiar` van directo a `precioMin`/`precioMax` (texto, como ya
 *  vivían): en los extremos manda "" (sin tope), como ya hacía el par de
 *  `CampoTexto` que reemplaza. Un thumb en cada punta cuando no hay filtro. */
function PildoraPrecio({
  precioMin,
  precioMax,
  onCambiar,
}: {
  precioMin: string;
  precioMax: string;
  onCambiar: (min: string, max: string) => void;
}) {
  const lo = precioMin ? Number(precioMin) : PRECIO_MIN;
  const hi = precioMax ? Number(precioMax) : PRECIO_MAX;
  const activa = Boolean(precioMin || precioMax);

  return (
    <div className={`flex h-9 shrink-0 items-center gap-2.5 px-3 ${activa ? "text-tinta" : "text-tinta/60"}`}>
      <Banknote aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-colors ${activa ? "text-tinta/70" : "text-tinta/40"}`} />
      <Slider.Root
        className="relative flex h-4 w-24 shrink-0 touch-none select-none items-center sm:w-32"
        min={PRECIO_MIN}
        max={PRECIO_MAX}
        step={5}
        value={[lo, hi]}
        onValueChange={([nuevoLo, nuevoHi]) =>
          onCambiar(nuevoLo > PRECIO_MIN ? String(nuevoLo) : "", nuevoHi < PRECIO_MAX ? String(nuevoHi) : "")
        }
      >
        <Slider.Track className="relative h-[3px] grow rounded-full bg-tinta/15">
          <Slider.Range className="absolute h-full rounded-full bg-rojo" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Precio mínimo"
          className="block h-3.5 w-3.5 rounded-full border-2 border-rojo bg-papel outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-rojo/40"
        />
        <Slider.Thumb
          aria-label="Precio máximo"
          className="block h-3.5 w-3.5 rounded-full border-2 border-rojo bg-papel outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-rojo/40"
        />
      </Slider.Root>
      <span className="label-cayla shrink-0 text-[11px] tabular-nums text-tinta/65">
        S/{lo}–{hi}
      </span>
    </div>
  );
}
