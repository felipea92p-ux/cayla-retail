import { describe, expect, it } from "vitest";
import {
  cambio,
  de100,
  dondeSeAtora,
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
