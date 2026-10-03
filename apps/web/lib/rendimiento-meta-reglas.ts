/**
 * Rendimiento con meta por persona (ADR-0318): las reglas puras que convierten lo que devuelven
 * `fn_metas_equipo`, `fn_rendimiento_serie` y `fn_metas_historial` en lo que muestra la pantalla —
 * las cuatro cifras de arriba, la tabla «Cómo va», el gráfico y el pie «asignado a las N».
 * Sin React ni supabase: las usa `rendimiento.ts` en el servidor y el panel en el navegador, y se
 * prueban en `rendimiento-meta-reglas.test.ts`.
 *
 * PROMETE: (1) las tres vistas —Hoy, Semana (7 días hasta hoy), Mes— salen de UNA sola lectura: la
 * pantalla cambia de vista sin volver a preguntarle nada a la base; (2) nunca inventa una meta: sin
 * meta de la sede, o sin parte para una persona, devuelve `null` y la pantalla dice qué falta;
 * (3) el aviso de «se pasa» o «faltan» sale de restar lo que suman las personas a la meta de la sede,
 * no de una cifra aparte que se pueda desincronizar.
 * ASUME: fechas `aaaa-mm-dd` en hora de Lima; que `hoy` es el que calcula el servidor.
 */

import { diasEntreFechas, sumarDias } from "./fechas-lima";

export type Vista = "hoy" | "semana" | "mes";

export const VISTAS: { clave: Vista; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "semana", etiqueta: "Semana" },
  { clave: "mes", etiqueta: "Mes" },
];

/** La vista de la URL (`?vista=`): lo que no se reconoce es «hoy» (decisión 8: Rendimiento abre en Hoy). */
export function vistaDeUrl(valor: string | string[] | undefined | null): Vista {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v === "semana" || v === "mes" ? v : "hoy";
}

/** Un día de la serie de la tienda (`fn_rendimiento_serie`). `metaSede` y `metaAsignada` son `null` si no hay. */
export type DiaSerie = {
  fecha: string;
  total: number;
  ventas: number;
  metaSede: number | null;
  metaAsignada: number | null;
};

/** Una persona de la tienda con su meta y lo que vendió (`fn_metas_equipo`). */
export type PersonaMeta = {
  personaId: string;
  nombre: string;
  esEncargada: boolean;
  /** `horas`: la meta sale de sus horas programadas; `iguales`: partes iguales entre quienes marcaron asistencia. */
  base: "horas" | "iguales" | null;
  entradaHoy: string | null;
  salidaHoy: string | null;
  horasHoy: number | null;
  metaAutoMes: number | null;
  /** Solo si la líder la cambió; `null` mientras vale la automática. */
  metaAjustadaMes: number | null;
  metaMes: number | null;
  metaHoy: number | null;
  meta7d: number | null;
  vendidoHoy: number;
  ventasHoy: number;
  vendido7d: number;
  ventas7d: number;
  vendidoMes: number;
  ventasMes: number;
};

/** Un cambio de meta del historial (`fn_metas_historial`). */
export type CambioMeta = {
  id: number;
  personaId: string;
  persona: string;
  mes: string;
  metaAntes: number;
  /** `null`: volvió a la automática. */
  meta: number | null;
  motivo: string;
  detalle: string | null;
  cambiadoPor: string;
  creadoEn: string;
};

// ───────────────────────── fechas ─────────────────────────

export function primerDiaDelMes(hoy: string): string {
  return `${hoy.slice(0, 7)}-01`;
}

