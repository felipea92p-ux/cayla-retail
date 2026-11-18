import { describe, expect, it } from "vitest";
import { camposDeProveedor, type EntradaProveedor } from "./proveedor-produccion-guia";
import { palabraDeGrado, sePuedeConfirmar, fraseDeLoQueFalta, separarFaltan, faltanDe } from "./guia-campos";

const vacio: EntradaProveedor = { nombre: "", rubro: "", ruc: "", contacto: "", telefono: "", plazo: "", forma: "", tieneCuentas: false, responsableListo: false };

describe("camposDeProveedor — lo que el modal ya exige para guardar", () => {
  it("solo el nombre, qué le vende al Taller y quién lo anota bloquean; lo demás es opcional", () => {
    const campos = camposDeProveedor(vacio);
    expect(campos.filter((c) => c.requerido).map((c) => c.id)).toEqual(["nombre", "rubro", "quien"]);
    expect(campos.filter((c) => !c.requerido).every((c) => !c.sugerido)).toBe(true);
  });

  it("se puede confirmar exactamente cuando hay nombre, rubro y responsable (la misma regla de guardar)", () => {
    const base = { ...vacio, nombre: "Textiles Gamarra", rubro: "tela", responsableListo: true };
    expect(sePuedeConfirmar(camposDeProveedor(base))).toBe(true);
    expect(sePuedeConfirmar(camposDeProveedor({ ...base, nombre: "   " }))).toBe(false);
    expect(sePuedeConfirmar(camposDeProveedor({ ...base, rubro: "" }))).toBe(false);
    expect(sePuedeConfirmar(camposDeProveedor({ ...base, responsableListo: false }))).toBe(false);
  });

  it("llenar o no un opcional nunca cambia si se puede guardar", () => {
    const base = { ...vacio, nombre: "X", rubro: "avios", responsableListo: true };
    const todo = { ...base, ruc: "20123456789", contacto: "Ana", telefono: "999", plazo: "30", forma: "transferencia", tieneCuentas: true };
    expect(sePuedeConfirmar(camposDeProveedor(base))).toBe(true);
    expect(sePuedeConfirmar(camposDeProveedor(todo))).toBe(true);
  });

  it("el pie dice «Faltan» solo con lo obligatorio y no lista ningún opcional", () => {
    const campos = camposDeProveedor(vacio);
    expect(fraseDeLoQueFalta(campos)).toBe("Faltan: el nombre, qué le vende al taller y quién lo anota");
    expect(separarFaltan(faltanDe(campos)).convienen).toEqual([]);
  });

  it("cada campo pendiente dice su grado en palabras", () => {
    const palabras = Object.fromEntries(camposDeProveedor(vacio).map((c) => [c.id, palabraDeGrado(c)]));
    expect(palabras).toMatchObject({ nombre: "obligatorio", rubro: "obligatorio", quien: "obligatorio", ruc: "opcional", pagarle: "opcional" });
  });
});
