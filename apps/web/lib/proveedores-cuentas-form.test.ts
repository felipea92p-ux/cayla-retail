import { describe, expect, it } from "vitest";
import {
  argsGuardarCuentas,
  avisoCuentasNoGuardadas,
  bancoCoincide,
  celularDeTelefono,
  CUENTAS_VACIAS,
  cuentasCambiaron,
  cuentasDeFila,
  escribirCci,
  escribirCelular,
  hayCuentas,
  hayQueGuardarCuentas,
  leerBancoDelCci,
  primerErrorCuentas,
  validarCuentas,
  type CuentasForm,
} from "./proveedores-cuentas-form";

const CCI = "00219300214567804558";
const BUENO: CuentasForm = { cci: "002-193-002145678045-58", celularBilletera: "987 654 321", billeteras: ["yape"], titularCuenta: "Rosa Quispe" };

describe("escribirCci", () => {
  it("formatea mientras se escribe", () => {
    expect(escribirCci("0021")).toBe("002-1");
    expect(escribirCci(CCI)).toBe("002-193-002145678045-58");
  });
  it("acepta pegar con espacios, guiones y puntos", () => {
    expect(escribirCci("002 193 002145678045 58")).toBe("002-193-002145678045-58");
    expect(escribirCci("002.193.002145678045.58")).toBe("002-193-002145678045-58");
  });
  it("no recorta en silencio lo que sobra ni lo que trae letras", () => {
    expect(escribirCci(`${CCI}12`)).toBe(`${CCI}12`);
    expect(escribirCci("00219A")).toBe("00219A");
  });
});

describe("escribirCelular", () => {
  it("formatea y quita el +51 de un celular completo", () => {
    expect(escribirCelular("987654321")).toBe("987 654 321");
    expect(escribirCelular("+51 987654321")).toBe("987 654 321");
    expect(escribirCelular("+51987654321")).toBe("987 654 321");
  });
  it("no confunde un +51 a medio escribir con dígitos del celular", () => {
    expect(escribirCelular("+51 9")).toBe("+51 9");
  });
  it("deja tal cual lo que trae letras o lo que sobra", () => {
    expect(escribirCelular("98765a")).toBe("98765a");
    expect(escribirCelular("9876543210")).toBe("9876543210");
  });
});

describe("celularDeTelefono", () => {
  it("devuelve el teléfono formateado si es un celular válido", () => {
    expect(celularDeTelefono("987654321")).toBe("987 654 321");
    expect(celularDeTelefono("+51 987 654 321")).toBe("987 654 321");
  });
  it("null si está vacío o no es un celular (fijo, corto, no empieza con 9)", () => {
    expect(celularDeTelefono("")).toBeNull();
    expect(celularDeTelefono("014567890")).toBeNull();
    expect(celularDeTelefono("98765")).toBeNull();
  });
});

describe("banco que dice el CCI", () => {
  it("detecta el banco solo con el CCI completo", () => {
    expect(leerBancoDelCci(CCI, "").detectado).toBe("BCP");
    expect(leerBancoDelCci("00219300214", "").detectado).toBeNull();
    expect(leerBancoDelCci("99919300214567804558", "").detectado).toBeNull();
  });
  it("coincide con sus otros nombres, sin tildes ni mayúsculas", () => {
    expect(bancoCoincide("Banco de Crédito del Perú", "BCP")).toBe(true);
    expect(bancoCoincide("bcp", "BCP")).toBe(true);
    expect(bancoCoincide("BBVA Continental", "BBVA")).toBe(true);
    expect(bancoCoincide("Banco de la Nacion", "Banco de la Nación")).toBe(true);
    expect(bancoCoincide("Interbank", "BCP")).toBe(false);
  });
  it("avisa la discrepancia solo si hay un banco escrito y es otro", () => {
    expect(leerBancoDelCci(CCI, "Interbank").discrepa).toBe(true);
    expect(leerBancoDelCci(CCI, "BCP").discrepa).toBe(false);
    expect(leerBancoDelCci(CCI, "").discrepa).toBe(false);
    expect(leerBancoDelCci("0021", "Interbank").discrepa).toBe(false);
  });
});

