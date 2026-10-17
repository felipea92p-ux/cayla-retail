// Lo que se muestra al elegir un proveedor en un gasto (ADR-0440): su teléfono y cómo se le paga. Lógica pura; la pantalla es
// `components/ProveedorElegido.tsx`.
import { urlWhatsApp } from "./proveedores-reglas";

export type DatosBancariosLeidos = {
  cuentaBancaria: string | null;
  cci: string | null;
  celularBilletera: string | null;
};

/**
 * Qué le falta al proveedor para que otra persona lo pueda pagar sin llamar a Felipe: teléfono y una cuenta (o Yape/Plin).
 * Cobra en efectivo → no necesita cuenta. `null` en `bancarios` = todavía no se sabe (cargando o la cuenta no lo ve): no se
 * acusa de faltar lo que no se pudo leer.
 */
export function faltaDelProveedor(p: { telefono: string | null; formaPagoPreferida: string | null }, bancarios: DatosBancariosLeidos | null): string | null {
  const faltan: string[] = [];
  if (!(p.telefono ?? "").trim()) faltan.push("teléfono");
  const cobraEnEfectivo = p.formaPagoPreferida === "efectivo";
  if (bancarios && !cobraEnEfectivo && !bancarios.cuentaBancaria && !bancarios.cci && !bancarios.celularBilletera) faltan.push("cuenta");
  if (faltan.length === 0) return null;
  return `Falta ${faltan.join(" / ")}: complétalo en Compras ▸ Proveedores.`;
}

/** El teléfono tal cual se escribió y, si es un celular peruano, su enlace de WhatsApp. */
export function telefonoDelProveedor(telefono: string | null): { texto: string; whatsapp: string | null } | null {
  const texto = (telefono ?? "").trim();
  return texto ? { texto, whatsapp: urlWhatsApp(texto) } : null;
}
