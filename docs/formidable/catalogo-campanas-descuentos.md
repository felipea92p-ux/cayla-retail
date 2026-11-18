# Formidable · Catálogo ▸ Campañas y ofertas ▸ los descuentos (ADR-0677) · 2026-11-18

Rama `claude/ofertas-pending-branch-11c351`, servidor local contra la base propia de la rama (Tienda Lima, datos inventados). Escritorio
primero (Mac mini con mouse); el celular se adapta. Alcance: la lista de descuentos, su panel (agregar, quitar) y la hoja «Nuevo descuento /
Cambiar el %». Costo: **un solo agente** (la prueba ciega); sin revisor ni escéptico, así que las notas son provisionales.

## Medido

- `/milimetro auditar` (siete medidores, 1440 claro y oscuro, 375, foco): 0 graves, 0 medias, 1 leve decidida
  (`docs/milimetro/auditorias/2026-11-18-campanas-descuentos.md`).
- `medir-oficio.js` a 1440: de las piezas nuevas solo salen las versalitas de 11 px («DESCUENTO», que quedan aparte de la regla de 14 px) y dos bordes
  a 2–3 px de su vecino (el título de pila de siempre); 0 blancos bajo el mínimo, 0 contrastes que fallen, 0 rojos.
- `/focus`: la hoja tiene su guía; el % que llega puesto pasó a «sugerido» (commit `e880338c7`).

## Observado — prueba ciega (Sonnet, navegador local, sin el repo)

Tarea en palabras de tienda: «A la Blusa Emma de color negro bájale el precio un 15 % en esta tienda, en todas sus tallas. Después comprueba que quedó.»

| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «Donde se manejan los descuentos; a la izquierda la lista, a la derecha el detalle con sus prendas; sigue elegir el −15 % y agregarle la blusa» | sí |
| Primer intento | Terminó sin retroceder ni pedir ayuda | sí |
| Pasos | 5 toques hasta agregar (abrir el −15 %, la caja, escribir, elegir «Negro»); el mínimo es 4 | sí |
| Dudas | 6: crear uno nuevo o usar el −15 % que ya había; si «Negro» eran todas las tallas; la prenda agregada dice «Negro» y la otra «Beige · L»; qué es «Sale de Rebaja −20 %»; si las campañas de abajo tenían que ver; la caja «no hacía nada» los primeros 2 s | — |
| Palabras no entendidas | «Rebaja −20 %» (lo tomó por otro descuento: es el nombre interno del cajón), «Eres admin. Guardas a tu nombre, sin autorización» (el combo de siempre) | no |
| Errores evitables | 0; tocó la tarjeta de la prenda esperando ver sus tallas y no pasó nada | sí |

Colaboradora real: **sin probar**.

## Notas (provisionales, sin escéptico)

| Ley | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 (tope sin colaboradora real) | la ciega terminó en 5 toques |
| 2 Una pregunta, una respuesta | 8 | dudó entre «Nuevo descuento» y el que ya había; las campañas de abajo distraen poco |
| 3 Simplicidad profunda | 7 | «Negro» sin talla no dice «todas las tallas» |
| 4 Lenguaje de tienda | 7 | el aviso dice «Sale de Rebaja −20 % · Tienda Lima» (el nombre interno del cajón) |
| 5 Contenido primero | 9 | la prenda con su foto y su precio con el % pesa más que el marco |
| 6 Lo difícil, a un toque | 8 | «Más» tiene cambiar, imprimir y desactivar; las tallas de una prenda no están a un toque |
| 7 Perdonar antes que preguntar | 10 | quitar, agregar, cambiar y desactivar llevan «Deshacer»; nada pide confirmar |
| 8 Quitar antes de agregar | 8 | la línea del responsable repite lo que no hace falta leer cada vez |
| 9 De punta a punta | 8 | vacío que dice qué hacer, errores claros, 375 px sin desborde; tras una respuesta perdida la lista queda vieja (chaos #2) |
| **Total leyes** | **8,1** | |
| Oficio visual | 9 | medidores de `/milimetro` y `medir-oficio.js` |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)

1. **La prenda dice si van todas sus tallas** (ley 3). Antes: «Negro». Después: «Negro · todas las tallas» (y «Beige · L» cuando es una sola).
   Dónde: `detalleDePieza` (`apps/web/lib/rebaja-rapida-reglas.ts`), con su prueba. Se verifica repitiendo la ciega: la duda desaparece.
2. **El aviso al agregar habla de %, no del nombre interno** (ley 4). Antes: «Sale de Rebaja −20 % · Tienda Lima». Después: «Antes tenía −20 %»
   (o «Antes estaba en Para liquidar» si venía de una campaña). Dónde: `AgregarAlDescuento.tsx` (el `detalle` del aviso), con la regla en
   `rebaja-rapida-reglas.ts`.
3. **Tocar una prenda del panel muestra sus tallas** (leyes 6 y 9). Antes: el toque no hace nada. Después: la tarjeta abre una línea con sus
   tallas en el descuento (sin salir del panel). Se verifica con la ciega: «comprobé que quedaron todas las tallas».

**Lo que sobra (ley 8):** la frase del responsable («Eres admin. Guardas a tu nombre, sin autorización») a la vista en cada panel; es la pieza de
siempre (`ComboResponsable`), así que va como propuesta transversal, no aquí.
**Lo que Felipe no pidió y importa más:** que un −0,5 % pasa aunque el mensaje dice «de 1 a 70» (chaos #1, toca la función de la base).

## Antes de decir «listo»

- **Concurrencia:** dos líderes a la vez (crear el mismo %, juntar mientras otra apaga, la misma talla a dos %) dejan la base coherente (chaos 2026-11-18).
- **Caída externa:** sin respuesta, el aviso dice que no se puede confirmar si se guardó; nada queda a medias; la lista no se rehace sola (chaos #2).
- **Persona sin contexto:** la ciega pasó; la colaboradora real, sin probar.
