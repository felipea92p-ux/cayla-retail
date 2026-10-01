"use server";

import { consultarPadron } from "@/lib/padron";
import { crearClienteAdmin } from "@/lib/supabase-admin";
import { huellaDeLaIp, huellaDelDocumento } from "@/lib/club-intentos";
import { leerPaginaClub } from "@/lib/club-pagina";
import { hoyLima } from "@/lib/fechas-lima";
import { normalizarNumeroDocumento } from "@/lib/documento-clienta-reglas";
import {
  MENSAJE,
  argumentosRegistro,
  errorDeLaBase,
  esUuid,
  leerDatosRegistro,
  nombreAMedias,
  problemasRegistro,
  respuestaDeRegistro,
  type CampoRegistro,
  type DatosRegistro,
  type RespuestaConsulta,
  type RespuestaRegistro,
} from "@/lib/club-registro-reglas";

// Las dos acciones de la página PÚBLICA del Club CAYLA (ADR-0288 act. g, tanda 1g). La llama una clienta sin cuenta y viajan
// como POST a `/club/<tienda>`, que `proxy.ts` deja pasar sin sesión (`lib/rutas-publicas.ts`). Por eso no confían en nada de
// lo que llega —los argumentos de una acción los puede mandar cualquiera— y corren con la LLAVE DE SERVICIO
// (`crearClienteAdmin`, que nunca sale del servidor): `club_intento` y `registrarse_en_el_club` solo las ejecuta el servidor de
// la web, nunca `anon`. Antes de todo, `club_intento` anota el intento y dice si está dentro del límite (G-10); la ip y el
// documento viajan como huellas con sal (`lib/club-intentos.ts`), nunca en claro.
//
// Ninguna respuesta revela datos de otra persona: el nombre del padrón sale a medias («Lucía P. S.») y los errores son los
// textos de `MENSAJE`, iguales para cualquier documento.

const ERROR_GENERAL: RespuestaRegistro = { estado: "error", mensaje: MENSAJE.noDisponible, campo: null };

/** Anota el intento y dice si está dentro del límite. null si la base no respondió (la acción no sigue a ciegas). */
async function dentroDelLimite(tipo: "consulta" | "registro", documentoHash: string, celular: string | null): Promise<boolean | null> {
  // TODO tipos: lo trae el agente de base (`club_intento` todavía no está en packages/database).
  const { data, error } = await crearClienteAdmin().rpc(
    "club_intento" as never,
    { p_tipo: tipo, p_ip_hash: await huellaDeLaIp(), p_documento_hash: documentoHash, p_celular: celular } as never,
  );
  if (error) {
    console.error("[club] club_intento falló", error.code, error.hint);
    return null;
  }
  return data === true;
}

/**
 * «¿Eres Lucía P. S.?»: con los 8 dígitos del DNI, el nombre del padrón A MEDIAS, para que ella confirme que tipeó bien. Nunca
 * devuelve el nombre completo. Un DNI que no está en el padrón no sirve para el club (G-10); si el padrón no responde, se le
 * dice que lo intente en unos minutos.
 */
export async function consultarNombre(ubicacionId: string, numero: string): Promise<RespuestaConsulta> {
  if (typeof ubicacionId !== "string" || !esUuid(ubicacionId) || typeof numero !== "string") return { estado: "invalido" };
  const dni = normalizarNumeroDocumento(numero);
  if (!/^[0-9]{8}$/.test(dni)) return { estado: "invalido" };
  try {
    const permitido = await dentroDelLimite("consulta", huellaDelDocumento("dni", dni), null);
    if (permitido === null) return { estado: "sin_padron" };
    if (!permitido) return { estado: "limite" };
    const r = await consultarPadron("dni", dni);
    if (!r.ok) return { estado: r.motivo === "no_encontrado" ? "no_encontrado" : "sin_padron" };
    const aMedias = nombreAMedias(r.datos.nombre, r.origen === "sunat_publico" ? "apellidos_primero" : "nombres_primero");
    return aMedias ? { estado: "encontrado", aMedias } : { estado: "sin_padron" };
  } catch (e) {
    console.error("[club] consultarNombre no respondió", e instanceof Error ? e.message : e);
    return { estado: "sin_padron" };
  }
}

/**
 * «Unirme al Club CAYLA». Vuelve a revisar todo con la MISMA regla de la pantalla (`problemasRegistro`); con DNI vuelve a
 * consultar el padrón y usa ESE nombre (no el que diga el navegador, `p_nombre_del_padron = true`). Si un texto cambió mientras
 * lo leía (`club_texto_cambio`), devuelve los nuevos para que los lea y vuelva a marcar las casillas.
 */
export async function registrarme(entrada: DatosRegistro): Promise<RespuestaRegistro> {
  const d = leerDatosRegistro(entrada);
  if (!d) return { estado: "error", mensaje: MENSAJE.datos, campo: null };
  const problemas = problemasRegistro(d, hoyLima());
  const primero = (Object.keys(problemas) as CampoRegistro[])[0];
  if (primero) return { estado: "error", mensaje: problemas[primero] ?? MENSAJE.datos, campo: primero };

  const numero = normalizarNumeroDocumento(d.documentoNumero);
  try {
    const permitido = await dentroDelLimite("registro", huellaDelDocumento(d.documentoTipo, numero), d.celular.replace(/\D/g, ""));
    if (permitido === null) return ERROR_GENERAL;
    if (!permitido) return { estado: "error", mensaje: MENSAJE.limite, campo: null };

    let nombrePadron: string | null = null;
    if (d.documentoTipo === "dni") {
      const r = await consultarPadron("dni", numero);
      if (!r.ok) return { estado: "error", mensaje: r.motivo === "no_encontrado" ? MENSAJE.dniNoEncontrado : MENSAJE.sinPadron, campo: "documento" };
      nombrePadron = r.datos.nombre;
    }

    // TODO tipos: lo trae el agente de base (`registrarse_en_el_club` todavía no está en packages/database).
    const { data, error } = await crearClienteAdmin().rpc("registrarse_en_el_club" as never, argumentosRegistro(d, nombrePadron) as never);
    if (error) {
      const e = errorDeLaBase(error.hint);
      if (e === "texto_cambio") {
        const lectura = await leerPaginaClub(d.ubicacionId);
        return lectura.estado === "lista" ? { estado: "textos_cambiaron", pagina: lectura.pagina } : ERROR_GENERAL;
      }
      // Sin el mensaje de la base: podría traer el documento o el celular, y el registro del servidor no los necesita.
      if (e.mensaje === MENSAJE.noDisponible) console.error("[club] registrarse_en_el_club falló", error.code, error.hint);
      return { estado: "error", ...e };
    }
    const fila = (Array.isArray(data) ? data[0] : data) as Parameters<typeof respuestaDeRegistro>[0];
    return respuestaDeRegistro(fila, d.aceptaPublicidad) ?? ERROR_GENERAL;
  } catch (e) {
    console.error("[club] registrarme no respondió", e instanceof Error ? e.message : e);
    return ERROR_GENERAL;
  }
}
