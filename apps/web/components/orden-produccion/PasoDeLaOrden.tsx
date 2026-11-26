import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { VOZ_DEL_PASO, type EstadoDelPaso } from "@/lib/orden-pasos-reglas";

// Un paso de «Nueva orden» (Producción más clara, Felipe 2026-11-26): el formulario de siempre, agrupado bajo tres títulos con número para que quien entra por primera vez vea por
// dónde empieza y cuánto le falta. La pieza es chica a propósito: el número en su círculo y el título de sección del sistema (`<TituloSeccion>`, con su «?» para lo que explica),
// sobre la placa que agrupa lo del paso (`vd-placa`: un bloque dentro de la tarjeta de la orden).
//
// El círculo dice cómo va el paso con lo que la guía de foco YA sabe (`estadoDelPaso`, `lib/orden-pasos-reglas.ts`): un visto verde si está hecho, el número en tinta si es el que
// sigue y el número tenue si todavía no toca. La palabra «Sigue» va en su insignia, a la derecha del título; `conPalabra={false}` la calla cuando un campo de adentro ya la dice
// (la guía enciende un solo «Sigue» a la vez). No decide nada: no cambia qué se puede confirmar.

const CIRCULO: Record<EstadoDelPaso, string> = {
  hecho: "bg-verde text-crema",
  sigue: "bg-tinta text-crema",
  pendiente: "vd-gota-chica text-secundario",
};

export function PasoDeLaOrden({
  numero,
  titulo,
  estado,
  conPalabra = true,
  ayuda,
  guia,
  children,
}: {
  numero: number;
  titulo: string;
  estado: EstadoDelPaso;
  /** La insignia «Sigue» junto al título. Se apaga cuando un campo de adentro ya lleva la suya. */
  conPalabra?: boolean;
  /** Lo que explica el paso: va detrás del «?» del título, nunca a la vista. */
  ayuda?: ReactNode;
  /** Ancla de la guía interactiva (ADR-0389). */
  guia?: string;
  children: ReactNode;
}) {
  return (
    <section data-guia={guia} data-paso={numero} data-estado={estado} aria-label={`Paso ${numero}: ${titulo}`} className="vd-placa rounded-2xl p-3.5 @min-[560px]:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full text-detalle font-semibold tabular-nums ${CIRCULO[estado]}`}>
          {estado === "hecho" ? <Check className="h-4 w-4" /> : numero}
        </span>
        <TituloSeccion nivel={3} className="min-w-0 flex-1" ayuda={ayuda} accion={estado === "sigue" && conPalabra ? <Chip>Sigue</Chip> : undefined}>
          {titulo}
        </TituloSeccion>
        <span className="sr-only">{VOZ_DEL_PASO[estado]}</span>
      </div>
      {children}
    </section>
  );
}
