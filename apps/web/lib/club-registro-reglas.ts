// Lo que queda de la página PÚBLICA del Club CAYLA (ADR-0288 act. g, tanda 1g): la política y los términos del Club en pantalla
// (`/club/privacidad` y `/club/terminos`), y las cifras y fechas que usan esas páginas y el cartel. Lógica pura, sin React ni red.
// El formulario de registro del cartel (`/club/<tienda>`) se retiró el 2026-10-16: el Club empieza al crear la cuenta en la tienda
// online y el cartel lleva a tienda.cayla.pe (Felipe; 20261016154000). Esas dos páginas se quedan: son lo que aceptó quien se unió
// por el cartel.
//
// CONTRATO
//   PROMETE: leer lo que contesta `fn_club_pagina` sin confiar en su forma; completar los marcadores de los textos aprobados
//            (`{pct}`, `{escala}`, `{tienda}`); dibujar la política y los términos sin interpretar HTML.
//   NO HACE: no inventa textos legales: la política y los términos vienen de `club_textos` con su versión.

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
  /** El % del cupón de cumpleaños vigente. */
  pct: number;
  /** El vale de aniversario por año de club que cuenta, de menor a mayor año. */
  escala: { anio: number; monto: number }[];
  /** Un año de club cuenta con tantas compras… */
  compras: number;
  /** …o con tanto en compras netas. */
  montoMinimo: number;
  /** Días para usar el vale. */
  dias: number;
  textos: { terminos: TextoDelClub; privacidad: TextoDelClub; casillaPublicidad: TextoDelClub; saludo: TextoDelClub | null };
};

/**
 * Lo que la página sabe al abrirse. `no_disponible`: la base no respondió, o le falta algo que ella tiene que leer antes de
 * aceptar (un texto, el % o la escala). Sin eso no se le pide que acepte nada: el consentimiento tiene que ser informado.
 */
export type LecturaPagina = { estado: "lista"; pagina: PaginaClub } | { estado: "no_es_tienda" } | { estado: "no_disponible" };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function numero(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
}

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
  const pct = numero(json.pct);
  const compras = numero(json.compras);
  const montoMinimo = numero(json.monto_minimo);
  const dias = numero(json.dias);
  const escala = (Array.isArray(json.escala) ? json.escala : [])
    .map((f) => (esObjeto(f) ? { anio: numero(f.anio), monto: numero(f.monto) } : null))
    .filter((f): f is { anio: number; monto: number } => f !== null && f.anio !== null && Number.isInteger(f.anio) && f.anio > 0 && f.monto !== null && f.monto > 0)
    .sort((a, b) => a.anio - b.anio);
  const textos = esObjeto(json.textos) ? json.textos : {};
  const terminos = textoDelClub(textos.terminos);
  const privacidad = textoDelClub(textos.privacidad);
  const casillaPublicidad = textoDelClub(textos.casilla_publicidad);
  if (!tienda || pct === null || pct <= 0 || compras === null || compras <= 0 || montoMinimo === null || montoMinimo <= 0 || dias === null || dias <= 0) {
    return { estado: "no_disponible" };
  }
  if (escala.length === 0 || !terminos || !privacidad || !casillaPublicidad) return { estado: "no_disponible" };
  const whatsapp = typeof json.whatsapp === "string" ? json.whatsapp.replace(/\s/g, "") : "";
  return {
    estado: "lista",
    pagina: {
      tienda,
      whatsapp: celularValido(whatsapp) ? whatsapp : null,
      pct,
      escala,
      compras,
      montoMinimo,
      dias,
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

export type Marcadores = Partial<Record<"pct" | "escala" | "tienda" | "nombre" | "codigo", string>>;

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

/** Los marcadores que valen en toda la página: el % del cumpleaños, la escala del vale y la tienda del cartel. */
export function marcadoresDePagina(p: PaginaClub): Marcadores {
  return { pct: formatoPct(p.pct), escala: escalaEnPalabras(p.escala), tienda: p.tienda };
}

/** La política o los términos, con sus marcadores completos. */
export function textoLegal(p: PaginaClub, cual: "privacidad" | "terminos"): TextoDelClub {
  const t = p.textos[cual];
  return { ...t, texto: completarMarcadores(t.texto, marcadoresDePagina(p)) };
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
