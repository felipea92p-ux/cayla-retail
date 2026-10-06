import { describe, expect, it } from "vitest";
import { accionDelIcono, filasDeAcciones, type PermisosYStock } from "./existencias-acciones";

const TODO: PermisosYStock = {
  puedeReponer: true,
  puedeEnviar: true,
  hayQueBajar: true,
  hayPorColgar: true,
  hayEnElPiso: true,
  hayEnAlmacen: true,
};

describe("acciones de una tarjeta de Existencias (maqueta: Colgar, Subir, Enviar)", () => {
  it("con algo por colgar: Colgar en el piso sugerida y primera, después Subir a almacén y Enviar", () => {
    const f = filasDeAcciones(TODO);
    expect(f.map((x) => x.clave)).toEqual(["colgar", "subir", "enviar"]);
    expect(f.filter((x) => x.sugerida).map((x) => x.clave)).toEqual(["colgar"]);
    expect(accionDelIcono(f)?.clave).toBe("colgar");
  });

  it("usa los nombres del sistema (ADR-0339), no «Reponer» ni «Retirar del piso»", () => {
    expect(filasDeAcciones(TODO).map((x) => x.etiqueta)).toEqual(["Colgar en el piso", "Subir a almacén", "Enviar a otra sede"]);
  });

  it("sin nada por colgar el icono sigue siendo Colgar, sin resaltar (como la maqueta)", () => {
    const f = filasDeAcciones({ ...TODO, hayPorColgar: false });
    expect(f.some((x) => x.sugerida)).toBe(false);
    expect(accionDelIcono(f)?.clave).toBe("colgar");
  });

  it("sin nada en el almacén: Colgar se ve apagada y dice por qué, y el icono es «⋯»", () => {
    const f = filasDeAcciones({ ...TODO, hayQueBajar: false });
    expect(f.find((x) => x.clave === "colgar")?.motivo).toBe("No hay nada libre en el almacén");
    expect(accionDelIcono(f)).toBeNull();
  });

  it("Pedir o Ver van primero y resaltadas cuando son la principal; Colgar ya no se resalta", () => {
    const f = filasDeAcciones({ ...TODO, principal: { clave: "pedir", etiqueta: "Pedir a otra sede" } });
    expect(f.map((x) => x.clave)).toEqual(["pedir", "colgar", "subir", "enviar"]);
    expect(f.filter((x) => x.sugerida).map((x) => x.clave)).toEqual(["pedir"]);
    expect(accionDelIcono(f)?.clave).toBe("pedir");
  });

  it("una acción sin permiso no se dibuja: no queda un botón que termine en «Sin acceso»", () => {
    expect(filasDeAcciones({ ...TODO, puedeReponer: false, puedeEnviar: false })).toEqual([]);
  });

  it("cada acción con permiso pero sin con qué dice su propio motivo", () => {
    const f = filasDeAcciones({ ...TODO, hayEnElPiso: false, hayEnAlmacen: false });
    const motivos = Object.fromEntries(f.map((x) => [x.clave, x.motivo]));
    expect(motivos.subir).toBe("No hay nada colgado para subir");
    expect(motivos.enviar).toBe("No hay nada libre en el almacén para enviar");
  });
});
