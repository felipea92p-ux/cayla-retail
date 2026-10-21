## 🧨 /chaos de Producción (2026-10-14) — rama `claude/chaos-produccion-5c56e1`, ADR-0409

- [x] ~~**Pegar en producción** `20261014214000` y `20261014215000`~~ — hecho el 2026-10-14 con el OK de Felipe: 10 candados validados y
  las seis funciones con su huella.
- [ ] Refrescar el volcado de `docs/datos/generado/` (los 10 candados nuevos) junto con el de ADR-0404 y ADR-0405.
- [x] ~~**Decisión de Felipe:** ¿una orden puede prometer una entrega en el pasado?~~ — no (ADR-0415, `entrega_pasada`).
- [x] ~~**Decisión de Felipe:** ¿se puede cerrar una orden con más prendas buenas que las pedidas?~~ — sí, hasta el doble por talla o 5 más (ADR-0415, `buenas_de_mas`).
- [ ] «Revisar si se guardó» en las pantallas del Taller: `fn_resolver_intento` con las seis operaciones de Producción y `useIntento` en Nueva
  orden, Ingresar insumo, Nueva factura, Pagar y Recibir. Hoy la pantalla ya no miente, pero tras un corte la persona tiene que cerrar y
  buscar en la lista.
- [ ] La frase de corte de red de `traducirError` («No se guardó nada») en todo el ERP: tarea aparte, toca todos los módulos.
- [ ] `producciones_costo_maquila_check` (un costo de maquila negativo, solo por la API: la pantalla lo frena antes) no tiene frase propia
  en `error-escritura.ts`: sumarla cuando se toque esa pantalla.
