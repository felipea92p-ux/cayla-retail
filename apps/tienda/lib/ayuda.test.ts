import { describe, expect, it } from "vitest";
import { avisosParaSeparar, interpretarAyuda, PLAZOS_SIN_DATOS, pasosParaSeparar, puntosDeCambios, textoCambios } from "./ayuda";

// Lo que devuelve `retail.tienda_ayuda()` con los plazos de fábrica de Configuración ▸ Tienda web y el de cambio de la caja.
const DE_FABRICA = { horas_para_confirmar: 24, horas_para_pagar: 48, dias_para_recoger: 7, dias_para_cambiar: 15 };

describe("los plazos de la ayuda", () => {
  it("lee lo que devuelve la base", () => {
    expect(interpretarAyuda(DE_FABRICA)).toEqual({ horasParaConfirmar: 24, horasParaPagar: 48, diasParaRecoger: 7, diasParaCambiar: 15 });
  });

  it("una base sin las horas para pagar (antes de 20261016001000) las deja sin dato y lo demás sigue", () => {
    expect(interpretarAyuda({ horas_para_confirmar: 24, dias_para_recoger: 7, dias_para_cambiar: 15 })).toEqual({
      horasParaConfirmar: 24,
      horasParaPagar: null,
      diasParaRecoger: 7,
      diasParaCambiar: 15,
    });
    expect(interpretarAyuda({ ...DE_FABRICA, horas_para_pagar: 721 }).horasParaPagar).toBeNull();
  });

  it("un plazo raro (o fuera de lo que la base acepta) queda sin dato; los demás se usan; sin respuesta, ninguno", () => {
    expect(interpretarAyuda({ ...DE_FABRICA, horas_para_confirmar: 0 })).toEqual({
      horasParaConfirmar: null,
      horasParaPagar: 48,
      diasParaRecoger: 7,
      diasParaCambiar: 15,
    });
    expect(interpretarAyuda({ ...DE_FABRICA, dias_para_recoger: "7" }).diasParaRecoger).toBeNull();
    expect(interpretarAyuda({ ...DE_FABRICA, horas_para_confirmar: 200 }).horasParaConfirmar).toBeNull();
    expect(interpretarAyuda({ horas_para_confirmar: null, dias_para_recoger: null, dias_para_cambiar: 15 })).toEqual({
      horasParaConfirmar: null,
      horasParaPagar: null,
      diasParaRecoger: null,
      diasParaCambiar: 15,
    });
    for (const raro of [null, undefined, "x", 3]) expect(interpretarAyuda(raro)).toEqual(PLAZOS_SIN_DATOS);
  });
});

