"use server";

import { z } from "zod";
import { esId } from "@/lib/bolsa";
import { tallasDelColor } from "@/lib/ficha";
import { leerFicha } from "@/lib/ficha-servidor";
import type { RespuestaGuardarLook } from "@/lib/looks-guardados";
import { guardarLookEnBase, quitarLookEnBase, renombrarLookEnBase } from "@/lib/looks-guardados-servidor";
import { piezasParaLasTallas, type TallasDeTuLook } from "@/lib/probador";
import { leerSesion } from "@/lib/sesion-servidor";
import { hayAlgo } from "@/lib/stock";

// Las tallas de «Arma el tuyo» (ADR-0434, actividad 6). El probador no las trae con la página (serían miles de filas para cada visita y
// solo se usan al llevar el look a la bolsa): se piden al tocar «Agregar a mi bolsa», y salen de la MISMA ficha que la tienda ya guarda
// medio minuto (`leerFicha`): las tallas que la ficha ofrece de ese color en la tienda elegida, cada una diciendo solo si hay o no en
// alguna tienda de la web (como los looks: lo que falta en la tienda de recojo se trae con un traslado). Solo lee: lo que se agrega lo
// decide la bolsa, que vuelve a preguntarle a la base.

/** Las tallas de cada prenda del look en su color. `null` si llegó algo raro o la base no responde (la barra lo dice y se vuelve a
 *  intentar); una prenda que ya no se ve en la web vuelve sin tallas (no se agrega). */
export async function tallasDeTuLook(piezas: unknown, sedeId: unknown): Promise<TallasDeTuLook | null> {
  const lista = piezasParaLasTallas(piezas);
  if (!lista) return null;
  const sede = esId(sedeId) ? sedeId : null;
  const fichas = await Promise.all(lista.map((p) => leerFicha(p.id, sede)));
  if (fichas.some((f) => f === null)) return null;
  return lista.map((p, i) => {
    const ficha = fichas[i];
    if (!ficha || ficha === "no_esta") return { ...p, tallas: [] };
    return {
      ...p,
      tallas: tallasDelColor(ficha, p.color).map(({ talla, variante }) => ({ varianteId: variante.id, talla: talla.nombre, hay: hayAlgo(variante.total) })),
    };
  });
}

/* ---------------- Guardar el look en sus favoritos (actividad 8) ---------------- */

// Las llama una persona CON sesión desde el probador o desde su look guardado. No confían en nada de lo que llega: revisan la forma,
// preguntan quién es al proyecto de clientes (no basta la cookie) y la base decide (`retail.tienda_*_look`: solo toca lo de esa cuenta,
// valida que cada prenda se vea en la web y pone el tope de 30).

async function quienEs(): Promise<string | "sin_sesion" | "sin_respuesta"> {
  const sesion = await leerSesion();
  if (sesion.estado === "con_sesion") return sesion.usuarioId;
  return sesion.estado;
}

const esquemaParaGuardar = z.array(z.object({ producto_id: z.string().uuid(), color: z.string().regex(/^[A-Za-z0-9]{1,12}$/) })).min(1).max(4);

/** Guarda el look del probador en sus favoritos. Guardar el mismo otra vez responde el que ya estaba (no duplica). */
export async function guardarTuLook(piezas: unknown): Promise<RespuestaGuardarLook> {
  const lista = esquemaParaGuardar.safeParse(piezas);
  if (!lista.success) return { estado: "invalido", id: null, nombre: null };
  const quien = await quienEs();
  if (quien === "sin_sesion" || quien === "sin_respuesta") return { estado: quien, id: null, nombre: null };
  return guardarLookEnBase(quien, lista.data, null);
}

/** Lo quita de sus favoritos (no se borra). `true` si quedó quitado. */
export async function quitarTuLook(lookId: unknown): Promise<boolean> {
  if (!esId(lookId)) return false;
  const quien = await quienEs();
  if (quien === "sin_sesion" || quien === "sin_respuesta") return false;
  return quitarLookEnBase(quien, lookId);
}

/** Le cambia el nombre: el que quedó, o null si no se pudo (vacío, largo, ya no está o la base no contestó). */
export async function renombrarTuLook(lookId: unknown, nombre: unknown): Promise<string | null> {
  if (!esId(lookId) || typeof nombre !== "string" || nombre.length > 200) return null;
  const quien = await quienEs();
  if (quien === "sin_sesion" || quien === "sin_respuesta") return null;
  const r = await renombrarLookEnBase(quien, lookId, nombre);
  return r === "sin_respuesta" ? null : r;
}

