import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { ipDeLaPeticion } from "./cuentas";

// Las huellas con que la base cuenta los intentos de la tienda (`club_intento`, los mismos topes del cartel del Club: ADR-0288
// G-10). Ni la ip ni el DNI llegan en claro a la tabla de intentos: viaja un HMAC-SHA-256 con la sal propia de la tienda
// (`TIENDA_INTENTOS_SAL`, que no es la del ERP). Con la sal, la misma ip da la misma huella (así se cuentan); sin ella, la tabla
// no dice quién es nadie.
//
// Sin la sal (o con una muy corta) no hay huellas y la tienda no consulta ni registra: una huella sin sal secreta se revierte
// probando los cien millones de DNI posibles.

function sal(): string | null {
  const s = process.env.TIENDA_INTENTOS_SAL?.trim();
  return s && s.length >= 16 ? s : null;
}

const huella = (s: string, valor: string) => createHmac("sha256", s).update(valor).digest("hex");

export type Huellas = { ip: string; documento: string | null };

/** La huella de la ip de quien llama y, si se pasa, la de su DNI. null si falta la sal. */
export async function huellas(dni?: string): Promise<Huellas | null> {
  const s = sal();
  if (!s) {
    console.error(JSON.stringify({ evento: "tienda_sin_sal_de_intentos" }));
    return null;
  }
  const h = await headers();
  return {
    ip: huella(s, `ip:${ipDeLaPeticion(h.get("x-forwarded-for"), h.get("x-real-ip"))}`),
    documento: dni ? huella(s, `doc:dni:${dni}`) : null,
  };
}
