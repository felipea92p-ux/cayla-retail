import { z } from "zod";
import { zonaDelProbador, type ZonaDelProbador } from "@cayla-retail/shared/categorias-de-la-tienda";
import { claveCategoria, type Prenda } from "./catalogo";
import type { Look as LookDeCayla, TallaLook } from "./looks";
import { esquemaStockModelo, hayAlgo, notaDeStock, type NotaStock, type StockModelo, type Tienda } from "./stock";

// «Arma el tuyo», el probador de looks de la tienda (ADR-0434, actividad 4; lienzo v3, `V3Probador`). El cliente se viste prenda por
// prenda a escala —una de arriba, una de abajo y un bolso: MÁXIMO 3 prendas, ADR-0444—, cambia cada una deslizándola o desde la tira de opciones y la
// elige en cualquiera de sus colores. Todo lo de aquí es lógica pura, con su prueba al lado:
//   1. Lo que dice la base (`retail.tienda_probador`): el largo, los recortes y el precio y el stock de CADA color.
//   2. La zona de cada categoría, de los grupos que ya usa la tienda (`grupos.ts`).
//   3. Juntar el catálogo (qué se ve, su nombre y sus colores) con lo del probador, y lo que dice cada color.
//   4. El look: poner, sacar y cambiar prendas, «Sorpréndeme». (Desde el ADR-0444 ninguna categoría cae en «vestido» ni en «encima»: el código de
//      esas dos zonas —el vestido que ocupa arriba y abajo, la fila «Algo encima»— queda, sin prendas que lo usen, por si se vuelve atrás.)
//   5. El look en la dirección (`?p=`), para volver a él o compartirlo.
//   6. La figura: dónde va cada prenda y de qué tamaño (2,5 px por cm, desde los hombros o la cintura).
// Solo fotos reales (Felipe, 2026-10-16): un color sin foto propia se elige igual, la figura muestra otra foto de la prenda y lo dice.

/* =============================================== 1. Lo que dice la base =============================================== */

const esquemaRecorte = z.object({
  // El color de la foto del recorte; null: la foto no tiene color marcado («todos los colores»: el sistema no sabe cuál es).
  color: z.string().min(1).nullable(),
  color_nombre: z.string().min(1).nullable().catch(null),
  url: z.string().url(),
  // Ancho sobre alto del PNG recortado.
  proporcion: z.number().positive().lt(20),
});

const esquemaColor = z
  .object({
    codigo: z.string().min(1),
    // Lo que vale ESTE color en la tienda elegida (el resumen por color de la base: el mismo de la bolsa).
    precio: z.number().positive(),
    precio_final: z.number().nonnegative(),
    desde: z.boolean(),
    campana: z.object({ nombre: z.string().min(1), pct: z.number().positive() }).nullable().catch(null),
    // Su nivel en cada tienda de la web y en todas. Raro: sin dato (no se afirma lo que no se sabe).
    stock: esquemaStockModelo.nullable().catch(null),
  })
  .refine((c) => c.precio_final <= c.precio);

const esquemaPrenda = z.object({
  id: z.string().uuid(),
  largo: z.number().int().min(5).max(250),
  recortes: z.array(z.unknown()),
  colores: z.array(z.unknown()),
});

export type RecorteLeido = { color: string | null; colorNombre: string | null; url: string; proporcion: number };
export type ColorLeido = {
  precio: number;
  precioFinal: number;
  desde: boolean;
  campana: { nombre: string; pct: number } | null;
  stock: StockModelo | null;
};
export type PrendaLeida = { largo: number; recortes: RecorteLeido[]; colores: Map<string, ColorLeido> };
/** Lo que respondió la base: la tienda cuyo precio usó (null: «Todas»), las prendas por id y con qué colores se lleva cada color. */
export type LecturaProbador = { sede: string | null; prendas: Map<string, PrendaLeida>; combina: Record<string, string[]> };

/**
 * Lo que devuelve `retail.tienda_probador(p_sede)`. Una prenda o un color con un dato raro se descarta solo (lo demás se ve igual); si la
 * respuesta entera no tiene la forma esperada, `null`: la página dice que no se pudo cargar, nunca se cae (principio 9).
 */
