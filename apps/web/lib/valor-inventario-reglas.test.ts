import { describe, expect, it } from "vitest";
import {
  armarVistaValor,
  fraseOrigenDelCosto,
  fraseSinCosto,
  leerFilasDeValor,
  lineaAparte,
  sumarSoles,
  type SedeConValor,
} from "./valor-inventario-reglas";

const sede = (id: string, nombre: string, valor: number, extra: Partial<SedeConValor> = {}): SedeConValor => ({
  ubicacionId: id,
  sede: nombre,
  unidades: 10,
  valor,
  unidadesSinCosto: 0,
  tallasSinCosto: 0,
  valorConCostoDeCompra: 0,
  unidadesDanadas: 0,
  valorDanadas: 0,
  unidadesClaure: 0,
  valorClaure: 0,
  ...extra,
});

describe("leerFilasDeValor", () => {
  it("sin filas es «no ve el dinero» (null), nunca una lista vacía que se dibuje como cero", () => {
    expect(leerFilasDeValor(null)).toBeNull();
    expect(leerFilasDeValor(undefined)).toBeNull();
    expect(leerFilasDeValor([])).toBeNull();
  });

  it("convierte a número lo que PostgREST entrega como texto", () => {
    const [f] = leerFilasDeValor([
      {
        ubicacion_id: "u1",
        sede: "Tienda Lima",
        unidades: "188",
        valor: "8698.00",
        unidades_sin_costo: 0,
        prendas_sin_costo: "2",
        valor_con_costo_de_compra: "8000.5",
        unidades_danadas: 1,
        valor_danadas: "40.00",
        unidades_claure: 0,
        valor_claure: 0,
      },
    ])!;
    expect(f).toMatchObject({ unidades: 188, valor: 8698, tallasSinCosto: 2, valorConCostoDeCompra: 8000.5, valorDanadas: 40 });
  });
});

describe("armarVistaValor", () => {
  const filas = [sede("lim", "Tienda Lima", 8698), sede("tru", "Tienda Trujillo", 3086), sede("tal", "Taller", 23400), sede("aqp", "Tienda Arequipa", 0)];

  it("el líder (varias filas) ve la sede abierta y el total de todas, en céntimos exactos", () => {
    const v = armarVistaValor(filas, "tru")!;
    expect(v.sede.sede).toBe("Tienda Trujillo");
    expect(v.todas?.valor).toBe(35184);
    expect(v.todas?.unidades).toBe(40);
  });

  it("la lista por sede va de mayor a menor y no lista las que no tienen nada", () => {
    expect(armarVistaValor(filas, "lim")!.todas?.porSede.map((s) => s.sede)).toEqual(["Taller", "Tienda Lima", "Tienda Trujillo"]);
  });

  it("quien solo ve su sede (una fila) no recibe «todas las sedes»", () => {
    expect(armarVistaValor([sede("tru", "Tienda Trujillo", 3086)], "tru")!.todas).toBeNull();
  });

  it("si la sede abierta no está entre las filas no se dibuja nada: nunca el valor de otra con el nombre de esta", () => {
    expect(armarVistaValor([sede("tru", "Tienda Trujillo", 3086)], "lim")).toBeNull();
    expect(armarVistaValor(null, "lim")).toBeNull();
    expect(armarVistaValor([], "lim")).toBeNull();
  });
});

describe("sumarSoles", () => {
  it("no arrastra el error de los decimales", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumarSoles([0.1, 0.2])).toBe(0.3);
    expect(sumarSoles([])).toBe(0);
  });
});

describe("fraseSinCosto", () => {
  it("si todo tiene costo, no dice nada", () => {
    expect(fraseSinCosto(0, 0)).toBeNull();
  });
  it("dice cuántas prendas y cuántas tallas no cuentan, con singular y plural", () => {
    expect(fraseSinCosto(8, 3)).toBe("8 prendas (3 tallas) sin costo: no cuentan en este valor.");
    expect(fraseSinCosto(1, 1)).toBe("1 prenda (1 talla) sin costo: no cuentan en este valor.");
  });
});

describe("fraseOrigenDelCosto", () => {
  it("sin valor no hay de qué hablar", () => {
    expect(fraseOrigenDelCosto(0, 0)).toBeNull();
  });
  it("ninguno de compra: lo dice sin números", () => {
    expect(fraseOrigenDelCosto(1000, 0)).toMatch(/Ningún costo viene de una compra/);
  });
  it("una parte: dice cuánto y el porcentaje, calculado del dato", () => {
    const f = fraseOrigenDelCosto(1000, 250)!;
    expect(f).toContain("25 %");
    expect(f).toContain("250.00");
  });
  it("menos de 1 % no se redondea a un «0 %» que parezca ninguno", () => {
    expect(fraseOrigenDelCosto(100000, 100)).toContain("menos de 1 %");
  });
  it("todo de compras: lo dice entero", () => {
    expect(fraseOrigenDelCosto(500, 500)).toBe("Todo el costo viene de una compra o de Producción.");
  });
  it("una parte mayor que el total (dato torcido) no pasa de 100 %", () => {
    expect(fraseOrigenDelCosto(500, 900)).toBe("Todo el costo viene de una compra o de Producción.");
  });
});

describe("lineaAparte", () => {
  it("sin unidades no hay línea", () => {
    expect(lineaAparte("Dañadas, aparte", 0, 0)).toBeNull();
  });
  it("con unidades dice cuántas y cuánto valen", () => {
    expect(lineaAparte("De CLAURE, aparte", 2, 52)).toBe("De CLAURE, aparte: 2 prendas · S/ 52.00");
  });
});
