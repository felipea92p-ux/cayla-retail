# Formidable · Inventario ▸ Plan del piso ▸ Propuesta   (`/inventario/plan-del-piso`, pestaña «Propuesta»)

- **Fecha / SHA:** 2026-10-10 · `bd5b3c6f` (rama `claude/mix-categorias-question-1950f1`, cambios sin commitear) · **Dispositivo que manda:** escritorio (Mac mini o laptop del líder o la encargada de sede). 375 px se mide, pesa poco.
- **Pregunta que debería resolver (1 frase):** «¿Qué tan llena está mi tienda y la ropa está repartida como debería?» · **Protagonista:** la prenda (cuánto lugar tiene cada grupo en el riel).
- **Veredicto en una línea:** «Ahora la respuesta cabe en la primera pantalla y se contestan las tres preguntas bien, pero la tabla se rompe a 1024 px con el menú abierto, "Por cuadrar" no lleva a ninguna parte y la explicación del cálculo sigue en jerga.»
- **Escala de esta corrida (Felipe eligió «medio»):** medición del DOM a 1440, 1024 y 375 px y a los siete tamaños de `/multi-view-responsive` (yo) · **una** prueba ciega (1 agente, Opus, navegador local con datos inventados) · **un** revisor-escéptico (1 agente, Opus, solo lectura de código). 2 agentes en total.
- **Cómo se probó (límite importante):** la base local va 31 migraciones atrás y **no tiene las tablas del Plan del piso**, y es compartida con otras sesiones, así que no se tocó. Se armó una página de ensayo temporal (ya borrada) que
  llama al mismo `armarPropuesta` y a los mismos componentes con datos inventados que reproducen la captura de AQP (78 colgadas de 1,800; 5 ventas confirmadas, 210 sin registrar; 45 categorías por revisar). **La ruta real con su base
  no se vio en el navegador.** Sí corren contra el código real: `pnpm exec vitest run` (407 archivos, 157,043 pruebas), `tsc`, `eslint`.

## Notas (0–10) — del estado DESPUÉS de los 3 cambios
No hay nota «antes»: la corrida empezó con los tres cambios ya aprobados por Felipe. Del «antes» solo hay medidas (más abajo).

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega: contestó bien las tres preguntas (78 de 1,800 y que la cifra no es confiable; qué grupo tiene de más y de menos; qué hacer) y tocó el botón del aviso al paso 27 porque «parecía algo que me tocaba». Pero 34 pasos, 11 dudas, 11 palabras sin entender. **La lectura de 5 s no es concluyente:** su captura inicial salió con la animación de entrada a medias. Real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] 0 `.btn-primario` (medido antes del cambio; el botón nuevo del aviso es `fantasma`) y 1 botón en el aviso; la respuesta (`Hoy` y `Propuesta`) está en la primera pantalla. Pero debajo hay cuatro bloques más (Mancuerna, tabla, fuera del riel, nota) que dicen lo mismo |
| 3 Simplicidad profunda | 5 | [Observado] «entre 9.1 y 81.6 · 2 ventas» y «Peso de la venta 6 %» se muestran crudos; la nota «Cómo se calcula» habla de «3.3 ventas independientes» y «tope 75 %». No hay un veredicto («la propuesta es casi pura industria porque hay pocas ventas») |
| 4 Lenguaje de tienda | 5 | [Observado] palabras que no entendió: «cuadrar», «Industria», «Peso de la venta», «Destino/Rutina/Ocasional…», «regularizarlas», «ventas independientes», «provisional». «Riel» y «gancho» las interpretó bien |
| 5 Contenido primero | 7 | [Medido] el riel de «Propuesta» pasó de y = 1,236 a **y = 774** (primera pantalla a 1440 × 900); la sección, de 1,241 a 377 px; la página, de 3,792 a 2,928. A 1024 × 768 sigue justo en el borde |
| 6 Lo difícil, a un toque | 4 | [Observado] «Destino/Rutina…» solo tienen su explicación en `title` (al pasar el mouse): la ciega no la vio ni pasando el mouse ni tocando. [Medido] «Cómo se calcula» está siempre abierta; no hay «¿Por qué?» |
| 7 Perdonar antes que preguntar | 9 | [Medido] la pantalla no guarda nada; «Ver cada gancho» y el aviso son estado de interfaz y se deshacen con otro toque. La pestaña que se deja preparada en Grupos no se pierde (los paneles siguen montados) |
| 8 Quitar antes de agregar | 6 | [Medido] se quitaron ~960 px de contornos iguales (ganchos plegados) y una tarjeta. [Opinión] cada grupo se dice tres veces (barra, Mancuerna, tabla) y «Diferencia: —» sale en todas las filas |
| 9 De punta a punta | 5 | [Medido] a 1024 px con el menú abierto la tabla «Lugar de cada grupo» **tiene la celda «Grupo» en 0 px** y «Diferencia» se sale 52 px. [Observado] «Por cuadrar» no lleva a ninguna parte. A 375 px funciona sin desborde; el aviso queda apretado |
| **Leyes (promedio)** | **6,0** | una ley en 4 (lo difícil a un toque) y tres en 5; la ley 1 no pasa de 8 sin colaboradora real |
| **Oficio visual** | **7** (provisional) | [Medido] 6 de 8 comprobaciones fallan, **las mismas 6 que antes del cambio**, y casi todo es del marco (Salir, Buscar, «Ctrl K», Actividad) o ruido del medidor: ver «Qué midió de más». Propio de la pantalla: 1 px de corrimiento en la tarjeta con `acento`, el botón del aviso mide 29 px (objetivo 32) |