export function interpretarProbador(dato: unknown): LecturaProbador | null {
  const r = z
    .object({
      sede: z.string().uuid().nullable().catch(null),
      prendas: z.array(z.unknown()),
      combina: z.record(z.string(), z.array(z.string())).catch({}),
    })
    .safeParse(dato);
  if (!r.success) return null;
  const prendas = new Map<string, PrendaLeida>();
  for (const cruda of r.data.prendas) {
    const p = esquemaPrenda.safeParse(cruda);
    if (!p.success) continue;
    const recortes = p.data.recortes.flatMap((x) => {
      const y = esquemaRecorte.safeParse(x);
      return y.success ? [{ color: y.data.color, colorNombre: y.data.color_nombre, url: y.data.url, proporcion: y.data.proporcion }] : [];
    });
    const colores = new Map<string, ColorLeido>();
    for (const x of p.data.colores) {
      const c = esquemaColor.safeParse(x);
      if (c.success) {
        colores.set(c.data.codigo, { precio: c.data.precio, precioFinal: c.data.precio_final, desde: c.data.desde, campana: c.data.campana, stock: c.data.stock });
      }
    }
    if (recortes.length > 0 && colores.size > 0) prendas.set(p.data.id, { largo: p.data.largo, recortes, colores });
  }
  return { sede: r.data.sede, prendas, combina: r.data.combina };
}

/* =============================================== 2. Las zonas del cuerpo =============================================== */

export type Zona = ZonaDelProbador;
/** En este orden se numeran las prendas del look (1, 2, 3…) y se recorren al armarlo, como en el lienzo. */
export const ZONAS: readonly Zona[] = ["vestido", "arriba", "abajo", "encima", "bolso"];
export const NOMBRE_ZONA: Record<Zona, string> = { vestido: "Vestido", arriba: "Arriba", abajo: "Abajo", encima: "Encima", bolso: "Bolso" };
/** Lo que puede faltar: arriba y abajo (o un vestido) van siempre; algo encima y el bolso, si el cliente quiere. */
export const OPCIONAL: Record<Zona, boolean> = { vestido: false, arriba: false, abajo: false, encima: true, bolso: true };

/** El body va metido: debajo de lo de abajo. */
const PREFIJOS_METIDOS: readonly string[] = ["BOD"];

/** La zona de una categoría, por su prefijo (nunca por el nombre visible, que se renombra). null: no entra al probador. La regla vive
 *  en `packages/shared` (`zonaDelProbador`): el ERP cuenta con la misma qué prendas preparar (Tienda web ▸ Vitrina ▸ Probador). */
export function zonaDe(categoria: Prenda["categoria"]): Zona | null {
  return zonaDelProbador(claveCategoria(categoria), categoria?.familia);
}

/* =============================================== 3. Juntar el catálogo y el probador =============================================== */

export type FotoDelColor = {
  url: string;
  proporcion: number;
  /** Si el optimizador de imágenes puede achicarla (`fotoOptimizable`); si no, se muestra tal cual. */
  optimizar: boolean;
  /** La foto es de este color. */
  propia: boolean;
  /** Si no es la propia, de qué color es la que se ve; null si la foto no tiene color marcado (el sistema no sabe cuál es). */
  de: string | null;
};

export type ColorDelProbador = {
  codigo: string;
  nombre: string;
  hex: string | null;
  precio: number;
  precioFinal: number;
  desde: boolean;
  /** El % de la campaña, solo si baja el precio. */
  pct: number | null;
  /** Hay en la tienda elegida (con «Todas», en alguna de la web). Sin el dato, sí: no se esconde lo que no se sabe. */
  hay: boolean;
  /** Lo que se dice de su stock: «Quedan 2 en Trujillo», «Hay en todas las tiendas», «No hay por ahora»… (null: sin el dato). */
  nota: NotaStock | null;
  /** Con «Todas» y más de una tienda en la web, la única que lo tiene (va en la insignia de la tira). */
  solo: string | null;
  foto: FotoDelColor;
};

export type PrendaDelProbador = {
  id: string;
  /** Su código de producto (TOP-0053), con el que va en la dirección; sin código, su id. */
  codigo: string | null;
  nombre: string;
  /** El nombre de su categoría («Blazers»): dice qué hay en una zona («un chaleco o un blazer»). */
  categoria: string | null;
  zona: Zona;
  metida: boolean;
  largo: number;
  /** Los colores que se ofrecen, en el orden del catálogo. Al menos uno. */
  colores: ColorDelProbador[];
};

/**
 * Lo que dice cada color de su stock: la misma nota de la tarjeta del catálogo (`notaDeStock`) y, donde la tarjeta calla porque hay de
 * sobra, dónde hay («Hay en todas las tiendas», «Hay en 2 tiendas»): en el probador cada color dice siempre cuánto hay.
 */
