import type { Prenda } from "./catalogo";
import type { Dia } from "./cuentas";
import type { AvisoClub } from "./inicio-aviso";

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

/** Cuántas tallas que llegaron se nombran en el panel; las demás van en una línea que lleva a «Mi perfil». */
export const LLEGADAS_EN_LA_CAMPANITA = 4;

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

export type FilaLlegada = { clave: string; titulo: string; texto: string; href: string; sinVer: boolean };

export type DatosCampanita = {
  /** Las tallas que esperaba y ya llegaron, las que no ha cerrado primero. Hasta `LLEGADAS_EN_LA_CAMPANITA`. */
  llegadas: FilaLlegada[];
  /** Cuántas tallas más llegaron y no se nombran. */
  llegadasMas: number;
  /** Prendas nuevas desde su última mirada; null si nunca miró (no hay número). */
  novedades: number | null;
  /** El número del globo: las tallas sin ver más las novedades. 0: sin globo. */
  globo: number;
};

/**
 * Arma lo que la campanita muestra. `avisos`: lo que está a favor de la persona (`leerAvisosDelClub`; null si la base no contestó:
 * sin tallas, y las novedades se ven igual). Solo cuentan las tallas que llegaron: el cumpleaños y el vale ya los dice el aviso del
 * Inicio y «Mi perfil». `vistos`: los avisos que cerró con «Entendido» (no suman al globo, pero siguen en el panel mientras la talla
 * esté disponible).
 */
export function armarCampanita(avisos: readonly AvisoClub[] | null, vistos: ReadonlySet<string>, novedades: number | null): DatosCampanita {
  const todas: FilaLlegada[] = (avisos ?? [])
    .filter((a) => a.tipo === "llego")
    .map((a) => ({ clave: a.clave, titulo: a.titulo, texto: a.texto, href: a.href ?? "/cuenta", sinVer: !vistos.has(a.clave) }));
  // Las sin ver primero; entre iguales, el orden en que llegaron de la base (lo último que pidió, primero).
  const ordenadas = [...todas.filter((f) => f.sinVer), ...todas.filter((f) => !f.sinVer)];
  return {
    llegadas: ordenadas.slice(0, LLEGADAS_EN_LA_CAMPANITA),
    llegadasMas: Math.max(0, ordenadas.length - LLEGADAS_EN_LA_CAMPANITA),
    novedades,
    globo: todas.filter((f) => f.sinVer).length + (novedades ?? 0),
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

/** «Y llegó 1 talla más que esperabas: mírala en Mi perfil.» */
export const textoLlegadasMas = (n: number) =>
  n === 1 ? "Y llegó 1 talla más que esperabas: mírala en Mi perfil." : `Y llegaron ${n} tallas más que esperabas: míralas en Mi perfil.`;
