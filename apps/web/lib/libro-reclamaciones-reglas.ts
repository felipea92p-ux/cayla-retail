import { diaLima } from "./fechas-lima";

// Tienda web ▸ Libro de Reclamaciones (ADR-0679, Felipe 2026-11-18): la lógica pura de la pantalla. Lee lo que devuelve
// `retail.fn_libro_reclamaciones()` (20261118151000), decide en qué está cada hoja según su plazo (15 días hábiles, que calcula la base),
// cuenta las cifras y filtra la lista. No decide reglas de negocio: el plazo y los días que quedan vienen de la base.

export const POR_PAGINA = 25;
/** Desde cuántos días hábiles restantes una hoja «vence pronto» (ámbar): con 3 o menos, la encargada tiene que moverse ya. */
export const DIAS_VENCE_PRONTO = 3;

/** Una hoja como la devuelve `fn_libro_reclamaciones` (la lee `lib/libro-reclamaciones-lectura.ts`, que es la única con zod: los
 *  componentes importan este archivo y no deben bajar zod entero, ADR-0674). */
export type HojaLibro = {
  id: string;
  codigo: string;
  /** El código del libro (PARTE 5, 20261118170000), «LR-WEB-01». */
  libro_codigo: string;
  creada_en: string;
  tipo: "reclamo" | "queja";
  tienda: string | null;
  consumidor: {
    nombre: string;
    tipo_documento: "dni" | "ce" | "pasaporte";
    documento: string;
    domicilio: string;
    telefono: string;
    correo: string;
    menor_de_edad: boolean;
    apoderado: string | null;
    /** Si es menor: los datos de quien lo representa. */
    apoderado_datos: {
      tipo_documento: "dni" | "ce" | "pasaporte" | null;
      documento: string | null;
      domicilio: string | null;
      telefono: string | null;
      correo: string | null;
    } | null;
  };
  bien: { tipo: "producto" | "servicio"; monto: number | string | null; descripcion: string };
  detalle: string;
  pedido: string;
  copia_enviada: boolean;
  vence_el: string;
  dias_restantes: number;
  /** La respuesta de CAYLA (PARTE 4, 20261118152000). Null: todavía sin responder. */
  respuesta: string | null;
  respondida_en: string | null;
  /** Si la respuesta ya salió al correo del cliente (la manda la tienda). */
  respuesta_enviada: boolean;
};

export type ListaLibro = { hoy: string; hojas: HojaLibro[]; hayMas: boolean };

export type EstadoHoja = "por_responder" | "vence_pronto" | "vencida" | "respondida";

/** En qué está: respondida, o por responder según los días hábiles que le quedan (la base los cuenta). */
export function estadoDe(h: Pick<HojaLibro, "respuesta" | "dias_restantes">): EstadoHoja {
  if (h.respuesta) return "respondida";
  if (h.dias_restantes < 0) return "vencida";
  if (h.dias_restantes <= DIAS_VENCE_PRONTO) return "vence_pronto";
  return "por_responder";
}

export const INSIGNIA: Record<EstadoHoja, { texto: string; tono: "ambar" | "rojo" | "verde" | "neutro" }> = {
  por_responder: { texto: "Por responder", tono: "neutro" },
  vence_pronto: { texto: "Vence pronto", tono: "ambar" },
  vencida: { texto: "Vencida", tono: "rojo" },
  respondida: { texto: "Respondida", tono: "verde" },
};

/** «Quedan 12 días hábiles», «Vence hoy», «Venció hace 2 días hábiles», o la fecha en que se respondió. */
export function plazoEnPalabras(h: Pick<HojaLibro, "respuesta" | "dias_restantes" | "respondida_en">): string {
  if (h.respuesta) return h.respondida_en ? `Respondida el ${fechaCorta(h.respondida_en)}` : "Respondida";
  const d = h.dias_restantes;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Queda 1 día hábil";
  if (d > 1) return `Quedan ${d} días hábiles`;
  return d === -1 ? "Venció hace 1 día hábil" : `Venció hace ${-d} días hábiles`;
}

const FECHA_CORTA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });
const FECHA_LARGA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric" });
/** «18 nov.» de un instante (en Lima). */
export const fechaCorta = (iso: string) => FECHA_CORTA.format(new Date(iso));
/** «10 de diciembre de 2026» de una fecha aaaa-mm-dd (sin correrla por la zona horaria). */
export const fechaDelDia = (dia: string) => FECHA_LARGA.format(new Date(`${dia}T12:00:00-05:00`));

export const NOMBRE_DOCUMENTO = { dni: "DNI", ce: "Carné de extranjería", pasaporte: "Pasaporte" } as const;

