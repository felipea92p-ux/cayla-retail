# Inventario por olas (ADR-0328) — rama `claude/inventory-module-redesign-07ec42`

Las 17 actividades aprobadas por Felipe el 2026-10-04, en orden. Cada una es un corte que se ve funcionando y lleva su commit.

## Tramo 1A · Urgente, antes del 15-oct
- [x] 1. Dejar escrito lo decidido: ADR-0328, ADR-0329 (capacidad, rescatado del commit local `ffd2675d4`) e investigación del mix.
- [x] 2. El alta pregunta «¿colgada o guardada?» sin valor de fábrica — PR #783 (fusionado).
- [x] 3. Cuadrar el piso (PR #792, publicado el 2026-10-05, SQL en producción): escanear lo guardado, el resto pasa al piso en un movimiento, fecha de cuadre por sede.
- [x] 4. Cierre automático (PR #785, publicado, SQL en producción) de la carga inicial por sede (TRU 15-oct; AQP y LIM con tope de Felipe); «Reposición» → «Encontré prendas» con motivo.
- [~] 5. Ventas sin registrar (PR #788, en borrador; parte 1 del SQL en producción, parte 2 `20261004204000` SIN pegar; se rehízo sobre #800 con el buscador por la tienda de la venta): categoría sugerida desde la descripción; nadie regulariza su propia venta salvo el líder; limpieza de arranque con candidata.

## Tramo 1B · Existencias
- [x] 6. Capacidad de cada sede (PR #795, publicado; la edición vive en el Plan del piso, actividad 12) (m² × 30) y el número «colgadas de las que caben» con «por cuadrar».
- [x] 7. Un solo motor (PR #787, publicado; falta contar `cerrada_sin_prenda`, contrato con ADR-0334: lo cierra otra sesión) del piso (`lib/piso-plan.ts`): «Por colgar» y «se vendió rápido y falta»; reemplaza las cinco reglas.
- [—] 8. Portada «Buscar + Para hoy»: la hace ADR-0331 (sesión UI/UX, PR #790).
- [x] 9. «La tengo en la mano» (PR #786, publicado) en Bajar al piso.
- [x] 10. Dañadas: reportar desde la ficha y «Se arregló» (PR #796, publicado).

## Tramo 1C · Lectura comercial
- [ ] 11. Análisis «Se vendió rápido y falta» por categoría × talla × color, con Pedir al Taller / a otra sede.
- [ ] 12. Plan del piso: mix por sede con candado, propuesta investigada, ajuste con motivo, franja y «entra una, sale una».

## Tramo 1D · Control
- [—] 13. Ajustar con razones de tienda (sesión «Rediseñar flujo de corrección de cantidad», ADR-0336) y confirmación del líder en lo grande (sesión «Confirmación de correcciones grandes de stock»): repartida, ver ADR-0328.
- [x] 14. Una sola definición (PR #784, publicado) de pérdida, pestaña «Pérdidas» y aviso cuando se repite.
- [x] 15. Conteo I (PR #789, publicado): firma una vez por operación, conteo de arranque, atajo honesto.
- [ ] 16. Conteo II: cruce con ventas sin registrar y talla cruzada al revisar; Ajustar abre «Por prenda»; «Toca contar».
- [x] 17. Traslados (PR #799, publicado): «Te piden» con número y aviso a las 48 h; «Pedir y apartar» desde Vender; lista de «subidas para enviar».

## Actividades nuevas (2026-10-04, tarde)
- [ ] 18. Frescura con estadística (lo típico contraído, va lenta por vendidas contra esperadas, % a tiempo, 28 días).
- [ ] 19. Frescura que luce (tablero, perchero, matriz; Qué renovar esta semana).

## Tramo 2 · Después de la ronda 4
- [ ] Ronda 4 de preguntas (Análisis y Frescura) y traslados complejos (diferencias, quién aprueba, pérdida en el camino, el Taller).

## Después de publicar (2026-10-05)
- [ ] Ver en producción, con la sesión de Felipe abierta y sin guardar nada: Existencias, Cuadrar, Movimientos ▸ Pérdidas, Conteo, Colgar en el piso, Traslados y Vender a 375 px.
- [ ] Refrescar el volcado del diccionario (`pnpm datos:refrescar`: una consulta de solo lectura en el SQL Editor de producción). Hoy `datos:comparar` dice 23 llamadas «sin respaldo» solo porque la foto es del 3-oct: las 28 funciones existen en producción con una sola firma y aceptan lo que la web manda (verificado en vivo el 5-oct).
- [~] Retirar `fn_pedidos_para_apartar` (ya ninguna pantalla la llama): PR en borrador con su SQL sin pegar.
- [ ] Pegar la migración del motor que cuenta `cerrada_sin_prenda` antes de que alguna sede cierre su cola de arranque.

## Del equipo, sin código
- [ ] Primera caja real del Taller a TRU (10–20 prendas, alguien que mira sin ayudar).
- [ ] Contar el piso de AQP un día normal.
- [ ] Etiquetar y cargar AQP antes de su cierre de carga.
- [ ] Crear bolsas de papel, cajas y sorpresas como productos.