export function notaDelColor(stock: StockModelo | null, elegida: Tienda | null, tiendas: readonly Tienda[]): NotaStock | null {
  const nota = notaDeStock(stock, elegida, tiendas);
  if (nota || !stock || tiendas.length === 0) return nota;
  const con = tiendas.filter((t) => hayAlgo(stock.sedes[t.id]));
  if (con.length === 0) return null;
  if (tiendas.length === 1) return { texto: `Hay en ${tiendas[0].nombre}`, tono: "ok" };
  return { texto: con.length === tiendas.length ? "Hay en todas las tiendas" : `Hay en ${con.length} tiendas`, tono: "ok" };
}

/** ¿Hay de este color en la tienda elegida (con «Todas», en alguna)? Sin el dato, sí. */
export function hayDelColor(stock: StockModelo | null, elegida: Tienda | null): boolean {
  if (!stock) return true;
  return hayAlgo(elegida ? stock.sedes[elegida.id] : stock.total);
}

/**
 * La foto que se ve de un color: la suya; si no tiene, la de «todos los colores» (una foto sin color marcado) y, si tampoco, la de otro
 * color de la prenda. Nunca se pinta ni se tiñe nada (Felipe, 2026-10-16). null: la prenda no tiene ningún recorte.
 */
export function fotoDelColor(codigo: string, recortes: readonly RecorteLeido[]): Omit<FotoDelColor, "optimizar"> | null {
  const propia = recortes.find((r) => r.color === codigo);
  if (propia) return { url: propia.url, proporcion: propia.proporcion, propia: true, de: null };
  const sinColor = recortes.find((r) => r.color === null);
  if (sinColor) return { url: sinColor.url, proporcion: sinColor.proporcion, propia: false, de: null };
  const otra = recortes[0];
  return otra ? { url: otra.url, proporcion: otra.proporcion, propia: false, de: otra.colorNombre } : null;
}

/** Bajo la figura y en «Tu look», cuando el color elegido no tiene foto propia: qué se está viendo. null si es la suya. */
export function notaDeLaFoto(c: Pick<ColorDelProbador, "nombre" | "foto">): string | null {
  if (c.foto.propia) return null;
  const color = c.nombre.toLocaleLowerCase("es");
  return c.foto.de
    ? `Aún no hay foto en ${color}: ves la del ${c.foto.de.toLocaleLowerCase("es")}`
    : `Aún no hay foto en ${color}: ves otra foto de esta prenda`;
}

/**
 * El probador: las prendas del catálogo (en su orden; ya filtrado por la tienda elegida) que la base trae con largo y recortes, y que
 * caen en una zona; de cada una, sus colores del catálogo con el precio y el stock de ESE color. Una prenda o un color que una de las dos
 * lecturas no trae (se guardan por separado, unos segundos cada una) no entra.
 */
export function armarProbador(
  catalogo: readonly Prenda[],
  lectura: LecturaProbador,
  {
    elegida,
    tiendas,
    optimizable,
  }: { elegida: Tienda | null; tiendas: readonly Tienda[]; optimizable: (url: string) => boolean },
): PrendaDelProbador[] {
  return catalogo.flatMap((p) => {
    const extra = lectura.prendas.get(p.id);
    const zona = zonaDe(p.categoria);
    if (!extra || !zona) return [];
    const colores = p.colores.flatMap((c): ColorDelProbador[] => {
      const leido = extra.colores.get(c.codigo);
      const foto = fotoDelColor(c.codigo, extra.recortes);
      if (!leido || !foto) return [];
      const conTiendas = elegida === null && tiendas.length > 1 && leido.stock ? tiendas.filter((t) => hayAlgo(leido.stock?.sedes[t.id])) : [];
      return [
        {
          codigo: c.codigo,
          nombre: c.nombre,
          hex: c.hex,
          precio: leido.precio,
          precioFinal: leido.precioFinal,
          desde: leido.desde,
          pct: leido.campana && leido.precioFinal < leido.precio ? leido.campana.pct : null,
          hay: hayDelColor(leido.stock, elegida),
          nota: notaDelColor(leido.stock, elegida, tiendas),
          solo: conTiendas.length === 1 ? conTiendas[0].nombre : null,
          foto: { ...foto, optimizar: optimizable(foto.url) },
        },
      ];
    });
    if (colores.length === 0) return [];
    const clave = claveCategoria(p.categoria);
    return [
      {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria?.nombre ?? null,
        zona,
        metida: clave !== null && PREFIJOS_METIDOS.includes(clave),
        largo: extra.largo,
        colores,
      },
    ];
  });
}

