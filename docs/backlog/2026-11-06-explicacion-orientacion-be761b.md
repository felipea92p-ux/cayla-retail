# Backlog — motivo de la venta sin registrar (2026-11-06)

- [x] **Pegada en producción el 2026-11-06 por Felipe** (verificado: columnas, candados y `registrar_venta` con el motivo). Era: pegar `supabase/migrations/20261106233000_motivo_de_la_venta_sin_registrar.sql` (una sola ejecución; toma
  `prendas_por_regularizar` un instante y `registrar_venta`; sin políticas). Comprobado el 2026-11-06, solo lectura: el ancla está una vez
  y las columnas no existen. Después: `pnpm datos:generar:produccion`.
- [ ] **A la semana de pegarla (≈ 2026-11-13):** contar por tienda y por motivo
  (`select motivo, count(*) from retail.prendas_por_regularizar where vendido_en > now() - interval '7 days' group by 1`) y decidir con
  Felipe qué se arregla primero. El detalle por persona no se versiona (repo público).
- [ ] Probar en Vender, con la base local al día, una venta completa con cada motivo (la base local estaba atrasada 20 días y Vender no
  cargaba; la hoja se verificó con una página de ensayo, en escritorio y a 375 px).
