"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AGREGAR_AGOTADA,
  AGREGAR_LLENA,
  AGREGAR_NO_ESTA,
  AGREGAR_SIN_RESPUESTA,
  agregarUna,
  avisoAgregada,
  BOLSA_CAMBIO,
  elegirSede,
  esId,
  MENSAJES_SEPARAR,
  quitarUna,
  SEPARAR_SIN_RESPUESTA,
  sinPrendas,
  TOPE_PRENDAS,
  unidades,
  yaNoEsta,
} from "@/lib/bolsa";
import { guardarBolsa, leerBolsaDeLaCookie, leerBolsaEnBase, separarEnBase } from "@/lib/bolsa-servidor";
import { codigoDeLaUrl, vivas } from "@/lib/pedidos";
import { leerPedido } from "@/lib/pedidos-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// Las acciones de la bolsa (ADR-0408, actividad 7). Son las ÚNICAS que escriben la cookie de la bolsa. Agregar, quitar y elegir
// la tienda solo tocan la cookie de este aparato (agregar no separa nada: propuesta f); «Separar» es lo único que escribe en la
// base, y lo decide la base (`retail.tienda_separar`). Cada cambio de la bolsa le pone una marca nueva: la del próximo «Separar».

export type RespuestaAgregar =
  { estado: "agregada"; mensaje: string; cuantas: number } | { estado: "sin_sesion" } | { estado: "no"; mensaje: string };

/**
 * @public «Agregar a la bolsa» de la ficha y «Agregar» con la talla de las tarjetas (`components/bolsa/AgregarALaBolsa.tsx`):
 * los pone la integración de la tienda en la ficha y en las tarjetas (actividades 4 y 5). `sedeId`: la tienda que el cliente venía
 * mirando («Ver lo que hay en»); queda elegida para recoger si todavía no eligió otra (maqueta).
 *
 * Como la maqueta, no deja agregar más de lo que hay en las tiendas de la web («Esa talla ya no está en ninguna tienda»).
 */
export async function agregarALaBolsa(varianteId: unknown, sedeId: unknown): Promise<RespuestaAgregar> {
  if (!esId(varianteId)) return { estado: "no", mensaje: AGREGAR_NO_ESTA };
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") return { estado: "sin_sesion" };
  if (sesion.estado === "sin_respuesta") return { estado: "no", mensaje: AGREGAR_SIN_RESPUESTA };

  const bolsa = await leerBolsaDeLaCookie();
  const nueva = agregarUna(bolsa, varianteId, { marca: randomUUID() });
  if (!nueva) return { estado: "no", mensaje: AGREGAR_LLENA };
  // La base dice si se puede: en la Vitrina, con precio, y con todas las que llevaría de esta prenda en alguna tienda de la web.
  const cantidad = nueva.lineas.find((l) => l.varianteId === varianteId)?.cantidad ?? 1;
  const enBase = await leerBolsaEnBase([{ varianteId, cantidad }], null);
  if (!enBase) return { estado: "no", mensaje: AGREGAR_SIN_RESPUESTA };
  const linea = enBase.lineas[0];
  if (!linea || yaNoEsta(linea)) return { estado: "no", mensaje: AGREGAR_NO_ESTA };
  if (!linea.alcanzaEnTotal) return { estado: "no", mensaje: AGREGAR_AGOTADA };

  const sedeQueMiraba = esId(sedeId) && enBase.sedes.some((s) => s.id === sedeId) ? sedeId : null;
  await guardarBolsa({ ...nueva, sedeId: bolsa.sedeId ?? sedeQueMiraba });
  return { estado: "agregada", mensaje: avisoAgregada(linea), cuantas: unidades(nueva) };
}

/** «Quitar» saca UNA, solo si el cliente veía esa cantidad (dos toques seguidos sacan una sola). */
export async function quitarDeLaBolsa(datos: FormData): Promise<void> {
  const variante = datos.get("variante");
  const vista = Number(datos.get("vista"));
  if (!esId(variante) || !Number.isInteger(vista)) return;
  const bolsa = await leerBolsaDeLaCookie();
  const nueva = quitarUna(bolsa, variante, { vista, marca: randomUUID() });
  if (nueva !== bolsa) await guardarBolsa(nueva);
}

