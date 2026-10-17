// Cuánto tarda la tienda en el celular de los clientes reales (ADR-0447, Felipe 2026-10-17: «medición propia en el registro de Vercel,
// gratis, con muestra de 1 de cada 2 visitas»). Hasta hoy cada mejora de velocidad se decidía con un banco de pruebas local con red lenta
// simulada; esto mide lo que de verdad ve el cliente:
//   - Al entrar, las métricas de Google (Core Web Vitals) de la página por la que entró: LCP (cuándo se ve lo principal), FCP (cuándo se ve
//     algo), TTFB (cuándo responde el servidor), CLS (cuánto salta la página) e INP (cuánto tarda en responder a un toque).
//   - Al tocar un enlace de la tienda, del toque a lo primero que cambia (el esqueleto o la página) y a la página de destino.
// Lo manda `components/Medicion.tsx` a `POST /api/medicion`, que escribe una línea en el registro de Vercel y nada más (sin base). Se lee con
// `pnpm --filter tienda medicion:leer` (`scripts/medicion-leer.mjs`).
//
// NUNCA viaja nada de la persona: ni la sesión, ni el correo, ni la dirección completa (una lista puede llevar lo que se buscó, `?q=`). Solo
// la página sin sus ids (`rutaDeMedicion`), la métrica y su valor, el tipo de conexión que dice el navegador (4g, 3g…) y el ancho de la
// ventana redondeado a 10 px. Este archivo no importa nada: lo usan el navegador (solo en las visitas de la muestra) y el servidor. El
// sorteo de la muestra vive aparte, en `lib/medicion-muestra.ts`, para que las visitas que no entran no bajen este archivo.

/** La marca con que la línea se encuentra en el registro de Vercel (`vercel logs --query medicion_tienda`). La repite
 *  `scripts/medicion-resumen.mjs`, y su prueba exige que sean iguales. */
export const ETIQUETA = "medicion_tienda";

/** La ruta que recibe las mediciones. `proxy.ts` no la mira: un envío no toca la sesión de nadie. */
export const RUTA_DE_MEDICION = "/api/medicion";

/** Lo más que se espera a la página de un toque: lo que a los 20 s no llegó (ni el esqueleto, ni la página) se anota como 20 s. Dejarlo
 *  fuera haría ver el percentil mejor de lo que es, justo en los peores toques. */
export const ESPERA_MAXIMA_DEL_TOQUE_MS = 20_000;

/** El atributo que lleva el esqueleto de una página (`EsqueletoDePagina`): mientras está en la pantalla, la página de destino no llegó. */
export const SELECTOR_ESQUELETO = "[data-esqueleto]";

/**
 * Las páginas de la tienda, con sus partes variables como `[id]`: son las de `app/**\/page.tsx` sin los grupos `(catalogo)`, y
 * `medicion.test.ts` exige que la lista sea esa misma (una página nueva que no está aquí se mediría como «otra»). Lo que viaja y se
 * escribe es una de estas o «otra», nunca la dirección que llegó.
 */
export const RUTAS_MEDIDAS = [
  "/",
  "/bolsa",
  "/bolsa/separado/[numero]",
  "/cambios-y-devoluciones",
  "/catalogo",
  "/catalogo/[id]",
  "/como-separar",
  "/crear-cuenta",
  "/cuenta",
  "/cuenta/club",
  "/cuenta/correo",
  "/cuenta/eliminar",
  "/cuenta/pedidos",
  "/cuenta/pedidos/[numero]",
  "/entrar",
  "/inicio",
  "/looks",
  "/looks/[id]",
  "/looks/arma",
  "/looks/guardado/[id]",
  "/nueva-contrasena",
  "/olvide-mi-contrasena",
  "/privacidad",
  "/recomendaciones",
  "/restablecer-acceso",
  "/terminos-del-club",
  "/tiendas",
  "/tu-look",
] as const;

export const RUTA_OTRA = "otra";

const RUTAS_VALIDAS = new Set<string>([...RUTAS_MEDIDAS, RUTA_OTRA]);
const PARTES_DE_RUTAS = RUTAS_MEDIDAS.map((ruta) => ({ ruta, partes: ruta.split("/").filter(Boolean) }));
const esVariable = (parte: string) => parte.startsWith("[") && parte.endsWith("]");

