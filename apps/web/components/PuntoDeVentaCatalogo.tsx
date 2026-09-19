"use client";

import type { ReactNode, RefObject } from "react";
import Image from "next/image";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";
import type { GrupoCatalogo } from "@/lib/catalogo-grupos";
import { textoOtrasSedes } from "@/lib/stock-por-sede";
import { codigoPrenda } from "@/lib/prenda-reglas";
import { Badge } from "@/components/ui/badge";
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
  /** Cuántas tarjetas esconde el filtro ahora mismo (0 si está apagado). */
  ocultasSinStock: number;
  /** Tocar el cuerpo de una tarjeta: el padre abre el modal de talla. */
  onElegirTalla: (clave: string) => void;
  /** Tarjeta a la que se le acaba de pedir más de lo que hay. `pulso` sube en cada intento,
   *  así el resaltado se re-monta y vuelve a sonar aunque sea la misma tarjeta. */
  topeTarjeta: { clave: string; pulso: number } | null;
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
 *  sea cual sea su tipo, así la encargada de sede lee la fila entera de un vistazo.
 *  `rounded-md`: mismo radio que la "pastilla" del selector de ubicación
 *  (`campos.tsx`, `FORMA_DESPLEGABLE.pastilla`) — un chip de filtro es la misma
 *  familia de control que ese selector, no una tarjeta. */
