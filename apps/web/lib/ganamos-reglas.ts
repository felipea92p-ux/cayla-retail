// Estados financieros ▸ ¿Ganamos? (ganancias y pérdidas; ADR-0585, actividad 4).
//
// PROMETE: la cascada de la venta a la ganancia en palabras de tienda (los gastos agrupados en lo que la persona reconoce, no en cuentas),
// cada grupo con lo planeado en el presupuesto y cuánto se pasa; lo que dejó cada sede; las campañas del mes y las recomendaciones.
// ASUME: toda cifra viene de la base (`fn_estado_resultados`, `fn_presupuesto_vs_real`, `fn_campanas_reporte`). Aquí no se calcula plata:
// se agrupa, se compara contra lo planeado y se escribe. La cascada siempre suma: lo que los grupos no nombran va a un tramo propio.
// Las cuentas contables NO se muestran (Felipe 2026-10-30: solo en lo que se descarga); cada grupo dice sus cuentas por su nombre.

import { soles } from "./flujo-caja-reglas";
import { SEDE_EMPRESA, SEDE_TODAS, type ClaveSede } from "./finanzas-telar-reglas";
import type { FilaPpto } from "./presupuesto-reglas";
import type { TramoCascada } from "./pulso-reglas";
import type { CampanaFila, FilaER } from "./resultados-reglas";

/** Desde cuánto un desvío contra lo planeado merece decirse: lo que se mira de un presupuesto son los desvíos grandes. */
export const DESVIO_QUE_IMPORTA = 0.1;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Los gastos (que no son sueldos ni desgaste), agrupados como los dice una tienda. Lo que no está aquí cae en «Otros gastos». */
const GRUPOS: readonly { clave: string; nombre: string; cuentas: readonly string[] }[] = [
  { clave: "local", nombre: "Local y servicios", cuentas: ["635", "636", "634", "651"] },
  { clave: "publicidad", nombre: "Publicidad, envíos y comisiones", cuentas: ["637", "631", "639"] },
  { clave: "administracion", nombre: "Administración", cuentas: ["632", "64", "656"] },
  // Una diferencia de caja no es un gasto que se decide: va aparte para que se vea (auditoría del Resumen, hallazgo 14).
  { clave: "caja", nombre: "Diferencias de caja", cuentas: ["6599", "6598"] },
];
const PROPIAS = new Set(["62", "681", "655"]);

/** Las filas del presupuesto de la sede de la barra: todas → CAYLA, empresa → «De la empresa». */
export function pptoDeLaSede(ppto: readonly FilaPpto[], sede: ClaveSede): FilaPpto[] {
  if (sede === SEDE_TODAS) return ppto.filter((p) => p.unidad === "consolidado");
  if (sede === SEDE_EMPRESA) return ppto.filter((p) => p.unidad === "empresa");
  return ppto.filter((p) => p.ubicacionId === sede);
}

/** Lo que se compara contra el tope: en el mes en curso, a dónde llega al ritmo de hoy; en uno cerrado, lo real. */
const comparable = (p: Pick<FilaPpto, "momento" | "proyeccion" | "aLaFecha">) => (p.momento === "en_curso" ? (p.proyeccion ?? p.aLaFecha) : p.aLaFecha);

/** El desvío contra lo planeado, como fracción (0,15 = se pasa 15 %). `null` sin tope. */
export function desvio(real: number, plan: number | null | undefined): number | null {
  if (!plan || plan <= 0) return null;
  return (real - plan) / plan;
}

/**
 * La cascada de ¿Ganamos?: vendiste → lo que costaron esas prendas → sueldos → cada grupo de gastos → desgaste → queda. Cada gasto con su
 * tope lleva `plan` y `desvio` (contra la proyección en el mes en curso) y sus cuentas, para abrirlo.
 */
