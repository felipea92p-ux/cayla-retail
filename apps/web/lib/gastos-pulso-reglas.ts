// Gastos en camino A («La respuesta», Felipe 2026-10-15): arriba de las cifras, «¿en qué se fue la plata?» con lo gastado
// en el mes y una frase que lo dice en tienda («7 de cada 10 soles fueron alquiler»), y la bandeja: lo que falta revisar,
// de a una cosa (una salida de caja que nadie dijo qué fue, un gasto fijo del mes que todavía no está registrado).
// Lógica pura sobre lo que `fn_gastos_panel`, `fn_egresos_sin_clasificar` y `fn_gastos_fijos_mes` ya traen.

import type { TonoChip } from "@/components/ui/Chip";
import { diaLima } from "./fechas-lima";
import { soles } from "./flujo-caja-reglas";
import { mesDe, solesRedondo, textoMes, type EgresoPorClasificar, type GastoFijoMes, type PanelGastos } from "./gastos-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- 1. ¿En qué se fue la plata? ---------------------------------------------------------------------------------------

export type Gastaste = {
  total: number;
  n: number;
  /** «7 de cada 10 soles fueron alquiler» o «lo que más pesó: …». */
  frase: string;
  /** Las tres categorías que más pesaron, con su parte. */
  mayores: { nombre: string; monto: number; parte: number }[];
};

/** `cuando` = el mes que se mira y el día de hoy; sin él, se asume el mes de hoy. La frase dice de qué mes habla («en septiembre 2026»). */
export function gastastePulso(panel: PanelGastos | null, cuando?: { mes: string; hoy: string }): Gastaste | null {
  if (!panel) return null;
  const dichoElMes = !cuando || cuando.mes === mesDe(cuando.hoy) ? "este mes" : `en ${textoMes(cuando.mes)}`;
  const total = r2(panel.total);
  const mayores = [...panel.porCategoria]
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 3)
    .map((c) => ({ nombre: c.nombre, monto: r2(c.monto), parte: total > 0 ? c.monto / total : 0 }));
  let frase: string;
  if (total <= 0 || mayores.length === 0) frase = `Todavía no hay gastos registrados ${dichoElMes}.`;
  else {
    const top = mayores[0]!;
    const de10 = Math.round(top.parte * 10);
    frase =
      top.parte >= 0.5
        ? `${de10} de cada 10 soles ${de10 === 1 ? "fue" : "fueron"} ${top.nombre.toLowerCase()}.`
        : `Lo que más pesó: ${mayores.map((m) => `${m.nombre.toLowerCase()} (${Math.round(m.parte * 100)} %)`).join(", ")}.`;
  }
  return { total, n: panel.n, frase, mayores };
}

/** Lo que la cifra grande todavía no cuenta: los gastos fijos del mes que nadie ha registrado (los que ya pasaron y los que aún no llegan). */
export type FijosPorConfirmar = {
  n: number;
  /** Lo que suman con el monto de siempre. */
  monto: number;
  /** Algún monto es una referencia (un fijo de monto variable): se escribe con «~». */
  aproximado: boolean;
};

/**
 * Un fijo solo cuenta cuando alguien registra lo que llegó de verdad, así que la cifra de la cabecera no incluye el alquiler ni la luz
 * hasta entonces. Un chip bajo la cifra lo dice en vez de dejar que S/ X se lea como el mes completo (Felipe, /pantalla 2026-10-22, tarea #2;
 * desde ADR-0493 vive en la respuesta del telar, no en el titular que ese ADR retiró).
 * `null` si no queda ninguno por confirmar.
 */
export function fijosPorConfirmar(fijos: readonly GastoFijoMes[]): FijosPorConfirmar | null {
  const pendientes = fijos.filter((f) => f.estado !== "registrado");
  if (pendientes.length === 0) return null;
  return {
    n: pendientes.length,
    monto: r2(pendientes.reduce((s, f) => s + f.monto, 0)),
    aproximado: pendientes.some((f) => f.montoVariable),
  };
}

/** El chip bajo la cifra grande: «Sin contar 5 fijos por confirmar (~S/ 1,476)». Vacío si no queda ninguno. */
export function chipDeFijosPorConfirmar(p: FijosPorConfirmar | null): { texto: string; tono: TonoChip }[] {
  if (!p) return [];
  const cuantos = p.n === 1 ? "1 fijo por confirmar" : `${p.n} fijos por confirmar`;
  return [{ texto: `Sin contar ${cuantos} (${p.aproximado ? "~" : ""}${solesRedondo(p.monto)})`, tono: "ambar" }];
}

// ---- 2. La bandeja: lo que falta revisar, de a uno -------------------------------------------------------------------------

