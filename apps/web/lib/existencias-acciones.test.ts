import { describe, expect, it } from "vitest";
import { accionDelIcono, filasDeAcciones, type PermisosYStock } from "./existencias-acciones";

const TODO: PermisosYStock = {
  puedeReponer: true,
  puedeEnviar: true,
  puedeAjustar: true,
  puedeReportarDanada: true,
  hayQueBajar: true,
  hayEnElPiso: true,
  hayEnAlmacen: true,
  hayAlgoLibre: true,
};

describe("acciones de una tarjeta de Existencias", () => {
  it("con todo permitido y con qué: Colgar en el piso sugerida primero, después Subir a almacén y Enviar, y aparte Ajustar, Reportar dañada y Ver detalle", () => {
    const f = filasDeAcciones(TODO);
    expect(f.map((x) => x.clave)).toEqual(["colgar", "subir", "enviar", "ajustar", "danada", "detalle"]);
    expect(f.filter((x) => x.sugerida).map((x) => x.clave)).toEqual(["colgar"]);
    expect(f.filter((x) => x.aparte).map((x) => x.clave)).toEqual(["ajustar"]); // una sola línea separadora
    expect(accionDelIcono(f)?.clave).toBe("colgar");
  });

  it("usa los nombres del sistema (ADR-0339), no «Reponer» ni «Retirar del piso»", () => {
    expect(filasDeAcciones(TODO).map((x) => x.etiqueta)).toEqual(["Colgar en el piso", "Subir a almacén", "Enviar a otra sede", "Ajustar stock", "Reportar dañada", "Ver detalle"]);
  });

  it("sin nada que bajar: Colgar en el piso se ve apagada y dice por qué, y el icono pasa a ser «⋯» (ninguna sugerida)", () => {
    const f = filasDeAcciones({ ...TODO, hayQueBajar: false });
    const reponer = f.find((x) => x.clave === "colgar");
    expect(reponer?.motivo).toBe("No hay nada libre en el almacén");
    expect(reponer?.sugerida).toBe(false);
    expect(accionDelIcono(f)).toBeNull();
  });

  it("una acción sin permiso no se dibuja: no queda un botón que termine en «Sin acceso»", () => {
    const f = filasDeAcciones({ ...TODO, puedeReponer: false, puedeEnviar: false, puedeAjustar: false, puedeReportarDanada: false });
    expect(f.map((x) => x.clave)).toEqual(["detalle"]);
    expect(f[0].aparte).toBe(false); // sin nada encima, no hay línea
  });

  it("cada acción con permiso pero sin con qué dice su propio motivo", () => {
    const f = filasDeAcciones({ ...TODO, hayEnElPiso: false, hayEnAlmacen: false, hayAlgoLibre: false });
    const motivos = Object.fromEntries(f.map((x) => [x.clave, x.motivo]));
    expect(motivos.subir).toBe("No hay nada colgado para subir");
    expect(motivos.enviar).toBe("No hay nada libre en el almacén para enviar");
    expect(motivos.danada).toBe("No hay prendas libres para reportar");
    expect(motivos.ajustar).toBeUndefined();
    expect(motivos.detalle).toBeUndefined();
  });
});
