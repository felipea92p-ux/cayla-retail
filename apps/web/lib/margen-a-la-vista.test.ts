import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cuentaDelPrecio } from "./cuenta-de-precio";
import { margenALaVista, montoEscrito } from "./margen-a-la-vista";

describe("margenALaVista: lo que queda por prenda, con la cuenta única (ADR-0668)", () => {
  it("pagaste S/ 36 y la etiqueta dice S/ 70: te quedan S/ 23.32, y como no aguanta la rebaja, ámbar con su piso", () => {
    expect(margenALaVista("36", "70")).toEqual({
      ganancia: 23.32,
      pct: 39.3,
      tono: "bajo",
      piso: 81.9,
      enSoles: "Te quedan S/\u00a023.32",
      texto: "Te quedan S/\u00a023.32 · 39 %",
    });
  });
  it("desde el piso, verde", () => {
    expect(margenALaVista(36, 81.9)).toMatchObject({ tono: "normal", texto: "Te quedan S/\u00a033.41 · 48 %" });
    expect(margenALaVista(36, 80.9)?.tono).toBe("bajo");
  });
  it("si el precio no cubre lo pagado más SUNAT, rojo con el signo menos de verdad", () => {
    expect(margenALaVista(36, 40)).toMatchObject({ tono: "pierdes", texto: "Pierdes S/\u00a02.10 · −6 %" });
    // Precio igual al costo: con la parte de SUNAT, se pierde.
    expect(margenALaVista(50, 50)).toMatchObject({ tono: "pierdes", texto: "Pierdes S/\u00a07.63 · −18 %" });
  });
  it("dice lo mismo que la cuenta única, en soles y en %", () => {
    for (const [c, p] of [[25, 59.9], [36, 70], [45, 99.9], [12.5, 29.9]] as const) {
      const cuenta = cuentaDelPrecio(c, p);
      const linea = margenALaVista(c, p);
      expect(linea?.ganancia).toBe(cuenta?.teQuedan);
      expect(linea?.pct).toBe((cuenta?.margenPorMil ?? 0) / 10);
    }
  });
  it("no sabe de facturas: la misma prenda dice lo mismo venga como venga", () => {
    expect(margenALaVista.length).toBe(2);
  });
  it("sin costo o sin precio, no hay línea", () => {
    expect(margenALaVista("", "59.90")).toBeNull();
    expect(margenALaVista("30", "")).toBeNull();
    expect(margenALaVista(0, 59.9)).toBeNull();
    expect(margenALaVista("abc", "59.90")).toBeNull();
    expect(margenALaVista(null, undefined)).toBeNull();
  });
  it("lee montos escritos con coma o con «S/»", () => {
    expect(montoEscrito("S/ 59,90")).toBe(59.9);
    expect(montoEscrito("59.")).toBeNull();
  });
});

describe("nadie vuelve a suponer factura por el RUC", () => {
  it("la línea, Recibir y Nuevo producto ya no reciben si la compra trae factura", () => {
    // Suponerla por el RUC fallaba en 64 % de los papeles de producción (2026-11-15). La factura se suma aparte en Compras.
    for (const archivo of [
      "lib/margen-a-la-vista.ts",
      "components/ui/LineaMargen.tsx",
      "lib/recepcion-envio.ts",
      "components/NuevoProductoForm.tsx",
      "app/(app)/recibir/envio/[id]/page.tsx",
    ]) {
      const fuente = readFileSync(new URL(`../${archivo}`, import.meta.url), "utf8");
      expect(fuente, archivo).not.toMatch(/facturaDelEnvio|FacturaDelMargen|conFacturaAlta/);
    }
  });
});