/**
 * ¿El probador tiene algo que probar entre estas prendas (las que se ven en la tienda elegida)? Lo pregunta la cabecera para mostrar
 * «Arma el tuyo» (ADR-0434, actividad 10; Felipe 2026-10-17): mientras no haya recortes listos, la entrada no sale y nadie llega a un
 * probador vacío. Es la misma regla que lo arma, así que la entrada y el probador nunca dicen cosas distintas.
 */
export const hayParaProbar = (catalogo: readonly Prenda[], lectura: LecturaProbador): boolean =>
  armarProbador(catalogo, lectura, { elegida: null, tiendas: [], optimizable: () => false }).length > 0;

/* =============================================== 4. El look =============================================== */

/** Una prenda puesta, en un color. */
export type Pieza = { id: string; color: string };
export type Look = Record<Zona, Pieza | null>;
/** Lo que había arriba y abajo antes del vestido: al sacarlo, vuelve. */
export type Memoria = { arriba: Pieza | null; abajo: Pieza | null };

export const LOOK_VACIO: Look = { vestido: null, arriba: null, abajo: null, encima: null, bolso: null };

export const indizar = (prendas: readonly PrendaDelProbador[]): Map<string, PrendaDelProbador> => new Map(prendas.map((p) => [p.id, p]));

/** Las zonas con algo puesto, en su orden (el de los números). */
export const presentes = (look: Look): Zona[] => ZONAS.filter((z) => look[z] !== null);

/** Agotada: ningún color tiene en la tienda elegida (con «Todas», en ninguna). Se ve en la tira, pero no se pone. */
export const agotada = (p: PrendaDelProbador): boolean => !p.colores.some((c) => c.hay);

/** Las de una zona, en el orden del catálogo. */
export const deLaZona = (prendas: readonly PrendaDelProbador[], zona: Zona): PrendaDelProbador[] => prendas.filter((p) => p.zona === zona);

/** Las que se pueden poner en una zona (las que no están agotadas), en el orden en que se deslizan. */
export const elegibles = (prendas: readonly PrendaDelProbador[], zona: Zona): PrendaDelProbador[] =>
  deLaZona(prendas, zona).filter((p) => !agotada(p));

/** El color con que entra una prenda que nadie eligió: el primero con foto propia y que hay; si no, el primero que hay; si no, el primero. */
export function colorInicial(p: PrendaDelProbador): ColorDelProbador {
  return p.colores.find((c) => c.hay && c.foto.propia) ?? p.colores.find((c) => c.hay) ?? p.colores[0];
}

/** El color de una prenda: el que el cliente ya le eligió (si lo sigue teniendo) o el inicial. */
export function colorPara(p: PrendaDelProbador, recordados: Readonly<Record<string, string>>): ColorDelProbador {
  return p.colores.find((c) => c.codigo === recordados[p.id]) ?? colorInicial(p);
}

/** El color puesto de una pieza (o, si ya no lo tiene, el inicial). */
export function colorDeLaPieza(p: PrendaDelProbador, pieza: Pieza): ColorDelProbador {
  return p.colores.find((c) => c.codigo === pieza.color) ?? colorInicial(p);
}

export type Puesto = { look: Look; memoria: Memoria; restaurada: Zona | null };

/**
 * Poner una prenda en su zona. Un vestido ocupa arriba y abajo: lo que había se guarda (`memoria`) y, al poner algo de arriba o de abajo
 * sobre un vestido, el vestido sale y lo otro vuelve (`restaurada`, para que asome).
 */
export function poner(look: Look, memoria: Memoria, p: PrendaDelProbador, color: string): Puesto {
  const nuevo: Look = { ...look };
  const mem: Memoria = { ...memoria };
  let restaurada: Zona | null = null;
  if (p.zona === "vestido") {
    if (nuevo.arriba) mem.arriba = nuevo.arriba;
    if (nuevo.abajo) mem.abajo = nuevo.abajo;
    nuevo.arriba = null;
    nuevo.abajo = null;
  } else if ((p.zona === "arriba" || p.zona === "abajo") && nuevo.vestido) {
    nuevo.vestido = null;
    const otra: "arriba" | "abajo" = p.zona === "arriba" ? "abajo" : "arriba";
    nuevo[otra] = mem[otra];
    if (nuevo[otra]) restaurada = otra;
  }
  nuevo[p.zona] = { id: p.id, color };
  return { look: nuevo, memoria: mem, restaurada };
}

/** Sacar lo de una zona: solo lo que puede faltar (algo encima y el bolso). */
export function quitar(look: Look, zona: Zona): Look {
  return OPCIONAL[zona] ? { ...look, [zona]: null } : look;
}

