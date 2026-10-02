import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESPERA_GUARDADO_MS,
  acotarALista,
  agruparConteo,
  bloqueoDeCierre,
  cantidadEscrita,
  codigoDePrendaNueva,
  codigosDeConteo,
  coincidenciasPorCodigo,
  conteoResumenDesdeFila,
  contarLinea,
  crearAgrupadorDeGuardado,
  crearColaEnSerie,
  detalleDesdeJson,
  estadoDeLinea,
  etiquetaDeLinea,
  filtrarConteo,
  lineaDesdeJson,
  mensajeMezclaEnCenso,
  notaAjuste,
  textoHabiaAntes,
  ajusteDelUltimoCierre,
  yaAjustadaSinTocar,
  textoHallazgoDeLinea,
  notaDeLinea,
  resultadoConteo,
  resumirLineas,
  sumarLectura,
  textoAlcance,
  textoFaltanPorContar,
  textoLugar,
  textoProgreso,
  textoQuedanSinVerificar,
  textoResultadoConteo,
  textoResumen,
  textoRevision,
  textoSeActualizaran,
  textoTerminado,
  type LineaConteo,
  pendientesParaCompletar,
} from "./conteo-reglas";

// Las reglas del conteo rediseñado que se rompen calladas si nadie las fija:
//  · vacío NO es cero: una variante sin cantidad escrita sigue pendiente, y solo el 0 escrito la verifica;
//  · el estado sale de los números con UNA fórmula, la misma que la base (regla D3);
//  · lo que se ve y lo que se cierra no pueden contradecirse.

/** Una línea con los números que interesan; lo demás en su valor neutro. */
function linea(p: Partial<LineaConteo> & { debeHaber: number; contada: number | null }): LineaConteo {
  const base = {
    varianteId: "v1",
    foto: p.debeHaber,
    anterior: null,
    verificadoEn: null,
    confirmadaEn: null,
    actual: null,
    ajusteMovimientoId: null,
    ajustadoTotal: 0,
    ajustadoAntes: 0,
    hallazgos: 0,
    ...p,
  };
  const estado = estadoDeLinea(base);
  if (estado === null) throw new Error("la línea de prueba está ignorada");
  return { ...base, diferencia: base.contada === null ? null : base.contada - base.debeHaber, estado };
}

const AHORA = "2026-09-29T15:00:00.000Z";

describe("estadoDeLinea — la regla D3", () => {
  const n = (p: Partial<Parameters<typeof estadoDeLinea>[0]>) => estadoDeLinea({ contada: null, debeHaber: 5, foto: 5, anterior: null, confirmadaEn: null, ...p });

  it("13/13 es correcta", () => {
    expect(n({ debeHaber: 13, foto: 13, contada: 13 })).toBe("correcta");
  });

  it("13/11 y 5/6 tienen diferencia; 6/0 también (el 0 escrito es una verificación, no un pendiente)", () => {
    expect(n({ debeHaber: 13, contada: 11 })).toBe("con_diferencia");
    expect(n({ debeHaber: 5, contada: 6 })).toBe("con_diferencia");
    expect(n({ debeHaber: 6, foto: 6, contada: 0 })).toBe("con_diferencia");
  });

  it("sin cantidad escrita es pendiente, nunca correcta ni con diferencia: vacío ≠ 0", () => {
    expect(n({ contada: null })).toBe("pendiente");
    // Un «debe haber» de 0 tampoco convierte el vacío en un 0 correcto.
    expect(n({ debeHaber: 0, foto: 3, contada: null })).toBe("pendiente");
  });

  it("si se pidió volver a contar y aún no hay cantidad nueva, está en reconteo", () => {
    expect(n({ contada: null, anterior: 9 })).toBe("en_reconteo");
    expect(n({ contada: null, anterior: 0 })).toBe("en_reconteo");
  });

  it("una diferencia confirmada sigue siendo diferencia; una coincidencia nunca es «confirmada»", () => {
    expect(n({ debeHaber: 11, contada: 9, confirmadaEn: AHORA })).toBe("diferencia_confirmada");
    expect(n({ debeHaber: 11, contada: 11, confirmadaEn: AHORA })).toBe("correcta");
  });

  it("una variante que no estaba en la foto, a la que se le borró la cantidad y que nunca se recontó, se IGNORA (null)", () => {
    expect(n({ debeHaber: 0, foto: 0, contada: null })).toBeNull();
    // Sin `foto` (la base la trae NULL en conteos anteriores al rediseño) cuenta como foto 0.
    expect(n({ debeHaber: 0, foto: null, contada: null })).toBeNull();
    // Pero una que no estaba en la foto y SÍ se contó, existe.
    expect(n({ debeHaber: 0, foto: 0, contada: 1 })).toBe("con_diferencia");
    expect(n({ debeHaber: 0, foto: 0, contada: 0 })).toBe("correcta");
  });

  it("el borde de D3: una inesperada (foto 0) mandada a recontar NO se ignora, sigue visible «en reconteo» (aunque la cifra anterior sea 0)", () => {
    expect(n({ debeHaber: 0, foto: 0, contada: null, anterior: 2 })).toBe("en_reconteo");
    expect(n({ debeHaber: 0, foto: 0, contada: null, anterior: 0 })).toBe("en_reconteo");
    expect(n({ debeHaber: 0, foto: null, contada: null, anterior: 3 })).toBe("en_reconteo");
    // La contraparte: con foto 0 y SIN anterior sigue ignorada; con foto > 0 nunca se ignora.
    expect(n({ debeHaber: 0, foto: 0, contada: null, anterior: null })).toBeNull();
    expect(n({ debeHaber: 3, foto: 3, contada: null, anterior: null })).toBe("pendiente");
  });
});

describe("etiquetaDeLinea — el copy y el color de cada estado", () => {
  const e = (l: LineaConteo) => etiquetaDeLinea(l);

  it("13/13 → «Correcto» en verde", () => {
    expect(e(linea({ debeHaber: 13, contada: 13 }))).toEqual({ texto: "Correcto", tono: "verde", confirmada: false });
  });

  it("13/11 → «Faltan 2», 6/0 → «Faltan 6», en rojo", () => {
    expect(e(linea({ debeHaber: 13, contada: 11 }))).toMatchObject({ texto: "Faltan 2", tono: "rojo" });
    expect(e(linea({ debeHaber: 6, contada: 0 }))).toMatchObject({ texto: "Faltan 6", tono: "rojo" });
  });

  it("5/6 → «Hay 1 de más» en rojo; una inesperada 0/1 también", () => {
    expect(e(linea({ debeHaber: 5, contada: 6 }))).toMatchObject({ texto: "Hay 1 de más", tono: "rojo" });
    expect(e(linea({ debeHaber: 0, foto: 0, contada: 1 }))).toMatchObject({ texto: "Hay 1 de más", tono: "rojo" });
  });

  it("un solo faltante se dice en singular: «Falta 1»", () => {
    expect(e(linea({ debeHaber: 4, contada: 3 })).texto).toBe("Falta 1");
  });

  it("pendiente es NEUTRO, jamás rojo; en reconteo es ámbar", () => {
    expect(e(linea({ debeHaber: 4, contada: null }))).toEqual({ texto: "Pendiente", tono: "neutro", confirmada: false });
    expect(e(linea({ debeHaber: 4, contada: null, anterior: 2 }))).toEqual({ texto: "En reconteo", tono: "ambar", confirmada: false });
  });

  it("una diferencia confirmada conserva su texto rojo y suma la marca «Confirmado»", () => {
    expect(e(linea({ debeHaber: 11, contada: 9, confirmadaEn: AHORA }))).toEqual({ texto: "Faltan 2", tono: "rojo", confirmada: true });
  });

  it("nunca usa el vocabulario que el contrato prohíbe", () => {
    const todos = [
      linea({ debeHaber: 11, contada: 9 }),
      linea({ debeHaber: 5, contada: 6 }),
      linea({ debeHaber: 4, contada: null }),
      linea({ debeHaber: 4, contada: null, anterior: 1 }),
      linea({ debeHaber: 4, contada: 4 }),
    ].map((l) => e(l).texto.toLowerCase());
    for (const t of todos) expect(t).not.toMatch(/variaci|reconcili|divergen|discrepan|ajuste neto|no se encontr|dejar como|ciegas/);
  });
});

