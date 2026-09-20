import { describe, expect, it } from "vitest";
import {
  cantidadTexto,
  capitalEnLotes,
  consumoSemanal,
  efectoEnSaldo,
  estadoInsumo,
  loteMasAntiguoConSaldo,
  previsualizarConsumo,
  saldoDeInsumo,
  saldoDeLote,
  semanasDeCobertura,
  textoDeMovimiento,
  tramoDeSaldo,
  type LoteConSaldo,
  type LoteInsumo,
  type MovimientoInsumo,
} from "./insumos-reglas";

const lote = (id: string, ingreso: string, cantidadIngresada: number, extra: Partial<LoteInsumo> = {}): LoteInsumo => ({
  id,
  insumoId: "lino",
  codigo: id,
  ingreso,
  creadoEn: `${ingreso}T10:00:00Z`,
  cantidadIngresada,
  costoUnitario: 18.5,
  documento: null,
  origen: "compra",
  ...extra,
});
const mov = (tipo: MovimientoInsumo["tipo"], cantidad: number, loteId: string | null = null, creadoEn = "2026-09-15T10:00:00Z"): MovimientoInsumo => ({
  id: `${tipo}-${cantidad}-${loteId}`,
  insumoId: "lino",
  loteId,
  tipo,
  cantidad,
  produccionId: null,
  motivo: null,
  creadoEn,
});
const conSaldo = (l: LoteInsumo, saldo: number): LoteConSaldo => ({ ...l, saldo });

describe("saldo: la suma del ledger, con el signo que le da el tipo", () => {
  it("compra y devolución suman; consumo y merma restan; el ajuste trae su signo", () => {
    expect(efectoEnSaldo("compra", 10)).toBe(10);
    expect(efectoEnSaldo("devolucion", 4)).toBe(4);
    expect(efectoEnSaldo("consumo", 3)).toBe(-3);
    expect(efectoEnSaldo("merma", 1)).toBe(-1);
    expect(efectoEnSaldo("ajuste", -2)).toBe(-2);
    expect(efectoEnSaldo("ajuste", 5)).toBe(5);
  });
  it("el saldo de un insumo es la suma con signo", () => {
    expect(saldoDeInsumo([mov("compra", 120), mov("consumo", 41), mov("consumo", 66), mov("devolucion", 6), mov("ajuste", -2)])).toBe(17);
  });
  it("sin movimientos no hay saldo", () => {
    expect(saldoDeInsumo([])).toBe(0);
  });
});

describe("saldoDeLote", () => {
  const l = lote("L-1", "2026-09-02", 120);
  it("es lo ingresado menos consumo y merma, más devoluciones — sin volver a sumar la compra que abrió el lote", () => {
    const movs = [mov("compra", 120, "L-1"), mov("consumo", 41, "L-1"), mov("consumo", 66, "L-1"), mov("merma", 2, "L-1"), mov("devolucion", 5, "L-1")];
    expect(saldoDeLote(l, movs)).toBe(16);
  });
  it("ignora los movimientos de otros lotes y los ajustes sin lote", () => {
    expect(saldoDeLote(l, [mov("consumo", 30, "L-2"), mov("ajuste", -4, null)])).toBe(120);
  });
});

describe("loteMasAntiguoConSaldo (PEPS por lote)", () => {
  const a = conSaldo(lote("A", "2026-09-02", 120), 0);
  const b = conSaldo(lote("B", "2026-09-16", 80), 80);
  const c = conSaldo(lote("C", "2026-09-05", 50), 10);
  it("elige el más antiguo que todavía tiene saldo", () => {
    expect(loteMasAntiguoConSaldo([b, a, c])?.id).toBe("C");
  });
  it("con el mismo día desempata por quién se abrió primero", () => {
    const x = conSaldo(lote("X", "2026-09-05", 10, { creadoEn: "2026-09-05T15:00:00Z" }), 10);
    const y = conSaldo(lote("Y", "2026-09-05", 10, { creadoEn: "2026-09-05T09:00:00Z" }), 10);
    expect(loteMasAntiguoConSaldo([x, y])?.id).toBe("Y");
  });
  it("sin lotes con saldo no hay ninguno", () => {
    expect(loteMasAntiguoConSaldo([a])).toBeNull();
    expect(loteMasAntiguoConSaldo([])).toBeNull();
  });
});

describe("estadoInsumo", () => {
  it("sin saldo, bajo el mínimo o bien", () => {
    expect(estadoInsumo(0, 60).tono).toBe("sin_saldo");
    expect(estadoInsumo(-3, 60).tono).toBe("sin_saldo");
    expect(estadoInsumo(59.9, 60).tono).toBe("bajo");
    expect(estadoInsumo(60, 60).tono).toBe("bien");
  });
  it("sin mínimo definido no puede estar «bajo»: se dice", () => {
    expect(estadoInsumo(10, null)).toEqual({ tono: "sin_minimo", etiqueta: "Sin mínimo" });
  });
});

