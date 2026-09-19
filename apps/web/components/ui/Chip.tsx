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

export type TonoChip = "neutro" | "ambar" | "verde" | "rojo" | "apagado";

const TONO: Record<TonoChip, string> = {
  neutro: "border-tinta/15 bg-tinta/[0.04] text-tinta/75",
  ambar: "border-ambar/30 bg-ambar/10 text-ambar-profundo",
  verde: "border-verde/45 bg-verde/10 text-verde-profundo",
  rojo: "border-rojo/30 bg-rojo/10 text-rojo-profundo",
  apagado: "border-tinta/10 bg-transparent text-tinta/45 line-through",
};

export function Chip({
  tono = "neutro",
  versalitas = true,
  vivo = false,
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
  children: ReactNode;
  className?: string;
}) {
  const forma = versalitas
    ? `label-cayla ${vivo ? "inline-flex items-center gap-1.5" : "inline-block"} px-2.5 py-0.5 text-[10px] leading-4`
    : "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold leading-5";
  return (
    <span className={`${forma} whitespace-nowrap rounded-full border ${TONO[tono]} ${className}`}>
      {vivo && versalitas && <span aria-hidden className="cmp-punto-vivo" />}
      {children}
    </span>
  );
}
