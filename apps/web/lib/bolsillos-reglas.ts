import { fechaEnPalabras, loQueHayEnCuentas, type CajaProxima } from "./caja-proxima-reglas";
import { soles, type Proyeccion, type SalidaProy } from "./flujo-caja-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos» (Felipe 2026-11-09; maqueta docs/maquetas/finanzas-resumen-de-punta-a-punta-2026-11/): lo que hay en bancos y
// cajas, partido en bolsillos con dueño, y lo que queda «Libre para usar».
//
// LA REGLA (decidida por Felipe el 2026-11-09, «Todo lo que tiene dueño»): Libre para usar = lo que hay en bancos y cajas
//   − lo que es de CLAURE (lo que Claudia vendió en Lima)
//   − lo que las compradoras tienen del fondo de compras (ADR-0621)
//   − lo que se paga en los próximos 14 días (el equipo, SUNAT, proveedores, alquiler y recibos, lo demás)
//   − el IGV que se va juntando este mes y se paga el mes que viene
//   − la planilla que Dynamic ya pagó y aquí todavía no bajó del banco (ya salió: sigue sumando en las cuentas solo porque falta registrarlo).
// Es la lectura prudente: NO cuenta lo que se va a vender. Si da negativo, es lo que falta para cubrir lo que ya tiene dueño.
//
// UNA SOLA VERDAD. Todo sale de la misma proyección de caja que dibuja «Tu caja» (`fn_flujo_caja_proyeccion`, vía `cajaProxima`): el saldo de hoy ya
// viene sin CLAURE ni el fondo de compras (`loQueHayEnCuentas` los vuelve a sumar para «lo que tienes»), los pagos son sus `salidas` hasta el último día
// de la caja (`caja.hasta`, hoy + 14) y el IGV que se junta es su fila `igv:<mes>` que cae después de esa ventana. Ninguna cifra se calcula aparte.
//
// CONTRATO. Promete: los bolsillos suman exactamente `tienes − libre`. Nunca promete: el reparto por sede (los bancos son de CAYLA entera, D-32);
// mirando una sede solo se dice el efectivo que tiene. Si la cuenta no ve la planilla, el bolsillo del equipo no existe y se dice.

export type ClaveBolsillo = "equipo" | "sunat" | "proveedores" | "fijos" | "otros" | "compras" | "claure" | "planilla";

export type Bolsillo = {
  clave: ClaveBolsillo;
  nombre: string;
  monto: number;
  /** Una línea en palabras de tienda: qué hay adentro y cuándo sale. */
  detalle: string;
  /** El color del bolsillo en la barra (un token). */
  color: string;
  /** Los pagos que forman el bolsillo, del que sale antes al que sale después (vacío para CLAURE, el fondo de compras y la planilla de Dynamic). */
  pagos: PagoDelBolsillo[];
};

export type PagoDelBolsillo = { fecha: string; titulo: string; detalle: string; monto: number; atrasada: boolean };

export type SaldoBolsillos =
  | {
      tipo: "cayla";
      /** Lo que hay en bancos y cajas hoy (lo mismo que «¿Cuánto tienes?»). */
      tienes: number;
      libre: number;
      /** El último día que cuentan los pagos (hoy + 14). */
      hasta: string;
      bolsillos: Bolsillo[];
      /** La proyección no dice todo (sin saldo de arranque, sin facturas…): la cifra es provisional. */
      provisional: boolean;
      /** La cuenta no ve la planilla en Dynamic: los sueldos no se restan. */
      sinPlanilla: boolean;
      /** La frase bajo la cifra. */
      dicho: string;
    }
  | { tipo: "sede"; nombre: string; vende: boolean; efectivo: number | null; dicho: string }
  | { tipo: "sin_dato"; motivo: string; noSePudoLeer: boolean };

/** El color de cada bolsillo: la familia «reparto» del ERP, que existe para partir plata en partes (el verde queda para «Libre»). */
const COLOR: Record<ClaveBolsillo, string> = {
  equipo: "var(--color-pizarra)",
  sunat: "var(--color-reparto-terracota)",
  proveedores: "var(--color-reparto-ocre)",
  fijos: "var(--color-reparto-arcilla)",
  otros: "var(--color-grafico-neutro)",
  compras: "var(--color-reparto-menta)",
  claure: "var(--color-sede-lim)",
  planilla: "var(--color-reparto-pizarra-claro)",
};
export const COLOR_LIBRE = "var(--color-verde)";

