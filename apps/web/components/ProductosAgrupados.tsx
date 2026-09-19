"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { AjustarInventarioModal } from "@/components/AjustarInventarioModal";
import { Chip } from "@/components/ui/Chip";
import { describirRotacion } from "@/lib/reorden-reglas";
import type { Sububicacion } from "@/lib/sububicaciones";
import type { ProductoListado, VarianteCatalogo } from "@/lib/catalogo-v2";

/** Rango de costo del modelo a partir de sus variantes — no hay `costo` a nivel
 *  de producto en el esquema (vive por variante, `variantes.costo`), así que se
 *  deriva acá en vez de sumar una columna nueva a `fn_productos` para un valor
 *  que ya viaja en la respuesta. */
function rangoCosto(variantes: VarianteCatalogo[]): string {
  if (variantes.length === 0) return "—";
  const costos = variantes.map((v) => v.costo);
  const min = Math.min(...costos);
  const max = Math.max(...costos);
  return min === max ? `S/${min.toFixed(2)}` : `S/${min.toFixed(2)}–${max.toFixed(2)}`;
}

const PLANTILLA_FILA = "sm:grid-cols-[1.25rem_1fr_7rem_4.5rem_4.5rem_6.5rem_6.5rem_2.25rem]";

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
 * Component y no puede tener estado. La barra de acciones masivas
 * (activar/desactivar, `productos.estado`) escribe directo por RLS
 * (`productos_write_lider`, 0004_rls.sql) — sin RPC nueva, un UPDATE
 * normal ya dispara el trigger de historial (20260915223000). Solo
 * líderes la ven: un integrante que fuerce el botón se topa con el
 * mismo RLS, sin distinto mensaje que un error cualquiera.
 */

