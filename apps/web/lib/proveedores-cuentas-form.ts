import { bancoDeCci, formatoCci, formatoCelular, normalizarCci, normalizarCelular, validarCci, validarCelular } from "./proveedores-reglas";

// La parte «Cómo pagarle» del formulario de proveedor (ADR-0129): CCI, celular Yape/Plin, apps y titular.
//
// Todo lo que decide algo vive acá, sin React ni red, para probarlo sin abrir la pantalla: qué se escribe
// mientras se teclea, qué está mal, si algo cambió y con qué argumentos se llama a la RPC
// `guardar_cuentas_proveedor` (reemplazo completo: NULL = vaciar). La base repite los mismos candados
// (proveedores_cci_formato, proveedores_billetera_coherente…); esto solo evita que el error llegue después de
// haber guardado el resto del proveedor.

export const BILLETERAS = ["yape", "plin"] as const;
export type Billetera = (typeof BILLETERAS)[number];

export const ETIQUETA_BILLETERA: Record<Billetera, string> = { yape: "Yape", plin: "Plin" };

/** Bancos comunes para sugerir en el campo «Banco» (texto libre: cualquier otro sigue valiendo). */
export const BANCOS_COMUNES = ["BCP", "Interbank", "BBVA", "Scotiabank", "Banco de la Nación", "BanBif", "Mibanco", "Pichincha"] as const;

/** Las cuatro columnas nuevas, tal como se escriben en el formulario (texto). */
export type CuentasForm = {
  cci: string;
  celularBilletera: string;
  billeteras: string[];
  titularCuenta: string;
};

export const CUENTAS_VACIAS: CuentasForm = { cci: "", celularBilletera: "", billeteras: [], titularCuenta: "" };

export const LARGO_TITULAR = { min: 2, max: 120 } as const;

/** De la fila de la base (lista o ficha) al formulario: CCI y celular con su formato legible. */
export function cuentasDeFila(p: { cci: string | null; celular_billetera: string | null; billeteras: string[] | null; titular_cuenta: string | null }): CuentasForm {
  return {
    cci: p.cci ? formatoCci(p.cci) : "",
    celularBilletera: p.celular_billetera ? formatoCelular(p.celular_billetera) : "",
    billeteras: (p.billeteras ?? []).filter((b): b is Billetera => b === "yape" || b === "plin"),
    titularCuenta: p.titular_cuenta ?? "",
  };
}

// ---------------------------------------------------------------------------
// Al escribir
// ---------------------------------------------------------------------------

/**
 * Lo que queda en el campo CCI al teclear o pegar: «002 193 002145678045 58» → «002-193-002145678045-58».
 * Si lo escrito no se puede formatear sin esconder un problema (letras, o más de 20 dígitos) se deja tal cual,
 * para que `validarCci` lo diga: recortar en silencio un CCI de 22 dígitos dejaría pasar un número equivocado.
 */
export function escribirCci(crudo: string): string {
  if (/[^\d\s.-]/.test(crudo)) return crudo;
  return normalizarCci(crudo).length <= 20 ? formatoCci(crudo) : crudo;
}

/** Igual para el celular: «+51 987654321» → «987 654 321». Con letras, o a medio escribir con «+», se deja tal cual. */
export function escribirCelular(crudo: string): string {
  if (/[^\d\s+()-]/.test(crudo)) return crudo;
  const d = normalizarCelular(crudo);
  if (d.length > 9) return crudo;
  // «+51 9» a medio teclear no es un celular de 3 dígitos que empieza con 51: se espera a tenerlo completo.
  if (/^\s*\+/.test(crudo) && d.length !== 9) return crudo;
  return formatoCelular(crudo);
}

/** El celular del campo «Teléfono» (WhatsApp) si sirve como celular de billetera; `null` si no es uno válido. */
export function celularDeTelefono(telefono: string): string | null {
  if (telefono.trim() === "" || validarCelular(telefono) !== null) return null;
  return formatoCelular(telefono);
}

// ---------------------------------------------------------------------------
// Banco que dice el CCI vs. banco escrito
// ---------------------------------------------------------------------------

// Cómo se escribe cada banco a mano. El CCI dice «BCP»; quien registra puede haber escrito «Banco de Crédito».
const ALIAS_BANCO: Record<string, string[]> = {
  BCP: ["bcp", "credito"],
  Interbank: ["interbank", "ibk"],
  Scotiabank: ["scotia"],
  BBVA: ["bbva", "continental"],
  "Banco de la Nación": ["nacion"],
  BanBif: ["banbif", "interamericano"],
  Mibanco: ["mibanco"],
  Pichincha: ["pichincha", "financiero"],
};

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** ¿Lo escrito en «Banco» es el banco `detectado` (BCP, Interbank…)? Sin tildes ni mayúsculas, y con sus otros nombres. */
export function bancoCoincide(escrito: string, detectado: string): boolean {
  const e = sinTildes(escrito);
  if (!e) return false;
  const alias = ALIAS_BANCO[detectado] ?? [sinTildes(detectado)];
  return alias.some((a) => e.includes(a)) || e.includes(sinTildes(detectado));
}

