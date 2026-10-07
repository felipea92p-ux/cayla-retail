// Análisis v4 (ADR-0357): la pestaña «No se vende», en lógica pura (sin base ni React), probada en `analisis-quietas.test.ts`.
// Qué grupo le toca a cada prenda lo decide `grupoDe` (analisis-reglas.ts) y aquí no se repite: esto cuenta las cifras de
// arriba, ubica cada prenda en el carril «Días sin venderse» (dónde cae y de qué color va su aro), arma la barra de edad de
// cada tienda y dice a qué tienda va «Enviar todas». Las cifras de dibujo son las de la maqueta aprobada por Felipe (2026-10-06).

import type { EdadInventario, PrendaAnalisis } from "./analisis-tipos";
import { DIAS_EJE_QUIETAS, DIAS_TRES_MESES, GRUPOS_CARRIL_QUIETAS, grupoDe, ordenQuietas, plural, prendasDe, sedeQueMasVende, totalEnTienda } from "./analisis-reglas";

/** Las cifras grandes de arriba: cuántas prendas están quietas y cuánta plata hay en ellas. */
export type CifrasQuietas = {
  /** Prendas (una talla de un color) en «Mándalas» y «Liquidar». */
  prendas: number;
  /** Lo libre de esas prendas en la tienda. */
  unidades: number;
  /** Costo × unidades de las que tienen costo; null si ninguna lo tiene (se dice «—», nunca un S/ 0 inventado). */
  costo: number | null;
  /** Precio × unidades de las que tienen precio; null si ninguna lo tiene. */
  precioVenta: number | null;
  /** Cuántas no entran en el costo o en el precio por no tenerlo. */
  sinCosto: number;
  sinPrecio: number;
};

/** Las cifras de las prendas quietas. Sin quietas, todo es 0: no hay nada que costar. */
export function cifrasQuietas(quietas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "costo" | "precio">[]): CifrasQuietas {
  let unidades = 0;
  let costo = 0;
  let precioVenta = 0;
  let conCosto = 0;
  let conPrecio = 0;
  for (const p of quietas) {
    const u = totalEnTienda(p);
    unidades += u;
    if (p.costo !== null) {
      costo += p.costo * u;
      conCosto++;
    }
    if (p.precio !== null) {
      precioVenta += p.precio * u;
      conPrecio++;
    }
  }
  const vacio = quietas.length === 0;
  return {
    prendas: quietas.length,
    unidades,
    costo: conCosto > 0 || vacio ? costo : null,
    precioVenta: conPrecio > 0 || vacio ? precioVenta : null,
    sinCosto: quietas.length - conCosto,
    sinPrecio: quietas.length - conPrecio,
  };
}

/** El «?» junto a «costaron» cuando alguna prenda no entra en la cuenta; null si entran todas. */
export function notaSinCosto(c: Pick<CifrasQuietas, "sinCosto" | "sinPrecio">): string | null {
  const costo = c.sinCosto > 0 ? `${c.sinCosto} ${plural(c.sinCosto, "prenda", "prendas")} sin costo` : null;
  const precio = c.sinPrecio > 0 ? (costo ? `${c.sinPrecio} sin precio` : `${c.sinPrecio} ${plural(c.sinPrecio, "prenda", "prendas")} sin precio`) : null;
  if (!costo && !precio) return null;
  return `No cuenta ${[costo, precio].filter(Boolean).join(" ni ")}.`;
}

/** Dónde cae un número de días en el eje de 4 meses, de 0 a 1 (lo de más de 4 meses se queda al final). */
/**
 * Dónde termina el carril «Días sin venderse»: 4 meses, o más si «Liquidar desde» pasa de ahí (desde el 2026-10-07 no tiene tope): la
 * marca de «Liquidar» queda a la vista con aire detrás, y el fin cae en un mes justo.
 */
export function finDelEje(liquidarDesde: number): number {
  return Math.max(DIAS_EJE_QUIETAS, Math.ceil((liquidarDesde + 20) / 30) * 30);
}

const enEje = (dias: number, fin: number = DIAS_EJE_QUIETAS): number => Math.min(1, Math.max(0, dias / fin));

/** Las etiquetas del eje: dónde termina («4 meses», «7 meses») y si «3 meses» cabe sin pisar la marca de «Liquidar». */
export function etiquetasEje(liquidarDesde: number): { fin: string; tresMeses: boolean } {
  const fin = finDelEje(liquidarDesde);
  return { fin: `${fin / 30} meses`, tresMeses: Math.abs(DIAS_TRES_MESES - liquidarDesde) >= fin * 0.1 };
}

/** Las dos marcas del eje, en %: «Liquidar» (se mueve con el control) y «3 meses». */
export function marcasEje(liquidarDesde: number): { liquidar: number; tresMeses: number } {
  const fin = finDelEje(liquidarDesde);
  return { liquidar: enEje(liquidarDesde, fin) * 100, tresMeses: enEje(DIAS_TRES_MESES, fin) * 100 };
}

/** El color del aro de cada prenda (el estado de sus chips): rojo desde 3 meses, ámbar desde «Liquidar desde», neutro antes. */
export type ZonaQuieta = "urg" | "ate" | "nd";

/**
 * Pasado este punto del eje, la cifra «104 d» va a la izquierda del punto: a la derecha se saldría de la pista y pisaría la
 * píldora (lo de más de 4 meses, que en la tienda real abunda, cae justo al final). Es la misma marca que usa la maqueta en
 * «Se está acabando» para meter la cifra en la barra.
 */
