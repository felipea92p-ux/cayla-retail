"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminDeTerminales } from "@/lib/terminales-admin";
import { cambiarClaveTerminalCon, crearTerminalCon, type Dependencias, type ResultadoClave } from "@/lib/terminales-alta";
import { esFuncionAusente } from "@/lib/compras-reglas";
import type { EntradaTerminal } from "@/lib/terminales-reglas";

// Colaboradores ▸ Terminales: crear una terminal y cambiarle la clave (Felipe, 2026-09-22). Todo el cuidado —solo quien
// puede gestionar colaboradores (el líder o un rol con ese módulo, 20260923111000), la llave de servicio recién después,
// deshacer la cuenta si la fila no entra, la clave una sola vez— vive en `lib/terminales-alta.ts`, donde se prueba. Aquí
// solo se conectan las piezas de verdad.
//
// OJO: no hay `console.log` de la entrada ni del resultado en este archivo, a propósito: el resultado lleva la clave.

async function dependencias(): Promise<Dependencias> {
  // El cliente de la SESIÓN de quien llama (con sus cookies): es el que responde si puede. No es el de la llave.
  const sesion = await createClient();
  return {
    puedeGestionar: async () => {
      const { data, error } = await sesion.rpc("fn_puede_gestionar_colaboradores");
      if (!error) return data === true;
      // La web se publicó antes de pegar 20260923111000 (la función aún no existe): se pregunta lo de antes, «¿es líder?».
      // Cualquier otro error = «no» (falla cerrado).
      if (!esFuncionAusente(error)) return null;
      const lider = await sesion.rpc("fn_es_lider");
      return lider.error ? null : lider.data === true;
    },
    personaActual: async () => {
      const { data, error } = await sesion.rpc("fn_actor_persona_id", { p_de_tienda: false });
      return error ? null : ((data as string | null) ?? null);
    },
    admin: adminDeTerminales,
    azar: (n) => randomBytes(n),
  };
}

// Sin `revalidatePath` a propósito: la pantalla refresca la lista cuando se cierra el paso de la clave
// (`TerminalesPanel`), para que la tabla no salte detrás de la clave mientras se la lee.
export async function crearTerminal(entrada: EntradaTerminal): Promise<ResultadoClave> {
  return crearTerminalCon(await dependencias(), entrada);
}

export async function cambiarClaveTerminal(entrada: { terminalId: string }): Promise<ResultadoClave> {
  return cambiarClaveTerminalCon(await dependencias(), entrada);
}
