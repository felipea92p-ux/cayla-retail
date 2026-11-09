import { describe, expect, it } from "vitest";
import { leerCostoPrenda } from "./costo-prenda-reglas";
import {
  aplicarCostoEn,
  cuentaDeLaTalla,
  fraseCostoPrenda,
  leerCostoDeLasTallas,
  resumenCostoPrenda,
  sugerenciaDeCosto,
  type CuentaTalla,
} from "./costo-tallas-reglas";
import type { FilaFicha } from "./variantes-ficha-reglas";

// El caso real que lo pidió (Short Sohanna, 7-nov): 1 de cada color a S/ 48. En Azul marino 30 quedaba 1 de la carga inicial a S/ 45;
// en Azul acero 28 y Celeste 30 ya no quedaba ninguna. Las 6 tallas que no llegaron siguen con su costo declarado de S/ 45.
// La base dice que se igualan 5 de las 6 tallas sin compra: «celeste-28» todavía tiene 1 prenda de la carga inicial (Solo sin stock).
const DE_LA_BASE = {
  tallas: {
    "azul-acero-28": { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 0, costo_habia: "45.00", llegaron: 1, costo_llegaron: "48.00", quedo: "48.00" },
    "azul-marino-30": { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 1, costo_habia: "45.00", llegaron: 1, costo_llegaron: "48.00", quedo: "46.50" },
    "celeste-30": { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 0, costo_habia: "45.00", llegaron: 1, costo_llegaron: "48.00", quedo: "48.00" },
  },
  igualar: { costo: "48.00", variantes: ["azul-acero-30", "azul-acero-32", "azul-marino-28", "azul-marino-32", "celeste-32"] },
};

function fila(clave: string, costo: string, extra: Partial<FilaFicha> = {}): FilaFicha {
  return {
    clave,
    id: clave,
    colorCodigo: clave.split("-")[0],
    tallaId: clave.split("-").at(-1)!,
    guardada: { colorCodigo: clave.split("-")[0], tallaId: clave.split("-").at(-1)!, precio: "89.90", costo, activo: true, codigo: null, etiquetaIds: [] },
    codigosBarras: [],
    precio: "89.90",
    costo,
    costoFijo: false,
    activo: true,
    etiquetaIds: [],
    ...extra,
  };
}

const FILAS: FilaFicha[] = [
  fila("azul-acero-28", "48.00", { costoFijo: true }),
  fila("azul-acero-30", "45.00"),
  fila("azul-acero-32", "45.00"),
  fila("azul-marino-28", "45.00"),
  fila("azul-marino-30", "46.50", { costoFijo: true }),
  fila("azul-marino-32", "45.00"),
  fila("celeste-28", "45.00"),
  fila("celeste-30", "48.00", { costoFijo: true }),
  fila("celeste-32", "45.00"),
];

describe("leerCostoDeLasTallas", () => {
  it("sin respuesta (sin permiso de dinero o la base sin la función) no hay cuenta", () => {
    expect(leerCostoDeLasTallas(null)).toBeNull();
    expect(leerCostoDeLasTallas([])).toBeNull();
    expect(leerCostoDeLasTallas("x")).toBeNull();
  });

  it("lee los montos que la base manda como texto y descarta lo que no sirve", () => {
    const r = leerCostoDeLasTallas({ ...DE_LA_BASE, tallas: { ...DE_LA_BASE.tallas, rota: { fecha: "2026-11-07", llegaron: 0, quedo: 1 } } })!;
    expect(Object.keys(r.tallas).sort()).toEqual(["azul-acero-28", "azul-marino-30", "celeste-30"]);
    expect(r.tallas["azul-marino-30"]).toEqual({ fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 1, costoHabia: 45, llegaron: 1, costoLlegaron: 48, quedo: 46.5 });
    expect(r.igualar).toEqual({ costo: 48, ids: ["azul-acero-30", "azul-acero-32", "azul-marino-28", "azul-marino-32", "celeste-32"] });
  });

  it("sin tallas para igualar (o con un costo que no sirve), «igualar» es null", () => {
    expect(leerCostoDeLasTallas({ tallas: {}, igualar: null })).toEqual({ tallas: {}, igualar: null });
    expect(leerCostoDeLasTallas({ tallas: {}, igualar: { costo: 0, variantes: ["a"] } })?.igualar).toBeNull();
    expect(leerCostoDeLasTallas({ tallas: {}, igualar: { costo: 48, variantes: [] } })?.igualar).toBeNull();
  });
});

describe("cuentaDeLaTalla: el «?» de una talla gris", () => {
  const t = leerCostoDeLasTallas(DE_LA_BASE)!.tallas;

  it("con una prenda de antes, dice la mezcla y el promedio", () => {
    expect(cuentaDeLaTalla(t["azul-marino-30"], 46.5)).toBe("Había 1 a S/ 45.00 y llegó 1 el 7 nov a S/ 48.00: el promedio de las 2 es S/ 46.50.");
  });

  it("sin ninguna de antes, el costo es el de la compra", () => {
    expect(cuentaDeLaTalla(t["celeste-30"], 48)).toBe("Llegó 1 el 7 nov a S/ 48.00 y no quedaba ninguna de antes: ese es su costo.");
  });

  it("habla de varias y del Taller", () => {
    const taller: CuentaTalla = { fecha: "2026-11-03T15:00:00+00:00", origen: "produccion", habia: 4, costoHabia: 30, llegaron: 10, costoLlegaron: 35, quedo: 33.57 };
    expect(cuentaDeLaTalla(taller, 33.57)).toBe("Había 4 a S/ 30.00 y salieron 10 del Taller el 3 nov a S/ 35.00: el promedio de las 14 es S/ 33.57.");
    expect(cuentaDeLaTalla({ ...taller, habia: 0, quedo: 35 }, 35)).toBe("Salieron 10 del Taller el 3 nov a S/ 35.00 y no quedaba ninguna de antes: ese es su costo.");
  });

  it("no afirma una cuenta que no termina en el costo de la celda", () => {
    expect(cuentaDeLaTalla(t["azul-marino-30"], 47)).toBeNull();
    expect(cuentaDeLaTalla(undefined, 46.5)).toBeNull();
    expect(cuentaDeLaTalla(t["azul-marino-30"], Number.NaN)).toBeNull();
  });
});

