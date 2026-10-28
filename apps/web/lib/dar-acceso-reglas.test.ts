import { describe, expect, it } from "vitest";
import { avisoDarAcceso, camposDeDarAcceso, fraseDarAcceso, quienes, rolesParaDarAcceso } from "./dar-acceso-reglas";
import type { RolVista } from "./roles-reglas";
import { CLAVES_MODULO } from "./modulos";

const R = (id: string, nombre: string, modulos: RolVista["modulos"], extra: Partial<RolVista> = {}): RolVista => ({
  id, clave: null, nombre, descripcion: null, esSistema: false, fijo: false, limitadoComoHoy: false, archivado: false, modulos, version: 1, pantallaPrincipal: null, ...extra,
});
const ROLES = [
  R("l", "Líder", [...CLAVES_MODULO], { clave: "lider", fijo: true }),
  R("v", "Ventas", ["inicio", "vender", "caja"]),
  R("i", "Integrante", ["inicio", "vender"], { clave: "integrante" }),
  R("a", "Almacén", ["inicio", "existencias", "conteos"]),
  R("x", "Viejo", ["inicio"], { archivado: true }),
  R("g", "Gestión", ["inicio", "colaboradores"]),
];

describe("camposDeDarAcceso", () => {
  const base = { personas: 0, sedeElegida: false, pideRol: true, rolElegido: false, responsableListo: true, responsableMotivo: null };
  it("pide quién, sede, rol y quién lo da, en ese orden", () => {
    expect(camposDeDarAcceso(base).map((c) => c.id)).toEqual(["quien", "sede", "rol", "responsable"]);
    expect(camposDeDarAcceso(base).filter((c) => !c.hecho).map((c) => c.id)).toEqual(["quien", "sede", "rol"]);
  });
  it("sin roles leídos no pregunta el rol (entra como Integrante)", () => {
    expect(camposDeDarAcceso({ ...base, pideRol: false }).map((c) => c.id)).toEqual(["quien", "sede", "responsable"]);
  });
  it("todo hecho cuando hay persona, sede, rol y responsable", () => {
    expect(camposDeDarAcceso({ ...base, personas: 2, sedeElegida: true, rolElegido: true }).every((c) => c.hecho)).toBe(true);
    const sinResp = camposDeDarAcceso({ ...base, personas: 1, sedeElegida: true, rolElegido: true, responsableListo: false, responsableMotivo: "Nadie marcó asistencia." });
    expect(sinResp.find((c) => c.id === "responsable")).toMatchObject({ hecho: false, pendiente: "Nadie marcó asistencia." });
  });
});

describe("rolesParaDarAcceso", () => {
  it("sin Líder ni archivados, Integrante primero y el resto por nombre", () => {
    expect(rolesParaDarAcceso(ROLES, true, null).map((r) => r.nombre)).toEqual(["Integrante", "Almacén", "Gestión", "Ventas"]);
  });
  it("quien no es líder solo da roles cuyos módulos ve (ADR-0178)", () => {
    expect(rolesParaDarAcceso(ROLES, false, ["inicio", "vender", "caja", "colaboradores"]).map((r) => r.nombre)).toEqual(["Integrante", "Gestión", "Ventas"]);
  });
});

describe("frases", () => {
  it("quienes", () => {
    expect(quienes(["Rosa"])).toBe("Rosa");
    expect(quienes(["Rosa", "Mateo"])).toBe("Rosa y Mateo");
    expect(quienes(["Rosa", "Mateo", "Andrea"])).toBe("Rosa y 2 más");
  });
  it("resume el alta según quién la da", () => {
    expect(fraseDarAcceso({ nombres: [], sede: "Tienda TRU", rol: null, entraDirecto: true })).toBeNull();
    expect(fraseDarAcceso({ nombres: ["Rosa"], sede: null, rol: null, entraDirecto: true })).toBeNull();
    expect(fraseDarAcceso({ nombres: ["Rosa"], sede: "Tienda TRU", rol: "Ventas", entraDirecto: true })).toBe("Rosa entra a Tienda TRU como Ventas.");
    expect(fraseDarAcceso({ nombres: ["Rosa", "Mateo"], sede: "Tienda TRU", rol: null, entraDirecto: true })).toBe("Rosa y Mateo entran a Tienda TRU.");
    expect(fraseDarAcceso({ nombres: ["Rosa"], sede: "Tienda AQP", rol: "Ventas", entraDirecto: false })).toBe("Rosa quedará en Tienda AQP como Ventas, esperando el ok de un líder.");
  });
  it("el aviso dice si ya entra o si espera", () => {
    expect(avisoDarAcceso(["Rosa"], true)).toBe("Rosa ya puede entrar a retail");
    expect(avisoDarAcceso(["Rosa", "Mateo", "Ana"], false)).toBe("Rosa y 2 más esperan el ok de un líder");
  });
});
