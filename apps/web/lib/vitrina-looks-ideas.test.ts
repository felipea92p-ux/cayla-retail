import { describe, expect, it } from "vitest";
import { colorUnico, ideasParaLook, seParecen, siluetaDe, ventanaDeIdeas, type PrendaParaIdeas } from "./vitrina-looks-ideas";
import { MAX_FRASE_LOOK, MAX_NOMBRE_LOOK } from "./vitrina-looks-reglas";

const p = (clave: string | null, familia: string | null = "indumentaria", color: string | null = "Negro"): PrendaParaIdeas => ({ clave, familia, color });
const NADA = { nombres: [], frases: [] };

describe("qué tipo de look es, por los grupos de sus prendas (la misma tabla de la tienda)", () => {
  it("un vestido, tres capas, dos piezas, ropa con abrigo, ropa con detalles y solo detalles", () => {
    expect(siluetaDe([p("VES"), p("CAR", "accesorios")])).toBe("vestido");
    expect(siluetaDe([p("BLU"), p("PAN"), p("CAS")])).toBe("capas");
    expect(siluetaDe([p("BLU"), p("PAN")])).toBe("dos_piezas");
    expect(siluetaDe([p("BLU"), p("CAS")])).toBe("con_abrigo");
    expect(siluetaDe([p("BLU"), p("PAN"), p("CAR", "accesorios")])).toBe("con_detalles");
    expect(siluetaDe([p("ARE", "bisuteria"), p("CAR", "accesorios")])).toBe("solo_detalles");
  });

  it("una categoría que la tabla no conoce cae según su familia, y sin nada, en lo general", () => {
    expect(siluetaDe([p("XYZ", "calzado"), p("ARE", "bisuteria")])).toBe("solo_detalles");
    expect(siluetaDe([p(null, null), p(null, null)])).toBe("general");
  });
});

describe("el color que comparten todas las prendas", () => {
  it("solo cuenta si TODAS lo tienen y hay al menos dos prendas", () => {
    expect(colorUnico([p("BLU", "indumentaria", "Negro"), p("PAN", "indumentaria", "negro")])).toBe("negro");
    expect(colorUnico([p("BLU", "indumentaria", "Negro"), p("PAN", "indumentaria", "Beige")])).toBeNull();
    expect(colorUnico([p("BLU", "indumentaria", "Negro"), p("PAN", "indumentaria", null)])).toBeNull();
    expect(colorUnico([p("BLU")])).toBeNull();
  });
});

describe("cuándo dos textos se parecen", () => {
  it("el mismo, sin tildes ni mayúsculas, uno dentro del otro, o más de la mitad de sus palabras", () => {
    expect(seParecen("Look del día", "LOOK DEL DIA")).toBe(true);
    expect(seParecen("Capas con estilo", "Capas con estilo y color")).toBe(true);
    expect(seParecen("Básicos que combinan", "Básicos que se combinan")).toBe(true);
    expect(seParecen("Look del día", "Plan especial")).toBe(false);
    expect(seParecen("", "algo")).toBe(false);
  });

  it("las palabras que no distinguen (de, para, un…) no hacen parecidos a dos textos", () => {
    expect(seParecen("Una idea para hoy", "Una mezcla para salir")).toBe(false);
  });
});

describe("las ideas para un look", () => {
  const dos = [p("BLU"), p("PAN", "indumentaria", "Beige")];

  it("con menos de dos prendas no se sugiere nada", () => {
    expect(ideasParaLook([], NADA)).toEqual({ nombres: [], frases: [] });
    expect(ideasParaLook([p("BLU")], NADA)).toEqual({ nombres: [], frases: [] });
  });

  it("sale de la tabla de su silueta primero, y es estable: la misma elección da las mismas ideas", () => {
    const a = ideasParaLook(dos, NADA);
    expect(a.nombres[0]).toBe("Combinación de diario");
    expect(ideasParaLook(dos, NADA)).toEqual(a);
    // Otra silueta, otras ideas.
    expect(ideasParaLook([p("VES"), p("CAR", "accesorios", "Beige")], NADA).nombres[0]).toBe("Vestido con carácter");
  });

  it("si todas las prendas son del mismo color, la primera idea lo dice", () => {
    const i = ideasParaLook([p("BLU"), p("PAN")], NADA);
    expect(i.nombres.slice(0, 2)).toEqual(["Total negro", "Todo en negro"]);
    expect(i.frases[0]).toBe("Todo en negro: cero dudas al combinar.");
  });

  it("deja fuera lo que se parece a un nombre o a una frase que ya existe (otro look o lo que ya se escribió)", () => {
    const i = ideasParaLook(dos, { nombres: ["Combinación de diario", "todo terreno"], frases: ["Una combinación fácil de repetir toda la semana"] });
    expect(i.nombres).not.toContain("Combinación de diario");
    expect(i.nombres).not.toContain("Todo terreno");
    expect(i.frases).not.toContain("Una combinación fácil de repetir toda la semana.");
    expect(i.nombres.length).toBeGreaterThan(3);
  });

  it("ninguna idea se parece a otra de la misma lista, y todas caben en lo que acepta la base", () => {
    for (const prendas of [dos, [p("VES"), p("CAR", "accesorios")], [p("BLU"), p("PAN"), p("CAS")], [p("ARE", "bisuteria"), p("CAR", "accesorios")]]) {
      const i = ideasParaLook(prendas, NADA);
      for (const lista of [i.nombres, i.frases]) {
        for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) expect(seParecen(lista[a]!, lista[b]!)).toBe(false);
      }
      expect(i.nombres.every((n) => n.length <= MAX_NOMBRE_LOOK)).toBe(true);
      expect(i.frases.every((f) => f.length <= MAX_FRASE_LOOK)).toBe(true);
    }
  });

  it("si todo está ocupado, la lista queda vacía y nunca repite un texto", () => {
    const todo = ideasParaLook(dos, NADA);
    const i = ideasParaLook(dos, { nombres: todo.nombres, frases: todo.frases });
    expect(i).toEqual({ nombres: [], frases: [] });
  });
});

describe("«Otras ideas»: la ventana de tres", () => {
  const ideas = ["a", "b", "c", "d", "e", "f", "g"];
  it("corre de a tres, vuelve al principio y con tres o menos las muestra todas", () => {
    expect(ventanaDeIdeas(ideas, 0)).toEqual(["a", "b", "c"]);
    expect(ventanaDeIdeas(ideas, 1)).toEqual(["d", "e", "f"]);
    expect(ventanaDeIdeas(ideas, 2)).toEqual(["g", "a", "b"]);
    expect(ventanaDeIdeas(["a", "b"], 5)).toEqual(["a", "b"]);
    expect(ventanaDeIdeas([], 0)).toEqual([]);
  });
});
