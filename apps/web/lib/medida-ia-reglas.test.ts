import { describe, expect, it } from "vitest";
import { ESQUEMA_RESPUESTA, ESTILOS, HOLGURAS, medidaDeRespuesta, pedidoDeMedida, TIPOS, textoDeRespuesta, urlPublicaDelRecorte, ZONAS_IA } from "./medida-ia-reglas";

const respuesta = (dato: unknown) => ({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(dato) }] }] });
const blusa = { tipo: "con_mangas", zona: "arriba", holgura: "normal", se_lleva_metida: false, axila_y: 0.26, estilo: "casual", confianza: 0.9 };

describe("medida de la IA (ADR-0705)", () => {
  it("toma lo que dijo la IA de una blusa, con su axila redondeada", () => {
    expect(medidaDeRespuesta(respuesta({ ...blusa, axila_y: 0.26123 }), "gpt-5-mini")).toEqual({
      tipo: "con_mangas",
      zona: "arriba",
      holgura: "normal",
      metida: false,
      axila: 0.261,
      estilo: "casual",
      modelo: "gpt-5-mini",
    });
  });

  it("una prenda de abajo o un bolso no guarda axila aunque la IA mande una", () => {
    const m = medidaDeRespuesta(respuesta({ ...blusa, tipo: "pantalon", zona: "abajo", axila_y: 0.3 }), "m");
    expect(m?.axila).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, tipo: "cartera", zona: "bolso", axila_y: null }), "m")?.axila).toBeNull();
  });

  it("una prenda de arriba sin axila creíble es un fallo (se dibuja como siempre)", () => {
    expect(medidaDeRespuesta(respuesta({ ...blusa, axila_y: null }), "m")).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, axila_y: 0.95 }), "m")).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, axila_y: -0.1 }), "m")).toBeNull();
  });

  it("un tipo, una zona o una holgura que no existen son un fallo", () => {
    expect(medidaDeRespuesta(respuesta({ ...blusa, tipo: "poncho" }), "m")).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, zona: "cabeza" }), "m")).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, holgura: "enorme" }), "m")).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, se_lleva_metida: "no" }), "m")).toBeNull();
    expect(medidaDeRespuesta(respuesta({ ...blusa, estilo: "gala" }), "m")).toBeNull();
  });

  it("una respuesta sin texto o con JSON roto es un fallo, sin caerse", () => {
    expect(medidaDeRespuesta({}, "m")).toBeNull();
    expect(medidaDeRespuesta({ output: [{ content: [{ type: "output_text", text: "{no es json" }] }] }, "m")).toBeNull();
    expect(textoDeRespuesta(null)).toBeNull();
  });

  it("las listas del esquema son las mismas que valida la base (anotar_medida_ia)", () => {
    expect(ESQUEMA_RESPUESTA.properties.tipo.enum).toEqual([...TIPOS]);
    expect(ESQUEMA_RESPUESTA.properties.zona.enum).toEqual([...ZONAS_IA]);
    expect(ESQUEMA_RESPUESTA.properties.holgura.enum).toEqual([...HOLGURAS]);
    expect(ESQUEMA_RESPUESTA.properties.estilo.enum).toEqual([...ESTILOS]);
    expect(ESQUEMA_RESPUESTA.required).toEqual(Object.keys(ESQUEMA_RESPUESTA.properties));
  });

  it("pide la foto por su URL pública y en baja resolución", () => {
    const p = pedidoDeMedida("https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/recortes/a.png", "gpt-5-mini");
    expect(p.input[0].content[1]).toEqual({ type: "input_image", image_url: "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/recortes/a.png", detail: "low" });
    expect(p.text.format.strict).toBe(true);
  });

  it("arma la URL pública del recorte", () => {
    expect(urlPublicaDelRecorte("https://x.supabase.co/", "recortes/a b.png")).toBe("https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/recortes/a%20b.png");
  });
});
