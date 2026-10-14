import { nombreAMedias, nombresYApellidos } from "@cayla-retail/shared";
import { z } from "zod";

// Las reglas de la cuenta de la tienda online (ADR-0408, actividad 2). Lo que la página de registro dice de cada campo (falta,
// mal, repetido, listo), la sugerencia de «gmial.com», el cumpleaños como lo guarda el Club, lo que el servidor vuelve a
// revisar antes de crear nada, y cómo se leen las respuestas de la base. Lógica pura, sin red: la usan el formulario
// (navegador), las acciones (servidor) y sus pruebas. Sale de la maqueta aprobada (`docs/maquetas/tienda-online-2026-10`:
// `estadoRegistro`, `ARREGLOS_CORREO`, `guiaRegistro`, `vEntrar`, `vOlvide`).
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
  dni: string;
  /** Solo cuando el padrón no dio el nombre: lo escribe la persona. */
  nombre: string;
  celular: string;
  cumple: Cumple;
  acepta: boolean;
};

export const REGISTRO_VACIO: Registro = { correo: "", clave: "", dni: "", nombre: "", celular: "", cumple: { d: "", m: "", a: "" }, acepta: false };

/** Lo que dijo la base del correo mientras se escribía. `sin_revisar`: todavía no se preguntó (o no contestó). */
export type ConsultaCorreo = "sin_revisar" | "libre" | "repetido";

/** Lo que dijo el servidor del DNI. `sin_nombre`: el DNI está libre pero el nombre lo escribe la persona. */
export type ConsultaDni =
  | { estado: "sin_revisar" }
  | { estado: "buscando" }
  | { estado: "encontrado"; aMedias: string; delClub: boolean }
  | { estado: "sin_nombre"; motivo: "no_encontrado" | "sin_padron" | "limite"; delClub: boolean }
  | { estado: "repetido" }
  | { estado: "archivada" };

export type CampoRegistro = "correo" | "clave" | "dni" | "nombre" | "cel" | "cumple" | "acepta";
export type EstadoCampo = "falta" | "mal" | "repetido" | "buscando" | "ok";

/** El orden de la página y cómo se nombra cada campo en «Falta: …». */
export const CAMPOS_REGISTRO: readonly (readonly [CampoRegistro, string])[] = [
  ["correo", "tu correo"],
  ["clave", "tu contraseña"],
  ["dni", "tu DNI"],
  ["nombre", "tu nombre"],
  ["cel", "tu celular"],
  ["cumple", "tu cumpleaños"],
  ["acepta", "aceptar los términos"],
];

