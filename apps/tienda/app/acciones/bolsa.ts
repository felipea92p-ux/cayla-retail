"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AGREGAR_AGOTADA,
  AGREGAR_LLENA,
  AGREGAR_LLENA_LOOK,
  AGREGAR_NO_ALCANZA,
  AGREGAR_NO_ESTA,
  AGREGAR_OTRA_TIENDA,
  AGREGAR_SIN_RESPUESTA,
  AGREGAR_TOPE_PRENDA,
  AGREGAR_TOPE_PRENDA_LOOK,
  agregarUna,
  agregarVarias,
  avisoAgregada,
  BOLSA_CAMBIO,
  BOLSA_VACIA,
  cuantasDe,
  elegirSede,
  esId,
  pasaElTopePorPrenda,
  quitarLinea,
  quitarUna,
  respuestaDeSeparar,
  revisarParaAgregar,
  SEPARAR_SIN_RESPUESTA,
  sinPrendas,
  TOPE_POR_PRENDA,
  TOPE_PRENDAS,
  unidades,
  type Bolsa,
} from "@/lib/bolsa";
import { hrefConVolver } from "@/lib/entrada";
import { guardarBolsa, leerBolsaDeLaCookie, leerBolsaEnBase, separarEnBase } from "@/lib/bolsa-servidor";
import { variantesParaLaBolsa } from "@/lib/looks";
import { codigoDeLaUrl, vivas } from "@/lib/pedidos";
import { leerPedido } from "@/lib/pedidos-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// Las acciones de la bolsa (ADR-0408, actividad 7). Son las ÚNICAS que escriben la cookie de la bolsa. Agregar, quitar y elegir
// la tienda solo tocan la cookie de este aparato (agregar no separa nada: propuesta f); «Separar» es lo único que escribe en la
// base, y lo decide la base (`retail.tienda_separar`). Cada cambio de la bolsa le pone una marca nueva: la del próximo «Separar».

/** ¿La bolsa ya lleva prendas de OTRA tienda que la que se está mirando? Si es así, no se mezclan (la bolsa es de una sola tienda). */
function deOtraTienda(bolsa: Bolsa, sedeId: unknown): boolean {
  return bolsa.lineas.length > 0 && bolsa.sedeId !== null && esId(sedeId) && sedeId !== bolsa.sedeId;
}

export type RespuestaAgregar = { estado: "agregada"; mensaje: string; cuantas: number } | { estado: "no"; mensaje: string };

/**
 * «Agregar a la bolsa» de la ficha, «Agregar» con la talla de las tarjetas y el «+» de la cantidad en la bolsa
 * (`components/bolsa/AgregarALaBolsa.tsx`, `components/RapidoDeTarjeta.tsx`, `components/bolsa/CantidadEnLaBolsa.tsx`). `sedeId`: la
 * tienda que el cliente venía mirando («Ver lo que hay en»); queda elegida para recoger si todavía no eligió otra (maqueta).
 *
 * Como la maqueta, no deja agregar más de lo que hay en la tienda elegida (cada tienda maneja lo suyo): «Esa talla se agotó en esta tienda» si no
 * queda ninguna, y «Ya tienes en tu bolsa todas las que quedan» si las que quedan ya están en su bolsa.
 */
export async function agregarALaBolsa(varianteId: unknown, sedeId: unknown): Promise<RespuestaAgregar> {
  if (!esId(varianteId)) return { estado: "no", mensaje: AGREGAR_NO_ESTA };
  // Sin pedir cuenta (Felipe 2026-10-17): la bolsa vive en la cookie de este aparato y agregar no separa nada; la cuenta se pide al «Separar».
  const bolsa = await leerBolsaDeLaCookie();
  if (deOtraTienda(bolsa, sedeId)) return { estado: "no", mensaje: AGREGAR_OTRA_TIENDA };
  if (cuantasDe(bolsa, varianteId) >= TOPE_POR_PRENDA) return { estado: "no", mensaje: AGREGAR_TOPE_PRENDA };
  const nueva = agregarUna(bolsa, varianteId, { marca: randomUUID() });
  if (!nueva) return { estado: "no", mensaje: AGREGAR_LLENA };
  // La base dice si se puede: en la Vitrina, con precio, y con todas las que llevaría de esta prenda en alguna tienda de la web.
  const cantidad = nueva.lineas.find((l) => l.varianteId === varianteId)?.cantidad ?? 1;
  const enBase = await leerBolsaEnBase([{ varianteId, cantidad }], null);
  if (!enBase) return { estado: "no", mensaje: AGREGAR_SIN_RESPUESTA };
  // Cada tienda maneja lo suyo: se revisa lo que hay en la tienda de la bolsa o, si todavía no tiene, en la que el cliente miraba.
  const sedeQueMiraba = esId(sedeId) && enBase.sedes.some((s) => s.id === sedeId) ? sedeId : null;
  const revisada = revisarParaAgregar(enBase.lineas[0], bolsa.sedeId ?? sedeQueMiraba);
  if (revisada.tipo === "no_esta") return { estado: "no", mensaje: AGREGAR_NO_ESTA };
  if (revisada.tipo === "agotada") return { estado: "no", mensaje: AGREGAR_AGOTADA };
  if (revisada.tipo === "no_alcanza") return { estado: "no", mensaje: AGREGAR_NO_ALCANZA };

  await guardarBolsa({ ...nueva, sedeId: bolsa.sedeId ?? sedeQueMiraba });
  return { estado: "agregada", mensaje: avisoAgregada(revisada.linea), cuantas: unidades(nueva) };
}

