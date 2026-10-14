/**
 * La entrada al ERP: «el colibrí se abre» (Felipe 2026-10-13, ADR-0136 act. 2026-10-13 (b); maqueta: docs/maquetas/login-entrada-2026-10/).
 *
 * Al iniciar sesión, el colibrí del login cruza hasta el CENTRO de la pantalla, el fondo se oscurece y, ahí, se abre una ventana con la
 * forma del propio colibrí que deja ver la pantalla de verdad (la que sigue al login). Luego el colibrí se agranda hasta salirse de la
 * pantalla y la ventana lo sigue hasta cubrirla. Una sola vez, sin rebote ni bucle.
 *
 * Aquí vive solo la geometría y la línea de tiempo (lógica pura, con su prueba): `components/login/EntradaColibri.tsx` mide la pantalla y
 * pinta; `lib/entrada-estado.ts` guarda si hay una entrada en curso. El aleteo y la forma del ala son los de `lib/login-vuelo.ts`.
 *
 * LA SALIDA («Salir», Felipe 2026-10-13, la versión B de la maqueta): el mismo vuelo AL REVÉS y más rápido (`VELOCIDAD_DE_LA_SALIDA`). La ventana, que cubre
 * la pantalla que se deja, se encoge sobre el colibrí; con la ventana cerrada y el fondo oscuro el colibrí flota en el centro mientras se cierra la sesión y
 * carga el login; cuando el login está listo vuela de vuelta a su lugar y el fondo oscuro se va. `estadoDeLaSalida` es `estadoDeLaEntrada` con el tiempo
 * corrido hacia atrás; no hay una segunda coreografía que mantener.
 *
 * LA ESPERA. La ventana solo se abre cuando la pantalla de destino ya está lista (si no, mostraría un vacío). Mientras no lo está, el
 * colibrí flota en el centro: `msDelVuelo` congela la línea de tiempo en `ESPERA_EN` hasta que se sabe que ya cargó.
 */

import { ALETEO_MAXIMO, ritmoDelVuelo } from "./login-vuelo";

export type Punto = { x: number; y: number };
/** Dónde está el colibrí del login al empezar, en píxeles de la ventana. */
export type Caja = { x: number; y: number; ancho: number; alto: number };
export type MedidasDeLaEntrada = { origen: Caja; ancho: number; alto: number };

/** El lienzo del colibrí (223×150) y su pecho: el punto que cae en el centro de la pantalla y sobre el que el ave crece. */
export const LIENZO_DEL_AVE = { ancho: 223, alto: 150 } as const;
export const PECHO_DEL_AVE: Punto = { x: 100, y: 65 };

/** La cabeza del colibrí cerrada: junto al ala (que aletea) forma la silueta de la ventana. */
export const CABEZA_DEL_AVE = "M104,40 C102,22 118,6 140,5 C155,4 165,10 172,16 C156,22 144,38 134,62 Z";

/**
 * Lo más cerca que el borde de la silueta queda del pecho, en unidades del lienzo (medido sobre el dibujo; la prueba lo vuelve a medir).
 * De ahí sale cuánto hay que agrandar al ave para que la ventana cubra toda la pantalla.
 */
export const BORDE_MINIMO = 22;

/** Cada momento de la entrada, en milisegundos desde que se inicia sesión. */
export const TIEMPOS = {
  velo: [250, 1000],
  vuela: [250, 1150],
  abre: [1150, 1700],
  crece: [1600, 3200],
} as const satisfies Record<string, readonly [number, number]>;

/** Aquí se queda la línea de tiempo si la pantalla de destino todavía no está lista: el ave ya está en el centro, flotando. */
export const ESPERA_EN = TIEMPOS.vuela[1];
/** Cuando el tiempo llega aquí, la ventana ya cubre la pantalla y la entrada termina. */
export const FIN_DE_LA_ENTRADA = TIEMPOS.crece[1];
/** Frecuencia del aleteo (veces por segundo). */
export const ALETEOS_POR_SEGUNDO = 8.5;

