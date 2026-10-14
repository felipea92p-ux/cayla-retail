// La tabla de «Nueva orden de producción» (ADR-0396, A2 «La tabla única»): arma lo que la tabla de cantidades de Nuevo producto (`MatrizCantidades`) necesita para
// dibujar un modelo que ya existe y uno que se está creando, y lee las cantidades de vuelta como siempre las leyó la orden. Antes la orden dibujaba su propia matriz a mano;
// ahora usa la misma pieza que Nuevo producto, y esta lógica pura es el puente.
//
// REGLA DE ORO: lo que viaja a la base NO cambia. Para un modelo nuevo, la fuente de las líneas sigue siendo `celdasDelBorrador` + `lineasRpc`
// (`modelo-nuevo-reglas.ts`): `tablaDeModeloNuevo` devuelve esas MISMAS celdas, por referencia, y no inventa otras. Para uno que existe,
// `lineasDeModeloExistente` es la expresión de siempre, tal cual. Lo prueba `orden-tabla-reglas.test.ts` contra un oráculo copiado del formulario de antes de A2.
//
// CONTRATO
//   PROMETE: que las celdas que la tabla muestra con caja son EXACTAMENTE las que pueden sumar a la orden (una combinación que el modelo no tiene sale rayada y no suma
//            aunque alguien escriba un número en su clave); que `totalesCantidades` sobre esta tabla coincide con la suma de las líneas que se mandan, cuando lo escrito es lo
//            que la caja deja escribir (solo dígitos, hasta 4); y que el orden de lo que se manda es el de siempre (el de las variantes del modelo; el del vocabulario para uno nuevo),
//            no el de los clics.
//   ASUME:   las claves de celda de un modelo que existe son sus `varianteId`; las de un modelo nuevo son `claveCelda(talla, color)`.
//   NO HACE: no escribe en la base, no valida precios ni costos (eso es `problemasDelModelo`) y no decide cuándo se puede abrir la orden.

import { claveCelda, type CeldaAlta } from "./alta-producto";
import { ordenarTallas, type CategoriaDeModelo } from "./modelo-nuevo-reglas";
import type { VarianteDeModelo } from "./produccion";
import { compararTallas } from "./tallas";

export type ColorDeTabla = { codigo: string; nombre: string; hex: string | null; familiaColor?: string | null; tipo?: string | null };
export type TablaDeOrden = {
  celdas: CeldaAlta[];
  /** Las columnas, en orden. Vacío = el modelo no tiene tallas (una sola columna «Única»). */
  tallas: { id: string; texto: string }[];
  /** Las filas, en orden. Vacío = el modelo no tiene colores (una sola fila «Sin color»). */
  colores: ColorDeTabla[];
  /** Las combinaciones que el modelo no tiene: se dibujan rayadas, sin caja, y nunca suman. */
  excluidas: Set<string>;
};

const UNICA = "Única";
const SIN_COLOR = "Sin color";

/**
 * Un modelo que YA existe. La clave de cada celda es el `varianteId`. Las tallas salen únicas y en el orden de `compararTallas` (S · M · L); los colores, en el orden en que
 * aparecen en las variantes (como lo dibujaba la matriz de antes). Si TODAS las variantes carecen de talla (o de color), ese eje se omite (`tallas: []` o `colores: []`, con
 * `tallaId`/`color` nulos); si solo algunas, la que no tiene es «Única» / «Sin color». Cada combinación que el modelo no tiene es una celda sintética `ausente|color|talla`,
 * incluida en `excluidas`: así la tabla la dibuja rayada y ninguna cantidad escrita ahí llega a las líneas.
 */
export function tablaDeModeloExistente(variantes: readonly Pick<VarianteDeModelo, "varianteId" | "talla" | "color" | "colorHex">[]): TablaDeOrden {
  const sinTallas = variantes.every((v) => v.talla === null || v.talla === undefined);
  const sinColores = variantes.every((v) => v.color === null || v.color === undefined);
  const tallaDe = (v: { talla: string | null }) => (sinTallas ? null : (v.talla ?? UNICA));
  const colorDe = (v: { color: string | null }) => (sinColores ? null : (v.color ?? SIN_COLOR));

  const tallasTexto = [...new Set(variantes.map((v) => tallaDe(v)).filter((t): t is string => t !== null))].sort(compararTallas);
  const colores: ColorDeTabla[] = [];
  const vistos = new Set<string>();
  for (const v of variantes) {
    const c = colorDe(v);
    if (c === null || vistos.has(c)) continue;
    vistos.add(c);
    colores.push({ codigo: c, nombre: c, hex: v.colorHex ?? null });
  }

  const celdas: CeldaAlta[] = [];
  const excluidas = new Set<string>();
  const existentes = new Set<string>();
  for (const v of variantes) {
    celdas.push({ tallaId: tallaDe(v), color: colorDe(v), clave: v.varianteId });
    existentes.add(`${colorDe(v) ?? ""}\u0000${tallaDe(v) ?? ""}`);
  }
  for (const color of sinColores ? [null] : colores.map((c) => c.codigo)) {
    for (const talla of sinTallas ? [null] : tallasTexto) {
      if (existentes.has(`${color ?? ""}\u0000${talla ?? ""}`)) continue;
      const clave = `ausente|${color ?? ""}|${talla ?? ""}`;
      celdas.push({ tallaId: talla, color, clave });
      excluidas.add(clave);
    }
  }
  return { celdas, tallas: tallasTexto.map((t) => ({ id: t, texto: t })), colores, excluidas };
}

