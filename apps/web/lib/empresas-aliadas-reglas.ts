import { soloDigitos, validarDocumento } from "@cayla-retail/shared";
import type { CampoDeGuia } from "@/lib/guia-campos";

// Empresas aliadas (ADR-0683): otra dueña que vende en las tiendas de CAYLA con su propio RUC (hoy CLAURE en Lima). Esta es la lógica pura de su hoja en
// Configuración ▸ Empresa y tiendas: qué se lee de la base, qué falta para guardar y qué se le manda a `guardar_empresa_aliada`. Las mismas reglas las hace
// cumplir la base (la migración 20261121152000); aquí solo se dicen antes, en el campo.

export type Regimen = "nuevo_rus" | "rer" | "mype" | "general";
export type MedioCuenta = "yape" | "plin" | "transferencia";

export const REGIMENES: readonly { valor: Regimen; nombre: string }[] = [
  { valor: "nuevo_rus", nombre: "Nuevo RUS" },
  { valor: "rer", nombre: "Régimen Especial" },
  { valor: "mype", nombre: "MYPE Tributario" },
  { valor: "general", nombre: "General" },
];

export const MEDIOS: readonly { valor: MedioCuenta; nombre: string }[] = [
  { valor: "yape", nombre: "Yape" },
  { valor: "plin", nombre: "Plin" },
  { valor: "transferencia", nombre: "Cuenta bancaria" },
];

/** En una línea, lo que el régimen deja hacer. */
export function lineaDelRegimen(r: Regimen | null): string | null {
  if (r === "nuevo_rus") return "Solo boletas, en una sola tienda.";
  return r ? "Puede dar boleta y factura." : null;
}

export type CuentaAliada = {
  id: string | null;
  medio: MedioCuenta;
  banco: string;
  numero: string;
  quitar?: boolean;
  /** Ya existía sin número (la «Yape de Claudia · LIM» de CLAURE, ADR-0638). Mientras siga sin número no se pide, no se renombra ni se archiva:
   *  no viaja a la base (Felipe 2026-11-22, camino «b» de /formidable). */
  sinNumeroDeOrigen?: boolean;
};

/** Una fila que no hay que mirar: la nueva que se abrió y quedó vacía (la base ya la ignora) o la que ya venía sin número y sigue igual. */
export function cuentaQueNoCuenta(c: CuentaAliada): boolean {
  if (c.quitar) return false;
  const vacia = c.numero.trim() === "" && c.banco.trim() === "";
  if (c.id === null) return vacia;
  return Boolean(c.sinNumeroDeOrigen) && c.numero.trim() === "";
}

export type EmpresaAliada = {
  id: string;
  clave: string;
  nombre: string;
  ruc: string | null;
  razonSocial: string | null;
  regimen: Regimen | null;
  correo: string | null;
  telefono: string | null;
  sedes: { id: string; nombre: string }[];
  cuentas: {
    id: string;
    medio: MedioCuenta;
    nombre: string;
    numero: string | null;
    banco: string | null;
  }[];
  /** El día en que se aplica la baja pedida (AAAA-MM-DD), o null. */
  bajaEl: string | null;
  /** Por qué no se pudo aplicar la baja (todavía tiene prendas), o null. */
  bajaDetenida: string | null;
  /** Sus prendas pueden entrar a una campaña de CAYLA que incluya a las aliadas (ADR-0683, actividad 5). Nace apagado. */
  entraACampanas: boolean;
  /** Su domicilio fiscal (sale en su boleta, fase 2), o null. */
  domicilioFiscal: string | null;
  /** Cómo está su conexión con Lucode. Solo llega al Admin y solo si la base ya tiene 20261122213000; si no, `null` y no se ofrece. La llave
   *  nunca llega: solo sus 4 últimos caracteres. */
  comprobantes: ConexionLucode | null;
};

export type EstadoLucode = "sin_llave" | "sin_probar" | "conectada" | "rechazada";
export type ConexionLucode = { estado: EstadoLucode; termina: string | null; probadaEn: string | null };

