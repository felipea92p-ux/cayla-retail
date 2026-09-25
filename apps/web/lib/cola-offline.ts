/**
 * Cola sin conexión GENÉRICA (ADR-0207) — el mecanismo de la venta sin red (ADR-0063, `lib/ventas-offline.ts`)
 * sacado de Vender para que lo use cualquier módulo que guarda con UNA llamada idempotente. Primer cliente:
 * Recibir mercadería (`recibir_envio` en `/recibir`, `recibir_lote` en `/inventario/recibir`).
 *
 * EL PROBLEMA. Llega un envío, se cuentan 60 prendas y justo al confirmar se cae el internet de la tienda. Sin
 * esto, el conteo se pierde o se anota en papel y se vuelve a contar. La base ya sabe no duplicar un reintento
 * (`p_token`, `token_cliente unique`); lo que faltaba es algo en el navegador que lo reintente solo.
 *
 * LA REGLA (misma que la venta): se INTENTA guardar siempre; solo si el error es de red (`esFalloDeRed`) la
 * operación entra a la cola con su payload completo, su token y la firma del responsable con la HORA EN QUE SE
 * HIZO (`x-momento`, ADR-0162). Se reenvía tal cual, nunca se recalcula desde la pantalla. Un rechazo de la base
 * (no de la red) deja de reintentarse y espera un «Descartar» a mano: repetirlo cada 30 s no arregla nada.
 *
 * LO QUE NUMERA LA BASE SE QUEDA EN LA BASE: cuando se sume el alta de producto, el código (`codigos_correlativos`)
 * y el de barras llegan recién al subir; mientras tanto la pantalla dice «pendiente de código». La numeración
 * nunca se inventa en el navegador (decisión de Felipe, 2026-09-25): dos sedes sin red chocarían.
 *
 * Puro: sin React, sin Supabase, sin `window`. El trío de sincronización vive en `lib/useColaOffline.ts`.
 */

import type { Firma } from "./responsable-reglas";

export type OperacionEncolada<P = Record<string, unknown>> = {
  /** El `p_token` de la operación: identifica la fila en la cola (reemplaza, nunca duplica) y, en la base,
   *  hace que un reintento devuelva lo ya guardado. */
  token: string;
  /** La RPC a llamar al subir. Solo se ejecuta si está en la lista blanca del módulo (`esOperacionEncolada`). */
  rpc: string;
  params: P;
  /** Responsable y sede tal como se eligieron al guardar, con `momento` = `creadoEn`. `null` si la pantalla no firmó. */
  firma: Firma | null;
  creadoEn: string;
  /** Una línea para la pantalla («12 unidades · Tienda Trujillo»): la cola se muestra sin reinterpretar `params`. */
  resumen: string;
  /** `null` mientras sigue sin subir por falta de red. Con motivo: la base la rechazó; ya no se reintenta sola. */
  rechazo: string | null;
};

/** `cayla:<modulo>:cola` — una llave por MÓDULO, no por sede: cada operación lleva su sede en la firma, y una
 *  recepción hecha para otra ubicación (el selector de `/recibir`) tiene que seguir subiendo aunque la pantalla
 *  ya mire otra. */
export function claveCola(modulo: string): string {
  return `cayla:${modulo}:cola`;
}

/** Arma la operación a encolar. La firma se congela con la hora de ahora: al subir mañana, la base valida que el
 *  responsable estaba presente CUANDO se hizo, no cuando volvió el internet. */
export function nuevaOperacion<P>(o: { token: string; rpc: string; params: P; firma: Firma | null; resumen: string; ahora?: Date }): OperacionEncolada<P> {
  const creadoEn = (o.ahora ?? new Date()).toISOString();
  return {
    token: o.token,
    rpc: o.rpc,
    params: o.params,
    firma: o.firma ? { ...o.firma, momento: creadoEn } : null,
    creadoEn,
    resumen: o.resumen,
    rechazo: null,
  };
}

