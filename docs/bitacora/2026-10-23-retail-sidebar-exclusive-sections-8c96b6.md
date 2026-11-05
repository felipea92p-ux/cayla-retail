## 2026-10-23 (Lateral del ERP: una sola sección desplegada a la vez)
Qué hice: al abrir un grupo del menú izquierdo (Catálogo, Compras…) se cierran los demás grupos de su mismo nivel; un subgrupo (Abastecimiento dentro de Producción) cierra a sus hermanos pero no a su padre. La regla es `hermanosDe` en `lib/menu.ts`, con prueba en `lib/menu.test.ts`.
Por qué así: antes solo se cerraba el grupo anterior al cambiar de ruta, no al abrir uno a mano, y el lateral volvía a quedar «todo expandido». La regla va en `lib/` y no dentro de `AppShell` para probarla sin navegador.
Felipe se lleva: abrir Compras con Catálogo abierto cierra Catálogo. Sin ver en navegador todavía (el worktree no tenía `.env.local`); pendiente mirarlo en escritorio y a 375 px.
