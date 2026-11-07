// Estados financieros ▸ el período que se mira (ADR-0611, actividad 3; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`).
//
// PROMETE: de la URL sale UN período (`desde`, `hasta`) que comparten los cuatro estados, con su nombre en palabras, su vecino del mismo largo,
// sus atajos y su dirección. El Balance es una sola fecha: la de `hasta`. Todo en texto `aaaa-mm-dd` y en cuentas UTC, nunca con `new Date(iso)`
// a secas: ese parseo corre la fecha un día para atrás en Lima.
// ASUME: `hoy` es el día de Lima (`hoyLima`) y `minimo` es desde cuándo cuenta Finanzas (`fn_parametros_finanzas`); sin ese dato no hay piso.
//
// La URL: un mes entero se escribe `?mes=2026-10` (y el mes de hoy no se escribe); cualquier otro período lleva además `?desde=` y `?hasta=`. El
// `mes` va siempre, porque es lo que viaja al resto de Finanzas cuando la persona se va a otro submódulo: allá se mira por mes.

import { leerFechaEscrita } from "./campo-fecha-reglas";
import { mesDeLosEstados } from "./estados-financieros-reglas";
import { rangoDelMes } from "./flujo-caja-reglas";
import { mesNombre } from "./resultados-reglas";

export type Rango = { desde: string; hasta: string };

export type Periodo = Rango & {
  /** El mes de `hasta` («2026-10»): el que viaja al resto de Finanzas y el que entienden las lecturas que van por mes. */
  mes: string;
  /** Un mes entero (o el de hoy, hasta hoy). */
  unMes: boolean;
  /** Varios meses enteros seguidos. */
  variosMeses: boolean;
  /** Termina hoy: todavía se está llenando. */
  enCurso: boolean;
  dias: number;
  /** «Octubre 2026», «Agosto a octubre 2026», «5 al 20 de octubre 2026». */
  titulo: string;
  /** Para seguir una frase: «en octubre», «del 5 al 20 de octubre». */
  en: string;
  /** «1 oct – 31 oct», o «Un día». */
  tramo: string;
  /** «hasta hoy», «mes completo», «3 meses completos», «16 días». */
  largo: string;
  /** La fecha del Balance: «Al 5 de noviembre de 2026». */
  al: string;
};

const MS_DIA = 86_400_000;
const aMs = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const deMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mesDe = (iso: string) => iso.slice(0, 7);
const diaDe = (iso: string) => Number(iso.slice(8, 10));
const anioDe = (iso: string) => iso.slice(0, 4);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const corto = (mes: string) => mesNombre(mes).slice(0, 3);
const primero = (mes: string) => `${mes}-01`;

