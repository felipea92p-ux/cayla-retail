# Rendimiento con meta por persona: spike interactivo (2026-09-29)

`rendimiento-meta.html` es autocontenido: se abre en el navegador (el isotipo va al lado, `cayla-isotipo.png`).
**Todas las cifras y nombres son inventados.** No es una implementación: no toca la web ni la base. Extiende
[`../rendimiento-spike-2026-09/`](../rendimiento-spike-2026-09/) (ADR-0219) con lo que Felipe decidió el 2026-09-29, y se apoya en
[`../inicio-bloques-por-rol-2026-09/`](../inicio-bloques-por-rol-2026-09/) para el Inicio de la integrante.

## Las 8 decisiones de Felipe (2026-09-29) y dónde se ven

| # | Decisión | Dónde se ve en el spike |
|---|---|---|
| 1 | **La meta de la sede va primero.** La carga la líder en Configuración › Metas; el sistema solo la sugiere cuando haya 4 semanas de ventas | Tarjeta «Meta de la sede»; con «Sin datos» dice «Sin meta» y lleva a Configuración, sin inventar nada |
| 2 | La fórmula con productos y ventas queda para una **fase 2**: sugiere la meta de la SEDE, nunca la de una persona | Nota en hueso al final |
| 3 | **Reparto por horas programadas** (turnos de Dynamic) | Columna «Meta» («por horas»); AQP no tiene turnos y cae a «partes iguales» |
| 4 | **Mensual:** se fija por mes y se calcula cada día | Píldoras Hoy · Semana · Mes; el modal cambia la «meta del mes» |
| 5 | Editan **la líder de la sede y el Admin**, con motivo y con historial que no se borra | Botón «Meta» por fila, ventana con motivo, «Cambios de meta». Como Líder, la meta de la encargada sale bloqueada |
| 6 | Cuenta con IGV, sin anuladas; devoluciones y cambios no restan; el apartado cuenta el día que se entrega, a quien lo apartó | Nota «Cómo se lee» |
| 7 | La integrante ve **solo lo suyo**; la meta es para acompañar, no para pagar ni evaluar | «Ver como · Integrante»: «Tu meta de hoy», «Tu mes» y «Tus ventas contra tu meta» con las mismas pestañas **Semana | Mes** (acumulado o por día) que la líder, pero solo con sus datos, y la nota |
| 8 | Rendimiento abre en **Hoy**: meta y avance de la sede, cómo va cada una, semana en barras y rankings del mes al final | Orden de la pantalla |

## Controles de la barra oscura (solo del demo)

| Control | Opciones |
|---|---|
| Ver como | Líder de sede · Admin · Integrante (Inicio) |
| Datos | **De prueba** · **Sin datos (como hoy)**: sin meta en ninguna tienda y con una sola venta, que es lo que hay en producción |
| Momento del día | 9:30 a. m. (nadie vendió aún; los turnos dicen «Programada») · 5:40 p. m. |
| Decisiones | Con notas (círculos numerados 1 a 8) · Limpio |
| Deshacer los cambios de meta | Vuelve al estado inicial de la demo |

## Cómo probarlo

- **Como Líder:** cambia la meta de una persona con «Meta». Sin motivo no deja guardar; al guardar sale «Ajustada», el
  «Asignado a las 5» se recalcula y el cambio queda en «Cambios de meta». La meta de Chiara (la encargada) está bloqueada.
- **Como Admin:** todas se pueden cambiar. «Todas» agrupa por tienda; AQP no tiene turnos y Lima no tiene personal.
- **Sin datos:** el mismo panel como está hoy en producción. Nada se dibuja como un cero mudo; dice qué falta y qué hacer.
- **«Ventas contra la meta»:** pestañas **Semana | Mes**. La semana son 7 barras con una marca por la meta de cada día. El mes
  se ve **Acumulado** (ventas acumuladas contra la meta acumulada: ¿llego o no llego?) o **Por día** (30 barras). Abre en Semana
  desde Hoy y Semana, y en Mes desde Mes. Pasa el mouse por una barra o abre «Ver como tabla».
- **La pantalla no salta:** al cambiar Hoy · Semana · Mes, las pestañas del gráfico, el orden de la tabla o guardar una meta, la posición
  del desplazamiento y el foco se conservan (solo cambiar de «Ver como» empieza arriba). Corregido el 2026-09-29 a pedido de Felipe.
- **Tamaño del gráfico:** mide el ancho real de su caja y tiene altura fija (200 px en computadora, 176 en celular), así que en una
  pantalla grande no crece: las barras siguen delgadas y el texto no se agranda (corregido el 2026-09-29 a pedido de Felipe).
- **Achica la ventana** o mira el marco de 375 px: cada persona pasa de fila de tabla a tarjeta.

## Lo que el spike propone y todavía no está decidido

- **Reparto:** la meta de cada persona sale de la meta de la sede × su parte de las horas programadas. Si la líder cambia una,
  la suma puede quedar distinta de la meta de la sede; entonces la pantalla dice «faltan S/ X por asignar» o «se pasa por S/ X».
- **«Ritmo esperado»:** la marca vertical de la barra de hoy es cuánto de su turno ya pasó. Las palabras son «Adelante»,
  «En ritmo» y «Por debajo», no un semáforo rojo. **Está por confirmar** si se muestra o se deja solo el porcentaje.
- **Tope al cambiar:** una meta personal no puede pasar de la meta de la sede (guarda contra un error de tipeo).

## Lo que falta antes de construir

0. **El mes por día de una persona no existe todavía:** el gráfico mensual de la integrante necesita una lectura de ventas por persona
   y por día (en el spike son datos inventados que suman exacto su mes). Es la misma función nueva del punto 1.

1. **Corregir «Tus ventas» del Inicio.** Hoy `fn_ventas_del_dia` le devuelve a una colaboradora todas las ventas de su tienda
   (verificado en producción el 2026-09-29). Va una función nueva con solo lo suyo; no se toca la actual (Caja y Vender la usan).
2. **Meta de la sede en producción:** ninguna tienda la tiene cargada (`ubicacion_metas_dia` vacía). Sin ella no hay qué repartir.
3. **Leer los turnos de Dynamic por una función de retail** (como `fn_asesoras_de_turno`), para no atarse a la forma de una tabla
   de Dynamic. Lima no tiene personal cargado (D-62).
4. **Reabrir por escrito D-64, D-125 y D-68** en el acta y en el ADR: las colaboradoras ahora ven su meta y sus cifras.
5. **Una tabla para las metas ajustadas y otra para su historial**, sin edición ni borrado del historial (mismo patrón que
   `venta_reasignaciones` de ADR-0219), y el candado de quién edita en la base, no solo en la pantalla.

## Cómo se verificó

Abierto en el navegador integrado: los 3 roles, «De prueba» y «Sin datos», las dos horas, Hoy · Semana · Mes, las tres
tiendas y «Todas», el cambio de una meta (con su validación) y el Inicio de la integrante; sin errores en consola. No se
probó en un celular real.
