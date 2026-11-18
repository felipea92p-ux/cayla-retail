# Formidable · Catálogo ▸ Campañas y ofertas ▸ abrir una campaña y la hoja de una oferta (ADR-0677, 6 a 8) · 2026-11-18

Rama `claude/campanas-abrir-campana`, servidor local contra la base propia de la rama (Tienda Lima, datos inventados). Escritorio primero (Mac mini
con mouse); el celular se adapta. Alcance: el panel de la campaña abierta (carteles de sus ofertas) y la hoja de una oferta con «En caja». Costo:
**un solo agente** (la prueba ciega); sin revisor ni escéptico, así que las notas son provisionales.

## Medido

- `/milimetro auditar` (1440 claro y oscuro, 375, foco): 0 graves, 0 medias, 2 leves
  (`docs/milimetro/auditorias/2026-11-18-campanas-abrir-campana.md`).
- Oficio (`medir-oficio.js` a 1440): 0 blancos bajo el mínimo de WCAG, 0 contrastes que fallen, 0 rojos; lo que marca es del marco o de la pantalla de
  detrás de la hoja.
- `/focus`: la hoja tiene su guía («Falta: …» en el pie, que lleva al campo).

## Observado — prueba ciega (Sonnet, navegador local, sin el repo)

Tres tareas en palabras de la dueña: un «lleva 3 y paga 2» solo en Tienda Lima, diciendo antes cuánto paga y ahorra el cliente, guardado sin
empezar; cambiar un −20 % a −25 %; y quitar un −20 %.

| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «Campañas y ofertas: a la izquierda descuentos y campañas, a la derecha Black Friday con sus ofertas en tarjetas; puedo crear, editar o quitar ofertas» | sí |
| Tarea a | Terminada en 4 toques. «En caja se llena apenas elijo 3 x 2»: leyó «Paga S/ 239.80 · Ahorra S/ 69.90» sin ayuda | sí |
| Tarea b | Terminada en 3 toques (el cartel, «+», «Guardar cambios») | sí |
| Tarea c | Terminada, pero el primer «Retirar» «no pareció hacer nada»: no vio que se volvió «Sí, retirar · No, dejarla» | a medias |
| Dudas | el cartel nuevo dice «3 x 2 · Toda la campaña · Borrador» y nada de Lima; dos «−20 %» son idénticos; el «choque» del pie parece bloquear y no bloquea el borrador; no sabe cuál es el botón final | — |
| Palabras no entendidas | «choque», «Para activarla», «Se arma el 3 x 2», «Más opciones», «Toda la campaña» frente a «Toda la compra» | no |
| Distrae | el aviso de arriba («2 prendas tienen dos ofertas»), la lista larga de campañas guardadas, «37 categorías sin prendas a la venta» | — |

Colaboradora real: **sin probar**.

## Notas (provisionales, sin escéptico)

| Ley | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 (tope sin colaboradora real) | las tres tareas terminadas, en 3 y 4 toques |
| 2 Una pregunta, una respuesta | 7 | «no se sabe cuál es el botón final»: borrador, activar y guardar cambios cambian según el caso |
| 3 Simplicidad profunda | 7 | el cartel no dice en qué tiendas rige: un «3 x 2 solo Lima» y dos «−20 %» se ven iguales |
| 4 Lenguaje de tienda | 7 | «Para activarla: Resolver el choque con …» se lee como un candado |
| 5 Contenido primero | 9 | «En caja» respondió «cuánto paga» sin que lo buscara |
| 6 Lo difícil, a un toque | 8 | tocar el cartel abre la oferta; el historial, en «Revisa» |
| 7 Perdonar antes que preguntar | 7 | la confirmación de «Retirar» en el mismo lugar no se vio |
| 8 Quitar antes de agregar | 7 | el aviso de arriba y «37 categorías sin prendas» distraen (piezas de antes) |
| 9 De punta a punta | 8 | 375 px sin desborde; errores claros («Esa oferta ya se retiró»); una oferta retirada en otra pestaña no cierra la hoja |
| **Total leyes** | **7,6** | |
| Oficio visual | 9 | medidores de `/milimetro` y `medir-oficio.js` |

## Los 3 cambios de mayor impacto (hechos el 2026-11-18 con el OK de Felipe: «Sí, los cuatro»)

1. **El cartel dice dónde y cuándo rige si no es lo de la campaña** (ley 3). Antes: «3 x 2 · Toda la campaña · Borrador». Después: «3 x 2 · Toda la
   campaña · Tienda Lima · Borrador», y las fechas o los días si no son los de la campaña («del 25 nov», «mar y jue»), para que dos «−20 %» se
   distingan. Dónde: `cartelesDeCampana` (`lib/campana-panel-reglas.ts`), con su prueba. Se verifica repitiendo la ciega: «confirmé desde la lista».
2. **El pie dice que el borrador se puede guardar aunque choque** (leyes 2 y 4). Antes: «Para activarla: Resolver el choque con …». Después:
   «Puedes guardarla como borrador. Para activarla, resuelve: …». Dónde: `pie()` de `OfertasHoja.tsx` (el `rotulo` de `FaltanDelPaso`). Se verifica con
   la ciega: no duda en guardar.
3. **«Retirar» pregunta a la vista** (leyes 7 y 9). Antes: el botón se vuelve «Sí, retirar · No, dejarla» en el mismo lugar y no se nota.
   Después: la fila del pie cambia entera a «¿Retirar «−20 %»? Deja de bajar el precio ya.» con sus dos botones, sobre la línea de lo que falta.
   Dónde: `pie()` de `OfertasHoja.tsx`. Se verifica con la ciega: retira al primer intento.

**Lo que sobra (ley 8):** el aviso «2 prendas tienen dos ofertas» y «37 categorías sin prendas a la venta» son piezas de antes (ADR-0655): quedan
como propuesta aparte. **Lo que Felipe no pidió y importa más:** tres clics en el mismo instante crean tres borradores iguales (chaos g2
sintético; una persona no llega). Se arregla con `unSoloEnvio`, ya hecho para esto.

## Después de los cambios (2026-11-18, commit `af25c2438`)

Hechos los tres y el guardado único del caos. Prueba ciega repetida (Sonnet, sin contexto, otras tres tareas):

| Medida | Antes | Después |
|---|---|---|
| ¿Sabe desde la lista dónde rige una oferta? | no («nada indica que sea solo en Lima») | sí: «la tarjeta dice "2 x 1 · Toda la campaña · Solo Tienda Trujillo"» |
| ¿Retira al primer intento? | no («no pareció hacer nada») | sí, en 3 toques: «aparece la pregunta "¿Retirar la oferta «2 x 1»?"» |
| ¿Cree que el choque no deja guardar el borrador? | sí | no lo nombró; dudó un momento por «Falta: Elegir en qué tiendas rige», que sí es obligatorio |

Lo que dejó, para después (backlog): un cartel que rige en **todas** las tiendas no lo dice (solo «Solo …» cuando es una), y «Toda la campaña» se
lee como fechas o como prendas; «Retirar» le suena a pausar (borra la oferta de verdad); el «No se puede deshacer» rojo lo notó recién al
confirmar. Notas sin cambiar hasta un escéptico: leyes 3 y 7 suben a 8 (provisional), **total 7,8**.

