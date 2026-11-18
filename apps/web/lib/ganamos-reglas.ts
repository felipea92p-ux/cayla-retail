// Estados financieros ▸ Ganancias y pérdidas (ganancias y pérdidas; ADR-0585, actividad 4).
//
// PROMETE: la cascada de la venta a la ganancia en palabras de tienda (los gastos agrupados en lo que la persona reconoce, no en cuentas),
// cada grupo con lo planeado en el presupuesto y cuánto se pasa; lo que dejó cada sede; las campañas del mes y las recomendaciones.
// ASUME: toda cifra viene de la base (`fn_estado_resultados`, `fn_presupuesto_vs_real`, `fn_campanas_reporte`). Aquí no se calcula plata:
// se agrupa, se compara contra lo planeado y se escribe. La cascada siempre suma: lo que los grupos no nombran va a un tramo propio.
// Las cuentas contables NO se muestran (Felipe 2026-10-30: solo en lo que se descarga); cada grupo dice sus cuentas por su nombre.

import { soles, solesCentimos } from "./flujo-caja-reglas";
import { colorDeSede, nombreCortoSede, SEDE_EMPRESA, SEDE_TODAS, type ClaveSede, type ColorSede } from "./finanzas-telar-reglas";
import { IGV_DE_CLAURE } from "./cuenta-claure-reglas";
import { metaConIgv, ventaParaDecir } from "./igv-ventas-reglas";
import type { FilaCascada } from "./cascada-estados-reglas";
import type { FilaPpto } from "./presupuesto-reglas";
import type { TramoCascada } from "./pulso-reglas";
import type { CampanaFila, FilaER } from "./resultados-reglas";

/** Desde cuánto un desvío contra lo planeado merece decirse: lo que se mira de un presupuesto son los desvíos grandes. */
export const DESVIO_QUE_IMPORTA = 0.1;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que se dice de las ventas sin IGV, la base de toda la pantalla. */
export const NOTA_VENTAS = "Sin IGV.";

/**
 * El IGV de tus ventas (ADR-0624, «regla pareja»): se resta siempre, porque es de SUNAT. Que hoy no salga de la caja no lo vuelve ganancia: se descuenta del saldo a favor, que ya
 * está en el Balance. Una línea, para el informe y la cascada.
 */
export const NOTA_IGV_VENTAS = "Le toca a SUNAT. Mientras tengas saldo a favor no sale de tu caja: se descuenta de ese saldo.";

/**
 * Lo vendido con su IGV: solo se muestra para que se vea de dónde sale lo vendido. No es ingreso de CAYLA. Se llama «Vendiste con IGV» y no «Cobraste»: lo cobrado es la plata
 * que entró (Caja y el Flujo cuentan también los abonos de apartados), y esta cifra son ventas (Felipe, /formidable 2026-11-07).
 */
export const NOMBRE_VENDISTE_CON_IGV = "Vendiste con IGV";
export const NOTA_VENDISTE_CON_IGV = "Todo lo que se vendió con el IGV que pagaron tus clientes, también las prendas de CLAURE, menos lo devuelto y lo anulado.";
/** Lo vendido de CLAURE: se cobra en la tienda con el RUC de CAYLA, pero la prenda es suya (Felipe 2026-11-09). */
export const NOMBRE_CLAURE_VENTAS = "Prendas de CLAURE";
export const NOTA_CLAURE_VENTAS = `Lo vendido de CLAURE, sin IGV. Se cobró en la tienda, pero es de CLAURE: no es ingreso de CAYLA. Su IGV va en la fila de arriba. ${IGV_DE_CLAURE}`;
/** El nombre de la fila del IGV de las ventas: el mismo en el informe y en la cascada. */
export const NOMBRE_IGV_VENTAS = "IGV de tus ventas";

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

/** La fila «Vendiste con IGV» solo existe si se leyó un IGV: la cascada y la meta preguntan lo mismo. */
const llevaFilaConIgv = (f: Pick<FilaER, "igvCobrado">) => Math.abs(f.igvCobrado ?? 0) >= 0.005;

