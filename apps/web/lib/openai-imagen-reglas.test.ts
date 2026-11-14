import { describe, expect, it } from "vitest";
import {
  camposOpenAI,
  costoDeUso,
  imagenDeRespuesta,
  mensajeDeErrorOpenAI,
  mensajeParaTienda,
  pedidoDeCatalogo,
  PROMPT_CATALOGO,
  PROMPT_CON_MOLDE,
} from "./openai-imagen-reglas";

describe("camposOpenAI", () => {
  it("pide 4:5, transparente y en PNG, con el modelo que se le pasa", () => {
    expect(camposOpenAI("gpt-image-2.6-sunburst")).toMatchObject({
      model: "gpt-image-2.6-sunburst",
      size: "1024x1280",
      background: "transparent",
      output_format: "png",
      n: "1",
    });
  });

  it("el tamaño es 4:5 y múltiplo de 16 (lo que aceptan los modelos 2.x)", () => {
    const [ancho, alto] = camposOpenAI("x").size.split("x").map(Number);
    expect(ancho / alto).toBeCloseTo(0.8);
    expect(ancho % 16).toBe(0);
    expect(alto % 16).toBe(0);
  });

  it("pide la prenda puesta en un maniquí invisible, sin nada más a la vista, y conservando color y estampado", () => {
    expect(PROMPT_CATALOGO).toMatch(/MANIQUÍ INVISIBLE/);
    expect(PROMPT_CATALOGO).toMatch(/No se ve ningún maniquí, persona, piel, gancho ni perchero/);
    expect(PROMPT_CATALOGO).toMatch(/No cambies el color/);
    expect(PROMPT_CATALOGO).toMatch(/Fondo transparente/);
    // El prompt de octubre que pedía «quita arrugas» y «luz pareja» hacía que redibujara las rayas y borrara las etiquetas.
    expect(PROMPT_CATALOGO).not.toMatch(/arrugas|luz pareja/i);
  });

  it("el maniquí pone la forma y la prenda sus medidas (Felipe 2026-11-14, «Nueva A»)", () => {
    expect(PROMPT_CATALOGO).toMatch(/Lo que pone el MANIQUÍ/);
    for (const regla of ["LARGO", "CORTE", "MANGAS", "BORDES", "ESTAMPADO"]) expect(PROMPT_CATALOGO).toContain(`${regla}:`);
    expect(PROMPT_CATALOGO).toMatch(/no la alargues/);
    // «Como si la llevara una persona de talla estándar» estiraba la prenda (la blusa verde, +8 %): no vuelve.
    expect(PROMPT_CATALOGO).not.toMatch(/talla estándar/);
  });
});

describe("con molde: la misma prenda en todos los colores", () => {
  it("sin molde va el pedido de siempre; con molde, el que copia la estructura y toma solo el color", () => {
    expect(camposOpenAI("m").prompt).toBe(PROMPT_CATALOGO);
    expect(camposOpenAI("m", { conMolde: true }).prompt).toBe(PROMPT_CON_MOLDE);
    expect(PROMPT_CON_MOLDE).toMatch(/copia EXACTAMENTE la estructura/);
    expect(PROMPT_CON_MOLDE).toMatch(/toma SOLO el color, el tono y el estampado/);
    expect(PROMPT_CON_MOLDE).toMatch(/Fondo transparente/);
  });

  it("con molde no cambia el tamaño ni la transparencia", () => {
    const c = camposOpenAI("m", { conMolde: true });
    expect(c).toMatchObject({ size: "1024x1280", background: "transparent", output_format: "png" });
  });
});

describe("imagenDeRespuesta", () => {
  it("saca el base64 de la primera imagen", () => {
    expect(imagenDeRespuesta({ data: [{ b64_json: "AAAA" }] })).toBe("AAAA");
    expect(imagenDeRespuesta({ data: [] })).toBeNull();
    expect(imagenDeRespuesta({ data: [{ url: "x" }] })).toBeNull();
    expect(imagenDeRespuesta(null)).toBeNull();
  });
});

describe("costoDeUso", () => {
  it("suma imagen de entrada, texto y salida a las tarifas de los modelos 2.x", () => {
    const usage = { input_tokens: 1300, input_tokens_details: { image_tokens: 1000, text_tokens: 300 }, output_tokens: 1000 };
    // 1000×8 + 300×5 + 1000×30 = 39.500 por millón
    expect(costoDeUso({ usage })).toBeCloseTo(0.0395, 6);
  });

  it("sin detalle de entrada, la cuenta toda como imagen", () => {
    expect(costoDeUso({ usage: { input_tokens: 1000, output_tokens: 0 } })).toBeCloseTo(0.008, 6);
  });

  it("sin uso, no inventa", () => {
    expect(costoDeUso({})).toBeNull();
    expect(costoDeUso({ usage: { output_tokens: 10 } })).toBeNull();
  });
});