describe("previsualizarConsumo (lo que hará registrar_consumo_insumo)", () => {
  const lotes = [conSaldo(lote("L-0902", "2026-09-02", 120), 13), conSaldo(lote("L-0916", "2026-09-16", 80), 80)];
  it("sale del lote más antiguo con saldo y dice cuánto le queda", () => {
    const p = previsualizarConsumo(lotes, 10, "Lino", "metro");
    expect(p.ok && p.lote.id).toBe("L-0902");
    expect(p.ok && p.quedaria).toBe(3);
  });
  it("NO parte el consumo entre lotes: rechaza con el saldo exacto de ese lote", () => {
    const p = previsualizarConsumo(lotes, 30, "Lino", "metro");
    expect(p.ok).toBe(false);
    expect(!p.ok && p.motivo).toContain("solo tiene 13 m");
    expect(!p.ok && p.motivo).toContain("siguiente lote");
  });
  it("pedir exactamente el saldo del lote se puede", () => {
    expect(previsualizarConsumo(lotes, 13, "Lino", "metro").ok).toBe(true);
  });
  it("sin saldo o sin cantidad, lo dice", () => {
    expect(previsualizarConsumo([], 5, "Lino", "metro")).toEqual({ ok: false, motivo: "No hay saldo de Lino. Ingrésalo primero." });
    expect(previsualizarConsumo(lotes, 0, "Lino", "metro").ok).toBe(false);
  });
});

describe("cobertura medida", () => {
  const hoy = "2026-09-19";
  it("el consumo semanal sale de lo consumido en las últimas 4 semanas", () => {
    const movs = [mov("consumo", 40, "L", "2026-09-10T10:00:00Z"), mov("consumo", 30, "L", "2026-09-01T10:00:00Z"), mov("compra", 500, "L", "2026-09-11T10:00:00Z")];
    expect(consumoSemanal(movs, hoy)).toBeCloseTo(70 / 4, 5);
  });
  it("lo anterior a la ventana no cuenta", () => {
    expect(consumoSemanal([mov("consumo", 99, "L", "2026-06-01T10:00:00Z")], hoy)).toBeNull();
  });
  it("sin consumo no hay ritmo: no se inventa cuánto dura", () => {
    expect(consumoSemanal([], hoy)).toBeNull();
    expect(semanasDeCobertura(50, null)).toBeNull();
  });
  it("las semanas son el saldo entre el ritmo", () => {
    expect(semanasDeCobertura(50, 25)).toBe(2);
    expect(semanasDeCobertura(-5, 25)).toBe(0);
  });
});

describe("capital y riel de saldo", () => {
  it("el capital vale cada lote a su costo, solo con lo que queda", () => {
    const ls = [conSaldo(lote("A", "2026-09-02", 120, { costoUnitario: 18.5 }), 13), conSaldo(lote("B", "2026-09-16", 80, { costoUnitario: 19.8 }), 80)];
    expect(capitalEnLotes(ls)).toBeCloseTo(13 * 18.5 + 80 * 19.8, 5);
  });
  it("sin ver costos no hay capital (no se calcula con datos que faltan)", () => {
    expect(capitalEnLotes([conSaldo(lote("A", "2026-09-02", 10, { costoUnitario: null }), 10)])).toBeNull();
  });
  it("el mínimo queda a un tercio del riel", () => {
    const t = tramoDeSaldo(30, 60);
    expect(t.marcaMinimo).toBeCloseTo(1 / 3, 5);
    expect(t.llenado).toBeCloseTo(30 / 180, 5);
  });
  it("si el saldo supera el tope, el riel se llena y la marca sigue proporcional", () => {
    expect(tramoDeSaldo(500, 60).llenado).toBe(1);
  });
});

describe("texto", () => {
  it("las cantidades llevan los decimales de su unidad", () => {
    expect(cantidadTexto(12.54, "metro")).toBe("12.5 m");
    expect(cantidadTexto(40, "unidad")).toBe("40 unid.");
    expect(cantidadTexto(2.345, "kilo")).toBe("2.35 kg");
  });
  it("los movimientos se leen sin jerga", () => {
    expect(textoDeMovimiento({ tipo: "consumo", motivo: null })).toBe("Sale al cortar");
    expect(textoDeMovimiento({ tipo: "ajuste", motivo: "conteo" })).toBe("Ajuste · conteo");
  });
});
