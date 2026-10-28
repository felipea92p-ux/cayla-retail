# ADR-0329 — Capacidad del piso: total por m², mix por roles y control por cobertura

**Fecha:** 2026-10-01 (decisiones de Felipe del 2026-09-30, en cinco rondas de preguntas)
**Estado:** **Aceptado el 2026-10-04** (rondas de preguntas del rediseño de Inventario, ADR-0328). Escrito como propuesto el 2026-10-01; Felipe confirmó entonces la unidad (1), el nivel, las temporadas y el alcance (2), los m² y la densidad de arranque (3), las categorías destino (4, solo cuáles), el stand de LIM (8) y que el encargado ajuste (7). El 2026-10-04 respondió lo que quedaba abierto del mix (4), la sugerencia (5) y el mínimo por modelo: ver «Actualización 2026-10-04», que **manda sobre los puntos 4 y 5** de abajo. La cobertura de Little (6) y los indicadores de destino (9) siguen siendo propuesta sin respuesta explícita.
**Número:** escrito como 0295 en un commit local que nunca subió (`ffd2675d4`, rama `claude/capacity-suggestion-formula-f54521`); `main` ya tenía otro 0295 (reponer piso por prenda), así que al rescatarlo el 2026-10-04 pasó a **0329**.
**Módulo:** Inventario, Frescura del piso (bloque 6 de ADR-0208).
**Reescribe:** ADR-0208, decisión 12 («un plan de capacidad por categoría, sede y temporada, configurable, medido en ganchos y frentes, no en m²»).
**Documentos de respaldo:** `docs/backlog/2026-09-29-capacity-suggestion-formula-f54521.md` (rondas y números),
`docs/investigacion/2026-09-30-espacio-y-mix-por-categoria.md`, `docs/investigacion/2026-09-30-categorias-relevantes-grandes-marcas.md` y, para el primer mix, `docs/investigacion/2026-10-04-mix-inicial-del-piso.md`.

## El problema

La decisión 12 de ADR-0208 imaginaba que el líder tipea a mano la capacidad de cada categoría en cada sede y temporada: cerca de 540 celdas, sin punto de
partida, en ganchos y frentes. Tres cosas la contradicen:
- **Hoy no hay de dónde sugerir.** El ERP tiene días de historia, y la «temporada equivalente del año anterior» no existirá hasta fines de 2027.
- **Colgado o doblado cambia por pared y por semana** (Felipe: «ultra variado y volátil»), así que ganchos y frentes no son una unidad estable de plan.
- **Los m² sí se conocen**: TRU 20, AQP 60 y LIM 6 (un stand).

## Decisión

1. **Unidad del plan: prendas.** Es lo que ya cuenta el stock del piso, así que el plan se compara solo con la realidad. En TRU, donde todo cuelga, una prenda es un gancho.
2. **Nivel: categoría, solo las activas en la sede.** Dos temporadas al año: Primavera-Verano y Otoño-Invierno. Alcance: solo espacio; la tabla se llama **mix** para que
   Compras y Producción puedan leerla después sin rehacerla.
3. **Total del piso de la sede = m² de sala × densidad.** Son 3 números por temporada, no 540 celdas. La densidad de arranque es **30 prendas por m²**, el extremo bajo del
   conteo de TRU del 2026-09-30 (600 a 750 prendas en 20 m², solo piso de venta, todo colgado). Cada sede la reemplaza por lo que mida (su conteo, o el máximo habitual de
   prendas en el piso).
4. **El mix lo decide Felipe por roles, no se deriva de las ventas.** Cada categoría tiene un rol: destino, rutina, ocasional o estacional, conveniencia. Hoy, **destino son
   Jeans (la categoría Jeans) y Polos/tops/blusas**, como hipótesis a contrastar. Reglas: un mínimo de presentación por familia (curva de tallas completa), el resto
   proporcional a las ventas propias de la sede corregidas por los días sin stock, una reserva para probar categorías según el rol (no un % plano), y cambios acotados por ciclo.
5. **Una sugerencia, una vez.** El sistema propone el mix inicial a partir de las ventas, Felipe lo aprueba y no se recalcula solo. El resultado es un valor que quien
   llama tiene que mirar: una sugerencia, o «sin sugerencia» con un motivo (categoría nueva, pocos datos, falta el total de la sede, registro débil). Nunca 0 ni vacío.
