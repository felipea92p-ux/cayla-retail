import { describe, expect, it } from "vitest";
import { enEscala, esColorClaro, gamaDeColor, oklchDeHex, partirEnGamas } from "./color-escala";
import { bordeDeMuestra, enLaCarta, esFamiliaDeColor, FAMILIAS_COLOR, fondoDeMuestra } from "./colores-familias";

// La carta de CAYLA al 2026-10-02: los 75 colores activos de producción, cada uno con la familia que le da la migración
// 20261002180000. Es el contrato de la escala: si alguien cambia un corte de gama o la fórmula de claridad, esta prueba dice
// qué color se movió de lugar, y entonces se decide —con Felipe— si el cambio es lo que se quería.
const CARTA: ReadonlyArray<readonly [codigo: string, nombre: string, hex: string, familia: string]> = [
  ["BLA", "Blanco", "#F4F9FF", "neutro"],
  ["CRU", "Crudo", "#F3ECE0", "neutro"],
  ["PER", "Perla", "#EAE6DD", "neutro"],
  ["NUD", "Nude", "#F2D3BC", "neutro"],
  ["GRP", "Gris perla", "#C5C5C5", "neutro"],
  ["BEI", "Beige", "#D5BA98", "neutro"],
  ["GPI", "Gris piedra", "#C3BDAB", "neutro"],
  ["ARN", "Arena", "#CCA67F", "neutro"],
  ["GRM", "Gris melange", "#A2A2A1", "neutro"],
  ["GRI", "Gris", "#848587", "neutro"],
  ["TOP", "Topo", "#82776B", "neutro"],
  ["GRA", "Gris antracita", "#48464A", "neutro"],
  ["NEG", "Negro", "#2D2C2F", "neutro"],
  ["CAQ", "Caqui", "#A39264", "tierra"],
  ["CAM", "Camel", "#B0885B", "tierra"],
  ["MOK", "Moka", "#A47864", "tierra"],
  ["TOS", "Tostado", "#A47045", "tierra"],
  ["TER", "Terracota", "#B3573F", "tierra"],
  ["MAC", "Coñac", "#864C24", "tierra"],
  ["MAR", "Marrón", "#694833", "tierra"],
  ["CHO", "Chocolate", "#4B342F", "tierra"],
  ["ROS", "Rosado", "#F0A1BF", "rosado"],
  ["PAL", "Palo rosa", "#D9A6A1", "rosado"],
  ["FUC", "Fucsia", "#CF2D71", "rosado"],
  ["COR", "Coral", "#EA6759", "rojo"],
  ["ROJ", "Rojo", "#BD332D", "rojo"],
  ["FRA", "Frambuesa", "#A52350", "rojo"],
  ["CER", "Cereza", "#9B1B30", "rojo"],
  ["VIN", "Vino", "#6C2831", "rojo"],
  ["DUR", "Durazno", "#FFBE98", "naranja"],
  ["SAL", "Salmón", "#FAA181", "naranja"],
  ["MAN", "Mandarina", "#EE9626", "naranja"],
  ["NAR", "Naranja", "#E8703A", "naranja"],
  ["AMM", "Amarrillo mantequilla", "#FFE68A", "amarillo"],
  ["VAI", "Vainilla", "#F2E6B1", "amarillo"],
  ["AML", "Amarillo limón", "#EADA4F", "amarillo"],
  ["AMA", "Amarillo", "#F0C05A", "amarillo"],
  ["MOS", "Mostaza", "#C89721", "amarillo"],
  ["VEA", "Verde agua", "#A1D7C9", "verde"],
  ["ESM", "Esmeralda", "#009B74", "verde"],
  ["VER", "Verde", "#487D49", "verde"],
  ["VEB", "Verde botella", "#264E36", "verde"],
  ["PIS", "Pistacho", "#BED38E", "verde"],
  ["VEL", "Verde limón", "#9FC131", "verde"],
  ["SAV", "Salvia", "#A1AD92", "verde"],
  ["VOL", "Verde oliva", "#6A6F34", "verde"],
  ["VEM", "Verde militar", "#4B5335", "verde"],
  ["CEL", "Celeste", "#A9CADA", "azul"],
  ["TUR", "Turquesa", "#33BECC", "azul"],
  ["AZP", "Azul petróleo", "#2A5C6A", "azul"],
  ["AZC", "Azul claro", "#80A0D4", "azul"],
  ["AZD", "Azul denim", "#5979A2", "azul"],
  ["AZE", "Azul eléctrico", "#4A5FA5", "azul"],
  ["AZI", "Azul Intermedio", "#56626E", "azul"],
  ["AME", "Azul medio", "#3936CD", "azul"],
  ["COB", "Cobalto", "#00539C", "azul"],
  ["IND", "Índigo", "#49516D", "azul"],
  ["AZM", "Azul marino", "#2A304E", "azul"],
  ["LAV", "Lavanda", "#D2C4D6", "morado"],
  ["LIL", "Lila", "#BCA4CB", "morado"],
  ["VIO", "Violeta", "#775496", "morado"],
  ["MOR", "Morado", "#563474", "morado"],
  ["MAL", "Malva", "#B88AAC", "morado"],
  ["ORQ", "Orquídea", "#AD5E99", "morado"],
  ["MOA", "Mora", "#854C65", "morado"],
  ["CIR", "Ciruela", "#692D5D", "morado"],
  ["BER", "Berenjena", "#47253C", "morado"],
  ["CHA", "Champán", "#E2D1A6", "metalico"],
  ["PLA", "Plateado", "#B8BCC0", "metalico"],
  ["ORR", "Oro rosa", "#D6A08C", "metalico"],
  ["DOR", "Dorado", "#C8A951", "metalico"],
  ["ORV", "Oro viejo", "#A68A45", "metalico"],
  ["PLV", "Plata vieja", "#8C8D88", "metalico"],
  ["COE", "Cobre", "#B46A3C", "metalico"],
  ["BRO", "Bronce", "#8C6B3B", "metalico"],
];