describe("notaDeLinea y notaAjuste", () => {
  it("«Al abrir: 11 · salió 1 durante el conteo» cuando la foto no es el «debe haber»", () => {
    expect(notaDeLinea({ foto: 11, debeHaber: 10, contada: 9 })).toBe("Al abrir: 11 · salió 1 durante el conteo");
    expect(notaDeLinea({ foto: 11, debeHaber: 9, contada: 9 })).toBe("Al abrir: 11 · salieron 2 durante el conteo");
    expect(notaDeLinea({ foto: 4, debeHaber: 5, contada: 5 })).toBe("Al abrir: 4 · entró 1 durante el conteo");
    expect(notaDeLinea({ foto: 4, debeHaber: 7, contada: 7 })).toBe("Al abrir: 4 · entraron 3 durante el conteo");
  });

  it("sin nota cuando la foto coincide con el «debe haber»", () => {
    expect(notaDeLinea({ foto: 11, debeHaber: 11, contada: 11 })).toBeNull();
    expect(notaDeLinea({ foto: 11, debeHaber: 11, contada: null })).toBeNull();
  });

  it("una variante que no estaba registrada aquí: «Encontraste N que no estaba registrada aquí»", () => {
    expect(notaDeLinea({ foto: 0, debeHaber: 0, contada: 1 })).toBe("Encontraste 1 que no estaba registrada aquí");
    // Contada en 0 no es un hallazgo.
    expect(notaDeLinea({ foto: 0, debeHaber: 0, contada: 0 })).toBeNull();
  });

  // Caso Conteo 13: la camisa tenía 1, no se encontró, el cierre restó 1 (stock 0). Al editar el conteo y encontrarla, el «debe haber»
  // es 0 y la foto 1: la diferencia no la causó una venta sino el propio cierre, y la nota tiene que decirlo.
  it("al editar un conteo cerrado, el ajuste del propio cierre no se presenta como «salió durante el conteo»", () => {
    expect(notaDeLinea({ foto: 1, debeHaber: 0, contada: 1, ajustadoAntes: -1 })).toBe("Al abrir: 1 · el cierre de este conteo restó 1");
    expect(notaDeLinea({ foto: 6, debeHaber: 3, contada: 4, ajustadoAntes: -3 })).toBe("Al abrir: 6 · el cierre de este conteo restó 3");
    expect(notaDeLinea({ foto: 4, debeHaber: 5, contada: 5, ajustadoAntes: 1 })).toBe("Al abrir: 4 · el cierre de este conteo sumó 1");
    // Una prenda encontrada que no estaba registrada y el cierre dio de alta: ya no es «Encontraste…», es lo que el cierre sumó.
    expect(notaDeLinea({ foto: 0, debeHaber: 1, contada: 1, ajustadoAntes: 1 })).toBe("Al abrir: 0 · el cierre de este conteo sumó 1");
  });

  it("lo de otros y lo del cierre se reparten: cada uno con lo suyo", () => {
    // Al abrir 5; una venta sacó 1 (debe haber 4); contó 3 → el cierre restó 1 (stock 3). Se reabre y se vuelve a contar: debe haber 3.
    expect(notaDeLinea({ foto: 5, debeHaber: 3, contada: 4, ajustadoAntes: -1 })).toBe("Al abrir: 5 · salió 1 durante el conteo · el cierre de este conteo restó 1");
    // Al abrir 1; el cierre restó 1 (0); después entró 1 por una compra: debe haber 1, nada de otros en el total pero sí un «entró 1».
    expect(notaDeLinea({ foto: 1, debeHaber: 1, contada: 1, ajustadoAntes: -1 })).toBe("Al abrir: 1 · entró 1 durante el conteo · el cierre de este conteo restó 1");
  });

  // Conteo 25 (Felipe, 2026-09-30): Adelle Wide Leg tenía 3, se contó 2 y el cierre restó 1. Al «Corregir conteo» la fila decía
  // «Debe haber 3» sin más y, al contar de nuevo, el 3 pasaba a 2 sin explicación.
  it("al reabrir para corregir, antes de volver a contar, dice lo que había y en qué quedó por ese conteo", () => {
    expect(notaDeLinea({ foto: 3, debeHaber: 3, contada: 2, ajustadoAntes: 0, ajustadoTotal: -1 })).toBe("Había 3 · por este conteo pasó a 2. Ahora estás corrigiendo.");
    expect(notaDeLinea({ foto: 4, debeHaber: 4, contada: 7, ajustadoAntes: 0, ajustadoTotal: 3 })).toBe("Había 4 · por este conteo pasó a 7. Ahora estás corrigiendo.");
  });

  it("al volver a contar la nota cambia a «Al abrir…»: el «debe haber» ya es el de hoy", () => {
    expect(notaDeLinea({ foto: 3, debeHaber: 2, contada: 3, ajustadoAntes: -1, ajustadoTotal: -1 })).toBe("Al abrir: 3 · el cierre de este conteo restó 1");
  });

  // Conteo 25 corregido dos veces (Adelle Wide Leg: 3 → 2 → 3): el neto es 0, pero la línea se vuelve a corregir.
  it("un conteo ya corregido una vez (neto 0) vuelve a decir de dónde viene al corregirlo otra vez", () => {
    // El «Había» es el de la marca fija (3), no el «debe haber» de la fila (2): un solo número para toda la corrección.
    expect(notaDeLinea({ foto: 3, debeHaber: 2, contada: 3, ajustadoAntes: -1, ajustadoTotal: 0 })).toBe("Había 3 · este conteo ya se corrigió antes y volvió a 3. Ahora estás corrigiendo.");
  });

  it("una línea sin ajuste de cierre (conteo que nunca se cerró, o la cifra coincidió) no dice «corrigiendo»", () => {
    expect(notaDeLinea({ foto: 3, debeHaber: 3, contada: 3, ajustadoAntes: 0, ajustadoTotal: 0 })).toBeNull();
    expect(notaDeLinea({ foto: 3, debeHaber: 3, contada: null, ajustadoAntes: 0, ajustadoTotal: -1 })).toBeNull();
  });

  it("sin ajuste previo (o sin el dato) la nota es la de siempre", () => {
    expect(notaDeLinea({ foto: 1, debeHaber: 0, contada: 1, ajustadoAntes: 0 })).toBe("Al abrir: 1 · salió 1 durante el conteo");
    expect(notaDeLinea({ foto: 1, debeHaber: 1, contada: 1, ajustadoAntes: 0 })).toBeNull();
  });

  it("notaAjuste: si el stock se movió tras verificar, dice cuánto hay hoy y en cuánto quedará", () => {
    expect(notaAjuste({ actual: 10, debeHaber: 11, diferencia: -2 })).toBe("Hoy hay 10 por movimientos posteriores; quedará en 8.");
  });

  it("notaAjuste: sin nota si no hay movimientos posteriores, si no hay diferencia o si no se conoce el stock", () => {
    expect(notaAjuste({ actual: 11, debeHaber: 11, diferencia: -2 })).toBeNull();
    expect(notaAjuste({ actual: 10, debeHaber: 11, diferencia: 0 })).toBeNull();
    expect(notaAjuste({ actual: null, debeHaber: 11, diferencia: -2 })).toBeNull();
    expect(notaAjuste({ actual: 10, debeHaber: 11, diferencia: null })).toBeNull();
  });
});

