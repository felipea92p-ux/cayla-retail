"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { leerMiCuentaEnBase } from "@/lib/cuentas-servidor";
import { huellas } from "@/lib/intentos-servidor";
import type { ResultadoHoja } from "@/lib/libro-reclamaciones";
import { mandarCopias, registrarHojaEnBase } from "@/lib/libro-reclamaciones-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// «Enviar hoja de reclamación» (ADR-0679, Felipe 2026-11-18). La llama CUALQUIERA desde /libro-de-reclamaciones: la ley no deja pedir
// cuenta. No confía en nada de lo que llega: revisa la forma (textos de un largo con sentido, la marca como id) y la base decide el resto
// (`retail.tienda_registrar_hoja_reclamacion`: valida cada campo, le da su número y frena a quien manda muchas). Si tiene sesión, la hoja
// queda ligada a su cuenta; si el proyecto de clientes no contesta, se guarda igual sin cuenta (nadie pierde su derecho a reclamar por
// eso). En los registros no va nada de la persona ni lo que escribió.

/** Lo más largo que la base acepta es el detalle (3000); aquí solo se frena un envío desmedido antes de mandarlo. */
const ENVIO_DESMEDIDO = 6000;
const texto = z.string().max(ENVIO_DESMEDIDO);
const esquema = z.object({
  tipo: texto,
  nombre: texto,
  tipo_documento: texto,
  documento: texto,
  domicilio: texto,
  telefono: texto,
  correo: texto,
  menor_de_edad: z.boolean(),
  apoderado: texto,
  bien_tipo: texto,
  monto: texto,
  bien_descripcion: texto,
  detalle: texto,
  pedido: texto,
  ubicacion_id: texto,
});

export async function enviarHojaDeReclamacion(datos: unknown, marca: unknown): Promise<ResultadoHoja> {
  const forma = esquema.safeParse(datos);
  if (!forma.success) return { estado: "invalido", campo: null };
  const laMarca = z.string().uuid().safeParse(marca);
  if (!laMarca.success) return { estado: "invalido", campo: null };
  const sesion = await leerSesion().catch(() => ({ estado: "sin_respuesta" as const }));
  const usuario = sesion.estado === "con_sesion" ? sesion.usuarioId : null;
  const h = await huellas();
  const r = await registrarHojaEnBase(forma.data, usuario, h?.ip ?? null, laMarca.data);
  // La copia sale enseguida. Si el correo falla (o tarda), la hoja ya está guardada: la tarea programada la reintenta
  // (`/api/libro-copias`) y la constancia dice «te la enviamos en unos minutos».
  if (r.estado === "registrada") await mandarCopias(await origenDeLaPeticion(), { limite: 1, id: r.id }).catch(() => null);
  return r;
}

/** La dirección de la tienda desde la que llegó la petición (para el enlace a la constancia en el correo). */
async function origenDeLaPeticion(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Con sesión, su nombre y su correo para empezar la hoja (los puede cambiar). Sin sesión o sin respuesta, nada: se llena a mano. */
export async function misDatosParaLaHoja(): Promise<{ nombre: string; correo: string } | null> {
  const sesion = await leerSesion().catch(() => null);
  if (sesion?.estado !== "con_sesion") return null;
  const cuenta = await leerMiCuentaEnBase(sesion.usuarioId);
  return cuenta.estado === "cuenta" ? { nombre: cuenta.cuenta.nombre, correo: cuenta.cuenta.correo } : null;
}