**Qué midió de más el script** (falsos positivos, comprobados): 12 «blancos bajo el mínimo» son los tramos de las barras (12 px pintados, pero el área del mouse mide **24 px**: `::before` de `BarraApilada`, medido con `elementFromPoint`); «Propuesta 1.06:1» es el texto de la pastilla activa, que se dibuja sobre un indicador que
el script no ve; «Por cuadrar ✕ Esta sede…» es una nota de dos renglones cuya caja empieza más a la izquierda; los «solapes» y el texto cortado del lateral son del marco.

## Los 3 cambios (hechos y medidos)
Felipe dio el OK el 2026-10-10 («aplicamos»). Ninguno toca el cálculo ni una regla de dinero o stock.
1. **El riel son dos barras.** Antes: dos canvas de 478 px con un gancho por prenda (~1,700 contornos vacíos). Después: dos `<BarraApilada>` (377 px la sección entera), con los ganchos detrás de «Ver cada gancho (1,800)». Ley 5 y 8. [Medido] y = 1,236 → 774.
2. **Tres tarjetas con la misma forma.** «Caben» se funde en «78 de 1,800»; «Ventas confirmadas» gana su barra; los miles llevan coma («1,800»). Ley 2 y 3. [Medido] las tres a 149 px de alto y la barra a 17 px del fondo.
3. **Un aviso que lleva a Grupos.** Antes: una nota que describía dónde ir. Después: `<Aviso>` con botón que abre la pestaña y pasa el foco a ella. Ley 2 y 9. [Medido] cambia de pestaña en < 100 ms; [Observado] la ciega lo tocó sola.

**Arreglos que salieron del revisor-escéptico (ya hechos):** (1) las dos barras ahora se miden contra la misma escala aunque cuelgue más de lo que cabe; (2) el aviso separa «por revisar» (la propuesta usa su grupo) de «sin grupo» (no entran al reparto): el primer texto era falso para las segundas;
(3) el sexto grupo tiene un solo color en barras, leyenda, Mancuerna, Historia y canvas (la barra de Historia ya tenía el hueco `bg-sand`); (4) «Total del riel» decía «1800»; (5) «1 confirmadas», «1 prendas»; (6) el foco va a la pestaña, no a un panel sin contorno visible; (7) tocar lo libre de una barra suelta el grupo fijo, como hacía el canvas.

## Lo que sobra (ley 8)
- La **Mancuerna** repite los mismos porcentajes de la tabla de abajo, con una leyenda de cuatro símbolos que la ciega no supo distinguir: se propone esconderla tras un toque o unirla con la tabla.
- **«Diferencia: —» en todas las filas** mientras la sede está «por cuadrar»: decirlo una vez, no en cada fila.

