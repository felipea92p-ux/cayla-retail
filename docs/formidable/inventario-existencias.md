# Formidable · Inventario ▸ Existencias: la tarjeta y el modal de la prenda   (`/inventario`, `?variante=`)

- **Fecha / SHA:** 2026-10-12 · `f2202e6ca` (+ los arreglos de esta corrida, sin commit al medir) · **Dispositivo que manda:** escritorio (Mac mini)
- **Pregunta que debería resolver (1 frase):** «¿Cuántas de esta prenda puede comprar el cliente ahora, dónde está el resto y qué me toca hacer?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s (la ciega leyó bien el número grande y el "+N guardadas"), pero la pantalla se contradecía a sí misma en tres lugares —todos corregidos hoy— y lo nuevo que vino a mostrar, lo guardado, es su texto más chico.»
- **Alcance:** la tarjeta nueva (ADR-0391, una columna por talla), las cifras que filtran, el modal «Foto y lista» y su pestaña «Todas». El resto de la pantalla (barra de filtros, cabecera del módulo) se mide como chrome y se reporta aparte.
- **Cómo se midió:** `medir-oficio.js` con el Chrome del sistema vía Playwright (el panel del escritorio estaba oculto) a 1440×900, 1024×768 y 375×812, sobre la pantalla y sobre el modal solo (`[role=dialog]`); capturas en `.chaos/formidable-existencias/` (local). Prueba ciega sobre las capturas (Sonnet, formato de seis medidas exigido) y escéptico (Sonnet, 20 hallazgos: 9 confirmados, 8 matizados, 3 refutados, 0 no verificables). El modo oscuro no se repitió aquí: `tema:auditar` lo cubrió el mismo día (0 hallazgos solo en oscuro). Todas las capturas corren con el motor del piso mudo (`plan === null`, la base local no tiene `fn_piso_plan_lectura`); el escéptico separó lo que eso fabrica.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s «la lista de lo que hay de ropa en mi tienda; el número grande es lo colgado y el +6 lo que está atrás»; llegó a «Colgar en el piso» en 2 toques seguros (4 con los supuestos); dudas en 10 puntos (ver tabla) · real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [visto + escéptico F9 MATIZADO] en «Qué hago» la acción sugerida va primera y teñida, pero no hay UNA primaria; las otras cuatro pesan igual; la pantalla no tiene `btn-primario` (cada tarjeta lleva el suyo) |
| 3 Simplicidad profunda | 6 | [código F13 CONFIRMADO] «Todas» decía «Todo en el piso» con 4 tallas a 0 colgadas (solo miraba al motor) — **corregido**; [código B3 MATIZADO] tres reglas para «por colgar» (filtro: motor; tarjeta: máx(motor, físico); modal: motor o números); los veredictos de la talla («Falta colgar · Cuelga 1», «Todo bien») sí traducen |
| 4 Lenguaje de tienda | 6 | [Observado B2 CONFIRMADO] «Otras tiendas: Taller 14» contra «Pedir (ninguna tienda tiene)» — **corregido** («Otras sedes»); [código F10 CONFIRMADO] dos vocabularios dentro del modal («0 piso» en las fichas, «unidades en almacén» en las acciones, «colgadas/guardadas» en las casillas); [Observado B4] la leyenda con cifras de ejemplo se leyó como total; [Observado B5] «la columna dice N/D» en la vista de tarjetas; no entendió «Subir», «Rótulo» vs «Etiquetas», «CMS-0001» |
| 5 Contenido primero | 7 | [visto] la foto grande manda en el modal y el número grande en la tarjeta; [Medido F1 CONFIRMADO] «+N guardadas» a 10,5 px y el nombre de la talla a 11 px: lo más chico de la tarjeta es lo que ADR-0391 vino a mostrar; [Medido F4 MATIZADO] la primera prenda a 419 px (1440×900) y 567 px (1024×768), casi todo chrome y cabecera del módulo |
| 6 Lo difícil, a un toque | 7 | [Observado B6 MATIZADO] «Cuelga 1: no hay en el piso y hay 7 en almacén» no dice por qué 1 (es el mínimo de fábrica) pero el paso siguiente pregunta «¿Cuántas?» con «Todas (7)»; la lectura del ritmo se explica sola |
| 7 Perdonar antes que preguntar | 9 | [código + /chaos] colgar confirma con «Así va a quedar» y un botón final (stock = irreversible); los filtros y las vistas no preguntan; «¿Salir sin guardar?» solo con un paso sucio (`antesDeCerrar`) |
| 8 Quitar antes de agregar | 7 | [visto F6 MATIZADO] «En camino: 0» siempre a la vista como texto suelto; [Observado B1 MATIZADO] los atajos de teclado (1·4·3·7·6) sin rótulo se leyeron como cantidades; a favor: salieron «Eliminar», el «N en esta sede» de 46 px y las acciones imposibles pasaron a una línea |
| 9 De punta a punta | 7 | [Observado B5 CONFIRMADO] el estado de error del motor habla de «la columna» y de «N/D»; [Medido F5 MATIZADO] a 1024×768 la lista cabe pero las fichas de talla quedan al filo del pliegue; [Medido F11] a 375 px «Cerrar» 28 px y los círculos 30 px (Inventario es de escritorio); el foco al cerrar caía al lateral (F8) — **corregido**, también desde «Más ⌄»; oscuro: 0 hallazgos |
| **Leyes (promedio)** | **6,9** | la ley 1 no pasa de 8 sin la pasada real |
| **Oficio visual** | **5** | [Medido] 6 de 12 comprobaciones fallan (sin blockers): #2 blancos con dedo (28–40 px), #6 texto bajo 12 px (10,5 y 11 px en la tarjeta; 11 y 11,5 px en el modal), #7 un borde a 1 px («Dónde está» contra su texto) y el cuadrito de la leyenda que se iba solo a un renglón — **corregido**, #8 huecos de 1 y 3 px en las columnas de talla, #9 ocho tamaños de texto en el modal, #10 radios sueltos (9, 11, 14 px fuera de la escala; la escala del sistema ya son 6 valores, no 3). Pasan: #1 blancos con mouse (los círculos de color tienen su `::after` de 26–32 px, F2 refutado), #3 contraste (tras subir tres ceros a taupe pleno: 5,6:1), #11 solo tokens y ≤ 2 rojos, #12 teclado (60 Tab sin salir del modal, Enter/Esc), #13 sin sombras pegadas al fondo, #14 orden de pantalla. No medidos: #4 y #5 (contraste del foco) |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)
1. **Que lo guardado se lea: la talla y «+N guardadas» a 12 px.** Antes → después: `text-[11px]` / `text-[10.5px]` → 12 px en las dos líneas chicas de la columna (`ColumnasTallas`, `ExistenciasTarjetas.tsx`); el escéptico midió que «+6 guardadas» cabe a 12 px en una tarjeta de 3 tallas (75 px en 107) y en 4+ ya va «+N». Ley 5 y oficio #6. Verifica: `medir-oficio.js` → `textoChico` sin elementos de la tarjeta. Esfuerzo S. Decide Felipe (presentación).
2. **Nada que parezca un dato sin serlo.** (a) La leyenda al pie («**2** colgadas en el piso · **+1** guardadas en el almacén») sin cifras de ejemplo: «el número grande: colgadas en el piso · debajo: +guardadas en el almacén», con sus muestras ámbar y rojo (la ciega la leyó como total y la comparó con los 6/183 de la cabecera; ADR-0290). (b) Los atajos de teclado de «Qué hago» (1·4·3·7·6) con rótulo («tecla 1») o visibles solo cuando se usa el teclado (la ciega los leyó como cantidades). Leyes 4 y 1. Verifica: ciega nueva sobre la captura; `pnpm sugerir` limpio. Esfuerzo S. Decide Felipe (presentación).
3. **Un solo vocabulario dentro del modal.** ~~Las fichas de talla «0 piso» → «0 colgadas»…~~ **Resuelto al revés por Felipe el 2026-10-13:** las casillas de «Dónde está» y de «Todas» pasaron a «En piso / En almacén» (y se tocan: llevan a «Todas» con esa capa), que es el vocabulario que ya tenían las fichas de talla y las acciones; y la **tarjeta** se alineó el mismo día («+N en almacén», leyenda «2 en piso · +1 en almacén»). Cerrado. Ley 4.

