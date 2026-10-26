// Plan de campaña ▸ Calendario: lo que la pantalla dibuja (ADR-0525, spike ①). Arma, para un año, la lista de campañas con lo que vale hoy de cada una, las reparte en sus
// cuatro grupos y calcula dónde cae cada barra de «La línea del año». Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: cada campaña del calendario sale UNA vez (las de Insignias, con o sin decisión, y las propias); las de «solo un año» salen únicamente en su año (las quitadas salen siempre,
//            en su grupo, para poder restaurarlas); el grupo lo decide lo que vale HOY (`usoEfectivo`); y las fechas de la fila son las del PLAN de ese año (las que puso el calendario
//            si las puso, si no las de la insignia, con Día de la Madre siguiendo a su domingo).
//   NO HACE: no mide la historia (`plan-compra-calendario-evidencia.ts`), no guarda nada, no sabe de React.

import { decisionesPorEtiqueta, cuentaEnElAnio, fechasDeLaDecision, usoEfectivo, type RepiteCampana, type UsoDeCampana } from "./plan-compra-calendario";
import type { EvidenciaDeCampana } from "./plan-compra-calendario-evidencia";
import { esDeFechaMovil } from "./plan-compra-historial";
import { fechaCortaES, fechasDelAnio, type CampanasLeidas } from "./plan-compra-reglas";

export type FechasDeCampana = { desde: string; hasta: string };

export type CampanaDelCalendario = {
  /** «e:<etiqueta>» o «p:<fila>»: lo que une la fila con su hoja y con su evidencia. */
  clave: string;
  etiquetaId: string | null;
  /** La fila del calendario; null = una campaña de Insignias sin decisión. */
  decisionId: string | null;
  nombre: string;
  esPropia: boolean;
  /** Lo que vale HOY: una pausada que ya regresó cuenta como «activa». */
  uso: UsoDeCampana;
  /** Lo que dice la fila; null = sin decisión. */
  usoGuardado: UsoDeCampana | null;
  pausaHasta: string | null;
  repite: RepiteCampana;
  anioUnico: number | null;
  /** Las fechas que puso el calendario («mm-dd»), si las puso. */
  desdeMd: string | null;
  hastaMd: string | null;
  /** Las fechas del PLAN en el año que se mira; null = ninguna (una insignia sin fechas y sin las del calendario). */
  fechas: FechasDeCampana | null;
  /** Las de la insignia ese año, para decir si el plan las ensancha. */
  fechasDeLaInsignia: FechasDeCampana | null;
  /** Su fecha se mueve de un año a otro (Día de la Madre). */
  movil: boolean;
  /** El plan de ese año (sin archivar), si ya lo tiene. */
  plan: { id: string; nombre: string } | null;
  quitada: boolean;
};

export const claveDeCampana = (c: { etiquetaId: string | null; decisionId: string | null }): string => (c.etiquetaId !== null ? `e:${c.etiquetaId}` : `p:${c.decisionId}`);

/**
 * Todas las campañas del calendario para un año, con lo que vale hoy de cada una. Sin calendario en las campañas (la base todavía no lo guarda), las de Insignias salen como
 * si no hubiera decisión y no hay propias: la pantalla dice que el calendario todavía no está disponible.
 */
export function campanasDelCalendario(c: CampanasLeidas, anio: number, hoy: string): CampanaDelCalendario[] {
  const decisiones = decisionesPorEtiqueta(c.calendario);
  const deInsignias = c.etiquetas.map((e): CampanaDelCalendario => {
    const d = decisiones.get(e.id);
    const deLaInsignia = fechasDelAnio(e, anio);
    const propias = d ? fechasDeLaDecision(d, anio) : null;
    const plan = c.planes.find((p) => p.etiquetaId === e.id && !p.archivado && Number(p.hasta.slice(0, 4)) === anio) ?? null;
    return {
      clave: claveDeCampana({ etiquetaId: e.id, decisionId: d?.id ?? null }),
      etiquetaId: e.id,
      decisionId: d?.id ?? null,
      nombre: e.nombre,
      esPropia: false,
      // Sin decisión: la que ya tuvo algún plan sigue en mi plan; la que nunca lo tuvo, no la compro (lo mismo que `seOfrece`).
      uso: d ? usoEfectivo(d, hoy) : e.planes.length > 0 ? "activa" : "no",
      usoGuardado: d?.uso ?? null,
      pausaHasta: d?.pausaHasta ?? null,
      repite: d?.repite ?? "anual",
      anioUnico: d?.anioUnico ?? null,
      desdeMd: d?.desdeMd ?? null,
      hastaMd: d?.hastaMd ?? null,
      fechas: propias ?? deLaInsignia,
      fechasDeLaInsignia: deLaInsignia,
      movil: !!e.desde && !!e.hasta && esDeFechaMovil({ hasta: e.hasta }) && !(d?.desdeMd && d.hastaMd),
      plan: plan ? { id: plan.id, nombre: plan.nombre } : null,
      quitada: d?.quitada ?? false,
    };
  });
  const dePropias = (c.calendario?.decisiones ?? [])
    .filter((d) => d.etiquetaId === null)
    .map((d): CampanaDelCalendario => {
      const plan = d.planes.find((p) => p.anio === anio && !p.archivado) ?? null;
      return {
        clave: claveDeCampana({ etiquetaId: null, decisionId: d.id }),
        etiquetaId: null,
        decisionId: d.id,
        nombre: d.nombre ?? "",
        esPropia: true,
        uso: usoEfectivo(d, hoy),
        usoGuardado: d.uso,
        pausaHasta: d.pausaHasta,
        repite: d.repite,
        anioUnico: d.anioUnico,
        desdeMd: d.desdeMd,
        hastaMd: d.hastaMd,
        fechas: fechasDeLaDecision(d, anio),
        fechasDeLaInsignia: null,
        movil: false,
        plan: plan ? { id: plan.id, nombre: plan.nombre } : null,
        quitada: d.quitada,
      };
    });
  return [...deInsignias, ...dePropias];
}

