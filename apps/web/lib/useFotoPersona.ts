"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { urlFotoPerfil } from "@/lib/foto-perfil";

// La foto de cada persona, pedida a la base UNA vez por sesión del navegador (20260925210000, `fn_fotos_personas`).
// Cada avatar pide solo su persona; los pedidos del mismo instante (una tabla de 25 filas, la lista del combo) salen en
// UNA sola llamada. Lo que ya se sabe se recuerda aquí, así que cambiar de pantalla no vuelve a preguntar.
// Si la base falla o todavía no tiene la función, esas personas quedan «sin foto» hasta recargar: se ven sus iniciales y
// nada se bloquea (principio 9). Es una lectura `fn_`: el loader global no la tapa (lib/espera-reglas.ts).

/** persona → ruta en el bucket; `null` = sin foto (o no se pudo leer). Ausente = aún no se preguntó. */
const rutas = new Map<string, string | null>();
const porPedir = new Set<string>();
const enCamino = new Set<string>();
const oyentes = new Set<() => void>();
let programado = false;

function avisarCambio() {
  for (const oyente of oyentes) oyente();
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

async function pedirPendientes() {
  programado = false;
  const ids = [...porPedir];
  porPedir.clear();
  if (ids.length === 0) return;
  for (const id of ids) enCamino.add(id);

  const { data, error } = await createClient().rpc("fn_fotos_personas", { p_ids: ids });
  const porId = new Map((error ? [] : (data ?? [])).map((f) => [f.persona_id, f.foto_ruta]));
  for (const id of ids) {
    enCamino.delete(id);
    rutas.set(id, porId.get(id) ?? null);
  }
  avisarCambio();
}

function pedir(personaId: string) {
  if (rutas.has(personaId) || enCamino.has(personaId) || porPedir.has(personaId)) return;
  porPedir.add(personaId);
  if (!programado) {
    programado = true;
    // Después de que TODOS los avatares de este render pidieron la suya: una sola llamada para todos.
    queueMicrotask(() => void pedirPendientes());
  }
}

/** Lo que ya se sabe sin preguntar (lo trajo «Mi perfil», o se acaba de subir una foto): lo ven al instante todos los avatares de esa persona. */
export function recordarFotoPersona(personaId: string, ruta: string | null) {
  rutas.set(personaId, ruta?.trim() ? ruta : null);
  avisarCambio();
}

/** La URL de la foto de perfil de una persona, o `null` mientras se pregunta, si no tiene o si no se pudo leer. */
export function useFotoPersona(personaId: string | null | undefined): string | null {
  const ruta = useSyncExternalStore(
    suscribir,
    () => (personaId ? (rutas.get(personaId) ?? null) : null),
    () => null,
  );
  useEffect(() => {
    if (personaId) pedir(personaId);
  }, [personaId]);
  return urlFotoPerfil(ruta);
}
