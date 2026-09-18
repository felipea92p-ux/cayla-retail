"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Select } from "radix-ui";
import { ALTO_CONTROL, Hilo } from "@/components/ui/campos";

/* ====================================================================
   Píldoras de filtro · patrón compartido (nacido en FiltrosProductos el
   2026-09-17, extraído acá el 2026-09-18 al sumarse FiltrosCompras) —
   la barra "Buscar + botón Filtros" que despliega un panel de píldoras
   Radix Select, una por filtro, con chips debajo de lo aplicado.
   Cualquier listado nuevo con este patrón importa de acá en vez de
   copiar el Select a mano — Compras y Productos ya divergían en los
   filtros propios (proveedor/pago no son categoría/color), pero no
   tenían por qué divergir también en cómo se ve el control.
   ==================================================================== */

/** Radix Select no permite `value=""` (la reserva para "sin selección"), y en
 *  la URL "" YA significa "sin filtro" — este sentinel hace de puente. */
export const TODOS = "__todos__";

/** El botón "Filtros · N" que abre/cierra el panel — mismo alto y mismo
 *  ritmo vertical que el campo de búsqueda al lado (ver comentario en cada
 *  consumidor sobre el `<span>` de etiqueta transparente que los empareja). */
export function BotonFiltros({ abierto, activos, onClick }: { abierto: boolean; activos: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-controls="filtros-panel"
      className={`label-cayla mt-1.5 ${ALTO_CONTROL} inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3.5 text-[11px] transition-colors ${
        abierto || activos > 0
          ? "border-tinta/30 bg-tinta/[0.04] text-tinta"
          : "border-tinta/15 text-tinta/65 hover:border-tinta/25 hover:text-tinta"
      }`}
    >
      <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
      Filtros{activos > 0 ? ` · ${activos}` : ""}
    </button>
  );
}

/** El panel que agrupa las píldoras — una sola superficie (`divide-x` entre
 *  cada una), no una caja por campo. */
export function PanelPildoras({ children }: { children: ReactNode }) {
  return (
    <div id="filtros-panel" className="anim-revelar flex flex-wrap items-center divide-x divide-tinta/10 rounded-xl bg-sand/50 p-1 shadow-sm">
      {children}
    </div>
  );
}

/** Desplegable con estilo propio (Radix Select) para el panel de filtros —
 *  a diferencia de `<select>` nativo, acá SÍ se puede vestir la lista
 *  abierta, no solo el control cerrado. `valor`/`onValor` ya vienen
 *  resueltos contra el sentinel `TODOS`, este componente no sabe de URLs.
 *
 *  Sin caja propia (2026-09-17, pedido de Felipe: "no me gusta que estén
 *  encapsulados en esos rectángulos blancos"): nada de borde ni fondo en
 *  reposo — el mismo hilo vivo de `CampoTexto`/`SelectNativo` marca dónde
 *  está parado, la tipografía marca si hay un valor elegido. El panel que
 *  los agrupa (`divide-x`) es la única superficie; cada campo adentro es
 *  texto, no una caja más. */
export function DesplegablePildora({
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

export function ItemDesplegable({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Select.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-tinta outline-none data-[highlighted]:bg-rojo/8 data-[state=checked]:font-semibold data-[highlighted]:text-tinta"
    >
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}
