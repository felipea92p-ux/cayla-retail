/**
 * El riel de PERCHAS (Plan del piso ▸ Propuesta, maqueta A «La percha», elegida por Felipe el 2026-10-11; ADR-0352, actualización 2026-10-11).
 *
 * Un pictograma: cada percha dibujada vale una cantidad fija de prendas, para que un riel de 1,800 lugares no sea una pared de 1,800 contornos
 * iguales (lo que tapaba la respuesta en la versión de barras de ADR-0352 (b), y en la de canvas, antes). Aquí vive lo que se puede probar sin pintar:
 * cuántas perchas le tocan a cada grupo, con qué unidad, y las frases en palabras de tienda. Los componentes (`TarjetaDelRiel`, `PropuestaDelMix`)
 * solo dibujan lo que esto dice; los cálculos del reparto siguen en `lib/mix-piso.ts`.
 *
 * LÓGICA PURA: sin red ni React.
 */
import type { FilaDelRiel, PropuestaMix } from "./mix-piso";
import { cifraEs, prendasEs } from "./mix-piso-visual";
import { coloresDeLasPerchas, textoDeColores, type ColorDelGrupo, type ColorDePercha } from "./plan-piso-colores";

const n = cifraEs;
/** Espacio duro: «4 %» no se parte en dos renglones. */
const PCT = (x: number) => `${n(x)} %`;

// ── La unidad de una percha ───────────────────────────────────────────────────────────────────────────────────────────────

/** Cuánto vale una percha, de menor a mayor. Todas son cuentas que una persona de tienda hace de cabeza. */
export const UNIDADES_DE_PERCHA = [5, 10, 20, 25, 50, 100] as const;
/** Cuántas perchas como máximo tiene el riel entero: más que eso es una pared de perchas y no se lee. */
export const MAX_PERCHAS = 40;

/**
 * La unidad que le toca a una sede: la MENOR de `UNIDADES_DE_PERCHA` con la que el riel entero cabe en `MAX_PERCHAS` perchas.
 * AQP (1,800) → 50 (36 perchas); TRU (600) → 20 (30); LIM (180) → 5 (36). Una capacidad enorme usa la mayor; una que no es cuenta, 50.
 */
export function unidadDePercha(capacidad: number): number {
  if (!(capacidad > 0) || !Number.isFinite(capacidad)) return 50;
  return UNIDADES_DE_PERCHA.find((u) => capacidad / u <= MAX_PERCHAS) ?? UNIDADES_DE_PERCHA[UNIDADES_DE_PERCHA.length - 1]!;
}

/** Cuando un grupo tiene prendas pero menos de una percha entera, la última (angosta) nunca baja de esta fracción: así se ve. */
export const MINIMO_VISIBLE = 0.1;
/** Una percha parcial más angosta que esto no se dibuja (es ruido); salvo que sea lo único que tiene el grupo. */
const MINIMO_DE_PARCIAL = 0.05;

export type Perchas = {
  /** Cuántas perchas (con decimales) vale `prendas`: es el ancho del tramo en el riel. */
  perchas: number;
  /** Perchas enteras. */
  llenas: number;
  /** La percha angosta que sigue, de 0 a 1 de ancho; 0 si no hay. */
  resto: number;
};

/** Las perchas de un grupo: enteras y, si sobra, una angosta proporcional. Lo que no es una cuenta (NaN, negativo) es cero. */
export function perchasDe(prendas: number, unidad: number): Perchas {
  const p = Number.isFinite(prendas) && prendas > 0 ? prendas : 0;
  const perchas = p / unidad;
  const llenas = Math.floor(perchas + 1e-9);
  let resto = perchas - llenas;
  if (resto < MINIMO_DE_PARCIAL) resto = 0;
  // Un grupo con menos de una percha entera nunca baja de `MINIMO_VISIBLE`: así 1, 2 o 3 prendas no dibujan un tramo MÁS ancho que 6 (revisión 2026-10-11).
  if (p > 0 && llenas === 0 && resto < MINIMO_VISIBLE) resto = MINIMO_VISIBLE;
  return { perchas, llenas, resto };
}

/**
 * Contra qué se miden los dos rieles (en perchas): la mayor de la capacidad y lo que suma cada uno. Si hoy cuelga más de lo que cabe, «Hoy» y
 * «Cómo quedaría» siguen midiendo lo mismo (cada uno contra lo suyo los hacía parecer iguales: ADR-0352 (b)).
 */
