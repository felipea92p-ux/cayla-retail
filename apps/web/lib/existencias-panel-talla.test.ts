import { describe, expect, it } from "vitest";
import { accionesDeTalla, diagnosticoDeTalla } from "./existencias-panel-talla";
import type { FilaPrenda } from "./existencias-prendas";

const talla = (x: Partial<FilaPrenda> & { enRed?: { sede: string; cantidad: number }[] }) =>
  ({ pisoDisponible: 0, almacenDisponible: 0, disponible: 0, apartado: 0, danado: 0, planPiso: null, talla: "M", ...x }) as FilaPrenda & { enRed?: { sede: string; cantidad: number }[] };
const PIDE = { accion: "por_colgar" } as never;
const TODO = { puedeReponer: true, puedeEnviar: true, puedeAjustar: true, puedeApartar: true, puedePedir: true, origenes: [{ nombre: "Tienda Lima", cantidad: 2 }, { nombre: "Tienda Arequipa", cantidad: 0 }] };

describe("acciones del panel de una talla", () => {
  it("siete tarjetas en el orden de la maqueta, con los nombres del sistema", () => {
    const a = accionesDeTalla(talla({ pisoDisponible: 2, almacenDisponible: 3, disponible: 5 }), TODO, true);
    expect(a.map((x) => x.texto)).toEqual(["Colgar en el piso", "Subir a almacén", "Enviar a otra sede", "Apartar", "Pedir a otra sede", "Ajustar stock", "Ficha"]);
  });
  it("cada una dice qué hay o por qué está apagada", () => {
    const a = Object.fromEntries(accionesDeTalla(talla({ pisoDisponible: 0, almacenDisponible: 1, disponible: 1 }), TODO, true).map((x) => [x.clave, x]));
    expect(a.colgar).toMatchObject({ ok: true, sub: "1 unidad en almacén" });
    expect(a.subir).toMatchObject({ ok: false, sub: "Nada en piso" });
    expect(a.apartar).toMatchObject({ ok: true, sub: "Con adelanto · en Vender" });
    expect(a.pedir).toMatchObject({ ok: true, sub: "Lima tiene 2" });
  });
  it("sin permiso no se dibuja; sin separar piso y almacén tampoco hay colgar ni subir", () => {
    const a = accionesDeTalla(talla({ disponible: 4 }), { puedeReponer: false, puedeEnviar: false, puedeAjustar: false }, true);
    expect(a.map((x) => x.clave)).toEqual(["ficha"]);
    expect(accionesDeTalla(talla({ disponible: 4 }), TODO, false).map((x) => x.clave)).not.toContain("colgar");
  });
  it("sugiere colgar solo si la talla está por colgar y hay algo atrás", () => {
    const sug = (f: FilaPrenda) => accionesDeTalla(f, TODO, true).filter((x) => x.sugerida).map((x) => x.clave);
    expect(sug(talla({ pisoDisponible: 0, almacenDisponible: 3, disponible: 3, planPiso: PIDE }))).toEqual(["colgar"]);
    expect(sug(talla({ pisoDisponible: 3, almacenDisponible: 3, disponible: 6 }))).toEqual([]);
  });
});

describe("Apartar y Pedir siguen a la talla", () => {
  it("sin stock aquí: Apartar se apaga y Pedir se sugiere si otra tienda la tiene", () => {
    const a = Object.fromEntries(accionesDeTalla(talla({}), TODO, true).map((x) => [x.clave, x]));
    expect(a.apartar).toMatchObject({ ok: false, sub: "Sin stock aquí: pídela" });
    expect(a.pedir).toMatchObject({ ok: true, sugerida: true });
  });
  it("ninguna tienda la tiene: Pedir apagado, con el porqué", () => {
    const a = Object.fromEntries(accionesDeTalla(talla({}), { ...TODO, origenes: [] }, true).map((x) => [x.clave, x]));
    expect(a.pedir).toMatchObject({ ok: false, sub: "Ninguna sede tiene", sugerida: false });
  });
});

describe("diagnóstico de una talla", () => {
  it("por colgar, sin stock (con lo que hay en otras sedes) y disponible", () => {
    expect(diagnosticoDeTalla(talla({ pisoDisponible: 0, almacenDisponible: 8, disponible: 8, planPiso: PIDE }), true)).toEqual({ tono: "ambar", texto: "Por colgar: hay 8 unidades en almacén y ninguna en piso." });
    expect(diagnosticoDeTalla(talla({ enRed: [{ sede: "Lima", cantidad: 3 }] }), true)).toEqual({ tono: "pizarra", texto: "Sin stock aquí · 3 en Lima." });
    expect(diagnosticoDeTalla(talla({}), true).texto).toBe("Sin stock aquí ni en otra sede.");
    expect(diagnosticoDeTalla(talla({ pisoDisponible: 2, almacenDisponible: 3, disponible: 5 }), true)).toEqual({ tono: "verde", texto: "Disponible: 5 unidades (2 en piso, 3 en almacén)." });
  });
});
