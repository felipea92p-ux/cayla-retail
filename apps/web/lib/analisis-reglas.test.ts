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
  leerBusqueda,
  leerVista,
  llegadaAtrasada,
  llegadasDe,
  noHabiaDe,
  ordenSeAcaba,
  otraSedeQueLaTiene,
  porLlegar,
  prendasDe,
  rotuladaSinRitmo,
  sedeDeAnalisis,
  sedeQueMasVende,
  seEstaAcabando,
  ventanaDe,
} from "./analisis-reglas";

/** El día de las pruebas de lo que llega (16 de octubre de 2026). */
const HOY = "2026-10-16";

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
  /** La vara de un tipo que sí vende (inventada): se vigila desde 30 días y se liquida desde 60. */
  const VARA = { vigila: 30, liquidar: 60, vara: "hoy" as const, vendidas: 20 };
  const con = (p: Partial<PrendaAnalisis>) => prenda({ umbrales: VARA, ...p });
  it("lo que se acaba se compra, aunque otra tienda la tenga (decide la persona)", () => {
    expect(grupoDe(con({ vendidas30: 4, otras: otras(0, 5) }))).toBe("comprar");
  });
  it("lo quieto desde el P90 de su tipo se manda si otra tienda vendió 2 o más; si no, se liquida", () => {
    expect(grupoDe(con({ piso: 3, diasSinVender: 64, otras: otras(3) }))).toBe("enviar");
    expect(grupoDe(con({ piso: 3, diasSinVender: 64, otras: otras(1) }))).toBe("liquidar");
  });
  it("entre el P75 y el P90 se vigila; antes del P75, nada — justo en los límites (29/30, 59/60)", () => {
    expect(grupoDe(con({ piso: 3, diasSinVender: 44 }))).toBe("vigila");
    expect(grupoDe(con({ piso: 3, diasSinVender: 29 }))).toBeNull();
    expect(grupoDe(con({ piso: 3, diasSinVender: 30 }))).toBe("vigila");
    expect(grupoDe(con({ piso: 3, diasSinVender: 59 }))).toBe("vigila");
    expect(grupoDe(con({ piso: 3, diasSinVender: 60 }))).toBe("liquidar");
  });
  it("cada tipo con su vara: el mismo tiempo quieto es «nada» en uno y «liquidar» en otro (Polos contra Jeans)", () => {
    const polos = { vigila: 13, liquidar: 22, vara: "hoy" as const, vendidas: 40 };
    const jeans = { vigila: 40, liquidar: 70, vara: "hoy" as const, vendidas: 12 };
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 24, umbrales: polos }))).toBe("liquidar");
    expect(grupoDe(prenda({ piso: 3, diasSinVender: 24, umbrales: jeans }))).toBeNull();
  });
  it("sin stock o sin dato de días, no cae en las quietas", () => {
    expect(grupoDe(con({ diasSinVender: 120 }))).toBeNull();
    expect(grupoDe(con({ piso: 2 }))).toBeNull();
  });
  // Felipe, 2026-10-17: «Liquidar desde» se retira. Un tipo sin vara suficiente NO se mide con un número de días fijo.
  describe("un tipo sin vara suficiente: «Todavía sin ritmo» (B1)", () => {
    const poca = (desde: number | null) => ({ motivo: "poca_venta" as const, desde, vendidas: 7, unidades: 35 });
    it("nunca cae en «Liquidar», «Mándalas» ni «Vigílalas», por viejo que sea ni aunque otra tienda lo venda", () => {
      for (const dias of [8, 11, 30, 60, 120, 400]) {
        const g = grupoDe(prenda({ piso: 3, diasSinVender: dias, otras: otras(9), sinRitmo: poca(7) }));
        expect(g).toBe("sin_ritmo");
      }
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 120, otras: otras(9) }))).toBeNull();
    });
    it("se rotula solo cuando ya lleva lo que tardó la mitad de su tipo (o su última venta): justo en el límite", () => {
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 6, sinRitmo: poca(7) }))).toBeNull();
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 7, sinRitmo: poca(7) }))).toBe("sin_ritmo");
      expect(rotuladaSinRitmo({ diasSinVender: 7, sinRitmo: poca(7), umbrales: undefined })).toBe(true);
    });
    it("un tipo que no vendió nada no rotula (no hay con qué comparar): sin ritmo conocido y sin número inventado", () => {
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 200, sinRitmo: poca(null) }))).toBeNull();
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 200 }))).toBeNull();
    });
    it("sin leer Frescura (sin módulo, falló o la sede no separa piso) toda quieta queda a la vista con su razón, nunca en «Liquidar»", () => {
      for (const porque of ["sin_modulo", "fallo", "no_aplica"] as const) {
        const sinRitmo = { motivo: "sin_lectura" as const, porque };
        expect(grupoDe(prenda({ piso: 3, diasSinVender: 3, otras: otras(5), sinRitmo }))).toBe("sin_ritmo");
        expect(grupoDe(prenda({ piso: 3, diasSinVender: 300, sinRitmo }))).toBe("sin_ritmo");
      }
    });
    it("lo que ya tiene vara la usa y no se rotula aunque traiga un sinRitmo viejo", () => {
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 20, umbrales: VARA, sinRitmo: poca(7) }))).toBeNull();
    });
    it("una unidad que puede ser una venta sin registrar manda a «Aún no se sabe» antes que «Todavía sin ritmo»", () => {
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 20, enDuda: 1, sinRitmo: poca(7) }))).toBe("duda");
    });
    it("lo que vendió algo en los últimos 30 días nunca está quieto (se decide con 30 días de historia, ~30-oct)", () => {
      expect(grupoDe(prenda({ piso: 3, diasSinVender: 20, vendidas30: 1, sinRitmo: poca(7) }))).toBeNull();
      expect(grupoDe(con({ piso: 30, diasSinVender: 100, vendidas30: 1 }))).toBeNull();
    });
  });
  // ADR-0357, act. 2026-10-14: una venta pendiente anotada en caja de su tipo, talla y color puede ser una de sus unidades colgadas.
  it("lo quieto con una unidad que puede ser una venta sin registrar no se manda ni se liquida: «duda»", () => {
    expect(grupoDe(con({ piso: 3, diasSinVender: 64, otras: otras(3), enDuda: 1 }))).toBe("duda");
    expect(grupoDe(con({ piso: 3, diasSinVender: 64, otras: otras(1), enDuda: 1 }))).toBe("duda");
    expect(grupoDe(con({ piso: 3, diasSinVender: 44, enDuda: 2 }))).toBe("duda");
  });
  it("la duda no cambia lo que no estaba quieto: lo nuevo, lo que se vende y lo que se acaba siguen igual", () => {
    expect(grupoDe(con({ piso: 3, diasSinVender: 20, enDuda: 1 }))).toBeNull();
    expect(grupoDe(con({ piso: 20, vendidas30: 5, diasSinVender: 2, enDuda: 1 }))).toBeNull();
    expect(grupoDe(con({ piso: 1, vendidas30: 4, enDuda: 1 }))).toBe("comprar");
  });
  it("sin duda (0) o sin saberla (sin la lectura de Frescura), se juzga como siempre", () => {
    expect(grupoDe(con({ piso: 3, diasSinVender: 64, otras: otras(1), enDuda: 0 }))).toBe("liquidar");
    expect(grupoDe(con({ piso: 3, diasSinVender: 64, otras: otras(1) }))).toBe("liquidar");
    expect(grupoDe(con({ piso: 3, diasSinVender: 44, enDuda: 0 }))).toBe("vigila");
  });
  it("prendasDe filtra por grupos y se ordena de lo más urgente a lo menos", () => {
    const a = prenda({ varianteId: "a", vendidas30: 6 });
    const b = prenda({ varianteId: "b", piso: 1, vendidas30: 4 });
    const c = prenda({ varianteId: "c", piso: 4, diasSinVender: 90 });
    expect(prendasDe([c, b, a], ["comprar"]).sort(ordenSeAcaba).map((p) => p.varianteId)).toEqual(["a", "b"]);
  });
});

