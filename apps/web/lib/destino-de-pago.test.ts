import { describe, expect, it } from "vitest";
import { destinoDelMedio, faltaDatoDePago } from "./destino-de-pago";
import type { DatosPagoProveedor } from "./proveedores-reglas";

const base: DatosPagoProveedor = {
  banco: null,
  cuentaBancaria: null,
  cci: null,
  celularBilletera: null,
  billeteras: null,
  titular: null,
  telefono: "999111222",
  plazoCreditoDias: null,
  formaPagoPreferida: null,
};
const conTodo: DatosPagoProveedor = { ...base, banco: "BCP", cci: "00219300214567804558", cuentaBancaria: "193-2145678-0-45", celularBilletera: "987654321", billeteras: ["yape", "plin"] };

describe("destinoDelMedio: solo lo del medio elegido", () => {
  it("sin datos del proveedor no dice nada", () => {
    expect(destinoDelMedio("transferencia", null)).toBeNull();
    expect(destinoDelMedio("yape", undefined)).toBeNull();
  });

  it("efectivo, otro y saldo a favor no llevan destino", () => {
    for (const m of ["efectivo", "otro", "saldo_a_favor"]) expect(destinoDelMedio(m, conTodo)).toBeNull();
  });

  it("transferencia: cuenta y CCI COMPLETOS, con su banco — y ni rastro del Yape", () => {
    const d = destinoDelMedio("transferencia", conTodo)!;
    expect(d.banco).toBe("BCP");
    expect(d.filas).toEqual([
      { etiqueta: "Cuenta", valor: "193-2145678-0-45", copiar: "193-2145678-0-45" },
      { etiqueta: "CCI", valor: "002-193-002145678045-58", copiar: "00219300214567804558" },
    ]);
    expect(JSON.stringify(d)).not.toContain("987");
    expect(d.aviso).toBeNull();
  });

  it("depósito muestra lo mismo que transferencia", () => {
    expect(destinoDelMedio("deposito", conTodo)?.filas.map((f) => f.etiqueta)).toEqual(["Cuenta", "CCI"]);
  });

  it("Yape: solo el celular (formateado, y copiable sin espacios) — ni cuenta ni CCI", () => {
    const d = destinoDelMedio("yape", conTodo)!;
    expect(d.filas).toEqual([{ etiqueta: "Yape", valor: "987 654 321", copiar: "987654321" }]);
    expect(d.banco).toBeNull();
    expect(JSON.stringify(d)).not.toContain("00219300214567804558");
  });

  it("Plin: igual, con su nombre", () => {
    expect(destinoDelMedio("plin", conTodo)?.filas[0].etiqueta).toBe("Plin");
  });

  it("el titular acompaña a los medios bancarios y a la billetera, y se recorta", () => {
    const d = { ...conTodo, titular: "  Rosita Quispe  " };
    expect(destinoDelMedio("transferencia", d)?.titular).toBe("Rosita Quispe");
    expect(destinoDelMedio("yape", d)?.titular).toBe("Rosita Quispe");
    expect(destinoDelMedio("transferencia", conTodo)?.titular).toBeNull();
  });

  it("sin CCI muestra solo la cuenta local; sin banco escrito lo deduce del CCI", () => {
    expect(destinoDelMedio("transferencia", { ...conTodo, cci: null })?.filas.map((f) => f.etiqueta)).toEqual(["Cuenta"]);
    expect(destinoDelMedio("transferencia", { ...base, cci: "01117500020012345673" })?.banco).toBe("BBVA");
  });

  it("si la cuenta es el mismo CCI (backfill) sale una sola fila, la del CCI", () => {
    const d = { ...base, banco: "BCP", cci: "00219300214567804558", cuentaBancaria: "00219300214567804558" };
    expect(destinoDelMedio("transferencia", d)?.filas.map((f) => f.etiqueta)).toEqual(["CCI"]);
  });

  it("avisa (sin bloquear) cuando le falta lo del medio elegido", () => {
    expect(destinoDelMedio("transferencia", base)?.aviso).toBe("Este proveedor no tiene cuenta ni CCI registrados.");
    expect(destinoDelMedio("yape", base)?.aviso).toBe("Este proveedor no tiene Yape / Plin registrado.");
    // Tiene Yape/Plin pero no cuenta: para transferir, avisa; para Yape, no.
    const soloYape = { ...base, celularBilletera: "987654321", billeteras: ["yape"] };
    expect(destinoDelMedio("transferencia", soloYape)?.aviso).toMatch(/cuenta ni CCI/);
    expect(destinoDelMedio("yape", soloYape)?.aviso).toBeNull();
  });

  it("avisa cuando el proveedor recibe la otra billetera", () => {
    const soloPlin = { ...base, celularBilletera: "987654321", billeteras: ["plin"] };
    expect(destinoDelMedio("yape", soloPlin)?.aviso).toBe("Este proveedor recibe Plin, no Yape.");
    expect(destinoDelMedio("plin", soloPlin)?.aviso).toBeNull();
  });
});

describe("faltaDatoDePago", () => {
  it("transferencia o depósito preferidos sin cuenta ni CCI", () => {
    expect(faltaDatoDePago({ formaPagoPreferida: "transferencia", cci: null, cuentaBancaria: null, celularBilletera: "987654321" })).toBe("Sin CCI cargado");
    expect(faltaDatoDePago({ formaPagoPreferida: "deposito", cci: null, cuentaBancaria: "  ", celularBilletera: null })).toBe("Sin CCI cargado");
  });
  it("con CCI o con cuenta local no falta nada", () => {
    expect(faltaDatoDePago({ formaPagoPreferida: "transferencia", cci: "00219300214567804558", cuentaBancaria: null, celularBilletera: null })).toBeNull();
    expect(faltaDatoDePago({ formaPagoPreferida: "transferencia", cci: null, cuentaBancaria: "193-1", celularBilletera: null })).toBeNull();
  });
  it("yape/plin preferido sin celular", () => {
    expect(faltaDatoDePago({ formaPagoPreferida: "yape", cci: null, cuentaBancaria: null, celularBilletera: null })).toBe("Sin Yape / Plin cargado");
    expect(faltaDatoDePago({ formaPagoPreferida: "plin", cci: null, cuentaBancaria: null, celularBilletera: "987654321" })).toBeNull();
  });
  it("efectivo, otro o sin preferida: nunca", () => {
    for (const f of ["efectivo", "otro", null]) expect(faltaDatoDePago({ formaPagoPreferida: f, cci: null, cuentaBancaria: null, celularBilletera: null })).toBeNull();
  });
});
