import { describe, expect, it } from "vitest";
import type { EtiquetaAlta } from "./alta-producto-datos";
import {
  claveEtiqueta,
  agruparEtiquetas,
  coincideConTexto,
  etiquetasALaVista,
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
  vigenteDesde: null,
  vigenteHasta: null,
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
  it("las de campaña que cubren la categoría de la prenda quedan aparte (no se eligen); todas las demás se eligen", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "blusas" });
    expect(r.elegibles.map((e) => e.id)).toEqual(["e1", "e2", "e4"]);
    expect(r.cubiertas.map((e) => e.id)).toEqual(["e3"]);
  });

  it("las que llevan descuento SE OFRECEN a quien da de alta la prenda, sea líder o no (ADR-0293: «Para liquidar» no puede faltar)", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "faldas" });
    expect(r.elegibles.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(r.elegibles.filter((e) => e.descuentoPct !== null).map((e) => e.nombre)).toEqual(["Cyber CAYLA", "Para liquidar"]);
    expect(r.cubiertas).toEqual([]);
  });

  it("ninguna etiqueta del vocabulario se pierde: cada una es elegible o cubierta, nunca las dos ni ninguna", () => {
    for (const categoriaId of ["", "blusas", "faldas"]) {
      const r = repartirEtiquetas(TODAS, { categoriaId });
      expect([...r.elegibles, ...r.cubiertas].map((e) => e.id).sort()).toEqual(TODAS.map((e) => e.id).sort());
    }
  });

  it("sin categoría elegida ninguna está «cubierta» todavía", () => {
    const r = repartirEtiquetas(TODAS, { categoriaId: "" });
    expect(r.cubiertas).toEqual([]);
    expect(r.elegibles).toHaveLength(4);
  });
});

describe("etiquetasALaVista: marcadas y cubiertas nunca se esconden en la grilla compacta", () => {
  const ids = (l: EtiquetaAlta[]) => l.map((e) => e.id);
  const A = et("a", "A");
  const B = et("b", "B");
  const C = et("c", "C");
  const D = et("d", "D");
  const E = et("e", "E");
  const F = et("f", "F");
  const CUBIERTA = et("cub", "Ya aplica");

  it("sin nada marcado, se ven las primeras `max` elegibles y las cubiertas", () => {
    expect(ids(etiquetasALaVista([A, B, C, D, E, F], [CUBIERTA], new Set(), 5))).toEqual(["cub", "a", "b", "c", "d"]);
  });

  it("una marcada que quedaría fuera del recorte va primero, igual que en `aLaVista`", () => {
    expect(ids(etiquetasALaVista([A, B, C, D, E, F], [], new Set(["f"]), 5))).toEqual(["f", "a", "b", "c", "d"]);
  });

  it("varias marcadas caben todas antes que el relleno, aunque sean más que el hueco que dejan las cubiertas", () => {
    expect(ids(etiquetasALaVista([A, B, C, D, E, F], [CUBIERTA], new Set(["e", "f"]), 5))).toEqual(["e", "f", "cub", "a", "b"]);
  });

  it("con pocas etiquetas en total, se ven todas sin rellenar de más", () => {
    expect(ids(etiquetasALaVista([A, B], [], new Set(), 5))).toEqual(["a", "b"]);
  });
});

describe("coincideConTexto", () => {
  it("sin texto coinciden todas", () => {
    expect(coincideConTexto(NUEVA, "")).toBe(true);
    expect(coincideConTexto(NUEVA, "   ")).toBe(true);
  });
  it("busca sin tildes ni mayúsculas y por cualquier parte del nombre", () => {
    expect(coincideConTexto(NUEVA, "coleccion")).toBe(true);
    expect(coincideConTexto(PRIMAVERA, "PRIMA")).toBe(true);
    expect(coincideConTexto(LIQUIDAR, "liquid")).toBe(true);
    expect(coincideConTexto(LIQUIDAR, "nueva")).toBe(false);
  });
  it("reconoce un nombre guardado con espacios repetidos", () => {
    expect(coincideConTexto(et("d1", "Nueva   colección"), "nueva colección")).toBe(true);
  });
});

