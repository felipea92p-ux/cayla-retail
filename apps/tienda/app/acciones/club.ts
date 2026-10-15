"use server";

import { esquemaId, type EstadoAviso, type EstadoFavorito, type EstadoQuitar } from "@/lib/club";
import { guardarFavoritoEnBase, pedirAvisoEnBase, quitarAvisoEnBase } from "@/lib/club-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// Las acciones del corazón y de «Avísame cuando llegue» (ADR-0408, actividad 12). Las llama una persona CON sesión desde la ficha,
// una tarjeta o «Mi cuenta». No confían en nada de lo que llega: revisan que cada id tenga forma de id, preguntan quién es al
// proyecto de clientes (no basta la cookie) y la base decide (`retail.tienda_*`: solo toca lo de esa cuenta, valida que la prenda
// se vea en la web y pone sus topes). Ninguna respuesta trae datos de otra persona, y en los registros no va nada de ella.

async function quienEs(): Promise<string | "sin_sesion" | "sin_respuesta"> {
  const sesion = await leerSesion();
  if (sesion.estado === "con_sesion") return sesion.usuarioId;
  return sesion.estado;
}

/** Guarda (`guardar`) o quita un modelo de sus favoritos. Dos toques iguales dejan lo mismo: nunca «alterna» en la base. */
export async function guardarFavorito(productoId: unknown, guardar: unknown): Promise<EstadoFavorito> {
  const id = esquemaId.safeParse(productoId);
  if (!id.success || typeof guardar !== "boolean") return "no_disponible";
  const quien = await quienEs();
  if (quien === "sin_sesion" || quien === "sin_respuesta") return quien;
  return guardarFavoritoEnBase(quien, id.data, guardar);
}

/** «Avísame cuando llegue» esa prenda en esa tienda (`null`: en cualquier tienda de la web). La llama `BotonAvisame`, en la ficha. */
export async function pedirAviso(varianteId: unknown, sedeId: unknown): Promise<{ estado: EstadoAviso; esperaId: string | null }> {
  const variante = esquemaId.safeParse(varianteId);
  const sede = sedeId === null ? { success: true as const, data: null } : esquemaId.safeParse(sedeId);
  if (!variante.success || !sede.success) return { estado: "no_disponible", esperaId: null };
  const quien = await quienEs();
  if (quien === "sin_sesion" || quien === "sin_respuesta") return { estado: quien, esperaId: null };
  return pedirAvisoEnBase(quien, variante.data, sede.data);
}

/** Quita una de sus esperas («Te avisamos cuando llegue» ▸ Quitar). */
export async function quitarAviso(esperaId: unknown): Promise<EstadoQuitar> {
  const id = esquemaId.safeParse(esperaId);
  if (!id.success) return "no_esta";
  const quien = await quienEs();
  if (quien === "sin_sesion" || quien === "sin_respuesta") return quien;
  return quitarAvisoEnBase(quien, id.data);
}