export function estadoCorreo(correo: string, consulta: ConsultaCorreo): EstadoCampo {
  const c = normalizarCorreo(correo);
  if (!c) return "falta";
  if (!correoValido(c)) return (c.split("@")[1] ?? "").includes(".") ? "mal" : "falta";
  return consulta === "repetido" ? "repetido" : "ok";
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

export function estadoDni(dni: string, consulta: ConsultaDni): EstadoCampo {
  if (!/^\d{8}$/.test(dni)) return "falta";
  switch (consulta.estado) {
    case "repetido":
      return "repetido";
    case "archivada":
      return "mal";
    case "encontrado":
    case "sin_nombre":
      return "ok";
    default:
      return "buscando";
  }
}

/** El nombre escrito a mano: solo hace falta si el padrón no lo dio. */
export const pideNombre = (consulta: ConsultaDni) => consulta.estado === "sin_nombre";

export const nombreLimpio = (nombre: string) => nombre.replace(/\s+/g, " ").trim();

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

export function estadoNombre(nombre: string, consulta: ConsultaDni): EstadoCampo {
  if (!pideNombre(consulta)) return "ok";
  const n = nombreLimpio(nombre);
  if (n.length > 200) return "mal";
  return n.length >= 3 && /\p{L}/u.test(n) ? "ok" : "falta";
}

export type EstadoRegistro = Record<CampoRegistro, EstadoCampo> & { motivoCumple?: "fecha" | "menor" };

export function estadoRegistro(r: Registro, consultas: { correo: ConsultaCorreo; dni: ConsultaDni }, hoy: Dia): EstadoRegistro {
  const cumple = estadoCumple(r.cumple, hoy);
  return {
    correo: estadoCorreo(r.correo, consultas.correo),
    clave: estadoClave(r.clave),
    dni: estadoDni(r.dni, consultas.dni),
    nombre: estadoNombre(r.nombre, consultas.dni),
    cel: estadoCelular(r.celular),
    cumple: cumple.estado,
    motivoCumple: cumple.motivo,
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
  claveAyuda: "8 caracteres o más. Solo tú la sabes.",
  claveLarga: "Tu contraseña puede tener hasta 72 caracteres.",
  dniAyuda: "Buscamos tu nombre solo, para tu boleta. Cada DNI tiene una sola cuenta.",
  dniBuscando: "Buscando tu nombre…",
  dniRepetido: "Ya hay una cuenta con este DNI.",
  dniArchivada: "Para crear tu cuenta necesitamos revisar tus datos en tienda: acércate a cualquier tienda CAYLA.",
  dniDelClub: "Ya eras del Club CAYLA: tu cuenta se une a tu ficha",
  dniNoEncontrado: "No encontramos tu nombre con ese DNI. Revisa el número; si está bien, escribe tu nombre abajo.",
  dniSinPadron: "No pudimos buscar tu nombre ahora. Escríbelo abajo, tal como está en tu DNI.",
  dniLimite: "Hiciste muchas búsquedas seguidas. Escribe tu nombre abajo, tal como está en tu DNI.",
  nombreAyuda: "Tal como está en tu DNI: así sale en tu boleta.",
  celAyuda: "Por aquí te escribe la tienda por tus pedidos y te llegan los avisos del club. Sin publicidad.",
  celMal: "El celular empieza en 9.",
  cumpleAyuda: "Día y mes; el año es opcional. Es para tu descuento de cumpleaños.",
  cumpleMal: "Revisa el día, el mes (del 1 al 12) y el año.",
  cumpleMenor: "El Club CAYLA es para mayores de 18 años.",
  aceptaFalta: "Para crear tu cuenta, acepta la política de privacidad y los términos del club.",
  noDisponible: "No pudimos crear tu cuenta ahora. Intenta de nuevo en unos minutos.",
  limite: "Hiciste muchos intentos seguidos. Espera un rato y vuelve a intentarlo.",
  entrarMal: "El correo o la contraseña no coinciden. Revísalos o recupera tu contraseña.",
  entrarLimite: "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
  entrarNoDisponible: "No pudimos entrar ahora. Intenta de nuevo en unos minutos.",
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

/* ------------------------------------------------------------------ Lo que el servidor vuelve a revisar */

/** Lo que manda el formulario al crear la cuenta. El servidor no confía en nada de esto: lo vuelve a revisar todo. */
export const esquemaRegistro = z.object({
  correo: z.string().max(400),
  clave: z.string().max(400),
  dni: z.string().max(40),
  nombre: z.string().max(400),
  celular: z.string().max(40),
  cumple: z.object({ d: z.string().max(4), m: z.string().max(4), a: z.string().max(8) }),
  acepta: z.boolean(),
});

export type ProblemaRegistro = { campo: CampoRegistro | null; mensaje: string };

/** La misma regla de la pantalla, para el servidor: el primer problema, o null si se puede seguir. */
export function problemaRegistro(r: Registro, hoy: Dia): ProblemaRegistro | null {
  if (!correoValido(r.correo)) return { campo: "correo", mensaje: MENSAJES.correoMal };
  if (estadoClave(r.clave) !== "ok") return { campo: "clave", mensaje: r.clave.length > CLAVE_MAXIMA ? MENSAJES.claveLarga : MENSAJES.claveAyuda };
  if (!/^\d{8}$/.test(r.dni)) return { campo: "dni", mensaje: "El DNI tiene 8 dígitos." };
  if (nombreLimpio(r.nombre).length > 200) return { campo: "nombre", mensaje: "El nombre es demasiado largo." };
  if (estadoCelular(r.celular) !== "ok") return { campo: "cel", mensaje: "El celular tiene 9 dígitos y empieza en 9." };
  const cumple = estadoCumple(r.cumple, hoy);
  if (cumple.estado !== "ok") return { campo: "cumple", mensaje: cumple.motivo === "menor" ? MENSAJES.cumpleMenor : MENSAJES.cumpleMal };
  if (!r.acepta) return { campo: "acepta", mensaje: MENSAJES.aceptaFalta };
  return null;
}

/* ------------------------------------------------------------------ Lo que contesta la base */

const CAMPO_DE_LA_BASE: Record<string, CampoRegistro> = { correo: "correo", dni: "dni", nombre: "nombre", celular: "cel", cumple: "cumple", acepta: "acepta" };

/** El rechazo de `tienda_registrar_cuenta` (su hint y su detail) en palabras para la persona, con el campo al que lleva. */
export function errorDeRegistro(hint: string | null | undefined, detalle: string | null | undefined): ProblemaRegistro {
  switch (hint) {
    case "cuenta_correo_repetido":
      return { campo: "correo", mensaje: MENSAJES.correoRepetido };
    case "cuenta_dni_repetido":
      return { campo: "dni", mensaje: MENSAJES.dniRepetido };
    case "cuenta_archivada":
      return { campo: "dni", mensaje: MENSAJES.dniArchivada };
    case "cuenta_menor":
      return { campo: "cumple", mensaje: MENSAJES.cumpleMenor };
    case "cuenta_datos_invalidos": {
      const campo = CAMPO_DE_LA_BASE[detalle ?? ""] ?? null;
      const mensajes: Partial<Record<CampoRegistro, string>> = {
        correo: MENSAJES.correoMal,
        dni: "El DNI tiene 8 dígitos.",
        nombre: "Escribe tus nombres y apellidos, tal como están en tu DNI.",
        cel: "El celular tiene 9 dígitos y empieza en 9.",
        cumple: MENSAJES.cumpleMal,
        acepta: MENSAJES.aceptaFalta,
      };
      return { campo, mensaje: (campo && mensajes[campo]) || MENSAJES.noDisponible };
    }
    default:
      return { campo: null, mensaje: MENSAJES.noDisponible };
  }
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
