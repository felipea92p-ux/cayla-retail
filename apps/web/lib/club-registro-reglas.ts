// La página PÚBLICA del Club CAYLA (ADR-0288 act. g, tanda 1g): la clienta escanea el QR del cartel (o el de su ticket), abre
// `/club/<tienda>` en SU celular, sin cuenta, y se une sola. Lógica pura, sin React ni red: la usan la página y las de
// privacidad y términos (servidor), el formulario (navegador) y las acciones de servidor `consultarNombre` y `registrarme`.
//
// CONTRATO
//   PROMETE: leer lo que contesta `fn_club_pagina` sin confiar en su forma; completar los marcadores de los textos aprobados
//            (`{pct}`, `{escala}`, `{nombre}`, `{codigo}`, `{tienda}`); decir qué está mal de lo que ella escribió (UNA regla para
//            la pantalla, su guía de foco y el servidor); mostrar su nombre del padrón a medias («Lucía P. S.»); traducir lo que
//            la base contesta a palabras para ella, sin revelar datos de nadie.
//   ASUME:   quien decide si alguien PUEDE ser socia es la base (`registrarse_en_el_club`: 18 años a la fecha de Lima, textos
//            vigentes, ficha no anonimizada) y quien frena el abuso también (`club_intento`). Esto solo evita mandar lo que la
//            base rechazaría y dice por qué.
//   NO HACE: no inventa textos legales: los de la página son los aprobados en `docs/club/texto-legal-registro-v2.md`; la
//            política, los términos, la casilla de WhatsApp y el saludo vienen de `club_textos` con su versión.

import type { Database } from "@cayla-retail/database";
import { celularValido, enlaceQrClub } from "./club-reglas";
import { MESES_DEL_ANIO, type CumpleEscrito } from "./club-cumple-reglas";
import { esTipoDocumentoClienta, normalizarNumeroDocumento, problemaDocumento, type TipoDocumentoClienta } from "./documento-clienta-reglas";

/** Los argumentos exactos de `registrarse_en_el_club`, como los genera la base. */
export type ArgsRegistro = Database["retail"]["Functions"]["registrarse_en_el_club"]["Args"];

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
  return `S/ ${Number.isInteger(monto) ? String(monto) : monto.toFixed(2)}`;
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
  if (!valor) return null;
  let iso = /^\d{4}-\d{2}-\d{2}$/.test(valor.trim()) ? valor.trim() : null;
  if (!iso) {
    const t = Date.parse(valor);
    if (Number.isNaN(t)) return null;
    iso = new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  }
  const [a, m, d] = iso.split("-").map(Number);
  const mes = MESES_DEL_ANIO[(m ?? 0) - 1];
  if (!a || !mes || !d) return null;
  return `${d} de ${mes.toLocaleLowerCase("es")} de ${a}`;
}

/* ------------------------------------------------------------------ Los textos aprobados de la página */
// Los del formulario, las casillas y la letra chica: `docs/club/texto-legal-registro-v2.md`, sección 1. Su «Cabecera» y su «Qué
// recibes» los reemplazó el inicio del diseño aprobado por Felipe el 2026-10-01 (`lib/club-publico-reglas.ts`: `INICIO`,
// `tarjetasDelInicio` y `notaDelUmbral`), con las mismas cifras de la base; las condiciones de cada beneficio siguen en los
// Términos, enlazados ahí mismo.

/** Un trozo de párrafo: texto suelto o una parte que se lee en negrita. */
export type Trozo = string | { fuerte: string };

export const AYUDA = {
  documento: "Lo usamos para reconocerte en caja y aplicar tus cupones.",
  padron: "Lo tomamos del padrón público para que tu nombre quede bien escrito.",
  celular: "Aquí te llegarán nuestras novedades y tus cupones.",
  nacimiento: "Para tu cupón de cumpleaños.",
  correo: "Opcional. Solo para contactarte si lo necesitamos.",
} as const;

export const CASILLA_MAYOR = "Confirmo que soy mayor de 18 años.";
export const BOTON_UNIRME = "Unirme al Club CAYLA";

/** La casilla de los términos, con los dos enlaces en su lugar (`enlace`: cuál abre). Breve (Felipe, 2026-10-02): lo que
 *  acepta —para qué se usan sus datos, quién es responsable— lo dicen la Política y los Términos que enlaza. */
