"use server";

import type { TipoDocumentoClienta } from "@cayla-retail/shared";
import { redirect } from "next/navigation";
import {
  avisoAlUnirse,
  celularNormalizado,
  documentoRepetido,
  errorDeClub,
  esquemaUnirseAlClub,
  hoyLima,
  MENSAJES,
  mensajeSinNombre,
  nombreEscrito,
  problemaClub,
  TEXTOS_VERSION,
  type CampoProblema,
  type CasillaWhatsapp,
} from "@/lib/cuentas";
import { leerCasillaDeAvisos, unirseAlClubEnBase, revisarClubEnBase, type DatosClub } from "@/lib/cuentas-servidor";
import { conAviso, hrefConVolver, rutaParaVolver } from "@/lib/entrada";
import { huellas } from "@/lib/intentos-servidor";
import { anotarLecturaDelPadron, buscarNombre } from "@/lib/padron-servidor";
import { leerSesion } from "@/lib/sesion-servidor";

// Unirse al Club CAYLA (ADR-0438, Felipe 2026-10-17): la cuenta se crea con lo mínimo y la persona entra al Club recién cuando da su
// documento y su celular, que se piden al separar por primera vez (o cuando ella quiera, desde «Mi perfil»). La llama una persona CON
// sesión, como POST a su página: no confía en nada de lo que llega (lo vuelve a revisar con las reglas de `lib/cuentas.ts`) y la base
// decide (`retail.tienda_revisar_club` y `retail.tienda_unirse_al_club`, que cuentan los intentos y validan todo otra vez). Ninguna
// respuesta trae datos de otra persona. En los registros del servidor nunca va un DNI, un celular ni un nombre.

/** Lo que dice «Unirme al Club» si no lo logra (si lo logra, vuelve a donde estaba): el problema, en su campo. */
export type RespuestaUnirse = { campo: CampoProblema | null; mensaje: string; casilla?: CasillaWhatsapp | null };

const sinUnir = (campo: CampoProblema | null, mensaje: string): RespuestaUnirse => ({ campo, mensaje });

/**
 * El nombre que va a la ficha. Con DNI, SOLO el del padrón, consultado aquí (lo que diga el navegador no cuenta; Felipe 2026-10-15:
 * sin la API no se registra), con los nombres primero; justo antes de unirse deja la lectura en la base (`tienda_anotar_lectura_padron`),
 * que es lo que la ficha exige para aceptar el nombre; si no se pudo anotar, se lee como que el padrón no respondió (se vuelve a
 * intentar). Con carné o pasaporte, el escrito (`problemaClub` ya lo revisó).
 */
async function nombreParaLaFicha(
  tipo: TipoDocumentoClienta,
  numero: string,
  escrito: string,
): Promise<{ estado: "ok"; nombre: string } | { estado: "no_encontrado" | "sin_padron" }> {
  if (tipo !== "dni") return { estado: "ok", nombre: escrito };
  const padron = await buscarNombre(numero);
  if (padron.estado !== "encontrado") return { estado: padron.estado };
  if (!(await anotarLecturaDelPadron(numero, padron.nombre))) return { estado: "sin_padron" };
  return { estado: "ok", nombre: padron.nombre };
}

/**
 * «Unirme al Club». El orden seguro (principio 9): (1) los datos, otra vez; (2) la sesión, validada con el proyecto de clientes; (3) la
 * base revisa el documento y los topes (y cuenta el intento); (4) los avisos: el texto que leyó sigue siendo el vigente; (5) el nombre
 * del padrón, anotado en la base (sin él no hay ficha); (6) la base la une al Club, todo o nada. Si algo dice que no, no queda nada
 * escrito. (7) Vuelve a donde estaba (la bolsa) o va a «Mi perfil».
 */
