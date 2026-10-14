import "server-only";
import { consultarPadron } from "@cayla-retail/shared/padron";
import { nombreDelPadron } from "./cuentas";

// El nombre por DNI al crear la cuenta (ADR-0008): primero el servicio público y gratis de SUNAT; si no responde o no lo
// encuentra, el proveedor de pago, si la tienda tiene uno (`TIENDA_PADRON_PROVEEDOR` y `TIENDA_PADRON_TOKEN`; sin ellos, solo
// SUNAT). La consulta es la misma del ERP (`packages/shared/src/padron.ts`), con las variables de la tienda.
// Sin internet, o si el padrón no encuentra el DNI, nada se cae: la persona escribe su nombre (principio 9).

export type NombreDelPadron = { estado: "encontrado"; nombre: string; aMedias: string } | { estado: "no_encontrado" } | { estado: "sin_padron" };

export async function buscarNombre(dni: string): Promise<NombreDelPadron> {
  try {
    const r = await consultarPadron("dni", dni, {
      proveedor: process.env.TIENDA_PADRON_PROVEEDOR,
      token: process.env.TIENDA_PADRON_TOKEN,
      sunatPublico: process.env.TIENDA_PADRON_SUNAT_PUBLICO,
    });
    if (!r.ok) return { estado: r.motivo === "no_encontrado" ? "no_encontrado" : "sin_padron" };
    const nombre = nombreDelPadron(r.datos.nombre, r.origen);
    return nombre ? { estado: "encontrado", ...nombre } : { estado: "sin_padron" };
  } catch (error) {
    // Sin el DNI ni el nombre en el registro: solo que falló.
    console.error(JSON.stringify({ evento: "tienda_padron_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return { estado: "sin_padron" };
  }
}
