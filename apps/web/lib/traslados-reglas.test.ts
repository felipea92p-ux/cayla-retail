import { describe, it, expect } from "vitest";
import {
  accionDeTraslado,
  consultaDeParametros,
  RUTA_NUEVO_TRASLADO,
  urlNuevoTrasladoDesdeMover,
  volverDeNuevoTraslado,
  esTrasladoVacio,
  estadoTraslado,
  separarVacios,
  coincideBusqueda,
  coincideDireccion,
  coincideFiltro,
  contarRequierenAccion,
  conteoDelTraslado,
  debioLlegar,
  diaHora,
  diaMes,
  direccionTraslado,
  diasDeDiferencia,
  enTexto,
  esTerminado,
  estaAtrasado,
  haceTexto,
  horaLima,
  masUrgente,
  ordenarTraslados,
  otraSedeDe,
  requiereAccion,
  resumenPrendas,
  resumirTraslados,
  situacionTraslado,
  textoLlegada,
  type ContextoTraslados,
  type SituacionTraslado,
} from "./traslados-reglas";

describe("estaAtrasado", () => {
  const ahora = "2026-09-16T12:00:00.000Z";

  it("cerrada nunca está atrasada, aunque la ETA ya haya pasado", () => {
    expect(estaAtrasado("2026-09-15T00:00:00.000Z", "cerrada", ahora)).toBe(false);
  });

  it("en_transito con ETA en el pasado: atrasado", () => {
    expect(estaAtrasado("2026-09-16T11:00:00.000Z", "en_transito", ahora)).toBe(true);
  });

  it("en_transito con ETA en el futuro: no atrasado", () => {
    expect(estaAtrasado("2026-09-17T00:00:00.000Z", "en_transito", ahora)).toBe(false);
  });

  it("recibido_con_diferencia con ETA vencida también cuenta como atrasado", () => {
    expect(estaAtrasado("2026-09-16T00:00:00.000Z", "recibido_con_diferencia", ahora)).toBe(true);
  });

  it("completada (modelo anterior) tampoco está atrasada", () => {
    expect(estaAtrasado("2026-09-15T00:00:00.000Z", "completada", ahora)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lectura operativa (rediseño 2026-09-18). Reloj fijo: viernes 18/9, 13:28 en
// Lima (= 18:28 UTC). Los tres traslados de abajo son la pantalla de la que
// salió el rediseño: el 2 ya debió llegar, el 3 llega mañana, el 1 terminó.
// ---------------------------------------------------------------------------

const AHORA = "2026-09-18T18:28:00.000Z";
const TRU = "tru";
const AQP = "aqp";
const TALLER = "taller";
const comoEncargadoTru: ContextoTraslados = { miUbicacionId: TRU, puedeCerrarDiferencia: true, ahoraIso: AHORA };
const comoColaboradorTru: ContextoTraslados = { miUbicacionId: TRU, puedeCerrarDiferencia: false, ahoraIso: AHORA };

function traslado(sobre: Partial<Record<string, unknown>> = {}) {
  return {
    id: "id",
    numero: 1,
    estado: "en_transito",
    ubicacionOrigenId: TALLER,
    ubicacionDestinoId: TRU,
    fechaEstimadaLlegada: "2026-09-18T17:12:00.000Z", // 12:12 en Lima: ya pasó
    confirmadoEn: null as string | null,
    creadoEn: "2026-09-17T17:12:00.000Z",
    cerradoEn: null as string | null,
    unidadesEnviadas: 10,
    ...sobre,
  };
}

const t2 = traslado({ id: "t2", numero: 2, unidadesEnviadas: 28 });
const t3 = traslado({ id: "t3", numero: 3, unidadesEnviadas: 15, fechaEstimadaLlegada: "2026-09-19T21:15:00.000Z" }); // mañana 16:15
const t1 = traslado({
  id: "t1",
  numero: 1,
  unidadesEnviadas: 6,
  estado: "completada",
  ubicacionOrigenId: TRU,
  ubicacionDestinoId: AQP,
  fechaEstimadaLlegada: null,
  cerradoEn: "2026-09-16T20:00:00.000Z",
});

describe("situacionTraslado", () => {
  it("viene hacia mí y ya pasó la hora estimada: hay que recibirlo", () => {
    expect(situacionTraslado(t2, comoEncargadoTru)).toBe("requiere_recepcion");
  });

  it("viene hacia mí y todavía está a tiempo: TAMBIÉN hay que recibirlo — la hora estimada no esconde la caja (ADR-0239)", () => {
    expect(situacionTraslado(t3, comoEncargadoTru)).toBe("requiere_recepcion");
    expect(situacionTraslado(t3, comoColaboradorTru)).toBe("requiere_recepcion");
    expect(debioLlegar(t3.fechaEstimadaLlegada, AHORA)).toBe(false); // sigue siendo un dato, no un candado
  });

  it("lo que salió de mi sede nunca me pide recibir, ni siquiera atrasado", () => {
    const saliente = traslado({ ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    expect(situacionTraslado(saliente, comoEncargadoTru)).toBe("en_camino_saliente");
    expect(debioLlegar(saliente.fechaEstimadaLlegada, AHORA)).toBe(true);
  });

  it("sin hora estimada también se recibe", () => {
    expect(situacionTraslado(traslado({ fechaEstimadaLlegada: null }), comoEncargadoTru)).toBe("requiere_recepcion");
  });

  it("con diferencia: le toca al líder de la sede que recibió; a los demás solo les consta", () => {
    const conDiferencia = traslado({ estado: "recibido_con_diferencia" });
    expect(situacionTraslado(conDiferencia, comoEncargadoTru)).toBe("requiere_revision");
    expect(situacionTraslado(conDiferencia, comoColaboradorTru)).toBe("con_diferencia");
    // el líder de la sede que ENVIÓ no puede cerrarlo (lo exige la RPC): para él tampoco es acción
    expect(situacionTraslado(conDiferencia, { ...comoEncargadoTru, miUbicacionId: TALLER })).toBe("con_diferencia");
  });

  it("cerrada, completada y cualquier estado desconocido son historial", () => {
    expect(situacionTraslado(traslado({ estado: "cerrada" }), comoEncargadoTru)).toBe("cerrado");
    expect(situacionTraslado(t1, comoEncargadoTru)).toBe("cerrado");
    expect(situacionTraslado(traslado({ estado: "algo_nuevo" }), comoEncargadoTru)).toBe("cerrado");
  });

  it("cerrada con diferencia es su propia situación: la pérdida no se esconde como «Cerrado»", () => {
    expect(situacionTraslado(traslado({ estado: "cerrada", cerradoConDiferencia: true }), comoEncargadoTru)).toBe("cerrado_con_diferencia");
    // El dato solo cuenta en uno cerrado: en uno abierto el conteo está a medias.
    expect(situacionTraslado(traslado({ cerradoConDiferencia: true }), comoEncargadoTru)).toBe("requiere_recepcion");
  });

  it("anulada: historial, desde las dos sedes — nunca «por recibir» ni «en camino»", () => {
    const anulado = traslado({ estado: "anulada", anuladoEn: "2026-09-18T15:00:00.000Z" });
    expect(situacionTraslado(anulado, comoEncargadoTru)).toBe("anulado");
    expect(situacionTraslado(anulado, { ...comoEncargadoTru, miUbicacionId: TALLER })).toBe("anulado");
  });

  it("solo recepciones y revisiones piden acción; solo cerrados y anulados son historial", () => {
    const todas: SituacionTraslado[] = ["requiere_recepcion", "requiere_revision", "en_camino_saliente", "con_diferencia", "cerrado", "cerrado_con_diferencia", "anulado"];
    expect(todas.filter(requiereAccion)).toEqual(["requiere_recepcion", "requiere_revision"]);
    expect(todas.filter(esTerminado)).toEqual(["cerrado", "cerrado_con_diferencia", "anulado"]);
  });
});

describe("coincideFiltro", () => {
  it("«Con diferencia» incluye el que me toca revisar; «Acción hoy» también", () => {
    expect(coincideFiltro("requiere_revision", "con_diferencia")).toBe(true);
    expect(coincideFiltro("requiere_revision", "accion")).toBe(true);
    expect(coincideFiltro("con_diferencia", "accion")).toBe(false);
    // «Abiertos» = todo lo que no terminó, pida acción o no.
    expect(coincideFiltro("en_camino_saliente", "abiertos")).toBe(true);
    expect(coincideFiltro("con_diferencia", "abiertos")).toBe(true);
    expect(coincideFiltro("cerrado", "abiertos")).toBe(false);
  });

  it("«Con diferencia» también muestra los ya cerrados con diferencia: la pérdida no desaparece al cerrarse", () => {
    expect(coincideFiltro("cerrado_con_diferencia", "con_diferencia")).toBe(true);
    expect(coincideFiltro("cerrado", "con_diferencia")).toBe(false);
    expect(coincideFiltro("anulado", "con_diferencia")).toBe(false);
  });

  it("«Enviados en camino» es solo lo que salió de mi sede; lo que viene hacia mí es «por recibir»", () => {
    expect(coincideFiltro("en_camino_saliente", "en_camino")).toBe(true);
    expect(coincideFiltro("requiere_recepcion", "en_camino")).toBe(false);
  });

  it("«Por recibir» (atajo de la tarjeta) filtra SOLO recepciones: la tarjeta cuenta solo recepciones", () => {
    expect(coincideFiltro("requiere_recepcion", "por_recibir")).toBe(true);
    expect(coincideFiltro("requiere_revision", "por_recibir")).toBe(false);
    expect(coincideFiltro("anulado", "por_recibir")).toBe(false);
  });

  it("todos deja pasar todo; cerrados junta cerrado, cerrado con diferencia y anulado", () => {
    expect(coincideFiltro("cerrado", "todos")).toBe(true);
    for (const s of ["cerrado", "cerrado_con_diferencia", "anulado"] as SituacionTraslado[]) {
      expect(coincideFiltro(s, "cerrados"), s).toBe(true);
      expect(coincideFiltro(s, "abiertos"), s).toBe(false);
    }
    expect(coincideFiltro("requiere_recepcion", "cerrados")).toBe(false);
  });
});

describe("resumirTraslados", () => {
  it("la pantalla de referencia: 2 por recibir (1 atrasado), 0 diferencias, 43 prendas en tránsito", () => {
    const r = resumirTraslados([t2, t3, t1], comoEncargadoTru);
    expect(r.porRecibir).toBe(2);
    expect(r.porRecibirAtrasados).toBe(1); // el 2; el 3 llega mañana
    expect(r.conDiferencia).toBe(0);
    expect(r.unidadesEnTransito).toBe(43); // 28 + 15; el cerrado no cuenta
    expect(r.enCamino).toBe(2);
    expect(r.abiertos).toBe(2);
    expect(r.requierenAccion).toBe(2);
    expect(r.porFiltro).toEqual({ todos: 3, abiertos: 2, accion: 2, en_camino: 0, con_diferencia: 0, cerrados: 1, por_recibir: 2 });
  });

  it("los salientes suman a «Enviados en camino» y a las prendas en tránsito, nunca a «Por recibir»", () => {
    const saliente = traslado({ id: "s", numero: 4, unidadesEnviadas: 7, ubicacionOrigenId: TRU, ubicacionDestinoId: AQP, fechaEstimadaLlegada: "2026-09-19T21:15:00.000Z" });
    const r = resumirTraslados([t2, t3, saliente], comoEncargadoTru);
    expect(r.porRecibir).toBe(2);
    expect(r.salientesEnCamino).toBe(1);
    expect(r.porFiltro.en_camino).toBe(1); // la tarjeta y su filtro dicen lo mismo
    expect(r.unidadesEnTransito).toBe(50);
    expect(r.enCamino).toBe(3);
  });

  it("una diferencia pendiente es abierta y, si soy líder, acción; sus prendas ya NO están en tránsito (lo que coincidió entró)", () => {
    const dif = traslado({ id: "d", numero: 5, unidadesEnviadas: 12, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-18T18:10:00.000Z" });
    const lider = resumirTraslados([dif], comoEncargadoTru);
    expect(lider).toMatchObject({ conDiferencia: 1, porRevisar: 1, requierenAccion: 1, unidadesEnTransito: 0, abiertos: 1, diferenciasCerradas: 0 });
    const colaborador = resumirTraslados([dif], comoColaboradorTru);
    expect(colaborador).toMatchObject({ conDiferencia: 1, porRevisar: 0, requierenAccion: 0 });
  });

  it("«Con diferencia» cuenta también los cerrados con diferencia, y la tarjeta cuenta lo mismo que su filtro", () => {
    const cerradoMal = traslado({ id: "c", numero: 6, estado: "cerrada", cerradoConDiferencia: true });
    const cerradoBien = traslado({ id: "b", numero: 7, estado: "cerrada" });
    const pendiente = traslado({ id: "d", numero: 5, estado: "recibido_con_diferencia" });
    const r = resumirTraslados([cerradoMal, cerradoBien, pendiente], comoEncargadoTru);
    expect(r).toMatchObject({ conDiferencia: 2, diferenciasCerradas: 1, porRevisar: 1, abiertos: 1 });
    expect(r.porFiltro.con_diferencia).toBe(r.conDiferencia);
    expect(r.porFiltro.cerrados).toBe(2);
  });

  it("un anulado cuenta como cerrado: ni por recibir, ni en tránsito, ni abierto", () => {
    const anulado = traslado({ id: "a", numero: 8, unidadesEnviadas: 9, estado: "anulada" });
    const r = resumirTraslados([anulado], comoEncargadoTru);
    expect(r).toMatchObject({ porRecibir: 0, unidadesEnTransito: 0, enCamino: 0, abiertos: 0, requierenAccion: 0, conDiferencia: 0 });
    expect(r.porFiltro).toMatchObject({ cerrados: 1, abiertos: 0, por_recibir: 0, en_camino: 0 });
  });

  it("un líder con SOLO una diferencia pendiente: «Por recibir» es 0 y su filtro devuelve 0 filas (coincide con la tarjeta); «Acción hoy» sí la cuenta", () => {
    const dif = traslado({ id: "d", numero: 5, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-18T18:10:00.000Z" });
    const r = resumirTraslados([dif], comoEncargadoTru);
    expect(r.porRecibir).toBe(0);
    expect(r.porFiltro.por_recibir).toBe(0);
    expect(r.porFiltro.accion).toBe(1);
  });

  it("sin traslados todo es cero", () => {
    const r = resumirTraslados([], comoEncargadoTru);
    expect(r.requierenAccion + r.abiertos + r.unidadesEnTransito).toBe(0);
    expect(r.porFiltro.todos).toBe(0);
  });
});

describe("contarRequierenAccion (el contador del menú)", () => {
  it("cuenta lo que me toca, llegue cuando llegue — no todos los traslados que existen", () => {
    expect(contarRequierenAccion([t2, t3, t1], comoEncargadoTru)).toBe(2);
  });

  it("un traslado que sale hoy hacia mi sede ya enciende el número, aunque llegue mañana (ADR-0239)", () => {
    expect(contarRequierenAccion([t3], comoColaboradorTru)).toBe(1);
  });

  it("cero cuando solo hay salientes, cerrados o anulados: no debe haber contador", () => {
    const saliente = traslado({ ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    expect(contarRequierenAccion([saliente, t1, traslado({ estado: "anulada" })], comoEncargadoTru)).toBe(0);
  });

  it("coincide siempre con `requierenAccion` de la pantalla (una sola regla)", () => {
    const dif = traslado({ id: "d", numero: 5, estado: "recibido_con_diferencia" });
    const lista = [t2, t3, t1, dif];
    expect(contarRequierenAccion(lista, comoEncargadoTru)).toBe(resumirTraslados(lista, comoEncargadoTru).requierenAccion);
    expect(contarRequierenAccion(lista, comoColaboradorTru)).toBe(resumirTraslados(lista, comoColaboradorTru).requierenAccion);
  });
});

describe("masUrgente", () => {
  it("elige el que lleva más tiempo esperando", () => {
    const viejo = traslado({ id: "v", numero: 9, creadoEn: "2026-09-15T15:00:00.000Z", fechaEstimadaLlegada: "2026-09-16T15:00:00.000Z" });
    expect(masUrgente([t2, viejo], comoEncargadoTru)?.id).toBe("v");
    expect(masUrgente([viejo, t2], comoEncargadoTru)?.id).toBe("v");
  });

  it("cuenta la ESPERA, no la antigüedad del envío: salió hace más pero debió llegar hace menos", () => {
    // A salió el 15/9 pero su hora estimada era HOY 04:00 (lleva ~9 h esperando).
    const a = traslado({ id: "A", numero: 7, creadoEn: "2026-09-15T13:00:00.000Z", fechaEstimadaLlegada: "2026-09-18T09:00:00.000Z" });
    // B salió el 16/9 y debió llegar el 16/9 20:00 (lleva ~1 día y medio esperando): es el más urgente.
    const b = traslado({ id: "B", numero: 8, creadoEn: "2026-09-16T13:00:00.000Z", fechaEstimadaLlegada: "2026-09-17T01:00:00.000Z" });
    expect(masUrgente([a, b], comoEncargadoTru)?.id).toBe("B");
    expect(masUrgente([b, a], comoEncargadoTru)?.id).toBe("B");
    expect(ordenarTraslados([a, b], comoEncargadoTru).map((t) => t.id)).toEqual(["B", "A"]);
  });

  it("igual con diferencias: manda cuándo se recibió, no cuándo salió el envío", () => {
    const d1 = traslado({ id: "D1", numero: 5, estado: "recibido_con_diferencia", creadoEn: "2026-09-10T15:00:00.000Z", confirmadoEn: "2026-09-18T12:00:00.000Z" });
    const d2 = traslado({ id: "D2", numero: 6, estado: "recibido_con_diferencia", creadoEn: "2026-09-16T15:00:00.000Z", confirmadoEn: "2026-09-16T21:00:00.000Z" });
    expect(ordenarTraslados([d1, d2], comoColaboradorTru).map((t) => t.id)).toEqual(["D2", "D1"]); // grupo «con diferencia» ajena
    expect(masUrgente([d1, d2], comoEncargadoTru)?.id).toBe("D2"); // el líder: las dos le tocan
  });

  it("ignora lo que no me toca, y devuelve null si no hay nada", () => {
    const saliente = traslado({ ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    expect(masUrgente([saliente, t1], comoEncargadoTru)).toBeNull();
    expect(masUrgente([], comoEncargadoTru)).toBeNull();
  });

  it("lo que todavía viaja va detrás de lo atrasado, aunque haya salido antes", () => {
    const salioAntesLlegaManana = traslado({ id: "m", numero: 3, creadoEn: "2026-09-10T15:00:00.000Z", fechaEstimadaLlegada: "2026-09-19T21:15:00.000Z" });
    expect(masUrgente([salioAntesLlegaManana, t2], comoEncargadoTru)?.id).toBe("t2");
    expect(masUrgente([salioAntesLlegaManana], comoEncargadoTru)?.id).toBe("m");
  });

  it("una recepción y una revisión compiten por antigüedad, no por tipo", () => {
    const dif = traslado({ id: "d", numero: 5, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-15T18:00:00.000Z", creadoEn: "2026-09-14T18:00:00.000Z" });
    expect(masUrgente([t2, dif], comoEncargadoTru)?.id).toBe("d"); // esperando desde el 15/9 vs. el 2, desde hoy 12:12
  });

  it("a igual antigüedad gana el número más bajo (resultado estable)", () => {
    const a = traslado({ id: "a", numero: 7 });
    const b = traslado({ id: "b", numero: 6 });
    expect(masUrgente([a, b], comoEncargadoTru)?.id).toBe("b");
  });
});

describe("fechas humanas (siempre en Lima)", () => {
  it("diaHora: hoy, mañana, ayer y más lejos", () => {
    expect(diaHora("2026-09-18T17:12:00.000Z", AHORA)).toBe("hoy 12:12");
    expect(diaHora("2026-09-19T21:15:00.000Z", AHORA)).toBe("mañana 16:15");
    expect(diaHora("2026-09-17T14:00:00.000Z", AHORA)).toBe("ayer 09:00");
    expect(diaHora("2026-09-21T21:15:00.000Z", AHORA)).toBe("21 sep · 16:15");
  });

  it("el día lo decide Lima, no UTC: 22:30 del 18 en Lima ya es 19 en UTC pero sigue siendo «hoy»", () => {
    expect(diaHora("2026-09-19T03:30:00.000Z", AHORA)).toBe("hoy 22:30");
    expect(diasDeDiferencia("2026-09-19T03:30:00.000Z", AHORA)).toBe(0);
  });

  it("medianoche se escribe 00:xx, no 24:xx", () => {
    expect(diaHora("2026-09-19T05:05:00.000Z", AHORA)).toBe("mañana 00:05");
  });

  it("diaMes no rellena con ceros", () => {
    expect(diaMes("2026-09-16T20:00:00.000Z")).toBe("16/9");
    expect(diaMes("2026-01-05T20:00:00.000Z")).toBe("5/1");
  });

  it("haceTexto: minutos, horas y días", () => {
    expect(haceTexto("2026-09-18T18:27:40.000Z", AHORA)).toBe("hace un momento");
    expect(haceTexto("2026-09-18T18:03:00.000Z", AHORA)).toBe("hace 25 min");
    expect(haceTexto("2026-09-18T17:12:00.000Z", AHORA)).toBe("hace 1 h");
    expect(haceTexto("2026-09-16T18:28:00.000Z", AHORA)).toBe("hace 2 días");
    expect(haceTexto("2026-09-17T15:00:00.000Z", AHORA)).toBe("hace 1 día");
    expect(haceTexto("2026-09-19T18:28:00.000Z", AHORA)).toBe("hace un momento"); // futuro: nunca «hace -1 h»
  });

  it("enTexto: minutos, horas con minutos si son pocas, días", () => {
    expect(enTexto("2026-09-18T19:08:00.000Z", AHORA)).toBe("en 40 min");
    expect(enTexto("2026-09-18T21:00:00.000Z", AHORA)).toBe("en 2 h 32 min");
    expect(enTexto("2026-09-19T00:28:00.000Z", AHORA)).toBe("en 6 h");
    expect(enTexto("2026-09-20T18:28:00.000Z", AHORA)).toBe("en 2 días");
  });
});

describe("textoLlegada", () => {
  it("el que ya debió llegar y me toca: urgente, «Atrasado desde…» con «hace 1 h»", () => {
    expect(textoLlegada(t2, "requiere_recepcion", AHORA)).toEqual({ principal: "Atrasado desde hoy 12:12", secundario: "hace 1 h", tono: "urgente" });
  });

  it("el que viene a tiempo se recibe igual, pero dice «Llega mañana 16:15» sin drama", () => {
    expect(textoLlegada(t3, "requiere_recepcion", AHORA)).toEqual({ principal: "Llega mañana 16:15", secundario: "19/9", tono: "normal" });
  });

  it("el que llega hoy más tarde dice cuánto falta", () => {
    const hoyMasTarde = traslado({ fechaEstimadaLlegada: "2026-09-18T21:00:00.000Z" });
    expect(textoLlegada(hoyMasTarde, "requiere_recepcion", AHORA)).toEqual({ principal: "Llega hoy 16:00", secundario: "en 2 h 32 min", tono: "normal" });
  });

  it("el que llega en 3 días dice la fecha y cuántos días", () => {
    const lejos = traslado({ fechaEstimadaLlegada: "2026-09-21T21:15:00.000Z" });
    expect(textoLlegada(lejos, "requiere_recepcion", AHORA)).toEqual({ principal: "Llega 21 sep · 16:15", secundario: "en 3 días", tono: "normal" });
  });

  it("lo saliente que se pasó de hora: aviso (ámbar), no urgencia mía", () => {
    const saliente = traslado({ ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    expect(textoLlegada(saliente, "en_camino_saliente", AHORA)).toEqual({ principal: "Atrasado desde hoy 12:12", secundario: "hace 1 h", tono: "aviso" });
  });

  it("con conteos guardados: la caja llegó, falta terminar — aunque la hora estimada sea mañana", () => {
    expect(textoLlegada({ ...t3, lineasContadas: 2 }, "requiere_recepcion", AHORA)).toEqual({ principal: "Conteo empezado", secundario: "Llegaba mañana 16:15", tono: "urgente" });
    expect(textoLlegada({ ...t2, lineasContadas: 1 }, "requiere_recepcion", AHORA).secundario).toBe("Atrasado desde hoy 12:12");
  });

  it("con diferencia habla de cuándo se recibió, NO de si estaba atrasado", () => {
    const dif = traslado({ estado: "recibido_con_diferencia", confirmadoEn: "2026-09-18T18:10:00.000Z" });
    expect(textoLlegada(dif, "requiere_revision", AHORA)).toEqual({ principal: "Recibido hoy 13:10", secundario: "hace 18 min", tono: "aviso" });
    expect(textoLlegada(dif, "con_diferencia", AHORA).principal).toBe("Recibido hoy 13:10");
  });

  it("el terminado dice «Cerrado» con su fecha; con diferencia, sin el visto verde", () => {
    expect(textoLlegada(t1, "cerrado", AHORA)).toEqual({ principal: "Cerrado 16/9", secundario: null, tono: "hecho" });
    expect(textoLlegada(t1, "cerrado_con_diferencia", AHORA)).toEqual({ principal: "Cerrado 16/9", secundario: null, tono: "normal" });
  });

  it("el anulado dice cuándo se anuló", () => {
    const anulado = traslado({ estado: "anulada", anuladoEn: "2026-09-17T15:00:00.000Z" });
    expect(textoLlegada(anulado, "anulado", AHORA)).toEqual({ principal: "Anulado 17/9", secundario: null, tono: "normal" });
  });

  it("sin hora estimada no inventa una", () => {
    const sin = traslado({ fechaEstimadaLlegada: null });
    expect(textoLlegada(sin, "requiere_recepcion", AHORA)).toEqual({ principal: "Sin hora estimada", secundario: "Enviado ayer 12:12", tono: "urgente" });
  });
});

describe("resumenPrendas, direccionTraslado, accionDeTraslado", () => {
  it("resumenPrendas: primera prenda + cuántas más", () => {
    expect(resumenPrendas(["Blusa Camila", "Falda Isabella", "Vestido Sofía"])).toBe("Blusa Camila + 2 más");
    expect(resumenPrendas(["Blusa Camila"])).toBe("Blusa Camila");
    expect(resumenPrendas([])).toBe("Sin prendas");
  });

  it("direccionTraslado: hacia mi sede o desde mi sede", () => {
    expect(direccionTraslado(t2, TRU)).toBe("entrante");
    expect(direccionTraslado(t1, TRU)).toBe("saliente");
  });

  it("«Recibir» y «Revisar» llevan el botón fuerte; el resto, «Ver detalle»", () => {
    expect(accionDeTraslado("requiere_recepcion")).toEqual({ texto: "Recibir", principal: true });
    expect(accionDeTraslado("requiere_revision")).toEqual({ texto: "Revisar", principal: true });
    for (const s of ["en_camino_saliente", "con_diferencia", "cerrado", "cerrado_con_diferencia", "anulado"] as SituacionTraslado[]) {
      expect(accionDeTraslado(s), s).toEqual({ texto: "Ver detalle", principal: false });
    }
  });
});

describe("coincideBusqueda", () => {
  const camila = {
    numero: 2,
    ubicacionOrigenNombre: "Taller",
    ubicacionDestinoNombre: "Tienda TRU",
    nota: "Caja frágil",
    referencias: ["Blusa Camila", "Falda Isabella"],
    skus: ["BLU-CAM-S-BEI", "BLU-001"],
  };
  const doce = { ...camila, numero: 12, referencias: ["Vestido Sofía"], skus: ["VES-SOF-M"] };

  it("busca por sede, prenda, código y nota, sin importar mayúsculas ni tildes", () => {
    expect(coincideBusqueda(camila, "taller")).toBe(true);
    expect(coincideBusqueda(camila, "TRU")).toBe(true);
    expect(coincideBusqueda(camila, "camíla")).toBe(true);
    expect(coincideBusqueda(camila, "BLU-CAM")).toBe(true);
    expect(coincideBusqueda(camila, "frágil")).toBe(true);
    expect(coincideBusqueda(doce, "sofia")).toBe(true);
  });

  it("varias palabras: todas tienen que aparecer", () => {
    expect(coincideBusqueda(camila, "blusa tru")).toBe(true);
    expect(coincideBusqueda(camila, "blusa aqp")).toBe(false);
  });

  it("un número corto es el número del traslado y solo ese: «2» no trae el 12", () => {
    expect(coincideBusqueda(camila, "2")).toBe(true);
    expect(coincideBusqueda(camila, "#2")).toBe(true);
    expect(coincideBusqueda(camila, "traslado 2")).toBe(true);
    expect(coincideBusqueda(doce, "2")).toBe(false);
    expect(coincideBusqueda(doce, "traslado 12")).toBe(true);
  });

  it("entiende el identificador como se escribe en Movimientos: «Traslado 12», «traslado#12», «n° 12», «nro. 12»", () => {
    // Lo que una líder lee en la columna «Referencia» de Movimientos («Traslado 12») tiene que
    // encontrar el mismo traslado acá, escrito como lo escriba.
    for (const consulta of ["Traslado 12", "traslado#12", "traslado12", "TRASLADO Nº 12", "traslado n° 12", "nro. 12", "nro.12", "N°12", "numero 12", "#12"]) {
      expect(coincideBusqueda(doce, consulta), consulta).toBe(true);
      expect(coincideBusqueda(camila, consulta), consulta).toBe(false);
    }
    // El número sigue siendo exacto: «traslado 1» no trae el 12.
    expect(coincideBusqueda(doce, "traslado 1")).toBe(false);
    expect(coincideBusqueda(doce, "traslado#1")).toBe(false);
  });

  it("las palabras de relleno solas no filtran, y se combinan con el resto de la búsqueda", () => {
    expect(coincideBusqueda(camila, "traslado")).toBe(true);
    expect(coincideBusqueda(camila, "n°")).toBe(true);
    expect(coincideBusqueda(camila, "traslado 2 taller")).toBe(true);
    expect(coincideBusqueda(camila, "traslado 2 aqp")).toBe(false);
  });

  it("un código de prenda que empieza como una palabra de relleno no se parte: «num» sin número es texto", () => {
    const conNum = { ...camila, skus: ["NUMERO-UNO"] };
    // «numero-uno» no lleva un dígito pegado, así que no se toca; «numero» solo es relleno.
    expect(coincideBusqueda(conNum, "numero-uno")).toBe(true);
    expect(coincideBusqueda(camila, "numero-uno")).toBe(false);
  });

  it("desde 3 cifras también busca dentro de los códigos de prenda", () => {
    expect(coincideBusqueda(camila, "001")).toBe(true);
    expect(coincideBusqueda(doce, "001")).toBe(false);
  });

  it("vacío no filtra nada", () => {
    expect(coincideBusqueda(camila, "")).toBe(true);
    expect(coincideBusqueda(camila, "   ")).toBe(true);
  });
});

describe("ordenarTraslados", () => {
  it("lo que me toca primero (lo que debió llegar antes, arriba), luego diferencias ajenas, lo que salió por hora de llegada y el historial al final", () => {
    const vencidoViejo = traslado({ id: "viejo", numero: 8, creadoEn: "2026-09-15T15:00:00.000Z", fechaEstimadaLlegada: "2026-09-16T15:00:00.000Z" });
    const vencidoHoy = traslado({ id: "hoy", numero: 9 }); // 12:12 de hoy
    const conDiferenciaAjena = traslado({ id: "dif", numero: 7, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-17T15:00:00.000Z" });
    const llegaHoyMasTarde = traslado({ id: "tarde", numero: 6, fechaEstimadaLlegada: "2026-09-18T21:00:00.000Z" });
    const llegaMañana = traslado({ id: "mañana", numero: 5, fechaEstimadaLlegada: "2026-09-19T21:15:00.000Z" });
    const saleHaciaAqp = traslado({ id: "sale", numero: 4, ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    const cerradoViejo = traslado({ id: "c-viejo", numero: 1, estado: "cerrada", creadoEn: "2026-09-10T15:00:00.000Z" });
    const anuladoReciente = traslado({ id: "c-nuevo", numero: 2, estado: "anulada", creadoEn: "2026-09-16T15:00:00.000Z" });
    const revuelto = [cerradoViejo, llegaMañana, vencidoHoy, saleHaciaAqp, conDiferenciaAjena, anuladoReciente, llegaHoyMasTarde, vencidoViejo];
    expect(ordenarTraslados(revuelto, comoColaboradorTru).map((t) => t.id)).toEqual(["viejo", "hoy", "tarde", "mañana", "dif", "sale", "c-nuevo", "c-viejo"]);
  });

  it("para un líder, la diferencia que le toca revisar entra al grupo de acción, por antigüedad", () => {
    const dif = traslado({ id: "dif", numero: 7, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-15T15:00:00.000Z", creadoEn: "2026-09-14T15:00:00.000Z" });
    expect(ordenarTraslados([t2, dif], comoEncargadoTru).map((t) => t.id)).toEqual(["dif", "t2"]);
  });

  it("no modifica el arreglo original", () => {
    const original = [t1, t3, t2];
    ordenarTraslados(original, comoEncargadoTru);
    expect(original.map((t) => t.id)).toEqual(["t1", "t3", "t2"]);
  });
});

describe("horaLima, coincideDireccion, otraSedeDe", () => {
  it("horaLima escribe la hora de Lima en 24 h", () => {
    expect(horaLima(AHORA)).toBe("13:28");
    expect(horaLima("2026-09-19T05:05:00.000Z")).toBe("00:05");
  });

  it("coincideDireccion filtra lo que llega o lo que sale de mi sede", () => {
    expect(coincideDireccion(t2, TRU, "entrante")).toBe(true);
    expect(coincideDireccion(t2, TRU, "saliente")).toBe(false);
    expect(coincideDireccion(t1, TRU, "saliente")).toBe(true);
    expect(coincideDireccion(t1, TRU, "todas")).toBe(true);
  });

  it("otraSedeDe devuelve el extremo que no es mi sede", () => {
    const entrante = { ...t2, ubicacionOrigenNombre: "Taller", ubicacionDestinoNombre: "Tienda Trujillo" };
    const saliente = { ...t1, ubicacionOrigenNombre: "Tienda Trujillo", ubicacionDestinoNombre: "Tienda Arequipa" };
    expect(otraSedeDe(entrante, TRU)).toEqual({ id: TALLER, nombre: "Taller" });
    expect(otraSedeDe(saliente, TRU)).toEqual({ id: AQP, nombre: "Tienda Arequipa" });
  });
});

// ===========================================================================
// Rediseño 2026-09-22 (ADR-0173)
// ===========================================================================

describe("traslados vacíos", () => {
  it("un traslado sin líneas es vacío; con una ya no", () => {
    expect(esTrasladoVacio({ lineas: 0 })).toBe(true);
    expect(esTrasladoVacio({ lineas: 1 })).toBe(false);
  });

  it("separarVacios aparta las cabeceras vacías y dice cuántas eran, sin reordenar el resto", () => {
    const ts = [
      { numero: 1, lineas: 0 },
      { numero: 5, lineas: 3 },
      { numero: 2, lineas: 0 },
      { numero: 6, lineas: 1 },
    ];
    const { conPrendas, vacios } = separarVacios(ts);
    expect(conPrendas.map((t) => t.numero)).toEqual([5, 6]);
    expect(vacios).toBe(2);
  });
});

describe("estadoTraslado", () => {
  it("dice lo que le toca a quien mira, con el tono de la guía", () => {
    expect(estadoTraslado("requiere_recepcion")).toEqual({ texto: "Por recibir", tono: "rojo" });
    expect(estadoTraslado("requiere_revision")).toEqual({ texto: "Por revisar", tono: "ambar" });
    expect(estadoTraslado("con_diferencia")).toEqual({ texto: "Con diferencia", tono: "ambar" });
    expect(estadoTraslado("en_camino_saliente")).toEqual({ texto: "En camino", tono: "pizarra" });
  });

  it("un cerrado que tuvo diferencia no se pinta de verde, venga como situación o como dato aparte", () => {
    expect(estadoTraslado("cerrado")).toEqual({ texto: "Cerrado", tono: "verde" });
    expect(estadoTraslado("cerrado", true)).toEqual({ texto: "Cerrado con diferencia", tono: "neutro" });
    expect(estadoTraslado("cerrado_con_diferencia")).toEqual({ texto: "Cerrado con diferencia", tono: "neutro" });
  });

  it("un anulado va apagado (tachado), como toda anulación del ERP", () => {
    expect(estadoTraslado("anulado")).toEqual({ texto: "Anulado", tono: "apagado" });
  });

  it("un estado, un nombre: nadie dice «Completado» ni «Por confirmar»", () => {
    const todas: SituacionTraslado[] = ["requiere_recepcion", "requiere_revision", "en_camino_saliente", "con_diferencia", "cerrado", "cerrado_con_diferencia", "anulado"];
    const textos = todas.map((s) => estadoTraslado(s).texto);
    expect(textos).not.toContain("Completado");
    expect(textos).not.toContain("Por confirmar");
    expect(new Set(textos).size).toBe(todas.length);
  });
});

describe("conteoDelTraslado (lo que la lista sabe del conteo sin abrir el traslado)", () => {
  const enviados = [
    { varianteId: "a", cantidad: 2 },
    { varianteId: "b", cantidad: 1 },
  ];

  it("sin conteos: nada contado, sin diferencia", () => {
    expect(conteoDelTraslado(enviados, [])).toEqual({ contadas: 0, huboDiferencia: false });
  });

  it("todo igual a lo enviado: sin diferencia", () => {
    expect(
      conteoDelTraslado(enviados, [
        { varianteId: "a", cantidadRecibida: 2 },
        { varianteId: "b", cantidadRecibida: 1 },
      ])
    ).toEqual({ contadas: 2, huboDiferencia: false });
  });

  it("el Traslado 3 del recorrido: 2 vestidos y 0 blusas → con diferencia", () => {
    expect(
      conteoDelTraslado(enviados, [
        { varianteId: "a", cantidadRecibida: 2 },
        { varianteId: "b", cantidadRecibida: 0 },
      ])
    ).toEqual({ contadas: 2, huboDiferencia: true });
  });

  it("una prenda que no estaba en el envío es diferencia (contra 0), pero no suma a lo contado", () => {
    expect(conteoDelTraslado(enviados, [{ varianteId: "x", cantidadRecibida: 1 }])).toEqual({ contadas: 0, huboDiferencia: true });
  });
});

describe("«Nuevo traslado» dentro de Traslados (ADR-0242 D-4)", () => {
  it("la ruta nueva cuelga de Traslados: el menú la marca bajo Traslados (prefijo más largo)", () => {
    expect(RUTA_NUEVO_TRASLADO.startsWith("/inventario/traslados/")).toBe(true);
  });

  it("la redirección de /inventario/mover conserva cada parámetro de los enlaces de antes", () => {
    expect(urlNuevoTrasladoDesdeMover({})).toBe("/inventario/traslados/nuevo");
    expect(urlNuevoTrasladoDesdeMover({ lineas: "v1:2,v4:8" })).toBe("/inventario/traslados/nuevo?lineas=v1%3A2%2Cv4%3A8");
    // Producción: origen + líneas. Cambios y Análisis: origen + destino + variante + cantidad.
    expect(urlNuevoTrasladoDesdeMover({ origen: "taller-1", lineas: "v1:12" })).toBe("/inventario/traslados/nuevo?origen=taller-1&lineas=v1%3A12");
    expect(urlNuevoTrasladoDesdeMover({ origen: "aqp", destino: "tru", variante: "v1", cantidad: "2" })).toBe(
      "/inventario/traslados/nuevo?origen=aqp&destino=tru&variante=v1&cantidad=2"
    );
  });

  it("no inventa parámetros: los ausentes se omiten y los repetidos se conservan", () => {
    expect(consultaDeParametros({ a: undefined, b: "1" })).toBe("?b=1");
    expect(consultaDeParametros({ a: ["1", "2"] })).toBe("?a=1&a=2");
    expect(consultaDeParametros({ a: undefined })).toBe("");
  });

  it("los parámetros que llegan con caracteres especiales sobreviven al viaje (ida y vuelta)", () => {
    const url = urlNuevoTrasladoDesdeMover({ lineas: "a b:1&c=d" });
    expect(new URL(url, "http://x").searchParams.get("lineas")).toBe("a b:1&c=d");
  });

  it("«Volver» va a Existencias solo si vino de ahí Y esa persona ve Existencias; si no, a Traslados", () => {
    expect(volverDeNuevoTraslado("existencias", true)).toEqual({ href: "/inventario", a: "Existencias" });
    expect(volverDeNuevoTraslado("existencias", false)).toEqual({ href: "/inventario/traslados", a: "Traslados" });
    expect(volverDeNuevoTraslado(undefined, true)).toEqual({ href: "/inventario/traslados", a: "Traslados" });
  });

  it("«desde» no decide un destino libre: cualquier otro valor cae en Traslados", () => {
    for (const raro of ["https://otro.sitio", "/caja", "Existencias", "", "existencias "]) {
      expect(volverDeNuevoTraslado(raro, true)).toEqual({ href: "/inventario/traslados", a: "Traslados" });
    }
  });
});
