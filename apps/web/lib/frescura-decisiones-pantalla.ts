import type { TonoChip } from "@/components/ui/Chip";
import { esFalloDeRed, esRespuestaIncierta, traducirError } from "./error-escritura";
import {
  ACCIONES_DECISION,
  PLAZO_CAMBIE_LUGAR_DIAS,
  PLAZO_TRASLADO_DIAS,
  finDePlazo,
  type AccionDecision,
  type AccionRenglon,
  type DecisionDePrenda,
  type FinDecision,
  type LineaDecision,
  type Resultado,
  type ResumenDecisiones,
  type TrasladoReciente,
  type Veredicto,
} from "./frescura-decisiones-reglas";
import { decimal, fechaCorta, textoDias } from "./frescura-pantalla";
import type { FrescuraPrenda } from "./frescura-reglas";

// Frescura del piso, paso 4b (ADR-0208): LO QUE DICE LA PANTALLA de «Ya decidí». Las reglas ya decidieron qué terminó y cómo le
// fue (`frescura-decisiones-reglas.ts`); aquí se convierte en palabras. Lógica pura, probada en `frescura-decisiones-pantalla.test.ts`.
//
// Para una persona sin formación técnica, sola, sin que nadie le explique: nunca ve «plazo», «índice», «unidad·día», «evidencia»
// ni «P50»; ve fechas («el martes 6»), «se vendió mejor o peor que las demás» y las unidades vendidas contra las esperadas.
// Una frase que no tiene con qué medir lo dice y dice por qué, en vez de un veredicto inventado. Nada de esto es un error de
// quien decidió: «No alcanzó» no acusa a nadie, dice cómo le fue a la prenda. Nunca rojo (ADR-0169, colores A).

// ---------------------------------------------------------------------------
// Fechas de Lima en palabras
// ---------------------------------------------------------------------------

