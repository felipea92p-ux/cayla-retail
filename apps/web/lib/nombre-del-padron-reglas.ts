// El nombre de una ficha de cliente y el padrón (Felipe 2026-10-15; la base lo hace cumplir desde 20261015133000). Lógica pura, sin
// React ni red: la usan Vender (`ClientaDelTicket`), «+ Nuevo cliente» (`NuevaClientaModal`), «Editar» de la ficha
// (`ClientaFichaModal`) y la guía de foco de esas hojas (`camposDeRegistrar`, lib/club-caja-reglas.ts), y su prueba.
//
// LA REGLA: «El nombre no se debe poder escribir ni editar: siempre debe ser el que trae la API. Sin la API no se registra; con el
// carné y el pasaporte sí se pide escribir los nombres tal cual en su documento».
//   · DNI (y RUC, que hoy no es un documento de ficha): el nombre lo trae el padrón (`GET /api/padron?para=ficha`), la caja se ve
//     llena y bloqueada, y si el padrón no responde o no lo encuentra NO se registra. En Vender la venta sigue sin cliente.
//   · Carné de extranjería y pasaporte: el nombre se escribe tal cual está en el documento: ni vacío ni con números.
// La base comprueba lo mismo por su cuenta (disparador `fn_nombre_de_ficha_del_padron`): esto solo evita mandar lo que rechazaría y
// dice qué hacer, en palabras de tienda.

import type { RespuestaPadron } from "./padron";
import type { TipoDocumentoClienta } from "./documento-clienta-reglas";

/** De dónde sale el nombre de una ficha según su documento. */
export type OrigenDelNombre = "padron" | "escrito";

/** Con DNI (o RUC) el nombre lo trae el padrón; con carné o pasaporte se escribe tal cual. */
export function origenDelNombre(tipo: TipoDocumentoClienta | "ruc"): OrigenDelNombre {
  return tipo === "dni" || tipo === "ruc" ? "padron" : "escrito";
}

/** Lo que pasó al pedirle al padrón el nombre de una ficha, para el DNI que está escrito AHORA. */
export type PadronDeFicha =
  /** El DNI no está completo, o no se le preguntó (en «Editar», el DNI de siempre hasta tocar «Actualizar desde el padrón»). */
  | { estado: "sin_consultar" }
  | { estado: "consultando" }
  /** El padrón dio el nombre y el servidor lo anotó: se puede guardar. `fuente`: quién contestó, para decirlo bajo la caja. */
  | { estado: "confirmado"; nombre: string; fuente: "RENIEC" | "SUNAT" }
  | { estado: "no_encontrado" }
  /** No contestó, contestó algo raro o el servidor no pudo anotar la lectura: se puede volver a intentar. */
  | { estado: "sin_respuesta" };

/**
 * Lo que contestó `GET /api/padron?para=ficha`, leído para una ficha. Solo cuenta un nombre que dio el PADRÓN y que el servidor
 * ANOTÓ (sin la anotación la base lo rechazaría): un nombre sacado de un comprobante anterior (`historial`) no sirve, porque pudo
 * escribirse a mano un día que el padrón no respondía. null (la ruta falló, no hubo red) se lee como «no respondió».
 */
export function padronDeLaRespuesta(r: Pick<RespuestaPadron, "nombre" | "fuente" | "via" | "anotada" | "sinNombre"> | null): PadronDeFicha {
  if (!r) return { estado: "sin_respuesta" };
  const nombre = r.nombre?.replace(/\s+/g, " ").trim() ?? "";
  if (r.fuente === "padron" && nombre && r.anotada) {
    return { estado: "confirmado", nombre, fuente: r.via === "sunat_publico" ? "SUNAT" : "RENIEC" };
  }
  return r.fuente !== "padron" && r.sinNombre === "no_encontrado" ? { estado: "no_encontrado" } : { estado: "sin_respuesta" };
}

/** Dónde se muestra el aviso: el ticket de Vender (la venta sigue sin cliente), el alta de Clientes o «Editar» de la ficha. */
export type DondeDelNombre = "venta" | "alta" | "ficha";

/**
 * Las tres líneas cuando el padrón no dio el nombre: qué pasó (título), qué significa y qué hacer. Va con «Volver a intentar».
 * En Vender se dice que la venta sigue: el cliente es opcional ahí.
 */
export function avisoSinNombreDelPadron(estado: "no_encontrado" | "sin_respuesta", donde: DondeDelNombre): { titulo: string; texto: string } {
  const consecuencia = donde === "ficha" ? "Sin el nombre del padrón no se guarda este DNI." : "Sin el nombre del padrón no se registra.";
  const queHacer = estado === "no_encontrado" ? "Revisa el número con su DNI a la vista." : "Vuelve a intentar en un momento.";
  return {
    titulo: estado === "no_encontrado" ? "El padrón no encontró ese DNI" : "El padrón no respondió",
    texto: `${consecuencia} ${queHacer}${donde === "venta" ? " La venta sigue sin cliente." : ""}`,
  };
}

/**
 * Bajo la caja del nombre con DNI: de dónde salió, o que no se escribe. `enFicha`: «Editar», con el DNI de siempre (ahí no se consulta
 * sola: se ofrece «Actualizar desde el padrón»); `conNombre`: la ficha ya tenía un nombre.
 */
