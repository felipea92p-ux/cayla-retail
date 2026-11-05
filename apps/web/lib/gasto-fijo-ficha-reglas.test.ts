import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  camposDePago,
  contratoPorVencer,
  faltaDeLaFicha,
  FICHA_VACIA,
  fichaParaEnviar,
  FORMAS_DE_PAGO,
  leerFicha,
  leerResumenFicha,
  normalizarFicha,
  proveedoresParaElegirEnGasto,
  problemaDeLaFicha,
  TEXTO_FORMA_DE_PAGO,
  textoContratoPorVencer,
  textoDeLoQueFalta,
  TOPES_FICHA,
  type FichaFijo,
} from "./gasto-fijo-ficha-reglas";

const MIG = readFileSync(join(__dirname, "../../../supabase/migrations/20261018003000_gasto_fijo_ficha_de_pago.sql"), "utf8");
const con = (c: Partial<FichaFijo>): FichaFijo => ({ ...FICHA_VACIA, ...c });

describe("la ficha dice lo mismo que la base (ADR-0452)", () => {
  it("los topes de los textos son los de gastos_fijos_ficha_textos_con_tope", () => {
    const tope = (col: string) => Number(MIG.match(new RegExp(`char_length\\(${col}\\) <= (\\d+)`))?.[1]);
    expect(tope("beneficiario")).toBe(TOPES_FICHA.beneficiario);
    expect(tope("telefono")).toBe(TOPES_FICHA.telefono);
    expect(tope("correo")).toBe(TOPES_FICHA.correo);
    expect(tope("banco")).toBe(TOPES_FICHA.banco);
    expect(tope("cuenta_bancaria")).toBe(TOPES_FICHA.cuenta);
    expect(tope("titular_cuenta")).toBe(TOPES_FICHA.titular);
    expect(tope("codigo_servicio")).toBe(TOPES_FICHA.codigo);
    expect(tope("recibo_llega")).toBe(TOPES_FICHA.recibo);
    expect(tope("notas")).toBe(TOPES_FICHA.notas);
  });
  it("las formas de pago son las del candado de la tabla", () => {
    const lista = MIG.match(/forma_de_pago in \(([^)]*)\)\)/)?.[1] ?? "";
    expect([...lista.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...FORMAS_DE_PAGO]);
    for (const f of FORMAS_DE_PAGO) expect(TEXTO_FORMA_DE_PAGO[f]).toBeTruthy();
  });
  it("los errores comunes dicen las mismas palabras que la base", () => {
    const casos: [FichaFijo, string][] = [
      [con({ documentoTipo: "dni", documentoNumero: "1234567" }), "El DNI tiene 8 números."],
      [con({ documentoTipo: "ruc", documentoNumero: "2012345" }), "El RUC tiene 11 números."],
      [con({ documentoTipo: "dni" }), "Elige el tipo de documento y escribe su número, o deja los dos vacíos."],
      [con({ correo: "rosa" }), "El correo no parece un correo (le falta algo antes o después de la arroba)."],
      [con({ telefono: "abc" }), "El teléfono lleva solo números (de 6 a 15)."],
      [con({ contratoVence: "2026-02-31" }), "La fecha en que vence el contrato no es una fecha válida."],
      [con({ celularBilletera: "987654321" }), "Para Yape o Plin hacen falta el celular y la app (Yape, Plin o los dos)."],
    ];
    for (const [ficha, mensaje] of casos) {
      expect(problemaDeLaFicha(ficha, true)).toBe(mensaje);
      expect(MIG).toContain(mensaje);
    }
  });
});

describe("problemaDeLaFicha", () => {
  it("una ficha vacía o con tres datos está bien: se completa de a poco", () => {
    expect(problemaDeLaFicha(FICHA_VACIA, true)).toBeNull();
    expect(problemaDeLaFicha(con({ beneficiario: "Rosa", formaDePago: "recibo", codigoServicio: "NIS 1234567" }), false)).toBeNull();
  });
  it("acepta un DNI con espacios y un CCI con guiones", () => {
    expect(problemaDeLaFicha(con({ documentoTipo: "dni", documentoNumero: "45 678 901", cci: "002-193-001234567012-58" }), true)).toBeNull();
  });
  it("un CCI o un celular mal escritos se dicen, pero solo a quien los ve", () => {
    expect(problemaDeLaFicha(con({ cci: "123" }), true)).toMatch(/20 dígitos/);
    expect(problemaDeLaFicha(con({ cci: "123" }), false)).toBeNull();
    expect(problemaDeLaFicha(con({ celularBilletera: "787654321", billeteras: ["yape"] }), true)).toMatch(/empezar con 9/);
  });
  it("Yape sin app, o la app sin celular", () => {
    expect(problemaDeLaFicha(con({ billeteras: ["plin"] }), true)).toMatch(/Escribe el celular/);
  });
  it("una fecha del 31 de febrero no existe", () => {
    expect(problemaDeLaFicha(con({ contratoVence: "2027-03-31" }), true)).toBeNull();
    expect(problemaDeLaFicha(con({ contratoVence: "2027-02-31" }), true)).not.toBeNull();
  });
});

