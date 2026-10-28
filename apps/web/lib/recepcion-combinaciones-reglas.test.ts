import { describe, expect, it } from "vitest";
import {
  ALCANCES,
  MENSAJE_SIN_CONTEO,
  combinacionesContadas,
  combinacionesDistintas,
  costoEfectivo,
  costosParaLinea,
  describirCambio,
  destinosDelAlcance,
  etiquetaDe,
  leerCifra,
  llamadasDePrecio,
  matrizDe,
  montoTexto,
  ponerCosto,
  ponerPrecio,
  precioEfectivo,
  quitarCambios,
  seraPrecioDePrendaEntera,
  textoDeRango,
  valorMasComun,
  type Alcance,
  type Combinacion,
} from "./recepcion-combinaciones-reglas";

const COLORES = ["Negro", "Azul marino", "Beige"];
const TALLAS = ["S", "M", "L", "XL"];
/** 3 colores × 4 tallas = 12 combinaciones, todas a S/ 99 de precio y S/ 45 de costo. */
function cuadricula(ajuste: (c: Combinacion) => Partial<Combinacion> = () => ({})): Combinacion[] {
  return COLORES.flatMap((color) =>
    TALLAS.map((talla): Combinacion => {
      const c: Combinacion = { varianteId: `v-${color}-${talla}`, color, talla, cantidad: 1, precioGeneral: 99, precioSede: 99, costoHeredado: 45 };
      return { ...c, ...ajuste(c) };
    }),
  );
}
const ids = (cs: readonly Combinacion[]) => cs.map((c) => c.varianteId);
const antesDe = (cs: readonly Combinacion[], cifra: "costo" | "precio" = "precio") =>
  Object.fromEntries(cs.map((c) => [c.varianteId, cifra === "precio" ? c.precioSede : c.costoHeredado]));

describe("combinacionesContadas", () => {
  const hoy = { a: { general: 80, sede: 90 }, b: { general: 80, sede: null }, c: undefined };
  const v = (varianteId: string, cantidad: number, talla = "S", color = "Negro") => ({ varianteId, cantidad, danadas: 0, solucion: null, talla, color, codigo: null });

  it("toma solo las que se contaron, con lo que valen hoy y el costo que heredan", () => {
    const r = combinacionesContadas({ variantes: [v("a", 3), v("b", 2, "M"), v("c", 0, "L"), v("d", 1, "XL")] }, hoy, 30);
    expect(r.map((c) => c.varianteId)).toEqual(["a", "b", "d"]);
    expect(r[0]).toMatchObject({ precioGeneral: 80, precioSede: 90, costoHeredado: 30, cantidad: 3 });
    // Sin precio propio de la tienda, vale el general; sin nada leído, null (todavía no se sabe).
    expect(r[1]).toMatchObject({ precioGeneral: 80, precioSede: 80 });
    expect(r[2]).toMatchObject({ precioGeneral: null, precioSede: null });
  });

  it("una prenda separada sin color y talla no tiene combinaciones (la pantalla dice que aún no se contó)", () => {
    expect(MENSAJE_SIN_CONTEO).toBe("Aún no se realizó el conteo por color y talla de esta prenda.");
    expect(combinacionesContadas({ variantes: null }, hoy, 30)).toEqual([]);
    expect(combinacionesContadas({ variantes: [] }, hoy, 30)).toEqual([]);
  });
});

