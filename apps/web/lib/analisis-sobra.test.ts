import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { modeloDe } from "./analisis-modelo";
import { modelosPorReponer, modelosQueSobran, SOBRA_DIAS, sobraDe, textoSobra, umbralDeSobra, VENTAS_PARA_DECIR_SOBRA, VENTAS_PARA_REPONER } from "./analisis-sobra";

// Datos inventados (el repo es público): modelos, colores y cifras de mentira.
const HOY = "2026-10-17";
let n = 0;
function talla(p: Partial<PrendaAnalisis> = {}): PrendaAnalisis {
  n += 1;
  return {
    varianteId: `v${n}`,
    productoId: "p1",
    nombre: "Polo Ensayo",
    color: "Azul",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: "terceros",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    diasDeVentas: 30,
    ...p,
  };
}
const modelo = (...tallas: PrendaAnalisis[]) => modeloDe(tallas, HOY);

describe("«Sobra» (D11): lo que tienes dura más que el umbral a su propio ritmo", () => {
  // Vendió 30 en 30 días = 1 por día: lo que hay dura tantos días como unidades.
  const conStock = (unidades: number, vendidas30 = 30) => talla({ piso: unidades, vendidas30 });

  it("justo en los límites de los 90 días: 89 no, 90 no, 91 sí", () => {
    expect(SOBRA_DIAS).toBe(90);
    expect(sobraDe(conStock(89), 0)).toBeNull();
    expect(sobraDe(conStock(90), 0)).toBeNull();
    expect(sobraDe(conStock(91), 0)).toEqual({ dias: 91 });
  });

  it("con menos de 3 ventas no se dice «sobra»: 1 venta en 17 días y 30 unidades da 510 días y eso es «no se sabe»", () => {
    expect(VENTAS_PARA_DECIR_SOBRA).toBe(3);
    expect(sobraDe(talla({ piso: 30, vendidas30: 1, diasDeVentas: 17 }), 0)).toBeNull();
    expect(sobraDe(talla({ piso: 30, vendidas30: 2, diasDeVentas: 17 }), 0)).toBeNull();
    // Con 3 ventas en 17 días y 200 unidades: 200 ÷ (3 ÷ 17) = 1.133 días: sobra.
    expect(sobraDe(talla({ piso: 200, vendidas30: 3, diasDeVentas: 17 }), 0)?.dias).toBe(1133);
  });

  it("se compara contra el horizonte de «Qué pedir»: contra una campaña lejana, 100 días no es sobra", () => {
    expect(umbralDeSobra(69)).toBe(90);
    expect(umbralDeSobra(120)).toBe(120);
    expect(umbralDeSobra(Number.NaN)).toBe(90);
    expect(sobraDe(conStock(100), 69)).toEqual({ dias: 100 });
    expect(sobraDe(conStock(100), 120)).toBeNull();
    expect(sobraDe(conStock(121), 120)).toEqual({ dias: 121 });
  });

  it("sin stock o sin ventas no sobra nada", () => {
    expect(sobraDe(talla({ piso: 0, vendidas30: 9 }), 0)).toBeNull();
    expect(sobraDe(talla({ piso: 500, vendidas30: 0 }), 0)).toBeNull();
  });

  it("del que más sobra al que menos, y a igual tiempo el que más tiene", () => {
    const a = modelo(talla({ productoId: "a", nombre: "A", piso: 100, vendidas30: 30 }));
    const b = modelo(talla({ productoId: "b", nombre: "B", piso: 300, vendidas30: 30 }));
    const c = modelo(talla({ productoId: "c", nombre: "C", piso: 200, vendidas30: 60 })); // 100 días, 200 unidades
    const d = modelo(talla({ productoId: "d", nombre: "D", piso: 50, vendidas30: 30 })); // no sobra
    expect(modelosQueSobran([a, d, b, c], 0).map((m) => m.nombre)).toEqual(["B", "C", "A"]);
  });

  it("lo dice como información: sin cantidades, sin «rebaja», sin un número fijo", () => {
    expect(textoSobra(120)).toBe("Tienes para más de 17 semanas a este ritmo: mira antes de comprar más.");
    expect(textoSobra(91)).toBe("Tienes para más de 12 semanas a este ritmo: mira antes de comprar más.");
    expect(textoSobra(400)).toBe("Tienes para más de un año a este ritmo: mira antes de comprar más.");
    expect(textoSobra(120)).not.toMatch(/rebaj|liquid|pide \d/i);
  });
});

