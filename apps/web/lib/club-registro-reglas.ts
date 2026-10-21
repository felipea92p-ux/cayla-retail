// Lo que queda de la página PÚBLICA del Club CAYLA (ADR-0288 act. g, tanda 1g): la política y los términos del Club en pantalla
// (`/club/privacidad` y `/club/terminos`), y las cifras y fechas que usan esas páginas y el cartel. Lógica pura, sin React ni red.
// El formulario de registro del cartel (`/club/<tienda>`) se retiró el 2026-10-16: el Club empieza al crear la cuenta en la tienda
// online y el cartel lleva a tienda.cayla.pe (Felipe; 20261016154000). Esas dos páginas se quedan: son lo que aceptó quien se unió
// por el cartel.
//
// CONTRATO
//   PROMETE: leer lo que contestan `fn_club_pagina` y `fn_club_puntos_vigentes` sin confiar en su forma; completar los marcadores de
//            los textos aprobados: los del cumpleaños y el vale (`{pct}`, `{escala}`, `{tienda}`), mientras los textos vigentes los
//            usen, y los de los puntos (`{puntos_por_sol}`, `{soles_por_100}`, `{canje_minimo}`, `{canje_minimo_soles}`,
//            `{vigencia_dias}`, `{compra_minima_x}`, `{regalo_cumple}`), para los textos que publique el abogado; no mostrar un texto
//            legal al que le falta una cifra que nombra; dibujar la política y los términos sin interpretar HTML.
//   NO HACE: no inventa textos legales: la política y los términos vienen de `club_textos` con su versión. Ninguna cifra de los
//            beneficios se escribe aquí: todas salen de la base.

import { celularValido } from "./club-reglas";
import { MESES_DEL_ANIO } from "./club-cumple-reglas";
import { diaLima } from "./fechas-lima";

/* ------------------------------------------------------------------ Lo que contesta la base */

// `fn_club_pagina(p_ubicacion_id uuid) returns jsonb` (contrato de la tanda 1g): `{tienda, whatsapp, pct, escala:[{anio, monto}],
// compras, monto_minimo, dias, textos:{terminos, privacidad, casilla_publicidad, saludo: {version, texto, vigente_desde}}}`, o
// `null` si no es una tienda. Como es `jsonb`, la forma se valida aquí (`lecturaDePagina`), no en los tipos generados.

/** Un texto del club como lo muestra la página: la versión que ella acepta y, si la base la da, desde cuándo vale. */
export type TextoDelClub = { version: number; texto: string; vigenteDesde: string | null };

export type PaginaClub = {
  tienda: string;
  /** El WhatsApp de la tienda (9 dígitos), o null si no lo tiene cargado: entonces no hay saludo al final. */
  whatsapp: string | null;
  /**
   * El % del cupón de cumpleaños, o null si la base no lo da. Con los puntos (2026-10-19) el 10 % se retiró, pero los Términos
   * vigentes todavía lo nombran (`{pct}`) hasta que el abogado apruebe los nuevos: mientras un texto lo nombre, hace falta.
   */
  pct: number | null;
  /** El vale de aniversario por año de club que cuenta, de menor a mayor año (vacío si la base no lo da). Como `pct`. */
  escala: { anio: number; monto: number }[];
  /** Un año de club cuenta con tantas compras… (null si no viene). */
  compras: number | null;
  /** …o con tanto en compras netas. */
  montoMinimo: number | null;
  /** Días para usar el vale. */
  dias: number | null;
  textos: { terminos: TextoDelClub; privacidad: TextoDelClub; casillaPublicidad: TextoDelClub; saludo: TextoDelClub | null };
};

/**
 * Lo que la página sabe al abrirse. `no_disponible`: la base no respondió, o le falta un texto. Las cifras que un texto nombra
 * (el % y la escala de antes, los puntos de ahora) se exigen al mostrarlo (`textoLegal`): un texto legal no se muestra a medias.
 */
