import { describe, expect, it } from "vitest";
import { conRebajaCts, cuentaDelPrecio, IGV, pierdeConElPrecio } from "./cuenta-de-precio";
import {
  CASILLAS_DE_FABRICA,
  eleccionDeRasgos,
  eleccionParaGuardar,
  leerApagadas,
  leerEleccionGuardada,
  leerReglas,
  leerReglasYListas,
  rasgosEfectivos,
  margenObjetivo,
  MARGEN_TOPE,
  precioConMargen,
  problemaDeCasilla,
  problemaDeReglas,
  puntosPorCasilla,
  rebajaQueAguanta,
  REGLAS_DE_FABRICA,
  sugerirPrecio,
  type ReglasDePrecio,
} from "./margen-por-rasgos";

// ADR-0700. Los casos de la maqueta (https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx): blusa de S/ 30.90 en Trujillo, parecidas a S/ 52.90.
// Desde 20261124201000 las casillas son una lista que edita el Admin; la de fábrica trae seis, a +3 % cada una.

const conBase = (margenBase: number, casillas = CASILLAS_DE_FABRICA): ReglasDePrecio => ({ margenBase, casillas });
/** Las de fábrica con otros puntos (las que no se nombran quedan en 3). */
const conPuntos = (margenBase: number, puntos: Record<string, number>): ReglasDePrecio =>
  conBase(margenBase, CASILLAS_DE_FABRICA.map((c) => ({ ...c, puntos: puntos[c.codigo] ?? c.puntos })));
/** Las cuatro de la maqueta: las tres de quien compra y la marca. */
const CUATRO = ["nadie_la_tiene", "en_tendencia", "tela_que_se_nota", "marca_conocida"];
const TODAS = CASILLAS_DE_FABRICA.map((c) => c.codigo);
/** El margen sin redondear sobre el precio sin IGV: la definición. */
const margenExacto = (costo: number, precio: number) => (precio / IGV - costo) / (precio / IGV);

describe("leerReglas: lo que manda la base, o la regla de fábrica", () => {
  it("lee la base y la lista de casillas, en su orden", () => {
    const r = leerReglas({
      margen_base: 33,
      casillas: [
        { codigo: "hecha_a_mano", nombre: "Hecha a mano", ayuda: "Crochet o bordado a mano.", puntos: 4, origen: "a_mano", orden: 70 },
        { codigo: "tela_que_se_nota", nombre: "Tela que se nota", ayuda: null, puntos: 2, origen: "por_tejido", orden: 30 },
      ],
    });
    expect(r).toEqual({
      margenBase: 33,
      casillas: [
        { codigo: "hecha_a_mano", nombre: "Hecha a mano", ayuda: "Crochet o bordado a mano.", puntos: 4, origen: "a_mano" },
        { codigo: "tela_que_se_nota", nombre: "Tela que se nota", ayuda: null, puntos: 2, origen: "por_tejido" },
      ],
    });
  });
  it("una casilla rota o repetida se salta; una lista vacía es «sin casillas» (el Admin las apagó todas)", () => {
    const r = leerReglas({
      margen_base: 37,
      casillas: [
        { codigo: "Mal Código", nombre: "x", puntos: 3, origen: "a_mano" },
        { codigo: "en_tendencia", nombre: "En tendencia", puntos: 11, origen: "a_mano" },
        { codigo: "nadie_la_tiene", nombre: "Nadie la tiene", puntos: 3, origen: "otro" },
        { codigo: "detalle_de_diseno", nombre: "Detalle de diseño", puntos: 3, origen: "a_mano" },
        { codigo: "detalle_de_diseno", nombre: "Otra vez", puntos: 1, origen: "a_mano" },
      ],
    });
    expect(r.casillas.map((c) => c.codigo)).toEqual(["detalle_de_diseno"]);
    expect(leerReglas({ margen_base: 37, casillas: [] })).toEqual({ margenBase: 37, casillas: [] });
  });
  it("con la función de antes (solo `puntos`): las de fábrica que nombra, con sus puntos", () => {
    const r = leerReglas({ margen_base: 33, puntos: { nadie_la_tiene: 4, en_tendencia: 5, tela_que_se_nota: 2, marca_conocida: 0 } });
    expect(r.margenBase).toBe(33);
    expect(r.casillas.map((c) => [c.codigo, c.puntos])).toEqual([["nadie_la_tiene", 4], ["en_tendencia", 5], ["tela_que_se_nota", 2], ["marca_conocida", 0]]);
  });
  it("sin respuesta o con un dato roto, toma el de fábrica (37 % y seis casillas de +3)", () => {
    expect(leerReglas(null)).toEqual(REGLAS_DE_FABRICA);
    expect(leerReglas({ margen_base: "36", puntos: { nadie_la_tiene: 2.5 } })).toEqual(REGLAS_DE_FABRICA);
    expect(REGLAS_DE_FABRICA.casillas).toHaveLength(6);
  });
  it("las apagadas se leen aparte; los puntos viajan por código", () => {
    expect(leerApagadas({ apagadas: [{ codigo: "en_tendencia", nombre: "En tendencia", puntos: 3, origen: "a_mano" }, { codigo: 1 }] }).map((c) => c.codigo)).toEqual(["en_tendencia"]);
    expect(leerApagadas(null)).toEqual([]);
    expect(puntosPorCasilla(conPuntos(37, { en_tendencia: 5 }))).toMatchObject({ en_tendencia: 5, nadie_la_tiene: 3 });
  });
});