/** La página de una dirección, sin sus ids ni lo que va tras el `?`. Una parte fija gana a una variable (`/looks/arma` no es un look). */
export function rutaDeMedicion(direccion: string): string {
  const partes = direccion.split(/[?#]/)[0].split("/").filter(Boolean);
  let mejor: { ruta: string; variables: number } | null = null;
  for (const candidata of PARTES_DE_RUTAS) {
    if (candidata.partes.length !== partes.length) continue;
    let variables = 0;
    const calza = candidata.partes.every((parte, i) => {
      if (esVariable(parte)) {
        variables += 1;
        return partes[i].length > 0;
      }
      return parte === partes[i];
    });
    if (calza && (!mejor || variables < mejor.variables)) mejor = { ruta: candidata.ruta, variables };
  }
  return mejor?.ruta ?? RUTA_OTRA;
}

export const METRICAS_DE_ENTRADA = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type MetricaDeEntrada = (typeof METRICAS_DE_ENTRADA)[number];
const esMetricaDeEntrada = (n: unknown): n is MetricaDeEntrada => (METRICAS_DE_ENTRADA as readonly unknown[]).includes(n);

/** Una métrica de Google de una página: la de entrada o, en un Chrome que mide navegaciones internas, la de una navegación (`suave`). */
export interface MedidaDeEntrada {
  n: MetricaDeEntrada;
  /** Milisegundos; en CLS, el puntaje (sin unidad). */
  v: number;
  r: string;
  /** El id que web-vitals le da a la métrica de esa carga (al azar): el lector se queda con su último valor (CLS e INP se mandan otra
   *  vez si la pestaña vuelve a la vista y sigue cambiando). */
  id: string;
  suave: boolean;
}

/** Un toque en un enlace de la tienda: del toque a lo primero que cambió y a la página de destino. */
export interface MedidaDeToque {
  n: "toque";
  desde: string;
  hacia: string;
  /** Del toque a lo primero que cambió en la pantalla: el esqueleto o, si no hubo, la página. */
  respuesta: number;
  /** Del toque a la página de destino sin su esqueleto (sus partes de la persona pueden seguir llegando). */
  pagina: number;
  /** Si en el camino se vio el esqueleto de la página. */
  esqueleto: boolean;
  /** Si la persona volvió a tocar el mismo enlace antes de ver algo: el toque «no respondió». Se mide desde el primero. */
  repetido: boolean;
}

export type Medida = MedidaDeEntrada | MedidaDeToque;

export const CONEXIONES = ["slow-2g", "2g", "3g", "4g"] as const;
export type Conexion = (typeof CONEXIONES)[number];

export interface Envio {
  /** Al azar, 8 letras: si el mismo envío se baja dos veces del registro, el lector lo cuenta una. */
  envio: string;
  /** La que dice el navegador (solo Chrome y Android la dicen; Safari y Firefox, no). */
  conexion: Conexion | null;
  /** El ancho de la ventana, redondeado a 10 px. */
  ancho: number | null;
  m: Medida[];
}

/** Lo más que viaja en un envío: el navegador parte la cola en tandas (una línea del registro queda bajo ~4 KB). */
export const MEDIDAS_POR_ENVIO = 20;
/** Lo más que la ruta acepta leer. */
export const TOPE_DEL_ENVIO = 4096;
const TOPE_MS = 120_000;
const TOPE_TOQUE_MS = 30_000;

export const redondearAncho = (ancho: number): number => Math.round(ancho / 10) * 10;

/** El valor como viaja: milisegundos enteros, y el CLS con tres decimales. */
export const redondearValor = (n: MetricaDeEntrada, valor: number): number =>
  n === "CLS" ? Math.round(valor * 1000) / 1000 : Math.round(valor);

const esNumeroEn = (v: unknown, desde: number, hasta: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= desde && v <= hasta;
const esRuta = (v: unknown): v is string => typeof v === "string" && RUTAS_VALIDAS.has(v);

function leerMedida(m: unknown): Medida | null {
  if (typeof m !== "object" || m === null) return null;
  const o = m as Record<string, unknown>;
  if (o.n === "toque") {
    if (!esRuta(o.desde) || !esRuta(o.hacia) || typeof o.esqueleto !== "boolean" || typeof o.repetido !== "boolean") return null;
    if (!esNumeroEn(o.respuesta, 0, TOPE_TOQUE_MS) || !esNumeroEn(o.pagina, 0, TOPE_TOQUE_MS) || o.pagina < o.respuesta) return null;
    return {
      n: "toque",
      desde: o.desde,
      hacia: o.hacia,
      respuesta: Math.round(o.respuesta),
      pagina: Math.round(o.pagina),
      esqueleto: o.esqueleto,
      repetido: o.repetido,
    };
  }
  if (!esMetricaDeEntrada(o.n) || !esRuta(o.r) || typeof o.suave !== "boolean") return null;
  if (typeof o.id !== "string" || !/^[\w.-]{1,48}$/.test(o.id)) return null;
  if (!esNumeroEn(o.v, 0, o.n === "CLS" ? 50 : TOPE_MS)) return null;
  return { n: o.n, v: redondearValor(o.n, o.v), r: o.r, id: o.id, suave: o.suave };
}

/**
 * Lo que la ruta acepta, armado de nuevo campo por campo (nada que llegue de más se escribe): nombres de una lista fija, páginas de
 * `RUTAS_MEDIDAS` y números en su rango. Cualquiera puede mandar un envío inventado con curl; esto solo limita QUÉ puede escribir.
 */
export function leerEnvio(cuerpo: unknown): Envio | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const o = cuerpo as Record<string, unknown>;
  if (typeof o.envio !== "string" || !/^[0-9a-f]{8}$/.test(o.envio)) return null;
  const conexion = o.conexion === null ? null : (CONEXIONES as readonly unknown[]).includes(o.conexion) ? (o.conexion as Conexion) : undefined;
  if (conexion === undefined) return null;
  const ancho = o.ancho === null ? null : esNumeroEn(o.ancho, 200, 5000) ? redondearAncho(o.ancho) : undefined;
  if (ancho === undefined) return null;
  if (!Array.isArray(o.m) || o.m.length === 0 || o.m.length > MEDIDAS_POR_ENVIO) return null;
  const m = o.m.map(leerMedida);
  if (m.some((x) => x === null)) return null;
  return { envio: o.envio, conexion, ancho, m: m as Medida[] };
}

/** La línea que la ruta escribe en el registro: la etiqueta y el envío, con la hora del servidor (`t`, milisegundos). */
export const lineaDeRegistro = (envio: Envio, t: number): string => `${ETIQUETA} ${JSON.stringify({ t, ...envio })}`;