export type LecturaPagina = { estado: "lista"; pagina: PaginaClub } | { estado: "no_es_tienda" } | { estado: "no_disponible" };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function numero(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Una cifra que solo tiene sentido mayor que 0; si no, null (un 0 de un beneficio retirado no se promete). */
const positivo = (n: number | null): number | null => (n !== null && n > 0 ? n : null);

function textoDelClub(x: unknown): TextoDelClub | null {
  if (!esObjeto(x)) return null;
  const version = numero(x.version);
  const texto = typeof x.texto === "string" ? x.texto.trim() : "";
  if (version === null || !Number.isInteger(version) || version <= 0 || texto === "") return null;
  const desde = x.vigente_desde ?? x.vigenteDesde;
  return { version, texto, vigenteDesde: typeof desde === "string" && desde.trim() !== "" ? desde.trim() : null };
}

/** La respuesta de `fn_club_pagina` → lo que la página puede mostrar. Descarta lo que no entiende en vez de mostrarlo a medias. */
export function lecturaDePagina(json: unknown): LecturaPagina {
  if (json === null || json === undefined) return { estado: "no_es_tienda" };
  if (!esObjeto(json)) return { estado: "no_disponible" };
  const tienda = typeof json.tienda === "string" ? json.tienda.trim() : "";
  const escala = (Array.isArray(json.escala) ? json.escala : [])
    .map((f) => (esObjeto(f) ? { anio: numero(f.anio), monto: numero(f.monto) } : null))
    .filter((f): f is { anio: number; monto: number } => f !== null && f.anio !== null && Number.isInteger(f.anio) && f.anio > 0 && f.monto !== null && f.monto > 0)
    .sort((a, b) => a.anio - b.anio);
  const textos = esObjeto(json.textos) ? json.textos : {};
  const terminos = textoDelClub(textos.terminos);
  const privacidad = textoDelClub(textos.privacidad);
  const casillaPublicidad = textoDelClub(textos.casilla_publicidad);
  if (!tienda || !terminos || !privacidad || !casillaPublicidad) return { estado: "no_disponible" };
  const whatsapp = typeof json.whatsapp === "string" ? json.whatsapp.replace(/\s/g, "") : "";
  return {
    estado: "lista",
    pagina: {
      tienda,
      whatsapp: celularValido(whatsapp) ? whatsapp : null,
      pct: positivo(numero(json.pct)),
      escala,
      compras: positivo(numero(json.compras)),
      montoMinimo: positivo(numero(json.monto_minimo)),
      dias: positivo(numero(json.dias)),
      textos: { terminos, privacidad, casillaPublicidad, saludo: textoDelClub(textos.saludo) },
    },
  };
}

/** El segmento de la dirección es el `uuid` de la tienda: con otra forma ni se le pregunta a la base. */
export function esUuid(texto: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto);
}

/* ------------------------------------------------------------------ Cifras y marcadores */

/** «S/ 20»; con céntimos, «S/ 25.50» (como se escribe un precio en la tienda). */
export function formatoSoles(monto: number): string {
  return `S/\u00a0${Number.isInteger(monto) ? String(monto) : monto.toFixed(2)}`;
}

/** «10»; con decimales, «12.5». Va antes de « %». */
export function formatoPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 100) / 100);
}

const ORDINALES = ["el primer año", "el segundo", "el tercero", "el cuarto", "el quinto"];

/** `{escala}`: «S/ 20 el primer año, S/ 30 el segundo, S/ 40 el tercero, S/ 50 el cuarto y S/ 60 el quinto». */
export function escalaEnPalabras(escala: readonly { anio: number; monto: number }[]): string {
  const partes = [...escala].sort((a, b) => a.anio - b.anio).map((e) => `${formatoSoles(e.monto)} ${ORDINALES[e.anio - 1] ?? `el año ${e.anio}`}`);
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Los marcadores de los puntos que puede nombrar un texto legal (el borrador para el abogado y su SQL usan estos nombres). */
const MARCADORES_DE_PUNTOS = [
  "puntos_por_sol",
  "soles_por_100",
  "canje_minimo",
  "canje_minimo_soles",
  "vigencia_dias",
  "compra_minima_x",
  "regalo_cumple",
] as const;

/**
 * Los marcadores que puede traer la política o los términos: los de antes (cumpleaños y vale) y los de los puntos. `{nombre}` y
 * `{codigo}` son del saludo, nunca de un texto legal. Si un texto nombra uno de estos y su cifra no llegó, no se muestra.
 */
const MARCADORES_LEGALES = ["pct", "escala", "tienda", ...MARCADORES_DE_PUNTOS] as const;

export type Marcadores = Partial<Record<(typeof MARCADORES_LEGALES)[number] | "nombre" | "codigo", string>>;

/**
 * Completa los marcadores de un texto del club. Uno que no se conoce (o que no llegó) queda como está: mejor que se note a que
 * desaparezca una palabra de un texto legal. `{código}`, con tilde, vale como `{codigo}` (así lo escribe el borrador aprobado).
 */
export function completarMarcadores(texto: string, valores: Marcadores): string {
  let out = texto;
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === undefined) continue;
    out = out.split(`{${clave}}`).join(valor);
    if (clave === "codigo") out = out.split("{código}").join(valor);
  }
  return out;
}