/**
 * La cascada de Ganancias y pérdidas: (cobraste → IGV de tus ventas →) vendiste → lo que costaron esas prendas → sueldos → cada grupo de gastos → desgaste → queda. Cada gasto con su
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
  const igv = f.igvCobrado ?? 0;
  const claure = f.claureSinIgv ?? 0;
  // Con el IGV de las ventas leído, la cascada parte de lo cobrado, le resta el IGV y llega a lo vendido como subtotal: la suma de los tramos no cambia (ADR-0624).
  const tramos: TramoCascada[] =
    llevaFilaConIgv(f)
      ? [
          { clave: "con_igv", nombre: NOMBRE_VENDISTE_CON_IGV, monto: r2(f.ventas + igv + claure), tipo: "entra", detalle: NOTA_VENDISTE_CON_IGV },
          { clave: "igv", nombre: NOMBRE_IGV_VENTAS, monto: Math.abs(igv), tipo: igv > 0 ? "sale" : "entra", detalle: NOTA_IGV_VENTAS },
          ...(Math.abs(claure) >= 0.005 ? [{ clave: "claure", nombre: NOMBRE_CLAURE_VENTAS, monto: Math.abs(claure), tipo: claure > 0 ? "sale" : "entra", detalle: NOTA_CLAURE_VENTAS } as TramoCascada] : []),
          { clave: "ventas", nombre: "Vendiste", monto: f.ventas, tipo: "entra", subtotal: true, detalle: NOTA_VENTAS },
        ]
      : [{ clave: "ventas", nombre: "Vendiste", monto: f.ventas, tipo: "entra", detalle: NOTA_VENTAS }];

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
  const explicado = tramos.filter((t) => !t.subtotal).reduce((s, t) => s + (t.tipo === "entra" ? t.monto : -t.monto), 0);
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

/**
 * La meta como se dice (tarea 53): con IGV en la fila «Vendiste con IGV» y, sin esa fila, sin IGV y diciéndolo. El avance no se toca: la meta y lo vendido se comparan sin IGV. La meta es de CAYLA: si la
 * columna tiene ventas de CLAURE, el rótulo avisa que no se compara con todo lo de esa fila. «Falta» se convierte igual que la meta, para que las dos se puedan restar a ojo.
 */
export function metaParaDecir(m: Pick<NonNullable<ReturnType<typeof metaDeVentas>>, "meta" | "real">, f: FilaER | null): { fila: "con_igv" | "ventas"; meta: number; falta: number; rotulo: string } {
  if (!f || !llevaFilaConIgv(f)) return { fila: "ventas", meta: m.meta, falta: r2(m.meta - m.real), rotulo: "sin IGV" };
  return { fila: "con_igv", meta: metaConIgv(m.meta), falta: metaConIgv(m.meta - m.real), rotulo: ventaParaDecir(f).rotulo };
}

/**
 * Las filas de la cascada con la meta en la fila que le toca. La meta es de CAYLA: si la fila trae también lo de CLAURE (Lima), su monto no se compara con la meta, así que el detalle empieza por la cifra
 * que sí se compara.
 */
export function filasConMeta(filas: readonly FilaCascada[], m: ReturnType<typeof metaDeVentas>, f: FilaER | null, enCurso: boolean): FilaCascada[] {
  if (!m) return [...filas];
  const dicha = metaParaDecir(m, f);
  const conClaure = dicha.fila === "con_igv" && f !== null && Math.abs(f.claureSinIgv ?? 0) >= 0.005;
  const meta = conClaure ? `Lo de CAYLA con IGV: ${solesCentimos(ventaParaDecir(f).vendido)} · Meta: ${solesCentimos(dicha.meta)}` : `Meta ${dicha.rotulo}: ${solesCentimos(dicha.meta)}`;
  const detalle = `${meta} · ${enCurso ? "al ritmo de hoy, " : ""}${Math.round(m.avance * 100)} %`;
  return filas.map((x) => (x.clave === dicha.fila ? { ...x, detalle } : x));
}

/** Lo que dejó cada sede (sin CAYLA, que es la suma): de la que más deja a la que menos. */
export type DejaSede = { clave: ClaveSede; nombre: string; color: ColorSede; resultado: number; ventas: number; margen: number } & Partial<Pick<FilaER, "igvCobrado" | "claureSinIgv">>;
export function porSede(filas: readonly FilaER[]): DejaSede[] {
  return filas
    .filter((f) => f.unidad !== "consolidado")
    .map((f) => ({
      clave: f.unidad === "empresa" ? SEDE_EMPRESA : (f.ubicacionId ?? ""),
      nombre: f.unidad === "empresa" ? "De la empresa" : f.nombre,
      color: f.unidad === "empresa" ? ("emp" as const) : colorDeSede({ nombre: f.nombre, tipo: f.unidad }),
      resultado: f.resultado,
      ventas: f.ventas,
      margen: f.margen,
      igvCobrado: f.igvCobrado,
      claureSinIgv: f.claureSinIgv,
    }))
    .filter((s) => s.clave)
    .sort((a, b) => b.resultado - a.resultado);
}

/** El orden del telar (Trujillo, Arequipa, Lima, otras, Taller, Empresa), el mismo de la barra de sedes. */
const ORDEN_COLOR: Record<ColorSede, number> = { tru: 0, aqp: 1, lim: 2, otra: 3, tal: 4, emp: 5 };

/** «Lo que dejó cada sede» como la cascada de la maqueta: cada sede nace en cero con su color de hilo y lleva a su sede. */
export function filasDeSedes(sedes: readonly DejaSede[], hrefDe: (clave: ClaveSede) => string): FilaCascada[] {
  return [...sedes]
    .sort((a, b) => ORDEN_COLOR[a.color] - ORDEN_COLOR[b.color] || a.nombre.localeCompare(b.nombre, "es"))
    .map((s) => ({
      clave: s.clave,
      nombre: s.clave === SEDE_EMPRESA ? "Empresa" : nombreCortoSede(s.nombre),
      valor: s.resultado,
      tipo: "total" as const,
      color: s.color === "otra" ? "var(--color-taupe)" : `var(--color-sede-${s.color})`,
      href: hrefDe(s.clave),
    }));
}

