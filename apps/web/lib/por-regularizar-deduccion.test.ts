import { describe, expect, it } from "vitest";
import { avisoDeRespuesta, deduccionPara, deducirForma, libroDesdeFilas, type FilaDelLibro, type HechoDelLibro } from "./por-regularizar-deduccion";

// Lo que se prueba: la respuesta que el libro sugiere en «¿Cómo estaba?» (el sistema no tenía ninguna a la hora de la venta ⇒ «Llegó
// nueva»; tenía y después no llegó ni se ajustó nada ⇒ «Perdió la etiqueta»; tenía y después llegó o se ajustó algo ⇒ no se sabe), el
// aviso en ámbar si se elige lo contrario, y cómo se arman los hechos que trae la base. Que contestar mal descuenta dos veces (o deja una
// prenda fantasma) lo prueba la base (`scripts/pruebas/ventas_sin_registrar.mjs`, casos D y R7): aquí solo que la sugerencia diga lo
// correcto. (Casos de deducirForma rescatados de #788, `lib/por-regularizar-candidatas.test.ts`.)

const libro = (extra: Partial<HechoDelLibro> = {}): HechoDelLibro => ({
  saldoALaVenta: 1,
  primeraEntrada: "2026-10-01T15:00:00.000Z",
  primeraEntradaMotivo: "carga_inicial",
  cambioPosterior: null,
  cambioPosteriorMotivo: null,
  ...extra,
});

describe("deducirForma — ¿perdió la etiqueta o llegó nueva?", () => {
  it("vendida ANTES de su carga inicial en esa tienda (el sistema no tenía ninguna) → llegó nueva, y dice por qué con la carga", () => {
    const d = deducirForma(
      libro({ saldoALaVenta: 0, primeraEntrada: "2026-10-05T14:00:00.000Z", cambioPosterior: "2026-10-05T14:00:00.000Z", cambioPosteriorMotivo: "carga_inicial" }),
      "2026-10-02T16:40:00.000Z",
      "Tienda Trujillo",
    );
    expect(d?.forma).toBe("llego_nueva");
    expect(d?.porque).toBe("Se vendió el 02/10 a las 11:40, antes de su carga inicial en Tienda Trujillo (05/10 a las 09:00): ese conteo ya no la incluyó.");
  });

  it("R7 · se agotó y volvió a llegar: la primera entrada es ANTERIOR, pero a esa hora el sistema tenía 0 → llegó nueva", () => {
    // Carga de 1 el 28/09, venta escaneada el 29/09 (queda en 0), venta «sin registrar» el 30/09, recepción de 2 el 02/10.
    const d = deducirForma(
      libro({ saldoALaVenta: 0, primeraEntrada: "2026-09-28T15:00:00.000Z", cambioPosterior: "2026-10-02T15:00:00.000Z", cambioPosteriorMotivo: "recepcion" }),
      "2026-09-30T20:00:00.000Z",
      "Tienda Trujillo",
    );
    expect(d?.forma).toBe("llego_nueva");
    expect(d?.porque).toBe("Cuando se vendió (30/09 a las 15:00), el sistema no tenía ninguna en Tienda Trujillo: no pudo estar contada.");
  });

  it("tenía, y después no llegó ni se ajustó nada → perdió la etiqueta (estaba contada en el stock)", () => {
    const d = deducirForma(libro({ saldoALaVenta: 3 }), "2026-10-06T20:00:00.000Z", "Tienda Arequipa");
    expect(d?.forma).toBe("ya_registrada");
    expect(d?.porque).toBe("Cuando se vendió (06/10 a las 15:00), el sistema tenía 3 en Tienda Arequipa y después no llegó ni se ajustó ninguna: estaba contada en el stock.");
  });

  it("tenía, pero después llegó una recepción → no deduce (forma null) y lo dice con la fecha, para que la persona mire", () => {
    const d = deducirForma(libro({ saldoALaVenta: 1, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "recepcion" }), "2026-10-02T16:40:00.000Z", "Tienda Trujillo");
    expect(d?.forma).toBeNull();
    expect(d?.porque).toBe(
      "No lo podemos deducir: cuando se vendió (02/10 a las 11:40) el sistema tenía 1 en Tienda Trujillo, pero el 03/10 a las 10:00 llegó una recepción. Pudo ser una de las que ya estaban contadas o una que llegó sin registrar: mira tú si estaba contada.",
    );
  });

  it("un conteo que ajustó después también deja la respuesta abierta (pudo haber descontado ya la vendida)", () => {
    const d = deducirForma(libro({ saldoALaVenta: 2, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "conteo" }), "2026-10-02T16:40:00.000Z", "TRU");
    expect(d?.forma).toBeNull();
    expect(d?.porque).toContain("se ajustó en un conteo");
    expect(deducirForma(libro({ saldoALaVenta: 2, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "raro" }), "2026-10-02T16:40:00.000Z", "TRU")?.porque).toContain("cambió su stock");
  });

  it("el saldo manda sobre lo que pasó después: con 0 a la hora de la venta, aunque después haya llegado algo, es llegó nueva", () => {
    expect(deducirForma(libro({ saldoALaVenta: 0, cambioPosterior: "2026-10-03T15:00:00.000Z", cambioPosteriorMotivo: "recepcion" }), "2026-10-02T16:40:00.000Z", "TRU")?.forma).toBe("llego_nueva");
    expect(deducirForma(libro({ saldoALaVenta: -1 }), "2026-10-02T16:40:00.000Z", "TRU")?.forma).toBe("llego_nueva");
  });

  it("con saldo 1 (el borde): ya la tenía, así que no es «llegó nueva»", () => {
    expect(deducirForma(libro({ saldoALaVenta: 1 }), "2026-10-02T16:40:00.000Z", "TRU")?.forma).toBe("ya_registrada");
  });

  it("vale para cualquier primera entrada, no solo la carga inicial, y dice cuál fue", () => {
    const antes = (motivo: string | null) =>
      deducirForma(libro({ saldoALaVenta: 0, primeraEntrada: "2026-10-03T15:00:00.000Z", primeraEntradaMotivo: motivo }), "2026-10-02T15:00:00.000Z", "TRU")?.porque;
    expect(antes("traslado_entrada")).toContain("el traslado que la trajo");
    expect(antes("recepcion")).toContain("su recepción");
    expect(antes("motivo_raro")).toContain("su primera entrada");
    expect(antes(null)).toContain("su primera entrada");
  });

  it("sin saldo conocido (tienda apagada) o con una fecha rota: nada que decir (null)", () => {
    expect(deducirForma(libro({ saldoALaVenta: null }), "2026-10-02T15:00:00.000Z", "TRU")).toBeNull();
    expect(deducirForma(libro({ saldoALaVenta: 2 }), "no es fecha", "TRU")).toBeNull();
  });
});