## Lo que sobra (ley 8)
- «En camino: 0» como texto suelto cuando es 0: solo importa cuando viene algo (alimenta «¿Pedir?»); esconderlo en 0 o apagarlo como las casillas.
- Los atajos de teclado a la vista para quien usa el mouse (ver cambio 2b).

## Lo que no pediste y importa más
**Tres reglas distintas responden «¿falta colgar?» en la misma pantalla:** el filtro «Por colgar» cuenta solo lo que marca el motor (`hoyDeTalla`), la tarjeta toma el máximo entre el motor y los números (`botonDeTarjeta`) y el modal dice «Falta colgar» con el motor O con los números (`queTocaConLaTalla`). Hoy las tres tiendas tienen el motor en pausa (0 cuadres), así que la barra dice «Por colgar 0» mientras la blusa abierta dice «Falta colgar»: la ciega lo vio y «no supo cuál creer». Unificarlas en UNA función que las tres lean es una decisión de negocio de Felipe (qué manda cuando el motor calla: ¿los números, o nada hasta cuadrar?).

## Lista aparte (no se ejecuta)
- F9: una acción primaria real en «Qué hago» (la sugerida como `btn-primario`); es la distribución que Felipe eligió entre cuatro.
- F5: a 1024×768 las fichas de talla quedan al filo del pliegue del modal (la lista «Qué hago» sí cabe).
- F4: el marco antes de la primera prenda (62 px de barra + 130 de cabecera + 120 de filtros + 30 del aviso); lo propio de la pantalla son los 120 de filtros.
- B5: el aviso del motor caído («la columna dice N/D») en la vista de tarjetas; es un estado de error y habla en código.
- B6: un «¿Por qué 1?» a un toque junto a «Cuelga 1» (el mínimo de ADR-0328).
- F11: «Cerrar» a 28 px es del `<Modal conCerrar>` (chrome global, se arregla una vez para todas las hojas); los círculos de color del modal a 30 px.
- F3: 9, 11 y 14 px son radios sueltos fuera de la escala (que ya tiene 6 valores: ADR-0169).
- Refutados: F2 (los círculos de color tienen un `::after` de 26–32 px: el medidor no lo ve), F12 (la casilla «0 colgadas» que falta va en ámbar sólido, no punteada), B7 (la insignia «Falta colgar» es la pieza de estado del sistema; la ciega solo dijo que la tocaría).

