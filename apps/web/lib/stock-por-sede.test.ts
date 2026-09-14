import { describe, it, expect } from "vitest";
import { agruparStockPorSede, nombreCortoSede, textoOtrasSedes } from "./stock-por-sede";

// «No hay tu talla aquí, pero sí en Trujillo» es la venta que hoy se pierde en el
// mostrador. Estas reglas convierten las filas crudas de `stock` (todas las sedes) en
// lo que la encargada de sede necesita leer: cuánto hay aquí y dónde más hay.

const LIMA = "u-lima";
const TRU = "u-tru";
const TALLER = "u-taller";
const ubicaciones = [
  { id: LIMA, nombre: "Tienda Lima" },
  { id: TRU, nombre: "Tienda Trujillo" },
  { id: TALLER, nombre: "Taller" },
];

describe("nombreCortoSede — cómo se nombra la otra sede en una línea corta", () => {
  it("una tienda se lee por su ciudad, sin el «Tienda» delante", () => {
    expect(nombreCortoSede("Tienda Trujillo")).toBe("Trujillo");
    expect(nombreCortoSede("Tienda Lima")).toBe("Lima");
  });

  it("lo que no es tienda se queda con su nombre", () => {
    expect(nombreCortoSede("Taller")).toBe("Taller");
  });
});

describe("agruparStockPorSede — cuánto hay aquí y dónde más", () => {
  it("separa el stock de esta sede del de las otras", () => {
    const m = agruparStockPorSede(
      [
        { variante_id: "v1", ubicacion_id: LIMA, cantidad: 3 },
        { variante_id: "v1", ubicacion_id: TRU, cantidad: 2 },
      ],
      ubicaciones,
      LIMA,
    );
    expect(m.get("v1")).toEqual({ aqui: 3, otrasSedes: [{ sede: "Trujillo", cantidad: 2 }] });
  });

  it("sin fila en esta sede, aquí hay cero — y las otras igual cuentan", () => {
    const m = agruparStockPorSede([{ variante_id: "v1", ubicacion_id: TRU, cantidad: 5 }], ubicaciones, LIMA);
    expect(m.get("v1")).toEqual({ aqui: 0, otrasSedes: [{ sede: "Trujillo", cantidad: 5 }] });
  });

  it("las otras sedes van de más a menos stock, y una con cero no aparece", () => {
    const m = agruparStockPorSede(
      [
        { variante_id: "v1", ubicacion_id: TRU, cantidad: 2 },
        { variante_id: "v1", ubicacion_id: TALLER, cantidad: 15 },
        { variante_id: "v1", ubicacion_id: LIMA, cantidad: 0 },
      ],
      ubicaciones,
      LIMA,
    );
    expect(m.get("v1")?.otrasSedes).toEqual([
      { sede: "Taller", cantidad: 15 },
      { sede: "Trujillo", cantidad: 2 },
    ]);
  });

  it("una fila de una ubicación que no está en la lista (inactiva) se ignora del todo", () => {
    const m = agruparStockPorSede([{ variante_id: "v1", ubicacion_id: "u-cerrada", cantidad: 9 }], ubicaciones, LIMA);
    expect(m.has("v1")).toBe(false);
  });

  it("una variante sin ninguna fila no está en el mapa: el que lee decide el cero", () => {
    const m = agruparStockPorSede([], ubicaciones, LIMA);
    expect(m.has("v1")).toBe(false);
  });
});

describe("textoOtrasSedes — la línea que se lee en el tooltip y en el buscador", () => {
  it("junta las sedes con un punto medio", () => {
    expect(
      textoOtrasSedes([
        { sede: "Taller", cantidad: 15 },
        { sede: "Trujillo", cantidad: 2 },
      ]),
    ).toBe("15 en Taller · 2 en Trujillo");
  });

  it("sin otras sedes no hay línea", () => {
    expect(textoOtrasSedes([])).toBeNull();
  });
});
