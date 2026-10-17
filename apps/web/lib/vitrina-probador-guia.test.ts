import { describe, expect, it } from "vitest";
import { camposDeRecortes } from "./vitrina-probador-guia";

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
