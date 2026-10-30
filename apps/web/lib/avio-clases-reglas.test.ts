import { describe, expect, it } from "vitest";
import {
  COMPORTAMIENTOS,
  claseElegida,
  clasesOfrecidas,
  leerClasesDeAvio,
  medidaCuadra,
  medidaProhibida,
  medidaRequerida,
  medidasDe,
  nombreDeMaterial,
  prefijoLibre,
  textoDeMedida,
  UNIDADES_MEDIDA,
  type ClaseDeAvio,
  type ComportamientoClase,
} from "./avio-clases-reglas";
import type { UnidadMedidaAvio } from "./insumos-reglas";

// Las clases de avío (ADR-0580). Lo que estas pruebas protegen de verdad: que la web y la BASE digan exactamente lo mismo. Si `fn_medida_cuadra` o `fn_medida_texto` cambian en
// `supabase/migrations/20261030144000` y aquí no, la hoja deja escribir algo que la base va a rechazar al guardar — o peor, el título de la ficha y el nombre de sus colores se leen distinto.
// Los mismos casos viven en `scripts/pruebas/materiales.mjs`, grupo V (V15 y V16).

const TODOS: ComportamientoClase[] = ["pieza", "largo", "ancho", "titulo", "etiqueta", "otro"];
const UNIDADES: UnidadMedidaAvio[] = ["linea", "milimetro", "centimetro", "titulo"];

const clase = (extra: Partial<ClaseDeAvio> = {}): ClaseDeAvio => ({
  id: "k1",
  nombre: "Botón",
  prefijo: "BOT",
  comportamiento: "pieza",
  unidadSugerida: "unidad",
  pideColor: true,
  orden: 10,
  activo: true,
  nota: null,
  ...extra,
});

describe("la tabla de comportamientos es total y no se contradice", () => {
  it("cada comportamiento tiene su regla, con su título y su porqué", () => {
    for (const c of TODOS) {
      expect(COMPORTAMIENTOS[c]).toBeDefined();
      expect(COMPORTAMIENTOS[c].comoSeLlama).toBeTruthy();
    }
  });
  it("lo que exige medida admite al menos una unidad, y lo que no se mide no admite ninguna", () => {
    for (const c of TODOS) {
      if (medidaRequerida(c)) expect(medidasDe(c).length).toBeGreaterThan(0);
      if (medidaProhibida(c)) expect(medidasDe(c)).toEqual([]);
      // Lo que exige medida no puede ser, a la vez, lo que no se mide.
      expect(medidaRequerida(c) && medidaProhibida(c)).toBe(false);
    }
  });
  it("una clase que pide medida explica POR QUÉ: si no, la persona escribe un número sin saber cuál", () => {
    for (const c of TODOS) if (medidaRequerida(c)) expect(COMPORTAMIENTOS[c].porQue.length).toBeGreaterThan(10);
  });
  it("toda unidad de medida que algún comportamiento admite tiene su texto", () => {
    for (const u of UNIDADES) expect(UNIDADES_MEDIDA[u].corta).toBeTruthy();
  });
});

describe("medidaCuadra: la MISMA tabla que `retail.fn_medida_cuadra` (caso V16 de pruebas:materiales)", () => {
  it("un botón se mide en líneas o milímetros, nunca en centímetros", () => {
    expect(medidaCuadra("pieza", "linea")).toBe(true);
    expect(medidaCuadra("pieza", "milimetro")).toBe(true);
    expect(medidaCuadra("pieza", "centimetro")).toBe(false);
    expect(medidaCuadra("pieza", "titulo")).toBe(false);
  });
  it("un cierre y un elástico, en centímetros; un hilo, en título; una etiqueta, en nada; «otro», en lo que sea", () => {
    expect(UNIDADES.map((u) => medidaCuadra("largo", u))).toEqual([false, false, true, false]);
    expect(UNIDADES.map((u) => medidaCuadra("ancho", u))).toEqual([false, false, true, false]);
    expect(UNIDADES.map((u) => medidaCuadra("titulo", u))).toEqual([false, false, false, true]);
    expect(UNIDADES.map((u) => medidaCuadra("etiqueta", u))).toEqual([false, false, false, false]);
    expect(UNIDADES.map((u) => medidaCuadra("otro", u))).toEqual([true, true, true, true]);
  });
  it("`medidasDe` y `medidaCuadra` dicen lo mismo, para los seis comportamientos y las cuatro unidades", () => {
    for (const c of TODOS) for (const u of UNIDADES) expect(medidaCuadra(c, u)).toBe(medidasDe(c).includes(u));
  });
});

