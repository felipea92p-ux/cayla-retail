import { problemaDocumento, TIPOS_DOCUMENTO_CLIENTA, type TipoDocumentoClienta } from "@cayla-retail/shared";
import { z } from "zod";
import { codigoDelCorreoActual, type CodigoDelCorreo } from "./correo-confirmado";
import { MENSAJES } from "./cuentas-mensajes";

// Las reglas de la cuenta de la tienda online (ADR-0408, actividades 2 y 2b; ADR-0438: la cuenta simple y el Club al separar). Dos
// formularios, cada uno con sus campos: CREAR LA CUENTA (correo con su código, nombre, contraseña y aceptar los términos) y UNIRSE AL
// CLUB, que se pide al separar (documento, celular y las casillas de «Soy mayor de 18 años» y los avisos; el cumpleaños es opcional).
// Aquí, lo que cada pantalla dice de cada campo (falta, mal, repetido, listo), la sugerencia de «gmial.com», el cumpleaños como lo
// guarda el Club, el código que confirma el correo, lo que el servidor vuelve a revisar antes de crear nada, y cómo se leen las
// respuestas de la base. Lógica pura, sin red: la usan el formulario (navegador), las acciones
// (servidor) y sus pruebas. Sale de la maqueta aprobada (`docs/maquetas/tienda-online-2026-10`: `estadoRegistro`,
// `ARREGLOS_CORREO`, `guiaRegistro`, `vEntrar`, `vOlvide`); el código y las casillas, de lo que Felipe decidió el 2026-10-14
// (actividad 2b). Desde el 2026-10-15 el código no es un paso al final: «Obtener código» va al lado del correo y la caja del código
// debajo, y «Crear mi cuenta» se prende recién con el correo confirmado (`lib/correo-confirmado.ts`).
//
// Quien decide de verdad es la base (`retail.tienda_registrar_cuenta_simple` y `retail.tienda_unirse_al_club`): esto solo evita mandar lo que la base rechazaría y dice
// por qué, con las mismas palabras en la pantalla y en el servidor.

/** La versión de la privacidad y los términos de la web que se acepta al crear la cuenta (`cuentas_web.textos_aceptados`). */
export const TEXTOS_VERSION = "borrador-2026-10-14";
export const CLAVE_MINIMA = 8;
/** El servicio de inicio de sesión guarda hasta 72 caracteres de una contraseña. */
export const CLAVE_MAXIMA = 72;

/* ------------------------------------------------------------------ El correo */

export const normalizarCorreo = (correo: string) => correo.trim().toLowerCase();

/** Algo@algo.algo, con al menos dos letras al final (la base acepta una; la pantalla pide dos, como la maqueta). */
export function correoValido(correo: string): boolean {
  const c = normalizarCorreo(correo);
  return c.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
}

/** Los dominios mal escritos más comunes y cómo se escriben bien (maqueta, `ARREGLOS_CORREO`). */
export const ARREGLOS_CORREO: Readonly<Record<string, string>> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yahoo.con": "yahoo.com",
  "yaho.com": "yahoo.com",
};

/** «ana@gmial.com» → «ana@gmail.com». null si el dominio no es uno de los mal escritos conocidos. */
export function arregloCorreo(correo: string): string | null {
  const [usuario, dominio, ...resto] = normalizarCorreo(correo).split("@");
  if (!usuario || !dominio || resto.length > 0) return null;
  const bien = ARREGLOS_CORREO[dominio];
  return bien ? `${usuario}@${bien}` : null;
}

/* ------------------------------------------------------------------ Cifras y fechas */

/** Lo que se escribe en una caja de solo números: sin lo demás y con su tope («+51 987 654 321» → «519876543» con tope 9). */
export const soloDigitos = (valor: string, tope: number) => valor.replace(/\D/g, "").slice(0, tope);