describe("matrizDe", () => {
  it("colores en filas y tallas en columnas, en el orden de una curva", () => {
    const m = matrizDe([
      ...cuadricula().filter((c) => c.color !== "Beige"),
      ...cuadricula().filter((c) => c.color === "Beige").reverse(),
    ].reverse());
    expect(m.tallas).toEqual(["S", "M", "L", "XL"]);
    expect(m.filas.map((f) => f.color)).toEqual(["Azul marino", "Beige", "Negro"]);
    expect(m.filas.every((f) => f.celdas.length === 4 && f.celdas.every((c) => c !== null))).toBe(true);
    expect(m.filas[2].celdas.map((c) => c?.talla)).toEqual(["S", "M", "L", "XL"]);
  });

  it("numeración (36 · 38 · 40) y «Sin color» al final", () => {
    const m = matrizDe([
      { varianteId: "1", color: null, talla: "40", cantidad: 1, precioGeneral: 1, precioSede: 1, costoHeredado: 1 },
      { varianteId: "2", color: "Rojo", talla: "36", cantidad: 1, precioGeneral: 1, precioSede: 1, costoHeredado: 1 },
    ]);
    expect(m.tallas).toEqual(["36", "40"]);
    expect(m.filas.map((f) => f.color)).toEqual(["Rojo", "Sin color"]);
  });

  it("una pareja que no se contó queda vacía (null), no se inventa", () => {
    const m = matrizDe(cuadricula().filter((c) => !(c.color === "Beige" && c.talla === "L")));
    const beige = m.filas.find((f) => f.color === "Beige");
    expect(beige?.celdas.map((c) => c?.talla ?? null)).toEqual(["S", "M", null, "XL"]);
  });

  it("sin combinaciones, una matriz vacía", () => {
    expect(matrizDe([])).toEqual({ tallas: [], filas: [] });
  });
});

describe("destinosDelAlcance", () => {
  const cs = cuadricula();
  const origen = "v-Negro-M";

  it("esta combinación, ese color en todas sus tallas, esa talla en todos sus colores, o todas", () => {
    expect(destinosDelAlcance(cs, origen, "esta")).toEqual(["v-Negro-M"]);
    expect(destinosDelAlcance(cs, origen, "color")).toEqual(["v-Negro-S", "v-Negro-M", "v-Negro-L", "v-Negro-XL"]);
    expect(destinosDelAlcance(cs, origen, "talla")).toEqual(["v-Negro-M", "v-Azul marino-M", "v-Beige-M"]);
    expect(destinosDelAlcance(cs, origen, "todas")).toHaveLength(12);
  });

  it("invariantes en TODA la cuadrícula: el origen siempre va, esta ⊂ color y talla ⊂ todas, y color ∩ talla = el origen", () => {
    for (const o of cs) {
      const por = Object.fromEntries(ALCANCES.map((a) => [a, destinosDelAlcance(cs, o.varianteId, a)])) as Record<Alcance, string[]>;
      for (const a of ALCANCES) expect(por[a]).toContain(o.varianteId);
      expect(por.esta).toEqual([o.varianteId]);
      expect(por.todas).toEqual(ids(cs));
      expect(por.color.length).toBe(4);
      expect(por.talla.length).toBe(3);
      expect(por.color.filter((id) => por.talla.includes(id))).toEqual([o.varianteId]);
      for (const id of [...por.color, ...por.talla]) expect(por.todas).toContain(id);
    }
  });

  it("no distingue mayúsculas ni espacios, y un origen que no está no da nada", () => {
    const raro = [
      { ...cs[0], varianteId: "a", color: " negro ", talla: "m" },
      { ...cs[0], varianteId: "b", color: "NEGRO", talla: "L" },
      { ...cs[0], varianteId: "c", color: "Beige", talla: "M" },
    ];
    expect(destinosDelAlcance(raro, "a", "color")).toEqual(["a", "b"]);
    expect(destinosDelAlcance(raro, "a", "talla")).toEqual(["a", "c"]);
    expect(destinosDelAlcance(raro, "no-esta", "todas")).toEqual([]);
  });

  it("una prenda de un solo color o de una sola talla: ese alcance es igual a «todas»", () => {
    const una = cs.filter((c) => c.color === "Negro");
    expect(destinosDelAlcance(una, "v-Negro-S", "color")).toEqual(ids(una));
    const talla = cs.filter((c) => c.talla === "M");
    expect(destinosDelAlcance(talla, "v-Beige-M", "talla")).toEqual(ids(talla));
  });
});

