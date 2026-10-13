// Los ejemplos de «Nueva orden de insumos» (CLAUDE.md «Sugerencias coherentes», ADR-0290): lo que dicen las cajas vacías sigue al
// insumo que la persona eligió en la línea. Lógica pura, probada contra TODAS las unidades y tipos del catálogo de insumos
// (`sugerencias-orden-insumo.test.ts`); el componente solo la llama.
//
// Fuente, en este orden: la UNIDAD del insumo para la cantidad (`insumos.unidad_medida`: lo que se mide —metros, kilos— lleva decimales
// en el ejemplo; lo que se cuenta —conos, unidades, pares, docenas—, un número entero) y el TIPO para la descripción (`insumos.tipo`:
// una tela se describe por su color y su ancho; un avío, por su color o su medida). Sin insumo elegido, un texto que no promete nada.
// Una unidad o un tipo que el catálogo sume mañana cae al neutro, nunca al ejemplo de otro.

/** Lo más largo que entra sin cortarse en la caja de la cantidad (6 rem con su relleno) y en la de la descripción a 375 px. */
export const MAX_CANTIDAD = 9;
export const MAX_DESCRIPCION = 30;

/** El ejemplo de la cantidad según la unidad del insumo elegido. Sin insumo, «0». */
export function sugerirCantidadInsumo(unidad: string | null): { texto: string } {
  switch (unidad) {
    case "metro":
      return { texto: "Ej. 12.5" };
    case "kilo":
      return { texto: "Ej. 2.5" };
    case "cono":
      return { texto: "Ej. 6" };
    case "unidad":
      return { texto: "Ej. 100" };
    case "par":
      return { texto: "Ej. 50" };
    case "docena":
      return { texto: "Ej. 10" };
    default:
      return { texto: "0" };
  }
}

/** El ejemplo de la descripción según el tipo del insumo elegido. Sin insumo, solo dice que es opcional. */
export function sugerirDescripcionInsumo(tipo: string | null): { texto: string } {
  switch (tipo) {
    case "tela":
      return { texto: "Ej. color crudo, ancho 1.50 m" };
    case "avio":
      // «Avío» es un botón, un hilo, un cierre o una etiqueta: el color y la medida sirven para todos (un «15 mm» no le dice nada a un hilo).
      return { texto: "Ej. color o medida" };
    default:
      return { texto: "Opcional" };
  }
}
