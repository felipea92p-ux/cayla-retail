import { describe, expect, it } from "vitest";
import {
  avisoDeExito,
  bloqueDeDecision,
  diaCorto,
  diaYNumero,
  filaDeDecision,
  notaDelMes,
  opcionesDeDecision,
  queHizoQuien,
  queSeHizo,
  resumenCorto,
  textoErrorDecision,
  textoResultado,
  textoTrasladoElegible,
  trasladosDeLaPrenda,
} from "./frescura-decisiones-pantalla";
import type { DecisionDePrenda, LineaDecision, Resultado, ResumenDecisiones, TrasladoReciente } from "./frescura-decisiones-reglas";

// Las palabras de «Ya decidí» (ADR-0208, paso 4b). Las lee una encargada de tienda, sola, sin que nadie le explique: se
// prueba que no haya jerga, que un error diga qué hacer, y que nada acuse a nadie.

const lima = (s: string) => `${s}-05:00`;
const AHORA = lima("2026-10-02T16:00:00"); // viernes 2 de octubre de 2026
const CAT = "Camisas y Blusas";
const SEDE = "Tienda Trujillo";

const resultado = (p: Partial<Resultado> = {}): Resultado => ({
  veredicto: "sirvio",
  desde: lima("2026-09-29T14:00:00"),
  hasta: lima("2026-10-06T00:00:00"),
  enCurso: false,
  cortadaPor: null,
  suyas: 2,
  esperadas: 0.47,
  ventasDelControl: 3,
  prendasDeControl: 4,
  rebaje: null,
  enSede: null,
  ...p,
});

const linea = (p: Partial<LineaDecision> = {}): LineaDecision => ({
  id: "a",
  accion: "cambie_lugar",
  creadoEn: lima("2026-09-29T14:00:00"),
  persona: "Ana Quispe Rojas",
  nota: null,
  plazoDias: 7,
  traslado: null,
  vence: "2026-10-06T05:00:00.000Z",
  fin: null,
  finEl: null,
  resultado: null,
  ...p,
});

const decision = (actual: LineaDecision, vigente: boolean, historia: LineaDecision[] = []): DecisionDePrenda => ({ actual, vigente, historia });

/** Las cadenas de texto de un valor cualquiera (no sus claves ni sus null): lo único que la persona lee. */
function cadenas(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(cadenas);
  if (v !== null && typeof v === "object") return Object.values(v).flatMap(cadenas);
  return [];
}

/** Todo lo que estas funciones pueden escribir, para buscar jerga. */
function todoElTexto(): string {
  const partes: string[] = [];
  for (const v of ["sirvio", "no_alcanzo", "aun_no_se_sabe", "sin_control", "no_estuvo_colgada", "se_mide_en_destino", "aun_no_llega"] as const) {
    for (const enCurso of [false, true]) {
      for (const cortadaPor of [null, "llegada", "temporada", "otra_decision", "traslado_anulado"] as const) {
        const r = resultado({ veredicto: v, enCurso, cortadaPor, enSede: "Tienda Lima" });
        partes.push(textoResultado(r, linea(), CAT, SEDE));
        partes.push(textoResultado({ ...r, rebaje: { conLiquidacion: 0, deCampana: 2, sinDescuento: 1 } }, linea({ accion: "rebaje" }), CAT, SEDE));
      }
    }
  }
  for (const a of ["cambie_lugar", "hasta_agotar", "traslade", "rebaje", "anulacion"] as const) {
    partes.push(queSeHizo({ accion: a, traslado: null }), queHizoQuien({ accion: a, traslado: null, persona: "Ana Quispe" }));
    partes.push(...cadenas(filaDeDecision(decision(linea({ accion: a }), true), CAT, SEDE)));
    partes.push(...cadenas(bloqueDeDecision(decision(linea({ accion: a, resultado: resultado() }), false, [linea({ id: "b" })]), CAT, SEDE, AHORA)));
  }
  for (const hint of ["version_cambiada", "frescura_sin_permiso", "frescura_rebaja_solo_lider", "frescura_nada_colgado", "frescura_traslado_no_calza", "frescura_no_anulable", "frescura_token_reusado", "frescura_anterior_invalido", "frescura_producto_invalido", "frescura_nota_larga"]) {
    partes.push(textoErrorDecision({ hint, message: "" }, SEDE).texto);
  }
  for (const opcion of opcionesDeDecision({ almacenHoy: 0, categoriaNombre: CAT }, { sede: SEDE, esLider: false, ahora: AHORA, diasCompromiso: { dias: 15, sePuedeCalcular: false }, traslados: [], puedeVerTraslados: false, puedeVerExistencias: false }))
    partes.push(opcion.titulo, opcion.consecuencia, opcion.motivo ?? "");
  partes.push(...notaDelMes(RESUMEN, SEDE), resumenCorto(RESUMEN) ?? "");
  for (const a of ["cambie_lugar", "hasta_agotar", "traslade", "rebaje"] as const) {
    const av = avisoDeExito(a, "Blusa Wayra Negro", "2026-10-06T05:00:00.000Z");
    partes.push(av.titulo, av.detalle);
  }
  return partes.join("\n");
}

