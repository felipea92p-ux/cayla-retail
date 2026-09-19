import { describe, expect, it } from "vitest";
import {
  claveMes,
  desplazarMes,
  leerMes,
  leerMonto,
  lineaTarjeta,
  rangoDelMes,
  sugerenciaEgreso,
  tituloMes,
  validarBorrador,
  type BorradorGasto,
  type TarjetaSede,
} from "./gastos-reglas";

const HOY = "2026-09-18";
const bueno: BorradorGasto = {
  categoria: "alquileres",
  descripcion: "Alquiler de la oficina",
  fecha: "2026-09-10",
  monto: "1500",
  igv: "",
  comprobanteTipo: "boleta",
  comprobanteNumero: "",
  medioPago: "transferencia",
  cajaId: null,
  cajaMovimientoId: null,
};

describe("leerMonto", () => {
  it("acepta miles con coma y decimales", () => expect(leerMonto("1,250.50")).toBe(1250.5));
  it("redondea a centavos", () => expect(leerMonto("10.005")).toBe(10.01));
  it("vacío o texto no es un monto", () => {
    expect(leerMonto("   ")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
  });
});

describe("validarBorrador", () => {
  it("un gasto bien llenado pasa", () => expect(validarBorrador(bueno, HOY)).toBeNull());

  it("pide cada dato en el orden en que se llena, y lleva el cursor al campo", () => {
    expect(validarBorrador({ ...bueno, categoria: "" }, HOY)?.campo).toBe("gasto-categoria");
    expect(validarBorrador({ ...bueno, descripcion: "  " }, HOY)?.campo).toBe("gasto-descripcion");
    expect(validarBorrador({ ...bueno, monto: "0" }, HOY)?.campo).toBe("gasto-monto");
    expect(validarBorrador({ ...bueno, monto: "" }, HOY)?.campo).toBe("gasto-monto");
  });

  it("rechaza una fecha futura: el gasto se registra al pagar", () => {
    expect(validarBorrador({ ...bueno, fecha: "2026-09-19" }, HOY)?.mensaje).toMatch(/futura/);
    expect(validarBorrador({ ...bueno, fecha: HOY }, HOY)).toBeNull();
  });

  it("una factura exige número; una boleta no", () => {
    expect(validarBorrador({ ...bueno, comprobanteTipo: "factura", comprobanteNumero: "" }, HOY)?.campo).toBe("gasto-numero");
    expect(validarBorrador({ ...bueno, comprobanteTipo: "factura", comprobanteNumero: "F001-9" }, HOY)).toBeNull();
    expect(validarBorrador({ ...bueno, comprobanteTipo: "boleta", comprobanteNumero: "" }, HOY)).toBeNull();
  });

  it("el IGV no puede superar el total", () => {
    const f = { ...bueno, comprobanteTipo: "factura" as const, comprobanteNumero: "F001-9" };
    expect(validarBorrador({ ...f, igv: "270" }, HOY)).toBeNull();
    expect(validarBorrador({ ...f, igv: "1501" }, HOY)?.campo).toBe("gasto-igv");
  });

  it("un IGV escrito en una boleta se ignora (la base lo guarda en 0), no bloquea", () => {
    expect(validarBorrador({ ...bueno, comprobanteTipo: "boleta", igv: "500000" }, HOY)).toBeNull();
  });

  it("efectivo necesita una caja o un egreso; los otros medios no", () => {
    expect(validarBorrador({ ...bueno, medioPago: "efectivo" }, HOY)?.campo).toBe("gasto-caja");
    expect(validarBorrador({ ...bueno, medioPago: "efectivo", cajaId: "c1" }, HOY)).toBeNull();
    expect(validarBorrador({ ...bueno, medioPago: "efectivo", cajaMovimientoId: "m1" }, HOY)).toBeNull();
    expect(validarBorrador({ ...bueno, medioPago: "yape" }, HOY)).toBeNull();
  });
});

describe("meses", () => {
  it("lee ?mes= válido y cae al actual si es basura", () => {
    const actual = { anio: 2026, mes: 9 };
    expect(leerMes("2026-03", actual)).toEqual({ anio: 2026, mes: 3 });
    expect(leerMes("2026-13", actual)).toEqual(actual);
    expect(leerMes("marzo", actual)).toEqual(actual);
    expect(leerMes(undefined, actual)).toEqual(actual);
  });

  it("desplazar cruza el año en los dos sentidos", () => {
    expect(desplazarMes({ anio: 2026, mes: 1 }, -1)).toEqual({ anio: 2025, mes: 12 });
    expect(desplazarMes({ anio: 2026, mes: 12 }, 1)).toEqual({ anio: 2027, mes: 1 });
  });

  it("el rango cubre el mes entero, con febrero bisiesto y no", () => {
    expect(rangoDelMes({ anio: 2026, mes: 9 })).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelMes({ anio: 2028, mes: 2 }).hasta).toBe("2028-02-29");
    expect(rangoDelMes({ anio: 2026, mes: 2 }).hasta).toBe("2026-02-28");
    expect(rangoDelMes({ anio: 2026, mes: 12 }).hasta).toBe("2026-12-31");
  });

  it("clave y título", () => {
    expect(claveMes({ anio: 2026, mes: 3 })).toBe("2026-03");
    expect(tituloMes({ anio: 2026, mes: 9 })).toBe("septiembre 2026");
  });
});

describe("sugerenciaEgreso", () => {
  it("un depósito, un retiro o un ajuste sugieren «no es gasto»", () => {
    expect(sugerenciaEgreso("Depósito bancario", false)).toBe("no_gasto");
    expect(sugerenciaEgreso("deposito", false)).toBe("no_gasto");
    expect(sugerenciaEgreso("Retiro de efectivo", false)).toBe("no_gasto");
    expect(sugerenciaEgreso("lo que sea", true)).toBe("no_gasto");
  });
  it("una compra de insumos sugiere gasto; lo ambiguo no sugiere nada", () => {
    expect(sugerenciaEgreso("Compra de insumos", false)).toBe("gasto");
    expect(sugerenciaEgreso("Otro", false)).toBeNull();
  });
});

describe("lineaTarjeta", () => {
  const t = (over: Partial<TarjetaSede>): TarjetaSede => ({ ubicacionId: "u", nombre: "TRU", total: 0, nGastos: 0, igv: 0, porCategoria: [], ...over });
  it("sin gastos lo dice: nadie registró nada", () => expect(lineaTarjeta(t({}))).toBe("Sin gastos registrados"));
  it("un gasto, una categoría", () =>
    expect(lineaTarjeta(t({ total: 300, nGastos: 1, porCategoria: [{ categoria: "alquileres", nombre: "Alquileres", monto: 300 }] }))).toBe("1 gasto · todo en alquileres"));
  it("varias categorías: dice cuál pesa más y cuánto", () =>
    expect(
      lineaTarjeta(
        t({
          total: 400,
          nGastos: 3,
          porCategoria: [
            { categoria: "alquileres", nombre: "Alquileres", monto: 300 },
            { categoria: "transporte", nombre: "Transporte y movilidad", monto: 100 },
          ],
        }),
      ),
    ).toBe("3 gastos · lo que más pesa: alquileres (75 %)"));
});
