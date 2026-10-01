/**
 * «Conteos recientes» agrupados por día, con filtro Hoy / Ayer / fecha exacta (Inventario ▸ Conteo, 2026-10-01).
 * Sin red ni React: lo importan la página (servidor) y los componentes, y se prueba en `conteo-recientes-reglas.test.ts`.
 *
 * Contrato — PROMETE: dado el historial de la sede (del más reciente al más antiguo) y el día pedido en la URL (`?dia=`),
 * devuelve qué filas se dibujan, cuántos conteos hubo hoy y ayer, y en qué días hubo conteos (para marcar el calendario).
 * ASUME: `todos` viene de `fn_conteos_resumen` (el abierto primero, después por fecha de apertura descendente) y trae
 * MÁS de lo que se dibuja sin filtro: para llegar a una fecha vieja hay que tenerla en la mano. NO hace: pedir nada a la base.
 *
 * Por qué se agrupa por la fecha de APERTURA (Felipe, 2026-10-01): la pregunta de quien mira es «¿a qué hora se hizo?», y un
 * conteo que se abre a las 11:43 y se cierra a las 11:52 tiene una sola hora. El día es el de Lima (`diaLimaDe`): el servidor
 * corre en UTC y de 7 pm a medianoche ya es «mañana» para él.
 */

import { sumarDias } from "./fechas-lima";
import { LIMITE_HISTORIAL_CONTEO } from "./conteo-inicio-reglas";
import type { ConteoResumen } from "./conteo-reglas";

/**
 * Cuántos conteos pide la página a la base para poder filtrar por día. Una sede hace del orden de 100 conteos al año, así que
 * 300 alcanzan para tres años sin paginar. No cuesta más que pedir 20: `fn_conteos_resumen` suma las líneas de todos los
 * conteos de la sede antes de ordenar y cortar.
 */
export const LIMITE_CONTEOS_FILTRABLES = 300;

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"] as const;