const RESUMEN: ResumenDecisiones = {
  cambie_lugar: { terminadas: 12, sirvieron: 7, noAlcanzaron: 3, aunNoSeSabe: 2, suyas: 5, esperadas: 2.1 },
  hasta_agotar: { terminadas: 0, sirvieron: 0, noAlcanzaron: 0, aunNoSeSabe: 0, suyas: 0, esperadas: 0 },
  traslade: { terminadas: 1, sirvieron: 0, noAlcanzaron: 1, aunNoSeSabe: 0, suyas: 0, esperadas: 1.6 },
  rebaje: { terminadas: 0, sirvieron: 0, noAlcanzaron: 0, aunNoSeSabe: 0, suyas: 0, esperadas: 0 },
};

// ---------------------------------------------------------------------------------------------------------------------
describe("nada de jerga ni de acusación en lo que ve la encargada", () => {
  it("ninguna frase lleva «plazo», «índice», «unidad·día», «evidencia», «percentil», «tramo», «vara», «P50» ni «≥»", () => {
    const t = todoElTexto();
    for (const prohibida of [/\bplazo/i, /índice/i, /unidad·d[ií]a/i, /evidencia/i, /percentil/i, /\btramo/i, /\bvara\b/i, /\bP50\b/, /≥/, /postgres/i, /constraint/i, /\bPT409\b/, /null/i]) {
      expect(t, String(prohibida)).not.toMatch(prohibida);
    }
  });

  it("«No alcanzó» dice cómo le fue a la PRENDA y no acusa a quien decidió: nada de «fallaste», «mal», «error»", () => {
    const t = todoElTexto();
    for (const acusa of [/fallaste/i, /te equivocaste/i, /\bmal\b/i, /culpa/i, /tu error/i]) expect(t, String(acusa)).not.toMatch(acusa);
  });

  it("lo que dice la fila no nombra a nadie: cualquiera que la lea entiende «Se cambió de lugar»", () => {
    expect(queSeHizo({ accion: "cambie_lugar", traslado: null })).toBe("Se cambió de lugar");
    expect(queSeHizo({ accion: "hasta_agotar", traslado: null })).toBe("Se deja hasta agotar");
    expect(queSeHizo({ accion: "rebaje", traslado: null })).toBe("Se rebajó");
    expect(queSeHizo({ accion: "traslade", traslado: { numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "completada", anulado: false, recibidoEn: null, unidades: 3 } })).toBe("Se trasladó a Tienda Lima");
  });

  it("en la hoja sí dice quién, con su primer nombre", () => {
    expect(queHizoQuien({ accion: "cambie_lugar", traslado: null, persona: "Ana Quispe Rojas" })).toBe("Ana la cambió de lugar");
    expect(queHizoQuien({ accion: "cambie_lugar", traslado: null, persona: null })).toBe("Alguien la cambió de lugar");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("fechas de Lima en palabras", () => {
  it("«martes 6», «mar 29»", () => {
    expect(diaYNumero("2026-10-06T05:00:00.000Z")).toBe("martes 6");
    expect(diaCorto(lima("2026-09-29T14:00:00"))).toBe("mar 29");
  });

  it("a las 23:30 de Lima (04:30 UTC del día siguiente) sigue siendo del día de Lima", () => {
    expect(diaYNumero("2026-10-07T04:30:00.000Z")).toBe("martes 6");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("la fila", () => {
  it("una decisión vigente: «Decidida» y cuándo se vuelve a mirar", () => {
    const f = filaDeDecision(decision(linea(), true), CAT, SEDE)!;
    expect(f).toEqual({ chip: { texto: "Decidida", tono: "pizarra" }, frase: "Se cambió de lugar · se revisa el martes 6", vigente: true });
  });

  it("nada anotado, o algo que se quitó, no cambia la fila", () => {
    expect(filaDeDecision(null, CAT, SEDE)).toBeNull();
    expect(filaDeDecision(decision(linea({ accion: "anulacion", vence: null, plazoDias: null }), false), CAT, SEDE)).toBeNull();
  });

  it("terminada y sirvió: chip verde y la frase no repite lo que ya dice el chip", () => {
    const d = decision(linea({ fin: "vencio", finEl: "2026-10-06T05:00:00.000Z", resultado: resultado() }), false);
    const f = filaDeDecision(d, CAT, SEDE)!;
    expect(f.chip).toEqual({ texto: "Sirvió", tono: "verde" });
    expect(f.vigente).toBe(false);
    // Una sola vez la palabra del veredicto: el chip dice «Sirvió»; la frase da la explicación con los números.
    expect(f.frase.match(/[Ss]irvió/g)?.length).toBe(1);
    expect(f.frase).toMatch(/^Se cambió de lugar el 29 set\. Sirvió: vendió 2 en 7 días; al ritmo de las demás prendas de Camisas y Blusas en Tienda Trujillo se esperaban 0\.5/);
  });

  it("terminada y NO alcanzó: chip ámbar (nunca rojo)", () => {
    const d = decision(linea({ fin: "vencio", finEl: "2026-10-06T05:00:00.000Z", resultado: resultado({ veredicto: "no_alcanzo", suyas: 0, esperadas: 1.6 }) }), false);
    const f = filaDeDecision(d, CAT, SEDE)!;
    expect(f.chip).toEqual({ texto: "No alcanzó", tono: "ambar" });
    expect(f.frase).toMatch(/no vendió ninguna en 7 días; al ritmo de las demás prendas de Camisas y Blusas en Tienda Trujillo se esperaban 1\.6/);
  });

  it("una prueba que sigue corriendo no afirma nada: «En prueba»", () => {
    const d = decision(linea({ resultado: resultado({ veredicto: "aun_no_se_sabe", enCurso: true }) }), true);
    const b = bloqueDeDecision(d, CAT, SEDE, AHORA);
    expect(b.resultado?.chip).toEqual({ texto: "En prueba", tono: "pizarra" });
  });

  it("volvió sin resultado que contar (llegó mercadería): dice por qué volvió", () => {
    const d = decision(linea({ accion: "hasta_agotar", fin: "llego_mercaderia", finEl: lima("2026-10-01T09:00:00"), resultado: resultado({ veredicto: "aun_no_se_sabe", cortadaPor: "llegada" }) }), false);
    const f = filaDeDecision(d, CAT, SEDE)!;
    expect(f.frase).toMatch(/^Se deja hasta agotar el 29 set\./);
    expect(f.frase).toMatch(/llegó mercadería/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("el resultado, en frases de tienda", () => {
  const l = linea();

  it("sirvió, no alcanzó y aún no se sabe: siempre con los números", () => {
    expect(textoResultado(resultado(), l, CAT, SEDE)).toBe("Sirvió: vendió 2 en 7 días; al ritmo de las demás prendas de Camisas y Blusas en Tienda Trujillo se esperaban 0.5.");
    expect(textoResultado(resultado({ veredicto: "no_alcanzo", suyas: 1, esperadas: 4.8 }), l, CAT, SEDE)).toBe("No alcanzó: vendió 1 en 7 días; al ritmo de las demás prendas de Camisas y Blusas en Tienda Trujillo se esperaban 4.8.");
    expect(textoResultado(resultado({ veredicto: "aun_no_se_sabe", suyas: 0, esperadas: 0.3 }), l, CAT, SEDE)).toBe(
      "Aún no se sabe: en esos 7 días casi no se vendieron prendas de Camisas y Blusas en Tienda Trujillo (se esperaban 0.3 para ella).",
    );
  });

  it("sin con qué compararla, o sin haber estado colgada: lo dice, no inventa un veredicto", () => {
    expect(textoResultado(resultado({ veredicto: "sin_control" }), l, CAT, SEDE)).toMatch(/no hubo otras prendas de Camisas y Blusas colgadas en Tienda Trujillo con qué compararla/);
    expect(textoResultado(resultado({ veredicto: "no_estuvo_colgada" }), l, CAT, SEDE)).toMatch(/No estuvo colgada esos días \(estaba apartada o en el almacén\): no hay qué medir/);
  });

  it("en curso: cuándo se cierra la prueba y cómo va", () => {
    const t = textoResultado(resultado({ enCurso: true, suyas: 1, esperadas: 0.2 }), l, CAT, SEDE);
    expect(t).toBe("En prueba hasta el martes 6 · va 1 vendida; al ritmo de las demás prendas de Camisas y Blusas se esperaban 0.2 hasta hoy.");
  });

  it("si la ventana se acortó, lo dice: llegó mercadería, o terminó su temporada", () => {
    expect(textoResultado(resultado({ cortadaPor: "llegada", hasta: lima("2026-10-03T09:00:00") }), l, CAT, SEDE)).toMatch(/Se midió en 4 días: el 3 oct llegó mercadería y lo que se decidió era sobre lo anterior\./);
    expect(textoResultado(resultado({ cortadaPor: "temporada", hasta: lima("2026-10-03T00:00:00") }), l, CAT, SEDE)).toMatch(/Se midió hasta el 3 oct, cuando terminó su temporada\./);
  });

  it("«La rebajé»: separa liquidación de campaña y pregunta si la caja sabe que está rebajada", () => {
    const r = resultado({ rebaje: { conLiquidacion: 0, deCampana: 2, sinDescuento: 1 } });
    const t = textoResultado(r, linea({ accion: "rebaje" }), CAT, SEDE);
    expect(t).toMatch(/De 3 vendidas desde que se rebajó: 0 con descuento de liquidación, 2 de campaña, 1 sin descuento\. ¿La caja sabe que está rebajada\?/);
    const conLiquidacion = textoResultado(resultado({ rebaje: { conLiquidacion: 2, deCampana: 0, sinDescuento: 0 } }), linea({ accion: "rebaje" }), CAT, SEDE);
    expect(conLiquidacion).not.toMatch(/¿La caja sabe/);
    expect(textoResultado(resultado({ rebaje: { conLiquidacion: 0, deCampana: 0, sinDescuento: 0 } }), linea({ accion: "rebaje" }), CAT, SEDE)).toMatch(/Desde que se rebajó no se vendió ninguna\./);
  });

  it("«La trasladé»: dónde se mide, y que todavía no llegó", () => {
    expect(textoResultado(resultado({ veredicto: "se_mide_en_destino", enSede: "Tienda Lima" }), linea({ accion: "traslade" }), CAT, SEDE)).toBe("El resultado se mide en Tienda Lima: lo ve el líder.");
    expect(textoResultado(resultado({ veredicto: "aun_no_llega", enSede: "Tienda Lima" }), linea({ accion: "traslade" }), CAT, SEDE)).toMatch(/Todavía no llega a Tienda Lima/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("la hoja de una prenda", () => {
  it("una decisión vigente: quién, cuándo, cuándo se revisa y «día 4 de 7»", () => {
    const b = bloqueDeDecision(decision(linea({ nota: "en la entrada" }), true), CAT, SEDE, AHORA);
    expect(b).toMatchObject({ estado: "vigente", titulo: "Ya decidido", linea: "Ana la cambió de lugar el martes 29", revisa: "Se revisa el martes 6", nota: "en la entrada", progreso: { dia: 4, de: 7 } });
  });

  it("el día no pasa de los días que dura, aunque el reloj vaya más adelante", () => {
    const b = bloqueDeDecision(decision(linea(), true), CAT, SEDE, lima("2026-10-20T10:00:00"));
    expect(b.progreso).toEqual({ dia: 7, de: 7 });
  });

  it("terminada: «Volvió a Por decidir» con el porqué", () => {
    const b = bloqueDeDecision(decision(linea({ fin: "vencio", finEl: "2026-10-06T05:00:00.000Z", resultado: resultado({ veredicto: "no_alcanzo" }) }), false), CAT, SEDE, lima("2026-10-07T10:00:00"));
    expect(b).toMatchObject({ estado: "volvio", titulo: "Volvió a «Por decidir»" });
    expect(b.linea).toMatch(/Se cumplieron los días/);
    expect(b.resultado?.chip).toEqual({ texto: "No alcanzó", tono: "ambar" });
  });

  it("lo que se quitó queda en el historial, no como decisión", () => {
    const anulacion = linea({ id: "b", accion: "anulacion", vence: null, plazoDias: null, persona: "Luis Ramos", creadoEn: lima("2026-09-30T10:00:00") });
    const b = bloqueDeDecision(decision(anulacion, false, [linea({ fin: "anulada", finEl: lima("2026-09-30T10:00:00") })]), CAT, SEDE, AHORA);
    expect(b.estado).toBe("ninguna");
    expect(b.historial.map((h) => h.texto)).toEqual(["Luis quitó lo anotado", "Ana la cambió de lugar · quitada"]);
  });

  it("el historial: la decisión cambiada dice que se cambió, y el que terminó trae su resultado", () => {
    const vieja = linea({ id: "v", fin: "cambiada", finEl: lima("2026-10-01T10:00:00"), resultado: resultado({ veredicto: "aun_no_se_sabe" }) });
    const previa = linea({ id: "p", creadoEn: lima("2026-09-10T10:00:00"), fin: "vencio", finEl: lima("2026-09-17T05:00:00"), resultado: resultado() });
    const b = bloqueDeDecision(decision(linea({ id: "n", accion: "hasta_agotar", plazoDias: 15, vence: "2026-10-17T05:00:00.000Z", creadoEn: lima("2026-10-01T10:00:00") }), true, [vieja, previa]), CAT, SEDE, AHORA);
    expect(b.historial[0]).toMatchObject({ texto: "Ana la cambió de lugar · cambiada después" });
    expect(b.historial[1].resultado).toMatch(/^Sirvió: vendió 2/);
  });

  it("sin nada anotado, no hay bloque", () => {
    expect(bloqueDeDecision(null, CAT, SEDE, AHORA)).toMatchObject({ estado: "ninguna", historial: [] });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("el formulario: cada opción dice qué pasa, y la que no aplica dice qué hacer", () => {
  const traslado = (over: Partial<TrasladoReciente> = {}): TrasladoReciente & { unidades: number } => ({
    id: "t1", numero: 5, destinoId: "d", destino: "Tienda Lima", estado: "en_transito", creadoEn: lima("2026-10-01T10:00:00"), prendas: [{ productoId: "prod-1", colorCodigo: "NEG", unidades: 3 }], unidades: 3, ...over,
  });
  const base = { sede: SEDE, esLider: true, ahora: AHORA, diasCompromiso: { dias: 15, sePuedeCalcular: true }, traslados: [], puedeVerTraslados: true, puedeVerExistencias: true };
  const porClave = (o: ReturnType<typeof opcionesDeDecision>) => Object.fromEntries(o.map((x) => [x.clave, x]));

  it("las cinco opciones, en orden", () => {
    const o = opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, base);
    expect(o.map((x) => x.clave)).toEqual(["cambie_lugar", "hasta_agotar", "traslade", "rebaje", "sacar"]);
    expect(o.map((x) => x.titulo)).toEqual(["La cambié de lugar", "La dejo hasta agotar", "La trasladé a otra tienda", "La rebajé", "La saqué del piso"]);
  });

  it("cada consecuencia dice la fecha en que se vuelve a mirar", () => {
    const o = porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, base));
    expect(o.cambie_lugar.consecuencia).toBe("La miro 7 días desde hoy. El viernes 9 te digo si se vendió mejor que las demás prendas de Camisas y Blusas en Tienda Trujillo.");
    expect(o.hasta_agotar.consecuencia).toMatch(/hasta el sábado 17 \(15 días, lo que tardan en venderse la mitad de las prendas de Camisas y Blusas en Tienda Trujillo\)/);
  });

  it("si el número de días no sale de una comparación, lo dice en vez de esconderlo", () => {
    const o = porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, { ...base, diasCompromiso: { dias: 15, sePuedeCalcular: false } }));
    expect(o.hasta_agotar.consecuencia).toMatch(/15 días: todavía no hay ventas suficientes para calcular otro número de días/);
  });

  it("«La trasladé» sin ningún traslado: se ve, no se elige, y dice qué hacer", () => {
    const o = porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, base));
    expect(o.traslade).toMatchObject({ deshabilitada: true, motivo: "Armar el traslado" });
    expect(o.traslade.consecuencia).toMatch(/^Primero arma el traslado: sale del almacén de Tienda Trujillo\./);
    const sinPermiso = porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, { ...base, puedeVerTraslados: false }));
    expect(sinPermiso.traslade.motivo).toMatch(/Pídeselo a quien arma los traslados/);
    const sinAlmacen = porClave(opcionesDeDecision({ almacenHoy: 0, categoriaNombre: CAT }, base));
    expect(sinAlmacen.traslade.consecuencia).toMatch(/hoy no hay nada de esta prenda en el almacén/);
  });

  it("con un traslado reciente, se elige y se mide en la otra tienda", () => {
    const o = porClave(opcionesDeDecision({ almacenHoy: 0, categoriaNombre: CAT }, { ...base, traslados: [traslado()] }));
    expect(o.traslade.deshabilitada).toBe(false);
    expect(o.traslade.consecuencia).toBe("La miro 14 días aquí. Su resultado se mide en la otra tienda, 7 días desde que llegue.");
  });

  it("«La rebajé» solo la anota el líder; los demás leen quién la decide y qué hacer si la sacaron", () => {
    const o = porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, { ...base, esLider: false }));
    expect(o.rebaje).toMatchObject({ deshabilitada: true, consecuencia: "La rebaja la decide el líder.", motivo: "La rebaja la decide el líder. Si la sacaste del piso, elige «La saqué del piso»." });
    expect(porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, base)).rebaje.deshabilitada).toBe(false);
  });

  it("«La saqué del piso» no anota nada: manda a Existencias, o pide que lo haga quien la ve", () => {
    const con = porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, base)).sacar;
    expect(con.consecuencia).toMatch(/Se retira desde Existencias .* sale sola de «Por decidir»/);
    expect(porClave(opcionesDeDecision({ almacenHoy: 2, categoriaNombre: CAT }, { ...base, puedeVerExistencias: false })).sacar.consecuencia).toMatch(/Pídele a quien ve Existencias/);
  });

  it("los traslados de la sede que llevan ESTA prenda, con sus unidades", () => {
    const t = traslado();
    const otro = traslado({ id: "t2", numero: 6, prendas: [{ productoId: "prod-2", colorCodigo: "NEG", unidades: 9 }] });
    const mismoModeloOtroColor = traslado({ id: "t3", numero: 7, prendas: [{ productoId: "prod-1", colorCodigo: "AZU", unidades: 9 }] });
    const r = trasladosDeLaPrenda([t, otro, mismoModeloOtroColor], "prod-1", "NEG");
    expect(r.map((x) => [x.id, x.unidades])).toEqual([["t1", 3]]);
    expect(trasladosDeLaPrenda([{ ...t, prendas: [{ productoId: "prod-1", colorCodigo: null, unidades: 2 }] }], "prod-1", null).map((x) => x.unidades)).toEqual([2]);
  });

  it("cómo se nombra un traslado para elegirlo", () => {
    expect(textoTrasladoElegible(traslado(), AHORA)).toBe("Traslado nº 5 a Tienda Lima · hace 1 días · 3 de esta prenda".replace("hace 1 días", "ayer"));
    expect(textoTrasladoElegible(traslado({ creadoEn: AHORA }), AHORA)).toMatch(/· hoy ·/);
    expect(textoTrasladoElegible(traslado({ creadoEn: lima("2026-09-29T10:00:00") }), AHORA)).toMatch(/· hace 3 días ·/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("los errores, sin jerga de Postgres", () => {
  const e = (hint: string, message = "") => textoErrorDecision({ hint, message }, SEDE);

  it("otra persona anotó primero: el texto de la base (con quién y cuándo), un «Ver» y una marca nueva", () => {
    const t = e("version_cambiada", "Otra persona acaba de anotar una decisión sobre esta prenda («La dejo hasta agotar», Luis, el 29/09 a las 14:05). Mírala antes de anotar la tuya.");
    expect(t).toMatchObject({ conVer: true, nuevaMarca: true });
    expect(t.texto).toMatch(/^Otra persona acaba de anotar una decisión sobre esta prenda \(«La dejo hasta agotar», Luis, el 29\/09 a las 14:05\)/);
  });

  it("cada pista dice qué pasó y qué hacer, con las palabras del diseño", () => {
    expect(e("frescura_sin_permiso").texto).toBe("Para anotar decisiones de Tienda Trujillo hace falta el módulo «Frescura del piso» en tu rol y que sea una tienda que operas.");
    expect(e("frescura_rebaja_solo_lider").texto).toBe("La rebaja la decide el líder. Si la sacaste del piso, elige «La saqué del piso».");
    expect(e("frescura_nada_colgado").texto).toBe("Esta prenda ya no tiene nada colgado en Tienda Trujillo: sale sola de «Por decidir». No hace falta anotar nada.");
    expect(e("frescura_traslado_no_calza").texto).toBe("Ese traslado no lleva esta prenda desde Tienda Trujillo, se anuló o tiene más de 14 días. Elige otro o arma uno nuevo.");
    expect(e("frescura_no_anulable").texto).toBe("Eso ya está quitado.");
    expect(e("frescura_token_reusado").texto).toBe("Algo cambió mientras se guardaba. Elige de nuevo y vuelve a anotar.");
  });

  it("una respuesta incierta (un corte de red) conserva la marca: reintentar no anota dos veces", () => {
    const t = textoErrorDecision({ message: "Failed to fetch", code: "" }, SEDE);
    expect(t.texto).toBe("No se pudo anotar: revisa la conexión y vuelve a tocar «Anotar». No se va a anotar dos veces.");
    expect(t.nuevaMarca).toBe(false);
  });

  it("lo que la pantalla no reconoce sale en castellano, no en el texto crudo de la base", () => {
    const t = textoErrorDecision({ hint: "otra_cosa", message: "duplicate key value violates unique constraint" }, SEDE);
    expect(t.texto).not.toMatch(/violates|constraint|duplicate/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("lo que ya se decidió en la sede", () => {
  it("«Este mes en Tienda Trujillo: 12 cambios de lugar terminaron; juntas vendieron 5 cuando se esperaban 2.1»", () => {
    expect(notaDelMes(RESUMEN, SEDE)).toEqual(["Este mes en Tienda Trujillo: 12 cambios de lugar terminaron; juntas vendieron 5 cuando se esperaban 2.1 · 1 traslado terminó; juntas vendieron 0 cuando se esperaban 1.6."]);
  });

  it("nada terminado este mes: no hay nota", () => {
    expect(notaDelMes({ ...RESUMEN, cambie_lugar: { ...RESUMEN.cambie_lugar, terminadas: 0 }, traslade: { ...RESUMEN.traslade, terminadas: 0 } }, SEDE)).toEqual([]);
    expect(resumenCorto({ ...RESUMEN, cambie_lugar: { ...RESUMEN.cambie_lugar, terminadas: 0, sirvieron: 0, noAlcanzaron: 0, aunNoSeSabe: 0 }, traslade: { ...RESUMEN.traslade, terminadas: 0, noAlcanzaron: 0 } })).toBeNull();
  });

  it("para «Las N tiendas»: cuántas terminaron y cómo les fue", () => {
    expect(resumenCorto(RESUMEN)).toBe("13 terminaron · 7 sirvieron · 4 no alcanzaron · 2 aún no se sabe");
  });

  it("el aviso al anotar dice qué se anotó y cuándo se vuelve a mirar", () => {
    expect(avisoDeExito("cambie_lugar", "Blusa Wayra Negro", "2026-10-06T05:00:00.000Z")).toEqual({
      titulo: "Anotado: se cambió de lugar",
      detalle: "Blusa Wayra Negro sale de «Por decidir» hasta el martes 6. Ese día te digo si sirvió.",
    });
    expect(avisoDeExito("hasta_agotar", "Blusa", "2026-10-17T05:00:00.000Z").titulo).toBe("Anotado: se deja hasta agotar");
  });
});
