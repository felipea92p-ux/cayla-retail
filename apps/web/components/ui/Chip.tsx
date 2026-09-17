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
   ==================================================================== */

export type TonoChip = "neutro" | "ambar" | "verde" | "rojo" | "apagado";

const TONO: Record<TonoChip, string> = {
  neutro: "border-tinta/15 bg-tinta/[0.04] text-tinta/75",
  ambar: "border-ambar/30 bg-ambar/10 text-ambar-profundo",
  verde: "border-verde/45 bg-verde/10 text-verde-profundo",
  rojo: "border-rojo/30 bg-rojo/10 text-rojo-profundo",
  apagado: "border-tinta/10 bg-transparent text-tinta/45 line-through",
};

export function Chip({ tono = "neutro", children, className = "" }: { tono?: TonoChip; children: ReactNode; className?: string }) {
  return (
    <span className={`label-cayla inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] leading-4 ${TONO[tono]} ${className}`}>
      {children}
    </span>
  );
}
