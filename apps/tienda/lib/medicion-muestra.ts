// El sorteo de la medición de la tienda (ADR-0447), solo: lo baja TODA visita, así que no lleva nada más. Lo que mide y sus reglas
// (`lib/medicion.ts`, `components/MedicionActiva.tsx`) se bajan solo en las visitas que entran.

/** 1 de cada 2 visitas (Felipe): con el tráfico de la primera semana, una muestra más chica dejaba días casi vacíos. Se decide una vez por
 *  pestaña (una recarga sigue en lo mismo), así una visita entra entera o no entra. */
const MUESTRA = 0.5;

export const entraEnLaMuestra = (azar: number): boolean => azar < MUESTRA;
