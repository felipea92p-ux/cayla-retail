// Análisis v4 (ADR-0357): la pestaña «No se vende», en lógica pura (sin base ni React), probada en `analisis-quietas.test.ts`.
// Qué grupo le toca a cada prenda lo decide `grupoDe` (analisis-reglas.ts) y aquí no se repite: esto cuenta las cifras de
// arriba, ubica cada prenda en el carril «Días en el piso sin venderse» (dónde cae y de qué color va su aro), arma la barra de edad de
// cada tienda y dice a qué tienda va «Enviar todas». Las cifras de dibujo son las de la maqueta aprobada por Felipe (2026-10-06).

import type { EdadInventario, PrendaAnalisis } from "./analisis-tipos";
import { diasEntreFechas } from "./fechas-lima";
import { destinoParaEnviar, razonTiendaSinLeer, tiendasSinLeer } from "./analisis-enviar";
import { DIAS_EJE_QUIETAS, DIAS_TRES_MESES, GRUPOS_CARRIL_QUIETAS, grupoDe, ordenQuietas, plural, prendasDe, totalEnTienda } from "./analisis-reglas";

/** Las cifras grandes de arriba: cuántos modelos están quietos y cuánta plata hay en ellos. */
export type CifrasQuietas = {
  /** Las filas de «Mándalas» y «Liquidar»: desde la decisión 12 de ADR-0357, MODELOS (cada uno con todas sus tallas y colores). */
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

type ConDinero = Pick<PrendaAnalisis, "piso" | "almacen" | "costo" | "precio">;

/**
 * Las cifras de lo quieto. Sin quietas, todo es 0: no hay nada que costar. El dinero se suma talla por talla (`variantes` de cada
 * modelo): cada una con su costo y su precio, nunca el promedio del modelo; «sin costo» y «sin precio» cuentan esas tallas.
 */
export function cifrasQuietas(quietas: readonly (ConDinero & { variantes?: readonly ConDinero[] })[]): CifrasQuietas {
  let unidades = 0;
  let costo = 0;
  let precioVenta = 0;
  let conCosto = 0;
  let conPrecio = 0;
  const tallas = quietas.flatMap((q) => q.variantes ?? [q]);
  for (const p of tallas) {
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
    sinCosto: tallas.length - conCosto,
    sinPrecio: tallas.length - conPrecio,
  };
}

/** El «?» junto a «costaron» cuando alguna prenda no entra en la cuenta; null si entran todas. */
export function notaSinCosto(c: Pick<CifrasQuietas, "sinCosto" | "sinPrecio">): string | null {
  const costo = c.sinCosto > 0 ? `${c.sinCosto} ${plural(c.sinCosto, "prenda", "prendas")} sin costo` : null;
  const precio = c.sinPrecio > 0 ? (costo ? `${c.sinPrecio} sin precio` : `${c.sinPrecio} ${plural(c.sinPrecio, "prenda", "prendas")} sin precio`) : null;
  if (!costo && !precio) return null;
  return `No cuenta ${[costo, precio].filter(Boolean).join(" ni ")}.`;
}

/**
 * Dónde termina el carril «Días en el piso sin venderse»: 4 meses, o más si el escalón de «Liquidar» de algún tipo pasa de ahí (`escalon`: el mayor de las
 * filas): su marca queda a la vista con aire detrás, y el fin cae en un mes justo. Sin escalones (ningún tipo con vara), los 4 meses.
 */
export function finDelEje(escalon: number = 0): number {
  return Math.max(DIAS_EJE_QUIETAS, Math.ceil((escalon + 20) / 30) * 30);
}

/** El escalón de «Liquidar» más largo de las filas (el de los tipos con vara); 0 si ninguna lo tiene. */
export const escalonMayor = (prendas: readonly Pick<PrendaAnalisis, "umbrales">[]): number => prendas.reduce((m, p) => Math.max(m, p.umbrales?.liquidar ?? 0), 0);

const enEje = (dias: number, fin: number = DIAS_EJE_QUIETAS): number => Math.min(1, Math.max(0, dias / fin));

/** Las etiquetas del eje: dónde termina («4 meses», «7 meses») y si «3 meses» cabe sin pisar la marca de «Liquidar» (`comun`, si todas las filas la comparten). */
export function etiquetasEje(fin: number, comun: number | null): { fin: string; tresMeses: boolean } {
  return { fin: `${fin / 30} meses`, tresMeses: comun === null || Math.abs(DIAS_TRES_MESES - comun) >= fin * 0.1 };
}

/** La marca de «3 meses» del eje, en %. */
export const marcaTresMeses = (fin: number): number => enEje(DIAS_TRES_MESES, fin) * 100;

/** El color del aro de cada prenda (el estado de sus chips): rojo desde 3 meses, ámbar desde el escalón de «Liquidar» de su tipo, neutro antes. */
export type ZonaQuieta = "urg" | "ate" | "nd";

/**
 * Pasado este punto del eje, la cifra «104 d» va a la izquierda del punto: a la derecha se saldría de la pista y pisaría la
 * píldora (lo de más de 4 meses, que en la tienda real abunda, cae justo al final). Es la misma marca que usa la maqueta en
 * «Se está acabando» para meter la cifra en la barra.
 */
const CIFRA_A_LA_IZQUIERDA_DESDE = 0.8;

/**
 * Una prenda en el carril «Días sin venderse»: dónde cae su punto, de qué color va su aro, de qué lado va su cifra y dónde empieza SU zona de liquidar
 * (`umbral`: el de su tipo; null si su tipo no tiene ritmo todavía: sin zona, sin número inventado). El eje es el mismo para todas.
 */
export function pistaQuieta(dias: number, fin: number, umbral: number | null): { n: number; zona: ZonaQuieta; cifraALaIzquierda: boolean; liquidar: number | null } {
  const n = enEje(dias, fin);
  // Un tipo sin ritmo nunca va en rojo ni en ámbar (Felipe: «ni se rebaja ni se manda por ahora»): sin escalón no hay zona, ni siquiera la de 3 meses.
  const zona: ZonaQuieta = umbral === null ? "nd" : dias >= DIAS_TRES_MESES ? "urg" : dias >= umbral ? "ate" : "nd";
  return { n, zona, cifraALaIzquierda: n > CIFRA_A_LA_IZQUIERDA_DESDE, liquidar: umbral === null ? null : enEje(umbral, fin) * 100 };
}

/**
 * La marca «Liquidar» del eje: solo si todas las filas que tienen escalón se liquidan desde el mismo día (si cada tipo tiene el suyo, cada fila lo
 * dibuja en su pista y una marca común mentiría). Sin filas con escalón, no hay marca.
 */
export function marcaLiquidarComun(prendas: readonly Pick<PrendaAnalisis, "umbrales">[]): number | null {
  const umbrales = new Set(prendas.flatMap((p) => (p.umbrales ? [p.umbrales.liquidar] : [])));
  return umbrales.size === 1 ? [...umbrales][0]! : null;
}

/**
 * La nota del carril: con qué se mide cada tipo (ADR-0357, act. 2026-10-14 y 2026-10-17). Solo con lo que tardan en venderse los suyos; un tipo que todavía no
 * vendió lo suficiente queda en «Todavía sin ritmo» y sin Frescura no se juzga nada. Nunca un número de días fijo.
 */
export function notaDeUmbrales(prendas: readonly Pick<PrendaAnalisis, "umbrales" | "sinRitmo">[], frescura: "ok" | "sin_modulo" | "fallo" | "no_aplica"): string {
  if (frescura !== "ok") return "Sin saber cuánto tarda en venderse cada tipo, lo quieto no se rebaja ni se manda: queda en «Todavía sin ritmo».";
  const sin = prendas.filter((p) => !p.umbrales && p.sinRitmo).length;
  const base = "Cada tipo se mide con lo que tardan en venderse los suyos en tu piso.";
  return sin > 0 ? `${base} Los que todavía no vendieron lo suficiente quedan en «Todavía sin ritmo».` : base;
}

/**
 * Por qué un modelo está en «Todavía sin ritmo», en palabras de tienda (la misma idea que Frescura: «todavía no se vendió ni la mitad…»). `corta` para la
 * fila del carril (cabe en dos renglones); la larga para la ficha. Siempre el sujeto es el TIPO, no el modelo de la fila. null si el modelo no tiene ese
 * motivo. No dice un número de días fijo.
 */
export function razonSinRitmo(p: Pick<PrendaAnalisis, "sinRitmo">, formato: "fila" | "ficha" = "ficha"): string | null {
  const s = p.sinRitmo;
  if (!s) return null;
  const cierre = "ni se rebaja ni se manda por ahora";
  if (s.motivo === "poca_venta") {
    return formato === "fila"
      ? `Su tipo vendió ${s.vendidas} de ${s.unidades} de los que colgaste: aún no se sabe cuánto tarda en venderse.`
      : `Su tipo todavía no tiene ventas suficientes para saber cuánto tarda en venderse: ${cierre}. De su tipo se vendieron ${s.vendidas} de ${s.unidades} de los que colgaste.`;
  }
  if (s.porque === "fallo") return formato === "fila" ? "No se pudo leer cuánto tarda en venderse su tipo." : `No se pudo leer cuánto tarda en venderse su tipo: ${cierre}.`;
  if (s.porque === "sin_modulo") return formato === "fila" ? "Tu rol no ve Frescura, de donde sale cuánto tarda su tipo." : `Tu rol no ve Frescura del piso, de donde sale cuánto tarda en venderse su tipo: ${cierre}.`;
  return formato === "fila"
    ? "Esta sede no separa piso y almacén: no se sabe cuánto tarda su tipo."
    : `Esta sede no separa piso y almacén, así que no se sabe cuánto tarda en venderse su tipo: ${cierre}.`;
}

/** Las prendas de cada grupo del carril, cada uno de lo que más espera a lo que menos. Una prenda cae en uno solo. */
export function gruposQuietas<T extends PrendaAnalisis>(prendas: readonly T[]): { enviar: T[]; liquidar: T[]; duda: T[]; vigila: T[]; sinRitmo: T[] } {
  const grupos = { enviar: [] as T[], liquidar: [] as T[], duda: [] as T[], vigila: [] as T[], sinRitmo: [] as T[] };
  for (const p of prendas) {
    const g = grupoDe(p);
    if (g === "enviar" || g === "liquidar" || g === "duda" || g === "vigila") grupos[g].push(p);
    else if (g === "sin_ritmo") grupos.sinRitmo.push(p);
  }
  for (const g of Object.values(grupos)) g.sort(ordenQuietas);
  return grupos;
}

/**
 * «Enviar todas»: la tienda a la que van todas (la que más las vende), si es la misma para todas; null si van a tiendas
 * distintas (cada fila tiene la suya) o si no hay ninguna.
 */
export function destinoDeTodas(prendas: readonly Pick<PrendaAnalisis, "otras">[]): string | null {
  const destinos = new Set(prendas.map((p) => destinoParaEnviar(p.otras)?.sedeId ?? null));
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

/**
 * Si «No se vende» puede decir algo de esta tienda (ADR-0357, act. 2026-10-14, tarea #2; act. 2026-10-17, B1): algún modelo con algo en la tienda es de un
 * tipo con vara suficiente y lleva en el piso, desde que salió, al menos lo que se espera para liquidarlo (el P90 de su tipo). Mientras ningún tipo con
 * modelos tenga vara, o ninguno haya llegado a su escalón, que nada esté quieto no es una buena noticia: todavía no se puede saber. Sin un número de días fijo.
 */
export function puedeJuzgarQuietas(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "salioAlPiso" | "umbrales">[], hoy: string): boolean {
  return prendas.some((p) => totalEnTienda(p) > 0 && p.salioAlPiso !== null && p.umbrales !== undefined && diasEntreFechas(p.salioAlPiso, hoy) >= p.umbrales.liquidar);
}

/**
 * «Todavía no se puede saber: …» con lo que falta: que algún tipo tenga ritmo, o que algún modelo lo alcance. Con Frescura sin leer (`frescura` distinto de
 * «ok») dice eso y no culpa a las ventas: el problema no es que el tipo haya vendido poco sino que no se pudo ver.
 */
export function lineaTodaviaNoQuietas(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "salioAlPiso" | "umbrales">[], frescura: "ok" | "sin_modulo" | "fallo" | "no_aplica" = "ok"): string {
  if (!prendas.some((p) => totalEnTienda(p) > 0 && p.salioAlPiso !== null)) return "No hay nada colgado que juzgar todavía.";
  if (frescura !== "ok") return "No se pudo ver cuánto tarda en venderse cada tipo.";
  return prendas.some((p) => p.umbrales)
    ? "Ningún modelo lleva aún lo que tardan 9 de cada 10 de su tipo."
    : "Ningún tipo vendió todavía lo suficiente para saber cuánto tarda en venderse.";
}

/**
 * Cuántos modelos están quietos (con algo en la tienda, sin ventas en la ventana, ya en el piso) pero de un tipo que NO vendió nada con edad conocida:
 * no hay con qué compararlos, así que ni son «Todavía sin ritmo» ni se juzgan. No desaparecen sin decirlo: la pestaña los cuenta aparte (B1, revisión).
 */
export function modelosSinConQueComparar(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasSinVender" | "umbrales" | "sinRitmo">[]): number {
  return prendas.filter((p) => totalEnTienda(p) > 0 && p.vendidas30 <= 0 && p.diasSinVender !== null && !p.umbrales && !p.sinRitmo).length;
}

export type VacioQuietas = "todo-se-mueve" | "todavia-no" | "sin-datos";

/**
 * Lo que dice la pestaña cuando no hay carril (con las prendas de la tienda, sin buscar): «sin-datos» si no llegó ni una prenda y algo
 * falló al leer (principio 9: nunca «todo se mueve» por un error; la misma regla que «Se está acabando»); «todavia-no» si no se puede juzgar
 * todavía (`puedeJuzgarQuietas`: nunca «todo se mueve» por no haber esperado); si no, «todo-se-mueve»; null si hay carril.
 */
export function vacioQuietas(prendas: readonly PrendaAnalisis[], fallas: number, hoy?: string): VacioQuietas | null {
  if (prendasDe(prendas, GRUPOS_CARRIL_QUIETAS).length > 0) return null;
  if (prendas.length === 0 && fallas > 0) return "sin-datos";
  return hoy !== undefined && !puedeJuzgarQuietas(prendas, hoy) ? "todavia-no" : "todo-se-mueve";
}

/** El título y la línea de cada vacío («sin-datos» dice lo mismo que en «Se está acabando»; «todavia-no» lleva su línea aparte). */
export const TEXTO_VACIO_QUIETAS: Record<VacioQuietas, { titulo: string; linea: string }> = {
  "todo-se-mueve": { titulo: "Todo se mueve", linea: "Ningún modelo pasa de lo que tarda su tipo en venderse." },
  "todavia-no": { titulo: "Todavía no se puede saber", linea: "Ningún modelo lleva aún en el piso lo que se espera." },
  "sin-datos": { titulo: "No pude ver tus prendas", linea: "Vuelve a intentarlo en un rato." },
};
