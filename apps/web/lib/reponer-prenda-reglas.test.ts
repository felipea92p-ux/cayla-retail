import { describe, it, expect } from "vitest";
import {
  acotarCantidad,
  detalleDeLoBajado,
  filasDelSelector,
  leerCantidadTecleada,
  lineasDeReponer,
  nombreDePrendaParaReponer,
  sePuedeBajarTalla,
  tallasParaReponer,
  textoBotonReponer,
  textoFilaSinAlcance,
  totalAReponer,
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
    expect(t).toEqual({ varianteId: "x", talla: "Única", piso: 0, almacen: 0 });
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

describe("lineasDeReponer: lo que viaja a bajar_al_piso", () => {
  const tallas = tallasParaReponer([S, M, L]);

  it("solo las tallas con algo elegido, en el orden de la curva, y la S y la M van JUNTAS en una sola llamada", () => {
    const lineas = lineasDeReponer(tallas, { [M.varianteId]: 2, [S.varianteId]: 1 });
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
    expect(lineasDeReponer(tallas, {})).toEqual([]);
    expect(lineasDeReponer(tallas, { [S.varianteId]: 0 })).toEqual([]);
  });

  it("una talla sin stock atrás no viaja aunque llegue una cifra (defensa: la base la rechazaría y tumbaría TODA la bajada)", () => {
    expect(lineasDeReponer(tallas, { [L.varianteId]: 2 })).toEqual([]);
  });

  it("una cifra por encima de lo libre se recorta al tope, nunca se envía de más", () => {
    expect(lineasDeReponer(tallas, { [S.varianteId]: 9 })).toEqual([{ varianteId: S.varianteId, cantidad: 1 }]);
  });
});

describe("los textos", () => {
  it("el botón dice cuánto baja; tras un corte de red pide confirmar lo mismo de nuevo", () => {
    expect(textoBotonReponer(0, false)).toBe("Bajar al piso");
    expect(textoBotonReponer(1, false)).toBe("Bajar 1 prenda");
    expect(textoBotonReponer(3, false)).toBe("Bajar 3 prendas");
    expect(textoBotonReponer(3, true)).toBe(BOTON_CONFIRMAR_DE_NUEVO);
  });

  it("la prenda se nombra como la tienda, sin código", () => {
    expect(nombreDePrendaParaReponer({ referencia: "Body Bonita", color: "Beige" })).toBe("Body Bonita · Beige");
    expect(nombreDePrendaParaReponer({ referencia: "Body Bonita", color: null })).toBe("Body Bonita");
    expect(nombreDePrendaParaReponer({ referencia: "Body Bonita", color: "  " })).toBe("Body Bonita");
  });

  it("el aviso de éxito detalla talla por talla", () => {
    const tallas = tallasParaReponer([S, M]);
    expect(detalleDeLoBajado(tallas, [{ varianteId: S.varianteId, cantidad: 1 }, { varianteId: M.varianteId, cantidad: 2 }])).toBe("S 1 · M 2");
  });

  it("si la base dice que ya no hay tanto, la fila lo dice en voz de tienda", () => {
    expect(textoFilaSinAlcance(0, "sin_alcance")).toBe("Ya no queda nada libre en el almacén.");
    expect(textoFilaSinAlcance(1, "sin_alcance")).toBe("Solo queda 1 libre en el almacén.");
    expect(textoFilaSinAlcance(2, "sin_alcance")).toBe("Solo quedan 2 libres en el almacén.");
    expect(textoFilaSinAlcance(0, "archivada")).toMatch(/archivada/);
  });
});

describe("filasDelSelector: la misma lista, con el lado que manda según el rumbo", () => {
  const tallas = tallasParaReponer([S, L]); // S: piso 0, almacén 1 · L: piso 3, almacén 0

  it("al BAJAR manda el almacén: el tope es lo que hay atrás y la cifra principal es la del almacén", () => {
    const [s, l] = filasDelSelector(tallas, "bajar");
    expect(s).toEqual({ varianteId: S.varianteId, talla: "S", tope: 1, principal: "1 en almacén", secundaria: "Nada en el piso" });
    expect(l).toEqual({ varianteId: L.varianteId, talla: "L", tope: 0, principal: "Nada en almacén", secundaria: "3 en el piso" });
  });

  it("al SUBIR manda el piso: la talla con prendas colgadas se puede subir y la que no tiene nada en el piso no", () => {
    const [s, l] = filasDelSelector(tallas, "subir");
    expect(s).toEqual({ varianteId: S.varianteId, talla: "S", tope: 0, principal: "Nada en el piso", secundaria: "1 en almacén" });
    expect(l).toEqual({ varianteId: L.varianteId, talla: "L", tope: 3, principal: "3 en el piso", secundaria: "Nada en almacén" });
  });
});
