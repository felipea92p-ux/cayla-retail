import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import { DIAS_VIGILAR, LIQUIDAR_DEFECTO, LIQUIDAR_MAX, LIQUIDAR_MIN } from "./analisis-reglas";
import { destinoDeTodas, gruposQuietas, lineaTodaviaNoQuietas, notaDeUmbrales, ETIQUETA_LIQUIDAR_DESDE, plataParada, puedeJuzgarQuietas, TEXTO_VACIO_QUIETAS, vacioQuietas } from "./analisis-quietas";
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

/** Una prenda quieta en mi tienda: 3 libres y `dias` sin venderse. */
const quieta = (varianteId: string, dias: number, extra: Partial<PrendaAnalisis> = {}) => prenda({ varianteId, piso: 2, almacen: 1, diasSinVender: dias, ...extra });
/** Lo que vendió otra tienda (inventada) en 30 días. */
const vendioAlla = (sedeId: string, vendidas30: number, stock = 1) => ({ sedeId, stock, vendidas30 });

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
    const g = gruposQuietas(prendas, 60);
    expect(ids(g.enviar)).toEqual(["enviar"]);
    expect(ids(g.liquidar)).toEqual(["liquidar-vieja", "liquidar"]);
    expect(ids(g.vigila)).toEqual(["vigila"]);
  });

  it("lo que se vende, lo nuevo y lo que se acaba no entran", () => {
    const g = gruposQuietas(prendas, 60);
    const todas = [...g.enviar, ...g.liquidar, ...g.vigila].map((p) => p.varianteId);
    expect(todas).not.toContain("se-vende");
    expect(todas).not.toContain("nueva");
    expect(todas).not.toContain("se-acaba");
    expect(new Set(todas).size).toBe(todas.length); // ninguna en dos grupos
  });

  it("al mover «Liquidar desde», las prendas cambian de grupo en vivo", () => {
    expect(ids(gruposQuietas(prendas, 40).liquidar)).toEqual(["liquidar-vieja", "liquidar", "vigila"]);
    const alto = gruposQuietas(prendas, 85);
    expect(ids(alto.liquidar)).toEqual(["liquidar-vieja"]);
    expect(ids(alto.vigila)).toEqual(["enviar", "liquidar", "vigila"]);
    expect(alto.enviar).toEqual([]);
    // Sin tope: con 999 días nada se liquida, todo lo quieto se vigila.
    const sinTope = gruposQuietas(prendas, LIQUIDAR_MAX);
    expect(sinTope.liquidar).toEqual([]);
    expect(ids(sinTope.vigila)).toEqual(["liquidar-vieja", "enviar", "liquidar", "vigila"]);
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
    const g = gruposQuietas(prendas, 60);
    expect(g.duda.map((p) => p.varianteId)).toEqual(["duda-vieja", "enviar-en-duda", "duda-vigila"]);
    expect(g.liquidar.map((p) => p.varianteId)).toEqual(["liquidar"]);
    expect(g.enviar).toEqual([]);
    expect(g.vigila).toEqual([]);
  });
  it("con solo prendas en duda hay carril: no es «Todo se mueve»", () => {
    expect(vacioQuietas([quieta("duda", 80, { enDuda: 1 })], 60, 0)).toBeNull();
  });
});

describe("los escalones de cada tipo en el carril (ADR-0357, act. 2026-10-14)", () => {
  const polos = { vigila: 3, liquidar: 5, vara: "hoy" as const, vendidas: 30 };
  it("la nota dice con qué se mide cada tipo, y si la caja hoy no mueve a ninguno", () => {
    expect(notaDeUmbrales([{ umbrales: polos }], "sin_modulo")).toContain("todo cuenta como «no se vende» desde los días de la caja");
    expect(notaDeUmbrales([{}, {}], "ok")).toContain("Ningún tipo tiene todavía 10 ventas");
    expect(notaDeUmbrales([{ umbrales: polos }], "ok")).toContain("hoy no hay ninguno");
    expect(notaDeUmbrales([{ umbrales: polos }, {}], "ok")).toContain("Los días de la caja solo valen para tipos con menos de 10 ventas.");
    expect(notaDeUmbrales([{ umbrales: polos }, {}], "ok")).not.toContain("hoy no hay ninguno");
  });
  it("el umbral se llama por lo que cuenta, sin «liquidar» (cara B, Felipe 2026-11-21)", () => {
    expect(ETIQUETA_LIQUIDAR_DESDE).toBe("Sin venderse desde");
    expect(ETIQUETA_LIQUIDAR_DESDE.toLowerCase()).not.toContain("liquid");
  });
  it("la plata parada: costo × lo que hay, talla por talla; sin costo en ninguna, null", () => {
    const talla = (costo: number | null, piso: number, almacen = 0) => ({ costo, piso, almacen });
    expect(plataParada({ ...talla(40, 0), variantes: [talla(40, 2, 1), talla(40, 1), talla(null, 5)] })).toBe(160);
    expect(plataParada(talla(30, 2))).toBe(60);
    expect(plataParada({ ...talla(null, 3), variantes: [talla(null, 3)] })).toBeNull();
  });
});

