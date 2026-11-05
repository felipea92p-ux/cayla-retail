## Las 36 de Finanzas, tanda 2: lo que queda (2026-11-05)

- [ ] Pegar en producción `20261105224000` y `20261105231000`, con el OK de Felipe, antes de fusionar: «Guardar» de la tarifa llama a `guardar_banco_de_maquina` si cambia el banco.
- [ ] Felipe: decir en Configuración ▸ Dinero a qué banco deposita cada máquina, y cargar la tarifa de la que no la tiene. Sin tarifa, el depósito solo pregunta si la comisión es casi cero.
- [ ] Felipe: revisar contra el extracto los dos abonos del 31-oct.
- [ ] «Hoy te toca» no se volvió una lista idéntica al cajón: la caja bajo el mínimo, una tienda que pierde, lo fuera de lo normal, las campañas y lo sin cuenta siguen siendo lectura del Resumen, porque salen de `fn_resumen_finanzas` (2,3 s) y no pueden ir en cada navegación.
