/**
 * El token que sigue al contenido (/chaos 2026-10-13; migraciones 20261013200000 y 20261013201000).
 *
 * EL PROBLEMA. Cada pantalla que guarda manda un `p_token` para que un doble toque o un reintento tras una red caída no
 * guarde dos veces. Pero si la respuesta se pierde y la persona CAMBIA algo antes de reintentar (saca una prenda del
 * ticket, elige otro apartado), el reintento con el mismo token recibía lo que guardó el primer envío, y la pantalla
 * anunciaba lo nuevo. Al revés, un token nuevo tras una respuesta perdida puede guardar DOS veces.
 *
 * LA REGLA (la de `existencias/FlujoTalla.tsx` y `PedirAOtraSedeModal.tsx`, ahora en una sola pieza):
 *   · la marca (el token) va atada a la HUELLA de lo que se manda: lo mismo, la misma marca; otra cosa, marca nueva;
 *   · si la respuesta no trae el veredicto de la base (un corte, un 502), el formulario queda INCIERTO: no se cambia nada
 *     hasta saber qué pasó, y solo se puede reenviar lo mismo o preguntarle a la base (`fn_resolver_intento`);
 *   · la base hace cumplir lo mismo del otro lado: el mismo token con otro contenido es `token_reusado`.
 * Lo usan `useIntento` (los modales de Caja, Apartados y Cambios) y Vender.
 */

import { esRespuestaIncierta, type ErrorEscritura } from "./error-escritura";

/** Las operaciones cuya función de la base anota la huella de su token (la lista de la migración 20261013200000). */
export const OPERACIONES_CON_MARCA = [
  "registrar_venta",
  "entregar_separacion",
  "registrar_movimiento_caja",
  "registrar_ingreso_caja",
  "registrar_gasto",
  "separar_prendas",
  "abonar_separacion",
  "editar_separacion",
  "enviar_pedido_para_apartar",
  "registrar_cambio",
  "separar_pedido_para_apartar",
] as const;
export type OperacionConMarca = (typeof OPERACIONES_CON_MARCA)[number];

/** Cuánto se espera una respuesta antes de darla por perdida (el mismo tope de FlujoTalla y los demás envíos con marca). */
export const TOPE_ESPERA_MS = 20_000;

/** Lo que dice el formulario mientras no se sabe si se guardó. */
export const TEXTO_INCIERTO =
  "Se cortó la conexión y no sabemos si se guardó. No cambies nada todavía: revisa si se guardó, o vuelve a intentarlo tal cual (si ya se guardó, no se repite).";

/** JSON estable: las claves de cada objeto ordenadas, para que dos envíos iguales con otro orden de claves den la misma huella. */
export function huellaDe(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(objeto)
        .filter((k) => objeto[k] !== undefined)
        .sort()
        .map((k) => [k, ordenar(objeto[k])]),
    );
  }
  return valor;
}

export type Marca = { huella: string; token: string };

/** La marca para mandar `huella`: la misma si lo que se manda no cambió; una nueva si cambió (o si no había). */
export function marcaPara(actual: Marca | null, huella: string, nuevoToken: () => string): Marca {
  return actual && actual.huella === huella ? actual : { huella, token: nuevoToken() };
}

/** Lo que hay que guardar para retomar un envío (un formulario que se guarda al cambiar de sede): su marca y si quedó en duda. */
export type InstantaneaIntento = { marca: Marca; incierto: boolean };

export type Fase = "libre" | "enviando" | "incierto";

/** ¿Este error deja el envío en duda? Sí si la respuesta no trae el veredicto de la base (un corte, un error sin código). */
export function faseTrasError(error: ErrorEscritura): "incierto" | "libre" {
  return esRespuestaIncierta(error) ? "incierto" : "libre";
}

/**
 * ¿Hay que preguntarle a la base antes de soltar el formulario? Cuando un envío ya estaba en duda y el reintento vuelve con
 * un «no»: ese «no» puede venir de antes de que la base mirara la marca (una sesión vencida, un permiso), y soltar el
 * formulario dejaría cambiar algo que quizá ya se guardó.
 */
