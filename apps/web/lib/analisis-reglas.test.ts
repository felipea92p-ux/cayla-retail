import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import {
  coincideBusqueda,
  conVentanaDeRitmo,
  DIAS_MINIMOS_RITMO,
  ventanaDeRitmo,
  diasQueQuedan,
  edadDelInventario,
  esTallaUnica,
  grupoDe,
  LIQUIDAR_DEFECTO,
  LIQUIDAR_MAX,
  LIQUIDAR_MIN,
  leerBusqueda,
  leerVista,
  liquidarDesdeValido,
  noHabiaDe,
  ordenSeAcaba,
  otraSedeQueLaTiene,
  porLlegar,
  prendasDe,
  sedeDeAnalisis,
  sedeQueMasVende,
  seEstaAcabando,
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
    salioAlPiso: null,
    llego: null,
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
  it("el ritmo es el de los días de ventas que tiene la tienda (hasta 30), no siempre 30", () => {
    // Datos inventados: 3 en la tienda y 2 vendidas. Entre 30 días duran 45; entre los 8 días que la tienda vende en el ERP, 12.
    expect(diasQueQuedan(prenda({ piso: 3, vendidas30: 2 }))).toBe(45);
    expect(diasQueQuedan(prenda({ piso: 3, vendidas30: 2, diasDeVentas: 8 }))).toBe(12);
    expect(seEstaAcabando(prenda({ piso: 3, vendidas30: 2 }))).toBe(false);
    expect(seEstaAcabando(prenda({ piso: 3, vendidas30: 2, diasDeVentas: 8 }))).toBe(true);
    // Fuera de 1 a 30, se lleva al borde.
    expect(diasQueQuedan(prenda({ piso: 3, vendidas30: 2, diasDeVentas: 60 }))).toBe(45);
    expect(diasQueQuedan(prenda({ piso: 3, vendidas30: 3, diasDeVentas: 0 }))).toBe(1);
  });
  it("la ventana del ritmo: los días que estuvo colgada, de 7 a los de la tienda (Felipe 2026-10-12 y 2026-10-14)", () => {
    // Datos inventados: hoy 14 de octubre, la tienda vende en el ERP hace 15 días.
    expect(ventanaDeRitmo("2026-10-11", "2026-10-14", 15)).toBe(7); // colgada 4 días: el piso de una semana
    expect(ventanaDeRitmo("2026-10-04", "2026-10-14", 15)).toBe(11); // colgada 11 días
    expect(ventanaDeRitmo("2026-09-20", "2026-10-14", 15)).toBe(15); // antes de que la tienda vendiera: el techo
    expect(ventanaDeRitmo("2026-08-01", "2026-10-14", 30)).toBe(30);
    expect(ventanaDeRitmo("2026-10-12", "2026-10-14", 3)).toBe(3); // una tienda de 3 días no se mide en 7
    expect(ventanaDeRitmo(null, "2026-10-14", 15)).toBe(15); // sin saber cuándo salió, la de la tienda
    expect(DIAS_MINIMOS_RITMO).toBe(7);
  });
  it("con su ventana, lo colgado hace poco que vende se ve acabar; entre los días de la tienda, no", () => {
    // 4 en la tienda, 2 vendidas en los 4 días que lleva colgada (ventana 7): duran 14 días y se acaba. Entre 15, duraban 30.
    const [t] = conVentanaDeRitmo([prenda({ piso: 4, vendidas30: 2, salioAlPiso: "2026-10-11" })], "2026-10-14", 15);
    expect(t.diasDeVentas).toBe(7);
    expect(t.diasDeVentasTienda).toBe(15);
    expect(diasQueQuedan(t)).toBe(14);
    expect(seEstaAcabando(t)).toBe(true);
    expect(seEstaAcabando(prenda({ piso: 4, vendidas30: 2, diasDeVentas: 15 }))).toBe(false);
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
  // ADR-0357, act. 2026-10-14: una venta pendiente anotada en caja de su tipo, talla y color puede ser una de sus unidades colgadas.
  it("lo quieto con una unidad que puede ser una venta sin registrar no se manda ni se liquida: «duda»", () => {
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 64, otras: otras(3), enDuda: 1 }), 60)).toBe("duda");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 64, otras: otras(1), enDuda: 1 }), 60)).toBe("duda");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 44, enDuda: 2 }), 60)).toBe("duda");
  });
  it("la duda no cambia lo que no estaba quieto: lo nuevo, lo que se vende y lo que se acaba siguen igual", () => {
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 20, enDuda: 1 }), 60)).toBeNull();
    expect(grupoDe(prenda({ piso: 20, vendidas30: 5, diasSinVender: 2, enDuda: 1 }), 60)).toBeNull();
    expect(grupoDe(prenda({ piso: 1, vendidas30: 4, enDuda: 1 }), 60)).toBe("comprar");
  });
  it("sin duda (0) o sin saberla (sin la lectura de Frescura), se juzga como siempre", () => {
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 64, otras: otras(1), enDuda: 0 }), 60)).toBe("liquidar");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 64, otras: otras(1) }), 60)).toBe("liquidar");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 44, enDuda: 0 }), 60)).toBe("vigila");
  });
  it("prendasDe filtra por grupos y se ordena de lo más urgente a lo menos", () => {
    const a = prenda({ varianteId: "a", vendidas30: 6 });
    const b = prenda({ varianteId: "b", piso: 1, vendidas30: 4 });
    const c = prenda({ varianteId: "c", piso: 4, diasSinVender: 90 });
    expect(prendasDe([c, b, a], ["comprar"], 60).sort(ordenSeAcaba).map((p) => p.varianteId)).toEqual(["a", "b"]);
  });
});

