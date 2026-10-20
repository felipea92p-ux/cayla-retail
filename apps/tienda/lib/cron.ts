// Las rutas de los trabajos programados de la tienda (Vercel, `vercel.json` → `crons`), como las del ERP (`apps/web/lib/rutas-cron.ts`,
// que la tienda no puede importar: vive sola). Lógica pura, con su prueba (`cron.test.ts`, que además compara la lista con
// `vercel.json`).
//
// PROMETE: qué rutas son de un cron y si una petición a una de ellas trae su clave. Vercel llama con `Authorization: Bearer
// $CRON_SECRET`; sin la variable, o con otra clave, no pasa nadie. La clave abre SOLO estas rutas.

/** Las rutas que llama el cron de la tienda. */
export const RUTAS_DE_CRON = [
  // ADR-0408 (Felipe 2026-10-14): borra del proyecto de clientes los usuarios de las cuentas que se cerraron (su ficha se anonimizó)
  // y que nadie volvió a intentar usar. Cada madrugada, después de la conservación del Club del ERP (03:00 de Lima).
  "/api/cuentas-cerradas",
  // Avisos push en el celular (Felipe, 2026-10-20): cada minuto manda lo que la cola tiene pendiente (una talla que esperaba, un pedido
  // que cambió). Plan Pro del equipo: el cron de cada minuto está permitido.
  "/api/push-enviar",
] as const;

/** ¿La petición trae la clave del cron? Sin `CRON_SECRET` configurado no pasa nadie, tampoco «Bearer undefined» ni «Bearer ». */
function cronAutorizado(autorizacion: string | null, secreto: string | undefined): boolean {
  return Boolean(secreto?.trim()) && autorizacion === `Bearer ${secreto}`;
}

/** ¿Pasa como el cron? Solo a una de SUS rutas y con su clave: la clave no abre ninguna otra. */
export function pasaComoCron(ruta: string, autorizacion: string | null, secreto: string | undefined): boolean {
  return (RUTAS_DE_CRON as readonly string[]).includes(ruta) && cronAutorizado(autorizacion, secreto);
}