const MS_LIMA = 5 * 3_600_000;
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «martes 6»: el día de la semana y el número, en hora de Lima. */
export function diaYNumero(iso: string): string {
  const d = new Date(Date.parse(iso) - MS_LIMA);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** «mar 29»: lo mismo, corto, para un historial. */
export function diaCorto(iso: string): string {
  const d = new Date(Date.parse(iso) - MS_LIMA);
  return `${DIAS_SEMANA[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}`;
}

/** Días de calendario de Lima entre dos instantes (0 = el mismo día). */
function diasDeLimaEntre(desde: string, hasta: string): number {
  const dia = (iso: string) => Math.floor((Date.parse(iso) - MS_LIMA) / 86_400_000);
  return dia(hasta) - dia(desde);
}

const primerNombre = (nombre: string | null): string => (nombre ?? "").trim().split(/\s+/)[0] || "Alguien";

// ---------------------------------------------------------------------------
// Qué se hizo, en palabras
// ---------------------------------------------------------------------------

/** El texto de cada opción del formulario («La cambié de lugar»). */
export const NOMBRE_OPCION: Record<AccionDecision | "sacar", string> = {
  cambie_lugar: "La cambié de lugar",
  hasta_agotar: "La dejo hasta agotar",
  traslade: "La trasladé a otra tienda",
  rebaje: "La rebajé",
  sacar: "La saqué del piso",
};

/** Lo que se hizo, sin decir quién (la fila lo lee cualquiera): «Se cambió de lugar». */
export function queSeHizo(l: Pick<LineaDecision, "accion" | "traslado">): string {
  switch (l.accion) {
    case "cambie_lugar":
      return "Se cambió de lugar";
    case "hasta_agotar":
      return "Se deja hasta agotar";
    case "traslade":
      return `Se trasladó a ${l.traslado?.destino ?? "otra tienda"}`;
    case "rebaje":
      return "Se rebajó";
    case "anulacion":
      return "Se quitó lo anotado";
  }
}

/** Lo mismo, en la hoja, con quién: «Ana la cambió de lugar». */
export function queHizoQuien(l: Pick<LineaDecision, "accion" | "traslado" | "persona">): string {
  const quien = primerNombre(l.persona);
  switch (l.accion) {
    case "cambie_lugar":
      return `${quien} la cambió de lugar`;
    case "hasta_agotar":
      return `${quien} la dejó hasta agotar`;
    case "traslade":
      return `${quien} la trasladó a ${l.traslado?.destino ?? "otra tienda"}`;
    case "rebaje":
      return `${quien} la rebajó`;
    case "anulacion":
      return `${quien} quitó lo anotado`;
  }
}

const POR_QUE_VOLVIO: Record<FinDecision, string> = {
  vencio: "Se cumplieron los días",
  llego_mercaderia: "Llegó mercadería de esta prenda: lo que se decidió era sobre lo que había antes",
  termino_temporada: "Terminó su temporada",
  traslado_anulado: "Se anuló el traslado",
  anulada: "Se quitó lo anotado",
  cambiada: "Se anotó otra decisión",
};

// ---------------------------------------------------------------------------
// El resultado
// ---------------------------------------------------------------------------

/** Una prueba que sigue corriendo no afirma nada todavía: «En prueba». */
const CHIP_EN_CURSO = { texto: "En prueba", tono: "pizarra" as TonoChip };
const chipDe = (r: Resultado | null): { texto: string; tono: TonoChip } | null => (r === null ? null : r.enCurso ? CHIP_EN_CURSO : (CHIP_DEL_VEREDICTO[r.veredicto] ?? null));

const CHIP_DEL_VEREDICTO: Partial<Record<Veredicto, { texto: string; tono: TonoChip }>> = {
  sirvio: { texto: "Sirvió", tono: "verde" },
  // Nunca rojo: no es un error de nadie, es cómo le fue a la prenda.
  no_alcanzo: { texto: "No alcanzó", tono: "ambar" },
  aun_no_se_sabe: { texto: "Aún no se sabe", tono: "pizarra" },
  sin_control: { texto: "Sin con qué compararla", tono: "pizarra" },
  no_estuvo_colgada: { texto: "No estuvo colgada", tono: "pizarra" },
};

const unidades = (n: number) => `${decimal(n)} ${n === 1 ? "vendida" : "vendidas"}`;
const seEsperaban = (esperadas: number) => (decimal(esperadas) === "1" ? `se esperaba ${decimal(esperadas)}` : `se esperaban ${decimal(esperadas)}`);

/**
 * El lapso realmente medido, en días de CALENDARIO de Lima (mínimo 1): una prueba de 7 días decidida el martes a las 14:00 corre
 * hasta las 00:00 del martes siguiente, que son 6.4 días de reloj pero 7 días para quien la anotó.
 */
function diasMedidos(r: Pick<Resultado, "desde" | "hasta">): number {
  return Math.max(1, diasDeLimaEntre(r.desde, r.hasta));
}

const NOTA_CORTE: Record<NonNullable<Resultado["cortadaPor"]>, (r: Resultado) => string> = {
  llegada: (r) => ` Se midió en ${textoDias(diasMedidos(r))}: el ${fechaCorta(r.hasta)} llegó mercadería y lo que se decidió era sobre lo anterior.`,
  temporada: (r) => ` Se midió hasta el ${fechaCorta(r.hasta)}, cuando terminó su temporada.`,
  otra_decision: () => "",
  traslado_anulado: () => " El traslado se anuló.",
  // ADR-0328: desde el cuadre, el sistema cuenta las prendas colgadas que antes no veía; comparar antes y después engañaría.
  cuadre: (r) => ` Se midió hasta el ${fechaCorta(r.hasta)}, cuando se cuadró el piso de la tienda: desde ahí el sistema cuenta otras prendas colgadas.`,
};

/** El desglose de «La rebajé»: una campaña no es una liquidación. */
function textoRebaje(r: Resultado): string {
  if (r.rebaje === null) return "";
  const { conLiquidacion, deCampana, sinDescuento } = r.rebaje;
  const total = conLiquidacion + deCampana + sinDescuento;
  if (total <= 0) return " Desde que se rebajó no se vendió ninguna.";
  const partes = [`${decimal(conLiquidacion)} con descuento de liquidación`, `${decimal(deCampana)} de campaña`, `${decimal(sinDescuento)} sin descuento`];
  const aviso = conLiquidacion === 0 ? " ¿La caja sabe que está rebajada?" : "";
  return ` De ${decimal(total)} vendidas desde que se rebajó: ${partes.join(", ")}.${aviso}`;
}

/**
 * La frase del resultado de una línea. Siempre con los números (vendidas contra esperadas); la palabra («sirvió», «no
 * alcanzó») solo cuando hay con qué afirmarla. `categoria`: cómo se llama su categoría; `sede`: la tienda donde se midió.
 */
export function textoResultado(r: Resultado, l: Pick<LineaDecision, "accion" | "vence">, categoria: string, sede: string): string {
  const demas = `las demás prendas de ${categoria}`;
  const dias = textoDias(diasMedidos(r));
  if (r.veredicto === "aun_no_llega") return `Todavía no llega a ${r.enSede ?? "la otra tienda"}: el resultado se mide desde que entre a su stock.`;
  if (r.veredicto === "se_mide_en_destino") return `El resultado se mide en ${r.enSede ?? "la otra tienda"}: lo ve el líder.`;
  const corte = r.cortadaPor ? NOTA_CORTE[r.cortadaPor](r) : "";
  const rebaje = textoRebaje(r);
  if (r.enCurso) {
    const hasta = l.vence ? `En prueba hasta el ${diaYNumero(l.vence)} · ` : "En prueba · ";
    return `${hasta}va ${unidades(r.suyas)}; al ritmo de ${demas} ${seEsperaban(r.esperadas)} hasta hoy.${rebaje}`;
  }
  switch (r.veredicto) {
    case "sirvio":
      return `Sirvió: vendió ${decimal(r.suyas)} en ${dias}; al ritmo de ${demas} en ${sede} ${seEsperaban(r.esperadas)}.${corte}${rebaje}`;
    case "no_alcanzo":
      return `No alcanzó: ${r.suyas === 0 ? "no vendió ninguna" : `vendió ${decimal(r.suyas)}`} en ${dias}; al ritmo de ${demas} en ${sede} ${seEsperaban(r.esperadas)}.${corte}${rebaje}`;
    case "aun_no_se_sabe":
      return `Aún no se sabe: en esos ${dias} casi no se vendieron prendas de ${categoria} en ${sede} (${seEsperaban(r.esperadas)} para ella).${corte}${rebaje}`;
    case "sin_control":
      return `En esos ${dias} no hubo otras prendas de ${categoria} colgadas en ${sede} con qué compararla.${corte}${rebaje}`;
    case "no_estuvo_colgada":
      return `No estuvo colgada esos días (estaba apartada o en el almacén): no hay qué medir.${corte}${rebaje}`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// La fila
// ---------------------------------------------------------------------------

export type FilaDeDecision = { chip: { texto: string; tono: TonoChip }; frase: string; vigente: boolean };

/**
 * Lo que la fila dice de lo decidido. Vigente: «Decidida» + qué se hizo y cuándo se revisa. Terminada con resultado: cómo le
 * fue. Anulada o sin nada: nada (la fila vuelve a ser la de antes).
 */
export function filaDeDecision(d: DecisionDePrenda | null, categoria: string, sede: string): FilaDeDecision | null {
  if (d === null || d.actual.accion === "anulacion") return null;
  const a = d.actual;
  if (d.vigente) {
    const revisa = a.vence ? ` · se revisa el ${diaYNumero(a.vence)}` : "";
    return { chip: { texto: "Decidida", tono: "pizarra" }, frase: `${queSeHizo(a)}${revisa}`, vigente: true };
  }
  const chip = chipDe(a.resultado) ?? undefined;
  const res = a.resultado && !a.resultado.enCurso ? textoResultado(a.resultado, a, categoria, sede) : "";
  // El chip ya dice la palabra del veredicto («Sirvió»): la frase dice QUÉ se hizo y CUÁNDO, y después la explicación con los
  // números; sin resultado que contar, por qué volvió. Nunca el mismo dato dos veces.
  const explicacion = res || (a.fin ? `${POR_QUE_VOLVIO[a.fin]}.` : "");
  return { chip: chip ?? { texto: "Volvió", tono: "pizarra" }, frase: `${queSeHizo(a)} el ${fechaCorta(a.creadoEn)}. ${explicacion}`.trim(), vigente: false };
}

// ---------------------------------------------------------------------------
// La hoja
// ---------------------------------------------------------------------------

export type LineaDeHistorial = { id: string; cuando: string; texto: string; resultado: string | null; chip: { texto: string; tono: TonoChip } | null };

export type BloqueDeDecision = {
  /** vigente: la anotada; volvio: terminó y sigue quieta; ninguna: nada anotado (o se quitó). */
  estado: "vigente" | "volvio" | "ninguna";
  titulo: string;
  linea: string;
  revisa: string | null;
  progreso: { dia: number; de: number } | null;
  nota: string | null;
  resultado: { texto: string; chip: { texto: string; tono: TonoChip } | null } | null;
  historial: LineaDeHistorial[];
};

/** Cuántas líneas de historial se muestran en la hoja: «Lo que se decidió» (120 días). */
export function bloqueDeDecision(d: DecisionDePrenda | null, categoria: string, sede: string, ahora: string): BloqueDeDecision {
  const historial = (d?.historia ?? []).map((l): LineaDeHistorial => {
    const chip = chipDe(l.resultado);
    const texto = l.accion === "anulacion" ? `${queHizoQuien(l)}` : queHizoQuien(l);
    return {
      id: l.id,
      cuando: diaCorto(l.creadoEn),
      texto: l.fin === "anulada" && l.accion !== "anulacion" ? `${texto} · quitada` : l.fin === "cambiada" ? `${texto} · cambiada después` : texto,
      resultado: l.resultado && !l.resultado.enCurso && l.accion !== "anulacion" && l.fin !== "anulada" ? textoResultado(l.resultado, l, categoria, sede) : null,
      chip,
    };
  });
  const vacio = { estado: "ninguna" as const, titulo: "", linea: "", revisa: null, progreso: null, nota: null, resultado: null, historial };
  if (d === null) return vacio;
  const a = d.actual;
  if (a.accion === "anulacion") return { ...vacio, historial: [{ id: a.id, cuando: diaCorto(a.creadoEn), texto: queHizoQuien(a), resultado: null, chip: null }, ...historial] };
  const res = a.resultado ? { texto: textoResultado(a.resultado, a, categoria, sede), chip: chipDe(a.resultado) } : null;
  if (d.vigente) {
    const de = a.plazoDias ?? PLAZO_CAMBIE_LUGAR_DIAS;
    return {
      estado: "vigente",
      titulo: "Ya decidido",
      linea: `${queHizoQuien(a)} el ${diaYNumero(a.creadoEn)}`,
      revisa: a.vence ? `Se revisa el ${diaYNumero(a.vence)}` : null,
      progreso: { dia: Math.min(de, Math.max(1, diasDeLimaEntre(a.creadoEn, ahora) + 1)), de },
      nota: a.nota,
      resultado: res,
      historial,
    };
  }
  return {
    estado: "volvio",
    titulo: "Volvió a «Por decidir»",
    linea: `${queHizoQuien(a)} el ${diaYNumero(a.creadoEn)}. ${a.fin ? POR_QUE_VOLVIO[a.fin] : ""}`.trim(),
    revisa: null,
    progreso: null,
    nota: a.nota,
    resultado: res,
    historial,
  };
}

// ---------------------------------------------------------------------------
// El formulario «Ya decidí»
// ---------------------------------------------------------------------------

export type OpcionDeDecision = {
  clave: AccionDecision | "sacar";
  titulo: string;
  /** Lo que pasa si la eliges, en una frase de tienda. */
  consecuencia: string;
  /** Se ve pero no se elige: el motivo dice qué hacer. */
  deshabilitada: boolean;
  motivo: string | null;
};

/** Los traslados recientes de la sede que llevan ESTA prenda (los que «La trasladé» ofrece elegir). */
export function trasladosDeLaPrenda(recientes: readonly TrasladoReciente[], productoId: string, colorCodigo: string | null): (TrasladoReciente & { unidades: number })[] {
  return recientes
    .map((t) => ({ t, u: t.prendas.filter((x) => x.productoId === productoId && x.colorCodigo === colorCodigo).reduce((s, x) => s + x.unidades, 0) }))
    .filter(({ u }) => u > 0)
    .map(({ t, u }) => ({ ...t, unidades: u }));
}

/** «Traslado nº 5 a Tienda Lima · ayer · 3 de esta prenda». */
export function textoTrasladoElegible(t: TrasladoReciente & { unidades: number }, ahora: string): string {
  const d = diasDeLimaEntre(t.creadoEn, ahora);
  const cuando = d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
  return `Traslado nº ${t.numero} a ${t.destino} · ${cuando} · ${t.unidades} de esta prenda`;
}

/**
 * Las opciones de «¿Qué hiciste con esta prenda?». Cada una dice qué pasa si la eliges; la que no aplica se ve igual y dice qué
 * hacer, en vez de fallar al guardar (la persona sin contexto no debería toparse con un error por algo que el sistema ya sabía).
 */
export function opcionesDeDecision(p: Pick<FrescuraPrenda, "almacenHoy" | "categoriaNombre">, o: {
  sede: string;
  esLider: boolean;
  ahora: string;
  /** Cuántos días valdría «hasta agotar» y si esa cifra sale de una comparación sólida. */
  diasCompromiso: { dias: number; sePuedeCalcular: boolean };
  traslados: readonly (TrasladoReciente & { unidades: number })[];
  puedeVerTraslados: boolean;
  puedeVerExistencias: boolean;
}): OpcionDeDecision[] {
  const cat = `las demás prendas de ${p.categoriaNombre}`;
  const revisa = (dias: number) => diaYNumero(finDePlazo(o.ahora, dias));
  const compromiso = o.diasCompromiso.sePuedeCalcular
    ? `${textoDias(o.diasCompromiso.dias)}, lo que tardan en venderse la mitad de las prendas de ${p.categoriaNombre} en ${o.sede}`
    : `${textoDias(o.diasCompromiso.dias)}: todavía no hay ventas suficientes para calcular otro número de días`;
  const sinTraslado = o.traslados.length === 0;
  return [
    {
      clave: "cambie_lugar",
      titulo: NOMBRE_OPCION.cambie_lugar,
      consecuencia: `La miro ${textoDias(PLAZO_CAMBIE_LUGAR_DIAS)} desde hoy. El ${revisa(PLAZO_CAMBIE_LUGAR_DIAS)} te digo si se vendió mejor que ${cat} en ${o.sede}.`,
      deshabilitada: false,
      motivo: null,
    },
    {
      clave: "hasta_agotar",
      titulo: NOMBRE_OPCION.hasta_agotar,
      consecuencia: `No te la vuelvo a preguntar hasta el ${revisa(o.diasCompromiso.dias)} (${compromiso}). Si para entonces sigue sin venderse, vuelve.`,
      deshabilitada: false,
      motivo: null,
    },
    {
      clave: "traslade",
      titulo: NOMBRE_OPCION.traslade,
      consecuencia: sinTraslado
        ? `Primero arma el traslado: sale del almacén de ${o.sede}${p.almacenHoy > 0 ? "" : " (hoy no hay nada de esta prenda en el almacén)"}.`
        : `La miro ${textoDias(PLAZO_TRASLADO_DIAS)} aquí. Su resultado se mide en la otra tienda, ${textoDias(PLAZO_CAMBIE_LUGAR_DIAS)} desde que llegue.`,
      deshabilitada: sinTraslado,
      motivo: sinTraslado
        ? p.almacenHoy > 0 && o.puedeVerTraslados
          ? "Armar el traslado"
          : "Pídeselo a quien arma los traslados: sin un traslado registrado no se puede anotar."
        : null,
    },
    {
      clave: "rebaje",
      titulo: NOMBRE_OPCION.rebaje,
      consecuencia: o.esLider
        ? `Sigue colgada con un precio menor. La miro ${textoDias(o.diasCompromiso.dias)} y te digo cuánto vendió, separando lo de liquidación de lo de campaña.`
        : "La rebaja la decide el líder.",
      deshabilitada: !o.esLider,
      motivo: o.esLider ? null : "La rebaja la decide el líder. Si la sacaste del piso, elige «La saqué del piso».",
    },
    {
      clave: "sacar",
      titulo: NOMBRE_OPCION.sacar,
      consecuencia: o.puedeVerExistencias
        ? "Se retira desde Existencias (es un movimiento de stock) y la prenda sale sola de «Por decidir»."
        : "Pídele a quien ve Existencias que la retire: al retirarla, sale sola de «Por decidir».",
      deshabilitada: false,
      motivo: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Los errores, sin jerga de Postgres
// ---------------------------------------------------------------------------

type ErrorRpc = { code?: string | null; hint?: string | null; message?: string | null } | null | undefined;

/**
 * Lo que se le dice a quien anotó cuando la base dice que no. Cada pista es un porqué que la persona puede corregir.
 * Con `version_cambiada` (otra persona anotó primero) el texto ya viene de la base, con el nombre y la hora de quien fue.
 */
export function textoErrorDecision(e: ErrorRpc, sede: string, boton = "Anotar"): { texto: string; conVer: boolean; nuevaMarca: boolean } {
  // Una pista nuestra es la base diciendo que NO (nada se guardó), aunque el error no traiga código; solo lo que no dice nada,
  // o un corte de red, es una respuesta incierta: ahí la marca se conserva y reintentar no anota dos veces. `boton` es el que
  // se tocó («Anotar» en la hoja, «La cambié de lugar» en la fila): se le dice a la persona qué volver a tocar.
  const pistaNuestra = typeof e?.hint === "string" && (e.hint === "version_cambiada" || e.hint.startsWith("frescura_"));
  if (e && !pistaNuestra && esRespuestaIncierta(e as never)) return { texto: `No se pudo anotar: revisa la conexión y vuelve a tocar «${boton}». No se va a anotar dos veces.`, conVer: false, nuevaMarca: false };
  switch (e?.hint) {
    case "version_cambiada":
      return { texto: e.message?.trim() || "Otra persona acaba de anotar una decisión sobre esta prenda. Mírala antes de anotar la tuya.", conVer: true, nuevaMarca: true };
    case "frescura_sin_permiso":
      return { texto: `Para anotar decisiones de ${sede} hace falta el módulo «Frescura del piso» en tu rol y que sea una tienda que operas.`, conVer: false, nuevaMarca: true };
    case "frescura_rebaja_solo_lider":
      return { texto: "La rebaja la decide el líder. Si la sacaste del piso, elige «La saqué del piso».", conVer: false, nuevaMarca: true };
    case "frescura_nada_colgado":
      return { texto: `Esta prenda ya no tiene nada colgado en ${sede}: sale sola de «Por decidir». No hace falta anotar nada.`, conVer: true, nuevaMarca: true };
    case "frescura_traslado_no_calza":
      return { texto: `Ese traslado no lleva esta prenda desde ${sede}, se anuló o tiene más de 14 días. Elige otro o arma uno nuevo.`, conVer: true, nuevaMarca: true };
    case "frescura_no_anulable":
      return { texto: "Eso ya está quitado.", conVer: true, nuevaMarca: true };
    case "frescura_token_reusado":
      return { texto: "Algo cambió mientras se guardaba. Elige de nuevo y vuelve a anotar.", conVer: false, nuevaMarca: true };
    case "frescura_anterior_invalido":
    case "frescura_decision_inexistente":
      return { texto: "Esta prenda cambió mientras la mirabas. Recarga y vuelve a intentar.", conVer: true, nuevaMarca: true };
    case "frescura_producto_invalido":
    case "frescura_sede_sin_piso":
      return { texto: `Esta prenda no se puede decidir en ${sede}.`, conVer: false, nuevaMarca: true };
    case "frescura_nota_larga":
      return { texto: "La nota lleva hasta 280 letras.", conVer: false, nuevaMarca: true };
    default:
      return { texto: traducirError(e as never, "anotar la decisión"), conVer: !e || !esFalloDeRed(e as never), nuevaMarca: true };
  }
}

// ---------------------------------------------------------------------------
// Lo que ya se decidió en la sede: la nota al pie y «Las N tiendas»
// ---------------------------------------------------------------------------

const PLURAL_ACCION: Record<AccionDecision, [singular: string, plural: string, verboS: string, verboP: string]> = {
  cambie_lugar: ["cambio de lugar", "cambios de lugar", "terminó", "terminaron"],
  hasta_agotar: ["prenda dejada hasta agotar", "prendas dejadas hasta agotar", "terminó", "terminaron"],
  traslade: ["traslado", "traslados", "terminó", "terminaron"],
  rebaje: ["rebaja", "rebajas", "terminó", "terminaron"],
};

/**
 * «Este mes en Tienda Trujillo: 12 cambios de lugar terminaron; juntos vendieron 5 cuando se esperaban 2.1.» — una frase por
 * acción con algo terminado. Es la señal directa de si «Ya decidí» sirve, mientras no exista la línea base de ventas a precio
 * completo. Vacío si nada terminó este mes.
 */
export function notaDelMes(resumen: ResumenDecisiones, sede: string): string[] {
  const frases: string[] = [];
  for (const a of ACCIONES_DECISION) {
    const s = resumen[a];
    if (s.terminadas <= 0) continue;
    const [sing, plur, vs, vp] = PLURAL_ACCION[a];
    frases.push(`${s.terminadas} ${s.terminadas === 1 ? sing : plur} ${s.terminadas === 1 ? vs : vp}; juntas vendieron ${decimal(s.suyas)} cuando se esperaban ${decimal(s.esperadas)}`);
  }
  return frases.length === 0 ? [] : [`Este mes en ${sede}: ${frases.join(" · ")}.`];
}

/** «5 terminaron · 3 sirvieron · 1 no alcanzó · 1 aún no se sabe» (todas las acciones), para «Las N tiendas». Null si nada terminó. */
export function resumenCorto(resumen: ResumenDecisiones): string | null {
  const total = { t: 0, s: 0, n: 0, a: 0 };
  for (const a of ACCIONES_DECISION) {
    total.t += resumen[a].terminadas;
    total.s += resumen[a].sirvieron;
    total.n += resumen[a].noAlcanzaron;
    total.a += resumen[a].aunNoSeSabe;
  }
  if (total.t === 0) return null;
  const partes = [`${total.t} ${total.t === 1 ? "terminó" : "terminaron"}`];
  if (total.s > 0) partes.push(`${total.s} ${total.s === 1 ? "sirvió" : "sirvieron"}`);
  if (total.n > 0) partes.push(`${total.n} no ${total.n === 1 ? "alcanzó" : "alcanzaron"}`);
  if (total.a > 0) partes.push(`${total.a} aún no se sabe`);
  return partes.join(" · ");
}

/** El aviso de éxito: el título dice qué se anotó y el detalle, cuándo vuelve a mirarse. */
export function avisoDeExito(accion: AccionDecision, prenda: string, vence: string): { titulo: string; detalle: string } {
  const que: Record<AccionDecision, string> = {
    cambie_lugar: "se cambió de lugar",
    hasta_agotar: "se deja hasta agotar",
    traslade: "se trasladó",
    rebaje: "se rebajó",
  };
  const cuando: Record<AccionDecision, string> = {
    cambie_lugar: `Ese día te digo si sirvió.`,
    hasta_agotar: `Vuelve a esta lista si para entonces sigue sin venderse.`,
    traslade: `Ese día vuelve a esta lista si sigue sin venderse aquí.`,
    rebaje: `Ese día te digo cuánto vendió.`,
  };
  return { titulo: `Anotado: ${que[accion]}`, detalle: `${prenda} sale de «Por decidir» hasta el ${diaYNumero(vence)}. ${cuando[accion]}` };
}

/** Tipo auxiliar: la acción de una línea es una acción anotable (no una anulación). */
export const esAccionAnotable = (a: AccionRenglon): a is AccionDecision => a !== "anulacion";
