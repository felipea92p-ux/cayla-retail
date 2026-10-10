# 2026-10-09 · Nuevo producto en el celular: la guía te deja donde hay que llenar

- **Qué:** a 375 px, (1) la barra de puntos baja de 104 a ~58 px (sin «Estás aquí / Sigue», puntos más chicos) y la guía mide lo que
  tapa arriba y abajo en vivo: ningún «Sigue aquí» (categorías, «Unidades de hoy») queda bajo una barra; (2) tras marca y proveedor
  el cursor va al nombre; (3) tocar un color de abajo ya no sube al inicio de la carta, y su nombre se lee pegado sobre la barra de
  abajo; (4) «¿Alguna cuesta distinto?» ya no ensancha la página.
- **Por qué:** recorrido de Felipe en el teléfono. Causas: `ARRIBA = 96` fijo contra 160 px tapados; un combo con foco contaba como
  «escribiendo»; la luz que volvía a Colores al tocar otro círculo llamaba a `asegurarVisible`, y la carta es más alta que la pantalla.
- **Verificado:** navegador a 375 px (claro y oscuro) recorriendo los 4 pasos, midiendo con `getBoundingClientRect`; el salto de colores
  reproducido antes (1480 → 593 px) y después (sin moverse); 1280 px sin cambios. `vitest` 387 archivos en verde. ADR-0260 act. 2026-10-09.
