import type { CamposBuscables } from "./filtro-busqueda-especial";

// Búsqueda de Análisis (Resumen, Desempeño y Comparar períodos). Desde 2026-09-21 la hace el
// «Filtro de búsqueda especial» (`filtro-busqueda-especial.ts`), el mismo de Existencias y
// Movimientos: cada palabra escrita es una CONDICIÓN y todas tienen que cumplirse, en cualquier
// orden («blusa blanco L» = blusa Y blanco Y talla L). Antes esta pantalla tenía su propio motor
// (ADR-0121); dos motores para lo mismo terminaban diciendo cosas distintas sobre la misma
// prenda, así que aquí solo queda decir cómo se lee una fila del análisis.

export type CamposBusqueda = {
  referencia: string;
  categoria: string | null;
  color: string | null;
  talla: string | null;
  sku: string;
  codigo: string | null;
  productoCodigo: string | null;
  codigosBarras: string[];
};

/**
 * Cómo lee el filtro una fila del análisis. La categoría se busca como parte del nombre: quien escribe
 * «bolsos» quiere lo que está en la categoría Bolsos aunque el producto se llame «Andrea». El código de la
 * variante y el del producto se buscan igual que el SKU y el de barras.
 */
export function camposBuscables(c: CamposBusqueda): CamposBuscables {
  return {
    nombre: c.categoria ? `${c.referencia} ${c.categoria}` : c.referencia,
    sku: c.sku,
    codigosBarras: c.codigosBarras,
    otrosCodigos: [c.codigo, c.productoCodigo].filter((x): x is string => !!x),
    color: c.color,
    talla: c.talla,
  };
}
