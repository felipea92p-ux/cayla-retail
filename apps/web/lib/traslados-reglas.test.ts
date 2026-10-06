import { describe, it, expect } from "vitest";
import {
  consultaDeParametros,
  etiquetaDePrenda,
  MAX_PRENDAS_EN_MENSAJE,
  mensajeParaLaOtraSede,
  RUTA_NUEVO_TRASLADO,
  urlNuevoTrasladoDesdeMover,
  volverDeNuevoTraslado,
  esTrasladoVacio,
  separarVacios,
  coincideBusqueda,
  contarRequierenAccion,
  conteoDelTraslado,
  debioLlegar,
  diaHora,
  diaMes,
  diasDeDiferencia,
  enTexto,
  esTerminado,
  estaAtrasado,
  haceTexto,
  horaLima,
  ordenarTraslados,
  requiereAccion,
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

  it("coincide siempre con lo que le toca a quien mira, pase por pase (una sola regla: `requiereAccion`)", () => {
    const dif = traslado({ id: "d", numero: 5, estado: "recibido_con_diferencia" });
    const lista = [t2, t3, t1, dif];
    for (const c of [comoEncargadoTru, comoColaboradorTru]) {
      expect(contarRequierenAccion(lista, c)).toBe(lista.filter((t) => requiereAccion(situacionTraslado(t, c))).length);
    }
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

describe("horaLima", () => {
  it("horaLima escribe la hora de Lima en 24 h", () => {
    expect(horaLima(AHORA)).toBe("13:28");
    expect(horaLima("2026-09-19T05:05:00.000Z")).toBe("00:05");
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

describe("Después de enviar: la caja y el aviso a la otra sede (ADR-0242 D-3)", () => {
  const base = { numero: 12, origen: "Tienda Lima", destino: "Tienda Trujillo", enlace: "https://erp.example/inventario/traslados/abc" };

  it("la prenda se lee como en el combo: referencia · talla · color, saltando lo que no tiene", () => {
    expect(etiquetaDePrenda({ referencia: "Falda Renata", talla: "L", color: "Beige" })).toBe("Falda Renata · L · Beige");
    expect(etiquetaDePrenda({ referencia: "Chalina", talla: null, color: "Topo" })).toBe("Chalina · Topo");
    expect(etiquetaDePrenda({ referencia: "Bolso", talla: null, color: null })).toBe("Bolso");
  });

  it("el mensaje nombra el traslado, las dos sedes, el enlace y qué va", () => {
    const m = mensajeParaLaOtraSede({ ...base, prendas: ["Falda Renata · L · Beige", "Blusa Valentina · S · Blanco"] });
    expect(m).toContain("Traslado 12");
    expect(m).toContain("Tienda Lima");
    expect(m).toContain("Tienda Trujillo");
    expect(m).toContain(base.enlace);
    expect(m).toContain("Lo que va: Falda Renata · L · Beige; Blusa Valentina · S · Blanco.");
  });

  it("NUNCA dice cuántas prendas van: la única cifra es el número del traslado (conteo a ciegas, D-130)", () => {
    const m = mensajeParaLaOtraSede({ ...base, prendas: ["Falda Renata · L · Beige", "Blusa Valentina · S · Blanco"] });
    expect(m.match(/\d+/g)).toEqual(["12"]);
    expect(m).not.toMatch(/×|\bx\d|unidades|prendas\b/i);
  });

  it("pasado el tope no nombra el resto ni dice cuántas son: «y otras más»", () => {
    const prendas = Array.from({ length: MAX_PRENDAS_EN_MENSAJE + 3 }, (_, i) => `Prenda${String.fromCharCode(65 + i)}`);
    const m = mensajeParaLaOtraSede({ ...base, prendas });
    expect(m).toContain(`Lo que va: ${prendas.slice(0, MAX_PRENDAS_EN_MENSAJE).join("; ")} y otras más.`);
    expect(m).not.toContain(prendas[MAX_PRENDAS_EN_MENSAJE]!);
    expect(m.match(/\d+/g)).toEqual(["12"]);
  });

  it("justo en el tope nombra todas y no dice «y otras más»", () => {
    const prendas = Array.from({ length: MAX_PRENDAS_EN_MENSAJE }, (_, i) => `Prenda${String.fromCharCode(65 + i)}`);
    expect(mensajeParaLaOtraSede({ ...base, prendas })).not.toContain("otras más");
  });

  it("si no se pudo leer el número, igual sirve: dice «un traslado» y el enlace lleva al detalle", () => {
    const m = mensajeParaLaOtraSede({ ...base, numero: null, prendas: ["Falda Renata · L · Beige"] });
    expect(m).toContain("Salió un traslado de Tienda Lima");
    expect(m).toContain(base.enlace);
    expect(m.match(/\d+/g)).toBeNull();
  });

  it("sin prendas no inventa la línea «Lo que va»", () => {
    expect(mensajeParaLaOtraSede({ ...base, prendas: [] })).not.toContain("Lo que va");
  });
});