describe("un modelo no está en «Reponer» y en «Te sobra» a la vez (revisión de B3)", () => {
  it("S con 60 y sin ventas, M agotada con 6 ventas, L con 30: se repone la M y NO se dice que sobra", () => {
    const m = modelo(talla({ talla: "S", piso: 60 }), talla({ talla: "M", vendidas30: 6 }), talla({ talla: "L", piso: 30 }));
    expect(modelosPorReponer([m]).map((f) => f.modelo)).toEqual([m]);
    expect(modelosQueSobran([m], 0)).toEqual([]);
    expect(sobraDe(m, 0)).toBeNull();
  });
  it("si lo agotado nunca se vendió, el modelo sí puede sobrar", () => {
    const m = modelo(talla({ talla: "S", piso: 200, vendidas30: 30 }), talla({ talla: "M" }));
    expect(modelosQueSobran([m], 0)).toEqual([m]);
  });
});

describe("«Reponer talla o color» (D14): una talla o un color agotado que se vendía, de un modelo que no se acaba entero", () => {
  const polo = (extra: PrendaAnalisis[] = []) => modelo(talla({ talla: "S", piso: 20, vendidas30: 4 }), talla({ talla: "M", piso: 0, vendidas30: 6 }), ...extra);

  it("el modelo dura más de 14 días pero la M se agotó y se vendía: sale, con qué falta", () => {
    const filas = modelosPorReponer([polo()]);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.faltan.texto).toBe("Falta M");
    expect(filas[0]!.vendidas).toBe(6);
  });

  it("justo en el mínimo de ventas: 1 no, 2 sí", () => {
    expect(VENTAS_PARA_REPONER).toBe(2);
    expect(modelosPorReponer([modelo(talla({ talla: "S", piso: 20, vendidas30: 4 }), talla({ talla: "M", piso: 0, vendidas30: 1 }))])).toEqual([]);
    expect(modelosPorReponer([modelo(talla({ talla: "S", piso: 40, vendidas30: 4 }), talla({ talla: "M", piso: 0, vendidas30: 2 }))])).toHaveLength(1);
  });

  it("una talla que nunca se vendió no pide reposición, y las que sí se vendían se nombran sin contarla", () => {
    const m = modelo(talla({ talla: "S", piso: 30, vendidas30: 4 }), talla({ talla: "M", piso: 0, vendidas30: 5 }), talla({ talla: "XS", piso: 0, vendidas30: 0 }));
    const f = modelosPorReponer([m]);
    expect(f[0]!.faltan.todas).toEqual(["M"]);
  });

  it("un modelo que se acaba entero (está en «Se está acabando») o agotado del todo no entra aquí", () => {
    const seAcaba = modelo(talla({ talla: "S", piso: 2, vendidas30: 20 }), talla({ talla: "M", piso: 0, vendidas30: 6 }));
    const agotado = modelo(talla({ talla: "S", piso: 0, vendidas30: 8 }), talla({ talla: "M", piso: 0, vendidas30: 6 }));
    expect(modelosPorReponer([seAcaba, agotado])).toEqual([]);
  });

  it("de los que más vendían a los que menos; el color también cuenta cuando hay varios", () => {
    const a = modelo(talla({ productoId: "a", nombre: "A", color: "Azul", piso: 30, vendidas30: 3 }), talla({ productoId: "a", nombre: "A", color: "Rojo", piso: 0, vendidas30: 3 }));
    const b = modelo(talla({ productoId: "b", nombre: "B", color: "Azul", piso: 30, vendidas30: 3 }), talla({ productoId: "b", nombre: "B", color: "Rojo", piso: 0, vendidas30: 9 }));
    const f = modelosPorReponer([a, b]);
    expect(f.map((x) => x.modelo.nombre)).toEqual(["B", "A"]);
    expect(f[0]!.faltan.texto).toBe("Falta M Rojo");
  });

  it("no sugiere cantidades", () => {
    const f = modelosPorReponer([polo()])[0]!;
    expect(JSON.stringify(f.faltan)).not.toMatch(/al menos|\b\d+ de cada/);
  });
});
