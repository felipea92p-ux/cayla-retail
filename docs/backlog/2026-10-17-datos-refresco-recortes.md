## Refresco del volcado de producción, tras el #1164 (2026-10-17)

- [x] `docs/datos/generado/` refrescado por diferencia (`pnpm datos:refrescar`): las 1652 huellas coinciden con producción (foto de las
  20:55 UTC).
- [x] Diccionario, comparador (709 llamadas, ninguna sin respaldo, ninguna sobrecarga) y aviario al día. `campana_disenos` va a Loro, y
  el diccionario se volvió a generar después de darle pájaro.
- [ ] **Cuatro migraciones de Campañas están en producción y no en el repo.** Son `campanas_modulo_y_portada_por_dia`, `campanas_diseno`,
  `campanas_diseno_en_la_tienda` y `campanas_una_sola_llave`, con versiones de `20261017202815` a `20261017203618`, pegadas el 2026-10-17.
  - Las sube la sesión de `claude/campanas-design-customization-ddbd90` en su PR, con los números que reservó.
  - Hasta entonces, el volcado describe 16 funciones, una tabla y un módulo («Campañas», grupo Tienda web) que ninguna migración del repo
    crea, y la web todavía no los conoce: `lib/modulos.ts` no tiene `campanas`.
- [ ] Cuando llegue ese PR, quien lleve Campañas confirma que `campana_disenos` es de Loro (`scripts/datos/aviario.mjs`).
