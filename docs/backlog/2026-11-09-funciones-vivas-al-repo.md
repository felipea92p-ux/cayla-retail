## 🧭 Producción ≠ main: tres funciones vivas vuelven al repo (2026-11-09) — 1 migración, sin cambio en producción; rama `claude/funciones-vivas-al-repo`

- [x] Medición de la deriva por el conector, solo lectura: producción tenía 48 objetos más que `main` y 6 funciones en otra versión. De
  `main` no faltaba pegar nada.
- [x] `20261109171000_funciones_vivas_de_produccion_al_repo.sql`: `corregir_pagos_venta`, `tienda_looks` y `tienda_probador`, copiadas de
  producción letra por letra. Sus huellas de `deriva.sql` coinciden con las de producción. No hace falta pegarla.
- [x] Pruebas ajustadas al texto de producción: `vitrina_looks` (mutante de la tienda elegida) y `tienda_empresas` (rehace el probador del
  17-oct antes de volver a pegar las del 21-oct).
- [x] Pruebas de base que llaman a estas funciones o repegan sus migraciones, en una base con `main` más esta: 25 suites en verde (895 casos), entre ellas `tienda_club` entera; `tienda_inicio` y `precio_sede` 30 solo cambian
  de orden (ver abajo).
- [x] **`tienda_catalogo`: Felipe eligió «una sola regla» (2026-11-09)** y se hace en `20261109181000` (rama
  `claude/tienda-catalogo-una-sola-regla`, ADR-0408 act. j). Lo que sigue es el porqué. Producción corre una versión más rápida que el repo no tiene. Copia adentro la regla de
  «lo nuevo» y la de «lo más vendido» en vez de pedírselas a `fn_tienda_lo_nuevo` y `fn_tienda_mas_vendidos`, y por eso pone en rojo
  `pruebas:tienda-club` (N3, «no hay una segunda copia») y tres pruebas que vuelven a pegar migraciones viejas del catálogo. Caminos:
  reescribirla para que la regla viva en un solo lugar sin perder la velocidad (hay que pegarla y medirla), o subirla tal cual y aceptar la
  copia. Mientras tanto, una migración que la recree desde el repo la devolvería a la versión lenta.
- [ ] **Corregir pago con la caja cerrada:** la base ya deja que un líder corrija lo que no es efectivo, pero la pantalla
  (`lib/corregir-pago-reglas.ts`) todavía dice que no se puede. Decidir si la pantalla lo ofrece (dinero: lo decide Felipe).
- [ ] **Lo que sigue solo en producción** y tiene que llegar por su propia rama:
  - tickets compartidos de Vender (rama local `claude/tickets-compartidos-paso-2`, ADR-0511);
  - verificación de pagos de la tienda web (rama local `claude/module-audit-review-1c0741`);
  - `cerrar_produccion_con_motivo` sin `select … into` (rama `claude/costo-atipico-motivo`, sin fusionar; hace lo mismo que la de `main`);
  - `fn_analisis_pedido_en_camino`, que `main` ya no tiene.

  Mientras no lleguen, la revisión diaria sigue en rojo.
- [ ] No se sabe de qué sesión salieron estas funciones. Si alguien las tiene en otra máquina, que compare con esta migración antes de
  subir la suya.
- [ ] `tienda_inicio` (11 casos, igual con `main` sola) y `precio_sede` (caso 30) fallan en una base local armada con la collation
  `C.UTF-8` y pasan en el CI: dan los mismos valores en otro orden. En `C.UTF-8` la «T» mayúscula va antes que la «s» («Trujillo» antes
  que «sin tienda»). No es de este PR; una base local con la collation del CI no lo tendría.
