import { describe, expect, it } from "vitest";
import {
  camposDelPerfil,
  colorPromedio,
  diferenciaDeColor,
  veredictoDeColor,
  esLlaveSandbox,
  esPerfilPhotoroom,
  mensajeDeErrorPhotoroom,
} from "./photoroom-reglas";

describe("camposDelPerfil", () => {
  it("sin fondo: la foto real recortada, PNG 4:5, pidiendo solo la prenda con una palabra", () => {
    const c = camposDelPerfil("sin-fondo");
    expect(c).toMatchObject({ removeBackground: "true", outputSize: "1200x1500", "export.format": "png", "segmentation.prompt": "clothing" });
    // Una lista de lo que se quita empeoró el recorte (medido el 2026-11-13): no se manda.
    expect(c["segmentation.negativePrompt"]).toBeUndefined();
  });

  it("maniquí: ghost mannequin vertical y en PNG, sin mezclar el recorte de la otra", () => {
    const c = camposDelPerfil("maniqui");
    expect(c).toEqual({ "ghostMannequin.mode": "ai.auto", "ghostMannequin.size": "PORTRAIT_HD_4_3", "ghostMannequin.prompt": "front view", "export.format": "png" });
  });
});

describe("color del maniquí contra la prenda real", () => {
  it("promedia solo lo opaco", () => {
    const px = [10, 20, 30, 255, 30, 40, 50, 255, 255, 255, 255, 0];
    expect(colorPromedio(px)).toEqual([20, 30, 40]);
    expect(colorPromedio([1, 2, 3, 0])).toBeNull();
  });

  it("el mismo color no cambia; los casos medidos el 2026-11-13 se ven de otro tono", () => {
    expect(diferenciaDeColor([199, 197, 202], [199, 197, 202])).toBe(0);
    expect(diferenciaDeColor([199, 197, 202], [176, 167, 159])).toBeGreaterThan(12); // top gris → beige
    expect(diferenciaDeColor([228, 234, 215], [190, 181, 149])).toBeGreaterThan(12); // verde limón → amarillo
    expect(diferenciaDeColor([199, 197, 202], [200, 197, 203])).toBeLessThan(2);
  });

  it("el veredicto sube de tono con la diferencia", () => {
    expect(veredictoDeColor(2).tono).toBe("verde");
    expect(veredictoDeColor(8).tono).toBe("ambar");
    expect(veredictoDeColor(20).tono).toBe("rojo");
  });
});

describe("esPerfilPhotoroom", () => {
  it("acepta solo los perfiles conocidos", () => {
    expect(esPerfilPhotoroom("sin-fondo")).toBe(true);
    expect(esPerfilPhotoroom("maniqui")).toBe(true);
    expect(esPerfilPhotoroom("fondo-blanco")).toBe(false);
    expect(esPerfilPhotoroom("otro")).toBe(false);
    expect(esPerfilPhotoroom(null)).toBe(false);
  });
});

describe("esLlaveSandbox", () => {
  it("reconoce el prefijo sandbox_", () => {
    expect(esLlaveSandbox("sandbox_abc")).toBe(true);
    expect(esLlaveSandbox("  sandbox_abc ")).toBe(true);
    expect(esLlaveSandbox("abc")).toBe(false);
  });
});

describe("mensajeDeErrorPhotoroom", () => {
  it("traduce los códigos que devuelve Photoroom", () => {
    expect(mensajeDeErrorPhotoroom(402, { error: { detail: "API credits exhausted" } })).toMatch(/Se acabaron/);
    expect(mensajeDeErrorPhotoroom(403, null)).toMatch(/llave/);
    expect(mensajeDeErrorPhotoroom(429, null)).toMatch(/esperar/);
    expect(mensajeDeErrorPhotoroom(500, { error: { message: "x" } })).toMatch(/no está respondiendo/);
  });

  it("un 400 cuenta el motivo que dio Photoroom", () => {
    expect(mensajeDeErrorPhotoroom(400, { error: { message: "removeBackground must be boolean" } })).toBe(
      "Photoroom no aceptó la foto: removeBackground must be boolean",
    );
    expect(mensajeDeErrorPhotoroom(400, { detail: "missing_image" })).toMatch(/missing_image/);
    expect(mensajeDeErrorPhotoroom(400, "texto")).toBe("Photoroom no aceptó la foto.");
  });
});