export function cascadaGanamos(f: FilaER, ppto: readonly FilaPpto[]): TramoCascada[] {
  const tope = new Map(ppto.filter((p) => p.tipo === "tope").map((p) => [p.linea, p]));
  const linea = (cuenta: string, nombre: string, real: number) => ({ nombre, real, plan: tope.get(cuenta)?.presupuesto ?? null });
  const conPlan = (t: TramoCascada, cuentas: readonly string[]): TramoCascada => {
    const filas = cuentas.map((c) => tope.get(c)).filter((p): p is FilaPpto => !!p && p.presupuesto !== null);
    if (!filas.length) return t;
    const plan = filas.reduce((a, p) => a + (p.presupuesto ?? 0), 0);
    const comp = filas.reduce((a, p) => a + comparable(p), 0);
    return { ...t, plan, desvio: desvio(comp, plan) ?? undefined };
  };
  const detalle = f.detalleGastos.filter((g) => g.monto !== 0);
  const tramos: TramoCascada[] = [{ clave: "ventas", nombre: "Vendiste", monto: f.ventas, tipo: "entra", detalle: "Sin IGV: ese 18 % es de SUNAT." }];

  const costo = f.costo + f.fletes + f.mermas;
  if (costo > 0) {
    tramos.push({
      clave: "costo",
      nombre: "Lo que costaron esas prendas",
      monto: costo,
      tipo: "sale",
      lineas: [
        { nombre: "La ropa vendida", real: f.costo, plan: null },
        { nombre: "Fletes de la mercadería", real: f.fletes, plan: null },
        { nombre: "Prendas perdidas o dañadas", real: f.mermas, plan: null },
      ].filter((l) => l.real > 0),
    });
  }
  if (f.planilla > 0) tramos.push(conPlan({ clave: "planilla", nombre: "Sueldos", monto: f.planilla, tipo: "sale", detalle: f.planillaNota ?? undefined }, ["62"]));

  const enGrupo = new Set(GRUPOS.flatMap((g) => g.cuentas));
  for (const g of GRUPOS) {
    const suyas = detalle.filter((d) => g.cuentas.includes(d.cuenta));
    const monto = r2(suyas.reduce((a, d) => a + d.monto, 0));
    if (monto === 0) continue;
    tramos.push(conPlan({ clave: g.clave, nombre: g.nombre, monto: Math.abs(monto), tipo: monto > 0 ? "sale" : "entra", lineas: suyas.map((d) => linea(d.cuenta, d.nombre, d.monto)) }, g.cuentas));
  }
  const otras = detalle.filter((d) => !enGrupo.has(d.cuenta) && !PROPIAS.has(d.cuenta));
  const otrasMonto = r2(otras.reduce((a, d) => a + d.monto, 0));
  if (otrasMonto !== 0) {
    tramos.push(
      conPlan(
        { clave: "otros", nombre: "Otros gastos", monto: Math.abs(otrasMonto), tipo: otrasMonto > 0 ? "sale" : "entra", lineas: otras.map((d) => linea(d.cuenta, d.nombre, d.monto)) },
        otras.map((d) => d.cuenta)
      )
    );
  }
  const bajas = detalle.filter((d) => d.cuenta === "655").reduce((a, d) => a + d.monto, 0);
  const desgaste = r2(f.depreciacion + bajas);
  if (desgaste > 0) {
    tramos.push({
      clave: "desgaste",
      nombre: "Desgaste de máquinas y muebles",
      monto: desgaste,
      tipo: "sale",
      detalle: "No sale plata este mes, pero es un costo real.",
    });
  }
  // Lo que la cascada no nombra (un gasto devuelto, una nota de crédito, un ajuste) va en un tramo propio: sumar los tramos da siempre
  // «te queda». Una cuenta que no cuadra es peor que una línea de más (la misma regla que la cascada del Resumen).
  const explicado = tramos.reduce((s, t) => s + (t.tipo === "entra" ? t.monto : -t.monto), 0);
  const ajuste = r2(f.resultado - explicado);
  if (Math.abs(ajuste) >= 0.5) tramos.push({ clave: "ajustes", nombre: ajuste > 0 ? "Otros ajustes a favor" : "Otros ajustes", monto: Math.abs(ajuste), tipo: ajuste > 0 ? "entra" : "sale", detalle: "Devoluciones, notas de crédito o correcciones del mes." });
  tramos.push({ clave: "queda", nombre: f.resultado >= 0 ? "Ganaste" : "Perdiste", monto: Math.abs(r2(f.resultado)), tipo: "queda", ...(f.resultado < 0 ? { negativo: true } : {}) });
  return tramos;
}

