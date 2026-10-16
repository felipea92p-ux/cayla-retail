import { z } from "zod";
import { MESES, soles, type Dia } from "./cuentas";

// El Club en la cuenta de la tienda online (ADR-0408, actividad 12): lo que «Mi cuenta» dice de los beneficios del Club de ESA
// persona (su descuento de cumpleaños y su vale por aniversario), «Novedades para ti», sus favoritos y lo que espera («Avísame
// cuando llegue»). Sale de la maqueta aprobada (docs/maquetas/tienda-online-2026-10: `vCuenta`, `agregarAviso`, los corazones de
// `tarjeta` y `vProducto`). Lógica pura, sin red: la usan las páginas, los botones y sus pruebas.
//
// Quien decide de verdad es la base (`retail.tienda_mi_club`, `tienda_favorito`, `tienda_avisame`, `tienda_quitar_avisame`): los
// beneficios salen de las MISMAS funciones del Club que cobra la caja (ADR-0288), así que aquí solo se ponen en palabras. Una
// respuesta rara no se muestra a medias: el bloque dice que no se pudo cargar.

/* ------------------------------------------------------------------ Lo que devuelve tienda_mi_club */

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const numero = z.coerce.number().finite();

const esquemaCumple = z.object({
  estado: z.enum(["disponible", "canjeado", "proximo", "sin_fecha", "sin_club"]),
  dia: z.number().int().min(1).max(31).nullable(),
  mes: z.number().int().min(1).max(12).nullable(),
  pct: numero.positive(),
  hasta: fecha.nullable(),
  canjeado_el: fecha.nullable(),
});

const esquemaAniversario = z.object({
  estado: z.enum(["vale", "canjeado", "en_camino", "sin_club"]),
  vale_monto: numero.positive().nullable(),
  vale_vence: fecha.nullable(),
  vale_canjeado_el: fecha.nullable(),
  proximo: fecha.nullable(),
  anio_cuenta: z.boolean(),
  compras: numero.int().nonnegative(),
  monto: numero.nonnegative(),
  compras_meta: numero.int().positive(),
  monto_meta: numero.positive(),
  siguiente_monto: numero.positive().nullable(),
  dias: numero.int().positive(),
});