export type RespuestaAgregarLook =
  /** `agregadas`: las variantes que entraron (puede ser ninguna); `agotadas` y `noEstan`: las que no, y por qué. */
  | { estado: "listo"; agregadas: string[]; agotadas: string[]; noEstan: string[]; cuantas: number }
  | { estado: "no"; mensaje: string };

/**
 * «Agregar N prendas a mi bolsa» de un look (`components/looks/AgregarLookALaBolsa.tsx`; maqueta, `t-look-agregar`): una prenda por cada
 * talla elegida, con las MISMAS reglas que «Agregar a la bolsa»: la base dice antes si cada una se puede (en la Vitrina, con precio y
 * con todas las que llevaría en alguna tienda de la web), y el precio no viaja: lo pone la base al mostrar la bolsa, con la tienda de
 * recojo. Si no caben todas (20 prendas), no se agrega ninguna; si alguna se agotó o ya no está, entran las demás y la respuesta dice
 * cuál quedó fuera. `sedeId`: la tienda que el cliente venía mirando; queda elegida para recoger si todavía no eligió otra.
 */
export async function agregarLookALaBolsa(varianteIds: unknown, sedeId: unknown): Promise<RespuestaAgregarLook> {
  const ids = variantesParaLaBolsa(varianteIds);
  if (!ids) return { estado: "no", mensaje: AGREGAR_NO_ESTA };

  const bolsa = await leerBolsaDeLaCookie();
  if (deOtraTienda(bolsa, sedeId)) return { estado: "no", mensaje: AGREGAR_OTRA_TIENDA };
  if (pasaElTopePorPrenda(bolsa, ids)) return { estado: "no", mensaje: AGREGAR_TOPE_PRENDA_LOOK };
  const conTodas = agregarVarias(bolsa, ids, { marca: randomUUID() });
  if (!conTodas) return { estado: "no", mensaje: AGREGAR_LLENA_LOOK };
  // Cada prenda se pregunta con todas las que llevaría la bolsa (las que ya estaban más las del look), como al agregar una sola.
  const unicas = [...new Set(ids)];
  const enBase = await leerBolsaEnBase(
    unicas.map((v) => ({ varianteId: v, cantidad: conTodas.lineas.find((l) => l.varianteId === v)?.cantidad ?? 1 })),
    null,
  );
  if (!enBase) return { estado: "no", mensaje: AGREGAR_SIN_RESPUESTA };
  const sedeQueMiraba = esId(sedeId) && enBase.sedes.some((s) => s.id === sedeId) ? sedeId : null;
  const tipo = new Map(unicas.map((v) => [v, revisarParaAgregar(enBase.lineas.find((l) => l.varianteId === v), bolsa.sedeId ?? sedeQueMiraba).tipo]));
  const agregadas = ids.filter((v) => tipo.get(v) === "entra");
  // Una que no alcanza (las que quedan ya están en la bolsa) queda fuera igual que una agotada: el look dice que no entró.
  const agotadas = unicas.filter((v) => tipo.get(v) === "agotada" || tipo.get(v) === "no_alcanza");
  const noEstan = unicas.filter((v) => tipo.get(v) === "no_esta");
  if (agregadas.length === 0) return { estado: "listo", agregadas, agotadas, noEstan, cuantas: unidades(bolsa) };

  // Las que entran caben: son parte de las que ya cabían todas.
  const nueva = agregarVarias(bolsa, agregadas, { marca: randomUUID() });
  if (!nueva) return { estado: "no", mensaje: AGREGAR_LLENA_LOOK };
  await guardarBolsa({ ...nueva, sedeId: bolsa.sedeId ?? sedeQueMiraba });
  return { estado: "listo", agregadas, agotadas, noEstan, cuantas: unidades(nueva) };
}

/** El «−» de la cantidad saca UNA; «Quitar» (`todas=1`) saca la prenda entera. Las dos, solo si el cliente veía esa cantidad (dos
 *  toques seguidos sacan una sola vez). */
export async function quitarDeLaBolsa(datos: FormData): Promise<void> {
  const variante = datos.get("variante");
  const vista = Number(datos.get("vista"));
  if (!esId(variante) || !Number.isInteger(vista)) return;
  const bolsa = await leerBolsaDeLaCookie();
  const quitar = datos.get("todas") === "1" ? quitarLinea : quitarUna;
  const nueva = quitar(bolsa, variante, { vista, marca: randomUUID() });
  if (nueva !== bolsa) await guardarBolsa(nueva);
}

/** Cambiar de tienda con prendas en la bolsa (la cabecera lo avisa antes): la bolsa se vacía y la próxima prenda la hace de la nueva tienda. */
export async function vaciarBolsaPorCambioDeTienda(): Promise<void> {
  await guardarBolsa(BOLSA_VACIA);
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
 *  siendo esa (si el cliente quita una prenda o cambia de tienda, el aviso ya no corresponde y se va). `enlace`: adónde ir a
 *  resolverlo, si es en otra página (con el tope de separaciones, «Mis pedidos»). */
export type EstadoSeparar = { mensaje: string; marca: string | null; enlace?: { texto: string; href: string } | null } | null;

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
  // La cuenta se pide AQUÍ, al separar (Felipe 2026-10-17): la bolsa queda en la cookie y la persona vuelve a ella al entrar.
  if (sesion.estado === "sin_sesion") redirect(hrefConVolver("/entrar", "/bolsa"));
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
    return { ...respuestaDeSeparar(r.hint, r.detalle), marca };
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
