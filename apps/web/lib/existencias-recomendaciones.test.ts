import { describe, expect, it } from "vitest";
import { planPisoPorVariante, type FilaParaPlan } from "./existencias-recomendaciones";
import { pidePiso } from "./piso-plan";
import type { PoliticaOperativaInventario } from "./politica-operativa-inventario";

// Commit de terreno (ADR-0328 act. 7): la regla de piso del 2026-09-25 —piso ≤ umbral pide reponer, por encima nunca— dicha con
// la decisión del motor del piso. Estas pruebas son los casos A-F de antes con las MISMAS respuestas: el terreno cambió, la regla
// no. El commit siguiente reemplaza el productor (y estas pruebas) por el motor nuevo.

const POLITICA: PoliticaOperativaInventario = { minDiasExposicionRitmo: 3, umbralStockPisoReposicion: 4 };
const fila = (o: Partial<FilaParaPlan> = {}): FilaParaPlan => ({ varianteId: "v1", pisoDisponible: 0, almacenDisponible: 0, ...o });
const accion = (f: FilaParaPlan) => planPisoPorVariante([f], POLITICA).get(f.varianteId)?.accion;

describe("planPisoPorVariante — los casos A-F de la regla de piso, con las mismas respuestas", () => {
  it("Caso A — piso 10: Mantener", () => expect(accion(fila({ pisoDisponible: 10, almacenDisponible: 20 }))).toBe("mantener"));
  it("Caso B — piso 5: Mantener", () => expect(accion(fila({ pisoDisponible: 5, almacenDisponible: 20 }))).toBe("mantener"));
  it("Caso C — piso 4 (el umbral incluido): pide piso, y hay atrás → Por reponer", () =>
    expect(accion(fila({ pisoDisponible: 4, almacenDisponible: 20 }))).toBe("por_reponer"));
  it("Caso D — piso 3: Por reponer", () => expect(accion(fila({ pisoDisponible: 3, almacenDisponible: 20 }))).toBe("por_reponer"));
  it("piso 0 con algo atrás: Por colgar (toda talla por colgar pide piso)", () =>
    expect(accion(fila({ pisoDisponible: 0, almacenDisponible: 2 }))).toBe("por_colgar"));
  it("piso 3 sin nada atrás: Sin stock atrás", () => expect(accion(fila({ pisoDisponible: 3, almacenDisponible: 0 }))).toBe("sin_atras"));
  it("Taller (no separa piso y almacén): sin decisión", () =>
    expect(accion(fila({ pisoDisponible: null, almacenDisponible: null }))).toBeUndefined());
  it("lo que pide piso es exactamente piso ≤ umbral, en toda combinación", () => {
    for (let piso = 0; piso <= 8; piso++)
      for (const almacen of [0, 1, 5]) {
        const a = accion(fila({ pisoDisponible: piso, almacenDisponible: almacen }));
        expect(pidePiso(a)).toBe(piso <= POLITICA.umbralStockPisoReposicion);
      }
  });
});
