import { UMBRAL_POCA_BASE_VENTAS } from "@/lib/inventario-reglas";
import { seVendioYYaNoHay } from "@/lib/produccion-decisiones";

// Las dos piezas de cifra que la hoja «Ver el modelo» repite en sus bloques: la cifra de la cabecera y la cifra de una celda (lo vendido y, debajo, lo que queda). Sin estado:
// las usan la tabla por tienda, la matriz y el pie de cada una, y todas dicen lo mismo con las mismas reglas (poca base en gris, «ya no hay» en ámbar con su punto).

/** En celular el encabezado de una tabla no se ve y la fila se apila: cada cifra dice entonces a qué se refiere. Desde `sm` no se dibuja (el encabezado ya lo dice). */
export function Rotulo({ children }: { children: string }) {
  return <span className="mr-1 text-taupe sm:hidden">{children}</span>;
}

/** Un dato suelto de la cabecera: la etiqueta, la cifra y, debajo, lo que la explica. */
export function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: number | string; nota?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-cayla text-[11px] text-tinta/65">{etiqueta}</dt>
      <dd className="mt-0.5 text-xl leading-tight tabular-nums text-tinta">{valor}</dd>
      {nota && <dd className="text-xs text-tinta/65">{nota}</dd>}
    </div>
  );
}

/**
 * Lo vendido y, debajo, lo que queda en tiendas (solo si queda algo: repetir «sin stock» en cada cifra de un modelo agotado es ruido). En gris, con 2 ventas o menos (poca base). En una
 * CELDA (`celda`), lo que se vendió y ya no hay lleva su aviso en ámbar con su punto (el color no es lo único que lo dice); un total no lo lleva: habla de varias tallas o colores.
 */
export function Cifras({ ventas, stock, fuerte = false, celda = false }: { ventas: number; stock: number; fuerte?: boolean; celda?: boolean }) {
  const yaNoHay = celda && seVendioYYaNoHay(ventas, stock);
  const pocaBase = ventas <= UMBRAL_POCA_BASE_VENTAS;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={`text-sm tabular-nums ${pocaBase ? "text-tinta/65" : "font-medium text-tinta"} ${fuerte ? "font-semibold" : ""}`}>{ventas}</span>
      {yaNoHay ? (
        <span className="mt-0.5 text-[11px] text-ambar">
          <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-ambar align-middle" />
          ya no hay
        </span>
      ) : (
        stock > 0 && <span className="mt-0.5 text-[11px] text-tinta/65">hay {stock}</span>
      )}
    </span>
  );
}
