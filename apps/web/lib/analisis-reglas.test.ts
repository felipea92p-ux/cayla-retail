import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import {
  coincideBusqueda,
  diasQueQuedan,
  edadDelInventario,
  esTallaUnica,
  grupoDe,
  LIQUIDAR_DEFECTO,
  LIQUIDAR_MAX,
  LIQUIDAR_MIN,
  leerVista,
  liquidarDesdeValido,
  porLlegar,
  prendasDe,
  sedeDeAnalisis,
  sedeQueMasVende,
  seEstaAcabando,
  vendioDe10,
} from "./analisis-reglas";

// Datos inventados para la prueba (no son de producción).
function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Camisa Oxford",
    color: "Celeste",
    colorHex: "#A9CADA",
    talla: "S",
    categoria: "Camisas y Blusas",
    categoriaPrefijo: "CMS",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 60,
    costo: 27,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

describe("cuántos días quedan", () => {
  it("al ritmo de 30 días; 0 si ya no hay; null si no se vende", () => {
    expect(diasQueQuedan(prenda({ piso: 1, almacen: 1, vendidas30: 6 }))).toBe(10);
    expect(diasQueQuedan(prenda({ vendidas30: 6 }))).toBe(0);
    expect(diasQueQuedan(prenda({ piso: 3 }))).toBeNull();
  });
  it("si queda algo, al menos 1 día", () => {
    expect(diasQueQuedan(prenda({ piso: 1, vendidas30: 300 }))).toBe(1);
  });
  it("se acaba con dos semanas o menos, y lo agotado que se vendía también", () => {
    expect(seEstaAcabando(prenda({ piso: 2, vendidas30: 5 }))).toBe(true); // 12 días
    expect(seEstaAcabando(prenda({ piso: 3, vendidas30: 5 }))).toBe(false); // 18 días
    expect(seEstaAcabando(prenda({ vendidas30: 1 }))).toBe(true);
    expect(seEstaAcabando(prenda({}))).toBe(false);
  });
});

describe("el grupo de cada prenda (una sola)", () => {
  const otras = (v: number, s = 0) => [{ sedeId: "aqp", stock: s, vendidas30: v }];
  it("lo que se acaba se compra, aunque otra tienda la tenga (decide la persona)", () => {
    expect(grupoDe(prenda({ vendidas30: 4, otras: otras(0, 5) }), 60)).toBe("comprar");
  });
  it("lo quieto desde el umbral se manda si otra tienda vendió 2 o más; si no, se liquida", () => {
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 64, otras: otras(3) }), 60)).toBe("enviar");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 64, otras: otras(1) }), 60)).toBe("liquidar");
  });
  it("entre un mes y el umbral se vigila; menos de un mes, nada", () => {
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 44 }), 60)).toBe("vigila");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 20 }), 60)).toBeNull();
  });
  it("mover el umbral cambia el grupo en vivo", () => {
    const p = prenda({ piso: 3, diasSinVender: 53 });
    expect(grupoDe(p, 60)).toBe("vigila");
    expect(grupoDe(p, 50)).toBe("liquidar");
  });
  it("sin stock o sin dato de días, no cae en las quietas", () => {
    expect(grupoDe(prenda({ diasSinVender: 120 }), 60)).toBeNull();
    expect(grupoDe(prenda({ piso: 2 }), 60)).toBeNull();
  });
  it("prendasDe filtra por grupos", () => {
    const a = prenda({ varianteId: "a", vendidas30: 6 });
    const b = prenda({ varianteId: "b", piso: 1, vendidas30: 4 });
    const c = prenda({ varianteId: "c", piso: 4, diasSinVender: 90 });
    expect(prendasDe([c, b, a], ["comprar"], 60).map((p) => p.varianteId)).toEqual(["b", "a"]);
  });
});

describe("otras tiendas", () => {
  it("la que más vende, para mandar", () => {
    const o = [
      { sedeId: "aqp", stock: 3, vendidas30: 0 },
      { sedeId: "lim", stock: 1, vendidas30: 2 },
    ];
    expect(sedeQueMasVende(o)?.sedeId).toBe("lim");
  });
});

describe("por llegar, edad y lo que llega", () => {
  it("suma compra, almacén y taller", () => {
    expect(porLlegar(prenda({ llega: [{ de: "compra", cantidad: 10, fecha: null }, { de: "almacen", cantidad: 2, fecha: null }, { de: "taller", cantidad: 1, fecha: null }] }))).toBe(13);
  });
  it("las unidades por tramo de días sin venderse", () => {
    const e = edadDelInventario([prenda({ piso: 2, diasSinVender: 10 }), prenda({ almacen: 3, diasSinVender: 61 }), prenda({ piso: 1, diasSinVender: 120 }), prenda({ piso: 5 })]);
    expect(e).toEqual({ hasta30: 2, de31a60: 0, de61a90: 3, masDe90: 1 });
  });
  it("de cada 10 que llegaron, cuántas se vendieron", () => {
    expect(vendioDe10([prenda({ llegaron30: 6, vendidasDeLasQueLlegaron30: 5 }), prenda({ llegaron30: 4, vendidasDeLasQueLlegaron30: 9 })])).toBe(9);
    expect(vendioDe10([prenda({})])).toBeNull();
  });
});

describe("Liquidar desde, la vista y el buscador", () => {
  it("se queda en sus topes", () => {
    expect(liquidarDesdeValido(10)).toBe(LIQUIDAR_MIN);
    expect(liquidarDesdeValido(400)).toBe(LIQUIDAR_MAX);
    expect(liquidarDesdeValido("64")).toBe(64);
    expect(liquidarDesdeValido(null)).toBe(LIQUIDAR_DEFECTO);
  });
  it("la vista sale de la URL o es Hoy", () => {
    expect(leerVista("nose")).toBe("nose");
    expect(leerVista(["pedir"])).toBe("pedir");
    expect(leerVista("comparar")).toBe("hoy");
    expect(leerVista(undefined)).toBe("hoy");
  });
  it("busca sin tildes ni mayúsculas", () => {
    expect(coincideBusqueda(prenda({ nombre: "Blusa Rayón" }), "rayon")).toBe(true);
    expect(coincideBusqueda(prenda({}), "celeste s")).toBe(true);
    expect(coincideBusqueda(prenda({}), "vino")).toBe(false);
  });
  it("las tallas únicas no se nombran", () => {
    expect(esTallaUnica("Estándar")).toBe(true);
    expect(esTallaUnica("Única")).toBe(true);
    expect(esTallaUnica("M")).toBe(false);
  });
});

describe("la tienda como se habla en tienda", () => {
  it("código y ciudad", () => {
    expect(sedeDeAnalisis({ id: "1", nombre: "Tienda AQP" })).toMatchObject({ codigo: "AQP", ciudad: "Arequipa" });
    expect(sedeDeAnalisis({ id: "2", nombre: "Tienda Trujillo" })).toMatchObject({ codigo: "TRU", ciudad: "Trujillo" });
    expect(sedeDeAnalisis({ id: "3", nombre: "Tienda Cusco" })).toMatchObject({ codigo: "CUS", ciudad: "Cusco" });
  });
});
