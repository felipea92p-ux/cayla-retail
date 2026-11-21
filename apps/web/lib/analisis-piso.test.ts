import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { diasEnAlmacen, nuncaSalio, ordenarPiso, prendasSinSalir, tiposPiso, vacioPiso } from "./analisis-piso";
import { diasDeVentas, leerVista, VENTANA_VENTAS } from "./analisis-reglas";

// Datos inventados para la prueba (no son de producción).
const HOY = "2026-10-07";

function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Polo Prueba",
    color: "Gris",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: "indumentaria",
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 2,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: "2026-09-29",
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

describe("qué es «nunca salió al piso»", () => {
  it("guardada y sin ninguna vez en el piso: sí", () => {
    expect(nuncaSalio(prenda({}))).toBe(true);
  });
  it("si salió alguna vez, si está colgada o si no hay nada guardado: no", () => {
    expect(nuncaSalio(prenda({ salioAlPiso: "2026-10-01" }))).toBe(false);
    expect(nuncaSalio(prenda({ piso: 1 }))).toBe(false);
    expect(nuncaSalio(prenda({ almacen: 0 }))).toBe(false);
  });
  it("los días que lleva desde que llegó (hoy es 0); sin fecha, null; nunca negativos", () => {
    expect(diasEnAlmacen(prenda({}), HOY)).toBe(8);
    expect(diasEnAlmacen(prenda({ llego: HOY }), HOY)).toBe(0);
    expect(diasEnAlmacen(prenda({ llego: null }), HOY)).toBeNull();
    expect(diasEnAlmacen(prenda({ llego: "2026-10-09" }), HOY)).toBe(0);
  });
});

describe("el orden", () => {
  it("las que más esperan primero; a igual espera, la de más unidades; sin fecha, al final", () => {
    const lista = [
      prenda({ varianteId: "a", llego: "2026-10-05", almacen: 1 }),
      prenda({ varianteId: "b", llego: "2026-09-29", almacen: 1 }),
      prenda({ varianteId: "c", llego: "2026-09-29", almacen: 4 }),
      prenda({ varianteId: "d", llego: null, almacen: 9 }),
      prenda({ varianteId: "e", piso: 2 }),
    ];
    expect(prendasSinSalir(lista, HOY).map((p) => p.varianteId)).toEqual(["c", "b", "a", "d"]);
  });

  it("los tipos: primero el que más se vende en la tienda (aunque lo vendido esté colgado); a igual venta, más unidades; luego el nombre", () => {
    const todas = [
      prenda({ varianteId: "b1", categoria: "Bodys", almacen: 9 }),
      prenda({ varianteId: "b2", categoria: "Bodys", piso: 1, almacen: 0, salioAlPiso: "2026-10-01", vendidas30: 2 }),
      prenda({ varianteId: "p1", categoria: "Polos", almacen: 1 }),
      prenda({ varianteId: "p2", categoria: "Polos", piso: 3, almacen: 0, salioAlPiso: "2026-10-01", vendidas30: 7 }),
      prenda({ varianteId: "j1", categoria: "Jeans", almacen: 3 }),
      prenda({ varianteId: "c1", categoria: "Casacas", almacen: 3 }),
    ];
    const tipos = tiposPiso(todas, todas, HOY);
    expect(tipos.map((t) => t.categoria)).toEqual(["Polos", "Bodys", "Casacas", "Jeans"]);
    expect(tipos[0]).toMatchObject({ vendidas: 7, unidades: 1, prefijo: "POL", familia: "indumentaria" });
    expect(tipos[0]!.prendas.map((p) => p.varianteId)).toEqual(["p1"]);
  });

  it("el buscador deja ver menos prendas, pero lo vendido del tipo sigue siendo el de toda la tienda", () => {
    const todas = [
      prenda({ varianteId: "p1", nombre: "Polo Alfa", almacen: 1 }),
      prenda({ varianteId: "p2", nombre: "Polo Beta", almacen: 2 }),
      prenda({ varianteId: "p3", nombre: "Polo Gama", piso: 2, almacen: 0, salioAlPiso: "2026-10-01", vendidas30: 5 }),
    ];
    const tipos = tiposPiso(todas, [todas[1]!], HOY);
    expect(tipos).toHaveLength(1);
    expect(tipos[0]).toMatchObject({ vendidas: 5, unidades: 2 });
    expect(tiposPiso(todas, [], HOY)).toEqual([]);
  });
});

describe("cuándo no hay carril", () => {
  it("sin prendas por una falla: sin datos (nunca «todo salió»)", () => {
    expect(vacioPiso({ sabePiso: true, prendas: 0, sinSalir: 0, fallas: 1 })).toBe("sin-datos");
  });
  it("la base todavía no dice cuándo salió al piso: no se inventa una lista", () => {
    expect(vacioPiso({ sabePiso: false, prendas: 40, sinSalir: 40, fallas: 1 })).toBe("sin-saber");
  });
  it("nada guardado sin salir: la respuesta corta y buena; con algo, hay carril", () => {
    expect(vacioPiso({ sabePiso: true, prendas: 40, sinSalir: 0, fallas: 0 })).toBe("todo-salio");
    expect(vacioPiso({ sabePiso: true, prendas: 40, sinSalir: 3, fallas: 0 })).toBeNull();
  });
});

describe("el orden de «Sin salir» (cara B)", () => {
  it("«vende» deja el de los tipos; «dias», lo que más espera primero; «nombre», de la A a la Z", () => {
    const hoy = "2026-11-21";
    const a = { nombre: "Blusa Ensayo", llego: "2026-11-01", almacen: 2, piso: 0, salioAlPiso: null, color: "", talla: "" } as unknown as PrendaAnalisis;
    const b = { nombre: "Abrigo Ensayo", llego: "2026-10-01", almacen: 1, piso: 0, salioAlPiso: null, color: "", talla: "" } as unknown as PrendaAnalisis;
    expect(ordenarPiso([a, b], "vende", hoy)).toEqual([a, b]);
    expect(ordenarPiso([a, b], "nombre", hoy).map((x) => x.nombre)).toEqual(["Abrigo Ensayo", "Blusa Ensayo"]);
    expect(ordenarPiso([a, b], "dias", hoy).map((x) => x.nombre)).toEqual(["Abrigo Ensayo", "Blusa Ensayo"]);
  });
});

describe("los días de ventas de la tienda y la pestaña", () => {
  it("desde la primera venta en el ERP, hoy incluido, hasta 30; sin ventas, 30", () => {
    expect(diasDeVentas("2026-09-30", HOY)).toBe(8);
    expect(diasDeVentas(HOY, HOY)).toBe(1);
    expect(diasDeVentas("2026-08-01", HOY)).toBe(VENTANA_VENTAS);
    expect(diasDeVentas(null, HOY)).toBe(VENTANA_VENTAS);
    expect(diasDeVentas("2026-10-09", HOY)).toBe(1);
  });
  it("«Nunca salió al piso» se abre por la URL (`?vista=piso`)", () => {
    expect(leerVista("piso")).toBe("piso");
  });
});
