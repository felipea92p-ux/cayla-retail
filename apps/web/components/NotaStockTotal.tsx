import Link from "next/link";
import { EXPLICACION_STOCK_TOTAL, ROTULO_STOCK_TOTAL } from "@/lib/productos-stock";

/**
 * Dice de qué stock hablan los números de `/productos`: el total de toda la red (todas las sedes y el
 * Taller), no el de la sede activa del selector de la cabecera (pantalla:productos, tarea #2, opción A de
 * Felipe 2026-09-22). Va debajo de los contadores y siempre visible: un `title` no se ve en una tablet.
 */
export function NotaStockTotal() {
  return (
    <p className="mt-1 text-xs text-tinta/70">
      <span className="font-semibold">{ROTULO_STOCK_TOTAL}</span> — {EXPLICACION_STOCK_TOTAL} Para una sola sede, mira{" "}
      <Link href="/inventario" className="underline underline-offset-2 hover:no-underline">
        Inventario
      </Link>
      .
    </p>
  );
}
