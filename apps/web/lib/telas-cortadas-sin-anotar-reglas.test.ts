import { describe, expect, it } from "vitest";
import { avisosDeTelaCortada, leerTelasCortadasSinAnotar, type TelaCortadaSinAnotar } from "./telas-cortadas-sin-anotar-reglas";

const fila = (o: Partial<TelaCortadaSinAnotar> = {}): TelaCortadaSinAnotar => ({
  produccionId: "op-3",
  numero: 3,
  insumoId: "i-1",
  nombre: "Satín Singapur · Perla",
  unidad: "m",
  plan: 5.454,
  saldo: 5.5,
  ...o,
});

describe("leer lo que devuelve la base", () => {
  it("lee las filas completas y descarta las que vienen a medias", () => {
    const crudo = [
      { produccion_id: "op-3", numero: 3, insumo_id: "i-1", nombre: "Satín Singapur · Perla", unidad: "m", plan: "5.454", saldo: "5.500" },
      { produccion_id: "op-3", numero: 3, insumo_id: "i-2", nombre: "", plan: 1, saldo: 1 },
      { produccion_id: "op-3", numero: "x", insumo_id: "i-3", nombre: "Raso", plan: 1, saldo: 1 },
      null,
      "basura",
    ];
    expect(leerTelasCortadasSinAnotar(crudo)).toEqual([fila()]);
  });

  it("algo que no es una lista (la base sin la función, un error) es una lista vacía", () => {
    expect(leerTelasCortadasSinAnotar(null)).toEqual([]);
    expect(leerTelasCortadasSinAnotar({ error: "x" })).toEqual([]);
  });
});

describe("los avisos de Insumos", () => {
  it("la OP-3 con seis colores es UN aviso que nombra la tela una vez", () => {
    const colores = ["Amarillo mantequilla", "Perla", "Chocolate", "Negro", "Vino", "Beige"];
    const a = avisosDeTelaCortada(colores.map((c, i) => fila({ insumoId: `i-${i}`, nombre: `Satín Singapur · ${c}` })));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ numeroTexto: "OP-000003", href: "/produccion/ordenes/OP-000003", titulo: "La OP-000003 ya cortó y no tiene su tela anotada" });
    expect(a[0].texto).toContain("Satín Singapur · 6 colores");
    expect(a[0].texto).not.toContain("Perla");
  });

  it("una tela de un solo color conserva su nombre, y dos telas se juntan con «y»", () => {
    const a = avisosDeTelaCortada([fila({ nombre: "Satín Singapur · Perla" }), fila({ insumoId: "i-9", nombre: "Forro Bemberg · Crudo" })]);
    expect(a[0].texto).toContain("Satín Singapur · Perla y Forro Bemberg · Crudo");
  });

  it("sin tela en el estante no hay nada que anotar todavía: no avisa", () => {
    expect(avisosDeTelaCortada([fila({ saldo: 0 })])).toEqual([]);
  });

  it("solo nombra las telas que ya tienen algo en el estante", () => {
    const a = avisosDeTelaCortada([fila({ nombre: "Satín Singapur · Perla" }), fila({ insumoId: "i-2", nombre: "Satín Singapur · Vino", saldo: 0 })]);
    expect(a[0].texto).toContain("Satín Singapur · Perla");
    expect(a[0].texto).not.toContain("colores");
  });

  it("un aviso por orden, en orden de número", () => {
    const a = avisosDeTelaCortada([fila({ produccionId: "op-12", numero: 12 }), fila({ produccionId: "op-3", numero: 3 })]);
    expect(a.map((x) => x.numeroTexto)).toEqual(["OP-000003", "OP-000012"]);
  });

  it("sin filas no hay avisos", () => {
    expect(avisosDeTelaCortada([])).toEqual([]);
  });
});