describe("lo escrito", () => {
  it("poner y quitar no tocan lo que ya había (los objetos son nuevos)", () => {
    const antes = Object.freeze({ a: 10 });
    const despues = ponerCosto(antes, ["b", "c"], 12);
    expect(despues).toEqual({ a: 10, b: 12, c: 12 });
    expect(antes).toEqual({ a: 10 });
    const precios = ponerPrecio({}, ["a"], 99, "sede");
    expect(precios).toEqual({ a: { valor: 99, valeEn: "sede" } });
    expect(quitarCambios(despues, ["a", "c"])).toEqual({ b: 12 });
    expect(despues).toEqual({ a: 10, b: 12, c: 12 });
  });

  it("escribir de nuevo en una casilla la pisa (el último valor manda)", () => {
    expect(ponerCosto(ponerCosto({}, ["a"], 10), ["a"], 20)).toEqual({ a: 20 });
    expect(ponerPrecio(ponerPrecio({}, ["a"], 90, "todas"), ["a"], 95, "sede")).toEqual({ a: { valor: 95, valeEn: "sede" } });
  });

  it("el valor de la pantalla es lo escrito, o lo que traía", () => {
    const [c] = cuadricula();
    expect(costoEfectivo(c, {})).toBe(45);
    expect(costoEfectivo(c, { [c.varianteId]: 50 })).toBe(50);
    expect(precioEfectivo(c, {})).toBe(99);
    expect(precioEfectivo(c, { [c.varianteId]: { valor: 109, valeEn: "sede" } })).toBe(109);
    expect(costoEfectivo({ ...c, costoHeredado: null }, {})).toBeNull();
  });

  it("lo escrito se lee con las reglas de la pantalla (costo: de 0 a 99 999.99; precio: mayor que 0, hasta 5 000); vacío es «no lo cambio»", () => {
    expect(leerCifra("costo", "35.5")).toEqual({ valor: 35.5, problema: null });
    expect(leerCifra("costo", "")).toEqual({ valor: null, problema: null });
    expect(leerCifra("costo", "-1").problema).toMatch(/negativo/);
    expect(leerCifra("precio", "0").problema).toMatch(/mayor que cero/);
    expect(leerCifra("precio", "5000.01").problema).toMatch(/5/);
    expect(leerCifra("precio", "abc").problema).toMatch(/números/);
    expect(leerCifra("precio", "109").valor).toBe(109);
  });
});

describe("el «normal» de la prenda y las que se salen", () => {
  it("el valor que más se repite; empatan, el menor; sin valores, null", () => {
    expect(valorMasComun([99, 99, 105, 99])).toBe(99);
    expect(valorMasComun([105, 99, 105, 99])).toBe(99);
    expect(valorMasComun([null, null])).toBeNull();
    expect(valorMasComun([])).toBeNull();
  });

  it("marca las combinaciones cuyo precio se sale del normal", () => {
    const cs = cuadricula((c) => (c.varianteId === "v-Beige-S" ? { precioSede: 105 } : {}));
    expect([...combinacionesDistintas(cs, (c) => c.precioSede)]).toEqual(["v-Beige-S"]);
    expect(combinacionesDistintas(cuadricula(), (c) => c.precioSede).size).toBe(0);
  });
});