describe("agruparEtiquetas", () => {
  it("ordena los grupos como Atributos (Rotación, Artesanal, Campaña y festividad, General) y cada uno por nombre", () => {
    const grupos = agruparEtiquetas([
      et("g1", "Navidad", { estilo: "campana" }),
      et("g2", "Top ventas", { estilo: "urgencia" }),
      et("g3", "Hecho a mano", { estilo: "positivo" }),
      et("g4", "Aniversario CAYLA", { estilo: "campana" }),
      et("g5", "Nuevo", { estilo: "urgencia" }),
      et("g6", "Día del Niño"),
    ]);
    expect(grupos.map((g) => g.nombre)).toEqual(["Rotación", "Artesanal", "Campaña y festividad", "General"]);
    expect(grupos.map((g) => g.etiquetas.map((e) => e.nombre))).toEqual([["Nuevo", "Top ventas"], ["Hecho a mano"], ["Aniversario CAYLA", "Navidad"], ["Día del Niño"]]);
  });
  it("un grupo sin etiquetas no sale, y un estilo desconocido cae en General", () => {
    const grupos = agruparEtiquetas([et("g1", "Rara", { estilo: "inventado" })]);
    expect(grupos.map((g) => g.nombre)).toEqual(["General"]);
  });
  it("no pierde ninguna etiqueta", () => {
    const todas = [NUEVA, PRIMAVERA, CYBER, LIQUIDAR, et("x", "Otra", { estilo: "urgencia" })];
    expect(agruparEtiquetas(todas).flatMap((g) => g.etiquetas)).toHaveLength(todas.length);
  });
});

describe("significadoDelTexto", () => {
  const reparto = repartirEtiquetas(TODAS, { categoriaId: "blusas" });
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
  it("una con descuento se elige como cualquier otra: responde «elegible», no ofrece crearla de nuevo (chocaría con el índice único)", () => {
    expect(significadoDelTexto("para liquidar", ctx)).toMatchObject({ tipo: "existe", motivo: "elegible", etiqueta: LIQUIDAR });
  });
  it("una que ya se propuso en esta pantalla (y espera a un líder) no se vuelve a proponer", () => {
    expect(significadoDelTexto("verano chic", ctx)).toEqual({ tipo: "existe", nombre: "verano chic", etiqueta: null, motivo: "propuesta" });
  });
  it("un nombre guardado con espacios de más se reconoce como existente, no como nueva", () => {
    const raro = [et("d1", "Nueva   colección")];
    const r = repartirEtiquetas(raro, { categoriaId: "" });
    expect(significadoDelTexto("nueva colección", { todas: raro, reparto: r, elegidas: [], propuestas: [] })).toMatchObject({ tipo: "existe", motivo: "elegible" });
  });
  it("lo escrito con comas no se crea: pegar «a, b, c» dejaría UNA etiqueta con comas en el vocabulario", () => {
    expect(significadoDelTexto("Verano, Otoño", ctx)).toEqual({ tipo: "invalida", nombre: "Verano, Otoño" });
    expect(FRASE_ETIQUETA_INVALIDA).toContain("de a una");
  });
  it("cada motivo tiene su frase, y ninguna queda vacía", () => {
    for (const m of ["elegible", "elegida", "campana", "propuesta"] as const) expect(fraseDeExistente(m).length).toBeGreaterThan(10);
  });
});

describe("textoDeDescuento", () => {
  it("dice el % solo si la etiqueta descuenta", () => {
    expect(textoDeDescuento(CYBER)).toBe("20 % dto");
    expect(textoDeDescuento(NUEVA)).toBeNull();
  });
  it("no redondea: un 12.5 % no se muestra como 13 %", () => {
    expect(textoDeDescuento({ descuentoPct: 12.5 })).toBe("12.5 % dto");
    expect(textoDeDescuento({ descuentoPct: 15.25 })).toBe("15.25 % dto");
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