const ESTADOS_LUCODE: readonly EstadoLucode[] = ["sin_probar", "conectada", "rechazada"];

/** Lo que trae `comprobantes` de `fn_empresas_aliadas` (20261122213000). Sin llave guardada, «sin_llave». */
export function leerConexionLucode(crudo: unknown): ConexionLucode | null {
  if (!crudo || typeof crudo !== "object") return null;
  const c = crudo as { estado?: unknown; termina?: unknown; probada_en?: unknown };
  const estado = ESTADOS_LUCODE.includes(c.estado as EstadoLucode) ? (c.estado as EstadoLucode) : "sin_llave";
  return { estado, termina: estado === "sin_llave" ? null : texto(c.termina), probadaEn: texto(c.probada_en) };
}

/** El chip de la tarjeta: cómo está la conexión con Lucode, en palabras de tienda. */
export function chipLucode(c: ConexionLucode): { texto: string; tono: "verde" | "ambar" | "rojo" | "pizarra" } {
  if (c.estado === "conectada") return { texto: `Lucode conectado · …${c.termina ?? ""}`, tono: "verde" };
  if (c.estado === "rechazada") return { texto: "Lucode rechazó la llave", tono: "rojo" };
  if (c.estado === "sin_probar") return { texto: `Lucode sin probar · …${c.termina ?? ""}`, tono: "ambar" };
  return { texto: "Sin conexión con Lucode", tono: "pizarra" };
}

/** Lo mismo que pide la base (20261122213000): entera, sin espacios, de 20 a 500 caracteres. Vacía = no se cambia. */
export function problemaLlaveLucode(llave: string): string | null {
  const l = llave.trim();
  if (!l) return null;
  if (/\s/.test(l) || l.length < 20 || l.length > 500) return "Esa no parece una llave de Lucode: cópiala entera, sin espacios.";
  return null;
}

export type LecturaAliadas = { puedeEditar: boolean; aliadas: EmpresaAliada[] };

const comoRegimen = (x: unknown): Regimen | null => (REGIMENES.some((r) => r.valor === x) ? (x as Regimen) : null);
const comoMedio = (x: unknown): MedioCuenta => (MEDIOS.some((m) => m.valor === x) ? (x as MedioCuenta) : "yape");
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);

/** Lo que devuelve `fn_empresas_aliadas()` (jsonb) a tipos de la pantalla. Lo que no entiende lo descarta, nunca se cae. */
export function leerAliadas(crudo: unknown): LecturaAliadas {
  const r = (crudo ?? {}) as { puede_editar?: unknown; aliadas?: unknown };
  const lista = Array.isArray(r.aliadas) ? r.aliadas : [];
  return {
    puedeEditar: r.puede_editar === true,
    aliadas: lista
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof (a as { id?: unknown }).id === "string")
      .map((a) => ({
        id: a.id as string,
        clave: texto(a.clave) ?? "",
        nombre: texto(a.nombre) ?? "Sin nombre",
        ruc: texto(a.ruc),
        razonSocial: texto(a.razon_social),
        regimen: comoRegimen(a.regimen),
        correo: texto(a.correo),
        telefono: texto(a.telefono),
        sedes: (Array.isArray(a.sedes) ? a.sedes : []).map((s: { id?: unknown; nombre?: unknown }) => ({
          id: String(s.id),
          nombre: texto(s.nombre) ?? "",
        })),
        cuentas: (Array.isArray(a.cuentas) ? a.cuentas : []).map(
          (c: { id?: unknown; medio?: unknown; nombre?: unknown; numero?: unknown; banco?: unknown }) => ({
            id: String(c.id),
            medio: comoMedio(c.medio),
            nombre: texto(c.nombre) ?? "",
            numero: texto(c.numero),
            banco: texto(c.banco),
          }),
        ),
        bajaEl: texto(a.baja_el),
        bajaDetenida: texto(a.baja_detenida),
        entraACampanas: a.entra_a_campanas === true,
        domicilioFiscal: texto(a.domicilio_fiscal),
        comprobantes: leerConexionLucode(a.comprobantes),
      })),
  };
}

