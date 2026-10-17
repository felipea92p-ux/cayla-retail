import { describe, expect, it } from "vitest";
import { camposDeLargo, camposDeRecortes, camposDeTipicos } from "./vitrina-probador-guia";

describe("camposDeRecortes: lo único que se elige es quién lo hace", () => {
  it("falta el responsable mientras el combo no está listo, con su motivo", () => {
    const [campo] = camposDeRecortes({ responsableListo: false, responsableMotivo: "Nadie de turno en esta tienda." });
    expect(campo).toMatchObject({ id: "responsable", requerido: true, hecho: false, pendiente: "Nadie de turno en esta tienda." });
  });

  it("sin motivo de la base, lo pide en palabras de la tienda", () => {
    expect(camposDeRecortes({ responsableListo: false, responsableMotivo: null })[0].pendiente).toBe("Elige quién prepara los recortes.");
  });

  it("listo el combo, no queda nada por hacer", () => {
    const campos = camposDeRecortes({ responsableListo: true, responsableMotivo: null });
    expect(campos).toHaveLength(1);
    expect(campos[0].hecho).toBe(true);
  });
});

describe("camposDeLargo: falta solo lo que la base rechazaría o lo que deja la prenda afuera", () => {
  const listo = { responsableListo: true, responsableMotivo: null };
  it("sin típico, el largo es requerido: vacío falta", () => {
    const [largo] = camposDeLargo({ escrito: "", tipico: null, ...listo });
    expect(largo).toMatchObject({ id: "largo", requerido: true, hecho: false, pendiente: "Anota el largo: sin él no entra al probador." });
    expect(camposDeLargo({ escrito: "110", tipico: null, ...listo })[0]).toMatchObject({ requerido: true, hecho: true });
  });
  it("con típico, vacío está bien (usa el típico) y el campo es opcional", () => {
    expect(camposDeLargo({ escrito: "", tipico: 45, ...listo })[0]).toMatchObject({ requerido: false, hecho: true });
  });
  it("algo mal escrito siempre falta, con el motivo de la regla", () => {
    expect(camposDeLargo({ escrito: "4", tipico: 45, ...listo })[0]).toMatchObject({ requerido: true, hecho: false, pendiente: "El largo va de 5 a 250 cm." });
  });
  it("y al final, quién lo hace", () => {
    expect(camposDeLargo({ escrito: "62", tipico: 45, responsableListo: false, responsableMotivo: null }).map((c) => c.id)).toEqual(["largo", "responsable"]);
  });
});

describe("camposDeTipicos", () => {
  it("ninguno mal escrito y quién los cambia", () => {
    expect(camposDeTipicos({ malEscritos: 0, responsableListo: true, responsableMotivo: null }).every((c) => c.hecho)).toBe(true);
    expect(camposDeTipicos({ malEscritos: 2, responsableListo: true, responsableMotivo: null })[0]).toMatchObject({ hecho: false, pendiente: "Corrige los 2 largos marcados: van de 5 a 250 cm." });
  });
});
