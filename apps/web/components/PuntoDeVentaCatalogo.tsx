"use client";

import type { ReactNode, RefObject } from "react";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { GrupoCatalogo } from "@/lib/catalogo-grupos";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  ubicacionEtiqueta: string;
  bloqueado: boolean;
  // Escaneo / búsqueda
  /** El ref vive en el padre: `agregar()` lo usa para devolver el foco al escáner. */
  buscadorRef: RefObject<HTMLInputElement | null>;
  q: string;
  /** `q.trim()`, derivado en el padre. */
  term: string;
  resultados: VarianteBusqueda[];
  activo: number;
  aviso: string | null;
  /** Al tipear: el padre resetea el resultado activo y el aviso, además de guardar el texto. */
  onEscribir: (valor: string) => void;
  /** El botón ×: solo borra el texto (no toca activo ni aviso — así era). */
  onLimpiarBusqueda: () => void;
  onTeclado: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Hover sobre un resultado. */
  onActivo: (i: number) => void;
  /** El único "avisa hacia arriba" de este panel: se eligió una prenda. */
  onAgregar: (v: VarianteBusqueda) => void;
  /** Abre el modal de Monto manual, que sigue en el padre. */
  onMontoManual: () => void;
  // Chips y grilla
  categorias: string[];
  categoria: string;
  /** El padre, además de guardar la categoría, devuelve el foco al escáner. */
  onCategoria: (c: string) => void;
  /** Filtro «Solo con stock» de la grilla; apagado, las sin stock se ven atenuadas. */
  soloConStock: boolean;
  onSoloConStock: (valor: boolean) => void;
  /** Una tarjeta por prenda + color, con sus tallas adentro; ya viene filtrado por
   *  categoría y por `soloConStock` (`lib/catalogo-grupos.ts`, memo del padre). */
  grupos: GrupoCatalogo<VarianteBusqueda>[];
  /** Solo para el globito "N" de cada tarjeta. */
  carrito: ItemCarrito[];
  // Ventas de hoy (vive dentro del <section>, bajo la grilla)
  mostrarVentasHoy: boolean;
  onAlternarVentasHoy: () => void;
  ventasHoyNode: ReactNode;
};

/** Mismo chip para las categorías y para el filtro de stock: uno "prendido" se ve igual
 *  sea cual sea su tipo, así la encargada de sede lee la fila entera de un vistazo. */
const chip = (prendido: boolean) =>
  `label-cayla h-8 shrink-0 rounded-lg border px-3 text-[11px] transition-colors ${
    prendido ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel text-tinta/65 hover:bg-sand/40"
  }`;

/** «Blusa Emma» → «BE»: lo que ocupa el hueco de la foto mientras el catálogo no tenga fotos. */
const iniciales = (referencia: string) =>
  referencia
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

/**
 * Panel izquierdo de Vender. La encargada de sede tiene lector: su ruta real es
 * escanear, así que el campo de escaneo es lo primero y lo más grande del panel, y
 * el catálogo (chips + grilla) es el plan B para cuando la etiqueta no lee — a un
 * toque, pero sin encabezado propio que le robe alto a la venta.
 *
 * Sin estado propio ni hooks — todo llega por props desde `PuntoDeVenta`, que sigue
 * siendo el dueño de la búsqueda, del catálogo filtrado, del foco y de `agregar()`.
 * Es la costura para trabajar el catálogo sin tocar el ticket (ADR-0043).
 */
