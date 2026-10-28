import { describe, expect, it } from "vitest";
import { camposDeFirma, esPedidoDeNombre, firmaDelPaso, firmaEnPantalla, mandaNombre, preguntaFirma, textoCambiarFirma, textoFirma, type FirmaDelPaso } from "./firma-heredada";
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

  it("si quien firmó hoy ya marcó su salida, no se hereda: se pregunta, diciendo quién se fue (la base tampoco la hereda)", () => {
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: "Rosa", deHoy: true, presente: false } })).toEqual({ tipo: "preguntar", motivo: "salio", nombre: "Rosa" });
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: null, deHoy: true, presente: false } })).toEqual({ tipo: "preguntar", motivo: "salio" });
    // Sin el dato (la web antes que el SQL) se asume que sigue: si no, la base pregunta.
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: "Rosa", deHoy: true, presente: null } })).toEqual({ tipo: "heredada", nombre: "Rosa" });
    expect(firmaDelPaso({ terminal: true, firma: { personaId: ROSA, nombre: "Rosa", deHoy: true, presente: true } })).toEqual({ tipo: "heredada", nombre: "Rosa" });
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

  it("quien ya marcó su salida: se dice quién y por qué se pregunta", () => {
    expect(textoFirma({ tipo: "preguntar", motivo: "salio", nombre: "Rosa" }, "cierre_conteo")).toBe(
      "Rosa abrió este conteo hoy, pero ya no está de turno: elige quién lo cierra. Se pregunta una sola vez."
    );
    expect(textoFirma({ tipo: "preguntar", motivo: "salio" }, "recepcion_traslado")).toBe(
      "Quien empezó esta recepción ya no está de turno: elige quién la sigue. Se pregunta una sola vez."
    );
  });

  it("toda pregunta avisa que es UNA sola vez (la promesa a Felipe)", () => {
    for (const operacion of ["cierre_conteo", "recepcion_traslado"] as const) {
      for (const motivo of ["otro_dia", "salio", "nadie"] as const) expect(textoFirma({ tipo: "preguntar", motivo }, operacion)).toMatch(/una sola vez/);
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

describe("esPedidoDeNombre: la red de seguridad", () => {
  it("solo el pedido de nombre de la base (responsable_requerido) cambia a preguntar; otros rechazos del responsable no", () => {
    expect(esPedidoDeNombre({ hint: "responsable_requerido", message: "Elige quién hace esta operación: se empezó otro día" })).toBe(true);
    expect(esPedidoDeNombre({ hint: "responsable_no_presente" })).toBe(false);
    expect(esPedidoDeNombre({ hint: "conteo_pendientes" })).toBe(false);
    expect(esPedidoDeNombre(null)).toBe(false);
  });
});

describe("firmaEnPantalla: lo que sabe la base, lo que sabe el aparato y lo que pidió la persona", () => {
  const nada = { recordado: null, aMano: false, laBaseLoPidio: false };
  const heredada: FirmaDelPaso = { tipo: "heredada", nombre: "Rosa" };
  const otroDia: FirmaDelPaso = { tipo: "preguntar", motivo: "otro_dia" };

  it("una persona con su cuenta firma ella, pase lo que pase en el aparato", () => {
    expect(firmaEnPantalla({ tipo: "propia" }, { recordado: "Ana", aMano: true, laBaseLoPidio: true }, "cierre_conteo")).toEqual({ modo: "propia" });
  });

  it("heredada de hoy: la base pone el nombre, la pantalla lo dice y deja corregirlo («¿No es Rosa?»)", () => {
    expect(firmaEnPantalla(heredada, nada, "cierre_conteo")).toEqual({
      modo: "base",
      texto: "Se cierra a nombre de Rosa, que abrió este conteo hoy.",
      cambiar: "¿No es Rosa? Elige quién cierra",
    });
    expect(textoCambiarFirma("Rosa", "recepcion_traslado")).toBe("¿No es Rosa? Elige quién recibe");
  });

  it("el aparato ya sabe quién contó (y sigue de turno): manda su nombre, también en un conteo de OTRO día (no vuelve a preguntar)", () => {
    const f = firmaEnPantalla(otroDia, { ...nada, recordado: "Ana" }, "cierre_conteo");
    expect(f).toEqual({
      modo: "recordada",
      texto: "Se cierra a nombre de Ana, a quien eligieron en este aparato para este conteo.",
      cambiar: "¿No es Ana? Elige quién cierra",
    });
    expect(mandaNombre(f)).toBe(true);
    // Y antes que la herencia: quien contó en este aparato firma lo suyo («quien abrió o contó»).
    expect(firmaEnPantalla(heredada, { ...nada, recordado: "Ana" }, "cierre_conteo").modo).toBe("recordada");
  });

  it("otro día, salida marcada o nadie, sin nada recordado: el combo, con el porqué", () => {
    expect(firmaEnPantalla(otroDia, nada, "cierre_conteo")).toEqual({ modo: "elegir", texto: "Este conteo se abrió otro día: elige quién lo cierra. Se pregunta una sola vez." });
    expect(firmaEnPantalla({ tipo: "preguntar", motivo: "salio", nombre: "Rosa" }, nada, "recepcion_traslado").modo).toBe("elegir");
  });

  it("si la persona pidió elegir (o ya tocó el combo), el combo se queda a la vista aunque haya alguien elegido", () => {
    const f = firmaEnPantalla(heredada, { recordado: "Ana", aMano: true, laBaseLoPidio: false }, "cierre_conteo");
    expect(f).toEqual({ modo: "elegir", texto: "Elige quién cierra este conteo." });
    expect(mandaNombre(f)).toBe(true);
  });

  it("si la base pidió el nombre, se pregunta sin afirmar por qué (no se dice «otro día» si no se sabe)", () => {
    expect(firmaEnPantalla(heredada, { ...nada, laBaseLoPidio: true }, "recepcion_traslado")).toEqual({
      modo: "elegir",
      texto: "Elige quién recibe este traslado. Se pregunta una sola vez: lo demás de la recepción va a su nombre.",
    });
    expect(firmaEnPantalla({ tipo: "desconocida" }, { ...nada, laBaseLoPidio: true }, "cierre_conteo").modo).toBe("elegir");
  });

  it("sin poder leer la firma y sin nada recordado: se manda sin nombre y no se dice nada (decide la base)", () => {
    const f = firmaEnPantalla({ tipo: "desconocida" }, nada, "cierre_conteo");
    expect(f).toEqual({ modo: "base", texto: null, cambiar: null });
    expect(mandaNombre(f)).toBe(false);
    expect(mandaNombre({ modo: "propia" })).toBe(false);
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
