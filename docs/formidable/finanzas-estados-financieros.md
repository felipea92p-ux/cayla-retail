# Formidable · Finanzas ▸ Estados financieros (ADR-0585)

**Pasada por lectura de código, 2026-10-31** (rama `claude/dazzling-gauss-34te52`). El contenedor de la sesión no tenía Supabase: no hubo
navegador con sesión, ni prueba ciega, ni medición de oficio visual. Todo lo de abajo es **Opinión** (leído del código) salvo lo marcado.
Las cuatro pantallas siguen la maqueta aprobada por Felipe (`docs/maquetas/finanzas-eeff-2026-10/`).

## Leyes (provisional, sin ciega)

| Ley | Nota | Por qué |
|---|---|---|
| 1 · sin manual | 8 | Cada pantalla abre con su pregunta y su respuesta en grande («¿Ganamos? Sí, ganaste S/ X»). |
| 2 · una pregunta, una respuesta | 8 | Una pregunta por pantalla; lo formal va plegado al pie. |
| 3 · simplicidad profunda | 8 | Ganancia, plata, valor y lo tuyo se traducen a una cascada o una balanza, sin cuentas a la vista. |
| 4 · lenguaje de tienda | 7 | «Lo que tiene», «lo que debe», «lo tuyo». Lo formal plegado conserva la palabra del contador («Resultados acumulados»), a propósito. |
| 5 · contenido primero | 7 | La línea de lo tuyo arranca en 0: un cambio de S/ 9,000 sobre S/ 150,000 puede verse plano (cambio 1). |
| 6 · lo difícil a un toque | 8 | Cada tramo se toca y abre sus partes; «Qué te recomiendo» lleva a donde se hace. |
| 7 · perdonar | 10 | Solo lee; descargar no cambia nada. |
| 8 · quitar | 8 | Se fueron las cinco tarjetas de lo tuyo, las cuentas en pantalla, la pantalla de Presupuesto y cuatro «Descargar Excel». |
| 9 · de punta a punta | 6 | Bajo 1280 px, «Qué te recomiendo» cae al final de una página larga (cambio 2). Una terminal ve dos tarjetas que llevan a una pared (cambio 3). |

**Oficio visual: sin medir** (falta el navegador a 1024, 1440, 1920 y 375 px, claro y oscuro: `tema:auditar` y `/multi-view-responsive`).

## Los 3 cambios propuestos (esperan el OK de Felipe)

1. **La línea de lo tuyo empieza cerca del mes más bajo**, con sus montos en el eje, para que el cambio de cada mes se vea. Hoy arranca en
   0 y una variación chica se ve plana. Pieza: `<Linea minY>`, en `PatrimonioPanel.tsx`.
2. **Bajo 1280 px, «Qué te recomiendo» sube justo bajo la respuesta.** Hoy, sin la columna al costado, queda al final, después de la
   cascada, las sedes y lo formal. Cambio de orden en las cuatro páginas, sin tocar reglas.
3. **Una terminal con el módulo ve «¿Dónde está la plata?» y «¿Lo tuyo creció?» apagadas, con «Es de CAYLA entera»**, en vez de entrar a
   la pantalla «solo del líder». Depende de la respuesta pendiente de Felipe (¿una terminal ve todo?).