describe("Cómo separar", () => {
  it("los cuatro pasos de la maqueta, con las tiendas de la web por su nombre", () => {
    const pasos = pasosParaSeparar(["Trujillo", "Arequipa", "Lima"]);
    expect(pasos.map((p) => p.titulo)).toEqual(["Crea tu cuenta", "Elige tus prendas y tu tienda", "Toca «Separar» y mándalo por WhatsApp", "Paga y recógelo"]);
    expect(pasos[1].texto).toBe("En cada prenda ves cuánto hay en Trujillo, Arequipa y Lima. Lo que no está en tu tienda, la tienda puede traerlo de otra.");
    expect(pasosParaSeparar(["Trujillo", "Lima"])[1].texto).toBe(
      "En cada prenda ves cuánto hay en Trujillo y Lima. Lo que no está en tu tienda, la tienda puede traerlo de otra.",
    );
  });

  it("con una sola tienda no hay otra de dónde traer; sin tiendas (o sin base), la frase va sin nombres", () => {
    expect(pasosParaSeparar(["Trujillo"])[1].texto).toBe("En cada prenda ves cuánto hay en Trujillo.");
    expect(pasosParaSeparar([])[1].texto).toBe("En cada prenda ves cuánto hay en cada tienda. Lo que no está en tu tienda, la tienda puede traerlo de otra.");
  });

  it("con cuenta, «Crea tu cuenta» ya está hecho; sin cuenta, es el primer paso por hacer", () => {
    const sin = pasosParaSeparar(["Trujillo", "Lima"]);
    expect(sin[0]).toEqual({
      titulo: "Crea tu cuenta",
      texto: "Con tu correo, tu documento, tu celular y tu cumpleaños. Al crearla ya eres miembro del Club CAYLA.",
      hecho: false,
    });
    const con = pasosParaSeparar(["Trujillo", "Lima"], true);
    expect(con[0]).toEqual({ titulo: "Ya tienes tu cuenta", texto: "Y eres miembro del Club CAYLA.", hecho: true });
    // Los demás pasos no cambian con la cuenta, y ninguno más viene hecho.
    expect(con.slice(1)).toEqual(sin.slice(1));
    expect(con.filter((p) => p.hecho)).toHaveLength(1);
    // Sin género para la persona (ADR-0288 act. k): «miembro», nunca «socia» ni «clienta».
    for (const p of [...sin, ...con]) expect(`${p.titulo} ${p.texto}`).not.toMatch(/socia|clienta|bienvenida/i);
  });

  it("los avisos dicen los plazos de Configuración ▸ Tienda web, en singular o plural, y que el de confirmar es de la tienda", () => {
    expect(avisosParaSeparar(interpretarAyuda(DE_FABRICA))).toEqual({
      confirmar: {
        titulo: "La tienda tiene 24 horas para confirmarlo",
        texto: "Si en ese tiempo no lo confirma, el pedido se cierra solo y puedes volver a separarlo.",
      },
      pagar: {
        titulo: "Pagas dentro de 48 horas",
        texto: "Desde que la tienda confirma tu pedido tienes 48 horas para pagarlo. Si no llega ningún pago, se anula solo y las prendas vuelven a la tienda.",
      },
      recoger: {
        titulo: "Por ahora, todo se recoge en tienda",
        texto: "Todavía no hacemos envíos. Lo recoges en la tienda que elegiste, hasta 7 días después de pagar.",
      },
    });
    const uno = avisosParaSeparar({ horasParaConfirmar: 1, horasParaPagar: 1, diasParaRecoger: 1, diasParaCambiar: 15 });
    expect(uno.confirmar.titulo).toBe("La tienda tiene 1 hora para confirmarlo");
    expect(uno.pagar.titulo).toBe("Pagas dentro de 1 hora");
    expect(uno.recoger.texto).toContain("hasta 1 día después de pagar");
  });

  it("sin los plazos, los avisos no dicen ningún número (nunca uno inventado)", () => {
    const sin = avisosParaSeparar(PLAZOS_SIN_DATOS);
    expect(sin.confirmar).toEqual({
      titulo: "La tienda tiene un plazo para confirmarlo",
      texto: "Si no lo confirma a tiempo, el pedido se cierra solo y puedes volver a separarlo.",
    });
    expect(sin.recoger.texto).toBe("Todavía no hacemos envíos. Lo recoges en la tienda que elegiste.");
    expect(sin.pagar.titulo).toBe("Si no pagas, se anula solo");
    expect(`${sin.confirmar.titulo} ${sin.confirmar.texto} ${sin.pagar.titulo} ${sin.pagar.texto} ${sin.recoger.texto}`).not.toMatch(/\d/);
  });
});

describe("Cambios y devoluciones", () => {
  it("igual que en tienda, con el plazo de la caja (el que imprime la boleta)", () => {
    expect(textoCambios(interpretarAyuda(DE_FABRICA))).toBe(
      "Igual que en tienda: puedes cambiar o devolver tu prenda dentro de 15 días, en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta.",
    );
  });

  it("sin el plazo, sin número: va impreso en la boleta", () => {
    const texto = textoCambios(PLAZOS_SIN_DATOS);
    expect(texto).toBe(
      "Igual que en tienda: puedes cambiar o devolver tu prenda en cualquier tienda CAYLA, con tu boleta y la etiqueta puesta. El plazo va impreso en tu boleta.",
    );
    expect(texto).not.toMatch(/\d/);
  });

  it("la página lo parte en tres (cuánto tiempo, dónde, qué llevar) y promete lo mismo que la frase de la ficha", () => {
    const p = puntosDeCambios(interpretarAyuda(DE_FABRICA));
    expect(p).toEqual({
      plazo: { titulo: "Tienes 15 días", texto: "Para cambiar o devolver tu prenda, igual que en tienda." },
      donde: { titulo: "En cualquier tienda CAYLA", texto: "La que te quede más cerca, aunque no sea donde la recogiste." },
      llevar: { titulo: "Lleva tu boleta", texto: "Y la prenda con su etiqueta puesta." },
    });
    // Lo mismo que la frase de la ficha: el plazo, cualquier tienda CAYLA, la boleta y la etiqueta puesta. Ni una condición más.
    const frase = textoCambios(interpretarAyuda(DE_FABRICA));
    const puntos = Object.values(p).map((x) => `${x.titulo} ${x.texto}`).join(" ");
    for (const dato of ["15 días", "cualquier tienda CAYLA", "boleta", "etiqueta puesta"]) {
      expect(frase).toContain(dato);
      expect(puntos).toContain(dato);
    }
    expect(puntosDeCambios({ ...PLAZOS_SIN_DATOS, diasParaCambiar: 1 }).plazo.titulo).toBe("Tienes 1 día");
  });

  it("sin el plazo, los tres puntos no dicen ningún número: el plazo va en la boleta", () => {
    const p = puntosDeCambios(PLAZOS_SIN_DATOS);
    expect(p.plazo).toEqual({ titulo: "Mira el plazo en tu boleta", texto: "Es el mismo que en tienda, para cambiar o devolver tu prenda." });
    expect(Object.values(p).map((x) => `${x.titulo} ${x.texto}`).join(" ")).not.toMatch(/\d/);
  });
});
