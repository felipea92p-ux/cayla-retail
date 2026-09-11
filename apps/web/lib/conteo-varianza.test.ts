import { describe, it, expect } from "vitest";
import { resumirVarianza, type FilaPrevisualizacion } from "./conteo-varianza";

// El cierre del conteo es el único momento en que un número de esta pantalla se convierte
// en una decisión: Felipe mira la diferencia en soles y aprueba o no. Si esa cifra sale
// más chica que la real, un faltante grande pasa por chico y nadie lo investiga — y el
// error no se nota nunca, porque después del cierre el sistema y el piso ya coinciden.
// Estas pruebas fijan la aritmética y, sobre todo, el trato de lo que NO tiene costo.

function fila(p: Partial<FilaPrevisualizacion> = {}): FilaPrevisualizacion {
  return {
    variante_id: "v1",
    codigo: "BLU-0001-AZM-M",
    referencia: "Blusa manga larga",
    talla: "M",
    color: "Azul marino",
    contada: 0,
    sistema: 0,
    diferencia: 0,
    origen: "contado",
    ...p,
  };
}

describe("la diferencia en soles", () => {
  it("un faltante resta y un sobrante suma, al costo", () => {
    const v = resumirVarianza(
      [
        fila({ variante_id: "a", contada: 3, sistema: 5, diferencia: -2 }),
        fila({ variante_id: "b", contada: 4, sistema: 3, diferencia: 1 }),
      ],
      new Map([
        ["a", 20],
        ["b", 30],
      ])
    );
    expect(v.unidadesFaltantes).toBe(2);
    expect(v.unidadesSobrantes).toBe(1);
    expect(v.solesFaltantes).toBe(40);
    expect(v.solesSobrantes).toBe(30);
    expect(v.solesNeto).toBe(-10);
  });

  it("las prendas sin costo NO se cuentan como cero: se declaran aparte", () => {
    const v = resumirVarianza(
      [
        fila({ variante_id: "a", diferencia: -2 }),
        fila({ variante_id: "sinCosto", diferencia: -10 }),
      ],
      new Map([["a", 20]])
    );
    // Las 10 unidades sin costo sí cuentan como unidades…
    expect(v.unidadesFaltantes).toBe(12);
    // …pero no ensucian la cifra en soles con un cero inventado.
    expect(v.solesFaltantes).toBe(40);
    expect(v.lineasSinCosto).toBe(1);
    expect(v.lineas.find((l) => l.varianteId === "sinCosto")?.sinCosto).toBe(true);
  });

  it("una prenda sin costo pero sin diferencia no se declara: no hay nada que advertir", () => {
    const v = resumirVarianza([fila({ variante_id: "x", diferencia: 0 })], new Map());
    expect(v.lineasSinCosto).toBe(0);
  });

  it("los soles se redondean a dos decimales, no se arrastran", () => {
    const v = resumirVarianza([fila({ variante_id: "a", diferencia: 3 })], new Map([["a", 10.333]]));
    expect(v.solesSobrantes).toBe(31);
    expect(v.lineas[0].soles).toBe(31);
  });
});

describe("el orden de la lista", () => {
  it("lo más caro primero, que es el orden en que alguien quiere revisarlo", () => {
    const v = resumirVarianza(
      [
        fila({ variante_id: "chica", diferencia: -1 }),
        fila({ variante_id: "grande", diferencia: -1 }),
      ],
      new Map([
        ["chica", 5],
        ["grande", 500],
      ])
    );
    expect(v.lineas.map((l) => l.varianteId)).toEqual(["grande", "chica"]);
  });

  it("a igual plata, desempata la cantidad — dos sin costo no quedan en orden aleatorio", () => {
    const v = resumirVarianza(
      [
        fila({ variante_id: "una", diferencia: -1 }),
        fila({ variante_id: "muchas", diferencia: -40 }),
      ],
      new Map()
    );
    expect(v.lineas.map((l) => l.varianteId)).toEqual(["muchas", "una"]);
  });
});

describe("lo que nadie contó", () => {
  it("llega marcado como no_contado, que es lo que la pantalla usa para advertir", () => {
    const v = resumirVarianza(
      [fila({ variante_id: "a", contada: 0, sistema: 7, diferencia: -7, origen: "no_contado" })],
      new Map([["a", 12]])
    );
    expect(v.lineas[0].origen).toBe("no_contado");
    expect(v.solesFaltantes).toBe(84);
  });
});
