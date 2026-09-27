import { describe, it, expect } from "vitest";
import { AYUDA_COMENTARIO_APROBAR, avisoEtiquetaAgregada, cuerpoAprobarEtiqueta, verboAprobacion } from "./etiqueta-aprobacion-reglas";

describe("cuerpoAprobarEtiqueta", () => {
  it("aprobar SIEMPRE lleva el comentario: es lo que la base exige (el bug era mandar solo el estado)", () => {
    expect(cuerpoAprobarEtiqueta("e1", "Para la campaña de fin de año")).toEqual({
      id: "e1",
      estado: "aprobado",
      notas: "Para la campaña de fin de año",
    });
  });

  it("recorta los espacios: la base compara el comentario ya recortado", () => {
    expect(cuerpoAprobarEtiqueta("e1", "  Se diferencia de Oferta  \n")?.notas).toBe("Se diferencia de Oferta");
  });

  it("sin comentario no hay cuerpo: vacío o solo espacios no se pueden enviar", () => {
    expect(cuerpoAprobarEtiqueta("e1", "")).toBeNull();
    expect(cuerpoAprobarEtiqueta("e1", "   \n\t ")).toBeNull();
  });
});

describe("verboAprobacion", () => {
  it("una rechazada se reactiva; una pendiente se aprueba", () => {
    expect(verboAprobacion("rechazado")).toBe("Reactivar");
    expect(verboAprobacion("pendiente")).toBe("Aprobar");
  });
});

describe("avisoEtiquetaAgregada", () => {
  it("una propuesta pendiente NO promete que se pueda usar: el alta y «Prendas» solo aceptan aprobadas", () => {
    const { titulo, detalle } = avisoEtiquetaAgregada("Oferta", "pendiente");
    expect(`${titulo} ${detalle}`).not.toMatch(/ya la puedes usar|no te frena/i);
    expect(detalle).toMatch(/Líder/);
    expect(detalle).toMatch(/aprobarla/);
  });

  it("una etiqueta que nace aprobada solo avisa que se agregó", () => {
    expect(avisoEtiquetaAgregada("Oferta", "aprobado")).toEqual({ titulo: "Etiqueta Oferta agregada" });
  });
});

describe("AYUDA_COMENTARIO_APROBAR", () => {
  it("dice para qué sirve el comentario, en palabras del negocio", () => {
    expect(AYUDA_COMENTARIO_APROBAR).toMatch(/para qué sirve/);
    expect(AYUDA_COMENTARIO_APROBAR).toMatch(/distingue/);
  });
});
