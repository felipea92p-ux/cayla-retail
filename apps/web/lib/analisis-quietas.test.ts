import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { GRUPOS_QUIETAS, prendasDe } from "./analisis-reglas";
import {
  barraDeEdad,
  cifrasQuietas,
  destinoDeTodas,
  escalonMayor,
  etiquetasEje,
  finDelEje,
  gruposQuietas,
  lineaTodaviaNoQuietas,
  marcaLiquidarComun,
  modelosSinConQueComparar,
  marcaTresMeses,
  notaDeUmbrales,
  notaSinCosto,
  pistaQuieta,
  puedeJuzgarQuietas,
  razonSinRitmo,
  TEXTO_VACIO_QUIETAS,
  TRAMOS_EDAD,
  vacioQuietas,
} from "./analisis-quietas";
import { modeloDe } from "./analisis-modelo";

// Datos inventados para la prueba: ni nombres del catálogo ni cifras de producción.
function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Polo Ensayo",
    color: "Gris",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
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

/** La vara de un tipo que sí vende (inventada): se vigila desde 30 días y se liquida desde 60. */
const VARA = { vigila: 30, liquidar: 60, vara: "hoy" as const, vendidas: 20 };
/** Una prenda quieta en mi tienda: 3 libres y `dias` sin venderse, de un tipo con vara. */
const quieta = (varianteId: string, dias: number, extra: Partial<PrendaAnalisis> = {}) => prenda({ varianteId, piso: 2, almacen: 1, diasSinVender: dias, umbrales: VARA, ...extra });
/** Lo que vendió otra tienda (inventada) en 30 días. */
const vendioAlla = (sedeId: string, vendidas30: number, stock = 1) => ({ sedeId, stock, vendidas30 });

describe("las cifras de arriba", () => {
  it("cuenta prendas, unidades, lo que costaron y lo que valen a precio de venta", () => {
    const c = cifrasQuietas([
      quieta("a", 70, { costo: 20, precio: 50 }), // 3 unidades: 60 de costo, 150 a la venta
      quieta("b", 80, { piso: 4, almacen: 0, costo: 10, precio: 30 }), // 4 unidades: 40 y 120
    ]);
    expect(c).toEqual({ prendas: 2, unidades: 7, costo: 100, precioVenta: 270, sinCosto: 0, sinPrecio: 0 });
  });

  it("si a una le falta el costo o el precio, cuenta solo las que lo tienen y dice cuántas faltan", () => {
    const c = cifrasQuietas([quieta("a", 70, { costo: null, precio: 50 }), quieta("b", 80, { costo: 10, precio: null })]);
    expect(c.costo).toBe(30);
    expect(c.precioVenta).toBe(150);
    expect(c.sinCosto).toBe(1);
    expect(c.sinPrecio).toBe(1);
    expect(c.unidades).toBe(6);
  });

  it("si ninguna tiene costo, no inventa un S/ 0: null (se dice «—»)", () => {
    const c = cifrasQuietas([quieta("a", 70, { costo: null }), quieta("b", 80, { costo: null })]);
    expect(c.costo).toBeNull();
    expect(c.precioVenta).toBe(300);
  });

  it("sin quietas, todo en cero: no hay nada que costar", () => {
    expect(cifrasQuietas([])).toEqual({ prendas: 0, unidades: 0, costo: 0, precioVenta: 0, sinCosto: 0, sinPrecio: 0 });
  });

  it("cuentan solo lo que se manda o se liquida: lo que se vigila y lo de un tipo sin ritmo no entra", () => {
    const sinRitmo = { motivo: "poca_venta" as const, desde: 5, vendidas: 7, unidades: 35 };
    const prendas = [quieta("a", 45), quieta("b", 70), quieta("c", 300, { umbrales: undefined, sinRitmo })];
    expect(cifrasQuietas(prendasDe(prendas, GRUPOS_QUIETAS)).prendas).toBe(1);
  });
});