export const sumarDias = (iso: string, n: number) => deMs(aMs(iso) + n * MS_DIA);
export const finDelMes = (mes: string) => deMs(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0));
export function sumarMeses(mes: string, k: number): string {
  const t = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const mesesEntre = (a: string, z: string) => (Number(z.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(z.slice(5, 7)) - Number(a.slice(5, 7));
const elMenor = (a: string, b: string) => (a < b ? a : b);
const elMayor = (a: string, b: string) => (a > b ? a : b);

/** «2026-11-05» → «5 de noviembre de 2026». */
export const fechaLarga = (iso: string) => `${diaDe(iso)} de ${mesNombre(mesDe(iso))} de ${anioDe(iso)}`;
/** «2026-11-05» → «05/11/2026»: lo que se ve en el campo. */
export const fechaEnCampo = (iso: string) => iso.split("-").reverse().join("/");
/** «2026-11» → «Noviembre 2026». */
export const nombreDelMes = (mes: string) => `${capital(mesNombre(mes))} ${anioDe(mes)}`;

export function periodoDe(desde: string, hasta: string, hoy: string): Periodo {
  const mesA = mesDe(desde);
  const mesZ = mesDe(hasta);
  const enteros = desde === primero(mesA) && (hasta === finDelMes(mesZ) || hasta === hoy);
  const unMes = enteros && mesA === mesZ;
  const variosMeses = enteros && !unMes;
  const dias = Math.round((aMs(hasta) - aMs(desde)) / MS_DIA) + 1;
  const mismoAnio = anioDe(desde) === anioDe(hasta);
  const nomA = mesNombre(mesA);
  const nomZ = mesNombre(mesZ);
  const dA = diaDe(desde);
  const dZ = diaDe(hasta);

  let titulo: string;
  let en: string;
  if (unMes) {
    titulo = nombreDelMes(mesA);
    en = `en ${nomA}`;
  } else if (variosMeses) {
    titulo = mismoAnio ? `${capital(nomA)} a ${nomZ} ${anioDe(hasta)}` : `${capital(corto(mesA))} ${anioDe(desde)} a ${corto(mesZ)} ${anioDe(hasta)}`;
    en = `de ${nomA} a ${nomZ}`;
  } else if (desde === hasta) {
    titulo = fechaLarga(desde);
    en = `el ${dA} de ${nomA}`;
  } else if (mesA === mesZ) {
    titulo = `${dA} al ${dZ} de ${nomZ} ${anioDe(hasta)}`;
    en = `del ${dA} al ${dZ} de ${nomZ}`;
  } else if (mismoAnio) {
    titulo = `${dA} ${corto(mesA)} al ${dZ} ${corto(mesZ)} ${anioDe(hasta)}`;
    en = `del ${dA} de ${nomA} al ${dZ} de ${nomZ}`;
  } else {
    titulo = `${dA} ${corto(mesA)} ${anioDe(desde)} al ${dZ} ${corto(mesZ)} ${anioDe(hasta)}`;
    en = `del ${dA} de ${nomA} de ${anioDe(desde)} al ${dZ} de ${nomZ} de ${anioDe(hasta)}`;
  }

  const largo = hasta === hoy ? "hasta hoy" : unMes ? "mes completo" : variosMeses ? `${mesesEntre(mesA, mesZ) + 1} meses completos` : `${dias} ${dias === 1 ? "día" : "días"}`;
  const tramo = desde === hasta ? "Un día" : `${dA} ${corto(mesA)} – ${dZ} ${corto(mesZ)}`;
  return { desde, hasta, mes: mesZ, unMes, variosMeses, enCurso: hasta === hoy, dias, titulo, en, tramo, largo, al: `Al ${dZ} de ${nomZ} de ${anioDe(hasta)}` };
}

const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && deMs(aMs(v)) === v;

/**
 * El período de la URL. `?corte=` es el nombre viejo de la fecha del Balance: se sigue entendiendo como `hasta`. Lo que no se puede leer no rompe la
 * pantalla: una fecha futura se queda en hoy, un rango al revés o inventado cae al mes de la barra.
 */
export function leerPeriodo(sp: { desde?: string; hasta?: string; mes?: string; corte?: string }, hoy: string): Periodo {
  const pedida = esFecha(sp.hasta) ? sp.hasta : esFecha(sp.corte) ? sp.corte : null;
  if (pedida) {
    const hasta = elMenor(pedida, hoy);
    const desde = esFecha(sp.desde) && sp.desde <= hasta ? sp.desde : primero(mesDe(hasta));
    return periodoDe(desde, hasta, hoy);
  }
  const { desde, hasta } = rangoDelMes(mesDeLosEstados(sp.mes, hoy), hoy);
  return periodoDe(desde, hasta, hoy);
}

const CLAVES_DEL_PERIODO = new Set(["mes", "desde", "hasta", "corte"]);

/** Lo que el período escribe en la URL: un mes entero, solo su mes; otro período, también sus dos fechas. El mes de hoy no se escribe. */
export function paramsDelRango({ desde, hasta }: Rango, hoy: string): [string, string][] {
  const p = periodoDe(desde, hasta, hoy);
  const salida: [string, string][] = [];
  if (p.mes !== mesDe(hoy)) salida.push(["mes", p.mes]);
  if (!p.unMes) salida.push(["desde", desde], ["hasta", hasta]);
  return salida;
}

/** La dirección de esta pantalla con otro período: lo demás (la sede, la forma) se queda. */
export function hrefPeriodo(ruta: string, actuales: Iterable<[string, string]>, rango: Rango, hoy: string): string {
  const q = new URLSearchParams();
  for (const [k, v] of actuales) if (!CLAVES_DEL_PERIODO.has(k)) q.set(k, v);
  for (const [k, v] of paramsDelRango(rango, hoy)) q.set(k, v);
  const texto = q.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

/** Al pasar de un estado a otro el período viaja: `hrefTelar` solo lleva la sede y el mes, y estas dos fechas se le suman. */
export function conElRango(href: string, actuales: Iterable<[string, string]>): string {
  const rango = [...actuales].filter(([k]) => k === "desde" || k === "hasta");
  if (!rango.length) return href;
  const q = new URLSearchParams(rango);
  return `${href}${href.includes("?") ? "&" : "?"}${q.toString()}`;
}

/** Un mes vale si algún día suyo cuenta: Finanzas pudo empezar a mitad de mes. */
const mesAlAlcance = (mes: string, minimo: string | null) => !minimo || finDelMes(mes) >= minimo;

/** Las flechas: el mes de al lado (en el Balance y al mirar meses enteros, tantos como se miran) o los mismos días, justo antes y justo después. */
export function vecinos(p: Periodo, hoy: string, minimo: string | null, una: boolean): { anterior: Rango | null; siguiente: Rango | null } {
  const diaHoy = (iso: string) => elMenor(iso, hoy);
  if (una || p.unMes || p.variosMeses) {
    const n = una ? 1 : mesesEntre(mesDe(p.desde), p.mes) + 1;
    const antesZ = sumarMeses(p.mes, -n);
    const antesA = sumarMeses(mesDe(p.desde), una ? -1 : -n);
    const despuesA = sumarMeses(mesDe(p.desde), una ? 1 : n);
    const despuesZ = sumarMeses(p.mes, n);
    return {
      anterior: mesAlAlcance(antesZ, minimo) ? { desde: primero(antesA), hasta: finDelMes(antesZ) } : null,
      siguiente: primero(despuesA) <= hoy ? { desde: primero(despuesA), hasta: diaHoy(finDelMes(despuesZ)) } : null,
    };
  }
  const antes = sumarDias(p.desde, -p.dias);
  const despues = sumarDias(p.hasta, p.dias);
  return {
    anterior: !minimo || antes >= minimo ? { desde: antes, hasta: sumarDias(p.desde, -1) } : null,
    siguiente: despues <= hoy ? { desde: sumarDias(p.hasta, 1), hasta: despues } : null,
  };
}

/**
 * Con qué se compara. El mes de hoy, con los mismos días del mes pasado: contra el mes entero siempre saldría perdiendo. Unos meses ya cerrados, con los
 * mismos meses justo antes. Lo demás, con los mismos días justo antes. `null` si Finanzas todavía no contaba.
 */
export function periodoAnterior(p: Periodo, minimo: string | null): Rango | null {
  if (minimo && p.desde <= minimo) return null;
  const hasta = sumarDias(p.desde, -1);
  if (p.unMes && p.enCurso) {
    const mes = mesDe(hasta);
    return { desde: primero(mes), hasta: elMenor(`${mes}-${String(diaDe(p.hasta)).padStart(2, "0")}`, finDelMes(mes)) };
  }
  if (p.unMes || (p.variosMeses && !p.enCurso)) {
    const desde = primero(sumarMeses(mesDe(hasta), -mesesEntre(mesDe(p.desde), p.mes)));
    return minimo && mesDe(desde) < mesDe(minimo) ? null : { desde, hasta };
  }
  const desde = sumarDias(hasta, 1 - p.dias);
  return minimo && desde < minimo ? null : { desde, hasta };
}

export type Comparable = Rango & { etiqueta: string };

/**
 * Los dos períodos de antes, para las columnas del detalle, del más viejo al más nuevo. En el mes de hoy, los mismos días de los dos meses pasados: si no, el
 * último tendría 5 días y el de antes también, pero de días distintos. Los meses se nombran por su mes; otras fechas, «Antes» y «Anterior».
 */
export function periodosAnteriores(p: Periodo, hoy: string, minimo: string | null): Comparable[] {
  const uno = periodoAnterior(p, minimo);
  if (!uno) return [];
  // Un mes a medias no se llama como el mes entero: «1–6 oct», para que nadie lea octubre donde hay seis días (ADR-0621).
  const delMes = (r: Rango) => (r.hasta < finDelMes(mesDe(r.desde)) ? `1–${diaDe(r.hasta)} ${corto(mesDe(r.desde))}` : capital(corto(mesDe(r.desde))));
  const conEtiqueta = (r: Rango, siNoEsMes: string): Comparable => ({ ...r, etiqueta: p.unMes ? delMes(r) : siNoEsMes });
  const anterior = conEtiqueta(uno, "Anterior");
  const dos =
    p.unMes && p.enCurso
      ? periodoAnterior(periodoDe(primero(mesDe(uno.desde)), elMenor(uno.hasta, hoy), uno.hasta), minimo)
      : periodoAnterior(periodoDe(uno.desde, uno.hasta, hoy), minimo);
  return dos ? [conEtiqueta(dos, "Antes"), anterior] : [anterior];
}

/** Cómo se nombra el período en su columna: «Oct», o «Ahora». */
export const etiquetaDelPeriodo = (p: Periodo) => (p.unMes ? capital(corto(p.mes)) : "Ahora");

/** Cómo se nombra aquello con lo que se compara: «octubre», «octubre a esta fecha», «el período anterior». */
export function nombreDelAnterior(p: Periodo): string {
  if (!p.unMes) return "el período anterior";
  const antes = mesNombre(sumarMeses(p.mes, -1));
  return p.enCurso ? `${antes} a esta fecha` : antes;
}

/** La frase junto al período que dice contra qué se comparan las cifras. */
export function comparacionDelPeriodo(p: Periodo, minimo: string | null, una: boolean): string {
  if (una) {
    const mesAntes = sumarMeses(p.mes, -1);
    return mesAlAlcance(mesAntes, minimo) ? `Se compara con el fin de ${mesNombre(mesAntes)}` : "Sin fecha anterior";
  }
  return periodoAnterior(p, minimo) ? `Se compara con ${nombreDelAnterior(p)}` : "Sin período anterior";
}

export type Atajo = Rango & { clave: string; titulo: string; detalle: string };

/** Los atajos del calendario. En el Balance son fechas de cierre; lo que cae antes de que Finanzas contara no se ofrece. */
export function atajosDelPeriodo(hoy: string, minimo: string | null, una: boolean): Atajo[] {
  const mes = mesDe(hoy);
  const pasado = sumarMeses(mes, -1);
  if (una) {
    const antepasado = sumarMeses(pasado, -1);
    const anioPasado = Number(anioDe(hoy)) - 1;
    const fecha = (iso: string) => `${diaDe(iso)} ${corto(mesDe(iso))} ${anioDe(iso)}`;
    const cierre = (clave: string, titulo: string, m: string): Atajo => ({ clave, titulo, detalle: fecha(finDelMes(m)), desde: primero(m), hasta: finDelMes(m) });
    return [
      { clave: "hoy", titulo: "Hoy", detalle: fecha(hoy), desde: primero(mes), hasta: hoy },
      cierre("fin-pasado", `Fin de ${mesNombre(pasado)}`, pasado),
      cierre("fin-antepasado", `Fin de ${mesNombre(antepasado)}`, antepasado),
      cierre("fin-anio", `Fin de ${anioPasado}`, `${anioPasado}-12`),
    ].filter((a, i, lista) => (!minimo || a.hasta >= minimo) && lista.findIndex((b) => b.hasta === a.hasta) === i);
  }
  const trimestre = `${anioDe(hoy)}-${String(Math.floor((Number(mes.slice(5)) - 1) / 3) * 3 + 1).padStart(2, "0")}`;
  const tramo = (a: string, z: string) => (mesDe(a) === mesDe(z) ? `${diaDe(a)} – ${diaDe(z)} ${corto(mesDe(z))}` : `${diaDe(a)} ${corto(mesDe(a))} – ${diaDe(z)} ${corto(mesDe(z))}`);
  const atajo = (clave: string, titulo: string, desdeCrudo: string, hasta: string): Atajo => {
    // Los que no son un mes entero no pueden empezar antes de que Finanzas contara.
    const desde = minimo ? elMayor(desdeCrudo, minimo) : desdeCrudo;
    return { clave, titulo, detalle: tramo(desde, hasta), desde, hasta };
  };
  return [
    atajo("este-mes", "Este mes", primero(mes), hoy),
    atajo("mes-pasado", "Mes pasado", primero(pasado), finDelMes(pasado)),
    atajo("7-dias", "Últimos 7 días", sumarDias(hoy, -6), hoy),
    atajo("30-dias", "Últimos 30 días", sumarDias(hoy, -29), hoy),
    atajo("trimestre", "Este trimestre", primero(trimestre), hoy),
    atajo("anio", "Este año", `${anioDe(hoy)}-01-01`, hoy),
  ].filter((a) => !minimo || a.hasta >= minimo);
}

export type MesDelHilo = Rango & {
  mes: string;
  /** «Nov». */
  etiqueta: string;
  /** «Noviembre 2026». */
  nombre: string;
  /** El primero de la fila y cada enero llevan su año, para no perderse. */
  anio: string | null;
};

/** La fila de meses del calendario: los últimos 13, sin los que terminan antes de que Finanzas contara. */
export function mesesDelHilo(hoy: string, minimo: string | null): MesDelHilo[] {
  const mes = mesDe(hoy);
  const meses = Array.from({ length: 13 }, (_, i) => sumarMeses(mes, i - 12)).filter((m) => mesAlAlcance(m, minimo));
  return meses.map((m, i) => ({
    mes: m,
    etiqueta: capital(corto(m)),
    nombre: nombreDelMes(m),
    anio: i === 0 || m.endsWith("-01") ? anioDe(m) : null,
    desde: primero(m),
    hasta: elMenor(finDelMes(m), hoy),
  }));
}

/** ¿Cuánto llena este mes el período? `entero`: lo cubre todo; `parte`: lo toca; en el Balance, `entero` es que la fecha sea su cierre. */
export function cubreElMes(m: MesDelHilo, { desde, hasta }: Rango, una: boolean): "entero" | "parte" | "no" {
  if (una) return hasta === m.hasta ? "entero" : hasta >= m.desde && hasta <= m.hasta ? "parte" : "no";
  if (desde <= m.desde && hasta >= m.hasta) return "entero";
  return desde <= m.hasta && hasta >= m.desde ? "parte" : "no";
}

/** Lo alto de la barrita de un mes, de 3 a 30 px, contra el mes que más se movió. */
export function alturaDelMes(resultado: number, mayor: number): number {
  if (mayor <= 0) return 3;
  return Math.max((Math.abs(resultado) / mayor) * 30, 3);
}

export type DiaDelMes = { iso: string; n: number; apagado: boolean; motivo: string | null };

/** Los días de un mes: cuántos huecos van antes del primero (la semana empieza en lunes) y cuáles no se pueden elegir, con su motivo. */
export function diasDelMes(mes: string, hoy: string, minimo: string | null): { huecos: number; dias: DiaDelMes[] } {
  const huecos = (new Date(aMs(primero(mes))).getUTCDay() + 6) % 7;
  const ultimo = diaDe(finDelMes(mes));
  const dias = Array.from({ length: ultimo }, (_, i) => {
    const iso = `${mes}-${String(i + 1).padStart(2, "0")}`;
    const motivo = iso > hoy ? "Todavía no llega." : minimo && iso < minimo ? `Finanzas cuenta desde el ${fechaLarga(minimo)}.` : null;
    return { iso, n: i + 1, apagado: motivo !== null, motivo };
  });
  return { huecos, dias };
}

export type MarcaDelDia = { dentro: boolean; inicio: boolean; fin: boolean; solo: boolean; hoy: boolean; bordeIzquierdo: boolean; bordeDerecho: boolean };

/** Cómo se pinta un día: dentro del tramo, sus dos puntas, o solo (la primera fecha elegida). Los bordes redondean el tramo al cambiar de semana. */
export function marcaDelDia(iso: string, { desde, hasta }: Rango, hoy: string): MarcaDelDia {
  const semana = (new Date(aMs(iso)).getUTCDay() + 6) % 7;
  const dentro = iso >= desde && iso <= hasta;
  const uno = desde === hasta;
  return {
    dentro,
    inicio: !uno && iso === desde,
    fin: !uno && iso === hasta,
    solo: uno && iso === desde,
    hoy: iso === hoy,
    bordeIzquierdo: dentro && (semana === 0 || diaDe(iso) === 1),
    bordeDerecho: dentro && (semana === 6 || iso === finDelMes(mesDe(iso))),
  };
}

/** El puntito de un día: cuánto se vendió contra el mejor día de los meses a la vista. Sin ventas, nada. */
export function intensidadDelDia(total: number | undefined, mayor: number): number {
  if (!total || total <= 0 || mayor <= 0) return 0;
  return Math.min(1, Math.max(0.12, total / mayor));
}

/** Suma lo vendido de cada tienda por fecha. */
export function ventasPorFecha(series: readonly (readonly { fecha: string; total: number }[])[]): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const serie of series) for (const d of serie) salida[d.fecha] = (salida[d.fecha] ?? 0) + d.total;
  return salida;
}

/** Lo que se escribió en los dos campos: el rango, o qué está mal, dicho en una línea. En el Balance solo cuenta `hasta`. */
export function revisarEscritas(desdeTexto: string, hastaTexto: string, hoy: string, minimo: string | null, una: boolean): { rango: Rango } | { error: string } {
  const anio = Number(anioDe(hoy));
  const hasta = leerFechaEscrita(hastaTexto, anio);
  const desde = una ? null : leerFechaEscrita(desdeTexto, anio);
  if (!hasta || (!una && !desde)) return { error: "Esa fecha no existe: revisa el día y el mes." };
  if (hasta > hoy) return { error: `No puede ser futura: hoy es ${diaDe(hoy)} de ${mesNombre(mesDe(hoy))}.` };
  if (minimo && (desde ?? hasta) < minimo) return { error: `Finanzas cuenta desde el ${fechaLarga(minimo)}.` };
  if (desde && desde > hasta) return { error: "La fecha final va después de la inicial." };
  return { rango: { desde: desde ?? primero(mesDe(hasta)), hasta } };
}

/** El día al que va el cursor con una flecha, sin pasar de lo que se puede elegir. */
export function diaPorTecla(iso: string, tecla: string, hoy: string, minimo: string | null): string | null {
  const salto: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const n = salto[tecla];
  if (n === undefined) return null;
  const destino = sumarDias(iso, n);
  if (destino > hoy) return hoy;
  return minimo && destino < minimo ? minimo : destino;
}