describe("problemaDeReglas: los mismos candados que la base", () => {
  it("la de fábrica se puede guardar", () => expect(problemaDeReglas(REGLAS_DE_FABRICA)).toBeNull());
  it("base fuera de 20–60, puntos fuera de 0–10 y el tope de 75 %", () => {
    expect(problemaDeReglas(conBase(19))).toMatch(/de 20 a 60/);
    expect(problemaDeReglas(conBase(36.5))).toMatch(/de 20 a 60/);
    expect(problemaDeReglas(conPuntos(36, { en_tendencia: 11 }))).toBe("«En tendencia» suma de 0 a 10 %.");
    expect(problemaDeReglas(conBase(58))).toMatch(/75 %/);
    expect(problemaDeReglas(conBase(57))).toBeNull();
  });
});

describe("problemaDeCasilla: agregar, renombrar o apagar una casilla", () => {
  const nueva = (nombre: string, puntos = 3, activa = true) => ({ codigo: null, nombre, puntos, activa });
  it("una casilla nueva bien escrita se puede guardar", () => expect(problemaDeCasilla(REGLAS_DE_FABRICA, nueva("Hecha a mano"))).toBeNull());
  it("el nombre: de 2 a 40 letras, y sin repetir otra (sin mirar mayúsculas ni espacios)", () => {
    expect(problemaDeCasilla(REGLAS_DE_FABRICA, nueva(" A "))).toMatch(/de 2 a 40/);
    expect(problemaDeCasilla(REGLAS_DE_FABRICA, nueva("x".repeat(41)))).toMatch(/de 2 a 40/);
    expect(problemaDeCasilla(REGLAS_DE_FABRICA, nueva("  en   TENDENCIA "))).toBe("Ya hay una casilla «En tendencia».");
    expect(problemaDeCasilla(REGLAS_DE_FABRICA, { codigo: "en_tendencia", nombre: "En tendencia", puntos: 4, activa: true })).toBeNull();
  });
  it("los puntos de 0 a 10, y con todas no se pasa de 75 % (una apagada no cuenta)", () => {
    expect(problemaDeCasilla(REGLAS_DE_FABRICA, nueva("Hecha a mano", 11))).toBe("Cada casilla suma de 0 a 10 %.");
    expect(problemaDeCasilla(conBase(55), nueva("Hecha a mano", 3))).toMatch(/75 %/);
    expect(problemaDeCasilla(conBase(55), nueva("Hecha a mano", 2))).toBeNull();
    expect(problemaDeCasilla(conBase(55), nueva("Hecha a mano", 9, false))).toBeNull();
  });
});

describe("margenObjetivo: la base más lo que la prenda tiene", () => {
  it("cada casilla suma sus puntos una sola vez", () => {
    expect(margenObjetivo(REGLAS_DE_FABRICA, [])).toBe(37);
    expect(margenObjetivo(REGLAS_DE_FABRICA, ["en_tendencia", "en_tendencia"])).toBe(40);
    expect(margenObjetivo(REGLAS_DE_FABRICA, TODAS)).toBe(55);
  });
  it("una casilla que ya no está en la lista (apagada) no suma", () => {
    expect(margenObjetivo(REGLAS_DE_FABRICA, ["hecha_a_mano"])).toBe(37);
    expect(margenObjetivo(conBase(37, CASILLAS_DE_FABRICA.filter((c) => c.codigo !== "en_tendencia")), ["en_tendencia", "nadie_la_tiene"])).toBe(40);
  });
  it("nunca pasa del tope", () => {
    expect(margenObjetivo(conPuntos(70, Object.fromEntries(TODAS.map((c) => [c, 10]))), TODAS)).toBe(MARGEN_TOPE);
  });
});