/** «¿En qué tienda lo recoges?»: una para todo. La página vuelve con los precios de esa tienda. */
export async function elegirTiendaDeRecojo(datos: FormData): Promise<void> {
  const sede = datos.get("sede");
  if (!esId(sede)) return;
  const bolsa = await leerBolsaDeLaCookie();
  const nueva = elegirSede(bolsa, sede, randomUUID());
  if (nueva !== bolsa) await guardarBolsa(nueva);
}

/** El aviso de un intento que no separó, con la marca de la bolsa de ese momento: la página lo muestra mientras la bolsa siga
 *  siendo esa (si el cliente quita una prenda o cambia de tienda, el aviso ya no corresponde y se va). */
export type EstadoSeparar = { mensaje: string; marca: string | null } | null;

const esquemaVistas = z
  .array(z.object({ variante_id: z.string(), cantidad: z.number().int().min(1), precio: z.number().nonnegative() }))
  .min(1)
  .max(TOPE_PRENDAS);

/**
 * «Separar en Trujillo». Viaja lo que el cliente VIO (cada prenda, cuántas y su precio): si ya no es lo que hay en su bolsa (otra
 * pestaña la cambió) o la base calcula otro precio, no se separa nada y la página vuelve con lo de ahora. Si sale bien, la bolsa
 * queda vacía en la misma respuesta y se va a «¡Listo, lo separaste!».
 */
export async function separar(_previo: EstadoSeparar, datos: FormData): Promise<EstadoSeparar> {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const bolsa = await leerBolsaDeLaCookie();
  if (sesion.estado === "sin_respuesta") return { mensaje: SEPARAR_SIN_RESPUESTA, marca: bolsa.marca };

  const sede = datos.get("sede");
  let vistas: z.infer<typeof esquemaVistas>;
  try {
    vistas = esquemaVistas.parse(JSON.parse(String(datos.get("lineas") ?? "")));
  } catch {
    refresh();
    return { mensaje: BOLSA_CAMBIO, marca: bolsa.marca };
  }
  const igual =
    vistas.length === bolsa.lineas.length &&
    vistas.every((v) => bolsa.lineas.some((l) => l.varianteId === v.variante_id && l.cantidad === v.cantidad));
  if (!esId(sede) || sede !== bolsa.sedeId || !igual) {
    refresh();
    return { mensaje: BOLSA_CAMBIO, marca: bolsa.marca };
  }

  // La marca vive en la cookie: si esta respuesta se pierde, volver a tocar «Separar» usa la misma y la base devuelve el mismo pedido.
  let marca = bolsa.marca;
  if (!marca) {
    marca = randomUUID();
    await guardarBolsa({ ...bolsa, marca });
  }
  const r = await separarEnBase(sesion.usuarioId, sede, vistas, marca);
  if (!r.ok) {
    refresh();
    return { mensaje: (r.hint ? MENSAJES_SEPARAR[r.hint] : undefined) ?? SEPARAR_SIN_RESPUESTA, marca };
  }
  await guardarBolsa(sinPrendas(bolsa));
  redirect(`/bolsa/separado/${r.codigo}`);
}

/** «Volver a separar» un pedido que se cerró sin confirmar: sus prendas vuelven a la bolsa, en la misma tienda (maqueta). */
export async function volverASeparar(datos: FormData): Promise<void> {
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  const codigo = codigoDeLaUrl(String(datos.get("codigo") ?? ""));
  if (sesion.estado !== "con_sesion" || !codigo) redirect("/cuenta/pedidos");
  const lectura = await leerPedido(sesion.usuarioId, codigo);
  if (lectura.estado !== "ok") redirect(`/cuenta/pedidos/${codigo}`);

  const cuantas = new Map<string, number>();
  for (const l of vivas(lectura.pedido)) cuantas.set(l.varianteId, (cuantas.get(l.varianteId) ?? 0) + 1);
  await guardarBolsa({
    lineas: [...cuantas].map(([varianteId, cantidad]) => ({ varianteId, cantidad })),
    sedeId: lectura.pedido.ubicacionId,
    marca: randomUUID(),
  });
  redirect("/bolsa");
}
