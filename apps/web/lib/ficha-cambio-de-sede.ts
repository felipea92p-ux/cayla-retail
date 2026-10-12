// El stock tocado en Editar producto es de SU sede (Felipe, 2026-10-11). Puro: sin React ni `window`; lo usa
// `components/ficha-producto/useStockFicha.ts` y lo prueba `ficha-cambio-de-sede.test.ts`.
//
// El problema: el selector de sede de la cabecera cambia la sede con `router.refresh()`. La ruta no cambia y la ficha conserva su
// estado. Lo tocado en la matriz son DIFERENCIAS por talla (+2, −1) que esperan a «Revisar y guardar»: tras pasar de Lima a
// Trujillo, la ficha releía el stock de Trujillo pero le seguía sumando las diferencias de Lima, y `ajustar_inventario` las
// aplicaba en Trujillo. Un conteo de Lima (S 4 → 6) entraba como +2 prendas en Trujillo, y Lima seguía en 4.
//
// La decisión: el stock tocado se suelta y un aviso dice qué era, para repetirlo en su sede. El resto de la ficha (nombre, precio,
// fotos, variantes nuevas) no es de ninguna sede y se queda. Se descartó guardarlo por sede, como en Vender y Recibir: el stock se
// guarda junto con la ficha, y guardar la ficha estando en otra sede cerraría la pantalla con lo de la primera adentro.

import type { MotivoAjuste } from "./ajuste-reglas";
import type { CambioDeStock } from "./matriz-ficha-reglas";

/** Cómo empieza una visita de stock: el motivo, la nota y el lugar se eligen una vez por visita, y una visita es de una sede. */
export const VISITA_DE_STOCK_INICIAL: { motivo: MotivoAjuste; nota: string; ubicado: "piso" | "almacen" } = {
  motivo: "conteo_fisico",
  nota: "",
  ubicado: "almacen",
};

const MAX_TALLAS = 4;

/** Una talla como la escribe la hoja de «Revisar y guardar» (`grupoDeStockEnHoja`): «S · Negro 4 → 6». */
const textoDeCambio = (c: CambioDeStock) => `${[c.talla ?? "Única", c.color].filter(Boolean).join(" · ")} ${c.antes} → ${c.despues}`;

function enUnaFrase(partes: string[]): string {
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** El aviso al soltar el stock tocado en una sede; `null` si no había nada tocado. */
export function avisoStockDescartado({
  etiqueta,
  cambios,
  nuevasConStock,
}: {
  etiqueta: string;
  cambios: readonly CambioDeStock[];
  nuevasConStock: number;
}): { texto: string; detalle: string } | null {
  if (cambios.length === 0 && nuevasConStock === 0) return null;
  const partes = cambios.slice(0, MAX_TALLAS).map(textoDeCambio);
  const resto = cambios.length - MAX_TALLAS;
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? "talla" : "tallas"} más`);
  if (nuevasConStock > 0) partes.push(`el stock de ${nuevasConStock} ${nuevasConStock === 1 ? "variante nueva" : "variantes nuevas"}`);
  return {
    texto: `No se guardó el stock que tocaste en ${etiqueta}`,
    detalle: `${enUnaFrase(partes)}. Vuelve a ${etiqueta} con el selector de arriba y repítelo. El resto de la ficha sigue como lo dejaste.`,
  };
}
