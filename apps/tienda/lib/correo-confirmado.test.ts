import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  armarConfirmacion,
  codigoDelCorreoActual,
  codigoParaProbar,
  CONFIRMACION_DURA_MIN,
  leerConfirmacion,
  usuarioDeConfirmacion,
  type CodigoDelCorreo,
} from "./correo-confirmado";

// La prueba de que ESTE aparato confirmó su correo (Felipe 2026-10-15, el código bajo el correo). El servidor la firma con su llave
// (`correo-confirmado-servidor.ts`, HMAC-SHA-256); aquí se firma igual con una llave de prueba, para ver que nadie la arma ni la
// cambia sin la llave, que vence y que no sirve para otro correo.

const LLAVE = "llave-de-prueba-de-32-caracteres!";
const firmar = (datos: string) => createHmac("sha256", LLAVE).update(datos).digest("base64url");
const mismaFirma = (datos: string, firma: string) => {
  const a = Buffer.from(firmar(datos));
  const b = Buffer.from(firma);
  return a.length === b.length && timingSafeEqual(a, b);
};

const AHORA = Date.parse("2026-10-15T15:00:00Z");
const USUARIO = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b";
const CORREO = "maria.perez@gmail.com";
const VALIDA = armarConfirmacion({ correo: CORREO, usuarioWebId: USUARIO, vence: AHORA + CONFIRMACION_DURA_MIN * 60_000 }, firmar);

describe("la prueba de que este aparato confirmó su correo", () => {
  it("vale para ESE correo, con su usuario, mientras no venza (30 minutos, lo que dura el código)", () => {
    expect(CONFIRMACION_DURA_MIN).toBe(30);
    expect(leerConfirmacion(VALIDA, CORREO, mismaFirma, AHORA)).toEqual({ correo: CORREO, usuarioWebId: USUARIO, vence: AHORA + 30 * 60_000 });
    expect(leerConfirmacion(VALIDA, CORREO, mismaFirma, AHORA + 30 * 60_000 - 1)).not.toBeNull();
    expect(leerConfirmacion(VALIDA, CORREO, mismaFirma, AHORA + 30 * 60_000)).toBeNull();
  });

  it("no sirve para otro correo: cambiar el correo después de confirmarlo pide otro código", () => {
    expect(leerConfirmacion(VALIDA, "otra.persona@gmail.com", mismaFirma, AHORA)).toBeNull();
  });

  it("nadie la arma ni la cambia sin la llave del servidor (el navegador la guarda, pero no la puede escribir)", () => {
    const [datos, firma] = VALIDA.split(".");
    // Otro correo con la firma de antes.
    const otrosDatos = Buffer.from(JSON.stringify({ c: "otra.persona@gmail.com", u: USUARIO, v: AHORA + 60_000 })).toString("base64url");
    expect(leerConfirmacion(`${otrosDatos}.${firma}`, "otra.persona@gmail.com", mismaFirma, AHORA)).toBeNull();
    // Firmada con otra llave.
    const ajena = armarConfirmacion({ correo: CORREO, usuarioWebId: USUARIO, vence: AHORA + 60_000 }, (d) =>
      createHmac("sha256", "otra-llave-cualquiera-de-32-car!").update(d).digest("base64url"),
    );
    expect(leerConfirmacion(ajena, CORREO, mismaFirma, AHORA)).toBeNull();
    // Sin firma, con una firma de más, vacía o rota.
    for (const mala of [datos, `${datos}.`, `${datos}.${firma}.x`, "", "basura", `${datos}.${firma.slice(0, -2)}`]) {
      expect(leerConfirmacion(mala, CORREO, mismaFirma, AHORA)).toBeNull();
    }
    expect(leerConfirmacion(undefined, CORREO, mismaFirma, AHORA)).toBeNull();
    expect(leerConfirmacion(null, CORREO, mismaFirma, AHORA)).toBeNull();
  });

  it("bien firmada pero con una forma rara (sin usuario válido, sin vencimiento), tampoco vale", () => {
    for (const cuerpo of [{ c: CORREO, u: "no-es-un-usuario", v: AHORA + 60_000 }, { c: CORREO, u: USUARIO }, { c: 7, u: USUARIO, v: AHORA + 60_000 }]) {
      const datos = Buffer.from(JSON.stringify(cuerpo)).toString("base64url");
      expect(leerConfirmacion(`${datos}.${firmar(datos)}`, CORREO, mismaFirma, AHORA)).toBeNull();
    }
    const noJson = Buffer.from("{no es json").toString("base64url");
    expect(leerConfirmacion(`${noJson}.${firmar(noJson)}`, CORREO, mismaFirma, AHORA)).toBeNull();
  });

  it("de una prueba firmada se lee su usuario sin mirar el correo: así se suelta el correo que se dejó atrás", () => {
    expect(usuarioDeConfirmacion(VALIDA, mismaFirma)).toBe(USUARIO);
    const [datos] = VALIDA.split(".");
    expect(usuarioDeConfirmacion(`${datos}.firma-falsa`, mismaFirma)).toBeNull();
    expect(usuarioDeConfirmacion(undefined, mismaFirma)).toBeNull();
  });
});

describe("el código del correo, en la página", () => {
  const enviado: CodigoDelCorreo = { estado: "enviado", correo: CORREO, hasta: 0, mensaje: null, necesitaNuevo: false, malo: null };

  it("vale para el correo escrito ahora: si la persona lo cambia, el de antes deja de valer", () => {
    expect(codigoDelCorreoActual(enviado, CORREO)).toBe(enviado);
    expect(codigoDelCorreoActual(enviado, "otra.persona@gmail.com")).toEqual({ estado: "sin_pedir" });
    expect(codigoDelCorreoActual({ estado: "confirmado", correo: CORREO }, "otra.persona@gmail.com")).toEqual({ estado: "sin_pedir" });
    expect(codigoDelCorreoActual({ estado: "sin_pedir" }, CORREO)).toEqual({ estado: "sin_pedir" });
  });

  it("se revisa solo con sus 6 números; no el mismo que ya salió mal, ni si hace falta uno nuevo, ni sin haberlo pedido", () => {
    expect(codigoParaProbar(enviado, "123456")).toBe(true);
    expect(codigoParaProbar(enviado, "12345")).toBe(false);
    expect(codigoParaProbar({ ...enviado, malo: "123456" }, "123456")).toBe(false);
    expect(codigoParaProbar({ ...enviado, malo: "123456" }, "123457")).toBe(true);
    expect(codigoParaProbar({ ...enviado, necesitaNuevo: true }, "123456")).toBe(false);
    expect(codigoParaProbar({ estado: "sin_pedir" }, "123456")).toBe(false);
    expect(codigoParaProbar({ estado: "confirmado", correo: CORREO }, "123456")).toBe(false);
  });
});