export function escalaEnPerchas(capacidad: number, sumas: readonly number[], unidad: number): number {
  const mayor = Math.max(capacidad > 0 ? capacidad : 0, ...sumas.map((s) => (Number.isFinite(s) && s > 0 ? s : 0)));
  return mayor / unidad;
}

export type GrupoParaElRiel = {
  clave: string;
  nombre: string;
  hoy: number;
  propuesta: number;
  /** De qué colores es lo que cuelga hoy (`FilaDelRiel.colores`): con ellos cada percha toma su color (ADR-0352, act. 2026-10-11 (c)). Sin ellos, el color del grupo. */
  colores?: readonly ColorDelGrupo[];
};
/** Un tramo del riel: las perchas de UN grupo, una junto a otra. */
export type BloqueDelRiel = Perchas & {
  clave: string;
  /** La posición del grupo en la lista del riel: de ahí sale su color. */
  indice: number;
  prendas: number;
  /** El color de cada percha, de izquierda a derecha (las enteras y, al final, la angosta). `null` = se dibuja del color del grupo. */
  colores: (ColorDePercha | null)[];
  /** Lo que dice el tramo al pasar por él: «Negro 60 · Blanco 48 …». Vacío en la propuesta, que no sabe de colores (`NOTA_DE_COLORES`). */
  detalleDeColores: string;
};
export type Rieles = {
  unidad: number;
  /** Cuántas perchas mide el riel entero (la escala de los dos). */
  escala: number;
  /** Las perchas del tramo más largo de los dos rieles (al menos 1): el CSS achica la percha si ese tramo no cabe en una fila (celular). */
  mayor: number;
  hoy: BloqueDelRiel[];
  propuesta: BloqueDelRiel[];
};

/**
 * Los dos rieles de una sede, listos para dibujar. Cada tramo conserva la posición de su grupo (su color) aunque otros no tengan prendas: un
 * grupo con cero en un riel no dibuja un poste solo (queda en la leyenda). Los dos rieles se miden contra la misma escala.
 */
export function armarRieles(grupos: readonly GrupoParaElRiel[], capacidad: number): Rieles {
  const unidad = unidadDePercha(capacidad);
  const suma = (valor: (g: GrupoParaElRiel) => number) => grupos.reduce((s, g) => s + (Number.isFinite(valor(g)) && valor(g) > 0 ? valor(g) : 0), 0);
  const bloques = (valor: (g: GrupoParaElRiel) => number, conDetalle: boolean): BloqueDelRiel[] =>
    grupos.flatMap((g, indice) => {
      const prendas = Number.isFinite(valor(g)) && valor(g) > 0 ? valor(g) : 0;
      if (prendas === 0) return [];
      const perchas = perchasDe(prendas, unidad);
      // Los dos rieles pintan cada grupo con la mezcla de colores de HOY: la propuesta reparte lugares, no elige colores.
      return [{ clave: g.clave, indice, prendas, ...perchas, colores: coloresDeLasPerchas(g.colores ?? [], perchas.llenas, perchas.resto), detalleDeColores: conDetalle ? textoDeColores(g.colores ?? []) : "" }];
    });
  const hoy = bloques((g) => g.hoy, true);
  const propuesta = bloques((g) => g.propuesta, false);
  return {
    unidad,
    escala: escalaEnPerchas(capacidad, [suma((g) => g.hoy), suma((g) => g.propuesta)], unidad),
    mayor: Math.max(1, ...hoy.map((b) => b.perchas), ...propuesta.map((b) => b.perchas)),
    hoy,
    propuesta,
  };
}

/** Un tramo de menos de esto (en perchas) no lleva rótulo: su nombre no cabe y se vería cortado. Su nombre sigue en la leyenda, en el `title` y en el aria. */
export const MIN_PERCHAS_PARA_ROTULO = 1.6;
export const rotuloCabe = (perchas: number): boolean => perchas >= MIN_PERCHAS_PARA_ROTULO;

/** El nombre corto de un grupo, para rotular su tramo: lo que va antes de la primera coma o de «y» («Polos, tops y blusas» → «Polos»). */
export function nombreCorto(nombre: string): string {
  const corto = nombre.split(/,| y /)[0]!.trim();
  return corto === "" ? nombre.trim() : corto;
}

