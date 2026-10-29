import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faltaElInforme, leerDatosInforme, leerInformes, mensajeDelInforme, revisarInforme, semanaDelInforme, TIPOS_MEJORA, type PreguntaDelInforme } from "./informe";

// Una hora de Lima, como instante: Lima está 5 horas detrás de UTC todo el año.
const lima = (fechaHora: string) => Date.parse(`${fechaHora}-05:00`);

describe("semanaDelInforme", () => {
  it("el lunes 7:00 informa la semana anterior completa, de lunes a lunes de Lima", () => {
    expect(semanaDelInforme(lima("2026-10-26T07:00:00"))).toEqual({
      semana: "2026-10-19",
      desde: "2026-10-19T05:00:00.000Z",
      hasta: "2026-10-26T05:00:00.000Z",
    });
  });
  it("un domingo a las 23:30 de Lima (ya lunes en UTC) sigue en la semana de antes", () => {
    expect(semanaDelInforme(lima("2026-10-25T23:30:00")).semana).toBe("2026-10-12");
  });
  it("un martes también informa la semana pasada (el botón, si el lunes no salió)", () => {
    expect(semanaDelInforme(lima("2026-10-27T15:00:00")).semana).toBe("2026-10-19");
  });
  it("la semana siempre empieza en lunes y dura 7 días", () => {
    for (let d = 0; d < 14; d++) {
      const s = semanaDelInforme(lima("2026-10-26T12:00:00") + d * 864e5);
      expect(new Date(`${s.semana}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(Date.parse(s.hasta) - Date.parse(s.desde)).toBe(7 * 864e5);
    }
  });
});

const PREGUNTAS: PreguntaDelInforme[] = [
  { id: "11111111-1111-4111-8111-111111111111", sede: "Tienda Trujillo", pregunta: "¿Cómo aparto sin adelanto?", tipo: "no_existe", tema: "como_hacer", guiaId: null, modulo: null, sirvio: false, comentario: "sin plata" },
  { id: "22222222-2222-4222-8222-222222222222", sede: "Tienda Lima", pregunta: "¿Dónde veo lo que debo?", tipo: "sin_acceso", tema: "como_hacer", guiaId: "por-pagar", modulo: "por_pagar", sirvio: null, comentario: null },
];
const describir = { respuesta: () => "No existe en CAYLA", guia: (id: string | null) => (id ? "Por pagar" : null), modulo: (c: string | null) => (c ? "Por pagar" : null) };

describe("mensajeDelInforme", () => {
  it("cada pregunta va con su referencia corta, sin la sede ni ids de la base", () => {
    const { mensaje, refs } = mensajeDelInforme(PREGUNTAS, describir);
    expect(mensaje).toContain("p1 |");
    expect(mensaje).toContain("NO le sirvió");
    expect(mensaje).toContain("buscaba: «sin plata»");
    expect(mensaje).not.toContain("Trujillo");
    expect(mensaje).not.toContain(PREGUNTAS[0]!.id);
    expect(refs.get("p2")).toBe(PREGUNTAS[1]!.id);
  });
});

describe("revisarInforme", () => {
  const { refs } = mensajeDelInforme(PREGUNTAS, describir);
  it("traduce las citas a ids y descarta las inventadas y las repetidas", () => {
    const r = revisarInforme({ mejoras: [{ tipo: "funcion_nueva", titulo: "Dejar apartar sin adelanto", detalle: "Lo piden.", preguntas: ["p1", "P1 ", "p99", "x"] }] }, refs);
    expect(r).toEqual([{ tipo: "funcion_nueva", titulo: "Dejar apartar sin adelanto", detalle: "Lo piden.", preguntas: [PREGUNTAS[0]!.id] }]);
  });
  it("una mejora que solo cita inventadas no se guarda", () => {
    expect(revisarInforme({ mejoras: [{ tipo: "capacitar", titulo: "Algo", detalle: "", preguntas: ["p50"] }] }, refs)).toEqual([]);
  });
  it("cinco como mucho, y el título largo se corta a su medida", () => {
    const muchas = Array.from({ length: 8 }, () => ({ tipo: "capacitar" as const, titulo: "x".repeat(200), detalle: "d", preguntas: ["p2"] }));
    const r = revisarInforme({ mejoras: muchas }, refs);
    expect(r).toHaveLength(5);
    expect(r[0]!.titulo.length).toBeLessThanOrEqual(120);
  });
  it("sin respuesta de la IA, ninguna mejora", () => {
    expect(revisarInforme(null, refs)).toEqual([]);
  });
});

describe("leerDatosInforme y leerInformes", () => {
  it("lee las cifras y salta las preguntas que no entiende", () => {
    const d = leerDatosInforme({ cifras: { total: "2", sin_respuesta: 1 }, preguntas: [{ id: "a", pregunta: "¿?", tipo: "guia" }, { id: "b" }] })!;
    expect(d.cifras).toEqual({ total: 2, sin_respuesta: 1 });
    expect(d.preguntas.map((p) => p.id)).toEqual(["a"]);
    expect(leerDatosInforme(null)).toBeNull();
  });

  it("un informe trae sus mejoras con sus preguntas; una mejora sin preguntas o de un tipo raro se salta", () => {
    const [i] = leerInformes([
      {
        id: "i",
        semana: "2026-10-19",
        automatico: true,
        cifras: { total: 12 },
        mejoras: [
          { tipo: "funcion_nueva", titulo: "Dejar apartar sin adelanto", detalle: "d", sedes: ["Tienda Lima"], preguntas: [{ id: "q", pregunta: "¿?", sede: "Tienda Lima", sirvio: false }] },
          { tipo: "capacitar", titulo: "Vacía", preguntas: [] },
          { tipo: "otra", titulo: "Rara", preguntas: [{ id: "q", pregunta: "¿?" }] },
        ],
      },
    ]);
    expect(i).toMatchObject({ semana: "2026-10-19", automatico: true, total: 12 });
    expect(i!.mejoras.map((m) => m.titulo)).toEqual(["Dejar apartar sin adelanto"]);
    expect(i!.mejoras[0]!.sedes).toEqual(["Tienda Lima"]);
  });

  it("falta el informe si la semana pasada no tiene uno", () => {
    const ahora = lima("2026-10-27T10:00:00");
    expect(faltaElInforme([], ahora)).toBe(true);
    expect(faltaElInforme([{ id: "i", semana: "2026-10-19", automatico: true, total: 0, mejoras: [] }], ahora)).toBe(false);
  });

  it("los tipos de mejora son los cinco del ADR y los mismos que acepta la base", () => {
    expect([...TIPOS_MEJORA].sort()).toEqual(["capacitar", "dar_acceso", "escribir_regla", "funcion_nueva", "mover_a_la_vista"]);
    const sql = readFileSync(new URL("../../../../supabase/migrations/20261027183000_asistente_informes.sql", import.meta.url), "utf8");
    const enLaBase = sql.match(/v_mejora ->> 'tipo' not in \(([^)]+)\)/)?.[1]?.match(/'([a-z_]+)'/g)?.map((t) => t.slice(1, -1)) ?? [];
    expect(enLaBase.sort()).toEqual([...TIPOS_MEJORA].sort());
  });
});
