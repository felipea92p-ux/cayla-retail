import { describe, expect, it } from "vitest";
import {
  calcularTotales,
  diasHasta,
  estadoVisible,
  filtrarComprobantes,
  primerErrorComprobante,
  redondear2,
  resumenComprobantes,
  type ComprobanteProduccion,
  type FormComprobante,
  type LineaForm,
} from "./comprobantes-produccion-reglas";

const linea = (cantidad: string, costo: string, extra: Partial<LineaForm> = {}): LineaForm => ({ insumoId: "lino", descripcion: "", cantidad, costo, ...extra });

describe("calcularTotales (lo que hará registrar_comprobante_produccion)", () => {
  it("factura: subtotal por línea redondeada, IGV 18 % y total", () => {
    const t = calcularTotales([linea("100", "20"), linea("1", "100", { insumoId: null, descripcion: "Flete" })], "factura");
    expect(t).toEqual({ subtotal: 2100, igv: 378, total: 2478, lineasCompletas: 2 });
  });
  it("boleta y nota de venta no llevan IGV", () => {
    expect(calcularTotales([linea("10", "5")], "boleta")).toMatchObject({ igv: 0, total: 50 });
    expect(calcularTotales([linea("10", "5")], "nota_venta")).toMatchObject({ igv: 0, total: 50 });
  });
  it("redondea cada línea a centavos antes de sumar (como el subtotal de la base)", () => {
    // 3 × 0.3333 = 0.9999 → 1.00 ; dos líneas → 2.00 (no 1.9998 → 2.00 por casualidad, pero 1.005 sí importa)
    expect(calcularTotales([linea("1", "1.005")], "boleta").subtotal).toBe(1.01);
    expect(redondear2(1.005)).toBe(1.01);
  });
  it("acepta coma decimal y no cuenta líneas incompletas", () => {
    const t = calcularTotales([linea("2,5", "10"), linea("", "10"), linea("3", "")], "boleta");
    expect(t).toMatchObject({ subtotal: 25, lineasCompletas: 1 });
  });
});

const form = (extra: Partial<FormComprobante> = {}): FormComprobante => ({
  proveedorId: "p1",
  tipo: "factura",
  serie: "F001",
  numero: "100",
  fechaEmision: "2026-09-10",
  condicion: "credito",
  fechaVencimiento: "2026-10-10",
  lineas: [linea("100", "20")],
  totalPapel: "",
  metodoPago: "transferencia",
  referenciaPago: "",
  ...extra,
});

describe("primerErrorComprobante", () => {
  const hoy = "2026-09-20";
  it("un formulario completo no tiene error", () => {
    expect(primerErrorComprobante(form(), hoy)).toBeNull();
  });
  it("dice lo primero que falta, en el orden de la pantalla", () => {
    expect(primerErrorComprobante(form({ proveedorId: "" }), hoy)).toContain("proveedor");
    expect(primerErrorComprobante(form({ serie: " " }), hoy)).toContain("serie");
    expect(primerErrorComprobante(form({ fechaEmision: "2026-09-25" }), hoy)).toContain("futura");
    expect(primerErrorComprobante(form({ fechaVencimiento: "" }), hoy)).toContain("vencimiento");
    expect(primerErrorComprobante(form({ fechaVencimiento: "2026-09-01" }), hoy)).toContain("anterior");
  });
  it("al contado no pide vencimiento", () => {
    expect(primerErrorComprobante(form({ condicion: "contado", fechaVencimiento: "" }), hoy)).toBeNull();
  });
  it("líneas: sin insumo ni concepto, sin cantidad o sin costo", () => {
    expect(primerErrorComprobante(form({ lineas: [linea("1", "5", { insumoId: null })] }), hoy)).toContain("Línea 1");
    expect(primerErrorComprobante(form({ lineas: [linea("0", "5")] }), hoy)).toContain("cantidad");
    expect(primerErrorComprobante(form({ lineas: [linea("1", "")] }), hoy)).toContain("costo");
    expect(primerErrorComprobante(form({ lineas: [] }), hoy)).toContain("al menos una línea");
  });
  it("el total del papel se cuadra con tolerancia de un centavo por línea", () => {
    expect(primerErrorComprobante(form({ totalPapel: "2360.01" }), hoy)).toBeNull(); // 100×20=2000, IGV 360
    expect(primerErrorComprobante(form({ totalPapel: "2400" }), hoy)).toContain("no cuadra");
  });
});

