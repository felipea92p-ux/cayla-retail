import { debeAvisarDesdeElNavegador, entornoDeSentry, opcionesDeSentry, sentryActivo } from "./errores-reglas";

// El aviso de errores en el NAVEGADOR (ADR-0424), sin sumarle peso a cada pantalla. Importado de entrada, Sentry le sumaba 57,6 KB
// comprimidos a lo que descarga TODA pantalla (de 167,8 a 225,4 KB, medido el 2026-10-15 con builds de producción), casi todo código
// para medir tiempos que aquí no se usa y que Turbopack no descarta: estaba en el camino de cada pantalla, también en el celular del
// mostrador. Por eso se descarga DESPUÉS, en un pedazo aparte (49,6 KB, una vez y queda guardado), cuando la pantalla ya está lista
// (`instrumentation-client.ts`), y solo donde avisa (producción con la dirección puesta): en local y en las vistas previas no se
// descarga nunca. Cada pantalla quedó en 170,3 KB: +2,5 KB.
//
// Nada de este archivo importa Sentry de entrada: solo `import()` cuando hace falta. Lo que corre en el servidor (`capturarError`)
// está en `errores.ts`.

/** ¿Esta web le avisa sola a Felipe cuando una pantalla se cae? Lo dice la tarjeta de error. */
export const AVISA_SOLO = sentryActivo(entornoDeSentry());

type SentryDelNavegador = typeof import("./errores-sentry-navegador");
let cargado: Promise<SentryDelNavegador | null> | null = null;

/** Sentry ya iniciado, descargado una sola vez. `null` si esta web no avisa o si no se pudo descargar (sin red, bloqueado): el
 *  aviso se pierde en silencio y la pantalla sigue igual. */
export function sentryDelNavegador(): Promise<SentryDelNavegador | null> {
  if (!AVISA_SOLO) return Promise.resolve(null);
  cargado ??= import("./errores-sentry-navegador")
    .then((Sentry) => {
      Sentry.init(opcionesDeSentry(entornoDeSentry()));
      return Sentry;
    })
    .catch(() => null);
  return cargado;
}

/** Lo que hace una barrera de error del navegador al aparecer. Si Sentry no responde, la pantalla de error se muestra igual, y la
 *  persona sigue teniendo el código y el «escríbele». */
export function avisarError(error: Error & { digest?: string }, barrera: string): void {
  console.error("Pantalla caída:", error);
  if (debeAvisarDesdeElNavegador(error)) void sentryDelNavegador().then((Sentry) => Sentry?.captureException(error, { tags: { barrera } }));
}