describe("el «?» de «costaron»", () => {
  it("callado si todas entran en la cuenta", () => {
    expect(notaSinCosto({ sinCosto: 0, sinPrecio: 0 })).toBeNull();
  });
  it("dice cuántas no entran, en singular y en plural", () => {
    expect(notaSinCosto({ sinCosto: 1, sinPrecio: 0 })).toBe("No cuenta 1 prenda sin costo.");
    expect(notaSinCosto({ sinCosto: 2, sinPrecio: 0 })).toBe("No cuenta 2 prendas sin costo.");
    expect(notaSinCosto({ sinCosto: 0, sinPrecio: 3 })).toBe("No cuenta 3 prendas sin precio.");
    expect(notaSinCosto({ sinCosto: 2, sinPrecio: 1 })).toBe("No cuenta 2 prendas sin costo ni 1 sin precio.");
  });
});

describe("cada prenda en el carril «Días sin venderse»", () => {
  it("cae en el eje de 4 meses; lo de más de 4 meses se queda al final", () => {
    const fin = finDelEje(60);
    expect(fin).toBe(120);
    expect(pistaQuieta(0, fin, 60).n).toBe(0);
    expect(pistaQuieta(60, fin, 60).n).toBe(0.5);
    expect(pistaQuieta(120, fin, 60).n).toBe(1);
    expect(pistaQuieta(300, fin, 60).n).toBe(1);
  });

  it("su aro: neutro antes del escalón de su tipo, ámbar desde ahí, rojo desde 3 meses", () => {
    expect(pistaQuieta(59, 120, 60).zona).toBe("nd");
    expect(pistaQuieta(60, 120, 60).zona).toBe("ate");
    expect(pistaQuieta(89, 120, 60).zona).toBe("ate");
    expect(pistaQuieta(90, 120, 60).zona).toBe("urg");
    expect(pistaQuieta(86, 120, 85).zona).toBe("ate");
    expect(pistaQuieta(90, 120, 85).zona).toBe("urg");
    // Con el escalón pasado de 3 meses, lo de más de 3 meses sigue en rojo.
    expect(pistaQuieta(104, 240, 180).zona).toBe("urg");
  });

  it("un tipo sin ritmo no tiene zona ni número inventado: ni ámbar ni rojo, por viejo que sea («ni se rebaja ni se manda por ahora»)", () => {
    expect(pistaQuieta(40, 120, null)).toMatchObject({ zona: "nd", liquidar: null });
    expect(pistaQuieta(95, 120, null).zona).toBe("nd");
    expect(pistaQuieta(400, 120, null).zona).toBe("nd");
  });

  it("su zona de liquidar se dibuja en la posición de SU escalón", () => {
    expect(pistaQuieta(8, 120, 5).liquidar).toBeCloseTo((5 / 120) * 100);
    expect(pistaQuieta(8, 120, 5).zona).toBe("ate");
  });

  it("su cifra va a la izquierda del punto solo pasado el 80 % del eje (a la derecha se saldría)", () => {
    expect(pistaQuieta(60, 120, 60).cifraALaIzquierda).toBe(false);
    expect(pistaQuieta(96, 120, 60).cifraALaIzquierda).toBe(false);
    expect(pistaQuieta(97, 120, 60).cifraALaIzquierda).toBe(true);
    expect(pistaQuieta(400, 120, 60).cifraALaIzquierda).toBe(true);
  });

  it("el eje: 4 meses o más si algún tipo se liquida más tarde; sin escalones, los 4 meses", () => {
    expect(escalonMayor([{ umbrales: VARA }, { umbrales: { ...VARA, liquidar: 150 } }, {}])).toBe(150);
    expect(escalonMayor([{}, {}])).toBe(0);
    expect(finDelEje(0)).toBe(120);
    expect(finDelEje(100)).toBe(120);
    expect(finDelEje(101)).toBe(150);
    expect(finDelEje(999)).toBe(1020);
    expect(marcaTresMeses(120)).toBe(75);
    expect(marcaTresMeses(240)).toBe(37.5);
  });

  it("«3 meses» solo se rotula si cabe sin pisar la marca común de «Liquidar»", () => {
    expect(etiquetasEje(120, 60)).toEqual({ fin: "4 meses", tresMeses: true });
    expect(etiquetasEje(120, 85).tresMeses).toBe(false);
    expect(etiquetasEje(120, null).tresMeses).toBe(true);
    expect(etiquetasEje(240, null).fin).toBe("8 meses");
  });
});