describe("textoDeMedida: lo mismo que `retail.fn_medida_texto` (caso V15)", () => {
  it("dice cada unidad como la dice la base", () => {
    expect(textoDeMedida(18, "linea")).toBe("18 L");
    expect(textoDeMedida(11.4, "milimetro")).toBe("11.4 mm");
    expect(textoDeMedida(40, "centimetro")).toBe("40 cm");
    expect(textoDeMedida(40, "titulo")).toBe("título 40");
  });
  it("usa PUNTO decimal, no coma: la base compone con él el nombre de cada color y los dos tienen que leerse igual", () => {
    expect(textoDeMedida(11.4, "milimetro")).toContain(".");
    expect(textoDeMedida(11.4, "milimetro")).not.toContain(",");
  });
  it("un decimal que no aporta no se escribe (`trim_scale` de la base)", () => {
    expect(textoDeMedida(18.0, "linea")).toBe("18 L");
    expect(textoDeMedida(18.5, "linea")).toBe("18.5 L");
    expect(textoDeMedida(18.504, "linea")).toBe("18.5 L");
  });
  it("sin medida, sin texto (y un número imposible tampoco se dibuja)", () => {
    expect(textoDeMedida(null, "linea")).toBeNull();
    expect(textoDeMedida(18, null)).toBeNull();
    expect(textoDeMedida(Number.NaN, "linea")).toBeNull();
  });
});

describe("nombreDeMaterial: el mismo nombre que arma la base para cada color", () => {
  it("un avío se lee con su medida; una tela, tal cual", () => {
    expect(nombreDeMaterial({ nombre: "Botón nácar", medida: { valor: 18, unidad: "linea" } })).toBe("Botón nácar 18 L");
    expect(nombreDeMaterial({ nombre: "Milano Melange", medida: null })).toBe("Milano Melange");
  });
  it("es el mismo texto que el disparador pone antes del « · Color»", () => {
    const m = { nombre: "Cierre invisible", medida: { valor: 40, unidad: "centimetro" as const } };
    expect(`${nombreDeMaterial(m)} · Negro`).toBe("Cierre invisible 40 cm · Negro");
  });
});

describe("prefijoLibre: el código de una clase nueva no choca con el de otra", () => {
  it("son las tres primeras letras, sin tildes y en mayúsculas", () => {
    expect(prefijoLibre("Broche", [])).toBe("BRO");
    expect(prefijoLibre("Órgano", [])).toBe("ORG");
  });
  it("si ya está tomado, prueba con la siguiente letra del nombre y después con un número", () => {
    expect(prefijoLibre("Botón", ["BOT"])).toBe("BOO");
    expect(prefijoLibre("Bot", ["BOT"])).toBe("BOT1");
  });
  it("un nombre sin dos letras no da prefijo: la clase no se puede crear así", () => {
    expect(prefijoLibre("1", [])).toBeNull();
    expect(prefijoLibre("  ", [])).toBeNull();
  });
  it("nunca devuelve algo fuera de lo que admite el CHECK de la base (2 a 4 letras mayúsculas o cifras)", () => {
    for (const n of ["Broche", "Ojal", "Cinta de sesgo", "Órgano", "Zz"]) {
      const p = prefijoLibre(n, []);
      expect(p).not.toBeNull();
      expect(p!).toMatch(/^[A-Z]{2,4}$|^[A-Z]{3}\d$/);
    }
  });
});

describe("leerClasesDeAvio: lo que no se entiende no se ofrece", () => {
  const fila = (extra: Record<string, unknown> = {}) => ({ id: "k1", nombre: "Botón", prefijo: "BOT", comportamiento: "pieza", unidad_sugerida: "unidad", pide_color: true, orden: 10, activo: true, nota: null, ...extra });
  it("lee una fila completa", () => {
    expect(leerClasesDeAvio([fila()])).toEqual([clase({ nota: null })]);
  });
  it("descarta una fila con un comportamiento o una unidad que el código no conoce: mejor sin esa clase que con una regla inventada", () => {
    expect(leerClasesDeAvio([fila({ comportamiento: "mágico" })])).toEqual([]);
    expect(leerClasesDeAvio([fila({ unidad_sugerida: "gruesa" })])).toEqual([]);
    expect(leerClasesDeAvio([fila({ id: null })])).toEqual([]);
    expect(leerClasesDeAvio(null)).toEqual([]);
  });
});

describe("clasesOfrecidas y claseElegida", () => {
  it("se ofrecen en el orden que puso el líder y, a igual orden, por nombre", () => {
    const cs = [clase({ id: "c", nombre: "Zapato", orden: 10 }), clase({ id: "b", nombre: "Aguja", orden: 10 }), clase({ id: "a", nombre: "Hilo", orden: 5 })];
    expect(clasesOfrecidas(cs).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("una clase desactivada no se ofrece ni se puede elegir (aunque alguien mande su id)", () => {
    const cs = [clase({ id: "a", activo: false })];
    expect(clasesOfrecidas(cs)).toEqual([]);
    expect(claseElegida(cs, "a")).toBeNull();
    expect(claseElegida([clase({ id: "a" })], "a")?.id).toBe("a");
    expect(claseElegida([clase({ id: "a" })], "")).toBeNull();
  });
});
