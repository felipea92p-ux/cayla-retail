import { describe, expect, it } from "vitest";
import { agruparPorPrenda, type FilaPrenda } from "./existencias-prendas";
import { ritmoDePrenda, textoDeRitmo, vendidasDeLaTalla } from "./existencias-colgar-primero";
import type { RitmoReciente } from "./existencias-ritmo";

type Fila = FilaPrenda & { ritmoReciente?: RitmoReciente | null };

let n = 0;
function fila(producto: string, color: string, talla: string, piso: number, almacen: number, extra: Partial<Fila> = {}): Fila {
  n += 1;
  const porColgar = piso === 0 && almacen > 0;
  return {
    varianteId: `v${n}`,
    productoId: producto,
    referencia: producto,
    sku: `S${n}`,
    talla,
    color,
    colorHex: null,
    fotoUrl: null,
    categoriaPrefijo: null,
    categoriaFamilia: null,
    codigosBarras: [],
    pisoDisponible: piso,
    almacenDisponible: almacen,
    disponible: piso + almacen,
    apartado: 0,
    danado: 0,
    enTransito: 0,
    marca: null,
    planPiso: { accion: porColgar ? "por_colgar" : "mantener", requisito: 1, central: true, vendidasRecientes: 0, anotadasRecientes: 0, ritmoAtributo: 0, entraUnaSaleUna: false },
    ...extra,
  } as Fila;
}
const medida = (unidadesDia: number): RitmoReciente => ({ tipo: "medida", dias: [], unidadesDia });

describe("el ritmo de una prenda", () => {
  it("suma lo que se vende por semana de las tallas medidas y dice para cuántas semanas alcanza lo libre", () => {
    // 1 por día entre dos tallas = 7 por semana; hay 14 libres: 2 semanas.
    const filas = [fila("B", "Negro", "S", 0, 6, { ritmoReciente: medida(0.5) }), fila("B", "Negro", "M", 4, 4, { ritmoReciente: medida(0.5) })];
    const r = ritmoDePrenda(agruparPorPrenda(filas)[0]);
    expect(r).toEqual({ tipo: "medido", porSemana: 7, semanas: 2 });
    expect(textoDeRitmo(r)).toBe("Se venden unas 7 por semana. Te alcanza para 2 semanas.");
  });

  it("menos de una semana: «Se acaba esta semana»", () => {
    const filas = [fila("B", "Negro", "S", 0, 2, { ritmoReciente: medida(1) })]; // 7 por semana, 2 libres
    expect(textoDeRitmo(ritmoDePrenda(agruparPorPrenda(filas)[0]))).toBe("Se venden unas 7 por semana. Se acaba esta semana.");
  });

  it("con pocas jornadas NO dice una tasa; con cero ventas no dice «nunca vende»", () => {
    const poco = ritmoDePrenda(agruparPorPrenda([fila("B", "Negro", "S", 0, 2, { ritmoReciente: { tipo: "insuficiente", dias: [] } })])[0]);
    expect(poco).toEqual({ tipo: "poco_tiempo" });
    expect(textoDeRitmo(poco)).toBe("Poco tiempo en el piso para medir cuánto se vende.");
    const cero = ritmoDePrenda(agruparPorPrenda([fila("B", "Negro", "S", 0, 2, { ritmoReciente: { tipo: "sin_salida", dias: [], unidadesDia: 0 } })])[0]);
    expect(cero).toEqual({ tipo: "sin_ventas" });
    expect(textoDeRitmo(cero)).toBe("Sin ventas esta semana.");
  });

  it("si el ritmo no se pudo calcular (falló la lectura) no dice nada", () => {
    const r = ritmoDePrenda(agruparPorPrenda([fila("B", "Negro", "S", 0, 2)])[0]);
    expect(r).toEqual({ tipo: "desconocido" });
    expect(textoDeRitmo(r)).toBeNull();
  });

  it("una tasa menor a una por semana no se redondea a cero", () => {
    const filas = [fila("B", "Negro", "S", 0, 2, { ritmoReciente: medida(0.05) })]; // 0,35 por semana
    expect(textoDeRitmo(ritmoDePrenda(agruparPorPrenda(filas)[0]))).toBe("Se venden menos de 1 por semana. Te alcanza para 6 semanas.");
  });
});

describe("lo vendido de una talla", () => {
  it("suma las ventas de sus jornadas, también con pocas jornadas (un hecho, no una tasa)", () => {
    expect(vendidasDeLaTalla({ tipo: "insuficiente", dias: [{ fecha: "2026-10-05", ventas: 1 }, { fecha: "2026-10-06", ventas: 1 }] })).toBe(2);
    expect(vendidasDeLaTalla({ tipo: "sin_salida", dias: [{ fecha: "2026-10-01", ventas: 0 }], unidadesDia: 0 })).toBe(0);
    expect(vendidasDeLaTalla({ tipo: "medida", dias: [{ fecha: "2026-10-01", ventas: 3 }, { fecha: "2026-10-02", ventas: 1 }], unidadesDia: 2 })).toBe(4);
  });
  it("sin lectura del ritmo no dice nada", () => {
    expect(vendidasDeLaTalla(null)).toBeNull();
    expect(vendidasDeLaTalla(undefined)).toBeNull();
  });
});