export type Libres = { libres: number; deMas: number };

/** Lo que queda libre del riel y, si cuelga más de lo que cabe, cuánto de más (nunca los dos a la vez). */
export function libresDelRiel(capacidad: number, colgadas: number): Libres {
  const c = Math.max(0, colgadas);
  return capacidad >= c ? { libres: capacidad - c, deMas: 0 } : { libres: 0, deMas: c - capacidad };
}

// ── Las frases, en palabras de tienda ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto del riel está ocupado, como se lee: «4 %», y «menos de 1 %» si hay prendas pero el redondeo daría 0 (un 0 diría «no cuelga nada»).
 * Siempre es lo OCUPADO, nunca lo libre.
 */
export function ocupadoEs(colgadas: number, capacidad: number): string {
  if (!(capacidad > 0) || !(colgadas > 0)) return PCT(0);
  const pct = Math.round((colgadas / capacidad) * 100);
  return pct === 0 ? "menos de 1\u00a0%" : PCT(pct);
}

/** Cómo se llama un llenado, de menos a más. El corte es criterio de lenguaje, no una regla de negocio. */
export function descripcionDelLlenado(pct: number): string {
  if (pct < 10) return "casi vacío";
  if (pct < 35) return "con mucho lugar libre";
  if (pct < 65) return "a medio llenar";
  if (pct < 90) return "bastante lleno";
  return "casi lleno";
}

export type FraseDeEstado = {
  /** La frase se arma «antes + [destacado] + después»: lo destacado va en negrita. */
  antes: string;
  destacado: string;
  despues: string;
  /** Lo que la sede todavía no sabe, si hay algo (sin cuadrar). */
  aclaracion: string | null;
};

/**
 * La frase bajo «78 de 1,800»: qué tan lleno está el riel. Mientras la sede no cuadró su piso, las prendas son lo que el sistema CREE que cuelga y la
 * frase lo dice en condicional («estaría»), nunca como un hecho (Formidable 2026-10-10: las tres direcciones nuevas lo afirmaban y era falso).
 */
export function fraseDeEstado(e: { colgadas: number; capacidad: number; cuadrado: boolean }): FraseDeEstado {
  const aclaracionSinCuadrar = "Falta contar tu piso: lo que cuelga de verdad puede ser mucho más.";
  const { deMas } = libresDelRiel(e.capacidad, e.colgadas);
  if (deMas > 0) {
    return e.cuadrado
      ? { antes: "Cuelgan ", destacado: `${n(deMas)} ${deMas === 1 ? "prenda más" : "prendas más"}`, despues: " de las que caben en el riel.", aclaracion: "Revisa la capacidad del riel." }
      : { antes: "Según el sistema cuelgan ", destacado: `${n(deMas)} ${deMas === 1 ? "prenda más" : "prendas más"}`, despues: " de las que caben en el riel.", aclaracion: "Cuadra tu piso y revisa la capacidad." };
  }
  const pct = e.capacidad > 0 ? Math.round((e.colgadas / e.capacidad) * 100) : 0;
  // Lleno de verdad (ni una prenda más ni menos) no es «casi lleno»; y el número entre paréntesis dice «ocupado»: junto a «lugar libre» se leía como lo libre (revisión 2026-10-11).
  const desc = e.capacidad > 0 && e.colgadas === e.capacidad ? "lleno" : descripcionDelLlenado(pct);
  const destacado = ocupadoEs(e.colgadas, e.capacidad);
  return e.cuadrado
    ? { antes: `Tu riel está ${desc} (`, destacado, despues: " ocupado).", aclaracion: null }
    : { antes: `Tu riel estaría ${desc} (`, destacado, despues: " ocupado).", aclaracion: aclaracionSinCuadrar };
}

/** Lo que cuelga de categorías «sin grupo»: no entra en la cuenta del riel y la persona tiene que saberlo (revisión 2026-10-11). */
export function notaDeSinGrupo(colgadas: number): string | null {
  if (!(colgadas > 0)) return null;
  return `No cuenta ${prendasEs(colgadas)} de categorías sin grupo: no se sabe si cuelgan en el riel.`;
}

