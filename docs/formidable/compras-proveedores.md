# Formidable · Compras ▸ Proveedores, pestaña Mercadería: el ranking   (`/compras/proveedores`, con «Lo que no se ve a simple vista» y «Comparar»)

- **Fecha / SHA:** 2026-10-26 · `ee9e61866` (rama `claude/proveedores-maquetas-016647`, sin PR) · **Dispositivo que manda:** escritorio (Mac mini o
  laptop de quien compra). 375 px se revisó (sin desborde), pesa poco: es una pantalla del líder y de compras.
- **Pregunta que debería resolver (1 frase):** «¿A quién le vuelvo a comprar?» · **Protagonista:** el proveedor y cuánto se vende lo que le compraste.
- **Veredicto en una línea:** «Se entiende en 5 s y se usa al primer intento, pero la insignia que decide la compra no explica su porqué a un toque, tres
  cifras de dinero con nombres parecidos dicen cosas distintas, y comparar esconde lo vencido de hoy.» **Y una cuenta de la base (heredada del ADR-0502)
  le suma a cada proveedor las ventas enteras de una prenda que trajeron varios.**
- **Escala de esta corrida:** medición del DOM a 1440, 1024 y 375 px (yo) · auditoría de contraste claro/oscuro con `tema:auditar` (5 estados) · **una**
  prueba ciega (1 agente, navegador local con datos inventados: 2 proveedores con compras) · **un** escéptico (1 agente, código + base local + navegador).
  Sin revisor de leyes en agente: lo hice yo.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: a los 5 s dijo «la lista de los proveedores a los que la tienda les compra ropa… lo siguiente es tocar un proveedor»; completó la tarea al primer intento (13 pasos, 1 clic repetido), y respondió bien a quién le compramos más y que no conviene volver a pedirle. 9 dudas. · real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Medido] 1 acción primaria («Registrar proveedor»). [Observado, escéptico N3] el «#1» se lee como «el mejor» y es «al que más le compraste»: nada visible dice que las dos tarjetas ordenan la lista («Ordenar el ranking por» vive solo en el `aria-label`, `ProveedoresRanking.tsx:59`) |
| 3 Simplicidad profunda | 6 | [Medido] la insignia traduce el ritmo a una palabra (bien). Pero «100+ sem» empata a dos proveedores lentos en la comparación (`semanasCortas`, `proveedores-ranking-reglas.ts:73`), y tres cifras de dinero distintas (lo que llegó sin IGV, lo facturado con IGV, lo que se debe) se leen como la misma (H4) |
| 4 Lenguaje de tienda | 6 | [Observado] «Frena» no se sabe si es un estado o una orden; «Margen» no dice de qué; «Facturado 12 M». [Opinión] «carga inicial» y «costo por confirmar» son palabras de quien armó el sistema |
| 5 Contenido primero | 6 | [Medido, captura a 1440 × 900] la primera fila del ranking empieza en y = 638 de 900: arriba van cabecera, pestañas, las dos tarjetas, el buscador y los filtros de ritmo; se ven 2 filas sin bajar |
| 6 Lo difícil, a un toque | 4 | [Medido] el porqué de la insignia vive solo en `title` (`ProveedoresRanking.tsx:278`, `ProveedoresComparar.tsx:133`, las píldoras de `ProveedoresPanel.tsx:377`); la vista rápida no habla del ritmo. Solo «Frena», y solo para los 3 más lentos, tiene un «¿Por qué?» a un toque (el aviso de la columna derecha), sin enlace desde la insignia |
| 7 Perdonar antes que preguntar | 8 | [Medido] nada de la pantalla es irreversible; marcar y comparar se deshacen. [Medido, escéptico H10] errarle a la casilla por 3–4 px abre la vista rápida (se cierra con Escape) |
| 8 Quitar antes de agregar | 6 | [Opinión] la columna derecha suma la concentración en los 10 primeros y el % de la carga inicial a lo urgente; con pocos proveedores la concentración dice poco |
| 9 De punta a punta | 6 | [Medido] 0 desbordes a 1008, 1024, 1440, 1920 y 375; contraste 0 en claro y oscuro. [Observado] «Mercadería 3» y «Sin datos de pago · 3» cuentan al Taller, la lista muestra 2 (H8); la columna derecha arrastra la página al terminar su scroll (H11) |
| **Leyes (promedio)** | **6,1** | ley 6 en 4: el porqué de la insignia solo con el mouse |
| **Oficio visual** | **7** | [Medido] lo propio que falla: la casilla de 20 × 20 px (mínimo 24) y el enlace «Le debes» de 20 px de alto; dos bordes a 1 px (casilla y encabezado). Lo demás del medidor es del marco o de piezas del sistema (el «contraste 1,06:1» de la pestaña activa es un falso positivo: su píldora oscura es otro elemento) |

