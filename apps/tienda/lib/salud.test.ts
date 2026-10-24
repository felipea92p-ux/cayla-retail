import { afterEach, describe, expect, it, vi } from "vitest";
import { crearSondeo, MS_DEL_SONDEO_GUARDADO, MS_TOPE_DEL_SONDEO } from "./salud";

afterEach(() => vi.useRealTimers());

describe("crearSondeo: ¿la tienda puede hablar con la base?", () => {
  it("una consulta que corre es «ok»", async () => {
    const sondeo = crearSondeo(async () => [{ ok: 1 }]);
    expect(await sondeo()).toEqual({ ok: true });
  });

  it("una consulta que falla es «no responde», sin traer el mensaje del error", async () => {
    const sondeo = crearSondeo(async () => {
      throw new Error('password authentication failed for user "tienda_web_prod"');
    });
    const respuesta = await sondeo();
    expect(respuesta).toEqual({ ok: false, motivo: "no_responde" });
    expect(JSON.stringify(respuesta)).not.toContain("tienda_web_prod");
  });

  it("una consulta que no contesta a tiempo es «no responde» (la conexión del grupo ocupada o la base colgada)", async () => {
    vi.useFakeTimers();
    const sondeo = crearSondeo(() => new Promise(() => {}));
    const pendiente = sondeo();
    await vi.advanceTimersByTimeAsync(MS_TOPE_DEL_SONDEO + 1);
    expect(await pendiente).toEqual({ ok: false, motivo: "no_responde" });
  });

  it("guarda la respuesta unos segundos: la base no recibe una pregunta por cada aparato que espera", async () => {
    let ahora = 1_000_000;
    const preguntar = vi.fn(async () => [{ ok: 1 }]);
    const sondeo = crearSondeo(preguntar, () => ahora);
    await sondeo();
    await sondeo();
    ahora += MS_DEL_SONDEO_GUARDADO - 1;
    await sondeo();
    expect(preguntar).toHaveBeenCalledTimes(1);
    ahora += 2;
    await sondeo();
    expect(preguntar).toHaveBeenCalledTimes(2);
  });

  it("una caída también se guarda (no se insiste contra una base que no responde) y se nota cuando vuelve", async () => {
    let ahora = 5_000_000;
    let viva = false;
    const sondeo = crearSondeo(async () => {
      if (!viva) throw new Error("caída");
      return [{ ok: 1 }];
    }, () => ahora);
    expect((await sondeo()).ok).toBe(false);
    viva = true;
    expect((await sondeo()).ok).toBe(false); // dentro de los 10 s guardados
    ahora += MS_DEL_SONDEO_GUARDADO + 1;
    expect((await sondeo()).ok).toBe(true);
  });

  it("el tope es de segundos, no de minutos: un corte se nota rápido", () => {
    expect(MS_TOPE_DEL_SONDEO).toBeLessThanOrEqual(5_000);
    expect(MS_DEL_SONDEO_GUARDADO).toBeLessThanOrEqual(15_000);
  });
});