describe("validarCuentas", () => {
  it("todo vacío es válido: el bloque entero es opcional", () => {
    expect(validarCuentas(CUENTAS_VACIAS)).toEqual({});
  });
  it("un borrador completo y bueno pasa", () => {
    expect(validarCuentas(BUENO)).toEqual({});
  });
  it("CCI incompleto o con letras", () => {
    expect(validarCuentas({ ...BUENO, cci: "002-193" }).cci).toMatch(/20 dígitos/);
    expect(validarCuentas({ ...BUENO, cci: "002abc" }).cci).toMatch(/solo números/);
  });
  it("celular mal formado", () => {
    expect(validarCuentas({ ...BUENO, celularBilletera: "812 345 678" }).celular).toMatch(/empezar con 9/);
    expect(validarCuentas({ ...BUENO, celularBilletera: "9876" }).celular).toMatch(/9 dígitos/);
  });
  it("celular sin app: el error va en las apps", () => {
    expect(validarCuentas({ ...BUENO, billeteras: [] })).toEqual({ billeteras: "Indica si ese celular es Yape, Plin o ambos." });
  });
  it("app sin celular: el error va en el celular", () => {
    expect(validarCuentas({ ...BUENO, celularBilletera: "" }).celular).toMatch(/Escribe el celular/);
  });
  it("un celular malo no pide además las apps", () => {
    const e = validarCuentas({ ...BUENO, celularBilletera: "9876", billeteras: [] });
    expect(e.celular).toBeDefined();
    expect(e.billeteras).toBeUndefined();
  });
  it("titular entre 2 y 120", () => {
    expect(validarCuentas({ ...CUENTAS_VACIAS, titularCuenta: "A" }).titular).toMatch(/al menos 2/);
    expect(validarCuentas({ ...CUENTAS_VACIAS, titularCuenta: "  A  " }).titular).toBeDefined();
    expect(validarCuentas({ ...CUENTAS_VACIAS, titularCuenta: "Ab" })).toEqual({});
    expect(validarCuentas({ ...CUENTAS_VACIAS, titularCuenta: "a".repeat(120) })).toEqual({});
    expect(validarCuentas({ ...CUENTAS_VACIAS, titularCuenta: "a".repeat(121) }).titular).toMatch(/120/);
  });
  it("primerErrorCuentas sigue el orden de la pantalla", () => {
    expect(primerErrorCuentas({})).toBeNull();
    const e = validarCuentas({ cci: "1", celularBilletera: "1", billeteras: [], titularCuenta: "A" });
    expect(primerErrorCuentas(e)?.campo).toBe("cci");
    expect(primerErrorCuentas({ titular: "x", celular: "y" })?.campo).toBe("celular");
  });
});