/**
 * Los marcadores de antes que valen en toda la página: el % del cumpleaños y la escala del vale (solo si la base los da; los
 * Términos vigentes los nombran hasta que se publiquen los de puntos) y la tienda del cartel.
 */
export function marcadoresDePagina(p: PaginaClub): Marcadores {
  return {
    ...(p.pct !== null ? { pct: formatoPct(p.pct) } : {}),
    ...(p.escala.length > 0 ? { escala: escalaEnPalabras(p.escala) } : {}),
    tienda: p.tienda,
  };
}

/* ------------------------------------------------------------------ Los puntos del Club */

/**
 * La configuración vigente de los puntos, como la da `fn_club_puntos_vigentes()` (pública, la misma que cobra la caja y que lee el
 * cartel): lo que se gana por cada sol pagado, lo que valen 100 puntos, el canje mínimo, la compra mínima (veces el valor del
 * cupón), los días del cupón y el regalo de cumpleaños (0 = sin regalo).
 */
export type PuntosClub = {
  puntosPorSol: number;
  solesPor100: number;
  canjeMinimo: number;
  compraMinimaX: number;
  vigenciaDias: number;
  regaloCumple: number;
};

/** El jsonb de `fn_club_puntos_vigentes` → la configuración, o null si no viene completa o una cifra no tiene sentido. */
export function puntosDelClub(json: unknown): PuntosClub | null {
  if (!esObjeto(json)) return null;
  const puntosPorSol = positivo(numero(json.puntos_por_sol));
  const solesPor100 = positivo(numero(json.soles_por_100));
  const canjeMinimo = positivo(numero(json.canje_minimo));
  const compraMinimaX = positivo(numero(json.compra_minima_x));
  const vigenciaDias = positivo(numero(json.vigencia_dias));
  const regaloCumple = numero(json.regalo_cumple);
  if (puntosPorSol === null || solesPor100 === null || compraMinimaX === null) return null;
  if (canjeMinimo === null || !Number.isInteger(canjeMinimo) || vigenciaDias === null || !Number.isInteger(vigenciaDias)) return null;
  if (regaloCumple === null || regaloCumple < 0 || !Number.isInteger(regaloCumple)) return null;
  return { puntosPorSol, solesPor100, canjeMinimo, compraMinimaX, vigenciaDias, regaloCumple };
}

const miles = (n: number) => n.toLocaleString("es-PE");
const cifra = (n: number) => (Number.isInteger(n) ? miles(n) : formatoPct(n));
const conUnidad = (n: number, una: string, varias: string) => `${cifra(n)} ${n === 1 ? una : varias}`;

/**
 * Los marcadores de los puntos, cada uno con su unidad para que la frase concuerde con la cifra (1 punto / 2 puntos, 1 día /
 * 7 días): `{puntos_por_sol}` «1 punto» (el texto sigue «por cada S/ 1»), `{soles_por_100}` «S/ 5», `{canje_minimo}` «200 puntos»,
 * `{canje_minimo_soles}` «S/ 10» (lo que vale el canje mínimo), `{vigencia_dias}` «7 días», `{compra_minima_x}` «3 veces» (el texto
 * sigue «su valor») y `{regalo_cumple}` «100 puntos».
 */
function marcadoresDePuntos(c: PuntosClub): Marcadores {
  return {
    puntos_por_sol: conUnidad(c.puntosPorSol, "punto", "puntos"),
    soles_por_100: formatoSoles(c.solesPor100),
    canje_minimo: conUnidad(c.canjeMinimo, "punto", "puntos"),
    canje_minimo_soles: formatoSoles(Math.round(Math.floor(c.canjeMinimo / 100) * c.solesPor100 * 100) / 100),
    vigencia_dias: conUnidad(c.vigenciaDias, "día", "días"),
    compra_minima_x: conUnidad(c.compraMinimaX, "vez", "veces"),
    regalo_cumple: conUnidad(c.regaloCumple, "punto", "puntos"),
  };
}

