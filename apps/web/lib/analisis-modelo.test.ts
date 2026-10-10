import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { diasQueQuedan, grupoDe, nuncaSalio, seEstaAcabando } from "./analisis-reglas";
import { armarModelos, diasSinVenderModelo, modeloDe, variantesDe } from "./analisis-modelo";
import { leerPrendaSede } from "./analisis-sede-lectura";

// Datos inventados para la prueba (ni nombres del catálogo ni cifras de producción), con la forma del caso que llevó a la decisión
// 12 de ADR-0357: un modelo colgado con una talla agotada y otra guardada.
const HOY = "2026-10-10";

function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Chaleco Ensayo",
    color: "Arena",
    colorHex: null,
    talla: "M",
    categoria: "Chalecos",
    categoriaPrefijo: "CHA",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 100,
    costo: 40,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    diasDeVentas: 11,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    ultimaVenta: null,
    llego: "2026-09-25",
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

// El Chaleco Ensayo en mi tienda: Arena S agotada (vendió 1), Arena M colgada, Arena L guardada sin salir; Tostado L colgada, Tostado
// M agotada (vendió 2), Tostado S guardada sin salir. Se colgó por primera vez el 28 de setiembre y vendió por última vez el 8 de octubre.
const chaleco = [
  prenda({ varianteId: "aS", color: "Arena", talla: "S", vendidas30: 1, semanas: [0, 0, 0, 0, 0, 0, 1, 0], salioAlPiso: "2026-09-28", ultimaVenta: "2026-10-02", diasSinVender: 8 }),
  prenda({ varianteId: "aM", color: "Arena", talla: "M", piso: 1, almacen: 2, salioAlPiso: "2026-09-28", diasSinVender: 12 }),
  prenda({ varianteId: "aL", color: "Arena", talla: "L", almacen: 1 }),
  prenda({ varianteId: "tL", color: "Tostado", talla: "L", piso: 1, almacen: 1, salioAlPiso: "2026-10-09", diasSinVender: 1 }),
  prenda({ varianteId: "tM", color: "Tostado", talla: "M", vendidas30: 2, semanas: [0, 0, 0, 0, 0, 0, 1, 1], salioAlPiso: "2026-09-30", ultimaVenta: "2026-10-08", diasSinVender: 2 }),
  prenda({ varianteId: "tS", color: "Tostado", talla: "S", almacen: 1 }),
];

describe("un modelo = todas sus tallas y colores (ADR-0357, decisión 12)", () => {
  const m = modeloDe(chaleco, HOY);

  it("talla por talla, el mismo modelo colgado decía «cómprala» y «nunca salió» a la vez (el problema)", () => {
    expect(seEstaAcabando(chaleco[0])).toBe(true);
    expect(nuncaSalio(chaleco[2])).toBe(true);
    expect(nuncaSalio(chaleco[5])).toBe(true);
  });

  it("como modelo: está colgado (salió al piso), no se acaba y no pide nada", () => {
    expect(m.piso).toBe(2);
    expect(m.almacen).toBe(5);
    expect(m.vendidas30).toBe(3);
    expect(nuncaSalio(m)).toBe(false);
    // 7 unidades al ritmo de 3 en 11 días: 26 días.
    expect(diasQueQuedan(m)).toBe(26);
    expect(seEstaAcabando(m)).toBe(false);
    expect(grupoDe(m, 15)).toBeNull();
  });

  it("suma lo que se cuenta y toma la primera vez que salió y que llegó", () => {
    expect(m.semanas).toEqual([0, 0, 0, 0, 0, 0, 2, 1]);
    expect(m.salioAlPiso).toBe("2026-09-28");
    expect(m.ultimaVenta).toBe("2026-10-08");
    expect(m.llego).toBe("2026-09-25");
    expect(m.diasSinVender).toBe(2);
  });

  it("es una fila con la llave del modelo, sus tallas adentro y sus colores y tallas de lo más vendido a lo menos", () => {
    expect(m.varianteId).toBe("p1");
    expect(m.variantes.map((v) => v.varianteId)).toEqual(["aS", "aM", "aL", "tL", "tM", "tS"]);
    expect(m.colores).toEqual(["Tostado", "Arena"]);
    expect(m.tallas).toEqual(["M", "S", "L"]);
    expect(m.color).toBe("");
    expect(m.talla).toBe("");
    expect(modeloDe([chaleco[1], chaleco[2]], HOY).color).toBe("Arena");
  });

  it("un modelo sin nada colgado nunca salió al piso; con una sola talla colgada, ya salió", () => {
    const guardado = modeloDe([prenda({ varianteId: "x1", almacen: 2 }), prenda({ varianteId: "x2", talla: "L", almacen: 1 })], HOY);
    expect(nuncaSalio(guardado)).toBe(true);
    expect(guardado.diasSinVender).toBeNull();
    const unaColgada = modeloDe([prenda({ varianteId: "x1", almacen: 2 }), prenda({ varianteId: "x2", talla: "L", piso: 1, salioAlPiso: "2026-10-01", diasSinVender: 9 })], HOY);
    expect(nuncaSalio(unaColgada)).toBe(false);
  });

  it("se acaba cuando se acaba el modelo, aunque alguna talla siga en el almacén", () => {
    const acaba = modeloDe(
      [prenda({ varianteId: "y1", vendidas30: 4, salioAlPiso: "2026-10-01", ultimaVenta: "2026-10-09" }), prenda({ varianteId: "y2", talla: "L", almacen: 1, salioAlPiso: "2026-10-01" })],
      HOY,
    );
    expect(seEstaAcabando(acaba)).toBe(true);
    expect(grupoDe(acaba, 15)).toBe("comprar");
  });
});

