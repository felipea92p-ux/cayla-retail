import { describe, expect, it } from "vitest";
import { coincideConBusqueda, ordenarFilasPorRecibir, textoBuscableDeEnvio, textoBuscableDeOrden } from "./recepcion-envio-busqueda";
import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";

const envio: EnvioPorAbrir = {
  id: "e1",
  numero: "ENV-000251",
  numeroGuia: "T001-000501",
  estado: "en_camino",
  despachadoEn: "2026-10-20T15:00:00+00:00",
  unidades: 40,
  lineas: 3,
  ordenes: ["OC-001309"],
  proveedores: ["Textiles Andina SAC"],
  creadoPorMi: false,
};
const orden: OrdenDirecta = { ordenId: "o1", numero: "OC-001311", proveedor: "Confecciones del Sur EIRL", unidadesPorEnviar: 6, creadaPorMi: false };

describe("buscador de envíos por recibir", () => {
  it("encuentra un envío por número, guía, proveedor, orden y estado, sin tildes ni mayúsculas", () => {
    const t = textoBuscableDeEnvio(envio);
    for (const q of ["251", "env-000251", "t001-000501", "ANDINA", "oc-001309", "en camino"]) expect(coincideConBusqueda(t, q), q).toBe(true);
  });
  it("pide todas las palabras y descarta lo que no coincide", () => {
    const t = textoBuscableDeEnvio(envio);
    expect(coincideConBusqueda(t, "andina 251")).toBe(true);
    expect(coincideConBusqueda(t, "andina 999")).toBe(false);
    expect(coincideConBusqueda(t, "sur")).toBe(false);
  });
  it("sin nada escrito deja pasar todo", () => {
    expect(coincideConBusqueda(textoBuscableDeEnvio(envio), "   ")).toBe(true);
  });
  it("un envío sin aviso se encuentra por su proveedor", () => {
    expect(coincideConBusqueda(textoBuscableDeEnvio({ ...envio, proveedores: [], ordenes: [], lineas: 0 }, "Entel Perú S.A."), "entel")).toBe(true);
  });
  it("una orden sin guía se encuentra por su número, proveedor o «sin guía»", () => {
    const t = textoBuscableDeOrden(orden);
    for (const q of ["1311", "confecciones", "sin guía"]) expect(coincideConBusqueda(t, q), q).toBe(true);
  });
  it("ordena: seguir recibiendo, en camino, órdenes sin guía y al final lo que esta cuenta no puede recibir", () => {
    const e = (id: string, estado: "en_camino" | "abierto", creadoPorMi = false) => ({ ...envio, id, estado, creadoPorMi });
    const o = (ordenId: string, creadaPorMi = false) => ({ ...orden, ordenId, creadaPorMi });
    const filas = ordenarFilasPorRecibir([e("a", "en_camino"), e("b", "abierto", true), e("c", "abierto"), e("d", "en_camino"), e("f", "abierto")], [o("x", true), o("y")]);
    expect(filas.map((f) => (f.tipo === "envio" ? f.envio.id : f.orden.ordenId))).toEqual(["c", "f", "a", "d", "y", "b", "x"]);
  });
  it("dentro de cada grupo, del envío más antiguo al más nuevo; sin fecha, al final del grupo; a igual fecha, el orden de la base", () => {
    const e = (id: string, despachadoEn: string | null, estado: "en_camino" | "abierto" = "en_camino", creadoPorMi = false) => ({ ...envio, id, despachadoEn, estado, creadoPorMi });
    const ids = (filas: ReturnType<typeof ordenarFilasPorRecibir>) => filas.map((f) => (f.tipo === "envio" ? f.envio.id : f.orden.ordenId));
    const filas = ordenarFilasPorRecibir(
      [
        e("nuevo", "2026-10-26T15:00:00+00:00"),
        e("sin-fecha", null),
        e("viejo", "2026-10-02T15:00:00+00:00"),
        e("mismo-1", "2026-10-10T15:00:00+00:00"),
        e("mismo-2", "2026-10-10T15:00:00+00:00"),
        e("abierto-nuevo", "2026-10-25T15:00:00+00:00", "abierto"),
        e("abierto-viejo", "2026-10-03T15:00:00+00:00", "abierto"),
        e("ajeno-nuevo", "2026-10-24T15:00:00+00:00", "en_camino", true),
        e("ajeno-viejo", "2026-10-01T15:00:00+00:00", "en_camino", true),
      ],
      [{ ...orden, ordenId: "oc-2" }, { ...orden, ordenId: "oc-1" }],
    );
    expect(ids(filas)).toEqual(["abierto-viejo", "abierto-nuevo", "viejo", "mismo-1", "mismo-2", "nuevo", "sin-fecha", "oc-2", "oc-1", "ajeno-viejo", "ajeno-nuevo"]);
  });
  it("una hora de Lima que cae en el día siguiente de UTC se ordena por el instante, no por el texto", () => {
    const e = (id: string, despachadoEn: string) => ({ ...envio, id, despachadoEn });
    // 01:00Z del 14 son las 20:00 del 13 en Lima; el offset distinto no cambia quién salió primero.
    const filas = ordenarFilasPorRecibir([e("b", "2026-10-14T01:00:00+00:00"), e("a", "2026-10-13T22:00:00-05:00")], []);
    expect(filas.map((f) => (f.tipo === "envio" ? f.envio.id : ""))).toEqual(["b", "a"]);
  });
});
