import { describe, expect, it } from "vitest";
import {
  codigoCompleto,
  interpretarValidacion,
  leerCuponDelPedido,
  MENSAJES_CUPON_AL_SEPARAR,
  mensajeDeCupon,
  normalizarCodigo,
  textoCuponLiberado,
  textoDelDescuento,
  type MotivoCupon,
} from "./cupon";

const NBSP = String.fromCharCode(0xa0);

describe("el código que escribe", () => {
  it("se escribe como lo guarda la base, con o sin guiones y espacios", () => {
    expect(normalizarCodigo("cay-4k7p-9h2m")).toBe("CAY-4K7P-9H2M");
    expect(normalizarCodigo(" cay 4k7p 9h2m ")).toBe("CAY-4K7P-9H2M");
    expect(normalizarCodigo("CAY4K7P9H2M")).toBe("CAY-4K7P-9H2M");
    expect(normalizarCodigo("hola")).toBe("HOLA");
  });
  it("solo un código entero, con el alfabeto de la base (sin 0/O/1/I), se pregunta", () => {
    expect(codigoCompleto("cay-4k7p-9h2m")).toBe(true);
    expect(codigoCompleto("CAY-4K7P-9H2")).toBe(false);
    expect(codigoCompleto("CAY-4K7P-9H20")).toBe(false);
    expect(codigoCompleto("CAY-IOIO-1111")).toBe(false);
    expect(codigoCompleto("")).toBe(false);
  });
});

describe("lo que responde tienda_validar_cupon", () => {
  it("ok: valor, mínimo, vencimiento y si es suyo; nunca de quién es", () => {
    const v = interpretarValidacion({ ok: true, codigo: "CAY-4K7P-9H2M", valor: 20, compra_minima: 60, vence_el: "2026-10-26", tuyo: true, de: "Lucía" });
    expect(v).toEqual({ ok: true, codigo: "CAY-4K7P-9H2M", valor: 20, compraMinima: 60, venceEl: "2026-10-26", tuyo: true });
  });
  it("cada motivo de la base tiene su frase, sin jerga", () => {
    const motivos: MotivoCupon[] = ["no_existe", "usado", "reservado", "vencido", "minimo", "cubre_todo", "bloqueado"];
    for (const m of motivos) {
      const v = interpretarValidacion({ ok: false, motivo: m, faltan: m === "minimo" ? 10 : undefined });
      expect(v?.ok).toBe(false);
      if (v && !v.ok) expect(mensajeDeCupon(v).length).toBeGreaterThan(10);
    }
  });
  it("el mínimo dice cuánto falta, con «S/» que no se parte", () => {
    const v = interpretarValidacion({ ok: false, motivo: "minimo", compra_minima: 60, faltan: 10 });
    expect(v && !v.ok && mensajeDeCupon(v)).toBe(`Este cupón pide una compra mayor: te faltan S/${NBSP}10.00.`);
  });
  it("una respuesta sin forma es null (se dice «no pudimos revisarlo»)", () => {
    expect(interpretarValidacion(null)).toBeNull();
    expect(interpretarValidacion({ ok: false, motivo: "otro" })).toBeNull();
    expect(interpretarValidacion({ ok: true, codigo: "X" })).toBeNull();
  });
});

describe("el descuento y lo que dice el pedido", () => {
  it("el descuento dice cuánto queda", () => {
    expect(textoDelDescuento(20, 100)).toBe(`Descuento de S/${NBSP}20.00: tu total queda en S/${NBSP}80.00.`);
  });
  it("las negativas de «Separar» por el cupón tienen su frase", () => {
    for (const hint of ["cupon_no_existe", "cupon_ya_usado", "cupon_reservado", "cupon_vencido", "cupon_compra_minima", "cupon_cubre_todo", "cupon_bloqueado"]) {
      expect(MENSAJES_CUPON_AL_SEPARAR[hint]).toBeTruthy();
    }
  });
  it("el cupón del pedido: reservado o usado no dice nada extra; liberado dice por qué volvió", () => {
    const base = { codigo: "CAY-4K7P-9H2M", valor: 20, descuento: 20, liberado_motivo: null };
    const reservado = leerCuponDelPedido({ ...base, estado: "reservado" });
    expect(reservado?.estado).toBe("reservado");
    expect(reservado && textoCuponLiberado(reservado)).toBeNull();
    const minimo = leerCuponDelPedido({ ...base, descuento: 0, estado: "liberado", liberado_motivo: "compra_minima" });
    expect(minimo && textoCuponLiberado(minimo)).toMatch(/volvió a «Mi Club».*compra mínima/);
    const cerrado = leerCuponDelPedido({ ...base, estado: "liberado", liberado_motivo: "pedido_anulado" });
    expect(cerrado && textoCuponLiberado(cerrado)).toMatch(/se cerró/);
  });
  it("sin cupón o con un dato raro: null (el pedido se sigue viendo)", () => {
    expect(leerCuponDelPedido(null)).toBeNull();
    expect(leerCuponDelPedido({ codigo: "CAY-4K7P-9H2M", estado: "raro" })).toBeNull();
  });
});