export function PuntoDeVentaCatalogo({
  ubicacionEtiqueta,
  bloqueado,
  buscadorRef,
  q,
  term,
  resultados,
  activo,
  aviso,
  onEscribir,
  onLimpiarBusqueda,
  onTeclado,
  onActivo,
  onAgregar,
  onMontoManual,
  categorias,
  categoria,
  onCategoria,
  soloConStock,
  onSoloConStock,
  grupos,
  carrito,
  mostrarVentasHoy,
  onAlternarVentasHoy,
  ventasHoyNode,
}: Props) {
  return (
    // En escritorio el alto lo fija el padre (pantalla fija, ADR-0044): `lg:min-h-0`
    // deja que esta columna encoja a la fila y la grilla scrollee por dentro, así el
    // campo de escaneo nunca sale de la vista, por larga que sea la categoría.
    <section
      aria-label="Escanear o buscar prendas"
      className="flex min-w-0 flex-col border-b border-sand lg:min-h-0 lg:border-r lg:border-b-0"
    >
      <div className="px-4 pt-3 sm:px-6 sm:pt-4">
        {/* Fila de captura: el campo manda (flex-1); «Monto manual» es la tercera vía de
            captura (sin etiqueta, prenda dañada), por eso vive al lado del campo y no
            entre los chips, donde le robaba ancho a las categorías. */}
        <div className="flex items-stretch gap-2">
          <div className="relative z-20 min-w-0 flex-1">
            <label className="group flex h-14 items-center gap-3 rounded-xl border border-sand bg-papel px-4 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
              {/* Código de barras: dice "acá se escanea" sin una palabra más. */}
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-tinta/45 transition-colors group-focus-within:text-rojo"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              >
                <path d="M3 5v14M6.5 5v14M8.5 5v14M12 5v14M15 5v14M17 5v14M21 5v14" />
              </svg>
              <input
                id="venta-buscar"
                ref={buscadorRef}
                autoFocus
                disabled={bloqueado}
                value={q}
                onChange={(e) => onEscribir(e.target.value)}
                onKeyDown={onTeclado}
                placeholder="Escanea la etiqueta o busca la prenda"
                aria-label="Escanea la etiqueta o busca la prenda"
                autoComplete="off"
                role="combobox"
                aria-expanded={resultados.length > 0}
                aria-controls="venta-resultados"
                aria-activedescendant={resultados.length > 0 ? `venta-op-${activo}` : undefined}
                aria-autocomplete="list"
                className="min-w-0 flex-1 bg-transparent text-base text-tinta outline-none placeholder:text-tinta/45"
              />
              {q && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => onLimpiarBusqueda()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base text-tinta/50 hover:bg-sand/40"
                >
                  ×
                </button>
              )}
            </label>
            {q && (
              <ul
                id="venta-resultados"
                role="listbox"
                aria-label="Prendas encontradas"
                className="card-cayla absolute top-16 right-0 left-0 divide-y divide-sand overflow-hidden !p-0 shadow-lg"
              >
                {resultados.length ? (
                  resultados.map((v, i) => (
                    <li key={v.varianteId} id={`venta-op-${i}`} role="option" aria-selected={i === activo}>
                      <button
                        type="button"
                        onMouseEnter={() => onActivo(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onAgregar(v)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                          i === activo ? "bg-sand/60" : ""
                        } ${v.stockAqui <= 0 ? "opacity-55" : ""}`}
                      >
                        <span>
                          <span className="block font-semibold text-tinta">{v.referencia}</span>
                          <span className="text-xs text-tinta/60">
                            {[v.talla, v.color].filter(Boolean).join("/")} · {v.sku}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold text-tinta">{money(v.precio)}</span>
                          <span className={`block text-xs ${v.stockAqui <= 0 ? "text-rojo-profundo" : "text-tinta/60"}`}>
                            {v.stockAqui <= 0 ? `sin stock` : `${v.stockAqui} en sede`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <p className="px-4 py-5 text-sm text-tinta/65">
                    No encontramos «{term}» en {ubicacionEtiqueta}.
                  </p>
                )}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => onMontoManual()}
            disabled={bloqueado}
            className="label-cayla shrink-0 rounded-xl border border-sand bg-papel px-3 text-[11px] text-tinta/75 transition-colors hover:bg-sand/40 hover:text-tinta"
          >
            Monto manual
          </button>
        </div>
        {aviso && <p className="mt-2 text-sm text-ambar-profundo">{aviso}</p>}

        {/* Catálogo, la ruta secundaria: chips a la izquierda y, al final, el filtro de
            stock — un chip más, con el mismo aspecto prendido que una categoría. */}
        <div className="mt-3 flex items-center gap-2 pb-3">
          <div className="scroll-cayla flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
            {categorias.map((c) => (
              <button key={c} type="button" onClick={() => onCategoria(c)} disabled={bloqueado} className={chip(categoria === c)}>
                {c}
              </button>
            ))}
          </div>
          {/* Toggle de shadcn (Radix): mismo aspecto que un chip prendido, con `data-state`
              y `aria-pressed` de fábrica. */}
          <Toggle
            pressed={soloConStock}
            onPressedChange={onSoloConStock}
            disabled={bloqueado}
            size="sm"
            className="label-cayla h-8 shrink-0 rounded-lg border border-sand bg-papel px-3 text-[11px] font-semibold text-tinta/65 hover:bg-sand/40 hover:text-tinta data-[state=on]:border-tinta data-[state=on]:bg-tinta data-[state=on]:text-crema"
          >
            Solo con stock
          </Toggle>
        </div>
      </div>

      <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6">
        <TooltipProvider delayDuration={250}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {grupos.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-tinta/60">
                {soloConStock ? `Nada con stock en ${ubicacionEtiqueta}` : "No hay prendas"}
                {categoria === "Todo" ? "." : ` en ${categoria}.`}
              </p>
            )}
            {grupos.map((g) => {
              const sinStock = g.stockTotal === 0;
              const enCarrito = g.tallas.reduce(
                (acc, t) => acc + (carrito.find((it) => it.claveLinea === t.variante.varianteId)?.cantidad ?? 0),
                0
              );
              const nombre = [g.referencia, g.color].filter(Boolean).join(" ");
              return (
                // Sin reveal al scroll a propósito (decisión de Felipe, 2026-09-14): la
                // atenuación de "sin stock" es la única de la grilla y no puede confundirse
                // con una tarjeta a medio entrar. `RevelarAlScroll` sigue en ui/ para tableros.
                <article
                  key={g.clave}
                  aria-label={nombre}
                  className={`relative flex h-full flex-col rounded-xl border p-3 ${
                    sinStock ? "border-rojo-profundo/40 bg-crema opacity-55" : "alza-cayla border-sand bg-papel"
                  }`}
                >
                  {/* Hueco de la foto: `productos` no tiene foto todavía; cuando la tenga,
                      cae acá sin rediseñar la tarjeta. */}
                  <div aria-hidden className="mb-3 flex aspect-[4/5] items-center justify-center rounded-lg bg-sand/40">
                    <span className="font-display text-2xl text-tinta/30">{iniciales(g.referencia)}</span>
                  </div>
                  <p className="line-clamp-1 text-sm font-semibold text-tinta">{g.referencia}</p>
                  <p className="mt-0.5 text-xs text-tinta/60">{g.color ?? "Sin color"}</p>

                  {/* Tallas: tocar una agrega ESA variante al ticket (el color ya lo fija la
                      tarjeta). Una talla agotada se queda a la vista, tachada: no es lo mismo
                      «no hay M» que «no existe M». */}
                  <div className="mt-2 flex flex-wrap gap-1" aria-label="Tallas">
                    {g.tallas.map((t) =>
                      t.stockAqui > 0 ? (
                        <Tooltip key={t.variante.varianteId}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onAgregar(t.variante)}
                              disabled={bloqueado}
                              aria-label={`Agregar ${nombre} talla ${t.talla}`}
                              className="label-cayla flex h-7 min-w-7 items-center justify-center rounded-md border border-sand bg-crema px-1.5 text-[11px] text-tinta transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-cayla)] hover:border-tinta/40 hover:bg-sand/50 active:translate-y-px"
                            >
                              {t.talla}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={4}>
                            {t.stockAqui} en sede{t.variante.precio !== g.precioMin ? ` · ${money(t.variante.precio)}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span
                          key={t.variante.varianteId}
                          aria-label={`Talla ${t.talla} sin stock`}
                          className="label-cayla flex h-7 min-w-7 items-center justify-center rounded-md border border-dashed border-sand px-1.5 text-[11px] text-tinta/35 line-through"
                        >
                          {t.talla}
                        </span>
                      )
                    )}
                  </div>

                  <div className="mt-auto flex items-end justify-between pt-3">
                    <span className="text-sm font-bold text-tinta">
                      {g.precioMin === g.precioMax ? money(g.precioMin) : `desde ${money(g.precioMin)}`}
                    </span>
                    <span className={`text-[11px] ${sinStock ? "text-rojo-profundo" : "text-tinta/60"}`}>
                      {sinStock ? "Sin stock" : `${g.stockTotal} en sede`}
                    </span>
                  </div>

                  {/* El globito se re-asienta cada vez que cambia la cantidad (`key`): el ojo
                      nota que cambió sin releerlo. */}
                  {enCarrito > 0 && (
                    <Badge key={enCarrito} className="anim-asentar absolute top-2 right-2 h-6 min-w-6 rounded-full px-1.5 text-xs">
                      {enCarrito}
                    </Badge>
                  )}
                </article>
              );
            })}
          </div>
        </TooltipProvider>

        <div className="mt-7 border-t border-sand pt-5">
          <button
            type="button"
            onClick={() => onAlternarVentasHoy()}
            className="label-cayla flex w-full items-center justify-between py-2 text-[11px] text-tinta"
          >
            <span>Ventas de hoy</span>
            <span className={`inline-block transition-transform ${mostrarVentasHoy ? "rotate-180" : ""}`}>⌄</span>
          </button>
          <div className={mostrarVentasHoy ? "mt-2" : "hidden"}>{ventasHoyNode}</div>
        </div>
      </div>
    </section>
  );
}