const comp = (id: string, extra: Partial<ComprobanteProduccion> = {}): ComprobanteProduccion => ({
  id,
  proveedorId: "p1",
  proveedor: "Textiles Gamarra",
  tipo: "factura",
  serie: "F001",
  numero: id,
  fechaEmision: "2026-09-05",
  condicion: "credito",
  fechaVencimiento: "2026-10-05",
  subtotal: 1000,
  igv: 180,
  total: 1180,
  estado: "vigente",
  motivoAnulacion: null,
  nota: null,
  lineas: 1,
  pagado: 0,
  saldo: 1180,
  estadoPago: "pendiente",
  vencido: false,
  ...extra,
});

describe("lista y resumen", () => {
  const hoy = "2026-09-20";
  const lista = [
    comp("1"),
    comp("2", { pagado: 1180, saldo: 0, estadoPago: "pagada", condicion: "contado", fechaVencimiento: null }),
    comp("3", { proveedorId: "p2", proveedor: "Botones Ñandú", fechaVencimiento: "2026-09-10", vencido: true, fechaEmision: "2026-08-10", saldo: 500, total: 500 }),
    comp("4", { estado: "anulada", saldo: 0, estadoPago: "anulada" }),
  ];
  it("el resumen suma lo que se debe y lo vencido; las anuladas no cuentan", () => {
    const r = resumenComprobantes(lista, hoy);
    expect(r.porPagar).toBe(1680);
    expect(r.conSaldo).toBe(2);
    expect(r.vencido).toBe(500);
    expect(r.nVencidos).toBe(1);
    expect(r.delMes).toBe(2360); // #1 y #2 emitidos en septiembre; #3 fue en agosto
  });
  it("filtra por estado, proveedor y texto (sin tildes)", () => {
    const base = { proveedorId: null, busqueda: "" };
    expect(filtrarComprobantes(lista, { ...base, estado: "por_pagar" }).map((c) => c.id)).toEqual(["1", "3"]);
    expect(filtrarComprobantes(lista, { ...base, estado: "vencidos" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComprobantes(lista, { ...base, estado: "pagados" }).map((c) => c.id)).toEqual(["2"]);
    expect(filtrarComprobantes(lista, { ...base, estado: "anulados" }).map((c) => c.id)).toEqual(["4"]);
    expect(filtrarComprobantes(lista, { estado: "todos", proveedorId: "p2", busqueda: "" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComprobantes(lista, { estado: "todos", proveedorId: null, busqueda: "nandu" }).map((c) => c.id)).toEqual(["3"]);
    expect(filtrarComprobantes(lista, { estado: "todos", proveedorId: null, busqueda: "f001-2" }).map((c) => c.id)).toEqual(["2"]);
  });
});

describe("estadoVisible", () => {
  const hoy = "2026-09-20";
  it("lo vencido y lo que vence en una semana van en ámbar, cada uno con sus días", () => {
    expect(estadoVisible(comp("v", { vencido: true, fechaVencimiento: "2026-09-10" }), hoy)).toEqual({ tono: "ambar", texto: "Vencida hace 10 d" });
    expect(estadoVisible(comp("a", { fechaVencimiento: "2026-09-25" }), hoy)).toEqual({ tono: "ambar", texto: "Por pagar · vence en 5 d" });
    expect(estadoVisible(comp("n", { fechaVencimiento: "2026-10-30" }), hoy).tono).toBe("neutro");
  });
  it("pagada es verde y anulada se apaga", () => {
    expect(estadoVisible(comp("p", { estadoPago: "pagada", saldo: 0 }), hoy).tono).toBe("verde");
    expect(estadoVisible(comp("x", { estado: "anulada" }), hoy).tono).toBe("apagado");
  });
  it("los días se cuentan desde hoy", () => {
    expect(diasHasta("2026-09-25", "2026-09-20")).toBe(5);
    expect(diasHasta("2026-09-10", "2026-09-20")).toBe(-10);
  });
});
