import { bolsilloDe, type ClaveBolsillo } from "./bolsillos-reglas";
import { fechaEnPalabras, type CajaProxima, type PagoCaja } from "./caja-proxima-reglas";
import { soles, type Proyeccion, type SalidaProy } from "./flujo-caja-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos», la tarjeta «Próximos» (Felipe 2026-11-09): lo que se paga en las próximas dos semanas, como la lista de
// «próximos cargos» de la app del banco, con el día en que la caja queda más justa. Lógica pura sobre la misma proyección que «Libre para usar» y
// la caja de 14 días (`fn_flujo_caja_proyeccion`): los pagos son los mismos que llenan los bolsillos, así que la lista y los bolsillos suman lo mismo.
//
// El día más justo es el punto más bajo de la caja en esos 14 días (con la compra de campaña si la persona la cuenta en «Inversión en mercadería»):
// el mismo saldo día por día que arma `cajaProxima`. Mirando una sede no hay saldo (los bancos son de CAYLA entera): solo sus pagos.

export type PagoProximo = {
  clave: string;
  fecha: string;
  titulo: string;
  detalle: string;
  monto: number;
  atrasada: boolean;
  /** El bolsillo de donde sale (para su color y adónde lleva); `null` para la compra de campaña, que todavía no se pide. */
  bolsillo: ClaveBolsillo | null;
};

export type DiaJusto = { fecha: string; saldo: number; tono: "verde" | "ambar" | "rojo"; frase: string };

export type Proximos =
  | {
      tipo: "ok";
      pagos: PagoProximo[];
      total: number;
      hasta: string;
      /** El punto más bajo de la caja y lo que dice; `null` mirando una sede o sin saldo día por día. */
      justo: DiaJusto | null;
      /** El saldo de cada día, de hoy a `hasta`, para la línea chica. */
      serie: number[];
      incluyeCompra: boolean;
    }
  | { tipo: "sin_dato"; motivo: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

function nombre(s: SalidaProy): string {
  if (s.tipo === "planilla") return "Planilla";
  return s.titulo || s.detalle || "Pago";
}

/** «en 3 días», «mañana», «hoy», «vencido». */
export function cuandoSale(p: Pick<PagoProximo, "fecha" | "atrasada">, hoy: string): string {
  if (p.atrasada) return "Vencido";
  const dias = Math.round((Date.parse(`${p.fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

/**
 * `cajaSola` es la caja de 14 días sin la compra de campaña (la de los bolsillos) y `caja`, la que dibuja la pantalla (con la compra si se cuenta);
 * `compra`, los pagos de esa compra; `deLaSede`, el filtro de pagos al mirar una sede.
 */
export function proximosPagos(o: {
  cajaSola: CajaProxima;
  caja: CajaProxima;
  proyeccion: Proyeccion | null;
  compra?: readonly PagoCaja[];
  deLaSede?: ((ubicacionId: string | null) => boolean) | null;
}): Proximos {
  const { cajaSola, caja, proyeccion, compra = [], deLaSede = null } = o;
  if (cajaSola.tipo === "falla" || !proyeccion) return { tipo: "sin_dato", motivo: "No se pudo leer lo que viene. Vuelve a cargar la página en un rato." };
  if (cajaSola.tipo === "oculta") return { tipo: "sin_dato", motivo: "Tu rol no ve lo que viene en la caja." };
  const hoy = cajaSola.hoy;
  const hasta = cajaSola.hasta;

  // Los pagos del mismo día y el mismo nombre van juntos (la planilla entera, no persona por persona).
  const juntos = new Map<string, PagoProximo>();
  for (const s of proyeccion.salidas) {
    if (s.monto <= 0 || s.fecha > hasta) continue;
    if (deLaSede && !deLaSede(s.ubicacionId)) continue;
    const titulo = nombre(s);
    const k = `${s.fecha}|${titulo}|${s.atrasada}`;
    const ya = juntos.get(k);
    if (ya) ya.monto = r2(ya.monto + s.monto);
    else juntos.set(k, { clave: k, fecha: s.fecha, titulo, detalle: s.tipo === "planilla" ? "Sueldos" : s.detalle, monto: r2(s.monto), atrasada: s.atrasada, bolsillo: bolsilloDe(s) });
  }
  const incluyeCompra = !deLaSede && compra.some((c) => c.fecha <= hasta);
  for (const c of compra) {
    if (deLaSede || c.fecha > hasta || c.monto <= 0) continue;
    const k = `${c.fecha}|compra`;
    juntos.set(k, { clave: k, fecha: c.fecha, titulo: "Compra de campaña", detalle: "Inversión en mercadería: todavía no está pedida", monto: r2(c.monto), atrasada: false, bolsillo: null });
  }
  const pagos = [...juntos.values()].sort((a, b) => (a.atrasada === b.atrasada ? a.fecha.localeCompare(b.fecha) || b.monto - a.monto : a.atrasada ? -1 : 1));
  const total = r2(pagos.reduce((a, p) => a + p.monto, 0));

  if (caja.tipo !== "cayla") return { tipo: "ok", pagos, total, hasta, justo: null, serie: [], incluyeCompra: false };
  const puntos = caja.puntos.filter((p) => p.fecha <= hasta);
  const serie = puntos.map((p) => p.saldo);
  const masBajo = puntos.reduce<(typeof puntos)[number] | null>((m, p) => (!m || p.saldo < m.saldo ? p : m), null);
  let justo: DiaJusto | null = null;
  if (masBajo) {
    const cuando = masBajo.fecha === hoy ? "Hoy" : `El ${fechaEnPalabras(masBajo.fecha)}`;
    if (masBajo.saldo < 0)
      justo = { fecha: masBajo.fecha, saldo: masBajo.saldo, tono: "rojo", frase: `${cuando} la caja no alcanza: faltarían ${soles(-masBajo.saldo)} para pagar todo lo de esta lista.` };
    else if (caja.minimo > 0 && masBajo.saldo < caja.minimo)
      justo = { fecha: masBajo.fecha, saldo: masBajo.saldo, tono: "ambar", frase: `${cuando} quedas ${soles(caja.minimo - masBajo.saldo)} bajo tu mínimo de ${soles(caja.minimo)}. Alcanza, pero justo.` };
    else justo = { fecha: masBajo.fecha, saldo: masBajo.saldo, tono: "verde", frase: `Es lo que te quedaría ese día, con lo que esperas cobrar y después de estos pagos. Alcanza.` };
  }
  return { tipo: "ok", pagos, total, hasta, justo, serie, incluyeCompra };
}
