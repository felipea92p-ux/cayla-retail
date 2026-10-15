"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ResultadoEnvio } from "@/lib/recomendaciones";
import { recomendarEnBase } from "@/lib/recomendaciones-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// «Enviar recomendación» (ADR-0408, Felipe 2026-10-15). La llama una persona CON sesión desde /recomendaciones. No confía en nada de lo
// que llega: revisa la forma (un texto de un largo con sentido, la tienda y la marca como ids), pregunta quién es al proyecto de clientes
// (no basta la cookie) y la base decide el resto (`retail.tienda_recomendar`: limpia el texto, mide su largo, que la tienda se vea en la
// web, el tope por día y que la misma marca no se guarde dos veces). En los registros no va nada de la persona ni lo que escribió.

const id = z.string().uuid();
/** El tope lo pone la base (1000 letras ya limpias); aquí solo se frena un envío desmedido antes de mandarlo. */
const ENVIO_DESMEDIDO = 5000;

export async function enviarRecomendacion(texto: unknown, sedeId: unknown, marca: unknown): Promise<ResultadoEnvio> {
  if (typeof texto !== "string") return { estado: "invalido", campo: "texto", detalle: "corto" };
  if (texto.length > ENVIO_DESMEDIDO) return { estado: "invalido", campo: "texto", detalle: "largo" };
  const sede = sedeId === null ? { success: true as const, data: null } : id.safeParse(sedeId);
  if (!sede.success) return { estado: "invalido", campo: "sobre", detalle: null };
  const laMarca = id.safeParse(marca);
  if (!laMarca.success) return { estado: "invalido", campo: "marca", detalle: null };
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") return { estado: "sin_sesion" };
  if (sesion.estado === "sin_respuesta") return { estado: "sin_respuesta" };
  const r = await recomendarEnBase(sesion.usuarioId, texto, sede.data, laMarca.data);
  // La lista de «Lo que nos escribiste» se vuelve a leer con la nueva.
  if (r.estado === "enviada") revalidatePath("/recomendaciones");
  return r;
}
