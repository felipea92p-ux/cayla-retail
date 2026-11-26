import { describe, expect, it } from "vitest";
import type { MetodoPagoVenta } from "@cayla-retail/shared";
import { METODOS_PAGO_VENTA } from "@cayla-retail/shared";
import type { UnidadesDeDueno } from "./dueno-reglas";
import {
  aliadaDeLaLinea,
  conCuentasPagos,
  cuentaDelPago,
  leerNumerosDeAliadas,
  numeroQueDar,
  numeroSugerido,
  numerosPara,
  pedidoDeCuentas,
  repartoPorDueno,
  type NumeroDeAliada,
  type RepartoPorDueno,
} from "./cobro-por-dueno-reglas";

const CAYLA = "id-cayla";
const CLAURE = "id-claure";
const OTRA = "id-otra";
const DATOS: Record<string, { clave: string; nombre: string }> = {
  [CAYLA]: { clave: "cayla", nombre: "CAYLA" },
  [CLAURE]: { clave: "claure", nombre: "CLAURE" },
  [OTRA]: { clave: "otra", nombre: "Otra Aliada" },
};
const unidades = (empresaId: string, cantidad: number, cantidadApartada = 0): UnidadesDeDueno => ({ empresaId, ...DATOS[empresaId]!, cantidad, cantidadApartada });
const claure = (monto: number) => ({ empresaId: CLAURE, clave: "claure", nombre: "CLAURE", monto });
const otra = (monto: number) => ({ empresaId: OTRA, clave: "otra", nombre: "Otra Aliada", monto });
const reparto = (cayla: number, ...aliadas: RepartoPorDueno["aliadas"]): RepartoPorDueno => ({ cayla, aliadas });

describe("aliadaDeLaLinea", () => {
  it("manda lo que eligió la colaboradora", () => {
    const duenos = { v: [unidades(CAYLA, 2), unidades(CLAURE, 3)] };
    expect(aliadaDeLaLinea("v", null, duenos, { v: CLAURE })?.empresaId).toBe(CLAURE);
    expect(aliadaDeLaLinea("v", "CLAURE", duenos, { v: CAYLA })).toBeNull();
  });
  it("sirve para cualquier aliada, no solo CLAURE", () => {
    expect(aliadaDeLaLinea("v", null, { v: [unidades(OTRA, 1)] }, {})).toEqual({ empresaId: OTRA, clave: "otra", nombre: "Otra Aliada" });
  });
  it("sin elección, toma a la única empresa con unidades disponibles", () => {
    expect(aliadaDeLaLinea("v", null, { v: [unidades(CLAURE, 1), unidades(CAYLA, 2, 2)] }, {})?.clave).toBe("claure");
    expect(aliadaDeLaLinea("v", "CLAURE", { v: [unidades(CAYLA, 1), unidades(CLAURE, 1, 1)] }, {})).toBeNull();
  });
  it("si el reparto no sabe, usa la insignia de la prenda (sin empresa: no se le propone cuenta)", () => {
    expect(aliadaDeLaLinea("v", "CLAURE", {}, {})).toEqual({ empresaId: null, clave: "", nombre: "CLAURE" });
    expect(aliadaDeLaLinea("v", null, {}, {})).toBeNull();
    expect(aliadaDeLaLinea("v", undefined, { v: [unidades(CAYLA, 0), unidades(CLAURE, 0)] }, {})).toBeNull();
  });
  it("una elección de una empresa que ya no tiene esa prenda no cuenta", () => {
    expect(aliadaDeLaLinea("v", null, { v: [unidades(CLAURE, 1)] }, { v: CAYLA })?.clave).toBe("claure");
  });
});

describe("repartoPorDueno", () => {
  const de = (l: { marca: string }) => (l.marca === "cayla" ? null : { empresaId: l.marca, ...DATOS[l.marca]! });
  it("multiplica por la cantidad y suma en céntimos, por empresa, sin errores de coma flotante", () => {
    const lineas = [
      { marca: CLAURE, cantidad: 3, precioFinalUnitario: 19.9 },
      { marca: "cayla", cantidad: 3, precioFinalUnitario: 0.1 },
      { marca: OTRA, cantidad: 1, precioFinalUnitario: 0.2 },
      { marca: OTRA, cantidad: 2, precioFinalUnitario: 0.1 },
    ];
    expect(repartoPorDueno(lineas, de)).toEqual(reparto(0.3, claure(59.7), otra(0.4)));
  });
  it("una línea a 0 no le suma valor a su marca", () => {
    expect(repartoPorDueno([{ marca: CLAURE, cantidad: 1, precioFinalUnitario: 59 }, { marca: "cayla", cantidad: 1, precioFinalUnitario: 0 }], de)).toEqual(reparto(0, claure(59)));
  });
  it("un ticket vacío vale cero", () => {
    expect(repartoPorDueno([], de)).toEqual(reparto(0));
  });
});