// Cada fila como se ve en la carta: las gamas separadas, de menor a mayor matiz; dentro de cada una, de claro a oscuro.
const ESPERADO: Record<string, string[][]> = {
  neutro: [["BLA", "CRU", "PER", "NUD", "GRP", "BEI", "GPI", "ARN", "GRM", "GRI", "TOP", "GRA", "NEG"]],
  tierra: [["CAQ", "CAM", "MOK", "TOS", "TER", "MAC", "MAR", "CHO"]],
  rosado: [["ROS", "PAL", "FUC"]],
  rojo: [["COR", "ROJ", "FRA", "CER", "VIN"]],
  naranja: [["DUR", "SAL", "MAN", "NAR"]],
  amarillo: [["AMM", "VAI", "AML", "AMA", "MOS"]],
  // oliva y limón (matiz bajo) antes que verde y agua (matiz alto): la fila avanza por el círculo cromático.
  verde: [["PIS", "VEL", "SAV", "VOL", "VEM"], ["VEA", "ESM", "VER", "VEB"]],
  azul: [["CEL", "TUR", "AZP"], ["AZC", "AZD", "AZE", "AZI", "AME", "COB", "IND", "AZM"]],
  morado: [["LAV", "LIL", "VIO", "MOR"], ["MAL", "ORQ", "MOA", "CIR", "BER"]],
  metalico: [["CHA", "PLA", "ORR", "DOR", "ORV", "PLV", "COE", "BRO"]],
};

const deFamilia = (familia: string) =>
  CARTA.filter((c) => c[3] === familia).map(([codigo, nombre, hex, familiaColor]) => ({ codigo, nombre, hex, familiaColor }));

const comoSeVe = (lista: ReturnType<typeof deFamilia>) => partirEnGamas([...lista].sort(enEscala)).map((b) => b.map((c) => c.codigo));