describe("fichaParaEnviar: solo lo que cambió", () => {
  it("un fijo nuevo con la ficha vacía no manda nada", () => {
    expect(fichaParaEnviar(FICHA_VACIA, FICHA_VACIA, true)).toEqual({ ok: true, valor: null });
  });
  it("un fijo nuevo manda solo lo que se llenó, normalizado", () => {
    const r = fichaParaEnviar(con({ beneficiario: " Rosa Quispe ", correo: "Rosa@Mail.com", documentoTipo: "dni", documentoNumero: "45 678 901" }), FICHA_VACIA, true);
    expect(r).toEqual({ ok: true, valor: { beneficiario: "Rosa Quispe", correo: "rosa@mail.com", documento_tipo: "dni", documento_numero: "45678901" } });
  });
  it("editar sin tocar nada no manda nada", () => {
    const inicial = con({ beneficiario: "Rosa", cci: "00219300123456701258", celularBilletera: "987654321", billeteras: ["yape"] });
    expect(fichaParaEnviar({ ...inicial }, inicial, true)).toEqual({ ok: true, valor: null });
  });
  it("cambiar una cosa manda solo esa; vaciarla manda null", () => {
    const inicial = con({ beneficiario: "Rosa", telefono: "987654321", notas: "llamar antes" });
    expect(fichaParaEnviar({ ...inicial, telefono: "012345678", notas: "" }, inicial, true)).toEqual({ ok: true, valor: { telefono: "012345678", notas: null } });
  });
  it("el celular de Yape y su app viajan juntos", () => {
    const inicial = con({ celularBilletera: "987654321", billeteras: ["yape"] });
    const r = fichaParaEnviar({ ...inicial, billeteras: ["plin", "yape"] }, inicial, true);
    expect(r).toEqual({ ok: true, valor: { celular_billetera: "987654321", billeteras: ["yape", "plin"] } });
  });
  it("sin permiso para ver cuentas, ningún dato bancario sale, aunque venga escrito", () => {
    const r = fichaParaEnviar(con({ beneficiario: "Rosa", cci: "00219300123456701258", banco: "BCP", titularCuenta: "Rosa" }), FICHA_VACIA, false);
    expect(r).toEqual({ ok: true, valor: { beneficiario: "Rosa" } });
  });
  it("un error común frena el envío con su mensaje", () => {
    expect(fichaParaEnviar(con({ documentoTipo: "dni", documentoNumero: "12" }), FICHA_VACIA, true)).toEqual({ ok: false, error: "El DNI tiene 8 números." });
  });
});

describe("normalizarFicha y camposDePago", () => {
  it("el celular pierde el +51 y las apps salen en su orden", () => {
    const n = normalizarFicha(con({ celularBilletera: "+51 987 654 321", billeteras: ["plin", "yape"] }));
    expect(n.celularBilletera).toBe("987654321");
    expect(n.billeteras).toEqual(["yape", "plin"]);
  });
  it("cada forma de pago pide lo suyo, y nunca se esconde lo que ya está cargado", () => {
    expect(camposDePago(con({ formaDePago: "transferencia" }))).toEqual({ cuenta: true, billetera: false });
    expect(camposDePago(con({ formaDePago: "billetera" }))).toEqual({ cuenta: false, billetera: true });
    expect(camposDePago(con({ formaDePago: "recibo" }))).toEqual({ cuenta: false, billetera: false });
    expect(camposDePago(con({}))).toEqual({ cuenta: false, billetera: false });
    expect(camposDePago(con({ formaDePago: "efectivo", cci: "00219300123456701258" }))).toEqual({ cuenta: true, billetera: false });
  });
});

