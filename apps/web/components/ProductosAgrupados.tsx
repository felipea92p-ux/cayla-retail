"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductoListado } from "@/lib/catalogo-v2";

/**
 * Catálogo agrupado por producto — una fila por modelo, expandible a sus
 * variantes. Reescrito el 2026-09-15: antes filtraba/agrupaba TODO el
 * catálogo en memoria del cliente; ahora recibe ya filtrada y paginada
 * (server-side, `fn_productos`) la página que le toca pintar — este
 * componente solo agrupa por `productoId` (ya viene ordenado) y maneja
 * estado de UI (expandido/seleccionado/menú), no filtra ni pagina nada.
 *
 * El stock por fila SÍ entra acá (`stockTotal`/`stockMinimo`, sumado en
 * todas las ubicaciones) — cruza a propósito la separación "qué existe"
 * (Productos) / "cuánto hay" (Inventario) que este mismo archivo documentaba
 * antes; decisión de Felipe (2026-09-15, ver la migración
 * `20260915160000_productos_listado_filtros.sql`). Lo que NO cruza: sigue
 * sin mostrar stock por ubicación/sububicación — eso sigue siendo
 * /inventario.
 *
 * La selección (checkboxes) vive ACÁ, no en `page.tsx` — es un Server
 * Component y no puede tener estado. Queda lista para que la sesión de
 * integración final (B2) le agregue una barra de acciones masivas sobre
 * `seleccionados`; este componente solo la levanta y la togglea, ninguna
 * acción real está cableada todavía.
 */

