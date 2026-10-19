import { describe, expect, it } from "vitest";
import {
  codigoCompleto,
  compraMinimaDelCanje,
  filaDePuntos,
  normalizarCodigo,
  opcionesDeCanje,
  puntosQueGana,
  rechazoDelCupon,
  resultadoDelCodigo,
  resumenDePuntos,
  valorDePuntos,
  type ConfigPuntos,
} from "./club-puntos-reglas";

// La configuración de fábrica: 1 punto por sol, 100 puntos = S/ 5, canje desde 200, compra mínima 3× el cupón.
const CFG: ConfigPuntos = { puntosPorSol: 1, solesPor100: 5, canjeMinimo: 200, compraMinimaX: 3, vigenciaDias: 7, regaloCumple: 100 };

describe("cuentas de puntos", () => {
  it("100 puntos valen lo que dice la configuración", () => {
    expect(valorDePuntos(100, CFG)).toBe(5);
    expect(valorDePuntos(1240, CFG)).toBe(62);
    expect(valorDePuntos(300, { solesPor100: 2.5 })).toBe(7.5);
  });

  it("la compra mínima del cupón es ceil(valor × x), como la base", () => {
    expect(compraMinimaDelCanje(200, CFG)).toBe(30);
    expect(compraMinimaDelCanje(100, { solesPor100: 5, compraMinimaX: 2.5 })).toBe(13);
    expect(compraMinimaDelCanje(300, { solesPor100: 2.5, compraMinimaX: 3 })).toBe(23);
  });

  it("la compra gana lo que paga, hacia abajo", () => {
    expect(puntosQueGana(150.9, CFG)).toBe(150);
    expect(puntosQueGana(0, CFG)).toBe(0);
    expect(puntosQueGana(99.99, { puntosPorSol: 2 })).toBe(199);
    expect(puntosQueGana(50, { puntosPorSol: 0 })).toBe(0);
  });
});

describe("opcionesDeCanje", () => {
  it("de a 100, desde el mínimo, hasta lo que el saldo y la compra permiten", () => {
    // Ticket de S/ 90: cupón máximo 30/ (5×3=15 por 100 pts) → 600 pts (valor 30, mínimo 90). Saldo 1 240.
    expect(opcionesDeCanje(1240, 90, CFG)).toEqual({ tipo: "posible", min: 200, max: 600, paso: 100 });
  });

  it("el saldo manda cuando es menor que lo que la compra permite", () => {
    expect(opcionesDeCanje(350, 1000, CFG)).toEqual({ tipo: "posible", min: 200, max: 300, paso: 100 });
  });

  it("saldo corto: dice cuántos puntos faltan", () => {
    expect(opcionesDeCanje(120, 500, CFG)).toEqual({ tipo: "saldo_corto", faltan: 80 });
  });

  it("compra corta: dice cuánto debe comprar para el cupón más chico", () => {
    expect(opcionesDeCanje(900, 25, CFG)).toEqual({ tipo: "compra_corta", comprarAlMenos: 30 });
  });

  it("nunca ofrece un canje que la base rechazaría (recorre muchos tickets y saldos)", () => {
    for (let saldo = 0; saldo <= 2000; saldo += 50) {
      for (let total = 0; total <= 400; total += 7.5) {
        const o = opcionesDeCanje(saldo, total, CFG);
        if (o.tipo !== "posible") continue;
        expect(o.min).toBeGreaterThanOrEqual(CFG.canjeMinimo);
        expect(o.max).toBeLessThanOrEqual(saldo);
        expect(o.max % 100).toBe(0);
        expect(compraMinimaDelCanje(o.max, CFG)).toBeLessThanOrEqual(total);
        // El cupón nunca cubre toda la compra.
        expect(valorDePuntos(o.max, CFG)).toBeLessThan(total);
      }
    }
  });
});

