// Consulta al padrón oficial: RENIEC para DNI, SUNAT para RUC.
//
// La consulta en sí (SUNAT público primero, el proveedor de pago después, la caché y el interruptor) vive en
// `packages/shared/src/padron.ts` desde el 2026-10-14 (ADR-0408): la usan el ERP y la tienda online, cada una con sus
// variables. Aquí el ERP le pasa las suyas, con los mismos nombres de siempre (ver `apps/web/.env.example`):
//   PADRON_SUNAT_PUBLICO — vacío: DNI y RUC; `solo_dni`: el RUC va directo al proveedor; `no`: apagado del todo.
//   PADRON_PROVEEDOR y PADRON_TOKEN — el proveedor de pago. Sin ellos, solo SUNAT público (y si falla, el nombre a mano).
import { consultarPadron as consultarConConfig, type OrigenPadron, type ResultadoPadron, type TipoConsulta } from "@cayla-retail/shared/padron";

export { advertenciasDe, type DatosPadron } from "@cayla-retail/shared/padron";

export function consultarPadron(tipo: TipoConsulta, numero: string): Promise<ResultadoPadron> {
  return consultarConConfig(tipo, numero, {
    proveedor: process.env.PADRON_PROVEEDOR,
    token: process.env.PADRON_TOKEN,
    sunatPublico: process.env.PADRON_SUNAT_PUBLICO,
  });
}

/**
 * La consulta de una página que cualquiera abre sin cuenta (el cartel del Club): solo el servicio público y gratis de SUNAT, nunca el
 * proveedor de pago (Felipe 2026-10-15, D6). Así nadie puede gastar desde afuera la cuota que usa la caja para sus boletas y
 * facturas. Si SUNAT no responde o no encuentra el DNI, la página dice que se intente en unos minutos o en tienda.
 */
export function consultarPadronPublico(tipo: TipoConsulta, numero: string): Promise<ResultadoPadron> {
  return consultarConConfig(tipo, numero, { sunatPublico: process.env.PADRON_SUNAT_PUBLICO });
}

/** Lo que devuelve `GET /api/padron`. Vive aquí, con el resto del dominio, para
 *  que el formulario no tenga que importar tipos desde un route handler. */
export type RespuestaPadron = {
  tipo: TipoConsulta;
  numero: string;
  /** DNI del padrón: con los nombres primero («María Pérez García», `packages/shared/src/nombre-del-padron.ts`). RUC: la razón social.
   *  De un comprobante anterior (`historial`): como se escribió en esa boleta. */
  nombre: string | null;
  /** Solo un DNI que contestó el padrón: los nombres y los apellidos por separado («María», «Pérez García»). null en lo demás. */
  nombres: string | null;
  apellidos: string | null;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  /** De dónde salió el nombre: del padrón oficial, de un comprobante anterior, o de ningún lado. */
  fuente: "padron" | "historial" | "ninguna";
  /** Solo cuando fuente = "padron": qué servicio contestó. `sunat_publico` es el gratis —
   *  para RUC no informa estado ni condición—; `proveedor` es el de pago. */
  via: OrigenPadron | null;
  advertencias: string[];
  /** Solo cuando fuente = "ninguna": por qué no se pudo. */
  motivo: string | null;
  /** Solo con `para=ficha` (el nombre de una ficha de cliente, 20261015133000): el servidor anotó esta lectura en la base, así que el
   *  nombre se puede guardar en la ficha. false en las demás consultas (comprobantes, proveedores) y si no se pudo anotar. */
  anotada: boolean;
  /** Cuando el padrón no dio el nombre: si no tiene ese número (`no_encontrado`) o no contestó (`sin_respuesta`). null si lo dio. */
  sinNombre: "no_encontrado" | "sin_respuesta" | null;
};
