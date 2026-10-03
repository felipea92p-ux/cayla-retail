"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { cookieMedidas, leerEleccionMedidas } from "@/lib/rendimiento-medidas";

// Guarda lo que la persona eligió en «Qué más mostrar» de Rendimiento (2026-10-03). Igual que `guardarEleccionInicio`: una cookie por cuenta
// en este aparato; el nombre sale de la sesión, no del navegador. Es solo una preferencia de vista: no abre ni cierra ningún permiso ni
// cambia lo que ven los demás.
export async function guardarMedidasRendimiento(eleccion: Record<string, boolean>) {
  const persona = await requirePersonaActualV2();
  // Se vuelve a leer con la misma regla que usa el servidor al dibujar: lo que no sea una clave conocida → booleano, se descarta.
  const limpia = leerEleccionMedidas(JSON.stringify(eleccion));
  (await cookies()).set(cookieMedidas(persona.personaId), JSON.stringify(limpia), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/rendimiento");
}