/**
 * Lo que hace falta para medir la historia de cada campaña: su llave y cómo se lleva a cada año. Se mide con las fechas de VENTA (las de la insignia, con Día de la Madre
 * siguiendo a su domingo); una campaña que no las tiene (la insignia sin fechas, o una propia) usa las que le puso el calendario.
 */
export function campanasAMedir(c: CampanasLeidas): { clave: string; fechasEn: (anio: number) => FechasDeCampana | null }[] {
  const decisiones = decisionesPorEtiqueta(c.calendario);
  return [
    ...c.etiquetas.map((e) => {
      const d = decisiones.get(e.id);
      return { clave: claveDeCampana({ etiquetaId: e.id, decisionId: d?.id ?? null }), fechasEn: (anio: number) => fechasDelAnio(e, anio) ?? (d ? fechasDeLaDecision(d, anio) : null) };
    }),
    ...(c.calendario?.decisiones ?? [])
      .filter((d) => d.etiquetaId === null)
      .map((d) => ({ clave: claveDeCampana({ etiquetaId: null, decisionId: d.id }), fechasEn: (anio: number) => fechasDeLaDecision(d, anio) })),
  ];
}

export type GruposDelCalendario = {
  /** Las que entran a mi plan, por fecha. */
  enMiPlan: CampanaDelCalendario[];
  /** Las que descansan hasta su fecha de regreso (o hasta que las reactive). */
  pausadas: CampanaDelCalendario[];
  /** Las que no compro: las que tienen historia primero, y luego por nombre. */
  noLasCompro: CampanaDelCalendario[];
  /** Las que quité: se pueden restaurar. */
  quitadas: CampanaDelCalendario[];
};

const comoSeLee = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const porNombre = (a: CampanaDelCalendario, b: CampanaDelCalendario) => comoSeLee(a.nombre).localeCompare(comoSeLee(b.nombre), "es");
const porFecha = (a: CampanaDelCalendario, b: CampanaDelCalendario) => (a.fechas?.desde ?? "9999").localeCompare(b.fechas?.desde ?? "9999") || porNombre(a, b);

/** Reparte las campañas de un año en sus cuatro grupos. Una «solo un año» de otro año no sale (salvo quitada: se puede restaurar). */
export function agruparCalendario(lista: readonly CampanaDelCalendario[], anio: number, evidencias: Readonly<Record<string, EvidenciaDeCampana | null>> = {}): GruposDelCalendario {
  const cuenta = (c: CampanaDelCalendario) => cuentaEnElAnio({ repite: c.repite, anioUnico: c.anioUnico }, anio);
  const delAnio = lista.filter((c) => !c.quitada && cuenta(c));
  return {
    enMiPlan: delAnio.filter((c) => c.uso === "activa").sort(porFecha),
    pausadas: delAnio.filter((c) => c.uso === "pausada").sort(porFecha),
    noLasCompro: delAnio
      .filter((c) => c.uso === "no")
      .sort((a, b) => Number(!!evidencias[b.clave]) - Number(!!evidencias[a.clave]) || porNombre(a, b)),
    quitadas: lista.filter((c) => c.quitada).sort(porNombre),
  };
}

/** «Tu calendario 2026: 5 campañas» y, al lado, lo que no entra: «1 pausada · 7 fechas que no compras». */
export function resumenDelCalendario(g: GruposDelCalendario, anio: number): { titulo: string; detalle: string } {
  const n = g.enMiPlan.length;
  const p = g.pausadas.length;
  const k = g.noLasCompro.length;
  return {
    titulo: `Tu calendario ${anio}: ${n} ${n === 1 ? "campaña" : "campañas"}`,
    detalle: [p > 0 ? `${p} ${p === 1 ? "pausada" : "pausadas"}` : null, `${k} ${k === 1 ? "fecha que no compras" : "fechas que no compras"}`].filter(Boolean).join(" · "),
  };
}