/** El monto en soles, con el espacio duro entre «S/» y la cifra (no se corta), o null sin monto. */
export function montoEnSoles(monto: number | string | null): string | null {
  if (monto === null || monto === "") return null;
  const n = Number(monto);
  return Number.isFinite(n) ? `S/ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
}

export type CifrasLibro = { porResponder: number; vencenPronto: number; vencidas: number; delMes: number };

/** Las cifras de arriba. `hoy`: aaaa-mm-dd de Lima. */
export function cifrasDe(hojas: readonly HojaLibro[], hoy: string): CifrasLibro {
  const mes = hoy.slice(0, 7);
  const c: CifrasLibro = { porResponder: 0, vencenPronto: 0, vencidas: 0, delMes: 0 };
  for (const h of hojas) {
    const e = estadoDe(h);
    if (e !== "respondida") c.porResponder++;
    if (e === "vence_pronto") c.vencenPronto++;
    if (e === "vencida") c.vencidas++;
    if ((diaLima(h.creada_en) ?? "").slice(0, 7) === mes) c.delMes++;
  }
  return c;
}


export type FiltroEstado = "por_responder" | "vencen" | "respondidas" | "todas";
export const ESTADO_POR_DEFECTO: FiltroEstado = "por_responder";
export const OPCIONES_ESTADO: readonly { valor: FiltroEstado; texto: string }[] = [
  { valor: "por_responder", texto: "Por responder" },
  { valor: "vencen", texto: "Vencen pronto o vencidas" },
  { valor: "respondidas", texto: "Respondidas" },
  { valor: "todas", texto: "Todas" },
];
export const esFiltroEstado = (v: string): v is FiltroEstado => OPCIONES_ESTADO.some((o) => o.valor === v);

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Lo que se ve con el filtro y la búsqueda (número de hoja, nombre, documento, correo o lo que escribió). Las por responder van primero
 *  las que vencen antes; el resto, la más nueva primero (como llegan de la base). */
export function filtrar(hojas: readonly HojaLibro[], f: { estado: FiltroEstado; q: string }): HojaLibro[] {
  const q = sinTildes(f.q.trim());
  const pasa = (h: HojaLibro) => {
    const e = estadoDe(h);
    const porEstado =
      f.estado === "todas" ||
      (f.estado === "por_responder" && e !== "respondida") ||
      (f.estado === "vencen" && (e === "vence_pronto" || e === "vencida")) ||
      (f.estado === "respondidas" && e === "respondida");
    if (!porEstado) return false;
    if (!q) return true;
    const texto = sinTildes(
      [h.codigo, h.consumidor.nombre, h.consumidor.documento, h.consumidor.correo, h.bien.descripcion, h.detalle, h.pedido].join(" "),
    );
    return texto.includes(q);
  };
  const lista = hojas.filter(pasa);
  return f.estado === "respondidas" || f.estado === "todas" ? lista : [...lista].sort((a, b) => a.dias_restantes - b.dias_restantes);
}

// ---------- La respuesta (PARTE 4, 20261118152000) ----------

/** Los largos que acepta `responder_hoja_reclamacion`, contados después de limpiar el texto. */
export const MIN_RESPUESTA = 10;
export const MAX_RESPUESTA = 3000;

/** El texto como lo guarda la base (`fn_recomendacion_texto`): sin invisibles, espacios seguidos en uno, a lo más una línea en blanco.
 *  Sin el carácter nulo (U+0000): la base no lo acepta y la respuesta no se podía enviar (/chaos 2026-11-18). Es lo que viaja. */
export function textoLimpio(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\t \u00A0\u2000-\u200A\u3000]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export const letras = (texto: string) => [...textoLimpio(texto)].length;

/** Lo que `responder_hoja_reclamacion` rechazaría, en una frase; null si se puede enviar. */
export function problemaDeLaRespuesta(texto: string): string | null {
  const n = letras(texto);
  if (n === 0) return "Escribe la respuesta.";
  if (n < MIN_RESPUESTA) return `Escribe al menos ${MIN_RESPUESTA} letras.`;
  if (n > MAX_RESPUESTA) return `Te pasaste por ${n - MAX_RESPUESTA} ${n - MAX_RESPUESTA === 1 ? "letra" : "letras"}: acórtala un poco.`;
  return null;
}

/** Lo que dice el error de la base al responder, en palabras de tienda; null si no es uno de los suyos. */
export function avisoDelError(e: { hint?: string | null }): { titulo: string; detalle: string } | null {
  switch (e.hint) {
    case "libro_ya_respondida":
      return { titulo: "Esta hoja ya tiene respuesta", detalle: "Alguien la respondió antes que tú. La lista se vuelve a leer para que la veas." };
    case "libro_no_existe":
      return { titulo: "Esa hoja ya no está", detalle: "Recarga la pantalla." };
    case "libro_respuesta_corta":
    case "libro_respuesta_larga":
      return { titulo: "Revisa la respuesta", detalle: "Tiene que tener de 10 a 3000 letras." };
    default:
      return null;
  }
}
