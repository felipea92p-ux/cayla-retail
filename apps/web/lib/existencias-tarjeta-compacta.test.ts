import { describe, expect, it } from "vitest";
import type { FilaPrenda } from "./existencias-prendas";
import { celdaTarjeta, colorDeEntrada, coloresDeChapa, destinoDeTalla, filoDeTarjeta, lineaGuardadas, tallaDeEntrada, tallasAgotadas, tallasSinColgar } from "./existencias-tarjeta-compacta";
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

describe("lineaGuardadas (ADR-0391: lo colgado grande, lo guardado debajo con su palabra)", () => {
  it("con 2 tallas o menos dice las palabras del modal: «+2 en almacén», «+1 en almacén», «0 en almacén» tenue", () => {
    expect(lineaGuardadas({ estado: "normal", almacen: 2 }, 2)).toEqual({ texto: "+2 en almacén", cero: false });
    expect(lineaGuardadas({ estado: "falta", almacen: 1 }, 2)).toEqual({ texto: "+1 en almacén", cero: false });
    expect(lineaGuardadas({ estado: "normal", almacen: 0 }, 1)).toEqual({ texto: "0 en almacén", cero: true });
  });
  it("con 3 tallas o más no cabe la palabra junto a la foto (ADR-0589): solo el número (la leyenda del pie la pone)", () => {
    expect(lineaGuardadas({ estado: "normal", almacen: 3 }, 3)).toEqual({ texto: "+3", cero: false });
    expect(lineaGuardadas({ estado: "normal", almacen: 3 }, 4)).toEqual({ texto: "+3", cero: false });
    expect(lineaGuardadas({ estado: "normal", almacen: 0 }, 6)).toEqual({ texto: "0", cero: true });
  });
  it("agotada: «se acabó», apretado «acabó»; nunca tenue (es un aviso, no un cero)", () => {
    expect(lineaGuardadas({ estado: "agotada", almacen: 0 }, 2)).toEqual({ texto: "se acabó", cero: false });
    expect(lineaGuardadas({ estado: "agotada", almacen: 0 }, 5)).toEqual({ texto: "acabó", cero: false });
  });
});

describe("tallasSinColgar no cuenta lo que el motor manda «mantener» (afinado 2026-10-12 tras /formidable)", () => {
  it("una talla a 0 con stock atrás cuenta, salvo que el motor diga mantener", () => {
    const colores = [{ tallas: [
      { pisoDisponible: 0, almacenDisponible: 3, planPiso: null },
      { pisoDisponible: 0, almacenDisponible: 2, planPiso: { accion: "mantener" } as never },
      { pisoDisponible: 1, almacenDisponible: 2, planPiso: null },
    ] }];
    expect(tallasSinColgar(colores)).toBe(1);
  });
});

describe("coloresDeChapa (tarjeta Vitrina, ADR-0589)", () => {
  const colores = (k: number) => Array.from({ length: k }, (_, i) => ({ clave: `c${i}` }));
  it("hasta 5 colores: todos a la vista, sin «+N»", () => {
    for (const k of [1, 2, 5]) expect(coloresDeChapa(colores(k), "c0")).toEqual({ visibles: colores(k), ocultos: 0 });
  });
  it("6 o más: 3 a la vista y el resto en «+N» (el caso de 14 colores da «+11»)", () => {
    expect(coloresDeChapa(colores(6), "c0").ocultos).toBe(3);
    const r = coloresDeChapa(colores(14), "c1");
    expect(r.visibles.map((c) => c.clave)).toEqual(["c0", "c1", "c2"]);
    expect(r.ocultos).toBe(11);
  });
  it("el color que se ve, si quedó fuera, toma el tercer lugar; los dos primeros no se mueven", () => {
    const r = coloresDeChapa(colores(14), "c9");
    expect(r.visibles.map((c) => c.clave)).toEqual(["c0", "c1", "c9"]);
    expect(r.ocultos).toBe(11);
  });
  it("un color que ya no existe no rompe nada: los tres primeros", () => {
    expect(coloresDeChapa(colores(8), "nada").visibles.map((c) => c.clave)).toEqual(["c0", "c1", "c2"]);
  });
});

describe("filoDeTarjeta (tarjeta Vitrina, ADR-0589)", () => {
  // Con el motor del piso detrás, como `celdaTarjeta`: «falta colgar» lo decide `estadoTalla`, no la cifra sola.
  const [falta, normal, agotada] = conMotor([fila("S", 0, 3), fila("M", 2, 1), fila("L", 0, 0)]).filas;
  it("una talla agotada gana a una que falta colgar", () => {
    expect(filoDeTarjeta([falta, normal, agotada], true)).toBe("agotada");
  });
  it("0 colgadas y algo en almacén: falta", () => {
    expect(filoDeTarjeta([falta, normal], true)).toBe("falta");
  });
  it("todo colgado: sin filo", () => {
    expect(filoDeTarjeta([normal], true)).toBeNull();
  });
});