/** La meta de ventas del mes y cuánto va (en el mes en curso, al ritmo de hoy). `null` si no hay meta. */
export function metaDeVentas(ppto: readonly FilaPpto[]): { meta: number; real: number; avance: number; enCurso: boolean } | null {
  const v = ppto.find((p) => p.tipo === "meta" && p.linea === "ventas");
  if (!v || !v.presupuesto) return null;
  const real = comparable(v);
  return { meta: v.presupuesto, real, avance: real / v.presupuesto, enCurso: v.momento === "en_curso" };
}

/** Lo que dejó cada sede (sin CAYLA, que es la suma): de la que más deja a la que menos. */
export type DejaSede = { clave: ClaveSede; nombre: string; resultado: number; ventas: number; margen: number };
export function porSede(filas: readonly FilaER[]): DejaSede[] {
  return filas
    .filter((f) => f.unidad !== "consolidado")
    .map((f) => ({
      clave: f.unidad === "empresa" ? SEDE_EMPRESA : (f.ubicacionId ?? ""),
      nombre: f.unidad === "empresa" ? "De la empresa" : f.nombre,
      resultado: f.resultado,
      ventas: f.ventas,
      margen: f.margen,
    }))
    .filter((s) => s.clave)
    .sort((a, b) => b.resultado - a.resultado);
}

/** Las campañas que corrieron en el mes (alguno de sus días cae dentro) y ya terminaron o siguen. */
export function campanasDelMes(campanas: readonly CampanaFila[], mes: string): CampanaFila[] {
  const ini = `${mes}-01`;
  const fin = `${mes}-31`;
  return campanas.filter((c) => (c.momento === "pasada" || c.momento === "en_curso") && c.desde && c.hasta && c.desde <= fin && c.hasta >= ini);
}

/** Cuánto hay que vender al mes para cubrir lo que cuesta tener la sede abierta, con su margen de hoy. `null` sin margen. */
export function ventaQueCubre(f: Pick<FilaER, "ventas" | "margen" | "resultado">): number | null {
  if (f.ventas <= 0 || f.margen <= 0) return null;
  const gastos = f.margen - f.resultado;
  return Math.ceil(gastos / (f.margen / f.ventas) / 100) * 100;
}

export type Recomendacion = {
  clave: string;
  tono: "error" | "atencion" | "exito" | "info";
  titulo: string;
  texto: string;
  accion?: { texto: string; href: string };
  /** Menor, más arriba. */
  prioridad: number;
};

/**
 * Qué te recomiendo en ¿Ganamos? (hasta 3, la más urgente arriba). Cada una sale de una cifra que la pantalla ya muestra: una sede que
 * pierde, un gasto que se pasa de lo planeado, una campaña que cerró y la meta de ventas. Ninguna inventa una regla.
 * `href` arma la dirección con la sede y el mes de la barra.
 */