export function hayQueRevisar(previa: Fase, error: ErrorEscritura): boolean {
  return previa === "incierto" && faseTrasError(error) === "libre";
}

/** Lo que responde `fn_resolver_intento`, ya leído. */
export type Resolucion = { tipo: "hecho"; datos: Record<string, unknown> } | { tipo: "no_llego" };

/** Lee la respuesta de `fn_resolver_intento`. `null` si no tiene la forma esperada (se trata como «no se sabe»). */
export function leerResolucion(json: unknown): Resolucion | null {
  if (!json || typeof json !== "object") return null;
  const estado = (json as { estado?: unknown }).estado;
  if (estado === "hecho") return { tipo: "hecho", datos: json as Record<string, unknown> };
  if (estado === "no_llego") return { tipo: "no_llego" };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Vender: el cobro en curso (NAV-03). Si la página se recarga o se cae mientras se cobra, al volver la pantalla pregunta
// por ese token y dice si la venta quedó o no. Vive en el almacén local de la sede (`claveLocal(sede, "cobro-en-curso")`).
// ---------------------------------------------------------------------------------------------------------------------

export type CobroEnCurso = { token: string; total: number; prendas: number; enviadoEn: string };

/** Lo leído del almacén, validado: lo que no tiene la forma de un cobro se descarta (un almacén viejo o roto no rompe Vender). */
export function cobrosGuardados(crudo: unknown): CobroEnCurso[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.filter(
    (c): c is CobroEnCurso =>
      !!c &&
      typeof c === "object" &&
      typeof (c as CobroEnCurso).token === "string" &&
      typeof (c as CobroEnCurso).total === "number" &&
      typeof (c as CobroEnCurso).prendas === "number" &&
      typeof (c as CobroEnCurso).enviadoEn === "string",
  );
}

/** La lista con este cobro (si el token ya estaba, se reemplaza). */
export function conCobro(lista: readonly CobroEnCurso[], cobro: CobroEnCurso): CobroEnCurso[] {
  return [...lista.filter((c) => c.token !== cobro.token), cobro];
}

/** La lista sin ese token. */
export function sinCobro(lista: readonly CobroEnCurso[], token: string): CobroEnCurso[] {
  return lista.filter((c) => c.token !== token);
}

/**
 * Los cobros que ya se pueden preguntar: los que salieron hace más que el tope de espera. Uno más nuevo puede seguir en
 * camino desde OTRA pestaña, y preguntarlo lo daría por no llegado (la base rechazaría ese envío al llegar).
 */
export function cobrosPorResolver(lista: readonly CobroEnCurso[], ahora: number, tope = TOPE_ESPERA_MS): CobroEnCurso[] {
  return lista.filter((c) => {
    const t = Date.parse(c.enviadoEn);
    return Number.isNaN(t) || ahora - t >= tope;
  });
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** El aviso que da Vender al resolver un cobro que quedó en el aire. */
export function avisoDeResolucion(res: Resolucion, cobro: CobroEnCurso): { tono: "exito" | "info"; titulo: string; detalle: string } {
  if (res.tipo === "no_llego") {
    return {
      tono: "info",
      titulo: `El cobro de ${soles(cobro.total)} no se registró`,
      detalle: "No quedó ninguna venta guardada. Si la clienta todavía no se llevó las prendas, cóbrale de nuevo.",
    };
  }
  const comprobante = res.datos.comprobante as { tipo?: string; serie?: string; numero?: number } | null | undefined;
  const total = typeof res.datos.total === "number" ? res.datos.total : Number(res.datos.total ?? cobro.total);
  const nombre = comprobante?.tipo === "factura" ? "Factura" : comprobante?.tipo === "nota_venta" ? "Nota de venta" : "Boleta";
  return {
    tono: "exito",
    titulo: `Tu venta de ${soles(Number.isFinite(total) ? total : cobro.total)} sí se registró`,
    detalle: comprobante?.serie
      ? `${nombre} ${comprobante.serie}-${comprobante.numero}. Está en Historial; no la cobres de nuevo.`
      : "Está en Historial; no la cobres de nuevo.",
  };
}