/**
 * Un modelo NUEVO. Las celdas llegan de `celdasDelBorrador` y se devuelven POR REFERENCIA: son la fuente de la carga útil (`lineasRpc`), así que la tabla no puede mostrar una
 * celda que no se mande ni mandar una que no se vea. Las tallas son las de la categoría que se eligieron, en el orden canónico; los colores, los elegidos EN EL ORDEN DE LOS CLICS
 * (quien agrega «Negro» y luego «Crudo» los ve en ese orden; lo que se manda sigue en el orden del vocabulario, como siempre) y solo los que existen en el vocabulario.
 */
export function tablaDeModeloNuevo(o: {
  celdas: CeldaAlta[];
  categoria: CategoriaDeModelo | null;
  tallaIds: readonly string[];
  colorCodigos: readonly string[];
  colores: readonly ColorDeTabla[];
}): TablaDeOrden {
  const textoDe = new Map((o.categoria?.tallas ?? []).map((t) => [t.id, t.valor] as const));
  const tallas = ordenarTallas(o.categoria, o.tallaIds).map((id) => ({ id, texto: textoDe.get(id) ?? id }));
  const porCodigo = new Map(o.colores.map((c) => [c.codigo, c] as const));
  const elegidos = new Set<string>();
  const colores: ColorDeTabla[] = [];
  for (const cod of o.colorCodigos) {
    const c = porCodigo.get(cod);
    if (c && !elegidos.has(cod)) {
      elegidos.add(cod);
      colores.push(c);
    }
  }
  return { celdas: o.celdas, tallas, colores, excluidas: new Set<string>() };
}

/** Las líneas de `abrir_produccion` para un modelo que existe: la cantidad escrita en cada variante, entera y mayor que cero, en el orden de las variantes. Es la expresión que el
 *  formulario traía antes de A2, SIN cambios (`floor(Number(x) || 0)`), para que la carga útil sea idéntica. */
export function lineasDeModeloExistente(variantes: readonly { varianteId: string }[], cantidades: Readonly<Record<string, string>>): { variante_id: string; cantidad: number }[] {
  return variantes
    .map((v) => ({ variante_id: v.varianteId, cantidad: Math.floor(Number(cantidades[v.varianteId]) || 0) }))
    .filter((l) => l.cantidad > 0);
}

/**
 * Lo escrito al pasar de «sin color» a «un color» (o al revés) en un modelo nuevo. Sin colores la celda de cada talla se llama `talla|`; con el primero pasa a ser `talla|COD`: sin
 * este paso, agregar el primer color dejaría lo que la persona ya había escrito en una celda que ya no existe y la orden saldría con menos prendas de las que ve.
 *
 * **Gana lo que se VE.** La fila nueva (o «Sin color») es una copia exacta de la que había: lo que tenía escrito el destino y no se veía (los números que dejó un color que se quitó
 * antes) se descarta en esas tallas. Dejarlos «por no pisar» mezclaba colores distintos y escondía lo que la persona acababa de escribir (revisión adversaria de A2, 2026-10-13). Lo que SÍ
 * sigue vivo es lo del cambio de 2 a 1 color (y de 1 a 2), que devuelve el MISMO objeto: ahí las celdas ya llevan su color en la clave y quitar una fila no borra sus números, así que
 * si vuelve, reaparecen. `tallaIds` son las tallas que se muestran; sin tallas, la celda única es `|` → `|COD`.
 */
export function cantidadesAlCambiarColores(
  cantidades: Readonly<Record<string, string>>,
  tallaIds: readonly string[],
  antes: readonly string[],
  despues: readonly string[]
): Record<string, string> {
  const agregoElPrimero = antes.length === 0 && despues.length === 1;
  const quitoElUnico = antes.length === 1 && despues.length === 0;
  if (!agregoElPrimero && !quitoElUnico) return cantidades as Record<string, string>;
  const color = agregoElPrimero ? despues[0] : antes[0];
  const tallas: (string | null)[] = tallaIds.length > 0 ? [...tallaIds] : [null];
  let siguiente: Record<string, string> | null = null;
  for (const talla of tallas) {
    const sinColor = claveCelda(talla, null);
    const conColor = claveCelda(talla, color);
    const [de, a] = agregoElPrimero ? [sinColor, conColor] : [conColor, sinColor];
    const origen = cantidades[de] ?? "";
    const destino = cantidades[a] ?? "";
    if (origen === "" && destino === "") continue;
    siguiente ??= { ...cantidades };
    if (origen === "") delete siguiente[a];
    else siguiente[a] = origen;
    delete siguiente[de];
  }
  return siguiente ?? (cantidades as Record<string, string>);
}
