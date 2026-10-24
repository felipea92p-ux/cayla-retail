// Finanzas ▸ Impuestos en «El telar» (Felipe 2026-10-23): la balanza del IGV. En un plato, el IGV que cobraste al vender; en el
// otro, el IGV de tus compras con factura (y el saldo a favor que traías). La balanza se inclina hacia el que pesa más y abajo
// queda la cuenta que siempre cierra: cobraste − compras − saldo que traías + renta = lo que pagas.
// Lógica pura sobre lo que `fn_impuestos_panel` ya trae: no repite ninguna regla tributaria y, si su propia resta no da lo que
// dice la base, manda la base (`cuadra` lo avisa).

import type { MesIgv } from "./impuestos-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Una pesa de un plato. `clave` es estable (sirve de `key` y para el color). */
export type Pesa = { clave: string; nombre: string; monto: number };

/** Lo de un lugar, cuando la base traiga el IGV del mes por lugar (decisión de Felipe, todavía no existe). */
export type IgvDeLugar = { clave: string; nombre: string; cobrado: number; compras: number };

export type Plato = { total: number; pesas: Pesa[]; /** Lo que el plato resta y no es una pesa (notas de crédito, IGV que no se descuenta). */ resta: number };

export type Balanza = {
  cobrado: Plato;
  compras: Plato;
  /** Grados del brazo, de −13 a 13: positivo, baja el plato de lo cobrado (pagas); negativo, baja el de compras (a favor). */
  inclinacion: number;
  cuenta: {
    cobraste: number;
    compras: number;
    saldoAnterior: number;
    /** IGV del mes: positivo se paga; negativo queda a favor. Es el de la base. */
    igv: number;
    renta: number | null;
    /** Lo que de verdad sale hacia SUNAT: el IGV a pagar (si hay) más la renta. */
    pagas: number;
    estado: "pagas" | "a_favor";
  };
  /** Las pesas son por lugar (la base trajo el reparto) o por tipo de compra (hoy). */
  porLugar: boolean;
  /** Se pidió una sede y la base todavía no trae el reparto: la balanza es de CAYLA entera y la pantalla lo dice. */
  sinReparto: boolean;
  /** La resta de las pesas da lo mismo que la base (si no, la pantalla muestra la cifra de la base igual). */
  cuadra: boolean;
};

export const TOPE_INCLINACION = 13;

/** Las compras por tipo, en el orden en que se apilan. Solo entran las que tienen monto. */
const TIPOS: { clave: keyof MesIgv; nombre: string }[] = [
  { clave: "creditoMercaderia", nombre: "Mercadería" },
  { clave: "creditoGastos", nombre: "Gastos" },
  { clave: "creditoActivos", nombre: "Máquinas y muebles" },
  { clave: "creditoTaller", nombre: "Insumos del Taller" },
];

export function balanzaIgv(f: MesIgv, renta: number | null, opciones: { porLugar?: IgvDeLugar[] | null; sede?: string | null } = {}): Balanza {
  const lugares = opciones.porLugar?.length ? opciones.porLugar : null;
  const sede = opciones.sede ?? null;
  const elegidos = lugares && sede ? lugares.filter((l) => l.clave === sede) : lugares;

  let cobrado: Plato;
  let compras: Plato;
  const saldoAnterior = r2(f.saldoAnterior);
  const pesaSaldo: Pesa[] = saldoAnterior > 0 ? [{ clave: "saldo_anterior", nombre: "Saldo a favor que traías", monto: saldoAnterior }] : [];

  if (elegidos) {
    cobrado = { total: r2(elegidos.reduce((a, l) => a + l.cobrado, 0)), pesas: elegidos.filter((l) => l.cobrado > 0).map((l) => ({ clave: l.clave, nombre: l.nombre, monto: r2(l.cobrado) })), resta: 0 };
    const pesas = elegidos.filter((l) => l.compras > 0).map((l) => ({ clave: l.clave, nombre: l.nombre, monto: r2(l.compras) }));
    // El saldo que traías es de CAYLA entera (un RUC): solo pesa en la balanza de todas las sedes.
    const conSaldo = sede ? pesas : [...pesas, ...pesaSaldo];
    compras = { total: r2(conSaldo.reduce((a, p) => a + p.monto, 0)), pesas: conSaldo, resta: 0 };
  } else {
    cobrado = { total: r2(f.debito), pesas: f.debito > 0 ? [{ clave: "ventas", nombre: "Tus ventas", monto: r2(f.debito) }] : [], resta: 0 };
    const porTipo = TIPOS.map((t) => ({ clave: String(t.clave), nombre: t.nombre, monto: r2(Number(f[t.clave]) || 0) })).filter((p) => p.monto > 0);
    const sumaTipos = r2(porTipo.reduce((a, p) => a + p.monto, 0));
    // Notas de crédito de proveedor y el IGV que no se descuenta (pagado sin banco) ya están restados del crédito de la base.
    const resta = r2(Math.max(0, sumaTipos - f.credito));
    compras = { total: r2(f.credito + saldoAnterior), pesas: [...porTipo, ...pesaSaldo], resta };
  }

  // La cuenta: con todas las sedes (o sin reparto) es la de la base, tal cual; con una sede, la de ese lugar.
  const deSede = !!(elegidos && sede);
  const igvBase = r2(f.aPagar - f.saldoAFavor);
  const igv = deSede ? r2(cobrado.total - compras.total) : igvBase;
  const rentaR = renta === null ? null : r2(renta);
  const pagas = r2(Math.max(0, igv) + (rentaR ?? 0));
  const resta = r2(cobrado.total - compras.total);
  const mayor = Math.max(cobrado.total, compras.total, 1);
  const inclinacion = r2(Math.max(-TOPE_INCLINACION, Math.min(TOPE_INCLINACION, (resta / mayor) * TOPE_INCLINACION)));

  return {
    cobrado,
    compras,
    inclinacion,
    cuenta: { cobraste: cobrado.total, compras: r2(compras.total - (deSede ? 0 : saldoAnterior)), saldoAnterior: deSede ? 0 : saldoAnterior, igv, renta: rentaR, pagas, estado: igv > 0 ? "pagas" : "a_favor" },
    porLugar: !!elegidos,
    sinReparto: !!sede && !lugares,
    cuadra: deSede || Math.abs(resta - igvBase) < 0.05,
  };
}

/** La altura de cada pesa en el dibujo: proporcional a su monto contra el plato más pesado de los dos, con un mínimo visible. */
export function alturasPesas(b: Balanza, alto: number, minimo = 6): { cobrado: number[]; compras: number[] } {
  const mayor = Math.max(b.cobrado.total, b.compras.total, 1);
  const escala = (p: Plato) => {
    const suma = p.pesas.reduce((a, x) => a + x.monto, 0) || 1;
    // Si el plato resta algo que no es pesa, las pesas se achican para que la pila mida su total, no la suma bruta.
    const factor = p.total / suma;
    return p.pesas.map((x) => Math.max(minimo, Math.round(((x.monto * factor) / mayor) * alto)));
  };
  return { cobrado: escala(b.cobrado), compras: escala(b.compras) };
}
