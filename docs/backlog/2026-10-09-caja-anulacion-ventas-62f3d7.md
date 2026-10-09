## Caja anula ventas (2026-10-09)
- [ ] Pegar en producción `supabase/migrations/20261009120000_anular_venta_quien_ve_devoluciones.sql` (huella previa `3a7331230e11c4ba12336c3391219796`), **antes** de publicar la web: si la web sale primero, la caja ve el botón y la base la rechaza; pegarla antes no rompe nada.
- [ ] Pegar en producción `supabase/migrations/20261009121000_tienda_revisa_apertura_y_arregla_danada.sql` (huellas previas en su cabecera), también **antes** de publicar la web.
- [ ] Prueba visual en el navegador como «Terminal de ventas» (no se pudo: el worktree no tiene `.env.local`).
- [ ] Siguen siendo de líder, por decidir: cuadre del piso con pocas diferencias; aprobar/rechazar devoluciones de monto chico.