describe("describirCambio: qué va a cambiar", () => {
  const base = { cifra: "precio" as const, valeEn: "todas" as const, sede: "Trujillo" };

  it("una sola combinación (el texto de la maqueta)", () => {
    const todas = cuadricula();
    const d = describirCambio({ ...base, todas, destinos: todas.filter((c) => c.varianteId === "v-Negro-M"), valor: 109, antes: antesDe(todas) });
    expect(d.titulo).toBe("Cambia 1 precio:");
    expect(d.detalle).toBe(`Negro · M pasa de ${montoTexto(99)} a ${montoTexto(109)}. Las otras 11 combinaciones no se tocan.`);
    expect([d.cuantas, d.sinTocar]).toEqual([1, 11]);
  });

  it("todo un color: dice el color una vez, agrupa lo que pasa del mismo valor y avisa la que tenía un precio propio", () => {
    const todas = cuadricula((c) => (c.varianteId === "v-Negro-XL" ? { precioSede: 105, precioGeneral: 105 } : {}));
    const destinos = todas.filter((c) => c.color === "Negro");
    const d = describirCambio({ ...base, todas, destinos, valor: 109, antes: antesDe(todas) });
    expect(d.titulo).toBe("Cambian 4 precios de Negro:");
    expect(d.detalle).toBe(
      `S, M y L pasan de ${montoTexto(99)} a ${montoTexto(109)}, y XL pasa de ${montoTexto(105)} a ${montoTexto(109)} (tenía un precio propio). Las otras 8 no se tocan.`,
    );
  });

  it("toda una talla: dice la talla una vez y nombra los colores", () => {
    const todas = cuadricula();
    const d = describirCambio({ ...base, todas, destinos: todas.filter((c) => c.talla === "M"), valor: 109, antes: antesDe(todas) });
    expect(d.titulo).toBe("Cambian 3 precios de la talla M:");
    expect(d.detalle).toBe(`Negro, Azul marino y Beige pasan de ${montoTexto(99)} a ${montoTexto(109)}. Las otras 9 no se tocan.`);
  });

  it("todas: sin «las otras»; y las que ya valían eso no cuentan como cambio", () => {
    const todas = cuadricula((c) => (c.talla === "S" ? { precioSede: 109 } : {}));
    const d = describirCambio({ ...base, todas, destinos: todas, valor: 109, antes: antesDe(todas) });
    expect(d.cuantas).toBe(9);
    expect(d.sinTocar).toBe(3);
    expect(d.detalle).toContain("Las otras 3 no se tocan.");
    const nada = describirCambio({ ...base, todas, destinos: todas.filter((c) => c.talla === "S"), valor: 109, antes: antesDe(todas) });
    expect(nada).toMatchObject({ titulo: "No cambia nada:", cuantas: 0 });
    expect(nada.detalle).toBe(`Ya valen ${montoTexto(109)}.`);
  });

  it("la gramática: una sola que no se toca («La otra no se toca»), una sola que cambia en una prenda de dos", () => {
    const dos = cuadricula().slice(0, 2);
    const d = describirCambio({ ...base, todas: dos, destinos: [dos[0]], valor: 105, antes: antesDe(dos) });
    expect(d.detalle).toBe(`Negro · S pasa de ${montoTexto(99)} a ${montoTexto(105)}. La otra no se toca.`);
  });

  it("el costo habla de costo, y sin valor de antes dice que pasa a ese valor", () => {
    const todas = cuadricula((c) => (c.varianteId === "v-Negro-S" ? { costoHeredado: null } : {}));
    const d = describirCambio({ cifra: "costo", valeEn: "todas", sede: "Trujillo", todas, destinos: todas.filter((c) => c.color === "Negro"), valor: 50, antes: antesDe(todas, "costo") });
    expect(d.titulo).toBe("Cambian 4 costos de Negro:");
    expect(d.detalle).toBe(`S pasa a ${montoTexto(50)}, y M, L y XL pasan de ${montoTexto(45)} a ${montoTexto(50)}. Las otras 8 no se tocan.`);
    expect(d.avisos).toEqual([]);
  });

  it("«todas las sedes»: avisa que una tienda con precio propio seguirá cobrando el suyo", () => {
    const todas = cuadricula((c) => (c.varianteId === "v-Negro-M" ? { precioSede: 95 } : {}));
    const uno = describirCambio({ ...base, todas, destinos: todas.filter((c) => c.varianteId === "v-Negro-M"), valor: 109, antes: antesDe(todas) });
    expect(uno.avisos).toEqual([`En Trujillo, Negro · M seguirá en ${montoTexto(95)}: tiene un precio propio ahí.`]);
    const muchas = cuadricula((c) => (c.color === "Negro" ? { precioSede: 95 } : {}));
    const varias = describirCambio({ ...base, todas: muchas, destinos: muchas.filter((c) => c.color === "Negro"), valor: 109, antes: antesDe(muchas) });
    expect(varias.avisos).toEqual(["En Trujillo, 4 de estas combinaciones seguirán con su precio propio."]);
    // Solo esta tienda no tiene ese aviso (lo que se escribe vale en esta tienda).
    expect(describirCambio({ ...base, valeEn: "sede", todas, destinos: todas.filter((c) => c.varianteId === "v-Negro-M"), valor: 109, antes: antesDe(todas) }).avisos).toEqual([]);
  });

  it("«solo esta tienda» con todas las tallas activas al mismo precio: avisa que queda como el precio de la prenda", () => {
    const todas = cuadricula();
    const entera = describirCambio({ ...base, valeEn: "sede", todas, destinos: todas, valor: 109, antes: antesDe(todas), totalActivas: 12 });
    expect(entera.avisos).toEqual(["Queda como el precio de la prenda en Trujillo: las tallas que lleguen después lo heredan."]);
    // Si la prenda tiene más tallas activas que las contadas, o no se sabe, quedan excepciones y no hay aviso.
    expect(describirCambio({ ...base, valeEn: "sede", todas, destinos: todas, valor: 109, antes: antesDe(todas), totalActivas: 14 }).avisos).toEqual([]);
    expect(describirCambio({ ...base, valeEn: "sede", todas, destinos: todas, valor: 109, antes: antesDe(todas) }).avisos).toEqual([]);
  });

  it("no toca lo que recibe", () => {
    const todas = Object.freeze(cuadricula().map((c) => Object.freeze(c)));
    const antes = Object.freeze(antesDe(todas));
    expect(() => describirCambio({ ...base, todas, destinos: todas.slice(0, 3), valor: 120, antes })).not.toThrow();
  });
});

