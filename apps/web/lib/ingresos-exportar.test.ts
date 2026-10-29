import { describe, expect, it } from "vitest";
import { textoCsv } from "./exportar-csv";
import { ENCABEZADOS_DETALLE, celdaSegura, encabezadosPorModelo, filasPorColorYTalla, filasPorModelo, nombreArchivoIngresos } from "./ingresos-exportar";
import type { ModeloIngresado } from "./ingresos-reglas";

const modelo = (extra: Partial<ModeloIngresado> = {}): ModeloIngresado => ({
  productoId: "p1",
  referencia: "Blusa Emma",
  codigo: "CMS-0011",
  categoria: "Camisas y Blusas",
  unidades: 24,
  deStockInicial: 15,
  deRecepcion: 9,
  primerDia: "2026-10-24",
  ultimoDia: "2026-10-26",
  variantes: [],
  esNuevo: true,
  precioMin: 50,
  precioMax: 70,
  costoMin: 20,
  costoMax: 30,
  ...extra,
});

describe("el archivo por modelo", () => {
  it("una fila por modelo con tantas celdas como encabezados, con o sin costo", () => {
    for (const veCosto of [true, false]) {
      expect(filasPorModelo([modelo()], veCosto)[0]).toHaveLength(encabezadosPorModelo(veCosto).length);
    }
    expect(encabezadosPorModelo(true).slice(-2)).toEqual(["Costo mínimo (S/)", "Costo máximo (S/)"]);
  });

  it("sin permiso de dinero NO hay columna de costo ni su monto en ninguna parte del archivo", () => {
    const csv = textoCsv(encabezadosPorModelo(false), filasPorModelo([modelo({ costoMin: 21.35, costoMax: 33.4 })], false));
    expect(csv).not.toMatch(/costo/i);
    expect(csv).not.toContain("21.35");
    expect(csv).not.toContain("33.4");
  });

  it("lo que falta es una celda vacía, nunca un 0", () => {
    const fila = filasPorModelo([modelo({ precioMin: null, precioMax: null, costoMin: null, costoMax: null })], true)[0];
    expect(fila.slice(-4)).toEqual(["", "", "", ""]);
  });

  it("dice Nuevo o Reingreso y trae los números como números", () => {
    const [nuevo, reingreso] = filasPorModelo([modelo(), modelo({ esNuevo: false })], false);
    expect(nuevo[3]).toBe("Nuevo");
    expect(reingreso[3]).toBe("Reingreso");
    expect(typeof nuevo[4]).toBe("number");
    expect(nuevo[9]).toBe(50);
  });

  it("respeta el orden en que llegan los modelos (el de la pantalla)", () => {
    const filas = filasPorModelo([modelo({ referencia: "Zeta" }), modelo({ referencia: "Alfa" })], false);
    expect(filas.map((f) => f[0])).toEqual(["Zeta", "Alfa"]);
  });
});

describe("celdaSegura", () => {
  it("un texto que Excel tomaría por fórmula lleva un apóstrofo delante", () => {
    for (const peligroso of ["=SUMA(A1)", "+1", "-2", "@cmd", "\tx"]) expect(celdaSegura(peligroso)).toBe(`'${peligroso}`);
  });

  it("un texto normal no cambia", () => {
    for (const normal of ["Blusa Emma", "CMS-0011", "", "Camisas y Blusas", "50% algodón"]) expect(celdaSegura(normal)).toBe(normal);
  });

  it("se aplica al nombre, al código y a la categoría de cada fila", () => {
    const fila = filasPorModelo([modelo({ referencia: "=HYPERLINK(\"x\")", codigo: "+X", categoria: "-Y" })], false)[0];
    expect(fila.slice(0, 3)).toEqual(["'=HYPERLINK(\"x\")", "'+X", "'-Y"]);
  });
});

describe("el archivo con colores y tallas", () => {
  const variantes = [
    { varianteId: "a", color: "Rojo", colorHex: null, talla: "M", unidades: 2 },
    { varianteId: "b", color: "Azul", colorHex: null, talla: "L", unidades: 3 },
    { varianteId: "c", color: "Azul", colorHex: null, talla: "S", unidades: 1 },
    { varianteId: "d", color: null, colorHex: null, talla: null, unidades: 4 },
  ];

  it("una fila por color y talla: los colores por nombre (sin color al final) y las tallas en su curva", () => {
    const filas = filasPorColorYTalla([modelo({ variantes })]);
    expect(filas.map((f) => [f[3], f[4], f[5]])).toEqual([
      ["Azul", "S", 1],
      ["Azul", "L", 3],
      ["Rojo", "M", 2],
      ["", "Sin talla", 4],
    ]);
    for (const f of filas) expect(f).toHaveLength(ENCABEZADOS_DETALLE.length);
  });

  it("la suma del archivo es la de los modelos", () => {
    const m = modelo({ unidades: 10, variantes });
    expect(filasPorColorYTalla([m]).reduce((s, f) => s + (f[5] as number), 0)).toBe(m.unidades);
  });

  it("un modelo sin detalle no deja filas", () => {
    expect(filasPorColorYTalla([modelo({ variantes: [] })])).toEqual([]);
  });
});

describe("el nombre del archivo", () => {
  it("sin tildes ni espacios, con el rango", () => {
    expect(nombreArchivoIngresos({ sede: "Tienda Trujillo", desde: "2026-10-02", hasta: "2026-10-28", detalle: false })).toBe("ingresos-tienda-trujillo-2026-10-02-a-2026-10-28.csv");
    expect(nombreArchivoIngresos({ sede: "Almacén Ñandú", desde: "2026-10-02", hasta: "2026-10-28", detalle: false })).toBe("ingresos-almacen-nandu-2026-10-02-a-2026-10-28.csv");
  });

  it("un solo día y el detalle", () => {
    expect(nombreArchivoIngresos({ sede: "Tienda Lima", desde: "2026-10-28", hasta: "2026-10-28", detalle: true })).toBe("ingresos-tienda-lima-2026-10-28-por-color-y-talla.csv");
  });

  it("una sede sin nombre legible no deja un hueco", () => {
    expect(nombreArchivoIngresos({ sede: "¿?", desde: "2026-10-28", hasta: "2026-10-28", detalle: false })).toBe("ingresos-sede-2026-10-28.csv");
  });
});