describe("avisoDeRespuesta — el aviso en ámbar si se elige lo contrario de lo que dice el libro", () => {
  const nueva = { forma: "llego_nueva" as const, porque: "…" };
  const contada = { forma: "ya_registrada" as const, porque: "…" };

  it("el libro dice «Llegó nueva» y se elige «Perdió la etiqueta»: contestar mal descuenta dos veces", () => {
    const a = avisoDeRespuesta(nueva, "ya_registrada", "Tienda Trujillo");
    expect(a).toContain("descuenta dos veces");
    expect(a).toContain("«Perdió la etiqueta»");
    expect(a).toContain("Tienda Trujillo");
  });

  it("el libro dice «Perdió la etiqueta» y se elige «Llegó nueva»: queda una prenda fantasma", () => {
    const a = avisoDeRespuesta(contada, "llego_nueva", "Tienda Lima");
    expect(a).toContain("fantasma");
    expect(a).toContain("«Llegó nueva»");
    expect(a).toContain("Tienda Lima");
  });

  it("sin aviso si se elige lo sugerido, si todavía no se eligió nada, o si el libro no sugirió nada", () => {
    expect(avisoDeRespuesta(nueva, "llego_nueva", "TRU")).toBeNull();
    expect(avisoDeRespuesta(contada, "ya_registrada", "TRU")).toBeNull();
    expect(avisoDeRespuesta(nueva, null, "TRU")).toBeNull();
    expect(avisoDeRespuesta({ forma: null, porque: "No lo podemos deducir…" }, "ya_registrada", "TRU")).toBeNull();
    expect(avisoDeRespuesta({ forma: null, porque: "No lo podemos deducir…" }, "llego_nueva", "TRU")).toBeNull();
    expect(avisoDeRespuesta(null, "llego_nueva", "TRU")).toBeNull();
  });
});

describe("libroDesdeFilas y deduccionPara — de las filas de la base a la prenda elegida", () => {
  // En la base, `prenda_id` es la VENTA sin registrar y `variante_id` es la PRENDA del catálogo.
  const fila = (venta: string, prenda: string, extra: Partial<FilaDelLibro> = {}): FilaDelLibro => ({
    prenda_id: venta,
    variante_id: prenda,
    saldo_a_la_venta: 2,
    primera_entrada: "2026-10-01T15:00:00.000Z",
    primera_entrada_motivo: "carga_inicial",
    cambio_posterior: null,
    cambio_posterior_motivo: null,
    ...extra,
  });
  const venta = { id: "v1", vendidoEn: "2026-10-06T20:00:00.000Z", sede: "Tienda Trujillo" };

  it("agrupa por venta y por prenda, y deja fuera las filas sin saldo conocido", () => {
    const l = libroDesdeFilas([fila("v1", "p1"), fila("v1", "p2", { saldo_a_la_venta: 0 }), fila("v2", "p1", { saldo_a_la_venta: null })]);
    expect(Object.keys(l).sort()).toEqual(["v1"]);
    expect(Object.keys(l.v1!).sort()).toEqual(["p1", "p2"]);
    expect(l.v1!.p2!.saldoALaVenta).toBe(0);
  });

  it("la prenda elegida de ESA venta: la de otra venta no cuenta", () => {
    const l = libroDesdeFilas([fila("v1", "p1", { saldo_a_la_venta: 0 }), fila("v2", "p2", { saldo_a_la_venta: 3 })]);
    expect(deduccionPara(l, venta, "p1")?.forma).toBe("llego_nueva");
    // p2 está en el libro, pero de OTRA venta: para v1 no hay nada que decir.
    expect(deduccionPara(l, venta, "p2")).toBeNull();
  });

  it("sin libro (la lectura falló), sin venta o sin prenda elegida: nada (la mesa sigue igual)", () => {
    const l = libroDesdeFilas([fila("v1", "p1")]);
    expect(deduccionPara(null, venta, "p1")).toBeNull();
    expect(deduccionPara(l, null, "p1")).toBeNull();
    expect(deduccionPara(l, venta, null)).toBeNull();
    expect(deduccionPara(l, venta, "otra")).toBeNull();
    expect(deduccionPara(l, venta, "p1")?.forma).toBe("ya_registrada");
  });
});
