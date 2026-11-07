import { describe, expect, it } from "vitest";
import { solesCentimos } from "./flujo-caja-reglas";
import { avisoDelIgvDicho, fraseDelIgvDicho, leerMontoDelIgv, referenciasDelIgv } from "./igv-del-mes-reglas";
import type { PanelImpuestos } from "./impuestos-reglas";

const panel = (foco: Partial<NonNullable<PanelImpuestos["foco"]>> | null, pagos?: PanelImpuestos["pagos"]) =>
  ({ mes: "2026-10", foco: foco ? { aPagar: 0, credito: 0, saldoAFavor: 0, ...foco } : null, pagos }) as Pick<PanelImpuestos, "foco" | "pagos" | "mes">;

describe("leerMontoDelIgv", () => {
  it("0 es un monto y vacío no lo es: «no pago IGV» se dice escribiendo 0", () => {
    expect(leerMontoDelIgv("0")).toEqual({ estado: "ok", monto: 0 });
    expect(leerMontoDelIgv("  ")).toEqual({ estado: "vacio" });
  });
  it("lee la coma decimal y los miles con la regla única", () => {
    expect(leerMontoDelIgv("2,5")).toEqual({ estado: "ok", monto: 2.5 });
    expect(leerMontoDelIgv("1,299.50")).toEqual({ estado: "ok", monto: 1299.5 });
  });
  it("rechaza lo que la base rechazaría, con su porqué", () => {
    expect(leerMontoDelIgv("abc").estado).toBe("mal");
    expect(leerMontoDelIgv("-5").estado).toBe("mal");
    expect(leerMontoDelIgv("10.123").estado).toBe("mal");
    expect(leerMontoDelIgv("2000000").estado).toBe("mal");
  });
});

describe("referenciasDelIgv", () => {
  it("la referencia es el IGV que calcula Impuestos, nunca la cifra grande con renta", () => {
    expect(referenciasDelIgv(panel({ aPagar: 900, credito: 300 })).map((r) => [r.clave, r.monto])).toEqual([["calcula", 900], ["compras", 300]]);
  });
  it("suma el saldo a favor y lo pagado solo si existen", () => {
    const r = referenciasDelIgv(panel({ saldoAFavor: 41878 }, [{ mes: "2026-10", igv: 50, renta: 10 } as NonNullable<PanelImpuestos["pagos"]>[number]]));
    expect(r.map((x) => [x.clave, x.monto])).toEqual([["calcula", 0], ["compras", 0], ["a_favor", 41878], ["pagado", 50]]);
  });
  it("sin el mes en Impuestos no inventa cifras", () => {
    expect(referenciasDelIgv(panel(null))).toEqual([]);
  });
});

describe("los textos", () => {
  it("distingue no dicho de 0 dicho", () => {
    expect(fraseDelIgvDicho(null, "2026-10")).toContain("Todavía no dijiste");
    expect(fraseDelIgvDicho(0, "2026-10")).toBe(`Dijiste ${solesCentimos(0)} de IGV en octubre: es lo que resta Ganancias.`);
  });
  it("repetir el monto dice que no cambió nada", () => {
    expect(avisoDelIgvDicho(0, "2026-10", true).detalle).toContain("no cambian");
    expect(avisoDelIgvDicho(0, "2026-10", false).detalle).toBe("No cambió nada.");
  });
});