describe("contarLinea — lo que se pinta antes de que responda la base", () => {
  it("conteo reabierto: al volver a contar, el ajuste del cierre anterior se explica al instante (sin pasar por «salió»)", () => {
    // Cerrado con 1 → contó 0 → restó 1. Reabierto: la línea trae debe haber 1 (leído antes del ajuste), ya ajustado −1, hoy hay 0.
    const reabierta = linea({ debeHaber: 1, foto: 1, contada: 0, actual: 0, ajustadoTotal: -1, ajustadoAntes: 0 });
    const r = contarLinea(reabierta, 1, AHORA);
    expect(r).toMatchObject({ debeHaber: 0, contada: 1, diferencia: 1, ajustadoAntes: -1 });
    expect(notaDeLinea(r!)).toBe("Al abrir: 1 · el cierre de este conteo restó 1");
    // Des-contarla la devuelve a la foto, y el ajuste vuelve a quedar por fuera del «debe haber».
    expect(contarLinea(r!, null, AHORA)).toMatchObject({ debeHaber: 1, ajustadoAntes: 0, ajustadoTotal: -1 });
  });

  it("escribir 11 sobre 13 → Faltan 2; escribir 13 → Correcto", () => {
    const l = linea({ debeHaber: 13, contada: null });
    expect(contarLinea(l, 11, AHORA)).toMatchObject({ contada: 11, diferencia: -2, estado: "con_diferencia", verificadoEn: AHORA, confirmadaEn: null });
    expect(contarLinea(l, 13, AHORA)).toMatchObject({ contada: 13, diferencia: 0, estado: "correcta" });
  });

  it("escribir 0 verifica en cero (6/0 → Faltan 6): el 0 escrito NO es un pendiente", () => {
    const r = contarLinea(linea({ debeHaber: 6, contada: null }), 0, AHORA);
    expect(r).toMatchObject({ contada: 0, diferencia: -6, estado: "con_diferencia" });
  });

  it("borrar lo escrito (null) vuelve a pendiente con lo congelado al abrir, no a 0", () => {
    const verificada = linea({ debeHaber: 10, foto: 11, contada: 9, verificadoEn: AHORA });
    expect(contarLinea(verificada, null, AHORA)).toMatchObject({ contada: null, diferencia: null, estado: "pendiente", debeHaber: 11, verificadoEn: null });
  });

  it("borrar lo escrito de una que se estaba recontando la deja en reconteo (conserva la cifra anterior)", () => {
    const l = linea({ debeHaber: 10, contada: 8, anterior: 9 });
    expect(contarLinea(l, null, AHORA)).toMatchObject({ estado: "en_reconteo", anterior: 9 });
  });

  it("borrar la cantidad de una variante inesperada que nunca se recontó la hace desaparecer (null)", () => {
    const inesperada = linea({ debeHaber: 0, foto: 0, contada: 1 });
    expect(contarLinea(inesperada, null, AHORA)).toBeNull();
  });

  it("borrar la cantidad de una inesperada que YA se había mandado a recontar la deja visible «en reconteo», con su cifra anterior", () => {
    // Se encontraron 2 que CAYLA no esperaba, se mandó a recontar (anterior 2), se volvió a contar (1) y se borró.
    const inesperada = linea({ debeHaber: 0, foto: 0, contada: 1, anterior: 2 });
    expect(contarLinea(inesperada, null, AHORA)).toMatchObject({ estado: "en_reconteo", anterior: 2, contada: null, diferencia: null, foto: 0, debeHaber: 0 });
  });

  it("verifica contra el stock vivo: lo que salió por venta mientras se contaba no es faltante", () => {
    // Al abrir había 11; se vendió 1 (hoy hay 10). Se cuentan 10 → correcta, con «debe haber» 10.
    const pendiente = linea({ debeHaber: 11, foto: 11, contada: null, actual: 10 });
    expect(contarLinea(pendiente, 10, AHORA)).toMatchObject({ debeHaber: 10, foto: 11, diferencia: 0, estado: "correcta" });
  });

  it("recontar y escribir lo mismo que antes deja la diferencia confirmada de una vez (reconfirmada)", () => {
    const enReconteo = linea({ debeHaber: 11, contada: null, anterior: 9 });
    expect(contarLinea(enReconteo, 9, AHORA)).toMatchObject({ estado: "diferencia_confirmada", confirmadaEn: AHORA });
    // Otra cifra distinta de la anterior: hay que confirmarla.
    expect(contarLinea(enReconteo, 10, AHORA)).toMatchObject({ estado: "con_diferencia", confirmadaEn: null });
    // Volver a la cifra esperada: coincide, nada que confirmar.
    expect(contarLinea(enReconteo, 11, AHORA)).toMatchObject({ estado: "correcta", confirmadaEn: null });
  });

  it("cambiar una cantidad ya confirmada quita la confirmación", () => {
    const confirmada = linea({ debeHaber: 11, contada: 9, confirmadaEn: AHORA });
    expect(contarLinea(confirmada, 8, "2026-09-29T15:05:00.000Z")).toMatchObject({ estado: "con_diferencia", confirmadaEn: null });
  });

  it("no toca la línea de entrada", () => {
    const l = linea({ debeHaber: 13, contada: null });
    const copia = JSON.stringify(l);
    contarLinea(l, 5, AHORA);
    expect(JSON.stringify(l)).toBe(copia);
  });
});

describe("resumirLineas, bloqueoDeCierre y los textos del resumen", () => {
  const lineas = [
    linea({ varianteId: "a", debeHaber: 5, contada: 5 }),
    linea({ varianteId: "b", debeHaber: 13, contada: 11 }),
    linea({ varianteId: "c", debeHaber: 5, contada: 6, confirmadaEn: AHORA }),
    linea({ varianteId: "d", debeHaber: 4, contada: null }),
    linea({ varianteId: "e", debeHaber: 3, contada: null, anterior: 2 }),
    linea({ varianteId: "f", debeHaber: 7, contada: 0 }),
  ];
  const r = resumirLineas(lineas);

  it("cuenta cada estado; pendientes incluye los que están en reconteo", () => {
    expect(r).toEqual({
      variantes: 6,
      verificadas: 4,
      pendientes: 2,
      correctas: 1,
      conDiferencia: 3,
      confirmadas: 1,
      enReconteo: 1,
      unidadesSobrantes: 1,
      unidadesFaltantes: 2 + 7,
    });
    expect(r.correctas + r.conDiferencia).toBe(r.verificadas);
    expect(r.verificadas + r.pendientes).toBe(r.variantes);
  });

  it("un conteo sin líneas resume en ceros", () => {
    expect(resumirLineas([])).toMatchObject({ variantes: 0, verificadas: 0, pendientes: 0 });
  });

  it("un pendiente no suma diferencia aunque su «debe haber» sea grande", () => {
    const solo = resumirLineas([linea({ debeHaber: 50, contada: null })]);
    expect(solo).toMatchObject({ unidadesFaltantes: 0, conDiferencia: 0, correctas: 0 });
  });

  it("los textos del resumen, con el copy del contrato", () => {
    expect(textoResumen({ variantes: 37, verificadas: 18, pendientes: 19, conDiferencia: 2 })).toBe("37 variantes · 18 verificadas · 19 pendientes · 2 con diferencia");
    expect(textoResumen({ variantes: 37, verificadas: 37, pendientes: 0, conDiferencia: 0 })).toBe("37 variantes · 37 verificadas · 0 pendientes");
    expect(textoResumen({ variantes: 1, verificadas: 1, pendientes: 0, conDiferencia: 0 })).toBe("1 variante · 1 verificada · 0 pendientes");
    expect(textoProgreso({ verificadas: 18, variantes: 37 })).toBe("18 de 37 variantes verificadas");
    expect(textoProgreso({ verificadas: 0, variantes: 1 })).toBe("0 de 1 variante verificada");
    expect(textoRevision({ correctas: 34, conDiferencia: 3, pendientes: 0 })).toBe("34 correctas · 3 con diferencia · 0 pendientes");
    expect(textoRevision({ correctas: 1, conDiferencia: 0, pendientes: 1 })).toBe("1 correcta · 0 con diferencia · 1 pendiente");
    expect(textoFaltanPorContar(2)).toBe("Faltan 2 variantes por contar.");
    expect(textoFaltanPorContar(1)).toBe("Falta 1 variante por contar.");
    expect(textoSeActualizaran(3)).toBe("Se actualizarán 3 variantes.");
    expect(textoSeActualizaran(1)).toBe("Se actualizará 1 variante.");
    expect(textoQuedanSinVerificar(4)).toBe("Quedan 4 variantes sin verificar; no cambiarán.");
    expect(textoQuedanSinVerificar(1)).toBe("Queda 1 variante sin verificar; no cambiará.");
  });

  it("el conteo terminado: «37 variantes verificadas · 34 coincidieron · 3 con diferencia»", () => {
    expect(textoTerminado({ verificadas: 37, correctas: 34, conDiferencia: 3, pendientes: 0 }, false)).toBe("37 variantes verificadas · 34 coincidieron · 3 con diferencia");
    expect(textoTerminado({ verificadas: 1, correctas: 1, conDiferencia: 0, pendientes: 0 }, false)).toBe("1 variante verificada · 1 coincidió · 0 con diferencia");
    expect(textoTerminado({ verificadas: 18, correctas: 16, conDiferencia: 2, pendientes: 19 }, true)).toBe(
      "18 variantes verificadas · 16 coincidieron · 2 con diferencia · 19 quedaron sin verificar (conteo parcial)"
    );
    expect(textoTerminado({ verificadas: 2, correctas: 2, conDiferencia: 0, pendientes: 1 }, true)).toContain("1 quedó sin verificar (conteo parcial)");
    // Sin ser parcial no se menciona lo pendiente.
    expect(textoTerminado({ verificadas: 2, correctas: 2, conDiferencia: 0, pendientes: 0 }, false)).not.toContain("sin verificar");
  });

  describe("bloqueoDeCierre: el mismo orden que cerrar_conteo", () => {
    const resumen = (p: Partial<Parameters<typeof bloqueoDeCierre>[0]>) => ({ verificadas: 10, pendientes: 0, conDiferencia: 0, confirmadas: 0, ...p });

    it("sin nada verificado no hay qué cerrar, ni siquiera como parcial", () => {
      expect(bloqueoDeCierre(resumen({ verificadas: 0, pendientes: 5 }), false)).toBe("conteo_vacio");
      expect(bloqueoDeCierre(resumen({ verificadas: 0, pendientes: 5 }), true)).toBe("conteo_vacio");
    });

    it("con pendientes solo se cierra si se pidió parcial, a propósito", () => {
      expect(bloqueoDeCierre(resumen({ pendientes: 2 }), false)).toBe("conteo_pendientes");
      expect(bloqueoDeCierre(resumen({ pendientes: 2 }), true)).toBeNull();
    });

    it("toda diferencia se confirma antes de cerrar, también en un parcial", () => {
      expect(bloqueoDeCierre(resumen({ conDiferencia: 3, confirmadas: 2 }), false)).toBe("diferencias_sin_confirmar");
      expect(bloqueoDeCierre(resumen({ pendientes: 2, conDiferencia: 3, confirmadas: 2 }), true)).toBe("diferencias_sin_confirmar");
      expect(bloqueoDeCierre(resumen({ conDiferencia: 3, confirmadas: 3 }), false)).toBeNull();
    });

    it("pendientes se avisa antes que diferencias sin confirmar (orden de la base)", () => {
      expect(bloqueoDeCierre(resumen({ pendientes: 1, conDiferencia: 1, confirmadas: 0 }), false)).toBe("conteo_pendientes");
    });

    it("todo correcto y sin pendientes: se puede cerrar", () => {
      expect(bloqueoDeCierre(resumen({}), false)).toBeNull();
    });
  });
});

