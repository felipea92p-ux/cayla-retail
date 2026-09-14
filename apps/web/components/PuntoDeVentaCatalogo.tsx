"use client";

import type { ReactNode, RefObject } from "react";
import { money, type ItemCarrito, type VarianteBusqueda } from "@/components/PuntoDeVenta";

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
  /** Ya viene filtrado por categoría y por `soloConStock`. */
  catalogo: VarianteBusqueda[];
  /** Solo para el globito "N" de cada tarjeta. */
  carrito: ItemCarrito[];
  // Ventas de hoy (vive dentro del <section>, bajo la grilla)
  mostrarVentasHoy: boolean;
  onAlternarVentasHoy: () => void;
  ventasHoyNode: ReactNode;
};

/**
 * Panel izquierdo de Vender: escaneo/búsqueda, chips de categoría, grilla de prendas y
 * el desplegable de Ventas de hoy. Sin estado propio ni hooks — todo llega por props
 * desde `PuntoDeVenta`, que sigue siendo el dueño de la búsqueda, del catálogo filtrado
 * y de `agregar()`. Es la costura para trabajar el catálogo sin tocar el ticket.
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
  catalogo,
  carrito,
  mostrarVentasHoy,
  onAlternarVentasHoy,
  ventasHoyNode,
}: Props) {
  return (
    <section className="flex min-w-0 flex-col border-b border-sand lg:border-r lg:border-b-0">
      <div className="px-4 pt-2 sm:px-6 sm:pt-3">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <span aria-hidden />
          <h1 className="font-display text-center text-3xl text-tinta sm:text-4xl">Catálogo De Prendas</h1>
          <button
            type="button"
            onClick={() => onMontoManual()}
            disabled={bloqueado}
            className="label-cayla flex h-10 items-center justify-self-end gap-1.5 rounded-md border border-sand bg-papel px-3 text-[11px] text-tinta transition-colors hover:bg-sand/40"
          >
            Monto manual
          </button>
        </div>

        <div className="relative z-20">
          <label className="flex h-12 items-center rounded-xl border border-sand bg-papel px-4 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
            <input
              id="venta-buscar"
              ref={buscadorRef}
              autoFocus
              disabled={bloqueado}
              value={q}
              onChange={(e) => onEscribir(e.target.value)}
              onKeyDown={onTeclado}
              placeholder="Escanea la etiqueta o busca la prenda"
              autoComplete="off"
              role="combobox"
              aria-expanded={resultados.length > 0}
              aria-controls="venta-resultados"
              aria-activedescendant={resultados.length > 0 ? `venta-op-${activo}` : undefined}
              aria-autocomplete="list"
              className="min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
            />
            {q && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => onLimpiarBusqueda()}
                className="flex h-8 w-8 items-center justify-center rounded-md text-base text-tinta/50 hover:bg-sand/40"
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
              className="card-cayla absolute top-14 right-0 left-0 divide-y divide-sand overflow-hidden !p-0 shadow-lg"
            >
              {resultados.length ? (
                resultados.map((v, i) => (
                  <li key={v.varianteId} id={`venta-op-${i}`} role="option" aria-selected={i === activo}>
                    <button
                      type="button"
                      onMouseEnter={() => onActivo(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onAgregar(v)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${i === activo ? "bg-sand/60" : ""}`}
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
        {aviso && <p className="mt-2 text-sm text-ambar-profundo">{aviso}</p>}

        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-3">
          {categorias.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCategoria(c)}
              disabled={bloqueado}
              className={`label-cayla h-8 shrink-0 rounded-lg border px-3 text-[11px] transition-colors ${
                categoria === c ? "border-tinta bg-tinta text-crema" : "border-sand bg-papel text-tinta/65 hover:bg-sand/40"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {catalogo.map((v) => {
            const enCarrito = carrito.find((it) => it.claveLinea === v.varianteId)?.cantidad ?? 0;
            const sinStock = v.stockAqui <= 0;
            return (
              <button
                key={v.varianteId}
                type="button"
                onClick={() => onAgregar(v)}
                disabled={bloqueado}
                className="relative flex h-auto min-h-40 flex-col items-stretch justify-between rounded-xl border border-sand bg-papel p-3 text-left transition-colors hover:bg-sand/30"
              >
                <div>
                  <p className="line-clamp-1 text-sm font-semibold text-tinta">{v.referencia}</p>
                  <p className="mt-0.5 text-xs text-tinta/60">{[v.talla, v.color].filter(Boolean).join("/")}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-sm font-bold text-tinta">{money(v.precio)}</span>
                    <span className={`text-[11px] ${sinStock ? "text-rojo-profundo" : "text-tinta/60"}`}>
                      {sinStock ? "Sin stock" : `${v.stockAqui} en sede`}
                    </span>
                  </div>
                </div>
                {enCarrito > 0 && (
                  <span className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-tinta px-1.5 text-xs text-crema">
                    {enCarrito}
                  </span>
                )}
              </button>
            );
          })}
        </div>

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
