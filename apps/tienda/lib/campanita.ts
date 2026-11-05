import type { Prenda } from "./catalogo";
import type { Dia } from "./cuentas";

// La campanita de la cabecera (ADR-0408; Felipe, 2026-10-17: avisar en la propia página cuando llegan prendas nuevas). Un solo lugar,
// en toda página con cuenta, que dice dos cosas: «la talla que esperabas ya llegó» y «llegó algo nuevo desde tu última visita».
// Lógica pura, con su prueba al lado (`campanita.test.ts`). Lo que habla con la base y las cookies vive en `components/campanita/`.
//
// CONTRATO
//   PROMETE: contar cuántas prendas de Lo nuevo llegaron DESPUÉS del día en que la persona miró la campanita por última vez, sin
//            inventar nada: sin ese día (la primera vez en este aparato) no hay número; armar las filas de «tu talla llegó» con
//            la misma lectura del aviso al entrar; y decir cuántas cosas hay sin ver para el globo.
//   ASUME:   `Prenda.nuevo.dias` es «hace cuántos días llegó» (0 a 30; null: fijada en la Vitrina, sin fecha), la regla única de
//            Lo nuevo (`fn_tienda_lo_nuevo`). La talla que llegó viene de `tienda_mis_avisos_del_club` (la regla de «hay» de la ficha).
//   NO HACE: no lee la base ni las cookies, no escribe nada y no manda ningún aviso fuera de la página (eso es otra pieza).
//
// DECIDÍ: «lo último que viste» es un DÍA (de Lima), no una hora, porque el catálogo solo sabe los días que lleva cada prenda. Una prenda
//   que llega después de que miraste la campanita, el mismo día, se cuenta mañana: se prefiere contar de menos a anunciar una novedad
//   que la persona ya vio. Ese día vive en una cookie de ESTE aparato, nunca en la base (lo que alguien leyó no se guarda).
// DESCARTÉ: llamar a `fn_tienda_novedades` en cada página: 131 ms con 298 modelos (medido en producción el 2026-10-17), contra ~13 ms de
//   leer la cuenta, y el catálogo que la página ya leyó trae lo mismo.

/** El prefijo de la cookie de la campanita: una por persona (como los avisos cerrados), para que dos personas en un mismo aparato no se pisen. */
const COOKIE_CAMPANITA = "tienda-campanita-";

/** Lo que dura la cookie: lo máximo que aguanta Chrome (400 días). Si se pierde, la campanita vuelve a empezar de cero, sin número. */
const VIDA_DE_LA_COOKIE_S = 400 * 24 * 60 * 60;

/** El nombre de la cookie de ESTA persona (las 8 primeras letras de su usuario, como `avisosDelClub`). */
export const nombreCookieCampanita = (usuarioId: string) => `${COOKIE_CAMPANITA}${usuarioId.toLowerCase().slice(0, 8)}`;

/** «2026-10-17». */
export const textoDia = (d: Dia) => `${d.anio}-${String(d.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`;

/** El día que dice la cookie; null si no hay o no es una fecha de verdad («2026-02-30», «ayer»): una cookie rara no cuenta como visita. */
export function leerDia(valor: string | null | undefined): Dia | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? "");
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia ? { anio, mes, dia } : null;
}

