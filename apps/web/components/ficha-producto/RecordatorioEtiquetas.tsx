"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { hrefEtiquetasDeSubidas, juntarSubidas } from "@/lib/matriz-ficha-reglas";
import { conDesde } from "@/lib/vuelta-productos";

// Recordatorio de «Imprimir etiquetas» (2026-10-02, Felipe: «que sea bastante visible y que no desaparezca hasta
// cambiar de módulo»). Cuando un ajuste de stock desde la ficha de un producto SUBE alguna talla, hay una prenda más
// sin etiquetar — pero el aviso no sale en el momento del ajuste (eso sería interrumpir cada +/- del stepper): se
// junta aquí y se muestra como una franja fija arriba de toda pantalla de Catálogo ▸ Productos, hasta que la persona
// la imprime, la descarta a mano, o sale del módulo.
//
// Por qué un Context en `productos/layout.tsx` y no el sistema de avisos (`components/ui/Avisos.tsx`): Avisos es a
// propósito un toast que se apaga solo (4-8 s, ver su propio comentario) — nunca tuvo un modo persistente, y no debía
// ganarlo solo para este caso. Un layout de módulo (`app/(app)/productos/layout.tsx`) ya se queda montado mientras
// se navega DENTRO de Productos y se desmonta al salir a otro módulo (Inventario, Ventas…) — es el mismo ciclo de
// vida que pedía Felipe, sin inventar persistencia nueva (nada de localStorage: esto es de la VISITA, no de mañana).

/** `unidades`: cuántas entraron (Editar producto lo sabe al guardar); sin él, la etiqueta se pide por todo el stock de la talla. */
type LineaAumento = { varianteId: string; color: string | null; talla: string | null; unidades?: number };

type RecordatorioEtiquetasValor = {
  pendientes: readonly LineaAumento[];
  /** Suma las variantes que subieron de stock en este ajuste; si ya estaban en la lista, se suman sus unidades. */
  agregar: (lineas: readonly LineaAumento[]) => void;
  limpiar: () => void;
};

// Fuera del Provider (InventarioPanel.tsx, SelectorDeAjuste.tsx: AjustarInventarioModal también vive en Existencias,
// sin este recordatorio) `agregar`/`limpiar` no hacen nada — nunca hace falta un chequeo de null en cada caller.
const SIN_PROVEEDOR: RecordatorioEtiquetasValor = { pendientes: [], agregar: () => {}, limpiar: () => {} };
const RecordatorioEtiquetasContext = createContext<RecordatorioEtiquetasValor>(SIN_PROVEEDOR);

export function useRecordatorioEtiquetas(): RecordatorioEtiquetasValor {
  return useContext(RecordatorioEtiquetasContext);
}

export function RecordatorioEtiquetasProvider({ children }: { children: ReactNode }) {
  const [pendientes, setPendientes] = useState<LineaAumento[]>([]);

  const agregar = useCallback((lineas: readonly LineaAumento[]) => {
    setPendientes((actual) => {
      const conUnidades = lineas.filter((l) => l.unidades !== undefined);
      const sinUnidades = lineas.filter((l) => l.unidades === undefined && !actual.some((a) => a.varianteId === l.varianteId));
      if (conUnidades.length === 0 && sinUnidades.length === 0) return actual;
      // Las de Editar producto traen cuántas: se suman a las que ya estaban (dos guardados en la misma visita = una etiqueta por unidad).
      const sumadas = juntarSubidas(
        actual.filter((a) => a.unidades !== undefined).map((a) => ({ ...a, unidades: a.unidades! })),
        conUnidades.map((l) => ({ ...l, unidades: l.unidades! }))
      );
      return [...actual.filter((a) => a.unidades === undefined), ...sinUnidades, ...sumadas];
    });
  }, []);
  const limpiar = useCallback(() => setPendientes([]), []);

  return (
    <RecordatorioEtiquetasContext.Provider value={{ pendientes, agregar, limpiar }}>
      <BannerRecordatorio pendientes={pendientes} onLimpiar={limpiar} />
      {children}
    </RecordatorioEtiquetasContext.Provider>
  );
}

function BannerRecordatorio({ pendientes, onLimpiar }: { pendientes: readonly LineaAumento[]; onLimpiar: () => void }) {
  if (pendientes.length === 0) return null;
  // Si todas dicen cuántas entraron, se imprime justo eso; si alguna no lo sabe (vino del modal de ajuste), todo el stock de cada talla.
  // La franja vive en Productos: «Volver» de Etiquetas regresa a Productos, no a Existencias.
  const href = conDesde(
    (pendientes.every((l) => l.unidades !== undefined) ? hrefEtiquetasDeSubidas(pendientes.map((l) => ({ ...l, unidades: l.unidades! }))) : null) ??
      `/etiquetas-de-precio?variantes=${pendientes.map((l) => l.varianteId).join(",")}`,
    "/productos"
  );
  const detalle = pendientes.map((l) => `${l.color ?? "Sin color"} · ${l.talla ?? "Sin talla"}`).join(", ");

  // Sin `sticky`: la cabecera de la app ya es translúcida A PROPÓSITO para que el contenido pase por debajo al hacer
  // scroll (comentario de `AppShell.tsx` junto al `<header>`) — una segunda franja fija competiría con eso. Este
  // banner vive en el flujo normal, arriba de cada pantalla de Productos.
  return (
    <div role="status" className="anim-revelar mb-4 -mt-1 rounded-xl border border-ambar/50 bg-[color-mix(in_srgb,var(--color-ambar)_10%,var(--color-papel))] px-4 py-3 sm:px-5">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-3 gap-y-1.5">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-ambar" />
        <p className="shrink-0 text-[13.5px] font-semibold text-ambar-profundo">
          {pendientes.length} {pendientes.length === 1 ? "prenda nueva sin etiquetar" : "prendas nuevas sin etiquetar"}
        </p>
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-tinta/60" title={detalle}>
          {detalle}
        </p>
        <Link href={href} className="btn-cayla btn-primario shrink-0 text-[12.5px]">
          Imprimir etiquetas
        </Link>
        <button
          type="button"
          onClick={onLimpiar}
          aria-label="Descartar el aviso de etiquetas pendientes"
          title="Descartar"
          className="shrink-0 rounded px-1.5 py-1 text-tinta/45 transition-colors hover:bg-tinta/[0.06] hover:text-tinta"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
