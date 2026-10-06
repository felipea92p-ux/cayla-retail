import { describe, expect, it } from "vitest";
import { avanceDeMision, claveMision, esObjetivo, leerFotoMision, objetivosDeHoy } from "./existencias-mision";

const TIENDAS = new Set(["Tienda Lima"]);
const PIDE = { accion: "por_colgar" } as never;
const fila = (varianteId: string, x: object) => ({ varianteId, pisoDisponible: 0, almacenDisponible: 0, disponible: 0, planPiso: null, enRed: [], ...x });

describe("la misión del día", () => {
  it("cuenta lo por colgar con algo atrás y lo agotado que una TIENDA tiene (no el Taller)", () => {
    expect(esObjetivo(fila("a", { almacenDisponible: 2, disponible: 2, planPiso: PIDE }), TIENDAS)).toBe(true);
    expect(esObjetivo(fila("b", { enRed: [{ sede: "Tienda Lima", cantidad: 1 }] }), TIENDAS)).toBe(true);
    expect(esObjetivo(fila("c", { enRed: [{ sede: "Taller", cantidad: 5 }] }), TIENDAS)).toBe(false);
    expect(esObjetivo(fila("d", { pisoDisponible: 2, disponible: 2 }), TIENDAS)).toBe(false);
  });

  it("el avance son las de la foto que ya no están pendientes (o ya no están)", () => {
    const manana = [fila("a", { almacenDisponible: 2, disponible: 2, planPiso: PIDE }), fila("b", { enRed: [{ sede: "Tienda Lima", cantidad: 1 }] })];
    const foto = objetivosDeHoy(manana, TIENDAS);
    expect(foto).toEqual(["a", "b"]);
    const tarde = [fila("a", { pisoDisponible: 1, almacenDisponible: 1, disponible: 2 }), manana[1]];
    expect(avanceDeMision(foto, tarde, TIENDAS)).toEqual({ hechas: 1, total: 2 });
    expect(avanceDeMision(foto, [], TIENDAS)).toEqual({ hechas: 2, total: 2 });
  });

  it("la foto se guarda por sede y por día, y una foto rota se ignora", () => {
    expect(claveMision("tru", "2026-10-06")).toBe("cayla.mision.tru.2026-10-06");
    expect(leerFotoMision('["a","b"]')).toEqual(["a", "b"]);
    expect(leerFotoMision("{roto")).toBeNull();
    expect(leerFotoMision("[1,2]")).toBeNull();
    expect(leerFotoMision(null)).toBeNull();
  });
});
