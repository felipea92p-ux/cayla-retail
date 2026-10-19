import { describe, expect, it } from "vitest";
import { leerRespuestaDeSalud, MS_DE_LA_RESPUESTA_GUARDADA } from "./salud-reglas";

describe("leerRespuestaDeSalud: solo un 200 es «la base responde»", () => {
  it("200 es sano", () => {
    expect(leerRespuestaDeSalud(200)).toEqual({ ok: true });
  });

  it("sin respuesta (fetch caído o tiempo agotado), error del servidor y «demasiadas peticiones» son «no responde»", () => {
    for (const status of [null, 0, 429, 500, 502, 503, 504]) {
      expect(leerRespuestaDeSalud(status), String(status)).toEqual({ ok: false, motivo: "no_responde" });
    }
  });

  it("la función que falta se dice aparte: la base contesta pero el vigía no puede dar un sí", () => {
    expect(leerRespuestaDeSalud(404, "PGRST202")).toEqual({ ok: false, motivo: "falta_fn_salud" });
  });

  it("una llave rechazada es un error de configuración, no una base caída", () => {
    expect(leerRespuestaDeSalud(401)).toEqual({ ok: false, motivo: "llave_rechazada" });
    expect(leerRespuestaDeSalud(403, "42501")).toEqual({ ok: false, motivo: "llave_rechazada" });
  });

  it("cualquier otra cosa no es un sí (solo con evidencia)", () => {
    expect(leerRespuestaDeSalud(404)).toEqual({ ok: false, motivo: "respuesta_inesperada" });
    expect(leerRespuestaDeSalud(204)).toEqual({ ok: false, motivo: "respuesta_inesperada" });
    expect(leerRespuestaDeSalud(302)).toEqual({ ok: false, motivo: "respuesta_inesperada" });
  });

  it("la respuesta guardada dura segundos, no minutos: un corte se nota rápido", () => {
    expect(MS_DE_LA_RESPUESTA_GUARDADA).toBeLessThanOrEqual(15_000);
  });
});
