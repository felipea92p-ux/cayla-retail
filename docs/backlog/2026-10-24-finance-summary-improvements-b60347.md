# Backlog · Finanzas ▸ Resumen, piezas nuevas (2026-10-24)

- [ ] `/formidable` del Resumen nuevo (con datos reales): califica con las 9 leyes y propone 3 cambios; espera el OK de Felipe.
- [ ] Escenario de `tema:auditar` para «¿Y de cada S/ 100?» (abre `#fin-cien`): necesita una base local con ventas del mes.
- [ ] `tema/escenarios/registro.mjs` · `finanzas.que-mirar`: apunta a un combo «Qué mirar» que el Resumen ya no tiene; revisarlo o borrarlo.
- [ ] Decidir si los cien cuadros son la pieza de la familia «proporción de cien» en `docs/unificar/` (hoy es local del Resumen).
- [ ] `[pantalla:finanzas-resumen]` #7 Un solo «Te toca»: «Hoy te toca» del Resumen y el cajón de la barra siguen con fuentes distintas.
- [ ] `[pantalla:finanzas-resumen]` #8 Saldo de caja por sede en `fn_flujo_caja_*` (base, de Felipe): hoy, con una sede elegida, la caja separa cobros y salidas pero no el saldo.
- [ ] `[pantalla:finanzas-resumen]` #9 «Descargar el mes» para el contador (opcional) · #10 que el orillo no repita al recorrido (opcional).
- [ ] Limpiar lo que dejó huérfano #1311: clases `fin-pulso-*` de `app/estilos/finanzas.css` y `/finanzas` en `CON_TOPE_DE_ANCHO`.
- [ ] **Inversión en mercadería (2026-10-26):** cuando el Plan entregue la función que lee campañas, pagos y «se ve en el Resumen», cambiar `getInversionMercaderia` (`lib/inversion-mercaderia.ts`) por esa RPC y `useAjustesResumen` por la lectura de la base. Hoy el Resumen no ofrece nada en producción.
- [ ] Alinear el nombre con el Plan («Inversión en mercadería» contra «Compromiso de compra»): lo elige Felipe mirando.
- [ ] Pestañas «Lo que dice la historia» y «Cuánto cuesta» de la demo: pedirlas al Plan en el contrato (estadísticas de campañas pasadas, costo por campaña) antes de construirlas.
- [ ] Sacar `/finanzas` de `CON_TOPE_DE_ANCHO` cuando las otras cinco pantallas se revisen a 1440 y 1920 px (hoy el ancho cambia al pasar del Resumen a otra pantalla de Finanzas).
- [ ] `tema:auditar` y `/formidable` sobre las piezas nuevas del Resumen (tres respuestas, inversión, «Qué se ve»); escenario de tema con `?inversion=ejemplo`.
- [ ] `/chaos`: la hoja «Qué se ve» y «cómo pagarla» no guardan en la base, pero la lectura de lo guardado en el navegador se prueba con `localStorage` roto o vacío.

