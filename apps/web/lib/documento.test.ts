import { describe, it, expect } from "vitest";
import { validarDni, validarRuc, digitoVerificadorRuc, soloDigitos } from "@cayla-retail/shared";

// Estas pruebas existen porque el dígito verificador del RUC es la única defensa
// que funciona SIN internet y SIN gastar una consulta pagada al padrón. Si alguien
// toca el algoritmo y lo rompe, el sistema empieza a aceptar RUCs inventados y a
// emitir facturas que SUNAT rechaza con el correlativo ya quemado.
// Los RUCs de abajo son reales y verificables: el de SUNAT y dos usados como
// ejemplo en la documentación pública de los proveedores del padrón.

describe("digitoVerificadorRuc — módulo 11 de SUNAT", () => {
  it.each([
    ["20131312955", "RUC de la propia SUNAT"],
    ["10460278975", "persona natural con negocio"],
    ["20601030013", "persona jurídica"],
  ])("%s (%s) cierra con su último dígito", (ruc) => {
    expect(digitoVerificadorRuc(ruc.slice(0, 10))).toBe(Number(ruc[10]));
  });
});

describe("validarRuc", () => {
  it("acepta un RUC real", () => {
    expect(validarRuc("20131312955")).toEqual({ valido: true });
  });

  it("caza un dígito cambiado", () => {
    expect(validarRuc("20131312945").valido).toBe(false);
  });

  it("caza dos dígitos transpuestos", () => {
    // 20131312955 -> 20131319255 (se intercambian el 5 y el 9 del medio)
    expect(validarRuc("20131319255").valido).toBe(false);
  });

  it("rechaza un prefijo que SUNAT no emite", () => {
    expect(validarRuc("30131312955")).toEqual({
      valido: false,
      motivo: "Ningún RUC empieza en 30 (van en 10, 15, 17 o 20)",
    });
  });

  it("dice cuántos dígitos faltan mientras se tipea", () => {
    expect(validarRuc("201313")).toEqual({ valido: false, motivo: "Faltan 5 dígitos" });
  });

  it("ignora guiones y espacios pegados al copiar y pegar", () => {
    expect(validarRuc(" 20-131312955 ")).toEqual({ valido: true });
  });
});

describe("validarDni", () => {
  it("acepta 8 dígitos", () => {
    expect(validarDni("46027897")).toEqual({ valido: true });
  });

  it("no acepta 7", () => {
    expect(validarDni("4602789")).toEqual({ valido: false, motivo: "Falta 1 dígito" });
  });

  it("no acepta 9", () => {
    expect(validarDni("460278971")).toEqual({ valido: false, motivo: "Un DNI tiene 8 dígitos" });
  });
});

describe("soloDigitos", () => {
  it("deja solo números", () => {
    expect(soloDigitos("20-1313.129 55")).toBe("20131312955");
  });
});