export function casillaTerminos(): (string | { enlace: "privacidad" | "terminos"; texto: string })[] {
  return ["Acepto la ", { enlace: "privacidad", texto: "Política de privacidad" }, " y los ", { enlace: "terminos", texto: "Términos del Club CAYLA" }, "."];
}

/** La letra chica bajo el botón: quién es responsable de sus datos y cómo ejercer sus derechos (Ley 29733). Dónde se guardan
 *  (Brasil, flujo transfronterizo) lo dice la Política de privacidad, 2.5; aquí no (Felipe, 2026-10-02). */
export function letraChica(e: { razonSocial: string; ruc: string; email: string }): string {
  return `${e.razonSocial} (RUC ${e.ruc}) es la responsable de tus datos. Puedes acceder a ellos, corregirlos, pedir que los borremos u oponerte a su uso en cualquier tienda CAYLA o en ${e.email}.`;
}

/** `/club/privacidad?t=<tienda>`: la política o los términos, sabiendo de qué tienda viene (para volver a su registro). */
export function enlaceLegal(cual: "privacidad" | "terminos", ubicacionId: string | null): string {
  return ubicacionId && esUuid(ubicacionId) ? `/club/${cual}?t=${ubicacionId}` : `/club/${cual}`;
}

/* ------------------------------------------------------------------ Su nombre a medias */

/**
 * En qué orden trae el padrón el nombre. SUNAT público (`apenomdenunciado`: «apellidos y nombres») trae primero los
 * apellidos; el proveedor de pago, si lo arma de sus partes, primero los nombres (`lib/padron.ts`, `normalizarRespuestaPadron`).
 */
export type OrdenDelNombre = "apellidos_primero" | "nombres_primero";

const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DI", "VAN", "VON"]);
const esParticula = (p: string) => PARTICULAS.has(p.toLocaleUpperCase("es"));

/** «DE LA CRUZ» es UN apellido: la partícula va con la palabra que sigue. */
function grupos(palabras: readonly string[]): string[][] {
  const out: string[][] = [];
  let pendiente: string[] = [];
  for (const p of palabras) {
    pendiente.push(p);
    if (!esParticula(p)) {
      out.push(pendiente);
      pendiente = [];
    }
  }
  if (pendiente.length > 0) out.push(pendiente);
  return out;
}

const capital = (p: string) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es");
const inicial = (g: readonly string[]) => `${(g.find((p) => !esParticula(p)) ?? g[0] ?? "").charAt(0).toLocaleUpperCase("es")}.`;
const palabras = (t: string) => t.trim().split(" ").filter(Boolean);

/** El nombre del padrón partido en nombres y apellidos (cada uno en grupos de palabras: «DE LA CRUZ» es uno). Con una coma
 *  («PÉREZ SALAS, LUCÍA») se sabe qué es qué; si no, manda el orden de la fuente. null sin nombre. */
