import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cuentaDelPrecio } from "./cuenta-de-precio";
import { llegaAlObjetivo, margenALaVista, montoEscrito } from "./margen-a-la-vista";

describe("margenALaVista: lo que queda por prenda contra el objetivo de la prenda (ADR-0668, ADR-0700)", () => {
  it("pagaste S/ 36 y la etiqueta dice S/ 70: te quedan S/ 23.32 (39 %), y con 36 % de objetivo, verde", () => {
    expect(margenALaVista("36", "70", 36)).toEqual({
      ganancia: 23.32,
      pct: 39.3,
      tono: "normal",
      objetivo: 66.9,
      enSoles: "Te quedan S/\u00a023.32",
      texto: "Te quedan S/\u00a023.32 · 39 %",
    });
  });
  it("con un objetivo de 48 % el mismo precio es ámbar, y pide lo que pedía el piso de ADR-0668 (S/ 81.90)", () => {
    expect(margenALaVista(36, 70, 48)).toMatchObject({ tono: "bajo", objetivo: 81.9 });
  });
  it("desde el objetivo, verde; un .90 antes, ámbar", () => {
    expect(margenALaVista(36, 66.9, 36)?.tono).toBe("normal");
    expect(margenALaVista(36, 65.9, 36)?.tono).toBe("bajo");
  });
  it("la blusa de la maqueta: S/ 30.90 a S/ 57.90 llega a 36 %; a S/ 54.90 (33 %) no", () => {
    expect(margenALaVista(30.9, 57.9, 36)?.tono).toBe("normal");
    expect(margenALaVista(30.9, 54.9, 36)).toMatchObject({ tono: "bajo", objetivo: 57.9 });
  });
  it("si el precio no cubre lo pagado más SUNAT, rojo con el signo menos de verdad", () => {
    expect(margenALaVista(36, 40, 36)).toMatchObject({ tono: "pierdes", texto: "Pierdes S/\u00a02.10 · −6 %" });
    // Precio igual al costo: con la parte de SUNAT, se pierde.
    expect(margenALaVista(50, 50, 36)).toMatchObject({ tono: "pierdes", texto: "Pierdes S/\u00a07.63 · −18 %" });
  });
  it("dice lo mismo que la cuenta única, en soles y en %", () => {
    for (const [c, p] of [[25, 59.9], [36, 70], [45, 99.9], [12.5, 29.9]] as const) {
      const cuenta = cuentaDelPrecio(c, p);
      const linea = margenALaVista(c, p, 36);
      expect(linea?.ganancia).toBe(cuenta?.teQuedan);
      expect(linea?.pct).toBe((cuenta?.margenPorMil ?? 0) / 10);
    }
  });
  it("no sabe de facturas: recibe el costo, el precio y el objetivo, nada más", () => {
    expect(margenALaVista.length).toBe(3);
  });
  it("compara exacto: un 35.96 % no pasa por 36 %", () => {
    // 1 − 1.18 × 32.40 ÷ 59.70 = 35.96 %: el % redondeado diría 36.
    expect(llegaAlObjetivo(32.4, 59.7, 36)).toBe(false);
    expect(margenALaVista(32.4, 59.7, 36)?.tono).toBe("bajo");
  });
  it("si ningún precio hasta el tope llega al objetivo con ese costo, ámbar (nunca verde)", () => {
    expect(margenALaVista(3000, 4999.9, 36)).toMatchObject({ tono: "bajo", objetivo: null });
  });
  it("sin costo o sin precio, no hay línea", () => {
    expect(margenALaVista("", "59.90", 36)).toBeNull();
    expect(margenALaVista("30", "", 36)).toBeNull();
    expect(margenALaVista(0, 59.9, 36)).toBeNull();
    expect(margenALaVista("abc", "59.90", 36)).toBeNull();
    expect(margenALaVista(null, undefined, 36)).toBeNull();
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
