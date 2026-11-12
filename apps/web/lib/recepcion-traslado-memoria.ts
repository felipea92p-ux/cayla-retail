import { marcaDeLaPestana } from "./copia-de-pagina";
import type { LineaRecepcion } from "./traslados-recepcion-reglas";

// Lo último que ESTA PESTAÑA guardó de cada prenda de un traslado que se recibe.
//
// POR QUÉ EXISTE (medido en local el 2026-11-11, caja 294 de Trujillo a Lima). Cada casilla se guarda sola (`registrar_recepcion_traslado`,
// sin `router.refresh()`), con el número ENTERO, y gana el último. Al volver con «atrás», Next dibuja la página que guardó su router: Blusa
// Emma M decía 1 con 2 en la base, y el siguiente «+» mandaba 2. La prenda contada se perdía sin aviso, y lo recibido entra al stock de la sede.
//
// QUÉ HACE. Recuerda, por traslado y prenda, lo que la base confirmó y cuándo (una marca de la pestaña). Sobre una copia de la página, la
// pantalla pone encima lo guardado DESPUÉS de dibujarla (`useTrasladoAlDia`) y pide la página de nuevo; sobre una página nueva, manda la página.
// Vive en la memoria de la pestaña, como la copia del router: una recarga vacía las dos.
//
// CONTRATO
//   PROMETE: que sobre una copia la casilla nunca muestra menos de lo que esta pestaña ya guardó después de dibujarla; que una prenda que ya
//            entró al stock no cambia; y que sin nada más nuevo devuelve las mismas líneas.
//   ASUME: que quien guarda lo anota aquí (`useRecepcion`) y que la pantalla dibuja con `lineasAlDia`.
//   NO HACE: no sabe lo que contó otra persona (eso llega con la página pedida de nuevo) ni agrega una prenda que la copia no trae.

type Recibido = { valor: number; en: number };
const recordados = new Map<string, Map<string, Recibido>>();

/** Anota lo que la base confirmó de una prenda. */
export function recordarRecibido(trasladoId: string, varianteId: string, valor: number): void {
  const delTraslado = recordados.get(trasladoId) ?? new Map<string, Recibido>();
  delTraslado.set(varianteId, { valor, en: marcaDeLaPestana() });
  recordados.set(trasladoId, delTraslado);
}

/** Lo guardado después de `desde`, por prenda. Sin `desde` (una página que llega por primera vez) no hay nada: manda la página. */
export function recibidosDespuesDe(trasladoId: string, desde: number | null): Record<string, number> {
  if (desde === null) return {};
  const masNuevos: Record<string, number> = {};
  for (const [varianteId, r] of recordados.get(trasladoId) ?? []) if (r.en > desde) masNuevos[varianteId] = r.valor;
  return masNuevos;
}

/** Las líneas con lo más nuevo encima. Una prenda que ya entró al stock no cambia; una que la página no trae no se agrega. */
export function lineasAlDia<L extends Pick<LineaRecepcion, "varianteId" | "cantidadRecibida" | "ingresado">>(lineas: readonly L[], masNuevos: Readonly<Record<string, number>>): L[] {
  if (Object.keys(masNuevos).length === 0) return lineas as L[];
  return lineas.map((l) => (!l.ingresado && Object.prototype.hasOwnProperty.call(masNuevos, l.varianteId) ? { ...l, cantidadRecibida: masNuevos[l.varianteId] } : l));
}
