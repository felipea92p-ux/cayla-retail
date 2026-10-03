/**
 * La clienta del ticket del Punto de venta (spike 2026-09-26, hallazgo 4). Se busca en la libreta (`buscar_clienta`:
 * DNI, celular o nombre) y, elegida, sus datos pasan solos al comprobante y a la proforma o el apartado.
 *
 * Desde la tanda 1a del club (ADR-0288), la venta queda ligada a su ficha (`p_cliente_id`) y el documento tiene tipo. La
 * pregunta del club (tanda 1b) vive aparte, en `club-caja-reglas.ts`. Lo que NO hace todavía: «es para regalo» (tanda 1d).
 */
import { ajustarCelular, celularValido } from "./club-reglas";
import { documentoLegible, tipoDocumentoDe, type TipoDocumentoClienta } from "./documento-clienta-reglas";

/** ADR-0288 D-2: el documento con su tipo (antes, `dni`). */
export type ClientaDelTicket = {
  id: string;
  nombre: string | null;
  documentoTipo: TipoDocumentoClienta;
  documentoNumero: string | null;
  celular: string | null;
};

/** El número a medias en pantalla (71•••482): el mostrador lo ve la clienta de al lado. Completo viaja al comprobante.
 *  Se conserva el nombre por quienes ya lo importan; la regla vive en `documento-clienta-reglas.ts`. */
export { numeroEnmascarado as dniEnmascarado } from "./documento-clienta-reglas";

/** Lo que se lee de ella en la fila del ticket: nombre (o, si la ficha no lo tiene, el documento) y un dato para
 *  confirmar que es ella. El documento sale con su tipo: «DNI 71•••482», «CE 00•••567», «Pasaporte AB•••456». */
export function lineaDeClienta(c: ClientaDelTicket): { titulo: string; detalle: string } {
  const documento = documentoLegible(c.documentoTipo, c.documentoNumero);
  const titulo = c.nombre?.trim() || documento || (c.celular ? `Cel. ${c.celular}` : "Cliente sin nombre");
  const partes = [documento && c.nombre?.trim() ? documento : null, c.celular ? `Cel. ${c.celular}` : null].filter(Boolean);
  return { titulo, detalle: partes.join(" · ") };
}

/**
 * Qué muestra la fila «Clienta» del ticket (ADR-0249, actualización 2026-09-28). La libreta es del módulo «Clientas»: la
 * base le rechaza la búsqueda a la cuenta cuyo rol no lo tiene (42501 `clientas_sin_modulo`), así que a esa cuenta no se le
 * ofrece — un botón que siempre falla le enseña a la cajera que el sistema falla —, y se vende igual: el DNI y el nombre van
 * en el comprobante. Una clienta que ya venía en el ticket (retomado de otra cuenta) se deja ver y quitar, no cambiar:
 * cambiarla es buscar.
 *   · `agregar`: sin clienta, con el módulo («Agregar cliente»).
 *   · `nada`: sin clienta, sin el módulo (la fila no aparece).
 *   · `elegida`: con clienta, se puede cambiar o quitar.
 *   · `elegida_fija`: con clienta, sin el módulo: solo quitar.
 */
export type FilaClienta = "agregar" | "nada" | "elegida" | "elegida_fija";
export function filaDeClienta(clienta: ClientaDelTicket | null, puedeBuscar: boolean): FilaClienta {
  if (!clienta) return puedeBuscar ? "agregar" : "nada";
  return puedeBuscar ? "elegida" : "elegida_fija";
}

/** Qué se busca: nada con menos de 3 caracteres (un «7» traería media libreta). */
export function terminoBuscable(texto: string): string | null {
  const t = texto.trim();
  return t.length >= 3 ? t : null;
}

/** Lo que se escribe para registrarla en el ticket (ADR-0288 D-9 y tanda 1g, G-2): su documento (con DNI, el nombre llega
 *  del padrón) y, opcional, el celular para mandarle su boleta («Actualización 2026-10-03 (o)»). Sin cumpleaños y sin permiso de
 *  WhatsApp: esos los escribe ella al unirse desde el cartel. `celular`: solo dígitos; vacío = sin celular. */
export type AltaEnTicket = { documentoTipo: TipoDocumentoClienta; documentoNumero: string; nombre: string; celular: string };
export const ALTA_VACIA: AltaEnTicket = { documentoTipo: "dni", documentoNumero: "", nombre: "", celular: "" };

/**
 * Lo escrito en el buscador no se escribe dos veces al registrarla: 8 dígitos son un DNI, un celular peruano (9 dígitos que
 * empiezan en 9, con o sin +51) es el celular y letras sin números son un nombre. Lo demás (un carné, un pasaporte) no se
 * adivina: se escribe.
 */
export function altaDesdeBusqueda(texto: string): AltaEnTicket {
  const t = texto.trim();
  const junto = t.replace(/\s/g, "");
  if (/^[0-9]{8}$/.test(junto)) return { ...ALTA_VACIA, documentoNumero: junto };
  const celular = ajustarCelular(junto);
  if (/^(\+?51)?[0-9]{9}$/.test(junto) && celularValido(celular)) return { ...ALTA_VACIA, celular };
  if (/\p{L}/u.test(t) && !/[0-9]/.test(t)) return { ...ALTA_VACIA, nombre: t };
  return ALTA_VACIA;
}

/**
 * La clienta de un ticket en espera tal como vuelve de localStorage (ADR-0288 D-2). Lo guardado no se reescribe: se lee
 * con tolerancia, y la próxima vez que ese ticket se deje en espera ya sale con la forma nueva. Un `dni` viejo es un DNI
 * (era lo único que la ficha guardaba); lo que no tiene ni `id` es basura de otra versión y el ticket vuelve sin clienta.
 */
export function clientaDeTicketGuardado(valor: unknown): ClientaDelTicket | null {
  if (!valor || typeof valor !== "object") return null;
  const c = valor as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const id = texto(c.id);
  if (!id) return null;
  return {
    id,
    nombre: texto(c.nombre),
    documentoTipo: tipoDocumentoDe(texto(c.documentoTipo)),
    documentoNumero: texto(c.documentoNumero) ?? texto(c.dni),
    celular: texto(c.celular),
  };
}