/** Agrega la operación, o reemplaza la que tenga el mismo token (dos intentos del mismo guardado son UNA fila). */
export function conOperacion<P>(cola: OperacionEncolada<P>[], op: OperacionEncolada<P>): OperacionEncolada<P>[] {
  const i = cola.findIndex((x) => x.token === op.token);
  if (i === -1) return [...cola, op];
  return cola.map((x, n) => (n === i ? op : x));
}

export function sinOperacion<P>(cola: OperacionEncolada<P>[], token: string): OperacionEncolada<P>[] {
  return cola.filter((x) => x.token !== token);
}

/** Lo que se reintenta solo: todo lo que no fue rechazado por la base. */
export function porSubir<P>(cola: OperacionEncolada<P>[]): OperacionEncolada<P>[] {
  return cola.filter((x) => x.rechazo === null);
}

/**
 * Aplica el resultado de una pasada sobre una lectura FRESCA de la cola (no sobre la foto con la que empezó):
 * `null` = subió, sale de la cola; una operación = quedó rechazada. Lo que se encoló a mitad de la pasada no está
 * en `resueltos` y sobrevive — el mismo cuidado que la cola de Vender (`PuntoDeVenta.tsx`, trío de subida).
 */
export function reconciliar<P>(actual: OperacionEncolada<P>[], resueltos: Map<string, OperacionEncolada<P> | null>): OperacionEncolada<P>[] {
  return actual.flatMap((x) => {
    if (!resueltos.has(x.token)) return [x];
    const r = resueltos.get(x.token) ?? null;
    return r ? [r] : [];
  });
}

/**
 * Lo que SUBIÓ entre dos fotos de la cola: estaba esperando (sin rechazo) y ya no está. Sirve a una pantalla que
 * oculta lo encolado de sus listas: entre que la operación sale de la cola y llega la lista nueva del servidor hay
 * un rato en que la lista vieja la mostraría otra vez como pendiente. Un descarte no cuenta (lo descartado estaba
 * rechazado: la base no lo registró).
 */
export function subidasEntre<P>(previa: OperacionEncolada<P>[], actual: OperacionEncolada<P>[]): OperacionEncolada<P>[] {
  const siguen = new Set(actual.map((x) => x.token));
  return previa.filter((x) => x.rechazo === null && !siguen.has(x.token));
}

/**
 * ¿Ya hay un alta de producto esperando en la cola con este nombre? Sin red no se puede preguntar a la base si el
 * nombre existe; al menos no se encolan dos iguales (la segunda la rechazaría `crear_producto_con_variantes` al subir).
 * Compara sin mayúsculas ni tildes, como el aviso de parecidos.
 */
export function nombreEnCola(cola: OperacionEncolada[], nombre: string): boolean {
  const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const buscado = clave(nombre);
  if (!buscado) return false;
  return porSubir(cola).some((op) => typeof op.params.p_referencia === "string" && clave(op.params.p_referencia) === buscado);
}

/**
 * ¿Esto que se leyó de `localStorage` es una operación que se puede subir? Lo guardado en el navegador es dato,
 * no instrucción: una fila con una RPC fuera de la lista blanca del módulo (o sin token, o rota) no se ejecuta
 * nunca — se descarta al leer.
 */
export function esOperacionEncolada(x: unknown, rpcsPermitidas: readonly string[]): x is OperacionEncolada {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.token === "string" &&
    o.token.length > 0 &&
    typeof o.rpc === "string" &&
    rpcsPermitidas.includes(o.rpc) &&
    !!o.params &&
    typeof o.params === "object" &&
    typeof o.creadoEn === "string" &&
    typeof o.resumen === "string" &&
    (o.rechazo === null || typeof o.rechazo === "string")
  );
}

/** La cola leída del navegador, limpia: solo lo que `esOperacionEncolada` acepta. */
export function colaValida(crudo: unknown, rpcsPermitidas: readonly string[]): OperacionEncolada[] {
  return Array.isArray(crudo) ? crudo.filter((x): x is OperacionEncolada => esOperacionEncolada(x, rpcsPermitidas)) : [];
}