export function ProductosAgrupados({ productos }: { productos: ProductoListado[] }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  function toggleAbierto(productoId: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(productoId)) next.delete(productoId);
      else next.add(productoId);
      return next;
    });
  }

  function toggleSeleccionado(productoId: string) {
    const next = new Set(seleccionados);
    if (next.has(productoId)) next.delete(productoId);
    else next.add(productoId);
    setSeleccionados(next);
  }

  const todosEnPagina = productos.length > 0 && productos.every((p) => seleccionados.has(p.productoId));

  function toggleTodos() {
    const next = new Set(seleccionados);
    for (const p of productos) {
      if (todosEnPagina) next.delete(p.productoId);
      else next.add(p.productoId);
    }
    setSeleccionados(next);
  }

  if (productos.length === 0) {
    return <p className="card-cayla p-5 text-sm text-tinta/75">Ningún producto calza con esos filtros.</p>;
  }

  return (
    <div className="space-y-2">
      <label className="label-cayla flex items-center gap-2 px-1 text-[11px] text-tinta/65">
        <input type="checkbox" checked={todosEnPagina} onChange={toggleTodos} className="h-3.5 w-3.5 accent-rojo" />
        {seleccionados.size > 0 ? (
          <>
            {seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}
            <button type="button" onClick={() => setSeleccionados(new Set())} className="ml-2 text-tinta/55 hover:text-rojo">
              Limpiar selección
            </button>
          </>
        ) : (
          "Seleccionar todo en esta página"
        )}
      </label>

      {productos.map((p) => {
        const abierto = abiertos.has(p.productoId);
        const sinStock = p.stockTotal === 0;
        const stockBajo = !sinStock && p.stockMinimo != null && p.stockTotal < p.stockMinimo;
        return (
          <div key={p.productoId} className="card-cayla overflow-hidden">
            <div className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-sand/30">
              <input
                type="checkbox"
                checked={seleccionados.has(p.productoId)}
                onChange={() => toggleSeleccionado(p.productoId)}
                className="h-3.5 w-3.5 shrink-0 accent-rojo"
                aria-label={`Seleccionar ${p.referencia}`}
              />
              <button
                onClick={() => toggleAbierto(p.productoId)}
                className="flex flex-1 items-center gap-4 text-left"
                aria-expanded={abierto}
              >
                <span className="flex-1 text-sm text-tinta">
                  {p.referencia}
                  {p.codigo && <span className="ml-2 font-mono text-xs text-tinta/55">{p.codigo}</span>}
                </span>
                {p.estado === "descontinuado" && (
                  <span className="label-cayla rounded-full border border-tinta/20 px-2 py-0.5 text-[10px] text-tinta/55">
                    Descontinuado
                  </span>
                )}
                {sinStock && (
                  <span className="label-cayla rounded-full border border-rojo/30 bg-rojo/[0.06] px-2 py-0.5 text-[10px] text-rojo">
                    Sin stock
                  </span>
                )}
                {stockBajo && (
                  <span className="label-cayla rounded-full border border-ambar/40 bg-ambar/[0.08] px-2 py-0.5 text-[10px] text-ambar">
                    Stock bajo
                  </span>
                )}
                <span className="text-xs text-tinta/65">{p.categoria ?? "—"}</span>
                <span className="label-cayla text-[11px] text-tinta/55">
                  {p.variantes.length} {p.variantes.length === 1 ? "variante" : "variantes"}
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 shrink-0 text-tinta/50 transition-transform ${abierto ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <MenuFila productoId={p.productoId} />
            </div>
            {abierto && (
              <div className="border-t border-tinta/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-tinta/10 text-left">
                      <th className="label-cayla px-5 py-2.5 text-[11px] text-tinta/65">SKU</th>
                      <th className="label-cayla px-3 py-2.5 text-[11px] text-tinta/65">Talla</th>
                      <th className="label-cayla px-3 py-2.5 text-[11px] text-tinta/65">Color</th>
                      <th className="label-cayla px-3 py-2.5 text-right text-[11px] text-tinta/65">Precio</th>
                      <th className="label-cayla px-3 py-2.5 text-right text-[11px] text-tinta/65">Costo</th>
                      <th className="label-cayla px-5 py-2.5 text-[11px] text-tinta/65">Barras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tinta/10">
                    {p.variantes.map((v) => (
                      <tr key={v.varianteId} className={v.activo ? "" : "opacity-50"}>
                        <td className="px-5 py-2.5 font-mono text-xs text-tinta/75">{v.sku}</td>
                        <td className="px-3 py-2.5 text-tinta/75">{v.talla ?? "—"}</td>
                        <td className="px-3 py-2.5 text-tinta/75">
                          {v.color ? (
                            <span className="inline-flex items-center gap-1.5">
                              {v.colorHex && (
                                <span
                                  aria-hidden
                                  className="inline-block h-3 w-3 rounded-full border border-tinta/15"
                                  style={{ backgroundColor: v.colorHex }}
                                />
                              )}
                              {v.color}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-tinta">S/{v.precio.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-tinta/65">S/{v.costo.toFixed(2)}</td>
                        <td className="px-5 py-2.5 text-xs text-tinta/65">{v.codigosBarras.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** El menú "..." por fila. Sin Radix a propósito — mismo criterio que
 *  `Desplegable` en `ui/campos.tsx`: el repo solo trae `@radix-ui/react-dialog`
 *  instalado con intención, y esto es más chico que ese control (sin
 *  teclado tipo combobox, solo Escape/click-afuera). */
function MenuFila({ productoId }: { productoId: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  // TODO(B2): cablear con AjustarInventarioModal / HistorialProductoPanel.
  function accionPendiente(nombre: string) {
    return () => {
      setAbierto(false);
      window.alert(`"${nombre}" todavía no está conectado — llega con la integración final.`);
    };
  }

  return (
    <div className="relative shrink-0" ref={contenedor}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más acciones"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
        className={`label-cayla flex h-7 w-7 items-center justify-center rounded-md text-tinta/55 transition-colors hover:bg-tinta/[0.06] hover:text-tinta ${abierto ? "bg-tinta/[0.06] text-tinta" : ""}`}
      >
        ···
      </button>
      {abierto && (
        <ul
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="anim-revelar absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-lg border border-sand bg-papel py-1 shadow-md"
        >
          <li role="none">
            <Link
              role="menuitem"
              href={`/productos/${productoId}/editar`}
              className="block px-3 py-2 text-sm text-tinta hover:bg-rojo/10"
              onClick={() => setAbierto(false)}
            >
              Editar
            </Link>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={accionPendiente("Ajustar inventario")}
              className="block w-full px-3 py-2 text-left text-sm text-tinta/75 hover:bg-rojo/10"
            >
              Ajustar inventario
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={accionPendiente("Ver historial")}
              className="block w-full px-3 py-2 text-left text-sm text-tinta/75 hover:bg-rojo/10"
            >
              Ver historial
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={accionPendiente("Duplicar")}
              className="block w-full px-3 py-2 text-left text-sm text-tinta/75 hover:bg-rojo/10"
            >
              Duplicar
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              onClick={accionPendiente("Archivar")}
              className="block w-full px-3 py-2 text-left text-sm text-rojo/85 hover:bg-rojo/10"
            >
              Archivar
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