describe("numeroQueDar", () => {
  const SIN_CELULAR = METODOS_PAGO_VENTA.filter((m) => m !== "yape" && m !== "plin");
  const CELULAR: MetodoPagoVenta[] = ["yape", "plin"];

  it("en una sede con una sola empresa no dice nada, con ningún medio", () => {
    expect(numeroQueDar(null, [])).toBeNull();
    for (const m of METODOS_PAGO_VENTA) expect(numeroQueDar(null, [m])).toBeNull();
  });
  it("un ticket todo de CLAURE con Yape o Plin manda al número de Claudia (como siempre)", () => {
    for (const m of CELULAR) expect(numeroQueDar(reparto(0, claure(59)), [m])).toEqual({ titulo: "Dale el número de Claudia", detalle: "La plata le llega a ella." });
  });
  it("un ticket todo de otra aliada manda a su número, con su nombre", () => {
    expect(numeroQueDar(reparto(0, otra(59)), ["yape"])?.titulo).toBe("Dale el número de Otra Aliada");
  });
  it("un ticket todo de CAYLA con Yape o Plin manda al número de CAYLA o al QR", () => {
    for (const m of CELULAR) {
      const dicho = numeroQueDar(reparto(59), [m]);
      expect(dicho?.titulo).toBe("Dale el número de CAYLA o el QR");
      expect(dicho?.detalle).toContain("QR");
    }
  });
  it("un ticket de una marca no dice nada antes de elegir ni con otro medio", () => {
    for (const r of [reparto(0, claure(59)), reparto(59)]) {
      expect(numeroQueDar(r, [])).toBeNull();
      for (const m of SIN_CELULAR) expect(numeroQueDar(r, [m])).toBeNull();
    }
  });
  it("un ticket de dos marcas dice cuánto va a cada número antes de elegir y con Yape", () => {
    for (const medios of [[], ["yape"], ["plin"], ["efectivo", "yape"]] as MetodoPagoVenta[][]) {
      const dicho = numeroQueDar(reparto(28, claure(70)), medios);
      expect(dicho?.titulo).toBe("Este ticket es de dos marcas");
      expect(dicho?.detalle).toBe("CLAURE S/70.00 va al número de Claudia. CAYLA S/28.00, al QR o a su número.");
    }
  });
  it("dos aliadas sin CAYLA también son dos marcas; tres partes se cuentan", () => {
    expect(numeroQueDar(reparto(0, claure(70), otra(30)), [])?.titulo).toBe("Este ticket es de dos marcas");
    expect(numeroQueDar(reparto(10, claure(70), otra(30)), [])?.titulo).toBe("Este ticket es de 3 marcas");
  });
  it("un ticket de dos marcas se calla si ya se cobra todo por otro medio", () => {
    for (const m of SIN_CELULAR) expect(numeroQueDar(reparto(28, claure(70)), [m])).toBeNull();
  });
  it("un ticket que no vale nada no dice nada", () => {
    expect(numeroQueDar(reparto(0, claure(0)), ["yape"])).toBeNull();
  });
});