/** «31 ene – 14 feb», o «sin fechas». */
export const rotuloDeFechas = (f: FechasDeCampana | null): string => (f ? `${fechaCortaES(f.desde)} – ${fechaCortaES(f.hasta)}` : "sin fechas");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
/** «1 febrero 2027», o «hasta que la reactives» si no trae fecha de regreso. */
export function textoDelRegreso(pausaHasta: string | null): string {
  if (!pausaHasta) return "hasta que la reactives";
  const [y, m, d] = pausaHasta.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

export type ChipDeLaFila = { texto: string; tono: "neutro" | "verde" | "ambar"; punto: boolean };

/** Lo que la fila dice de la campaña, en chips: cada año o solo uno, fecha móvil, con plan, pausada hasta cuándo. */
export function chipsDeLaFila(c: CampanaDelCalendario, anio: number): ChipDeLaFila[] {
  return [
    c.repite === "anual" ? { texto: "Cada año", tono: "neutro", punto: false } : { texto: `Solo ${c.anioUnico ?? anio}`, tono: "neutro", punto: false },
    ...(c.movil ? [{ texto: "Fecha móvil", tono: "neutro", punto: false } as const] : []),
    ...(c.plan ? [{ texto: `Con plan ${anio}`, tono: "verde", punto: true } as const] : []),
    ...(c.uso === "pausada" ? [{ texto: `Pausada hasta ${textoDelRegreso(c.pausaHasta)}`, tono: "ambar", punto: true } as const] : []),
  ];
}

/** La campaña que más pesa del año: la de mi plan con la mediana más alta, si es un pico claro (×1,5 o más). Va en rojo en «La línea del año». */
export function claveDeLaQueMasPesa(g: GruposDelCalendario, evidencias: Readonly<Record<string, EvidenciaDeCampana | null>>): string | null {
  let mejor: { clave: string; mediana: number } | null = null;
  for (const c of g.enMiPlan) {
    const m = evidencias[c.clave]?.mediana;
    if (m !== undefined && m >= 1.5 && (mejor === null || m > mejor.mediana)) mejor = { clave: c.clave, mediana: m };
  }
  return mejor?.clave ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// La línea del año
// ---------------------------------------------------------------------------------------------------------------------

const diasDelAnio = (anio: number) => (Date.UTC(anio + 1, 0, 1) - Date.UTC(anio, 0, 1)) / 86_400_000;
/** Dónde cae un día del año en la línea (0 a 100); un día de otro año se pega al borde de este. */
function posicionEnElAnio(iso: string, anio: number): number {
  if (iso < `${anio}-01-01`) return 0;
  if (iso > `${anio}-12-31`) return 100;
  const [y, m, d] = iso.split("-").map(Number);
  return ((Date.UTC(y, m - 1, d) - Date.UTC(anio, 0, 1)) / 86_400_000 / diasDelAnio(anio)) * 100;
}

export type BarraDeLaLinea = { clave: string; nombre: string; uso: UsoDeCampana; izquierda: number; ancho: number; rotulo: string };

/** Una barra por campaña con fechas, por fecha de inicio, con su lugar y su largo en la línea (de por lo menos 0,9 %: una campaña de un día se ve). */
export function barrasDeLaLinea(lista: readonly CampanaDelCalendario[], anio: number): BarraDeLaLinea[] {
  return lista
    .flatMap((c) => (c.fechas ? [{ c, f: c.fechas }] : []))
    .sort((a, b) => a.f.desde.localeCompare(b.f.desde) || porNombre(a.c, b.c))
    .map(({ c, f }) => {
      const izquierda = posicionEnElAnio(f.desde, anio);
      const fin = posicionEnElAnio(f.hasta, anio) + 100 / diasDelAnio(anio);
      return { clave: c.clave, nombre: c.nombre, uso: c.uso, izquierda, ancho: Math.max(0.9, Math.min(100, fin) - izquierda), rotulo: rotuloDeFechas(f) };
    });
}

/** Dónde cae hoy en la línea; null si el año que se mira no es el de hoy. */
export const posicionDeHoy = (hoy: string, anio: number): number | null => (hoy.startsWith(`${anio}-`) ? posicionEnElAnio(hoy, anio) : null);

/** Los años que se pueden mirar: el de hoy y el que viene (lo que el selector ofrece). */
export const aniosDelCalendario = (hoy: string): number[] => [Number(hoy.slice(0, 4)), Number(hoy.slice(0, 4)) + 1];

/** El año de la URL si es uno de los que se pueden mirar; si no, el de hoy. */
export function anioDelCalendario(pedido: string | null | undefined, hoy: string): number {
  const anios = aniosDelCalendario(hoy);
  const n = Number(pedido);
  return anios.includes(n) ? n : anios[0];
}

/** ¿La campaña tiene su plan listo de armar? Ya está en mi plan, no tiene plan ese año, tiene fechas y todavía no terminó. */
export const sePuedeArmar = (c: CampanaDelCalendario, hoy: string): boolean => c.uso === "activa" && !c.quitada && c.plan === null && c.fechas !== null && c.fechas.hasta >= hoy;
