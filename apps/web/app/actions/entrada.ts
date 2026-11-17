"use server";

import { cookies } from "next/headers";
import { COOKIE_CAMBIO_DE_CUENTA } from "@/lib/login-aterrizaje";

/**
 * Le dice al navegador que olvide lo que aprendió antes de la cuenta que acaba de entrar (2026-11-16; el porqué completo, en
 * `COOKIE_CAMBIO_DE_CUENTA` de `lib/login-aterrizaje.ts`).
 *
 * Next documenta que cambiar una cookie dentro de una Server Action vacía la caché del router del navegador «para que las rutas que
 * dependen de cookies, como la autenticación, no queden viejas». Borrar una cookie cuenta como cambio aunque no exista, y no deja nada
 * guardado. No lee ni escribe datos de nadie: por eso no pide sesión.
 */
export async function marcarCambioDeCuenta(): Promise<void> {
  (await cookies()).delete(COOKIE_CAMBIO_DE_CUENTA);
}