describe("los grupos del carril", () => {
  const prendas = [
    quieta("enviar", 70, { otras: [vendioAlla("tienda-b", 3)] }),
    quieta("liquidar-vieja", 100, { otras: [vendioAlla("tienda-b", 1)] }),
    quieta("liquidar", 65, { piso: 5 }),
    quieta("vigila", 45),
    quieta("nueva", 10),
    prenda({ varianteId: "se-vende", piso: 20, vendidas30: 5, diasSinVender: 2 }),
    prenda({ varianteId: "se-acaba", piso: 1, vendidas30: 6, diasSinVender: 1 }),
  ];
  const ids = (lista: readonly PrendaAnalisis[]) => lista.map((p) => p.varianteId);

  it("cada uno con lo suyo, de lo que más espera a lo que menos", () => {
    const g = gruposQuietas(prendas);
    expect(ids(g.enviar)).toEqual(["enviar"]);
    expect(ids(g.liquidar)).toEqual(["liquidar-vieja", "liquidar"]);
    expect(ids(g.vigila)).toEqual(["vigila"]);
    expect(g.sinRitmo).toEqual([]);
  });

  it("lo que se vende, lo nuevo y lo que se acaba no entran", () => {
    const g = gruposQuietas(prendas);
    const todas = [...g.enviar, ...g.liquidar, ...g.vigila].map((p) => p.varianteId);
    expect(todas).not.toContain("se-vende");
    expect(todas).not.toContain("nueva");
    expect(todas).not.toContain("se-acaba");
    expect(new Set(todas).size).toBe(todas.length); // ninguna en dos grupos
  });

  it("cada tipo con su vara: con otra, las mismas prendas cambian de grupo", () => {
    const lento = (id: string, dias: number) => quieta(id, dias, { umbrales: { vigila: 80, liquidar: 120, vara: "hoy", vendidas: 15 } });
    const g = gruposQuietas([lento("a", 70), lento("b", 90), lento("c", 130)]);
    expect(ids(g.liquidar)).toEqual(["c"]);
    expect(ids(g.vigila)).toEqual(["b"]);
  });

  it("un tipo sin ritmo: sus quietas van a «Todavía sin ritmo», nunca a «Liquidar» ni «Mándalas», por viejas que sean", () => {
    const sin = { motivo: "poca_venta" as const, desde: 7, vendidas: 7, unidades: 35 };
    const g = gruposQuietas([
      quieta("jean-vieja", 300, { umbrales: undefined, sinRitmo: sin, otras: [vendioAlla("tienda-b", 9)] }),
      quieta("jean-nueva", 8, { umbrales: undefined, sinRitmo: sin }),
      quieta("jean-recien-colgada", 3, { umbrales: undefined, sinRitmo: sin }),
      quieta("pole", 70),
    ]);
    expect(ids(g.sinRitmo)).toEqual(["jean-vieja", "jean-nueva"]);
    expect(ids(g.liquidar)).toEqual(["pole"]);
    expect(g.enviar).toEqual([]);
  });
});