describe("otras tiendas", () => {
  it("la que más tiene, aunque no venda; la que más vende, para mandar", () => {
    const o = [
      { sedeId: "aqp", stock: 3, vendidas30: 0 },
      { sedeId: "lim", stock: 1, vendidas30: 2 },
    ];
    expect(otraSedeQueLaTiene(o)?.sedeId).toBe("aqp");
    expect(sedeQueMasVende(o)?.sedeId).toBe("lim");
    expect(otraSedeQueLaTiene([{ sedeId: "aqp", stock: 0, vendidas30: 4 }])).toBeNull();
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
});

describe("Liquidar desde, la vista y el buscador", () => {
  it("se queda en sus topes (de 1 a 999 desde el 2026-10-07: 10 y 400 ya valen)", () => {
    expect(liquidarDesdeValido(10)).toBe(10);
    expect(liquidarDesdeValido(400)).toBe(400);
    expect(liquidarDesdeValido(0)).toBe(LIQUIDAR_MIN);
    expect(liquidarDesdeValido(5000)).toBe(LIQUIDAR_MAX);
    expect(liquidarDesdeValido("64")).toBe(64);
    expect(liquidarDesdeValido(null)).toBe(LIQUIDAR_DEFECTO);
  });
  it("la vista sale de la URL o es Hoy", () => {
    expect(leerVista("nose")).toBe("nose");
    expect(leerVista(["pedir"])).toBe("pedir");
    expect(leerVista("comparar")).toBe("hoy");
    expect(leerVista(undefined)).toBe("hoy");
  });
  it("lo buscado llega en la URL (otra pantalla trae Análisis ya filtrado); recortado, o vacío", () => {
    expect(leerBusqueda("  Aretes ")).toBe("Aretes");
    expect(leerBusqueda(["Collares", "otra"])).toBe("Collares");
    expect(leerBusqueda(undefined)).toBe("");
    expect(leerBusqueda("x".repeat(100))).toHaveLength(60);
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

describe("«Te pidieron y no había»: el día de Lima en que se anotó", () => {
  // Como lo manda `pedidos_no_atendidos`: `created_at` es un instante en UTC. Anotado el 13 de octubre a las 20:00 de Lima
  // (2026-10-14 01:00 UTC).
  const pedido = (p: Partial<Parameters<typeof noHabiaDe>[0][number]> = {}) => ({
    resuelto: false,
    motivo: "no_habia_talla" as const,
    productoReferencia: "Polo Lucky",
    descripcionLibre: null,
    talla: "M",
    creadoEn: "2026-10-14T01:00:00.123456+00:00",
    ...p,
  });

  it("lo anotado a las 20:00 del 13 en Lima es del 13, aunque en UTC ya sea el 14", () => {
    expect(noHabiaDe([pedido()])).toEqual([{ que: "Polo Lucky · M", dia: "2026-10-13" }]); // con el corte de UTC, «2026-10-14»
  });

  it("solo cuentan los pedidos de talla que siguen sin resolver", () => {
    expect(noHabiaDe([pedido({ resuelto: true }), pedido({ motivo: "se_probo_no_llevo" })])).toEqual([]);
  });

  it("sin un instante que se lea, el día queda vacío", () => {
    expect(noHabiaDe([pedido({ creadoEn: "" })])).toEqual([{ que: "Polo Lucky · M", dia: null }]);
  });
});
