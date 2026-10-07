// «Ya se la ofrecí» (ADR-0362): qué guías se le ofrecieron a quien mira. La fuente es la base (`retail.guias_vistas`, una vez
// por persona y pantalla); si no responde o la migración aún no está, se recuerda en el navegador y la demo no se cae
// (principio 9). Las dos peticiones llevan `x-espera: no`: recordar una oferta no es un guardado y no debe abrir el loader.

// Las dos funciones son de 20261007180000 y aún no están en los tipos generados (`as never`, como `lib/configuracion.ts`).
import { createClient } from "@/lib/supabase/client";

const CLAVE_LOCAL = "cayla-guias-vistas";

function leerLocal(quien: string): Set<string> {
  try {
    const crudo = window.localStorage.getItem(`${CLAVE_LOCAL}:${quien}`);
    const lista = crudo ? (JSON.parse(crudo) as unknown) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function escribirLocal(quien: string, vistas: Set<string>) {
  try {
    window.localStorage.setItem(`${CLAVE_LOCAL}:${quien}`, JSON.stringify([...vistas]));
  } catch {
    // Navegador privado o sin espacio: la próxima vez se vuelve a ofrecer. Nada se pierde.
  }
}

/** Las guías ya ofrecidas: las de la base unidas a las del navegador (si la base falló una vez, lo local no se olvida). */
export async function leerVistas(quien: string): Promise<Set<string>> {
  const local = leerLocal(quien);
  try {
    const { data, error } = await createClient().rpc("fn_guias_vistas" as never).setHeader("x-espera", "no");
    if (error || !Array.isArray(data)) return local;
    for (const g of data as unknown[]) if (typeof g === "string") local.add(g);
    return local;
  } catch {
    return local;
  }
}

/** Anota que se ofreció (y si se terminó). Primero en el navegador, para que no se vuelva a ofrecer aunque la base no responda. */
export async function marcarVista(quien: string, guia: string, completa: boolean): Promise<void> {
  const local = leerLocal(quien);
  local.add(guia);
  escribirLocal(quien, local);
  try {
    await createClient().rpc("marcar_guia_vista" as never, { p_guia: guia, p_completa: completa } as never).setHeader("x-espera", "no");
  } catch {
    // Ya quedó en el navegador.
  }
}
