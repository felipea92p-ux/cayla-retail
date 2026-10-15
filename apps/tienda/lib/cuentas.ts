import { nombreAMedias, nombresYApellidos } from "@cayla-retail/shared";
import { z } from "zod";
import { codigoDelCorreoActual, type CodigoDelCorreo } from "./correo-confirmado";

// Las reglas de la cuenta de la tienda online (ADR-0408, actividades 2 y 2b). Lo que la página de registro dice de cada campo
// (falta, mal, repetido, listo), la sugerencia de «gmial.com», el cumpleaños como lo guarda el Club, las dos casillas («Soy
// mayor de 18 años» y los avisos por WhatsApp), el código que confirma el correo, lo que el servidor vuelve a revisar antes de
// crear nada, y cómo se leen las respuestas de la base. Lógica pura, sin red: la usan el formulario (navegador), las acciones
// (servidor) y sus pruebas. Sale de la maqueta aprobada (`docs/maquetas/tienda-online-2026-10`: `estadoRegistro`,
// `ARREGLOS_CORREO`, `guiaRegistro`, `vEntrar`, `vOlvide`); el código y las casillas, de lo que Felipe decidió el 2026-10-14
// (actividad 2b). Desde el 2026-10-15 el código no es un paso al final: «Obtener código» va al lado del correo y la caja del código
// debajo, y «Crear mi cuenta» se prende recién con el correo confirmado (`lib/correo-confirmado.ts`).
//
// Quien decide de verdad es la base (`retail.tienda_registrar_cuenta`): esto solo evita mandar lo que la base rechazaría y dice
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

export type Registro = {
  correo: string;
  clave: string;
  /** Con él, el servidor trae el nombre del padrón. El nombre no se escribe (Felipe 2026-10-15): sin el padrón no hay cuenta. */
  dni: string;
  celular: string;
  cumple: Cumple;
  /** «Soy mayor de 18 años»: obligatoria (la base también la exige). */
  mayor: boolean;
  acepta: boolean;
  /** «Avisos del Club por WhatsApp»: opcional; nace sin marcar (el permiso es el toque de ella). */
  avisos: boolean;
};