function partesDelNombre(nombre: string | null | undefined, orden: OrdenDelNombre): { nombres: string[][]; apellidos: string[][] } | null {
  const limpio = (nombre ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  let nombres: string[][];
  let apellidos: string[][];
  if (limpio.includes(",")) {
    const [ap, ...resto] = limpio.split(",");
    apellidos = grupos(palabras(ap ?? ""));
    nombres = grupos(palabras(resto.join(" ")));
    if (nombres.length === 0) [nombres, apellidos] = [apellidos.slice(0, 1), apellidos.slice(1)];
  } else {
    const g = grupos(palabras(limpio));
    const nApellidos = g.length >= 3 ? 2 : g.length - 1;
    if (orden === "apellidos_primero") {
      apellidos = g.slice(0, nApellidos);
      nombres = g.slice(nApellidos);
    } else {
      nombres = g.slice(0, g.length - nApellidos);
      apellidos = g.slice(g.length - nApellidos);
    }
  }
  return nombres.length > 0 ? { nombres, apellidos } : null;
}

/**
 * «¿Eres Lucía P. S.?»: el primer nombre entero y la inicial de cada apellido. Para que ella confirme que tipeó bien su DNI sin
 * que la página revele el nombre completo de nadie (ADR-0288 G-3). Si el orden real fuera otro, se vería el primer apellido entero
 * y lo demás en iniciales: sigue a medias. null sin nombre.
 */
export function nombreAMedias(nombre: string | null | undefined, orden: OrdenDelNombre): string | null {
  const partes = partesDelNombre(nombre, orden);
  const primero = partes?.nombres[0];
  if (!partes || !primero) return null;
  return [primero.map(capital).join(" "), ...partes.apellidos.map(inicial)].join(" ");
}

/**
 * El nombre del padrón en las dos cajas de un formulario («Nombres» y «Apellidos»), con mayúscula inicial: «PEREZ SALAS LUCIA
 * MARIA» (SUNAT, apellidos primero) → { nombres: «Lucia Maria», apellidos: «Perez Salas» }. Lo usa Apartados al no encontrar
 * la ficha por DNI (ADR-0367). Se puede corregir a mano: es una propuesta, no un dato sellado. null sin nombre.
 */
export function nombresYApellidos(nombre: string | null | undefined, orden: OrdenDelNombre): { nombres: string; apellidos: string } | null {
  const partes = partesDelNombre(nombre, orden);
  if (!partes) return null;
  const texto = (g: string[][]) => g.map((p) => p.map((x) => (esParticula(x) ? x.toLocaleLowerCase("es") : capital(x))).join(" ")).join(" ");
  return { nombres: texto(partes.nombres), apellidos: texto(partes.apellidos) };
}

/* ------------------------------------------------------------------ Lo que ella escribe */

export type CampoRegistro = "documento" | "nombre" | "celular" | "nacimiento" | "correo" | "mayor" | "terminos";

/** El formulario tal como está. `nacimiento` son las tres cajas (día, mes y año), como el cumpleaños de la tanda 1b. */
export type RegistroEscrito = {
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string;
  /** Con DNI: tocó «Sí, soy yo» al ver su nombre a medias. */
  dniConfirmado: boolean;
  /** Solo carné o pasaporte: sus nombres y apellidos (con DNI el nombre sale del padrón). */
  nombre: string;
  celular: string;
  nacimiento: CumpleEscrito;
  correo: string;
  mayorDeEdad: boolean;
  aceptaTerminos: boolean;
  aceptaPublicidad: boolean;
};

const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Nadie del club nació hace más de esto: un año más viejo es un error de tipeo (la misma cota que el cumpleaños de la 1b). */
const EDAD_MAXIMA = 110;
const EDAD_MINIMA = 18;

/** La fecha de las tres cajas como `aaaa-mm-dd`, o null si está incompleta o no existe (31 de abril, 29 de febrero de 2001). */
export function nacimientoIso(n: CumpleEscrito): string | null {
  const [d, m, a] = [n.dia.trim(), n.mes.trim(), n.anio.trim()];
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(a)) return null;
  const [dia, mes, anio] = [Number(d), Number(m), Number(a)];
  if (mes < 1 || mes > 12 || dia < 1 || dia > DIAS_DEL_MES[mes - 1]!) return null;
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  if (mes === 2 && dia === 29 && !bisiesto) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Años cumplidos a `hoy` (`aaaa-mm-dd` de Lima): la misma cuenta que hace la base con la fecha de Lima. */
export function edadCumplida(nacimiento: string, hoy: string): number {
  const [an, mn, dn] = nacimiento.split("-").map(Number) as [number, number, number];
  const [ah, mh, dh] = hoy.split("-").map(Number) as [number, number, number];
  return ah - an - (mh < mn || (mh === mn && dh < dn) ? 1 : 0);
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const soloDigitos = (t: string) => t.replace(/\D/g, "");

/** Los mensajes, sin revelar datos de nadie (los tres primeros son los del borrador aprobado, palabra por palabra). */
export const MENSAJE = {
  dniNoEncontrado: "No encontramos ese DNI. Revisa el número; si es correcto, acércate a caja y te ayudamos.",
  limite: "Hiciste varios intentos seguidos. Vuelve a intentarlo en una hora o acércate a caja.",
  menor: "El Club CAYLA es para mayores de 18 años.",
  sinPadron: "No pudimos consultar tu DNI ahora. Inténtalo en unos minutos o acércate a caja.",
  archivado: "Con ese documento no podemos registrarte desde aquí. Acércate a caja y te ayudamos.",
  datos: "Revisa tus datos: algo no quedó bien escrito.",
  textosCambiaron: "Los textos del Club cambiaron mientras los leías. Léelos otra vez y vuelve a marcar las casillas.",
  noDisponible: "No pudimos completar tu registro ahora. Inténtalo de nuevo en un momento o acércate a caja.",
} as const;

/**
 * Qué está mal de lo que escribió, campo por campo; vacío si se puede unir. UNA regla para la pantalla (su guía de foco y el
 * botón «Unirme») y para el servidor, que la vuelve a correr sin confiar en el navegador. `hoy`: `aaaa-mm-dd` de Lima.
 */
export function problemasRegistro(r: RegistroEscrito, hoy: string): Partial<Record<CampoRegistro, string>> {
  const p: Partial<Record<CampoRegistro, string>> = {};
  const numeroDoc = normalizarNumeroDocumento(r.documentoNumero);
  const esDni = r.documentoTipo === "dni";
  if (numeroDoc === "") p.documento = esDni ? "Escribe tu DNI." : "Escribe el número de tu documento.";
  else {
    const mal = problemaDocumento(r.documentoTipo, numeroDoc);
    if (mal) p.documento = mal;
    else if (esDni && !r.dniConfirmado) p.documento = "Confirma que el nombre que aparece es el tuyo.";
  }
  if (!esDni && r.nombre.replace(/\s+/g, " ").trim().length < 3) p.nombre = "Escribe tus nombres y apellidos.";

  const celular = soloDigitos(r.celular);
  if (celular === "") p.celular = "Escribe tu celular con WhatsApp.";
  else if (!celularValido(celular)) p.celular = "Tu celular tiene 9 dígitos y empieza con 9.";

  const { dia, mes, anio } = r.nacimiento;
  if (!dia.trim() || !mes.trim() || !anio.trim()) p.nacimiento = "Completa el día, el mes y el año.";
  else {
    const iso = nacimientoIso(r.nacimiento);
    const anioHoy = Number(hoy.slice(0, 4));
    if (!iso) p.nacimiento = "Esa fecha no existe: revisa el día y el mes.";
    else if (Number(anio) < anioHoy - EDAD_MAXIMA || iso > hoy) p.nacimiento = "Revisa el año en que naciste.";
    else if (edadCumplida(iso, hoy) < EDAD_MINIMA) p.nacimiento = MENSAJE.menor;
  }

  const correo = r.correo.trim();
  if (correo !== "" && (!CORREO.test(correo) || correo.length > 254)) p.correo = "Revisa tu correo: parece incompleto.";

  if (!r.mayorDeEdad) p.mayor = "Confirma que eres mayor de 18 años.";
  if (!r.aceptaTerminos) p.terminos = "Acepta la Política de privacidad y los Términos para unirte.";
  return p;
}

/** Lo que el formulario manda a `registrarme`: lo escrito, la tienda del cartel y las versiones de los textos que leyó. */
export type DatosRegistro = RegistroEscrito & {
  ubicacionId: string;
  versiones: { terminos: number; privacidad: number; casillaPublicidad: number };
};

/** Las versiones que ella vio en pantalla: las que acepta (la base exige que sean las vigentes, `club_texto_cambio`). */
export function versionesDe(p: PaginaClub): DatosRegistro["versiones"] {
  return { terminos: p.textos.terminos.version, privacidad: p.textos.privacidad.version, casillaPublicidad: p.textos.casillaPublicidad.version };
}

const MAX_TEXTO = 200;
const textoCorto = (x: unknown): string | null => (typeof x === "string" && x.length <= MAX_TEXTO ? x : null);
const versionValida = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null);

/**
 * Lo que llegó a la acción de servidor, revisado campo por campo: la acción es pública y sus argumentos los puede mandar
 * cualquiera, con cualquier forma. null si algo no tiene la forma esperada (o es desmedido).
 */
export function leerDatosRegistro(x: unknown): DatosRegistro | null {
  if (!esObjeto(x)) return null;
  const n = esObjeto(x.nacimiento) ? x.nacimiento : {};
  const v = esObjeto(x.versiones) ? x.versiones : {};
  const ubicacionId = textoCorto(x.ubicacionId);
  const documentoNumero = textoCorto(x.documentoNumero);
  const nombre = textoCorto(x.nombre);
  const celular = textoCorto(x.celular);
  const correo = textoCorto(x.correo);
  const [dia, mes, anio] = [textoCorto(n.dia), textoCorto(n.mes), textoCorto(n.anio)];
  const [terminos, privacidad, casillaPublicidad] = [versionValida(v.terminos), versionValida(v.privacidad), versionValida(v.casillaPublicidad)];
  const { dniConfirmado, mayorDeEdad, aceptaTerminos, aceptaPublicidad, documentoTipo } = x;
  if (
    ubicacionId === null ||
    !esUuid(ubicacionId) ||
    !esTipoDocumentoClienta(documentoTipo) ||
    documentoNumero === null ||
    nombre === null ||
    celular === null ||
    correo === null ||
    dia === null ||
    mes === null ||
    anio === null ||
    terminos === null ||
    privacidad === null ||
    casillaPublicidad === null ||
    typeof dniConfirmado !== "boolean" ||
    typeof mayorDeEdad !== "boolean" ||
    typeof aceptaTerminos !== "boolean" ||
    typeof aceptaPublicidad !== "boolean"
  ) {
    return null;
  }
  return {
    ubicacionId,
    documentoTipo,
    documentoNumero,
    dniConfirmado,
    nombre,
    celular,
    nacimiento: { dia, mes, anio },
    correo,
    mayorDeEdad,
    aceptaTerminos,
    aceptaPublicidad,
    versiones: { terminos, privacidad, casillaPublicidad },
  };
}

/**
 * Los argumentos de `registrarse_en_el_club` (contrato de la tanda 1g), una vez que `problemasRegistro` no encontró nada.
 * `nombrePadron`: con DNI, el nombre que el SERVIDOR volvió a leer del padrón (nunca el que dice el navegador); con carné o
 * pasaporte, null (va el que ella escribió).
 */
export function argumentosRegistro(d: DatosRegistro, nombrePadron: string | null): ArgsRegistro {
  const delPadron = d.documentoTipo === "dni" && nombrePadron !== null;
  return {
    p_ubicacion_id: d.ubicacionId,
    p_documento_tipo: d.documentoTipo,
    p_documento_numero: normalizarNumeroDocumento(d.documentoNumero),
    p_nombre: delPadron ? nombrePadron : d.nombre.replace(/\s+/g, " ").trim(),
    p_telefono: soloDigitos(d.celular),
    // `registrarme` ya rechazó una fecha inválida (`problemasRegistro`); el `?? ""` solo satisface el tipo y la base lo rechazaría.
    p_nacimiento: nacimientoIso(d.nacimiento) ?? "",
    p_correo: d.correo.trim() === "" ? null : d.correo.trim(),
    p_mayor_de_edad: d.mayorDeEdad,
    p_acepta_terminos: d.aceptaTerminos,
    p_acepta_publicidad: d.aceptaPublicidad,
    p_versiones: { terminos: d.versiones.terminos, privacidad: d.versiones.privacidad, casilla_publicidad: d.versiones.casillaPublicidad },
    p_nombre_del_padron: delPadron,
  };
}

/* ------------------------------------------------------------------ Lo que contesta el servidor */

/** «¿Eres …?»: lo que contesta `consultarNombre`. Nunca trae el nombre completo. */
export type RespuestaConsulta =
  | { estado: "encontrado"; aMedias: string }
  | { estado: "no_encontrado" }
  | { estado: "limite" }
  | { estado: "sin_padron" }
  | { estado: "invalido" };

/** Lo que dice la página cuando la consulta no trajo un nombre. */
export function mensajeDeConsulta(r: Exclude<RespuestaConsulta, { estado: "encontrado" }>): string {
  switch (r.estado) {
    case "no_encontrado":
      return MENSAJE.dniNoEncontrado;
    case "limite":
      return MENSAJE.limite;
    case "sin_padron":
      return MENSAJE.sinPadron;
    case "invalido":
      return "El DNI tiene 8 dígitos.";
  }
}

/** Lo que contesta `registrarme`. `listo` no trae el id de su ficha: la página no lo necesita y no sale del servidor. */
export type RespuestaRegistro =
  | { estado: "listo"; nombre: string | null; codigo: string; clubDesde: string | null; eraSocia: boolean; conPublicidad: boolean }
  | { estado: "error"; mensaje: string; campo: CampoRegistro | null }
  /** Un texto cambió mientras lo leía: llegan los nuevos y las casillas se vuelven a marcar (otro toque de ella). */
  | { estado: "textos_cambiaron"; pagina: PaginaClub };

/**
 * El `hint` con que la base rechaza (`registrarse_en_el_club`) → qué se le dice y a qué campo lleva. `texto_cambio` no es un
 * error: la acción relee los textos. Cualquier otra cosa es «no pudimos»: nunca se le dice qué dato de otra persona hay detrás.
 */
export function errorDeLaBase(hint: string | null | undefined): { mensaje: string; campo: CampoRegistro | null } | "texto_cambio" {
  switch (hint) {
    case "club_texto_cambio":
      return "texto_cambio";
    case "club_menor":
      return { mensaje: MENSAJE.menor, campo: "nacimiento" };
    case "club_documento_archivado":
      return { mensaje: MENSAJE.archivado, campo: "documento" };
    case "celular_invalido":
      return { mensaje: "Tu celular tiene 9 dígitos y empieza con 9.", campo: "celular" };
    case "club_datos_invalidos":
      return { mensaje: MENSAJE.datos, campo: null };
    default:
      return { mensaje: MENSAJE.noDisponible, campo: null };
  }
}

/** La fila de `registrarse_en_el_club` → lo que ve ella. null si la base no devolvió su código (no se le dice «listo» sin él). */
export function respuestaDeRegistro(
  fila: { codigo_club?: unknown; club_desde?: unknown; era_socia?: unknown; nombre_corto?: unknown } | null | undefined,
  conPublicidad: boolean,
): Extract<RespuestaRegistro, { estado: "listo" }> | null {
  const codigo = typeof fila?.codigo_club === "string" ? fila.codigo_club.trim().toUpperCase() : "";
  if (!fila || codigo === "") return null;
  const nombre = typeof fila.nombre_corto === "string" && fila.nombre_corto.trim() !== "" ? fila.nombre_corto.trim() : null;
  return {
    estado: "listo",
    nombre,
    codigo,
    clubDesde: typeof fila.club_desde === "string" ? fila.club_desde : null,
    eraSocia: fila.era_socia === true,
    conPublicidad,
  };
}

/** La primera dirección de `x-forwarded-for` (la de quien llama; las demás son de los proxies), o la de `x-real-ip`. */
export function ipDeLaPeticion(reenviadaPor: string | null | undefined, real: string | null | undefined): string {
  const primera = (reenviadaPor ?? "").split(",")[0]?.trim() ?? "";
  const ip = primera || (real ?? "").trim();
  return ip ? ip.slice(0, 64) : "desconocida";
}

/* ------------------------------------------------------------------ Después de «Unirme» */

export type Bienvenida = {
  titulo: string;
  /** La línea bajo el título: «Ya eres miembro…», o desde cuándo lo es si ya lo era. */
  bajada: string;
  /** Solo si marcó la casilla de WhatsApp y la tienda tiene número (ADR-0288 G-6, G-12). */
  saludo: { titulo: string; parrafo: string; boton: string; enlace: string } | null;
};

/**
 * Lo que ve al terminar (diseño aprobado el 2026-10-01; su código va en su tarjeta de miembro, que dibuja la página). Nuevo:
 * «¡Te damos la bienvenida, {nombre}!» y «Ya eres miembro del Club CAYLA.». Ya era miembro: «Actualizamos tus datos» y desde
 * cuándo lo es. Sin género: sirve igual a un cliente o a una clienta (Felipe, 2026-10-02).
 * Con la casilla de WhatsApp, el último paso: saludar a la tienda del cartel con su código (así guarda el número oficial y la
 * conversación la empieza ella). Sin texto `saludo` vigente, el chat se abre sin mensaje.
 */
export function bienvenida(r: Extract<RespuestaRegistro, { estado: "listo" }>, p: PaginaClub): Bienvenida {
  const desde = r.eraSocia ? fechaLarga(r.clubDesde) : null;
  const mensaje = p.textos.saludo
    ? completarMarcadores(p.textos.saludo.texto, { ...marcadoresDePagina(p), nombre: r.nombre ?? "", codigo: r.codigo })
        .replace(/ +([.,)])/g, "$1")
        .replace(/ {2,}/g, " ")
    : "";
  const enlace = r.conPublicidad ? enlaceQrClub(p.whatsapp, mensaje) : null;
  return {
    titulo: r.eraSocia ? "Actualizamos tus datos" : `¡Te damos la bienvenida${r.nombre ? `, ${r.nombre}` : ""}!`,
    bajada: r.eraSocia
      ? desde
        ? `Eres miembro del Club CAYLA desde el ${desde}.`
        : "Ya eras miembro del Club CAYLA."
      : "Ya eres miembro del Club CAYLA.",
    saludo: enlace
      ? {
          titulo: "Último paso: salúdanos por WhatsApp",
          parrafo: "Así guardas nuestro número oficial y nuestros mensajes te llegan con los enlaces activos.",
          // A la tienda del cartel, que es la que le contesta y le escribe después (`clientas.club_ubicacion_id`).
          boton: `Saludar a ${p.tienda}`,
          enlace,
        }
      : null,
  };
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