describe("precioConMargen: el .90 más bajo que deja ese margen", () => {
  it("los casos de la maqueta", () => {
    expect(precioConMargen(30.9, 33)).toBe(54.9);
    expect(precioConMargen(30.9, 36)).toBe(57.9);
    expect(precioConMargen(30.9, 42)).toBe(62.9);
    expect(precioConMargen(21.6, 33)).toBe(38.9);
    expect(precioConMargen(39.2, 33)).toBe(69.9);
    expect(precioConMargen(57.9, 39)).toBe(112.9);
  });
  it("de S/ 1 a S/ 500 y en cada margen: termina en .90, deja el margen y el .90 de abajo no", () => {
    for (let c = 100; c <= 50_000; c += 137) {
      const costo = c / 100;
      for (const m of [0, 20, 30, 33, 36, 45, 60, 75]) {
        const p = precioConMargen(costo, m);
        if (p === null) continue;
        expect(Math.round(p * 100) % 100).toBe(90);
        expect(margenExacto(costo, p)).toBeGreaterThanOrEqual(m / 100 - 1e-12);
        if (p > 1) expect(margenExacto(costo, p - 1)).toBeLessThan(m / 100);
      }
    }
  });
  it("sin costo, con margen imposible o sobre el tope de la base, no hay precio", () => {
    expect(precioConMargen(0, 36)).toBeNull();
    expect(precioConMargen(30.9, 100)).toBeNull();
    expect(precioConMargen(30.9, 36.5)).toBeNull();
    expect(precioConMargen(4000, 36)).toBeNull();
  });
});

describe("sugerirPrecio: la regla, las parecidas, el techo de afuera y nunca perder", () => {
  const blusa = { costo: 30.9, reglas: conBase(33) };
  it("sin casillas: la base", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: [] })).toMatchObject({ precio: 54.9, regla: 54.9, margen: 33, motivo: "regla", techo: null });
  });
  it("con las tres casillas de quien compra y la marca: 45 %", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: CUATRO })).toMatchObject({ precio: 66.9, margen: 45, motivo: "regla" });
  });
  it("si las parecidas se venden a más, se sugiere ese precio", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: [], parecidas: 59.9 })).toMatchObject({ precio: 59.9, regla: 54.9, motivo: "parecidas" });
    expect(sugerirPrecio({ ...blusa, rasgos: [], parecidas: 52.9 })).toMatchObject({ precio: 54.9, motivo: "regla" });
  });
  it("el precio visto afuera es un techo: queda en el .90 justo debajo", () => {
    expect(sugerirPrecio({ ...blusa, rasgos: CUATRO, afuera: 60 })).toMatchObject({ precio: 59.9, regla: 66.9, techo: 59.9, motivo: "afuera" });
    expect(sugerirPrecio({ ...blusa, rasgos: CUATRO, afuera: 59.9 })).toMatchObject({ precio: 58.9, techo: 58.9 });
    expect(sugerirPrecio({ ...blusa, rasgos: [], afuera: 90 })).toMatchObject({ precio: 54.9, techo: 89.9, motivo: "regla" });
  });
  it("pero nunca un precio que pierde", () => {
    const r = sugerirPrecio({ ...blusa, rasgos: [], afuera: 30 });
    expect(r).toMatchObject({ precio: 36.9, desde: 36.9, motivo: "pierdes" });
    expect(pierdeConElPrecio(36.9, 30.9)).toBe(false);
    expect(pierdeConElPrecio(35.9, 30.9)).toBe(true);
  });
  it("«desde» es siempre el primer .90 que no pierde, con la cuenta de «Te quedan»", () => {
    for (let c = 100; c <= 50_000; c += 211) {
      const costo = c / 100;
      const r = sugerirPrecio({ costo, reglas: REGLAS_DE_FABRICA, rasgos: [] });
      if (!r) continue;
      expect(pierdeConElPrecio(r.desde, costo)).toBe(false);
      if (r.desde > 1) expect(pierdeConElPrecio(Math.round((r.desde - 1) * 100) / 100, costo)).toBe(true);
    }
  });
  it("sin costo no sugiere", () => expect(sugerirPrecio({ costo: 0, reglas: REGLAS_DE_FABRICA, rasgos: [] })).toBeNull());
});

describe("rebajaQueAguanta: la rebaja más grande sin perder", () => {
  it("con 33 % de margen aguanta 33 %, no la rebaja de 35 % de caja", () => {
    expect(rebajaQueAguanta(30.9, 54.9)).toBe(33);
    expect(cuentaDelPrecio(30.9, conRebajaCts(5490, 35) / 100)!.teQuedan).toBeLessThan(0);
  });
  it("con todas las casillas (45 %) aguanta la de 35 %", () => {
    expect(rebajaQueAguanta(30.9, 66.9)).toBeGreaterThanOrEqual(35);
  });
  it("esa rebaja no pierde y la siguiente sí, en todo costo y precio", () => {
    for (let c = 500; c <= 30_000; c += 523) {
      const costo = c / 100;
      for (const m of [20, 36, 48, 60]) {
        const precio = precioConMargen(costo, m);
        if (precio === null) continue;
        const d = rebajaQueAguanta(costo, precio)!;
        expect(pierdeConElPrecio(conRebajaCts(Math.round(precio * 100), d) / 100, costo)).toBe(false);
        expect(pierdeConElPrecio(conRebajaCts(Math.round(precio * 100), d + 1) / 100, costo)).toBe(true);
      }
    }
  });
});