describe("resultadoConteo y su texto en el historial", () => {
  const c = (p: Partial<Parameters<typeof resultadoConteo>[0]>) => ({ estado: "cerrado", lineas: 10, lineasConDiferencia: 0, parcial: false, ...p });

  it("«Todo correcto» / «N diferencias encontradas» / «Conteo parcial» / «Cancelado» / «En curso»", () => {
    expect(textoResultadoConteo(c({}))).toBe("Todo correcto");
    expect(textoResultadoConteo(c({ lineasConDiferencia: 3 }))).toBe("3 diferencias encontradas");
    expect(textoResultadoConteo(c({ lineasConDiferencia: 1 }))).toBe("1 diferencia encontrada");
    expect(textoResultadoConteo(c({ parcial: true }))).toBe("Conteo parcial");
    expect(textoResultadoConteo(c({ estado: "anulado" }))).toBe("Cancelado");
    expect(textoResultadoConteo(c({ estado: "abierto" }))).toBe("En curso");
  });

  it("un cerrado SIN verificadas (los vacíos de antes) y un anulado se leen «Cancelado», nunca «Todo correcto»", () => {
    expect(resultadoConteo(c({ lineas: 0 }))).toBe("cancelado");
    expect(textoResultadoConteo(c({ lineas: 0 }))).toBe("Cancelado");
    expect(resultadoConteo(c({ estado: "anulado", lineas: 12 }))).toBe("cancelado");
  });

  it("un parcial es «Conteo parcial» aunque tenga diferencias encontradas", () => {
    expect(resultadoConteo(c({ parcial: true, lineasConDiferencia: 2 }))).toBe("parcial");
  });

  it("abierto es «en curso» aunque todavía no tenga verificadas", () => {
    expect(resultadoConteo(c({ estado: "abierto", lineas: 0 }))).toBe("en_curso");
  });

  it("nunca dice «Cerrado» ni «Vacío»", () => {
    for (const p of [{}, { lineas: 0 }, { parcial: true }, { estado: "anulado" }, { lineasConDiferencia: 2 }]) {
      expect(textoResultadoConteo(c(p))).not.toMatch(/cerrado|vac[ií]o/i);
    }
  });
});

describe("conteoResumenDesdeFila", () => {
  const fila = {
    id: "c1",
    numero: 7,
    estado: "cerrado",
    created_at: "2026-09-29T14:00:00Z",
    cerrado_en: "2026-09-29T15:00:00Z",
    sububicacion_id: "s1",
    sububicacion_nombre: "Piso de venta",
    sububicacion_tipo: "piso_venta",
    alcance: "todo",
    alcance_categoria_nombre: null,
    abierto_por: "p1",
    cerrado_por: "p2",
    lineas: 18,
    lineas_con_diferencia: 2,
    sistema: 40,
    contado: 38,
    diferencia: -2,
    pendientes: 19,
    parcial: true,
  };
  const nombres = new Map([["p1", "Micaela"], ["p2", "Sandra"]]);

  it("pasa a camelCase, sin soles, con pendientes, parcial y el total de variantes", () => {
    const r = conteoResumenDesdeFila(fila, nombres);
    expect(r).toMatchObject({ id: "c1", numero: 7, estado: "cerrado", lineas: 18, lineasConDiferencia: 2, pendientes: 19, parcial: true, variantes: 37, abiertoPorNombre: "Micaela", cerradoPorNombre: "Sandra" });
    expect(Object.keys(r)).not.toContain("solesDiferencia");
  });

  it("si la fila no trae pendientes ni parcial (SQL viejo), cae a 0 y false sin romper", () => {
    const { pendientes: _p, parcial: _q, ...vieja } = fila;
    void _p;
    void _q;
    expect(conteoResumenDesdeFila(vieja, nombres)).toMatchObject({ pendientes: 0, parcial: false, variantes: 18 });
  });

  it("sin nombre conocido dice «—»", () => {
    expect(conteoResumenDesdeFila({ ...fila, abierto_por: null, cerrado_por: "otro" }, nombres)).toMatchObject({ abiertoPorNombre: "—", cerradoPorNombre: "—" });
  });
});

describe("textoLugar y textoAlcance", () => {
  it("Almacén de tienda / Piso de venta / Toda la ubicación", () => {
    expect(textoLugar({ sububicacionTipo: "almacen_tienda", sububicacionNombre: "Almacén de tienda" })).toBe("Almacén de tienda");
    expect(textoLugar({ sububicacionTipo: "piso_venta", sububicacionNombre: "Piso de venta" })).toBe("Piso de venta");
    expect(textoLugar({ sububicacionTipo: null, sububicacionNombre: null })).toBe("Toda la ubicación");
  });

  it("otro tipo de lugar (un rack del Taller) se llama por su nombre", () => {
    expect(textoLugar({ sububicacionTipo: "rack", sububicacionNombre: "Rack A" })).toBe("Rack A");
  });

  it("«Todo» o «Solo <categoría>»", () => {
    expect(textoAlcance({ alcance: "todo", alcanceCategoriaNombre: null })).toBe("Todo");
    expect(textoAlcance({ alcance: "categoria", alcanceCategoriaNombre: "Blusas" })).toBe("Solo Blusas");
    expect(textoAlcance({ alcance: "categoria", alcanceCategoriaNombre: null })).toBe("Todo");
  });
});