/**
 * La política o los términos, con sus marcadores completos: los de antes (si la base los da) y los de los puntos (si
 * `fn_club_puntos_vigentes` respondió). null si el texto nombra una cifra que no llegó: el consentimiento tiene que ser
 * informado, así que un texto legal con un «{canje_minimo}» a la vista o con un hueco no se muestra (la página dice que no pudo
 * abrirse). Un texto que no nombra los puntos (los Términos v2 de hoy) se muestra igual aunque los puntos no respondan.
 */
export function textoLegal(p: PaginaClub, cual: "privacidad" | "terminos", puntos: PuntosClub | null): TextoDelClub | null {
  const t = p.textos[cual];
  const valores: Marcadores = { ...marcadoresDePagina(p), ...(puntos ? marcadoresDePuntos(puntos) : {}) };
  const faltan = MARCADORES_LEGALES.filter((m) => t.texto.includes(`{${m}}`) && valores[m] === undefined);
  if (faltan.length > 0) return null;
  return { ...t, texto: completarMarcadores(t.texto, valores) };
}

/**
 * La descripción de `/club/terminos` para un buscador o un enlace compartido: habla de puntos con las cifras vigentes; sin ellas
 * (la base no respondió), lo mismo sin cifras. Nunca promete el 10 % ni el vale, que se retiraron.
 */
export function descripcionTerminos(puntos: PuntosClub | null): string {
  if (!puntos) return "Las condiciones del Club CAYLA: quién puede ser miembro, cómo se ganan y se canjean los puntos y cuánto duran.";
  const m = marcadoresDePuntos(puntos);
  const regalo = puntos.regaloCumple > 0 ? `, ${m.regalo_cumple} de regalo en tu cumpleaños` : "";
  return `Las condiciones del Club CAYLA: ${m.puntos_por_sol} por cada ${formatoSoles(1)} que pagas, 100 puntos valen ${m.soles_por_100} de descuento${regalo} y cómo se canjean.`;
}

/** «1 de octubre de 2026», en hora de Lima. Acepta `aaaa-mm-dd` o un instante con zona. null si no se entiende. */
export function fechaLarga(valor: string | null | undefined): string | null {
  const iso = diaLima(valor?.trim());
  if (!iso) return null;
  const [a, m, d] = iso.split("-").map(Number);
  const mes = MESES_DEL_ANIO[(m ?? 0) - 1];
  if (!a || !mes || !d) return null;
  return `${d} de ${mes.toLocaleLowerCase("es")} de ${a}`;
}

/* ------------------------------------------------------------------ Los textos de la política y los términos */

/** Un trozo de párrafo: texto suelto o una parte que se lee en negrita. */
export type Trozo = string | { fuerte: string };

/** `/club/privacidad?t=<tienda>`: la política o los términos, sabiendo de qué tienda viene. */
export function enlaceLegal(cual: "privacidad" | "terminos", ubicacionId: string | null): string {
  return ubicacionId && esUuid(ubicacionId) ? `/club/${cual}?t=${ubicacionId}` : `/club/${cual}`;
}

/* ------------------------------------------------------------------ La política y los términos en pantalla */

export type Bloque =
  | { tipo: "titulo"; nivel: 2 | 3; trozos: Trozo[] }
  | { tipo: "parrafo"; trozos: Trozo[] }
  | { tipo: "lista"; ordenada: boolean; items: { trozos: Trozo[]; sub: Trozo[][] }[] };

/** «Escribe **BAJA** al WhatsApp» → ["Escribe ", {fuerte: "BAJA"}, " al WhatsApp"]. Solo `**…**`: el resto se lee tal cual. */
export function trozosDeLinea(linea: string): Trozo[] {
  const partes = linea.split("**");
  // Un `**` sin pareja no abre negrita: el último queda como texto, con sus asteriscos.
  const ultimaAbierta = partes.length % 2 === 0;
  const out: Trozo[] = [];
  partes.forEach((p, i) => {
    if (p === "") return;
    const enNegrita = i % 2 === 1 && !(ultimaAbierta && i === partes.length - 1);
    out.push(enNegrita ? { fuerte: p } : i % 2 === 1 ? `**${p}` : p);
  });
  return out;
}