export type CosaPorRevisar =
  | { clave: string; tipo: "egreso"; titulo: string; detalle: string; monto: number; accion: "Clasificar"; egreso: EgresoPorClasificar }
  | { clave: string; tipo: "fijo"; titulo: string; detalle: string; monto: number; accion: "Registrar"; fijo: GastoFijoMes };

export type Bandeja = {
  cosas: CosaPorRevisar[];
  n: number;
  frase: string;
  /** Lo que dice la bajada cuando no hay nada atrasado: sin prometer lo que no se miró (los cajones en «De la empresa», los fijos que aún no llegan). */
  bajadaVacia: string;
  /** «Al día» solo si de verdad no queda nada; con fijos por llegar o sin haber leído los cajones, «Sin atrasos». */
  chip: string;
};

/**
 * Primero las salidas de caja (la más vieja primero), después los fijos del mes que ya pasaron sin registrarse.
 * `egresosLeidos` = false en «De la empresa»: esa vista no lee ningún cajón y no puede decir que todo está clasificado (revisión del
 * 22-oct). Los fijos que aún no llegan no son «atrasados», pero tampoco están «registrados»: la bajada lo dice.
 */
export function bandejaPulso(egresos: readonly EgresoPorClasificar[], fijos: readonly GastoFijoMes[], opciones: { egresosLeidos?: boolean } = {}): Bandeja {
  const egresosLeidos = opciones.egresosLeidos ?? true;
  const deEgresos: CosaPorRevisar[] = [...egresos]
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
    .map((e) => ({
      clave: `egreso:${e.id}`,
      tipo: "egreso",
      titulo: e.motivo,
      detalle: `Salió del cajón de ${e.ubicacionNombre} el ${fechaCorta(diaLima(e.creadoEn) ?? "")}${e.nota ? ` · ${e.nota}` : ""}${e.registradoPor ? ` · lo anotó ${e.registradoPor}` : ""}. ¿De qué fue?`,
      monto: e.monto,
      accion: "Clasificar",
      egreso: e,
    }));
  const deFijos: CosaPorRevisar[] = fijos
    .filter((f) => f.estado === "falta")
    .sort((a, b) => a.fechaEsperada.localeCompare(b.fechaEsperada))
    .map((f) => ({
      clave: `fijo:${f.id}`,
      tipo: "fijo",
      titulo: f.descripcion,
      // Un fijo sin tienda trae «De la empresa» como nombre: «de De la empresa» se leía mal.
      detalle: `${f.categoriaNombre} de ${f.ubicacionId ? f.ubicacionNombre : "la empresa"}${f.proveedorNombre ? ` · ${f.proveedorNombre}` : ""}: se esperaba el ${fechaCorta(f.fechaEsperada)} y todavía no está registrado.`,
      monto: f.monto,
      accion: "Registrar",
      fijo: f,
    }));
  const cosas = [...deEgresos, ...deFijos];
  const n = cosas.length;
  const frase = n === 0 ? "Listo, no te falta nada por revisar." : n === 1 ? "Te falta 1 cosa por revisar." : `Te faltan ${n} cosas por revisar.`;

  const porLlegar = fijos.filter((f) => f.estado === "por_llegar").length;
  const quedan = porLlegar === 1 ? "Queda 1 gasto fijo por llegar" : `Quedan ${porLlegar} gastos fijos por llegar`;
  const sinAtrasos = porLlegar > 0 || !egresosLeidos;
  const bajadaVacia = egresosLeidos
    ? porLlegar > 0
      ? `Cada salida de caja ya dice qué fue. ${quedan} este mes.`
      : fijos.length > 0
        ? "Cada salida de caja ya dice qué fue y los fijos del mes están registrados."
        : "Cada salida de caja ya dice qué fue."
    : porLlegar > 0
      ? `Aquí no se leen las salidas de caja: míralas en «Todas las sedes». ${quedan} este mes.`
      : "No hay fijos atrasados. Las salidas de caja son de cada tienda: míralas en «Todas las sedes».";
  return {
    cosas,
    n,
    frase: n === 0 && sinAtrasos ? "No hay nada atrasado por revisar." : frase,
    bajadaVacia,
    chip: n > 0 ? `${n} por revisar` : sinAtrasos ? "Sin atrasos" : "Al día",
  };
}

/** Lo que suma lo pendiente, en palabras («S/ 1,230 entre 4 cosas»). */
export function montoBandeja(b: Bandeja): string {
  const m = r2(b.cosas.reduce((s, c) => s + c.monto, 0));
  return b.n === 0 ? "" : `${soles(m)} entre ${b.n === 1 ? "1 cosa" : `${b.n} cosas`}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
function fechaCorta(iso: string): string {
  if (!iso) return "";
  return `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
}