export async function unirseAlClub(entrada: unknown): Promise<RespuestaUnirse> {
  const leido = esquemaUnirseAlClub.safeParse(entrada);
  if (!leido.success) return sinUnir(null, MENSAJES.clubNoDisponible);
  const { registro: r, casilla } = leido.data;
  const volver = rutaParaVolver(leido.data.volver);
  const problema = problemaClub(r, hoyLima());
  if (problema) return problema;

  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect(hrefConVolver("/entrar", volver ?? "/cuenta/club"));
  if (sesion.estado === "sin_respuesta") return sinUnir(null, MENSAJES.clubNoDisponible);

  const documento = { tipo: r.documentoTipo, numero: r.documento };
  const h = await huellas(documento);
  if (!h?.documento) {
    console.error(JSON.stringify({ evento: "tienda_cuentas_sin_configurar", huellas: !!h }));
    return sinUnir(null, MENSAJES.clubNoDisponible);
  }
  const celular = celularNormalizado(r.celular);

  // 3. La base revisa (y cuenta el intento).
  const revision = await revisarClubEnBase(sesion.usuarioId, documento, celular, h.ip, h.documento);
  if (revision.estado === "ya_es_del_club") redirect(volver ?? "/cuenta");
  if (revision.estado !== "ok") {
    if (revision.estado === "limite") return sinUnir(null, MENSAJES.limite);
    if (revision.estado === "dni_repetido") return sinUnir("documento", documentoRepetido(r.documentoTipo));
    if (revision.estado === "archivada") return sinUnir("documento", MENSAJES.dniArchivada);
    if (revision.estado === "invalido") return errorDeClub("cuenta_datos_invalidos", revision.campo, r.documentoTipo);
    return sinUnir(null, MENSAJES.clubNoDisponible);
  }

  // 4. Los avisos citan el texto que leyó: si cambió, que lo vuelva a leer.
  if (r.avisos) {
    const vigente = await leerCasillaDeAvisos();
    if (!vigente || vigente.version !== casilla) return { campo: "avisos", mensaje: MENSAJES.avisosCambio, casilla: vigente };
  }

  // 5. El nombre. Con DNI, el del padrón, anotado en la base; con carné o pasaporte, el escrito tal cual, con los nombres primero.
  const nombre = await nombreParaLaFicha(r.documentoTipo, r.documento, nombreEscrito(r));
  if (nombre.estado !== "ok") return sinUnir("documento", mensajeSinNombre(nombre.estado));

  // 6. La base la une al Club.
  const conCumple = r.cumple.d !== "" && r.cumple.m !== "";
  const datos: DatosClub = {
    usuarioWebId: sesion.usuarioId,
    documentoTipo: r.documentoTipo,
    documento: r.documento,
    nombre: nombre.nombre,
    nombreDelPadron: r.documentoTipo === "dni",
    celular,
    cumpleDia: conCumple ? Number(r.cumple.d) : null,
    cumpleMes: conCumple ? Number(r.cumple.m) : null,
    cumpleAnio: conCumple && r.cumple.a ? Number(r.cumple.a) : null,
    mayorDeEdad: r.mayor,
    avisosWhatsapp: r.avisos,
    casillaVersion: r.avisos ? casilla : null,
    textos: TEXTOS_VERSION,
  };
  const union = await unirseAlClubEnBase(datos);
  if (!union.ok) {
    const e = errorDeClub(union.hint, union.detalle, r.documentoTipo);
    if (e.campo === "avisos") return { ...e, casilla: await leerCasillaDeAvisos() };
    return e;
  }
  // Un doble envío (la primera ya la unió): se vuelve a donde estaba, sin otro aviso de bienvenida.
  if (union.yaEra) redirect(volver ?? "/cuenta");

  // 7. A donde estaba, con la bienvenida al Club abajo. Salvo los avisos que no se activaron: esa nota vive en «Mi perfil».
  const aviso = avisoAlUnirse(union.seUnioASuFicha, union.eraDelClub, union.avisos);
  redirect(volver && aviso !== "avisos-sin-activar" ? conAviso(volver, aviso) : `/cuenta?aviso=${aviso}`);
}
