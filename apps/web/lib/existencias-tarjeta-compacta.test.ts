import { describe, expect, it } from "vitest";
import type { FilaPrenda } from "./existencias-prendas";
import { celdaTarjeta, colorDeEntrada, destinoDeTalla, tallaDeEntrada, tallasAgotadas, tallasSinColgar } from "./existencias-tarjeta-compacta";
import { conMotor } from "./piso-plan-fixtures";

let n = 0;
const fila = (t: string, piso: number, almacen: number, extra: Partial<FilaPrenda> = {}): FilaPrenda => ({
  varianteId: `v${++n}`,
  productoId: "p1",
  referencia: "Blazer",
  sku: `SKU-${n}`,
  talla: t,
  color: "Verde",
  colorHex: null,
  fotoUrl: null,
  codigosBarras: [],
  pisoDisponible: piso,
  almacenDisponible: almacen,
  disponible: piso + almacen,
  apartado: 0,
  danado: 0,
  enTransito: 0,
  planPiso: null,
  marca: null,
  ...extra,
});

describe("celdaTarjeta", () => {
  const [falta, normal, agotada] = conMotor([fila("S", 0, 3), fila("M", 2, 1), fila("L", 0, 0)]).filas;

  it("0 colgadas y algo en almacén: falta (ámbar)", () => {
    expect(celdaTarjeta(falta, true)).toEqual({ estado: "falta", piso: 0, almacen: 3 });
  });
  it("algo colgado: normal, con sus dos cifras", () => {
    expect(celdaTarjeta(normal, true)).toEqual({ estado: "normal", piso: 2, almacen: 1 });
  });
  it("nada libre en la sede: agotada (rojo)", () => {
    expect(celdaTarjeta(agotada, true).estado).toBe("agotada");
  });
  it("lo apartado y lo dañado no cuentan: una talla con todo apartado está agotada", () => {
    const [f] = conMotor([fila("S", 0, 0, { apartado: 2, danado: 1 })]).filas;
    expect(celdaTarjeta(f, true).estado).toBe("agotada");
  });
  it("donde no se separa piso y almacén, la cifra es lo disponible y el almacén 0", () => {
    expect(celdaTarjeta(fila("S", 0, 0, { disponible: 4, pisoDisponible: null, almacenDisponible: null }), false)).toMatchObject({ piso: 4, almacen: 0 });
  });
});

describe("destinoDeTalla", () => {
  it("con almacén y permiso: listo para colgar", () => {
    expect(destinoDeTalla(fila("S", 1, 2), { separa: true, puedeReponer: true })).toBe("colgar");
  });
  it("sin nada en almacén: ver la talla", () => {
    expect(destinoDeTalla(fila("S", 2, 0), { separa: true, puedeReponer: true })).toBe("ver");
  });
  it("sin permiso de colgar o en una sede sin almacén: ver la talla", () => {
    expect(destinoDeTalla(fila("S", 0, 2), { separa: true, puedeReponer: false })).toBe("ver");
    expect(destinoDeTalla(fila("S", 0, 2), { separa: false, puedeReponer: true })).toBe("ver");
  });
});

describe("tallaDeEntrada y tallasAgotadas", () => {
  const { filas } = conMotor([fila("S", 1, 0), fila("M", 0, 0), fila("L", 0, 2)]);
  it("primero la que falta en el piso, luego la agotada, luego la primera", () => {
    expect(tallaDeEntrada(filas)?.talla).toBe("L");
    expect(tallaDeEntrada(filas.slice(0, 2))?.talla).toBe("M");
    expect(tallaDeEntrada(filas.slice(0, 1))?.talla).toBe("S");
  });
  it("la preferida (la del filtro) gana", () => {
    expect(tallaDeEntrada(filas, filas[0])?.talla).toBe("S");
  });
  it("nombra las agotadas", () => {
    expect(tallasAgotadas(filas)).toEqual(["M"]);
  });
});

describe("tallasSinColgar", () => {
  it("cuenta las tallas con 0 colgadas y algo en almacén, de todos los colores", () => {
    expect(tallasSinColgar([{ tallas: [fila("S", 0, 3), fila("M", 1, 2), fila("L", 0, 0)] }, { tallas: [fila("S", 0, 1)] }])).toBe(2);
  });
});

describe("colorDeEntrada", () => {
  const celeste = { color: "Celeste", tallas: conMotor([fila("L", 0, 0)]).filas };
  const negro = { color: "Negro", tallas: conMotor([fila("S", 2, 0), fila("M", 0, 3)]).filas };
  const rosado = { color: "Rosado", tallas: conMotor([fila("S", 1, 0)]).filas };
  it("abre en el color con algo que colgar, no en uno agotado", () => {
    expect(colorDeEntrada([celeste, rosado, negro])?.color).toBe("Negro");
  });
  it("sin nada que colgar, el primero con algo libre", () => {
    expect(colorDeEntrada([celeste, rosado])?.color).toBe("Rosado");
  });
  it("todos agotados: el primero", () => {
    expect(colorDeEntrada([celeste])?.color).toBe("Celeste");
  });
  it("un color con foto va primero dentro de cada escalón (Felipe, 2026-10-08)", () => {
    const negroSinFoto = { ...negro, fotoUrl: null };
    const rosadoConFoto = { ...rosado, fotoUrl: "rosado.jpg" };
    expect(colorDeEntrada([negroSinFoto, rosadoConFoto])?.color).toBe("Rosado");
    const negroConFoto = { ...negro, fotoUrl: "negro.jpg" };
    expect(colorDeEntrada([rosadoConFoto, negroConFoto])?.color).toBe("Negro");
  });
  it("uno con foto pero agotado no le gana a uno con algo libre", () => {
    expect(colorDeEntrada([{ ...celeste, fotoUrl: "celeste.jpg" }, rosado])?.color).toBe("Rosado");
  });
});
