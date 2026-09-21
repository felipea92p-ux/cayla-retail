import { describe, expect, it } from "vitest";
import { condicionDePago, etiquetaRubro, filtrarProveedores, resumenProveedores, sinDatosDePago, type ProveedorProduccion } from "./proveedores-produccion-reglas";

const prov = (id: string, nombre: string, extra: Partial<ProveedorProduccion> = {}): ProveedorProduccion => ({
  id,
  nombre,
  rubro: "tela",
  ruc: null,
  contacto: null,
  telefono: null,
  plazoCreditoDias: null,
  formaPagoPreferida: null,
  banco: null,
  cuentaBancaria: null,
  cci: null,
  celularBilletera: null,
  billeteras: null,
  titularCuenta: null,
  activo: true,
  lotes: 0,
  totalComprado: 0,
  ultimaEntrega: null,
  ...extra,
});

const lista = [
  prov("1", "Textiles Gamarra", { ruc: "20123456789", contacto: "Rosa Quispe", lotes: 3, totalComprado: 4000 }),
  prov("2", "Botones Ñandú", { rubro: "avios", lotes: 1, totalComprado: 300 }),
  prov("3", "Costura Norte", { rubro: "maquila", activo: false, totalComprado: 900, lotes: 2 }),
  prov("4", "Lino Andino SAC", { totalComprado: 1000, lotes: 1 }),
];

describe("filtrarProveedores", () => {
  const base = { rubro: "todos", busqueda: "", verArchivados: false } as const;
  it("por defecto oculta los archivados y ordena por nombre", () => {
    expect(filtrarProveedores(lista, base).map((p) => p.nombre)).toEqual(["Botones Ñandú", "Lino Andino SAC", "Textiles Gamarra"]);
  });
  it("con «ver archivados» los muestra al final, nunca antes de un activo", () => {
    expect(filtrarProveedores(lista, { ...base, verArchivados: true }).map((p) => p.id)).toEqual(["2", "4", "1", "3"]);
  });
  it("filtra por rubro", () => {
    expect(filtrarProveedores(lista, { ...base, rubro: "avios" }).map((p) => p.id)).toEqual(["2"]);
  });
  it("busca por nombre sin importar tildes ni mayúsculas, por RUC y por contacto", () => {
    expect(filtrarProveedores(lista, { ...base, busqueda: "nandu" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrarProveedores(lista, { ...base, busqueda: "20123" }).map((p) => p.id)).toEqual(["1"]);
    expect(filtrarProveedores(lista, { ...base, busqueda: "quispe" }).map((p) => p.id)).toEqual(["1"]);
  });
});

describe("resumenProveedores", () => {
  it("cuenta activos por rubro y suma lo comprado, archivados incluidos (es historia)", () => {
    const r = resumenProveedores(lista);
    expect(r.activos).toBe(3);
    expect(r.archivados).toBe(1);
    expect(r.porRubro).toEqual({ tela: 2, avios: 1, maquila: 0, otro: 0 });
    expect(r.totalComprado).toBe(6200);
    expect(r.lotes).toBe(7);
  });
});

describe("texto", () => {
  it("sin plazo es contado; con plazo, crédito", () => {
    expect(condicionDePago(null)).toBe("contado");
    expect(condicionDePago(30)).toBe("crédito 30 d");
  });
  it("los rubros se leen sin jerga y uno desconocido cae en «Otro»", () => {
    expect(etiquetaRubro("avios")).toBe("Avíos");
    expect(etiquetaRubro("zapatos")).toBe("Otro");
  });
  it("sin CCI, cuenta ni billetera no hay cómo pagarle", () => {
    expect(sinDatosDePago(prov("x", "X"))).toBe(true);
    expect(sinDatosDePago(prov("x", "X", { cci: "00219300123456789012" }))).toBe(false);
  });
});
