import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Las escrituras y lecturas del club desde el navegador (ADR-0288 tanda 1b): una función por RPC, para que Cobrar y
// /clientas no sepan de Supabase. Todas las que guardan firman con el responsable del combo (ADR-0161) y la base exige el
// módulo «Clientas» (42501 `clientas_sin_modulo`). Las reglas (quién puede ser socia, que la publicidad solo nace de ella)
// viven en la base, no aquí.
//
// Tanda 1g (ADR-0288, «Actualización 2026-10-01 (g)»): ella se une sola desde el cartel, así que la caja y la ficha ya no
// unen al club ni registran la publicidad. Se fueron `unirseAlClub`, `crearInvitacionClub` (su QR personal),
// `registrarMensajePublicidad` y `registrarDesdeWhatsapp` («Llegó un mensaje de WhatsApp»): la base les quitó el permiso.

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
  /** El canje del cumpleaños (tanda 1c, ADR-0288 D-5): socia activa, en su mes de Lima y sin canje vivo este año. Lo decide
   *  la base; la caja lo muestra con `cumpleEnCaja` (lib/club-cumple-canje-reglas.ts). */
  cumpleDisponible: boolean;
  /** El % de `configuracion_empresa.club_cumple_pct` (10 por defecto): nunca escrito a mano en la pantalla. */
  cumplePct: number | null;
  cumpleCanjeadoEsteAnio: boolean;
  /** El día de Lima (`aaaa-mm-dd`) en que lo canjeó este año, o null: «Cumpleaños canjeado el 12 sep». */
  cumpleCanjeadoEl: string | null;
  /** El vale de aniversario (tanda 1g, G-13): un año de club que cuenta, sin canje vivo y dentro de sus días. Lo decide la
   *  base; la caja lo muestra con `valeEnCaja` (lib/club-aniversario-canje-reglas.ts). */
  aniversarioDisponible: boolean;
  /** Cuánto vale (la escala de `club_aniversario_escala`): nunca escrito a mano en la pantalla. */
  aniversarioMonto: number | null;
  /** Hasta cuándo se puede usar (`aaaa-mm-dd`, día de Lima). */
  aniversarioVence: string | null;
};

// TODO tipos: lo trae el agente de base (`resumen_clienta_caja` suma `aniversario_disponible`, `aniversario_monto` y
// `aniversario_vence` en la tanda 1g). Mientras `packages/database` no los tenga, se leen con este tipo.
type FilaAniversarioResumen = { aniversario_disponible?: boolean | null; aniversario_monto?: number | string | null; aniversario_vence?: string | null };

/** Lo que la tarjeta de la clienta necesita en Cobrar (lectura: `resumen_` no abre el loader). */
export async function resumenClientaCaja(clientaId: string): Promise<{ resumen: ResumenClientaCaja | null; error: ErrorEscritura }> {
  const { data, error } = await createClient().rpc("resumen_clienta_caja", { p_clienta_id: clientaId });
  const f = Array.isArray(data) ? data[0] : null;
  const aniversario = (f ?? {}) as FilaAniversarioResumen;
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
          // Una base sin la tanda 1c no trae estas columnas: sin ellas no se ofrece el canje (principio 9).
          cumpleDisponible: f.cumple_disponible === true,
          cumplePct: f.cumple_pct == null ? null : Number(f.cumple_pct),
          cumpleCanjeadoEsteAnio: f.cumple_canjeado_este_anio === true,
          cumpleCanjeadoEl: f.cumple_canjeado_el ?? null,
          // Igual con la 1g: sin estas columnas no se ofrece el vale.
          aniversarioDisponible: aniversario.aniversario_disponible === true,
          aniversarioMonto: aniversario.aniversario_monto == null ? null : Number(aniversario.aniversario_monto),
          aniversarioVence: aniversario.aniversario_vence ?? null,
        }
      : null,
    error,
  };
}
