import { describe, expect, it } from "vitest";
import { dentroDeVer, juntarPaneles, juntarRecientes, nombresDeVarias, partesDeVer, verDeVarias } from "./gastos-varias-sedes";
import { nombreCortoSede } from "./finanzas-telar-reglas";
import { preguntaDeGastos, sedeDeLaCabecera } from "./gastos-telar-reglas";
import type { PanelGastos, Ver } from "./gastos-reglas";

const UBIC = [
  { id: "tr", nombre: "Tienda Trujillo" },
  { id: "l", nombre: "Tienda Lima" },
  { id: "t", nombre: "Taller" },
];
const todas: Ver = { clave: "todas", ubicacionId: null, soloEmpresa: false };
const lima: Ver = { clave: "l", ubicacionId: "l", soloEmpresa: false };
const empresa: Ver = { clave: "empresa", ubicacionId: null, soloEmpresa: true };

describe("lo marcado en la barra → la vista de varias", () => {
  it("con dos o más arma la vista, en el orden de la barra y la empresa al final", () => {
    expect(verDeVarias(["tr", "l"], UBIC)).toEqual({ clave: "tr,l", ubicacionId: null, soloEmpresa: false, varias: { ubicacionIds: ["tr", "l"], conEmpresa: false } });
    expect(verDeVarias(["l", "tr"], UBIC)?.varias?.ubicacionIds).toEqual(["l", "tr"]);
    expect(verDeVarias(["empresa", "t"], UBIC)?.varias).toEqual({ ubicacionIds: ["t"], conEmpresa: true });
  });

  it("con una, ninguna o claves que la cuenta no ve, no hay vista de varias (se lee como siempre)", () => {
    expect(verDeVarias([], UBIC)).toBeNull();
    expect(verDeVarias(["l"], UBIC)).toBeNull();
    expect(verDeVarias(["empresa"], UBIC)).toBeNull();
    expect(verDeVarias(["l", "no-existe"], UBIC)).toBeNull();
  });
});

describe("las partes y lo que entra", () => {
  const varias = verDeVarias(["tr", "l", "empresa"], UBIC)!;

  it("cada parte es lo que la base sabe leer: una sede o la empresa", () => {
    expect(partesDeVer(varias)).toEqual([
      { clave: "tr", ubicacionId: "tr", soloEmpresa: false },
      { clave: "l", ubicacionId: "l", soloEmpresa: false },
      { clave: "empresa", ubicacionId: null, soloEmpresa: true },
    ]);
    expect(partesDeVer(lima)).toEqual([lima]);
    expect(partesDeVer(todas)).toEqual([todas]);
  });

  it("una fila entra si es de una sede elegida, o de la empresa si se eligió", () => {
    expect(["tr", "l", "t", null].map((u) => dentroDeVer(varias, u))).toEqual([true, true, false, true]);
    const sinEmpresa = verDeVarias(["tr", "l"], UBIC)!;
    expect(dentroDeVer(sinEmpresa, null)).toBe(false);
  });

  it("con una, la empresa o todas, igual que siempre", () => {
    expect(["l", "t", null].map((u) => dentroDeVer(lima, u))).toEqual([true, false, false]);
    expect(["l", null].map((u) => dentroDeVer(empresa, u))).toEqual([false, true]);
    expect(["l", "t", null].map((u) => dentroDeVer(todas, u))).toEqual([true, true, true]);
  });
});

const panel = (p: Partial<PanelGastos>): PanelGastos => ({
  total: 0,
  igv: 0,
  igvPerdido: { n: 0, igv: 0, deOtrosMeses: 0 },
  igvDescontable: 0,
  n: 0,
  boletas: 0,
  sinComprobante: 0,
  porPagar: 0,
  nPorPagar: 0,
  egresosSinClasificar: 0,
  egresosSinClasificarMonto: 0,
  porCategoria: [],
  porUbicacion: [],
  ...p,
});

