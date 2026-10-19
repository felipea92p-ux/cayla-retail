// Cuánto falta para que termine la campaña (la cuenta regresiva del Inicio). Aparte de `lib/portada.ts` (2026-10-17): esa lee la campaña de
// la base con zod, y la cuenta regresiva se dibuja en el navegador; juntas, la portada cargaba zod entero en el celular del cliente solo
// para restar dos fechas. La regla vive una sola vez, en @cayla-retail/portada (`textos.ts`, ADR-0436): la vista previa del ERP cuenta igual.
export { finDeCampana, partesCuenta } from "@cayla-retail/portada";
