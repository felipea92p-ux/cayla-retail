import { TOPE_DE_PASOS, type PasoDelNavegador } from "./visita";

// Tienda web ▸ Tráfico (ADR-0495): la cola de pasos del navegador. «Vio una prenda» y «eligió talla» se juntan y salen en UN envío cuando
// la pestaña se oculta o se cierra (como la medición de velocidad, ADR-0447), o antes si ya son 10; así no hay una petición por toque.
// Cada paso lleva cuánto antes ocurrió (`hace_ms`): la hora la pone la base. Una prenda vista o una talla elegida cuenta una vez por
// pestaña. Con «no me rastrees» (Global Privacy Control) no se junta nada. «Entró» no pasa por aquí (lo manda `components/Visita.tsx`).

type SinHora<T> = T extends unknown ? Omit<T, "hace_ms"> : never;
export type PasoParaAnotar = SinHora<Exclude<PasoDelNavegador, { paso: 0 }>>;

const ENVIAR_CON = 10;
const cola: (PasoParaAnotar & { t: number })[] = [];
const yaAnotados = new Set<string>();
let escuchando = false;

const noRastrear = () => !!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;

function enviar() {
  if (!cola.length) return;
  const ahora = Date.now();
  const pasos = cola.splice(0, TOPE_DE_PASOS).map(({ t, ...paso }) => ({ ...paso, hace_ms: Math.max(0, ahora - t) }));
  const cuerpo = JSON.stringify({ pasos });
  // `sendBeacon` sale aunque la página se esté cerrando y lleva la cookie del visitante (la misma tienda); si el navegador no lo deja, un
  // `fetch` que sobrevive al cierre.
  const salio = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/visita", new Blob([cuerpo], { type: "application/json" }));
  if (!salio) void fetch("/api/visita", { method: "POST", body: cuerpo, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

function escuchar() {
  if (escuchando) return;
  escuchando = true;
  addEventListener("pagehide", enviar);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enviar();
  });
}

/** Junta un paso para el próximo envío. Nunca hace esperar a nadie ni lanza. */
export function anotarPaso(paso: PasoParaAnotar): void {
  if (typeof window === "undefined" || noRastrear()) return;
  const clave = JSON.stringify(paso);
  if (yaAnotados.has(clave)) return;
  yaAnotados.add(clave);
  cola.push({ ...paso, t: Date.now() });
  escuchar();
  if (cola.length >= ENVIAR_CON) enviar();
}