/** Lo que le falta a una aliada para vender con sus datos completos, en una frase («Falta RUC y régimen»), o null si no le falta nada.
 *  Lo mismo que pide la hoja para guardar una nueva: RUC, régimen y tiendas (CLAURE nació antes de la hoja, sin RUC ni régimen). */
export function fraseDeAliada(a: Pick<EmpresaAliada, "ruc" | "regimen" | "sedes">): string | null {
  const f = [!a.ruc && "RUC", !a.regimen && "régimen", a.sedes.length === 0 && "tiendas"].filter((x): x is string => Boolean(x));
  if (!f.length) return null;
  return `Falta ${f.length > 1 ? `${f.slice(0, -1).join(", ")} y ${f[f.length - 1]}` : f[0]}`;
}

/** La línea bajo el nombre: la razón social solo si dice algo distinto del nombre, y el RUC si lo tiene. */
export function rotuloDeAliada(a: Pick<EmpresaAliada, "nombre" | "ruc" | "razonSocial">): string | null {
  const igual = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const razon = a.razonSocial && igual(a.razonSocial) !== igual(a.nombre) ? a.razonSocial : null;
  const partes = [razon, a.ruc ? `RUC ${a.ruc}` : null].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** «Yape ··· 010» o «BCP ··· 045»: la cuenta sin mostrar su número entero. */
export function etiquetaCuenta(c: { medio: MedioCuenta; banco?: string | null; numero?: string | null }): string {
  const d = soloDigitos(c.numero ?? "");
  const fin = d ? ` ··· ${d.slice(-3)}` : "";
  const nombre = c.medio === "transferencia" ? c.banco?.trim() || "Banco" : c.medio === "yape" ? "Yape" : "Plin";
  return nombre + fin;
}

export type BorradorAliada = {
  id: string | null;
  nombre: string;
  ruc: string;
  razonSocial: string;
  regimen: Regimen | null;
  correo: string;
  telefono: string;
  sedes: string[];
  cuentas: CuentaAliada[];
};

export const BORRADOR_ALIADA_VACIO: BorradorAliada = {
  id: null,
  nombre: "",
  ruc: "",
  razonSocial: "",
  regimen: null,
  correo: "",
  telefono: "",
  sedes: [],
  cuentas: [],
};

export function borradorDeAliada(a: EmpresaAliada): BorradorAliada {
  return {
    id: a.id,
    nombre: a.nombre,
    ruc: a.ruc ?? "",
    razonSocial: a.razonSocial ?? "",
    regimen: a.regimen,
    correo: a.correo ?? "",
    telefono: a.telefono ?? "",
    sedes: a.sedes.map((s) => s.id),
    cuentas: a.cuentas.map((c) => ({
      id: c.id,
      medio: c.medio,
      banco: c.banco ?? "",
      numero: c.numero ?? "",
      sinNumeroDeOrigen: !c.numero,
    })),
  };
}

export const LARGO_NOMBRE_ALIADA = 40;

/** Por qué no sirve una cuenta, o null. Las mismas reglas que `guardar_empresa_aliada`. */
export function problemaCuenta(c: CuentaAliada): string | null {
  if (c.quitar) return null;
  if (c.medio === "transferencia") {
    if (!c.banco.trim()) return "Escribe el banco de la cuenta.";
    if (c.banco.trim().length > 30) return "El banco tiene hasta 30 letras.";
    if (!/^[0-9][0-9 -]{4,38}[0-9]$/.test(c.numero.trim())) return "Escribe el número de cuenta o el CCI.";
    return null;
  }
  const d = soloDigitos(c.numero);
  if (!/^9\d{8}$/.test(d)) return `El celular del ${c.medio === "yape" ? "Yape" : "Plin"} tiene 9 dígitos y empieza con 9.`;
  return null;
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Problema de cada campo de la hoja (null si está bien). `rucDeCasa`: el RUC de CAYLA, que una aliada no puede repetir. */
export function problemasAliada(
  b: BorradorAliada,
  otrosRuc: readonly string[],
  rucDeCasa: string | null,
): Record<"nombre" | "ruc" | "regimen" | "sedes" | "correo" | "telefono" | "cuentas", string | null> {
  const ruc = soloDigitos(b.ruc);
  const cuentas = b.cuentas.filter((c) => !c.quitar && !cuentaQueNoCuenta(c));
  const problemaRuc = !ruc
    ? "Escribe los 11 dígitos del RUC."
    : validarDocumento("ruc", ruc).valido === false
      ? "Ese RUC no es válido: revisa los 11 dígitos."
      : rucDeCasa && soloDigitos(rucDeCasa) === ruc
        ? "Ese es el RUC de CAYLA."
        : otrosRuc.includes(ruc)
          ? "Ya hay una empresa aliada con ese RUC."
          : null;
  return {
    nombre: !b.nombre.trim()
      ? "Escribe cómo se llama en la tienda."
      : b.nombre.trim().length > LARGO_NOMBRE_ALIADA
        ? `Hasta ${LARGO_NOMBRE_ALIADA} letras.`
        : null,
    ruc: problemaRuc,
    regimen: b.regimen ? null : "Elige su régimen.",
    sedes:
      b.sedes.length === 0
        ? "Elige al menos una tienda."
        : b.regimen === "nuevo_rus" && b.sedes.length > 1
          ? "Un Nuevo RUS vende en un solo local: elige una tienda."
          : null,
    correo: b.correo.trim() && !CORREO.test(b.correo.trim()) ? "Ese correo no se ve bien escrito." : null,
    telefono: b.telefono.trim() && !/^\+?[0-9 ]{6,20}$/.test(b.telefono.trim()) ? "Ese teléfono no se ve bien escrito." : null,
    cuentas: cuentas.length > 10 ? "Se guardan hasta 10 cuentas." : (cuentas.map(problemaCuenta).find((p) => p !== null) ?? null),
  };
}

/** Los campos de la guía de foco: lo mismo que la validación, en el orden de la hoja. Correo, teléfono y cuentas son opcionales. */
export function camposDeAliada(b: BorradorAliada, otrosRuc: readonly string[], rucDeCasa: string | null): CampoDeGuia[] {
  const p = problemasAliada(b, otrosRuc, rucDeCasa);
  const c = (id: keyof typeof p, nombre: string, requerido: boolean): CampoDeGuia => ({
    id,
    nombre,
    requerido,
    hecho: p[id] === null,
    pendiente: p[id] ?? "",
  });
  return [
    c("nombre", "Nombre", true),
    c("ruc", "RUC", true),
    c("regimen", "Régimen", true),
    c("sedes", "Tiendas", true),
    // Opcionales: vacíos no llevan marca (ni ✓ ni «falta»); llenos y bien, su ✓; mal escritos, sí impiden guardar (la base los rechaza).
    {
      ...c("correo", "Correo", false),
      requerido: p.correo !== null,
      hecho: p.correo === null && b.correo.trim() !== "",
    },
    {
      ...c("telefono", "Teléfono", false),
      requerido: p.telefono !== null,
      hecho: p.telefono === null && b.telefono.trim() !== "",
    },
    {
      ...c("cuentas", "Cuentas para cobrar", false),
      requerido: p.cuentas !== null,
      hecho: p.cuentas === null && b.cuentas.some((x) => !x.quitar && !cuentaQueNoCuenta(x)),
    },
  ];
}

/** Lo que se le manda a `guardar_empresa_aliada`. Una cuenta vacía y nueva no viaja; una que ya existía y se vació, se quita. */
export function argsGuardarAliada(b: BorradorAliada) {
  return {
    p_id: b.id,
    p_nombre: b.nombre.trim(),
    p_ruc: soloDigitos(b.ruc),
    p_razon_social: b.razonSocial.trim() || null,
    p_regimen: b.regimen,
    p_correo: b.correo.trim() || null,
    p_telefono: b.telefono.trim() || null,
    p_sedes: b.sedes,
    p_cuentas: b.cuentas
      .filter((c) => (c.id !== null || (!c.quitar && c.numero.trim() !== "")) && !cuentaQueNoCuenta(c))
      .map((c) => ({
        id: c.id,
        medio: c.medio,
        banco: c.medio === "transferencia" ? c.banco.trim() : null,
        numero: c.medio === "transferencia" ? c.numero.trim() : soloDigitos(c.numero),
        quitar: Boolean(c.quitar) || (c.id !== null && c.numero.trim() === ""),
      })),
  };
}

/** La baja se confirma escribiendo el nombre tal cual (sin importar mayúsculas ni espacios de los bordes), como la base. */
export function confirmaLaBaja(nombre: string, escrito: string): boolean {
  return escrito.trim().toLowerCase() === nombre.trim().toLowerCase() && escrito.trim() !== "";
}

/** La baja se aplica 7 días después de pedirla: el día que se le dice a la persona antes de confirmar. */
export function diaDeLaBaja(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** El `hint` de un error de la base → el campo de la hoja donde se dice. */
export function campoDelError(hint: string | null | undefined): "nombre" | "ruc" | "regimen" | "sedes" | "correo" | "telefono" | "cuentas" | null {
  return hint === "nombre" || hint === "ruc" || hint === "regimen" || hint === "sedes" || hint === "correo" || hint === "telefono" || hint === "cuentas"
    ? hint
    : null;
}

// ---- La cuenta con cada dueña (ADR-0683, actividad 3) ----------------------------------------------------------------------------------------------

/** A qué aliada va un pago o el efectivo que se queda la dueña al cerrar: viaja en un encabezado, como el responsable y el dueño de una prenda.
 *  Lo lee el disparador de `movimientos_dinero` y de `caja_traslados` (`fn_aliada_de_la_llamada`); sin él, la base usa la única aliada con cuenta. */
export const ENCABEZADO_ALIADA = "x-aliada";

/** Pone la aliada en una consulta de supabase-js (`.rpc(...)`). Sin aliada, la consulta sale como antes. */
export function conAliada<C extends { setHeader(nombre: string, valor: string): C }>(consulta: C, aliadaId: string | null | undefined): C {
  return aliadaId ? consulta.setHeader(ENCABEZADO_ALIADA, aliadaId) : consulta;
}

/** Cómo se nombra a una aliada en pantalla: la empresa y quien recibe su plata. CLAURE conserva «Claudia» (su dueña); otra, su propio nombre. */
export type Quien = { nombre: string; duena: string };
export const QUIEN_CLAURE: Quien = { nombre: "CLAURE", duena: "Claudia" };
export function quienDe(a: { clave: string; nombre: string }): Quien {
  return a.clave === "claure" ? { nombre: a.nombre || QUIEN_CLAURE.nombre, duena: QUIEN_CLAURE.duena } : { nombre: a.nombre, duena: a.nombre };
}

/**
 * Cómo se nombra a las aliadas en un texto que habla de todas a la vez (lo vendido de aliadas en Impuestos, lo que se le debe en Dónde está): la única
 * que hay con su dueña; sin ninguna, CLAURE (como antes); con varias, «las empresas aliadas» y «sus dueñas».
 */
export function quienDeVarias(aliadas: readonly { clave: string; nombre: string }[] | null | undefined): Quien {
  if (!aliadas || aliadas.length === 0) return QUIEN_CLAURE;
  if (aliadas.length === 1) return quienDe(aliadas[0]!);
  return { nombre: "las empresas aliadas", duena: "sus dueñas" };
}

/**
 * Los textos de la cuenta nacieron para CLAURE («le debes a CLAURE», «lo tiene Claudia»). Se dicen para la aliada que se mira cambiando esas dos palabras
 * en un solo lugar, a la salida: las reglas que los arman (y sus pruebas) no cambian. Con CLAURE no cambia nada.
 */
export function deAliada(texto: string, q: Quien): string {
  if (q.nombre === QUIEN_CLAURE.nombre && q.duena === QUIEN_CLAURE.duena) return texto;
  return texto.replaceAll("CLAURE", q.nombre).replaceAll("Claudia", q.duena);
}

/** Las aliadas con cuenta (las pestañas de Cuentas y dinero), de `fn_aliadas_con_cuenta`. */
export type AliadaConCuenta = { id: string; clave: string; nombre: string; desde: string | null };
export function leerAliadasConCuenta(crudo: unknown): AliadaConCuenta[] {
  return (Array.isArray(crudo) ? crudo : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && typeof (a as { id?: unknown }).id === "string")
    .map((a) => ({ id: a.id as string, clave: texto(a.clave) ?? "", nombre: texto(a.nombre) ?? "Sin nombre", desde: texto(a.desde) }));
}

/** La aliada que pide la dirección (`?empresa=<clave>`), o la primera. `null` si no hay ninguna con cuenta. */
export function aliadaDeLaUrl(aliadas: readonly AliadaConCuenta[], clave: string | null | undefined): AliadaConCuenta | null {
  return aliadas.find((a) => a.clave === clave) ?? aliadas[0] ?? null;
}

/** `deAliada` en todo texto de un objeto o lista (los avisos, el libro, los términos de la cuenta). Lo que no es texto queda igual. */
export function deAliadaEnTodo<T>(x: T, q: Quien): T {
  if (q.nombre === QUIEN_CLAURE.nombre && q.duena === QUIEN_CLAURE.duena) return x;
  if (typeof x === "string") return deAliada(x, q) as T;
  if (Array.isArray(x)) return x.map((v) => deAliadaEnTodo(v, q)) as T;
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, deAliadaEnTodo(v, q)])) as T;
  return x;
}

