import { describe, expect, it } from "vitest";
import {
  INSIGNIA,
  MAXIMO,
  MENSAJE_SIN_RED,
  MINIMO,
  claveDelBorrador,
  contador,
  leerEnvio,
  leerMias,
  letras,
  mensajeDelEnvio,
  problemaDelTexto,
  quedanHoy,
  sePuedeEnviar,
  textoLimpio,
} from "./recomendaciones";

const ID = "44444444-4444-4444-8444-444444444444";
const TRU = "11111111-1111-4111-8111-111111111111";

describe("el texto, contado como lo cuenta la base", () => {
  it("se limpia igual que fn_recomendacion_texto (los mismos casos que prueba la base)", () => {
    expect(textoLimpio("  Pongan​   más   tallas\r\n\r\n\r\ngrandes  ")).toBe("Pongan más tallas\n\ngrandes");
    expect(textoLimpio("  Hola\t\tmundo  \r\n\r\n\r\n\r\notra   línea​ con‮raro  ")).toBe("Hola mundo\n\notra línea conraro");
    expect(textoLimpio("   \n\t  ")).toBe("");
  });

  it("las letras se cuentan por carácter (un emoji es una), sin los espacios de más", () => {
    expect(letras("Gracias 🙌")).toBe(9);
    expect(letras("a     b")).toBe(3);
    expect(letras("")).toBe(0);
  });

  it("de 10 a 1000 letras: vacío no dice nada todavía; 9 es corto; 1001 es largo", () => {
    expect(problemaDelTexto("")).toBeNull();
    expect(problemaDelTexto("123456789")).toBe("corto");
    expect(problemaDelTexto("1234567890")).toBeNull();
    expect(problemaDelTexto("a".repeat(MAXIMO))).toBeNull();
    expect(problemaDelTexto("a".repeat(MAXIMO + 1))).toBe("largo");
    // Lo que la base no cuenta (invisibles, espacios de más) tampoco se cuenta aquí.
    expect(problemaDelTexto(`12345678​​9`)).toBe("corto");
    expect(sePuedeEnviar("")).toBe(false);
    expect(sePuedeEnviar("a".repeat(MINIMO))).toBe(true);
    expect(sePuedeEnviar("a".repeat(MAXIMO + 1))).toBe(false);
  });

  it("el contador avisa cerca del final y dice cuánto se pasó", () => {
    expect(contador("hola")).toEqual({ texto: `4 / ${MAXIMO}`, tono: "normal" });
    expect(contador("a".repeat(MAXIMO - 100)).tono).toBe("cerca");
    expect(contador("a".repeat(MAXIMO + 1))).toEqual({ texto: "Te pasaste por 1 letra", tono: "pasado" });
    expect(contador("a".repeat(MAXIMO + 5))).toEqual({ texto: "Te pasaste por 5 letras", tono: "pasado" });
  });

  it("la marca del borrador sigue al texto limpio y a la tienda: lo mismo con otros espacios es lo mismo; otra tienda, otra", () => {
    expect(claveDelBorrador("Más  tallas", null)).toBe(claveDelBorrador(" Más tallas ", null));
    expect(claveDelBorrador("Más tallas", null)).not.toBe(claveDelBorrador("Más tallas", TRU));
    expect(claveDelBorrador("Más tallas", TRU)).not.toBe(claveDelBorrador("Más tallas grandes", TRU));
  });
});

describe("lo que responde tienda_recomendar", () => {
  it("enviada, inválida, al tope o sin cuenta; lo que no se entiende es «no contestó» (nunca «enviada» sin estarlo)", () => {
    expect(leerEnvio({ estado: "enviada", id: ID, repetida: false, tope: 3, quedan_hoy: 2 })).toEqual({ estado: "enviada", quedanHoy: 2, tope: 3 });
    expect(leerEnvio({ estado: "enviada", id: ID, repetida: true, tope: 3, quedan_hoy: -1 })).toEqual({ estado: "enviada", quedanHoy: 0, tope: 3 });
    expect(leerEnvio({ estado: "invalido", campo: "texto", detalle: "corto", minimo: 10 })).toEqual({ estado: "invalido", campo: "texto", detalle: "corto" });
    expect(leerEnvio({ estado: "invalido", campo: "sobre" })).toEqual({ estado: "invalido", campo: "sobre", detalle: null });
    expect(leerEnvio({ estado: "limite", tope: 3 })).toEqual({ estado: "limite", tope: 3 });
    expect(leerEnvio({ estado: "sin_cuenta" })).toEqual({ estado: "sin_cuenta" });
    expect(leerEnvio(null)).toEqual({ estado: "sin_respuesta" });
    expect(leerEnvio({ estado: "enviada" })).toEqual({ estado: "sin_respuesta" });
    expect(leerEnvio({ estado: "otra cosa" })).toEqual({ estado: "sin_respuesta" });
  });

  it("cada «no se pudo» tiene su frase, en palabras del cliente", () => {
    expect(mensajeDelEnvio({ estado: "invalido", campo: "texto", detalle: "corto" })).toMatch(/al menos 10 letras/);
    expect(mensajeDelEnvio({ estado: "invalido", campo: "texto", detalle: "largo" })).toMatch(/1000 letras/);
    expect(mensajeDelEnvio({ estado: "invalido", campo: "sobre", detalle: null })).toMatch(/ya no está en la web/);
    expect(mensajeDelEnvio({ estado: "limite", tope: 3 })).toBe("Hoy ya nos enviaste 3. Mañana puedes enviarnos otra: las leemos todas.");
    expect(mensajeDelEnvio({ estado: "sin_sesion" })).toMatch(/lo que escribiste sigue aquí/);
    expect(mensajeDelEnvio({ estado: "sin_respuesta" })).toMatch(/no se envía dos veces/);
    expect(MENSAJE_SIN_RED).toMatch(/no se envía dos veces/);
  });
});

describe("lo que responde tienda_mis_recomendaciones", () => {
  const una = (cambios: Record<string, unknown> = {}) => ({
    id: ID,
    texto: "Más tallas",
    creada_en: "2026-10-15T15:00:00+00:00",
    sobre: { id: TRU, nombre: "Trujillo" },
    estado: "respondida",
    respuesta: "Gracias",
    respondida_en: "2026-10-15T16:00:00+00:00",
    ...cambios,
  });

  it("se lee con su tienda (o CAYLA en general), su estado para el cliente y la respuesta; una rara se deja fuera", () => {
    const m = leerMias({ tope: 3, hoy: 1, recomendaciones: [una(), una({ sobre: null, estado: "recibida", respuesta: null, respondida_en: null }), una({ estado: "archivada" }), 5] });
    expect(m?.tope).toBe(3);
    expect(m?.hoy).toBe(1);
    expect(m?.recomendaciones.map((r) => [r.sobre, r.estado, r.respuesta])).toEqual([
      ["Trujillo", "respondida", "Gracias"],
      [null, "recibida", null],
    ]);
    expect(leerMias({ tope: 3, recomendaciones: [] })).toBeNull();
    expect(leerMias("nada")).toBeNull();
  });

  it("cuántas le quedan hoy, nunca menos de cero", () => {
    expect(quedanHoy({ tope: 3, hoy: 1 })).toBe(2);
    expect(quedanHoy({ tope: 3, hoy: 5 })).toBe(0);
  });

  it("para el cliente no hay «archivada»: el archivo es de la tienda", () => {
    expect(Object.keys(INSIGNIA)).toEqual(["recibida", "leida", "respondida"]);
  });
});
