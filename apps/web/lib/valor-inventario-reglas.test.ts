import { describe, expect, it } from "vitest";
import {
  armarVistaValor,
  fraseDeLasQueFaltan,
  fraseOrigenDelCosto,
  fraseSinCosto,
  leerFilasDeValor,
  leerTallasSinCosto,
  lineaAparte,
  nombreDeTalla,
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

describe("leerTallasSinCosto", () => {
  const fila = { variante_id: "v1", producto_id: "p1", nombre: "Blusa Emma", color: "Beige", talla: "M", sku: "BLU-EMMA-BEI-M", unidades: "3" };

  it("sin respuesta (sin permiso o la base no contestó) es null, nunca una lista vacía que parezca «todo tiene costo»", () => {
    expect(leerTallasSinCosto(null)).toBeNull();
    expect(leerTallasSinCosto(undefined)).toBeNull();
    expect(leerTallasSinCosto([])).toBeNull();
    expect(leerTallasSinCosto("x")).toBeNull();
    expect(leerTallasSinCosto({ total: 0 })).toBeNull();
  });

  it("una lista de verdad sin tallas es una lista vacía, distinta de «no pude leer»", () => {
    expect(leerTallasSinCosto({ total: 0, filas: [] })).toEqual({ total: 0, filas: [] });
  });

  it("convierte lo que llega como texto y deja los pedazos que faltan en null", () => {
    const l = leerTallasSinCosto({ total: "5", filas: [fila, { ...fila, variante_id: "v2", color: null, talla: "", sku: null }] })!;
    expect(l.total).toBe(5);
    expect(l.filas[0]).toMatchObject({ varianteId: "v1", productoId: "p1", unidades: 3, color: "Beige" });
    expect(l.filas[1]).toMatchObject({ color: null, talla: null, sku: null });
  });

  it("descarta la fila mal formada en vez de inventarla, y el total nunca es menor que lo que se ve", () => {
    const l = leerTallasSinCosto({ total: 0, filas: [fila, { variante_id: "v9" }, null, 7] })!;
    expect(l.filas).toHaveLength(1);
    expect(l.total).toBe(1);
  });
});

describe("nombreDeTalla y fraseDeLasQueFaltan", () => {
  it("une modelo, color y talla sin dejar huecos", () => {
    expect(nombreDeTalla({ nombre: "Blusa Emma", color: "Beige", talla: "M" })).toBe("Blusa Emma · Beige · M");
    expect(nombreDeTalla({ nombre: "Blusa Emma", color: null, talla: "M" })).toBe("Blusa Emma · M");
  });
  it("dice cuántas faltan por dibujar, con singular y plural, o nada si se ve todo", () => {
    expect(fraseDeLasQueFaltan(20, 20)).toBeNull();
    expect(fraseDeLasQueFaltan(3, 5)).toBeNull();
    expect(fraseDeLasQueFaltan(21, 20)).toBe("y 1 talla más. Corrige estas y vuelve a mirar.");
    expect(fraseDeLasQueFaltan(27, 20)).toBe("y 7 tallas más. Corrige estas y vuelve a mirar.");
  });
});
