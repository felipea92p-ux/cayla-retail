import "server-only";
import { consultarPadron } from "@cayla-retail/shared/padron";
import { base } from "./base";
import { nombreDelPadron } from "./cuentas";

// El nombre por DNI al crear la cuenta (ADR-0008): primero el servicio público y gratis de SUNAT; si no responde o no lo
// encuentra, el proveedor de pago, si la tienda tiene uno (`TIENDA_PADRON_PROVEEDOR` y `TIENDA_PADRON_TOKEN`; sin ellos, solo
// SUNAT). La consulta es la misma del ERP (`packages/shared/src/padron.ts`), con las variables de la tienda.
// El nombre no se escribe a mano (Felipe 2026-10-15): sin internet, o si el padrón no encuentra el DNI, no se crea la cuenta y la
// persona puede volver a intentar. Nada se cae (principio 9).

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

/**
 * Anota en la base que el padrón dio ESTE nombre (el que se va a guardar) para ESTE DNI (`retail.tienda_anotar_lectura_padron`,
 * 20261015133000): sin esa lectura la ficha no acepta el nombre. Se llama justo antes de crear la cuenta. true si quedó anotada, o si
 * la base todavía no tiene esa regla (la función no existe: la tienda se publica antes de pegar la migración); false si la base no
 * respondió (entonces no se crea la cuenta y se puede volver a intentar).
 */
export async function anotarLecturaDelPadron(dni: string, nombre: string): Promise<boolean> {
  try {
    await base()`select retail.tienda_anotar_lectura_padron(${dni}::text, ${nombre}::text)`;
    return true;
  } catch (error) {
    const codigo = (error as { code?: unknown }).code ?? null;
    // 42883 (undefined_function): esta base todavía no tiene la regla; no hay nada que anotar.
    if (codigo === "42883") return true;
    console.error(JSON.stringify({ evento: "tienda_padron_anotar_fallo", codigo }));
    return false;
  }
}