export function ultimoDiaDelMes(hoy: string): string {
  const [a, m] = hoy.slice(0, 7).split("-").map(Number);
  return sumarDias(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
}

/** El rango que hay que pedirle a la serie para poder armar las tres vistas: la semana y el mes completo. */
export function rangoDeLectura(hoy: string): { desde: string; hasta: string } {
  const semana = sumarDias(hoy, -6);
  const inicioMes = primerDiaDelMes(hoy);
  const finMes = ultimoDiaDelMes(hoy);
  return { desde: semana < inicioMes ? semana : inicioMes, hasta: finMes > hoy ? finMes : hoy };
}

export function ventanaDeVista(vista: Vista, hoy: string): { desde: string; hasta: string } {
  if (vista === "hoy") return { desde: hoy, hasta: hoy };
  if (vista === "semana") return { desde: sumarDias(hoy, -6), hasta: hoy };
  return { desde: primerDiaDelMes(hoy), hasta: ultimoDiaDelMes(hoy) };
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function diaDeSemana(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

// ───────────────────────── cifras ─────────────────────────

/** Porcentaje entero de `vendido` sobre `meta`; `null` si no hay meta (no se dibuja un «0 %» que mienta). */
export function avance(vendido: number, meta: number | null): number | null {
  return meta !== null && meta > 0 ? Math.round((vendido / meta) * 100) : null;
}

export type ResumenSede = {
  soles: number;
  ventas: number;
  /** La meta de la sede en la ventana; `null` si ningún día de la ventana tiene meta. */
  meta: number | null;
  /** Solo en la vista Mes: qué porcentaje de la meta del mes tocaba llevar hasta hoy. */
  tocabaPct: number | null;
  ticket: number | null;
};

export function resumenDeSede(serie: DiaSerie[], vista: Vista, hoy: string): ResumenSede {
  const { desde, hasta } = ventanaDeVista(vista, hoy);
  const dias = serie.filter((d) => d.fecha >= desde && d.fecha <= hasta);
  const soles = dias.reduce((s, d) => s + d.total, 0);
  const ventas = dias.reduce((s, d) => s + d.ventas, 0);
  const conMeta = dias.filter((d) => d.metaSede !== null);
  const meta = conMeta.length > 0 ? conMeta.reduce((s, d) => s + (d.metaSede ?? 0), 0) : null;
  let tocabaPct: number | null = null;
  if (vista === "mes" && meta !== null && meta > 0) {
    const hastaHoy = dias.filter((d) => d.fecha <= hoy).reduce((s, d) => s + (d.metaSede ?? 0), 0);
    tocabaPct = Math.round((hastaHoy / meta) * 100);
  }
  return { soles, ventas, meta, tocabaPct, ticket: ventas > 0 ? soles / ventas : null };
}

// ───────────────────────── proyección del mes (Felipe, 2026-10-03) ─────────────────────────

/** Días con ventas, ANTES de hoy, que hacen falta para proyectar: con menos, el promedio lo decide un solo día. */
export const MIN_DIAS_PARA_PROYECTAR_TIENDA = 3;

export type ProyeccionMes = {
  /** Lo vendido en el mes hasta hoy (con lo que lleva hoy). */
  vendido: number;
  /** Dónde cierra el mes a su ritmo: lo vendido + el promedio de los días ya cerrados × los días de trabajo que quedan. */
  proyeccion: number;
  /** La meta del mes (suma de la parte de cada día); `null` si ningún día tiene meta. */
  metaMes: number | null;
  /** La proyección como porcentaje de la meta del mes; `null` sin meta. */
  pctDeMeta: number | null;
  /** Días de trabajo que quedan después de hoy. */
  diasQueQuedan: number;
  /** El promedio por día de trabajo ya cerrado (sin hoy: hoy todavía no termina y lo bajaría). */
  ritmoPorDia: number;
};

/**
 * ¿Dónde cierra el mes a este ritmo? Solo cuentan los días de trabajo —los que tienen parte de la meta de la sede: un domingo
 * cerrado no baja el promedio ni suma días—; si ningún día tiene meta, cuentan todos. `null` sin base: menos de 3 días cerrados con
 * ventas (no se inventa una proyección con un solo día). Es una estimación: la pantalla la dice «cerca de».
 */
export function proyectarMes(serie: DiaSerie[], hoy: string): ProyeccionMes | null {
  const ini = primerDiaDelMes(hoy);
  const fin = ultimoDiaDelMes(hoy);
  const mes = serie.filter((d) => d.fecha >= ini && d.fecha <= fin);
  const hayMetas = mes.some((d) => (d.metaSede ?? 0) > 0);
  const cuenta = (d: DiaSerie) => (hayMetas ? (d.metaSede ?? 0) > 0 : true);
  const cerrados = mes.filter((d) => d.fecha < hoy && cuenta(d));
  if (cerrados.filter((d) => d.total > 0).length < MIN_DIAS_PARA_PROYECTAR_TIENDA) return null;
  const ritmoPorDia = cerrados.reduce((s, d) => s + d.total, 0) / cerrados.length;
  const vendido = mes.filter((d) => d.fecha <= hoy).reduce((s, d) => s + d.total, 0);
  const diasQueQuedan = mes.filter((d) => d.fecha > hoy && cuenta(d)).length;
  const proyeccion = vendido + ritmoPorDia * diasQueQuedan;
  const metaMes = hayMetas ? mes.reduce((s, d) => s + (d.metaSede ?? 0), 0) : null;
  return { vendido, proyeccion, metaMes, pctDeMeta: avance(proyeccion, metaMes), diasQueQuedan, ritmoPorDia };
}

// ───────────────────────── tabla «Cómo va» ─────────────────────────

export type Orden = "nombre" | "ventas" | "avance";

export function columnaDePersona(p: PersonaMeta, vista: Vista): { vendido: number; ventas: number; meta: number | null } {
  if (vista === "hoy") return { vendido: p.vendidoHoy, ventas: p.ventasHoy, meta: p.metaHoy };
  if (vista === "semana") return { vendido: p.vendido7d, ventas: p.ventas7d, meta: p.meta7d };
  return { vendido: p.vendidoMes, ventas: p.ventasMes, meta: p.metaMes };
}

export function ordenarPersonas(personas: PersonaMeta[], vista: Vista, orden: Orden): PersonaMeta[] {
  const porNombre = (a: PersonaMeta, b: PersonaMeta) => a.nombre.localeCompare(b.nombre, "es");
  const copia = [...personas];
  if (orden === "nombre") return copia.sort(porNombre);
  if (orden === "ventas") {
    return copia.sort((a, b) => columnaDePersona(b, vista).vendido - columnaDePersona(a, vista).vendido || porNombre(a, b));
  }
  const av = (p: PersonaMeta) => {
    const c = columnaDePersona(p, vista);
    return avance(c.vendido, c.meta) ?? -1;
  };
  return copia.sort((a, b) => av(b) - av(a) || porNombre(a, b));
}

/** «09:00–18:00», o `null` si no tiene turno cargado hoy (la fila dice «Sin turno cargado» solo si la tienda reparte por horas). */
export function turnoDeHoy(p: Pick<PersonaMeta, "entradaHoy" | "salidaHoy">): string | null {
  return p.entradaHoy && p.salidaHoy ? `${p.entradaHoy.slice(0, 5)}–${p.salidaHoy.slice(0, 5)}` : null;
}

/** «09:00» o «09:00:00» a minutos desde la medianoche; `null` si no se entiende. */
export function minutosDeHora(hhmm: string | null): number | null {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Los minutos desde la medianoche de Lima de un instante (Lima va fija en UTC−5, sin horario de verano). */
export function minutosEnLima(ahora: Date = new Date()): number {
  const lima = new Date(ahora.getTime() - 5 * 3600 * 1000);
  return lima.getUTCHours() * 60 + lima.getUTCMinutes();
}

/**
 * Cuánto de su turno de hoy ya pasó, de 0 a 1 (D-159, «ritmo esperado»): la marca vertical de la barra de hoy. `null` si no tiene turno
 * cargado. Antes de empezar vale 0 y después de terminar, 1.
 */
export function ritmoDelTurno(p: Pick<PersonaMeta, "entradaHoy" | "salidaHoy">, ahoraMin: number): number | null {
  const e = minutosDeHora(p.entradaHoy);
  const s = minutosDeHora(p.salidaHoy);
  if (e === null || s === null || s <= e) return null;
  return Math.min(1, Math.max(0, (ahoraMin - e) / (s - e)));
}

export type LecturaRitmo = "Adelante" | "En ritmo" | "Por debajo";

/**
 * Cómo va contra lo que tocaba a esta hora (D-159). Son palabras, no un semáforo: 10 puntos por encima o por debajo del ritmo. Sin
 * ritmo (no tiene turno) o con el turno sin empezar (ritmo 0) no se dice nada: no hay contra qué comparar.
 */
export function lecturaDeRitmo(vendido: number, metaHoy: number | null, ritmo: number | null): LecturaRitmo | null {
  if (metaHoy === null || metaHoy <= 0 || ritmo === null || ritmo <= 0) return null;
  // Redondeado a milésimas: 0.6 − 0.5 da 0.0999…98 en coma flotante y «justo 10 puntos» tiene que contar como 10.
  const d = Math.round((vendido / metaHoy - ritmo) * 1000) / 1000;
  return d >= 0.1 ? "Adelante" : d <= -0.1 ? "Por debajo" : "En ritmo";
}

/** ¿La tienda reparte la meta por horas programadas? Con que una persona tenga base «horas», sí. */
export function repartePorHoras(personas: PersonaMeta[]): boolean {
  return personas.some((p) => p.base === "horas");
}

export type Asignacion =
  | { tipo: "sin_meta" }
  | { tipo: "cuadra" | "faltan" | "pasa"; asignado: number; metaSede: number; diferencia: number };

/** Lo que suman las personas contra la meta de la sede en la vista (tolerancia de S/ 1: los repartos van en múltiplos de S/ 10 o S/ 1). */
export function asignacionDeVista(personas: PersonaMeta[], vista: Vista, metaSede: number | null): Asignacion {
  if (metaSede === null || metaSede <= 0) return { tipo: "sin_meta" };
  const asignado = personas.reduce((s, p) => s + (columnaDePersona(p, vista).meta ?? 0), 0);
  const diferencia = Math.round(metaSede - asignado);
  return { tipo: Math.abs(diferencia) < 1 ? "cuadra" : diferencia > 0 ? "faltan" : "pasa", asignado, metaSede, diferencia };
}

// ───────────────────────── gráfico ─────────────────────────

export type DiaGrafico = {
  fecha: string;
  /** «Lun» en la semana; el número del día (solo algunos) en el mes. */
  etiqueta: string;
  /** «lunes 28» para el tooltip y la tabla. */
  titulo: string;
  /** Lo vendido ese día; `null` si el día todavía no llega. */
  valor: number | null;
  meta: number | null;
  hoy: boolean;
};

/** Las barras de los últimos 7 días y las del mes entero, con la meta de la sede de cada día. */
export function serieParaGrafico(serie: DiaSerie[], hoy: string): { semana: DiaGrafico[]; mes: DiaGrafico[] } {
  const porFecha = new Map(serie.map((d) => [d.fecha, d]));
  const dia = (fecha: string, etiqueta: string): DiaGrafico => {
    const d = porFecha.get(fecha);
    const n = Number(fecha.slice(8, 10));
    return {
      fecha,
      etiqueta,
      titulo: `${DIAS_LARGOS[diaDeSemana(fecha)]} ${n}`,
      valor: fecha > hoy ? null : (d?.total ?? 0),
      meta: d?.metaSede ?? null,
      hoy: fecha === hoy,
    };
  };
  const semana = Array.from({ length: 7 }, (_, i) => {
    const f = sumarDias(hoy, i - 6);
    return dia(f, DIAS_CORTOS[diaDeSemana(f)]);
  });
  const ini = primerDiaDelMes(hoy);
  const fin = ultimoDiaDelMes(hoy);
  const mes = Array.from({ length: diasEntreFechas(ini, fin) + 1 }, (_, i) => {
    const f = sumarDias(ini, i);
    const n = i + 1;
    return dia(f, n === 1 || n % 5 === 0 || f === fin ? String(n) : "");
  });
  return { semana, mes };
}

/** Ventas y meta acumuladas día a día (para «¿llego o no llego?»). La línea de ventas se corta en hoy. */
export function acumulado(dias: DiaGrafico[]): { ventas: (number | null)[]; meta: number[] } {
  let v = 0;
  let m = 0;
  const ventas: (number | null)[] = [];
  const meta: number[] = [];
  for (const d of dias) {
    m += d.meta ?? 0;
    meta.push(m);
    if (d.valor === null) ventas.push(null);
    else {
      v += d.valor;
      ventas.push(v);
    }
  }
  return { ventas, meta };
}

// ───────────────────────── cambiar la meta ─────────────────────────

export type MotivoMeta = "cambia_horario" | "capacitacion" | "cubre_otra_tienda" | "vuelve_de_descanso" | "otro";

export const MOTIVOS_META: { valor: MotivoMeta; etiqueta: string }[] = [
  { valor: "cambia_horario", etiqueta: "Cambia su horario" },
  { valor: "capacitacion", etiqueta: "Está en capacitación" },
  { valor: "cubre_otra_tienda", etiqueta: "Cubre otra tienda" },
  { valor: "vuelve_de_descanso", etiqueta: "Vuelve de descanso" },
  { valor: "otro", etiqueta: "Otro (cuéntalo en una línea)" },
];

export const ETIQUETA_MOTIVO: Record<string, string> = {
  ...Object.fromEntries(MOTIVOS_META.map((m) => [m.valor, m.etiqueta])),
  automatica: "Volvió a la meta automática",
};

export const LARGO_DETALLE_META = 80;

export type ResultadoCambio =
  | { ok: true; meta: number | null; motivo: MotivoMeta | null; detalle: string | null }
  | { ok: false; campo: "meta" | "motivo" | "detalle"; error: string };

/** Lo que tipeó la persona en el campo de soles: «12,500», «12500.5» o «S/ 12 500». `NaN` si no se entiende. */
export function leerSoles(texto: string): number {
  const limpio = texto.replace(/[^\d.,]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (limpio === "") return Number.NaN;
  // El signo no se pierde: «-5» tiene que rechazarse como negativo, no leerse como 5.
  return /^\s*-/.test(texto) ? -Number(limpio) : Number(limpio);
}

/**
 * Las mismas reglas que `fijar_meta_persona` (la base las hace cumplir; esto es para decirlo antes de enviar):
 * mayor que cero, sin pasar de la meta de la sede en el mes, con motivo, y «otro» cuenta qué. Volver a la
 * automática no pide motivo.
 */
export function validarCambioMeta(entrada: {
  metaTexto: string;
  volverAutomatica: boolean;
  motivo: MotivoMeta | "";
  detalle: string;
  metaSedeMes: number | null;
}): ResultadoCambio {
  if (entrada.volverAutomatica) return { ok: true, meta: null, motivo: null, detalle: null };
  const meta = leerSoles(entrada.metaTexto);
  if (!Number.isFinite(meta) || meta <= 0) return { ok: false, campo: "meta", error: "La meta tiene que ser mayor que cero." };
  if (entrada.metaSedeMes !== null && meta > entrada.metaSedeMes) {
    return { ok: false, campo: "meta", error: "La meta de una persona no puede pasar de la de la tienda en el mes." };
  }
  if (!entrada.motivo) return { ok: false, campo: "motivo", error: "Elige el motivo: queda anotado en el historial." };
  const detalle = entrada.detalle.trim();
  if (entrada.motivo === "otro" && detalle === "") return { ok: false, campo: "detalle", error: "Cuenta el motivo en una línea." };
  if (detalle.length > LARGO_DETALLE_META) {
    return { ok: false, campo: "detalle", error: `Tiene que caber en ${LARGO_DETALLE_META} letras.` };
  }
  return { ok: true, meta: Math.round(meta * 100) / 100, motivo: entrada.motivo, detalle: detalle === "" ? null : detalle };
}

/**
 * ¿Puede esta cuenta tocar la meta de esa fila? Nadie cambia la suya salvo un Admin (D-147), y sin meta de la sede o sin horas
 * ni asistencia no hay meta que ajustar. `motivo` es la frase para el botón apagado (el permiso de verdad lo pone la base).
 */
export function puedeEditarMeta(entrada: {
  personaFilaId: string;
  personaCuentaId: string | null;
  esAdmin: boolean;
  metaSedeMes: number | null;
  metaAutoMes: number | null;
}): { puede: true } | { puede: false; motivo: string } {
  if (entrada.metaSedeMes === null || entrada.metaSedeMes <= 0) return { puede: false, motivo: "Primero carga la meta de la sede en Configuración" };
  if (entrada.personaCuentaId !== null && entrada.personaFilaId === entrada.personaCuentaId && !entrada.esAdmin) {
    return { puede: false, motivo: "Tu propia meta la cambia un Admin" };
  }
  if (entrada.metaAutoMes === null || entrada.metaAutoMes <= 0) return { puede: false, motivo: "Sin horas programadas este mes no hay meta que ajustar" };
  return { puede: true };
}