describe("juntar los resúmenes de cada parte", () => {
  it("suma las cifras y deja una fila por categoría y por sede, de la mayor a la menor", () => {
    const tr = panel({
      total: 100.1, igv: 18, igvPerdido: { n: 1, igv: 3, deOtrosMeses: 0 }, n: 2, boletas: 1, sinComprobante: 1, porPagar: 50, nPorPagar: 1,
      egresosSinClasificar: 2, egresosSinClasificarMonto: 30,
      porCategoria: [{ categoria: "luz", nombre: "Luz", cuenta: "6361", monto: 60, n: 1 }, { categoria: "agua", nombre: "Agua", cuenta: "6362", monto: 40.1, n: 1 }],
      porUbicacion: [{ ubicacionId: "tr", nombre: "Tienda Trujillo", monto: 100.1, n: 2 }],
    });
    const emp = panel({
      total: 200.2, igv: 36, n: 1, porPagar: 100, nPorPagar: 1,
      porCategoria: [{ categoria: "agua", nombre: "Agua", cuenta: "6362", monto: 200.2, n: 1 }],
      porUbicacion: [{ ubicacionId: null, nombre: "De la empresa", monto: 200.2, n: 1 }],
    });
    const j = juntarPaneles([tr, emp]);
    expect(j.total).toBe(300.3);
    expect(j.igv).toBe(54);
    expect(j.igvPerdido).toEqual({ n: 1, igv: 3, deOtrosMeses: 0 });
    expect(j.igvDescontable).toBe(51);
    expect([j.n, j.boletas, j.sinComprobante, j.nPorPagar, j.egresosSinClasificar]).toEqual([3, 1, 1, 2, 2]);
    expect([j.porPagar, j.egresosSinClasificarMonto]).toEqual([150, 30]);
    expect(j.porCategoria.map((c) => [c.categoria, c.monto, c.n])).toEqual([["agua", 240.3, 2], ["luz", 60, 1]]);
    expect(j.porUbicacion.map((u) => [u.ubicacionId, u.monto])).toEqual([[null, 200.2], ["tr", 100.1]]);
  });

  it("juntar una sola parte la deja igual", () => {
    const p = panel({ total: 10, igv: 1.8, igvDescontable: 1.8, n: 1, porCategoria: [{ categoria: "luz", nombre: "Luz", cuenta: "6361", monto: 10, n: 1 }] });
    expect(juntarPaneles([p])).toEqual(p);
  });
});

describe("juntar las listas que la base corta", () => {
  it("de la más reciente a la más vieja, con el mismo tope", () => {
    const a = [{ id: "a1", t: "2026-10-03" }, { id: "a2", t: "2026-10-01" }];
    const b = [{ id: "b1", t: "2026-10-02" }];
    expect(juntarRecientes([a, b], (x) => x.t, 10).map((x) => x.id)).toEqual(["a1", "b1", "a2"]);
    expect(juntarRecientes([a, b], (x) => x.t, 2).map((x) => x.id)).toEqual(["a1", "b1"]);
  });
});

describe("cómo se nombran varias sedes", () => {
  const trLima = verDeVarias(["tr", "l"], UBIC)!;
  const tallerYEmpresa = verDeVarias(["t", "empresa"], UBIC)!;
  const tres = verDeVarias(["tr", "t", "empresa"], UBIC)!;

  it("en la frase y arriba de la cabecera", () => {
    expect(nombresDeVarias(trLima, UBIC, nombreCortoSede, true)).toBe("Trujillo y Lima");
    expect(nombresDeVarias(tres, UBIC, nombreCortoSede, true)).toBe("Trujillo, el Taller y la empresa");
    expect(nombresDeVarias(tres, UBIC, nombreCortoSede, false)).toBe("Trujillo, Taller y Empresa");
  });

  it("la pregunta de la cabecera habla en plural", () => {
    expect(preguntaDeGastos(trLima, UBIC, "2026-10")).toBe("¿Cuánto gastaron Trujillo y Lima en octubre?");
    expect(preguntaDeGastos(tallerYEmpresa, UBIC, "2026-09")).toBe("¿Cuánto gastaron el Taller y la empresa en septiembre?");
    expect(sedeDeLaCabecera(trLima, UBIC)).toBe("Trujillo y Lima");
  });
});
