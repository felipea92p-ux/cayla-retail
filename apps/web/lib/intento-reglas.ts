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
 * Lo usan `useIntento` (los modales de Caja, Apartados y Cambios, Nuevo traslado y el pase de un pedido) y Vender.
 */

import { esRespuestaIncierta, type ErrorEscritura } from "./error-escritura";

/**
 * Las operaciones que la pantalla manda con `useIntento`: su función de la base anota la huella de su token y
 * `fn_resolver_intento` sabe revisarlas (migraciones 20261013200000 y, desde /chaos de Inventario, 20261014162000).
 */
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
  "iniciar_traslado",
  "enviar_pedido_a_otra_sede",
  // Los fondos por rendir y el gasto del viaje (ADR-0362 fase 6, /chaos 2026-10-14; 20261014194000).
  "entregar_fondo",
  "devolver_fondo",
  "pagar_deuda_fondo",
  "registrar_gasto_viaje",
  "rendir_fondo",
  // El pago de un pedido web (ADR-0408, actividad 9; 20261015042000).
  "registrar_pago_pedido_web",
  // La entrega de un pedido web con su código (ADR-0408, actividad 10; 20261015052000).
  "entregar_pedido_web",
  // Anular un pedido web pagado: devuelve la plata y anula su venta y su boleta (ADR-0408; 20261015114000).
  "anular_pedido_web_pagado",
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
// El envío en curso (NAV-03). Si la página se recarga o se cae mientras se guarda, al volver la pantalla pregunta por ese
// token y dice si quedó o no. Vive en el almacén local de la sede (`claveLocal(sede, "cobro-en-curso")` en Vender,
// `claveLocal(sede, "traslado-en-curso")` en Nuevo traslado).
// ---------------------------------------------------------------------------------------------------------------------

/** Lo mínimo de un envío en curso: su marca y cuándo salió. */
export type EnvioEnCurso = { token: string; enviadoEn: string };

/** Lo leído del almacén, validado con `esValido`: lo que no tiene la forma se descarta (un almacén viejo o roto no rompe nada). */
export function enviosGuardados<T extends EnvioEnCurso>(crudo: unknown, esValido: (x: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.filter(
    (c): c is T =>
      !!c && typeof c === "object" && typeof (c as EnvioEnCurso).token === "string" && typeof (c as EnvioEnCurso).enviadoEn === "string" && esValido(c as Record<string, unknown>),
  );
}

/** La lista con este envío (si el token ya estaba, se reemplaza). */
export function conEnvio<T extends EnvioEnCurso>(lista: readonly T[], envio: T): T[] {
  return [...lista.filter((c) => c.token !== envio.token), envio];
}

/** La lista sin ese token. */
export function sinEnvio<T extends EnvioEnCurso>(lista: readonly T[], token: string): T[] {
  return lista.filter((c) => c.token !== token);
}

/**
 * Los envíos que ya se pueden preguntar: los que salieron hace más que el tope de espera. Uno más nuevo puede seguir en
 * camino desde OTRA pestaña, y preguntarlo lo daría por no llegado (la base rechazaría ese envío al llegar).
 */
export function enviosPorResolver<T extends EnvioEnCurso>(lista: readonly T[], ahora: number, tope = TOPE_ESPERA_MS): T[] {
  return lista.filter((c) => {
    const t = Date.parse(c.enviadoEn);
    return Number.isNaN(t) || ahora - t >= tope;
  });
}

/** Cuánto se espera para volver a preguntar tras una pregunta que falló. */
export const REINTENTO_RESOLVER_MS = 5_000;

/** Cuándo volver a mirar: el primer envío joven que cumple el tope o, si una pregunta falló, en `REINTENTO_RESOLVER_MS`. */
export function proximaRevision(jovenesEnviadoEn: readonly string[], huboFallo: boolean, ahora: number): number | null {
  const plazos = jovenesEnviadoEn.map((e) => Date.parse(e) + TOPE_ESPERA_MS - ahora + 500).filter((n) => Number.isFinite(n));
  if (huboFallo) plazos.push(REINTENTO_RESOLVER_MS);
  return plazos.length > 0 ? Math.max(1000, Math.min(...plazos)) : null;
}

// Vender: el cobro en curso.
export type CobroEnCurso = EnvioEnCurso & { total: number; prendas: number };

export const cobrosGuardados = (crudo: unknown): CobroEnCurso[] =>
  enviosGuardados<CobroEnCurso>(crudo, (c) => typeof c.total === "number" && typeof c.prendas === "number");
export const conCobro = (lista: readonly CobroEnCurso[], cobro: CobroEnCurso): CobroEnCurso[] => conEnvio(lista, cobro);
export const sinCobro = (lista: readonly CobroEnCurso[], token: string): CobroEnCurso[] => sinEnvio(lista, token);
export const cobrosPorResolver = (lista: readonly CobroEnCurso[], ahora: number, tope = TOPE_ESPERA_MS): CobroEnCurso[] =>
  enviosPorResolver(lista, ahora, tope);

// Nuevo traslado: el traslado en curso.
export type TrasladoEnCurso = EnvioEnCurso & { destino: string; prendas: number };

export const trasladosGuardados = (crudo: unknown): TrasladoEnCurso[] =>
  enviosGuardados<TrasladoEnCurso>(crudo, (c) => typeof c.destino === "string" && typeof c.prendas === "number");

/** El aviso que da Nuevo traslado al resolver un envío que quedó en el aire. */
export function avisoDeTraslado(res: Resolucion, t: TrasladoEnCurso): { tono: "exito" | "info"; titulo: string; detalle: string } {
  const prendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;
  if (res.tipo === "no_llego") {
    return {
      tono: "info",
      titulo: `El traslado a ${t.destino} no se envió`,
      detalle: `No salió nada de tu almacén (${prendas(t.prendas)}). Si todavía no despachaste la caja, vuelve a armarlo.`,
    };
  }
  const numero = typeof res.datos.numero === "number" ? res.datos.numero : null;
  const cuantas = typeof res.datos.prendas === "number" ? res.datos.prendas : t.prendas;
  return {
    tono: "exito",
    titulo: `Tu traslado a ${t.destino} sí se envió`,
    detalle: `${numero ? `Traslado ${numero}` : "El traslado"} · ${prendas(cuantas)}. Está en Traslados; no lo envíes de nuevo.`,
  };
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