## Cerrado en la rama durante la corrida (sin esperar el OK: eran defectos del código nuevo, no decisiones de diseño)
- F13: el chip de «Todas» sigue la regla de la tarjeta (`insigniaDelModelo`, con prueba); verificado en el navegador: «4 tallas sin colgar».
- F8: el foco vuelve a quien abrió el modal (`alCerrarEnfocar`), también desde «Más ⌄ ▸ Ver ficha» (repetidos TEC-06 y TEC-06b: «¿mismo botón? true»).
- B2: «Otras sedes: Taller 14» (el Taller no es tienda; «Pedir (ninguna tienda tiene)» ya era correcto).
- F7: el cuadrito de la leyenda va en línea con «Faltan en el piso…» y ya no se queda solo en un renglón.
- Los tres ceros atenuados a 2,3–3,0:1 (`tema:auditar`) pasaron a taupe pleno (5,6:1 claro, 6,9:1 oscuro).

## Prueba ciega (pasada 1, agente sobre las capturas a 1440 px; real: sin probar)
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la lista de lo que hay de ropa en mi tienda, prenda por prenda y talla por talla; el número grande es lo colgado a la vista y el +6 lo que está atrás, en el almacén; lo que sigue: tocar una talla o "Colgar en el piso"» | sí |
| Primer intento | tocó la talla L de Blusa Emma y luego «Colgar en el piso · 7 unidades en almacén»; no retrocedió | sí (hasta donde la captura deja ver) |
| Pasos | 2 seguros + 2 supuestos (cantidad y cerrar) = 4; el mínimo real es 4 (talla → Colgar → Continuar → «Colgar 1») | sí |
| Dudas | el «0» grande sin palabra al lado · la leyenda «2 colgadas / +1 guardadas» contra «6 / 183» de la cabecera · «Por colgar 0» contra «Falta colgar» · «la columna dice N/D» sin columna · dos buscadores · «para vender ahora» no aparece escrito · «7 unidades en almacén» frente a «Cuelga 1» · la cajita «1» como cantidad · «Otras tiendas: Taller 14» contra «ninguna tienda tiene» · «2 Issues» | no: 10 (cada una es un hallazgo de arriba; «2 Issues» es la insignia de Next en desarrollo) |
| Palabras no entendidas | «Subir», «Rótulo» vs «Etiquetas», «CMS-0001», «N/D», las cajitas de teclas, el puntito dorado sobre los círculos | no: 6 |
| Errores evitables | ninguno tocado (sobre capturas no se toca); 9 cosas que «tocaría esperando algo» (3 refutadas, 6 en los hallazgos) | — |

