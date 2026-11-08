import { describe, expect, it } from "vitest";
import type { LotePendiente } from "./cuentas-dinero-reglas";
import type { LineaExtracto } from "./extracto-interbank";
import { emparejarVendemas, lineasYaRegistradas, loteAnteriorDe } from "./emparejar-maquinas";

// Montos inventados (el repo es público). Vendemás: 2,30 % + IGV ≈ 2,71 %.
const linea = (orden: number, fecha: string, centimos: number, tipo: LineaExtracto["tipo"] = "lote_vendemas"): LineaExtracto => ({
  orden,
  fecha,
  descripcion: "PAGO ESTABLECIMENTOS VISA",
  centimos,
  saldoCentimos: null,
  tipo,
  codigoComercio: null,
});
const dia = (clave: string, fecha: string, bruto: number, sede = "Tienda TRU", esperado: number | null = Math.round(bruto * 2.714) / 100): LotePendiente => ({
  clave,
  fecha,
  ubicacionId: sede,
  ubicacionNombre: sede,
  medio: "tarjeta",
  bruto,
  dias: 1,
  nPagos: 1,
  esperado,
  diasHabiles: 1,
  atrasado: false,
  yaDepositado: 0,
});

describe("loteAnteriorDe", () => {
  it("el lote del lunes viene después del sábado; los demás, del día anterior", () => {
    expect(loteAnteriorDe("2026-11-09")).toBe("2026-11-07"); // lunes → sábado
    expect(loteAnteriorDe("2026-11-04")).toBe("2026-11-03"); // miércoles → martes
    expect(loteAnteriorDe("2026-11-07")).toBe("2026-11-06"); // sábado → viernes
  });
});

describe("emparejarVendemas", () => {
  it("el lote del día cubre lo cobrado el día anterior en las dos tiendas, y cuadra con la comisión normal", () => {
    // 1,000 cobrados el martes en dos tiendas; el miércoles llegan 972.86 (27.14 de comisión, la de la tarifa).
    const [p] = emparejarVendemas([linea(0, "2026-11-04", 97286)], [dia("tru", "2026-11-03", 600), dia("aqp", "2026-11-03", 400, "Tienda AQP")]);
    expect(p.estado).toBe("cuadra");
    expect(p.dias.map((d) => d.clave)).toEqual(["aqp", "tru"]);
    expect(p.brutoCentimos).toBe(100000);
    expect(p.comisionCentimos).toBe(2714);
    expect(p.motivo).toBeNull();
  });

  it("el lote del lunes junta el sábado y el domingo, no el viernes", () => {
    const [p] = emparejarVendemas([linea(0, "2026-11-09", 29186)], [dia("vie", "2026-11-06", 500), dia("sab", "2026-11-07", 100), dia("dom", "2026-11-08", 200)]);
    expect(p.dias.map((d) => d.clave)).toEqual(["sab", "dom"]);
    expect(p.estado).toBe("cuadra");
  });

  it("con el lote anterior en el extracto, la ventana empieza en su día (un feriado sin lote alarga el siguiente)", () => {
    // Lotes el lunes 2 y el miércoles 4 (el martes 3 fue feriado): el del miércoles cubre lunes y martes.
    const r = emparejarVendemas([linea(0, "2026-11-02", 9729), linea(1, "2026-11-04", 19457)], [dia("sab", "2026-10-31", 100), dia("lun", "2026-11-02", 100), dia("mar", "2026-11-03", 100)]);
    expect(r[0].dias.map((d) => d.clave)).toEqual(["sab"]);
    expect(r[1].dias.map((d) => d.clave)).toEqual(["lun", "mar"]);
  });

  it("un día se asigna a un solo lote, y un lote sin ventas pendientes lo dice (ya registrado u otra máquina)", () => {
    const r = emparejarVendemas([linea(0, "2026-11-04", 9729), linea(1, "2026-11-04", 9729)], [dia("mar", "2026-11-03", 100)]);
    expect(r[0].dias).toHaveLength(1);
    expect(r[1].estado).toBe("sin_ventas");
    expect(r[1].motivo).toContain("ya está registrado");
  });

  it("los días viejos fuera de la ventana no se cuelgan del primer lote", () => {
    const [p] = emparejarVendemas([linea(0, "2026-11-04", 9729)], [dia("viejo", "2026-10-28", 1000), dia("mar", "2026-11-03", 100)]);
    expect(p.dias.map((d) => d.clave)).toEqual(["mar"]);
  });

  it("si llegó más de lo cobrado, o la comisión se aleja de la tarifa, pide revisar (no lo da por bueno)", () => {
    const [mas] = emparejarVendemas([linea(0, "2026-11-04", 10500)], [dia("mar", "2026-11-03", 100)]);
    expect(mas.estado).toBe("revisar");
    expect(mas.motivo).toContain("más de lo que se cobró");
    // 100 cobrados y llegan 90: 10 % de comisión contra 2,7 % de la tarifa.
    const [rara] = emparejarVendemas([linea(0, "2026-11-04", 9000)], [dia("mar", "2026-11-03", 100)]);
    expect(rara.estado).toBe("revisar");
    expect(rara.motivo).toContain("la tarifa espera");
  });

  it("solo mira los lotes de Vendemás que entran", () => {
    expect(emparejarVendemas([linea(0, "2026-11-04", 9729, "qr_izipay"), linea(1, "2026-11-04", -9729)], [dia("mar", "2026-11-03", 100)])).toEqual([]);
  });
});

describe("lo que ya está registrado no se propone otra vez", () => {
  it("una línea con su depósito en el ERP (mismo día y monto) sale «ya registrado» y no se lleva días", () => {
    const r = emparejarVendemas([linea(0, "2026-11-04", 9729), linea(1, "2026-11-05", 9729)], [dia("mar", "2026-11-03", 100), dia("mie", "2026-11-04", 100)], [{ fecha: "2026-11-04", centimos: 9729 }]);
    expect(r[0].estado).toBe("ya_registrado");
    expect(r[0].dias).toEqual([]);
    expect(r[1].estado).toBe("cuadra");
    expect(r[1].dias.map((d) => d.clave)).toEqual(["mie"]);
  });
  it("cada depósito registrado tapa UNA línea: dos lotes iguales el mismo día y un solo depósito dejan uno por registrar", () => {
    const l = [linea(0, "2026-11-04", 9729), linea(1, "2026-11-04", 9729)];
    expect([...lineasYaRegistradas(l, [{ fecha: "2026-11-04", centimos: 9729 }])]).toEqual([0]);
    expect([...lineasYaRegistradas(l, [])]).toEqual([]);
    expect([...lineasYaRegistradas(l, [{ fecha: "2026-11-05", centimos: 9729 }])]).toEqual([]);
  });
});
