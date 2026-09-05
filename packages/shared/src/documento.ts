// Documentos de identidad peruanos (DNI de RENIEC, RUC de SUNAT): validación
// PURA, sin red y sin dependencias.
//
// Vive en `shared` y no en `apps/web/lib` a propósito: la corren los dos lados.
// El navegador, para decirle a quien atiende "te falta un dígito" mientras
// tipea; y el servidor, en `/api/padron`, porque la validación del navegador
// nunca es garantía (cualquiera puede llamar la ruta con curl).
//
// Sin esto, cada tipeo mal escrito se convierte en una consulta pagada a la API
// del padrón — y peor, en una factura emitida a un RUC que no existe, con el
// correlativo ya quemado y sin forma de deshacerlo.

export const TIPOS_DOCUMENTO_CLIENTE = ["dni", "ruc", "sin_documento"] as const;
export type TipoDocumentoCliente = (typeof TIPOS_DOCUMENTO_CLIENTE)[number];

export const LARGO_DNI = 8;
export const LARGO_RUC = 11;

// Los dos primeros dígitos del RUC dicen qué clase de contribuyente es.
// SUNAT solo emite estos: 10 = persona natural con negocio, 15 y 17 = casos
// históricos todavía vigentes, 20 = persona jurídica (empresa). Un RUC que
// empieza en 30 no existe — es un tipeo, y se caza sin consultar nada.
const PREFIJOS_RUC = ["10", "15", "17", "20"];

// Pesos del módulo 11 que usa SUNAT para el dígito verificador del RUC.
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export type ResultadoValidacion = { valido: true } | { valido: false; motivo: string };

const OK: ResultadoValidacion = { valido: true };
const mal = (motivo: string): ResultadoValidacion => ({ valido: false, motivo });

// "Falta 1 dígito" / "Faltan 3 dígitos": el mensaje lo lee quien está atendiendo
// con una clienta al frente, no un programador.
const faltan = (n: number) => (n === 1 ? "Falta 1 dígito" : `Faltan ${n} dígitos`);

/** Dígito verificador que le corresponde a los 10 primeros dígitos de un RUC. */
export function digitoVerificadorRuc(primeros10: string): number {
  const suma = PESOS_RUC.reduce((acc, peso, i) => acc + peso * Number(primeros10[i]), 0);
  const resto = 11 - (suma % 11);
  // 10 y 11 se pliegan a 0 y 1: el verificador es un solo dígito.
  return resto === 10 ? 0 : resto === 11 ? 1 : resto;
}

/** El DNI no tiene dígito verificador dentro de sus 8 números (el carácter de
 *  verificación va impreso aparte en el documento físico, no se digita aquí),
 *  así que lo único comprobable sin RENIEC es el largo. */
export function validarDni(numero: string): ResultadoValidacion {
  const n = soloDigitos(numero);
  if (n.length === 0) return mal("Escribe el DNI");
  if (n.length < LARGO_DNI) return mal(faltan(LARGO_DNI - n.length));
  if (n.length > LARGO_DNI) return mal("Un DNI tiene 8 dígitos");
  return OK;
}

/** A diferencia del DNI, el RUC SÍ se puede verificar sin preguntarle a nadie:
 *  su último dígito se calcula de los otros diez. Un dígito cambiado o dos
 *  transpuestos no pasan — se cazan casi todos los tipeos gratis y offline,
 *  antes de gastar una consulta a la API (que se cobra por consulta). */
export function validarRuc(numero: string): ResultadoValidacion {
  const n = soloDigitos(numero);
  if (n.length === 0) return mal("Escribe el RUC");
  if (n.length < LARGO_RUC) return mal(faltan(LARGO_RUC - n.length));
  if (n.length > LARGO_RUC) return mal("Un RUC tiene 11 dígitos");
  if (!PREFIJOS_RUC.includes(n.slice(0, 2))) {
    return mal(`Ningún RUC empieza en ${n.slice(0, 2)} (van en 10, 15, 17 o 20)`);
  }
  if (digitoVerificadorRuc(n.slice(0, 10)) !== Number(n[10])) {
    return mal("Este RUC no existe: el último dígito no cuadra con los otros diez");
  }
  return OK;
}

export function validarDocumento(tipo: "dni" | "ruc", numero: string): ResultadoValidacion {
  return tipo === "dni" ? validarDni(numero) : validarRuc(numero);
}

/** Largo esperado — el formulario lo usa para el `maxLength` del campo. */
export function largoDocumento(tipo: "dni" | "ruc"): number {
  return tipo === "dni" ? LARGO_DNI : LARGO_RUC;
}
