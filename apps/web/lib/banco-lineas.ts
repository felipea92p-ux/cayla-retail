// «El banco manda» (ADR-0637, actividad 1): el ERP guarda cada línea del extracto tal como la dijo el banco y dice, al lado de su propio
// saldo, lo que dice el banco. Aquí vive lo que la pantalla necesita y no toca la red: armar lo que se le manda a `cargar_lineas_banco`
// desde el extracto ya leído (`lib/extracto-interbank.ts`), leer lo que devuelve `fn_banco_cuadre` y decirlo en palabras de tienda.
// No decide nada de plata: la identidad de cada línea, lo que es nuevo o repetido y los dos saldos los calcula la base.
// Los montos van en CÉNTIMOS ENTEROS y viajan a la base como texto decimal: nunca pasan por la coma flotante.

import { grupoDeLinea, solesDeCentimos, type ExtractoLeido } from "./extracto-interbank";
import { diaLima, horaLima } from "./fechas-lima";
import { fechaCorta } from "./gastos-reglas";

// ---- Lo que se manda a guardar -----------------------------------------------------------------------------------------------

export type FuenteBanco = "ibk_txt" | "tabla_web";

/** Una línea como la espera `cargar_lineas_banco` (`p_lineas`): fechas `AAAA-MM-DD`, y monto y saldo como texto con dos decimales. */
export type LineaParaCargar = {
  orden: number;
  fecha: string;
  fecha_proceso: string | null;
  correlativo: string | null;
  codigo: string | null;
  operacion: string | null;
  descripcion: string;
  monto: string;
  saldo: string | null;
  firme: boolean;
};

/** La base guarda hasta 120 letras de glosa (`banco_lineas.descripcion`). El .txt trae 28; una tabla pegada puede traer más. */
const MAX_GLOSA = 120;