export function ProductosAgrupados({
  productos,
  ubicacionId,
  sububicaciones,
  esLider,
}: {
  productos: ProductoListado[];
  ubicacionId: string;
  sububicaciones: Sububicacion[];
  esLider: boolean;
}) {
  const router = useRouter();
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);

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

  // Un solo UPDATE para toda la selección — `productos.estado` no tiene RPC
  // propia, el trigger de historial (20260915223000) escucha cualquier
  // UPDATE sobre `productos`, no una llamada explícita.
  async function aplicarEstadoMasivo(estado: "activo" | "descontinuado") {
    const ids = Array.from(seleccionados);
    setAplicando(true);
    const { error } = await createClient().from("productos").update({ estado }).in("id", ids);
    setAplicando(false);
    if (error) {
      avisar.error(traducirError(error, estado === "activo" ? "activar los productos" : "desactivar los productos"));
      return;
    }
    const sustantivo = ids.length === 1 ? "producto" : "productos";
    const participio = estado === "activo" ? "activado" : "desactivado";
    avisar.exito(`${ids.length} ${sustantivo} ${participio}${ids.length === 1 ? "" : "s"}`);
    setSeleccionados(new Set());
    router.refresh();
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
            {esLider && (
              <>
                <button
                  type="button"
                  onClick={() => aplicarEstadoMasivo("activo")}
                  disabled={aplicando}
                  className="ml-2 text-tinta/55 hover:text-rojo disabled:opacity-50"
                >
                  Activar
                </button>
                <button
                  type="button"
                  onClick={() => aplicarEstadoMasivo("descontinuado")}
                  disabled={aplicando}
                  className="ml-2 text-tinta/55 hover:text-rojo disabled:opacity-50"
                >
                  Desactivar
                </button>
              </>
            )}
            <button type="button" onClick={() => setSeleccionados(new Set())} className="ml-2 text-tinta/55 hover:text-rojo">
              Limpiar selección
            </button>
          </>
        ) : (
          "Seleccionar todo en esta página"
        )}
      </label>

      <div className={`label-cayla hidden items-center gap-3 px-5 text-[11px] text-tinta/55 sm:grid ${PLANTILLA_FILA}`}>
        <span aria-hidden />
        <span>Producto</span>
        <span>Categoría</span>
        <span className="text-right">Variantes</span>
        <span className="text-right">Stock</span>
        <span className="text-right">Costo</span>
        <span>Estado</span>
        <span aria-hidden />
      </div>

      {productos.map((p) => {
        const abierto = abiertos.has(p.productoId);
        const sinStock = p.stockTotal === 0;
        const stockBajo = !sinStock && p.stockMinimo != null && p.stockTotal < p.stockMinimo;
        const tonoStock = sinStock ? "text-rojo" : stockBajo ? "text-ambar" : "text-tinta/75";
        const rotacion = describirRotacion(p.demandaDiaria);
        return (
          <div key={p.productoId} className="card-cayla overflow-hidden">
            <div className={`flex items-center gap-3 px-5 py-3.5 hover:bg-sand/30 sm:grid sm:gap-x-3 sm:gap-y-2 ${PLANTILLA_FILA}`}>
              <input
                type="checkbox"
                checked={seleccionados.has(p.productoId)}
                onChange={() => toggleSeleccionado(p.productoId)}
                className="h-3.5 w-3.5 shrink-0 accent-rojo"
                aria-label={`Seleccionar ${p.referencia}`}
              />
              <button
                onClick={() => toggleAbierto(p.productoId)}
                className="flex min-w-0 items-center gap-2 text-left"
                aria-expanded={abierto}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-tinta" title={p.referencia}>
                  {p.referencia}
                  {p.codigo && <span className="ml-2 font-mono text-xs text-tinta/55">{p.codigo}</span>}
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
              <span className="hidden truncate text-xs text-tinta/65 sm:block" title={`${p.categoria ?? "—"} · ${p.marca} · ${p.proveedor}`}>
                {p.categoria ?? "—"}
                <span className="block truncate text-[10.5px] text-tinta/45">{p.marca}</span>
              </span>
              <span className="hidden text-right text-xs tabular-nums text-tinta/65 sm:block">{p.variantes.length}</span>
              <span className={`hidden text-right text-xs font-semibold tabular-nums sm:block ${tonoStock}`}>{p.stockTotal}</span>
              <span className="hidden text-right text-xs tabular-nums text-tinta/65 sm:block">{rangoCosto(p.variantes)}</span>
              <span className="hidden sm:block">
                <Chip tono={p.estado === "activo" ? "verde" : "apagado"}>{p.estado === "activo" ? "Activo" : "Descontinuado"}</Chip>
              </span>
              <span className="justify-self-end">
                <MenuFila productoId={p.productoId} ubicacionId={ubicacionId} sububicaciones={sububicaciones} />
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pb-3.5 sm:hidden">
              <span className="text-xs text-tinta/65">{p.categoria ?? "—"}</span>
              <span className="text-xs text-tinta/55">{p.marca}</span>
              <span className="label-cayla text-[11px] text-tinta/55">
                {p.variantes.length} {p.variantes.length === 1 ? "variante" : "variantes"}
              </span>
              <span className={`text-xs font-semibold tabular-nums ${tonoStock}`}>Stock {p.stockTotal}</span>
              <span className="text-xs tabular-nums text-tinta/65">{rangoCosto(p.variantes)}</span>
              <Chip tono={p.estado === "activo" ? "verde" : "apagado"}>{p.estado === "activo" ? "Activo" : "Descontinuado"}</Chip>
              {sinStock && <Chip tono="rojo">Sin stock</Chip>}
              {stockBajo && <Chip tono="ambar">Stock bajo</Chip>}
              {p.reponerDeProveedor && <Chip tono="ambar">Pedir a proveedor</Chip>}
              {rotacion && <span className="text-xs text-tinta/55">{rotacion}</span>}
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
function MenuFila({
  productoId,
  ubicacionId,
  sububicaciones,
}: {
  productoId: string;
  ubicacionId: string;
  sububicaciones: Sububicacion[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [ajustando, setAjustando] = useState(false);
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

  // TODO: Duplicar/Archivar quedan fuera del alcance de esta integración
  // (B2 solo cablea Ajustar inventario, Ver historial y las acciones
  // masivas) — siguen como placeholder para quien las tome después.
  function accionPendiente(nombre: string) {
    return () => {
      setAbierto(false);
      window.alert(`"${nombre}" todavía no está conectado.`);
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
              onClick={() => {
                setAbierto(false);
                setAjustando(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-tinta/75 hover:bg-rojo/10"
            >
              Ajustar inventario
            </button>
          </li>
          <li role="none">
            <Link
              role="menuitem"
              href={`/productos/${productoId}/historial`}
              className="block px-3 py-2 text-sm text-tinta/75 hover:bg-rojo/10"
              onClick={() => setAbierto(false)}
            >
              Ver historial
            </Link>
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
      {ajustando && (
        <AjustarInventarioModal
          productoId={productoId}
          ubicacionId={ubicacionId}
          sububicaciones={sububicaciones}
          onClose={() => setAjustando(false)}
        />
      )}
    </div>
  );
}