describe("agruparConteo — producto → color → tallas, con un orden que no se mueve", () => {
  const f = (varianteId: string, productoId: string, referencia: string, color: string | null, talla: string | null, extra: Partial<{ colorHex: string | null; fotoUrl: string | null; sku: string }> = {}) => ({
    varianteId,
    productoId,
    referencia,
    color,
    colorHex: null,
    fotoUrl: null,
    talla,
    sku: varianteId,
    ...extra,
  });

  it("junta por modelo y color, con las tallas en el orden del rack (no alfabético)", () => {
    const grupos = agruparConteo([
      f("a-xl", "p1", "Blusa Emma", "Beige", "XL"),
      f("a-s", "p1", "Blusa Emma", "Beige", "S"),
      f("b-m", "p1", "Blusa Emma", "Negro", "M"),
      f("a-m", "p1", "Blusa Emma", "Beige", "M"),
      f("a-l", "p1", "Blusa Emma", "Beige", "L"),
    ]);
    expect(grupos.map((g) => [g.color, g.tallas.map((t) => t.talla)])).toEqual([
      ["Beige", ["S", "M", "L", "XL"]],
      ["Negro", ["M"]],
    ]);
  });

  it("agrupa por productoId, NO por nombre: dos modelos con el mismo nombre no mezclan sus tallas", () => {
    const grupos = agruparConteo([f("x1", "p-uno", "Polo", "Rojo", "M"), f("x2", "p-dos", "Polo", "Rojo", "M"), f("x3", "p-uno", "Polo", "Rojo", "L")]);
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => [g.productoId, g.tallas.map((t) => t.varianteId)])).toEqual([
      ["p-dos", ["x2"]],
      ["p-uno", ["x1", "x3"]],
    ]);
  });

  it("numeración por número (28, 30, 36), y «Única» y sin talla al final", () => {
    const [g] = agruparConteo([f("t36", "p", "Jean", "Azul", "36"), f("t28", "p", "Jean", "Azul", "28"), f("tnull", "p", "Jean", "Azul", null), f("t30", "p", "Jean", "Azul", "30"), f("tu", "p", "Jean", "Azul", "Única")]);
    expect(g.tallas.map((t) => t.talla)).toEqual(["28", "30", "36", "Única", null]);
  });

  it("ordena los modelos por nombre y los colores por nombre, con «sin color» al final", () => {
    const grupos = agruparConteo([
      f("1", "p2", "Vestido Sofi", null, "M"),
      f("2", "p1", "Blusa Emma", "Negro", "M"),
      f("3", "p1", "Blusa Emma", null, "M"),
      f("4", "p1", "Blusa Emma", "Beige", "M"),
      f("5", "p2", "Vestido Sofi", "Azul", "M"),
    ]);
    expect(grupos.map((g) => [g.referencia, g.color])).toEqual([
      ["Blusa Emma", "Beige"],
      ["Blusa Emma", "Negro"],
      ["Blusa Emma", null],
      ["Vestido Sofi", "Azul"],
      ["Vestido Sofi", null],
    ]);
  });

  it("el orden es estable: el mismo resultado sin importar cómo lleguen las filas", () => {
    const filas = [
      f("a", "p1", "Blusa", "Beige", "S"),
      f("b", "p1", "Blusa", "Beige", "M"),
      f("c", "p1", "Blusa", "Negro", "L"),
      f("d", "p2", "Camisa", "Blanco", "M"),
      f("e", "p2", "Camisa", "Blanco", "S"),
    ];
    const esperado = JSON.stringify(agruparConteo(filas));
    expect(JSON.stringify(agruparConteo([...filas].reverse()))).toBe(esperado);
    expect(JSON.stringify(agruparConteo([filas[3], filas[0], filas[4], filas[2], filas[1]]))).toBe(esperado);
  });

  it("la foto y la muestra del color salen de la primera talla que las tenga", () => {
    const [g] = agruparConteo([f("a", "p", "Blusa", "Beige", "S"), f("b", "p", "Blusa", "Beige", "M", { colorHex: "#d9c3a5", fotoUrl: "https://x/f.jpg" })]);
    expect(g.colorHex).toBe("#d9c3a5");
    expect(g.fotoUrl).toBe("https://x/f.jpg");
  });

  it("devuelve las mismas filas que recibió (para poder colgarles su línea)", () => {
    const fila = { ...f("a", "p", "Blusa", "Beige", "S"), extra: 42 };
    expect(agruparConteo([fila])[0].tallas[0]).toBe(fila);
  });

  it("sin filas, sin grupos", () => {
    expect(agruparConteo([])).toEqual([]);
  });
});

describe("filtrarConteo — búsqueda manual", () => {
  const filas = [
    { varianteId: "1", productoId: "p1", referencia: "Blusa Emma", color: "Beige", colorHex: null, fotoUrl: null, talla: "M", sku: "BLU-0001-BEI-M" },
    { varianteId: "2", productoId: "p1", referencia: "Blusa Emma", color: "Negro", colorHex: null, fotoUrl: null, talla: "S", sku: "BLU-0001-NEG-S" },
    { varianteId: "3", productoId: "p2", referencia: "Camisón Lino", color: "Blanco", colorHex: null, fotoUrl: null, talla: "L", sku: "CAM-0002-BLA-L" },
  ];
  const ids = (t: string) => filtrarConteo(filas, t).map((x) => x.varianteId);

  it("por producto, color, talla o código, sin tildes ni mayúsculas", () => {
    expect(ids("emma")).toEqual(["1", "2"]);
    expect(ids("CAMISON")).toEqual(["3"]);
    expect(ids("negro")).toEqual(["2"]);
    expect(ids("blu-0001-bei")).toEqual(["1"]);
    expect(ids("0002")).toEqual(["3"]);
  });

  it("varias palabras a la vez: todas deben coincidir, en cualquier orden", () => {
    expect(ids("emma beige")).toEqual(["1"]);
    expect(ids("beige emma m")).toEqual(["1"]);
    expect(ids("emma lino")).toEqual([]);
  });

  it("la talla se compara entera: «m» es la talla M, no cualquier nombre con una «m» adentro (Emma, Camisón)", () => {
    expect(ids("m")).toEqual(["1"]);
    expect(ids("s")).toEqual(["2"]);
    // «l» es la talla L y también el comienzo de «Lino»; no aparece por estar dentro de «Blusa» ni de «Blanco».
    expect(ids("l")).toEqual(["3"]);
  });

  it("el producto y el color se buscan por el comienzo de sus palabras", () => {
    expect(ids("bei")).toEqual(["1"]);
    expect(ids("lin")).toEqual(["3"]);
    // Un pedazo del medio de la palabra no cuenta.
    expect(ids("mma")).toEqual([]);
  });

  it("una sola letra no se busca dentro de los códigos: coincidiría con casi todo", () => {
    expect(ids("u")).toEqual([]);
  });

  it("sin texto no filtra nada, y no toca el arreglo de entrada", () => {
    expect(filtrarConteo(filas, "   ")).toHaveLength(3);
    expect(filtrarConteo(filas, "")).not.toBe(filas);
  });
});

describe("acotarALista (ADR-0241: «Contar esta prenda» desde Movimientos)", () => {
  const p = (varianteId: string) => ({ varianteId });
  it("acota a las prendas pedidas y, sin lista, deja todo", () => {
    const todos = [p("a"), p("b"), p("c")];
    expect(acotarALista(todos, ["b"]).map((x) => x.varianteId)).toEqual(["b"]);
    expect(acotarALista(todos, [])).toHaveLength(3);
    expect(acotarALista(todos, ["z"])).toEqual([]);
  });
});