const esquemaEspera = z.object({
  id: z.string().uuid(),
  variante_id: z.string().uuid(),
  producto_id: z.string().uuid(),
  producto: z.string().min(1),
  color: z.object({ codigo: z.string(), nombre: z.string(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable() }).nullable(),
  talla: z.string().nullable(),
  sede: z.object({ id: z.string().uuid(), nombre: z.string().nullable() }).nullable(),
  creada_en: z.string(),
  se_ve: z.boolean(),
  llego: z.boolean(),
  hay_en: z.array(z.string()),
});

const esquemaMiClub = z.object({
  club: z.object({
    activa: z.boolean(),
    con_publicidad: z.boolean(),
    cumple: esquemaCumple,
    aniversario: esquemaAniversario,
  }),
  novedades: z.object({
    primera: z.boolean(),
    total: numero.int().nonnegative(),
    productos: z.array(z.string().uuid()),
  }),
  favoritos: z.array(z.string().uuid()),
  esperas: z.array(z.unknown()),
});

export type Cumple = {
  estado: "disponible" | "canjeado" | "proximo" | "sin_fecha" | "sin_club";
  dia: number | null;
  mes: number | null;
  pct: number;
  hasta: string | null;
  canjeadoEl: string | null;
};

export type Aniversario = {
  estado: "vale" | "canjeado" | "en_camino" | "sin_club";
  valeMonto: number | null;
  valeVence: string | null;
  valeCanjeadoEl: string | null;
  proximo: string | null;
  anioCuenta: boolean;
  compras: number;
  monto: number;
  comprasMeta: number;
  montoMeta: number;
  siguienteMonto: number | null;
  dias: number;
};

export type Espera = {
  id: string;
  varianteId: string;
  productoId: string;
  producto: string;
  color: { codigo: string; nombre: string; hex: string | null } | null;
  talla: string | null;
  /** La tienda donde la espera, o `null`: en cualquier tienda de la web. */
  sede: { id: string; nombre: string | null } | null;
  creadaEn: string;
  /** El modelo sigue en la tienda online. */
  seVe: boolean;
  /** Hay libre en esa tienda (o, si da igual la tienda, en alguna de la web). */
  llego: boolean;
  /** Las tiendas de la web donde hay libre ahora. */
  hayEn: string[];
};

export type MiClub = {
  club: { activa: boolean; conPublicidad: boolean; cumple: Cumple; aniversario: Aniversario };
  novedades: { primera: boolean; total: number; productos: string[] };
  favoritos: string[];
  esperas: Espera[];
};

/** La respuesta de `tienda_mi_club`. null si no tiene la forma (no se muestra a medias); una espera rara se deja fuera sola. */
export function leerMiClub(dato: unknown): MiClub | null {
  const r = esquemaMiClub.safeParse(dato);
  if (!r.success) return null;
  const { club, novedades, favoritos, esperas } = r.data;
  const c = club.cumple;
  const a = club.aniversario;
  return {
    club: {
      activa: club.activa,
      conPublicidad: club.con_publicidad,
      cumple: { estado: c.estado, dia: c.dia, mes: c.mes, pct: c.pct, hasta: c.hasta, canjeadoEl: c.canjeado_el },
      aniversario: {
        estado: a.estado,
        valeMonto: a.vale_monto,
        valeVence: a.vale_vence,
        valeCanjeadoEl: a.vale_canjeado_el,
        proximo: a.proximo,
        anioCuenta: a.anio_cuenta,
        compras: a.compras,
        monto: a.monto,
        comprasMeta: a.compras_meta,
        montoMeta: a.monto_meta,
        siguienteMonto: a.siguiente_monto,
        dias: a.dias,
      },
    },
    novedades,
    favoritos,
    esperas: esperas.flatMap((e) => {
      const x = esquemaEspera.safeParse(e);
      if (!x.success) return [];
      const d = x.data;
      return [
        {
          id: d.id,
          varianteId: d.variante_id,
          productoId: d.producto_id,
          producto: d.producto,
          color: d.color,
          talla: d.talla,
          sede: d.sede,
          creadaEn: d.creada_en,
          seVe: d.se_ve,
          llego: d.llego,
          hayEn: d.hay_en,
        },
      ];
    }),
  };
}

/* ------------------------------------------------------------------ Las fechas, como se dicen */

/** «2026-10-31» → «31 de octubre»; si no es de este año, «3 de mayo de 2027». */
export function fechaDicha(iso: string, hoy: Dia): string {
  const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const base = `${dia} de ${MESES[mes - 1] ?? ""}`;
  return anio === hoy.anio ? base : `${base} de ${anio}`;
}

/** «S/ 20», «S/ 25.50» (como los términos del Club). */
export const montoDicho = (n: number) => soles(Math.round(n * 100) / 100);

const pctDicho = (pct: number) => `${Number.isInteger(pct) ? pct : pct.toFixed(1)} %`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/* ------------------------------------------------------------------ Lo que dice «Mi perfil» de sus beneficios */

/** El próximo cumpleaños: «14 de octubre» este año o, si ya pasó, «14 de octubre de 2027». */
export function proximoCumple(dia: number, mes: number, hoy: Dia): string {
  const yaPaso = mes < hoy.mes || (mes === hoy.mes && dia < hoy.dia);
  const anio = yaPaso ? hoy.anio + 1 : hoy.anio;
  return fechaDicha(`${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, hoy);
}

export type Beneficio = {
  titulo: string;
  texto: string;
  /** «Disponible»: se puede usar hoy. */
  disponible: boolean;
  /** Lo que lleva hacia el vale (0 a 1), solo si todavía no le toca. */
  avance: number | null;
};

/** El descuento de cumpleaños, con la regla de la caja (ADR-0288 D-5: en su mes, una vez por año, en tienda con su DNI). */
export function beneficioCumple(c: Cumple, conPublicidad: boolean, hoy: Dia): Beneficio {
  const pct = pctDicho(c.pct);
  switch (c.estado) {
    case "disponible":
      return {
        titulo: `Tu descuento de cumpleaños: ${pct}`,
        texto: `Es tu mes: úsalo en una compra en cualquier tienda CAYLA${c.hasta ? ` hasta el ${fechaDicha(c.hasta, hoy)}` : ""}. En caja, con tu DNI.`,
        disponible: true,
        avance: null,
      };
    case "canjeado":
      return {
        titulo: "Descuento de cumpleaños: ya lo usaste este año",
        texto:
          `${c.canjeadoEl ? `Lo usaste el ${fechaDicha(c.canjeadoEl, hoy)}. ` : ""}` +
          (c.mes ? `Vuelve a estar disponible en ${MESES[c.mes - 1]} de ${hoy.anio + 1}.` : "Vuelve a estar disponible el próximo año."),
        disponible: false,
        avance: null,
      };
    case "proximo":
      return {
        titulo: c.dia && c.mes ? `Descuento de cumpleaños: ${proximoCumple(c.dia, c.mes, hoy)}` : "Descuento de cumpleaños",
        texto: `${pct} en una compra en tienda durante tu mes. ${conPublicidad ? "Te avisamos por WhatsApp y también lo ves aquí." : "Lo ves aquí cuando llegue tu mes."}`,
        disponible: false,
        avance: null,
      };
    case "sin_fecha":
      return {
        titulo: "Descuento de cumpleaños",
        texto: "Tu ficha del Club no tiene tu cumpleaños. Díselo a la tienda en tu próxima compra y lo ves aquí.",
        disponible: false,
        avance: null,
      };
    default:
      return { titulo: "Descuento de cumpleaños", texto: "No disponible: tu ficha del Club no está activa.", disponible: false, avance: null };
  }
}

/** El vale por aniversario, con la regla de la caja (ADR-0288 G-9 y G-13: un año cuenta con N compras o S/ M; se usa en X días). */
export function beneficioAniversario(a: Aniversario, conPublicidad: boolean, hoy: Dia): Beneficio {
  const meta = `${plural(a.comprasMeta, "compra", "compras")} o ${montoDicho(a.montoMeta)}`;
  const llevas =
    a.compras === 0 && a.monto === 0
      ? "Todavía no tienes compras este año."
      : `Llevas ${plural(a.compras, "compra", "compras")} y ${montoDicho(a.monto)}.`;
  const avance = Math.max(0, Math.min(1, Math.max(a.compras / a.comprasMeta, a.monto / a.montoMeta)));
  const proximo = a.proximo ? fechaDicha(a.proximo, hoy) : null;
  const siguiente = a.siguienteMonto ? montoDicho(a.siguienteMonto) : null;

  if (a.estado === "vale" && a.valeMonto) {
    return {
      titulo: `Tienes un vale de ${montoDicho(a.valeMonto)}`,
      texto: `Por tu aniversario con CAYLA. Úsalo en una compra en cualquier tienda CAYLA${a.valeVence ? ` hasta el ${fechaDicha(a.valeVence, hoy)}` : ""}. En caja, con tu DNI.`,
      disponible: true,
      avance: null,
    };
  }
  if (a.estado === "sin_club") {
    return { titulo: "Vale por tu aniversario con CAYLA", texto: "No disponible: tu ficha del Club no está activa.", disponible: false, avance: null };
  }
  const usado = a.estado === "canjeado" && a.valeMonto ? `Usaste tu vale de ${montoDicho(a.valeMonto)}${a.valeCanjeadoEl ? ` el ${fechaDicha(a.valeCanjeadoEl, hoy)}` : ""}. ` : "";
  if (a.anioCuenta) {
    return {
      titulo: siguiente ? `Vale por tu aniversario: ${siguiente}` : "Vale por tu aniversario con CAYLA",
      texto: `${usado}Este año ya cuenta: ${proximo ? `el ${proximo}` : "en tu aniversario"} recibes tu vale${conPublicidad ? " y te avisamos por WhatsApp" : ""}.`,
      disponible: false,
      avance: 1,
    };
  }
  return {
    titulo: "Vale por tu aniversario con CAYLA",
    texto: `${usado}${proximo ? `El ${proximo}` : "En tu aniversario"} recibes ${siguiente ? `un vale de ${siguiente}` : "tu vale"} si este año sumas ${meta}. ${llevas}`,
    disponible: false,
    avance,
  };
}

/** «Llegaron 3 prendas desde tu última visita.» (propuesta i). */
export function tituloNovedades(n: MiClub["novedades"]): string {
  if (n.total === 0) return n.primera ? "Esta semana no llegó nada nuevo." : "Desde tu última visita no llegó nada nuevo.";
  const cuantas = n.total === 1 ? "Llegó 1 prenda" : `Llegaron ${n.total} prendas`;
  return `${cuantas} ${n.primera ? "esta semana" : "desde tu última visita"}.`;
}

export const textoNovedades = (n: MiClub["novedades"]) =>
  n.total === 0 ? "Apenas llegue algo nuevo, lo ves aquí. Sin mensajes de publicidad." : "Sin mensajes de publicidad: las novedades las ves aquí.";

/** Cuántas novedades se dibujan en el carril (la maqueta muestra hasta 8). */
export const NOVEDADES_EN_EL_CARRIL = 8;

/** «Negro · Talla M · en Trujillo». */
export function detalleEspera(e: Espera): string {
  const partes = [e.color?.nombre, e.talla ? `Talla ${e.talla}` : null, e.sede ? `en ${e.sede.nombre ?? "tu tienda"}` : "en cualquier tienda"];
  return partes.filter(Boolean).join(" · ");
}

/** «Lima y Trujillo». */
export function listaDicha(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Qué pasa con una espera: llegó (y dónde hay), ya no está en la web, o sigue esperando. */
export function estadoEspera(e: Espera): { tono: "llego" | "fuera" | "espera"; texto: string } {
  if (!e.seVe) return { tono: "fuera", texto: "Ya no está en la tienda online." };
  if (e.llego) {
    const donde = e.sede ? [e.sede.nombre ?? "tu tienda"] : e.hayEn;
    return { tono: "llego", texto: donde.length ? `¡Llegó! Hay en ${listaDicha(donde)}.` : "¡Llegó!" };
  }
  if (e.sede && e.hayEn.length) return { tono: "espera", texto: `Te avisamos aquí apenas llegue. Ahora hay en ${listaDicha(e.hayEn)}.` };
  return { tono: "espera", texto: "Te avisamos aquí apenas llegue." };
}

/** El orden de «Te avisamos cuando llegue»: primero lo que ya llegó (es lo que hay que ver), después lo que espera y al final lo que
 *  ya no está en la web; dentro de cada grupo, como viene de la base (lo último pedido primero). */
export function ordenarEsperas(esperas: readonly Espera[]): Espera[] {
  const peso = (e: Espera) => ({ llego: 0, espera: 1, fuera: 2 })[estadoEspera(e).tono];
  return esperas.map((e, i) => ({ e, i })).sort((a, b) => peso(a.e) - peso(b.e) || a.i - b.i).map((x) => x.e);
}

/* ------------------------------------------------------------------ Favoritos y «Avísame» (los botones) */

/** La clave de una espera: la prenda y la tienda (o «todas»), para saber si ya se pidió. */
export const claveEspera = (varianteId: string, sedeId: string | null) => `${varianteId}|${sedeId ?? "todas"}`;

/** Una talla que no se nombra («Única», «Estándar»): «Avísame cuando llegue», sin «la Única». */
const sinNombre = (talla: string) => /^(única|unica|estándar|estandar)$/i.test(talla.trim());

/** Lo que dice el botón (maqueta: «Avísame cuando llegue la M»). La tienda no va aquí: ya se lee en la ficha («Ver lo que hay en»)
 *  y en el celular el botón no la aguanta en una línea; la dicen su etiqueta para el lector y el aviso de abajo. */
export function textoBotonAvisame(talla: string): string {
  return sinNombre(talla) ? "Avísame cuando llegue" : `Avísame cuando llegue la ${talla.trim()}`;
}

/** Lo que oye el lector de pantalla: el botón y, con una tienda elegida, dónde («… a Trujillo»). */
export function etiquetaBotonAvisame(talla: string, sedeNombre: string | null): string {
  const que = textoBotonAvisame(talla);
  return sedeNombre ? `${que} a ${sedeNombre}` : que;
}

/** El aviso de abajo después de pedirlo (maqueta, `agregarAviso`). */
export function textoAvisoAnotado(talla: string, sedeNombre: string | null): string {
  const que = sinNombre(talla) ? "cuando llegue" : `cuando llegue la talla ${talla.trim()}`;
  return `Te avisaremos en tu cuenta ${que}${sedeNombre ? ` a ${sedeNombre}` : ""}.`;
}

/**
 * «Te avisaremos cuando llegue» ya pedido se puede quitar desde la misma ficha (antes, solo desde «Mi cuenta»). Lo que oye el lector de
 * pantalla en ese botón: «Quitar el aviso de la talla M a Trujillo».
 */
export function etiquetaQuitarAviso(talla: string, sedeNombre: string | null): string {
  const de = sinNombre(talla) ? "" : ` de la talla ${talla.trim()}`;
  return `Quitar el aviso${de}${sedeNombre ? ` a ${sedeNombre}` : ""}`;
}

/** El aviso de abajo después de quitarlo: qué pasó y que se puede volver a pedir. */
export function textoAvisoQuitado(talla: string): string {
  const de = sinNombre(talla) ? "" : ` de la talla ${talla.trim()}`;
  return `Quitamos el aviso${de}. Puedes volver a pedirlo cuando quieras.`;
}

export type EstadoFavorito = "guardado" | "quitado" | "tope" | "no_disponible" | "cuenta_inactiva" | "sin_sesion" | "sin_respuesta";
export type EstadoAviso = "anotada" | "hay" | "tope" | "no_disponible" | "cuenta_inactiva" | "sin_sesion" | "sin_respuesta";
export type EstadoQuitar = "quitada" | "no_esta" | "sin_sesion" | "sin_respuesta";

export const MENSAJES_CLUB = {
  favoritoGuardado: "Guardado en tus favoritos.",
  favoritoTope: "Ya tienes 100 favoritos. Quita alguno en Mi perfil para guardar otro.",
  avisoTope: "Ya pediste 30 avisos. Quita alguno en Mi perfil para pedir otro.",
  noDisponible: "Esta prenda ya no está en la tienda online.",
  cuentaInactiva: "Tu ficha del Club no está activa. Acércate a cualquier tienda CAYLA y la revisan contigo.",
  sinSesion: "Entra a tu cuenta para guardarlo.",
  sinRespuesta: "No pudimos guardarlo ahora. Intenta de nuevo en un momento.",
  hay: "¡Ya hay! Mira la tienda otra vez: ya puedes agregarla a tu bolsa.",
  quitarNoEsta: "Ese aviso ya no estaba en tu cuenta.",
  quitarSinRespuesta: "No pudimos quitarlo ahora. Intenta de nuevo en un momento.",
} as const;

/** Lo que dice el aviso de abajo cuando el corazón no se pudo guardar. null: salió bien (el de «Guardado» lo pone el botón). */
export function mensajeFavorito(estado: EstadoFavorito): string | null {
  switch (estado) {
    case "guardado":
    case "quitado":
      return null;
    case "tope":
      return MENSAJES_CLUB.favoritoTope;
    case "no_disponible":
      return MENSAJES_CLUB.noDisponible;
    case "cuenta_inactiva":
      return MENSAJES_CLUB.cuentaInactiva;
    case "sin_sesion":
      return MENSAJES_CLUB.sinSesion;
    default:
      return MENSAJES_CLUB.sinRespuesta;
  }
}

/** Lo que dice el aviso de abajo cuando «Avísame» no se anotó. */
export function mensajeAviso(estado: Exclude<EstadoAviso, "anotada">): string {
  switch (estado) {
    case "hay":
      return MENSAJES_CLUB.hay;
    case "tope":
      return MENSAJES_CLUB.avisoTope;
    case "no_disponible":
      return MENSAJES_CLUB.noDisponible;
    case "cuenta_inactiva":
      return MENSAJES_CLUB.cuentaInactiva;
    case "sin_sesion":
      return "Entra a tu cuenta para pedir el aviso.";
    default:
      return "No pudimos anotar tu aviso ahora. Intenta de nuevo en un momento.";
  }
}

const ESTADOS_FAVORITO = ["guardado", "quitado", "tope", "no_disponible", "cuenta_inactiva"] as const;
const ESTADOS_AVISO = ["anotada", "hay", "tope", "no_disponible", "cuenta_inactiva"] as const;

/** La respuesta de `tienda_favorito`. Lo que no se entiende (o `sin_cuenta`, que el servidor no espera con sesión) = sin respuesta. */
export function leerRespuestaFavorito(dato: unknown): EstadoFavorito {
  const r = z.object({ estado: z.string() }).safeParse(dato);
  return r.success && (ESTADOS_FAVORITO as readonly string[]).includes(r.data.estado) ? (r.data.estado as EstadoFavorito) : "sin_respuesta";
}

/** La respuesta de `tienda_avisame`: el estado y, si se anotó, su id. */
export function leerRespuestaAviso(dato: unknown): { estado: EstadoAviso; esperaId: string | null } {
  const r = z.object({ estado: z.string(), id: z.string().uuid().optional() }).safeParse(dato);
  if (!r.success || !(ESTADOS_AVISO as readonly string[]).includes(r.data.estado)) return { estado: "sin_respuesta", esperaId: null };
  if (r.data.estado === "anotada" && !r.data.id) return { estado: "sin_respuesta", esperaId: null };
  return { estado: r.data.estado as EstadoAviso, esperaId: r.data.id ?? null };
}

/** La respuesta de `tienda_quitar_avisame`. */
export function leerRespuestaQuitar(dato: unknown): EstadoQuitar {
  const r = z.object({ estado: z.string() }).safeParse(dato);
  return r.success && (r.data.estado === "quitada" || r.data.estado === "no_esta") ? r.data.estado : "sin_respuesta";
}

/** Lo guardado de una cuenta (`tienda_mis_favoritos_y_esperas`), para dibujar los corazones y los «Te avisaremos» de la ficha. */
export type Guardados = { favoritos: Set<string>; esperas: Map<string, string> };

export function leerGuardados(dato: unknown): Guardados | null {
  const r = z
    .object({
      favoritos: z.array(z.string().uuid()),
      esperas: z.array(z.object({ id: z.string().uuid(), variante_id: z.string().uuid(), sede: z.string().uuid().nullable() })),
    })
    .safeParse(dato);
  if (!r.success) return null;
  return {
    favoritos: new Set(r.data.favoritos),
    esperas: new Map(r.data.esperas.map((e) => [claveEspera(e.variante_id, e.sede), e.id])),
  };
}

/** Lo que los botones mandan al servidor: ids con forma de uuid (el servidor no confía en nada de lo que llega). */
export const esquemaId = z.string().uuid();