/** La hoja «Comprobantes» de una aliada (20261122213000): el domicilio y la llave de Lucode. Lo que guía: el domicilio es sugerido (sale en su
 *  boleta) y la llave, sugerida solo si todavía no tiene una; una llave mal copiada sí impide guardar (la base la rechaza). */
export function camposDeComprobantes(domicilio: string, llave: string, tieneLlave: boolean): CampoDeGuia[] {
  const problema = problemaLlaveLucode(llave);
  return [
    {
      id: "domicilio",
      nombre: "Domicilio fiscal",
      requerido: domicilio.trim().length > 200,
      sugerido: true,
      hecho: domicilio.trim() !== "" && domicilio.trim().length <= 200,
      pendiente: domicilio.trim().length > 200 ? "El domicilio va hasta en 200 letras." : "Escribe su domicilio fiscal.",
    },
    {
      id: "llave",
      nombre: "Llave de Lucode",
      requerido: problema !== null,
      sugerido: !tieneLlave,
      hecho: problema === null && llave.trim() !== "",
      pendiente: problema ?? "Pega la llave que te dio Lucode.",
    },
  ];
}

/** Qué decir tras «Probar conexión», según lo que respondió el servidor. */
export function fraseDePrueba(estado: "conectada" | "rechazada" | "sin_respuesta", entorno: "sandbox" | "produccion"): string {
  const donde = entorno === "produccion" ? "Lucode" : "el Lucode de pruebas";
  if (estado === "conectada") return `${donde} aceptó la llave.`;
  if (estado === "rechazada") return `${donde} rechazó la llave. Revisa que la copiaste entera.`;
  return "Lucode no respondió. La conexión quedó como estaba: prueba en un rato.";
}