export const REGISTRO_VACIO: Registro = {
  correo: "",
  clave: "",
  dni: "",
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
 * Lo que dijo el servidor del DNI. `sin_nombre`: el DNI está libre, pero el padrón no dio el nombre (no lo encontró, no respondió o
 * se buscó demasiadas veces): sin el nombre del padrón no se crea la cuenta (Felipe 2026-10-15), y se puede volver a intentar.
 */
export type ConsultaDni =
  | { estado: "sin_revisar" }
  | { estado: "buscando" }
  | { estado: "encontrado"; aMedias: string; delClub: boolean }
  | { estado: "sin_nombre"; motivo: "no_encontrado" | "sin_padron" | "limite"; delClub: boolean }
  | { estado: "repetido" }
  | { estado: "archivada" };

/**
 * Lo que la persona tiene que completar (los avisos por WhatsApp son opcionales: nunca «faltan»). El nombre no: sale del DNI. El
 * código va justo después del correo (Felipe 2026-10-15): se confirma ahí mismo, antes de lo demás.
 */
export type CampoRegistro = "correo" | "codigo" | "clave" | "dni" | "cel" | "cumple" | "mayor" | "acepta";
/** A dónde lleva un problema: un campo o la casilla opcional de los avisos. */
export type CampoProblema = CampoRegistro | "avisos";
export type EstadoCampo = "falta" | "mal" | "repetido" | "buscando" | "ok";

/** El orden de la página y cómo se nombra cada campo en «Falta: …». */
export const CAMPOS_REGISTRO: readonly (readonly [CampoRegistro, string])[] = [
  ["correo", "tu correo"],
  ["codigo", "confirmar tu correo"],
  ["clave", "tu contraseña"],
  ["dni", "tu DNI"],
  ["cel", "tu celular"],
  ["cumple", "tu cumpleaños"],
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

/**
 * El DNI: falta hasta las 8 cifras; después, lo que dijo el servidor. Sin el nombre del padrón (`sin_nombre`) el DNI queda en «Revisa»
 * y no se crea la cuenta: el nombre no se escribe a mano (Felipe 2026-10-15).
 */
export function estadoDni(dni: string, consulta: ConsultaDni): EstadoCampo {
  if (!/^\d{8}$/.test(dni)) return "falta";
  switch (consulta.estado) {
    case "repetido":
      return "repetido";
    case "archivada":
    case "sin_nombre":
      return "mal";
    case "encontrado":
      return "ok";
    default:
      return "buscando";
  }
}

const nombreLimpio = (nombre: string) => nombre.replace(/\s+/g, " ").trim();

/**
 * El nombre del padrón como se guarda y como se muestra (las mismas reglas del Club del ERP, `packages/shared`): para la ficha,
 * nombres y después apellidos, con mayúscula inicial («Maria Fernanda Perez Salas»: así el «Hola, Maria» toma el nombre y no el
 * apellido); para confirmar en pantalla, a medias («Maria P. S.»), que no revela el nombre completo de nadie (ADR-0288 G-3).
 * SUNAT público trae primero los apellidos; el proveedor de pago, primero los nombres. null si no se entiende.
 */
export function nombreDelPadron(nombre: string, origen: "sunat_publico" | "proveedor"): { nombre: string; aMedias: string } | null {
  const orden = origen === "sunat_publico" ? "apellidos_primero" : "nombres_primero";
  const partes = nombresYApellidos(nombre, orden);
  const aMedias = nombreAMedias(nombre, orden);
  if (!partes || !aMedias) return null;
  return { nombre: nombreLimpio(`${partes.nombres} ${partes.apellidos}`), aMedias };
}

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

export type EstadoRegistro = Record<CampoRegistro, EstadoCampo> & { motivoCumple?: "fecha" | "menor" };

export function estadoRegistro(
  r: Registro,
  consultas: { correo: ConsultaCorreo; dni: ConsultaDni; codigo: CodigoDelCorreo },
  hoy: Dia,
): EstadoRegistro {
  const cumple = estadoCumple(r.cumple, hoy);
  return {
    correo: estadoCorreo(r.correo, consultas.correo),
    codigo: estadoCodigo(r.correo, consultas.codigo),
    clave: estadoClave(r.clave),
    dni: estadoDni(r.dni, consultas.dni),
    cel: estadoCelular(r.celular),
    cumple: cumple.estado,
    motivoCumple: cumple.motivo,
    mayor: r.mayor ? "ok" : "falta",
    acepta: r.acepta ? "ok" : "falta",
  };
}

/** Lo que falta, en el orden de la página, con su nombre para «Falta: …». */
export function faltanRegistro(estado: EstadoRegistro): (readonly [CampoRegistro, string])[] {
  return CAMPOS_REGISTRO.filter(([campo]) => estado[campo] !== "ok");
}

/** «Falta: tu correo, tu DNI y aceptar los términos» */
export function textoFaltan(faltan: readonly (readonly [CampoRegistro, string])[]): string {
  const nombres = faltan.map(([, nombre]) => nombre);
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

export type MarcaCampo = "hecho" | "error" | "sigue" | "falta";

/**
 * Qué campo se enciende («Sigue aquí»). Mientras la persona está dentro de un campo, la luz no se va de ahí: si ese campo ya
 * está listo, no se enciende otro hasta que salga de él (la regla de tacto de la guía de foco del ERP, ADR-0284). Sin foco,
 * el primero que falta.
 */
export function campoQueSigue(estado: EstadoRegistro, enFoco: CampoRegistro | null): CampoRegistro | null {
  if (enFoco) return estado[enFoco] === "ok" ? null : enFoco;
  return faltanRegistro(estado)[0]?.[0] ?? null;
}

export function marcaDe(estado: EstadoCampo, sigue: boolean): MarcaCampo {
  if (estado === "ok") return "hecho";
  if (estado === "mal" || estado === "repetido") return "error";
  return sigue ? "sigue" : "falta";
}

export const TEXTO_MARCA: Record<MarcaCampo, string> = { hecho: "✓ Listo", error: "Revisa", sigue: "Sigue aquí", falta: "" };

/* ------------------------------------------------------------------ Las palabras */

export const MENSAJES = {
  correoAyuda: "Escríbelo bien: si olvidas tu contraseña, te llega un enlace a este correo.",
  correoMal: "A este correo le falta algo: revisa lo que va después de la @.",
  correoRepetido: "Ya hay una cuenta con este correo.",
  // Un correo es de una sola persona (Felipe 2026-10-14): es el correo de contacto de otra ficha del Club. Nunca se dice de quién.
  correoDeOtraPersona: "Este correo ya está registrado en CAYLA con otros datos. Usa otro correo o, si es tuyo, acércate a una tienda CAYLA y lo revisamos.",
  claveAyuda: "8 caracteres o más. Solo tú la sabes.",
  claveLarga: "Tu contraseña puede tener hasta 72 caracteres.",
  dniAyuda: "Buscamos tu nombre solo, para tu boleta. Cada DNI tiene una sola cuenta.",
  dniBuscando: "Buscando tu nombre…",
  dniRepetido: "Ya hay una cuenta con este DNI.",
  dniArchivada: "Para crear tu cuenta necesitamos revisar tus datos en tienda: acércate a cualquier tienda CAYLA.",
  dniDelClub: "Ya eras del Club CAYLA: tu cuenta se une a tu ficha",
  // El nombre sale del padrón y no se escribe (Felipe 2026-10-15): sin él no se crea la cuenta. Cada uno va con «Volver a intentar».
  dniDelPadron: "Del padrón: así sale en tu boleta.",
  dniNoEncontrado: "No encontramos tu nombre con ese DNI. Revisa el número: sin tu nombre del padrón no podemos crear tu cuenta.",
  dniSinPadron: "No pudimos buscar tu nombre ahora. Sin él no podemos crear tu cuenta: vuelve a intentar en un momento.",
  dniLimite: "Hiciste muchas búsquedas seguidas. Espera un rato y vuelve a intentar.",
  celAyuda: "Por aquí te escribe la tienda por tus pedidos.",
  celMal: "El celular empieza en 9.",
  cumpleAyuda: "Día y mes; el año es opcional. Es para tu descuento de cumpleaños.",
  cumpleMal: "Revisa el día, el mes (del 1 al 12) y el año.",
  cumpleMenor: "El Club CAYLA es para mayores de 18 años.",
  mayor: "Soy mayor de 18 años.",
  mayorFalta: "Para crear tu cuenta, confirma que eres mayor de 18 años.",
  aceptaFalta: "Para crear tu cuenta, acepta la política de privacidad y los términos del club.",
  avisosTitulo: "Avisos del Club por WhatsApp",
  avisosAyuda: "Te llegan al celular de arriba.",
  avisosCambio: "El texto de los avisos cambió. Léelo y vuelve a marcarlo si quieres recibirlos.",
  avisosSinActivar: "Tus avisos por WhatsApp quedaron sin activar: tu ficha del Club tiene otro celular. Para cambiarlo, acércate a una tienda CAYLA.",
  noDisponible: "No pudimos crear tu cuenta ahora. Intenta de nuevo en unos minutos.",
  limite: "Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.",
  codigoAyuda: "Son 6 números. Si no lo ves, revisa también tu carpeta de spam.",
  // El código bajo el correo (Felipe 2026-10-15): «Obtener código» al lado, la caja debajo y, con el bueno, «Correo confirmado».
  codigoObtener: "Obtener código",
  codigoAntes: "Toca «Obtener código»: te llega un código de 6 números a este correo.",
  correoConfirmado: "Correo confirmado",
  codigoSinConfirmar: "Primero confirma tu correo: toca «Obtener código» y escribe los 6 números que te llegan.",
  // El correo lo acaba de confirmar otro aparato y todavía puede estar creando su cuenta: no se le manda otro código por un rato.
  correoOcupado: "Este correo se está confirmando en otro aparato. Termina ahí, o espera unos minutos y vuelve a intentar.",
  // El último código sigue sirviendo (se pidió hace menos de un minuto, desde aquí o desde otro aparato).
  codigoReciente: "Ya te mandamos un código hace poco: revisa tu correo.",
  codigoIncompleto: "Escribe los 6 números del código.",
  codigoVencido: "Ese código ya no sirve. Pide uno nuevo.",
  codigoSinPedir: "Pide un código nuevo para confirmar tu correo.",
  codigoNuevo: "Te mandamos un código nuevo. Usa el último que te llegó.",
  codigoNoEnviado: "No pudimos mandarte el código ahora. Intenta de nuevo en un minuto.",
  codigoNoProbado: "No pudimos revisar tu código ahora. Intenta de nuevo en un minuto.",
  entrarMal: "El correo o la contraseña no coinciden. Revísalos o recupera tu contraseña.",
  entrarLimite: "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
  entrarNoDisponible: "No pudimos entrar ahora. Intenta de nuevo en unos minutos.",
  // Su ficha se anonimizó (3 años sin comprar ni entrar, o lo pidió en tienda) y la cuenta se cerró: Términos del Club, 7; Privacidad, 6.
  cuentaCerrada: "Tu cuenta se cerró y borramos tus datos: pasaron 3 años sin compras ni entradas a tu cuenta, o lo pediste en una tienda CAYLA. Si quieres volver, crea una cuenta nueva.",
  olvideNoDisponible: "No pudimos mandarte el enlace ahora. Intenta de nuevo en unos minutos.",
  enlaceVencido: "El enlace venció o ya se usó. Pide otro: te llega en un momento.",
  claveIgual: "Esa ya era tu contraseña: entraste con ella.",
  claveNoDisponible: "No pudimos guardar tu contraseña ahora. Intenta de nuevo en unos minutos.",
} as const;

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

/** Lo que manda el formulario al crear la cuenta. El servidor no confía en nada de esto: lo revisa todo. */
export const esquemaRegistro = z.object({
  correo: z.string().max(400),
  clave: z.string().max(400),
  dni: z.string().max(40),
  celular: z.string().max(40),
  cumple: z.object({ d: z.string().max(4), m: z.string().max(4), a: z.string().max(8) }),
  mayor: z.boolean(),
  acepta: z.boolean(),
  avisos: z.boolean(),
});

/**
 * «Crear mi cuenta»: el registro y la versión de la casilla de los avisos que la persona leyó (null si no se le mostró). El código
 * NO viaja aquí: se confirmó antes, bajo el correo, y lo que el servidor exige es la prueba firmada de este aparato.
 */
export const esquemaCrearCuenta = z.object({ registro: esquemaRegistro, casilla: z.number().int().positive().nullable() });

export type ProblemaRegistro = { campo: CampoProblema | null; mensaje: string };

/** La misma regla de la pantalla, para el servidor: el primer problema, o null si se puede seguir. */
export function problemaRegistro(r: Registro, hoy: Dia): ProblemaRegistro | null {
  if (!correoValido(r.correo)) return { campo: "correo", mensaje: MENSAJES.correoMal };
  if (estadoClave(r.clave) !== "ok") return { campo: "clave", mensaje: r.clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : MENSAJES.claveAyuda };
  if (!/^\d{8}$/.test(r.dni)) return { campo: "dni", mensaje: "El DNI tiene 8 dígitos." };
  if (estadoCelular(r.celular) !== "ok") return { campo: "cel", mensaje: "El celular tiene 9 dígitos y empieza en 9." };
  const cumple = estadoCumple(r.cumple, hoy);
  if (cumple.estado !== "ok") return { campo: "cumple", mensaje: cumple.motivo === "menor" ? MENSAJES.cumpleMenor : MENSAJES.cumpleMal };
  if (!r.mayor) return { campo: "mayor", mensaje: MENSAJES.mayorFalta };
  if (!r.acepta) return { campo: "acepta", mensaje: MENSAJES.aceptaFalta };
  return null;
}

/* ------------------------------------------------------------------ Lo que contesta la base */

const CAMPO_DE_LA_BASE: Record<string, CampoRegistro> = {
  correo: "correo",
  dni: "dni",
  // El nombre sale del DNI (no hay caja de nombre): lo que diga la base del nombre se dice en el DNI.
  nombre: "dni",
  celular: "cel",
  cumple: "cumple",
  mayor: "mayor",
  acepta: "acepta",
};

/** El rechazo de `tienda_registrar_cuenta` (su hint y su detail) en palabras para la persona, con el campo al que lleva. */
export function errorDeRegistro(hint: string | null | undefined, detalle: string | null | undefined): ProblemaRegistro {
  switch (hint) {
    case "cuenta_correo_repetido":
      return { campo: "correo", mensaje: MENSAJES.correoRepetido };
    // El correo de otra ficha o de la cuenta web de otra ficha (el disparador `fn_correo_de_una_persona`, 20261015054000): lo dice
    // antes `tienda_revisar_registro`; esto es la red si otra persona lo tomó entre el código y «Crear mi cuenta».
    case "correo_repetido":
      return { campo: "correo", mensaje: MENSAJES.correoDeOtraPersona };
    case "cuenta_dni_repetido":
      return { campo: "dni", mensaje: MENSAJES.dniRepetido };
    case "cuenta_archivada":
      return { campo: "dni", mensaje: MENSAJES.dniArchivada };
    case "cuenta_menor":
      return { campo: "cumple", mensaje: MENSAJES.cumpleMenor };
    case "cuenta_sin_codigo":
      return { campo: "codigo", mensaje: MENSAJES.codigoSinPedir };
    case "cuenta_texto_cambio":
    case "cuenta_sin_texto":
      return { campo: "avisos", mensaje: MENSAJES.avisosCambio };
    // La base no encontró la lectura del padrón del nombre (20261015133000): no se pudo anotar, o venció. Se vuelve a intentar.
    case "nombre_sin_padron":
      return { campo: "dni", mensaje: MENSAJES.dniSinPadron };
    case "cuenta_datos_invalidos": {
      // Un problema con el nombre (falta el del padrón) se dice en el DNI, con su propio mensaje.
      if (detalle === "nombre") return { campo: "dni", mensaje: MENSAJES.dniSinPadron };
      const campo = CAMPO_DE_LA_BASE[detalle ?? ""] ?? null;
      const mensajes: Partial<Record<CampoRegistro, string>> = {
        correo: MENSAJES.correoMal,
        dni: "El DNI tiene 8 dígitos.",
        cel: "El celular tiene 9 dígitos y empieza en 9.",
        cumple: MENSAJES.cumpleMal,
        mayor: MENSAJES.mayorFalta,
        acepta: MENSAJES.aceptaFalta,
      };
      return { campo, mensaje: (campo && mensajes[campo]) || MENSAJES.noDisponible };
    }
    default:
      return { campo: null, mensaje: MENSAJES.noDisponible };
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

/** Cómo quedaron los avisos al crear la cuenta (`avisos_whatsapp` de `tienda_registrar_cuenta`). */
export type AvisosAlCrear = "no" | "activados" | "ya_estaban" | "celular_distinto";

/** El aviso con el que llega a «Mi cuenta» (`?aviso=`): unida a su ficha o nueva, y si los avisos quedaron sin activar. */
export function avisoAlCrear(seUnioASuFicha: boolean, avisos: AvisosAlCrear): string {
  if (avisos === "celular_distinto") return "avisos-sin-activar";
  return seUnioASuFicha ? "unida" : "bienvenida";
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

/** «S/ 20»; con céntimos, «S/ 25.50». */
export const soles = (monto: number) => `S/ ${Number.isInteger(monto) ? String(monto) : monto.toFixed(2)}`;

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