/** El sobretítulo de la cifra grande. */
export const etiquetaDeCifra = (cuadrado: boolean) => (cuadrado ? "Hoy cuelgan" : "Según el sistema, hoy cuelgan");

/** El subtítulo del riel de hoy. */
export function subtituloDeHoy(e: { colgadas: number; capacidad: number; cuadrado: boolean }): string {
  const ocupado = ocupadoEs(e.colgadas, e.capacidad);
  return e.cuadrado ? `${ocupado} del riel` : `según el sistema · ${ocupado} del riel`;
}

/** El subtítulo del riel de la propuesta. */
export const subtituloDeLaPropuesta = (repartidas: number, provisional: boolean) => `así se repartirían tus ${n(repartidas)} lugares${provisional ? " (provisional)" : ""}`;

export type Libre = { cifra: string; etiqueta: string; nota: string };

/** El bloque de riel vacío al final de «Hoy»: lo libre, dicho con su cifra, o lo que sobra si no cabe. */
export function bloqueLibre(e: { capacidad: number; colgadas: number; cuadrado: boolean }): Libre {
  const { libres, deMas } = libresDelRiel(e.capacidad, e.colgadas);
  if (deMas > 0) return { cifra: n(deMas), etiqueta: deMas === 1 ? "prenda de más" : "prendas de más", nota: "no caben en el riel" };
  if (libres === 0) return { cifra: "0", etiqueta: "lugares libres", nota: "el riel está lleno" };
  return { cifra: n(libres), etiqueta: libres === 1 ? "lugar libre" : "lugares libres", nota: e.cuadrado ? "cabe más ropa" : "según el sistema · falta contar tu piso" };
}

/** La nota de abajo, que explica la escala. */
export const notaDeEscala = (unidad: number) => ({ antes: "Cada percha = ", unidad: String(unidad), despues: ` prendas. Una percha angosta es menos de ${unidad}.` });

/**
 * La línea que cambia al pasar por un grupo. Sin cuadrar, «hoy» es lo que el sistema CREE y se dice así, sin flecha: la flecha insinuaría una diferencia
 * («faltan 166») que la tabla de abajo se niega a dar (revisión 2026-10-11).
 */
export function leyendaDeGrupo(g: { nombre: string; hoy: number; propuesta: number; propuestaPct: number | null }, cuadrado: boolean): { nombre: string; resto: string } {
  const queda = `quedaría ${n(g.propuesta)}${g.propuestaPct === null ? "" : ` (${PCT(g.propuestaPct)})`}`;
  return { nombre: g.nombre, resto: cuadrado ? ` · hoy ${n(g.hoy)} → ${queda}` : ` · según el sistema hoy ${n(g.hoy)}, ${queda}` };
}

/**
 * El nombre que oye quien usa lector de pantalla en cada ficha de «Hoy»: empieza por lo que se lee en el botón («Polos, tops y blusas 30», el nombre completo del
 * grupo, no el corto: Felipe 2026-10-11) y trae lo que la ficha de abajo dice.
 */
export function etiquetaDeChipHoy(g: { nombre: string; hoy: number; propuesta: number; propuestaPct: number | null }, cuadrado: boolean): string {
  const propuesta = g.propuestaPct === null ? "sin propuesta" : `propuesta ${n(g.propuesta)}`;
  return `${g.nombre} ${n(g.hoy)}: ${prendasEs(g.hoy)} hoy${cuadrado ? "" : " según el sistema"}; ${propuesta}`;
}

/** El nombre de la lista de fichas de «Hoy». */
export const ariaDeLasFichasDeHoy = (cuadrado: boolean): string => (cuadrado ? "Prendas de hoy por grupo" : "Prendas de hoy por grupo, según el sistema (falta contar el piso)");

/**
 * El botón que abre «cómo se calcula»: dice cuánto cuentan las ventas de la sede, sin la palabra «peso». Las ventas sin registrar no cuentan y se dicen
 * aquí, porque son la razón por la que una sede con 215 ventas «casi no usa» sus ventas (revisión 2026-10-11).
 */