describe("el orden de lo que se acaba: el margen por día solo desempata (A15, 2026-10-16)", () => {
  const orden = (...ps: PrendaAnalisis[]) => [...ps].sort(ordenSeAcaba).map((p) => p.varianteId);
  // El precio de venta trae el IGV y el costo no: el precio que deja `ganancia` sin IGV sobre ese costo.
  const conIgv = (ganancia: number, costo: number) => (ganancia + costo) * 1.18;

  it("a igual plazo (los agotados empatan en 0 días), primero el que más deja de ganar por día", () => {
    // Las dos vendieron 6 en 30 días y están agotadas; «mucha» deja S/ 23,8 por prenda (60 / 1,18 − 27) y «poca», S/ 3,9 (40 / 1,18 − 30).
    const poca = prenda({ varianteId: "poca", nombre: "Aaa", vendidas30: 6, precio: 40, costo: 30 });
    const mucha = prenda({ varianteId: "mucha", nombre: "Zzz", vendidas30: 6, precio: 60, costo: 27 });
    expect(orden(poca, mucha)).toEqual(["mucha", "poca"]);
    expect(orden(mucha, poca)).toEqual(["mucha", "poca"]);
  });

  it("vender más no siempre gana: 3 ventas a S/ 100 de margen pasan a 5 ventas a S/ 10 (antes ganaba la que más vendía)", () => {
    const cara = prenda({ varianteId: "cara", vendidas30: 3, precio: conIgv(100, 60), costo: 60 });
    const barata = prenda({ varianteId: "barata", vendidas30: 5, precio: conIgv(10, 30), costo: 30 });
    expect(orden(barata, cara)).toEqual(["cara", "barata"]);
  });

  it("una sola venta de mucha ganancia no pasa delante de varias de menos: con poca muestra la cifra más alta premia al azar", () => {
    // Las dos agotadas, 30 días. Una vendió 1 a S/ 150 de ganancia (5 por día si fuera cierto); la otra, 4 a S/ 30 (4 por día).
    const una = prenda({ varianteId: "una", vendidas30: 1, precio: conIgv(150, 30), costo: 30 });
    const cuatro = prenda({ varianteId: "cuatro", vendidas30: 4, precio: conIgv(30, 30), costo: 30 });
    expect(orden(una, cuatro)).toEqual(["cuatro", "una"]);
    expect(orden(cuatro, una)).toEqual(["cuatro", "una"]);
  });

  it("los días mandan: el margen NO mueve a una prenda de su lugar por plazo", () => {
    // Agotada barata, con 2 días, y con stock carísima: la agotada va primero aunque deje de ganar menos.
    const agotada = prenda({ varianteId: "agotada", vendidas30: 2, precio: 40, costo: 30 });
    const con2 = prenda({ varianteId: "con2", piso: 1, vendidas30: 15, precio: 500, costo: 100 });
    const con9 = prenda({ varianteId: "con9", piso: 3, vendidas30: 10, precio: 500, costo: 100 });
    expect(orden(con9, con2, agotada)).toEqual(["agotada", "con2", "con9"]);
  });

  it("sin costo no hay margen: va después de quien sí lo tiene; entre dos sin costo, decide quien vende más y luego el nombre", () => {
    const con = prenda({ varianteId: "con", nombre: "Zzz", vendidas30: 1, precio: 50, costo: 40 });
    const sinA = prenda({ varianteId: "sinA", nombre: "Bbb", vendidas30: 9, costo: null });
    const sinB = prenda({ varianteId: "sinB", nombre: "Aaa", vendidas30: 9, costo: null });
    const sinC = prenda({ varianteId: "sinC", nombre: "Ccc", vendidas30: 20, precio: null });
    expect(orden(sinA, sinB, sinC, con)).toEqual(["con", "sinC", "sinB", "sinA"]);
  });

  it("la ventana de cada prenda cuenta: la misma venta en una ventana corta deja más por día", () => {
    const corta = prenda({ varianteId: "corta", vendidas30: 4, diasDeVentas: 8 });
    const larga = prenda({ varianteId: "larga", vendidas30: 4, diasDeVentas: 30 });
    expect(orden(larga, corta)).toEqual(["corta", "larga"]);
  });

  it("no cambia qué cae en «Cómpralas»: el grupo sale de los días, no del margen", () => {
    for (const costo of [null, 0, 27, 59]) expect(grupoDe(prenda({ piso: 1, vendidas30: 4, costo }))).toBe("comprar");
  });

  it("es un orden coherente (se puede usar en sort): el resultado no depende del orden de entrada", () => {
    const ps = Array.from({ length: 12 }, (_, i) =>
      prenda({ varianteId: `p${i}`, nombre: `Modelo ${i % 4}`, vendidas30: 1 + (i % 5), diasDeVentas: 7 + (i % 3) * 8, precio: 50 + (i % 3) * 20, costo: i % 4 === 0 ? null : 20 + (i % 2) * 15 }),
    );
    const base = orden(...ps);
    expect(orden(...[...ps].reverse())).toEqual(base);
    expect(orden(...ps.slice(6), ...ps.slice(0, 6))).toEqual(base);
  });
});

