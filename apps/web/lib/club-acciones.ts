import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { TextoClub, TipoTextoClub } from "@/lib/club-reglas";

// Las escrituras y lecturas del club desde el navegador (ADR-0288 tanda 1b): una función por RPC, para que Cobrar y
// /clientas no sepan de Supabase. Todas las que guardan firman con el responsable del combo (ADR-0161) y la base exige el
// módulo «Clientas» (42501 `clientas_sin_modulo`). Las reglas (quién puede ser socia, que la publicidad solo nace de un
// mensaje de ella) viven en la base, no aquí.

export type ResultadoUnirse = { codigoClub: string | null; clubDesde: string | null; error: ErrorEscritura };

/** Su «sí» al club (de palabra: en caja o en la ficha). Devuelve su código de socia. */
export async function unirseAlClub(
  datos: {
    clientaId: string;
    celular: string;
    cumpleDia: number | null;
    cumpleMes: number | null;
    cumpleAnio: number | null;
    medio: "caja_palabra" | "ficha";
    ubicacionId: string | null;
    ventaId?: string | null;
  },
  firma: Firma | null
): Promise<ResultadoUnirse> {
  const { data, error } = await firmar(
    createClient().rpc("unirse_al_club", {
      p_clienta_id: datos.clientaId,
      p_telefono_whatsapp: datos.celular,
      p_cumple_dia: datos.cumpleDia ?? undefined,
      p_cumple_mes: datos.cumpleMes ?? undefined,
      p_cumple_anio: datos.cumpleAnio ?? undefined,
      p_medio: datos.medio,
      p_ubicacion_id: datos.ubicacionId ?? undefined,
      p_venta_id: datos.ventaId ?? undefined,
    }),
    firma
  );
  const fila = Array.isArray(data) ? data[0] : null;
  return { codigoClub: fila?.codigo_club ?? null, clubDesde: fila?.club_desde ?? null, error };
}

/** «Llegó su mensaje»: ella escribió primero desde el QR; su permiso de publicidad queda registrado. */
export async function registrarMensajePublicidad(
  clientaId: string,
  telefonoQueEscribio: string,
  ubicacionId: string | null,
  firma: Firma | null
): Promise<{ publicidadDesde: string | null; error: ErrorEscritura }> {
  const { data, error } = await firmar(
    createClient().rpc("registrar_mensaje_publicidad", {
      p_clienta_id: clientaId,
      p_telefono_que_escribio: telefonoQueEscribio,
      p_ubicacion_id: ubicacionId ?? undefined,
    }),
    firma
  );
  return { publicidadDesde: (data as string | null) ?? null, error };
}

/** El cartel del mostrador: llegó «quiero unirme al club…» de un número que no está; la tienda le pidió su documento. */
export async function registrarDesdeWhatsapp(
  datos: { documentoTipo: string; documentoNumero: string; nombre: string; telefonoQueEscribio: string; ubicacionId: string | null },
  firma: Firma | null
): Promise<{ clientaId: string | null; codigoClub: string | null; error: ErrorEscritura }> {
  const { data, error } = await firmar(
    createClient().rpc("registrar_desde_whatsapp", {
      p_documento_tipo: datos.documentoTipo,
      p_documento_numero: datos.documentoNumero,
      p_nombre: datos.nombre.trim() || undefined,
      p_telefono_que_escribio: datos.telefonoQueEscribio,
      p_ubicacion_id: datos.ubicacionId ?? undefined,
    }),
    firma
  );
  const fila = Array.isArray(data) ? data[0] : null;
  return { clientaId: fila?.clienta_id ?? null, codigoClub: fila?.codigo_club ?? null, error };
}

/** Escribió BAJA a cualquier tienda: sin publicidad desde hoy, en las 3 tiendas. Devuelve cuántas fichas tenían ese número. */
export async function registrarBajaWhatsapp(
  telefono: string,
  ubicacionId: string | null,
  firma: Firma | null
): Promise<{ fichas: number; error: ErrorEscritura }> {
  const { data, error } = await firmar(
    createClient().rpc("registrar_baja_whatsapp", { p_telefono: telefono, p_ubicacion_id: ubicacionId ?? undefined }),
    firma
  );
  return { fichas: (data as number | null) ?? 0, error };
}

export type ResumenClientaCaja = {
  esSocia: boolean;
  codigoClub: string | null;
  clubDesde: string | null;
  conPublicidad: boolean;
  celular: string | null;
  cumpleDia: number | null;
  cumpleMes: number | null;
};

/** Lo que la tarjeta de la clienta necesita en Cobrar (lectura: `resumen_` no abre el loader). */
export async function resumenClientaCaja(clientaId: string): Promise<{ resumen: ResumenClientaCaja | null; error: ErrorEscritura }> {
  const { data, error } = await createClient().rpc("resumen_clienta_caja", { p_clienta_id: clientaId });
  const f = Array.isArray(data) ? data[0] : null;
  return {
    resumen: f
      ? {
          esSocia: f.es_socia,
          codigoClub: f.codigo_club,
          clubDesde: f.club_desde,
          conPublicidad: f.con_publicidad,
          celular: f.celular,
          cumpleDia: f.cumple_dia,
          cumpleMes: f.cumple_mes,
        }
      : null,
    error,
  };
}

/** Los textos vigentes del club (el que se lee en caja y los dos mensajes del QR). */
export async function textosClub(): Promise<{ textos: TextoClub[]; error: ErrorEscritura }> {
  const { data, error } = await createClient().rpc("fn_club_textos_vigentes");
  return {
    textos: (data ?? []).map((t) => ({ tipo: t.tipo as TipoTextoClub, version: t.version, texto: t.texto })),
    error,
  };
}
