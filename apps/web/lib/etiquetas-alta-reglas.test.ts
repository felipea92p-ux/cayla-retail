import { describe, expect, it } from "vitest";
import type { EtiquetaAlta } from "./alta-producto-datos";
import {
  claveEtiqueta,
  filtrarEtiquetas,
  fraseDeExistente,
  FRASE_ETIQUETA_INVALIDA,
  nombreDeEtiqueta,
  repartirEtiquetas,
  significadoDelTexto,
  textoDeDescuento,
  unirEtiquetas,
} from "./etiquetas-alta-reglas";

const et = (id: string, nombre: string, extra: Partial<EtiquetaAlta> = {}): EtiquetaAlta => ({
  id,
  nombre,
  estilo: "neutral",
  descuentoPct: null,
  categoriaIds: [],
  ...extra,
});

const NUEVA = et("e1", "Nueva colección");
const PRIMAVERA = et("e2", "Primavera 26");
const CYBER = et("e3", "Cyber CAYLA", { descuentoPct: 20, categoriaIds: ["blusas"] });
const LIQUIDAR = et("e4", "Para liquidar", { descuentoPct: 40 });
const TODAS = [NUEVA, PRIMAVERA, CYBER, LIQUIDAR];

describe("nombreDeEtiqueta / claveEtiqueta", () => {
  it("quita espacios de los bordes y los repetidos, sin tocar mayúsculas ni tildes", () => {
    expect(nombreDeEtiqueta("  Nueva   colección ")).toBe("Nueva colección");
  });
  it("compara sin tildes, mayúsculas ni espacios de más (igual que la base)", () => {
    expect(claveEtiqueta("  NUEVA  Coleccion")).toBe(claveEtiqueta("Nueva colección"));
  });
});

describe("repartirEtiquetas", () => {
  it("una líder ve todas: las de campaña que cubren su categoría quedan aparte, no se eligen", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "blusas", daDescuentos: true });
    expect(r.elegibles.map((e) => e.id)).toEqual(["e1", "e2", "e4"]);
    expect(r.cubiertas.map((e) => e.id)).toEqual(["e3"]);
    expect(r.ocultasPorDescuento).toBe(0);
  });

  it("quien no es líder no recibe las que llevan descuento (la base las rechazaría) y se cuenta cuántas quedaron fuera", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "faldas", daDescuentos: false });
    expect(r.elegibles.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(r.ocultasPorDescuento).toBe(2); // Cyber (no cubre faldas) y Para liquidar
  });

  it("una campaña con descuento que ya cubre la categoría se MUESTRA a cualquiera (es informativa, no la pone nadie)", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "blusas", daDescuentos: false });
    expect(r.cubiertas.map((e) => e.id)).toEqual(["e3"]);
    expect(r.ocultasPorDescuento).toBe(1); // solo Para liquidar
  });

  it("sin categoría elegida ninguna está «cubierta» todavía", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "", daDescuentos: true });
    expect(r.cubiertas).toEqual([]);
    expect(r.elegibles).toHaveLength(4);
  });
});

describe("filtrarEtiquetas", () => {
  const elegibles = [NUEVA, PRIMAVERA, LIQUIDAR];
  it("sin texto devuelve todas las que aún no se eligieron", () => {
    expect(filtrarEtiquetas(elegibles, ["e2"], "").map((e) => e.id)).toEqual(["e1", "e4"]);
  });
  it("busca sin tildes ni mayúsculas y por cualquier parte del nombre", () => {
    expect(filtrarEtiquetas(elegibles, [], "coleccion").map((e) => e.id)).toEqual(["e1"]);
    expect(filtrarEtiquetas(elegibles, [], "PRIMA").map((e) => e.id)).toEqual(["e2"]);
    expect(filtrarEtiquetas(elegibles, [], "liquid").map((e) => e.id)).toEqual(["e4"]);
  });
  it("una ya elegida no vuelve a ofrecerse", () => {
    expect(filtrarEtiquetas(elegibles, ["e1"], "nueva")).toEqual([]);
  });
  it("la igual va primero, luego las que empiezan con lo escrito y al final las que solo lo contienen (Enter agrega la primera)", () => {
    const outlet = et("x1", "Outlet Sale", { descuentoPct: 50 });
    const sale = et("x2", "Sale");
    const salero = et("x3", "Saleros de plata");
    // orden de entrada = alfabético: Outlet Sale, Sale, Saleros de plata
    expect(filtrarEtiquetas([outlet, sale, salero], [], "sale").map((e) => e.id)).toEqual(["x2", "x3", "x1"]);
  });
  it("con el mismo rango se respeta el orden de entrada", () => {
    // «a» está dentro de las tres y no empieza ninguna: las tres son «contiene» y no se reordenan.
    expect(filtrarEtiquetas([NUEVA, PRIMAVERA, LIQUIDAR], [], "a").map((e) => e.id)).toEqual(["e1", "e2", "e4"]);
  });
  it("reconoce un nombre guardado con espacios repetidos", () => {
    expect(filtrarEtiquetas([et("d1", "Nueva   colección")], [], "nueva colección").map((e) => e.id)).toEqual(["d1"]);
  });
});