/** La prenda que entra al deslizar (`d` = 1, la siguiente; −1, la anterior), en círculo. null si no hay otra. */
export function vecinaDe(prendas: readonly PrendaDelProbador[], zona: Zona, actual: string | null, d: 1 | -1): PrendaDelProbador | null {
  const lista = elegibles(prendas, zona);
  const i = lista.findIndex((p) => p.id === actual);
  // La puesta está agotada (llegó por la dirección): se pasa a la primera (o a la última) que sí se puede poner.
  if (i < 0) return lista.length > 0 ? lista[d === 1 ? 0 : lista.length - 1] : null;
  return lista.length < 2 ? null : lista[(i + d + lista.length) % lista.length];
}

/** Las dos que asoman a los lados de la prenda elegida (la anterior y la siguiente; una sola si son la misma). */
export function vecinasDe(prendas: readonly PrendaDelProbador[], zona: Zona, actual: string): { lado: -1 | 1; prenda: PrendaDelProbador }[] {
  const lista = elegibles(prendas, zona);
  if (lista.length < 2) return [];
  const i = Math.max(0, lista.findIndex((p) => p.id === actual));
  const previa = lista[(i - 1 + lista.length) % lista.length];
  const siguiente = lista[(i + 1) % lista.length];
  return previa.id === siguiente.id ? [{ lado: 1, prenda: siguiente }] : [{ lado: -1, prenda: previa }, { lado: 1, prenda: siguiente }];
}

/** ¿Se llevan bien dos colores? Lo dice Colores en el ERP (`colores.combina_con`), en cualquiera de los dos sentidos. */
export const combinan = (a: string, b: string, combina: Readonly<Record<string, readonly string[]>>): boolean =>
  a !== b && Boolean(combina[a]?.includes(b) || combina[b]?.includes(a));