const unir = (a: Trozo[], b: Trozo[]): Trozo[] => (a.length === 0 ? b : [...a, " ", ...b]);

/**
 * El texto de la política o de los términos (como vive en `club_textos`: el Markdown sencillo del borrador aprobado) →
 * bloques que la página dibuja SIN interpretar HTML: títulos (`#`), párrafos, listas con `-` o `1.` y una sub-lista con
 * sangría. Nada de lo que traiga el texto se inyecta como HTML.
 */
export function bloquesDeTexto(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  let parrafo: Trozo[] | null = null;
  let lista: Extract<Bloque, { tipo: "lista" }> | null = null;
  const cerrar = () => {
    if (parrafo && parrafo.length > 0) bloques.push({ tipo: "parrafo", trozos: parrafo });
    if (lista) bloques.push(lista);
    parrafo = null;
    lista = null;
  };
  for (const cruda of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const linea = cruda.replace(/^\s*>\s?/, "");
    if (linea.trim() === "" || /^\s*-{3,}\s*$/.test(linea)) {
      cerrar();
      continue;
    }
    const titulo = /^\s*(#{1,6})\s+(.*)$/.exec(linea);
    if (titulo) {
      cerrar();
      bloques.push({ tipo: "titulo", nivel: titulo[1]!.length <= 2 ? 2 : 3, trozos: trozosDeLinea(titulo[2]!.trim()) });
      continue;
    }
    const vineta = /^(\s*)[-*]\s+(.*)$/.exec(linea);
    const numerada = vineta ? null : /^(\s*)\d+[.)]\s+(.*)$/.exec(linea);
    const item = vineta ?? numerada;
    if (item) {
      const trozos = trozosDeLinea(item[2]!.trim());
      const actual = lista as Extract<Bloque, { tipo: "lista" }> | null;
      const ultimo = actual?.items[actual.items.length - 1];
      if (item[1]!.length >= 2 && ultimo) {
        ultimo.sub.push(trozos);
        continue;
      }
      const ordenada = numerada !== null;
      if (!actual || actual.ordenada !== ordenada) {
        cerrar();
        lista = { tipo: "lista", ordenada, items: [] };
      }
      lista!.items.push({ trozos, sub: [] });
      continue;
    }
    const trozos = trozosDeLinea(linea.trim());
    const actual = lista as Extract<Bloque, { tipo: "lista" }> | null;
    if (actual && /^\s+/.test(linea)) {
      // La línea que sigue a un punto, con sangría: es el mismo punto partido en dos renglones.
      const ultimo = actual.items[actual.items.length - 1]!;
      if (ultimo.sub.length > 0) ultimo.sub[ultimo.sub.length - 1] = unir(ultimo.sub[ultimo.sub.length - 1]!, trozos);
      else ultimo.trozos = unir(ultimo.trozos, trozos);
      continue;
    }
    if (actual) cerrar();
    parrafo = unir(parrafo ?? [], trozos);
  }
  cerrar();
  return bloques;
}

const textoPlano = (trozos: readonly Trozo[]) => trozos.map((t) => (typeof t === "string" ? t : t.fuerte)).join("");

/**
 * El cuerpo de la política o de los términos para su página, que ya pone su título y su «Versión N · vigente desde…» con los
 * datos de la base. Si el texto guardado los trae también (como el borrador: «## 2. Política…» y «**Versión 1 · …**»), se
 * saltan, para no leerlos dos veces ni mostrar una fecha «PENDIENTE» que la base ya sabe.
 */
export function cuerpoLegal(texto: string): Bloque[] {
  const bloques = bloquesDeTexto(texto);
  let i = 0;
  if (bloques[i]?.tipo === "titulo" && (bloques[i] as Extract<Bloque, { tipo: "titulo" }>).nivel === 2) i++;
  const siguiente = bloques[i];
  if (siguiente?.tipo === "parrafo" && /^\s*versi[oó]n\s+\d+/i.test(textoPlano(siguiente.trozos))) i++;
  return bloques.slice(i);
}