describe("cantidadEscrita — vacío NO es cero", () => {
  it("vacío (o solo espacios) es null: la variante sigue pendiente, jamás 0", () => {
    expect(cantidadEscrita("")).toBeNull();
    expect(cantidadEscrita("   ")).toBeNull();
  });

  it("el 0 escrito es 0 de verdad: verifica en cero", () => {
    expect(cantidadEscrita("0")).toBe(0);
    expect(cantidadEscrita(" 0 ")).toBe(0);
  });

  it("enteros ≥ 0", () => {
    expect(cantidadEscrita("12")).toBe(12);
    expect(cantidadEscrita(" 7 ")).toBe(7);
    expect(cantidadEscrita("007")).toBe(7);
  });

  it("negativos, decimales, letras y notación científica son inválidos (undefined)", () => {
    for (const malo of ["-1", "2.5", "2,5", "abc", "12a", "1e2", "+3", "--", "3 4", "٣"]) expect(cantidadEscrita(malo), malo).toBeUndefined();
  });

  it("un número más grande de lo que guarda la base también es inválido", () => {
    expect(cantidadEscrita("2147483647")).toBe(2147483647);
    expect(cantidadEscrita("2147483648")).toBeUndefined();
    expect(cantidadEscrita("99999999999999999999")).toBeUndefined();
  });
});

describe("sumarLectura", () => {
  it("un escaneo suma 1 al total; una variante pendiente arranca en 1, no en NaN ni en 0", () => {
    expect(sumarLectura(null)).toBe(1);
    expect(sumarLectura(0)).toBe(1);
    expect(sumarLectura(4)).toBe(5);
  });
});

describe("lineaDesdeJson y detalleDesdeJson — leer la base sin confiar en ella", () => {
  const jsonLinea = (p: Record<string, unknown> = {}) => ({
    variante_id: "v1",
    debe_haber: 11,
    foto: 11,
    contada: 9,
    anterior: null,
    verificado_en: AHORA,
    confirmada_en: null,
    actual: 10,
    diferencia: -2,
    ajuste_movimiento_id: null,
    ajustado_total: 0,
    ajustado_antes: 0,
    hallazgos: 0,
    estado: "con_diferencia",
    ...p,
  });
  const jsonConteo = (p: Record<string, unknown> = {}) => ({
    id: "c1",
    numero: 7,
    estado: "abierto",
    ubicacion_id: "u1",
    sububicacion_id: "s1",
    sububicacion_tipo: "piso_venta",
    sububicacion_nombre: "Piso de venta",
    alcance: "todo",
    alcance_categoria_id: null,
    alcance_categoria_nombre: null,
    abierto_por: "p1",
    abierto_por_nombre: "Micaela",
    cerrado_por: null,
    cerrado_en: null,
    created_at: "2026-09-29T14:00:00Z",
    foto_en: "2026-09-29T14:00:01Z",
    es_prueba: false,
    ...p,
  });

  it("pasa la línea a camelCase", () => {
    expect(lineaDesdeJson(jsonLinea())).toEqual({
      varianteId: "v1",
      debeHaber: 11,
      foto: 11,
      contada: 9,
      anterior: null,
      verificadoEn: AHORA,
      confirmadaEn: null,
      actual: 10,
      diferencia: -2,
      ajusteMovimientoId: null,
      ajustadoTotal: 0,
      ajustadoAntes: 0,
      hallazgos: 0,
      estado: "con_diferencia",
    });
  });

  it("el estado y la diferencia salen de los números, no del texto de la base: lo que se ve no se contradice", () => {
    // La base dice «correcta» pero 9 ≠ 11: manda la regla, que es la misma que la de la base.
    expect(lineaDesdeJson(jsonLinea({ estado: "correcta", diferencia: 0 }))).toMatchObject({ estado: "con_diferencia", diferencia: -2 });
  });

  it("una línea pendiente: contada null, sin diferencia, estado pendiente", () => {
    expect(lineaDesdeJson(jsonLinea({ contada: null, diferencia: null, verificado_en: null, estado: "pendiente" }))).toMatchObject({ contada: null, diferencia: null, estado: "pendiente" });
  });

  it("una línea ignorada (variante inesperada sin cantidad y nunca recontada) devuelve null", () => {
    expect(lineaDesdeJson(jsonLinea({ debe_haber: 0, foto: 0, contada: null, diferencia: null }))).toBeNull();
  });

  it("una inesperada mandada a recontar (foto 0, sin cantidad, con anterior) NO se ignora: llega «en reconteo»", () => {
    expect(lineaDesdeJson(jsonLinea({ debe_haber: 0, foto: 0, contada: null, anterior: 2, diferencia: null, verificado_en: null, estado: "en_reconteo" }))).toMatchObject({
      contada: null,
      anterior: 2,
      foto: 0,
      debeHaber: 0,
      diferencia: null,
      estado: "en_reconteo",
    });
  });

  it("sin `foto` cae al «debe haber»", () => {
    expect(lineaDesdeJson(jsonLinea({ foto: null }))?.foto).toBe(11);
  });

  it("sin línea (la base devuelve null cuando la variante quedó ignorada) es null, no un error", () => {
    expect(lineaDesdeJson(null)).toBeNull();
    expect(lineaDesdeJson(undefined)).toBeNull();
  });

  it("algo que no es una línea, o una mal formada, lanza en vez de dibujar algo falso", () => {
    expect(() => lineaDesdeJson("hola")).toThrow(/mal formado/);
    expect(() => lineaDesdeJson([])).toThrow(/mal formado/);
    expect(() => lineaDesdeJson(jsonLinea({ debe_haber: "11" }))).toThrow(/debe_haber/);
    expect(() => lineaDesdeJson(jsonLinea({ variante_id: undefined }))).toThrow(/variante_id/);
  });

  it("el detalle: cabecera, líneas sin las ignoradas, y el resumen calculado de las líneas", () => {
    const d = detalleDesdeJson({
      conteo: jsonConteo(),
      resumen: { variantes: 999 },
      lineas: [
        jsonLinea({ variante_id: "a", debe_haber: 5, foto: 5, contada: 5, diferencia: 0, estado: "correcta" }),
        jsonLinea({ variante_id: "b" }),
        jsonLinea({ variante_id: "c", contada: null, diferencia: null, estado: "pendiente" }),
        jsonLinea({ variante_id: "fantasma", debe_haber: 0, foto: 0, contada: null, diferencia: null }),
      ],
    });
    expect(d?.conteo).toMatchObject({
      id: "c1",
      numero: 7,
      estado: "abierto",
      sububicacionTipo: "piso_venta",
      alcance: "todo",
      abiertoPorNombre: "Micaela",
      cerradoPor: null,
      cerradoPorNombre: null,
      fotoEn: "2026-09-29T14:00:01Z",
      esPrueba: false,
    });
    expect(d?.lineas.map((l) => l.varianteId)).toEqual(["a", "b", "c"]);
    expect(d?.resumen).toMatchObject({ variantes: 3, verificadas: 2, pendientes: 1, correctas: 1, conDiferencia: 1 });
  });

  it("una inesperada en reconteo se ve en el detalle, cuenta como pendiente y como «en reconteo», y bloquea el cierre sin parcial", () => {
    const d = detalleDesdeJson({
      conteo: jsonConteo(),
      lineas: [
        jsonLinea({ variante_id: "a", debe_haber: 5, foto: 5, contada: 5, diferencia: 0, estado: "correcta" }),
        // Inesperada: CAYLA no la esperaba (foto 0), se encontraron 2, se mandó a recontar y aún no hay cifra nueva.
        jsonLinea({ variante_id: "inesperada", debe_haber: 0, foto: 0, contada: null, anterior: 2, diferencia: null, verificado_en: null, estado: "en_reconteo" }),
        // Inesperada a la que solo se le borró la cantidad (sin recontar): sigue ignorada.
        jsonLinea({ variante_id: "borrada", debe_haber: 0, foto: 0, contada: null, anterior: null, diferencia: null, verificado_en: null, estado: "pendiente" }),
      ],
    });
    expect(d?.lineas.map((l) => l.varianteId)).toEqual(["a", "inesperada"]);
    expect(d?.resumen).toMatchObject({ variantes: 2, verificadas: 1, pendientes: 1, enReconteo: 1, correctas: 1, conDiferencia: 0 });
    expect(d && bloqueoDeCierre(d.resumen, false)).toBe("conteo_pendientes");
    expect(d && bloqueoDeCierre(d.resumen, true)).toBeNull();
  });

  it("un conteo por categoría trae el nombre y el id de su categoría", () => {
    const d = detalleDesdeJson({ conteo: jsonConteo({ alcance: "categoria", alcance_categoria_id: "k1", alcance_categoria_nombre: "Blusas" }), lineas: [] });
    expect(d?.conteo).toMatchObject({ alcance: "categoria", alcanceCategoriaId: "k1", alcanceCategoriaNombre: "Blusas" });
  });

  it("vacío, null o sin `conteo` es «no existe o no es de tu sede»: null, no un error", () => {
    expect(detalleDesdeJson(null)).toBeNull();
    expect(detalleDesdeJson(undefined)).toBeNull();
    expect(detalleDesdeJson({})).toBeNull();
    expect(detalleDesdeJson({ conteo: null, lineas: [] })).toBeNull();
  });

  it("un detalle mal formado lanza: estado desconocido, alcance raro o sin líneas", () => {
    expect(() => detalleDesdeJson({ conteo: jsonConteo({ estado: "en_revision" }), lineas: [] })).toThrow(/estado/);
    expect(() => detalleDesdeJson({ conteo: jsonConteo({ alcance: "familia" }), lineas: [] })).toThrow(/alcance/);
    expect(() => detalleDesdeJson({ conteo: jsonConteo() })).toThrow(/líneas/);
    expect(() => detalleDesdeJson("hola")).toThrow(/mal formado/);
  });

  it("sin nombre de quien abrió dice «—»", () => {
    expect(detalleDesdeJson({ conteo: jsonConteo({ abierto_por_nombre: null }), lineas: [] })?.conteo.abiertoPorNombre).toBe("—");
  });
});

