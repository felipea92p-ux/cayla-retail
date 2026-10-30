## Apartados: el apartado dice su descuento (ADR-0584, actividad 4)

- [ ] **Pegar en producción `20261030224000_apartado_dice_su_descuento.sql`**, con OK de Felipe y DESPUÉS de `20261030220000` (necesita sus columnas). Una sola parte, sin políticas, idempotente. Con la base vieja la web nueva muestra «Campaña» en todo descuento (como antes): no se rompe nada.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando esté en producción.
