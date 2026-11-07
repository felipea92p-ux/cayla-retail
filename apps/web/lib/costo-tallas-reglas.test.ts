import { describe, expect, it } from "vitest";
import { leerCostoPrenda } from "./costo-prenda-reglas";
import {
  cuentaDeLaTalla,
  fraseCostoPrenda,
  leerCostoDeLasTallas,
  resumenCostoPrenda,
  sugerenciaDeCosto,
  type CuentaTalla,
} from "./costo-tallas-reglas";
import { aplicarEnBloque, type FilaFicha } from "./variantes-ficha-reglas";

// El caso real que lo pidió (Short Sohanna, 7-nov): 1 de cada color a S/ 48. En Azul marino 30 quedaba 1 de la carga inicial a S/ 45;
// en Azul acero 28 y Celeste 30 ya no quedaba ninguna. Las 6 tallas que no llegaron siguen con su costo declarado de S/ 45.
const DE_LA_BASE = {
  "azul-acero-28": { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 0, costo_habia: "45.00", llegaron: 1, costo_llegaron: "48.00", quedo: "48.00" },
  "azul-marino-30": { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 1, costo_habia: "45.00", llegaron: 1, costo_llegaron: "48.00", quedo: "46.50" },
  "celeste-30": { fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 0, costo_habia: "45.00", llegaron: 1, costo_llegaron: "48.00", quedo: "48.00" },
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
    const t = leerCostoDeLasTallas({ ...DE_LA_BASE, rota: { fecha: "2026-11-07", llegaron: 0, quedo: 1 } })!;
    expect(Object.keys(t).sort()).toEqual(["azul-acero-28", "azul-marino-30", "celeste-30"]);
    expect(t["azul-marino-30"]).toEqual({ fecha: "2026-11-07T20:17:50+00:00", origen: "compra", habia: 1, costoHabia: 45, llegaron: 1, costoLlegaron: 48, quedo: 46.5 });
  });
});

describe("cuentaDeLaTalla: el «?» de una talla gris", () => {
  const t = leerCostoDeLasTallas(DE_LA_BASE)!;

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

describe("sugerenciaDeCosto: las tallas que aún no llegan por compra", () => {
  const ultima = { costo: 48, fecha: "2026-11-07T20:17:50+00:00", origen: "compra" as const };

  it("cuenta las 6 tallas escritas a mano con otro costo, nunca las grises", () => {
    expect(sugerenciaDeCosto(FILAS, ultima)).toEqual({
      monto: "48.00",
      cuantas: 6,
      texto: "6 tallas aún no llegan por compra: su costo es el que se escribió a mano.",
      boton: "Usar S/ 48.00, el de la última compra",
    });
  });

  it("y al usarla, «Cambiar en bloque» pone 48 en las 6 y deja las grises como están", () => {
    const s = sugerenciaDeCosto(FILAS, ultima)!;
    const r = aplicarEnBloque(FILAS, "costo", "todas", s.monto);
    expect(r).toMatchObject({ aplicadas: 6, fijas: 3, error: null });
    expect(r.filas.map((f) => f.costo)).toEqual(["48.00", "48.00", "48.00", "48.00", "46.50", "48.00", "48.00", "48.00", "48.00"]);
    expect(sugerenciaDeCosto(r.filas, ultima)).toBeNull();
  });

  it("no cuenta las desactivadas ni las que ya tienen ese costo; una sola se dice en singular", () => {
    const filas = [fila("a-1", "48"), fila("a-2", "45", { activo: false }), fila("a-3", "45.00")];
    expect(sugerenciaDeCosto(filas, ultima)?.cuantas).toBe(1);
    expect(sugerenciaDeCosto(filas, ultima)?.texto).toBe("1 talla aún no llega por compra: su costo es el que se escribió a mano.");
  });

  it("sin compras, o con una compra sin costo (un obsequio), no sugiere nada", () => {
    expect(sugerenciaDeCosto(FILAS, null)).toBeNull();
    expect(sugerenciaDeCosto(FILAS, { ...ultima, costo: 0 })).toBeNull();
  });

  it("del Taller lo dice así", () => {
    expect(sugerenciaDeCosto(FILAS, { ...ultima, origen: "produccion" })?.boton).toBe("Usar S/ 48.00, el del último cierre del Taller");
  });
});
