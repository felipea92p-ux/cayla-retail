"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ResultadoEnvio } from "@/lib/recomendaciones";
import { quedanHoy } from "@/lib/recomendaciones";
import { leerMisRecomendaciones, recomendarEnBase, type LecturaMisRecomendaciones } from "@/lib/recomendaciones-servidor";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import { leerSedes } from "@/lib/tiendas-servidor";

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

/**
 * Lo que la ventana flotante necesita al abrirse (Felipe 2026-10-31): lo mismo que lee la página /recomendaciones, pero a pedido y desde
 * el navegador, para que el botón flotante no obligue a ninguna página a leer la sesión (la portada sigue guardada en caché). Sin sesión
 * dice «sin_sesion» y la ventana manda a «Entrar»; si la base no contesta, «sin_respuesta» y la ventana lo dice sin romper la página.
 */
export type VentanaRecomendaciones =
  | { estado: "sin_sesion" | "sin_cuenta" | "sin_respuesta" }
  | {
      estado: "ok";
      nombre: string;
      nombreCorto: string;
      tope: number;
      quedanHoy: number;
      sedes: { id: string; nombre: string }[];
      lectura: LecturaMisRecomendaciones;
    };

export async function abrirVentanaRecomendaciones(): Promise<VentanaRecomendaciones> {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") return { estado: "sin_sesion" };
  if (sesion.estado === "sin_respuesta") return { estado: "sin_respuesta" };
  const [cuenta, mias, sedes] = await Promise.all([leerMiCuentaEnBase(sesion.usuarioId), leerMisRecomendaciones(sesion.usuarioId), leerSedes()]);
  if (cuenta.estado === "sin_respuesta") return { estado: "sin_respuesta" };
  if (cuenta.estado === "sin_cuenta") return { estado: "sin_cuenta" };
  const tope = mias.estado === "ok" ? mias.mias.tope : 3;
  return {
    estado: "ok",
    nombre: cuenta.cuenta.nombre,
    nombreCorto: cuenta.cuenta.nombreCorto,
    tope,
    // Si la base no dijo cuántas lleva, se deja escribir: la base pone el tope igual al enviar.
    quedanHoy: mias.estado === "ok" ? quedanHoy(mias.mias) : tope,
    sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre })),
    lectura: mias,
  };
}