describe("leer lo que devuelve la base", () => {
  it("una fila sin ficha todavía: existe=false y todo vacío", () => {
    const f = leerFicha({ gasto_fijo_id: "x", puede_ver_banco: true, tiene_cuenta: false, actualizado_en: null });
    expect(f).toMatchObject({ existe: false, beneficiario: "", puedeVerBanco: true, tieneCuenta: false });
  });
  it("sin fila (la cuenta no ve el fijo) es null", () => {
    expect(leerFicha(undefined)).toBeNull();
  });
  it("lee una ficha completa, con billeteras y fecha", () => {
    const f = leerFicha({ beneficiario: "Rosa", documento_tipo: "dni", documento_numero: "45678901", forma_de_pago: "transferencia", billeteras: ["yape", "paypal"], contrato_vence: "2027-03-31", actualizado_en: "2026-10-18T10:00:00Z", puede_ver_banco: false });
    expect(f).toMatchObject({ existe: true, documentoTipo: "dni", formaDePago: "transferencia", billeteras: ["yape"], contratoVence: "2027-03-31", puedeVerBanco: false, tieneCuenta: null });
  });
  it("un valor raro de la base cuenta como vacío, no rompe", () => {
    expect(leerFicha({ forma_de_pago: "bitcoin", documento_tipo: "pasaporte" })).toMatchObject({ formaDePago: "", documentoTipo: "" });
    expect(leerResumenFicha({ gasto_fijo_id: 7, forma_de_pago: "otro" }).resumen.formaDePago).toBe("");
  });
});

describe("qué le falta a una ficha para que otro pueda pagar", () => {
  const r = (x: Partial<ReturnType<typeof leerResumenFicha>["resumen"]>) => ({ beneficiario: "", formaDePago: "" as const, codigoServicio: "", contratoVence: "", tieneCuenta: null, ...x });
  it("sin ficha: falta a quién y cómo", () => {
    expect(faltaDeLaFicha(undefined)).toEqual(["a quién se le paga", "cómo se paga"]);
    expect(textoDeLoQueFalta(faltaDeLaFicha(undefined))).toBe("Falta a quién se le paga y cómo se paga");
  });
  it("con a quién y cómo (recibo): está lo mínimo", () => {
    expect(faltaDeLaFicha(r({ beneficiario: "Luz del Sur", formaDePago: "recibo" }))).toEqual([]);
    expect(textoDeLoQueFalta([])).toBeNull();
  });
  it("transferencia sin cuenta cargada: falta la cuenta, pero solo si quien mira puede saberlo", () => {
    expect(faltaDeLaFicha(r({ beneficiario: "Rosa", formaDePago: "transferencia", tieneCuenta: false }))).toEqual(["la cuenta"]);
    expect(faltaDeLaFicha(r({ beneficiario: "Rosa", formaDePago: "transferencia", tieneCuenta: null }))).toEqual([]);
    expect(faltaDeLaFicha(r({ beneficiario: "Rosa", formaDePago: "transferencia", tieneCuenta: true }))).toEqual([]);
  });
  it("una sola cosa que falta se lee sin «y»", () => {
    expect(textoDeLoQueFalta(["la cuenta"])).toBe("Falta la cuenta");
  });
});

describe("contrato por vencer", () => {
  it("avisa a 60 días o menos, y vencido", () => {
    expect(contratoPorVencer("2026-12-17", "2026-10-18")).toEqual({ dias: 60, vencido: false });
    expect(contratoPorVencer("2026-12-18", "2026-10-18")).toBeNull();
    expect(contratoPorVencer("2026-10-17", "2026-10-18")).toEqual({ dias: -1, vencido: true });
    expect(contratoPorVencer("", "2026-10-18")).toBeNull();
  });
  it("lo dice en palabras", () => {
    expect(textoContratoPorVencer({ dias: 0, vencido: false })).toBe("El contrato vence hoy");
    expect(textoContratoPorVencer({ dias: 1, vencido: false })).toBe("El contrato vence mañana");
    expect(textoContratoPorVencer({ dias: 30, vencido: false })).toBe("El contrato vence en 30 días");
    expect(textoContratoPorVencer({ dias: -1, vencido: true })).toBe("Contrato vencido ayer");
    expect(textoContratoPorVencer({ dias: -9, vencido: true })).toBe("Contrato vencido hace 9 días");
  });
});

describe("proveedoresParaElegirEnGasto", () => {
  const luz = { id: "luz", rubros: ["Gastos"] };
  const telas = { id: "telas", rubros: ["Telas"] };
  const mixto = { id: "mixto", rubros: ["Telas", "gastos "] };
  const sinRubro = { id: "nada" };

  it("ofrece solo los de servicios, no la mercadería", () => {
    expect(proveedoresParaElegirEnGasto([luz, telas, mixto, sinRubro], "").map((p) => p.id)).toEqual(["luz", "mixto"]);
  });

  it("deja el ya elegido aunque sea de mercadería", () => {
    expect(proveedoresParaElegirEnGasto([luz, telas], "telas").map((p) => p.id)).toEqual(["luz", "telas"]);
  });
});
