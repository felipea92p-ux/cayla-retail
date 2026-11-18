import { cajaDe, PX_POR_CM, type Caja } from "./probador";
import { anchoDelBajo, cajaDeAbajoSinMedida, cajaDeAbajoUnida, cajaDeArribaAjustada, type MedidaDelRecorte } from "./union-prendas";

// El auditor de la unión (ADR-0449, act. 2026-11-17): en vez de confiar en que las reglas de la unión calzan para cada prenda, MIDE el resultado en
// píxeles. Dado un recorte de arriba y uno de abajo con las cajas que la figura les da, cuenta cuánto aire (fondo) queda entre el bajo de la blusa y
// la pretina del pantalón en cada columna de la pretina. Es lo que ve la clienta: un triángulo de fondo entre el bajo en V de un top y la esquina de
// un pantalón. Lo usan las pruebas (con prendas reales) y `pnpm --filter tienda union:auditar` (con todo el catálogo publicado). No corre en la tienda.

/** Lo que se lee de un recorte para auditarlo: por cada columna, dónde empieza y dónde termina la prenda (fracción del alto; `null` sin prenda). */
export type PerfilDePixeles = { primera: (number | null)[]; ultima: (number | null)[] };

/** @internal Solo el auditor y sus pruebas: saca el perfil por columnas de un recorte RGBA. */
export function perfilDePixeles(rgba: ArrayLike<number>, ancho: number, alto: number, umbral = 32): PerfilDePixeles {
  const primera: (number | null)[] = [];
  const ultima: (number | null)[] = [];
  for (let x = 0; x < ancho; x++) {
    let a = -1;
    let z = -1;
    for (let y = 0; y < alto; y++) {
      if (rgba[(y * ancho + x) * 4 + 3] > umbral) {
        if (a < 0) a = y;
        z = y;
      }
    }
    primera.push(a < 0 ? null : a / alto);
    ultima.push(z < 0 ? null : (z + 1) / alto);
  }
  return { primera, ultima };
}

/** Una columna es de la pretina si la prenda de abajo empieza ahí a no más de esto (fracción del alto) bajo su punto más alto: la línea plana de la cintura, con su
 *  esquina redondeada. Es lo que se ve «flotando» cuando el bajo de arriba no la cubre. La curva que baja hacia la cadera NO cuenta: bajo un bajo recto, esa curva es
 *  simplemente la silueta del pantalón, y exigir taparla sube el pantalón hasta asomar entre el cuerpo y la manga de una camisa (visto el 2026-11-17 con la franja en 6 %).
 *  Es una medida propia del auditor, sobre los píxeles: el algoritmo usa la suya (`CIMA_DE_LA_PRETINA`), conservadora y por franjas. */
export const PRETINA_DE_LA_AUDITORIA = 0.03;
/** Una columna de la prenda de arriba es del torso (tiene bajo) si su última fila no queda más de esto (fracción del alto) sobre la más baja de la prenda:
 *  lo demás son tirantes, mangas o el hueco de un escote, que no cubren la pretina. */
export const TORSO_DE_LA_AUDITORIA = 0.3;

/** Cuántas columnas seguidas tiene que durar un hueco para contar: una rendija de 1 a 3 px (la botonadura, una abertura del bajo) no se ve; un triángulo sí. */
export const COLUMNAS_QUE_SE_VEN = 4;

export type ResultadoDeLaAuditoria = {
  /** El hueco más alto (px de la escena) entre el bajo de arriba y la pretina de abajo que dura al menos `COLUMNAS_QUE_SE_VEN` columnas seguidas. 0 si no hay aire. */
  maxHueco: number;
  /** Cuántas columnas de la pretina (px de la escena) tienen más de 1 px de aire. */
  columnasConHueco: number;
  /** Cuántas columnas tiene la pretina en la escena. */
  columnasDePretina: number;
};

const columna = (p: PerfilDePixeles, fraccion: number): number => Math.min(p.primera.length - 1, Math.max(0, Math.floor(fraccion * p.primera.length)));