## Los 3 cambios de mayor impacto
Esperan el OK de Felipe. Ninguno cambia una regla de negocio: el 1 cambia nombres de cifras de dinero (presentación, pero es dinero: decide Felipe).
1. **Cada cifra de dinero dice qué es, y el orden se ve.** Antes: «Dinero gastado S/ 36,626», «Le compraste · dinero», «Facturado 12 M» y «Le debes»
   se leían como lo mismo (a Confecciones «le compraste» S/ 17,114 y «le debes» S/ 37,453); el «#1» parecía «el mejor»; «Margen» sin decir de qué, y
   con 6 ventas. Después: la tarjeta y la columna dicen **«Lo que te llegó · a su costo, sin IGV»** (y «Prendas que te llegaron»); arriba de la lista,
   **«Del que más te llegó al que menos»** a la vista; en la comparación, «Le debes» lleva al lado lo facturado, y «Margen» pasa a **«Ganas de cada
   venta»**, con «pocas ventas para decirlo» bajo 10 vendidas (la misma regla del veredicto, `MIN_VENDIDAS_PARA_JUZGAR`). Leyes 2, 3 y 4. Esfuerzo S.
   Se verifica: el mismo recorrido ciego sin las dudas 3, 4 y 5.
2. **El porqué del ritmo, a un toque y en una orden clara.** Antes: «100+ sem · Frena» con su explicación solo al pasar el mouse; «100+ sem» empataba a
   385 y 202 semanas. Después: tocar la insignia abre su «¿Por qué?» (la pieza de los avisos): «Vende 1,5 por semana y le quedan 578: tardarías unas
   385 semanas. **Frena las compras**: primero vende lo que tienes»; la palabra de la insignia pasa a una orden clara («Frena compras»); en la
   comparación, las semanas exactas y la velocidad («1,5 por semana»). Leyes 6, 3 y 4. Esfuerzo M. Se verifica: tocar la insignia sin mouse y leer el
   porqué; la comparación distingue 385 de 202.
3. **Comparar sin perder lo urgente, y una casilla que no se falla.** Antes: marcar uno reemplazaba toda la columna derecha (se perdían lo vencido y las
   2 entregas atrasadas, que no se ven en otro lado); la casilla de 20 px y, al fallarla, se abría la vista rápida. Después: «Comparar» entra arriba de
   la columna y «Para hoy» sigue debajo; la casilla con área de 32 px (su `label`) y título visible en su columna («Comparar»). Leyes 2 y 9, oficio.
   Esfuerzo S. Se verifica: marcar uno y seguir viendo lo vencido; medir el blanco de la casilla.

## Lo que sobra (ley 8)
- La concentración «de lo que compras es de tus 10 primeros» con 2 proveedores dice 100 %: se propone mostrarla solo con más de 10 proveedores con compras.

## Lo que no pediste y importa más
**Las ventas y el stock de una prenda se le suman enteros a cada proveedor que la trajo** (escéptico N1, verificado por mí en la base local).
`fn_proveedor_prendas_base` (`20261024231000`, **en producción desde el 2026-10-24**) agrupa lo vendido, lo vendido neto y el stock por prenda y los
cruza solo por prenda (`left join vendidas ve on ve.pid = pa.pid`, líneas 172–174), sin mirar el proveedor. Una prenda que llegó por la carga
inicial de su proveedor habitual y después por una compra a otro aparece con TODAS sus ventas en los dos: en local, la prenda `a5d078dd…` vendió 4 y
figura con 4 en CAYLA SAC, en Confecciones y en Textiles (la columna dice «12 ya se vendieron»; son 8). Infla «Vendido», las semanas, el margen y
la línea de ventas (`fn_proveedores_ventas_diarias` hereda el mismo cruce), y puede encender «Repón» con ventas de otro proveedor. Hoy pasa poco
(Compras recién entra en uso), pero crece con cada compra a un proveedor distinto del habitual. **Arreglarlo cambia una RPC y cifras de stock y dinero:
es de Felipe.** La ruta que propongo: repartir lo vendido y el stock de cada prenda entre sus proveedores en proporción a lo que cada uno entregó, con
una migración que reemplaza las dos funciones y una prueba de Postgres que exige que la suma por proveedor no pase lo real.

## Lista aparte (no se ejecuta)
- La línea de ventas no marca qué tramo es «esta semana»: picos de hace 3 semanas junto a «0 esta semana» se leen como contradicción (H6).
- «Mercadería 3» y «Sin datos de pago · 3» cuentan al Taller; la lista muestra 2 (H8).
- La columna derecha pegada arrastra la página al terminar su scroll (`overscroll-behavior: auto`): `overscroll-contain` (H11).
- La barra de «Le compraste» de un proveedor chico mide 21 px; con 1 % vendido la parte oscura no se ve (H9). El anillo ya lo dice en texto.
- `/compras/proveedores` sigue `pendiente` en la guía de foco (deuda de antes de la regla, por el buscador).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «La lista de los proveedores a los que la tienda les compra ropa; arriba, prendas compradas y dinero gastado; a la derecha, avisos». Coincide |
| Primer intento | Sí (repitió un clic en «¿Por qué?») |
| Pasos | 13 (mínimo razonable: ~6; incluye explorar la vista rápida) |
| Dudas | 9: «Frena»; «Mercadería 3» vs «Todos 2»; «Le debes» mayor que «le compraste»; «Facturado 12 M» contra «Le compraste»; «Margen»; «Sin datos de pago · 3»; los dos «100+ sem»; la línea con picos y «0 esta semana»; la parte oscura de la barra |
| Palabras no entendidas | 6 (interpretó bien 5: «Frena» lo leyó como orden) |
| Errores evitables | 4 toques que no hicieron lo esperado (el mouse sobre «Frena», la rueda en la columna, un «¿Por qué?» que se movió, la × que tardó: dos son del panel oculto) |

