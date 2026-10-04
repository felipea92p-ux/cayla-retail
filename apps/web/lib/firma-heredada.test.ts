import { describe, expect, it } from "vitest";
import { camposDeFirma, esPedidoDeNombre, firmaDelPaso, hayQuePreguntar, preguntaFirma, textoFirma } from "./firma-heredada";
import { sePuedeConfirmar } from "./guia-campos";

// ADR-0328 (actividad 15): el nombre se pide una vez por operación. La regla que manda vive en la base
// (`retail.fn_firma_heredada`, probada en `scripts/pruebas/conteo_firma_arranque.mjs`); esto la anticipa en la pantalla para no
// mostrar un error, y si se equivoca, la base pregunta igual.

const ROSA = "33333333-3333-4333-8333-0000000000c2";

describe("firmaDelPaso", () => {
  it("una persona con su cuenta firma ella: no hereda ni pregunta, sea cual sea la firma de la operación", () => {
    expect(firmaDelPaso({ terminal: false, firma: null })).toEqual({ tipo: "propia" });
    expect(firmaDelPaso({ terminal: false, firma: { personaId: ROSA, nombre: "Rosa", deHoy: false } })).toEqual({ tipo: "propia" });
  });

  it("una terminal con la firma de HOY hereda el nombre (la base lo pone)", () => {
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: "Rosa Prueba", deHoy: true } })).toEqual({ tipo: "heredada", nombre: "Rosa Prueba" });
  });

  it("sin nombre que mostrar, igual hereda: no se inventa a nadie, se dice «quien la empezó»", () => {
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: "  ", deHoy: true } })).toEqual({ tipo: "heredada", nombre: "quien la empezó" });
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: null, deHoy: true } })).toEqual({ tipo: "heredada", nombre: "quien la empezó" });
  });

  it("una terminal con la firma de OTRO día pregunta una vez", () => {
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: "Rosa", deHoy: false } })).toEqual({ tipo: "preguntar", motivo: "otro_dia" });
  });

  it("una terminal sin nadie que haya firmado (recepción recién empezada, conteo viejo sin nombre) pregunta", () => {
    expect(firmaDelPaso({ terminal: true, firma: { personaId: null, nombre: null, deHoy: false } })).toEqual({ tipo: "preguntar", motivo: "nadie" });
    // «de hoy» sin persona no hereda nada.
    expect(firmaDelPaso({ terminal: true, firma: { personaId: null, nombre: null, deHoy: true } })).toEqual({ tipo: "preguntar", motivo: "nadie" });
  });

  it("una terminal que no pudo leer la firma no adivina: manda sin nombre y deja que la base decida", () => {
    expect(firmaDelPaso({ terminal: true, firma: null })).toEqual({ tipo: "desconocida" });
  });
});

describe("textoFirma y preguntaFirma", () => {
  it("dice a nombre de quién va, o por qué se pregunta, en palabras de tienda", () => {
    expect(textoFirma({ tipo: "heredada", nombre: "Rosa" }, "cierre_conteo")).toBe("Se cierra a nombre de Rosa, que abrió este conteo hoy.");
    expect(textoFirma({ tipo: "heredada", nombre: "Rosa" }, "recepcion_traslado")).toBe("Se recibe a nombre de Rosa, que empezó esta recepción hoy.");
    expect(textoFirma({ tipo: "preguntar", motivo: "otro_dia" }, "cierre_conteo")).toMatch(/se abrió otro día: elige quién lo cierra/);
    expect(textoFirma({ tipo: "preguntar", motivo: "nadie" }, "recepcion_traslado")).toMatch(/^Elige quién recibe este traslado\./);
    expect(textoFirma({ tipo: "preguntar", motivo: "otro_dia" }, "recepcion_traslado")).toMatch(/se empezó otro día/);
  });

  it("toda pregunta avisa que es UNA sola vez (la promesa a Felipe)", () => {
    for (const operacion of ["cierre_conteo", "recepcion_traslado"] as const) {
      for (const motivo of ["otro_dia", "nadie"] as const) expect(textoFirma({ tipo: "preguntar", motivo }, operacion)).toMatch(/una sola vez/);
    }
  });

  it("sin nada que decir cuando firma la persona de la sesión o no se sabe", () => {
    expect(textoFirma({ tipo: "propia" }, "cierre_conteo")).toBeNull();
    expect(textoFirma({ tipo: "desconocida" }, "recepcion_traslado")).toBeNull();
  });

  it("la pregunta del combo según la operación", () => {
    expect(preguntaFirma("cierre_conteo")).toBe("¿Quién cierra el conteo?");
    expect(preguntaFirma("recepcion_traslado")).toBe("¿Quién recibe?");
  });
});

describe("esPedidoDeNombre y hayQuePreguntar: la red de seguridad", () => {
  it("solo el pedido de nombre de la base (responsable_requerido) cambia a preguntar; otros rechazos del responsable no", () => {
    expect(esPedidoDeNombre({ hint: "responsable_requerido", message: "Elige quién hace esta operación: se empezó otro día" })).toBe(true);
    expect(esPedidoDeNombre({ hint: "responsable_no_presente" })).toBe(false);
    expect(esPedidoDeNombre({ hint: "conteo_pendientes" })).toBe(false);
    expect(esPedidoDeNombre(null)).toBe(false);
  });

  it("se pregunta al preguntar, o si la base lo pidió aunque la pantalla creyera que heredaba; una persona nunca", () => {
    expect(hayQuePreguntar({ tipo: "preguntar", motivo: "nadie" }, false)).toBe(true);
    expect(hayQuePreguntar({ tipo: "heredada", nombre: "Rosa" }, false)).toBe(false);
    expect(hayQuePreguntar({ tipo: "heredada", nombre: "Rosa" }, true)).toBe(true);
    expect(hayQuePreguntar({ tipo: "desconocida" }, true)).toBe(true);
    expect(hayQuePreguntar({ tipo: "propia" }, true)).toBe(false);
  });
});

describe("camposDeFirma: la guía de foco del nombre", () => {
  it("sin preguntar no hay campo (nada que guiar ni que bloquee)", () => {
    expect(camposDeFirma("cierre_conteo", { preguntar: false, responsableListo: false })).toEqual([]);
    expect(sePuedeConfirmar(camposDeFirma("cierre_conteo", { preguntar: false, responsableListo: false }))).toBe(true);
  });

  it("al preguntar es el único campo, requerido: sin nombre no se confirma (lo mismo que la base)", () => {
    const sinNombre = camposDeFirma("cierre_conteo", { preguntar: true, responsableListo: false });
    expect(sinNombre).toEqual([{ id: "firma", nombre: "Quién cierra", requerido: true, hecho: false, pendiente: "Elige quién cierra el conteo." }]);
    expect(sePuedeConfirmar(sinNombre)).toBe(false);
    expect(sePuedeConfirmar(camposDeFirma("cierre_conteo", { preguntar: true, responsableListo: true }))).toBe(true);
    expect(camposDeFirma("recepcion_traslado", { preguntar: true, responsableListo: false })[0]).toMatchObject({ nombre: "Quién recibe", pendiente: "Elige quién recibe el traslado." });
  });
});
