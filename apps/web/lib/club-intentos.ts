import "server-only";
import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";
import { FALTA_LLAVE } from "@/lib/supabase-admin";
import { ipDeLaPeticion } from "@/lib/club-registro-reglas";

// Las huellas con que `club_intento` cuenta los intentos de la página pública del club (ADR-0288 G-10: pocos registros por
// celular, por documento y por hora). Ni la ip ni el documento se guardan en claro en `club_intentos_registro`: se guarda un
// HMAC-SHA-256 con una sal que solo conoce el servidor. Con la sal, la misma ip da la misma huella (así se cuentan); sin ella,
// la tabla no dice quién es nadie.
//
// La sal: `CLUB_IP_SAL` si está configurada; si no, una derivada de `SUPABASE_SERVICE_ROLE_KEY` (que ya es secreta y sin la cual
// las acciones del club tampoco corren). Cambiar la sal solo reinicia la cuenta de la hora en curso.

function sal(): string {
  const propia = process.env.CLUB_IP_SAL?.trim();
  if (propia) return propia;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llave) throw new Error(FALTA_LLAVE);
  return createHash("sha256").update(`cayla-club-intentos:${llave}`).digest("hex");
}

const huella = (valor: string) => createHmac("sha256", sal()).update(valor).digest("hex");

/** La huella de la ip de quien llama (la primera de `x-forwarded-for`, que en Vercel es la de su celular). */
export async function huellaDeLaIp(): Promise<string> {
  const h = await headers();
  return huella(`ip:${ipDeLaPeticion(h.get("x-forwarded-for"), h.get("x-real-ip"))}`);
}

/** La huella de un documento, con su tipo (un DNI y un pasaporte con los mismos caracteres no se cuentan juntos). */
export function huellaDelDocumento(tipo: string, numero: string): string {
  return huella(`doc:${tipo}:${numero}`);
}