describe("la carta de colores de CAYLA", () => {
  it("tiene los 75 colores y ninguna familia que FAMILIAS_COLOR no conozca", () => {
    expect(CARTA).toHaveLength(75);
    const conocidas = new Set<string>(FAMILIAS_COLOR.map((f) => f.valor));
    for (const [, , , familia] of CARTA) expect(conocidas.has(familia)).toBe(true);
    expect(new Set(CARTA.map((c) => c[0])).size).toBe(75);
  });

  it("las filas siguen el espectro: neutros, rosado → morado, y al final lo que no es un matiz", () => {
    expect(FAMILIAS_COLOR.map((f) => f.valor)).toEqual([
      "neutro", "tierra", "rosado", "rojo", "naranja", "amarillo", "verde", "azul", "morado", "metalico", "estampado",
    ]);
  });

  for (const [familia, esperado] of Object.entries(ESPERADO)) {
    it(`${familia}: queda como la carta aprobada, llegue la lista como llegue`, () => {
      const lista = deFamilia(familia);
      expect(comoSeVe(lista)).toEqual(esperado);
      expect(comoSeVe([...lista].reverse())).toEqual(esperado);
    });
  }

  it("las familias de una sola gama no dejan respiros; Verde, Azul y Morado dejan uno", () => {
    for (const [familia, esperado] of Object.entries(ESPERADO)) {
      expect(esperado.length).toBe(["verde", "azul", "morado"].includes(familia) ? 2 : 1);
    }
  });

  it("ningún color de la carta queda a menos de 6° de un corte de gama (los más cercanos son casi grises)", () => {
    const cortes: Record<string, number> = { verde: 135, azul: 240, morado: 325 };
    for (const [familia, corte] of Object.entries(cortes)) {
      for (const c of deFamilia(familia)) {
        const h = oklchDeHex(c.hex)!.h;
        expect(Math.abs(h - corte), `${c.nombre} (${h.toFixed(1)}°)`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("INVARIANTE: partir en gamas y volver a juntar devuelve exactamente la lista — nunca se pierde ni se repite un color", () => {
    for (const familia of Object.keys(ESPERADO)) {
      const ordenada = [...deFamilia(familia)].sort(enEscala);
      expect(partirEnGamas(ordenada).flat()).toEqual(ordenada);
    }
    expect(partirEnGamas([])).toEqual([]);
  });
});

describe("enEscala", () => {
  const c = (nombre: string, hex: string | null, familiaColor = "azul") => ({ nombre, hex, familiaColor });

  it("un color sin hex válido va al final de su familia, y dos sin hex se ordenan por nombre", () => {
    const lista = [c("Zeta", null), c("Marino", "#0b1d3a"), c("Alfa", "no-es-un-hex"), c("Celeste", "#bfe0f5")];
    expect([...lista].sort(enEscala).map((x) => x.nombre)).toEqual(["Celeste", "Marino", "Alfa", "Zeta"]);
  });

  it("dos colores iguales se ordenan por nombre, siempre igual", () => {
    const a = c("Uno", "#336699");
    const b = c("Dos", "#336699");
    expect([a, b].sort(enEscala).map((x) => x.nombre)).toEqual(["Dos", "Uno"]);
    expect([b, a].sort(enEscala).map((x) => x.nombre)).toEqual(["Dos", "Uno"]);
  });

  it("la claridad es la que ve el ojo: un azul eléctrico se lee MÁS OSCURO que un gris medio con el mismo brillo de RGB", () => {
    // Con el brillo 0.299R+0.587G+0.114B, #0000FF (29) y #2D2D2D (45) parecen cercanos y el azul puro se subestima; en OKLab
    // el azul puro (L≈0.45) queda claramente bajo el gris medio claro (#9a9a9a, L≈0.69).
    const azul = oklchDeHex("#0000ff")!;
    const gris = oklchDeHex("#9a9a9a")!;
    expect(azul.L).toBeLessThan(gris.L);
    expect(azul.L).toBeGreaterThan(0.4);
    expect(azul.L).toBeLessThan(0.5);
  });
});

describe("oklchDeHex", () => {
  it("blanco es 1 y negro es 0", () => {
    expect(oklchDeHex("#ffffff")!.L).toBeCloseTo(1, 2);
    expect(oklchDeHex("#000000")!.L).toBeCloseTo(0, 2);
  });

  it("acepta #RGB y da lo mismo que su #RRGGBB", () => {
    expect(oklchDeHex("#fc0")).toEqual(oklchDeHex("#ffcc00"));
  });

  it("un hex mal formado, vacío o ausente no tiene tono", () => {
    for (const malo of ["", "rojo", "#12", "#12345", "#gggggg", null, undefined]) expect(oklchDeHex(malo)).toBeNull();
  });
});

describe("gamaDeColor", () => {
  it("una familia sin corte tiene una sola gama, y un color sin hex cae en la última de una familia con corte", () => {
    expect(gamaDeColor("rojo", "#bd332d")).toBe(0);
    expect(gamaDeColor("rojo", null)).toBe(0);
    expect(gamaDeColor("azul", null)).toBe(1);
    expect(gamaDeColor(null, "#bd332d")).toBe(0);
  });

  it("el cian cae en la primera gama del azul y el ultramar en la segunda", () => {
    expect(gamaDeColor("azul", "#33becc")).toBe(0);
    expect(gamaDeColor("azul", "#00539c")).toBe(1);
  });
});

describe("enLaCarta — toda la paleta en una lista (Atributos → Colores)", () => {
  const todos = CARTA.map(([codigo, nombre, hex, familiaColor]) => ({ codigo, nombre, hex, familiaColor }));
  const ordenEsperado = FAMILIAS_COLOR.flatMap((f) => (ESPERADO[f.valor] ?? []).flat());

  it("pone las familias en el espectro y, dentro de cada una, la escala — igual que la carta de Nuevo producto", () => {
    expect([...todos].sort(enLaCarta).map((c) => c.codigo)).toEqual(ordenEsperado);
    expect([...todos].reverse().sort(enLaCarta).map((c) => c.codigo)).toEqual(ordenEsperado);
  });

  it("una familia que el código no conoce va al final, sin perderse", () => {
    const ajeno = { codigo: "ZZZ", nombre: "Raro", hex: "#123456", familiaColor: "inexistente" };
    const r = [ajeno, ...todos].sort(enLaCarta);
    expect(r[r.length - 1].codigo).toBe("ZZZ");
    expect(r).toHaveLength(76);
  });
});

describe("esFamiliaDeColor — la lista que valida la API", () => {
  it("acepta las 11 familias, incluidas las dos nuevas, y rechaza lo demás", () => {
    for (const f of FAMILIAS_COLOR) expect(esFamiliaDeColor(f.valor)).toBe(true);
    expect(esFamiliaDeColor("rosado")).toBe(true);
    expect(esFamiliaDeColor("naranja")).toBe(true);
    for (const malo of ["", "Rosado", "rosa", "sin-familia", null, undefined, 5]) expect(esFamiliaDeColor(malo)).toBe(false);
  });
});

describe("esColorClaro — de qué color va el ✓ encima de un círculo", () => {
  it("tinta sobre los claros —incluido el turquesa y el esmeralda, que el brillo del RGB daba por oscuros— y crema sobre los oscuros", () => {
    for (const [nombre, hex] of [["Blanco", "#F4F9FF"], ["Amarillo", "#F0C05A"], ["Turquesa", "#33BECC"], ["Esmeralda", "#009B74"], ["Celeste", "#A9CADA"]]) {
      expect(esColorClaro(hex), nombre).toBe(true);
    }
    for (const [nombre, hex] of [["Negro", "#2D2C2F"], ["Cobalto", "#00539C"], ["Verde", "#487D49"], ["Rojo", "#BD332D"], ["Marino", "#2A304E"]]) {
      expect(esColorClaro(hex), nombre).toBe(false);
    }
  });

  it("sin hex válido se trata como claro: el ✓ de un color sin tono se lee sobre el fondo crema", () => {
    expect(esColorClaro(null)).toBe(true);
    expect(esColorClaro("no-es-un-hex")).toBe(true);
  });
});

describe("fondoDeMuestra y bordeDeMuestra — cómo se ve una muestra", () => {
  it("un color liso va EXACTO: el #hex de la base, sin degradado ni velo", () => {
    for (const [, , hex, familia] of CARTA) if (familia !== "metalico") expect(fondoDeMuestra(hex, familia)).toBe(hex);
  });

  it("un color liso sigue EXACTO aunque se le diga su tipo: sólido, estampado, sin tipo o con un tipo que la base no conoce", () => {
    for (const [, , hex, familia] of CARTA) {
      if (familia === "metalico") continue;
      for (const tipo of ["solido", "estampado", null, undefined, "otra-cosa"]) expect(fondoDeMuestra(hex, familia, tipo)).toBe(hex);
    }
  });

  it("una textura (Gris melange) lleva el jaspeado y sigue pintando su hex debajo", () => {
    const [, , hex, familia] = CARTA.find(([codigo]) => codigo === "GRM")!;
    const f = fondoDeMuestra(hex, familia, "textura")!;
    expect(f).toContain("radial-gradient");
    expect(f.endsWith(`, ${hex}`)).toBe(true);
    expect(f).not.toBe(hex);
    // Mismo tono, distinta muestra: era la queja (el melange se pintaba como el Gris liso).
    expect(f).not.toBe(fondoDeMuestra(hex, familia, "solido"));
  });

  it("el jaspeado sale de tokens: sin un color suelto (solo el hex de la base y la paleta)", () => {
    const f = fondoDeMuestra("#A2A2A1", "neutro", "textura")!;
    expect(f).toContain("var(--color-crema)");
    expect(f).toContain("var(--color-tinta)");
    expect(f.match(/#[0-9a-f]{3,8}\b/gi)).toEqual(["#A2A2A1"]);
    expect(f).not.toMatch(/rgba?\(|hsla?\(|oklch\(|\b(white|black)\b/i);
  });

  it("cualquier textura de la carta se pinta jaspeada, sea cual sea su familia (tipo es ortogonal a la familia)", () => {
    for (const [, , hex, familia] of CARTA) {
      if (familia === "metalico") continue;
      const f = fondoDeMuestra(hex, familia, "textura")!;
      expect(f.startsWith("radial-gradient")).toBe(true);
      expect(f.endsWith(hex)).toBe(true);
    }
  });

  it("si es metálico y textura manda el metálico: una muestra dice una sola cosa", () => {
    expect(fondoDeMuestra("#C8A951", "metalico", "textura")).toBe(fondoDeMuestra("#C8A951", "metalico"));
    expect(fondoDeMuestra("#C8A951", "metalico", "textura")).not.toContain("radial-gradient");
  });

  it("una textura sin hex no tiene fondo; y es pura: el mismo pedido da el mismo CSS", () => {
    expect(fondoDeMuestra(null, "neutro", "textura")).toBeUndefined();
    expect(fondoDeMuestra("#A2A2A1", "neutro", "textura")).toBe(fondoDeMuestra("#A2A2A1", "neutro", "textura"));
  });

  it("un metálico lleva reflejo y sigue pintando su hex debajo", () => {
    for (const [, , hex, familia] of CARTA) {
      if (familia !== "metalico") continue;
      const f = fondoDeMuestra(hex, familia)!;
      expect(f).toContain("linear-gradient");
      expect(f.endsWith(hex)).toBe(true);
    }
  });

  it("sin hex no hay fondo; el reflejo sale de tokens, no de un color suelto", () => {
    expect(fondoDeMuestra(null, "metalico")).toBeUndefined();
    expect(fondoDeMuestra(null)).toBeUndefined();
    const f = fondoDeMuestra("#C8A951", "metalico")!;
    expect(f).toContain("var(--color-crema)");
    expect(f).toContain("var(--color-tinta)");
  });

  it("el borde es el propio tono más oscuro; sin hex válido no hay borde propio (queda el de la pantalla)", () => {
    expect(bordeDeMuestra("#BD332D")).toBe("color-mix(in srgb, #BD332D 68%, black)");
    for (const malo of [null, undefined, "", "#fff", "rojo", "#12345"]) expect(bordeDeMuestra(malo)).toBeUndefined();
  });
});
