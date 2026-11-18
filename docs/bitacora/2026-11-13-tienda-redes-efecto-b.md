# 2026-11-13 · Redes de la tienda: la A con el efecto de la B

- **Qué:** Felipe cambió su elección de la maqueta (`docs/maquetas/tienda-redes-2026-11/`): la A en vez de la C. Las redes quedan solo en el pie de todas las páginas y al final del menú del celular; salen de «¡Listo, lo separaste!». Al pasar el puntero, el efecto de la banda B: solo el ícono toma el color de su red y crece un poco, sin que la casilla se rellene ni cambie su borde.
- **Dónde:** `apps/tienda/app/estilos/redes.css`, `components/Redes.tsx`, `lib/redes.ts` y la página de separado, que vuelve a quedar como antes del PR #1797.
- **Verificado:** en el navegador, en el pie y en el menú del celular, a 1280 y 375 px: el ícono cambia de color y crece, y la casilla no cambia.
