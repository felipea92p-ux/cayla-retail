// La página pública del QR personal (`/club/[token]`, ADR-0288 act. c, «camino B»): lo que ve la socia en SU celular, sin
// sesión, para marcar ella misma la casilla de publicidad por WhatsApp. Lógica pura: qué se muestra en cada estado de la
// invitación, cuándo se puede confirmar y qué pasa con cada respuesta de la base. La usan la página (servidor), su acción
// de servidor y el componente del navegador.
//
// Lo que manda es la base (`fn_invitacion_club`, `confirmar_invitacion_club`): esto no decide si el permiso vale, solo
// traduce lo que la base contesta a palabras para ella. Nada de aquí agrega una regla de negocio.

import type { Database } from "@cayla-retail/database";
import { codigoClubLegible, estadoInvitacion, textoPaginaPublicidad } from "./club-reglas";

/** Una fila de `fn_invitacion_club`, tal como la tipa `packages/database` (el contrato de la base). */
export type FilaInvitacionClub = Database["retail"]["Functions"]["fn_invitacion_club"]["Returns"][number];

/** Una invitación que todavía sirve: lo único que trae datos (la base solo los devuelve con `vigente`). */
export type InvitacionVigente = {
  estado: "vigente";
  nombreCorto: string | null;
  /** «C-0142», ya en mayúsculas. */
  codigoClub: string | null;
  /** El texto `pagina_publicidad` con su celular a medias en lugar de `{celular}`: lo que ella acepta. */
  texto: string;
  /** La versión de ese texto: viaja al confirmar para que el permiso guarde exactamente lo que leyó. */
  textoVersion: number;
  tienda: string | null;
  razonSocial: string | null;
  ruc: string | null;
};

/**
 * Lo que la página sabe al abrirse. `no_disponible` no es un estado de la base: es la base que no respondió (o una
 * invitación vigente sin su texto, que no se puede aceptar a ciegas). La página se degrada con gracia (principio 9).
 */
export type VistaInvitacion =
  | InvitacionVigente
  | { estado: "usada"; tienda: string | null }
  | { estado: "vencida" }
  | { estado: "no_existe" }
  | { estado: "no_disponible" };

/** Lo que puede mostrar la página: lo de la base más «listo», que solo existe después de confirmar en esta visita. */
export type VistaPagina = VistaInvitacion | { estado: "listo"; nombreCorto: string | null; tienda: string | null };

/** Todo lo que no es el formulario: un título y un párrafo. */
export type VistaSinFormulario = Exclude<VistaPagina, InvitacionVigente>;

const limpio = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** La fila de la base → lo que la página muestra. Sin fila, «no existe»; vigente sin texto, «no disponible». */
export function vistaDeInvitacion(fila: FilaInvitacionClub | null | undefined): VistaInvitacion {
  if (!fila) return { estado: "no_existe" };
  const estado = estadoInvitacion(fila.estado);
  if (estado === "usada") return { estado, tienda: limpio(fila.tienda) };
  if (estado !== "vigente") return { estado };
  const plantilla = limpio(fila.texto);
  const version = fila.texto_version;
  if (!plantilla || version === null || !Number.isInteger(version) || version <= 0) return { estado: "no_disponible" };
  return {
    estado: "vigente",
    nombreCorto: limpio(fila.nombre_corto),
    codigoClub: codigoClubLegible(limpio(fila.codigo_club)),
    texto: textoPaginaPublicidad(plantilla, limpio(fila.celular_enmascarado)),
    textoVersion: version,
    tienda: limpio(fila.tienda),
    razonSocial: limpio(fila.razon_social),
    ruc: limpio(fila.ruc),
  };
}

/** Un trozo de párrafo: texto suelto o una palabra que se lee en negrita («BAJA», su código). */
export type Trozo = string | { fuerte: string };

/** «Club CAYLA · Tienda TRU»: el rótulo sobre el saludo. Sin tienda, solo el club. */
export function etiquetaClub(tienda: string | null): string {
  return tienda ? `Club CAYLA · ${tienda}` : "Club CAYLA";
}

/** «Hola, Lucía.»; sin nombre, «Hola.» (nunca «Hola, null»). */
export function saludo(nombreCorto: string | null): string {
  return nombreCorto ? `Hola, ${nombreCorto}.` : "Hola.";
}

/** La bajada bajo el saludo: ya es socia (con su código) y esto es aparte y opcional. */
export function bajadaVigente(codigoClub: string | null): Trozo[] {
  const aparte = ". Esto es aparte y es opcional: tú decides si quieres que la tienda te escriba.";
  return codigoClub ? ["Ya eres del Club CAYLA con el código ", { fuerte: codigoClub }, aparte] : [`Ya eres del Club CAYLA${aparte}`];
}

/**
 * El responsable del tratamiento (Ley 29733, art. 18: se informa quién trata sus datos antes de que ella acepte).
 * «CAYLA S.A.C. · RUC 20… trata tus datos según la Ley 29733»; sin razón social, CAYLA; sin RUC, sin RUC.
 */
export function responsableDelTratamiento(razonSocial: string | null, ruc: string | null): string {
  const quien = [limpio(razonSocial) ?? "CAYLA", limpio(ruc) ? `RUC ${limpio(ruc)}` : null].filter(Boolean).join(" · ");
  return `${quien} trata tus datos según la Ley 29733`;
}

