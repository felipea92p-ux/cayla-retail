## 🧾 Compradores lee la plata del fondo (2026-11-26, ADR-0704 act. b) — migración `20261126223000` SIN pegar; rama `claude/bhekam-claudia-pereyra-fondos-3346ee`

- [x] `fn_compradores()` manda `tiene` (lo que la persona tiene en la mano) en cada ronda abierta; la tarjeta y el detalle hacen la cuenta desde ahí (`quedaDeRonda`, `dieronDeRonda` en `lib/compradores-reglas.ts`).
- [x] `fn_compradores_sin_ronda()`: quien tiene plata y no abrió su ronda sale en «Con plata, sin ronda abierta» y en su detalle.
- [x] Verificado: la consulta de la migración, corrida en solo lectura contra producción, da Bhekam S/ 13,800, Catherine S/ 9,588.90, Lizzelott S/ 0 y Claudia S/ 4,967 sin ronda; `pruebas:compras-compradores-plata` (5 casos) y `pruebas:compras-compradores` (8) pasan en un banco local; pruebas de reglas, tipos y huella de la guía en verde; la pantalla vista en local con esos datos.
- [ ] **Sin pegar en producción:** `supabase/migrations/20261126223000_compradores_plata_del_fondo.sql` (una parte, solo funciones). Espera el OK de Felipe. Después, `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Sin correr:** `guias:recorrer` de la guía de Compradores (se sumó el paso «Con plata, sin ronda abierta») y `/formidable`, `/chaos` de la pantalla.
- [ ] **Sin decidir:** «Mis compras» sigue diciendo «Te dieron S/ 0» a quien recibió su plata por «Entregar plata» (la muestra como «lo que tenías»). ¿Se cuenta como «Te dieron»?
- [x] **Rediseño (ADR-0704 act. c), aprobado por Felipe mirando las imágenes:** Compradores es una tabla de «quién tiene plata» con totales y cuatro cifras; el detalle va en dos columnas. Solo web. Visto en local con los datos reales a 1440 y 375 px (lista y detalle); el detalle también a 1024 y la lista a 1920, capturados sin revisar a fondo.
- [ ] **Sin correr:** `/milimetro` (no aparece en la sesión que lo construyó), `/formidable`, `/chaos` y el modo oscuro (`tema:auditar`) de las dos pantallas.
- [ ] **Sin probar con cuenta real:** «Entregar plata», «Anular» y la bandeja de revisión dentro del detalle nuevo (se vieron con piezas de muestra, sin base).