const acotar = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const avance = (ms: number, [desde, hasta]: readonly [number, number]) => acotar((ms - desde) / (hasta - desde));
const mezclar = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * El tiempo de la entrada a partir del tiempo real. Corre igual hasta `ESPERA_EN`; ahí espera (con el ave flotando) hasta que la
 * pantalla de destino esté lista (`listoEn`, en ms reales; null = todavía no) y sigue desde ese punto. Si ya estaba lista antes
 * de llegar al centro, no espera nada.
 */
export function msDelVuelo(ms: number, listoEn: number | null): number {
  if (ms <= ESPERA_EN) return ms;
  if (listoEn === null) return ESPERA_EN;
  const espera = Math.max(0, listoEn - ESPERA_EN);
  return ESPERA_EN + Math.max(0, ms - ESPERA_EN - espera);
}

/** Lo que mide cada cosa, derivado de dónde está el colibrí y de lo grande que es la pantalla. */
export function geometriaDeLaEntrada({ origen, ancho, alto }: MedidasDeLaEntrada) {
  const k0 = origen.ancho / LIENZO_DEL_AVE.ancho;
  const pechoInicial: Punto = { x: origen.x + PECHO_DEL_AVE.x * k0, y: origen.y + PECHO_DEL_AVE.y * k0 };
  const centro: Punto = { x: ancho / 2, y: alto / 2 };
  // Flotando en el centro mide como mucho 440 px de ancho (y no más de la mitad de la pantalla).
  const escalaAlFlotar = Math.max(1, Math.min(440, ancho * 0.55) / origen.ancho);
  // Hasta que el borde de la silueta pasa de la esquina más lejana de la pantalla (con un 10 % de margen).
  const escalaFinal = Math.max(escalaAlFlotar, (Math.hypot(ancho, alto) / 2 * 1.1) / (BORDE_MINIMO * k0));
  return { k0, pechoInicial, centro, escalaAlFlotar, escalaFinal };
}

export type EstadoDeLaEntrada = {
  /** Dónde está el pecho del ave, en píxeles de la pantalla. */
  pecho: Punto;
  /** Píxeles de pantalla por unidad del lienzo del ave: lo que hay que escalar su dibujo (ya incluye el crecimiento). */
  k: number;
  /** Lo mismo, pero de la ventana: nace en 0 y llega a `k` cuando se abre del todo. */
  kVentana: number;
  /** Opacidad del fondo oscuro (0 a 1). */
  velo: number;
  /** Ángulo del aleteo (grados) y cuánto se acorta el ala al subir (0 a 1). */
  angulo: number;
  alargue: number;
  /** De 0 a 1: cuánto ha crecido el ave. */
  creciendo: number;
  terminado: boolean;
};

/**
 * La entrada en un instante. `vms` es el tiempo ya corregido por la espera (`msDelVuelo`); `ms` es el tiempo real, que mueve el
 * mecerse y el aleteo (el ave no se congela mientras espera).
 */
