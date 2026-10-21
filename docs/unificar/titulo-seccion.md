# Títulos de sección — tres piezas (ADR-0358, ronda 7)

**Decidido:** 2026-10-13, Felipe, **tocándolos** (página de elegir con demos vivas; fuentes en [rondas/6-8](rondas/6-8/README.md)).
**Elegidas:** P1 en las tres preguntas. **Piezas:** `<TituloSeccion>`, `<TituloGrupo>` y `<SeparadorDia>` (`components/ui/TituloSeccion.tsx`),
CSS en `app/estilos/titulos.css`.

## Qué se comparó

De 46 formas del censo quedaron tres familias y los separadores de día (las serif de 24 a 32 px eran títulos de hoja, fichas o vacíos:
otras familias): **serif en 8 tamaños** (18 a 24 px, peso 500 o 600: Configuración, Caja, Frescura, Análisis, Colaboradores), **versalitas
en 6 variantes** (10,5 a 12 px, taupe o tinta: Comercial, Rendimiento, Análisis, Historial), **sans seminegrita en 5** (13 a 15 px: Cambios,
Devoluciones, Nuevo producto) y el kit de Finanzas (`fin-etq`, ADR-0195).

![bloque](capturas/titulo-seccion.propuesta.jpg) ![grupo](capturas/titulo-seccion.grupo.propuesta.jpg) ![día](capturas/titulo-seccion.dia.propuesta.jpg)

## Lo que eligió

1. **El título de un bloque · `<TituloSeccion>`.** Un solo tamaño —serif de 21 px, peso normal— sobre la tarjeta o dentro de ella; a su
   derecha, en la misma línea, lo que resume el bloque (`dato`, en taupe de 13 px: «**S/ 1,987.50** · 14 ventas») o su acción (`accion`:
   un `<EnlaceVer>`, «VER LAS 9 →», en versalitas rojas porque así quedó el enlace suelto en la ronda 8).
2. **El título de un grupo dentro de una hoja · `<TituloGrupo>`.** VERSALITAS de 11 px en tinta al 62 % con su cuenta al lado
   («Prendas · 2 prendas») y una raya sand que corre hasta el borde.
3. **El separador de día · `<SeparadorDia>`.** VERSALITAS con el total del día a la derecha («**S/ 514.50** · 7 ventas»); al bajar, el día se
   queda pegado arriba sobre un velo de papel mientras pasan sus filas (`--separador-tope` si lo que se desplaza tiene algo fijo arriba).
   «Hoy» va en tinta con un punto rojo.

La cabecera de una pantalla no es esto: es la de su módulo (ADR-0220).

## El movimiento de las piezas

El título de bloque entra con su tarjeta, sin movimiento propio (un título no se mueve solo). La raya de un grupo se dibuja de izquierda a
derecha una vez (520 ms), escalonada entre grupos con `retraso` (la demo usó 90 ms entre cada uno), siguiendo la cascada del modal. El
separador de día no anima: lo pega el scroll. Sin bucle; con «reducir movimiento», la raya aparece entera.

## Lo que queda distinto a propósito

Las guías interactivas (ADR-0389), la página pública del club y una pantalla de error. El kit de Finanzas usa clases propias (`fin-etq`,
`fin-h-*`) que la firma no toma: queda como está (ADR-0195).

## Deuda al decidir

83 archivos dibujan un título de sección a mano (`node apps/web/unificar/deuda.mjs titulo-seccion`): serif de 18 a 24 px, versalitas o
sans seminegrita en un `h2`/`h3`/`h4`. Se migran módulo por módulo; cada uno se decide por lo que es: título de un bloque (`<TituloSeccion>`),
de un grupo dentro de una hoja (`<TituloGrupo>`) o un día de una lista (`<SeparadorDia>`).

## Migración (2026-10-13)

