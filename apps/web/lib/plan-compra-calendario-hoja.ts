// La hoja «Configurar campaña» / «Campaña nueva» del Calendario del Plan (ADR-0525, spike ①): lo que se llena, lo que impide guardar y lo que se manda a la base.
// Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: lo que esta hoja rechaza es lo mismo que rechaza `guardar_plan_compra_calendario` (para que el botón y la guía de foco digan lo mismo que la base): una campaña propia
//            lleva nombre (que no choque con otra ni con una insignia) y sus dos fechas; una de Insignias puede no traer fechas propias (valen las de la insignia) pero no puede
//            entrar a mi plan sin ninguna; las fechas son fechas de verdad (el principio no va después del fin); y el regreso de una pausada es futuro o queda vacío. Las fechas que
//            la persona deja iguales a las de la insignia no se guardan (para que si la insignia las cambia, el plan las siga).
//   NO HACE: no habla con la base ni dibuja.

import type { RepiteCampana, UsoDeCampana } from "./plan-compra-calendario";
import type { CampanaDelCalendario } from "./plan-compra-calendario-vista";
import { nombreComparable } from "./plan-compra-reglas";

export const MAX_NOMBRE_DE_CAMPANA = 80;

export type BorradorDeCampanaDelCalendario = {
  /** Solo una campaña propia lleva nombre; el de una de Insignias es el de la insignia. */
  nombre: string;
  /** «aaaa-mm-dd»; las fechas del plan en el año que se mira (una campaña que cruza el año termina en el siguiente). */
  desde: string;
  hasta: string;
  repite: RepiteCampana;
  uso: UsoDeCampana;
  /** «aaaa-mm-dd» o «» (descansa hasta que la reactiven); solo vale si está pausada. */
  pausaHasta: string;
};
export type CampoDeLaHoja = "nombre" | "desde" | "hasta" | "pausaHasta";

