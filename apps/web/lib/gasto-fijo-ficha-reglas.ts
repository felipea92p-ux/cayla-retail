// La ficha de pago de un gasto fijo (ADR-0452): lo que otra persona necesita saber para pagarlo sin quien lo cargó. A quién se le paga
// (propietario o empresa), cómo (transferencia, Yape, recibo…) con su cuenta, cómo reconocerlo (código de suministro, contrato o
// cliente) y notas. Todo es opcional: se completa de a poco.
//
// La base manda (`fn_gasto_fijo_ficha_aplicar`, 20261018003000) y estas reglas dicen lo mismo ANTES del viaje, con las mismas
// palabras. Los datos bancarios (banco, cuenta, CCI, Yape o Plin y titular) son solo de líder y admin: para otra cuenta ni se
// piden, ni se envían, ni se leen. Lógica pura: sin red, sin React.

import type { Resultado } from "./gastos-reglas";
import { claveTexto } from "./nombres-parecidos";
import { normalizarCci, normalizarCelular, validarCci, validarCelular } from "./proveedores-reglas";

export const FORMAS_DE_PAGO = ["transferencia", "billetera", "deposito", "efectivo", "recibo", "debito"] as const;
export type FormaDePago = (typeof FORMAS_DE_PAGO)[number];

export const TEXTO_FORMA_DE_PAGO: Record<FormaDePago, string> = {
  transferencia: "Transferencia a su cuenta",
  billetera: "Yape o Plin",
  deposito: "Depósito en ventanilla o agente",
  efectivo: "Efectivo",
  recibo: "Se paga el recibo (banco, agente o app)",
  debito: "Débito automático",
};

/** Las formas de pago que piden una cuenta del banco; el resto no necesita que se la pidamos. */
const FORMAS_CON_CUENTA: readonly FormaDePago[] = ["transferencia", "deposito", "debito"];