/** «Confirmar» se enciende solo con la casilla marcada por ella, y no dos veces mientras la base responde. */
export function puedeConfirmar(p: { marcada: boolean; enviando: boolean }): boolean {
  return p.marcada && !p.enviando;
}

/** «WhatsApp de Tienda TRU»; sin tienda, «WhatsApp de la tienda». Cada frase pone su artículo («desde el», «al»). */
const whatsappDe = (tienda: string | null) => (tienda ? `WhatsApp de ${tienda}` : "WhatsApp de la tienda");

/** Título y párrafo de cada estado que no es el formulario (textos de ADR-0288 act. c y del spike del club). */
export function mensajeDeEstado(vista: VistaSinFormulario): { titulo: string; parrafo: Trozo[] } {
  switch (vista.estado) {
    case "listo":
      return {
        titulo: vista.nombreCorto ? `Listo, ${vista.nombreCorto}.` : "Listo.",
        parrafo: [
          "Ya estás en la lista de novedades de CAYLA. Para dejar de recibir mensajes, escribe ",
          { fuerte: "BAJA" },
          ` al ${whatsappDe(vista.tienda)} cuando quieras.`,
        ],
      };
    case "usada":
      return {
        titulo: "Ya lo confirmaste",
        parrafo: [
          `Te escribiremos desde el ${whatsappDe(vista.tienda)}. Para dejar de recibir mensajes, escribe `,
          { fuerte: "BAJA" },
          " a ese mismo WhatsApp cuando quieras.",
        ],
      };
    case "vencida":
      return { titulo: "Este enlace venció", parrafo: ["Pide otro en la tienda y lo escaneas otra vez."] };
    case "no_existe":
      return { titulo: "Este enlace no es válido", parrafo: ["Puede estar incompleto. Pídele a la tienda un QR nuevo y lo escaneas otra vez."] };
    case "no_disponible":
      return { titulo: "No pudimos abrir esta página", parrafo: ["Inténtalo de nuevo en un rato. Si sigue igual, pídele ayuda a la tienda."] };
  }
}

/** Lo que contesta la acción de servidor al confirmar. Con `texto_cambio` trae la invitación releída (el texto nuevo). */
export type RespuestaConfirmar =
  | { resultado: "listo" | "vencida" | "no_existe" | "error" }
  | { resultado: "texto_cambio"; vista: VistaInvitacion };

/**
 * La respuesta de `confirmar_invitacion_club` → qué pasó. La función devuelve el estado final de la invitación: `usada`
 * (la primera vez y también si ya estaba usada: su permiso existe) o `confirmada` si así la nombra; `vencida`/`no_existe`
 * si ya no sirve. `club_texto_cambio` (hint, P0001) = el texto cambió mientras lo leía. Cualquier otra cosa —un error, un
 * estado que no se conoce, `vigente` (no se usó)— es «no se pudo guardar»: nunca se le dice «listo» sin que la base lo diga.
 */
export function resultadoConfirmacion(r: { estado: string | null | undefined; hint: string | null | undefined; hayError: boolean }): RespuestaConfirmar["resultado"] {
  if (r.hint === "club_texto_cambio") return "texto_cambio";
  if (r.hayError) return "error";
  switch (r.estado) {
    case "usada":
    case "confirmada":
      return "listo";
    case "vencida":
      return "vencida";
    case "no_existe":
      return "no_existe";
    default:
      return "error";
  }
}

export const AVISO_TEXTO_CAMBIO = "El texto cambió mientras lo leías. Léelo otra vez y, si estás de acuerdo, vuelve a marcar la casilla.";
export const ERROR_AL_GUARDAR = "No se pudo guardar; inténtalo de nuevo.";

/** El estado del formulario de la página. */
export type EstadoPaginaClub = { vista: VistaPagina; marcada: boolean; aviso: string | null; error: string | null };

/** Al abrir: la casilla SIEMPRE sin marcar (el consentimiento es el toque de ella, nunca uno precargado). */
export function estadoInicial(vista: VistaInvitacion): EstadoPaginaClub {
  return { vista, marcada: false, aviso: null, error: null };
}

/**
 * Qué muestra la página después de «Confirmar». Listo → su confirmación; vencida o no existe → ese estado; el texto cambió
 * → el texto nuevo con la casilla otra vez sin marcar (aceptar el nuevo es otro toque de ella); error → todo igual, con la
 * casilla como estaba, y el aviso para reintentar.
 */
export function trasConfirmar(actual: InvitacionVigente, marcada: boolean, respuesta: RespuestaConfirmar): EstadoPaginaClub {
  switch (respuesta.resultado) {
    case "listo":
      return { vista: { estado: "listo", nombreCorto: actual.nombreCorto, tienda: actual.tienda }, marcada: false, aviso: null, error: null };
    case "vencida":
    case "no_existe":
      return { vista: { estado: respuesta.resultado }, marcada: false, aviso: null, error: null };
    case "texto_cambio":
      return respuesta.vista.estado === "vigente"
        ? { vista: respuesta.vista, marcada: false, aviso: AVISO_TEXTO_CAMBIO, error: null }
        : { vista: respuesta.vista, marcada: false, aviso: null, error: null };
    case "error":
      return { vista: actual, marcada, aviso: null, error: ERROR_AL_GUARDAR };
  }
}
