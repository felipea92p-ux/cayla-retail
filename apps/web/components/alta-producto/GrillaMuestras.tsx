import type { ComponentProps, ReactNode } from "react";

/* ====================================================================
   GrillaMuestras · el molde visual compartido por Tejido, Patrón, Temporada y Etiquetas (2026-09-29)

   Antes cada campo del paso 3 resolvía "elegir de una lista con imagen" a su manera: Tejido y Patrón ya tenían la
   grilla de tarjetas + «Ver todos»; Temporada era un <select> nativo con la temporada heredada escondida en la
   primera opción; Etiquetas era un buscador siempre visible con toda la lista agrupada debajo. Felipe pidió que las
   cuatro se vean hechas por la misma mano (CLAUDE.md, integridad conceptual): un solo molde, acá, y cada campo lo usa.

   CONTRATO
     PROMETE: una tarjeta de ~92px con el mismo borde/fondo en los mismos tres estados (normal, elegida, cubierta) sea
              cual sea el campo que la use; una grilla que nunca hace scroll horizontal; una tarjeta punteada final
              con el total del universo, sea cual sea su singular/plural.
     ASUME:   quien la usa decide QUÉ dibujar adentro (imagen, ícono, o el placeholder «Sin muestra»/«Ninguna») — este
              archivo no sabe de tejidos, patrones, temporadas ni etiquetas.
     NO HACE: no abre la hoja de «Ver todos» ni decide qué hay dentro; eso es de quien la usa (`ElegirMuestra`,
              `ElegirTemporada`, `ElegirEtiquetas`), porque el contenido de esa hoja difiere mucho entre los cuatro
              (con o sin búsqueda, con o sin «proponer», de a uno o de a varios).
   ==================================================================== */

/** En celular, 3 columnas fijas; en escritorio, tantas como quepan de ≥92px. Nunca scroll horizontal. */
export function GrillaMuestras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))]">{children}</div>;
}

/**
 * El marco de una tarjeta: mismo tamaño y mismos bordes para los cuatro campos. `cubierta` es el estado punteado de
 * Etiquetas («ya aplica sola», no se puede marcar) — Tejido/Patrón/Temporada nunca lo usan, así que por defecto es
 * `false` y se comportan igual que antes de este archivo existir.
 */
export function TarjetaMuestraBase({
  elegido,
  cubierta = false,
  guardando = false,
  deshabilitado = false,
  onClick,
  title,
  children,
  ...resto
}: {
  elegido: boolean;
  cubierta?: boolean;
  guardando?: boolean;
  deshabilitado?: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
  // Lo que un `<TooltipTrigger asChild>` le inyecta a su hijo (el `ref` con que ancla la burbuja, los eventos del mouse y del
  // teclado, `aria-describedby`). Sin pasarlo al `<button>`, la burbuja de una tarjeta envuelta nunca se abre ni sabe dónde ponerse.
} & Omit<ComponentProps<"button">, "onClick" | "title" | "children" | "disabled" | "className" | "type" | "aria-pressed" | "aria-disabled">) {
  const base = "flex min-w-0 flex-col gap-1 rounded-md border p-1.5 text-left text-[12.5px] transition-colors disabled:cursor-not-allowed";
  const estilo = cubierta
    ? "cursor-default border-dashed border-tinta/30 bg-tinta/[0.03] text-tinta/70"
    : elegido
      ? "border-tinta bg-tinta/[0.07] text-tinta"
      : "border-tinta/15 text-tinta/75 hover:border-tinta/40";
  return (
    <button
      {...resto}
      type="button"
      onClick={onClick}
      aria-pressed={cubierta ? undefined : elegido}
      aria-disabled={cubierta || undefined}
      disabled={deshabilitado}
      title={title}
      className={`${base} ${estilo} ${guardando ? "" : "disabled:opacity-50"}`}
    >
      {children}
    </button>
  );
}

/** La tarjeta punteada «Ver todos · N…» al final de la grilla: abre la hoja con el resto del universo. */
export function TileVerTodos({ total, singular, plural, onClick }: { total: number; singular: string; plural: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="flex min-h-[70px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-tinta/25 p-1.5 text-center text-taupe transition-colors hover:border-tinta/50 hover:bg-tinta/[0.04]"
    >
      <span className="text-[13px] font-semibold text-tinta">Ver todos</span>
      <span className="text-[12px] tabular-nums">
        {total} {total === 1 ? singular : plural}
      </span>
    </button>
  );
}
