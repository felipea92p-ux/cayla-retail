// La tienda más cercana a quien entra (Felipe 2026-10-21: «al ingresar a la tienda te solicite tu ubicación para que te ubique
// automáticamente en la tienda más cercana»). El navegador pregunta la ubicación UNA vez, en el Inicio y solo si la persona nunca eligió
// tienda; con ella se calcula la tienda más cercana ACÁ, en el aparato: las coordenadas no viajan al servidor ni se guardan (solo se
// recuerda la tienda, en la cookie de siempre). Lógica pura, con su prueba al lado.
//
// El ERP guarda la dirección de cada tienda escrita, sin coordenadas (`tienda_sedes()`), así que el punto de cada una se lee de esta
// tabla por su clave web (`claveDeSede`): el de la ciudad donde queda la tienda, que alcanza para decidir cuál está más cerca entre
// ciudades a cientos de kilómetros. Una tienda que no está en la tabla no entra al cálculo (nunca se adivina un punto). Cuando una
// tienda nueva se encienda en la web, se suma aquí su punto.

export type Punto = { lat: number; lng: number };

const COORDENADAS_POR_CLAVE: Readonly<Record<string, Punto>> = {
  trujillo: { lat: -8.1116, lng: -79.0288 },
  lima: { lat: -12.1211, lng: -77.0297 },
  arequipa: { lat: -16.3989, lng: -71.535 },
};

/** El punto de una tienda por su clave web («trujillo»), o `null` si no se conoce. */
export const puntoDeLaTienda = (clave: string): Punto | null => COORDENADAS_POR_CLAVE[clave] ?? null;

const RADIO_TIERRA_KM = 6371;
const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Distancia sobre la esfera (haversine) en kilómetros: la línea recta sobre el globo, suficiente para ordenar ciudades. */
export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Un punto válido del navegador: números finitos dentro del globo. Algo raro (NaN, 0/0 de un lector roto) no elige tienda. */
export const esPuntoValido = (p: Punto | null | undefined): p is Punto =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

/**
 * La clave de la tienda más cercana al punto entre las `claves` que se ven en la web; `null` si el punto no sirve o ninguna tienda tiene
 * punto conocido. Con la misma distancia gana la primera de la lista.
 */
export function claveMasCercana(desde: Punto | null | undefined, claves: readonly string[]): string | null {
  if (!esPuntoValido(desde)) return null;
  let mejor: { clave: string; km: number } | null = null;
  for (const clave of claves) {
    const punto = puntoDeLaTienda(clave);
    if (!punto) continue;
    const km = distanciaKm(desde, punto);
    if (!mejor || km < mejor.km) mejor = { clave, km };
  }
  return mejor?.clave ?? null;
}

/**
 * ¿Hay que pedir la ubicación ahora? Solo al entrar al Inicio, nunca en una prenda o un catálogo compartidos por enlace (la persona
 * quiere ver ESO, no la tienda de su ciudad); solo si nunca eligió tienda (sin cookie), si no se le preguntó ya en este aparato y si la
 * bolsa está vacía (cambiar de tienda la vacía: no se hace por su cuenta). Con menos de dos tiendas no hay nada que elegir.
 */
export function debePedirUbicacion(estado: { ruta: string; tiendaRecordada: boolean; yaPreguntada: boolean; prendasEnBolsa: number; tiendas: number }): boolean {
  return estado.ruta === "/inicio" && !estado.tiendaRecordada && !estado.yaPreguntada && estado.prendasEnBolsa === 0 && estado.tiendas >= 2;
}
