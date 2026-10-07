// Análisis v4 (ADR-0357, act. 2026-10-07 b): «Nunca salió al piso». Lo que está guardado en el almacén de la tienda y nadie vio
// todavía en el piso de venta: la base dice, por prenda, cuándo salió al piso por primera vez (`salio_al_piso`, NULL si nunca) y
// cuándo llegó (`fn_analisis_sede`, migración 20261007120000). Lógica pura, sin base ni React.

/** La falla que se dice una vez si la base todavía no dice cuándo salió al piso cada prenda (sin la migración 20261007120000). */
export const FALLA_PISO = "No se pudo saber qué nunca salió al piso";