export function estadoDeLaEntrada(vms: number, ms: number, medidas: MedidasDeLaEntrada): EstadoDeLaEntrada {
  const g = geometriaDeLaEntrada(medidas);
  const pVuelo = ritmoDelVuelo(avance(vms, TIEMPOS.vuela));
  const pAbre = ritmoDelVuelo(avance(vms, TIEMPOS.abre));
  const pCrece = ritmoDelVuelo(avance(vms, TIEMPOS.crece));

  const escala = mezclar(1, g.escalaAlFlotar, pVuelo) * Math.pow(g.escalaFinal / g.escalaAlFlotar, pCrece);
  const k = g.k0 * escala;

  // Va del lugar del login al centro por un arco (sube un poco en el camino) y flota un instante antes de crecer.
  const arco = Math.min(70, medidas.alto * 0.08) * Math.sin(Math.PI * pVuelo) * (1 - pCrece);
  const meceo = 2.6 * Math.sin((ms / 1000) * 2 * Math.PI * 3.2) * avance(vms, [TIEMPOS.vuela[1] - 250, TIEMPOS.vuela[1]]) * (1 - pCrece);
  const pecho: Punto = {
    x: mezclar(g.pechoInicial.x, g.centro.x, pVuelo),
    y: mezclar(g.pechoInicial.y, g.centro.y, pVuelo) - arco + meceo,
  };

  // El aleteo arranca al entrar, sigue mientras vuela y se apaga hasta la pose del logo cuando el ave ya es enorme.
  const amplitud = ALETEO_MAXIMO * acotar(ms / 150) * (1 - Math.pow(avance(vms, TIEMPOS.crece), 0.6));
  const seno = Math.sin((ms / 1000) * ALETEOS_POR_SEGUNDO * 2 * Math.PI);

  return {
    pecho,
    k,
    kVentana: k * pAbre,
    velo: ritmoDelVuelo(avance(vms, TIEMPOS.velo)),
    angulo: amplitud * seno,
    alargue: 1 - 0.28 * Math.max(0, seno) * (amplitud / ALETEO_MAXIMO),
    creciendo: pCrece,
    terminado: vms >= FIN_DE_LA_ENTRADA,
  };
}

/** Cuánto hay que esperar a que la pantalla de destino esté libre y estable antes de abrir la ventana, en ms. */
export const ESTABLE_DURANTE = 200;
/** Si pasado este tiempo la pantalla no llega, la entrada se deshace sola (la persona no se queda mirando un fondo oscuro). */
export const TOPE_DE_ESPERA = 15_000;

/**
 * ¿Ya se puede abrir la ventana? La pantalla de destino está lista cuando la dirección ya no es la del login y el loader general
 * no tiene nada en curso, y se mantiene así `ESTABLE_DURANTE` (un refresco encadenado no la da por lista a medias).
 * `libreDesde` es desde cuándo (ms reales) se cumple; null si no se cumple ahora. Devuelve el nuevo `libreDesde` y si ya está lista.
 */
export function revisarLaPantalla(
  { ruta, ocupada }: { ruta: string; ocupada: boolean },
  libreDesde: number | null,
  ms: number,
  /** Si se da, la pantalla solo está lista en ESA ruta (la salida espera `/login`); si no, en cualquiera que no sea el login (la entrada). */
  rutaEsperada?: string,
): { libreDesde: number | null; lista: boolean } {
  const cumple = (rutaEsperada === undefined ? ruta !== "/login" : ruta === rutaEsperada) && !ocupada;
  if (!cumple) return { libreDesde: null, lista: false };
  const desde = libreDesde ?? ms;
  return { libreDesde: desde, lista: ms - desde >= ESTABLE_DURANTE };
}

/**
 * ¿Hay que deshacer la entrada? Sí si volvieron al login con un motivo (`?error=sin_persona`: la cuenta no puede entrar) o si la
 * pantalla tardó más del tope.
 */
export function debeCancelarse({ ruta, busqueda }: { ruta: string; busqueda: string }, ms: number, lista: boolean): boolean {
  if (ms > TOPE_DE_ESPERA && !lista) return true;
  return ms > 400 && ruta === "/login" && new URLSearchParams(busqueda).has("error");
}

// ---------------------------------------------------------------- la salida

/** La salida corre el vuelo al revés a esta velocidad: 3,2 s de entrada → ~2,2 s de salida (cuando no hay que esperar al login). */
export const VELOCIDAD_DE_LA_SALIDA = 1.45;
/** Cuándo (ms reales desde que se aprieta «Salir») la ventana ya se cerró y el colibrí flota en el centro: ahí se cierra la sesión y se espera al login. */
export const MS_DE_LA_SALIDA_EN_EL_CENTRO = (FIN_DE_LA_ENTRADA - ESPERA_EN) / VELOCIDAD_DE_LA_SALIDA;