describe("días sin venderse del modelo", () => {
  it("desde la última venta de cualquiera, o desde la PRIMERA vez que se colgó: colgar otra talla después no reinicia la cuenta", () => {
    const quieto = [
      prenda({ varianteId: "q1", piso: 1, salioAlPiso: "2026-08-01", diasSinVender: 70 }),
      prenda({ varianteId: "q2", talla: "L", piso: 1, salioAlPiso: "2026-10-09", diasSinVender: 1 }),
    ];
    expect(diasSinVenderModelo(quieto, HOY)).toBe(70);
    const m = modeloDe(quieto, HOY);
    expect(grupoDe(m, 15)).toBe("liquidar");
  });

  it("una talla vendida el día en que se colgó cuenta como venta", () => {
    expect(diasSinVenderModelo([prenda({ salioAlPiso: "2026-10-05", ultimaVenta: "2026-10-05", diasSinVender: 5 }), prenda({ varianteId: "v2", salioAlPiso: "2026-09-20", diasSinVender: 20 })], HOY)).toBe(5);
  });

  it("si una talla se vende, el modelo no está quieto aunque otra lleve 40 días colgada", () => {
    const m = modeloDe(
      [prenda({ varianteId: "s1", piso: 1, salioAlPiso: "2026-08-31", diasSinVender: 40 }), prenda({ varianteId: "s2", talla: "S", piso: 1, vendidas30: 1, salioAlPiso: "2026-09-10", ultimaVenta: "2026-10-03", diasSinVender: 7 })],
      HOY,
    );
    expect(m.diasSinVender).toBe(7);
    expect(grupoDe(m, 15)).toBeNull();
  });

  it("sin la última venta en la base (undefined), cuenta con lo más reciente de sus tallas", () => {
    const sinUltima = chaleco.map((v) => {
      const copia = { ...v };
      delete copia.ultimaVenta;
      return copia;
    });
    expect(diasSinVenderModelo(sinUltima, HOY)).toBe(1);
    expect("ultimaVenta" in modeloDe(sinUltima, HOY)).toBe(false);
  });

  it("nunca salió al piso: null", () => {
    expect(diasSinVenderModelo([prenda({ almacen: 3 })], HOY)).toBeNull();
  });
});

describe("la red, lo que viene, el dinero y el orden", () => {
  it("suma lo de cada otra tienda y junta lo que viene del mismo lado el mismo día", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "r1", otras: [{ sedeId: "aqp", stock: 2, vendidas30: 1 }, { sedeId: "lim", stock: 0, vendidas30: 0 }], llega: [{ de: "compra", cantidad: 3, fecha: "2026-10-15" }] }),
        prenda({ varianteId: "r2", talla: "L", otras: [{ sedeId: "aqp", stock: 1, vendidas30: 2 }, { sedeId: "lim", stock: 4, vendidas30: 0 }], llega: [{ de: "compra", cantidad: 2, fecha: "2026-10-15" }, { de: "taller", cantidad: 1, fecha: null }] }),
      ],
      HOY,
    );
    expect(m.otras).toEqual([{ sedeId: "aqp", stock: 3, vendidas30: 3 }, { sedeId: "lim", stock: 4, vendidas30: 0 }]);
    expect(m.llega).toEqual([{ de: "compra", cantidad: 5, fecha: "2026-10-15" }, { de: "taller", cantidad: 1, fecha: null }]);
  });

  it("precio y costo: el promedio pesado por lo que hay; null si ninguna talla lo tiene", () => {
    const m = modeloDe([prenda({ varianteId: "d1", almacen: 3, precio: 100 }), prenda({ varianteId: "d2", talla: "L", almacen: 1, precio: 120, costo: null })], HOY);
    expect(m.precio).toBe(105);
    expect(m.costo).toBe(40);
    expect(modeloDe([prenda({ costo: null })], HOY).costo).toBeNull();
  });

  it("la cara del modelo es el color que más se vende, con su foto", () => {
    const m = modeloDe(
      [prenda({ varianteId: "f1", color: "Arena", colorHex: "#c2b280", fotoUrl: "a.jpg", almacen: 5 }), prenda({ varianteId: "f2", color: "Tostado", colorHex: "#8b5a2b", fotoUrl: "t.jpg", vendidas30: 1 })],
      HOY,
    );
    expect(m.colorHex).toBe("#8b5a2b");
    expect(m.fotoUrl).toBe("t.jpg");
  });

  it("arma un modelo por producto, en el orden de su primera talla, y variantesDe las devuelve todas", () => {
    const otro = prenda({ varianteId: "o1", productoId: "p2", nombre: "Blusa Ensayo" });
    const modelos = armarModelos([chaleco[0], otro, ...chaleco.slice(1)], HOY);
    expect(modelos.map((x) => x.productoId)).toEqual(["p1", "p2"]);
    expect(variantesDe(modelos)).toHaveLength(7);
  });
});

describe("la lectura de la última venta", () => {
  const fila = { variante_id: "v", producto_id: "p", nombre: "Chaleco Ensayo" };
  it("con la clave, su fecha o null; sin la clave (base sin 20261010120000), undefined", () => {
    expect(leerPrendaSede({ ...fila, ultima_venta: "2026-10-08" })?.ultimaVenta).toBe("2026-10-08");
    expect(leerPrendaSede({ ...fila, ultima_venta: null })?.ultimaVenta).toBeNull();
    expect(leerPrendaSede(fila)).not.toHaveProperty("ultimaVenta");
  });
});
