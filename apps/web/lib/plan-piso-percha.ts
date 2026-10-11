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
import { cifraEs } from "./mix-piso-visual";

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
  if (p > 0 && llenas === 0 && resto === 0) resto = MINIMO_VISIBLE;
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

export type Libres = { libres: number; deMas: number };

/** Lo que queda libre del riel y, si cuelga más de lo que cabe, cuánto de más (nunca los dos a la vez). */
export function libresDelRiel(capacidad: number, colgadas: number): Libres {
  const c = Math.max(0, colgadas);
  return capacidad >= c ? { libres: capacidad - c, deMas: 0 } : { libres: 0, deMas: c - capacidad };
}

// ── Las frases, en palabras de tienda ─────────────────────────────────────────────────────────────────────────────────────

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
  const desc = descripcionDelLlenado(pct);
  return e.cuadrado
    ? { antes: `Tu riel está ${desc} (`, destacado: PCT(pct), despues: ").", aclaracion: null }
    : { antes: `Tu riel estaría ${desc} (`, destacado: PCT(pct), despues: ").", aclaracion: aclaracionSinCuadrar };
}

/** El sobretítulo de la cifra grande. */
export const etiquetaDeCifra = (cuadrado: boolean) => (cuadrado ? "Hoy cuelgan" : "Según el sistema, hoy cuelgan");

/** El subtítulo del riel de hoy. */
export function subtituloDeHoy(e: { colgadas: number; capacidad: number; cuadrado: boolean }): string {
  const pct = e.capacidad > 0 ? Math.round((e.colgadas / e.capacidad) * 100) : 0;
  return e.cuadrado ? `${PCT(pct)} del riel` : `según el sistema · ${PCT(pct)} del riel`;
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

/** La línea que cambia al pasar por un grupo. */
export function leyendaDeGrupo(g: { nombre: string; hoy: number; propuesta: number; propuestaPct: number | null }): { nombre: string; resto: string } {
  return { nombre: g.nombre, resto: ` · hoy ${n(g.hoy)} → quedaría ${n(g.propuesta)}${g.propuestaPct === null ? "" : ` (${PCT(g.propuestaPct)})`}` };
}

/** El botón que abre «cómo se calcula»: dice cuánto cuentan las ventas de la sede, sin la palabra «peso». */
export function textoDelPorQue(e: { ventasConfirmadas: number; pesoPct: number }): string {
  if (e.ventasConfirmadas <= 0) return "Todavía sin ventas confirmadas · ¿Por qué?";
  const ventas = e.ventasConfirmadas === 1 ? "tu venta" : `tus ${n(e.ventasConfirmadas)} ventas`;
  return `${e.pesoPct < 15 ? "Casi no usa" : "Usa"} ${ventas} (${PCT(e.pesoPct)}) · ¿Por qué?`;
}

// ── «Cómo se calcula», en palabras ────────────────────────────────────────────────────────────────────────────────────────

export type FilaDelPorQue = { clave: string; nombre: string; propuestaPct: number | null; habitualPct: number | null; ventaPct: number | null; ventas: number };
export type PanelDelPorQue = { parrafos: string[]; filas: FilaDelPorQue[] };

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

  if (capacidad !== null) {
    parrafos.push(`Cada grupo se lleva una parte de los ${n(capacidad)} lugares del riel. Esa parte mezcla dos cosas: lo que suele funcionar en tiendas de ropa (${PCT(100 - pesoPct)}) y lo que vendiste tú (${PCT(pesoPct)}).`);
  } else {
    parrafos.push(`Cada grupo se lleva una parte del riel. Esa parte mezcla dos cosas: lo que suele funcionar en tiendas de ropa (${PCT(100 - pesoPct)}) y lo que vendiste tú (${PCT(pesoPct)}).`);
  }

  // Un grupo con 2 ventas o más y su rango, para que se vea por qué «casi no sabemos».
  const ejemplo = p.enRiel.find((f) => f.ventasConfirmadas >= 2 && f.rangoDeVenta !== null && f.ventaPct !== null);
  const ventasDichas = confirmadas === 0 ? "todavía no hay ventas confirmadas" : `${pesoPct < 15 ? "solo " : ""}hay ${n(confirmadas)} ${confirmadas === 1 ? "venta confirmada" : "ventas confirmadas"}`;
  let p2 = `Tus ventas pesan ${pesoPct < 15 ? "poco" : "bastante"} porque ${ventasDichas} en ${n(p.dias)} días.`;
  if (sinRegistrar > 0) p2 += ` ${sinRegistrar === 1 ? "La venta sin registrar todavía no cuenta" : `Las ${n(sinRegistrar)} ventas sin registrar todavía no cuentan`}.`;
  if (ejemplo && ejemplo.rangoDeVenta && ejemplo.ventaPct !== null) {
    p2 += ` Con ${ejemplo.ventasConfirmadas} ventas, «${ejemplo.grupo.nombre}» saldría ${PCT(ejemplo.ventaPct)}, pero podría ser desde ${n(ejemplo.rangoDeVenta.desde)} hasta ${PCT(ejemplo.rangoDeVenta.hasta)}: casi no sabemos.`;
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
    habitualPct: f.partidaPct,
    ventaPct: f.ventaPct,
    ventas: f.ventasConfirmadas,
  }));
  return { parrafos, filas };
}

/** Una fila del «Cómo salió cada grupo»: «lo habitual 44 % · tus ventas 40 % (2 ventas)». */
export function detalleDeFila(f: FilaDelPorQue): string {
  const habitual = f.habitualPct === null ? null : `lo habitual ${PCT(f.habitualPct)}`;
  const ventas = f.ventaPct === null ? "tus ventas: todavía ninguna" : `tus ventas ${PCT(f.ventaPct)} (${f.ventas} ${f.ventas === 1 ? "venta" : "ventas"})`;
  return [habitual, ventas].filter(Boolean).join(" · ");
}
