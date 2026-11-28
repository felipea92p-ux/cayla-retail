import type { LucideIcon } from "lucide-react";

/* ====================================================================
   LineaDeDatos: los datos sueltos de una fila (ADR-0716, Felipe 2026-11-27)

   Caso 2 de la regla «Separar sin punto»: talla, color, dónde, sede, rol… los datos que van debajo de un nombre y que no forman
   frase. Hasta entonces se escribían en una tira con «·» entre ellos («M · Negro · Almacén»): no se sabe qué es cada dato y un
   lector de pantalla los lee pegados (NVDA calla el «·» sin pausa). Aquí cada dato es su pieza, con espacio entre ellas y sin
   ningún signo, como la tira de metadatos de la BBC.

   Cada pieza lleva un ícono chico que dice qué es (Felipe eligió «con ícono»): 14 px junto al texto y con su grosor de fábrica
   («Los íconos», unificar.md), mudo para el lector. El lector oye en cambio un rótulo que no se ve: «Talla: M».

   Si un dato se puede decir en voz alta junto al otro («en Trujillo, el lunes»), no es una línea de datos: es una frase (caso 1).
   Un dato con su nombre a la vista es `<ParDato>` (caso 4).

   Es una pieza de la familia: nació igual en CAYLA Dynamic (`components/ui/linea-de-datos.tsx`, muestra de Asistencia) y esta la
   reemplaza con la misma forma (docs/familia/README.md, «Separar sin punto»).
   ==================================================================== */

export interface DatoDeLinea {
  /** El ícono de lucide que dice qué es el dato: `Ruler` la talla, `Palette` el color, `MapPin` el lugar. */
  icono: LucideIcon;
  /** Qué es, para el lector de pantalla: «Talla», «Color», «Dónde». No se ve. */
  rotulo: string;
  /** El dato. Vacío o null: la pieza no se dibuja. */
  valor: string | null | undefined;
}

export function LineaDeDatos({
  datos,
  renglones,
  className = "",
}: {
  /** Las piezas, en orden. Un `null`, un `false` o un dato sin valor se omiten. */
  datos: readonly (DatoDeLinea | null | false | undefined)[];
  /** En una fila de una lista larga y angosta (Movimientos a 375 px): como mucho estos renglones, con las piezas que caben ENTERAS;
   *  las que no caben no se ven (nunca media palabra cortada), aunque el lector de pantalla las sigue diciendo. Por eso lo que importa
   *  va primero. Sin esto, la línea baja todos los renglones que haga falta. */
  renglones?: 1 | 2;
  /** Su lugar y su letra en la fila (`text-sm` si es la segunda línea de una fila que se lee); por defecto, 14 px en el tono secundario. */
  className?: string;
}) {
  const visibles = datos.filter((d): d is DatoDeLinea & { valor: string } => Boolean(d && d.valor && d.valor.trim()));
  if (visibles.length === 0) return null;
  // `span` y no `ul`: la línea vive a veces dentro de un <button> o de una fila clicable, donde una lista no es válida.
  return (
    <span className={`flex min-w-0 items-center gap-x-3.5 text-detalle text-secundario flex-wrap ${renglones ? `overflow-hidden ${renglones === 1 ? "max-h-[1lh]" : "max-h-[2lh]"}` : ""} ${className}`}>
      {visibles.map((d, i) => (
        <span key={`${d.rotulo}-${i}`} className="inline-flex min-w-0 items-center gap-1.5">
          <d.icono aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span className="sr-only">{d.rotulo}: </span>
          <span className="truncate">{d.valor}</span>
        </span>
      ))}
    </span>
  );
}
