import type { TipoCuenta } from "./cuentas-dinero-reglas";

// Sugerencias de «Agregar cuenta» (CLAUDE.md «Sugerencias coherentes», ADR-0290): el ejemplo del nombre sigue el tipo elegido. Con «Tarjeta de crédito» elegida, «BBVA · Cta. corriente» sería falso.
const EJEMPLO_NOMBRE: Record<TipoCuenta, string> = {
  banco: "BBVA · Cta. corriente",
  por_abonar: "Niubiz · por depositar",
  tarjeta_credito: "Visa de CAYLA",
  // Estos nacen solos con cada sede y no se agregan aquí: su texto solo existe para que la tabla sea total.
  cajon: "Nombre de la cuenta",
  caja_fuerte: "Nombre de la cuenta",
  por_rendir: "Nombre de la cuenta",
};

export const sugerirNombreCuenta = (tipo: TipoCuenta): string => EJEMPLO_NOMBRE[tipo];
