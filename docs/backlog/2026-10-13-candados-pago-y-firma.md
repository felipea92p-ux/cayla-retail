## Candados del anticipo y de la hora declarada (2026-10-13, auditoría de 20 puntos, punto 17)
- [x] **Migración `20261013155000`** y su prueba `pnpm pruebas:candados-pago-y-firma` (en la lista del CI).
- [ ] **POR PEGAR en producción, con el OK de Felipe:** una sola parte, re-pegable; la última línea dice «QUEDÓ BIEN». Si `fn_actor_persona_id` cambió en producción desde el 13-oct, el reemplazo anclado aborta sin tocar nada: regenerarlo desde la definición viva.
- [x] **Si se encola sin conexión una función nueva que firma con responsable**, `lib/cola-hora-declarada.test.ts` falla hasta que se sume a la lista de `fn_actor_persona_id` (hoy: venta, recepciones y altas).
- [ ] **Comprobar en producción que `request.path` llega** (después de pegar): el paso está en el encabezado de la migración. Si no llega, el candado no hace nada (vuelve el comportamiento de antes, sin romper).
- [ ] **Reembolso de devoluciones** (la tercera puerta del punto 17: monto negativo o sin método): queda para después de fusionar el PR #1004 (ADR-0390), que cambia `aprobar_devolucion`. Si se hace, que sea un CHECK en la tabla `devoluciones` (monto ≥ 0 y método obligatorio si hay monto), sin contradecir «reembolso libre, con aviso».
- [ ] **Diccionario:** refrescar el volcado cuando esté en producción (`docs/datos/generado/COMO-REFRESCAR.md`).
