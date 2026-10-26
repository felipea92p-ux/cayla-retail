import { describe, expect, it } from "vitest";
import { coincideConBusqueda, textoBuscableDeEnvio, textoBuscableDeOrden } from "./recepcion-envio-busqueda";
import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";

const envio: EnvioPorAbrir = {
  id: "e1",
  numero: "ENV-000251",
  numeroGuia: "T001-000501",
  estado: "en_camino",
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
});
