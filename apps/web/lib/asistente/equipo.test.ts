import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import { CLASES, claseDe, filtrarPreguntas, leerPreguntasEquipo, nombreDeGuia, nombreDeModulo, ORDEN_CLASES, porcentaje, queRespondio, respuestaCorta } from "./equipo";

// Los tipos que puede tener una pregunta: el `check` de `asistente_preguntas.tipo` (20261026235000).
const TIPOS = ["guia", "sin_acceso", "regla", "error", "no_existe", "fuera_de_tema", "basico"] as const;

describe("claseDe", () => {
  it("cada tipo de la base cae en una sola caja, y las cinco cajas tienen algo", () => {
    const cajas = new Set(TIPOS.map(claseDe));
    expect([...cajas].sort()).toEqual([...ORDEN_CLASES].sort());
  });
  it("lo que la llevó, le dio la regla o le explicó el error está resuelto", () => {
    expect(["guia", "regla", "error"].map(claseDe)).toEqual(["resuelta", "resuelta", "resuelta"]);
  });
  it("un tipo desconocido no se pierde de las cifras", () => {
    expect(claseDe("otro")).toBe("sin_ia");
  });
});

describe("queRespondio", () => {
  it("«sin respuesta» se parte por lo que preguntaba", () => {
    expect(queRespondio({ tipo: "no_existe", tema: "regla", motivo: null })).toBe("Regla sin escribir");
    expect(queRespondio({ tipo: "no_existe", tema: "por_que", motivo: null })).toBe("Error sin explicar");
    expect(queRespondio({ tipo: "no_existe", tema: "como_hacer", motivo: null })).toBe("No existe en CAYLA");
  });
  it("sin IA dice por qué", () => {
    expect(queRespondio({ tipo: "basico", tema: null, motivo: "tope" })).toMatch(/tope/);
    expect(queRespondio({ tipo: "basico", tema: null, motivo: "sin_respuesta" })).toMatch(/no respondió a tiempo/);
  });
  it("todo tipo tiene su frase", () => {
    for (const t of TIPOS) expect(queRespondio({ tipo: t, tema: null, motivo: null })).not.toBe("");
  });
});

describe("nombres", () => {
  it("una guía que existe da el nombre de su pantalla; una que ya no, nada", () => {
    expect(nombreDeGuia(GUIAS[0]!.id)).toBe(GUIAS[0]!.titulo);
    expect(nombreDeGuia("ya-no-existe")).toBeNull();
    expect(nombreDeGuia(null)).toBeNull();
  });
  it("un módulo da su nombre de Roles y accesos", () => {
    expect(nombreDeModulo("por_pagar")).toBeTruthy();
    expect(nombreDeModulo("preguntas_equipo")).toBe("Preguntas del equipo");
  });
});

describe("leerPreguntasEquipo", () => {
  const base = {
    cifras: { total: 5, personas: 2, sirvio_si: 2, sirvio_no: 1, gasto_usd: "0.0065" },
    clases: [
      { tipo: "guia", tema: "como_hacer", n: 2, no: 0 },
      { tipo: "regla", tema: "regla", n: 1, no: 0 },
      { tipo: "no_existe", tema: "regla", n: 1, no: 1 },
      { tipo: "sin_acceso", tema: "como_hacer", n: 1, no: 0 },
    ],
    pantallas: [{ guia_id: "caja", n: 2, no: 0 }, { guia_id: null, n: 9 }],
    accesos: [{ modulo: "por_pagar", n: 1 }],
    preguntas: [
      { id: "a", creada_en: "2026-10-27T15:00:00Z", persona: "Micaela Ruiz", persona_id: "p", sede: "Tienda Trujillo", ruta: "/vender", pregunta: "¿Cómo aparto?", tipo: "no_existe", tema: "como_hacer", sirvio: false, comentario: "Sin adelanto" },
      { id: "b", creada_en: "2026-10-27T14:00:00Z", pregunta: "¿Cómo cierro?", tipo: "guia", sirvio: null },
      { id: "c", pregunta: "sin fecha", tipo: "guia" },
    ],
  };

  it("junta las cajas, lee las cifras (también un número en texto) y salta lo que no entiende", () => {
    const d = leerPreguntasEquipo(base)!;
    expect(d.cifras).toEqual({ total: 5, personas: 2, sirvioSi: 2, sirvioNo: 1, gastoUsd: 0.0065 });
    expect(d.porClase).toEqual({ resuelta: 3, sin_respuesta: 1, sin_acceso: 1, sin_ia: 0, fuera_de_tema: 0 });
    expect(d.pantallas).toEqual([{ guiaId: "caja", n: 2, no: 0 }]);
    expect(d.preguntas.map((p) => p.id)).toEqual(["a", "b"]);
    expect(d.preguntas[1]).toMatchObject({ persona: null, sede: null, ruta: "/", sirvio: null });
  });

  it("sin cifras no se dibujan ceros: devuelve null", () => {
    expect(leerPreguntasEquipo(null)).toBeNull();
    expect(leerPreguntasEquipo([])).toBeNull();
    expect(leerPreguntasEquipo({ preguntas: [] })).toBeNull();
  });

  it("filtra por caja y por «no le sirvió»", () => {
    const d = leerPreguntasEquipo(base)!;
    expect(filtrarPreguntas(d.preguntas, "todas")).toHaveLength(2);
    expect(filtrarPreguntas(d.preguntas, "sin_respuesta").map((p) => p.id)).toEqual(["a"]);
    expect(filtrarPreguntas(d.preguntas, "no_sirvio").map((p) => p.id)).toEqual(["a"]);
    expect(filtrarPreguntas(d.preguntas, "sin_acceso")).toEqual([]);
  });
});

describe("porcentaje", () => {
  it("redondea y no divide entre cero", () => {
    expect(porcentaje(3, 5)).toBe("60 %");
    expect(porcentaje(1, 3)).toBe("33 %");
    expect(porcentaje(0, 0)).toBeNull();
  });
});

describe("respuestaCorta (Formidable 2026-10-27: lo importante primero, sin cortarse)", () => {
  const base = { tema: null, motivo: null, guiaId: null, modulo: null };
  it("dice a qué pantalla la llevó y qué acceso le falta, por su nombre", () => {
    expect(respuestaCorta({ ...base, tipo: "guia", guiaId: GUIAS[0]!.id })).toBe(`→ ${GUIAS[0]!.titulo}`);
    expect(respuestaCorta({ ...base, tipo: "sin_acceso", modulo: "preguntas_equipo" })).toBe("Le falta: Preguntas del equipo");
  });
  it("sin pantalla o sin módulo conocidos, la frase de siempre", () => {
    expect(respuestaCorta({ ...base, tipo: "guia", guiaId: "ya-no-existe" })).toBe("La llevó a la pantalla");
    expect(respuestaCorta({ ...base, tipo: "sin_acceso" })).toBe("Le falta un acceso");
    expect(respuestaCorta({ ...base, tipo: "no_existe", tema: "regla" })).toBe("Regla sin escribir");
  });
  it("ninguna caja se dibuja tachada: tachado es «anulada», y toda pregunta cuenta", () => {
    for (const c of ORDEN_CLASES) expect(CLASES[c].tono).not.toBe("apagado");
  });
});