describe("ventanaDe: una sola cuenta para los días, el rango y el margen", () => {
  it("la de la prenda dentro de 1 y 30; sin ella, 30", () => {
    expect(ventanaDe({})).toBe(30);
    expect(ventanaDe({ diasDeVentas: 7 })).toBe(7);
    expect(ventanaDe({ diasDeVentas: 7.6 })).toBe(8);
    expect(ventanaDe({ diasDeVentas: 99 })).toBe(30);
    expect(ventanaDe({ diasDeVentas: 0 })).toBe(1);
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
    expect(porLlegar(prenda({ llega: [{ de: "compra", cantidad: 10, fecha: null }, { de: "almacen", cantidad: 2, fecha: null }, { de: "taller", cantidad: 1, fecha: null }] }), HOY)).toBe(13);
  });
  // A3 (plan verificado 2026-10-16): lo que viene se parte en lo que se espera y lo que ya se atrasó; solo lo primero es «viene».
  it("una llegada está atrasada cuando su fecha ya pasó: hoy todavía se espera y sin fecha no se sabe", () => {
    expect(llegadaAtrasada({ fecha: "2026-10-15" }, HOY)).toBe(true);
    expect(llegadaAtrasada({ fecha: HOY }, HOY)).toBe(false);
    expect(llegadaAtrasada({ fecha: "2026-10-17" }, HOY)).toBe(false);
    expect(llegadaAtrasada({ fecha: null }, HOY)).toBe(false);
  });
  it("parte lo que viene: lo que se espera (con lo que no tiene fecha) y lo atrasado, con los días de la que más se atrasó", () => {
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-10-20" },
      { de: "almacen" as const, cantidad: 2, fecha: null },
      { de: "taller" as const, cantidad: 8, fecha: "2026-09-20" },
      { de: "tienda" as const, cantidad: 3, fecha: "2026-10-10" },
    ];
    expect(llegadasDe(llega, HOY)).toEqual({ vienen: 12, sinFecha: 2, atrasadas: 11, diasAtraso: 26, despues: 0 });
    expect(porLlegar(prenda({ llega }), HOY)).toBe(12);
    expect(llegadasDe([], HOY)).toEqual({ vienen: 0, sinFecha: 0, atrasadas: 0, diasAtraso: 0, despues: 0 });
  });
  it("con una meta («hasta»), lo que llega después se aparta: no es «viene» para esa meta, pero tampoco desaparece", () => {
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-12-25" }, // el día de la meta todavía cuenta
      { de: "compra" as const, cantidad: 20, fecha: "2027-01-05" }, // llega después de la meta
      { de: "almacen" as const, cantidad: 2, fecha: null }, // sin fecha: no se sabe, cuenta y se dice
      { de: "taller" as const, cantidad: 8, fecha: "2026-09-20" }, // atrasada: su propia cuenta, nunca «después»
    ];
    expect(llegadasDe(llega, HOY, "2026-12-25")).toEqual({ vienen: 12, sinFecha: 2, atrasadas: 8, diasAtraso: 26, despues: 20 });
    // Sin meta no se corta por arriba (Se está acabando no mide contra una campaña).
    expect(llegadasDe(llega, HOY)).toEqual({ vienen: 32, sinFecha: 2, atrasadas: 8, diasAtraso: 26, despues: 0 });
    expect(porLlegar(prenda({ llega }), HOY)).toBe(32);
  });
  it("una parte sin unidades no cuenta en ninguna (un traslado en tránsito sin líneas no infla ni esconde nada)", () => {
    const vacio = [{ de: "taller" as const, cantidad: 0, fecha: "2026-09-20" }, { de: "compra" as const, cantidad: -3, fecha: null }, { de: "tienda" as const, cantidad: Number.NaN, fecha: null }];
    expect(llegadasDe(vacio, HOY, "2026-12-25")).toEqual({ vienen: 0, sinFecha: 0, atrasadas: 0, diasAtraso: 0, despues: 0 });
  });
  it("lo atrasado no es «por llegar»", () => {
    expect(porLlegar(prenda({ llega: [{ de: "taller", cantidad: 8, fecha: "2026-09-20" }] }), HOY)).toBe(0);
  });
  it("las unidades por tramo de días sin venderse", () => {
    const e = edadDelInventario([prenda({ piso: 2, diasSinVender: 10 }), prenda({ almacen: 3, diasSinVender: 61 }), prenda({ piso: 1, diasSinVender: 120 }), prenda({ piso: 5 })]);
    expect(e).toEqual({ hasta30: 2, de31a60: 0, de61a90: 3, masDe90: 1 });
  });
});

describe("la vista y el buscador", () => {
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
