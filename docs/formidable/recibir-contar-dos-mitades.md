# Formidable · Inventario ▸ Recibir mercadería ▸ Contar en dos mitades   (`/recibir/envio/[id]`)

- **Fecha / SHA:** 2026-11-11 · `259e7a82c`   · **Dispositivo que manda:** escritorio (Mac mini o computador con mouse y teclado); el celular a
  375 px se adapta (contador + isla + lista en una hoja).
- **Pregunta que debería resolver (1 frase):** «¿Qué llegó de este envío, modelo por modelo, y qué le falta a cada uno para entrar al stock?»
  · **Protagonista:** la prenda que se está contando.
- **Veredicto en una línea:** se ve ordenada y un solo botón manda antes de contar, pero **después de contar lo que sigue queda fuera de la
  vista** en un laptop y **hay dos botones negros a la vez**; la ley 1 está **sin probar** (ni agente ciego ni colaboradora real).
- **Alcance:** la pantalla Contar ya construida (ADR-0645). No cubre «Revisa y cierra» ni «Cerrado». Informes anteriores de esta ruta:
  `recibir-envio.md`, `recibir-contar-ya-en-stock.md`, `recibir-salida-anticipada.md`, `recibir-contar-cancelar.md`.
- **Costo:** 2 agentes (ciego y escéptico) de los 4 del tope; la medición y la revisión de leyes las hizo quien construyó la pantalla.

## Notas (0–10)

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | **sin probar** | Ciega: no corrió (un filtro de seguridad de la API frenó al agente en su primer mensaje; no se relanzó). Real: sin probar. [Medido] la guía de foco está: «Sigue» en el bloque que toca y «Sigue: … · quedan N más» en el pie de la lista. |
| 2 Una pregunta, una respuesta | **6** | [Medido] sin contar no hay botón negro: manda «Llegaron las N» (verde, 52 px). [Medido] tras contar a 1440×900, «Repartir tallas y colores» queda en y = 853–893 y el contador visible termina en 782 (H1, confirmado). [Código] con todo contado conviven dos negros, uno por mitad (H5, confirmado y más amplio de lo que creíamos); en el celular, «Lista» negro junto al del contador (se nos escapó 1). |
| 3 Simplicidad profunda | **7** | [Código] cada modelo trae su veredicto (Por contar, Cuadra, Faltan 1, Faltan tallas) y la tarjeta de tallas dice qué toca en una frase. [Código] «Faltan N por contar» (arriba) y «quedan N más» (abajo) no cuentan lo mismo en cuatro casos (H3). |
| 4 Lenguaje de tienda | **sin probar** | [Opinión] «tú», frases cortas, sin jerga técnica; «Re stock» es la palabra que ya usa la tienda. Sin ciega no hay palabra textual de una duda. |
| 5 Contenido primero | **7** | [Medido] a 1440×900, con el menú abierto, la lista muestra 3 o 4 modelos a la vez: la cabeza y el pie se llevan el 44 % del alto de su mitad (257 de 578 px). La prenda lleva su miniatura y su nombre en la serif. |
| 6 Lo difícil, a un toque | **8** | [Código] los filtros esperan tras un botón; el costo va en una insignia; el «?» de «Quién cuenta» tiene área de 32 px con mouse y 44 con el dedo (el hallazgo de «14 px» quedó **refutado**). |
| 7 Perdonar antes que preguntar | **8** | [Código, visto en el navegador] desmarcar tallas o colores con cantidades trae «Deshacer»; solo confirman llevar al stock y quitar un modelo ya contado. |
| 8 Quitar antes de agregar | **7** | [Código] se fueron el resumen de la derecha y las tarjetas de tipo. Queda repetido: «Primero cuenta cuántas llegaron.» dos veces antes de contar (H2) y tres frases de «lo que falta / lo que sigue» a la vista (H3). |
| 9 De punta a punta | **7** | [Medido] 375 px, oscuro (0 hallazgos solo en oscuro en 4 escenarios), animaciones apagadas, sin nadie de turno, envío vacío. [Código] con las mitades apiladas la lista no sigue al modelo en foco (H7, matizado); una parada sin modelo pone «Listo, siguiente» en negro sin haber contado (H6, matizado). |
| **Leyes (promedio de las 7 con nota)** | **7,1 (provisional)** | Las leyes 1 y 4 no tienen número: sin evidencia observada no se pone. La más baja es la 2, con 6. |
| **Oficio visual** | **7 (provisional)** | [Medido] a 1440×900 el script marca 7 de 8 comprobaciones; propias de la pantalla había dos y **se corrigieron en esta pasada** (ver abajo). Lo que queda es de piezas del sistema o falso positivo. |

