import { describe, expect, it } from "vitest";
import { hoyLima } from "./fechas-lima";
import {
  PERIODOS_RECIBIDAS,
  ajustarRango,
  fechaIsoReal,
  filtrosRecibidasDesdeParams,
  hayFiltrosRecibidas,
  hrefConCambios,
  periodoDeRango,
  rangoDePeriodo,
  textoFechas,
  textoProveedor,
} from "./recibidas-filtros-reglas";

const HOY = "2026-09-18";
const PROV = "6f1c2f0e-8a3b-4c56-9d7e-1a2b3c4d5e6f";
const proveedores = [
  { id: PROV, nombre: "Avíos Gamarra" },
  { id: "11111111-2222-4333-8444-555555555555", nombre: "Tejidos Rímac SAC" },
];

describe("rangoDePeriodo", () => {
  it("este mes: del 1 al último día, aunque hoy sea 18", () => {
    expect(rangoDePeriodo("este-mes", HOY)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });
  it("mes pasado: el mes completo anterior", () => {
    expect(rangoDePeriodo("mes-pasado", HOY)).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
  });
  it("mes pasado en enero cae en diciembre del año anterior", () => {
    expect(rangoDePeriodo("mes-pasado", "2027-01-05")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
  });
  it("mes pasado respeta los meses cortos y los bisiestos", () => {
    expect(rangoDePeriodo("mes-pasado", "2028-03-10")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
    expect(rangoDePeriodo("mes-pasado", "2027-03-10")).toEqual({ desde: "2027-02-01", hasta: "2027-02-28" });
  });
  it("últimos 30 y 90 días terminan hoy y usan la misma ventana que la cifra de la cabecera (hoy - 90)", () => {
    expect(rangoDePeriodo("30-dias", HOY)).toEqual({ desde: "2026-08-19", hasta: HOY });
    expect(rangoDePeriodo("90-dias", HOY)).toEqual({ desde: "2026-06-20", hasta: HOY });
  });
  it("«hoy» es de Lima: a las 20:00 del 30/09 en Lima (01:00 UTC del 01/10) todavía es septiembre", () => {
    const hoy = hoyLima(new Date("2026-10-01T01:00:00Z"));
    expect(hoy).toBe("2026-09-30");
    expect(rangoDePeriodo("este-mes", hoy)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });
});

describe("periodoDeRango", () => {
  it("reconoce cada período cuando el rango de la URL coincide", () => {
    for (const p of PERIODOS_RECIBIDAS) {
      const r = rangoDePeriodo(p.clave, HOY);
      expect(periodoDeRango(r.desde, r.hasta, HOY)).toBe(p.clave);
    }
  });
  it("un rango a mano no es ningún período", () => {
    expect(periodoDeRango("2026-09-02", "2026-09-15", HOY)).toBeNull();
  });
  it("con un solo extremo no es un período", () => {
    expect(periodoDeRango("2026-09-01", undefined, HOY)).toBeNull();
    expect(periodoDeRango(undefined, "2026-09-30", HOY)).toBeNull();
  });
  it("«Últimos 30 días» de ayer deja de coincidir hoy: pasa a verse como rango", () => {
    const ayer = rangoDePeriodo("30-dias", "2026-09-17");
    expect(periodoDeRango(ayer.desde, ayer.hasta, HOY)).toBeNull();
  });
});

describe("ajustarRango", () => {
  it("un rango coherente no se toca", () => {
    expect(ajustarRango("2026-09-01", "2026-09-15", "desde")).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
  });
  it("con un extremo vacío tampoco", () => {
    expect(ajustarRango("2026-09-01", "", "desde")).toEqual({ desde: "2026-09-01", hasta: "" });
    expect(ajustarRango("", "2026-09-15", "hasta")).toEqual({ desde: "", hasta: "2026-09-15" });
  });
  it("si «desde» pasa a «hasta», «hasta» lo acompaña", () => {
    expect(ajustarRango("2026-09-20", "2026-09-15", "desde")).toEqual({ desde: "2026-09-20", hasta: "2026-09-20" });
  });
  it("si «hasta» queda antes de «desde», «desde» lo acompaña", () => {
    expect(ajustarRango("2026-09-10", "2026-09-05", "hasta")).toEqual({ desde: "2026-09-05", hasta: "2026-09-05" });
  });
});

describe("textoFechas", () => {
  it("sin filtro es solo «Fechas», como la maqueta", () => {
    expect(textoFechas(undefined, undefined, HOY)).toBe("Fechas");
  });
  it("con un período de un toque, su nombre", () => {
    expect(textoFechas("2026-09-01", "2026-09-30", HOY)).toBe("Este mes");
    expect(textoFechas("2026-06-20", HOY, HOY)).toBe("Últimos 90 días");
  });
  it("con un rango a mano, las fechas dd/mm", () => {
    expect(textoFechas("2026-09-02", "2026-09-15", HOY)).toBe("02/09 – 15/09");
  });
  it("con un solo extremo dice Desde / Hasta", () => {
    expect(textoFechas("2026-09-02", undefined, HOY)).toBe("Desde 02/09");
    expect(textoFechas(undefined, "2026-09-15", HOY)).toBe("Hasta 15/09");
  });
  it("una fecha de otro año lleva el año, para no confundir diciembre con diciembre", () => {
    expect(textoFechas("2025-12-20", "2026-01-10", HOY)).toBe("20/12/2025 – 10/01");
  });
});

describe("textoProveedor", () => {
  it("sin filtro: «Proveedor: Todos», como la maqueta", () => {
    expect(textoProveedor(undefined, proveedores)).toBe("Proveedor: Todos");
  });
  it("con filtro: el nombre del proveedor", () => {
    expect(textoProveedor(PROV, proveedores)).toBe("Proveedor: Avíos Gamarra");
  });
  it("un id que no está entre los activos no se disfraza de «Todos»", () => {
    expect(textoProveedor("99999999-2222-4333-8444-555555555555", proveedores)).toBe("Proveedor: Otro");
  });
});

describe("fechaIsoReal", () => {
  it("acepta un día real", () => {
    expect(fechaIsoReal("2026-09-18")).toBe("2026-09-18");
    expect(fechaIsoReal("2028-02-29")).toBe("2028-02-29");
  });
  it("rechaza lo imposible o mal escrito", () => {
    expect(fechaIsoReal("2026-02-31")).toBeUndefined();
    expect(fechaIsoReal("2027-02-29")).toBeUndefined();
    expect(fechaIsoReal("18/09/2026")).toBeUndefined();
    expect(fechaIsoReal("mañana")).toBeUndefined();
    expect(fechaIsoReal("")).toBeUndefined();
    expect(fechaIsoReal(undefined)).toBeUndefined();
  });
});

describe("filtrosRecibidasDesdeParams", () => {
  it("sin parámetros no hay filtros", () => {
    const f = filtrosRecibidasDesdeParams({});
    expect(f).toEqual({ busqueda: undefined, proveedorId: undefined, desde: undefined, hasta: undefined });
    expect(hayFiltrosRecibidas(f)).toBe(false);
  });
  it("conserva lo válido y recorta la búsqueda", () => {
    const f = filtrosRecibidasDesdeParams({ q: "  T009-118 ", prov: PROV, desde: "2026-09-01", hasta: "2026-09-15" });
    expect(f).toEqual({ busqueda: "T009-118", proveedorId: PROV, desde: "2026-09-01", hasta: "2026-09-15" });
    expect(hayFiltrosRecibidas(f)).toBe(true);
  });
  it("ignora un uuid roto, una fecha imposible y una búsqueda en blanco", () => {
    const f = filtrosRecibidasDesdeParams({ q: "   ", prov: "no-es-uuid", desde: "2026-02-31", hasta: "ayer" });
    expect(f).toEqual({ busqueda: undefined, proveedorId: undefined, desde: undefined, hasta: undefined });
    expect(hayFiltrosRecibidas(f)).toBe(false);
  });
  it("ordena un rango invertido en vez de devolver cero filas sin explicación", () => {
    const f = filtrosRecibidasDesdeParams({ desde: "2026-09-15", hasta: "2026-09-01" });
    expect(f.desde).toBe("2026-09-01");
    expect(f.hasta).toBe("2026-09-15");
  });
  it("un solo extremo se respeta tal cual", () => {
    expect(filtrosRecibidasDesdeParams({ desde: "2026-09-01" })).toMatchObject({ desde: "2026-09-01", hasta: undefined });
  });
});

describe("hrefConCambios", () => {
  it("conserva vista=recibidas y suma el proveedor", () => {
    expect(hrefConCambios("/recibir", "vista=recibidas", { prov: PROV })).toBe(`/recibir?vista=recibidas&prov=${PROV}`);
  });
  it("un valor vacío borra el parámetro; sin nada más, queda solo la vista", () => {
    expect(hrefConCambios("/recibir", `vista=recibidas&prov=${PROV}`, { prov: "" })).toBe("/recibir?vista=recibidas");
  });
  it("cambiar un filtro descarta el cursor de paginación", () => {
    expect(hrefConCambios("/recibir", "vista=recibidas&cursor=abc", { q: "gamarra" })).toBe("/recibir?vista=recibidas&q=gamarra");
  });
  it("desde y hasta se cambian juntos, y se quitan juntos", () => {
    const con = hrefConCambios("/recibir", "vista=recibidas&q=x", { desde: "2026-09-01", hasta: "2026-09-30" });
    expect(con).toBe("/recibir?vista=recibidas&q=x&desde=2026-09-01&hasta=2026-09-30");
    expect(hrefConCambios("/recibir", con.split("?")[1], { desde: "", hasta: "" })).toBe("/recibir?vista=recibidas&q=x");
  });
  it("sin parámetros y sin cambios es solo la ruta", () => {
    expect(hrefConCambios("/recibir", "", { q: "" })).toBe("/recibir");
  });
});