describe("seraPrecioDePrendaEntera", () => {
  const dos = { a: 90, b: 90 };
  it("solo si se eligieron todas las tallas activas y valen lo mismo", () => {
    expect(seraPrecioDePrendaEntera(dos, 2)).toBe(true);
    expect(seraPrecioDePrendaEntera({ a: 90, b: 95 }, 2)).toBe(false);
    expect(seraPrecioDePrendaEntera({ a: 90 }, 2)).toBe(false);
    expect(seraPrecioDePrendaEntera(dos, 3)).toBe(false);
    expect(seraPrecioDePrendaEntera(dos, null)).toBe(false);
    expect(seraPrecioDePrendaEntera({}, 0)).toBe(false);
  });
});

describe("textoDeRango (la fila de la prenda)", () => {
  it("un valor, un rango, o nada", () => {
    expect(textoDeRango([45, 45])).toBe(`S/${" "}45.00`);
    expect(textoDeRango([45, 52, null])).toBe(`S/${" "}45.00 – 52.00`);
    expect(textoDeRango([null])).toBeNull();
    expect(textoDeRango([])).toBeNull();
  });
});

describe("costosParaLinea: lo que se manda como costos_prendas", () => {
  const cs = cuadricula();
  const prendas = [{ productoId: "p1", combinaciones: cs }];

  it("sin nada escrito, nada; lo escrito igual a lo que ya heredaba, tampoco", () => {
    expect(costosParaLinea(prendas, {})).toEqual({});
    expect(costosParaLinea(prendas, { "v-Negro-S": 45 })).toEqual({});
  });

  it("una combinación con su costo: se manda por su variante_id", () => {
    expect(costosParaLinea(prendas, { "v-Negro-S": 52 })).toEqual({ "v-Negro-S": 52 });
  });

  it("el mismo costo en TODAS las combinaciones de la prenda: se manda el de la prenda (lo que se detalle después lo hereda)", () => {
    const todo = ponerCosto({}, ids(cs), 50);
    expect(costosParaLinea(prendas, todo)).toEqual({ p1: 50 });
  });

  it("casi todas con el mismo costo, o costos distintos: una por una", () => {
    const casi = ponerCosto({}, ids(cs).slice(1), 50);
    expect(Object.keys(costosParaLinea(prendas, casi))).toHaveLength(11);
    const distintos = ponerCosto(ponerCosto({}, ids(cs).slice(0, 6), 50), ids(cs).slice(6), 60);
    expect(Object.keys(costosParaLinea(prendas, distintos))).toHaveLength(12);
  });

  it("varias prendas de la línea, cada una con lo suyo", () => {
    const otra = [{ varianteId: "o-1", color: "Rojo", talla: "S", cantidad: 1, precioGeneral: 50, precioSede: 50, costoHeredado: 20 }];
    const r = costosParaLinea([...prendas, { productoId: "p2", combinaciones: otra }], { "v-Beige-XL": 41, "o-1": 22 });
    expect(r).toEqual({ "v-Beige-XL": 41, p2: 22 });
  });
});