describe("«Aún no se sabe» (ADR-0357, act. 2026-10-14)", () => {
  it("lo quieto con una unidad en duda va a su grupo, de lo que más espera a lo que menos, y sale de los demás", () => {
    const prendas = [
      quieta("liquidar", 65, { piso: 5 }),
      quieta("duda-vieja", 80, { enDuda: 1 }),
      quieta("duda-vigila", 40, { enDuda: 2 }),
      quieta("enviar-en-duda", 70, { otras: [vendioAlla("tienda-b", 3)], enDuda: 1 }),
    ];
    const g = gruposQuietas(prendas);
    expect(g.duda.map((p) => p.varianteId)).toEqual(["duda-vieja", "enviar-en-duda", "duda-vigila"]);
    expect(g.liquidar.map((p) => p.varianteId)).toEqual(["liquidar"]);
    expect(g.enviar).toEqual([]);
    expect(g.vigila).toEqual([]);
  });
  it("con solo prendas en duda hay carril: no es «Todo se mueve»", () => {
    expect(vacioQuietas([quieta("duda", 80, { enDuda: 1 })], 0)).toBeNull();
  });
});

describe("los escalones de cada tipo en el carril (ADR-0357, act. 2026-10-14; B1)", () => {
  const polos = { vigila: 3, liquidar: 5, vara: "hoy" as const, vendidas: 30 };
  it("la marca «Liquidar» del eje solo si todas las filas con escalón se liquidan desde el mismo día", () => {
    expect(marcaLiquidarComun([])).toBeNull();
    expect(marcaLiquidarComun([{}, {}])).toBeNull();
    expect(marcaLiquidarComun([{ umbrales: polos }, { umbrales: polos }])).toBe(5);
    // Las filas de un tipo sin ritmo no tienen escalón: no desmienten la marca de las que sí.
    expect(marcaLiquidarComun([{ umbrales: polos }, {}])).toBe(5);
    expect(marcaLiquidarComun([{ umbrales: polos }, { umbrales: { ...polos, liquidar: 7 } }])).toBeNull();
  });
  it("la nota dice con qué se mide cada tipo, sin un número de días fijo", () => {
    expect(notaDeUmbrales([{ umbrales: polos }], "sin_modulo")).toBe("Sin saber cuánto tarda en venderse cada tipo, lo quieto no se rebaja ni se manda: queda en «Todavía sin ritmo».");
    expect(notaDeUmbrales([{ umbrales: polos }], "ok")).toBe("Cada tipo se mide con lo que tardan en venderse los suyos en tu piso.");
    const sin = { motivo: "poca_venta" as const, desde: 7, vendidas: 7, unidades: 35 };
    expect(notaDeUmbrales([{ umbrales: polos }, { sinRitmo: sin }], "ok")).toContain("«Todavía sin ritmo»");
    for (const n of [notaDeUmbrales([], "ok"), notaDeUmbrales([{ sinRitmo: sin }], "fallo")]) expect(n).not.toMatch(/\d+ días|Liquidar desde/);
  });
  it("por qué un modelo está sin ritmo: el sujeto es su TIPO, en palabras de tienda, según el motivo, sin un número de días; corta para la fila, larga para la ficha", () => {
    expect(razonSinRitmo({})).toBeNull();
    const poca = { sinRitmo: { motivo: "poca_venta" as const, desde: 7, vendidas: 7, unidades: 35 } };
    expect(razonSinRitmo(poca, "fila")).toBe("Su tipo vendió 7 de 35 de los que colgaste: aún no se sabe cuánto tarda en venderse.");
    expect(razonSinRitmo(poca)).toBe(
      "Su tipo todavía no tiene ventas suficientes para saber cuánto tarda en venderse: ni se rebaja ni se manda por ahora. De su tipo se vendieron 7 de 35 de los que colgaste.",
    );
    expect(razonSinRitmo({ sinRitmo: { motivo: "sin_lectura", porque: "fallo" } }, "fila")).toBe("No se pudo leer cuánto tarda en venderse su tipo.");
    expect(razonSinRitmo({ sinRitmo: { motivo: "sin_lectura", porque: "fallo" } })).toContain("No se pudo leer cuánto tarda en venderse su tipo");
    expect(razonSinRitmo({ sinRitmo: { motivo: "sin_lectura", porque: "sin_modulo" } })).toContain("Tu rol no ve Frescura del piso");
    expect(razonSinRitmo({ sinRitmo: { motivo: "sin_lectura", porque: "no_aplica" } }, "fila")).toContain("no separa piso y almacén");
    for (const p of [poca, { sinRitmo: { motivo: "sin_lectura" as const, porque: "fallo" as const } }]) for (const f of ["fila", "ficha"] as const) expect(razonSinRitmo(p, f)).not.toMatch(/\d+ días/);
  });
});