## Antes de decir «listo»
- **Concurrencia:** la pantalla solo lee; dos personas a la vez no se pisan. La comparación vive en la pestaña de cada una.
- **Caída externa:** sin `fn_proveedores_ventas_diarias` las filas van sin línea; sin el rendimiento, la pestaña vuelve al directorio. Probado en código (`.catch(() => null)`), no apagando la base.
- **Persona sin contexto:** la ciega lo respondió (arriba). Colaboradora real: sin probar.

## El después (2026-10-26, con el OK de Felipe: «Sí, haz los 3 cambios de Formidable en Proveedores»)

Hechos los 3 y medidos en el navegador local a 1440, 1280, 1024 y 375 px. Ninguno cambia una cuenta: las cifras son las mismas, con otro nombre.
1. **El dinero dice qué es.** Las tarjetas: «Prendas que te llegaron» y «Lo que te llegó, a su costo» (nota: «sin IGV, al costo de cada compra»); la
   columna: «Te llegó · prendas / a su costo»; arriba de la tabla, a la vista: «Del que más te llegó al que menos. Toca uno para ver su detalle; marca
   hasta 3 para compararlos.» En la comparación, «Le debes» lleva «todo vencido» y «de S/ 13,829.60 facturados, con IGV»; «Margen» pasó a «Ganas de
   cada venta» y bajo 10 vendidas dice «pocas ventas para decirlo (6)». La columna derecha dice «te llegaron» / «te llega».
2. **El porqué del ritmo a un toque.** **Me aparté de la propuesta en un punto:** el porqué no es un globo sobre la insignia (el ERP no tiene esa
   pieza y la fila entera ya abre la vista rápida); es la sección **«Cómo se vende»** de la vista rápida: la insignia, «Frena las compras: primero vende
   lo que tienes.» y los números («Vende 1.5 por semana (6 desde que llegó)», «Le quedan 578 en tus tiendas», «A ese ritmo, venderlo todo tardaría
   unas 385 semanas»; `porqueDelRitmo`, con su prueba). Se llega con un toque en cualquier parte de la fila, insignia incluida. La insignia dice
   «Frena compras», con las semanas arriba; la comparación, las semanas exactas («385 sem» y «202 sem», `semanasExactas`) y «vende 1.5 por semana».
3. **Comparar sin perder lo urgente.** «Comparar» entra arriba de la columna y «Para hoy» se queda debajo (si no hay nada urgente, no se dibuja);
   la columna entera se pega al bajar. La casilla tiene su etiqueta de 32 × 32 px: tocar 3 o 5 px al lado la marca y ya no abre la vista rápida
   (medido con `elementFromPoint` y un clic real). **El título de su columna** no cabe en 20 px: lo dice la línea de arriba de la tabla («marca hasta 3
   para compararlos»), que también avisa que marcar cambia la columna.

De paso, por lo que estos cambios movían: en una tabla angosta (375 px y 1280 px) la insignia baja a la línea de la barra, porque «Frena compras»
volvía a cortar el nombre del proveedor; y las dos tarjetas de medida pasaron de 17 a 19,5 rem para que sus nombres nuevos quepan en una línea.

**Medido después:** casilla 32 × 32 (antes 20 × 20); sin desborde a 1024, 1280 ni 375; contraste claro y oscuro: ver la fila del historial. La primera
fila del ranking quedó en y = 674 a 1440 × 900 (antes 638): los 36 px son la línea que explica el orden y la casilla. Queda «Le debes S/ …» de 20 px
de alto (lista aparte) y los «Ver» de los avisos, de la pieza que ya existía.

**Notas provisionales (sin repetir la ciega):** ley 2 → 7 (el orden se dice), 3 → 7 (las semanas exactas, el dinero con nombre), 4 → 7 («Frena
compras», «Ganas de cada venta»), 6 → 7 (el porqué a un toque; la insignia aún explica su regla solo con el mouse), 9 → 7 (comparar ya no esconde lo
vencido). Leyes ≈ 6,9 · oficio 8. Falta repetir la ciega sobre la pantalla nueva y la pasada con una colaboradora real.

Capturas antes/después a 1440 × 900 en el informe al usuario (no se versionan).

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-26 | `ee9e61866` | 6,1 | 7 | — (3 propuestos, esperan OK) |
| 2026-10-26 (b) | ver el commit del después | 6,9 (provisional) | 8 | los 3, con el OK de Felipe; la ciega sin repetir |