/** Céntimos → «1803.60», «-0.30»: el decimal que la base convierte a `numeric` sin que pase por un `number` con decimales. */
export function decimalDeCentimos(centimos: number): string {
  if (!Number.isSafeInteger(centimos)) throw new Error("Un monto del extracto no es un número entero de céntimos.");
  const a = Math.abs(centimos);
  return `${centimos < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Lo que se guarda como descripción cuando el banco no escribió ninguna: la línea mueve plata igual y no se pierde por venir sin palabras. */
const SIN_GLOSA = "(sin descripción)";

/**
 * El `p_lineas` de `cargar_lineas_banco`, en el orden en que pasaron (el del lector). No quita ni junta líneas: eso lo decide la base.
 * Una línea que el banco trae sin descripción viaja con `SIN_GLOSA`: la base no guarda una línea sin palabras, y dejarla fuera se llevaría
 * su monto (y rechazar todo el archivo por ella no deja salida, porque volver a leerlo no la arregla).
 */
export function paraCargar(extracto: Pick<ExtractoLeido, "lineas">): LineaParaCargar[] {
  return extracto.lineas.map((l) => ({
    orden: l.orden,
    fecha: l.fecha,
    fecha_proceso: l.fechaProceso,
    correlativo: l.correlativo,
    codigo: l.codigo,
    operacion: l.operacion,
    descripcion: l.descripcion.replace(/\s+/g, " ").trim().slice(0, MAX_GLOSA) || SIN_GLOSA,
    monto: decimalDeCentimos(l.centimos),
    saldo: l.saldoCentimos === null ? null : decimalDeCentimos(l.saldoCentimos),
    firme: l.firme,
  }));
}

/** De dónde vino: el .txt de la banca trae el número del banco en cada línea (firme o provisional); la tabla copiada de la web, en ninguna. */
export function fuenteDe(extracto: Pick<ExtractoLeido, "lineas">): FuenteBanco {
  return extracto.lineas.some((l) => l.firme || l.correlativo !== null) ? "ibk_txt" : "tabla_web";
}

/**
 * La huella del texto subido (sha-256 en hexadecimal, 64 letras): con ella la base reconoce que un envío repetido es el mismo archivo.
 * Es la huella del TEXTO ya leído (en UTF-8), no la de los bytes del archivo: es estable de una lectura a otra, pero no coincide con el
 * `shasum` del .txt si trae una letra fuera del ASCII (el banco lo exporta en windows-1252).
 */
export async function huellaDeArchivo(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- De qué cuenta es el archivo --------------------------------------------------------------------------------------------------

type CuentaDelArchivo =
  /** Se puede guardar. `cuenta` es lo que se le manda a la base (nulo en la tabla pegada); `frase`, lo que se le dice a quien guarda. */
  | { ok: true; cuenta: string | null; frase: string }
  /** No se puede guardar, y por qué. */
  | { ok: false; motivo: string };

/** Las últimas 4 cifras de la cuenta (el lector ya la trae solo en cifras): lo único de ella que se muestra. */
const terminadaEn = (cuenta: string) => cuenta.slice(-4);

/**
 * Antes de guardar: ¿de qué cuenta es lo leído? Una línea guardada no se borra ni se retira, así que el extracto de OTRA cuenta guardado
 * en este banco no tendría vuelta atrás. El .txt dice su cuenta en cada renglón: se muestra en qué termina (para que quien guarda la
 * compare con el banco elegido) y viaja a la base, que la compara con las cargas anteriores y con el número anotado en la cuenta. Un
 * archivo con renglones de dos cuentas, o uno que no dice ninguna, no se guarda. La tabla pegada no lo dice: se avisa.
 */
export function cuentaDelArchivo(extracto: Pick<ExtractoLeido, "lineas" | "cuentas">, banco: string): CuentaDelArchivo {
  if (fuenteDe(extracto) === "tabla_web") {
    return { ok: true, cuenta: null, frase: `Lo que pegaste no dice de qué cuenta es: fíjate que lo hayas copiado de ${banco}.` };
  }
  if (extracto.cuentas.length === 0) {
    return { ok: false, motivo: "No pude leer de qué cuenta es este archivo, y sin eso no se guarda. Descárgalo de nuevo de la banca por internet." };
  }
  if (extracto.cuentas.length > 1) {
    const cuales = extracto.cuentas.map((c) => terminadaEn(c)).join(", ");
    return { ok: false, motivo: `Este archivo trae movimientos de ${extracto.cuentas.length} cuentas (terminadas en ${cuales}), y aquí se guarda el de una sola. Descarga el extracto de ${banco} por separado.` };
  }
  const [cuenta] = extracto.cuentas;
  return { ok: true, cuenta, frase: `Este archivo es de la cuenta terminada en ${terminadaEn(cuenta)}: fíjate que sea ${banco}.` };
}

// ---- Lo que responde la base al guardar ------------------------------------------------------------------------------------------

export type ResultadoCarga = {
  lineas: number;
  /** El banco no las había dicho. */
  nuevas: number;
  /** Ya estaban guardadas. */
  repetidas: number;
  /** Estaban «por confirmar» y este archivo ya las trae procesadas. */
  confirmadas: number;
  /** Estaban «por confirmar» y este archivo ya no las trae. */
  retiradasSinSucesora: number;
};

type Json = Record<string, unknown>;
const esObjeto = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const entero = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
/**
 * Un `numeric(12,2)` que llega como número JSON (`135.5`, `700.00`, `0`) o como texto decimal → céntimos enteros. Nulo si no vino o si no
 * es un monto: `""`, `[]`, `false` o `true` no son 0 ni 1 sol (convertirlos dibujaría un saldo que nadie dijo).
 */
const centimos = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function leerResultadoCarga(json: unknown): ResultadoCarga | null {
  if (!esObjeto(json)) return null;
  return {
    lineas: entero(json.lineas),
    nuevas: entero(json.nuevas),
    repetidas: entero(json.repetidas),
    confirmadas: entero(json.confirmadas),
    retiradasSinSucesora: entero(json.retiradas_sin_sucesora),
  };
}

const miles = (n: number) => n.toLocaleString("en-US");

/** Lo que dice el aviso al guardar: cuántas líneas eran nuevas y, si aplica, cuántas ya estaban, se confirmaron o ya no vienen. */
export function fraseDeCarga(r: ResultadoCarga): { titulo: string; detalle: string | null } {
  const titulo = r.nuevas === 0 ? "No había líneas nuevas" : r.nuevas === 1 ? "Guardé 1 línea nueva" : `Guardé ${miles(r.nuevas)} líneas nuevas`;
  const partes = [
    r.repetidas > 0 ? `${miles(r.repetidas)} ya ${r.repetidas === 1 ? "estaba" : "estaban"}` : null,
    r.confirmadas > 0 ? `${miles(r.confirmadas)} se ${r.confirmadas === 1 ? "confirmó" : "confirmaron"}` : null,
    r.retiradasSinSucesora > 0
      ? r.retiradasSinSucesora === 1
        ? "1 que estaba por confirmar ya no viene en el banco"
        : `${miles(r.retiradasSinSucesora)} que estaban por confirmar ya no vienen en el banco`
      : null,
  ].filter((p): p is string => p !== null);
  return { titulo, detalle: partes.length > 0 ? `${partes.join(" · ")}.` : null };
}

// ---- «El banco dice»: lo que devuelve `fn_banco_cuadre` ------------------------------------------------------------------------

export type GrupoPorCodigo = { codigo: string | null; glosa: string; n: number; entraCentimos: number; saleCentimos: number };

export type CuadreBanco = {
  hayExtracto: boolean;
  /** Desde qué día se compara: el día en que la cuenta empezó en el ERP o el siguiente a su corte. Nulo si la cuenta no tiene ninguno. */
  piso: string | null;
  /** El saldo del banco (el de su última línea guardada) y el día de esa línea; el saldo es nulo si ninguna línea lo trae. */
  banco: { saldoCentimos: number | null; al: string } | null;
  /** Lo que suma el ERP en esa cuenta al mismo día; nulo si todo lo guardado es anterior a su inicio en el ERP. */
  erpCentimos: number | null;
  /** Banco menos ERP: positivo si el banco tiene más. */
  diferenciaCentimos: number | null;
  /** Los dos saldos al abrir el piso: si ya diferían ahí, la diferencia no nació en las líneas que siguen. */
  ancla: { bancoCentimos: number; erpCentimos: number; diferenciaCentimos: number } | null;
  lineasDesdePiso: number;
  /** Líneas anteriores al piso: se guardan como historia y no se comparan. */
  lineasHistoria: number;
  /** Líneas que el banco todavía no procesa (su número es provisional). */
  porConfirmar: number;
  /** Veces que la cadena de saldos se corta desde el piso: entre dos líneas falta alguna. */
  huecos: number;
  entraCentimos: number;
  /** En positivo: lo que salió. */
  saleCentimos: number;
  porCodigo: GrupoPorCodigo[];
  ultimaCarga: { cuando: string; por: string | null; fuente: FuenteBanco; desde: string; hasta: string; lineas: number; nuevas: number } | null;
};

/** Lee el JSON de `fn_banco_cuadre`. Nulo si no es lo que se esperaba: la pantalla lo dice, no dibuja ceros como si fueran datos. */
export function leerCuadreBanco(json: unknown): CuadreBanco | null {
  if (!esObjeto(json) || typeof json.hay_extracto !== "boolean") return null;
  const banco = esObjeto(json.banco) ? json.banco : null;
  const al = banco ? texto(banco.al) : null;
  const ancla = esObjeto(json.ancla) ? json.ancla : null;
  const anclaBanco = ancla ? centimos(ancla.banco) : null;
  const anclaErp = ancla ? centimos(ancla.erp) : null;
  const carga = esObjeto(json.ultima_carga) ? json.ultima_carga : null;
  const cuando = carga ? texto(carga.cuando) : null;
  const desde = carga ? texto(carga.desde) : null;
  const hasta = carga ? texto(carga.hasta) : null;
  return {
    hayExtracto: json.hay_extracto && al !== null,
    piso: texto(json.piso),
    banco: banco && al ? { saldoCentimos: centimos(banco.saldo), al } : null,
    erpCentimos: esObjeto(json.erp) ? centimos(json.erp.saldo) : null,
    diferenciaCentimos: centimos(json.diferencia),
    ancla: anclaBanco !== null && anclaErp !== null ? { bancoCentimos: anclaBanco, erpCentimos: anclaErp, diferenciaCentimos: anclaBanco - anclaErp } : null,
    lineasDesdePiso: entero(json.lineas_desde_piso),
    lineasHistoria: entero(json.lineas_historia),
    porConfirmar: entero(json.por_confirmar),
    huecos: entero(json.huecos),
    entraCentimos: centimos(json.entra) ?? 0,
    saleCentimos: centimos(json.sale) ?? 0,
    porCodigo: (Array.isArray(json.por_codigo) ? json.por_codigo : []).filter(esObjeto).map((g) => ({
      codigo: texto(g.codigo),
      glosa: texto(g.glosa) ?? "",
      n: entero(g.n),
      entraCentimos: centimos(g.entra) ?? 0,
      saleCentimos: centimos(g.sale) ?? 0,
    })),
    ultimaCarga:
      carga && cuando && desde && hasta
        ? { cuando, por: texto(carga.por), fuente: carga.fuente === "tabla_web" ? "tabla_web" : "ibk_txt", desde, hasta, lineas: entero(carga.lineas), nuevas: entero(carga.nuevas) }
        : null,
  };
}

// ---- Los textos de la pantalla, como funciones puras ----------------------------------------------------------------------------

export type EstadoCuadre = {
  clave: "sin_extracto" | "sin_saldo" | "sin_erp" | "cuadra" | "dia_sin_cerrar" | "no_cuadra";
  tono: "verde" | "ambar" | "pizarra";
  /** La insignia: «Cuadra al 6 oct», «No cuadra». */
  chip: string;
  /** La frase que la acompaña. */
  frase: string;
};

/**
 * ¿El último día guardado seguía en curso cuando se subió el extracto? Pasa cuando se sube el mismo día que trae como último: el banco
 * todavía recibe pagos ese día (el .txt los trae como provisionales), pero `fn_banco_cuadre` le suma al ERP el día ENTERO. La diferencia
 * de ese momento mezcla medio día del banco con un día completo del ERP y no dice nada (el 9-nov-2026 mostró al ERP con más plata que el
 * banco, y el banco, ya cerrado, tenía más: después de la subida entraron un QR y un ITF). Se mira la última subida, y solo si es
 * la que trae ese último día. Si el archivo se bajó un día y se subió al siguiente no se ve; nulo en ese caso y en todos los demás.
 */
export function diaSinCerrar(c: Pick<CuadreBanco, "banco" | "ultimaCarga">): { dia: string; hora: string | null } | null {
  const u = c.ultimaCarga;
  if (!c.banco || !u || u.hasta !== c.banco.al) return null;
  const subida = diaLima(u.cuando);
  if (!subida || subida > c.banco.al) return null;
  return { dia: c.banco.al, hora: horaLima(u.cuando) };
}

/**
 * ¿Coincide lo que dice el banco con lo que dice el ERP? Solo compara los dos saldos que manda la base, al céntimo. Cuando no cuadra no
 * promete más de lo que hay: en esta entrega se ve la diferencia; el detalle línea por línea llega en el paso siguiente. Si el último día
 * seguía en curso al subirlo (`diaSinCerrar`), la diferencia no se presenta como un descuadre: se dice por qué todavía no vale.
 */
export function estadoDelCuadre(
  c: Pick<CuadreBanco, "hayExtracto" | "banco" | "erpCentimos" | "diferenciaCentimos" | "ultimaCarga">,
  nombreDelBanco: string,
): EstadoCuadre {
  if (!c.hayExtracto || !c.banco) {
    return { clave: "sin_extracto", tono: "pizarra", chip: "Sin extracto guardado", frase: `El saldo de ${nombreDelBanco} es lo que anotaste, no está probado.` };
  }
  if (c.banco.saldoCentimos === null) {
    return { clave: "sin_saldo", tono: "pizarra", chip: "Sin saldo del banco", frase: "Lo guardado no trae el saldo de cada línea, así que no hay con qué comparar. Sube el .txt de la banca: ese sí lo trae." };
  }
  if (c.erpCentimos === null || c.diferenciaCentimos === null) {
    return { clave: "sin_erp", tono: "pizarra", chip: "Todo es de antes", frase: "Todo lo guardado es de antes de que esta cuenta empezara en tu ERP: todavía no hay qué comparar." };
  }
  if (c.diferenciaCentimos === 0) {
    return { clave: "cuadra", tono: "verde", chip: `Cuadra al ${fechaCorta(c.banco.al)}`, frase: "El banco y tu ERP dicen lo mismo, al céntimo." };
  }
  const abierto = diaSinCerrar(c);
  if (abierto) {
    const dia = fechaCorta(abierto.dia);
    return {
      clave: "dia_sin_cerrar",
      tono: "pizarra",
      chip: `El ${dia} sigue abierto`,
      frase:
        `Subiste el extracto el ${dia}${abierto.hora ? ` a las ${abierto.hora}` : ""}, con ese día todavía en curso: lo que el banco recibió después no está, ` +
        `y tu ERP cuenta el ${dia} entero. Por eso la diferencia de ${solesDeCentimos(Math.abs(c.diferenciaCentimos))} todavía no dice nada. ` +
        `Sube el extracto del día siguiente: trae el ${dia} completo.`,
    };
  }
  return {
    clave: "no_cuadra",
    tono: "ambar",
    chip: "No cuadra",
    frase: `No cuadra por ${solesDeCentimos(Math.abs(c.diferenciaCentimos))}: el detalle línea por línea llega en la siguiente entrega.`,
  };
}

/** Bajo la cifra de la diferencia: quién tiene más. Nulo si no hay diferencia que explicar. */
export function ladoDeLaDiferencia(diferenciaCentimos: number | null): string | null {
  if (diferenciaCentimos === null) return null;
  if (diferenciaCentimos === 0) return "Ni un céntimo de diferencia.";
  return diferenciaCentimos > 0 ? "El banco tiene más que tu ERP." : "Tu ERP tiene más que el banco.";
}

/**
 * El punto de partida: los dos saldos al abrir el piso. Si ya diferían ahí, la diferencia de hoy no nació en las líneas guardadas. Cuando
 * lo guardado no trae nada anterior al piso no se puede asegurar que el saldo del banco sea el de ese día, y se dice. Con la cadena de
 * saldos cortada no se dice nada: el punto de partida del banco sale de restarle al último saldo todo lo guardado, y si falta una línea
 * (o el extracto termina en un fin de semana a medio procesar) esa resta da un número que el banco nunca tuvo.
 */
export function fraseDelAncla(c: Pick<CuadreBanco, "ancla" | "piso" | "lineasHistoria" | "huecos">): string | null {
  if (!c.ancla || !c.piso || c.huecos > 0) return null;
  const dia = fechaCorta(c.piso);
  if (c.ancla.diferenciaCentimos === 0) return `Partieron del mismo saldo: el ${dia} los dos abrían con ${solesDeCentimos(c.ancla.bancoCentimos)}.`;
  if (c.lineasHistoria > 0) {
    return `El punto de partida ya difería: el ${dia} el banco abría con ${solesDeCentimos(c.ancla.bancoCentimos)} y tu ERP con ${solesDeCentimos(c.ancla.erpCentimos)}.`;
  }
  return `El punto de partida no coincide: antes de la primera línea guardada el banco tenía ${solesDeCentimos(c.ancla.bancoCentimos)}, y tu ERP abría el ${dia} con ${solesDeCentimos(c.ancla.erpCentimos)}. Si el extracto guardado empieza después de ese día, sube uno que lo cubra.`;
}

/** «401 líneas desde el 28 oct · 735 de antes, guardadas como historia». */
export function fraseDeLineas(c: Pick<CuadreBanco, "piso" | "lineasDesdePiso" | "lineasHistoria">): string {
  const n = c.lineasDesdePiso;
  const desde = c.piso ? `${miles(n)} ${n === 1 ? "línea" : "líneas"} desde el ${fechaCorta(c.piso)}` : `${miles(n)} ${n === 1 ? "línea guardada" : "líneas guardadas"}`;
  if (c.lineasHistoria === 0) return desde;
  return `${desde} · ${miles(c.lineasHistoria)} de antes, ${c.lineasHistoria === 1 ? "guardada" : "guardadas"} como historia`;
}

/**
 * Las líneas sin confirmar, en una frase; nulo si no hay ninguna. Son de dos clases y la frase vale para las dos: las del fin de semana
 * o del día en curso, que el banco aún no procesa (el .txt las trae con un número provisional) y las pegadas de la web, que el banco sí procesó pero llegan
 * sin su número. Las dos se confirman igual: con el .txt que ya las traiga procesadas.
 */
export function fraseDePorConfirmar(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? "1 línea sigue sin el número definitivo del banco: es del fin de semana o del día en curso, que el banco aún no procesa, o la pegaste de la web. Se confirma al subir el .txt que ya la traiga procesada."
    : `${miles(n)} líneas siguen sin el número definitivo del banco: son del fin de semana o del día en curso, que el banco aún no procesa, o las pegaste de la web. Se confirman al subir el .txt que ya las traiga procesadas.`;
}

/**
 * La cadena de saldos cortada, en una frase; nulo si no le falta nada. Un extracto que termina en fin de semana corta la cadena sin que
 * le falte nada propio (el banco procesa el sábado junto con el domingo, que ese archivo no trae): lo primero que se pide es el extracto
 * que sigue.
 */
export function fraseDeHuecos(c: Pick<CuadreBanco, "huecos" | "piso">): string | null {
  if (c.huecos <= 0) return null;
  const veces = c.huecos === 1 ? "una vez" : `${miles(c.huecos)} veces`;
  return `El saldo salta ${veces}${c.piso ? ` desde el ${fechaCorta(c.piso)}` : ""}: entre dos líneas guardadas falta alguna. Si lo último que subiste termina en fin de semana, es lo que el banco procesó junto con los días que siguen: sube el extracto que cubra también esos días. Si no, baja completos los días que faltan y súbelos; lo que ya está guardado no se repite.`;
}

/**
 * La cadena de saldos completa, en una frase; nulo si no se puede afirmar. Solo dice lo medido: la base busca saltos desde el piso (no en
 * la historia), entre líneas que traen saldo. Sin líneas desde el piso, o sin saldos, no hay nada medido y se calla.
 */
export function fraseDeCadenaCompleta(c: Pick<CuadreBanco, "huecos" | "piso" | "lineasDesdePiso" | "banco">): string | null {
  if (c.huecos > 0 || c.lineasDesdePiso <= 0 || !c.banco || c.banco.saldoCentimos === null) return null;
  return c.piso ? `Desde el ${fechaCorta(c.piso)} no le falta ninguna línea: cada saldo sale del anterior.` : "No le falta ninguna línea: cada saldo sale del anterior.";
}

const TEXTO_FUENTE: Record<FuenteBanco, string> = { ibk_txt: "el .txt de la banca", tabla_web: "la tabla copiada de la web" };

/** «Última subida: 9 nov a las 18:40, por Ana · el .txt de la banca, del 5 oct al 6 nov · 2 líneas nuevas de 40». */
export function fraseDeUltimaCarga(u: NonNullable<CuadreBanco["ultimaCarga"]>): string {
  const dia = diaLima(u.cuando);
  const hora = horaLima(u.cuando);
  const cuando = dia ? `${fechaCorta(dia)}${hora ? ` a las ${hora}` : ""}` : "sin fecha";
  const rango = u.desde === u.hasta ? `del ${fechaCorta(u.desde)}` : `del ${fechaCorta(u.desde)} al ${fechaCorta(u.hasta)}`;
  const nuevas = u.nuevas === 0 ? "sin líneas nuevas" : `${miles(u.nuevas)} ${u.nuevas === 1 ? "línea nueva" : "líneas nuevas"} de ${miles(u.lineas)}`;
  return `Última subida: ${cuando}${u.por ? `, por ${u.por}` : ""} · ${TEXTO_FUENTE[u.fuente]}, ${rango} · ${nuevas}.`;
}

export type GrupoDelBanco = { clave: string; nombre: string; n: number; entraCentimos: number; saleCentimos: number };

/**
 * Los grupos de «Qué trajo», con nombre de tienda. La base agrupa por código de movimiento; dos códigos que son lo mismo para la tienda
 * (los dos del ITF) se juntan. El nombre lo pone `grupoDeLinea` (por código; si no lo conoce, por la glosa). Van del que más líneas trae al que menos.
 */
export function gruposDelBanco(porCodigo: readonly GrupoPorCodigo[]): GrupoDelBanco[] {
  const grupos = new Map<string, GrupoDelBanco>();
  for (const g of porCodigo) {
    const { clave, nombre } = grupoDeLinea(g.codigo, g.glosa);
    const ya = grupos.get(clave);
    if (ya) {
      ya.n += g.n;
      ya.entraCentimos += g.entraCentimos;
      ya.saleCentimos += g.saleCentimos;
    } else {
      grupos.set(clave, { clave, nombre, n: g.n, entraCentimos: g.entraCentimos, saleCentimos: g.saleCentimos });
    }
  }
  return [...grupos.values()].sort((a, b) => b.n - a.n);
}
