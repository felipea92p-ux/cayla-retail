import { describe, it, expect } from "vitest";
import {
  construirLineas,
  opcionesPrincipal,
  sumaDebe,
  sumaHaber,
  SUBGRUPO,
  type RegistroInputs,
} from "./registro-contable";

// Pruebas de la lógica contable: hacen del "razonado correcto" un "probado correcto".
// Si alguien rompe una regla sin querer, estas pruebas fallan antes de llegar a producción.

const cuentasMock = Object.keys(SUBGRUPO).map((codigo) => ({ codigo, nombre: codigo }));

describe("construirLineas — cada evento arma el asiento correcto", () => {
  it("aporte de dinero: sube el banco y sube el capital", () => {
    const l = construirLineas({ evento: "aporte_dinero", medio: "104", monto: 1000, comprobante: "boleta" });
    expect(l).toEqual([
      { cuenta: "104", debe: 1000, haber: 0 },
      { cuenta: "501", debe: 0, haber: 1000 },
    ]);
  });

  it("aporte en especie: sube el activo contra el capital de apertura", () => {
    const l = construirLineas({ evento: "aporte_especie", cuentaPrincipal: "333", monto: 8784, comprobante: "boleta" });
    expect(l).toEqual([
      { cuenta: "333", debe: 8784, haber: 0 },
      { cuenta: "501", debe: 0, haber: 8784 },
    ]);
  });

  it("compra con FACTURA: separa el IGV (S/1,180 = 1,000 + 180)", () => {
    const l = construirLineas({ evento: "compra", cuentaPrincipal: "333", medio: "104", monto: 1180, comprobante: "factura" });
    expect(l).toContainEqual({ cuenta: "333", debe: 1000, haber: 0 });
    expect(l).toContainEqual({ cuenta: "4011", debe: 180, haber: 0 }); // IGV a favor
    expect(l).toContainEqual({ cuenta: "104", debe: 0, haber: 1180 });
  });

  it("compra con BOLETA: NO separa IGV, todo el monto va al activo", () => {
    const l = construirLineas({ evento: "compra", cuentaPrincipal: "333", medio: "104", monto: 1180, comprobante: "boleta" });
    expect(l).toContainEqual({ cuenta: "333", debe: 1180, haber: 0 });
    expect(l.find((x) => x.cuenta === "4011")).toBeUndefined();
  });

  it("compra con NOTA (informal): igual que boleta, sin crédito de IGV", () => {
    const l = construirLineas({ evento: "compra", cuentaPrincipal: "241", medio: "421", monto: 500, comprobante: "nota" });
    expect(l).toContainEqual({ cuenta: "241", debe: 500, haber: 0 });
    expect(l.find((x) => x.cuenta === "4011")).toBeUndefined();
  });

  it("gasto con factura: subtotal al gasto + IGV a favor", () => {
    const l = construirLineas({ evento: "gasto", cuentaPrincipal: "635", medio: "104", monto: 118, comprobante: "factura" });
    expect(l).toContainEqual({ cuenta: "635", debe: 100, haber: 0 });
    expect(l).toContainEqual({ cuenta: "4011", debe: 18, haber: 0 });
    expect(l).toContainEqual({ cuenta: "104", debe: 0, haber: 118 });
  });

  it("faltan datos → no arma nada (nunca un asiento a medias)", () => {
    expect(construirLineas({ evento: "compra", monto: 100, comprobante: "boleta" })).toEqual([]);
    expect(construirLineas({ evento: "aporte_dinero", monto: 0, comprobante: "boleta" })).toEqual([]);
    expect(construirLineas({ evento: "aporte_dinero", medio: "101", monto: -5, comprobante: "boleta" })).toEqual([]);
  });
});

describe("INVARIANTE: un asiento nunca descuadra (Σdebe === Σhaber)", () => {
  it("se cumple para muchos montos, eventos y comprobantes", () => {
    const montos = [0.1, 1, 33.33, 99.99, 1180, 12052, 233333.33];
    const comprobantes = ["factura", "boleta", "nota"] as const;
    const casos = (m: number, c: (typeof comprobantes)[number]): RegistroInputs[] => [
      { evento: "aporte_dinero", medio: "101", monto: m, comprobante: c },
      { evento: "aporte_especie", cuentaPrincipal: "241", monto: m, comprobante: c },
      { evento: "gasto", cuentaPrincipal: "635", medio: "101", monto: m, comprobante: c },
      { evento: "compra", cuentaPrincipal: "333", medio: "421", monto: m, comprobante: c },
      { evento: "ingreso", cuentaPrincipal: "759", medio: "104", monto: m, comprobante: c },
    ];
    for (const m of montos) {
      for (const c of comprobantes) {
        for (const caso of casos(m, c)) {
          const l = construirLineas(caso);
          expect(l.length).toBeGreaterThanOrEqual(2);
          expect(sumaDebe(l)).toBe(sumaHaber(l)); // el corazón de la partida doble
        }
      }
    }
  });
});

describe("opcionesPrincipal — delimita las cuentas (prevención de errores por diseño)", () => {
  it("'comprar' NO ofrece dinero ni cuentas por cobrar", () => {
    const codigos = opcionesPrincipal("compra", cuentasMock).flatMap((g) => g.cuentas.map((c) => c.codigo));
    expect(codigos).not.toContain("101"); // Caja
    expect(codigos).not.toContain("104"); // Bancos
    expect(codigos).not.toContain("121"); // Clientes por cobrar
    expect(codigos).toContain("333"); // Maquinaria sí
  });

  it("'gasto' NO ofrece las cuentas que el sistema calcula solo", () => {
    const codigos = opcionesPrincipal("gasto", cuentasMock).flatMap((g) => g.cuentas.map((c) => c.codigo));
    expect(codigos).not.toContain("691"); // costo de ventas
    expect(codigos).not.toContain("681"); // depreciación del mes
    expect(codigos).toContain("635"); // alquiler sí
  });

  it("'aporte de dinero' no usa cuenta principal", () => {
    expect(opcionesPrincipal("aporte_dinero", cuentasMock)).toEqual([]);
  });
});
