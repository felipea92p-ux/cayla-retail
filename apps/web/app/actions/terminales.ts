"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { adminDeTerminales } from "@/lib/terminales-admin";
import { cambiarClaveTerminalCon, crearTerminalCon, type Dependencias, type ResultadoClave } from "@/lib/terminales-alta";
import type { EntradaTerminal } from "@/lib/terminales-reglas";

// Colaboradores ▸ Terminales: crear una terminal y cambiarle la clave (Felipe, 2026-09-22). Todo el cuidado —solo un
// líder, la llave de servicio recién después, deshacer la cuenta si la fila no entra, la clave una sola vez— vive en
// `lib/terminales-alta.ts`, donde se prueba. Aquí solo se conectan las piezas de verdad.
//
// OJO: no hay `console.log` de la entrada ni del resultado en este archivo, a propósito: el resultado lleva la clave.

async function dependencias(): Promise<Dependencias> {
  // El cliente de la SESIÓN de quien llama (con sus cookies): es el que responde si es líder. No es el de la llave.
  const sesion = await createClient();
  return {
    esLider: async () => {
      const { data, error } = await sesion.rpc("fn_es_lider");
      return error ? null : data === true;
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
