# Finanzas ▸ Resumen · lo que sigue (2026-10-24)

Spikes visuales para decidir **qué agregar y qué quitar** del Resumen de Finanzas **después** de #1311 (el Resumen en El telar, abierto).
Análisis completo (modo rápido, 12 tareas): `docs/pantallas/finanzas-resumen.md`.

- **Cómo verlo:** abrir `index.html` (necesita `base.css` y `base.js` de esta carpeta, copiados de `../resumen/`) o `preview_start maqueta-referentes`
  y entrar a `/finanzas-v3-2026-10/resumen-siguiente/`. Arriba: selector de spike, botón claro/oscuro. Dentro de cada spike, 2–3 formas de dibujarlo.
- **Las cifras son de ejemplo** y son las de la maqueta v3 (octubre al jueves 15, sin IGV): TRU 30,900 · AQP 16,000 · Lima 0 → deja **S/ 3,850**.
  Septiembre al 15 es inventado para poder comparar (deja S/ 1,400). Nada sale de producción.
- **Lo ya construido en #1311 va rayado** (orillo, recorrido de la plata): no se toca.

| Spike | Pregunta que contesta | Variantes | Qué hace con #1311 |
|---|---|---|---|
| 1 · Caja | ¿Puedo pagar lo que viene? | A frase + línea · B hoy/sale/queda · C día por día | Agrega. Lee `fn_flujo_caja_proyeccion` (la de Dinero): `fn_resumen_finanzas` recorta los cobros |
| 2 · Mes pasado | ¿Por qué ese número y no el del mes pasado? | A el puente · B lo que más se movió | Agrega. `estadoAntes` ya se lee, hoy solo para un chip |
| 3 · De cada 100 | ¿Cuánto de lo que vendo me queda? | A cien cuadros · B este mes contra el pasado | Agrega (frase en la respuesta + cuadro a un toque) |
| 4 · Equilibrio | ¿Ya pagué el mes? | A la línea (con simulador de gastos sin registrar) · B el camino | **Reemplaza** «ventas contra la meta» |
| 5 · Número seguro | ¿Puedo fiarme de este número? | A dentro de la respuesta · B dentro de «Hoy te toca» | **Fusiona y quita** la tarjeta de confianza y la lista duplicada |
| Todo junto | cómo queda el Resumen con las piezas recomendadas | — | Caja A, cien A, cambios B, equilibrio B, confianza B |

## Lo que la maqueta simplifica a propósito
- El flujo real trae un **cobro esperado por tienda y día** (meta o promedio), no dos depósitos sueltos; la línea del spike 1-A saldría más inclinada.
- El «equilibrio» mezcla comisiones de tarjeta con lo fijo; es una aproximación para la maqueta, no la regla de `puntoDeEquilibrio`.
- En 375 px, la línea del spike 1-A desliza de lado (variante B y C no): en la app real, el celular usa la B.

No se tocó código de la app, migraciones ni producción.