const NOMBRE: Record<ClaveBolsillo, string> = {
  equipo: "Para el equipo",
  sunat: "Para SUNAT",
  proveedores: "Para proveedores",
  fijos: "Alquiler y recibos",
  otros: "Otros pagos",
  compras: "Fondo de compras",
  claure: "De CLAURE",
  planilla: "Planilla ya pagada",
};

/** En qué bolsillo cae cada pago de la proyección. `nuevo` (lo que falta registrar) y lo que no se reconozca van a «Otros pagos». */
export function bolsilloDe(s: Pick<SalidaProy, "tipo">): ClaveBolsillo {
  switch (s.tipo) {
    case "planilla":
    case "aportes":
      return "equipo";
    case "impuesto":
      return "sunat";
    case "vencimiento":
      return "proveedores";
    case "fijo":
      return "fijos";
    default:
      return "otros";
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (xs: readonly number[]) => r2(xs.reduce((a, b) => a + b, 0));
/** «el 15 de noviembre» o, si ya venció, «vencido». */
const cuando = (p: PagoDelBolsillo) => (p.atrasada ? "vencido" : `el ${fechaEnPalabras(p.fecha)}`);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const esIgv = (s: SalidaProy) => s.tipo === "impuesto" && s.id.startsWith("igv:");

/** La línea de cada bolsillo hecho de pagos. */
function detalleDe(clave: ClaveBolsillo, pagos: PagoDelBolsillo[], igvJuntando: PagoDelBolsillo | null): string {
  const primero = pagos[0];
  const vencidos = pagos.filter((p) => p.atrasada).length;
  switch (clave) {
    case "equipo":
      return primero ? `Sueldos y aportes · ${cuando(primero)}` : "Sueldos y aportes";
    case "sunat": {
      const partes: string[] = [];
      const ahora = pagos.filter((p) => p !== igvJuntando);
      if (ahora.length) partes.push(`${soles(suma(ahora.map((p) => p.monto)))} vence ${ahora[0]!.atrasada ? "ya" : `el ${fechaEnPalabras(ahora[0]!.fecha)}`}`);
      if (igvJuntando) partes.push(`${soles(igvJuntando.monto)} del ${igvJuntando.titulo}, que se paga el ${fechaEnPalabras(igvJuntando.fecha)}`);
      return partes.join(" · ");
    }
    case "proveedores":
      return `${plural(pagos.length, "factura", "facturas")}${vencidos ? ` · ${plural(vencidos, "vencida", "vencidas")}` : primero ? ` · la primera ${cuando(primero)}` : ""}`;
    case "fijos":
      return [...new Set(pagos.map((p) => p.titulo))].slice(0, 3).join(", ");
    default:
      return primero ? `${plural(pagos.length, "pago", "pagos")} · el primero ${cuando(primero)}` : "";
  }
}

const ORDEN: readonly ClaveBolsillo[] = ["equipo", "sunat", "proveedores", "fijos", "otros", "compras", "claure", "planilla"];

/**
 * Libre para usar y los bolsillos. `caja` es la de «Tu caja» (`cajaProxima`); `proyeccion`, la misma proyección de donde salió; `planillaSinSalida`, lo que
 * Dynamic marcó pagado de la planilla y aquí no bajó del banco.
 */
export function saldoEnBolsillos({ caja, proyeccion, planillaSinSalida = null }: { caja: CajaProxima; proyeccion: Proyeccion | null; planillaSinSalida?: number | null }): SaldoBolsillos {
  if (caja.tipo === "falla") return { tipo: "sin_dato", motivo: "No se pudo leer la caja. Vuelve a cargar la página en un rato.", noSePudoLeer: true };
  if (caja.tipo === "oculta") return { tipo: "sin_dato", motivo: "Tu rol no ve la caja de CAYLA.", noSePudoLeer: false };
  if (caja.tipo === "sede") {
    const dicho = !caja.vende
      ? `${caja.nombre} no vende: su plata vive en los bancos de CAYLA. Míralos con «Todas».`
      : caja.efectivo === null
        ? "Tu rol no ve el efectivo de esta sede."
        : "El efectivo de la caja y la caja fuerte. Los bancos son de toda CAYLA: míralos con «Todas».";
    return { tipo: "sede", nombre: caja.nombre, vende: caja.vende, efectivo: caja.efectivo, dicho };
  }
  if (!proyeccion) return { tipo: "sin_dato", motivo: "No se pudo leer lo que viene. Vuelve a cargar la página en un rato.", noSePudoLeer: true };

  const tienes = loQueHayEnCuentas(caja);
  const aPago = (s: SalidaProy): PagoDelBolsillo => ({ fecha: s.fecha, titulo: s.tipo === "planilla" ? "Planilla" : s.titulo || s.detalle || "Pago", detalle: s.detalle, monto: r2(s.monto), atrasada: s.atrasada });
  const enVentana = proyeccion.salidas.filter((s) => s.monto > 0 && s.fecha <= caja.hasta);
  // El IGV del mes que corre cae el mes que viene, fuera de la ventana: se separa igual (Felipe 2026-11-09). Si ya cae dentro, va con los pagos.
  const igvLejos = proyeccion.salidas.filter((s) => s.monto > 0 && esIgv(s) && s.fecha > caja.hasta);
  const igvJuntando = igvLejos.length ? { ...aPago(igvLejos[0]!), monto: suma(igvLejos.map((s) => s.monto)) } : null;

  const porClave = new Map<ClaveBolsillo, PagoDelBolsillo[]>();
  for (const s of enVentana) {
    const k = bolsilloDe(s);
    porClave.set(k, [...(porClave.get(k) ?? []), aPago(s)]);
  }
  if (igvJuntando) porClave.set("sunat", [...(porClave.get("sunat") ?? []), igvJuntando]);
  for (const [k, xs] of porClave) porClave.set(k, [...xs].sort((a, b) => (a.atrasada === b.atrasada ? a.fecha.localeCompare(b.fecha) : a.atrasada ? -1 : 1)));

  const bolsillos: Bolsillo[] = [];
  for (const clave of ORDEN) {
    if (clave === "compras" || clave === "claure" || clave === "planilla") {
      const monto = r2(clave === "compras" ? caja.porVolver : clave === "claure" ? caja.deClaudia : Math.max(0, planillaSinSalida ?? 0));
      const detalle =
        clave === "compras"
          ? "Lo que las compradoras tienen para comprar mercadería"
          : clave === "claure"
            ? "Lo que Claudia vendió en Lima: no es de CAYLA"
            : "Dynamic ya la pagó; falta registrar de qué banco salió";
      if (monto > 0.004) bolsillos.push({ clave, nombre: NOMBRE[clave], monto, detalle, color: COLOR[clave], pagos: [] });
      continue;
    }
    const pagos = porClave.get(clave) ?? [];
    const monto = suma(pagos.map((p) => p.monto));
    if (monto > 0.004) bolsillos.push({ clave, nombre: NOMBRE[clave], monto, detalle: detalleDe(clave, pagos, clave === "sunat" ? igvJuntando : null), color: COLOR[clave], pagos });
  }

  const libre = r2(tienes - suma(bolsillos.map((b) => b.monto)));
  const dicho =
    libre >= 0
      ? `de ${soles(tienes)} que tienes. Lo demás ya tiene dueño.`
      : `Tienes ${soles(tienes)} y lo que ya tiene dueño suma ${soles(tienes - libre)}: faltan ${soles(-libre)} para cubrirlo sin lo que vendas.`;
  return { tipo: "cayla", tienes, libre, hasta: caja.hasta, bolsillos, provisional: caja.provisional, sinPlanilla: caja.sinPlanilla, dicho };
}

/** La cuenta de «Libre para usar», renglón por renglón, para la hoja «¿Cómo se calcula?». La última línea es el resultado. */
export function cuentaDeLibre(s: Extract<SaldoBolsillos, { tipo: "cayla" }>): { texto: string; detalle: string; monto: number; total?: boolean }[] {
  return [
    { texto: "Lo que hay en bancos y cajas", detalle: "Bancos, cajones, cajas fuertes y lo que el POS todavía no abona", monto: s.tienes },
    ...s.bolsillos.map((b) => ({ texto: b.nombre, detalle: b.detalle, monto: -b.monto })),
    { texto: "Libre para usar", detalle: "Sin dejar de pagar nada de lo de arriba", monto: s.libre, total: true },
  ];
}