describe("«Todavía no se puede saber» en vez de «Todo se mueve» (tarea #2, 2026-10-14; B1)", () => {
  const polos = { vigila: 10, liquidar: 15, vara: "hoy" as const, vendidas: 30 };
  it("sin carril y sin ningún modelo que lleve en el piso lo que tarda su tipo, la pestaña no dice «Todo se mueve»", () => {
    const nuevas = [prenda({ varianteId: "a", piso: 2, salioAlPiso: "2026-10-10", diasSinVender: 4, umbrales: polos })];
    expect(vacioQuietas(nuevas, 0, "2026-10-14")).toBe("todavia-no");
    expect(TEXTO_VACIO_QUIETAS["todavia-no"].titulo).toBe("Todavía no se puede saber");
    expect(vacioQuietas(nuevas, 0, "2026-10-30")).toBe("todo-se-mueve");
    // Sin la fecha (quien no la pasa), como antes.
    expect(vacioQuietas(nuevas, 0)).toBe("todo-se-mueve");
  });
  it("si ningún tipo tiene vara, tampoco se puede saber (no hay un número de días con que decir «todo se mueve»)", () => {
    const sinVara = [prenda({ varianteId: "a", piso: 2, salioAlPiso: "2026-08-01", diasSinVender: null })];
    expect(vacioQuietas(sinVara, 0, "2026-10-30")).toBe("todavia-no");
    expect(lineaTodaviaNoQuietas(sinVara)).toBe("Ningún tipo vendió todavía lo suficiente para saber cuánto tarda en venderse.");
  });
  it("con Frescura sin leer, la línea dice que no se pudo ver — no acusa a las ventas del tipo", () => {
    const colgada = [prenda({ piso: 1, salioAlPiso: "2026-10-01" })];
    for (const f of ["sin_modulo", "fallo", "no_aplica"] as const) expect(lineaTodaviaNoQuietas(colgada, f)).toBe("No se pudo ver cuánto tarda en venderse cada tipo.");
    expect(lineaTodaviaNoQuietas(colgada, "ok")).toBe("Ningún tipo vendió todavía lo suficiente para saber cuánto tarda en venderse.");
    // Con la vara del tipo, dice a qué escalón se refiere (el mismo que «Liquidar»), no uno vago.
    expect(lineaTodaviaNoQuietas([{ ...colgada[0]!, umbrales: { vigila: 3, liquidar: 5, vara: "hoy", vendidas: 30 } }])).toBe("Ningún modelo lleva aún lo que tardan 9 de cada 10 de su tipo.");
  });
  it("puedeJuzgarQuietas mira solo lo que hay en la tienda, ya salió al piso y es de un tipo con vara", () => {
    expect(puedeJuzgarQuietas([prenda({ piso: 0, almacen: 0, salioAlPiso: "2026-08-01", umbrales: polos })], "2026-10-14")).toBe(false);
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: null, umbrales: polos })], "2026-10-14")).toBe(false);
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: "2026-09-29", umbrales: polos })], "2026-10-14")).toBe(true);
    // Justo el escalón (15 días): 14 no, 15 sí.
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: "2026-09-30", umbrales: polos })], "2026-10-14")).toBe(false);
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: "2026-09-29", umbrales: polos })], "2026-10-14")).toBe(true);
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: "2026-08-01" })], "2026-10-14")).toBe(false);
    expect(lineaTodaviaNoQuietas([prenda({ almacen: 2, salioAlPiso: null })])).toBe("No hay nada colgado que juzgar todavía.");
  });
});

