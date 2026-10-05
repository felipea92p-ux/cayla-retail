import { describe, it, expect } from "vitest";
import {
  acotarCantidad,
  columnasDeTallas,
  coloresConAlgo,
  coloresParaMover,
  detalleDeLoMovido,
  leerCantidadTecleada,
  lineasDeMover,
  lineasDeMoverModelo,
  sePuedeBajarTalla,
  tallasParaReponer,
  textoBotonReponer,
  textoFilaSinAlcance,
  topeDeTalla,
  totalAReponer,
  totalesDeMatriz,
  tallaDelColor,
} from "./reponer-prenda-reglas";
import { argumentosDeBajada, BOTON_CONFIRMAR_DE_NUEVO } from "./bajada-reglas";

// El caso de la captura de Felipe (2026-10-01): Body Bonita · Beige en TRU, con la S y la M por colgar (0 en el piso).
const S = { varianteId: "bonita-beige-s", talla: "S", pisoDisponible: 0, almacenDisponible: 1 };
const M = { varianteId: "bonita-beige-m", talla: "M", pisoDisponible: 0, almacenDisponible: 2 };
const L = { varianteId: "bonita-beige-l", talla: "L", pisoDisponible: 3, almacenDisponible: 0 };

describe("tallasParaReponer: la ventana ve TODAS las tallas, no una", () => {
  it("lista la S y la M (antes solo aparecía la S) y también la que no tiene nada atrás", () => {
    const t = tallasParaReponer([S, M, L]);
    expect(t.map((x) => x.talla)).toEqual(["S", "M", "L"]);
    expect(t.map(sePuedeBajarTalla)).toEqual([true, true, false]);
  });

  it("no inventa cifras: un nulo (tienda que no separa piso y almacén) es 0, y una talla sin nombre es «Única»", () => {
    const [t] = tallasParaReponer([{ varianteId: "x", talla: null, pisoDisponible: null, almacenDisponible: null }]);
    expect(t).toEqual({ varianteId: "x", talla: "Única", piso: 0, almacen: 0, requisito: 0 });
  });

  it("una cifra negativa (stock y libro que no cuadran) nunca ofrece bajar", () => {
    const [t] = tallasParaReponer([{ varianteId: "x", talla: "S", pisoDisponible: -2, almacenDisponible: -1 }]);
    expect(t.piso).toBe(0);
    expect(sePuedeBajarTalla(t)).toBe(false);
  });
});

describe("cantidades: el selector no deja pedir lo imposible", () => {
  it("el tope es lo libre en el almacén y el piso es cero", () => {
    expect(acotarCantidad(5, 2)).toBe(2);
    expect(acotarCantidad(-1, 2)).toBe(0);
    expect(acotarCantidad(1.9, 2)).toBe(1);
    expect(acotarCantidad(Number.NaN, 2)).toBe(0);
    expect(acotarCantidad(3, 0)).toBe(0);
  });

  it("lo tecleado: vacío y letras son cero, y nunca pasa del tope", () => {
    expect(leerCantidadTecleada("", 4)).toBe(0);
    expect(leerCantidadTecleada("abc", 4)).toBe(0);
    expect(leerCantidadTecleada("3", 4)).toBe(3);
    expect(leerCantidadTecleada("99", 4)).toBe(4);
    expect(leerCantidadTecleada("-2", 4)).toBe(2); // el guion se ignora: «−» es el botón, no el teclado
  });
});