## Antes de decir «listo»
- Concurrencia: `/chaos` CON-09, 10 sesiones a la vez sobre la misma talla: 7 colgaron, 3 recibieron «pides 1 y en el almacén hay 0», 0 deadlocks, stock = movimientos. · Caída externa: sin red, «Se cortó la conexión y no sabemos si se guardó» y lo escrito se conserva; con la respuesta perdida, «Confirmar de nuevo» devuelve lo ya guardado sin duplicar; con el motor del piso caído, la pantalla sigue y lo dice (B5: con un texto que hay que mejorar). · Persona sin contexto: la ciega la entendió en 5 s y llegó a colgar; real: **sin probar**.

---

# Re-análisis 2026-10-31 · la tarjeta Vitrina (ADR-0589)

- **Fecha / SHA:** 2026-10-31 · `621fe25f1` · **Dispositivo que manda:** escritorio (Mac mini)
- **Alcance:** solo la tarjeta nueva (foto grande con la chapa de colores, tira hundida, pie a todo el ancho, sombra y filo de estado). El modal de la
  prenda y la barra de filtros no cambiaron y no se re-calificaron.
- **Veredicto en una línea:** «Se entiende en 5 s (la ciega miró foto → nombre → número, en ese orden), pero la tarjeta se contradice con el piso en
  pausa ("Colgar · 3 tallas" con 4 tallas vacías y ninguna celda en ámbar), y este rediseño **achicó** el texto que el informe anterior pedía agrandar.»
- **Cómo se midió:** `medir-oficio.js` con Playwright (Chrome sin ventana, sesión del auditor del tema) a 1440×900, 1024×768 y 375×812, más una medida
  propia de la tarjeta (tamaños de texto y blancos). `tema:auditar` en claro y oscuro a 1440 y 375 px: 0 hallazgos solo en oscuro. `guias:recorrer`
  de la guía de Existencias: 36/36 pasos a 1440 px en claro y en oscuro, 35/35 a 375 px, sin escrituras en la base y sin modales abiertos al final.
  Una prueba ciega (Sonnet, sobre 3 capturas) y un escéptico (Sonnet, con el código: 2 confirmados, 5 matizados, 1 refutado, 1 no verificable).
  **La base local tiene el motor del piso en pausa** (la tienda nunca se cuadró): ninguna celda sale ámbar y ningún filo se pinta; eso fabrica parte de lo visto.

