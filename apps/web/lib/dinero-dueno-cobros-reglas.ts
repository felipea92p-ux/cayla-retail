// Cuentas y dinero ▸ Dónde está: «Plata del dueño» (quién y dónde puso o sacó plata) y «A qué cuenta entra cada cobro» (lista corta y ventana
// con filtros), rediseño de Felipe 2026-10-31 (docs/maquetas/finanzas-dinero-rediseno-2026-10/). Lógica pura: no calcula plata nueva; agrupa lo que
// `fn_movimientos_dinero` y `fn_medios_cobro` ya traen. La deuda con el dueño sigue siendo `deudaConDueno` (cuentas-dinero-reglas.ts).

import { diaLima } from "./fechas-lima";
import { TEXTO_MEDIO_COBRO, idsSoloTransferencia, MEDIOS_COBRO, nombreCorto, type CuentaDinero, type FilaMedio, type MovimientoDinero, type TipoMovimiento } from "./cuentas-dinero-reglas";

// ---- Plata del dueño: quién puso y sacó -----------------------------------------------------------------------------------

/** Lo que mete plata del dueño a CAYLA (puso) y lo que la saca (sacó). */
export const TIPOS_QUE_PONEN: readonly TipoMovimiento[] = ["aporte", "prestamo"];
export const TIPOS_QUE_SACAN: readonly TipoMovimiento[] = ["retiro", "devolucion_prestamo"];