describe("la línea sobre la tabla: lo mismo que el Historial ▸ Costo", () => {
  const costo = leerCostoPrenda({
    compras: [
      { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", llegaron: 3, costo_llegaron: 48, ya_habia: 1, costo_antes: 45, costo_despues: 47.25 },
    ],
    hoy: { stock: 4, costo: 47.25 },
    inicio: { fecha: "2026-10-22T15:00:00+00:00", costo: 45 },
  });

  it("sin compras no hay línea: todo el costo es el declarado", () => {
    expect(resumenCostoPrenda(null)).toBeNull();
    expect(resumenCostoPrenda(leerCostoPrenda({ compras: [], hoy: { stock: 3, costo: 45 }, inicio: {} }))).toBeNull();
  });

  it("cuánto cuesta hoy cada prenda y la última compra", () => {
    const r = resumenCostoPrenda(costo)!;
    expect(r).toEqual({ hoy: 47.25, stock: 4, ultima: { costo: 48, fecha: "2026-11-07T20:17:50+00:00", origen: "compra" } });
    expect(fraseCostoPrenda(r)).toEqual({ cifra: "S/ 47.25", detalle: "promedio de las 4 que tienes · última compra S/ 48.00 el 7 nov" });
  });

  it("con una sola, o ninguna, en stock", () => {
    const r = resumenCostoPrenda(costo)!;
    expect(fraseCostoPrenda({ ...r, stock: 1, hoy: 48 }).detalle).toBe("es la única que tienes · última compra S/ 48.00 el 7 nov");
    expect(fraseCostoPrenda({ ...r, stock: 0, hoy: null })).toEqual({ cifra: null, detalle: "No te queda ninguna en stock · última compra S/ 48.00 el 7 nov" });
    expect(fraseCostoPrenda({ ...r, ultima: { ...r.ultima, origen: "produccion" } }).detalle).toContain("último cierre del Taller S/ 48.00");
  });
});

describe("sugerenciaDeCosto: las tallas sin compra y sin stock (Solo sin stock, Felipe 2026-11-09)", () => {
  const igualar = leerCostoDeLasTallas(DE_LA_BASE)!.igualar!;

  it("ofrece las 5 que la base deja igualar y dice que la que tiene prendas se corrige en su celda", () => {
    expect(sugerenciaDeCosto(FILAS, igualar)).toEqual({
      monto: "48.00",
      claves: ["azul-acero-30", "azul-acero-32", "azul-marino-28", "azul-marino-32", "celeste-32"],
      texto: "5 tallas sin stock aún no llegan por compra: su costo es el que se escribió a mano. La que tiene prendas se corrige en su celda.",
      boton: "Usar S/\u00a048.00, el de la última compra",
    });
  });

  it("al usarla, pone 48 solo en esas 5: la que tiene prendas y las grises quedan como estaban", () => {
    const s = sugerenciaDeCosto(FILAS, igualar)!;
    const filas = aplicarCostoEn(FILAS, s.claves, s.monto);
    expect(filas.map((f) => f.costo)).toEqual(["48.00", "48.00", "48.00", "48.00", "46.50", "48.00", "45.00", "48.00", "48.00"]);
    expect(sugerenciaDeCosto(filas, igualar)).toBeNull();
  });

  it("nunca toca una gris, aunque viniera en la lista", () => {
    expect(aplicarCostoEn(FILAS, ["azul-marino-30"], "48.00")[4].costo).toBe("46.50");
  });

  it("una sola se dice en singular; las que ya tienen ese costo en la ficha no cuentan", () => {
    const filas = FILAS.map((f) => (f.clave === "azul-acero-30" ? f : { ...f, costo: f.costoFijo ? f.costo : "48.00" }));
    expect(sugerenciaDeCosto(filas, igualar)?.texto).toBe("1 talla sin stock aún no llega por compra: su costo es el que se escribió a mano.");
  });

  it("sin lista de la base (sin permiso, sin la función, o ninguna talla) no se ofrece nada", () => {
    expect(sugerenciaDeCosto(FILAS, null)).toBeNull();
    expect(sugerenciaDeCosto(FILAS, { costo: 0, ids: ["azul-acero-30"] })).toBeNull();
    // La base nunca lista una gris (ya tiene compra); si llegara a venir, la ficha tampoco la ofrece.
    expect(sugerenciaDeCosto(FILAS, { costo: 48, ids: ["azul-marino-30"] })).toBeNull();
  });

  it("del Taller lo dice así", () => {
    expect(sugerenciaDeCosto(FILAS, igualar, "produccion")?.boton).toBe("Usar S/\u00a048.00, el del último cierre del Taller");
  });
});