## Notas (0–10) · solo la tarjeta
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] a los 5 s: «la lista de la ropa de mi tienda, cada prenda con foto y números por talla»; respondió bien «20 Blusa Emma M en el piso» y armó la lista de lo que hay que colgar mirando los botones; dudó de las cifras por el aviso «nunca se ha cuadrado» (marco) · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Observado] una sola acción con nombre por tarjeta («Colgar en el piso», «Todo en el piso»); la ciega la encontró sin buscar |
| 3 Simplicidad profunda | 5 | [Observado H4 + escéptico] Pantalón Carla: «Colgar en el piso · 3 tallas» con 4 tallas en 0 y +6 (`tallasSinColgar` descuenta la talla «mantener», la tira no); [código] con el motor en pausa el botón cuenta lo físico pero ni las celdas ni el filo se pintan: la tarjeta dice dos cosas (heredado de las «tres reglas» del 12-oct) |
| 4 Lenguaje de tienda | 6 | [Observado H2 CONFIRMADO] «Beige · 2 colores»: no supo si el 20 era del Beige o de los dos (las cifras son solo del color que se ve; «· N colores» es nuevo de este rediseño) |
| 5 Contenido primero | 7 | [Observado] la foto manda (primera en el orden de la mirada); [Medido H1 CONFIRMADO] el nombre de la talla a 10,5 px y «+N en almacén» a 10 px: **regresión** (antes 11 y 10,5; el cambio 1 del 12-oct pedía 12) |
| 6 Lo difícil, a un toque | 7 | sin cambio (no se tocó el modal) |
| 7 Perdonar antes que preguntar | 9 | sin cambio (la tarjeta no guarda nada) |
| 8 Quitar antes de agregar | 7 | [Opinión] «· N colores» repite lo que dicen los puntos y además confunde (H2); el filo repite la tira a propósito (se ve de lejos) |
| 9 De punta a punta | 7 | [Medido] alto parejo de 202 px a todo ancho, sin texto cortado a 1920/1440/1024/375, oscuro 0 hallazgos, guía al día; **sin ver:** «+N» con un modelo real de más de 5 colores (la base no tiene uno) y el filo dibujado (el motor está en pausa) |
| **Leyes (promedio)** | **6,9** | la ley 3 está en 5: la tarjeta se contradice con el piso en pausa |
| **Oficio visual** | **6** | [Medido] de la tarjeta fallan 2: texto bajo 12 px (10 y 10,5) y los puntos de color (área de 24 px con mouse que se pisa con la del vecino: ~17 px de centro a centro, escéptico H3). Pasan: alineación de la rejilla (filas rectas, 202 px), contraste (auditor), solo tokens, `:hover` con mouse. El resto de lo que marca `medir-oficio.js` (7 de 8 a cada ancho) es del marco: lateral, cabecera, «Salir» a 16 px, el «1» de la paginación |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)
1. **Que el almacén se lea (cierra la regresión y el cambio 1 del 12-oct).** El nombre de la talla 10,5 → 12 px y «+N en almacén» 10 → 12 px en la
   tira. Con 3 tallas o más ya va abreviado («+6») y cabe; con 1 o 2 tallas, «en almacén» se queda solo si cabe a 320 px (si no, abrevia desde 2).
   Ley 5 y oficio #6. Verifica: medida de la tarjeta sin texto bajo 12 px y sin `truncate` cortando a 320, 1024 y 1440. Esfuerzo S. Decide Felipe (presentación).
2. **El color, sin «· 2 colores».** «Beige · 2 colores» → «Beige»: las cifras son de ese color y los otros ya están en los puntos de la foto (con
   «+N» si son más de 5). Leyes 4 y 8. Verifica: ciega nueva con la misma tarea, que no dude de qué color es el 20. Esfuerzo S. Decide Felipe (presentación).
3. **Una sola respuesta a «¿falta colgar?» dentro de la tarjeta.** Hoy, con el piso en pausa, el botón cuenta lo físico («· 3 tallas») y las celdas y el
   filo solo siguen al motor (que calla). Propuesta: que la celda en ámbar y el filo usen la misma regla que el botón (0 colgadas y algo en almacén,
   menos lo que el motor marca «mantener»), y que esa talla «mantener» se vea distinta en la tira (sin ámbar, con un «se queda»). **Toca qué se le
   dice a la tienda sobre su stock: decide Felipe** (qué manda cuando el motor calla). Ley 3. Verifica: Pantalón Carla dice tantas tallas como celdas
   en ámbar. Esfuerzo M.