## Lo que no pediste y importa más  *(corregido el mismo día, ver «Actualización» al final)*
**La tabla «Lugar de cada grupo en el riel» no se puede leer a 1024 px con el menú abierto** (la celda «Grupo» mide 0 px, el nombre del grupo queda en 45 px y «Diferencia» se sale 52 px de su tarjeta). Desde 1280 px está bien. Es de antes de este cambio: `PLANTILLA` de `PropuestaDelMix.tsx:18` suma 38 rem fijos
y deja el resto a la columna del nombre. Según `/multi-view-responsive` es **Bloquea** (una columna clave con 0 px). Arreglo sugerido: un ancho mínimo de la tabla con su propio scroll horizontal, o dejar de fijar 38 rem bajo ~1280 px.

## Lista aparte (no se ejecuta)
1. ~~**[Bloquea]** La tabla a 1024 px (arriba).~~ **Hecho** (ver «Actualización»).
2. **«Por cuadrar» sin camino** (ley 2 y 9): el chip y la nota «Esta sede todavía no cuadró su piso» no llevan a nada; la ciega tocó el chip esperando cuadrar. Un enlace a `/inventario/cuadrar` (solo navegación; depende del módulo de quien mira).
3. **Los roles («Destino», «Rutina»…) solo por `title`** (ley 6): pasarlos a un toque con `<Ayuda>`, como hace `TarjetaCifra`.
4. **«Cómo se calcula» en jerga** (ley 3, 4, 6): «3.3 ventas independientes», «tope 75 %», «la industria pesa como 50». Una frase de veredicto y el detalle en un «¿Por qué?».
5. **Rango «entre 9.1 y 81.6 · 2 ventas»** con muestra mínima (ley 3): decir «muy pocas ventas para saberlo» en vez del intervalo.
6. **La barra de «Hoy» con 78 de 1,800** tiene tramos de 3 a 16 px y el resaltado casi no se nota [Observado]; la leyenda con cifras es el equivalente, pero se podría decir «30 de 78» en la nota de la barra.
7. **Pieza compartida `TarjetaCifra`:** con `acento` (borde rojo de 2 px) el contenido se corre 1 px a la derecha respecto de las demás tarjetas (359 contra 358).
8. **Pieza compartida `Aviso`:** con acción, a 375 px el botón (`nowrap`, ~190 px) le deja unos 80 px al título [Medido: título en 3 renglones]. Apilar la acción bajo el texto bajo ~480 px.
9. **Teclado:** barra «Hoy» + barra «Propuesta» + leyenda son 18 paradas de Tab para 6 estados (cada una repite el mismo grupo). Es de `BarraApilada` cuando responde; Compras tiene lo mismo.
10. **Contraste del sexto tramo** (taupe 45 %) contra la pista: 1.8:1 en claro, 2.2:1 en oscuro [Medido por el revisor]; antes 1.0. Lo que dice la barra está también en texto.
11. **Barra de un solo relleno:** «Cuelga hoy» usa `BarraApilada` con un tramo; cuando `docs/unificar/grafico.barra.md` decida la ronda de avances, migra.
12. A 1920 px el contenido ocupa el 63 % del ancho útil (sugerencia, no rotura).

## Prueba ciega
Agente Opus, sin acceso al repo, tarea en lenguaje de tienda: «dime qué tan llena está la tienda, si la ropa está repartida como debería y si hay algo que yo tenga que hacer». 

| Medida | Resultado | Pasa si |
|---|---|---|
| Lectura de 5 s | **No concluyente**: su captura salió con la animación de entrada a medias (solo pestañas y el aviso) y la frase que escribió describe eso | coincide con la finalidad |
| Primer intento | Contestó bien las tres preguntas sin pedir ayuda (sus cifras: 78 de 1,800 «casi vacía, pero la propia pantalla dice que no es confiable»; reparto por grupo; dos pendientes) | sí |
| Pasos | **34** (el mínimo razonable, unos 6) | mínimo + 1 → **no pasa**: exploró todo |
| Dudas | 11, entre ellas «AQP vs. Lima», «¿cuántas hay de verdad?», «¿lo tengo que hacer yo o mi jefa?», «¿tengo que registrar esas 210?» | cada una es un hallazgo |
| Palabras no entendidas | 11 (lista en la ley 4) | cero → no pasa |
| Errores evitables | 0 destructivos; 4 toques sin efecto en cosas informativas (chip «Por cuadrar», tarjeta «Cuelga hoy», «Destino», el gráfico) | cero |