export function textoDelPorQue(e: { ventasConfirmadas: number; pesoPct: number; ventasSinRegistrar?: number }): string {
  const sin = e.ventasSinRegistrar ?? 0;
  const faltan = sin > 0 ? `: faltan registrar ${n(sin)}` : "";
  if (e.ventasConfirmadas <= 0) return `Todavía sin ventas confirmadas${faltan ? ` (faltan registrar ${n(sin)})` : ""} · ¿Por qué?`;
  const ventas = e.ventasConfirmadas === 1 ? "tu venta" : `tus ${n(e.ventasConfirmadas)} ventas`;
  const confirmadas = sin > 0 ? (e.ventasConfirmadas === 1 ? " confirmada" : " confirmadas") : "";
  return `${e.pesoPct < 15 ? "Casi no usa" : "Usa"} ${ventas}${confirmadas} (${PCT(e.pesoPct)})${faltan} · ¿Por qué?`;
}

/** Lo que oye quien usa lector de pantalla del riel de hoy (el dibujo es una imagen: aquí van las mismas cifras en texto). */
export function ariaDeHoy(e: { colgadas: number; capacidad: number; cuadrado: boolean }): string {
  const { libres, deMas } = libresDelRiel(e.capacidad, e.colgadas);
  const cuanto = deMas > 0 ? `${n(deMas)} de más` : `${n(libres)} libres`;
  return `Hoy${e.cuadrado ? "" : ", según el sistema"}: ${n(e.colgadas)} de ${n(e.capacidad)} lugares ocupados${deMas > 0 ? ", " : " y "}${cuanto}.${e.cuadrado ? "" : " Falta contar el piso."}`;
}

/** Lo mismo para el riel de la propuesta: cuántas prendas se llevaría cada grupo. */
export function ariaDeLaPropuesta(grupos: readonly { nombre: string; propuesta: number }[], capacidad: number): string {
  const conPrendas = grupos.filter((g) => g.propuesta > 0);
  const repartidas = conPrendas.reduce((s, g) => s + g.propuesta, 0);
  return `Cómo quedaría: ${conPrendas.map((g) => `${g.nombre} ${n(g.propuesta)}`).join(", ")}. En total ${n(repartidas)} de ${n(capacidad)} lugares repartidos.`;
}

/**
 * La línea de una ficha de «Fuera del riel»: cuánto cuelga, cuánto se vende y la meta de la sede (o que no lo lleva). El porcentaje de venta va con las
 * ventas en que se apoya, como en la tabla («0 % (3 ventas)»): un 0 sin su muestra diría «no se vende» sin saberlo (ADR-0214, revisión 2026-10-11).
 */
export function lineaDeFicha(f: { colgadas: number; ventaPct: number | null; ventasConfirmadas?: number; meta: { desde: number; hasta: number } | null; noLoLleva: boolean }): string {
  const partes = [prendasEs(f.colgadas)];
  if (f.noLoLleva) return [...partes, "esta sede no lo lleva"].join(" · ");
  if (f.ventaPct !== null) {
    const v = f.ventasConfirmadas;
    partes.push(`vende ${PCT(f.ventaPct)}${v === undefined ? "" : ` (${n(v)} ${v === 1 ? "venta" : "ventas"})`}`);
  }
  if (f.meta) partes.push(`meta ${f.meta.desde}–${f.meta.hasta}\u00a0% de la venta`);
  return partes.join(" · ");
}

// ── «Cómo se calcula», en palabras ────────────────────────────────────────────────────────────────────────────────────────

export type FilaDelPorQue = { clave: string; nombre: string; propuestaPct: number | null; partidaPct: number | null; ventaPct: number | null; ventas: number };
export type PanelDelPorQue = { parrafos: string[]; filas: FilaDelPorQue[] };

/** El punto de partida, en palabras de tienda y con su fuente a la vista (no «industria» ni «lo que suele funcionar»: es el surtido de otras tiendas, no su venta). */
const PUNTO_DE_PARTIDA = "lo que ofrecen Topitop, Estilos y Oechsle en ropa de mujer, ajustado al clima de tu sede";

/**
 * Qué tan ancho es el rango de una venta (en puntos) y qué se dice de él: ≥ 40 «casi no sabemos», de 20 a 40 «ya hay una idea», menos, nada. Antes la cola
 * «casi no sabemos» salía siempre y se contradecía con una venta bien medida.
 */
function colaDelRango(desde: number, hasta: number): string {
  const ancho = hasta - desde;
  if (ancho >= 40) return ": casi no sabemos.";
  if (ancho >= 20) return ": ya hay una idea, aunque podría variar.";
  return ".";
}