const CIFRA_A_LA_IZQUIERDA_DESDE = 0.8;

/** Una prenda en el carril «Días sin venderse»: dónde cae su punto, de qué color va su aro y de qué lado va su cifra. */
export function pistaQuieta(dias: number, liquidarDesde: number): { n: number; zona: ZonaQuieta; cifraALaIzquierda: boolean } {
  const n = enEje(dias, finDelEje(liquidarDesde));
  const zona: ZonaQuieta = dias >= DIAS_TRES_MESES ? "urg" : dias >= liquidarDesde ? "ate" : "nd";
  return { n, zona, cifraALaIzquierda: n > CIFRA_A_LA_IZQUIERDA_DESDE };
}

/** Las prendas de cada grupo del carril, cada uno de lo que más espera a lo que menos. Una prenda cae en uno solo. */
export function gruposQuietas<T extends PrendaAnalisis>(prendas: readonly T[], liquidarDesde: number): { enviar: T[]; liquidar: T[]; vigila: T[] } {
  const grupos = { enviar: [] as T[], liquidar: [] as T[], vigila: [] as T[] };
  for (const p of prendas) {
    const g = grupoDe(p, liquidarDesde);
    if (g === "enviar" || g === "liquidar" || g === "vigila") grupos[g].push(p);
  }
  grupos.enviar.sort(ordenQuietas);
  grupos.liquidar.sort(ordenQuietas);
  grupos.vigila.sort(ordenQuietas);
  return grupos;
}

/**
 * «Enviar todas»: la tienda a la que van todas (la que más las vende), si es la misma para todas; null si van a tiendas
 * distintas (cada fila tiene la suya) o si no hay ninguna.
 */
export function destinoDeTodas(prendas: readonly Pick<PrendaAnalisis, "otras">[]): string | null {
  const destinos = new Set(prendas.map((p) => sedeQueMasVende(p.otras)?.sedeId ?? null));
  if (destinos.size !== 1) return null;
  return [...destinos][0] ?? null;
}

/** Los cuatro tramos de la edad de lo que hay en una tienda, de lo nuevo a lo viejo (la leyenda de «Por tienda»). */
export const TRAMOS_EDAD = [
  { clave: "hasta30", clase: "e1", etiqueta: "Hasta 1 mes" },
  { clave: "de31a60", clase: "e2", etiqueta: "1 a 2 meses" },
  { clave: "de61a90", clase: "e3", etiqueta: "2 a 3 meses" },
  { clave: "masDe90", clase: "e4", etiqueta: "Más de 3 meses" },
] as const satisfies readonly { clave: keyof EdadInventario; clase: string; etiqueta: string }[];

export type TramoEdad = { clase: (typeof TRAMOS_EDAD)[number]["clase"]; etiqueta: string; unidades: number; flex: number; cifraAdentro: boolean };

/** Lo mínimo que ocupa un tramo en la barra, para que se vea aunque tenga pocas o ninguna (la maqueta). */
const TRAMO_MINIMO = 0.03;
/** Desde qué parte de la barra cabe la cifra adentro. */
const CIFRA_ADENTRO_DESDE = 0.1;

/** La barra de edad de una tienda: cada tramo con su ancho y, si es ancho, su cifra adentro. Sin unidades, total 0. */
export function barraDeEdad(edad: EdadInventario): { total: number; tramos: TramoEdad[] } {
  const total = edad.hasta30 + edad.de31a60 + edad.de61a90 + edad.masDe90;
  return {
    total,
    tramos: TRAMOS_EDAD.map((t) => {
      const parte = total > 0 ? edad[t.clave] / total : 0;
      return {
        clase: t.clase,
        etiqueta: t.etiqueta,
        unidades: edad[t.clave],
        flex: total > 0 ? Math.max(parte, TRAMO_MINIMO) : 0,
        cifraAdentro: parte > CIFRA_ADENTRO_DESDE,
      };
    }),
  };
}

export type VacioQuietas = "todo-se-mueve" | "sin-datos";

/**
 * Lo que dice la pestaña cuando no hay carril (con las prendas de la tienda, sin buscar): «todo-se-mueve» si ninguna lleva un
 * mes sin venderse; «sin-datos» si no llegó ni una prenda y algo falló al leer (principio 9: nunca «todo se mueve» por un
 * error; la misma regla que «Se está acabando»); null si hay carril. Con «Liquidar desde» de 30 días o más no depende de él (el
 * control solo pasa prendas de un grupo a otro); con menos, puede sumar al carril las que ya llevan ese tiempo sin venderse. Nunca
 * saca una.
 */
export function vacioQuietas(prendas: readonly PrendaAnalisis[], liquidarDesde: number, fallas: number): VacioQuietas | null {
  if (prendasDe(prendas, GRUPOS_CARRIL_QUIETAS, liquidarDesde).length > 0) return null;
  return prendas.length === 0 && fallas > 0 ? "sin-datos" : "todo-se-mueve";
}

/** El título y la línea de cada vacío («sin-datos» dice lo mismo que en «Se está acabando»). */
export const TEXTO_VACIO_QUIETAS: Record<VacioQuietas, { titulo: string; linea: string }> = {
  "todo-se-mueve": { titulo: "Todo se mueve", linea: "Ninguna prenda lleva más de un mes sin venderse." },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
};