describe("lineasDeMover (bajar): lo que viaja a bajar_al_piso", () => {
  const tallas = tallasParaReponer([S, M, L]);

  it("solo las tallas con algo elegido, en el orden de la curva, y la S y la M van JUNTAS en una sola llamada", () => {
    const lineas = lineasDeMover(tallas, { [M.varianteId]: 2, [S.varianteId]: 1 }, "bajar");
    expect(lineas).toEqual([
      { varianteId: S.varianteId, cantidad: 1 },
      { varianteId: M.varianteId, cantidad: 2 },
    ]);
    expect(totalAReponer(lineas)).toBe(3);
    const args = argumentosDeBajada("tru", lineas, "marca");
    expect(args.p_items).toHaveLength(2);
    expect(args.p_token).toBe("marca");
  });

  it("sin nada elegido no hay líneas (el botón queda apagado)", () => {
    expect(lineasDeMover(tallas, {}, "bajar")).toEqual([]);
    expect(lineasDeMover(tallas, { [S.varianteId]: 0 }, "bajar")).toEqual([]);
  });

  it("una talla sin stock atrás no viaja aunque llegue una cifra (defensa: la base la rechazaría y tumbaría TODA la bajada)", () => {
    expect(lineasDeMover(tallas, { [L.varianteId]: 2 }, "bajar")).toEqual([]);
  });

  it("una cifra por encima de lo libre se recorta al tope, nunca se envía de más", () => {
    expect(lineasDeMover(tallas, { [S.varianteId]: 9 }, "bajar")).toEqual([{ varianteId: S.varianteId, cantidad: 1 }]);
  });
});

describe("los textos", () => {
  it("el botón dice cuánto baja; tras un corte de red pide confirmar lo mismo de nuevo", () => {
    expect(textoBotonReponer(0, false)).toBe("Bajar al piso");
    expect(textoBotonReponer(1, false)).toBe("Bajar 1 prenda");
    expect(textoBotonReponer(3, false)).toBe("Bajar 3 prendas");
    expect(textoBotonReponer(3, true)).toBe(BOTON_CONFIRMAR_DE_NUEVO);
  });



  it("si la base dice que ya no hay tanto, la fila lo dice en voz de tienda", () => {
    expect(textoFilaSinAlcance(0, "sin_alcance")).toBe("Ya no queda nada libre en el almacén.");
    expect(textoFilaSinAlcance(1, "sin_alcance")).toBe("Solo queda 1 libre en el almacén.");
    expect(textoFilaSinAlcance(2, "sin_alcance")).toBe("Solo quedan 2 libres en el almacén.");
    expect(textoFilaSinAlcance(0, "archivada")).toMatch(/archivada/);
  });
});

// El caso de Felipe (2026-10-03): Polo básico en tres colores. Azul y negro con las cuatro tallas, blanco sin la XL.
const fila = (varianteId: string, talla: string, piso: number, almacen: number) => ({ varianteId, talla, pisoDisponible: piso, almacenDisponible: almacen });
const polo = [
  { referencia: "Polo básico", color: "Azul", colorHex: "#2b5a9b", tallas: [fila("az-s", "S", 0, 6), fila("az-m", "M", 1, 8), fila("az-l", "L", 0, 5), fila("az-xl", "XL", 2, 1)] },
  { referencia: "Polo básico", color: "Blanco", colorHex: "#f1ede4", tallas: [fila("bl-s", "S", 0, 4), fila("bl-m", "M", 3, 7), fila("bl-l", "L", 0, 3)] },
  { referencia: "Polo básico", color: "Negro", colorHex: "#222220", tallas: [fila("ne-s", "S", 1, 9), fila("ne-m", "M", 0, 10), fila("ne-l", "L", 0, 6), fila("ne-xl", "XL", 1, 2)] },
];