### Oficio visual, en detalle [Medido con `medir-oficio.js` dentro de `<main>`, a 1440×900, 1024×768 y 375×812]

- **Corregido aquí** (defectos contra una regla del repo, no propuestas): «Llegaron las N» medía 40 px y letra de 14 porque su regla estaba
  escrita antes que la de la clase base; ahora 52 px y 16. Con el dedo, «No llegó nada» medía 40 px y «+5» y «+10», 32; ahora 44 (ADR-0611).
- **Blancos de puntero:** con mouse, ninguno bajo 24 px (el «?» de 14 px tiene su área de 32). Con el dedo queda uno bajo 44: la flecha
  «Volver» de la cabecera (34 px), pieza del sistema.
- **Texto bajo 12 px:** 4 a 1440 px, todos del sistema (la línea de sede y fecha de la cabecera, 11 px; el «/» del buscador y el «?», 10,5 px).
- **Contraste:** el script marca «Salió» y «En camino» del Trayecto con 1,08:1. **No verificado:** en pantalla se leen; puede ser una capa
  de la animación. Es la pieza de ADR-0575, no se tocó.
- **Bordes casi alineados (13), filas de alturas desiguales (13), huecos de 1 px (26):** insignias «Nuevo» tras nombres de distinto largo,
  el «+» de 32 px sobre la cabecera de categoría de 60 px y la separación de 1 px entre nombre y cifras de cada fila. Son por diseño.
- **Rojo:** 2 (los dos primeros puntos del Trayecto con el envío en 0). **Sin scroll horizontal** en ningún ancho; nada fuera de su panel.

## Los 3 cambios de mayor impacto (propuestos; ninguno aplicado)

1. **Que lo que sigue después de contar quede a la vista.** *Antes:* tocas «Llegaron las 16» y el paso que sigue, «Repartir tallas y
   colores», empieza 71 px bajo el borde del contador a 1440×900 (a 1366×768 y 1280×720 el contador visible mide 288 px y su contenido pasa de 560); se ve el
   título «Tallas y colores · Sigue» y hay que desplazar para encontrar el botón. *Después (dos caminos):* **(a)** al tocar «Llegaron las
   N» el contador baja solo hasta la tarjeta de tallas, dentro de su mitad y sin mover la página; con + y − no se mueve nada.
   **(b)** el botón del paso que toca va también en el pie fijo del contador. Recomiendo (a): no agrega un botón repetido.
   **Ley** 1 y 2. **Se verifica** midiendo que el botón quede dentro del contador visible en los siete tamaños de escritorio.
   **Esfuerzo** S. **Decide** Felipe (presentación).
2. **Un solo botón negro a la vez.** *Antes:* con todo contado, «Revisar y cerrar» es negro y la tarjeta del modelo también tiene el suyo
   («Repartir tallas y colores», «Seguir repartiendo», «Revisar el reparto» o «Llevar al stock ahora»); en el celular, «Lista» es negro
   mientras falta contar, junto al del contador. *Después:* mientras al modelo en foco le toque algo, el negro es suyo y «Revisar y
   cerrar» espera en claro; pasa a negro cuando a ese modelo no le toca nada. En la isla del celular, «Lista» siempre en claro.
   **Ley** 2. **Se verifica** contando `btn-primario` a la vista en cada estado (0 o 1). **Esfuerzo** S. **Decide** Felipe (presentación;
   no cambia qué hace ningún botón).
3. **Una sola frase de «lo que falta» y que no se repita.** *Antes:* arriba de la lista «Faltan 26 por contar», abajo «Sigue: Pantalón
   Mía · quedan 25 más» y, en el contador, «Después: Pantalón Palazzo Plisado»; antes de contar, «Primero cuenta cuántas llegaron.» sale
   en la tarjeta de tallas y otra vez bajo «¿Pasó algo?». *Después:* cuántos faltan lo dice solo la línea de arriba, que se puede tocar
   para ir al primero; el pie de la lista habla solo cuando algo distinto de contar impide cerrar (elegir quién cuenta, decir qué son
   unas prendas, una categoría sin modelos); la nota repetida del bloque 3 se va. De paso el pie de la lista baja a una fila y entra
   medio modelo más. **Ley** 8 y 3. **Se verifica** en el navegador con un envío a medio contar y con uno que pide identificar.
   **Esfuerzo** S a M. **Decide** Felipe: qué cuenta como «falta» en la guía de foco es decisión suya (ADR-0284).

## Lo que sobra (ley 8)