describe("significadoDelTexto", () => {
  const reparto = repartirEtiquetas(TODAS, { categoriaId: "blusas", daDescuentos: false });
  const ctx = { todas: TODAS, reparto, elegidas: ["e2"], propuestas: ["Verano Chic"] };

  it("vacío o solo espacios no es nada", () => {
    expect(significadoDelTexto("   ", ctx)).toEqual({ tipo: "vacio" });
  });
  it("un nombre que no existe en ningún lado es NUEVA, con el nombre ya limpio", () => {
    expect(significadoDelTexto("  Día   de la madre ", ctx)).toEqual({ tipo: "nueva", nombre: "Día de la madre" });
  });
  it("una que está en la lista responde «elegible» aunque se escriba distinto (tildes y mayúsculas)", () => {
    expect(significadoDelTexto("NUEVA COLECCION", ctx)).toMatchObject({ tipo: "existe", motivo: "elegible", etiqueta: NUEVA });
  });
  it("una que ya se agregó responde «elegida» y no ofrece crearla otra vez", () => {
    expect(significadoDelTexto("primavera 26", ctx)).toMatchObject({ tipo: "existe", motivo: "elegida" });
  });
  it("una campaña que ya cubre la categoría responde «campana»", () => {
    expect(significadoDelTexto("cyber cayla", ctx)).toMatchObject({ tipo: "existe", motivo: "campana" });
  });
  it("una con descuento que este rol no puede dar responde «solo_lider»: crearla de nuevo chocaría con el índice único", () => {
    expect(significadoDelTexto("para liquidar", ctx)).toMatchObject({ tipo: "existe", motivo: "solo_lider" });
  });
  it("una que ya se propuso en esta pantalla (y espera a un líder) no se vuelve a proponer", () => {
    expect(significadoDelTexto("verano chic", ctx)).toEqual({ tipo: "existe", nombre: "verano chic", etiqueta: null, motivo: "propuesta" });
  });
  it("un nombre guardado con espacios de más se reconoce como existente, no como nueva", () => {
    const raro = [et("d1", "Nueva   colección")];
    const r = repartirEtiquetas(raro, { categoriaId: "", daDescuentos: true });
    expect(significadoDelTexto("nueva colección", { todas: raro, reparto: r, elegidas: [], propuestas: [] })).toMatchObject({ tipo: "existe", motivo: "elegible" });
  });
  it("lo escrito con comas no se crea: pegar «a, b, c» dejaría UNA etiqueta con comas en el vocabulario", () => {
    expect(significadoDelTexto("Verano, Otoño", ctx)).toEqual({ tipo: "invalida", nombre: "Verano, Otoño" });
    expect(FRASE_ETIQUETA_INVALIDA).toContain("de a una");
  });
  it("cada motivo tiene su frase, y ninguna queda vacía", () => {
    for (const m of ["elegible", "elegida", "campana", "solo_lider", "propuesta"] as const) expect(fraseDeExistente(m).length).toBeGreaterThan(10);
  });
});

describe("textoDeDescuento", () => {
  it("dice el % solo si la etiqueta descuenta", () => {
    expect(textoDeDescuento(CYBER)).toBe("20 % dto");
    expect(textoDeDescuento(NUEVA)).toBeNull();
  });
  it("no redondea: un 12,5 % no se muestra como 13 %", () => {
    expect(textoDeDescuento({ descuentoPct: 12.5 })).toBe("12,5 % dto");
    expect(textoDeDescuento({ descuentoPct: 15.25 })).toBe("15,25 % dto");
  });
});

describe("unirEtiquetas", () => {
  it("suma las creadas aquí", () => {
    expect(unirEtiquetas([NUEVA], [PRIMAVERA]).map((e) => e.id)).toEqual(["e1", "e2"]);
  });
  it("si la página se releyó y ya trae la etiqueta (por id o por nombre), no la duplica", () => {
    expect(unirEtiquetas([NUEVA, PRIMAVERA], [PRIMAVERA])).toHaveLength(2);
    expect(unirEtiquetas([NUEVA], [et("otro-id", "  nueva COLECCIÓN ")])).toHaveLength(1);
  });
});
