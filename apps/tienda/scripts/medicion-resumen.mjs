/**
 * Lo puro del lector de la medición (ADR-0447): sacar los envíos de un registro, contarlos una sola vez y resumirlos por página. Lo usa
 * `medicion-leer.mjs`; lo prueba `medicion-resumen.test.mjs`, que también exige que la etiqueta, las métricas y las páginas sean las de
 * `lib/medicion.ts` (este archivo no la importa para correr con `node` a secas, sin compilar TypeScript).
 */

/** La misma de `lib/medicion.ts`. */
export const ETIQUETA = "medicion_tienda";

/**
 * [bueno, malo]: hasta el primero es bueno; sobre el segundo, malo; entre los dos, mejorable. Las métricas de entrada son las de Google
 * (Core Web Vitals, sobre el percentil 75, que es como las mide él). Las del toque son de CAYLA:
 * - `respuesta` (del toque a lo primero que cambia): la misma vara que el INP, porque el esqueleto ES la respuesta al toque. Sobre
 *   200 ms la persona ya nota que tocó y no pasó nada; sobre 500 ms, vuelve a tocar.
 * - `pagina` (del toque a la página): una transición se siente fluida bajo 1 s; sobre 2,5 s es tan lenta como cargar una página desde
 *   cero (el «bueno» del LCP).
 */
export const UMBRALES = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
  respuesta: [200, 500],
  pagina: [1000, 2500],
};

/** Un toque cuya página no llegó en 20 s se anota con 20 s (`ESPERA_MAXIMA_DEL_TOQUE_MS` de `lib/medicion.ts`). */
export const SIN_LLEGAR_MS = 20_000;

/** Con menos de esto, un percentil 75 cambia de un día a otro por una sola visita: no alcanza para decidir. */
export const MINIMO_PARA_DECIDIR = 30;

/** Las páginas con una grilla o carriles de prendas que se precargan en fila, desde las que se toca una para ver su ficha (ADR-0445,
 *  «lista → ficha»). De una ficha a otra es otro problema (no sale el esqueleto) y tiene su propia fila en la tabla de toques. */
export const LISTAS = ["/inicio", "/catalogo"];
export const FICHA = "/catalogo/[id]";

const ORDEN_DE_METRICAS = ["LCP", "FCP", "TTFB", "INP", "CLS"];

/** Los envíos que hay en un texto: el registro tal cual (`medicion_tienda {…}` por línea, como lo escribe `next start`) o la salida de
 *  `vercel logs --json` (un objeto por línea, con el mensaje dentro de `data`). Lo demás se salta. */
export function leerEnvios(texto) {
  const envios = [];
  for (const linea of texto.split("\n")) {
    for (const mensaje of mensajesDeLaLinea(linea)) {
      const desde = mensaje.indexOf(`${ETIQUETA} {`);
      if (desde < 0) continue;
      try {
        const envio = JSON.parse(mensaje.slice(desde + ETIQUETA.length + 1));
        if (typeof envio?.envio === "string" && Number.isFinite(envio.t) && Array.isArray(envio.m)) envios.push(envio);
      } catch {
        // Una línea cortada: se salta.
      }
    }
  }
  return envios;
}

function mensajesDeLaLinea(linea) {
  const limpia = linea.trim();
  if (!limpia.startsWith("{")) return [limpia];
  try {
    const registro = JSON.parse(limpia);
    // `vercel logs --json` (CLI 64): {"type":"log","data":{"message":"…",…}}. Si algún día el mensaje cambia de campo, se miran todos los textos.
    const datos = registro?.data && typeof registro.data === "object" ? registro.data : registro;
    if (typeof datos.message === "string") return [datos.message];
    return Object.values(datos).filter((v) => typeof v === "string");
  } catch {
    return [limpia];
  }
}

/**
 * Cada cosa una sola vez: un envío bajado dos veces (dos descargas que se pisan) cuenta una; y una métrica de entrada que llegó en dos
 * envíos (CLS e INP se vuelven a mandar si la pestaña vuelve a la vista) se queda con su último valor.
 */
