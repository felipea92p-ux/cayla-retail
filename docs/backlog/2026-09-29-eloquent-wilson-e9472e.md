## 🌱 Patrones en el seed local (2026-09-29) — solo `supabase/seed.sql`, sin migración; rama `claude/eloquent-wilson-e9472e`

**Estado:** hecho y probado en local. Nada que pegar en producción (producción ya tiene sus 9 patrones y su mapa).

- [x] `seed.sql`: 7 patrones aprobados (Liso, Rayas, Cuadros, Lunares, Floral, Animal print, Estampado) y 133 vínculos en
      `retail.categoria_patrones` (toda Indumentaria activa + Pañuelos y Pañoletas). Cierra el pendiente «Base local sin
      patrones» de `docs/BACKLOG.md`.
- [x] Verificado: bloque contra tablas vaciadas en una transacción con ROLLBACK (0 → 7 y 133, segunda corrida sin duplicar,
      `patrones_estado_biut` otra vez habilitado, estado de la base intacto); aplicado solo ese bloque en local; en
      `/productos/nuevo` con «Camisas y Blusas» el paso «Cómo se hace» lista los 7 patrones, deja elegir Algodón · Liso y
      ofrece «Seguir al precio →».
- [ ] **Sin correr en una base nueva de punta a punta:** no se hizo `supabase db reset` para no borrar la base local
      compartida (otras sesiones tienen ahí migraciones sin pegar). El seed completo lo corre el piloto de CI; si Felipe
      hace un reset limpio, comprobar `select count(*) from retail.patrones` (7) y `from retail.categoria_patrones` (133).
- [ ] **Producción tiene 9 patrones y el seed 7:** no se sabe cuáles son los otros dos (se cargaron a mano). Si Felipe los
      quiere también en local, pasarlos y se agregan al `insert` y a la lista de nombres del vínculo.
- [ ] **Alcance del mapa del seed:** cualquier categoría nueva de Indumentaria recibe los 7 patrones sola (se une por
      familia). Si algún día una categoría no debe ofrecer patrones, excluirla en ese `where`.
