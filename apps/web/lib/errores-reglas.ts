// Reglas puras del aviso de errores con Sentry (ADR-0424): cuándo se avisa, qué se borra antes de mandar y qué se le dice a quien
// vio caerse la pantalla. Sin el SDK ni React: las usan la configuración de los tres lugares donde corre el código (navegador,
// servidor y edge: `instrumentation-client.ts`, `instrumentation.ts`), las barreras de error y sus pruebas. Lo único que no es puro
// es `entornoDeSentry`, que lee las dos variables.
//
// QUÉ SE AVISA. Un aviso le dice a Felipe «una persona se topó con una pantalla rota»: solo en PRODUCCIÓN (en local y en las
// vistas previas el que prueba ya lo está viendo) y sin los parpadeos de red del navegador, que en una tienda con wifi irregular
// son decenas al día y no son un error del sistema (en Dynamic son la mitad de sus avisos). El «fetch failed» del SERVIDOR sí se
// avisa: ahí significa que Vercel no llegó a Supabase.
//
// QUÉ NO SALE. Sentry es un servicio de afuera: no se le mandan datos de clientes ni de colaboradores. `sendDefaultPii: false` NO
// alcanza: probado el 2026-10-15 contra un Sentry de mentira, un error del servidor llevaba TODOS los encabezados, con la cookie de
// sesión de Supabase (el token y el correo de la cuenta), y las migas de la consola llevaban el error crudo. Por eso la limpieza va
// por LISTA BLANCA —de la petición solo sale la pantalla, el método y el navegador; de una miga, su dirección, método y estado—, y
// así un campo nuevo que el SDK agregue mañana no sale. Además se quita lo que un mensaje puede traer escrito: correos, números
// largos (DNI de 8, celular de 9, RUC de 11, tarjeta de 13 a 19) y la parte `?…` de cada dirección, donde viajan las búsquedas
// («?q=Juana Pérez»). No detecta un nombre suelto dentro de un mensaje: por eso el código nunca arma un error con el nombre de nadie.

/** Lo mínimo de un evento de Sentry que esta limpieza toca (`ErrorEvent` lo cumple sin importarlo). */
type EventoLimpiable = {
  message?: string;
  exception?: { values?: { value?: string }[] };
  request?: { url?: string; method?: string; headers?: Record<string, string> };
  breadcrumbs?: MigaLimpiable[];
  /** Next guarda aparte la dirección que pidió el navegador, CON su consulta (`request_path`). */
  contexts?: Record<string, unknown>;
};

/** Lo mínimo de una «miga» (lo que pasó antes del error: un clic, una navegación, una petición, una línea de la consola). */
type MigaLimpiable = { message?: string; data?: Record<string, unknown> };

/** Correos y números largos (DNI, celular, RUC, tarjeta). Un número pegado a una letra, un guion o un punto no es un dato: es parte
 *  de un id, un nombre de archivo o una versión (`chunk-12345678.js`, `20261015120000.sql`, el último tramo de un uuid); un punto
 *  al final de la frase, no. */
const DATOS_PERSONALES: readonly (readonly [RegExp, string])[] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]"],
  [/(?<![\w.\/-])\d{8,19}(?![\w-]|\.\w)/g, "[número]"],
];

/** Quita de un texto lo que puede ser un dato personal. */
export function limpiarDatosPersonales(texto: string): string {
  return DATOS_PERSONALES.reduce((t, [patron, reemplazo]) => t.replace(patron, reemplazo), texto);
}