/**
 * El panel de «¿Por qué?»: de dónde sale la propuesta, en tres párrafos y una fila por grupo, sin «industria», «peso», «muestra efectiva» ni «Wilson»
 * (Formidable, ley 4). Los números salen de la propuesta; las palabras, de aquí.
 */
export function panelDelPorQue(p: PropuestaMix, provisional: boolean): PanelDelPorQue {
  const capacidad = p.capacidad;
  const pesoPct = Math.round(p.pesoDeLaVenta * 100);
  const confirmadas = p.ventasConfirmadasDelRiel;
  const sinRegistrar = p.ventasAnotadasDelRiel;
  const parrafos: string[] = [];

  const reparte = capacidad !== null ? `Cada grupo se lleva una parte de los ${n(capacidad)} lugares del riel.` : "Cada grupo se lleva una parte del riel.";
  parrafos.push(`${reparte} Esa parte mezcla dos cosas: el punto de partida —${PUNTO_DE_PARTIDA}— (${PCT(100 - pesoPct)}) y lo que vendiste tú (${PCT(pesoPct)}).`);

  // Un grupo con 2 ventas o más y su rango, para que se vea cuánto se sabe de verdad.
  const ejemplo = p.enRiel.find((f) => f.ventasConfirmadas >= 2 && f.rangoDeVenta !== null && f.ventaPct !== null);
  let p2: string;
  if (confirmadas === 0) p2 = `Tus ventas todavía no cuentan: no hay ventas confirmadas en ${n(p.dias)} días.`;
  else p2 = `Tus ventas pesan ${pesoPct < 15 ? "poco" : "bastante"} porque ${pesoPct < 15 ? "solo " : ""}hay ${n(confirmadas)} ${confirmadas === 1 ? "venta confirmada" : "ventas confirmadas"} en ${n(p.dias)} días.`;
  if (sinRegistrar > 0) p2 += ` ${sinRegistrar === 1 ? "La venta sin registrar todavía no cuenta" : `Las ${n(sinRegistrar)} ventas sin registrar todavía no cuentan`}.`;
  if (ejemplo && ejemplo.rangoDeVenta && ejemplo.ventaPct !== null) {
    p2 += ` Con ${ejemplo.ventasConfirmadas} ventas, «${ejemplo.grupo.nombre}» saldría ${PCT(ejemplo.ventaPct)}, pero podría ser desde ${PCT(ejemplo.rangoDeVenta.desde)} hasta ${PCT(ejemplo.rangoDeVenta.hasta)}${colaDelRango(ejemplo.rangoDeVenta.desde, ejemplo.rangoDeVenta.hasta)}`;
  }
  parrafos.push(p2);

  const p3: string[] = [];
  if (provisional && capacidad !== null) p3.push(`Los ${n(capacidad)} lugares son provisionales (falta contar el riel).`);
  if (!p.cuadrado) p3.push(`Las ${n(p.colgadasEnElRiel)} prendas de «Hoy» son lo que el sistema cree que cuelga, no lo que hay de verdad. Por eso, saber qué grupo tiene de más o de menos depende de contar tu piso.`);
  if (p3.length > 0) parrafos.push(p3.join(" "));

  const filas = p.enRiel.map((f: FilaDelRiel) => ({
    clave: f.grupo.clave,
    nombre: f.grupo.nombre,
    propuestaPct: f.propuestaPct,
    partidaPct: f.partidaPct,
    ventaPct: f.ventaPct,
    ventas: f.ventasConfirmadas,
  }));
  return { parrafos, filas };
}

/** Una fila del «Cómo salió cada grupo»: «punto de partida 44 % · tus ventas 40 % (2 ventas)». Los mismos nombres que la tabla y la mancuerna. */
export function detalleDeFila(f: FilaDelPorQue): string {
  const partida = f.partidaPct === null ? null : `punto de partida ${PCT(f.partidaPct)}`;
  const ventas = f.ventaPct === null ? "tus ventas: todavía ninguna" : `tus ventas ${PCT(f.ventaPct)} (${f.ventas} ${f.ventas === 1 ? "venta" : "ventas"})`;
  return [partida, ventas].filter(Boolean).join(" · ");
}