/** El celular de 9 dígitos que empieza en 9, sin el +51 si lo pegaron con él. */
export function celularNormalizado(valor: string): string {
  const d = valor.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("51") ? d.slice(2) : d;
}

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Cuántos días puede tener un mes sin saber el año: febrero, 29. */
export const diasDelMes = (mes: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 31;

export type Dia = { anio: number; mes: number; dia: number };

/** Hoy en Lima (el servidor puede estar en otra zona). */
export function hoyLima(ahora = new Date()): Dia {
  const [anio, mes, dia] = ahora.toLocaleDateString("en-CA", { timeZone: "America/Lima" }).split("-").map(Number);
  return { anio, mes, dia };
}

/** «14 de octubre» */
export const cumpleTexto = (dia: number, mes: number) => `${dia} de ${MESES[mes - 1] ?? ""}`.trim();

/* ------------------------------------------------------------------ El estado de cada campo */

export type Cumple = { d: string; m: string; a: string };

/** Crear la cuenta (ADR-0438): solo lo necesario. El documento, el celular y lo demás se piden después, al separar. */
export type RegistroCuenta = {
  correo: string;
  clave: string;
  /** Cómo la llama la tienda («María»): el saludo y la ficha mínima. Con el documento, el nombre del padrón lo reemplaza. */
  nombre: string;
  acepta: boolean;
};

export const REGISTRO_CUENTA_VACIO: RegistroCuenta = { correo: "", clave: "", nombre: "", acepta: false };

/**
 * Unirse al Club, al separar por primera vez (ADR-0438). DNI, carné de extranjería o pasaporte (Felipe 2026-10-15: la tienda acepta los
 * tres, «como en las tiendas»). Con DNI el servidor trae el nombre del padrón y no se escribe: sin el padrón no hay Club. Con carné o
 * pasaporte, el nombre se escribe tal cual está en el documento, en dos cajas (`nombres`, `apellidos`) que se guardan con los nombres
 * primero. El cumpleaños es opcional (todo vacío, o día y mes con año opcional).
 */
export type RegistroClub = {
  documentoTipo: TipoDocumentoClienta;
  documento: string;
  /** Solo con carné o pasaporte. */
  nombres: string;
  apellidos: string;
  celular: string;
  cumple: Cumple;
  /** «Soy mayor de 18 años»: obligatoria (la base también la exige). */
  mayor: boolean;
  acepta: boolean;
  /** «Avisos del Club por WhatsApp»: opcional; nace sin marcar (el permiso es el toque de ella). */
  avisos: boolean;
};

export const REGISTRO_CLUB_VACIO: RegistroClub = {
  documentoTipo: "dni",
  documento: "",
  nombres: "",
  apellidos: "",
  celular: "",
  cumple: { d: "", m: "", a: "" },
  mayor: false,
  acepta: false,
  avisos: false,
};

/**
 * Lo que dijo la base del correo mientras se escribía. `sin_revisar`: todavía no se preguntó (o no contestó). `de_otra_persona`: al
 * crear la cuenta, la base dijo que es el correo de contacto de OTRA ficha (un correo es de una sola persona, Felipe 2026-10-14). Se
 * sabe recién con el DNI (el correo de su propia ficha sí sirve), así que con el correo solo, «Obtener código» no lo puede saber.
 */
export type ConsultaCorreo = "sin_revisar" | "libre" | "repetido" | "de_otra_persona";

/**
 * Lo que dijo el servidor del documento. Con DNI: `encontrado` (el padrón dio el nombre, a medias) o `sin_nombre` (el DNI está
 * libre, pero el padrón no lo encontró, no respondió o se buscó demasiadas veces: sin el nombre del padrón no se crea la cuenta,
 * Felipe 2026-10-15, y se puede volver a intentar). Con carné o pasaporte: `libre` (el nombre se escribe). No dice si el documento
 * ya es de alguien del Club (Felipe 2026-10-16: todos se registran igual, tengan ficha o no; y así nadie sabe si un DNI ajeno es
 * del Club).
 */
export type ConsultaDocumento =
  | { estado: "sin_revisar" }
  | { estado: "buscando" }
  | { estado: "encontrado"; aMedias: string }
  | { estado: "libre" }
  | { estado: "sin_nombre"; motivo: "no_encontrado" | "sin_padron" | "limite" }
  | { estado: "repetido" }
  | { estado: "archivada" };

/**
 * Lo que la persona tiene que completar al crear la cuenta. El código va justo después del correo (Felipe 2026-10-15): se confirma ahí
 * mismo, antes de lo demás.
 */
export type CampoCuenta = "correo" | "codigo" | "nombre" | "clave" | "acepta";
/** Lo que tiene que completar al unirse al Club: los avisos y el cumpleaños son opcionales, nunca «faltan». */
export type CampoClub = "documento" | "nombres" | "apellidos" | "cel" | "mayor" | "acepta";
/** A dónde lleva un problema: un campo o una casilla opcional. */
export type CampoProblema = CampoCuenta | CampoClub | "cumple" | "avisos";
export type EstadoCampo = "falta" | "mal" | "repetido" | "buscando" | "ok";

/** El orden de la página de crear la cuenta y cómo se nombra cada campo en «Falta: …». */
export const CAMPOS_CUENTA: readonly (readonly [CampoCuenta, string])[] = [
  ["correo", "tu correo"],
  ["codigo", "confirmar tu correo"],
  ["nombre", "tu nombre"],
  ["clave", "tu contraseña"],
  ["acepta", "aceptar los términos"],
];

/** El orden de la página de unirse al Club. */
export const CAMPOS_CLUB: readonly (readonly [CampoClub, string])[] = [
  ["documento", "tu documento"],
  // Solo con carné o pasaporte (con DNI el nombre sale del padrón y estos dos quedan listos solos).
  ["nombres", "tus nombres"],
  ["apellidos", "tus apellidos"],
  ["cel", "tu celular"],
  ["mayor", "confirmar que eres mayor de 18"],
  ["acepta", "aceptar los términos"],
];

export function estadoCorreo(correo: string, consulta: ConsultaCorreo): EstadoCampo {
  const c = normalizarCorreo(correo);
  if (!c) return "falta";
  if (!correoValido(c)) return (c.split("@")[1] ?? "").includes(".") ? "mal" : "falta";
  // El de otra persona tampoco sirve: el campo queda en rojo (y el botón apagado) hasta que escriba otro.
  return consulta === "repetido" || consulta === "de_otra_persona" ? "repetido" : "ok";
}

export function estadoClave(clave: string): EstadoCampo {
  if (clave.length > CLAVE_MAXIMA) return "mal";
  return clave.length >= CLAVE_MINIMA ? "ok" : "falta";
}

export function estadoCelular(celular: string): EstadoCampo {
  const c = celularNormalizado(celular);
  if (/^9\d{8}$/.test(c)) return "ok";
  return c.length === 9 ? "mal" : "falta";
}

/** Día y mes obligatorios, año opcional (como guarda el Club). Con año: 4 cifras, desde 1900, y 18 años cumplidos en Lima. */
export function estadoCumple(c: Cumple, hoy: Dia): { estado: EstadoCampo; motivo?: "fecha" | "menor" } {
  if (!c.d || !c.m) return { estado: "falta" };
  const d = Number(c.d);
  const m = Number(c.m);
  const a = c.a ? Number(c.a) : null;
  const fechaOk =
    Number.isInteger(d) && Number.isInteger(m) && m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes(m) &&
    (a === null || (c.a.length === 4 && a >= 1900 && a <= hoy.anio && esFechaReal(a, m, d)));
  if (!fechaOk) return { estado: "mal", motivo: "fecha" };
  if (a !== null && !cumplio18(a, m, d, hoy)) return { estado: "mal", motivo: "menor" };
  return { estado: "ok" };
}

/**
 * El cumpleaños al unirse al Club es OPCIONAL (Felipe 2026-10-17: pedir lo mínimo): vacío no falta; con algo escrito, las mismas
 * reglas de siempre. `vacio`: no escribió nada (la guía lo marca «Opcional», no «Listo»).
 */
export function estadoCumpleOpcional(c: Cumple, hoy: Dia): { estado: EstadoCampo; vacio: boolean; motivo?: "fecha" | "menor" } {
  if (!c.d && !c.m && !c.a) return { estado: "ok", vacio: true };
  const e = estadoCumple(c, hoy);
  return { estado: e.estado === "falta" ? "mal" : e.estado, vacio: false, motivo: e.estado === "falta" ? "fecha" : e.motivo };
}

const esFechaReal = (a: number, m: number, d: number) => {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

/** ¿Ya cumplió 18 en Lima? (Como la base: nacimiento + 18 años ≤ hoy; el 29 de febrero cumple el 28 en un año no bisiesto.) */
function cumplio18(a: number, m: number, d: number, hoy: Dia): boolean {
  const ultimoDia = new Date(Date.UTC(a + 18, m, 0)).getUTCDate();
  const cumple18 = [a + 18, m, Math.min(d, ultimoDia)] as const;
  const h = [hoy.anio, hoy.mes, hoy.dia] as const;
  return cumple18[0] < h[0] || (cumple18[0] === h[0] && (cumple18[1] < h[1] || (cumple18[1] === h[1] && cumple18[2] <= h[2])));
}

/** «DNI», «carné de extranjería», «pasaporte», en una frase. */
export const nombreDelDocumento = (tipo: TipoDocumentoClienta) =>
  tipo === "dni" ? "DNI" : (TIPOS_DOCUMENTO_CLIENTA.find((t) => t.valor === tipo)?.etiqueta ?? "documento").toLocaleLowerCase("es");

/** El número escrito, completo para su tipo (las MISMAS reglas que la caja, `packages/shared`): DNI de 8, carné o pasaporte de 6 a 12. */
export const documentoCompleto = (tipo: TipoDocumentoClienta, numero: string) =>
  numero.length >= (tipo === "dni" ? 8 : 6) && problemaDocumento(tipo, numero) === null;

/**
 * El documento: falta hasta que está completo; después, lo que dijo el servidor. Con DNI, sin el nombre del padrón (`sin_nombre`)
 * queda en «Revisa» y no se crea la cuenta: el nombre no se escribe a mano (Felipe 2026-10-15).
 */
export function estadoDocumento(tipo: TipoDocumentoClienta, numero: string, consulta: ConsultaDocumento): EstadoCampo {
  if (!documentoCompleto(tipo, numero)) return numero.length > (tipo === "dni" ? 8 : 12) ? "mal" : "falta";
  switch (consulta.estado) {
    case "repetido":
      return "repetido";
    case "archivada":
    case "sin_nombre":
      return "mal";
    case "encontrado":
    case "libre":
      return "ok";
    default:
      return "buscando";
  }
}

/** Lo que dice la caja del número según el documento elegido: la sugerencia sigue al tipo (ADR-0290), igual que en la caja del ERP. */
export const ayudaDelNumero = (tipo: TipoDocumentoClienta) => (tipo === "dni" ? "8 dígitos" : "6 a 12 letras o números");

/** La caja del número de ese tipo: hasta qué largo y con qué teclado. */
export const cajaDelNumero = (tipo: TipoDocumentoClienta) =>
  tipo === "dni" ? { largo: 8, teclado: "numeric" as const } : { largo: 12, teclado: "text" as const };

/** El tope de una caja del nombre (la base acepta hasta 200 en todo el nombre). */
export const MAX_PARTE_NOMBRE = 90;

/**
 * Una caja del nombre escrito (carné o pasaporte): tal cual está en el documento, sin números (la base también lo exige:
 * `nombre_con_numeros`). Con DNI no hay caja: el nombre sale del padrón.
 */
export function estadoParteNombre(tipo: TipoDocumentoClienta, texto: string): EstadoCampo {
  if (tipo === "dni") return "ok";
  const t = texto.replace(/\s+/g, " ").trim();
  if (/[0-9]/.test(t) || t.length > MAX_PARTE_NOMBRE) return "mal";
  return t.length >= 2 ? "ok" : "falta";
}

/** El nombre escrito que se guarda: los nombres primero y después los apellidos, como el del padrón («María Pérez García»). */
export const nombreEscrito = (r: Pick<RegistroClub, "nombres" | "apellidos">) => `${r.nombres} ${r.apellidos}`.replace(/\s+/g, " ").trim();

/** Lo que dice el DNI cuando el padrón no dio el nombre: por qué, y que sin él no hay cuenta. Va con «Volver a intentar». */
export function mensajeSinNombre(motivo: "no_encontrado" | "sin_padron" | "limite"): string {
  return motivo === "no_encontrado" ? MENSAJES.dniNoEncontrado : motivo === "limite" ? MENSAJES.dniLimite : MENSAJES.dniSinPadron;
}

/**
 * El código del correo escrito AHORA: listo si ese correo quedó confirmado; «Revisa» si el código venció o se gastaron sus intentos
 * (hace falta otro); si no, falta. Un código pedido para otro correo no cuenta (`codigoDelCorreoActual`).
 */
export function estadoCodigo(correo: string, codigo: CodigoDelCorreo): EstadoCampo {
  const actual = codigoDelCorreoActual(codigo, normalizarCorreo(correo));
  if (actual.estado === "confirmado") return "ok";
  return actual.estado === "enviado" && actual.necesitaNuevo ? "mal" : "falta";
}

/** El nombre de quien crea la cuenta: algo con qué saludarla. Sin tope raro: la base acepta hasta 120 letras. */
export function estadoNombre(nombre: string): EstadoCampo {
  const n = nombre.replace(/\s+/g, " ").trim();
  if (n.length > MAX_NOMBRE_CUENTA) return "mal";
  return n.length >= 2 ? "ok" : "falta";
}
export const MAX_NOMBRE_CUENTA = 120;

export type EstadoCuenta = Record<CampoCuenta, EstadoCampo>;

export function estadoCuenta(r: RegistroCuenta, consultas: { correo: ConsultaCorreo; codigo: CodigoDelCorreo }): EstadoCuenta {
  return {
    correo: estadoCorreo(r.correo, consultas.correo),
    codigo: estadoCodigo(r.correo, consultas.codigo),
    nombre: estadoNombre(r.nombre),
    clave: estadoClave(r.clave),
    acepta: r.acepta ? "ok" : "falta",
  };
}

/** Lo que falta al crear la cuenta, en el orden de la página, con su nombre para «Falta: …». */
export function faltanCuenta(estado: EstadoCuenta): (readonly [CampoCuenta, string])[] {
  return CAMPOS_CUENTA.filter(([campo]) => estado[campo] !== "ok");
}

export type EstadoClub = Record<CampoClub, EstadoCampo> & { cumple: EstadoCampo; cumpleVacio: boolean; motivoCumple?: "fecha" | "menor" };

export function estadoClub(r: RegistroClub, consultas: { documento: ConsultaDocumento }, hoy: Dia): EstadoClub {
  const cumple = estadoCumpleOpcional(r.cumple, hoy);
  return {
    documento: estadoDocumento(r.documentoTipo, r.documento, consultas.documento),
    nombres: estadoParteNombre(r.documentoTipo, r.nombres),
    apellidos: estadoParteNombre(r.documentoTipo, r.apellidos),
    cel: estadoCelular(r.celular),
    mayor: r.mayor ? "ok" : "falta",
    acepta: r.acepta ? "ok" : "falta",
    cumple: cumple.estado,
    cumpleVacio: cumple.vacio,
    motivoCumple: cumple.motivo,
  };
}

/** Lo que falta para unirse al Club, en el orden de la página. El cumpleaños no cuenta (opcional), salvo que lo escrito esté mal. */
export function faltanClub(estado: EstadoClub): (readonly [CampoClub | "cumple", string])[] {
  const faltan: (readonly [CampoClub | "cumple", string])[] = CAMPOS_CLUB.filter(([campo]) => estado[campo] !== "ok");
  return estado.cumple === "mal" ? [...faltan.slice(0, 4), ["cumple", "tu cumpleaños"], ...faltan.slice(4)] : faltan;
}

/** Cuántos «Falta» se nombran en el pie del registro antes de decir «y N más». */
const FALTAN_A_LA_VISTA = 3;

/**
 * Lo que dice el pie del registro: los primeros que faltan, por su nombre, y cuántos más. Con todo vacío eran ocho nombres en cuatro
 * renglones ámbar, fijos sobre el formulario (un quinto de la pantalla de un celular): ahora, «tu correo, confirmar tu correo, tu
 * contraseña y 5 más». Nunca «y 1 más»: si solo sobra uno, se nombra. El orden es el de la página: el primero es el que sigue.
 */
export function faltanResumidos<T>(faltan: readonly T[], max = FALTAN_A_LA_VISTA): { nombrados: T[]; mas: number } {
  if (faltan.length <= max + 1) return { nombrados: [...faltan], mas: 0 };
  return { nombrados: faltan.slice(0, max), mas: faltan.length - max };
}

export type MarcaCampo = "hecho" | "error" | "sigue" | "falta";

/**
 * Qué campo se enciende («Sigue aquí»). Mientras la persona está dentro de un campo, la luz no se va de ahí: si ese campo ya
 * está listo, no se enciende otro hasta que salga de él (la regla de tacto de la guía de foco del ERP, ADR-0284). Sin foco,
 * el primero que falta.
 */
export function campoQueSigue<C extends string>(
  faltan: readonly (readonly [C, string])[],
  estado: Partial<Record<C, EstadoCampo>>,
  enFoco: C | null,
): C | null {
  if (enFoco) return estado[enFoco] === "ok" ? null : enFoco;
  return faltan[0]?.[0] ?? null;
}

export function marcaDe(estado: EstadoCampo, sigue: boolean): MarcaCampo {
  if (estado === "ok") return "hecho";
  if (estado === "mal" || estado === "repetido") return "error";
  return sigue ? "sigue" : "falta";
}

export const TEXTO_MARCA: Record<MarcaCampo, string> = { hecho: "✓ Listo", error: "Revisa", sigue: "Sigue aquí", falta: "" };

/** «Ya hay una cuenta con este DNI / carné de extranjería / pasaporte.», y qué hacer si no la creó la persona. */
export const documentoRepetido = (tipo: TipoDocumentoClienta) =>
  `${tipo === "dni" ? MENSAJES.dniRepetido : `Ya hay una cuenta con este ${nombreDelDocumento(tipo)}.`} ${MENSAJES.cuentaNoEsTuya}`;

/** «Te faltan 3 caracteres.» / «Te falta 1 carácter.» */
export function faltanCaracteres(clave: string): string | null {
  if (!clave || clave.length >= CLAVE_MINIMA) return null;
  const n = CLAVE_MINIMA - clave.length;
  return n === 1 ? "Te falta 1 carácter." : `Te faltan ${n} caracteres.`;
}

/* ------------------------------------------------------------------ El código que confirma el correo (actividad 2b) */
// Los topes viven en la base (`tienda_reservar_envio`, `tienda_intento_de_codigo`); estos números solo los dicen en pantalla.

/** Las cifras del código que llega al correo (`otp_length` del proyecto de clientes). */
export const CODIGO_LARGO = 6;
/** Cuánto vale un código, en minutos. */
export const CODIGO_VENCE_MIN = 30;
/** Cuánto se espera entre un código y otro, en segundos. */
export const CODIGO_ESPERA_S = 60;
/** Cuánto dura el bloqueo después del quinto intento equivocado, en minutos. */
export const CODIGO_BLOQUEO_MIN = 15;

/** Solo las cifras, hasta 6 (se puede pegar «123 456» o «Tu código: 123456»). */
export const codigoLimpio = (valor: string) => soloDigitos(valor, CODIGO_LARGO);
export const codigoCompleto = (codigo: string) => new RegExp(`^\\d{${CODIGO_LARGO}}$`).test(codigo);

/** «0:45» / «1:00». */
export function cuentaRegresiva(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** «1 minuto» / «12 minutos». */
export const enMinutos = (n: number) => (n === 1 ? "1 minuto" : `${n} minutos`);

/** Después de un código equivocado: cuántos intentos le quedan, o que ya no quedan. */
export function mensajeCodigoMalo(quedan: number): string {
  if (quedan <= 0) return `Ese código no es. Ya no quedan intentos: espera ${enMinutos(CODIGO_BLOQUEO_MIN)} y pide otro.`;
  return `Ese código no es. Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.`;
}

export const mensajeCodigoBloqueado = (minutos: number) => `Hiciste muchos intentos. Espera ${enMinutos(minutos)} y pide un código nuevo.`;
export const mensajeCodigoLimite = (minutos: number) => `Ya te mandamos 5 códigos. Puedes pedir otro en ${enMinutos(minutos)}.`;
export const mensajeCodigoEsperar = (segundos: number) => `Te mandamos uno hace poco. Puedes pedir otro en ${cuentaRegresiva(segundos)}.`;

/* ------------------------------------------------------------------ Lo que el servidor vuelve a revisar */

/** Lo que manda el formulario de crear la cuenta. El servidor no confía en nada de esto: lo revisa todo. */
export const esquemaCuenta = z.object({
  correo: z.string().max(400),
  clave: z.string().max(400),
  nombre: z.string().max(400),
  acepta: z.boolean(),
});

/**
 * «Crear mi cuenta»: el registro. El código NO viaja aquí: se confirmó antes, bajo el correo, y lo que el servidor exige es la prueba
 * firmada de este aparato. `volver`: la página que estaba viendo (la bolsa, una prenda); el servidor la revisa con `rutaParaVolver`
 * (lib/entrada.ts).
 */
export const esquemaCrearCuenta = z.object({
  registro: esquemaCuenta,
  volver: z.string().max(300).nullable().optional(),
});

/** Lo que manda el formulario de unirse al Club. */
export const esquemaClub = z.object({
  documentoTipo: z.enum(["dni", "carne_extranjeria", "pasaporte"]),
  documento: z.string().max(40),
  nombres: z.string().max(400),
  apellidos: z.string().max(400),
  celular: z.string().max(40),
  cumple: z.object({ d: z.string().max(4), m: z.string().max(4), a: z.string().max(8) }),
  mayor: z.boolean(),
  acepta: z.boolean(),
  avisos: z.boolean(),
});

/** «Unirme al Club»: los datos y la versión de la casilla de los avisos que la persona leyó (null si no se le mostró). */
export const esquemaUnirseAlClub = z.object({
  registro: esquemaClub,
  casilla: z.number().int().positive().nullable(),
  volver: z.string().max(300).nullable().optional(),
});

export type ProblemaRegistro = { campo: CampoProblema | null; mensaje: string };

/** La misma regla de la pantalla de crear la cuenta, para el servidor: el primer problema, o null si se puede seguir. */
export function problemaCuenta(r: RegistroCuenta): ProblemaRegistro | null {
  if (!correoValido(r.correo)) return { campo: "correo", mensaje: MENSAJES.correoMal };
  if (estadoNombre(r.nombre) !== "ok") return { campo: "nombre", mensaje: MENSAJES.nombreFalta };
  if (estadoClave(r.clave) !== "ok") return { campo: "clave", mensaje: r.clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : MENSAJES.claveAyuda };
  if (!r.acepta) return { campo: "acepta", mensaje: MENSAJES.aceptaFalta };
  return null;
}

/** La misma regla de la pantalla de unirse al Club, para el servidor. */
export function problemaClub(r: RegistroClub, hoy: Dia): ProblemaRegistro | null {
  if (!documentoCompleto(r.documentoTipo, r.documento)) {
    return { campo: "documento", mensaje: problemaDocumento(r.documentoTipo, r.documento) ?? `Escribe tu ${nombreDelDocumento(r.documentoTipo)}.` };
  }
  for (const campo of ["nombres", "apellidos"] as const) {
    const e = estadoParteNombre(r.documentoTipo, r[campo]);
    if (e !== "ok") return { campo, mensaje: e === "mal" ? MENSAJES.nombreConNumeros : `Escribe tus ${campo}, tal cual están en tu documento.` };
  }
  if (estadoCelular(r.celular) !== "ok") return { campo: "cel", mensaje: "El celular tiene 9 dígitos y empieza en 9." };
  const cumple = estadoCumpleOpcional(r.cumple, hoy);
  if (cumple.estado !== "ok") return { campo: "cumple", mensaje: cumple.motivo === "menor" ? MENSAJES.cumpleMenor : MENSAJES.cumpleMal };
  if (!r.mayor) return { campo: "mayor", mensaje: MENSAJES.mayorFalta };
  if (!r.acepta) return { campo: "acepta", mensaje: MENSAJES.clubAceptaFalta };
  return null;
}

/* ------------------------------------------------------------------ Lo que contesta la base */

/** El rechazo de `tienda_registrar_cuenta_simple` (su hint y su detail) en palabras para la persona, con el campo al que lleva. */
export function errorDeCuenta(hint: string | null | undefined, detalle: string | null | undefined): ProblemaRegistro {
  switch (hint) {
    case "cuenta_correo_repetido":
      return { campo: "correo", mensaje: MENSAJES.correoRepetido };
    // El correo de contacto de otra ficha (lo dice antes `tienda_revisar_registro_simple`; esto es la red si otra persona lo tomó
    // entre el código y «Crear mi cuenta»), o el disparador de «un correo, una persona» (`correo_repetido`).
    case "cuenta_correo_de_otra_persona":
    case "correo_repetido":
      return { campo: "correo", mensaje: MENSAJES.correoDeOtraPersona };
    case "cuenta_sin_codigo":
      return { campo: "codigo", mensaje: MENSAJES.codigoSinPedir };
    case "cuenta_datos_invalidos": {
      if (detalle === "correo") return { campo: "correo", mensaje: MENSAJES.correoMal };
      if (detalle === "nombre") return { campo: "nombre", mensaje: MENSAJES.nombreFalta };
      if (detalle === "acepta") return { campo: "acepta", mensaje: MENSAJES.aceptaFalta };
      return { campo: null, mensaje: MENSAJES.noDisponible };
    }
    default:
      return { campo: null, mensaje: MENSAJES.noDisponible };
  }
}

const CAMPO_DE_LA_BASE: Record<string, CampoProblema> = {
  // `dni` es el documento de la cuenta, sea cual sea su tipo (20261015161000).
  dni: "documento",
  // Con DNI el nombre sale del padrón (no hay caja de nombre): lo que diga la base del nombre se dice en el documento.
  nombre: "documento",
  celular: "cel",
  cumple: "cumple",
  mayor: "mayor",
  acepta: "acepta",
};

/**
 * El rechazo de `tienda_unirse_al_club` (su hint y su detail) en palabras para la persona, con el campo al que lleva. `tipo`: el
 * documento elegido (con carné o pasaporte, un problema del nombre va a sus cajas).
 */
export function errorDeClub(hint: string | null | undefined, detalle: string | null | undefined, tipo: TipoDocumentoClienta = "dni"): ProblemaRegistro {
  if (tipo !== "dni" && (hint === "nombre_con_numeros" || (hint === "cuenta_datos_invalidos" && detalle === "nombre"))) {
    return { campo: "nombres", mensaje: MENSAJES.nombreConNumeros };
  }
  switch (hint) {
    case "cuenta_dni_repetido":
      return { campo: "documento", mensaje: documentoRepetido(tipo) };
    case "cuenta_archivada":
      return { campo: "documento", mensaje: MENSAJES.dniArchivada };
    case "cuenta_menor":
      return { campo: "cumple", mensaje: MENSAJES.cumpleMenor };
    case "cuenta_texto_cambio":
    case "cuenta_sin_texto":
      return { campo: "avisos", mensaje: MENSAJES.avisosCambio };
    // La base no encontró la lectura del padrón del nombre (20261015133000): no se pudo anotar, o venció. Se vuelve a intentar.
    case "nombre_sin_padron":
      return { campo: "documento", mensaje: MENSAJES.dniSinPadron };
    case "cuenta_datos_invalidos": {
      // Un problema con el nombre (falta el del padrón) se dice en el DNI, con su propio mensaje.
      if (detalle === "nombre") return { campo: "documento", mensaje: MENSAJES.dniSinPadron };
      const campo = CAMPO_DE_LA_BASE[detalle ?? ""] ?? null;
      const mensajes: Partial<Record<CampoProblema, string>> = {
        documento: tipo === "dni" ? "El DNI tiene 8 dígitos." : `El ${nombreDelDocumento(tipo)} tiene de 6 a 12 letras o números, sin guiones.`,
        cel: "El celular tiene 9 dígitos y empieza en 9.",
        cumple: MENSAJES.cumpleMal,
        mayor: MENSAJES.mayorFalta,
        acepta: MENSAJES.clubAceptaFalta,
      };
      return { campo, mensaje: (campo && mensajes[campo]) || MENSAJES.clubNoDisponible };
    }
    default:
      return { campo: null, mensaje: MENSAJES.clubNoDisponible };
  }
}

/* ------------------------------------------------------------------ El código, en la base (actividad 2b) */

const esquemaEstado = z.object({ estado: z.string() });
const listaDeUsuarios = (dato: unknown): string[] =>
  Array.isArray(dato) ? dato.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];

/** `tienda_reservar_envio`: ¿se manda el código? Y los usuarios invitados que quedaron de pendientes viejos (`limpiar`). */
export type Reserva = { limpiar: string[] } & (
  | { estado: "enviar"; usuarioWebId: string | null }
  | { estado: "esperar"; segundos: number }
  | { estado: "limite" | "bloqueado"; minutos: number }
  | { estado: "correo_repetido" | "invalido" | "sin_codigo" | "sin_respuesta" }
);

export function leerReserva(dato: unknown): Reserva {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta", limpiar: [] };
  const r = dato as Record<string, unknown>;
  const limpiar = listaDeUsuarios(r.limpiar);
  const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 1);
  switch (e.data.estado) {
    case "enviar":
      return { estado: "enviar", usuarioWebId: typeof r.usuario_web_id === "string" ? r.usuario_web_id : null, limpiar };
    case "esperar":
      return { estado: "esperar", segundos: entero(r.segundos), limpiar };
    case "limite":
    case "bloqueado":
      return { estado: e.data.estado, minutos: entero(r.minutos), limpiar };
    case "correo_repetido":
    case "invalido":
    case "sin_codigo":
      return { estado: e.data.estado, limpiar };
    default:
      return { estado: "sin_respuesta", limpiar };
  }
}

/** `tienda_intento_de_codigo`: ¿se puede probar el código ahora? */
export type IntentoDeCodigo =
  | { estado: "puede"; quedan: number }
  | { estado: "bloqueado"; minutos: number }
  | { estado: "vencido" | "sin_codigo" | "sin_respuesta" };

export function leerIntentoDeCodigo(dato: unknown): IntentoDeCodigo {
  const e = esquemaEstado.safeParse(dato);
  if (!e.success) return { estado: "sin_respuesta" };
  const r = dato as Record<string, unknown>;
  if (e.data.estado === "puede" && typeof r.quedan === "number" && Number.isInteger(r.quedan) && r.quedan >= 0) return { estado: "puede", quedan: r.quedan };
  if (e.data.estado === "bloqueado") return { estado: "bloqueado", minutos: typeof r.minutos === "number" && r.minutos > 0 ? Math.ceil(r.minutos) : CODIGO_BLOQUEO_MIN };
  if (e.data.estado === "vencido" || e.data.estado === "sin_codigo") return { estado: e.data.estado };
  return { estado: "sin_respuesta" };
}

/** El texto aprobado de la casilla de los avisos (`casilla_publicidad`, el mismo del cartel del Club) y su versión. */
export type CasillaWhatsapp = { version: number; texto: string };

/**
 * La respuesta de `tienda_casilla_whatsapp`. null si no hay texto, si la forma no se entiende o si el texto trae un marcador
 * (`{tienda}`…) que la tienda no sabe completar: un permiso cita el texto que ella leyó, así que nunca se muestra a medias. Sin
 * casilla, la página no ofrece los avisos.
 */
export function leerCasillaWhatsapp(dato: unknown): CasillaWhatsapp | null {
  const r = z.object({ version: z.number().int().positive(), texto: z.string() }).safeParse(dato);
  if (!r.success) return null;
  const texto = r.data.texto.replace(/\s+/g, " ").trim();
  if (!texto || /[{}]/.test(texto)) return null;
  return { version: r.data.version, texto };
}

/** Cómo quedaron los avisos al unirse al Club (`avisos_whatsapp` de `tienda_unirse_al_club`). */
export type AvisosAlUnirse = "no" | "activados" | "ya_estaban" | "celular_distinto";

/**
 * El aviso con el que vuelve (`?aviso=`), y si los avisos quedaron sin activar. «Ya eras del Club» solo para quien de verdad ya era
 * miembro (se unió en el cartel antes de que existiera la página); quien solo tenía una ficha de caja (el DNI de una boleta) entra al
 * Club recién ahora y recibe la misma bienvenida que una persona nueva (Felipe 2026-10-16: nadie tiene por qué saber que tenía una
 * ficha).
 */
export function avisoAlUnirse(seUnioASuFicha: boolean, eraDelClub: boolean, avisos: AvisosAlUnirse): string {
  if (avisos === "celular_distinto") return "avisos-sin-activar";
  return seUnioASuFicha && eraDelClub ? "unida" : "bienvenida";
}

const esquemaMiCuenta = z.object({
  nombre: z.string().min(1),
  nombre_corto: z.string().nullable(),
  correo: z.string(),
  codigo_club: z.string().nullable(),
  club_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  cumple_dia: z.number().int().nullable(),
  cumple_mes: z.number().int().nullable(),
  activa: z.boolean(),
});

export type MiCuenta = {
  nombre: string;
  nombreCorto: string;
  correo: string;
  codigoClub: string | null;
  /** ¿Ya es del Club? Una cuenta simple (ADR-0438) todavía no: se une al separar, cuando da su documento y su celular. */
  esDelClub: boolean;
  /** El año en que se unió al club, para la tarjeta. */
  clubDesde: number | null;
  /** «14 de octubre», o null si la ficha no lo tiene. */
  cumple: string | null;
  activa: boolean;
};

/** La respuesta de `tienda_mi_cuenta`. null si no hay cuenta o si la forma no se entiende (no se muestra a medias). */
export function leerMiCuenta(dato: unknown): MiCuenta | null {
  const r = esquemaMiCuenta.safeParse(dato);
  if (!r.success) return null;
  const c = r.data;
  return {
    nombre: c.nombre,
    nombreCorto: c.nombre_corto?.trim() || c.nombre.split(" ")[0],
    correo: c.correo,
    codigoClub: c.codigo_club,
    esDelClub: c.club_desde !== null,
    clubDesde: c.club_desde ? Number(c.club_desde.slice(0, 4)) : null,
    cumple: c.cumple_dia && c.cumple_mes ? cumpleTexto(c.cumple_dia, c.cumple_mes) : null,
    activa: c.activa,
  };
}

const esquemaBeneficios = z.object({
  pct: z.coerce.number().positive(),
  escala: z.array(z.object({ anio: z.coerce.number().int().positive(), monto: z.coerce.number().positive() })).min(1),
  compras: z.coerce.number().positive(),
  monto_minimo: z.coerce.number().positive(),
  dias: z.coerce.number().int().positive(),
});

export type Beneficios = { pct: number; escala: { anio: number; monto: number }[]; compras: number; montoMinimo: number; dias: number };

/** La respuesta de `tienda_club_beneficios`. null si no se entiende: los términos se muestran sin las cifras. */
export function leerBeneficios(dato: unknown): Beneficios | null {
  const r = esquemaBeneficios.safeParse(dato);
  if (!r.success) return null;
  const { pct, escala, compras, monto_minimo, dias } = r.data;
  return { pct, escala: [...escala].sort((a, b) => a.anio - b.anio), compras, montoMinimo: monto_minimo, dias };
}

/**
 * «S/ 20»; con céntimos, «S/ 25.50». «S/» y la cifra van con un espacio que no se parte (U+00A0, ADR-0413): en el celular, «Mi cuenta»
 * decía «recibes un vale de S/» al final de un renglón y «20» al comienzo del siguiente.
 */
export const soles = (monto: number) => `S/\u00a0${Number.isInteger(monto) ? String(monto) : monto.toFixed(2)}`;

const ORDINALES = ["el primer año", "el segundo", "el tercero", "el cuarto", "el quinto"];

/** «S/ 20 el primer año, S/ 30 el segundo… y S/ 60 el quinto» (como los términos del Club). */
export function escalaEnPalabras(escala: readonly { anio: number; monto: number }[]): string {
  const partes = escala.map((e) => `${soles(e.monto)} ${ORDINALES[e.anio - 1] ?? `el año ${e.anio}`}`);
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/* ------------------------------------------------------------------ La ip de quien llama */

/** La primera ip de `x-forwarded-for` (en Vercel, la de su celular) o `x-real-ip`. Solo se usa para su huella con sal. */
export function ipDeLaPeticion(reenviadaPor: string | null | undefined, real: string | null | undefined): string {
  const primera = (reenviadaPor ?? "").split(",")[0]?.trim() ?? "";
  const ip = primera || (real ?? "").trim();
  return ip ? ip.slice(0, 64) : "desconocida";
}