describe("«Todavía no se puede saber» en vez de «Todo se mueve» (tarea #2, 2026-10-14)", () => {
  it("sin carril y sin ningún modelo que lleve el umbral en el piso, la pestaña no dice «Todo se mueve»", () => {
    const nuevas = [prenda({ varianteId: "a", piso: 2, salioAlPiso: "2026-10-10", diasSinVender: 4 })];
    expect(vacioQuietas(nuevas, 15, 0, "2026-10-14")).toBe("todavia-no");
    expect(TEXTO_VACIO_QUIETAS["todavia-no"].titulo).toBe("Todavía no se puede saber");
    expect(vacioQuietas(nuevas, 15, 0, "2026-10-30")).toBe("todo-se-mueve");
    // Sin la fecha (quien no la pasa), como antes.
    expect(vacioQuietas(nuevas, 15, 0)).toBe("todo-se-mueve");
  });
  it("puedeJuzgarQuietas mira solo lo que hay en la tienda y ya salió al piso", () => {
    expect(puedeJuzgarQuietas([prenda({ piso: 0, almacen: 0, salioAlPiso: "2026-08-01" })], 15, "2026-10-14")).toBe(false);
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: null })], 15, "2026-10-14")).toBe(false);
    expect(puedeJuzgarQuietas([prenda({ almacen: 2, salioAlPiso: "2026-09-29" })], 15, "2026-10-14")).toBe(true);
    expect(lineaTodaviaNoQuietas([prenda({ almacen: 2, salioAlPiso: null })], 15)).toBe("No hay nada colgado que juzgar todavía.");
  });
});

describe("«Enviar todas»", () => {
  it("si todas van a la misma tienda, esa", () => {
    expect(destinoDeTodas([{ otras: [vendioAlla("tienda-b", 3), vendioAlla("tienda-c", 0)] }, { otras: [vendioAlla("tienda-b", 2)] }])).toBe("tienda-b");
  });
  it("si van a tiendas distintas, ninguna (cada fila tiene la suya)", () => {
    expect(destinoDeTodas([{ otras: [vendioAlla("tienda-b", 3)] }, { otras: [vendioAlla("tienda-c", 4), vendioAlla("tienda-b", 1)] }])).toBeNull();
  });
  it("sin prendas, o con una que ninguna tienda vende, ninguna", () => {
    expect(destinoDeTodas([])).toBeNull();
    expect(destinoDeTodas([{ otras: [vendioAlla("tienda-b", 3)] }, { otras: [] }])).toBeNull();
  });
});

describe("cuando no hay carril", () => {
  it("si todo se vende o es nuevo, todo se mueve", () => {
    expect(vacioQuietas([quieta("nueva", 10), prenda({ varianteId: "se-vende", piso: 3, vendidas30: 4, diasSinVender: 1 })], LIQUIDAR_DEFECTO, 0)).toBe("todo-se-mueve");
  });
  it("si no llegó ni una prenda porque algo falló al leer, no dice «todo se mueve»: dice que no pudo ver", () => {
    expect(vacioQuietas([], LIQUIDAR_DEFECTO, 1)).toBe("sin-datos");
    expect(vacioQuietas([], LIQUIDAR_DEFECTO, 0)).toBe("todo-se-mueve");
    // Con prendas a la vista, una falla de otra parte no cambia la respuesta.
    expect(vacioQuietas([quieta("nueva", 10)], LIQUIDAR_DEFECTO, 2)).toBe("todo-se-mueve");
  });
  it("con una sola que se vigila, hay carril (aunque algo más haya fallado)", () => {
    expect(vacioQuietas([quieta("nueva", 10), quieta("vigila", 40)], LIQUIDAR_DEFECTO, 0)).toBeNull();
    expect(vacioQuietas([quieta("vigila", 40)], LIQUIDAR_DEFECTO, 1)).toBeNull();
  });
  it("el control nunca saca una prenda del carril; con menos de 30 días puede sumar las que ya llevan ese tiempo quietas", () => {
    const prendas = [quieta("a", 30), quieta("b", 29)];
    for (let dias = LIQUIDAR_MIN; dias <= LIQUIDAR_MAX; dias++) expect(vacioQuietas(prendas, dias, 0)).toBeNull();
    // Con 30 o más, la de 29 días no entra: no depende del número.
    for (let dias = DIAS_VIGILAR; dias <= LIQUIDAR_MAX; dias++) expect(vacioQuietas([quieta("b", 29)], dias, 0)).toBe("todo-se-mueve");
    // Con menos (sin tope desde el 2026-10-07), ya lleva esos días: entra a «Liquidar».
    expect(vacioQuietas([quieta("b", 29)], 29, 0)).toBeNull();
    expect(vacioQuietas([quieta("b", 29)], LIQUIDAR_MIN, 0)).toBeNull();
  });
  it("cada vacío dice algo corto, con su título y una línea", () => {
    expect(TEXTO_VACIO_QUIETAS["todo-se-mueve"].titulo).toBe("Todo se mueve");
    for (const t of Object.values(TEXTO_VACIO_QUIETAS)) expect(t.linea.length).toBeLessThanOrEqual(60);
    // La línea de «Todavía no se puede saber» que dice el umbral, también corta (con 999 días, la más larga).
    const colgada = [prenda({ piso: 1, salioAlPiso: "2026-10-01" })];
    expect(lineaTodaviaNoQuietas(colgada, 999).length).toBeLessThanOrEqual(60);
    expect(lineaTodaviaNoQuietas([{ ...colgada[0]!, umbrales: { vigila: 3, liquidar: 5, vara: "hoy", vendidas: 30 } }], 15).length).toBeLessThanOrEqual(60);
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
    expect(plataParada(m)).toBe(70);
  });

  it("un modelo con una talla que se vende no está quieto, aunque otra lleve 70 días colgada", () => {
    const m = modeloDe(
      [
        prenda({ varianteId: "a", piso: 1, salioAlPiso: "2026-08-01", diasSinVender: 70 }),
        prenda({ varianteId: "b", talla: "S", piso: 1, vendidas30: 1, salioAlPiso: "2026-08-01", ultimaVenta: "2026-10-05", diasSinVender: 5 }),
      ],
      HOY,
    );
    const g = gruposQuietas([m], 15);
    expect(g.liquidar).toHaveLength(0);
    expect(g.enviar).toHaveLength(0);
  });
});