/** Los ms de la salida que ya corrieron: igual al tiempo real hasta el centro; ahí espera (con el ave flotando) hasta que el login esté listo (`listoEn`, ms reales). */
export function msCorridosDeLaSalida(ms: number, listoEn: number | null): number {
  if (ms <= MS_DE_LA_SALIDA_EN_EL_CENTRO) return ms;
  if (listoEn === null) return MS_DE_LA_SALIDA_EN_EL_CENTRO;
  const espera = Math.max(0, listoEn - MS_DE_LA_SALIDA_EN_EL_CENTRO);
  return MS_DE_LA_SALIDA_EN_EL_CENTRO + Math.max(0, ms - MS_DE_LA_SALIDA_EN_EL_CENTRO - espera);
}

/**
 * La salida en un instante (`ms` reales desde «Salir»). Es el estado de la ENTRADA en el tiempo espejo `FIN − corridos × velocidad`: empieza con la ventana
 * cubriendo toda la pantalla y termina con el ave en su lugar del login, sin velo ni ventana. El aleteo se apaga en los últimos 150 ms para que el ave
 * aterrice en la pose del logo (la entrada lo enciende al empezar; aquí es al revés). `terminado` es true cuando ya llegó.
 */
export function estadoDeLaSalida(ms: number, listoEn: number | null, medidas: MedidasDeLaEntrada): EstadoDeLaEntrada {
  const f = Math.max(0, FIN_DE_LA_ENTRADA - msCorridosDeLaSalida(ms, listoEn) * VELOCIDAD_DE_LA_SALIDA);
  const e = estadoDeLaEntrada(f, ms, medidas);
  const aterriza = acotar(f / 150);
  return { ...e, angulo: e.angulo * aterriza, alargue: 1 - (1 - e.alargue) * aterriza, terminado: f <= 0 };
}

// ---------------------------------------------------------------- la pausa y el saludo

/**
 * Lo mínimo que el colibrí se queda flotando en el centro, en ms reales (Felipe 2026-10-13: el saludo tiene que alcanzar a leerse aunque la pantalla de destino
 * cargue al instante). Es un mínimo: si la pantalla tarda más, flota lo que haga falta.
 */
export const PAUSA_MINIMA_EN_EL_CENTRO = 450;

/** Cuándo (ms reales) el vuelo puede seguir: cuando la pantalla de destino está lista (`ms`) pero nunca antes de que haya flotado `PAUSA_MINIMA_EN_EL_CENTRO` en el centro. */
export function instanteParaSeguir(ms: number, modo: "entrar" | "salir"): number {
  const llegaAlCentro = modo === "salir" ? MS_DE_LA_SALIDA_EN_EL_CENTRO : ESPERA_EN;
  return Math.max(ms, llegaAlCentro + PAUSA_MINIMA_EN_EL_CENTRO);
}

/**
 * Cuánto se ve el saludo (0 a 1). `avance` es el tiempo del vuelo ya corregido por la espera: en la entrada, `msDelVuelo`; en la salida, `msCorridosDeLaSalida`. Asoma
 * mientras el colibrí llega al centro, se queda mientras flota (ahí el tiempo está detenido) y se va cuando el vuelo sigue: la ventana empieza a abrirse (entrada) o el
 * colibrí empieza a volar de vuelta (salida).
 */
export function opacidadDelSaludo(modo: "entrar" | "salir", avance: number): number {
  const llegaAlCentro = modo === "salir" ? MS_DE_LA_SALIDA_EN_EL_CENTRO : ESPERA_EN;
  const entra = ritmoDelVuelo(acotar((avance - (llegaAlCentro - 320)) / 320));
  const sale = ritmoDelVuelo(acotar((avance - llegaAlCentro) / 300));
  return entra * (1 - sale);
}