**El 3 también, el mismo día:** Felipe eligió la opción A, «manda lo físico», entre A, B (manda el motor) y C (dejarlo así). Hay una sola
regla, `faltaColgar`, para el ámbar, el filo, el botón y la talla de entrada; la talla «mantener» vacía lleva el visto verde (ADR-0589 act. c).
Pantalón Carla: 3 en ámbar, la 34 con su visto y el botón con «3 tallas».

**Hechos el 2026-10-31 con el OK de Felipe («Haz 1 y 2»):** el 1 (12 px exactos; como `text-xs` mide 13 px en este ERP, la palabra «en
almacén» queda solo con 1 talla: con 2, «+10 en almacén» pedía ~90 px en una celda de 83 a 320 px) y el 2. El 3 espera su decisión.

## Lo que sobra (ley 8)
- ~~«· N colores» junto al color (cambio 2).~~ Quitado.

## Lo que no pediste y importa más
Lo mismo que el 12-oct, ahora visible en la tarjeta: **la tienda no se ha cuadrado nunca, así que el motor está en pausa en las tres sedes y todo lo que
depende de él (ámbar, filo, «Por colgar», el modal) calla mientras el botón habla.** Hasta el primer cuadre, la tarjeta Vitrina nunca mostrará su filo.
Cuadrar el piso de cada sede vale más que cualquier ajuste de diseño.

## Lista aparte (no se ejecuta)
- H3: los puntos de color a ~17 px de centro a centro (las áreas de 24 px se pisan). Darles 24 px de verdad pide 3 puntos visibles en vez de 5, y eso
  cambia lo que Felipe aprobó («con que salga así está bien»).
- H5 (heredado): los cuadritos de la leyenda al pie (`InventarioPanel.tsx`) son casi beige; con el motor en pausa no hay con qué compararlos.
- H6 (heredado): tocar el nombre abre la primera talla «por colgar»; con el motor en pausa cae a la primera (S).
- H8: la chapa sobre una prenda negra en oscuro, sin captura que lo pruebe.
- Refutado: H7 (la primera tarjeta bajo el pliegue a 1024 es el marco, no la tarjeta: F4 del 12-oct).
- De la segunda ciega (2026-10-31): el número es del color que se ve y nada lo dice en la tira (la duda volvió por los puntos); el ✓ de la talla «mantener»
  no dice por qué no hace falta colgarla; «Colgar en el piso · 2 tallas» se puede leer como 2 unidades.

## Estado de los 3 cambios del 12-oct
1. Talla y almacén a 12 px: **abierto y empeorado** por este rediseño (es el cambio 1 de arriba).
2. La leyenda sin cifras de ejemplo y los atajos con rótulo: **abierto** (la leyenda sigue con «2 en piso · +1 en almacén»).
3. Un solo vocabulario en el modal: **cerrado** (2026-10-13).

## Prueba ciega (agente Sonnet sobre 3 capturas a 1440 px; real: sin probar)
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la lista de la ropa de mi tienda; cada prenda con foto y números por talla; sigue tocar una prenda o "Colgar en el piso"» | sí |
| Primer intento | respondió las dos cosas (20 Blusa Emma M; la lista de prendas a colgar), con reservas por el aviso del cuadre | sí, con dudas |
| Pasos | 6 toques (+2 para cerrar); para la lista de colgar, recorrió las tarjetas a mano | el mínimo es 1 («Por colgar»), que no se leyó por estar en pausa |
| Dudas | «275 de 180 (provisional)» · el aviso «nunca se ha cuadrado» · «Piso en pausa» en el modal · **«Beige · 2 colores»** · **«3 tallas» con 4 vacías** · los cuadritos de la leyenda | no: 7 (2 de la tarjeta, en negrita) |
| Palabras no entendidas | «provisional», «por cuadrar», «Se acaban», «Sin ventas» (todas del marco o de los filtros) | no: 4, ninguna de la tarjeta |
| Errores evitables | esperaba «Colgar» dentro de «Más» (vive en el botón de al lado) | — |
| Orden de la mirada | foto → nombre y precio → número grande y botón | sí (contenido primero) |

