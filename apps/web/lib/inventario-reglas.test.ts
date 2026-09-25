import { describe, it, expect } from "vitest";
import {
  calcularEstado,
  fotoPrincipal,
  necesitaReponerPiso,
  ordenarPorModeloColorTalla,
  porColgar,
  resumirPorColgar,
  sumarCantidades,
  UMBRAL_REPOSICION_PISO,
  UMBRAL_STOCK_BAJO_ALMACEN,
} from "./inventario-reglas";

// La miniatura de una prenda: Existencias y Conteo tienen que elegir LA MISMA foto
// para la misma prenda, así que la regla vive en un solo lugar y se prueba acá.
describe("fotoPrincipal", () => {
  it("sin fotos no hay miniatura (la fila dibuja el perchero, nunca un roto)", () => {
    expect(fotoPrincipal(undefined)).toBeNull();
    expect(fotoPrincipal(null)).toBeNull();
    expect(fotoPrincipal([])).toBeNull();
  });

  it("gana la marcada como principal, aunque no sea la primera ni la de menor orden", () => {
    expect(
      fotoPrincipal([
        { url: "a.jpg", orden: 0, es_principal: false },
        { url: "b.jpg", orden: 5, es_principal: true },
      ])
    ).toBe("b.jpg");
  });

  it("si ninguna está marcada, gana la de menor orden — sin importar cómo llegaron", () => {
    expect(
      fotoPrincipal([
        { url: "tercera.jpg", orden: 3, es_principal: false },
        { url: "primera.jpg", orden: 1, es_principal: false },
        { url: "segunda.jpg", orden: 2, es_principal: false },
      ])
    ).toBe("primera.jpg");
  });

  it("no reordena el arreglo que recibe", () => {
    const fotos = [
      { url: "b.jpg", orden: 2, es_principal: false },
      { url: "a.jpg", orden: 1, es_principal: false },
    ];
    fotoPrincipal(fotos);
    expect(fotos.map((f) => f.url)).toEqual(["b.jpg", "a.jpg"]);
  });
});

// Umbrales de Felipe: «Reponer piso» con 7 o menos en el piso; «Stock bajo»
// con 10 o menos en el ALMACÉN (no el total — mira solo la reserva). Bajó de
// 20 a 10 el 2026-09-17, probando la pantalla: con 20, un lote chico de
// arranque (boutique, no cadena) caía en "Stock bajo" de entrada. Los ifs de
// `calcularEstado` siguen en orden de severidad: stock_bajo (la reserva ya
// está baja) gana sobre reponer_piso COMO ETIQUETA — pero `necesitaReponerPiso`
// (independiente del chip) sigue ofreciendo el botón mientras quede algo en
// el almacén: "pide traslado" y "reponer lo que queda" no se excluyen.

describe("calcularEstado", () => {
  it("los umbrales son 7 en el piso y 10 en el almacén", () => {
    expect(UMBRAL_REPOSICION_PISO).toBe(7);
    expect(UMBRAL_STOCK_BAJO_ALMACEN).toBe(10);
  });

  it("piso en el umbral o por debajo, con el almacén por encima de 10: reponer", () => {
    expect(calcularEstado(7, 11)).toBe("reponer_piso");
    expect(calcularEstado(1, 50)).toBe("reponer_piso");
    expect(calcularEstado(0, 100)).toBe("reponer_piso");
  });

  it("piso por encima del umbral y almacén sano: normal", () => {
    expect(calcularEstado(8, 11)).toBe("normal");
    expect(calcularEstado(50, 100)).toBe("normal");
  });

  it("almacén en 10 o menos: stock bajo, tenga el piso lo que tenga", () => {
    expect(calcularEstado(50, 10)).toBe("stock_bajo"); // piso lleno, reserva al límite
    expect(calcularEstado(3, 10)).toBe("stock_bajo");
    expect(calcularEstado(0, 5)).toBe("stock_bajo"); // piso vacío, algo de reserva
    expect(calcularEstado(2, 0)).toBe("stock_bajo"); // sin reserva, algo en piso
  });

  it("stock_bajo gana sobre reponer_piso cuando los dos calzarían", () => {
    // Piso bajo (2 <= 7) Y almacén bajo (5 <= 10): la reserva manda como etiqueta.
    expect(calcularEstado(2, 5)).toBe("stock_bajo");
  });

  it("nada en ningún lado: sin stock", () => {
    expect(calcularEstado(0, 0)).toBe("sin_stock");
  });
});