**Hallazgos descartados** (eran del andamio o del panel, no de la pantalla): el encabezado decía «Tienda AQP» y el selector «Tienda Lima» (mi página de ensayo fijaba «AQP»); la pestaña Grupos decía «(ensayo)»; «la pantalla siguió mostrando Historia 2 s»:
verificado en el DOM, la pestaña activa y el panel visible coinciden en < 100 ms en cuatro clics seguidos; las capturas se atrasan cuando el panel del navegador está oculto (pasó varias veces en esta sesión).
**Veredicto del escéptico sobre mis afirmaciones:** A (solo presentación) confirmada; B (casos borde) matizada: fallaba con más colgadas que capacidad; C (servidor/cliente) y D (accesibilidad) confirmadas con matices; E («sin movimiento nuevo») refutada: el aviso y las barras traen el movimiento de sus piezas;
F (un color por grupo) era un problema visible. Todo lo corregible se corrigió.

## `/multi-view-responsive` (los siete tamaños, solo la pantalla)
Vistas: Propuesta con los ganchos cerrados × 7 anchos (1024 × 768, 1280 × 720, 1366 × 768, 1440 × 900, 1536 × 864, 1600 × 900, 1920 × 1080) y con los ganchos abiertos a 1024. Datos de ensayo. **Un hallazgo, de la pantalla y anterior al cambio:** [Bloquea] la tabla a 1024 px con el menú abierto (arriba); la columna «Grupo» mide 183 px a 1280, 269 a 1366 y 294 a 1440 (a 1536, 1600 y 1920 solo se midió que la tarjeta cabe).
El resto que marcó el script es del marco (lateral con texto cortado y «solapes» de sus submenús) o falsos positivos. Sin desborde de página en ningún ancho; con los ganchos abiertos a 1024, los canvas miden 615 × 302 y no desbordan.

## Antes de decir «listo»
- **Concurrencia:** la Propuesta no guarda; el botón del aviso solo cambia de pestaña. Lo que guarda es la pestaña Grupos (`fijar_grupos_de_categorias`), que no se tocó y ya rechaza el cambio de otra persona (PT409, ADR-0352). **Sin ejercitar en esta corrida.**
- **Caída externa:** `page.tsx` degrada en tres niveles (grupos, propuesta, historia: «No se pudo… No se perdió nada» con «Reintentar»). Leído en el código; **no ejercitado en el navegador** (la página de ensayo no pasa por esas lecturas).
- **Persona sin contexto:** la prueba ciega lo respondió (con el límite de los 5 s de arriba); colaboradora real: **sin probar**. `/chaos` **no se corrió**: la parte nueva no guarda, la que guarda (Grupos) no se tocó, y su esquema no existe en la base local.

## Actualización 2026-10-10 (c) — la tabla a 1024 px, arreglada
Felipe dijo «sí, hazlo». **Qué se hizo:** las dos tablas de la Propuesta («Lugar de cada grupo en el riel» y «Fuera del riel») se desplazan dentro de su tarjeta (`scroll-cayla overflow-x-auto`, la convención de `Tabla`, ADR-0169) y tienen un ancho mínimo desde `sm`
(56 rem y 40 rem: las columnas fijas, las separaciones y el relleno de la fila suman 45.5 rem y el resto es para «Grupo»). **Medido** con la misma página de ensayo:
| Ancho (menú abierto) | «Grupo» antes | «Grupo» después | Desplazamiento | Desborde de página |
|---|---|---|---|---|
| 1024 | **0 px** (y «Diferencia» 52 px fuera de la tarjeta) | **168 px**, nombre sin recortar, encabezado sin encimarse | sí: 241 px dentro de la tarjeta | 0 |
| 1280 | 183 px | 183 px | no | 0 |
| 1440 | 294 px | 294 px | no | 0 |
| 375 (filas apiladas) | — | 301 px | no | 0 |

**Límite que queda:** al desplazar a la derecha para ver «Diferencia», el nombre del grupo sale de la vista (la primera columna no se queda fija). Las filas van en el mismo orden y es solo a 1024; si molesta, la columna fija es el siguiente paso.
**Nota:** la nota de la ley 9 (5) se puso con la tabla rota y no se recalificó: el informe no inventa una nota sin medirla de nuevo.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `bd5b3c6f` | 6,0 · ley 1: 6 | 7 (provisional) | los 3 (riel en barras, tres tarjetas, aviso a Grupos) + 7 arreglos del escéptico |
| 2026-10-10 (c) | — | sin recalificar | — | la tabla a 1024 px (Bloquea) |
