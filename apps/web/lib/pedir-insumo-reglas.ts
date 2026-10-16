// «Pedir N m»: el enlace que lleva a «Nueva orden de insumos» con el insumo y lo que falta ya puestos (Formidable de Producción, 2026-10-16).
// Lógica pura, sin React ni red: la arman el Resumen, la página de una orden y las tarjetas de «Qué hacer hoy» (`urlPedirInsumo`), y la lee la
// página de la hoja (`leerPrecargaDePedido`). Se prueba sola en `pedir-insumo-reglas.test.ts`.
//
//   PROMETE: que el enlace lleve EXACTAMENTE lo que el botón dice que falta (la cantidad en la unidad del insumo, a milésimas, que es lo que
//            guarda la base) y que la hoja lo ponga en la primera línea; que una URL escrita a mano, repetida o torcida nunca rompa la hoja
//            ni precargue algo que la hoja no aceptaría (la cantidad pasa por el MISMO lector que la caja: `leerCantidadInsumo`).
//   ASUME:   la cantidad que viaja es un número que el sistema ya calculó (lo que falta de una tela); la persona la puede corregir.
//   NO HACE: no elige proveedor ni precio (decisiones de quien pide), no guarda nada y no decide qué insumos se pueden pedir: eso lo dice la
//            lista de la hoja (`fn_orden_insumo_opciones`) y, al guardar, `crear_orden_insumo`.

import { aTexto } from "./orden-compra-alta";
import { RUTA_ORDENES_INSUMO, TOPES_INSUMO, leerCantidadInsumo } from "./ordenes-insumo-reglas";

const RUTA_NUEVA = `${RUTA_ORDENES_INSUMO}/nueva`;

/**
 * El enlace de «Pedir» con el insumo y la cantidad que falta: `/ordenes-insumos/nueva?insumo=<id>&cantidad=<n>`. La cantidad va en la unidad del
 * insumo, redondeada a milésimas y sin ceros de más («31.6»). Una cantidad que la hoja no aceptaría (cero, negativa, infinita, de más) se omite y
 * queda el insumo solo; sin insumo, la hoja de siempre.
 */
export function urlPedirInsumo(insumoId: string | null | undefined, cantidad: number | null | undefined): string {
  const id = (insumoId ?? "").trim();
  if (!id) return RUTA_NUEVA;
  const partes = [`insumo=${encodeURIComponent(id)}`];
  const milesimas = typeof cantidad === "number" && Number.isFinite(cantidad) ? Math.round(cantidad * 1000) : 0;
  if (milesimas >= 1 && milesimas <= TOPES_INSUMO.cantidadMilesimas) partes.push(`cantidad=${aTexto(milesimas, 3, { recortar: true })}`);
  return `${RUTA_NUEVA}?${partes.join("&")}`;
}

/** Lo que la hoja pone en su primera línea: el insumo y, si venía una cantidad que sirve, la cantidad (ya como la caja la escribe). */
export type PrecargaDePedido = { insumoId: string; cantidad: string | null };

type Parametros = Record<string, string | string[] | undefined> | null | undefined;

/** El valor de un parámetro, o null si falta o está repetido (`?insumo=a&insumo=b`): con dos valores no se adivina cuál era el bueno. */
function unico(params: Parametros, nombre: string): string | null {
  const v = params?.[nombre];
  return typeof v === "string" ? v.trim() : null;
}

/** Una cantidad de la URL, o null. Solo dígitos con punto decimal (nada de signos, comas, espacios ni notación científica) y, además, lo que acepta la caja. */
function cantidadDeLaUrl(texto: string | null): string | null {
  if (!texto || !/^\d+(\.\d+)?$/.test(texto)) return null;
  const lectura = leerCantidadInsumo(texto);
  if (lectura.tipo !== "ok" || lectura.escalado < 1 || lectura.escalado > TOPES_INSUMO.cantidadMilesimas) return null;
  return aTexto(lectura.escalado, 3, { recortar: true });
}

/**
 * Lo que trae `/ordenes-insumos/nueva?insumo=…&cantidad=…`. `insumosQueExisten` son los ids que la hoja deja elegir: un insumo que no está se
 * descarta, y con él su cantidad (sin su unidad no significa nada). Una cantidad que no sirve se descarta sola y el insumo se queda. Nunca lanza.
 */
export function leerPrecargaDePedido(params: Parametros, insumosQueExisten: ReadonlySet<string>): PrecargaDePedido | null {
  const insumoId = unico(params, "insumo");
  if (!insumoId || !insumosQueExisten.has(insumoId)) return null;
  return { insumoId, cantidad: cantidadDeLaUrl(unico(params, "cantidad")) };
}
