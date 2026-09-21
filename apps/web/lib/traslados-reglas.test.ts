import { describe, it, expect } from "vitest";
import {
  accionDeTraslado,
  coincideBusqueda,
  coincideDireccion,
  coincideFiltro,
  contarRequierenAccion,
  debioLlegar,
  diaHora,
  diaMes,
  direccionTraslado,
  diasDeDiferencia,
  enTexto,
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
  it("viene hacia mí y ya pasó la hora estimada: hay que confirmarlo", () => {
    expect(situacionTraslado(t2, comoEncargadoTru)).toBe("requiere_recepcion");
  });

  it("viene hacia mí y todavía está a tiempo: solo en camino, NO es una urgencia", () => {
    expect(situacionTraslado(t3, comoEncargadoTru)).toBe("en_camino_entrante");
  });

  it("justo en la hora estimada ya cuenta como «debió llegar»", () => {
    const enPunto = traslado({ fechaEstimadaLlegada: AHORA });
    expect(situacionTraslado(enPunto, comoEncargadoTru)).toBe("requiere_recepcion");
  });

  it("lo que salió de mi sede nunca me pide confirmar, ni siquiera atrasado", () => {
    const saliente = traslado({ ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    expect(situacionTraslado(saliente, comoEncargadoTru)).toBe("en_camino_saliente");
    expect(debioLlegar(saliente.fechaEstimadaLlegada, AHORA)).toBe(true);
  });

  it("si alguien ya empezó a registrar lo recibido, llegó: me toca terminarlo aunque falte para la hora estimada", () => {
    expect(situacionTraslado({ ...t3, confirmadoEn: "2026-09-18T18:00:00.000Z" }, comoEncargadoTru)).toBe("requiere_recepcion");
  });

  it("sin hora estimada no se puede prometer que viene normal: se muestra como pendiente", () => {
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

  it("solo recepciones y revisiones piden acción", () => {
    const acciones: SituacionTraslado[] = ["requiere_recepcion", "requiere_revision"];
    const todas: SituacionTraslado[] = ["requiere_recepcion", "requiere_revision", "en_camino_entrante", "en_camino_saliente", "con_diferencia", "cerrado"];
    expect(todas.filter(requiereAccion)).toEqual(acciones);
  });
});

describe("coincideFiltro", () => {
  it("«Con diferencia» incluye el que me toca revisar; «Acción hoy» también", () => {
    expect(coincideFiltro("requiere_revision", "con_diferencia")).toBe(true);
    expect(coincideFiltro("requiere_revision", "accion")).toBe(true);
    expect(coincideFiltro("con_diferencia", "accion")).toBe(false);
  });

  it("«En camino» junta lo entrante a tiempo y lo saliente; lo vencido que me toca NO", () => {
    expect(coincideFiltro("en_camino_entrante", "en_camino")).toBe(true);
    expect(coincideFiltro("en_camino_saliente", "en_camino")).toBe(true);
    expect(coincideFiltro("requiere_recepcion", "en_camino")).toBe(false);
  });

  it("«Por recibir hoy» (atajo de la tarjeta) filtra SOLO recepciones: la tarjeta cuenta solo recepciones", () => {
    expect(coincideFiltro("requiere_recepcion", "por_recibir")).toBe(true);
    expect(coincideFiltro("requiere_revision", "por_recibir")).toBe(false);
    expect(coincideFiltro("en_camino_entrante", "por_recibir")).toBe(false);
  });

  it("todos deja pasar todo; cerrados solo el historial", () => {
    expect(coincideFiltro("cerrado", "todos")).toBe(true);
    expect(coincideFiltro("cerrado", "cerrados")).toBe(true);
    expect(coincideFiltro("en_camino_entrante", "cerrados")).toBe(false);
  });
});

describe("resumirTraslados", () => {
  it("la pantalla de referencia: 1 por recibir, 1 en camino, 0 diferencias, 43 prendas en tránsito", () => {
    const r = resumirTraslados([t2, t3, t1], comoEncargadoTru);
    expect(r.porRecibir).toBe(1);
    expect(r.vienenEnCamino).toBe(1);
    expect(r.conDiferencia).toBe(0);
    expect(r.unidadesEnTransito).toBe(43); // 28 + 15; el completado no cuenta
    expect(r.abiertos).toBe(2);
    expect(r.requierenAccion).toBe(1);
    expect(r.porFiltro).toEqual({ todos: 3, accion: 1, en_camino: 1, con_diferencia: 0, cerrados: 1, por_recibir: 1 });
  });

  it("los salientes suman al filtro «En camino» y a las prendas en tránsito, pero no a «Vienen en camino»", () => {
    const saliente = traslado({ id: "s", numero: 4, unidadesEnviadas: 7, ubicacionOrigenId: TRU, ubicacionDestinoId: AQP, fechaEstimadaLlegada: "2026-09-19T21:15:00.000Z" });
    const r = resumirTraslados([t2, t3, saliente], comoEncargadoTru);
    expect(r.vienenEnCamino).toBe(1);
    expect(r.salientesEnCamino).toBe(1);
    expect(r.porFiltro.en_camino).toBe(2); // = vienenEnCamino + salientesEnCamino
    expect(r.unidadesEnTransito).toBe(50);
  });

  it("una diferencia cuenta como abierta (sus prendas siguen sin estar en el stock) y, si soy líder, como acción", () => {
    const dif = traslado({ id: "d", numero: 5, unidadesEnviadas: 12, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-18T18:10:00.000Z" });
    const lider = resumirTraslados([dif], comoEncargadoTru);
    expect(lider).toMatchObject({ conDiferencia: 1, porRevisar: 1, requierenAccion: 1, unidadesEnTransito: 12, abiertos: 1 });
    const colaborador = resumirTraslados([dif], comoColaboradorTru);
    expect(colaborador).toMatchObject({ conDiferencia: 1, porRevisar: 0, requierenAccion: 0, unidadesEnTransito: 12 });
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
  it("cuenta lo que me toca, no todos los traslados que existen", () => {
    expect(contarRequierenAccion([t2, t3, t1], comoEncargadoTru)).toBe(1);
  });

  it("cero cuando solo hay traslados que vienen a tiempo o ya cerrados: no debe haber contador", () => {
    expect(contarRequierenAccion([t3, t1], comoEncargadoTru)).toBe(0);
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
    expect(masUrgente([t3, t1], comoEncargadoTru)).toBeNull();
    expect(masUrgente([], comoEncargadoTru)).toBeNull();
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
  it("el que ya debió llegar y me toca: urgente, con «hace 1 h»", () => {
    expect(textoLlegada(t2, "requiere_recepcion", AHORA)).toEqual({ principal: "Debió llegar hoy 12:12", secundario: "hace 1 h", tono: "urgente" });
  });

  it("el que viene a tiempo: «Llega mañana 16:15» con su fecha corta, sin drama", () => {
    expect(textoLlegada(t3, "en_camino_entrante", AHORA)).toEqual({ principal: "Llega mañana 16:15", secundario: "19/9", tono: "normal" });
  });

  it("el que llega hoy más tarde dice cuánto falta", () => {
    const hoyMasTarde = traslado({ fechaEstimadaLlegada: "2026-09-18T21:00:00.000Z" });
    expect(textoLlegada(hoyMasTarde, "en_camino_entrante", AHORA)).toEqual({ principal: "Llega hoy 16:00", secundario: "en 2 h 32 min", tono: "normal" });
  });

  it("el que llega en 3 días dice la fecha y cuántos días", () => {
    const lejos = traslado({ fechaEstimadaLlegada: "2026-09-21T21:15:00.000Z" });
    expect(textoLlegada(lejos, "en_camino_entrante", AHORA)).toEqual({ principal: "Llega 21 sep · 16:15", secundario: "en 3 días", tono: "normal" });
  });

  it("lo saliente que se pasó de hora: aviso (ámbar), no urgencia mía", () => {
    const saliente = traslado({ ubicacionOrigenId: TRU, ubicacionDestinoId: AQP });
    expect(textoLlegada(saliente, "en_camino_saliente", AHORA)).toEqual({ principal: "Debió llegar hoy 12:12", secundario: "hace 1 h", tono: "aviso" });
  });

  it("recepción empezada antes de la hora estimada", () => {
    const empezada = { ...t3, confirmadoEn: "2026-09-18T18:10:00.000Z" };
    expect(textoLlegada(empezada, "requiere_recepcion", AHORA)).toEqual({ principal: "Recepción iniciada hoy 13:10", secundario: "hace 18 min", tono: "urgente" });
  });

  it("con diferencia habla de cuándo se recibió, NO de cuándo «debía llegar»", () => {
    const dif = traslado({ estado: "recibido_con_diferencia", confirmadoEn: "2026-09-18T18:10:00.000Z" });
    expect(textoLlegada(dif, "requiere_revision", AHORA)).toEqual({ principal: "Recibido hoy 13:10", secundario: "hace 18 min", tono: "aviso" });
    expect(textoLlegada(dif, "con_diferencia", AHORA).principal).toBe("Recibido hoy 13:10");
  });

  it("el terminado dice «Completado» con su fecha", () => {
    expect(textoLlegada(t1, "cerrado", AHORA)).toEqual({ principal: "Completado 16/9", secundario: null, tono: "hecho" });
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

  it("solo confirmar y revisar llevan el botón fuerte", () => {
    expect(accionDeTraslado("requiere_recepcion")).toEqual({ texto: "Confirmar recepción", principal: true });
    expect(accionDeTraslado("requiere_revision")).toEqual({ texto: "Revisar diferencia", principal: true });
    expect(accionDeTraslado("en_camino_entrante")).toEqual({ texto: "Ver detalle", principal: false });
    expect(accionDeTraslado("con_diferencia")).toEqual({ texto: "Ver detalle", principal: false });
    expect(accionDeTraslado("cerrado")).toEqual({ texto: "Ver detalle", principal: false });
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
  it("lo que me toca primero (lo más viejo arriba), luego diferencias ajenas, lo que viaja por hora de llegada y el historial al final", () => {
    const vencidoViejo = traslado({ id: "viejo", numero: 8, creadoEn: "2026-09-15T15:00:00.000Z", fechaEstimadaLlegada: "2026-09-16T15:00:00.000Z" });
    const vencidoHoy = traslado({ id: "hoy", numero: 9 }); // 12:12 de hoy
    const conDiferenciaAjena = traslado({ id: "dif", numero: 7, estado: "recibido_con_diferencia", confirmadoEn: "2026-09-17T15:00:00.000Z" });
    const viajaHoyMasTarde = traslado({ id: "tarde", numero: 6, fechaEstimadaLlegada: "2026-09-18T21:00:00.000Z" });
    const viajaMañana = traslado({ id: "mañana", numero: 5, fechaEstimadaLlegada: "2026-09-19T21:15:00.000Z" });
    const cerradoViejo = traslado({ id: "c-viejo", numero: 1, estado: "cerrada", creadoEn: "2026-09-10T15:00:00.000Z" });
    const cerradoReciente = traslado({ id: "c-nuevo", numero: 2, estado: "cerrada", creadoEn: "2026-09-16T15:00:00.000Z" });
    const revuelto = [cerradoViejo, viajaMañana, vencidoHoy, conDiferenciaAjena, cerradoReciente, viajaHoyMasTarde, vencidoViejo];
    expect(ordenarTraslados(revuelto, comoColaboradorTru).map((t) => t.id)).toEqual(["viejo", "hoy", "dif", "tarde", "mañana", "c-nuevo", "c-viejo"]);
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
