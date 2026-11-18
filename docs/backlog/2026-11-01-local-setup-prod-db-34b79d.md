## Base local con la estructura de producción y acceso desde la red (2026-11-01)
- [x] Base local aislada `cayla-retail-prod` (fuera del repo, `~/Proyectos/cayla-local-prod`), esquema `retail` volcado de producción, huella md5 igual objeto por objeto (9 583 = 9 583; 14 diferencias solo de forma).
- [x] `allowedDevOrigins` en `apps/web/next.config.ts` (solo `next dev`): otros equipos de la red cargan el ERP local.
- [x] Venta de prueba de punta a punta en la base aislada (Caja → Vender → Cobrar).
- [ ] **Sin probar desde un segundo equipo real** de la red. Cómo verificas tú: con el ERP local arriba, abre `http://<IP de tu Mac>:3010` desde otro computador o celular de la misma red, entra con una cuenta `@cayla.local` y registra una venta.
- [ ] Sin HTTPS no hay cámara/escáner ni service worker en los otros equipos. Si hace falta, decidir un túnel o un certificado local (decisión de Felipe).
- [ ] Las tablas de Dynamic que usan planilla y asistencia son stubs vacíos: esas pantallas no tienen datos en local.
- [ ] El volcado se tomó el 2026-11-01; cuando producción cambie, rehacerlo (`supabase db dump --linked --schema retail`, ~6 min) y volver a comparar con la huella.
