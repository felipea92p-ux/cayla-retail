"use server";

import { z } from "zod";
import type { EstadoCanje } from "@/lib/puntos";
import { canjearPuntosEnBase } from "@/lib/puntos-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// «Canjear mis puntos» (programa de puntos, actividad 6). La llama una persona CON sesión desde «Mi perfil». No confía en nada de lo que
// llega: revisa que los puntos sean un entero positivo de 100 en 100 y que la clave de la operación tenga forma de clave, pregunta quién
// es al proyecto de clientes (no basta la cookie) y la base decide (`retail.tienda_canjear_puntos`: solo toca los puntos de esa cuenta,
// pone el mínimo y el saldo). La respuesta no trae datos de otra persona, y en los registros no va nada de ella.

const esquema = z.object({ puntos: z.number().int().min(100).max(1_000_000).refine((n) => n % 100 === 0), token: z.string().uuid() });

export async function canjearPuntos(puntos: unknown, token: unknown): Promise<EstadoCanje> {
  const p = esquema.safeParse({ puntos, token });
  if (!p.success) return { estado: "multiplo" };
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") return { estado: "sin_sesion" };
  if (sesion.estado === "sin_respuesta") return { estado: "sin_respuesta" };
  return canjearPuntosEnBase(sesion.usuarioId, p.data.puntos, p.data.token);
}