describe("¿cambió algo?", () => {
  it("el formato no cuenta como cambio", () => {
    expect(cuentasCambiaron(BUENO, { ...BUENO, cci: CCI, celularBilletera: "+51987654321" })).toBe(false);
  });
  it("el orden de las apps y los espacios del titular tampoco", () => {
    const a: CuentasForm = { ...BUENO, billeteras: ["yape", "plin"], titularCuenta: "Rosa  Quispe" };
    const b: CuentasForm = { ...BUENO, billeteras: ["plin", "yape"], titularCuenta: " Rosa Quispe " };
    expect(cuentasCambiaron(a, b)).toBe(false);
  });
  it("cada una de las cuatro columnas cuenta", () => {
    expect(cuentasCambiaron(BUENO, { ...BUENO, cci: "" })).toBe(true);
    expect(cuentasCambiaron(BUENO, { ...BUENO, celularBilletera: "955 443 322" })).toBe(true);
    expect(cuentasCambiaron(BUENO, { ...BUENO, billeteras: ["yape", "plin"] })).toBe(true);
    expect(cuentasCambiaron(BUENO, { ...BUENO, titularCuenta: "Rosa Q." })).toBe(true);
  });
  it("vaciar todo es un cambio (reemplazo completo)", () => {
    expect(cuentasCambiaron(BUENO, CUENTAS_VACIAS)).toBe(true);
  });
  it("en un alta solo se guarda si se escribió algo; en una edición, solo si cambió", () => {
    expect(hayQueGuardarCuentas(CUENTAS_VACIAS, CUENTAS_VACIAS, true)).toBe(false);
    expect(hayQueGuardarCuentas(CUENTAS_VACIAS, BUENO, true)).toBe(true);
    expect(hayQueGuardarCuentas(BUENO, BUENO, false)).toBe(false);
    expect(hayQueGuardarCuentas(BUENO, { ...BUENO, titularCuenta: "" }, false)).toBe(true);
    expect(hayCuentas({ ...CUENTAS_VACIAS, titularCuenta: "   " })).toBe(false);
  });
});

describe("argsGuardarCuentas", () => {
  it("manda todo sin formato", () => {
    expect(argsGuardarCuentas("p1", BUENO)).toEqual({
      p_proveedor_id: "p1",
      p_cci: CCI,
      p_celular_billetera: "987654321",
      p_billeteras: ["yape"],
      p_titular_cuenta: "Rosa Quispe",
    });
  });
  it("lo vacío va como undefined (la RPC lo toma como NULL y lo vacía)", () => {
    const a = argsGuardarCuentas("p1", CUENTAS_VACIAS);
    expect(a).toEqual({ p_proveedor_id: "p1", p_cci: undefined, p_celular_billetera: undefined, p_billeteras: undefined, p_titular_cuenta: undefined });
  });
  it("las apps ordenadas y sin repetir; nunca apps sin celular", () => {
    expect(argsGuardarCuentas("p1", { ...BUENO, billeteras: ["yape", "plin", "yape"] }).p_billeteras).toEqual(["plin", "yape"]);
    expect(argsGuardarCuentas("p1", { ...CUENTAS_VACIAS, billeteras: ["yape"] }).p_billeteras).toBeUndefined();
  });
});

describe("cuentasDeFila", () => {
  it("de la fila de la base al formulario, con formato legible", () => {
    expect(cuentasDeFila({ cci: CCI, celular_billetera: "987654321", billeteras: ["yape"], titular_cuenta: "Rosa Quispe" })).toEqual(BUENO);
  });
  it("todo nulo → formulario vacío", () => {
    expect(cuentasDeFila({ cci: null, celular_billetera: null, billeteras: null, titular_cuenta: null })).toEqual(CUENTAS_VACIAS);
  });
  it("ida y vuelta: lo que sale de la base no cuenta como cambio", () => {
    const f = cuentasDeFila({ cci: CCI, celular_billetera: "987654321", billeteras: ["plin", "yape"], titular_cuenta: null });
    expect(cuentasCambiaron(f, escribirCuentasComoUsuario(f))).toBe(false);
  });
});

function escribirCuentasComoUsuario(f: CuentasForm): CuentasForm {
  return { ...f, cci: escribirCci(f.cci), celularBilletera: escribirCelular(f.celularBilletera) };
}

describe("avisoCuentasNoGuardadas", () => {
  it("dice que el proveedor sí quedó y qué hacer", () => {
    const t = avisoCuentasNoGuardadas("El CCI tiene que ser de 20 dígitos.");
    expect(t).toContain("Se guardó el proveedor, pero no las cuentas: El CCI tiene que ser de 20 dígitos.");
    expect(t).toContain("Editar");
    expect(t).not.toContain("..");
  });
});