describe("un MODELO con todos sus colores (ADR-0317)", () => {
  const colores = coloresParaMover(polo);

  it("cada color conserva su nombre y su orden, con una clave que no se repite", () => {
    expect(colores.map((c) => c.nombre)).toEqual(["Azul", "Blanco", "Negro"]);
    expect(new Set(colores.map((c) => c.clave)).size).toBe(3);
  });

  it("un color sin nombre se llama «Sin color» y no rompe la clave", () => {
    const [c] = coloresParaMover([{ referencia: "Bolso", color: null, colorHex: null, tallas: [fila("x", "S", 0, 1)] }]);
    expect(c.nombre).toBe("Sin color");
  });

  it("las columnas son las tallas de todos los colores, sin repetir y en curva", () => {
    expect(columnasDeTallas(colores)).toEqual(["S", "M", "L", "XL"]);
  });

  it("una talla que solo tiene un color igual sale en la curva, aunque entre antes en la lista", () => {
    const raro = coloresParaMover([
      { referencia: "X", color: "A", colorHex: null, tallas: [fila("a-m", "M", 0, 1), fila("a-l", "L", 0, 1)] },
      { referencia: "X", color: "B", colorHex: null, tallas: [fila("b-xs", "XS", 0, 1), fila("b-m", "M", 0, 1)] },
    ]);
    expect(columnasDeTallas(raro)).toEqual(["XS", "M", "L"]);
  });

  it("la celda de un color en una talla que no tiene es undefined (se dibuja vacía, no se inventa)", () => {
    expect(tallaDelColor(colores[1], "XL")).toBeUndefined();
    expect(tallaDelColor(colores[1], "M")?.varianteId).toBe("bl-m");
  });

  it("el tope depende del rumbo: el almacén al bajar, el piso al subir", () => {
    const m = tallaDelColor(colores[0], "M")!; // piso 1, almacén 8
    expect(topeDeTalla(m, "bajar")).toBe(8);
    expect(topeDeTalla(m, "subir")).toBe(1);
  });

  it("arranca en cero: sin elegir nada, ningún total ni ninguna línea (ADR-0231)", () => {
    const t = totalesDeMatriz(colores, {}, "bajar");
    expect(t.total).toBe(0);
    expect(Object.values(t.porColor)).toEqual([0, 0, 0]);
    expect(coloresConAlgo(colores, t)).toBe(0);
    expect(lineasDeMoverModelo(colores, {}, "bajar")).toEqual([]);
  });

  it("suma por color, por talla y en general, y la misma cuenta manda las líneas que viajan a la base", () => {
    const cantidades = { "az-s": 2, "az-m": 3, "bl-s": 2, "ne-s": 3, "ne-l": 2 };
    const t = totalesDeMatriz(colores, cantidades, "bajar");
    expect(t.porColor).toEqual({ [colores[0].clave]: 5, [colores[1].clave]: 2, [colores[2].clave]: 5 });
    expect(t.porTalla).toEqual({ S: 7, M: 3, L: 2, XL: 0 });
    expect(t.total).toBe(12);
    expect(coloresConAlgo(colores, t)).toBe(3);
    const lineas = lineasDeMoverModelo(colores, cantidades, "bajar");
    expect(totalAReponer(lineas)).toBe(t.total);
  });

  it("lo que pasa del tope se recorta igual en los totales y en las líneas (lo que se ve es lo que se envía)", () => {
    const cantidades = { "az-xl": 9, "bl-m": 99 }; // az-xl: almacén 1 · bl-m: almacén 7
    const t = totalesDeMatriz(colores, cantidades, "bajar");
    expect(t.total).toBe(8);
    expect(lineasDeMoverModelo(colores, cantidades, "bajar")).toEqual([
      { varianteId: "az-xl", cantidad: 1 },
      { varianteId: "bl-m", cantidad: 7 },
    ]);
  });

  it("al SUBIR cuenta contra el piso: la celda que no tiene nada libre en el piso no suma", () => {
    const t = totalesDeMatriz(colores, { "az-s": 4, "az-m": 4 }, "subir"); // az-s: piso 0 · az-m: piso 1
    expect(t.total).toBe(1);
  });

  it("el aviso dice qué se movió: «S 1 · M 2» con un color, y con el nombre del color cuando son varios", () => {
    const lineas = [
      { varianteId: "az-s", cantidad: 2 },
      { varianteId: "az-m", cantidad: 3 },
      { varianteId: "bl-s", cantidad: 2 },
    ];
    expect(detalleDeLoMovido(colores, lineas)).toBe("Azul S 2, M 3 · Blanco S 2");
    expect(detalleDeLoMovido([colores[0]], lineas)).toBe("S 2 · M 3");
  });
});