/** Mide el aire entre la prenda de arriba (`caja`) y la pretina de la de abajo (`cajaAbajo`), columna por columna de la escena. */
export function huecoDeLaUnion(arriba: { caja: Caja; perfil: PerfilDePixeles }, abajo: { caja: Caja; perfil: PerfilDePixeles }): ResultadoDeLaAuditoria {
  const masAlta = Math.min(1, ...abajo.perfil.primera.map((v) => v ?? 1));
  // El bajo del torso: lo más bajo que llega la prenda en el CENTRO (40 % del ancho). Los puños de unas mangas largas llegan más abajo y no son el bajo.
  const n = arriba.perfil.ultima.length;
  const masBaja = Math.max(0, ...arriba.perfil.ultima.slice(Math.floor(n * 0.3), Math.ceil(n * 0.7)).map((v) => v ?? 0));
  const huecos: number[] = [];
  let columnasConHueco = 0;
  let columnasDePretina = 0;
  const x0 = Math.ceil(abajo.caja.x);
  const x1 = Math.floor(abajo.caja.x + abajo.caja.w);
  for (let x = x0; x < x1; x++) {
    const ca = columna(abajo.perfil, (x + 0.5 - abajo.caja.x) / abajo.caja.w);
    const empieza = abajo.perfil.primera[ca];
    if (empieza === null || empieza > masAlta + PRETINA_DE_LA_AUDITORIA) continue;
    // Fuera del ancho de la prenda de arriba no hay bajo que cubra: es una pretina que asoma por un lado, no un hueco.
    const fx = (x + 0.5 - arriba.caja.x) / arriba.caja.w;
    if (fx < 0 || fx >= 1) continue;
    const termina = arriba.perfil.ultima[columna(arriba.perfil, fx)];
    if (termina === null || termina < masBaja - TORSO_DE_LA_AUDITORIA) continue;
    columnasDePretina++;
    const hueco = abajo.caja.y + empieza * abajo.caja.h - (arriba.caja.y + termina * arriba.caja.h);
    if (hueco > 1) columnasConHueco++;
    huecos.push(hueco);
  }
  // El hueco que se ve es el que dura varias columnas seguidas: el más alto de las ventanas de `COLUMNAS_QUE_SE_VEN`, tomando en cada una su columna más baja.
  let maxHueco = 0;
  for (let i = 0; i + COLUMNAS_QUE_SE_VEN <= huecos.length; i++) maxHueco = Math.max(maxHueco, Math.min(...huecos.slice(i, i + COLUMNAS_QUE_SE_VEN)));
  return { maxHueco: Math.round(maxHueco * 10) / 10, columnasConHueco, columnasDePretina };
}

/** Lo que la figura sabe de una prenda para dibujarla (lo que viene del catálogo del probador). */
export type PrendaParaAuditar = { largo: number; proporcion: number; metida?: boolean; porTorso?: boolean; falda?: boolean };

/**
 * Lo que hace la figura (`useUnionDeLaFigura`) con un par de prendas ya medidas: la de arriba ajustada a su forma y la de abajo unida a ella. `null` si la
 * unión no aplica (arriba va metida). Mismo orden y mismas funciones que la figura, para que lo auditado sea lo que se ve.
 */
export function cajasDeLaFigura(
  arriba: PrendaParaAuditar,
  medidaArriba: MedidaDelRecorte,
  abajo: PrendaParaAuditar,
  medidaAbajo: MedidaDelRecorte,
): { arriba: Caja; abajo: Caja } | null {
  if (arriba.metida) return null;
  const cajaArriba = cajaDe("arriba", arriba.largo, arriba.proporcion);
  const arribaFinal = cajaDeArribaAjustada({ caja: cajaArriba, medida: medidaArriba, metida: false, porTorso: arriba.porTorso }) ?? cajaArriba;
  const cajaAbajo = cajaDe("abajo", abajo.largo, abajo.proporcion);
  const unida =
    cajaDeAbajoUnida({ caja: arribaFinal, medida: medidaArriba, metida: false }, { proporcion: abajo.proporcion, medida: medidaAbajo, falda: abajo.falda }) ??
    cajaDeAbajoSinMedida({ caja: arribaFinal, medida: medidaArriba, metida: false }, cajaAbajo) ??
    cajaAbajo;
  return { arriba: arribaFinal, abajo: unida };
}

/* ======================== El tamaño: que ninguna blusa se dibuje más grande (o más chica) que una persona ======================== */

/** El ancho del cuerpo (cm, plano) que se cree en una blusa, un polo o un top ya dibujado. En el catálogo del 2026-11-17 todas quedan entre 28 y 43 cm; fuera de esta franja
 *  la prenda se está dibujando a otra escala que las demás (Felipe, 2026-11-17: el Top Glitters, de bajo en V, salía con 53 cm de cuerpo sobre un pantalón de cintura 39). */
export const CUERPO_CREIBLE_MINIMO_CM = 27;
export const CUERPO_CREIBLE_MAXIMO_CM = 46;

/**
 * Cuánto mide de ancho el cuerpo de una prenda de arriba tal como la dibuja la figura (cm): su caja ya ajustada por el ancho de su cuerpo. `null` si no se puede medir.
 * Solo tiene sentido para las que se escalan por su torso (`porTorso`): una casaca o un abrigo es ancho a propósito y no se encoge.
 */
export function cuerpoDibujadoCm(arriba: PrendaParaAuditar, medida: MedidaDelRecorte): number | null {
  if (arriba.metida || medida.borde === null) return null;
  const caja = cajaDe("arriba", arriba.largo, arriba.proporcion);
  const final = cajaDeArribaAjustada({ caja, medida, metida: false, porTorso: arriba.porTorso }) ?? caja;
  return Math.round(((final.w * Math.max(medida.borde, anchoDelBajo(medida) ?? 0)) / PX_POR_CM) * 10) / 10;
}