export function unicos(envios) {
  const porEnvio = new Map();
  for (const e of envios) porEnvio.set(e.envio, e);
  const entradas = new Map();
  const toques = [];
  for (const e of porEnvio.values()) {
    for (const m of e.m) {
      const fila = { ...m, t: e.t, conexion: e.conexion ?? null, ancho: e.ancho ?? null };
      if (m.n === "toque") {
        toques.push(fila);
        continue;
      }
      const clave = `${m.id}|${m.n}`;
      const antes = entradas.get(clave);
      if (!antes || antes.t <= e.t) entradas.set(clave, fila);
    }
  }
  return { envios: porEnvio.size, entradas: [...entradas.values()], toques };
}

/** El percentil por rango más cercano: el p75 de 4 valores es el tercero. */
export function percentil(valores, p) {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.max(0, Math.ceil(p * orden.length) - 1)];
}

export function estado(metrica, valor) {
  const [bueno, malo] = UMBRALES[metrica] ?? [];
  if (valor === null || bueno === undefined) return "—";
  return valor <= bueno ? "bueno" : valor <= malo ? "mejorable" : "malo";
}

function agrupar(filas, clave) {
  const grupos = new Map();
  for (const f of filas) {
    const k = clave(f);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return grupos;
}

/** La respuesta a «¿hace falta el esqueleto inmediato de la lista a la ficha?» (ADR-0445), con su p75 y por tipo de conexión. */
export function decisionListaAFicha(toques) {
  const deLaLista = toques.filter((t) => LISTAS.includes(t.desde) && t.hacia === FICHA);
  const p75 = percentil(deLaLista.map((t) => t.respuesta), 0.75);
  const porConexion = [...agrupar(deLaLista, (t) => t.conexion ?? "sin dato")].map(([conexion, filas]) => ({
    conexion,
    n: filas.length,
    p75: percentil(filas.map((t) => t.respuesta), 0.75),
  }));
  const [bueno, malo] = UMBRALES.respuesta;
  const veredicto =
    deLaLista.length < MINIMO_PARA_DECIDIR
      ? `Faltan toques: ${deLaLista.length} de ${MINIMO_PARA_DECIDIR}. Sigue juntando (corre esto cada día: el registro guarda uno).`
      : p75 <= bueno
        ? `No hace falta: en 3 de cada 4 toques la ficha (o su esqueleto) sale en ${bueno} ms o menos.`
        : p75 <= malo
          ? `Conviene: 1 de cada 4 toques espera más de ${bueno} ms sin ver nada; se nota, pero todavía no hace tocar dos veces.`
          : `Hace falta: 1 de cada 4 toques espera más de ${malo} ms sin ver nada (ahí la persona vuelve a tocar).`;
  const repetidos = deLaLista.length ? Math.round((100 * deLaLista.filter((t) => t.repetido).length) / deLaLista.length) : 0;
  return { n: deLaLista.length, p75, repetidos, porConexion, veredicto };
}

/** Todo lo que hay desde `desde` (milisegundos), por página. */
export function resumir(envios, desde = 0) {
  const { envios: cuantos, entradas, toques } = unicos(envios.filter((e) => e.t >= desde));
  const filasDeEntrada = [...agrupar(entradas, (e) => `${e.r}|${e.n}|${e.suave ? "suave" : "entrada"}`)]
    .map(([, filas]) => {
      const p75 = percentil(filas.map((f) => f.v), 0.75);
      return { ruta: filas[0].r, metrica: filas[0].n, suave: filas[0].suave, n: filas.length, p75, estado: estado(filas[0].n, p75) };
    })
    .sort((a, b) => a.ruta.localeCompare(b.ruta) || Number(a.suave) - Number(b.suave) || ORDEN_DE_METRICAS.indexOf(a.metrica) - ORDEN_DE_METRICAS.indexOf(b.metrica));
  const filasDeToque = [...agrupar(toques, (t) => `${t.desde}|${t.hacia}`)]
    .map(([, filas]) => {
      const respuesta = percentil(filas.map((f) => f.respuesta), 0.75);
      const pagina = percentil(filas.map((f) => f.pagina), 0.75);
      return {
        desde: filas[0].desde,
        hacia: filas[0].hacia,
        n: filas.length,
        respuesta,
        estadoRespuesta: estado("respuesta", respuesta),
        pagina,
        estadoPagina: estado("pagina", pagina),
        conEsqueleto: Math.round((100 * filas.filter((f) => f.esqueleto).length) / filas.length),
        sinLlegar: filas.filter((f) => f.pagina >= SIN_LLEGAR_MS).length,
        repetidos: Math.round((100 * filas.filter((f) => f.repetido).length) / filas.length),
      };
    })
    .sort((a, b) => b.n - a.n || a.desde.localeCompare(b.desde));
  const tiempos = envios.filter((e) => e.t >= desde).map((e) => e.t);
  return {
    envios: cuantos,
    desde: tiempos.length ? Math.min(...tiempos) : null,
    hasta: tiempos.length ? Math.max(...tiempos) : null,
    entradas: filasDeEntrada,
    toques: filasDeToque,
    decision: decisionListaAFicha(toques),
  };
}

const ms = (v) => (v === null ? "—" : `${Math.round(v).toLocaleString("es-PE")} ms`);
const valor = (metrica, v) => (v === null ? "—" : metrica === "CLS" ? v.toFixed(3) : ms(v));
const fecha = (t) => (t === null ? "—" : new Date(t).toISOString().slice(0, 16).replace("T", " "));
const columnas = (filas) => {
  const anchos = filas[0].map((_, i) => Math.max(...filas.map((f) => String(f[i]).length)));
  return filas.map((f) => f.map((c, i) => String(c).padEnd(anchos[i])).join("  ").trimEnd()).join("\n");
};

/** El resumen como se lee en la terminal. */
export function formatear(r) {
  const partes = [`Medición de la tienda · ${fecha(r.desde)} a ${fecha(r.hasta)} (UTC) · ${r.envios} envíos (1 de cada 2 visitas)`];
  if (r.envios === 0) return `${partes[0]}\n\nNo hay mediciones en este período.`;
  partes.push(
    "\nAL ENTRAR — percentil 75 por página de entrada (bueno / mejorable / malo, la vara de Google). «interna»: una navegación dentro de\nla tienda, solo en el Chrome que la mide.",
    r.entradas.length
      ? columnas([["página", "métrica", "n", "p75", "estado"], ...r.entradas.map((e) => [e.ruta, e.suave ? `${e.metrica} interna` : e.metrica, e.n, valor(e.metrica, e.p75), e.estado])])
      : "(sin datos)",
    "\nAL TOCAR UN ENLACE — percentil 75 del toque a lo primero que cambia (respuesta) y a la página de destino. «no llegó»: a los 20 s\nno estaba la página (cuenta como 20 s). «tocó de nuevo»: la persona volvió a tocar el enlace porque no vio nada.",
    r.toques.length
      ? columnas([
          ["desde → hacia", "n", "respuesta p75", "estado", "página p75", "estado", "con esqueleto", "tocó de nuevo", "no llegó"],
          ...r.toques.map((t) => [
            `${t.desde} → ${t.hacia}`,
            t.n,
            ms(t.respuesta),
            t.estadoRespuesta,
            ms(t.pagina),
            t.estadoPagina,
            `${t.conEsqueleto} %`,
            `${t.repetidos} %`,
            t.sinLlegar,
          ]),
        ])
      : "(sin datos)",
    `\n¿HACE FALTA EL ESQUELETO INMEDIATO DE LA LISTA A LA FICHA? (ADR-0445; toques desde ${LISTAS.join(", ")} a ${FICHA})`,
    `${r.decision.n} toques · respuesta p75 ${ms(r.decision.p75)} · tocó de nuevo ${r.decision.repetidos} %${r.decision.porConexion.length ? ` · ${r.decision.porConexion.map((c) => `${c.conexion}: ${ms(c.p75)} (${c.n})`).join(" · ")}` : ""}`,
    r.decision.veredicto,
  );
  return partes.join("\n");
}
