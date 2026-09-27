"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { cookieEleccion, leerEleccion } from "@/lib/inicio-avisos";

// Guarda lo que la persona eligió en «Ajustar» de «Te toca» (Inicio, 2026-09-26). Paso 1: una cookie por cuenta en este
// aparato; el nombre sale de la sesión, no del navegador. Solo es una preferencia de vista: no abre ni cierra ningún
// permiso (los avisos ya llegan filtrados por módulo), y lo urgente sale igual aunque se haya apagado.
export async function guardarEleccionInicio(eleccion: Record<string, boolean>) {
  const persona = await requirePersonaActualV2();
  // Se vuelve a leer con la misma regla que el servidor usa al dibujar: lo que no sea clave → booleano, se descarta.
  const limpia = leerEleccion(JSON.stringify(eleccion));
  (await cookies()).set(cookieEleccion(persona.personaId), JSON.stringify(limpia), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/");
}
