import { describe, expect, it } from "vitest";
import {
  cambio,
  cambioDeLaPrenda,
  de100,
  de100QueVieron,
  dondeSeAtora,
  dondeSeAtoraLaPrenda,
  explicaAtora,
  fraseAtora,
  horaCorta,
  leerResumen,
  periodoSieteDias,
  personas,
  sinNoticias,
} from "./trafico-reglas";

const DE_LA_BASE = {
  desde: "2026-10-17",
  hasta: "2026-10-23",
  anterior_desde: "2026-10-10",
  anterior_hasta: "2026-10-16",
  pasos: [1920, 1274, 633, 394, 178, 139],
  anterior: 2027,
  base: [7700, 5100, 2480, 1530, 690, 540],
  ahora: 9,
  ultimo_dato: "2026-10-23T21:40:00+00:00",
};

describe("leerResumen: lo que devuelve la base", () => {
  it("lee la forma de resumen_trafico_web", () => {
    expect(leerResumen(DE_LA_BASE)).toEqual({
      desde: "2026-10-17",
      hasta: "2026-10-23",
      anteriorDesde: "2026-10-10",
      anteriorHasta: "2026-10-16",
      pasos: [1920, 1274, 633, 394, 178, 139],
      anterior: 2027,
      base: [7700, 5100, 2480, 1530, 690, 540],
      ahora: 9,
      ultimoDato: "2026-10-23T21:40:00+00:00",
      prendas: [],
    });
  });
  it("sin ningún paso todavía, el último dato es null", () => {
    expect(leerResumen({ ...DE_LA_BASE, ultimo_dato: null })?.ultimoDato).toBeNull();
  });
  it("una forma rara no se lee (no se inventa)", () => {
    expect(leerResumen(null)).toBeNull();
    expect(leerResumen({ ...DE_LA_BASE, pasos: [1, 2, 3] })).toBeNull();
    expect(leerResumen({ ...DE_LA_BASE, pasos: [1, 2, 3, 4, 5, -1] })).toBeNull();
    expect(leerResumen({ ...DE_LA_BASE, desde: "23/10/2026" })).toBeNull();
  });
});

describe("el período y las cifras", () => {
  it("7 días cuenta hoy", () => expect(periodoSieteDias("2026-10-23")).toEqual({ desde: "2026-10-17", hasta: "2026-10-23" }));
  it("de cada 100", () => {
    expect(de100(1274, 1920)).toBe(66);
    expect(de100(5, 0)).toBe(0);
  });
  it("el cambio contra los días de antes, solo con gente suficiente para comparar", () => {
    expect(cambio(1920, 2027)).toBe(-5);
    expect(cambio(6652, 3465)).toBe(92);
    expect(cambio(6, 3)).toBeNull();
  });
  it("singular y plural", () => {
    expect(personas(1)).toBe("1 persona");
    expect(personas(1920)).toBe("1,920 personas");
  });
  it("la hora de Lima, en 12 horas", () => {
    expect(horaCorta("2026-10-23T20:10:00Z")).toBe("3:10 p. m.");
    expect(horaCorta("2026-10-23T05:05:00Z")).toBe("12:05 a. m.");
    expect(horaCorta("2026-10-23")).toBeNull();
  });
});

describe("dondeSeAtora: el paso que deja pasar a menos gente de la que le llega", () => {
  it("con mucha gente, manda lo de estos días (aquí, separar: de 394 que la pusieron en la bolsa, 178 separaron)", () => {
    const a = dondeSeAtora(DE_LA_BASE.pasos, DE_LA_BASE.base)!;
    expect(a).toEqual({ i: 4, llegaron: 394, siguieron: 178, seFueronDe100: 55, pocas: false });
    expect(fraseAtora(a)).toEqual({ titular: "Se atora al separar", frase: "de cada 100 que la pusieron en la bolsa, 55 se fueron sin separar." });
  });

  it("con muy poca gente, dos personas no mueven el veredicto: manda lo de costumbre", () => {
    // 4 entraron, 3 vieron, 3 eligieron talla, 3 a la bolsa, 3 separaron, 1 recogió: crudo, «al recoger» (1 de 3) sería lo peor.
    const a = dondeSeAtora([4, 3, 3, 3, 3, 1], DE_LA_BASE.base)!;
    expect(a.i).toBe(4);
    expect(a.pocas).toBe(true);
    expect(explicaAtora(a)).toContain("tómalo como una pista");
  });

  it("singular y plural en la explicación", () => {
    expect(explicaAtora({ i: 4, llegaron: 1, siguieron: 0, seFueronDe100: 100, pocas: true })).toContain("de 1 persona que la puso en la bolsa, 0 separaron.");
    expect(explicaAtora({ i: 4, llegaron: 394, siguieron: 1, seFueronDe100: 100, pocas: false })).toContain("de 394 personas que la pusieron en la bolsa, 1 separó.");
  });

  it("sin costumbre (los primeros días), manda lo de estos días", () => {
    expect(dondeSeAtora([100, 30, 20, 15, 10, 9], [0, 0, 0, 0, 0, 0])!.i).toBe(1);
  });

  it("si nadie llegó a un paso en estos días, se dice así y no con un «de cada 100» inventado", () => {
    const a = dondeSeAtora([5, 0, 0, 0, 0, 0], DE_LA_BASE.base)!;
    expect(a.llegaron).toBeGreaterThanOrEqual(0);
    expect(fraseAtora({ ...a, i: 4, llegaron: 0, siguieron: 0 }).frase).toBe("en estos días nadie llegó hasta ahí; de costumbre, es donde más gente se va.");
  });

  it("sin nadie que entró, no hay veredicto", () => expect(dondeSeAtora([0, 0, 0, 0, 0, 0], DE_LA_BASE.base)).toBeNull());
});

