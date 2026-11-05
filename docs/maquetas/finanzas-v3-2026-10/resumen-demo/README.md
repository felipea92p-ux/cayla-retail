# Demo · Finanzas ▸ Resumen con «Inversión en mercadería»

Maqueta tocable (no es código del ERP) de cómo se vería el Resumen con lo que Felipe eligió del spike `../resumen-campana/` el 2026-10-26:

1. **Tres respuestas arriba** (A): ¿cuánto tienes?, ¿cuánto debes pagar pronto?, ¿cuánto te deja este mes?, con «Seguro al N %» debajo.
2. **Nombre:** «Inversión en mercadería» (no es un gasto: no entra a «Te deja»; sale de la caja cuando se paga y pasa a costo cuando se vende).
3. **«Todo junto»:** las opciones de cuándo comprar y la línea de caja se ven juntas; la mejor mezcla viene preseleccionada.
4. **Ajustes:** el ícono «Qué se ve», debajo del selector de mes y solo en el Resumen. Un interruptor general, uno por campaña, y dos para la caja (contar la inversión, contar el IGV).
5. **Todo el ancho de la pantalla** (ADR-0462): cuadrícula de 12 columnas, sin la columna de 64 rem. Verificada a 375, 1440 y 1920 px, en claro y oscuro.

Cómo abrirla: `python3 -m http.server --directory docs/maquetas` y `/finanzas-v3-2026-10/resumen-demo/`. Todas las cifras son de ejemplo (hoy = 26 oct).

## Lo que esta demo no resuelve (para la construcción real)

- Para usar todo el ancho hay que sacar `/finanzas` de `CON_TOPE_DE_ANCHO` (`components/AppShell.tsx`) y de `CON_TOPE_HOY` (`lib/ancho-completo.test.ts`): afecta a los seis submódulos de Finanzas.
- La línea de caja con dos series (con y sin inversión) y las rayas de pago necesitan una segunda referencia en `<Linea>` → pasa por `/unificar`.
- El interruptor general vive en la base (Configuración ▸ Finanzas); el del plan, en el Plan de campaña: el Resumen solo lee, y no ofrece nada hasta que la base confirme que existe.
- «Lo que dice la historia» es un rango con una sola campaña anterior: el sistema acerca cada categoría al promedio; no promete exactitud.

## Sin huecos (2026-10-26, segunda vuelta)

- «Tu caja» y «Hoy te toca» se estiran a la misma altura: el gráfico crece, no queda aire debajo.
- Dentro de la campaña, la línea de caja se estira a la altura de las opciones.
- Las cuatro tarjetas de abajo van en columnas compactas (`column-width: 520px`): en pantalla ancha se acomodan en 2 o 3 columnas y en pantalla angosta pasan a una sola, siempre pegadas. Diferencia entre columnas medida: 23 px a 1440 y 34 px a 1920.
