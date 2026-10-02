import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { TipoAviso } from "@/lib/club-avisos-reglas";
import { escalaParaGuardar, type BeneficiosClub } from "@/lib/club-beneficios-reglas";

// Las escrituras de Clientas ▸ Avisos y de «Beneficios del club» desde el navegador (ADR-0288 act. g, contrato de la tanda 1g,
// funciones 8 y 9). Todas firman con el responsable del combo (ADR-0161); la base exige el módulo «avisos_club» para anotar y
// deshacer, y ser líder para los beneficios. Ninguna decide reglas: solo pasa lo que eligió la pantalla.

/** «Enviar»: WhatsApp Web ya se abrió con el texto; queda anotado quién lo mandó, a quién, qué texto y desde qué tienda. Devuelve el
 *  id del envío, que es lo que pide «Deshacer». */
export async function registrarAvisoEnviado(
  aviso: { clientaId: string; tipo: TipoAviso; referencia: string; texto: string; ubicacionId: string },
  firma: Firma | null,
): Promise<{ id: string | null; error: ErrorEscritura }> {
  const supabase = createClient();
  const { data, error } = await firmar(
    supabase.rpc("registrar_aviso_enviado", {
      p_clienta_id: aviso.clientaId,
      p_tipo: aviso.tipo,
      p_referencia: aviso.referencia,
      p_texto: aviso.texto,
      p_ubicacion_id: aviso.ubicacionId,
    }),
    firma,
  );
  return { id: typeof data === "string" ? data : null, error };
}

/** «Deshacer» (dentro de 10 minutos): el aviso vuelve a la lista de por mandar. La base rechaza pasado el plazo. */
export async function deshacerAvisoEnviado(id: string, firma: Firma | null): Promise<{ error: ErrorEscritura }> {
  const supabase = createClient();
  const { error } = await firmar(supabase.rpc("deshacer_aviso_enviado", { p_id: id }), firma);
  return { error };
}

/** «Beneficios del club» (solo el líder). Si cambia algo que los términos nombran, la base publica una versión nueva de `terminos`. */
export async function guardarBeneficiosClub(b: BeneficiosClub, firma: Firma | null): Promise<{ error: ErrorEscritura }> {
  const supabase = createClient();
  const { error } = await firmar(
    supabase.rpc("guardar_beneficios_club", {
      p_pct: b.pct,
      p_compras: b.compras,
      p_monto: b.monto,
      p_dias: b.dias,
      p_escala: escalaParaGuardar(b.escala),
    }),
    firma,
  );
  return { error };
}