describe("necesitaReponerPiso", () => {
  it("ofrece bajar del almacén aunque el chip diga stock bajo (reserva crítica pero > 0)", () => {
    expect(necesitaReponerPiso(2, 5)).toBe(true); // estado sería stock_bajo, igual hay qué bajar
    expect(necesitaReponerPiso(0, 1)).toBe(true);
    expect(necesitaReponerPiso(7, 11)).toBe(true); // estado reponer_piso
  });

  it("no ofrece nada si el almacén está vacío o el piso ya está cubierto", () => {
    expect(necesitaReponerPiso(2, 0)).toBe(false); // nada que bajar — es sin_stock si piso también es 0
    expect(necesitaReponerPiso(8, 20)).toBe(false); // piso ya cubierto, es normal
  });
});

describe("sumarCantidades (la regla que comparten Existencias y la caja)", () => {
  const fila = (variante_id: string, tipo: string | null, cantidad: number, cantidad_apartada = 0) => ({
    variante_id, cantidad, cantidad_apartada, sububicacion: tipo === null ? null : { tipo },
  });

  it("en una tienda suma piso y almacén, descuenta lo apartado y deja la cuarentena fuera del total", () => {
    const c = sumarCantidades([fila("v1", "piso_venta", 5, 2), fila("v1", "almacen_tienda", 10, 1), fila("v1", "cuarentena", 3)]).get("v1")!;
    expect(c).toMatchObject({ total: 15, piso: 5, almacen: 10, danado: 3, apartado: 3, disponible: 12, pisoDisponible: 3, almacenDisponible: 9 });
    expect(c.estado).toBe(calcularEstado(3, 9));
  });

  it("donde no se separa piso/almacén (Taller) piso, almacén, dañado y estado quedan null", () => {
    const c = sumarCantidades([fila("v1", null, 4, 1)]).get("v1")!;
    expect(c).toMatchObject({ total: 4, disponible: 3, piso: null, almacen: null, danado: null, pisoDisponible: null, estado: null });
  });
});

// «Por colgar» (Frescura del piso, 2026-09-25): talla con algo DISPONIBLE en el almacén y NADA
// disponible en el piso — la clienta no la ve. Las cantidades se arman con `sumarCantidades`, la misma
// regla que usa Existencias, para que el reparto de lo apartado entre piso y almacén sea el real y no
// uno inventado en la prueba.
describe("porColgar", () => {
  const fila = (variante_id: string, tipo: string | null, cantidad: number, cantidad_apartada = 0) => ({
    variante_id, cantidad, cantidad_apartada, sububicacion: tipo === null ? null : { tipo },
  });
  const cantidadesDe = (...filas: ReturnType<typeof fila>[]) => sumarCantidades(filas).get("v1")!;

  it("solo en el almacén, nada colgado: sí — tenga o no una fila de piso en 0", () => {
    expect(porColgar(cantidadesDe(fila("v1", "almacen_tienda", 3)))).toBe(true);
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 3)))).toBe(true);
  });

  it("nada en el piso ni en el almacén: no — no hay qué colgar (es «Sin stock», otra pregunta)", () => {
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 0)))).toBe(false);
  });

  it("con algo colgado: no, aunque sea una sola y el almacén esté lleno (eso es «Reponer», no «Por colgar»)", () => {
    const c = cantidadesDe(fila("v1", "piso_venta", 1), fila("v1", "almacen_tienda", 20));
    expect(porColgar(c)).toBe(false);
    expect(necesitaReponerPiso(c.pisoDisponible!, c.almacenDisponible!)).toBe(true);
  });

  it("no usa el umbral de reposición: 7 colgadas no es «nada colgado»", () => {
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", UMBRAL_REPOSICION_PISO), fila("v1", "almacen_tienda", 5)))).toBe(false);
  });

  it("lo colgado pero apartado para una clienta no cuenta como colgado: sí está por colgar", () => {
    // 2 en el piso, las 2 apartadas: la clienta que entra no tiene ninguna que comprar.
    const c = cantidadesDe(fila("v1", "piso_venta", 2, 2), fila("v1", "almacen_tienda", 3));
    expect(c).toMatchObject({ pisoDisponible: 0, almacenDisponible: 3 });
    expect(porColgar(c)).toBe(true);
  });

  it("si queda una colgada sin apartar, no", () => {
    expect(porColgar(cantidadesDe(fila("v1", "piso_venta", 2, 1), fila("v1", "almacen_tienda", 3)))).toBe(false);
  });

  it("lo del almacén todo apartado: no — no hay nada que se pueda bajar", () => {
    const c = cantidadesDe(fila("v1", "piso_venta", 0), fila("v1", "almacen_tienda", 3, 3));
    expect(c).toMatchObject({ pisoDisponible: 0, almacenDisponible: 0 });
    expect(porColgar(c)).toBe(false);
  });

  it("donde la sede no separa piso de almacén (Taller): nunca", () => {
    const c = cantidadesDe(fila("v1", null, 4));
    expect(c.pisoDisponible).toBeNull();
    expect(porColgar(c)).toBe(false);
  });

  it("toda talla por colgar conserva su botón Reponer (la fila del filtro siempre lleva la acción)", () => {
    for (const almacen of [1, 3, UMBRAL_STOCK_BAJO_ALMACEN, 50]) {
      const c = cantidadesDe(fila("v1", "almacen_tienda", almacen));
      expect(porColgar(c)).toBe(true);
      expect(necesitaReponerPiso(c.pisoDisponible!, c.almacenDisponible!)).toBe(true);
    }
  });
});

