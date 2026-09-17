"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Banknote, ChevronDown, CircleCheck, PackageSearch, Palette, Shirt, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Select, Slider } from "radix-ui";
import { ALTO_CONTROL, CampoSelectNativo, CampoTexto, Hilo } from "@/components/ui/campos";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Filtros de /productos. Mismo patrón que `FiltrosMovimientos.tsx`: viven en
// la URL, la página es un Server Component que filtra en Postgres
// (fn_productos/fn_productos_resumen), y cambiar un filtro vuelve a la
// página 1 — un filtro nuevo sobre "página 7" case casi siempre en vacío.
type Opcion = { id: string; nombre: string };
type OpcionColor = Opcion & { hex: string | null };

const PRECIO_MIN = 0;
const PRECIO_MAX = 999;

/** Radix Select no permite `value=""` (la reserva para "sin selección"), y acá
 *  "" YA significa "sin filtro" en la URL — este sentinel hace de puente. */
const TODOS = "__todos__";

/** `compacto` (2026-09-17, tres pasadas el mismo día): en la Grilla, la ropa
 *  tiene que ganarle a los controles. La 1ª pasada plegó todo detrás de un
 *  botón "Filtros"; la 2ª lo dejó siempre a la vista, más chico — a Felipe le
 *  gustaba más plegado. Esta 3ª vuelve al botón "Filtros" y al buscador con
 *  etiqueta de la 1ª, pero con los campos de la 2ª rehechos con estilo
 *  propio: `<select>` nativo no se puede vestir por dentro (la lista la
 *  dibuja el sistema operativo), así que Categoría/Color/Estado/Stock pasan
 *  a Radix Select — mismo paquete `radix-ui` que ya usa el Modal de Ajustar
 *  inventario, sin dependencia nueva. La Tabla sigue con la tarjeta completa
 *  de siempre: ahí sí se filtra seguido para el trabajo operativo
 *  (ADR-0077). Mismo estado, misma URL — nada más que otra piel. */