/** Una dirección sin su `?…` ni su `#…`: el camino dice qué pantalla era; la consulta puede traer lo que alguien buscó. */
export function sinConsulta(url: string): string {
  const corte = url.search(/[?#]/);
  return corte === -1 ? url : url.slice(0, corte);
}

/** Lo único que sale de los datos de una miga: dónde (sin consulta), con qué método y cómo respondió. Lo demás —los argumentos
 *  crudos de una línea de la consola, que traen el error entero— se queda. */
const CLAVES_CON_DIRECCION = ["url", "from", "to"] as const;
const CLAVES_DE_MIGA = new Set<string>([...CLAVES_CON_DIRECCION, "method", "status_code"]);

export function limpiarMiga<M extends MigaLimpiable>(miga: M): M {
  if (miga.message) miga.message = limpiarDatosPersonales(miga.message);
  if (miga.data) {
    for (const clave of Object.keys(miga.data)) if (!CLAVES_DE_MIGA.has(clave)) delete miga.data[clave];
    for (const clave of CLAVES_CON_DIRECCION) {
      const valor = miga.data[clave];
      if (typeof valor === "string") miga.data[clave] = sinConsulta(valor);
    }
  }
  return miga;
}

/** De la petición, solo la pantalla, el método y el navegador: nunca las cookies (la sesión), los demás encabezados ni el cuerpo. */
function limpiarPeticion(peticion: NonNullable<EventoLimpiable["request"]>): NonNullable<EventoLimpiable["request"]> {
  const navegador = peticion.headers?.["user-agent"] ?? peticion.headers?.["User-Agent"];
  return {
    ...(peticion.url ? { url: sinConsulta(peticion.url) } : {}),
    ...(peticion.method ? { method: peticion.method } : {}),
    ...(navegador ? { headers: { "User-Agent": navegador } } : {}),
  };
}

/** Lo que pasa por `beforeSend`: el mismo evento, sin datos personales en el mensaje, la petición ni las migas. */
export function limpiarEvento<E extends EventoLimpiable>(evento: E): E {
  if (evento.message) evento.message = limpiarDatosPersonales(evento.message);
  for (const valor of evento.exception?.values ?? []) if (valor.value) valor.value = limpiarDatosPersonales(valor.value);
  if (evento.request) evento.request = limpiarPeticion(evento.request) as E["request"];
  const deNext = evento.contexts?.nextjs;
  if (typeof deNext === "object" && deNext !== null && "request_path" in deNext && typeof deNext.request_path === "string") {
    deNext.request_path = sinConsulta(deNext.request_path);
  }
  for (const miga of evento.breadcrumbs ?? []) limpiarMiga(miga);
  return evento;
}

/** Los parpadeos de red del NAVEGADOR (Chrome, Firefox, Safari) y el aviso de diseño de ResizeObserver: no son pantallas rotas. */
export const ERRORES_QUE_NO_AVISAN: readonly (string | RegExp)[] = [
  /^Failed to fetch$/,
  /^NetworkError when attempting to fetch resource\.?$/,
  /^Load failed$/,
  /^The network connection was lost\.?$/,
  /ResizeObserver loop/,
];

/** Las dos variables, que Next escribe dentro del código al armar la web: `NEXT_PUBLIC_SENTRY_DSN` la pone Felipe en Vercel (la
 *  dirección del proyecto «cayla-retail» de Sentry: no es secreta, el navegador la necesita) y `NEXT_PUBLIC_ENTORNO` la pone
 *  `next.config.ts` desde `VERCEL_ENV`. Sin la primera, o fuera de producción, Sentry queda apagado y la web funciona igual. */
export function entornoDeSentry(): { dsn: string | undefined; entorno: string | undefined } {
  return { dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, entorno: process.env.NEXT_PUBLIC_ENTORNO };
}

/** ¿Este código manda avisos? Solo con la dirección de Sentry configurada y en producción. */
export function sentryActivo(e: { dsn: string | undefined; entorno: string | undefined }): boolean {
  return Boolean(e.dsn) && e.entorno === "production";
}

/** Las opciones comunes de `Sentry.init` en el navegador, el servidor y el edge. */
export function opcionesDeSentry(e: { dsn: string | undefined; entorno: string | undefined }) {
  return {
    dsn: e.dsn,
    enabled: sentryActivo(e),
    environment: e.entorno ?? "local",
    // Sin la IP, las cookies ni los encabezados de quien usó la pantalla.
    sendDefaultPii: false,
    // Solo errores: sin medir tiempos (`tracesSampleRate` sin definir apaga el rastreo).
    ignoreErrors: [...ERRORES_QUE_NO_AVISAN],
    beforeSend: limpiarEvento,
    beforeBreadcrumb: limpiarMiga,
  };
}

/** Una barrera de error del navegador avisa solo lo que nació en el navegador. Lo que reventó en el servidor llega con su `digest`
 *  y ya lo avisó el servidor (`onRequestError`, con el mensaje real): avisarlo otra vez desde aquí lo duplicaría, y sin el
 *  mensaje, porque Next lo reemplaza por el `digest` antes de mandarlo al navegador. */
export function debeAvisarDesdeElNavegador(error: Error & { digest?: string }): boolean {
  return !error.digest;
}

/** Qué hacer después de reintentar. Si el sistema avisa solo, la persona no tiene que salir a buscar a Felipe; si no (local, una
 *  vista previa, Sentry sin configurar), sí. */
export function siSigueIgual(avisaSolo: boolean): string {
  return avisaSolo
    ? "Reintenta. A Felipe le llega un aviso de este error; si te urge, escríbele."
    : "Reintenta; si sigue igual, avisa a Felipe.";
}
