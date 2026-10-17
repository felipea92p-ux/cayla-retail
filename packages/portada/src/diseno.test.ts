import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRASTE_MINIMO, contraste } from "./contraste";
import {
  DISENO_DE_SIEMPRE,
  ESTILOS,
  aplicarEstilo,
  colorQueSeLee,
  estiloDelDiseno,
  leerDiseno,
  mismoDiseno,
  paletaDePrenda,
  paletaPropia,
  piezasQueCaben,
  prendasElegidas,
  type DisenoDeCampana,
} from "./diseno";
import { PALETAS, coloresEnTema, paletaPorId, variablesDeLosDosTemas, variablesDePaleta } from "./paletas";
import { disenoParaPintar, revisarDiseno, seLee } from "./revision";

const conPrendas = { prendas: 3, prendasConFoto: 2 };
const UNO = "11111111-1111-4111-8111-111111111111";

describe("las prendas de la portada", () => {
  const p = (id: string) => ({ id, nombre: id });
  const disponibles = [p("a"), p("b"), p("c"), p("d"), p("e")];

  it("cada acomodo muestra las suyas: tres polaroids, una grande, cuatro en mosaico, ninguna con solo letras", () => {
    expect(piezasQueCaben(null)).toBe(3);
    expect(piezasQueCaben(DISENO_DE_SIEMPRE)).toBe(3);
    expect(piezasQueCaben({ ...DISENO_DE_SIEMPRE, acomodo: "grande" })).toBe(1);
    expect(piezasQueCaben({ ...DISENO_DE_SIEMPRE, acomodo: "mosaico" })).toBe(4);
    expect(piezasQueCaben({ ...DISENO_DE_SIEMPRE, acomodo: "letras" })).toBe(0);
  });

  it("las elegidas salen en el orden en que se tocaron, y solo ellas", () => {
    expect(prendasElegidas(disponibles, { ...DISENO_DE_SIEMPRE, prendas: ["d", "a"] }).map((x) => x.id)).toEqual(["d", "a"]);
  });

  it("una elegida que aquí no se puede mostrar se salta; si no queda ninguna, la web elige sola", () => {
    expect(prendasElegidas(disponibles, { ...DISENO_DE_SIEMPRE, prendas: ["z", "c"] }).map((x) => x.id)).toEqual(["c"]);
    expect(prendasElegidas(disponibles, { ...DISENO_DE_SIEMPRE, prendas: ["z"] }).map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("sin elegir (o sin diseño), las de la web en su orden", () => {
    expect(prendasElegidas(disponibles, DISENO_DE_SIEMPRE).map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(prendasElegidas(disponibles, null)).toEqual(disponibles);
    expect(prendasElegidas(disponibles, null)).not.toBe(disponibles);
  });
});

describe("los estilos de partida", () => {
  for (const e of ESTILOS) {
    it(`«${e.nombre}» se aplica, se reconoce, se guarda y se lee en los dos temas`, () => {
      const antes: DisenoDeCampana = { ...DISENO_DE_SIEMPRE, paleta: "medianoche", frase: "Mimos para tu michi", prendas: [UNO], corte: 1 };
      const d = aplicarEstilo(antes, e.id);
      // El texto y las prendas que ya se eligieron se quedan.
      expect([d.frase, d.prendas, d.corte]).toEqual(["Mimos para tu michi", [UNO], 1]);
      expect(estiloDelDiseno(d)?.id).toBe(e.id);
      expect(leerDiseno(JSON.parse(JSON.stringify(d)))).toEqual(d);
      // Un estilo de fábrica nunca deja «Publicar» apagado.
      expect(revisarDiseno(d, conPrendas).bloquea).toBe(false);
    });
  }

  it("el de siempre es el «Clásico CAYLA», y un id que no existe no cambia nada", () => {
    expect(estiloDelDiseno(DISENO_DE_SIEMPRE)?.id).toBe("hoy");
    expect(aplicarEstilo(DISENO_DE_SIEMPRE, "no-existe")).toBe(DISENO_DE_SIEMPRE);
  });

  it("el de siempre es la portada de antes: con el «−15%» calado detrás de las fotos", () => {
    expect(DISENO_DE_SIEMPRE.pctGigante).toBe(true);
    expect([DISENO_DE_SIEMPRE.acomodo, DISENO_DE_SIEMPRE.fondo, DISENO_DE_SIEMPRE.sello]).toEqual(["polaroids", "degradado", "ninguno"]);
  });

  it("ningún estilo dice el descuento dos veces (el % gigante con el sello o con la teja del mosaico)", () => {
    for (const e of ESTILOS) {
      const d = aplicarEstilo(DISENO_DE_SIEMPRE, e.id);
      expect(d.pctGigante && (d.sello === "descuento" || d.acomodo === "mosaico"), e.nombre).toBe(false);
    }
  });

  it("con otros colores ya es «Personalizado»", () => {
    expect(estiloDelDiseno({ ...DISENO_DE_SIEMPRE, paleta: "oliva" })).toBeNull();
    expect(estiloDelDiseno({ ...DISENO_DE_SIEMPRE, paleta: "propia", colores: paletaPropia("#2f6f73") })).toBeNull();
  });
});

describe("toda paleta curada se lee con todo fondo", () => {
  for (const p of PALETAS) {
    for (const fondo of ["degradado", "liso", "dibujo"] as const) {
      it(`${p.nombre} · ${fondo}`, () => {
        const d: DisenoDeCampana = { ...DISENO_DE_SIEMPRE, paleta: p.id, fondo };
        expect(seLee(d, "claro")).toBe(true);
        expect(seLee(d, "oscuro")).toBe(true);
      });
    }
  }
});

describe("«Mi color» y la paleta de una prenda", () => {
  it("sobre un color oscuro, la letra es crema; sobre uno claro, tinta, con su versión de noche", () => {
    const oscuro = paletaPropia("#2F6F73");
    expect(oscuro.letra).toBe("#f6efe6");
    expect(oscuro.fondo).toBe("#2f6f73");
    expect(oscuro.noche).toBeUndefined();
    const claro = paletaPropia("#f4d35e");
    expect(claro.letra).toBe("#1a1a18");
    expect(claro.noche?.letra).toBe("#f6efe6");
  });

  it("un color que ninguna letra deja leer apaga «Publicar», y el color sugerido sí se lee", () => {
    const medio = "#c0503a";
    const d: DisenoDeCampana = { ...DISENO_DE_SIEMPRE, paleta: "propia", colores: paletaPropia(medio) };
    const r = revisarDiseno(d, conPrendas);
    expect(r.bloquea).toBe(true);
    expect(r.avisos.some((a) => a.tono === "mal")).toBe(true);
    const sugerido = colorQueSeLee(medio);
    expect(contraste("#f6efe6", sugerido)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
  });

  it("la paleta de una prenda clara oscurece su color para el fondo y usa otra prenda de acento", () => {
    const p = paletaDePrenda("De Adelle azul marino", "#1F2A44", "#C9D6EA");
    expect(p.fondo).toBe("#1f2a44");
    expect(p.acento).toBe("#c9d6ea");
    const clara = paletaDePrenda("De Blusa Emma crema", "#EFE6D6", null);
    expect(clara.fondo).not.toBe("#efe6d6");
    expect(seLee({ ...DISENO_DE_SIEMPRE, paleta: "propia", colores: p }, "claro")).toBe(true);
  });

  it("una paleta clara pinta el colibrí negro y la letra del botón en papel", () => {
    const arena = PALETAS.find((p) => p.id === "arena")!;
    const v = variablesDePaleta(arena);
    expect(v["--t-hero-colibri"]).toBe("brightness(0)");
    expect(v["--t-hero-boton-letra"]).toBe("#fbf8f2");
    const cayla = variablesDePaleta(PALETAS[0]);
    // Las de siempre: las que `heroe.css` usa cuando no hay diseño.
    expect(cayla["--t-hero-colibri"]).toBe("brightness(0) invert(1)");
    expect(cayla["--t-hero-boton-letra"]).toBe("#1a1a18");
  });
});

describe("leer un diseño guardado", () => {
  it("rechaza lo que esta versión no conoce o está mal escrito (la tienda cae en el de siempre)", () => {
    const malos: unknown[] = [
      null,
      "texto",
      { ...DISENO_DE_SIEMPRE, fondo: "video" },
      { ...DISENO_DE_SIEMPRE, paleta: "no-existe" },
      { ...DISENO_DE_SIEMPRE, paleta: "propia" },
      { ...DISENO_DE_SIEMPRE, colores: paletaPropia("#2f6f73") },
      { ...DISENO_DE_SIEMPRE, paleta: "propia", colores: { ...paletaPropia("#2f6f73"), fondo: "rojo" } },
      { ...DISENO_DE_SIEMPRE, frase: "x".repeat(61) },
      { ...DISENO_DE_SIEMPRE, prendas: [] },
      { ...DISENO_DE_SIEMPRE, prendas: [UNO, UNO, UNO, UNO, UNO] },
      { ...DISENO_DE_SIEMPRE, prendas: ["no-es-un-id"] },
      { ...DISENO_DE_SIEMPRE, corte: -1 },
      { ...DISENO_DE_SIEMPRE, cuenta: "sí" },
    ];
    for (const m of malos) expect(leerDiseno(m)).toBeNull();
  });

  it("lee uno propio con su versión de noche", () => {
    const d = { ...DISENO_DE_SIEMPRE, paleta: "propia", colores: paletaPropia("#f4d35e") };
    expect(leerDiseno(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("compara dos diseños sin importar el orden de sus campos", () => {
    const desordenado = Object.fromEntries(Object.entries(DISENO_DE_SIEMPRE).reverse()) as DisenoDeCampana;
    expect(mismoDiseno(DISENO_DE_SIEMPRE, desordenado)).toBe(true);
    expect(mismoDiseno(DISENO_DE_SIEMPRE, { ...DISENO_DE_SIEMPRE, frase: "Hola" })).toBe(false);
  });
});

describe("la revisión", () => {
  it("sin prendas avisa que saldrá la tarjeta del Club; con «Solo letras» no dice nada de prendas", () => {
    const sin = revisarDiseno(DISENO_DE_SIEMPRE, { prendas: 0, prendasConFoto: 0 });
    expect(sin.avisos.map((a) => a.texto)).toContain("Sin prendas, la portada pondrá la tarjeta del Club en vez de fotos.");
    const letras = revisarDiseno({ ...DISENO_DE_SIEMPRE, acomodo: "letras" }, { prendas: 0, prendasConFoto: 0 });
    expect(letras.avisos.every((a) => !/prenda/i.test(a.texto))).toBe(true);
  });

  it("con prendas sin foto avisa que saldrá su dibujo; con foto, lo da por bueno", () => {
    expect(revisarDiseno(DISENO_DE_SIEMPRE, { prendas: 2, prendasConFoto: 0 }).avisos.some((a) => a.tono === "ojo" && /dibujo/.test(a.texto))).toBe(true);
    expect(revisarDiseno(DISENO_DE_SIEMPRE, conPrendas).avisos.some((a) => a.tono === "ok" && /foto/.test(a.texto))).toBe(true);
  });

  it("una frase larga y un dibujo fuerte avisan, pero no apagan «Publicar»", () => {
    const r = revisarDiseno({ ...DISENO_DE_SIEMPRE, fondo: "dibujo", intensidad: "fuerte", frase: "x".repeat(50) }, conPrendas);
    expect(r.avisos.filter((a) => a.tono === "ojo")).toHaveLength(2);
    expect(r.bloquea).toBe(false);
  });
});

describe("las paletas sacadas de las prendas de la campaña", () => {
  it("solo las que se leen, primero las más oscuras, sin repetir un color y hasta tres", async () => {
    const { paletasDeLasPrendas } = await import("./colores-de-prendas");
    const p = paletasDeLasPrendas([
      { nombre: "Adelle", colores: [{ nombre: "Azul marino", hex: "#1F2A44" }, { nombre: "Celeste", hex: "#C9D6EA" }] },
      { nombre: "Blusa Emma", colores: [{ nombre: "Negro", hex: "#111111" }, { nombre: "Azul marino", hex: "#1f2a44" }] },
      { nombre: "Top Luna", colores: [{ nombre: "Rojo", hex: "#BD332D" }, { nombre: "Verde", hex: "#2F5640" }, { nombre: "Mal", hex: "rojo" }] },
    ]);
    expect(p.length).toBeLessThanOrEqual(3);
    expect(p[0]?.nombre).toBe("De Blusa Emma negro");
    expect(new Set(p.map((x) => x.fondo)).size).toBe(p.length);
    const marino = paletasDeLasPrendas([{ nombre: "Adelle", colores: [{ nombre: "Azul marino", hex: "#1F2A44" }, { nombre: "Celeste", hex: "#C9D6EA" }] }]);
    // El acento sale de otra prenda clara del mismo modelo.
    expect(marino[0]?.acento).toBe("#c9d6ea");
    for (const x of p) {
      const d = { ...DISENO_DE_SIEMPRE, paleta: "propia", colores: x };
      expect(seLee(d, "claro") && seLee(d, "oscuro")).toBe(true);
    }
  });
});

describe("lo que la tienda pinta (actividad 5)", () => {
  it("un diseño que se lee y esta versión sabe leer pasa tal cual", () => {
    const bosque = { ...DISENO_DE_SIEMPRE, paleta: "bosque" };
    expect(disenoParaPintar(bosque)).toEqual(bosque);
  });
  it("sin diseño, uno con una opción que esta versión no conoce, o uno cuya letra no se lee: la portada de siempre (null)", () => {
    expect(disenoParaPintar(null)).toBeNull();
    expect(disenoParaPintar({ ...DISENO_DE_SIEMPRE, acomodo: "video" })).toBeNull();
    const ilegible = { ...DISENO_DE_SIEMPRE, paleta: "propia", colores: { nombre: "Mi color", fondo: "#f6efe6", fondo2: "#ffffff", letra: "#f5f0e8", acento: "#ffffff" } };
    expect(leerDiseno(ilegible)).not.toBeNull();
    expect(disenoParaPintar(ilegible)).toBeNull();
  });

  it("lleva los colores de día y de noche, con los mismos nombres que el héroe lee", () => {
    const arena = paletaPorId("arena");
    const v = variablesDeLosDosTemas(arena);
    const dia = variablesDePaleta(coloresEnTema(arena, "claro"));
    const noche = variablesDePaleta(coloresEnTema(arena, "oscuro"));
    for (const k of Object.keys(dia)) {
      expect(v[k.replace("--t-hero", "--t-dia")]).toBe(dia[k as keyof typeof dia]);
      expect(v[k.replace("--t-hero", "--t-noche")]).toBe(noche[k as keyof typeof noche]);
    }
    expect(v["--t-noche"]).not.toBe(v["--t-dia"]);
  });

  // heroe.css es el que elige, según el tema de la tienda, qué colores se pintan: si falta una variable en un tema, ese tema mezclaría
  // los colores de siempre con los del diseño.
  it("heroe.css pasa cada variable del diseño a las del héroe, de día y de noche (en los dos selectores del tema oscuro)", () => {
    const css = readFileSync(new URL("./heroe.css", import.meta.url), "utf8");
    const bloques = [...css.matchAll(/\.t-hero\[data-diseno\] \{([^}]*)\}/g)].map((m) => m[1]!);
    expect(bloques).toHaveLength(3);
    const nombres = Object.keys(variablesDePaleta(coloresEnTema(paletaPorId("cayla"), "claro")));
    const [dia, ...noches] = bloques;
    for (const k of nombres) {
      expect(dia).toContain(`${k}: var(${k.replace("--t-hero", "--t-dia")});`);
      for (const n of noches) expect(n).toContain(`${k}: var(${k.replace("--t-hero", "--t-noche")});`);
    }
  });
});
