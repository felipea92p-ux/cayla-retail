import { describe, expect, it } from "vitest";
import type { CampoDeGuia } from "./guia-campos";
import { camposDeIngresoDeInsumo } from "./insumos-guia";
import { CANTIDAD_ILEGIBLE } from "./insumos-reglas";
import { PALABRAS_DE_AVIO, PALABRAS_DE_TELA, camposDeLoQueYaTenias, columnasDeColores, conPalabrasDeLaHoja } from "./insumos-hojas";
import { COSTO_UNITARIO_ILEGIBLE } from "./monto-plata-reglas";

describe("columnasDeColores", () => {
  it("el líder ve lo que ya tiene y su costo; los demás, solo el mínimo", () => {
    expect(columnasDeColores({ puedeSaldo: true, conMetros: false })).toEqual({ plantilla: "minmax(7rem,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 2rem", campos: 3 });
    expect(columnasDeColores({ puedeSaldo: false, conMetros: false })).toEqual({ plantilla: "minmax(7rem,1.3fr) minmax(0,1fr) 2rem", campos: 1 });
  });
  it("por kilo o por rollo suma la columna de metros, solo si se anota saldo", () => {
    expect(columnasDeColores({ puedeSaldo: true, conMetros: true })).toEqual({ plantilla: "minmax(7rem,1.3fr) minmax(0,1fr) 5.5rem minmax(0,1fr) minmax(0,1fr) 2rem", campos: 4 });
    expect(columnasDeColores({ puedeSaldo: false, conMetros: true })).toEqual(columnasDeColores({ puedeSaldo: false, conMetros: false }));
  });
  it("ya no hay una columna para el código", () => {
    for (const puedeSaldo of [true, false]) for (const conMetros of [true, false]) expect(columnasDeColores({ puedeSaldo, conMetros }).plantilla).not.toContain("6rem,1.1fr");
  });
});

describe("conPalabrasDeLaHoja", () => {
  const campos: CampoDeGuia[] = [
    { id: "nombre", nombre: "Nombre de la tela", requerido: true, hecho: false, pendiente: "Ponle un nombre a la tela." },
    { id: "composicion", nombre: "La composición", requerido: false, hecho: false, pendiente: "" },
    { id: "merma", nombre: "Merma al cortar", requerido: true, hecho: false, pendiente: "La merma va de 0 % a menos de 50 %." },
  ];
  it("cambia solo el nombre de los campos que la hoja llama distinto", () => {
    const r = conPalabrasDeLaHoja(campos, PALABRAS_DE_TELA);
    expect(r.map((c) => c.nombre)).toEqual(["Nombre de la tela", "De qué está hecha", "Lo que se pierde al cortar"]);
  });
  it("no toca qué es requerido, qué está hecho ni el orden: la guía sigue saliendo de la validación", () => {
    const r = conPalabrasDeLaHoja(campos, { ...PALABRAS_DE_TELA, ...PALABRAS_DE_AVIO });
    expect(r.map((c) => [c.id, c.requerido, c.hecho, c.sugerido])).toEqual(campos.map((c) => [c.id, c.requerido, c.hecho, c.sugerido]));
    expect(r[2].pendiente).toBe(campos[2].pendiente);
  });
});

describe("camposDeLoQueYaTenias", () => {
  const casos = [
    { tieneInsumo: true, cantidad: "", costo: "", responsableListo: false },
    { tieneInsumo: false, cantidad: "20", costo: "14.50", responsableListo: true },
    { tieneInsumo: true, cantidad: "1.200", costo: "abc", responsableListo: true },
    { tieneInsumo: true, cantidad: "20", costo: "0", responsableListo: true },
  ];
  it("son los mismos campos del ingreso, con el mismo «hecho» y «requerido»", () => {
    for (const e of casos) {
      const base = camposDeIngresoDeInsumo(e);
      expect(camposDeLoQueYaTenias(e).map((c) => [c.id, c.requerido, c.hecho])).toEqual(base.map((c) => [c.id, c.requerido, c.hecho]));
    }
  });
  it("habla de lo que ya había, nunca de algo que «llegó»", () => {
    const r = camposDeLoQueYaTenias(casos[0]);
    expect(r.map((c) => c.nombre)).toEqual(["Qué tela o avío", "Cuánto había", "Cuánto costó", "Quién lo anota"]);
    for (const c of r) expect(`${c.nombre} ${c.pendiente}`.toLowerCase(), c.id).not.toMatch(/lleg/);
  });
  it("lo mal escrito conserva su mensaje: dice cómo escribirlo", () => {
    const r = camposDeLoQueYaTenias(casos[2]);
    expect(r.find((c) => c.id === "cantidad")?.pendiente).toBe(CANTIDAD_ILEGIBLE);
    expect(r.find((c) => c.id === "costo")?.pendiente).toBe(COSTO_UNITARIO_ILEGIBLE);
  });
});