describe("resumirPorColgar (el contador del filtro)", () => {
  it("cuenta tallas y suma lo que se puede bajar del almacén, neto de apartados", () => {
    const c = sumarCantidades([
      { variante_id: "a", cantidad: 5, cantidad_apartada: 1, sububicacion: { tipo: "almacen_tienda" } }, // por colgar: 4 que bajar
      { variante_id: "b", cantidad: 2, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } }, // por colgar: 2
      { variante_id: "c", cantidad: 1, cantidad_apartada: 0, sububicacion: { tipo: "piso_venta" } }, // colgada: no
      { variante_id: "c", cantidad: 9, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } },
      { variante_id: "d", cantidad: 0, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } }, // nada: no
    ]);
    expect(resumirPorColgar([...c.values()])).toEqual({ tallas: 2, unidades: 6 });
  });

  it("sin nada por colgar (o en Taller) da cero, no NaN", () => {
    expect(resumirPorColgar([])).toEqual({ tallas: 0, unidades: 0 });
    expect(resumirPorColgar([{ pisoDisponible: null, almacenDisponible: null }])).toEqual({ tallas: 0, unidades: 0 });
  });
});

describe("ordenarPorModeloColorTalla (la lista «Por colgar» se lee por percha)", () => {
  const p = (referencia: string, productoId: string, color: string | null, talla: string | null) => ({ referencia, productoId, color, talla });

  it("las tallas de un mismo modelo y color salen juntas y en su curva", () => {
    const filas = [
      p("Casaca Ximena", "x", "Negro", "L"),
      p("Blusa Lino", "b", "Crudo", "M"),
      p("Casaca Ximena", "x", "Camel", "S"),
      p("Casaca Ximena", "x", "Negro", "S"),
      p("Casaca Ximena", "x", "Negro", "M"),
    ];
    expect(ordenarPorModeloColorTalla(filas).map((f) => `${f.referencia} ${f.color} ${f.talla}`)).toEqual([
      "Blusa Lino Crudo M",
      "Casaca Ximena Camel S",
      "Casaca Ximena Negro S",
      "Casaca Ximena Negro M",
      "Casaca Ximena Negro L",
    ]);
  });

  it("la numeración va en su curva, no en orden alfabético (6 · 8 · 10, no 10 · 6 · 8)", () => {
    const filas = [p("Pantalón Dana", "d", "Azul", "10"), p("Pantalón Dana", "d", "Azul", "6"), p("Pantalón Dana", "d", "Azul", "8")];
    expect(ordenarPorModeloColorTalla(filas).map((f) => f.talla)).toEqual(["6", "8", "10"]);
  });

  it("dos modelos con el mismo nombre no intercalan sus tallas", () => {
    const filas = [p("Top Rita", "2", "Negro", "S"), p("Top Rita", "1", "Negro", "M"), p("Top Rita", "2", "Negro", "M"), p("Top Rita", "1", "Negro", "S")];
    expect(ordenarPorModeloColorTalla(filas).map((f) => `${f.productoId}${f.talla}`)).toEqual(["1S", "1M", "2S", "2M"]);
  });

  it("lo que no tiene color o talla va al final de su grupo, sin perderse", () => {
    const filas = [p("Falda Ana", "a", null, "S"), p("Falda Ana", "a", "Rojo", null), p("Falda Ana", "a", "Rojo", "S")];
    expect(ordenarPorModeloColorTalla(filas).map((f) => `${f.color}/${f.talla}`)).toEqual(["Rojo/S", "Rojo/null", "null/S"]);
  });

  it("no reordena el arreglo que recibe", () => {
    const filas = [p("Z", "z", "Negro", "M"), p("A", "a", "Negro", "S")];
    ordenarPorModeloColorTalla(filas);
    expect(filas.map((f) => f.referencia)).toEqual(["Z", "A"]);
  });
});