export type VistaDueno = "quien" | "cuenta" | "mes";
export type FilaGraficoDueno = { clave: string; titulo: string; puso: number; saco: number; detalle: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Los movimientos del dueño que siguen vigentes (uno anulado no puso ni sacó nada). */
export function movimientosDelDueno<M extends Pick<MovimientoDinero, "tipo" | "estado">>(movs: readonly M[]): M[] {
  return movs.filter((m) => m.estado === "vigente" && (TIPOS_QUE_PONEN.includes(m.tipo) || TIPOS_QUE_SACAN.includes(m.tipo)));
}

const TEXTO_TIPO: Partial<Record<TipoMovimiento, string>> = { aporte: "aporte", prestamo: "préstamo", retiro: "retiro", devolucion_prestamo: "devolución" };

/**
 * El gráfico «Quién puso y sacó plata», agrupado por quien lo REGISTRÓ, por la cuenta donde entró o de donde salió, o por mes. Quién registró
 * no es siempre quién pidió la plata: la base guarda a quien lo anotó. Las filas van de lo que más movió a lo que menos (los meses, en orden).
 */
export function graficoDelDueno(
  movs: readonly Pick<MovimientoDinero, "tipo" | "estado" | "fecha" | "monto" | "registradoPor" | "origenNombre" | "destinoNombre">[],
  vista: VistaDueno,
): { filas: FilaGraficoDueno[]; puso: number; saco: number; maximo: number } {
  const propios = movimientosDelDueno(movs);
  const claveDe = (m: (typeof propios)[number]): string => {
    if (vista === "quien") return m.registradoPor ?? "Sin responsable";
    if (vista === "cuenta") return nombreCorto((TIPOS_QUE_PONEN.includes(m.tipo) ? m.destinoNombre : m.origenNombre) ?? "Sin cuenta");
    return (diaLima(m.fecha) ?? "0000-00").slice(0, 7);
  };
  const g = new Map<string, { puso: number; saco: number; tipos: Map<string, number> }>();
  for (const m of propios) {
    const k = claveDe(m);
    const f = g.get(k) ?? { puso: 0, saco: 0, tipos: new Map() };
    if (TIPOS_QUE_PONEN.includes(m.tipo)) f.puso += m.monto;
    else f.saco += m.monto;
    f.tipos.set(TEXTO_TIPO[m.tipo] ?? m.tipo, (f.tipos.get(TEXTO_TIPO[m.tipo] ?? m.tipo) ?? 0) + m.monto);
    g.set(k, f);
  }
  const tituloDe = (k: string) => (vista === "mes" ? (k === "0000-00" ? "Sin fecha" : `${MESES[Number(k.slice(5, 7)) - 1] ?? k} ${k.slice(0, 4)}`) : k);
  let filas: FilaGraficoDueno[] = [...g.entries()].map(([k, f]) => ({
    clave: k,
    titulo: tituloDe(k),
    puso: r2(f.puso),
    saco: r2(f.saco),
    detalle: [...f.tipos.entries()].map(([t, v]) => `${t}: ${r2(v)}`).join(" · "),
  }));
  filas = vista === "mes" ? filas.sort((a, b) => a.clave.localeCompare(b.clave)) : filas.sort((a, b) => b.puso + b.saco - (a.puso + a.saco) || a.titulo.localeCompare(b.titulo, "es"));
  const puso = r2(filas.reduce((a, f) => a + f.puso, 0));
  const saco = r2(filas.reduce((a, f) => a + f.saco, 0));
  return { filas, puso, saco, maximo: Math.max(0, ...filas.flatMap((f) => [f.puso, f.saco])) };
}

// ---- A qué cuenta entra cada cobro ---------------------------------------------------------------------------------------------

export type TipoCobro = "banco" | "maquina" | "caja" | "sin";
export const TEXTO_TIPO_COBRO: Record<TipoCobro, string> = {
  banco: "Banco",
  maquina: "Máquina · 1–2 días",
  caja: "Caja de la tienda",
  sin: "Sin cuenta",
};
export type FilaCobro = { clave: string; sede: string; medio: string; cuenta: string | null; tipo: TipoCobro };

const tipoDeCuenta = (c: CuentaDinero | undefined): TipoCobro => (!c ? "banco" : c.tipo === "por_abonar" ? "maquina" : c.tipo === "cajon" || c.tipo === "caja_fuerte" ? "caja" : "banco");

/**
 * Una fila por sede y medio: el efectivo entra al cajón de la tienda; cada otro medio, a la cuenta que Configuración le asignó (o a ninguna:
 * «Sin cuenta»). Una sede que solo paga por transferencia (el Taller) no cobra a clientes: solo lleva esa fila, sin las que no aplican.
 */
export function filasDeCobros(medios: readonly FilaMedio[], cuentas: readonly CuentaDinero[]): FilaCobro[] {
  const soloTransferencia = idsSoloTransferencia(medios);
  const sedes = new Map<string, { id: string; nombre: string; porMedio: Map<string, FilaMedio> }>();
  for (const m of medios) {
    const s = sedes.get(m.ubicacionId) ?? { id: m.ubicacionId, nombre: m.ubicacionNombre, porMedio: new Map() };
    s.porMedio.set(m.medio, m);
    sedes.set(m.ubicacionId, s);
  }
  const filas: FilaCobro[] = [];
  for (const s of sedes.values()) {
    const solo = soloTransferencia.has(s.id);
    if (!solo) {
      const cajon = cuentas.find((c) => c.tipo === "cajon" && c.ubicacionId === s.id);
      filas.push({ clave: `${s.id}-efectivo`, sede: s.nombre, medio: "Efectivo", cuenta: (cajon?.nombre ?? "Su cajón").replace("Cajón · ", "Cajón "), tipo: "caja" });
    }
    for (const medio of MEDIOS_COBRO) {
      if (solo && medio !== "transferencia") continue;
      const m = s.porMedio.get(medio);
      const cuenta = m?.cuentaNombre ? nombreCorto(m.cuentaNombre) : null;
      filas.push({ clave: `${s.id}-${medio}`, sede: s.nombre, medio: TEXTO_MEDIO_COBRO[medio], cuenta, tipo: cuenta ? tipoDeCuenta(cuentas.find((c) => c.id === m?.cuentaId)) : "sin" });
    }
  }
  return filas;
}

/** La lista corta de la pantalla: primero lo que falta elegir (sin cuenta), después el resto en su orden. */
export function cobrosParaVer(filas: readonly FilaCobro[], cuantos: number): FilaCobro[] {
  return [...filas.filter((f) => f.tipo === "sin"), ...filas.filter((f) => f.tipo !== "sin")].slice(0, cuantos);
}

export type FiltroCobros = { sede: string; medio: string; tipo: TipoCobro | "todos" };
export const FILTRO_COBROS_INICIAL: FiltroCobros = { sede: "todas", medio: "todos", tipo: "todos" };
export function filtrarCobros(filas: readonly FilaCobro[], f: FiltroCobros): FilaCobro[] {
  return filas.filter((x) => (f.sede === "todas" || x.sede === f.sede) && (f.medio === "todos" || x.medio === f.medio) && (f.tipo === "todos" || x.tipo === f.tipo));
}
