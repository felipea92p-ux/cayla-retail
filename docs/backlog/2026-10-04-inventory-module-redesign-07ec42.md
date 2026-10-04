# Inventario por olas (ADR-0328) — rama `claude/inventory-module-redesign-07ec42`

Las 17 actividades aprobadas por Felipe el 2026-10-04, en orden. Cada una es un corte que se ve funcionando y lleva su commit.

## Tramo 1A · Urgente, antes del 15-oct
- [x] 1. Dejar escrito lo decidido: ADR-0328, ADR-0329 (capacidad, rescatado del commit local `ffd2675d4`) e investigación del mix.
- [ ] 2. El alta pregunta «¿colgada o guardada?» sin valor de fábrica (`NuevoProductoForm.tsx:218`).
- [ ] 3. Cuadrar el piso: escanear lo guardado, el resto pasa al piso en un movimiento, fecha de cuadre por sede. Migración: pegar con OK de Felipe.
- [ ] 4. Cierre automático de la carga inicial por sede (TRU 15-oct; AQP y LIM con tope de Felipe); «Reposición» → «Encontré prendas» con motivo.
- [ ] 5. Ventas sin registrar: categoría sugerida desde la descripción; nadie regulariza su propia venta salvo el líder; limpieza de arranque con candidata.

## Tramo 1B · Existencias
- [ ] 6. Capacidad de cada sede (m² × 30) y el número «colgadas de las que caben» con «por cuadrar».
- [ ] 7. Un solo motor del piso (`lib/piso-plan.ts`): «Por colgar» y «se vendió rápido y falta»; reemplaza las cinco reglas.
- [ ] 8. Portada «Buscar + Para hoy».
- [ ] 9. «La tengo en la mano» en Bajar al piso.
- [ ] 10. Dañadas: reportar desde la ficha y «Se arregló».

## Tramo 1C · Lectura comercial
- [ ] 11. Análisis «Se vendió rápido y falta» por categoría × talla × color, con Pedir al Taller / a otra sede.
- [ ] 12. Plan del piso: mix por sede con candado, propuesta investigada, ajuste con motivo, franja y «entra una, sale una».

## Tramo 1D · Control
- [ ] 13. Ajustar con razones de tienda y confirmación del líder en lo grande.
- [ ] 14. Una sola definición de pérdida, pestaña «Pérdidas» y aviso cuando se repite.
- [ ] 15. Conteo I: firma una vez por operación, conteo de arranque, atajo honesto.
- [ ] 16. Conteo II: cruce con ventas sin registrar y talla cruzada al revisar; Ajustar abre «Por prenda»; «Toca contar».
- [ ] 17. Traslados: «Te piden» con número y aviso a las 48 h; «Pedir y apartar» desde Vender; lista de «subidas para enviar».

## Tramo 2 · Después de la ronda 4
- [ ] Ronda 4 de preguntas (Análisis y Frescura) y traslados complejos (diferencias, quién aprueba, pérdida en el camino, el Taller).

## Del equipo, sin código
- [ ] Primera caja real del Taller a TRU (10–20 prendas, alguien que mira sin ayudar).
- [ ] Contar el piso de AQP un día normal.
- [ ] Etiquetar y cargar AQP antes de su cierre de carga.
- [ ] Crear bolsas de papel, cajas y sorpresas como productos.