describe("sinNoticias: la tienda dejó de mandar visitas", () => {
  const ultimo = "2026-10-23T15:10:00Z"; // 10:10 a. m. en Lima
  it("en horario de tienda, más de 2 horas sin nada: avisa desde cuándo", () => {
    expect(sinNoticias(ultimo, new Date("2026-10-23T18:00:00Z"))).toEqual({ desde: "las 10:10 a. m." });
  });
  it("menos de 2 horas, o de madrugada, no avisa", () => {
    expect(sinNoticias(ultimo, new Date("2026-10-23T16:30:00Z"))).toBeNull();
    expect(sinNoticias("2026-10-23T03:00:00Z", new Date("2026-10-23T08:30:00Z"))).toBeNull(); // 3:30 a. m. en Lima
  });
  it("si lo último es de otro día, lo dice con la fecha", () => {
    expect(sinNoticias("2026-10-22T20:00:00Z", new Date("2026-10-23T16:00:00Z"))).toEqual({ desde: "el 22 de octubre, 3:00 p. m." });
  });
  it("sin ningún paso nunca, no es un corte: es que todavía no empezó", () => expect(sinNoticias(null, new Date())).toBeNull());
});

const PRENDA_DE_LA_BASE = {
  id: "9b0c7d10-0689-4780-9493-79093027a3dc",
  nombre: "Blazer Camila",
  codigo: "BLZ-0001",
  categoria: "Blazers",
  prefijo: "BLZ",
  familia: "SUP",
  precio: 189.9,
  foto: null,
  colores_catalogo: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18" }],
  miraron: 120,
  talla: 70,
  bolsa: 40,
  separaron: 12,
  recogieron: 9,
  anterior: 100,
  tallas: [{ talla: "M", n: 40 }, { talla: "S", n: 30 }],
  colores: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18", n: 70 }],
  caminos: [{ camino: "instagram", n: 80 }, { camino: "directo", n: 40 }],
};

describe("las prendas del período", () => {
  it("lee cada prenda con su recorrido, lo que eligieron y de dónde vinieron", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] });
    expect(r?.prendas[0]).toEqual({
      id: "9b0c7d10-0689-4780-9493-79093027a3dc",
      nombre: "Blazer Camila",
      codigo: "BLZ-0001",
      categoria: "Blazers",
      prefijo: "BLZ",
      familia: "SUP",
      precio: 189.9,
      foto: null,
      coloresCatalogo: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18" }],
      recorrido: [120, 70, 40, 12, 9],
      anterior: 100,
      tallas: [{ talla: "M", n: 40 }, { talla: "S", n: 30 }],
      colores: [{ codigo: "NEG", nombre: "Negro", hex: "#1a1a18", n: 70 }],
      caminos: [{ camino: "instagram", n: 80 }, { camino: "directo", n: 40 }],
    });
  });

  it("una prenda con otra forma se salta; las demás quedan", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, miraron: -1 }, PRENDA_DE_LA_BASE, "basura"] });
    expect(r?.prendas).toHaveLength(1);
  });

  it("un camino que la pantalla no conoce no se dibuja", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, caminos: [{ camino: "fax", n: 3 }] }] });
    expect(r?.prendas[0].caminos).toEqual([]);
  });

  it("el precio llega como texto (numeric de Postgres) y se lee como número", () => {
    const r = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, precio: "89.90" }] });
    expect(r?.prendas[0].precio).toBe(89.9);
  });

  it("una base de antes, sin prendas, da la vitrina vacía", () => {
    expect(leerResumen(DE_LA_BASE)?.prendas).toEqual([]);
  });

  it("de cada 100 que vieron una prenda, cuántos miraron esta", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0];
    expect(de100QueVieron(p, 1274)).toBe(9);
  });

  it("dónde se atora la prenda: el paso que pierde más gente, contra lo de costumbre", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0];
    // De 40 en la bolsa, 12 la separaron: pierde más que lo de costumbre (690 de 1530).
    expect(dondeSeAtoraLaPrenda(p, DE_LA_BASE.base)?.i).toBe(3);
  });

  it("con pocas personas, la prenda no tiene un paso «malo»", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [{ ...PRENDA_DE_LA_BASE, miraron: 6, talla: 4, bolsa: 2, separaron: 0, recogieron: 0 }] })!.prendas[0];
    expect(dondeSeAtoraLaPrenda(p, DE_LA_BASE.base)).toBeNull();
  });

  it("el cambio contra antes, en palabras", () => {
    const p = leerResumen({ ...DE_LA_BASE, prendas: [PRENDA_DE_LA_BASE] })!.prendas[0];
    expect(cambioDeLaPrenda(p)).toEqual({ tono: "verde", texto: "20 % más que antes", sube: 20 });
    expect(cambioDeLaPrenda({ ...p, anterior: 120 }).texto).toBe("Igual que antes");
    expect(cambioDeLaPrenda({ ...p, anterior: 5 }).texto).toBe("Pocas personas para comparar");
    expect(cambioDeLaPrenda({ ...p, anterior: 150 })).toEqual({ tono: "ambar", texto: "20 % menos que antes", sube: -20 });
  });
});