describe("a qué número va cada pago", () => {
  const NUMEROS: NumeroDeAliada[] = leerNumerosDeAliadas([
    { empresa_id: CLAURE, clave: "claure", nombre: "CLAURE", cuenta_id: "yape-claure", medio: null, numero: "922" },
    { empresa_id: OTRA, clave: "otra", nombre: "Otra Aliada", cuenta_id: "yape-otra", medio: "yape", numero: "911" },
    { empresa_id: OTRA, clave: "otra", nombre: "Otra Aliada", cuenta_id: "banco-otra", medio: "transferencia", numero: "191" },
    { empresa_id: OTRA, cuenta_id: 5 },
  ]);

  it("lee las filas de la base; un medio vacío es Yape (las de antes) y una fila rota se descarta", () => {
    expect(NUMEROS.map((n) => `${n.cuentaId}:${n.medio}`)).toEqual(["yape-claure:yape", "yape-otra:yape", "banco-otra:transferencia"]);
  });
  it("el Plin va al Yape si no hay Plin; la transferencia, solo a una cuenta de banco; el efectivo, a ninguna", () => {
    expect(numerosPara(NUMEROS, "plin").map((n) => n.cuentaId)).toEqual(["yape-claure", "yape-otra"]);
    expect(numerosPara(NUMEROS, "transferencia").map((n) => n.cuentaId)).toEqual(["banco-otra"]);
    expect(numerosPara(NUMEROS, "efectivo")).toEqual([]);
  });
  it("todo de una aliada: propone su número, sea cual sea el monto", () => {
    expect(numeroSugerido(reparto(0, otra(59)), NUMEROS, "yape", 20)).toBe("yape-otra");
    expect(numeroSugerido(reparto(0, otra(59)), NUMEROS, "transferencia", 59)).toBe("banco-otra");
  });
  it("mixto: propone el de la aliada cuya parte es justo ese pago; si ninguna calza, el de CAYLA", () => {
    const r = reparto(28, claure(70));
    expect(numeroSugerido(r, NUMEROS, "yape", 70)).toBe("yape-claure");
    expect(numeroSugerido(r, NUMEROS, "yape", 28)).toBe("");
    expect(numeroSugerido(r, NUMEROS, "yape", 98)).toBe("");
  });
  it("todo de CAYLA, sin reparto o sin número de esa aliada para ese medio: el de CAYLA", () => {
    expect(numeroSugerido(reparto(59), NUMEROS, "yape", 59)).toBe("");
    expect(numeroSugerido(null, NUMEROS, "yape", 59)).toBe("");
    expect(numeroSugerido(reparto(0, claure(59)), NUMEROS, "transferencia", 59)).toBe("");
  });
  it("una prenda conocida solo por su insignia (sin empresa) no recibe número", () => {
    expect(numeroSugerido(reparto(0, { empresaId: null, clave: "", nombre: "CLAURE", monto: 59 }), NUMEROS, "yape", 59)).toBe("");
  });
  it("el pedido solo lleva Yape, Plin o transferencia con una cuenta elegida", () => {
    const elegido = ({ metodo: m, monto }: { metodo: MetodoPagoVenta; monto: number }) => (m === "yape" && monto === 70 ? "yape-claure" : m === "efectivo" ? "no-va" : "");
    expect(
      pedidoDeCuentas(
        [
          { metodo: "yape", monto: 70 },
          { metodo: "yape", monto: 28 },
          { metodo: "efectivo", monto: 10 },
        ],
        elegido,
      ),
    ).toEqual([{ metodo: "yape", monto: 70, cuenta: "yape-claure" }]);
  });
  it("lo que eligió la cajera manda mientras sirva para su medio; CAYLA también es una elección", () => {
    const r = reparto(28, claure(70));
    expect(cuentaDelPago({ metodo: "yape", monto: 70 }, r, NUMEROS)).toBe("yape-claure");
    expect(cuentaDelPago({ metodo: "yape", monto: 70, numeroAliada: "" }, r, NUMEROS)).toBe("");
    expect(cuentaDelPago({ metodo: "yape", monto: 28, numeroAliada: "yape-otra" }, r, NUMEROS)).toBe("yape-otra");
    expect(cuentaDelPago({ metodo: "transferencia", monto: 70, numeroAliada: "yape-claure" }, r, NUMEROS)).toBe("");
  });
  it("sin pedido, la llamada sale como siempre; con pedido, lleva el encabezado", () => {
    const llamadas: [string, string][] = [];
    const consulta = { setHeader(n: string, v: string) { llamadas.push([n, v]); return consulta; } };
    conCuentasPagos(consulta, []);
    expect(llamadas).toEqual([]);
    conCuentasPagos(consulta, [{ metodo: "yape", monto: 70, cuenta: "c" }]);
    expect(llamadas).toEqual([["x-cuentas-pagos", '[{"metodo":"yape","monto":70,"cuenta":"c"}]']]);
  });
});
