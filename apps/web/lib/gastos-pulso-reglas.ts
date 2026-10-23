// Gastos en camino A («La respuesta», Felipe 2026-10-15): arriba de las cifras, «¿en qué se fue la plata?» con lo gastado
// en el mes y una frase que lo dice en tienda («7 de cada 10 soles fueron alquiler»), y la bandeja: lo que falta revisar,
// de a una cosa (una salida de caja que nadie dijo qué fue, un gasto fijo del mes que todavía no está registrado).
// Lógica pura sobre lo que `fn_gastos_panel`, `fn_egresos_sin_clasificar` y `fn_gastos_fijos_mes` ya traen.

import { diaLima } from "./fechas-lima";
import { soles } from "./flujo-caja-reglas";
import type { EgresoPorClasificar, GastoFijoMes, PanelGastos } from "./gastos-reglas";

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

export function gastastePulso(panel: PanelGastos | null): Gastaste | null {
  if (!panel) return null;
  const total = r2(panel.total);
  const mayores = [...panel.porCategoria]
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 3)
    .map((c) => ({ nombre: c.nombre, monto: r2(c.monto), parte: total > 0 ? c.monto / total : 0 }));
  let frase: string;
  if (total <= 0 || mayores.length === 0) frase = "Todavía no hay gastos registrados este mes.";
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

// ---- 2. La bandeja: lo que falta revisar, de a uno -------------------------------------------------------------------------

export type CosaPorRevisar =
  | { clave: string; tipo: "egreso"; titulo: string; detalle: string; monto: number; accion: "Clasificar"; egreso: EgresoPorClasificar }
  | { clave: string; tipo: "fijo"; titulo: string; detalle: string; monto: number; accion: "Registrar"; fijo: GastoFijoMes };

export type Bandeja = { cosas: CosaPorRevisar[]; n: number; frase: string };

/** Primero las salidas de caja (la más vieja primero), después los fijos del mes que ya pasaron sin registrarse. */
export function bandejaPulso(egresos: readonly EgresoPorClasificar[], fijos: readonly GastoFijoMes[]): Bandeja {
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
      detalle: `${f.categoriaNombre} de ${f.ubicacionNombre}${f.proveedorNombre ? ` · ${f.proveedorNombre}` : ""}: venció el ${fechaCorta(f.fechaEsperada)} y todavía no está registrado.`,
      monto: f.monto,
      accion: "Registrar",
      fijo: f,
    }));
  const cosas = [...deEgresos, ...deFijos];
  const n = cosas.length;
  const frase = n === 0 ? "Listo, no te falta nada por revisar." : n === 1 ? "Te falta 1 cosa por revisar." : `Te faltan ${n} cosas por revisar.`;
  return { cosas, n, frase };
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