// El código de la etiqueta (2026-09-26). En producción 128 de 130 variantes tienen `sku` NULL (ADR-0058) pero
// `variantes.codigo` existe en 129: las pantallas del conteo que leían solo `sku` mostraban un hueco justo donde la
// colaboradora busca qué talla y color es, y la caja de escanear no encontraba «POL-0004» aunque la prenda existiera.
describe("codigosDeConteo y coincidenciasPorCodigo", () => {
  const sinSku = { varianteId: "v1", sku: "", codigo: "POL-0004-VIO-L", codigosBarras: ["POL-0004-VIO-L", "7750000000012"] };
  const conSkuLegado = { varianteId: "v2", sku: "VES-SOFI-NEG-M", codigo: "VES-0002-NEG-M", codigosBarras: ["VES-0002-NEG-M"] };
  const soloSku = { varianteId: "v3", sku: "LEGADO-1", codigo: null, codigosBarras: ["LEGADO-1"] };
  const catalogo = [sinSku, conSkuLegado, soloSku].map((v) => ({ varianteId: v.varianteId, referencia: "x", ...codigosDeConteo(v) }));

  it("una variante sin sku y con código: el campo `sku` es el código y se puede buscar por él", () => {
    expect(catalogo[0].sku).toBe("POL-0004-VIO-L");
    // Tecleado a medias: antes no encontraba nada y la pantalla ofrecía «Dar de alta esta prenda» para una que sí existía.
    expect(coincidenciasPorCodigo("pol-0004", catalogo).map((v) => v.varianteId)).toEqual(["v1"]);
  });

  it("con sku y sin código cae al sku, y no lo duplica entre los códigos de barras", () => {
    expect(catalogo[2].sku).toBe("LEGADO-1");
    expect(catalogo[2].codigosBarras).toEqual(["LEGADO-1"]);
  });

  it("con código y con sku legado: se muestra el código, pero el sku de siempre sigue resolviendo al escanear", () => {
    expect(catalogo[1].sku).toBe("VES-0002-NEG-M");
    expect(catalogo[1].codigosBarras).toEqual(["VES-0002-NEG-M", "VES-SOFI-NEG-M"]);
    expect(coincidenciasPorCodigo("ves-sofi-neg-m", catalogo).map((v) => v.varianteId)).toEqual(["v2"]);
  });

  it("el código de barras se acepta solo exacto; texto vacío no devuelve nada", () => {
    expect(coincidenciasPorCodigo("7750000000012", catalogo).map((v) => v.varianteId)).toEqual(["v1"]);
    expect(coincidenciasPorCodigo("775000", catalogo)).toEqual([]);
    expect(coincidenciasPorCodigo("   ", catalogo)).toEqual([]);
  });
});

describe("codigoDePrendaNueva", () => {
  it("una prenda dada de alta al vuelo (nace sin sku) muestra el código de barras que se escaneó, no un hueco", () => {
    expect(codigoDePrendaNueva({ sku: null, codigo_barras: "7750000000099" })).toBe("7750000000099");
  });

  it("si la base devuelve el código de la etiqueta, gana ese; el sku legado va detrás", () => {
    expect(codigoDePrendaNueva({ sku: null, codigo: "POL-0009-NEG-M", codigo_barras: "7750000000099" })).toBe("POL-0009-NEG-M");
    expect(codigoDePrendaNueva({ sku: "VIEJO-1", codigo: null, codigo_barras: "7750000000099" })).toBe("VIEJO-1");
  });
});

describe("mensajeMezclaEnCenso — el alta al vuelo cae en «Sin color o con colores» (ADR-0263 T5)", () => {
  const mezcla = { hint: "mezcla_sin_color", message: "Esta prenda quedaría con variantes «Sin color» junto a otras con color." };
  it("con un color elegido: la prenda es «Sin color», y dice dónde se arregla", () => {
    expect(mensajeMezclaEnCenso(mezcla, " Body Amir ", true)).toBe(
      "«Body Amir» está registrada «Sin color», y una prenda no puede tener variantes «Sin color» y de color a la vez. Para sumarle este color, primero hay que ponerle su color a las que ya tiene, desde su ficha en Productos.",
    );
  });
  it("sin color: la prenda tiene colores, que elija el suyo", () => {
    expect(mensajeMezclaEnCenso(mezcla, "Body Amir", false)).toBe("«Body Amir» tiene colores: una variante «Sin color» no va junto a ellas. Elige el color de esta prenda.");
  });
  it("otro error (o ninguno): null, lo traduce traducirError", () => {
    expect(mensajeMezclaEnCenso({ hint: "variante_ya_existe" }, "Body Amir", true)).toBeNull();
    expect(mensajeMezclaEnCenso(null, "Body Amir", true)).toBeNull();
  });
});

describe("crearColaEnSerie", () => {
  it("escribe en el orden en que se leyó aunque la primera respuesta tarde más", async () => {
    const cola = crearColaEnSerie();
    const escrito: number[] = [];
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all([
      cola.agregar(async () => {
        await esperar(30);
        escrito.push(1);
      }),
      cola.agregar(async () => {
        await esperar(1);
        escrito.push(2);
      }),
      cola.agregar(async () => {
        escrito.push(3);
      }),
    ]);
    expect(escrito).toEqual([1, 2, 3]);
  });

  it("una tarea que falla no frena las que siguen, y su error llega a quien la encoló", async () => {
    const cola = crearColaEnSerie();
    const falla = cola.agregar(async () => {
      throw new Error("sin red");
    });
    const sigue = cola.agregar(async () => "ok");
    await expect(falla).rejects.toThrow("sin red");
    await expect(sigue).resolves.toBe("ok");
  });

  it("vaciar espera a que no quede nada por guardar", async () => {
    const cola = crearColaEnSerie();
    let listo = false;
    void cola.agregar(async () => {
      await new Promise((r) => setTimeout(r, 10));
      listo = true;
    });
    expect(cola.pendientes).toBe(1);
    await cola.vaciar();
    expect(listo).toBe(true);
    expect(cola.pendientes).toBe(0);
  });
});