- «Toca el número para escribirlo.», fija bajo los botones del contador: sirve la primera vez.
- «26 modelos» (a la derecha del título) y «Faltan 26 por contar» (a la derecha del avance): el mismo número dos veces mientras no se cuenta nada.

## Lo que no pediste y importa más

**Un modelo que ya entró al stock y sigue en la lista no tiene «Corregir» a la vista.** Su tarjeta dice «Ya están en el stock» y no ofrece
nada; la hoja para corregir existe, pero se llega por otro lado. Quien llevó 16 jeans con las tallas mal repartidas puede terminar
arreglándolo en Existencias con un ajuste, y eso deja dos historias distintas del mismo error. Toca stock: lo decide Felipe.

## Lista aparte (no se ejecuta)

- **Parada sin modelo** (un número suelto de un envío viejo): «Listo, siguiente» sale negro sin haber contado nada (H6, matizado).
- **Mitades apiladas** (640 px hasta que caben las dos): «Listo, siguiente» cambia el modelo pero la lista, que queda arriba y topada a
  60 % del alto, no sigue a la fila marcada (H7 y «se nos escapó 2»). En escritorio la fila marcada se mantuvo a la vista en 7 pasos
  seguidos [Medido]; con una categoría de más de cuatro modelos, sin probar.
- **Enter salta las tallas.** Con el número abierto, Enter pasa al siguiente modelo aunque a este le toque repartir; lo recuerda solo la
  fila «Faltan tallas» de la lista. Es lo que decidió ADR-0604 («cuentas todo sin soltar el teclado»); se anota por si confunde.
- **La lista muestra 3 o 4 modelos** a 1440×900 con el menú abierto (ley 5); el cambio 3 le devuelve media fila.
- **El Dial avisa de hidratación en desarrollo** (decimales de `Math.cos` distintos entre servidor y navegador): no cambia lo que se ve.

## Hallazgos refutados

- **«El "?" de "Quién cuenta" mide 14×14 px con mouse»:** refutado. Su `::before` lleva el área a 32 px con mouse y a 44 con el dedo
  (`app/estilos/ayuda-cabecera.css`); el script mide solo la caja visible.

## Veredicto del escéptico (un agente, sobre el código)

| Hallazgo | Veredicto |
|---|---|
| H1 · tras contar, el botón que sigue queda fuera del contador visible y nada lo trae | CONFIRMADO |
| H2 · «Primero cuenta cuántas llegaron.» dos veces | CONFIRMADO |
| H3 · tres frases de lo que falta, y dos números que pueden diferir | CONFIRMADO (difieren con «Quién cuenta», un nombre sugerido, prendas sin identificar, una categoría sin modelos, una parada sin modelo y un cero marcado en un grupo sin identificar) |
| H4 · el «?» de 14 px | REFUTADO |
| H5 · dos botones negros a la vez | CONFIRMADO, y más amplio: también con «Repartir», «Seguir repartiendo» y «Revisar el reparto» |
| H6 · sin contar no hay botón negro | MATIZADO (salvo la parada sin modelo) |
| H7 · apiladas, «Listo, siguiente» no mueve nada | MATIZADO (el contador cambia en su lugar; lo que no sigue es la fila de la lista) |
| Se nos escapó | 3: «Lista» negro en la isla del celular; la lista no sigue al foco con las mitades apiladas; Enter salta las tallas sin aviso |

## Prueba ciega

| Medida | Resultado |
|---|---|
| Lectura de 5 s · Primer intento · Pasos · Dudas · Palabras no entendidas · Errores evitables | **sin probar** |

Se lanzó un agente con una tarea en lenguaje de tienda (contar dos modelos, repartir tallas, dejar uno listo para vender y decir cuánto
falta) sobre un envío inventado de 26 modelos. La API lo frenó en su primer mensaje con un filtro de seguridad y no llegó a tocar la
pantalla. No se relanzó ni se reemplazó por una lectura propia: quien construyó la pantalla no es una persona sin contexto. Queda para
hacer con una colaboradora real, que es la pasada que decide.

## Antes de decir «listo»

- **Concurrencia:** sin probar en esta rama. El guardado por línea no cambió (ADR-0604), pero la pantalla nueva no se miró con dos sesiones.
- **Caída externa:** [código] una línea que no se guarda sale en un aviso sobre la lista con «Reintentar»; no se simuló un corte.
- **Persona sin contexto:** sin probar.

## Historial

| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-11 | `259e7a82c` | 7,1 (provisional; leyes 1 y 4 sin probar; ley 2: 6) | 7 (provisional) | 0 de 3 propuestos; corregidos al medir: el alto de «Llegaron las N» y los 44 px con el dedo |