const chip = (prendido: boolean) =>
  `label-cayla h-8 shrink-0 rounded-md border px-3 text-[11px] transition-colors ${
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
  ocultasSinStock,
  onElegirTalla,
  topeTarjeta,
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
                            {[v.talla, v.color].filter(Boolean).join("/")} · {codigoPrenda(v)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold text-tinta">{money(v.precio)}</span>
                          <span className={`block text-xs ${v.stockAqui <= 0 ? "text-rojo-profundo" : "text-tinta/60"}`}>
                            {v.stockAqui <= 0 ? `sin stock aquí` : `${v.stockAqui} aquí`}
                          </span>
                          {/* Dónde más hay: la venta que se perdía cuando solo decía «sin stock». */}
                          {textoOtrasSedes(v.stockOtrasSedes ?? []) && (
                            <span className="block text-[11px] text-tinta/55">{textoOtrasSedes(v.stockOtrasSedes ?? [])}</span>
                          )}
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

        {/* «Solo con stock» es lo primero que decide qué ve la encargada, así que va en su
            propia fila, con interruptor de verdad (se lee prendido/apagado de un vistazo, no
            como un chip más entre las categorías donde se perdía al final de la fila) y con
            cuántas tarjetas esconde: sin ese número, una prenda que no aparece parece que
            no existe. */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={soloConStock}
            onClick={() => onSoloConStock(!soloConStock)}
            disabled={bloqueado}
            className="group flex items-center gap-2.5 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-rojo/30"
          >
            <span
              aria-hidden
              className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                soloConStock ? "border-tinta bg-tinta" : "border-sand bg-sand/60"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full shadow-sm transition-transform ${
                  soloConStock ? "translate-x-4 bg-crema" : "bg-tinta/45"
                }`}
              />
            </span>
            <span className="label-cayla text-[11px] font-semibold text-tinta">Solo con stock</span>
          </button>
          {soloConStock && ocultasSinStock > 0 && (
            <span className="text-[11px] text-tinta/60">
              {ocultasSinStock} {ocultasSinStock === 1 ? "prenda agotada oculta" : "prendas agotadas ocultas"}
            </span>
          )}
        </div>

        {/* Catálogo, la ruta secundaria: las categorías tienen ahora toda la fila. */}
        <div className="scroll-cayla mt-2 flex gap-2 overflow-x-auto pb-3">
          {categorias.map((c) => (
            <button key={c} type="button" onClick={() => onCategoria(c)} disabled={bloqueado} className={chip(categoria === c)}>
              {c}
            </button>
          ))}
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
                  {/* Toda la tarjeta es tocable: abre el modal de talla. Antes solo lo eran
                      los chips y tocar la prenda no hacía nada (`alza-cayla` incluso la
                      levantaba al pasar, prometiendo un clic). Botón superpuesto y no
                      `<article onClick>` para que sea alcanzable con teclado y lo lean los
                      lectores de pantalla; los chips van por encima (`z-10`) y siguen siendo
                      el atajo de un toque. */}
                  <button
                    type="button"
                    onClick={() => onElegirTalla(g.clave)}
                    disabled={bloqueado}
                    aria-label={`Elegir talla de ${nombre}`}
                    className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-rojo/40 disabled:cursor-default"
                  />
                  {/* Foto real por prenda+color (20260917190000) cuando existe; mientras un
                      color no tenga foto, las iniciales siguen de plan B — nunca un ícono
                      de "foto rota". */}
                  {g.fotoUrl ? (
                    <div className="relative mb-3 aspect-[4/5] overflow-hidden rounded-lg bg-sand/40">
                      <Image src={g.fotoUrl} alt={nombre} fill sizes="(min-width: 1280px) 20vw, 33vw" className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div aria-hidden className="mb-3 flex aspect-[4/5] items-center justify-center rounded-lg bg-sand/40">
                      <span className="font-display text-2xl text-tinta/30">{iniciales(g.referencia)}</span>
                    </div>
                  )}
                  <p className="line-clamp-1 text-sm font-semibold text-tinta">{g.referencia}</p>
                  <p className="mt-0.5 text-xs text-tinta/60">{g.color ?? "Sin color"}</p>

                  {/* Tallas: tocar una agrega ESA variante al ticket (el color ya lo fija la
                      tarjeta). Una talla agotada se queda a la vista, tachada: no es lo mismo
                      «no hay M» que «no existe M». */}
                  <div className="relative z-10 mt-2 flex flex-wrap gap-1" aria-label="Tallas">
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
                            {[
                              `${t.stockAqui} aquí`,
                              textoOtrasSedes(t.variante.stockOtrasSedes ?? []),
                              t.variante.precio !== g.precioMin ? money(t.variante.precio) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        // Talla agotada aquí: el tooltip dice dónde sí hay. `tabIndex` para que
                        // también se lea con teclado; no es un botón porque no agrega nada.
                        <Tooltip key={t.variante.varianteId}>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              aria-label={`Talla ${t.talla} sin stock aquí`}
                              className="label-cayla flex h-7 min-w-7 items-center justify-center rounded-md border border-dashed border-sand px-1.5 text-[11px] text-tinta/35 line-through outline-none focus-visible:border-rojo/60"
                            >
                              {t.talla}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={4}>
                            {textoOtrasSedes(t.variante.stockOtrasSedes ?? [])
                              ? `Sin stock aquí · ${textoOtrasSedes(t.variante.stockOtrasSedes ?? [])}`
                              : "Sin stock en ninguna sede"}
                          </TooltipContent>
                        </Tooltip>
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

                  {/* Tope de stock: un velo rojo suave que respira dos veces con un barrido de
                      luz, y se apaga solo (`anim-tope`). Decorativo — el aviso de arriba es el
                      que se lee con lector de pantalla —, y sin `pointer-events` para no
                      estorbar los chips. */}
                  {topeTarjeta?.clave === g.clave && (
                    <span
                      key={topeTarjeta.pulso}
                      aria-hidden
                      className="anim-tope pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl bg-rojo/[0.06] shadow-lg shadow-rojo/25 ring-1 ring-inset ring-rojo/50"
                    >
                      <span className="anim-tope-barrido absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-rojo/15 to-transparent" />
                      <span className="label-cayla absolute top-3 left-3 rounded-full bg-papel/90 px-2 py-0.5 text-[10px] text-rojo-profundo">
                        Máximo alcanzado
                      </span>
                    </span>
                  )}

                  {/* El globito se re-asienta cada vez que cambia la cantidad (`key`): el ojo
                      nota que cambió sin releerlo. */}
                  {enCarrito > 0 && (
                    <Badge key={enCarrito} className="anim-asentar pointer-events-none absolute top-2 right-2 h-6 min-w-6 rounded-full px-1.5 text-xs">
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
          {/* Antes `hidden` (display:none): ni con CSS se puede animar un despliegue así
              — truco de `grid-template-rows` (0fr↔1fr) en su lugar. `ventasHoyNode` no
              trae ningún control enfocable (solo filas de texto), así que a diferencia
              del swap de MovimientoCajaModal no hace falta `disabled` acá adentro. */}
          <div className={`grid overflow-hidden transition-[grid-template-rows] ${mostrarVentasHoy ? "mt-2 grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="min-h-0 overflow-hidden">{ventasHoyNode}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