export function pieDelNombreDelPadron(padron: PadronDeFicha, enFicha: boolean, conNombre: boolean): string {
  switch (padron.estado) {
    case "confirmado":
      return `Según ${padron.fuente}, consultado ahora. No se escribe a mano.`;
    case "consultando":
      return "Consultando el padrón…";
    default:
      if (!enFicha) return "Lo trae el padrón con los 8 dígitos del DNI.";
      return conNombre ? "Sale de su DNI: no se escribe a mano. Si cambió, actualízalo desde el padrón." : "Sale de su DNI: tráelo desde el padrón.";
  }
}

/** La ayuda de la caja del nombre con carné o pasaporte. */
export const AYUDA_NOMBRE_ESCRITO = "Tal cual está en su documento: nombres y apellidos, sin números.";

/** El nombre más largo que se guarda (lo mismo que la base acepta en las fichas del cartel y la tienda). */
const MAX_NOMBRE = 200;

/**
 * El nombre escrito a mano (carné o pasaporte): qué le falta o qué está mal, o null si está bien. Ni vacío ni con números (ningún
 * documento lleva números en el nombre), de 3 letras como mínimo (la regla de siempre de la caja) y hasta 200.
 */
export function problemaNombreEscrito(nombre: string): string | null {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (limpio === "") return "Escribe su nombre tal cual está en su documento.";
  if (/[0-9]/.test(limpio)) return "El nombre no lleva números: escríbelo tal cual está en su documento.";
  if (limpio.length < 3) return "Escribe su nombre completo, tal cual está en su documento.";
  if (limpio.length > MAX_NOMBRE) return "El nombre es demasiado largo.";
  return null;
}

/**
 * Qué le falta al nombre para poder guardar (una frase para la guía de foco), o null si ya está. Con DNI, lo dice el padrón; con
 * carné o pasaporte, lo escrito.
 */
export function pendienteDelNombre(tipo: TipoDocumentoClienta, padron: PadronDeFicha, escrito: string): string | null {
  if (origenDelNombre(tipo) === "escrito") return problemaNombreEscrito(escrito);
  switch (padron.estado) {
    case "confirmado":
      return null;
    case "consultando":
      return "Consultando el padrón…";
    case "no_encontrado":
      return "El padrón no encontró ese DNI: revisa el número.";
    case "sin_respuesta":
      return "El padrón no respondió: toca «Volver a intentar».";
    case "sin_consultar":
      return "Lo trae el padrón con los 8 dígitos del DNI.";
  }
}

/**
 * El nombre que se guarda en un ALTA (Vender, «+ Nuevo cliente»): con DNI, el que trajo el padrón (vacío si no lo trajo: entonces
 * no se registra); con carné o pasaporte, el escrito, sin espacios de más.
 */
export function nombreDelAlta(tipo: TipoDocumentoClienta, padron: PadronDeFicha, escrito: string): string {
  if (origenDelNombre(tipo) === "escrito") return escrito.replace(/\s+/g, " ").trim();
  return padron.estado === "confirmado" ? padron.nombre : "";
}

/**
 * «Editar» de una ficha: cómo es la caja del nombre (`origen`), qué nombre se guarda, si se puede guardar y, si no, por qué.
 *   · DNI con número: la caja va bloqueada. Si el DNI es el de siempre se queda el nombre que tenía (aunque sea uno escrito antes de
 *     la regla) salvo que se haya actualizado desde el padrón; si el DNI cambió (o pasó a DNI) es OTRA persona: hace falta el nombre
 *     del padrón para ese número.
 *   · Carné o pasaporte: se escribe tal cual, ni vacío ni con números.
 *   · Sin documento (una ficha de antes, solo con nombre): se escribe, y puede quedar vacío (nada lo exige: una ficha con documento
 *     siempre cae en uno de los dos casos de arriba); si se escribe, sin números.
 */
export function nombreDeLaEdicion(e: {
  tipo: TipoDocumentoClienta;
  numero: string;
  escrito: string;
  padron: PadronDeFicha;
  deAntes: { tipo: TipoDocumentoClienta; numero: string | null; nombre: string | null };
}): { origen: OrigenDelNombre | "sin_documento"; nombre: string; listo: boolean; pendiente: string | null } {
  const escrito = e.escrito.replace(/\s+/g, " ").trim();
  if (origenDelNombre(e.tipo) === "escrito") {
    const problema = problemaNombreEscrito(escrito);
    return { origen: "escrito", nombre: escrito, listo: problema === null, pendiente: problema };
  }
  if (e.numero.trim() === "") {
    const problema = escrito === "" ? null : problemaNombreEscrito(escrito);
    return { origen: "sin_documento", nombre: escrito, listo: problema === null, pendiente: problema };
  }
  if (e.padron.estado === "confirmado") return { origen: "padron", nombre: e.padron.nombre, listo: true, pendiente: null };
  const mismoDni = e.deAntes.tipo === e.tipo && (e.deAntes.numero ?? "") === e.numero.trim();
  if (mismoDni) return { origen: "padron", nombre: e.deAntes.nombre ?? "", listo: true, pendiente: null };
  return { origen: "padron", nombre: "", listo: false, pendiente: pendienteDelNombre(e.tipo, e.padron, "") };
}