**Migrada el 2026-10-13: deuda 83 → 0.** Los conteos que iban pegados al título pasaron a `dato` (a la derecha) en los bloques y a
`cuenta` (al lado) en los grupos de una hoja. Actividad usa `<SeparadorDia>`. Eximidos con su `unificar-fijo`: el nombre de una prenda o
de una orden (es un dato), el título del paso que recibe el foco en `FlujoGuiado`, la cabeza numerada de un paso del cobro y los títulos
de hoja (`Dialog.Title`).

## Ronda 9 (2026-10-13): el número de un título

Felipe eligió **P2, al lado del nombre, en su globito**, tocando la demo. Cuántos hay en un bloque o un grupo va pegado al nombre, en la
píldora chica de las pestañas («PRENDAS DEL ENVÍO 110»): `cuenta` en `<TituloSeccion>` y `<TituloGrupo>` (clase `titulo-cuenta`, con las
medidas de `pestana-cayla__cuenta`; entra subiendo con su título, una vez). A la derecha (`dato`) queda solo lo que resume —dinero,
unidades, «3 de 5 colores con foto»— y la acción. `TituloGrupo` suma `nota` para una aclaración que no es un número («no se edita ni se
borra»). Migrados: Pendientes y Resueltos (Pedidos no atendidos), Pedidos entre tiendas y los grupos de Apartados, Para decidir
(Producción), las categorías de Frescura, No cargadas y la revisión de Cuadrar, Lo que va en la caja (Traslados), las columnas de Órdenes y
los grupos de Cambios; y el título de cada grupo de Atributos (● NEUTRO 9). Una firma nueva atrapa un conteo puesto como `dato`.

## El censo de después (2026-10-13): diez archivos que la firma no veía

El censo de después, rastreado hasta el código, mostró títulos dibujados a mano que la firma dejaba pasar: la de «sans seminegrita» pedía
un límite de palabra (`\b`) después del tamaño, y entre «]» de `text-[15px]` y un espacio no hay límite de palabra; así se escapaba todo
tamaño entre corchetes. Corregida (`(?![\w-])`), aparecieron 10 archivos y se migraron el mismo día: los grupos del cajón de Movimientos
(«Ruta», «Qué pasó», «Prendas»…), «¿En qué estado vuelve cada prenda?» de Devoluciones y los bloques de las hojas del plan de compra son
`<TituloGrupo>`; «Iniciar un cambio», «Iniciar una devolución» y «Tallas que no calzan» (con «últimos 90 días» como su dato) son
`<TituloSeccion>`; los días del historial de cierres de Caja son `<SeparadorDia>`. Quedan exentos, con su motivo en la línea: el nombre de
cada asunto de Producción (un dato de la lista) y los títulos de los pasos de Nuevo producto (su diseño aprobado, ADR-0260 y ADR-0284).
Verificado en escritorio y, en Cambios, Devoluciones y Apartados, a 375 px.

## Actualización 2026-10-14: la nota del grupo se lee

La auditoría del modo oscuro (`tema:auditar`) midió la `nota` de `<TituloGrupo>` («· lo que ya salió hacia las sedes», «· el papel que ya
llegó») en 2.85:1 en claro y 3.93:1 en oscuro sobre papel: estaba al 45 % de tinta y el mínimo para texto es 4.5:1. En claro no pasa por
debajo del 61 %, que ya es el 62 % del título, así que **la nota toma el tono de su título** (4.79:1 en claro, 6.13:1 en oscuro): sin
cambiar su tamaño, su lugar ni lo que dice. La separan del título la minúscula, el peso (500 contra 600) y el punto. El piso de `tema.css`
para el texto tenue no la alcanzaba en oscuro porque solo cubre las clases de Tailwind (`text-tinta/45`), no un `color-mix` escrito en un
CSS; ahora `lib/tema-tokens.test.ts` mide cada texto de `titulos.css` hecho de tinta, sobre papel y crema, en los dos temas.
