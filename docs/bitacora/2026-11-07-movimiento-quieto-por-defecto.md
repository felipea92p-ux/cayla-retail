# 2026-11-07 · Las animaciones arrancan apagadas (ADR-0625)

- **Qué:** botón «Animaciones» junto al modo oscuro, del aparato; el ERP arranca quieto (`data-movimiento`), y solo las señales de espera (hilo de «Guardando…», loader, campo que consulta, buscador que busca) siguen moviéndose. Si el aparato pide menos movimiento, gana siempre.
- **Cómo:** una regla de `app/estilos/movimiento.css` deja animaciones y transiciones en 0,01 ms; los 80 lugares que animaban desde JavaScript preguntan `prefiereQuieto()`/`useQuieto()`, y `lib/movimiento-reglas.test.ts` no deja volver a preguntar `matchMedia` suelto.
- **Verificado:** en el ERP local con sesión: arranca quieto, la señal sigue en 1,1 s infinito, el botón enciende y apaga, se recuerda al recargar y Mi perfil abre y cierra quieto; a 375 px el botón cabe sin empujar nada.
