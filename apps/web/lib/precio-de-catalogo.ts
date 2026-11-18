/**
 * El precio como lo dicen los catálogos de moda (Felipe 2026-11-02, docs/maquetas/productos-vidrio-2026-11/, «A · Catálogo de moda»):
 * sin «.00». «S/ 90.00» se lee «S/ 90»; «S/ 89.90» se queda como está (los céntimos que existen se dicen, los que no, no). Lo usa la
 * tarjeta de la Grilla de Productos; la Tabla, la vista rápida y la caja siguen con sus dos decimales (ahí se compara y se cobra).
 *
 * Un precio llega de la base como `numeric(…, 2)`, pero en JavaScript 89.9 + 0.1 no siempre da 90 exacto: se decide por los
 * céntimos redondeados, no por `Number.isInteger`, para que un 89.99999999 no salga «S/ 90.00».
 */

/** Entre «S/» y el número va un espacio que no se parte: a 375 px el precio no queda con «S/» solo al final de la línea. */
const PREFIJO = "S/ ";

/** «S/ 90» · «S/ 89.90» · «S/ 1,290» (con los miles de es-PE, como el resto del ERP). */
export function solesDeCatalogo(n: number): string {
  const centimos = Math.round(n * 100);
  const entero = centimos % 100 === 0;
  return (
    PREFIJO +
    (centimos / 100).toLocaleString("es-PE", {
      minimumFractionDigits: entero ? 0 : 2,
      maximumFractionDigits: entero ? 0 : 2,
    })
  );
}

/**
 * El precio de una prenda cuyas tallas no cuestan lo mismo: «S/ 79–89». Cada punta sigue la misma regla por su cuenta
 * («S/ 79.90–89»). Sin ningún precio de verdad, `null` (quien llama decide qué mostrar).
 */
export function rangoDeCatalogo(valores: readonly (number | null)[]): string | null {
  const nums = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const desde = solesDeCatalogo(min);
  if (Math.round(min * 100) === Math.round(max * 100)) return desde;
  return `${desde}–${solesDeCatalogo(max).slice(PREFIJO.length)}`;
}