describe("lo que la prenda tiene: lo marcado, la tela por su tejido y la marca por la lista", () => {
  const auto = (tejidoSeNota: boolean, marcaConocida: boolean) => ({ tejidoSeNota, marcaConocida });
  const efectivos = (e: Record<string, boolean | undefined>, a = auto(false, false)) => rasgosEfectivos(e, CASILLAS_DE_FABRICA, a);
  it("en el orden de la hoja, sin importar el orden en que se marcó", () => {
    expect(efectivos({ detalle_de_diseno: true, en_tendencia: true, nadie_la_tiene: true }, auto(false, true))).toEqual([
      "nadie_la_tiene",
      "en_tendencia",
      "detalle_de_diseno",
      "marca_conocida",
    ]);
  });
  it("la tela llega por el tejido, y la persona puede quitarla o ponerla", () => {
    expect(efectivos({}, auto(true, false))).toEqual(["tela_que_se_nota"]);
    expect(efectivos({ tela_que_se_nota: false }, auto(true, false))).toEqual([]);
    expect(efectivos({ tela_que_se_nota: true })).toEqual(["tela_que_se_nota"]);
  });
  it("la marca no se marca a mano: solo la lista la pone", () => {
    expect(efectivos({ marca_conocida: true })).toEqual([]);
    expect(efectivos({}, auto(false, true))).toEqual(["marca_conocida"]);
  });
  it("lo marcado de una casilla que ya no está prendida no cuenta", () => {
    expect(rasgosEfectivos({ en_tendencia: true, hecha_a_mano: true }, CASILLAS_DE_FABRICA.filter((c) => c.codigo !== "en_tendencia"), auto(false, false))).toEqual([]);
  });
  it("de vuelta a lo marcado: corregir una línea no pierde nada", () => {
    const guardado = efectivos({ nadie_la_tiene: true, tela_que_se_nota: true, acabado_y_confeccion: true });
    expect(efectivos(eleccionDeRasgos(guardado))).toEqual(guardado);
  });
  it("la regla y las listas como las manda la base; lo roto, vacío", () => {
    expect(leerReglasYListas({ margen_base: 37, marcas_conocidas: ["m1", 3], tejidos_que_se_notan: null })).toMatchObject({
      reglas: { margenBase: 37 },
      marcasConocidas: ["m1"],
      tejidosQueSeNotan: [],
    });
  });
});

describe("lo que se guarda de una prenda en Catálogo (20261124201000: dos listas)", () => {
  const guardar = (e: Record<string, boolean | undefined>) => eleccionParaGuardar(e, CASILLAS_DE_FABRICA);
  it("sin decidir nada no hay nada que guardar; la tela sin tocar no viaja (sigue a su tejido)", () => {
    expect(guardar({})).toBeNull();
    expect(guardar({ nadie_la_tiene: undefined })).toBeNull();
    expect(guardar({ nadie_la_tiene: true })).toEqual({ p_marcados: ["nadie_la_tiene"], p_quitados: [] });
    expect(guardar({ tela_que_se_nota: false })).toEqual({ p_marcados: [], p_quitados: ["tela_que_se_nota"] });
    // Desmarcar sí se guarda (vacío): la persona la tocó.
    expect(guardar({ en_tendencia: false })).toEqual({ p_marcados: [], p_quitados: [] });
  });
  it("la marca nunca viaja, y lo de una casilla apagada tampoco (la base lo conserva)", () => {
    expect(guardar({ marca_conocida: true, hecha_a_mano: true, detalle_de_diseno: true })).toEqual({ p_marcados: ["detalle_de_diseno"], p_quitados: [] });
  });
  it("lo guardado vuelve como lo decidido, y la vuelta completa no cambia nada", () => {
    expect(leerEleccionGuardada({ marcados: ["nadie_la_tiene"], quitados: ["tela_que_se_nota"] })).toEqual({ nadie_la_tiene: true, tela_que_se_nota: false });
    expect(leerEleccionGuardada({ marcados: ["tela_que_se_nota"], quitados: ["tela_que_se_nota"] })).toEqual({ tela_que_se_nota: true });
    expect(leerEleccionGuardada(null)).toEqual({});
    expect(leerEleccionGuardada([1])).toEqual({});
    const guardado = { p_marcados: ["nadie_la_tiene", "acabado_y_confeccion"], p_quitados: ["tela_que_se_nota"] };
    expect(guardar(leerEleccionGuardada({ marcados: ["acabado_y_confeccion", "nadie_la_tiene"], quitados: ["tela_que_se_nota"] }))).toEqual(guardado);
  });
});