6. **La fórmula de Little queda como control, no como regla.** Cobertura = prendas de piso ÷ venta semanal de la categoría en la sede. Avisa cuando el plan pide más (o
   menos) de lo que sostiene la venta, con el tiempo objetivo que sale de la curva de Kaplan-Meier de Frescura.
7. **El encargado de sede ajusta el mix** como sugerencia editable con motivo registrado. Qué rol puede hacerlo lo decide Felipe en Roles y accesos (ADR-0161: un módulo nuevo
   nace solo para el líder).
8. **El stand de LIM** (≈ 180 prendas a 30 por m²) muestra solo las categorías destino y las que lleguen al mínimo; el resto, por pedido o desde otra sede.
9. **«Destino» es una hipótesis que se valida con datos propios, sede por sede y sin promediar:** % de tickets con la categoría, primera compra y recompra a 90 días,
   prendas por ticket, rotación y margen corregidos por los días con la curva de tallas rota, y «pidió y no había».

## Estados imposibles que el esquema debe negar

1. La suma de capacidades de una sede y temporada mayor que su total del piso.
2. Capacidad 0 para una categoría que se vende (la ausencia de fila significa «no se exhibe», explícito).
3. Dos filas para la misma (categoría, sede, temporada).
4. Una sugerencia guardada como si fuera decisión: la sugerencia se calcula al abrir y no se guarda; solo se guarda lo que el líder decide.
5. Un plan sin total de sede: la tabla de totales va primero, y nada se planea sin ella.

DECIDÍ: total del piso = m² × densidad medida, mix por roles que decide Felipe, y la cobertura de Little como control.
DESCARTÉ:
- **Ganchos y frentes como unidad**, porque colgado o doblado varía por pared y semana.
- **20 prendas por m³ del local**, porque el aire sobre el riel no guarda ropa y la altura del techo no cambia cuántas caben: con techo de 3 m daría 60 por m², de 1,6 a 2 veces lo medido en TRU.
- **Repartir según las ventas como regla**, porque repite el pasado (las ventas ya reflejan el espacio que tuvo cada categoría) y supone elasticidad 1, cuando la medida es ≈ 0,17 a 0,21, en supermercado.
- **La base de 12 prendas por m² de consultoras**, porque el conteo de TRU da 2,5 a 3 veces más.
- **Copiar el mix de Zara, Ralph Lauren o LVMH**, porque ninguna lo publica.
SE ROMPE SI: AQP (60 m², más pasillo) tiene bastante menos densidad que TRU y se le aplica 30 por m²; si el conteo de TRU incluyó prendas que no estaban colgadas en el piso; o si
se toma «Jeans y Polos/tops/blusas son destino» como hecho y se les da espacio sin contrastarlo con ventas.

## Lo que queda abierto

- **Contar AQP y LIM**, y los **metros lineales de riel de TRU**: 600 a 750 prendas colgadas son 30 a 37 m de riel a 20 por metro, en una tienda de 20 m² (calibra «20 por metro»).
- **Partir «indumentaria»** (18 de las 42 categorías activas son una sola familia) en subfamilias para asignar roles.
- **«Pidió y no había» no sirve todavía por categoría:** el botón de Punto de Venta (`AnotarNoHabia`) guarda solo el texto «referencia · color» y no pasa `p_producto_id`, aunque
  la función de la base lo acepta. Y el equipo de TRU no conoce el botón (1 pedido en producción al 2026-09-30).
- **Primera compra y recompra dependen del club de clientas** (`DECISIONES-2026-09-29-club-clientas.md`, CL-27): el DNI de la boleta no crea ficha, y solo cubrirán a las socias.
- **Construcción:** no está programada. Orden: lo que pide Felipe primero (conteos y roles); la pantalla después, con módulo nuevo en Roles y accesos y guía de foco (ADR-0284).

## Cómo se verificaría cuando exista

Con 3 o 4 categorías de TRU, comparar el total y el reparto sugeridos con el conteo físico de Felipe, y la cobertura calculada (hoy ≈ 7 a 9 semanas, muy aproximada) con la que
mida el sistema en cuanto haya semanas de ventas y bajadas registradas.

## Actualización 2026-10-04 — el primer mix, el ritmo y el mínimo por modelo (Felipe)

Respuestas de Felipe en las rondas del rediseño de Inventario (ADR-0328). **Mandan sobre los puntos 4 y 5 de «Decisión».**