/** Lo que dice Ganancias sin filas de campañas: «no hubo» solo si de verdad se pudieron leer. */
export function campanasSinFilas(falla: string | null, nombreDelMes: string): { falla: boolean; texto: string } {
  return falla ? { falla: true, texto: `No se pudieron leer las campañas de ${nombreDelMes}.` } : { falla: false, texto: `No hubo campañas en ${nombreDelMes}.` };
}

/** Las campañas que corrieron en el mes (alguno de sus días cae dentro) y ya terminaron o siguen. */
export function campanasDelMes(campanas: readonly CampanaFila[], mes: string): CampanaFila[] {
  const ini = `${mes}-01`;
  const fin = `${mes}-31`;
  return campanas.filter((c) => (c.momento === "pasada" || c.momento === "en_curso") && c.desde && c.hasta && c.desde <= fin && c.hasta >= ini);
}

/**
 * Cuánto hay que vender para cubrir los gastos de las fechas que se miran, con su margen de hoy: es «al mes» solo en un mes ya terminado. `null` sin margen.
 * Con IGV si la fila lo trae: el margen se calcula sin IGV y se convierte antes de redondear, o la centena se correría (tarea 19).
 */
export function ventaQueCubre(f: Pick<FilaER, "ventas" | "margen" | "resultado"> & Partial<Pick<FilaER, "igvCobrado" | "claureSinIgv">>): number | null {
  if (f.ventas <= 0 || f.margen <= 0) return null;
  const gastos = f.margen - f.resultado;
  return Math.ceil((gastos / (f.margen / f.ventas)) * ventaParaDecir(f).factor / 100) * 100;
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
 * Qué te recomiendo en Ganancias y pérdidas (hasta 3, la más urgente arriba). Cada una sale de una cifra que la pantalla ya muestra: una sede que
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
  unMes = true,
  ventaDelMes,
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
  /** Se mira un mes. Con otras fechas no se afirma ninguna cifra mensual. */
  unMes?: boolean;
  /** Mes en curso: cuánto hay que vender en el mes entero, por sede (`ventaParaElMesEntero`); `null` si no se pudo leer. */
  ventaDelMes?: (clave: ClaveSede) => number | null;
  href: (ruta: string, sede?: ClaveSede) => string;
}): Recomendacion[] {
  const out: Recomendacion[] = [];
  // 1. Lo que pierde plata. Mirando CAYLA entera, cada tienda que pierde; mirando una sede, ella.
  const pierden: DejaSede[] = sedes
    ? sedes.filter((s) => s.resultado < 0 && s.ventas > 0)
    : fila && fila.resultado < 0 && fila.ventas > 0
      ? [{ clave: "", nombre: fila.nombre, color: "otra", resultado: fila.resultado, ventas: fila.ventas, margen: fila.margen, igvCobrado: fila.igvCobrado, claureSinIgv: fila.claureSinIgv }]
      : [];
  // De la que más pierde a la que menos: `porSede` viene al revés, y el corte dejaba fuera a la peor.
  for (const s of [...pierden].sort((a, b) => a.resultado - b.resultado).slice(0, 2)) {
    // Lo que necesita y lo que lleva van en la misma base, y la frase la dice una sola vez.
    const lleva = ventaParaDecir(s);
    const llevaDicho = `${soles(lleva.vendido)}, ${lleva.rotulo}`;
    const texto = !unMes
      ? "En estas fechas, sus gastos pasan lo que deja la venta."
      : enCurso
        ? ((c) => (c === null ? `Con lo que va del mes, sus gastos pasan lo que deja la venta. Lleva ${llevaDicho}.` : `Para cubrir el mes entero necesita vender ${soles(c)}; lleva ${llevaDicho}.`))(ventaDelMes?.(s.clave) ?? null)
        : ((c) => (c ? `Para cubrir lo que cuesta tenerla abierta necesita vender ${soles(c)} al mes; este mes vendió ${llevaDicho}.` : "Sus gastos pasan lo que deja la venta."))(ventaQueCubre(s));
    out.push({
      clave: `pierde-${s.clave || "sede"}`,
      tono: "error",
      prioridad: 1,
      titulo: `${s.nombre} pierde ${soles(-s.resultado)}`,
      texto,
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
    const dicha = metaParaDecir(meta, fila);
    out.push({
      clave: "meta",
      tono: "atencion",
      prioridad: 4,
      titulo: enCurso ? `Al ritmo de hoy, llegas al ${Math.round(meta.avance * 100)} % de la meta` : `Vendiste el ${Math.round(meta.avance * 100)} % de la meta`,
      texto: `La meta, ${dicha.rotulo}, es ${soles(dicha.meta)}; ${enCurso ? "faltarían" : "faltaron"} ${soles(dicha.falta)}.`,
    });
  }
  if (!out.length) {
    out.push({ clave: "tranquilo", tono: "exito", prioridad: 9, titulo: "Nada fuera de lo normal", texto: "Ningún gasto se pasa más del 10 % de lo planeado y ninguna sede pierde plata." });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}
