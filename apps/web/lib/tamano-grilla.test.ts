import { describe, expect, it } from "vitest";
import { ANCHO_MINIMO_TARJETA, CLASES_GRILLA, ROTULO_TAMANO_GRILLA, TAMANOS_GRILLA, TAMANO_GRILLA_POR_DEFECTO, leerTamanoGrilla } from "./tamano-grilla";

describe("tamano-grilla", () => {
  it("lee el tamaño guardado y ante cualquier otra cosa cae al de por defecto", () => {
    for (const t of TAMANOS_GRILLA) expect(leerTamanoGrilla(t)).toBe(t);
    for (const raro of [undefined, null, "", "enorme", "GRANDE", "grande ", "0"]) {
      expect(leerTamanoGrilla(raro)).toBe(TAMANO_GRILLA_POR_DEFECTO);
    }
  });

  it("el de por defecto es mediano (grande era lo único que había y resultaba excesivo)", () => {
    expect(TAMANO_GRILLA_POR_DEFECTO).toBe("mediano");
  });

  it("cada tamaño tiene su rótulo y más pequeño = tarjeta más angosta, en el celular y en pantalla ancha", () => {
    for (const t of TAMANOS_GRILLA) expect(ROTULO_TAMANO_GRILLA[t]).toBeTruthy();
    expect(ANCHO_MINIMO_TARJETA.grande).toBeGreaterThan(ANCHO_MINIMO_TARJETA.mediano);
    expect(ANCHO_MINIMO_TARJETA.mediano).toBeGreaterThan(ANCHO_MINIMO_TARJETA.pequeno);
    const enCelular = (t: (typeof TAMANOS_GRILLA)[number]) => Number(/(?:^| )grid-cols-(\d+)(?: |$)/.exec(CLASES_GRILLA[t])?.[1]);
    expect(enCelular("mediano")).toBeGreaterThan(enCelular("grande"));
    expect(enCelular("pequeno")).toBeGreaterThan(enCelular("mediano"));
  });

  it("las clases usan el mismo ancho mínimo que la constante (una sola fuente para el CSS y para quien la lea)", () => {
    for (const t of TAMANOS_GRILLA) {
      expect(CLASES_GRILLA[t]).toContain(`minmax(${ANCHO_MINIMO_TARJETA[t]}px,1fr)`);
    }
  });

  it("las columnas salen del ancho disponible (auto-fill), no del ancho de la ventana (lg:/xl:)", () => {
    for (const t of TAMANOS_GRILLA) {
      expect(CLASES_GRILLA[t]).toContain("auto-fill");
      expect(CLASES_GRILLA[t]).not.toMatch(/\b(lg|xl|2xl):grid-cols/);
    }
  });
});