export const TIPOS_DOCUMENTO = ["dni", "ruc", "ce", "otro"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const TEXTO_TIPO_DOCUMENTO: Record<TipoDocumento, string> = { dni: "DNI", ruc: "RUC", ce: "Carné de extranjería", otro: "Otro" };

export type Billetera = "yape" | "plin";
export const BILLETERAS: readonly Billetera[] = ["yape", "plin"];
export const TEXTO_BILLETERA: Record<Billetera, string> = { yape: "Yape", plin: "Plin" };

/** Los topes de los textos: son los de `gastos_fijos_ficha_textos_con_tope` (lo exige `gasto-fijo-ficha-reglas.test.ts`). */
export const TOPES_FICHA = { beneficiario: 120, telefono: 30, correo: 120, banco: 60, cuenta: 40, titular: 120, codigo: 60, recibo: 200, notas: 500 } as const;

/** Lo que se escribe en la pantalla: todo texto, `""` es «sin dato». */
export type FichaFijo = {
  beneficiario: string;
  documentoTipo: TipoDocumento | "";
  documentoNumero: string;
  telefono: string;
  correo: string;
  formaDePago: FormaDePago | "";
  banco: string;
  cuentaBancaria: string;
  cci: string;
  celularBilletera: string;
  billeteras: Billetera[];
  titularCuenta: string;
  codigoServicio: string;
  reciboLlega: string;
  /** `AAAA-MM-DD`, o vacío. */
  contratoVence: string;
  notas: string;
};

export const FICHA_VACIA: FichaFijo = {
  beneficiario: "",
  documentoTipo: "",
  documentoNumero: "",
  telefono: "",
  correo: "",
  formaDePago: "",
  banco: "",
  cuentaBancaria: "",
  cci: "",
  celularBilletera: "",
  billeteras: [],
  titularCuenta: "",
  codigoServicio: "",
  reciboLlega: "",
  contratoVence: "",
  notas: "",
};

/** Lo que devuelve `fn_gasto_fijo_ficha`: la ficha y lo que la cuenta puede ver de ella. */
export type FichaLeida = FichaFijo & {
  /** ¿Hay una ficha guardada? (la base devuelve una fila aunque aún no tenga nada). */
  existe: boolean;
  puedeVerBanco: boolean;
  /** `null` = no se sabe (la cuenta no ve datos bancarios). */
  tieneCuenta: boolean | null;
  actualizadoPorNombre: string | null;
  actualizadoEn: string | null;
};

type Fila = Record<string, unknown>;
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const esForma = (v: unknown): v is FormaDePago => (FORMAS_DE_PAGO as readonly unknown[]).includes(v);
const esTipo = (v: unknown): v is TipoDocumento => (TIPOS_DOCUMENTO as readonly unknown[]).includes(v);

/** Lee la fila de `fn_gasto_fijo_ficha`; sin fila (la cuenta no ve el fijo, o la base no tiene la migración) devuelve `null`. */
export function leerFicha(f: Fila | null | undefined): FichaLeida | null {
  if (!f) return null;
  const billeteras = Array.isArray(f.billeteras) ? (f.billeteras as unknown[]).filter((b): b is Billetera => b === "yape" || b === "plin") : [];
  const ficha: FichaFijo = {
    beneficiario: txt(f.beneficiario),
    documentoTipo: esTipo(f.documento_tipo) ? f.documento_tipo : "",
    documentoNumero: txt(f.documento_numero),
    telefono: txt(f.telefono),
    correo: txt(f.correo),
    formaDePago: esForma(f.forma_de_pago) ? f.forma_de_pago : "",
    banco: txt(f.banco),
    cuentaBancaria: txt(f.cuenta_bancaria),
    cci: txt(f.cci),
    celularBilletera: txt(f.celular_billetera),
    billeteras,
    titularCuenta: txt(f.titular_cuenta),
    codigoServicio: txt(f.codigo_servicio),
    reciboLlega: txt(f.recibo_llega),
    contratoVence: txt(f.contrato_vence).slice(0, 10),
    notas: txt(f.notas),
  };
  return {
    ...ficha,
    existe: f.actualizado_en != null,
    puedeVerBanco: f.puede_ver_banco === true,
    tieneCuenta: typeof f.tiene_cuenta === "boolean" ? f.tiene_cuenta : null,
    actualizadoPorNombre: typeof f.actualizado_por_nombre === "string" ? f.actualizado_por_nombre : null,
    actualizadoEn: typeof f.actualizado_en === "string" ? f.actualizado_en : null,
  };
}

/** Solo la ficha de una lectura, sin lo que la base dice de quién la mira (para editarla y comparar contra lo que había). */
export function datosDeLaFicha(l: FichaLeida): FichaFijo {
  return Object.fromEntries(Object.keys(FICHA_VACIA).map((k) => [k, l[k as keyof FichaFijo]])) as FichaFijo;
}

/** ¿Es un proveedor de gastos (luz, agua, internet…) y no de mercadería? Los que nacen al sumar uno desde Gastos llevan el rubro «Gastos». */
export function esProveedorDeGasto(p: { rubros?: readonly string[] | null }): boolean {
  return (p.rubros ?? []).some((r) => claveTexto(r) === "gastos");
}

/** Lo que cada fila de `fn_gastos_fijos_fichas` dice de un fijo (sin cuentas): para la lista y su «qué falta». */
export type ResumenFicha = { beneficiario: string; formaDePago: FormaDePago | ""; codigoServicio: string; contratoVence: string; tieneCuenta: boolean | null };

export function leerResumenFicha(f: Fila): { gastoFijoId: string; resumen: ResumenFicha } {
  return {
    gastoFijoId: String(f.gasto_fijo_id),
    resumen: {
      beneficiario: txt(f.beneficiario),
      formaDePago: esForma(f.forma_de_pago) ? f.forma_de_pago : "",
      codigoServicio: txt(f.codigo_servicio),
      contratoVence: txt(f.contrato_vence).slice(0, 10),
      tieneCuenta: typeof f.tiene_cuenta === "boolean" ? f.tiene_cuenta : null,
    },
  };
}

// ---- Qué campos de «cómo se paga» se muestran ------------------------------------------------------------------------------

/** Con una cuenta ya cargada, el campo se muestra aunque la forma de pago sea otra: nunca se esconde lo que existe. */
export function camposDePago(f: FichaFijo): { cuenta: boolean; billetera: boolean } {
  const conCuenta = !!(f.banco || f.cuentaBancaria || f.cci || f.titularCuenta);
  const conBilletera = !!(f.celularBilletera || f.billeteras.length > 0);
  return {
    cuenta: conCuenta || (f.formaDePago !== "" && FORMAS_CON_CUENTA.includes(f.formaDePago)),
    billetera: conBilletera || f.formaDePago === "billetera",
  };
}

// ---- Normalizar, validar y decir qué cambió --------------------------------------------------------------------------------

const limpio = (s: string) => s.trim();

/** La ficha como la guarda la base: sin espacios sobrantes, solo números donde van números. */
export function normalizarFicha(f: FichaFijo): FichaFijo {
  const dni = f.documentoTipo === "dni" || f.documentoTipo === "ruc";
  return {
    ...f,
    beneficiario: limpio(f.beneficiario),
    documentoNumero: dni ? f.documentoNumero.replace(/[\s.-]/g, "") : limpio(f.documentoNumero),
    telefono: limpio(f.telefono),
    correo: limpio(f.correo).toLowerCase(),
    banco: limpio(f.banco),
    cuentaBancaria: limpio(f.cuentaBancaria),
    cci: normalizarCci(f.cci),
    celularBilletera: normalizarCelular(f.celularBilletera),
    billeteras: BILLETERAS.filter((b) => f.billeteras.includes(b)),
    titularCuenta: limpio(f.titularCuenta),
    codigoServicio: limpio(f.codigoServicio),
    reciboLlega: limpio(f.reciboLlega),
    contratoVence: limpio(f.contratoVence),
    notas: limpio(f.notas),
  };
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fechaReal(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d && a >= 2000 && a <= 2100;
}

/** Los errores comunes, con las mismas palabras que la base. `null` si está bien (todo vacío también está bien). */
export function problemaDeLaFicha(f: FichaFijo, puedeVerBanco: boolean): string | null {
  const n = normalizarFicha(f);
  if (n.beneficiario.length > TOPES_FICHA.beneficiario) return `El nombre de a quién se le paga tiene más de ${TOPES_FICHA.beneficiario} letras.`;
  if ((n.documentoTipo === "") !== (n.documentoNumero === "")) return "Elige el tipo de documento y escribe su número, o deja los dos vacíos.";
  if (n.documentoTipo === "dni" && !/^\d{8}$/.test(n.documentoNumero)) return "El DNI tiene 8 números.";
  if (n.documentoTipo === "ruc" && !/^\d{11}$/.test(n.documentoNumero)) return "El RUC tiene 11 números.";
  if (n.documentoTipo === "ce" && !/^[A-Za-z0-9]{6,20}$/.test(n.documentoNumero)) return "El carné de extranjería lleva de 6 a 20 letras o números.";
  if (n.documentoTipo === "otro" && n.documentoNumero.length > 20) return "El número de documento tiene hasta 20 caracteres.";
  if (n.telefono && (!/^[0-9+() -]+$/.test(n.telefono) || n.telefono.replace(/\D/g, "").length < 6 || n.telefono.replace(/\D/g, "").length > 15)) {
    return "El teléfono lleva solo números (de 6 a 15).";
  }
  if (n.correo && !CORREO.test(n.correo)) return "El correo no parece un correo (le falta algo antes o después de la arroba).";
  if (n.contratoVence && !fechaReal(n.contratoVence)) return "La fecha en que vence el contrato no es una fecha válida.";
  if (n.codigoServicio.length > TOPES_FICHA.codigo) return `El código del servicio tiene más de ${TOPES_FICHA.codigo} letras.`;
  if (n.reciboLlega.length > TOPES_FICHA.recibo) return `«Cómo llega el recibo» tiene más de ${TOPES_FICHA.recibo} letras.`;
  if (n.notas.length > TOPES_FICHA.notas) return `Las notas tienen más de ${TOPES_FICHA.notas} letras.`;
  if (!puedeVerBanco) return null;
  const cci = validarCci(f.cci);
  if (cci) return cci;
  const cel = validarCelular(f.celularBilletera);
  if (cel) return cel;
  if (n.celularBilletera && n.billeteras.length === 0) return "Para Yape o Plin hacen falta el celular y la app (Yape, Plin o los dos).";
  if (!n.celularBilletera && n.billeteras.length > 0) return "Escribe el celular de Yape o Plin, o quita la app.";
  if (n.banco.length > TOPES_FICHA.banco) return `El banco tiene más de ${TOPES_FICHA.banco} letras.`;
  if (n.cuentaBancaria.length > TOPES_FICHA.cuenta) return `La cuenta tiene más de ${TOPES_FICHA.cuenta} caracteres.`;
  if (n.titularCuenta.length > TOPES_FICHA.titular) return `El nombre del titular tiene más de ${TOPES_FICHA.titular} letras.`;
  return null;
}

const vacioANull = (s: string): string | null => (s === "" ? null : s);

/**
 * Lo que se manda como `p_ficha`: SOLO las llaves que cambiaron respecto de `inicial` (lo que la base tenía al abrir). `null` = nada
 * cambió, no se manda nada y la ficha no se toca. Una llave en `null` borra ese dato. Los datos bancarios solo salen para quien
 * puede verlos. El documento y el celular de billetera viajan con su pareja (tipo+número, celular+app).
 */
export function fichaParaEnviar(actual: FichaFijo, inicial: FichaFijo, puedeVerBanco: boolean): Resultado<Record<string, unknown> | null> {
  const problema = problemaDeLaFicha(actual, puedeVerBanco);
  if (problema) return { ok: false, error: problema };
  const a = normalizarFicha(actual);
  const i = normalizarFicha(inicial);
  const cambio = (k: keyof FichaFijo) => JSON.stringify(a[k]) !== JSON.stringify(i[k]);
  const out: Record<string, unknown> = {};
  const poner = (llave: string, k: keyof FichaFijo) => {
    const v = a[k];
    out[llave] = Array.isArray(v) ? (v.length ? v : null) : vacioANull(String(v));
  };
  const sueltos: [string, keyof FichaFijo][] = [
    ["beneficiario", "beneficiario"],
    ["telefono", "telefono"],
    ["correo", "correo"],
    ["forma_de_pago", "formaDePago"],
    ["codigo_servicio", "codigoServicio"],
    ["recibo_llega", "reciboLlega"],
    ["contrato_vence", "contratoVence"],
    ["notas", "notas"],
  ];
  for (const [llave, k] of sueltos) if (cambio(k)) poner(llave, k);
  if (cambio("documentoTipo") || cambio("documentoNumero")) {
    poner("documento_tipo", "documentoTipo");
    poner("documento_numero", "documentoNumero");
  }
  if (puedeVerBanco) {
    for (const [llave, k] of [["banco", "banco"], ["cuenta_bancaria", "cuentaBancaria"], ["cci", "cci"], ["titular_cuenta", "titularCuenta"]] as [string, keyof FichaFijo][]) {
      if (cambio(k)) poner(llave, k);
    }
    if (cambio("celularBilletera") || cambio("billeteras")) {
      poner("celular_billetera", "celularBilletera");
      poner("billeteras", "billeteras");
    }
  }
  return { ok: true, valor: Object.keys(out).length ? out : null };
}

// ---- Qué le falta a una ficha para que otro pueda pagar -------------------------------------------------------------------

/** Lo mínimo para pagarlo sin quien lo cargó: a quién y cómo. La cuenta cuenta solo si la forma de pago la pide y la cuenta puede verla. */
export function faltaDeLaFicha(r: ResumenFicha | null | undefined): string[] {
  const falta: string[] = [];
  if (!r || !r.beneficiario) falta.push("a quién se le paga");
  if (!r || !r.formaDePago) falta.push("cómo se paga");
  else if ((FORMAS_CON_CUENTA.includes(r.formaDePago) || r.formaDePago === "billetera") && r.tieneCuenta === false) falta.push("la cuenta");
  return falta;
}

/** «Falta: a quién se le paga y cómo se paga», o `null` si está lo mínimo. */
export function textoDeLoQueFalta(falta: readonly string[]): string | null {
  if (falta.length === 0) return null;
  const [ultimo, ...antes] = [...falta].reverse();
  return `Falta ${antes.length ? `${antes.reverse().join(", ")} y ${ultimo}` : ultimo}`;
}

/** El contrato que vence pronto (por defecto, en 60 días o menos, o ya vencido): para avisar a quien hereda. `hoy` es `AAAA-MM-DD` en Lima. */
export function contratoPorVencer(venceEl: string, hoy: string, dias = 60): { dias: number; vencido: boolean } | null {
  if (!fechaReal(venceEl) || !fechaReal(hoy)) return null;
  const dif = Math.round((Date.parse(`${venceEl}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  return dif <= dias ? { dias: dif, vencido: dif < 0 } : null;
}

export function textoContratoPorVencer(c: { dias: number; vencido: boolean }): string {
  if (c.vencido) return c.dias === -1 ? "Contrato vencido ayer" : `Contrato vencido hace ${-c.dias} días`;
  if (c.dias === 0) return "El contrato vence hoy";
  return c.dias === 1 ? "El contrato vence mañana" : `El contrato vence en ${c.dias} días`;
}
