## 🌐 «Datos y plazos de la tienda web» es un módulo propio (ADR-0430 act. b, 2026-10-16)

**Para hacer:**
- [ ] **Pegar `20261016223000_tienda_web_modulo_ajustes.sql` en producción** (idempotente, sin políticas ni `alter` de tablas, con prefijo
  `retail.`). Sin ella la web nueva pide un módulo que la base no conoce: la pantalla «Datos y plazos» y la tarjeta del Resumen no
  abren ni para el líder hasta que se pegue. Después, refrescar el volcado del diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Dar `ajustes_web`** en Roles y accesos a quien deba cambiar lo que la web muestra de cada tienda y los plazos de los pedidos
  (decisión de Felipe; nace solo para el líder).
- [ ] **Migración en la base local compartida:** se aplicó a mano con psql el 2026-10-16 (la base local está atrasada y no se registró en
  `schema_migrations`); `pnpm pruebas:roles-cobertura`, `pruebas:roles` y `pruebas:club-permisos` tienen rojos de la base atrasada, no de este
  cambio (devoluciones, historial, tienda_web, Compras, archivar_clienta).
