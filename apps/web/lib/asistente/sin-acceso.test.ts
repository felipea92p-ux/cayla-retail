import { describe, expect, it } from "vitest";
import { GUIAS } from "../guias/registro";
import { MODULOS } from "../modulos";
import { moduloDeLaGuia, rutasFueraDelMenu, textoSinAcceso } from "./sin-acceso";

const guia = (ruta: string) => {
  const g = GUIAS.find((x) => x.ruta === ruta);
  if (!g) throw new Error(`no hay guía de ${ruta}`);
  return g;
};

describe("rutasFueraDelMenu: las pantallas de un módulo que el rol no tiene", () => {
  it("quien tiene todos los módulos no tiene nada fuera", () => {
    expect(rutasFueraDelMenu({ guias: GUIAS, modulos: MODULOS.map((m) => m.clave) })).toEqual([]);
  });

  it("sin el módulo de Caja, Caja queda fuera; con él, no", () => {
    expect(rutasFueraDelMenu({ guias: GUIAS, modulos: [] })).toContain("/caja");
    expect(rutasFueraDelMenu({ guias: GUIAS, modulos: [moduloDeLaGuia(guia("/caja"))!] })).not.toContain("/caja");
  });

  it("nunca una pantalla con [id] ni una sin módulo", () => {
    for (const ruta of rutasFueraDelMenu({ guias: GUIAS, modulos: [] })) {
      expect(ruta).not.toMatch(/[[(]/);
      expect(moduloDeLaGuia(guia(ruta)), ruta).not.toBeNull();
    }
  });
});

describe("textoSinAcceso: dónde se hace y a quién pedírselo, nunca los pasos", () => {
  it("dice el módulo como en Roles y accesos y manda a pedírselo al líder de equipo", () => {
    const texto = textoSinAcceso(guia("/caja"));
    expect(texto).toMatch(/^Eso se hace en /);
    expect(texto).toContain("Pídeselo a tu líder de equipo");
    expect(texto).not.toMatch(/\bjefe\b|empleado|sucursal/i);
  });

  it("toda pantalla fuera de un rol vacío tiene su frase, sin repetir el nombre dos veces", () => {
    for (const ruta of rutasFueraDelMenu({ guias: GUIAS, modulos: [] })) {
      const g = guia(ruta);
      const texto = textoSinAcceso(g);
      expect(texto.split(g.titulo).length - 1, texto).toBeLessThanOrEqual(1);
    }
  });
});