/** Un número al azar repetible, de 0 a 1 (mulberry32): «Sorpréndeme» se prueba con una semilla fija. */
export function azarDesde(semilla: number): () => number {
  let s = Math.floor(semilla * 4294967296) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * «Sorpréndeme»: cambia, en cada zona con algo puesto y sin candado, la prenda y su color. Prefiere lo que hay (siempre), con foto
 * propia, y los colores que combinan con lo que se queda: lo fijo y lo que ya eligió en esta misma vuelta (ADR-0434). Entre las que
 * empatan, al azar. Lo que tiene candado no se toca.
 */
export function sorprender(
  look: Look,
  fijos: Readonly<Partial<Record<Zona, boolean>>>,
  prendas: readonly PrendaDelProbador[],
  combina: Readonly<Record<string, readonly string[]>>,
  azar: () => number,
): Look {
  const nuevo: Look = { ...look };
  const decididos = ZONAS.flatMap((z) => (look[z] && fijos[z] ? [look[z]!.color] : []));
  for (const z of ZONAS) {
    const actual = nuevo[z];
    if (!actual || fijos[z]) continue;
    const otras = elegibles(prendas, z).filter((p) => p.id !== actual.id);
    const lista = otras.length > 0 ? otras : elegibles(prendas, z);
    const pares = lista.flatMap((p) =>
      p.colores
        .filter((c) => c.hay)
        .map((c) => ({ p, c, puntos: (c.foto.propia ? 4 : 0) + decididos.filter((d) => combinan(c.codigo, d, combina)).length })),
    );
    const sinRepetir = pares.filter((x) => !(x.p.id === actual.id && x.c.codigo === actual.color));
    const candidatos = sinRepetir.length > 0 ? sinRepetir : pares;
    if (candidatos.length === 0) continue;
    const mejor = Math.max(...candidatos.map((x) => x.puntos));
    const empatados = candidatos.filter((x) => x.puntos === mejor);
    const elegido = empatados[Math.min(empatados.length - 1, Math.floor(azar() * empatados.length))];
    nuevo[z] = { id: elegido.p.id, color: elegido.c.codigo };
    decididos.push(elegido.c.codigo);
  }
  return nuevo;
}

/** La primera prenda que se puede poner en una zona, en el color con que entra sola. */
function primeraDe(prendas: readonly PrendaDelProbador[], zona: Zona): Pieza | null {
  const p = elegibles(prendas, zona)[0];
  return p ? { id: p.id, color: colorInicial(p).codigo } : null;
}

/**
 * Lo que no puede faltar en la figura: sin vestido, algo arriba y algo abajo (lo primero que hay); si no hay nada ni arriba ni abajo,
 * un vestido. Un look compartido que perdió una prenda (se agotó, o en esta tienda no está) se completa en vez de quedar a medias.
 */
export function completarLook(look: Look, prendas: readonly PrendaDelProbador[]): Look {
  if (look.vestido) return look;
  const arriba = look.arriba ?? primeraDe(prendas, "arriba");
  const abajo = look.abajo ?? primeraDe(prendas, "abajo");
  if (!look.arriba && !look.abajo && !(arriba && abajo)) {
    const vestido = primeraDe(prendas, "vestido");
    if (vestido) return { ...look, vestido, arriba: null, abajo: null };
  }
  return { ...look, arriba, abajo };
}

/**
 * El look con que abre el probador si la dirección no trae uno: lo primero que hay arriba y abajo (o, si falta uno de los dos, un
 * vestido) y un bolso. Nada encima: la fila «Algo encima» lo invita.
 */
export function lookInicial(prendas: readonly PrendaDelProbador[]): Look {
  return completarLook({ ...LOOK_VACIO, bolso: primeraDe(prendas, "bolso") }, prendas);
}

/** Lo que vuelve al sacar un vestido: lo de arriba y abajo del look o, si no había, lo primero que hay. */
export function memoriaInicial(look: Look, prendas: readonly PrendaDelProbador[]): Memoria {
  return { arriba: look.arriba ?? primeraDe(prendas, "arriba"), abajo: look.abajo ?? primeraDe(prendas, "abajo") };
}

export type Totales = { cuantas: number; final: number; lista: number; desde: boolean };

/** Las prendas que el cliente NO lleva (su «✕» en «Tu look»), por el id de la prenda: siguen en la figura, pero no cuentan en el total ni van
 *  a la bolsa. Por id y no por zona: si cambia la prenda de esa zona, la nueva entra sola; si vuelve la de antes, vuelve como la dejó. */
export type SinLlevar = ReadonlySet<string>;

/** Lo que cuesta el look completo: la suma de lo que se paga por cada prenda en su color (con «Desde» si alguna lo lleva). Sin las
 *  que el cliente no lleva (`sin`). */
export function totales(look: Look, indice: ReadonlyMap<string, PrendaDelProbador>, sin?: SinLlevar): Totales {
  return presentes(look).reduce<Totales>(
    (t, z) => {
      const pieza = look[z]!;
      if (sin?.has(pieza.id)) return t;
      const p = indice.get(pieza.id);
      if (!p) return t;
      const c = colorDeLaPieza(p, pieza);
      return { cuantas: t.cuantas + 1, final: t.final + c.precioFinal, lista: t.lista + c.precio, desde: t.desde || c.desde };
    },
    { cuantas: 0, final: 0, lista: 0, desde: false },
  );
}

/** Lo que dice la fila «Algo encima»: qué hay en esa zona («un chaleco o un blazer»), de las categorías que hay en el probador. */
export function ayudaDeZona(prendas: readonly PrendaDelProbador[], zona: Zona): string | null {
  const nombres = [...new Set(deLaZona(prendas, zona).flatMap((p) => (p.categoria ? [p.categoria.toLocaleLowerCase("es")] : [])))];
  const lista = nombres.slice(0, 3);
  if (lista.length === 0) return null;
  return lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(", ")} o ${lista[lista.length - 1]}`;
}

/* =============================================== 4b. Tallas y a la bolsa (actividad 6) =============================================== */

/** Una prenda del look para pedir sus tallas: el modelo y su color. */
export type PiezaParaTallas = { id: string; color: string };
/** Lo que responde la tienda: las tallas de cada prenda en su color (las que la ficha ofrece en esa tienda; `hay`, en alguna de la web). */
export type TallasDeTuLook = { id: string; color: string; tallas: TallaLook[] }[];

const esquemaPiezas = z
  .array(z.object({ id: z.string().uuid(), color: z.string().regex(/^[A-Za-z0-9]{1,12}$/) }))
  .min(1)
  .max(4);

/** Lo que llega del navegador para pedir las tallas: de 1 a 4 prendas (lo que cabe en un look), cada una su modelo y su color. Lo
 *  demás, `null`: no se lee nada. */
export function piezasParaLasTallas(dato: unknown): PiezaParaTallas[] | null {
  const r = esquemaPiezas.safeParse(dato);
  return r.success ? r.data.map((p) => ({ id: p.id, color: p.color.toUpperCase() })) : null;
}

/** Las prendas puestas, para pedir sus tallas, en el orden de las zonas. Sin las que el cliente no lleva (`sin`): la bolsa solo recibe lo
 *  que lleva. */
export function piezasDelLook(look: Look, sin?: SinLlevar): PiezaParaTallas[] {
  return presentes(look)
    .filter((z) => !sin?.has(look[z]!.id))
    .map((z) => ({ id: look[z]!.id, color: look[z]!.color }));
}

/** Lo que dice el botón de la bolsa de «Tu look»: cuántas prendas se agregan, no «todo» (Felipe 2026-10-19: con una prenda sin llevar,
 *  «Agregar a mi bolsa» daba a entender que se agregaba todo). Sin ninguna que llevar, se apaga y dice qué hacer. */
export function textoAgregarAlLook(llevo: number): { texto: string; apagado: boolean } {
  if (llevo <= 0) return { texto: "Elige qué llevar", apagado: true };
  return { texto: `Agregar ${llevo} ${llevo === 1 ? "prenda" : "prendas"} a mi bolsa`, apagado: false };
}

/**
 * El look del probador como la hoja de tallas de los looks (`AgregarLook`) lo dibuja: cada prenda en su color, con su recorte, lo que
 * vale ese color y sus tallas. La hoja y la bolsa son las mismas de «Arma tu look» (ADR-0434): una sola forma de llevar un look a la bolsa.
 */
export function lookParaLaHoja(look: Look, indice: ReadonlyMap<string, PrendaDelProbador>, tallas: TallasDeTuLook, sin?: SinLlevar): LookDeCayla {
  const t = totales(look, indice, sin);
  return {
    id: "tu-look",
    nombre: "Una talla por prenda",
    frase: null,
    numero: 1,
    de: 1,
    total: t.lista,
    totalFinal: t.final,
    desde: t.desde,
    piezas: presentes(look).filter((z) => !sin?.has(look[z]!.id)).flatMap((z, i) => {
      const pieza = look[z]!;
      const p = indice.get(pieza.id);
      if (!p) return [];
      const c = colorDeLaPieza(p, pieza);
      return [
        {
          posicion: i + 1,
          x: 0,
          y: 0,
          ancho: 0,
          giro: 0,
          prenda: { id: p.id, nombre: p.nombre, categoria: null, empresa: null, precio: c.precio, precioFinal: c.precioFinal, desde: c.desde, campana: null },
          color: { codigo: c.codigo, nombre: c.nombre, hex: c.hex },
          foto: c.foto.url,
          tallas: tallas.find((x) => x.id === p.id && x.color === c.codigo)?.tallas ?? [],
        },
      ];
    }),
  };
}

/* =============================================== 5. El look en la dirección =============================================== */

/** El parámetro de la dirección con el look (`?p=`). */
export const PARAMETRO_DEL_LOOK = "p";

/**
 * La búsqueda de la dirección (`?sede=trujillo&p=…`) con el look `codigo` (o sin él, si viene vacío), y lo demás como estaba. El look
 * va con `encodeURIComponent`, que deja los «~» y los «.» tal cual: un enlace que se comparte se lee (`URLSearchParams` los cambiaría
 * por «%7E»).
 */
export function busquedaConLook(busqueda: string, codigo: string | null): string {
  const q = new URLSearchParams(busqueda);
  q.delete(PARAMETRO_DEL_LOOK);
  const resto = q.toString();
  const look = codigo ? `${PARAMETRO_DEL_LOOK}=${encodeURIComponent(codigo)}` : "";
  const texto = [resto, look].filter(Boolean).join("&");
  return texto ? `?${texto}` : "";
}

/** El probador en una tienda (`?sede=`, la clave de `claveDeSede`; null: «Todas»), con el look `codigo` si lo hay. */
export function hrefDelProbador(sede: string | null, codigo: string | null = null): string {
  return `/looks/arma${busquedaConLook(sede ? `sede=${encodeURIComponent(sede)}` : "", codigo)}`;
}

/**
 * `TOP-0053.RPA~PAN-0012.CAM`: cada prenda puesta (por su código; sin código, por su id) y su color, en el orden de las zonas. Es lo
 * que se comparte (actividad 9) y con lo que se vuelve al mismo look.
 */
export function codificarLook(look: Look, indice: ReadonlyMap<string, PrendaDelProbador>): string {
  return presentes(look)
    .map((z) => {
      const pieza = look[z]!;
      return `${indice.get(pieza.id)?.codigo ?? pieza.id}.${pieza.color}`;
    })
    .join("~");
}

/**
 * El look de la dirección: cada `código.color` que sigue en el probador (por código, sin importar mayúsculas, o por id), puesto en
 * orden con las reglas de `poner` (un vestido saca lo de arriba y abajo). Lo que ya no está se salta; un color que ya no tiene, el
 * inicial. null si no queda nada (abre con el look inicial).
 */
export function lookDeLaUrl(valor: string | string[] | undefined, prendas: readonly PrendaDelProbador[]): Look | null {
  const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  if (!texto) return null;
  let look = LOOK_VACIO;
  let memoria: Memoria = { arriba: null, abajo: null };
  for (const parte of texto.split("~").slice(0, ZONAS.length + 2)) {
    const punto = parte.lastIndexOf(".");
    const clave = (punto > 0 ? parte.slice(0, punto) : parte).trim().toLocaleUpperCase("es");
    const color = punto > 0 ? parte.slice(punto + 1).trim().toLocaleUpperCase("es") : "";
    const p = prendas.find((x) => x.codigo?.toLocaleUpperCase("es") === clave || x.id.toLocaleUpperCase("es") === clave);
    if (!p) continue;
    const puesto = poner(look, memoria, p, p.colores.find((c) => c.codigo === color)?.codigo ?? colorInicial(p).codigo);
    look = puesto.look;
    memoria = puesto.memoria;
  }
  return presentes(look).length > 0 ? look : null;
}

/* =============================================== 6. La figura =============================================== */

/** La escena del celular, en px del lienzo: se dibuja en % de su ancho y su alto, así se acomoda a cualquier pantalla. */
export const ESCENA = { ancho: 390, alto: 420 } as const;
const CX = 195;
const HOMBROS = 46;
const CINTURA = 152;
/** La escala de la figura del celular (ADR-0434). */
export const PX_POR_CM = 2.5;
/** Cuánto gira cada zona (grados) y en qué capa va (más alto, más adelante). */
export const GIRO: Record<Zona, number> = { arriba: -1.2, vestido: 0.6, abajo: 0.8, encima: -1, bolso: 7 };
export const CAPA: Record<Zona, number> = { abajo: 2, arriba: 3, vestido: 3, encima: 4, bolso: 5 };

export type Caja = { x: number; y: number; w: number; h: number };

/** Dónde va una prenda y de qué tamaño: su largo a 2,5 px por cm, su ancho por la proporción del recorte, desde su línea. */
export function cajaDe(zona: Zona, largo: number, proporcion: number): Caja {
  const h = Math.round(largo * PX_POR_CM);
  const w = Math.round(h * proporcion);
  if (zona === "bolso") return { x: CX + 34, y: CINTURA + 26, w, h };
  const y = zona === "vestido" ? HOMBROS : zona === "abajo" ? CINTURA : zona === "encima" ? HOMBROS - 6 : HOMBROS - 2;
  return { x: Math.round(CX - w / 2), y, w, h };
}

/** Si lo más largo no cabe (un pantalón de más de 104 cm), toda la figura se achica igual: las prendas siguen a escala entre ellas. */
export function escalaDe(cajas: readonly Caja[]): number {
  const fondo = Math.max(0, ...cajas.map((c) => c.y + c.h));
  return fondo > ESCENA.alto - 8 ? (ESCENA.alto - 8) / fondo : 1;
}

/** Una caja achicada por `k` desde el centro de los hombros (los hombros no se mueven de lado). */
export function achicar(c: Caja, k: number): Caja {
  if (k === 1) return c;
  return { x: Math.round(CX + (c.x - CX) * k), y: Math.round(c.y * k), w: Math.round(c.w * k), h: Math.round(c.h * k) };
}

/** La que asoma a un lado: al 62 % y a 172 px del centro, a la altura de la elegida. */
export function cajaVecina(c: Caja, lado: -1 | 1): Caja {
  const w = Math.round(c.w * 0.62);
  const h = Math.round(c.h * 0.62);
  return { x: Math.round(CX + lado * 172 - w / 2), y: Math.round(c.y + c.h / 2 - h / 2), w, h };
}

/** El punto con el número de cada prenda, en su esquina (los del lienzo). */
export function puntoDe(zona: Zona, c: Caja): { x: number; y: number } {
  if (zona === "vestido") return { x: c.x + c.w - 10, y: c.y + 22 };
  if (zona === "abajo") return { x: c.x + 8, y: c.y + Math.round(c.h * 0.42) };
  if (zona === "encima") return { x: c.x + 14, y: c.y + 16 };
  if (zona === "bolso") return { x: c.x + c.w - 12, y: c.y + 10 };
  return { x: c.x + c.w - 14, y: c.y + 14 };
}

/** Una medida del lienzo como % del ancho o del alto de la escena. */
export const enAncho = (px: number): string => `${((px / ESCENA.ancho) * 100).toFixed(3)}%`;
export const enAlto = (px: number): string => `${((px / ESCENA.alto) * 100).toFixed(3)}%`;