const esFecha = (t: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

/** La hoja de una campaña que ya está en la lista (con lo que vale hoy) o, con `null`, una campaña nueva. */
export function borradorDeLaCampana(c: CampanaDelCalendario | null): BorradorDeCampanaDelCalendario {
  if (!c) return { nombre: "", desde: "", hasta: "", repite: "anual", uso: "activa", pausaHasta: "" };
  return {
    nombre: c.esPropia ? c.nombre : "",
    desde: c.fechas?.desde ?? "",
    hasta: c.fechas?.hasta ?? "",
    repite: c.repite,
    uso: c.uso,
    pausaHasta: c.uso === "pausada" ? (c.pausaHasta ?? "") : "",
  };
}

export type ContextoDeLaHoja = {
  hoy: string;
  /** Los nombres de las demás campañas propias (la que se edita puede quedarse con el suyo). */
  otrosNombres: readonly string[];
  /** Los nombres de las campañas de Catálogo ▸ Insignias: una propia no puede llamarse igual (se elegiría esa). */
  nombresDeInsignias: readonly string[];
};

/** Lo que impide guardar, campo por campo (vacío = se puede). `c` es la campaña que se edita; null, una nueva (que siempre es propia). */
export function problemasDeLaHoja(b: BorradorDeCampanaDelCalendario, c: CampanaDelCalendario | null, ctx: ContextoDeLaHoja): Partial<Record<CampoDeLaHoja, string>> {
  const p: Partial<Record<CampoDeLaHoja, string>> = {};
  const propia = c === null || c.esPropia;
  const nombre = b.nombre.replace(/\s+/g, " ").trim();
  if (propia) {
    if (!nombre) p.nombre = "Escribe el nombre de la campaña.";
    else if (nombre.length > MAX_NOMBRE_DE_CAMPANA) p.nombre = `El nombre no puede pasar de ${MAX_NOMBRE_DE_CAMPANA} letras.`;
    else if (ctx.nombresDeInsignias.some((n) => nombreComparable(n) === nombreComparable(nombre))) p.nombre = `«${nombre}» ya está en el calendario del sistema (Catálogo ▸ Insignias): elígela ahí.`;
    else if (ctx.otrosNombres.some((n) => nombreComparable(n) === nombreComparable(nombre))) p.nombre = "Ya hay una campaña con ese nombre: ponle otro.";
  }
  // Las fechas: una propia las lleva siempre; una de Insignias solo si entra a mi plan o descansa y la insignia no las trae.
  const conFechas = esFecha(b.desde) && esFecha(b.hasta);
  const lasPide = propia || (b.uso !== "no" && !c?.fechasDeLaInsignia);
  if (!esFecha(b.desde) && (lasPide || b.desde !== "")) p.desde = lasPide ? "Escribe desde cuándo empieza." : "Esa fecha no existe.";
  if (!esFecha(b.hasta) && (lasPide || b.hasta !== "")) p.hasta = lasPide ? "Escribe hasta cuándo dura." : "Esa fecha no existe.";
  if (conFechas && b.hasta < b.desde) p.hasta = "La campaña no puede terminar antes de empezar.";
  // Una de Insignias que no trae fechas no puede traer solo una: las dos o ninguna (la base lo exige).
  if (!propia && !p.desde && !p.hasta && (b.desde === "") !== (b.hasta === "")) p[b.desde === "" ? "desde" : "hasta"] = "Ponle las dos fechas, el desde y el hasta, o ninguna.";
  if (b.uso === "pausada" && b.pausaHasta !== "") {
    if (!esFecha(b.pausaHasta)) p.pausaHasta = "Esa fecha no existe.";
    else if (b.pausaHasta <= ctx.hoy) p.pausaHasta = "La fecha de regreso tiene que ser posterior a hoy (o déjala vacía: descansa hasta que la reactives).";
  }
  return p;
}

/** El año en que termina la campaña de la hoja (el de «Solo ese año»): el de su fecha de fin si la hay; si no, el que se mira. */
export const anioDeLaHoja = (b: Pick<BorradorDeCampanaDelCalendario, "hasta">, anioQueSeMira: number): number => (esFecha(b.hasta) ? Number(b.hasta.slice(0, 4)) : anioQueSeMira);

/** Los argumentos de `guardar_plan_compra_calendario`. Las fechas iguales a las de la insignia ese año no se mandan (sigue a la insignia). */
export function argsGuardarCampana(c: CampanaDelCalendario | null, b: BorradorDeCampanaDelCalendario, anioQueSeMira: number) {
  const propia = c === null || c.esPropia;
  const completas = esFecha(b.desde) && esFecha(b.hasta);
  const iguales = !propia && completas && c?.fechasDeLaInsignia?.desde === b.desde && c.fechasDeLaInsignia.hasta === b.hasta;
  return {
    p_id: c?.decisionId ?? null,
    // Una campaña de Insignias sin decisión todavía no tiene fila: se le crea por su etiqueta.
    p_etiqueta_id: c && !c.esPropia && c.decisionId === null ? c.etiquetaId : null,
    p_nombre: propia ? b.nombre.replace(/\s+/g, " ").trim() : null,
    p_desde_md: completas && !iguales ? b.desde.slice(5) : null,
    p_hasta_md: completas && !iguales ? b.hasta.slice(5) : null,
    p_uso: b.uso,
    p_pausa_hasta: b.uso === "pausada" && b.pausaHasta !== "" ? b.pausaHasta : null,
    p_repite: b.repite,
    p_anio_unico: b.repite === "unica" ? anioDeLaHoja(b, anioQueSeMira) : null,
  };
}

/** ¿Cambió algo? Sin cambios no hay nada que guardar (y salir no pregunta). */
export function hojaCambio(b: BorradorDeCampanaDelCalendario, inicial: BorradorDeCampanaDelCalendario): boolean {
  return (
    b.nombre.replace(/\s+/g, " ").trim() !== inicial.nombre.replace(/\s+/g, " ").trim() ||
    b.desde !== inicial.desde ||
    b.hasta !== inicial.hasta ||
    b.repite !== inicial.repite ||
    b.uso !== inicial.uso ||
    (b.uso === "pausada" && b.pausaHasta !== inicial.pausaHasta)
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Hasta cuándo descansa
// ---------------------------------------------------------------------------------------------------------------------

/** Suma meses a una fecha sin pasarse de fin de mes: el 31 de enero más un mes es el 28 de febrero, no el 3 de marzo. */
export function sumarMeses(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const mes0 = m - 1 + n;
  const anio = y + Math.floor(mes0 / 12);
  const mes = ((mes0 % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export type AtajoDePausa = { texto: string; fecha: string | null };

/** Los atajos de «hasta cuándo descansa»: un mes, tres, hasta fin de año, un año, o hasta que la reactive (sin fecha). */
export function atajosDePausa(hoy: string): AtajoDePausa[] {
  const finDeAnio = `${hoy.slice(0, 4)}-12-31`;
  return [
    { texto: "1 mes", fecha: sumarMeses(hoy, 1) },
    { texto: "3 meses", fecha: sumarMeses(hoy, 3) },
    // El último día del año no es «posterior a hoy»: si hoy ya es 31 de diciembre, es el del año que viene.
    { texto: "Hasta fin de año", fecha: finDeAnio > hoy ? finDeAnio : `${Number(hoy.slice(0, 4)) + 1}-12-31` },
    { texto: "1 año", fecha: sumarMeses(hoy, 12) },
    { texto: "Hasta que la reactive", fecha: null },
  ];
}

/** La fecha de regreso con que arranca una campaña que se acaba de pausar: tres meses (lo que propone el spike). */
export const pausaPorDefecto = (hoy: string): string => sumarMeses(hoy, 3);