export function FiltrosProductos({
  categorias,
  colores,
  compacto = false,
}: {
  categorias: Opcion[];
  colores: OpcionColor[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [precioMin, setPrecioMin] = useState(params.get("precioMin") ?? "");
  const [precioMax, setPrecioMax] = useState(params.get("precioMax") ?? "");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const primera = useRef(true);

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("pagina");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
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
      if (Object.keys(cambios).length > 0) aplicar(cambios);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, precioMin, precioMax]);

  const cat = params.get("cat");
  const color = params.get("color");
  const estado = params.get("estado");
  const stock = params.get("stock");
  const orden = params.get("orden");

  const chips: { texto: string; quitar: Record<string, string> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: { q: "" } });
  if (orden) chips.push({ texto: orden === "precio_asc" ? "Precio: menor a mayor" : "Precio: mayor a menor", quitar: { orden: "" } });
  if (cat) chips.push({ texto: categorias.find((c) => c.id === cat)?.nombre ?? "Categoría", quitar: { cat: "" } });
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
          key={c.texto}
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

  if (compacto) {
    const activos = [cat, color, estado, stock, orden, precioMin || precioMax ? "precio" : ""].filter(Boolean).length;
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <CampoTexto
              etiqueta="Buscar"
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
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-expanded={panelAbierto}
              aria-controls="filtros-panel"
              className={`label-cayla mt-1.5 ${ALTO_CONTROL} inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3.5 text-[11px] transition-colors ${
                panelAbierto || activos > 0
                  ? "border-tinta/30 bg-tinta/[0.04] text-tinta"
                  : "border-tinta/15 text-tinta/65 hover:border-tinta/25 hover:text-tinta"
              }`}
            >
              <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
              Filtros{activos > 0 ? ` · ${activos}` : ""}
            </button>
          </div>
        </div>

        {panelAbierto && (
          <div id="filtros-panel" className="anim-revelar flex flex-wrap items-center divide-x divide-tinta/10 rounded-xl bg-sand/50 p-1 shadow-sm">
            <BotonesOrdenPrecio orden={orden} onOrden={(v) => aplicar({ orden: v })} />

            <DesplegablePildora icono={Shirt} etiqueta="Categoría" valor={cat ?? TODOS} onValor={(v) => aplicar({ cat: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todas</ItemDesplegable>
              {categorias.map((c) => (
                <ItemDesplegable key={c.id} value={c.id}>
                  {c.nombre}
                </ItemDesplegable>
              ))}
            </DesplegablePildora>

            <DesplegablePildora icono={Palette} etiqueta="Color" valor={color ?? TODOS} onValor={(v) => aplicar({ color: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
              {colores.map((c) => (
                <ItemDesplegable key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-tinta/15" style={{ background: c.hex ?? "#d8d3c7" }} />
                    {c.nombre}
                  </span>
                </ItemDesplegable>
              ))}
            </DesplegablePildora>

            <DesplegablePildora icono={CircleCheck} etiqueta="Estado" valor={estado ?? TODOS} onValor={(v) => aplicar({ estado: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
              <ItemDesplegable value="activo">Activo</ItemDesplegable>
              <ItemDesplegable value="descontinuado">Descontinuado</ItemDesplegable>
            </DesplegablePildora>

            <DesplegablePildora icono={PackageSearch} etiqueta="Stock" valor={stock ?? TODOS} onValor={(v) => aplicar({ stock: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
              <ItemDesplegable value="sin_stock">Sin stock</ItemDesplegable>
              <ItemDesplegable value="bajo">Stock bajo</ItemDesplegable>
              <ItemDesplegable value="reponer">Pedir a proveedor</ItemDesplegable>
            </DesplegablePildora>

            <PildoraPrecio
              precioMin={precioMin}
              precioMax={precioMax}
              onCambiar={(min, max) => {
                setPrecioMin(min);
                setPrecioMax(max);
              }}
            />
          </div>
        )}

        {bloqueChips}
      </div>
    );
  }

  return (
    <div className="card-cayla p-4">
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
        <CampoTexto
          etiqueta="Buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Referencia, código, SKU o código de barras"
          autoComplete="off"
          type="search"
        />
        <CampoSelectNativo etiqueta="Categoría" value={cat ?? ""} onChange={(e) => aplicar({ cat: e.target.value })}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelectNativo>
        <CampoSelectNativo etiqueta="Color" value={color ?? ""} onChange={(e) => aplicar({ color: e.target.value })}>
          <option value="">Todos</option>
          {colores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </CampoSelectNativo>
        <CampoSelectNativo etiqueta="Estado" value={estado ?? ""} onChange={(e) => aplicar({ estado: e.target.value })}>
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="descontinuado">Descontinuado</option>
        </CampoSelectNativo>
        <CampoTexto
          etiqueta="Precio desde"
          value={precioMin}
          onChange={(e) => setPrecioMin(e.target.value)}
          inputMode="decimal"
          placeholder="S/ 0"
        />
        <CampoTexto
          etiqueta="Precio hasta"
          value={precioMax}
          onChange={(e) => setPrecioMax(e.target.value)}
          inputMode="decimal"
          placeholder="S/ 999"
        />
        <CampoSelectNativo etiqueta="Stock" value={stock ?? ""} onChange={(e) => aplicar({ stock: e.target.value })}>
          <option value="">Todos</option>
          <option value="sin_stock">Sin stock</option>
          <option value="bajo">Stock bajo</option>
          <option value="reponer">Pedir a proveedor</option>
        </CampoSelectNativo>
      </div>

      {bloqueChips && <div className="mt-2">{bloqueChips}</div>}
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

/** Desplegable con estilo propio (Radix Select) para la fila compacta de la
 *  Grilla — a diferencia de `<select>` nativo, acá SÍ se puede vestir la
 *  lista abierta, no solo el control cerrado. `valor`/`onValor` ya vienen
 *  resueltos contra el sentinel `TODOS`, este componente no sabe de URLs.
 *
 *  Sin caja propia (2026-09-17, pedido de Felipe: "no me gusta que estén
 *  encapsulados en esos rectángulos blancos"): nada de borde ni fondo en
 *  reposo — el mismo hilo vivo de `CampoTexto`/`SelectNativo` marca dónde
 *  está parado, la tipografía marca si hay un valor elegido. El panel que
 *  los agrupa (`divide-x`) es la única superficie; cada campo adentro es
 *  texto, no una caja más. */
function DesplegablePildora({
  icono: Icono,
  etiqueta,
  valor,
  onValor,
  children,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const activa = valor !== TODOS;
  return (
    <Select.Root value={valor} onValueChange={onValor} onOpenChange={setAbierto}>
      <Select.Trigger
        aria-label={etiqueta}
        className={`label-cayla group relative flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] outline-none transition-colors ${
          activa ? "text-tinta" : "text-tinta/60 hover:text-tinta"
        }`}
      >
        <Icono aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-colors ${activa ? "text-tinta/70" : "text-tinta/40 group-hover:text-tinta/60"}`} />
        <Select.Value />
        <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-tinta/35" />
        <Hilo activo={abierto} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={6} align="start" className="anim-revelar z-50 overflow-hidden rounded-lg border border-sand bg-papel shadow-md">
          <Select.Viewport className="scroll-cayla max-h-72 overflow-y-auto p-1">{children}</Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ItemDesplegable({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Select.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-tinta outline-none data-[highlighted]:bg-rojo/8 data-[state=checked]:font-semibold data-[highlighted]:text-tinta"
    >
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
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