describe("crearAgrupadorDeGuardado — una ráfaga es un solo guardado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("12 lecturas seguidas de la misma variante disparan UN guardado, con el último total", () => {
    const disparos: [string, number][] = [];
    const g = crearAgrupadorDeGuardado<number>((id, n) => disparos.push([id, n]));
    for (let n = 1; n <= 12; n++) {
      g.programar("v1", n);
      vi.advanceTimersByTime(100);
    }
    expect(disparos).toEqual([]);
    expect(g.pendientes).toBe(1);
    vi.advanceTimersByTime(ESPERA_GUARDADO_MS);
    expect(disparos).toEqual([["v1", 12]]);
    expect(g.pendientes).toBe(0);
  });

  it("cada variante espera por su cuenta: escanear otra no retrasa ni pisa a la primera", () => {
    const disparos: [string, number][] = [];
    const g = crearAgrupadorDeGuardado<number>((id, n) => disparos.push([id, n]));
    g.programar("a", 3);
    vi.advanceTimersByTime(400);
    g.programar("b", 1);
    vi.advanceTimersByTime(200);
    expect(disparos).toEqual([["a", 3]]);
    vi.advanceTimersByTime(400);
    expect(disparos).toEqual([["a", 3], ["b", 1]]);
  });

  it("soltarTodo dispara YA lo que espera (al revisar): la última lectura no se pierde", () => {
    const disparos: [string, number][] = [];
    const g = crearAgrupadorDeGuardado<number>((id, n) => disparos.push([id, n]));
    g.programar("a", 2);
    g.programar("b", 5);
    g.soltarTodo();
    expect(disparos).toEqual([["a", 2], ["b", 5]]);
    expect(g.pendientes).toBe(0);
    // Y no vuelve a disparar cuando vence la espera.
    vi.advanceTimersByTime(ESPERA_GUARDADO_MS * 2);
    expect(disparos).toHaveLength(2);
  });

  it("un 0 escrito y un borrado (null) se guardan como lo que son", () => {
    const disparos: [string, number | null][] = [];
    const g = crearAgrupadorDeGuardado<number | null>((id, n) => disparos.push([id, n]));
    g.programar("a", 0);
    g.programar("b", null);
    vi.advanceTimersByTime(ESPERA_GUARDADO_MS);
    expect(disparos).toEqual([["a", 0], ["b", null]]);
  });

  it("espera el tiempo pedido, con 600 ms por defecto", () => {
    expect(ESPERA_GUARDADO_MS).toBe(600);
    const disparos: number[] = [];
    const g = crearAgrupadorDeGuardado<number>((_, n) => disparos.push(n), 50);
    g.programar("a", 1);
    vi.advanceTimersByTime(49);
    expect(disparos).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(disparos).toEqual([1]);
  });
});


describe("textoHallazgoDeLinea — la prenda que faltó y apareció después (ADR-0291)", () => {
  it("dice que ya se recuperó cuando lo encontrado cubre lo que faltó", () => {
    expect(textoHallazgoDeLinea({ diferencia: -1, hallazgos: 1 })).toBe("La encontraron después: 1 recuperada");
    expect(textoHallazgoDeLinea({ diferencia: -3, hallazgos: 3 })).toBe("La encontraron después: 3 recuperadas");
  });
  it("si solo apareció una parte, dice cuánto", () => {
    expect(textoHallazgoDeLinea({ diferencia: -3, hallazgos: 1 })).toBe("Ya aparecieron 1 de 3");
  });
  it("sin nada recuperado, o en una línea que no faltó, no dice nada", () => {
    expect(textoHallazgoDeLinea({ diferencia: -1, hallazgos: 0 })).toBeNull();
    expect(textoHallazgoDeLinea({ diferencia: 1, hallazgos: 1 })).toBeNull();
    expect(textoHallazgoDeLinea({ diferencia: null, hallazgos: 1 })).toBeNull();
  });
});


describe("textoHabiaAntes — la marca fija bajo «Debe haber» al corregir un conteo", () => {
  it("antes de volver a contar dice con cuánto se había contado (el «debe haber» de entonces)", () => {
    expect(textoHabiaAntes({ debeHaber: 3, ajustadoAntes: 0, ajustadoTotal: -1 })).toBe("Había 3");
  });
  it("NO cambia cuando se cuenta de nuevo y el «debe haber» salta de 3 a 2: sigue diciendo 3", () => {
    expect(textoHabiaAntes({ debeHaber: 2, ajustadoAntes: -1, ajustadoTotal: -1 })).toBe("Había 3");
    // Y con un ajuste que sumó: había 4, el cierre sumó 3 (hoy 7).
    expect(textoHabiaAntes({ debeHaber: 4, ajustadoAntes: 0, ajustadoTotal: 3 })).toBe("Había 4");
    expect(textoHabiaAntes({ debeHaber: 7, ajustadoAntes: 3, ajustadoTotal: 3 })).toBe("Había 4");
  });
  it("con dos cierres que se compensan (3 → 2 → 3, neto 0) sigue recordando el punto de partida", () => {
    expect(textoHabiaAntes({ debeHaber: 2, ajustadoAntes: -1, ajustadoTotal: 0 })).toBe("Había 3");
    // Ya vuelta a contar (antes = total = 0): el neto no dice que hubo cierres; lo dice el último ajuste anotado.
    expect(textoHabiaAntes({ debeHaber: 3, ajustadoAntes: 0, ajustadoTotal: 0, ajusteMovimientoId: "mov-2" })).toBe("Había 3");
    expect(textoHabiaAntes({ debeHaber: 3, ajustadoAntes: 0, ajustadoTotal: 0, ajusteMovimientoId: null })).toBeNull();
  });
  it("sin ajuste de cierre en la línea (conteo normal, o la cifra coincidió) no pone nada", () => {
    expect(textoHabiaAntes({ debeHaber: 3, ajustadoAntes: 0, ajustadoTotal: 0 })).toBeNull();
    expect(textoHabiaAntes({ debeHaber: 3 })).toBeNull();
  });
});


describe("línea ya ajustada y sin volver a contar (Confirmar no la anuncia como cambio)", () => {
  it("el ajuste del último cierre que el «debe haber» todavía no incluye", () => {
    expect(ajusteDelUltimoCierre({ ajustadoTotal: -1, ajustadoAntes: 0 })).toBe(-1);
    expect(ajusteDelUltimoCierre({ ajustadoTotal: 0, ajustadoAntes: -1 })).toBe(1); // 3 → 2 → 3: el neto es 0, el último fue +1
    expect(ajusteDelUltimoCierre({ ajustadoTotal: -1, ajustadoAntes: -1 })).toBe(0); // ya se volvió a contar
    expect(ajusteDelUltimoCierre({})).toBe(0);
  });
  it("solo una línea contada, ajustada por el cierre anterior y sin tocar, cuenta como «ya ajustada»", () => {
    expect(yaAjustadaSinTocar({ contada: 2, ajustadoTotal: -1, ajustadoAntes: 0 })).toBe(true);
    expect(yaAjustadaSinTocar({ contada: 3, ajustadoTotal: 0, ajustadoAntes: -1 })).toBe(true);
    // Volvió a contarse en este conteo reabierto: sí cambia al cerrar.
    expect(yaAjustadaSinTocar({ contada: 3, ajustadoTotal: -1, ajustadoAntes: -1 })).toBe(false);
    // Conteo que nunca se cerró, o pendiente: nada que excluir.
    expect(yaAjustadaSinTocar({ contada: 2, ajustadoTotal: 0, ajustadoAntes: 0 })).toBe(false);
    expect(yaAjustadaSinTocar({ contada: null, ajustadoTotal: -1, ajustadoAntes: 0 })).toBe(false);
  });
});

describe("pendientesParaCompletar: a quién llega «Completar todo» y «Aplicar todos completos»", () => {
  const lineas: Record<string, { contada: number | null }> = { a: { contada: null }, b: { contada: 3 }, c: { contada: 0 }, d: { contada: null } };
  const lineaDe = (id: string) => lineas[id];

  it("solo las que siguen sin cantidad, en el orden dado", () => {
    expect(pendientesParaCompletar(["d", "a", "b"], lineaDe)).toEqual(["d", "a"]);
  });
  it("un cero ya escrito es una cantidad: no se pisa con lo que debe haber", () => {
    expect(pendientesParaCompletar(["c"], lineaDe)).toEqual([]);
  });
  it("una variante que no está en el conteo no se inventa", () => {
    expect(pendientesParaCompletar(["zzz", "a"], lineaDe)).toEqual(["a"]);
  });
  it("sin variantes no hay nada que completar", () => {
    expect(pendientesParaCompletar([], lineaDe)).toEqual([]);
  });
});