/** `aaaa-mm-dd` de un instante, en hora de Lima. Lima va cinco horas detrás de UTC todo el año (sin horario de verano). */
export function diaLimaDe(instante: string): string {
  return new Date(Date.parse(instante) - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** `hh:mm` de un instante, en hora de Lima. */
export function horaLimaDe(instante: string): string {
  return new Date(Date.parse(instante) - 5 * 3600 * 1000).toISOString().slice(11, 16);
}

/**
 * El día que pide la URL, o `null`. Solo vale una fecha REAL `aaaa-mm-dd` (un `?dia=2026-02-31` o un texto cualquiera se
 * ignora y la pantalla sale en «Todos»: un enlace viejo o mal escrito nunca deja la pantalla en blanco).
 */
export function diaValido(param: string | string[] | undefined): string | null {
  const v = Array.isArray(param) ? param[0] : param;
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const fecha = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === v ? v : null;
}

/** «miércoles 30 de setiembre» (sin año: los conteos recientes son de este año; con otro año, se agrega). */
export function textoDiaLargo(dia: string, hoy?: string): string {
  const f = new Date(`${dia}T00:00:00Z`);
  const base = `${DIAS_SEMANA[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`;
  return hoy && dia.slice(0, 4) !== hoy.slice(0, 4) ? `${base} de ${f.getUTCFullYear()}` : base;
}

/** «Hoy» / «Ayer» / `null`: la palabra que va antes de la fecha en la banda del día. */
export function rotuloDelDia(dia: string, hoy: string): "Hoy" | "Ayer" | null {
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  return null;
}

export type GrupoDia = {
  dia: string;
  rotulo: "Hoy" | "Ayer" | null;
  /** «miércoles 30 de setiembre». */
  titulo: string;
  conteos: ConteoResumen[];
};

/** Junta filas consecutivas del mismo día (Lima), conservando el orden que trae la base. */
export function agruparPorDia(conteos: readonly ConteoResumen[], hoy: string): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  for (const c of conteos) {
    const dia = diaLimaDe(c.creadoEn);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.conteos.push(c);
    else grupos.push({ dia, rotulo: rotuloDelDia(dia, hoy), titulo: textoDiaLargo(dia, hoy), conteos: [c] });
  }
  return grupos;
}

export type VistaRecientes = {
  /** Las filas que se dibujan: los más recientes (sin filtro) o los del día pedido. */
  mostrados: ConteoResumen[];
  /** El día filtrado (`aaaa-mm-dd`), o `null` si se ven los más recientes. */
  dia: string | null;
  hoy: string;
  ayer: string;
  /** Cuántos conteos hubo hoy y ayer (de los que trae la lista), para rotular los botones. */
  deHoy: number;
  deAyer: number;
  /** Los días (Lima) que tienen al menos un conteo, sin repetir: el calendario los marca. */
  diasConConteos: string[];
  /** Para un día sin conteos: el día con conteos inmediatamente anterior y su conteo más reciente (o `null` si no hay ninguno antes). */
  anterior: { dia: string; numero: number } | null;
  /** Cuántos conteos trae «Todos» (el tope de filas sin filtro). */
  tope: number;
};

/**
 * Lo que dibuja «Conteos recientes». Sin `dia`: los `tope` más recientes. Con `dia`: todos los de ese día (puede ser ninguno;
 * entonces `anterior` dice cuál fue el conteo previo, para no dejar a la persona en un callejón).
 */
export function vistaDeRecientes(todos: readonly ConteoResumen[], hoy: string, dia: string | null, tope: number = LIMITE_HISTORIAL_CONTEO): VistaRecientes {
  const ayer = sumarDias(hoy, -1);
  const dias = todos.map((c) => diaLimaDe(c.creadoEn));
  const mostrados = dia === null ? todos.slice(0, tope) : todos.filter((_, i) => dias[i] === dia);
  let anterior: VistaRecientes["anterior"] = null;
  if (dia !== null && mostrados.length === 0) {
    const i = dias.findIndex((d) => d < dia);
    if (i >= 0) anterior = { dia: dias[i], numero: todos[i].numero };
  }
  return {
    mostrados: [...mostrados],
    dia,
    hoy,
    ayer,
    deHoy: dias.filter((d) => d === hoy).length,
    deAyer: dias.filter((d) => d === ayer).length,
    diasConConteos: [...new Set(dias)],
    anterior,
    tope,
  };
}

/** La frase al pie de la lista: dice qué se está viendo y cómo ver otra cosa. */
export function textoPieRecientes(v: Pick<VistaRecientes, "dia" | "hoy" | "tope" | "mostrados">): string {
  if (v.dia === null) return `Se muestran los ${v.tope} conteos más recientes. Para ver otro día, elige una fecha.`;
  return `Mostrando solo ${textoDiaLargo(v.dia, v.hoy)}.`;
}

/** Cuántos conteos hay en pantalla: «16 conteos» / «1 conteo» / «Los 20 conteos más recientes». */
export function textoTotalRecientes(v: Pick<VistaRecientes, "dia" | "mostrados" | "tope">): string {
  const n = v.mostrados.length;
  if (v.dia === null) return n >= v.tope ? `Los ${v.tope} conteos más recientes` : `${n} ${n === 1 ? "conteo" : "conteos"}`;
  return `${n} ${n === 1 ? "conteo" : "conteos"}`;
}

/**
 * El enlace del inicio de Conteo con el día elegido (`?dia=aaaa-mm-dd`), conservando «Contar esta prenda» (`?variantes=`,
 * ADR-0241): cambiar de día no puede hacer olvidar qué prendas se iban a contar. Sin día, la pantalla «Todos».
 */
export function hrefRecientes(dia: string | null, variantes: readonly string[] = []): string {
  const partes = [dia ? `dia=${dia}` : null, variantes.length > 0 ? `variantes=${variantes.join(",")}` : null].filter(Boolean);
  return partes.length === 0 ? "/inventario/conteo" : `/inventario/conteo?${partes.join("&")}`;
}

/** «Abierto 11:43 · cerrado 11:52» (al pasar el mouse por la fila). Si cerró otro día, dice cuál: «cerrado 01/10 09:05». */
export function textoAperturaCierre(c: Pick<ConteoResumen, "creadoEn" | "cerradoEn" | "estado">): string {
  const abierto = `Abierto ${horaLimaDe(c.creadoEn)}`;
  if (c.estado !== "cerrado" || !c.cerradoEn) return abierto;
  const mismoDia = diaLimaDe(c.cerradoEn) === diaLimaDe(c.creadoEn);
  const [, m, d] = diaLimaDe(c.cerradoEn).split("-");
  return `${abierto} · cerrado ${mismoDia ? "" : `${d}/${m} `}${horaLimaDe(c.cerradoEn)}`;
}

/** «—» es lo que la lectura pone cuando no sabe el nombre (`conteoResumenDesdeFila`): para esta pantalla es «no hay nombre». */
const sinNombre = (n: string | null | undefined): boolean => !n || n.trim() === "" || n.trim() === "—";

/**
 * Quién aparece en la fila del historial. `abrio` es la persona responsable del conteo (la que lo abrió y firma). `cerro` solo
 * viene cuando un conteo CERRADO tiene el nombre de quien lo cerró y es otra persona: si no se sabe, o es la misma, la fila
 * dice una sola vez el nombre y no repite «Cerró —». El conteo cerrado con la cuenta de tienda no guarda quién lo cerró
 * (ADR-0280): eso sigue siendo un hueco de la base, no se «arregla» escondiéndolo aquí; el detalle del conteo lo muestra.
 */
export function responsablesDeConteo(c: Pick<ConteoResumen, "estado" | "abiertoPorNombre" | "cerradoPorNombre">): { abrio: string | null; cerro: string | null } {
  const abrio = sinNombre(c.abiertoPorNombre) ? null : c.abiertoPorNombre.trim();
  const cerro = c.estado === "cerrado" && !sinNombre(c.cerradoPorNombre) && c.cerradoPorNombre.trim() !== abrio ? c.cerradoPorNombre.trim() : null;
  return { abrio, cerro };
}

/** Las iniciales para el círculo de una persona: «Angie Chavez» → «AC», «Diana» → «D»; sin nombre, «?». */
export function inicialesDe(nombre: string | null | undefined): string {
  if (sinNombre(nombre)) return "?";
  const letras = (nombre as string)
    .trim()
    .split(/\s+/)
    .map((p) => Array.from(p)[0])
    .filter((l) => /\p{L}/u.test(l));
  if (letras.length === 0) return "?";
  return (letras.length === 1 ? letras[0] : letras[0] + letras[1]).toLocaleUpperCase("es-PE");
}