describe("«Enviar todas»", () => {
  /** Una fila con algo en el almacén y lo que vendieron las otras tiendas (stock 0: les queda poco). */
  const fila = (id: string, ...otras: ReturnType<typeof vendioAlla>[]) => ({ varianteId: id, piso: 0, almacen: 2, otras });
  it("si todas van a la misma tienda, esa", () => {
    expect(destinoDeTodas([fila("a", vendioAlla("tienda-b", 3, 0), vendioAlla("tienda-c", 0, 0)), fila("b", vendioAlla("tienda-b", 2, 0))])).toBe("tienda-b");
  });
  it("si van a tiendas distintas, ninguna (cada fila tiene la suya)", () => {
    expect(destinoDeTodas([fila("a", vendioAlla("tienda-b", 3, 0)), fila("b", vendioAlla("tienda-c", 4, 0), vendioAlla("tienda-b", 1, 0))])).toBeNull();
  });
  it("sin prendas, o con una que ninguna tienda vende, ninguna", () => {
    expect(destinoDeTodas([])).toBeNull();
    expect(destinoDeTodas([fila("a", vendioAlla("tienda-b", 3, 0)), fila("b")])).toBeNull();
  });
});

describe("la edad por tienda", () => {
  it("cuatro tramos, de lo nuevo a lo viejo, con la leyenda de la maqueta", () => {
    expect(TRAMOS_EDAD.map((t) => t.clase)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(TRAMOS_EDAD.map((t) => t.etiqueta)).toEqual(["Hasta 1 mes", "1 a 2 meses", "2 a 3 meses", "Más de 3 meses"]);
  });

  it("cada tramo ocupa su parte, con un mínimo para que se vea; la cifra va adentro solo si pasa del 10 %", () => {
    const { total, tramos } = barraDeEdad({ hasta30: 600, de31a60: 300, de61a90: 70, masDe90: 30 });
    expect(total).toBe(1000);
    expect(tramos.map((t) => t.unidades)).toEqual([600, 300, 70, 30]);
    expect(tramos.map((t) => t.flex)).toEqual([0.6, 0.3, 0.07, 0.03]);
    expect(tramos.map((t) => t.cifraAdentro)).toEqual([true, true, false, false]);
    expect(barraDeEdad({ hasta30: 990, de31a60: 0, de61a90: 0, masDe90: 10 }).tramos.map((t) => t.flex)).toEqual([0.99, 0.03, 0.03, 0.03]);
  });

  it("justo el 10 % no lleva la cifra adentro", () => {
    expect(barraDeEdad({ hasta30: 90, de31a60: 10, de61a90: 0, masDe90: 0 }).tramos[1]!.cifraAdentro).toBe(false);
  });

  it("una tienda sin unidades: total 0 y ningún tramo", () => {
    const { total, tramos } = barraDeEdad({ hasta30: 0, de31a60: 0, de61a90: 0, masDe90: 0 });
    expect(total).toBe(0);
    expect(tramos.every((t) => t.flex === 0 && !t.cifraAdentro)).toBe(true);
  });
});

describe("cuando no hay carril", () => {
  it("si todo se vende o es nuevo, todo se mueve", () => {
    expect(vacioQuietas([quieta("nueva", 10), prenda({ varianteId: "se-vende", piso: 3, vendidas30: 4, diasSinVender: 1 })], 0)).toBe("todo-se-mueve");
  });
  it("si no llegó ni una prenda porque algo falló al leer, no dice «todo se mueve»: dice que no pudo ver", () => {
    expect(vacioQuietas([], 1)).toBe("sin-datos");
    expect(vacioQuietas([], 0)).toBe("todo-se-mueve");
    // Con prendas a la vista, una falla de otra parte no cambia la respuesta.
    expect(vacioQuietas([quieta("nueva", 10)], 2)).toBe("todo-se-mueve");
  });
  it("con una sola que se vigila, hay carril (aunque algo más haya fallado)", () => {
    expect(vacioQuietas([quieta("nueva", 10), quieta("vigila", 40)], 0)).toBeNull();
    expect(vacioQuietas([quieta("vigila", 40)], 1)).toBeNull();
  });
  it("con solo prendas sin ritmo hay carril: se ven en «Todavía sin ritmo», no es «Todo se mueve»", () => {
    const sin = { motivo: "poca_venta" as const, desde: 7, vendidas: 7, unidades: 35 };
    expect(vacioQuietas([quieta("jean", 20, { umbrales: undefined, sinRitmo: sin })], 0)).toBeNull();
    // Antes de lo que tarda la mitad de su tipo no se rotula: nada que mostrar, y todavía no se puede saber (ningún tipo tiene vara).
    expect(vacioQuietas([quieta("jean", 3, { umbrales: undefined, sinRitmo: sin, salioAlPiso: "2026-10-11" })], 0, "2026-10-14")).toBe("todavia-no");
  });
  it("cada vacío dice algo corto, con su título y una línea", () => {
    expect(TEXTO_VACIO_QUIETAS["todo-se-mueve"].titulo).toBe("Todo se mueve");
    for (const t of Object.values(TEXTO_VACIO_QUIETAS)) expect(t.linea.length).toBeLessThanOrEqual(60);
    const colgada = [prenda({ piso: 1, salioAlPiso: "2026-10-01" })];
    expect(lineaTodaviaNoQuietas(colgada).length).toBeLessThanOrEqual(90);
    expect(lineaTodaviaNoQuietas([{ ...colgada[0]!, umbrales: { vigila: 3, liquidar: 5, vara: "hoy", vendidas: 30 } }]).length).toBeLessThanOrEqual(70);
  });
});

describe("lo quieto por modelo (ADR-0357, decisión 12)", () => {
  const HOY = "2026-10-10";
  it("el dinero se suma talla por talla, con el costo y el precio de cada una; se cuenta un modelo", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "a", piso: 2, salioAlPiso: "2026-08-01", diasSinVender: 70, costo: 20, precio: 50 }),
        prenda({ varianteId: "b", talla: "L", almacen: 1, salioAlPiso: "2026-08-01", diasSinVender: 70, costo: 30, precio: null }),
      ],
      HOY,
    );
    expect(cifrasQuietas([m])).toEqual({ prendas: 1, unidades: 3, costo: 70, precioVenta: 100, sinCosto: 0, sinPrecio: 1 });
  });

  it("un modelo con una talla que se vende no está quieto, aunque otra lleve 70 días colgada", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "a", piso: 1, salioAlPiso: "2026-08-01", diasSinVender: 70 }),
        prenda({ varianteId: "b", talla: "S", piso: 1, vendidas30: 1, salioAlPiso: "2026-08-01", ultimaVenta: "2026-10-05", diasSinVender: 5 }),
      ],
      HOY,
    );
    const g = gruposQuietas([m]);
    expect(g.liquidar).toHaveLength(0);
    expect(g.enviar).toHaveLength(0);
  });
});

describe("lo quieto de un tipo que no vendió nada no desaparece sin decirlo (revisión de B1)", () => {
  const sin = { motivo: "poca_venta" as const, desde: 7, vendidas: 7, unidades: 35 };
  it("se cuenta aparte: con algo en la tienda, sin ventas, ya en el piso, sin vara ni razón de sin ritmo", () => {
    const prendas = [
      quieta("sin-ventas-del-tipo", 100, { umbrales: undefined }),
      quieta("con-vara", 100),
      quieta("sin-ritmo", 100, { umbrales: undefined, sinRitmo: sin }),
      quieta("sin-lectura", 100, { umbrales: undefined, sinRitmo: { motivo: "sin_lectura", porque: "fallo" } }),
      quieta("agotada", 100, { umbrales: undefined, piso: 0, almacen: 0 }),
      quieta("se-vende", 5, { umbrales: undefined, vendidas30: 3 }),
      quieta("nunca-salio", 100, { umbrales: undefined, diasSinVender: null }),
    ];
    expect(modelosSinConQueComparar(prendas)).toBe(1);
    expect(modelosSinConQueComparar([])).toBe(0);
  });
});