export function recomendacionesGanamos({
  fila,
  sedes,
  tramos,
  meta,
  campanas,
  enCurso,
  href,
}: {
  fila: FilaER | null;
  /** Lo que dejó cada sede, si se mira CAYLA entera. */
  sedes: readonly DejaSede[] | null;
  tramos: readonly TramoCascada[];
  meta: ReturnType<typeof metaDeVentas>;
  campanas: readonly CampanaFila[];
  /** El mes de la barra es el de hoy: un desvío o la meta se dicen «al ritmo de hoy». */
  enCurso: boolean;
  href: (ruta: string, sede?: ClaveSede) => string;
}): Recomendacion[] {
  const out: Recomendacion[] = [];
  // 1. Lo que pierde plata. Mirando CAYLA entera, cada tienda que pierde; mirando una sede, ella.
  const pierden: DejaSede[] = sedes
    ? sedes.filter((s) => s.resultado < 0 && s.ventas > 0)
    : fila && fila.resultado < 0 && fila.ventas > 0
      ? [{ clave: "", nombre: fila.nombre, resultado: fila.resultado, ventas: fila.ventas, margen: fila.margen }]
      : [];
  for (const s of pierden.slice(0, 2)) {
    const cubre = ventaQueCubre(s);
    out.push({
      clave: `pierde-${s.clave || "sede"}`,
      tono: "error",
      prioridad: 1,
      titulo: `${s.nombre} pierde ${soles(-s.resultado)}`,
      texto: cubre ? `Para cubrir lo que cuesta tenerla abierta necesita vender ${soles(cubre)} al mes; este mes vendió ${soles(s.ventas)}.` : "Sus gastos pasan lo que deja la venta.",
      ...(sedes && s.clave ? { accion: { texto: `Ver ${s.nombre}`, href: href("/finanzas/reportes", s.clave) } } : {}),
    });
  }
  // 2. El gasto que más se pasa de lo planeado (desde el 10 %).
  const pasados = tramos.filter((t) => t.tipo === "sale" && t.desvio !== undefined && t.desvio >= DESVIO_QUE_IMPORTA && t.plan !== undefined);
  const exceso = (t: TramoCascada) => t.plan! * t.desvio!;
  const peor = [...pasados].sort((a, b) => exceso(b) - exceso(a))[0];
  if (peor) {
    const subio = [...(peor.lineas ?? [])].filter((l) => l.plan !== null && l.real > l.plan).sort((a, b) => b.real - b.plan! - (a.real - a.plan!))[0];
    out.push({
      clave: `pasa-${peor.clave}`,
      tono: "atencion",
      prioridad: 2,
      titulo: `${peor.nombre}: ${Math.round(peor.desvio! * 100)} % sobre lo planeado`,
      texto: `${enCurso ? "Al ritmo de hoy cierra" : "Cerró"} ${soles(exceso(peor))} sobre el plan.${subio ? ` Lo que más subió: ${subio.nombre.toLowerCase()}.` : ""}`,
      accion: { texto: "Ver en Gastos", href: href("/finanzas/gastos") },
    });
  }
  // 3. La campaña que corrió en el mes: si dejó más o menos margen que un día normal.
  const camp = campanas.find((c) => c.margenExtra !== null && Math.round(c.margenExtra) !== 0);
  if (camp) {
    const gano = camp.margenExtra! > 0;
    out.push({
      clave: `campana-${camp.id}`,
      tono: gano ? "exito" : "atencion",
      prioridad: 3,
      titulo: gano ? `${camp.nombre} dejó ${soles(camp.margenExtra!)} más que días normales` : `${camp.nombre} dejó ${soles(-camp.margenExtra!)} menos que días normales`,
      texto: camp.descuentoPct ? `Con ${camp.descuentoPct} % de descuento.${gano ? " Vale la pena repetirla." : " El descuento se comió lo que se vendió de más."}` : gano ? "Vale la pena repetirla." : "Revisa si vale la pena repetirla así.",
      accion: { texto: "Ver la campaña", href: href("/finanzas/reportes/campanas") },
    });
  }
  // 4. La meta de ventas, si va o quedó lejos.
  if (meta && meta.avance < 0.95) {
    out.push({
      clave: "meta",
      tono: "atencion",
      prioridad: 4,
      titulo: enCurso ? `Al ritmo de hoy, llegas al ${Math.round(meta.avance * 100)} % de la meta` : `Vendiste el ${Math.round(meta.avance * 100)} % de la meta`,
      texto: `La meta es ${soles(meta.meta)}; ${enCurso ? "faltarían" : "faltaron"} ${soles(meta.meta - meta.real)}.`,
    });
  }
  if (!out.length) {
    out.push({ clave: "tranquilo", tono: "exito", prioridad: 9, titulo: "Nada fuera de lo normal", texto: "Ningún gasto se pasa más del 10 % de lo planeado y ninguna sede pierde plata." });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}
