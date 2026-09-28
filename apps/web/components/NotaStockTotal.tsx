import Link from "next/link";
import { EXPLICACION_STOCK_TOTAL } from "@/lib/productos-stock";

/**
 * Dice de qué stock hablan los números de `/productos`. Desde ADR-0261 (Felipe, 2026-09-28) la tarjeta muestra lo de la
 * sede elegida arriba —la misma cifra que Existencias— y aparte las otras sedes, el Taller y lo que viene en camino;
 * las alertas («Sin stock», «Stock bajo») siguen mirando toda la empresa. Va debajo de los contadores y siempre
 * visible: un `title` no se ve en una tablet. Antes decía «Stock total — suma de todas las sedes y el Taller».
 */
export function NotaStockTotal() {
  return (
    <p className="mt-1 max-w-3xl text-xs text-tinta/70">
      {EXPLICACION_STOCK_TOTAL} El detalle por talla y sede está en{" "}
      <Link href="/inventario" className="underline underline-offset-2 hover:no-underline">
        Existencias
      </Link>
      .
    </p>
  );
}