describe("mensajeDeErrorOpenAI", () => {
  it("traduce los casos que pueden pasar al empezar", () => {
    expect(mensajeDeErrorOpenAI(401, null)).toMatch(/llave/);
    expect(mensajeDeErrorOpenAI(403, { error: { message: "Your organization must be verified to use the model" } })).toMatch(/verificar tu organización/);
    expect(mensajeDeErrorOpenAI(429, { error: { code: "insufficient_quota", message: "x" } })).toMatch(/no tiene saldo/);
    expect(mensajeDeErrorOpenAI(429, { error: { code: "rate_limit_exceeded" } })).toMatch(/esperar/);
    expect(mensajeDeErrorOpenAI(400, { error: { message: "Invalid size" } })).toBe("OpenAI no aceptó el pedido: Invalid size");
    expect(mensajeDeErrorOpenAI(404, { error: { message: "The model x does not exist" } })).toMatch(/no encuentra el modelo/);
    expect(mensajeDeErrorOpenAI(503, null)).toMatch(/no está respondiendo/);
  });
});

describe("pedidoDeCatalogo: qué fotos van y qué se le dice a la IA", () => {
  it("solo el frente: el pedido medido de siempre", () => {
    expect(pedidoDeCatalogo({})).toEqual({ orden: ["frente"], prompt: PROMPT_CATALOGO });
  });

  it("frente y molde: el pedido con molde medido (99 % de la silueta)", () => {
    expect(pedidoDeCatalogo({ molde: true })).toEqual({ orden: ["frente", "molde"], prompt: PROMPT_CON_MOLDE });
  });

  it("el frente va siempre primero y el molde siempre último", () => {
    expect(pedidoDeCatalogo({ espalda: true, detalle: true, molde: true }).orden).toEqual(["frente", "espalda", "detalle", "molde"]);
    expect(pedidoDeCatalogo({ detalle: true }).orden).toEqual(["frente", "detalle"]);
  });

  it("nombra cada imagen por su número, en el mismo orden en que se envían", () => {
    const { prompt } = pedidoDeCatalogo({ espalda: true, detalle: true, molde: true });
    expect(prompt).toMatch(/IMAGEN 1: la foto real de la prenda de frente/);
    expect(prompt).toMatch(/IMAGEN 2: la misma prenda de espalda/);
    expect(prompt).toMatch(/IMAGEN 3: un detalle de cerca de la tela/);
    expect(prompt).toMatch(/IMAGEN 4: el MOLDE/);
    expect(prompt).toMatch(/Del MOLDE \(IMAGEN 4\) copia EXACTAMENTE la estructura/);
    expect(prompt).toMatch(/De IMAGEN 1, IMAGEN 2 y IMAGEN 3 toma SOLO el color/);
  });

  it("sin molde pide el maniquí invisible; con o sin molde, transparente y sin cambiar el color", () => {
    const sin = pedidoDeCatalogo({ espalda: true }).prompt;
    expect(sin).toMatch(/MANIQUÍ INVISIBLE/);
    expect(sin).toMatch(/Usa IMAGEN 1 y IMAGEN 2 para conservar/);
    expect(sin).toMatch(/Lo que pone la PRENDA, y no se cambia/);
    expect(sin).not.toMatch(/talla estándar/);
    for (const extras of [{ espalda: true }, { detalle: true, molde: true }]) {
      const p = pedidoDeCatalogo(extras).prompt;
      expect(p).toMatch(/No cambies el color/);
      expect(p).toMatch(/Fondo transparente/);
      expect(p).not.toMatch(/arrugas|luz pareja/i);
    }
  });
});

describe("mensajeParaTienda", () => {
  it("no habla de llaves, saldos ni modelos", () => {
    for (const [estado, cuerpo] of [
      [401, null],
      [403, { error: { message: "must be verified" } }],
      [429, { error: { code: "insufficient_quota" } }],
      [404, { error: { code: "model_not_found" } }],
    ] as const) {
      const m = mensajeParaTienda(estado, cuerpo);
      expect(m).toBe("La foto de catálogo no está disponible ahora. Avísale a tu líder.");
      expect(m).not.toMatch(/llave|saldo|modelo|OPENAI/i);
    }
  });

  it("dice qué hacer cuando es pasajero", () => {
    expect(mensajeParaTienda(429, { error: { code: "rate_limit_exceeded" } })).toMatch(/en un minuto/);
    expect(mensajeParaTienda(400, null)).toMatch(/Prueba con otra/);
    expect(mensajeParaTienda(503, null)).toMatch(/Prueba en un rato/);
  });
});
