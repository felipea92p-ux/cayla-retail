"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminDeTerminales } from "@/lib/terminales-admin";
import { cambiarClaveTerminalCon, crearTerminalCon, type Dependencias, type ResultadoClave } from "@/lib/terminales-alta";
import { esFuncionAusente } from "@/lib/compras-reglas";
import type { EntradaTerminal } from "@/lib/terminales-reglas";
import { mensajeErrorResponsable, type Firma } from "@/lib/responsable-reglas";

// Colaboradores ▸ Terminales: crear una terminal y cambiarle la clave (Felipe, 2026-09-22). Todo el cuidado —solo quien
// puede gestionar colaboradores (el líder o un rol con ese módulo, 20260923131000), la llave de servicio recién después,
// deshacer la cuenta si la fila no entra, la clave una sola vez— vive en `lib/terminales-alta.ts`, donde se prueba. Aquí
// solo se conectan las piezas de verdad.
//
// OJO: no hay `console.log` de la entrada ni del resultado en este archivo, a propósito: el resultado lleva la clave.

/** La firma que mandó la pantalla, reducida a lo que la base lee (llega del navegador: no se confía en su forma). */
function firmaLimpia(firma: Firma | null | undefined): Firma | null {
  const responsableId = typeof firma?.responsableId === "string" ? firma.responsableId.trim() : "";
  const ubicacionId = typeof firma?.ubicacionId === "string" ? firma.ubicacionId.trim() : "";
  return responsableId && ubicacionId ? { responsableId, ubicacionId } : null;
}

async function dependencias(firma: Firma | null | undefined): Promise<Dependencias> {
  // El cliente de la SESIÓN de quien llama (con sus cookies): es el que responde si puede. No es el de la llave.
  // Va firmado con el responsable del combo (ADR-0161 act. d): la base lo lee en `fn_actor_persona_id(true)`.
  const sesion = await createClient({ firma: firmaLimpia(firma) });
  return {
    puedeGestionar: async () => {
      const { data, error } = await sesion.rpc("fn_puede_gestionar_colaboradores");
      if (!error) return data === true;
      // La web se publicó antes de pegar 20260923131000 (la función aún no existe): se pregunta lo de antes, «¿es líder?».
      // Cualquier otro error = «no» (falla cerrado).
      if (!esFuncionAusente(error)) return null;
      const lider = await sesion.rpc("fn_es_lider");
      return lider.error ? null : lider.data === true;
    },
    rolDentroDeLoMio: async (rolId) => {
      const { data, error } = await sesion.rpc("fn_rol_dentro_de_lo_mio", { p_rol_id: rolId });
      if (!error) return data === true;
      // Web publicada antes de pegar 20260923163000: la regla todavía no existe, se crea como antes.
      return esFuncionAusente(error) ? true : null;
    },
    personaActual: async () => {
      const { data, error } = await sesion.rpc("fn_actor_persona_id", { p_de_tienda: true });
      if (error) {
        const causa = { code: error.code, hint: error.hint, message: error.message };
        return { error: mensajeErrorResponsable(causa) ?? error.message, causa };
      }
      return { id: (data as string | null) ?? null };
    },
    registrarCambioClave: async (terminalId) => {
      const { error } = await sesion.rpc("registrar_cambio_clave_terminal", { p_terminal_id: terminalId });
      return error ? (mensajeErrorResponsable(error) ?? error.message) : null;
    },
    admin: adminDeTerminales,
    azar: (n) => randomBytes(n),
  };
}

// Sin `revalidatePath` a propósito: la pantalla refresca la lista cuando se cierra el paso de la clave
// (`TerminalesPanel`), para que la tabla no salte detrás de la clave mientras se la lee.
// `firma`: la del combo «Responsable» de la pantalla (`responsable.firma()`, ADR-0161 act. d).
export async function crearTerminal(entrada: EntradaTerminal, firma: Firma | null): Promise<ResultadoClave> {
  return crearTerminalCon(await dependencias(firma), entrada);
}

export async function cambiarClaveTerminal(entrada: { terminalId: string }, firma: Firma | null): Promise<ResultadoClave> {
  return cambiarClaveTerminalCon(await dependencias(firma), entrada);
}