/** Cuántos días de calendario hay de `desde` a `hasta` (negativo si `hasta` es anterior: el reloj del aparato anda mal). */
export function diasEntre(desde: Dia, hasta: Dia): number {
  const ms = Date.UTC(hasta.anio, hasta.mes - 1, hasta.dia) - Date.UTC(desde.anio, desde.mes - 1, desde.dia);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Cuántas prendas de Lo nuevo llegaron después del día en que se miró la campanita. Una prenda que llegó hace `dias` días llegó el día
 * (hoy − dias); es posterior a `visto` cuando `dias < hoy − visto`. null si nunca se miró (no se sabe qué es nuevo PARA ELLA: el primer
 * globo diría «298»); 0 si se miró hoy. Las fijadas en la Vitrina sin fecha (`dias: null`) no cuentan.
 */
export function novedadesDesde(prendas: readonly Pick<Prenda, "nuevo">[], visto: Dia | null, hoy: Dia): number | null {
  if (!visto) return null;
  const pasados = diasEntre(visto, hoy);
  if (pasados <= 0) return 0;
  return prendas.filter((p) => p.nuevo !== null && p.nuevo.dias !== null && p.nuevo.dias < pasados).length;
}

/** La cookie que anota «hoy miré la campanita» (para `document.cookie`). Segura solo en https: en local (http) el navegador la rechazaría. */
export function cookieDelDia(nombre: string, hoy: Dia, seguro: boolean): string {
  return `${nombre}=${textoDia(hoy)}; Path=/; Max-Age=${VIDA_DE_LA_COOKIE_S}; SameSite=Lax${seguro ? "; Secure" : ""}`;
}

/* ---------------- Lo que dice el panel ---------------- */

/** Cuántas notificaciones se muestran en el panel; el resto se ve en «Ver todas». */
export const NOTIFICACIONES_EN_EL_PANEL = 5;

/** Un aviso del panel: una talla que llegó o una respuesta de CAYLA, con la hora en que la cuenta lo recibió. */
export type AvisoEnPanel = {
  clave: string;
  tipo: "llego" | "respuesta";
  titulo: string;
  texto: string;
  href: string;
  /** Cuándo lo recibió la cuenta (la hora guardada en el historial): el panel los ordena por esta hora, la más reciente primero. */
  recibidoEn: string;
  /** ¿Todavía no se leyó en profundidad? (su punto de color). */
  sinVer: boolean;
};

export type DatosCampanita = {
  /** Las notificaciones más recientes, la más nueva primero. Hasta `NOTIFICACIONES_EN_EL_PANEL`. */
  recientes: AvisoEnPanel[];
  /** ¿Hay más notificaciones de las que caben en el panel? Entonces el panel enlaza a «Ver todas». */
  hayMas: boolean;
  /** Prendas nuevas desde su última mirada; null si nunca miró (no hay número). */
  novedades: number | null;
  /** El número del globo: las notificaciones sin leer más las novedades. 0: sin globo. */
  globo: number;
  /** TODAS las claves de las notificaciones no borradas (no solo las del panel): la vista en vivo compara contra ellas para saber cuál es
   *  nueva. */
  claves: string[];
  /** ¿Hay alguna notificación que todavía no se abrió el panel desde que llegó? Con «Entendido» (abrir el panel) el globo rojo se oculta,
   *  y solo vuelve cuando llega una nueva. Los puntos y el número no cambian con «Entendido». */
  pendientePanel: boolean;
};

/** Prefijos de las cookies de este aparato. «Leído» reutiliza la cookie del aviso al entrar (`tienda-aviso-`, la misma de `inicio-aviso`):
 *  un aviso leído en profundidad también deja de salir ahí. «Entendido» del panel va aparte (`tienda-panel-visto-`). */
export const PREFIJO_LEIDO = "tienda-aviso-";
export const PREFIJO_PANEL_VISTO = "tienda-panel-visto-";
/** Cuánto dura cada cookie que escribe el navegador: lo que más dura un aviso (medio año), como en `inicio-aviso`. */
const DIAS_COOKIE_CAMPANITA = 180;

/** La expresión de cookie que escribe el navegador para un aviso (`document.cookie = …`). */
export function cookieDeClave(prefijo: string, clave: string, seguro: boolean): string {
  return `${prefijo}${clave}=1; path=/; max-age=${DIAS_COOKIE_CAMPANITA * 24 * 60 * 60}; samesite=lax${seguro ? "; secure" : ""}`;
}

/** Un aviso que llegó, tal como lo lee la vista en vivo (`/api/avisos-club`): una talla o una respuesta. */
export type LlegadaViva = { clave: string; titulo: string; href: string; tipo: "llego" | "respuesta" };

/** Las tallas que llegaron y que la pantalla todavía no conoce (las que faltan en `conocidas`): lo que hay que avisar de inmediato. */
export function llegadasNuevas(conocidas: ReadonlySet<string>, recibidas: readonly LlegadaViva[]): LlegadaViva[] {
  return recibidas.filter((l) => !conocidas.has(l.clave));
}

/** Lo que dice el aviso breve cuando llega algo nuevo: una talla, una respuesta de CAYLA o varias cosas juntas. */
export function textoLlegadasNuevas(nuevas: readonly LlegadaViva[]): string {
  const respuestas = nuevas.filter((n) => n.tipo === "respuesta").length;
  if (nuevas.length === 1) {
    const [unica] = nuevas;
    return unica.tipo === "respuesta" ? "CAYLA te respondió una recomendación." : `${unica.titulo}: la talla que esperabas.`;
  }
  if (respuestas === nuevas.length) return `CAYLA te respondió ${nuevas.length} recomendaciones.`;
  if (respuestas === 0) return `Llegaron ${nuevas.length} tallas que esperabas.`;
  return `Tienes ${nuevas.length} avisos nuevos.`;
}

/**
 * Arma lo que la campanita muestra. `recientes`: la primera página del historial, de la más reciente a la más antigua (ya ordenada por la
 * base). `claves`: todas las no borradas, y `total`: cuántas son en total (para saber si hay más de las que caben en el panel). `leidas`:
 * las que ya se leyeron en profundidad (quitan el punto y restan del número). `enPanel`: las que ya se vieron al abrir el panel (ocultan
 * el globo, no el punto ni el número). Si la base no contestó (`recientes` vacío y `claves` vacío), el panel dice que no hay nada, y
 * las novedades se ven igual. Solo cuentan las tallas que llegaron: el regalo de cumpleaños y el cupón por vencer ya los dice el aviso del
 * Inicio y «Mi perfil».
 */
export function armarCampanita(
  recientes: readonly { clave: string; tipo: "llego" | "respuesta"; titulo: string; texto: string; href: string; recibidoEn: string }[],
  claves: readonly string[],
  total: number,
  leidas: ReadonlySet<string>,
  novedades: number | null,
  enPanel: ReadonlySet<string> = new Set(),
): DatosCampanita {
  const enElPanel: AvisoEnPanel[] = recientes
    .slice(0, NOTIFICACIONES_EN_EL_PANEL)
    .map((a) => ({ ...a, sinVer: !leidas.has(a.clave) }));
  const sinLeer = claves.filter((c) => !leidas.has(c)).length;
  return {
    recientes: enElPanel,
    hayMas: total > NOTIFICACIONES_EN_EL_PANEL,
    novedades,
    globo: sinLeer + (novedades ?? 0),
    claves: [...claves],
    pendientePanel: claves.some((c) => !enPanel.has(c)),
  };
}

/** Lo que oye el lector en el botón: «Avisos», «Avisos: 3 nuevos». */
export const etiquetaCampanita = (globo: number) => (globo > 0 ? `Avisos: ${globo} ${globo === 1 ? "nuevo" : "nuevos"}` : "Avisos");

/** El número del globo: de 10 para arriba, «9+» (el globo mide 18 px). */
export const textoGlobo = (globo: number) => (globo > 9 ? "9+" : String(globo));

/** Lo nuevo, en una línea corta (2026-10-19, dentro del menú de la cuenta): «3 prendas nuevas»; sin nada (o sin dato), «Nada nuevo». */
export function textoNovedades(n: number | null): string {
  if (!n) return "Nada nuevo";
  return n === 1 ? "1 prenda nueva" : `${n} prendas nuevas`;
}
