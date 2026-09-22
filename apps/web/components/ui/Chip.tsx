import type { ReactNode } from "react";

/* ====================================================================
   Chip · estado de una cosa, leído de un vistazo (2026-09-14, Compras)

   Por qué existe: en Compras los estados ("Pago parcial", "Recibida",
   "Vencida") eran texto suelto en versalitas, del mismo color que el
   resto de la fila — para saber qué facturas faltaban recibir había que
   LEER cada fila. Un chip con fondo tenue se distingue sin leerlo, y el
   tono dice lo que importa: ámbar = a medias, verde = hecho, rojo = hay
   que actuar, neutro = todavía nada, apagado = ya no cuenta (anulada).

   Los tonos son los mismos que ya usaba `ESTADO_ESTILO` en
   comprobantes-reglas.ts (misma receta: borde al 30%, fondo al 10%,
   texto en la variante "profunda" para que apruebe contraste). Vive en
   ui/ para que Facturación y Compras dibujen el mismo chip.

   `vivo` (2026-09-19, ADR-0136, opt-in): un puntito rojo que late suave junto al texto —el
   chip «Vencida» de Comprobantes, lo único de la lista que pide actuar HOY—. Es la única
   animación en bucle permitida en la pantalla; con movimiento reducido el punto queda quieto.
   ==================================================================== */

export type TonoChip = "neutro" | "ambar" | "verde" | "rojo" | "pizarra" | "apagado";

// Guía oficial (2026-09-22, ADR-0169): insignia sin borde, fondo del color del estado al 10–15 % y un punto
// del mismo color antes del texto. `pizarra` es el estado informativo (en camino, en revisión): no es semáforo.
const TONO: Record<TonoChip, string> = {
  neutro: "bg-sand text-taupe",
  ambar: "bg-ambar/15 text-ambar",
  verde: "bg-verde/15 text-verde",
  rojo: "bg-rojo/10 text-rojo-profundo",
  pizarra: "bg-pizarra/15 text-pizarra",
  // /65 y no /45: tachado, el 45 % no llegaba a 3:1 y «Anulado» / «No emitido» son la única palabra que dice el estado.
  apagado: "border border-tinta/10 bg-transparent text-tinta/65",
};

// El punto de la insignia: `currentColor`, así hereda el tono sin una tabla aparte.
const PUNTO = "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']";

export function Chip({
  tono = "neutro",
  versalitas = true,
  vivo = false,
  tachado = true,
  children,
  className = "",
}: {
  tono?: TonoChip;
  /** `false` (Cambios, 2026-09-18): texto en minúscula normal y un ícono al lado — un
   *  estado que se lee como frase ("Vence en 2 días"). El default deja a Compras y
   *  Facturación exactamente como estaban. */
  versalitas?: boolean;
  /** Punto que late suave antes del texto (solo con `versalitas`). Reservado a lo que pide actuar hoy. */
  vivo?: boolean;
  /** Solo con `tono="apagado"`: el texto va tachado (es lo que pide «Anulado» / «No emitido»: algo que se
   *  canceló). `false` para un estado que NO es una anulación —«Descontinuado» en Productos—, donde un
   *  tachado se lee como negación («no descontinuado»). */
  tachado?: boolean;
  children: ReactNode;
  className?: string;
}) {
  // `versalitas` conserva su nombre por compatibilidad (≈40 usos), pero desde la guía oficial ya no pone el
  // texto en mayúsculas: es la insignia con punto. `false` sigue siendo la variante con ícono propio, sin punto.
  const forma = versalitas
    ? `inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs leading-5 ${vivo || tono === "apagado" ? "" : PUNTO}`
    : "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium leading-5";
  return (
    <span className={`${forma} whitespace-nowrap rounded-full ${TONO[tono]} ${tono === "apagado" && tachado ? "line-through" : ""} ${className}`}>
      {vivo && versalitas && <span aria-hidden className="cmp-punto-vivo" />}
      {children}
    </span>
  );
}