export type LecturaBanco = {
  /** El banco que dice el CCI, solo si el CCI está completo y es un código conocido. */
  detectado: string | null;
  /** Hay banco escrito y no es el que dice el CCI: aviso ámbar, nunca bloquea. */
  discrepa: boolean;
};

export function leerBancoDelCci(cci: string, banco: string): LecturaBanco {
  const detectado = validarCci(cci) === null && normalizarCci(cci).length === 20 ? bancoDeCci(cci) : null;
  return { detectado, discrepa: !!detectado && banco.trim() !== "" && !bancoCoincide(banco, detectado) };
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export type ErroresCuentas = Partial<Record<"cci" | "celular" | "billeteras" | "titular", string>>;

/** Mensajes por campo; objeto vacío = todo bien. Todo es opcional: vacío nunca es error. */
export function validarCuentas(f: CuentasForm): ErroresCuentas {
  const errores: ErroresCuentas = {};
  const cci = validarCci(f.cci);
  if (cci) errores.cci = cci;

  const celular = validarCelular(f.celularBilletera);
  if (celular) errores.celular = celular;

  // Regla de la base (proveedores_billetera_coherente): un celular sin app, o una app sin celular, no puede existir.
  const hayCelular = f.celularBilletera.trim() !== "";
  if (hayCelular && !celular && f.billeteras.length === 0) errores.billeteras = "Indica si ese celular es Yape, Plin o ambos.";
  if (!hayCelular && f.billeteras.length > 0) errores.celular = "Escribe el celular de la billetera, o quita Yape / Plin.";

  const largo = f.titularCuenta.trim().length;
  if (largo > 0 && largo < LARGO_TITULAR.min) errores.titular = `El titular tiene que tener al menos ${LARGO_TITULAR.min} letras.`;
  if (largo > LARGO_TITULAR.max) errores.titular = `El titular admite hasta ${LARGO_TITULAR.max} caracteres (llevas ${largo}).`;
  return errores;
}

/** El primer campo con problema, en el orden en que aparecen en pantalla, para llevar el cursor ahí. */
export function primerErrorCuentas(e: ErroresCuentas): { campo: keyof ErroresCuentas; mensaje: string } | null {
  for (const campo of ["cci", "celular", "billeteras", "titular"] as const) {
    const mensaje = e[campo];
    if (mensaje) return { campo, mensaje };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Qué cambió y qué se manda
// ---------------------------------------------------------------------------

/** La forma en que la base lo guarda: sin formato, sin espacios, apps ordenadas y sin repetir. */
function canonica(f: CuentasForm) {
  return {
    cci: normalizarCci(f.cci),
    celular: normalizarCelular(f.celularBilletera),
    billeteras: [...new Set(f.billeteras)].sort(),
    titular: f.titularCuenta.trim().replace(/\s+/g, " "),
  };
}

/** ¿Hay algo escrito en las cuatro columnas? */
export function hayCuentas(f: CuentasForm): boolean {
  const c = canonica(f);
  return c.cci !== "" || c.celular !== "" || c.billeteras.length > 0 || c.titular !== "";
}

/**
 * ¿Cambió algo respecto al borrador con el que se abrió el formulario? Se compara lo que la base guardaría
 * (no el formato): «987 654 321» y «987654321» son lo mismo. Si no cambió nada, no se llama a la RPC — así un líder
 * que solo corrige el nombre no reescribe las cuentas de un proveedor.
 */
export function cuentasCambiaron(inicial: CuentasForm, actual: CuentasForm): boolean {
  return JSON.stringify(canonica(inicial)) !== JSON.stringify(canonica(actual));
}

/**
 * ¿Hay que llamar a `guardar_cuentas_proveedor`? En una edición, solo si algo cambió; en un alta, solo si se
 * escribió algo (la RPC no tiene nada que vaciar en un proveedor recién creado).
 */
export function hayQueGuardarCuentas(inicial: CuentasForm, actual: CuentasForm, esAlta: boolean): boolean {
  return esAlta ? hayCuentas(actual) : cuentasCambiaron(inicial, actual);
}

/**
 * Argumentos de la RPC. Reemplazo completo: lo vacío se manda como `undefined` (la RPC lo toma como NULL y lo
 * vacía). Mismo criterio que el resto del formulario (`p_contacto: contacto.trim() || undefined`).
 */
export function argsGuardarCuentas(proveedorId: string, f: CuentasForm) {
  const c = canonica(f);
  return {
    p_proveedor_id: proveedorId,
    p_cci: c.cci || undefined,
    p_celular_billetera: c.celular || undefined,
    // Sin celular no hay apps: la base rechaza una app sin número.
    p_billeteras: c.celular && c.billeteras.length > 0 ? c.billeteras : undefined,
    p_titular_cuenta: c.titular || undefined,
  };
}

/** El aviso cuando el proveedor quedó guardado pero sus cuentas no (el paso 2 falló). */
export function avisoCuentasNoGuardadas(mensaje: string): string {
  const limpio = mensaje.trim().replace(/\.+$/, "");
  return `Se guardó el proveedor, pero no las cuentas: ${limpio}. Corrígelas y guarda de nuevo, o reintenta desde Editar.`;
}
