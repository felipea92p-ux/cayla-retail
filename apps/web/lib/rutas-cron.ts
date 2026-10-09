// Las rutas de los trabajos programados de Vercel (`vercel.json` → `crons`), como `rutas-publicas.ts` las de la página pública.
// Lógica pura: la importan `proxy.ts` y cada ruta de cron, y la prueba `rutas-cron.test.ts` (que además compara esta lista con
// `vercel.json`).
//
// CONTRATO
//   PROMETE: qué rutas son de un cron y si una petición trae la clave del cron. Vercel llama con `Authorization: Bearer $CRON_SECRET`;
//            sin la variable, o con otra clave, no pasa nadie.
//   ASUME:   cada ruta vuelve a comprobar la clave por su cuenta (`cronAutorizado`): `proxy.ts` puede dejar de cubrirla si alguien
//            cambia su `matcher`. La clave abre SOLO estas rutas, ninguna pantalla ni otra API.

/** Las rutas que llama el cron. Una ruta nueva en `vercel.json` sin estar aquí la frena `proxy.ts` (no trae sesión): lo vigila la prueba. */
export const RUTAS_DE_CRON = [
  // PL-113: el barrido de la cola de SUNAT, cada 5 minutos.
  "/api/lucode/reintentar",
  // ADR-0288 act. g, G-15: la conservación del club (anonimiza las fichas sin compras en 3 años), una vez al día de madrugada.
  "/api/club/conservacion",
  // ADR-0208 act. 2026-10-07: la vara de CAYLA de Frescura (una curva por categoría con las tres tiendas), cada madrugada (3:20 de Lima).
  "/api/inventario/frescura-vara-cayla",
] as const;

/** ¿La petición trae la clave del cron? Sin `CRON_SECRET` configurado no pasa nadie, tampoco «Bearer undefined» ni «Bearer ». */
export function cronAutorizado(autorizacion: string | null, secreto: string | undefined): boolean {
  return Boolean(secreto) && autorizacion === `Bearer ${secreto}`;
}

/** Para `proxy.ts`: una ruta de cron con la clave pasa sin tocar la sesión (el cron no trae cookies). */
export function pasaComoCron(pathname: string, autorizacion: string | null, secreto: string | undefined): boolean {
  return (RUTAS_DE_CRON as readonly string[]).includes(pathname) && cronAutorizado(autorizacion, secreto);
}
