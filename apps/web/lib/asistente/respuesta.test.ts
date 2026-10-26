import { describe, expect, it } from "vitest";
import type { Guia } from "../guias/tipos";
import type { Sugerencia } from "./preseleccion";
import { costoEnDolares, INSTRUCCIONES, mensajeDePregunta, revisarRespuesta, type RespuestaDeLaIA } from "./respuesta";

const guia: Guia = {
  id: "vender.comprobantes",
  ruta: "/vender/comprobantes",
  titulo: "Comprobantes",
  resumen: "Las boletas y facturas emitidas.",
  pasos: [
    { id: "hola", ancla: null, titulo: "Bienvenida", texto: "Esta es la pantalla." },
    { id: "lista", ancla: "comprobantes.lista", titulo: "Cada comprobante", texto: "Toca uno para ver su detalle y anularlo." },
  ],
};
const sugerencias: Sugerencia[] = [{ guia, href: "/vender/comprobantes", paso: guia.pasos[1] ?? null, puntos: 6 }];
const ia = (r: Partial<RespuestaDeLaIA>): RespuestaDeLaIA => ({ tipo: "guia", texto: "Te llevo a Comprobantes.", guia_id: guia.id, paso_id: "lista", ...r });

describe("revisarRespuesta: solo se le cree a la IA lo que estaba en la lista", () => {
  it("una guía y un paso de la lista pasan tal cual", () => {
    expect(revisarRespuesta(ia({}), sugerencias)).toEqual({ tipo: "guia", texto: "Te llevo a Comprobantes.", guiaId: guia.id, pasoId: "lista" });
  });

  it("una guía que no estaba en la lista manda a la búsqueda sin IA", () => {
    expect(revisarRespuesta(ia({ guia_id: "finanzas.inventada" }), sugerencias)).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
  });

  it("un paso inventado (o la bienvenida, que no se puede señalar) se descarta, y la guía sirve igual", () => {
    expect(revisarRespuesta(ia({ paso_id: "boton-anular" }), sugerencias)).toMatchObject({ tipo: "guia", pasoId: null });
    expect(revisarRespuesta(ia({ paso_id: "hola" }), sugerencias)).toMatchObject({ tipo: "guia", pasoId: null });
    expect(revisarRespuesta(ia({ paso_id: "" }), sugerencias)).toMatchObject({ tipo: "guia", pasoId: null });
  });

  it("«no existe» y «fuera de tema» pasan con su texto, sin guía", () => {
    expect(revisarRespuesta(ia({ tipo: "no_existe", texto: "Eso todavía no se puede hacer.", guia_id: "", paso_id: "" }), [])).toEqual({ tipo: "no_existe", texto: "Eso todavía no se puede hacer." });
    expect(revisarRespuesta(ia({ tipo: "fuera_de_tema", texto: "Solo te ayudo con el sistema." }), sugerencias)).toEqual({ tipo: "fuera_de_tema", texto: "Solo te ayudo con el sistema." });
  });

  it("sin respuesta o con un texto vacío, búsqueda sin IA", () => {
    expect(revisarRespuesta(null, sugerencias)).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
    expect(revisarRespuesta(ia({ texto: "   " }), sugerencias)).toEqual({ tipo: "basico", motivo: "respuesta_invalida" });
  });

  it("un texto largo se corta en una frase, nunca a media palabra", () => {
    const largo = `${"Primero ve a Comprobantes y busca la boleta del cliente. ".repeat(8)}Fin`;
    const r = revisarRespuesta(ia({ texto: largo }), sugerencias);
    expect(r.tipo === "guia" && r.texto.length <= 320 && r.texto.endsWith(".")).toBe(true);
  });
});

describe("lo que se le manda a la IA", () => {
  it("las instrucciones no cambian entre preguntas (la caché las reusa): sin fechas ni nombres", () => {
    expect(INSTRUCCIONES).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(INSTRUCCIONES).not.toContain("<pregunta>\n");
  });

  it("el mensaje lleva las guías con sus pasos señalables y la pregunta marcada como dato, al final", () => {
    const m = mensajeDePregunta("¿Cómo anulo una boleta?", sugerencias);
    expect(m).toContain('<guia id="vender.comprobantes"');
    expect(m).toContain("paso lista: Cada comprobante");
    expect(m).not.toContain("paso hola");
    expect(m.trimEnd().endsWith("¿Cómo anulo una boleta?\n</pregunta>")).toBe(true);
  });
});

describe("costoEnDolares", () => {
  it("Haiku 5.5: US$0,10 la entrada y US$0,50 la salida por millón", () => {
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1);
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 0, output_tokens: 1_000_000 })).toBeCloseTo(0.5);
  });

  it("lo leído de la caché cuesta la décima parte, lo escrito 1,25 veces", () => {
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.01);
    expect(costoEnDolares("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(0.125);
  });

  it("un modelo sin precio conocido cuenta como el más caro: el tope se pasa antes, nunca después", () => {
    expect(costoEnDolares("otro", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(2);
  });
});