## Segunda prueba ciega (2026-10-31, después de los 3 cambios; mismo agente Sonnet, misma tarea, capturas nuevas)
| Medida | Primera (antes) | Segunda (después) |
|---|---|---|
| Lectura de 5 s | bien, pero «no entendí qué es piso y qué es almacén» | bien, y sin preguntar: «los números grandes, lo colgado; los chiquitos de abajo (+6, +10), lo guardado» |
| Primer intento | sí, con dudas | sí, con dudas (las del aviso del cuadre, que son del marco) |
| Pasos | 6 toques (+2 para cerrar) | 4 toques; con lo que ya dice la lista, 2 |
| Lista de lo que hay que colgar | armada a mano; no supo cuáles son «las 3 tallas» de Pantalón Carla | **correcta y con tallas**: Pantalón Carla 28, 30 y 32, «la 34 tiene ✓ y no la conté» |
| Dudas de la tarjeta | «Beige · 2 colores» · «3 tallas» con 4 vacías | el 20 ¿es solo del Beige? (ahora por los puntos, no por el texto) · por qué la 34 lleva ✓ con 0 colgadas · «2 tallas» ¿tallas o unidades? · la letra de la talla ¿es talla o cantidad? |
| Dudas del marco | «275 de 180», el aviso del cuadre, «Piso en pausa», la leyenda | las mismas, más «2 pendientes hoy», «Recomendados», «Sin stock atrás» |
| Palabras no entendidas de la tarjeta | ninguna | ninguna («+6» se entendió con la leyenda) |

**Lo que cerró:** «3 tallas vs 4» (ley 3) y «Beige · 2 colores» como texto (ley 4); la lectura de piso y almacén ya no pide explicación. **Lo que queda de la tarjeta**,
a la lista aparte: que el número es del color que se ve (la duda volvió por los puntos), el porqué del ✓ con 0 colgadas (la leyenda lo nombra, pero no dice
por qué) y «· 2 tallas», que se puede leer como unidades. Notas que suben con evidencia [Observado]: **ley 1 a 8** (el tope sin la pasada real), **ley 3 a 8**.
Real: **sin probar**.

## Antes de decir «listo»
- Concurrencia: la tarjeta no guarda nada; lo que guarda (colgar, ajustar) no cambió y su `/chaos` es el del 12-oct. · Caída externa: sin foto se dibuja la
  categoría sobre el color (ADR-0333), sin cambio. · Persona sin contexto: la ciega la entendió en 5 s; real: **sin probar**.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-12 | `f2202e6ca` (+ arreglos de la corrida) | 6,9 · ley 1: 7 | 5 (crudo, 0 blockers) | primera corrida; F13, F8, B2, F7 y los tres ceros cerrados en la rama; los 3 cambios esperan OK |
| 2026-10-31 | `621fe25f1` | 6,9 (solo la tarjeta) · ley 3: 5 | 6 (de la tarjeta) | re-análisis de la tarjeta Vitrina (ADR-0589); el cambio 3 del 12-oct ya estaba cerrado, el 1 empeoró; 3 cambios nuevos esperan OK |
| 2026-10-31 (c) | ver el commit de «una sola regla de falta colgar» | 7,8 (solo la tarjeta) · leyes 1 y 3: 8 | 7 (de la tarjeta) | **cambio 3 hecho (opción A de Felipe)**: el botón, las celdas, el filo y la talla de entrada dicen lo mismo; la talla «mantener» con su visto; contraste del nombre sobre el ámbar corregido; **ciega repetida**: armó bien la lista de lo que hay que colgar, con tallas, en 4 toques (antes 6) |
| 2026-10-31 (b) | ver el commit de «Formidable: cambios 1 y 2» | 7,3 (provisional, solo la tarjeta) · ley 3: 5 | 7 (de la tarjeta) | **cambios 1 y 2 hechos con el OK de Felipe** (talla y almacén a 12 px, abrevia desde 2 tallas; el color sin «· N colores»); medido sin cortes en 26 anchos y sin texto bajo 12 px; leyes 4 y 5 suben a 7 y 8 (provisional: falta repetir la ciega); el cambio 3 espera su decisión |