1. **Dos relojes.** El mix es el reloj lento: cuánto lugar tiene cada categoría. La lista del día («Por colgar») es el reloj rápido: lo que se vendió ayer se cuelga
   primero desde el día 1, sin esperar al mix. Un % mal puesto nunca impide colgar lo que se está vendiendo.
2. **Primer mix: lo propone el sistema y lo aprueba Felipe, pero el punto de partida sale de la industria y no de las ventas propias** («investiga a los mejores de la
   industria, mi estadística es insuficiente por ahora»). Partida investigada en `docs/investigacion/2026-10-04-mix-inicial-del-piso.md`: ninguna cadena publica su
   reparto de piso; se tomó el surtido de mujer de Topitop, Estilos y Oechsle (contado el 2026-10-04), el rol de cada grupo, el clima de cada sede y los 4 días de venta.
   Propuesta de arranque, en % del riel: Polos/tops/blusas 48 (TRU) · 44 (AQP) · 55 (LIM); Jeans 9 · 10 · 20; Pantalones/faldas/shorts 20 · 18 · 25; Vestidos/conjuntos
   12 · 10 · —; Bodys/corsets 6 · 6 · —; Abrigo y capas 5 · 12 · —. Felipe la aprueba en pantalla cuando exista (actividad 12 de ADR-0328).
3. **La venta propia gana peso con los días:** peso de la venta = días ÷ (días + 28); el plan cuenta como 4 semanas de historia (hoy 12 %, al mes 50 %, a los 3 meses 75 %).
   El 28 es criterio, no dato.
4. **Ritmo:** el encargado mira el plan cada semana, pero el mix se mueve **una vez al mes y como máximo ±3 puntos** por grupo. Un destino no baja sin el OK de Felipe.
   Reemplaza la «sugerencia única» del punto 5.
5. **Mix distinto por sede según el clima:** AQP (noches de 7–11 °C todo el año) lleva 12 % de abrigo; TRU, 5 %.
6. **Accesorios fuera del riel:** bisutería, cinturones, gorros, lentes junto a la caja y al destino; bolsos y calzado en repisa o ganchos. Las 600 / 1.800 / 180 son
   solo prendas colgadas. Los accesorios se miden como % de la venta.
7. **Reserva para probar novedad, dentro de cada grupo y según su rol:** destino 5 %, rutina y temporada 10 %, ocasional 25 % (≈ 10 % del riel). El 5/10/25 es criterio.
8. **Jeans:** se mantiene en 9–10 % durante 4 semanas con lugar fijo junto a los tops, tallas centrales completas y la categoría bien marcada en caja; después se decide
   con datos. Parte del «0 % de jeans» es error de registro (ventas «Jean…» anotadas como Pantalones).
9. **Mínimo por modelo colgado: 1 por talla y color, solo en las tallas centrales.** «Estándar» y «Única» no son clave. La talla extrema puede quedar en el almacén o a
   pedido. En TRU caben así unos 65–100 modelos en vez de ~50. El mínimo nunca genera un «pedir este modelo» (el modelo no se repite): el faltante se suma por
   categoría × talla × familia de color y es la señal para el Taller.
10. **Piso lleno: entra una, sale una.** Colgar algo nuevo en una categoría que pasó su meta nunca se frena; Frescura propone retirar la prenda más envejecida de esa
    categoría y el encargado confirma.
11. **Contar AQP una vez** antes de confiar en sus 1.800; mientras tanto, 1.800 es provisional.

DECIDÍ: solo se guarda el mix decidido (sede, temporada, categoría, %, motivo, quién y cuándo); la sugerencia se calcula al abrir. La base niega que las metas de una sede y
temporada pasen de 100 % o de su capacidad, y dos guardados simultáneos del mismo mix: el segundo se rechaza y muestra lo que cambió el primero.
DESCARTÉ: derivar el primer mix de las ventas propias (4 días, ±9 puntos de error en una categoría de 26 %) y mover el mix cada semana sin tope (con tan pocas ventas el piso
bailaría por azar).
SE ROMPE SI: TRU hace una campaña de 3 días que duplica Polos y a las dos semanas la venta ya pesa 33 %: la sugerencia sube por una campaña. Lo frena el tope de ±3 puntos al
mes; si se repite, los días de campaña salen de la cuenta.