describe("llamadasDePrecio: lo que se manda a la base", () => {
  const cs = cuadricula((c) => (c.varianteId === "v-Beige-S" ? { precioGeneral: 99, precioSede: 105 } : {}));
  const prendas = [{ productoId: "p1", combinaciones: cs }];

  it("nada escrito, o escrito igual a lo que se cobra hoy, no hace llamada", () => {
    expect(llamadasDePrecio(prendas, {})).toEqual([]);
    expect(llamadasDePrecio(prendas, ponerPrecio({}, ["v-Negro-M"], 99, "todas"))).toEqual([]);
    expect(llamadasDePrecio(prendas, ponerPrecio({}, ["v-Beige-S"], 105, "sede"))).toEqual([]);
  });

  it("separa por dónde vale: una llamada de «todas las sedes» y otra de «solo esta tienda»", () => {
    const cambios = ponerPrecio(ponerPrecio({}, ["v-Negro-M", "v-Negro-L"], 109, "todas"), ["v-Beige-M"], 95, "sede");
    expect(llamadasDePrecio(prendas, cambios)).toEqual([
      { productoId: "p1", alcance: "todas", precios: { "v-Negro-M": 109, "v-Negro-L": 109 } },
      { productoId: "p1", alcance: "sede", precios: { "v-Beige-M": 95 } },
    ]);
  });

  it("«todas las sedes» se compara con el precio general; «solo esta tienda», con el que se cobra en la tienda", () => {
    // Beige · S vale 99 en general y 105 en la tienda: escribir 105 «para todas» cambia el general; escribir 105 «solo aquí» no cambia nada.
    expect(llamadasDePrecio(prendas, ponerPrecio({}, ["v-Beige-S"], 105, "todas"))).toHaveLength(1);
    expect(llamadasDePrecio(prendas, ponerPrecio({}, ["v-Beige-S"], 105, "sede"))).toEqual([]);
  });

  it("todas las tallas al mismo precio, aunque alguna ya lo valiera: van todas (así sigue siendo el precio de la prenda)", () => {
    const solo = cs.filter((c) => c.color === "Negro");
    const p = [{ productoId: "p1", combinaciones: solo }];
    const cambios = ponerPrecio(ponerPrecio({}, ["v-Negro-S"], 99, "sede"), ["v-Negro-M", "v-Negro-L", "v-Negro-XL"], 109, "sede");
    const [llamada] = llamadasDePrecio(p, cambios);
    expect(Object.keys(llamada.precios)).toHaveLength(4);
    expect(seraPrecioDePrendaEntera(llamada.precios, 4)).toBe(false); // valores distintos (99 y 109): excepciones
    const todos = llamadasDePrecio(p, ponerPrecio({}, ids(solo), 109, "sede"))[0];
    expect(seraPrecioDePrendaEntera(todos.precios, 4)).toBe(true);
  });

  it("varias prendas: una llamada por prenda", () => {
    const otra = [{ varianteId: "o-1", color: "Rojo", talla: "S", cantidad: 1, precioGeneral: 50, precioSede: 50, costoHeredado: 20 }];
    const llamadas = llamadasDePrecio([...prendas, { productoId: "p2", combinaciones: otra }], ponerPrecio(ponerPrecio({}, ["v-Negro-S"], 120, "todas"), ["o-1"], 60, "todas"));
    expect(llamadas.map((l) => l.productoId)).toEqual(["p1", "p2"]);
  });
});

describe("etiquetaDe", () => {
  it("«Negro · M»; sin color o sin talla lo dice", () => {
    expect(etiquetaDe({ color: "Negro", talla: "M" })).toBe("Negro · M");
    expect(etiquetaDe({ color: null, talla: null })).toBe("Sin color · Única");
  });
});
