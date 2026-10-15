// Las rutas de los trabajos programados de la tienda (Vercel, `vercel.json` → `crons`), como las del ERP (`apps/web/lib/rutas-cron.ts`,
// que la tienda no puede importar: vive sola). Lógica pura, con su prueba (`cron.test.ts`, que además compara la lista con
// `vercel.json`).
//
// PROMETE: qué rutas son de un cron y si una petición trae su clave. Vercel llama con `Authorization: Bearer $CRON_SECRET`; sin la
// variable, o con otra clave, no pasa nadie. La clave abre SOLO estas rutas.

/** Las rutas que llama el cron de la tienda. */
export const RUTAS_DE_CRON = [
  // ADR-0408 (Felipe 2026-10-14): borra del proyecto de clientes los usuarios de las cuentas que se cerraron (su ficha se anonimizó)
  // y que nadie volvió a intentar usar. Cada madrugada, después de la conservación del Club del ERP (03:00 de Lima).
  "/api/cuentas-cerradas",
] as const;

/** ¿La petición trae la clave del cron? Sin `CRON_SECRET` configurado no pasa nadie, tampoco «Bearer undefined» ni «Bearer ». */
export function cronAutorizado(autorizacion: string | null, secreto: string | undefined): boolean {
  return Boolean(secreto?.trim()) && autorizacion === `Bearer ${secreto}`;
}