describe("filaDePuntos", () => {
  const resumen = resumenDePuntos({
    puntos_por_sol: 1,
    soles_por_100: 5,
    canje_minimo: 200,
    compra_minima_x: 3,
    vigencia_dias: 7,
    regalo_cumple: 100,
    miembro: true,
    saldo: 1240,
    valor_saldo: 62,
    regalo_disponible: false,
    cupones: [],
  });
  const base = { resumen, totalDelTicket: 200, hayArticulos: true, cuponPuesto: false, sinConexion: false };

  it("con saldo y compra suficientes ofrece «Usar puntos»", () => {
    const f = filaDePuntos(base);
    expect(f.destacado).toMatch(/^1\D?240 puntos$/);
    expect(f.boton).toEqual({ texto: "Usar puntos", primario: true, accion: "usar" });
  });

  it("sin conexión, con cupón ya puesto, sin prendas o con compra corta: apagado y dice por qué", () => {
    expect(filaDePuntos({ ...base, sinConexion: true }).boton.accion).toBeNull();
    expect(filaDePuntos({ ...base, cuponPuesto: true }).bajada).toMatch(/cupón/i);
    expect(filaDePuntos({ ...base, hayArticulos: false }).bajada).toMatch(/Agrega prendas/);
    const corta = filaDePuntos({ ...base, totalDelTicket: 20 });
    expect(corta.boton.accion).toBeNull();
    expect(corta.bajada).toMatch(/S\/ 30/);
  });

  it("con saldo menor al mínimo dice desde cuántos puntos canjea", () => {
    const poco = { ...resumen, saldo: 120, valorSaldo: 6 };
    const f = filaDePuntos({ ...base, resumen: poco });
    expect(f.boton.accion).toBeNull();
    expect(f.bajada).toMatch(/200/);
  });
});

describe("el código que se escribe o se escanea", () => {
  it("se arma solo: mayúsculas, sin espacios, con sus guiones", () => {
    expect(normalizarCodigo("cay4k7p9h2m")).toBe("CAY-4K7P-9H2M");
    expect(normalizarCodigo(" CAY-4K7P-9H2M ")).toBe("CAY-4K7P-9H2M");
    expect(normalizarCodigo("4k7p")).toBe("CAY-4K7P");
    expect(normalizarCodigo("")).toBe("CAY");
    expect(normalizarCodigo("CAY-4K7P-9H2M-sobra")).toBe("CAY-4K7P-9H2M");
  });

  it("solo un código completo se pregunta a la base", () => {
    expect(codigoCompleto("CAY-4K7P-9H2M")).toBe(true);
    expect(codigoCompleto("CAY-4K7P")).toBe(false);
    expect(codigoCompleto("CAY-4K7P-9H2")).toBe(false);
  });
});

describe("resultadoDelCodigo", () => {
  it("un cupón bueno trae su valor, su mínimo y de quién es", () => {
    const r = resultadoDelCodigo({ ok: true, codigo: "CAY-AAAA-BBBB", valor: 10, compra_minima: 30, vence_el: "2026-11-02", puntos: 200, de: "Lucía" });
    expect(r).toEqual({
      tipo: "ok",
      cupon: { codigo: "CAY-AAAA-BBBB", valor: 10, compraMinima: 30, venceEl: "2026-11-02", origen: "codigo", de: "Lucía" },
    });
  });

  it("cada motivo se dice en palabras de tienda", () => {
    const no = (v: Parameters<typeof resultadoDelCodigo>[0]) => {
      const r = resultadoDelCodigo(v);
      if (r.tipo !== "no") throw new Error("debía ser un no");
      return r;
    };
    expect(no({ ok: false, motivo: "no_existe", intentos: 1 }).titulo).toMatch(/No encontramos/);
    expect(no({ ok: false, motivo: "usado" }).titulo).toMatch(/ya se usó/);
    expect(no({ ok: false, motivo: "vencido", vence_el: "2026-10-12" }).titulo).toMatch(/12 oct/);
    expect(no({ ok: false, motivo: "bloqueado" }).detalle).toMatch(/5 minutos/);
    const minimo = no({ ok: false, motivo: "minimo", compra_minima: 30, faltan: 12.5 });
    expect(minimo.detalle).toMatch(/S\/ 30/);
    expect(minimo.detalle).toMatch(/S\/ 12\.50/);
  });
});

describe("rechazoDelCupon", () => {
  it("siempre dice que la venta no se guardó y qué hacer", () => {
    for (const hint of ["cupon_ya_usado", "cupon_vencido", "cupon_no_existe", "cupon_compra_minima", "cupon_cubre_todo", "cupon_sin_monto", "cupon_descuento_distinto", "club_un_cupon_por_compra"]) {
      const r = rechazoDelCupon(hint);
      expect(r?.detalle, hint).toMatch(/^La venta no se guardó\./);
    }
  });

  it("lo que no es del cupón no lo toca", () => {
    expect(rechazoDelCupon("sin_stock")).toBeNull();
    expect(rechazoDelCupon(null)).toBeNull();
    expect(rechazoDelCupon(undefined)).toBeNull();
  });
});
