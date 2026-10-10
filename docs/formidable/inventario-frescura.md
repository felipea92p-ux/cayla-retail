# Formidable · Inventario ▸ Frescura del piso   (`/inventario/frescura`)

- **Fecha / SHA:** 2026-10-05 · `ab866fc82` (rama `claude/ultra-prompt-ui-ux-apple-cf045a`) · **Dispositivo que manda:** escritorio (Mac mini); 375 px solo medido en estático
- **Pregunta que debería resolver:** «¿Qué prendas de mi tienda llevan demasiado tiempo colgadas sin venderse y qué hago con cada una?» (de ADR-0208, no de la captura)
- **Protagonista:** la prenda (modelo + color) · **Quién la usa:** la encargada de sede; el líder como segundo usuario
- **Veredicto en una línea:** «Se entiende qué es, pero no qué te toca hacer: la decisión está en una cifra ámbar y la prenda queda de relleno entre números.»
- **Corrida del piloto:** 4 agentes (medidor, revisor de leyes, ciego, escéptico). Evidencia: captura de producción (TRU, 1440 px, pasada por Felipe) + código + la
  app local con la base de **semilla** (4 prendas, ninguna «Envejecida», sin las migraciones recientes). Por eso el estado **real** de TRU solo se lee en la captura.

## Notas (0–10)

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | **sin nota** | [Observado, débil] la ciega acertó lo básico en 5 s pero **no pudo hacer la tarea** (base sin prendas envejecidas) y su informe no trajo pasos ni conteos. Colaboradora real: sin probar |
| 2 Una pregunta, una respuesta | **3** | [Medido] el título es el nombre del módulo; 4 cifras (3 sin acción) + «Por decidir» dos veces (cifra y píldora) + 7 columnas + 2 párrafos antes de la tabla; 0 `btn-primario` a la vista |
| 3 Simplicidad profunda | **3** | [Medido, captura] «2 *quizá más* días», «vendió 1, se esperaban 0.6», «Pocos datos» ×3, «76 % de lo medido es Nueva» |
| 4 Lenguaje de tienda | **5** | [Medido] sugerencias y hoja «Ya decidí» bien escritas; pero Vigente/Envejecida/Crítica, «Rapidez», «Referencia de CAYLA», «Sin dato» son jerga |
| 5 Contenido primero | **3** | [Medido] la prenda es un mosaico de 34×42 px con un ícono de camiseta **sin color ni categoría** (viola ADR-0333); el nombre pesa 14 px, menos que las cifras de 42 px |
| 6 Lo difícil, a un toque | **5** | [Medido] la hoja de la prenda explica el porqué con un toque (bien); pero la metodología (escala, referencia, nota de 5 párrafos) va **siempre abierta**. *Subió de 4 a 5 tras el escéptico: casi nada vive solo en un hover* |
| 7 Perdonar antes que preguntar | **9** | [Medido] «Anotar» no pregunta y ofrece «Deshacer» 10 s; «Quitar lo anotado» pide una nota opcional. Es el acierto de la pantalla |
| 8 Quitar antes de agregar | **3** | [Medido] ver «Lo que sobra» |
| 9 De punta a punta | **5** | [Medido] bien: cargando, sin permiso, Taller, filtro vacío, y **el aviso parcial de decisiones salió de verdad y la pantalla siguió dibujándose** [Observado]; mal: el vacío no dice cómo colgar, «Por decidir 0» cae en «Ninguna prenda con estos filtros», el estado de «pocas ventas» se repite en vez de decirse una vez |
| **Leyes (promedio de las 8)** | **4,5 (±1)** | **Hay 4 leyes en 3 (2, 3, 5 y 8)**; el promedio las esconde |
| **Oficio visual** | **5 (provisional)** | [Medido] 6 pasan, 7 fallan, 1 sin verificar. Fallan: blancos a 375 px, contraste del foco, foco en combos/filas, 25 textos bajo 12 px, jerarquía (10 tamaños), radios (9) y filas con alturas desiguales (2), y un hueco de 6,3 px. Pasan: blancos con mouse, contraste del texto, rojo (1), teclado, sombras, orden de pantalla |

## Los 3 cambios de mayor impacto
1. **Una fila = una prenda = una frase.**
   - **Antes:** 7 columnas, 3 chips, mosaico de 34 px sin color, números con decimales.
   - **Después:** miniatura mayor con `<MiniaturaPrenda>`/`<SinFoto>` (ADR-0333) + nombre y color + **una palabra de estado en lenguaje de tienda** («Recién llegada», «En su tiempo», «Se está quedando», «Hay que moverla», «Aún no se sabe») + una frase de qué hacer + el botón. «Rapidez», «Vendió 30 d», tallas, «quizá más» y «Pocos datos» bajan a «¿Por qué?» (la hoja ya los tiene).
   - **Leyes:** 3, 4, 5, 6, 8 · **Esfuerzo:** L (hay que traer color y categoría desde `fn_frescura_sede`/`categoria_id`) · **Verifica:** ciega a 5 s con prendas de varios estados.
   - **Regla de negocio:** no (renombrar estados no cambia los cortes). **OK de Felipe: presentación.**
2. **Subir lo que le toca a la persona y bajar lo demás.**
   - **Antes:** título «Frescura del piso» + 4 cifras + 2 párrafos + filtros; la decisión está en una cifra ámbar y una píldora repetidas.
   - **Después:** título que es la pregunta («¿Qué lleva mucho tiempo colgado?»), **un solo** renglón «N prendas esperan tu decisión» y esas prendas **primero**; el resto de la tienda plegado en «Ver todas».
   - **Leyes:** 1, 2, 5, 8 · **Esfuerzo:** M · **Verifica:** ciega y 375 px.
   - **Regla de negocio:** presentación; **pero qué significa «Por decidir» es de Felipe** (ver «Decide Felipe»).
3. **Esconder la metodología y cuidar los estados.**
   - **Antes:** la frase «cada prenda se compara con las demás…» ×3, la escala por categoría, la «Referencia de CAYLA», «Ventas a pedido: sin datos todavía» (un literal sin dato detrás) y la nota de 5 párrafos, siempre abiertas.
   - **Después:** un solo toque «¿Cómo se lee esto?» abre todo eso; «Ventas a pedido» desaparece hasta que haya dato; vacío que dice cómo colgar; «Nada por decidir: todo en orden»; la cabecera de categoría omite el tramo repetido cuando p50 = tMax («a los 2 días… la mitad; a los 2, 5 de cada 10»).
   - **Leyes:** 4, 6, 8, 9 · **Esfuerzo:** S–M · **Regla de negocio:** no.

## Lo que sobra (ley 8; se propone esconder o mover, nunca borrar datos)
«Por decidir» dos veces (cifra y píldora) · las cifras de promedio y «% Nueva» (con 4 ventas son ruido) · «Ventas a pedido» · la frase de comparación repetida 3 veces · la nota de 5 párrafos al pie · el chip «¿De qué temporada es? Complétala» (es una tarea de Catálogo dentro de una pantalla de frescura) · las columnas «Rapidez» y «Vendió 30 d» · los dos pies de leyenda.

## Lo que no pediste y importa más
**En TRU hoy el semáforo se apoya en 4 ventas en 120 días** (la captura lo dice) **y la pantalla lo presenta con todo su aparato de confianza como si fuera una medida.** `nivelPorVentas` marca «Pocos datos» bajo 10 ventas (`lib/frescura-reglas.ts:753-758`), y ese aviso se repite en la categoría, en el estado y en la rapidez de cada fila: la encargada lee «Vigente», «Más rápida que las demás» y «Pocos datos» juntos y no sabe a cuál creerle. Falta **un solo aviso de pantalla** («todavía hay muy pocas ventas en Tienda TRU para decir qué se queda: en unas semanas lo verás»); con él, casi todos los chips sobran. *Matiz del escéptico: «casi todos los 5 por decidir son temporada pasada» solo vale para las categorías sin p75; verificar por categoría.*

## Decide Felipe (negocio, no diseño)
1. **¿Qué se decide en «Por decidir» y entre qué opciones?** Hoy el nombre no lo dice y solo la hoja de cada prenda lo explica (ley 1).
2. **¿Se muestra el semáforo cuando hay menos de 10 ventas?** Si no hay base, la opción honesta es «aún no se puede juzgar» una sola vez (cambio de negocio: toca qué se afirma, no cómo se dibuja).

## Hallazgos que se descartaron o achicaron (veredicto del escéptico)
- **Descartados:** «10 columnas» (son **7**: el medidor no mostró cómo contó); «el chip *días en el piso* no reaccionó» (es un dato, no un control: la ciega hizo clic en un dato); «Anotar/Deshacer es un problema» (es un acierto); «información perdida en hovers» (casi todo está a la vista en otro sitio).
- **Achicados:** dos «blancos de 16 px» eran **enlaces en línea** (exentos por WCAG 2.5.8) y **«Salir», el buscador (4,15 y 3,32:1) y el selector de sede son del chrome global del ERP**, no de Frescura: van aparte (ver abajo). «Se contradice» → «repite el mismo dato». «Lo demás está al día» es la frase estándar del repo, no un defecto de esta pantalla. «Ventas a pedido» es un marcador deliberado (ADR-0208), pero ocupa la cabecera con un «sin datos» permanente.
- **Del skill, arreglados en esta corrida:** mala cita de WCAG (2.4.11 era otra cosa), faltaba la excepción de enlaces en línea y la regla de 4 px chocaba con los medios pasos de Tailwind (2, 6, 10, 14).

## Lista aparte (no se ejecuta sin que Felipe lo mande)
- **Foco visible débil, compartido por todo el ERP:** combos y buscador (`outline-none`, borde de 1 px a ≈2,1:1, `campos.tsx:710`, `globals.css:439`), filas de prenda (2 px a ≈2:1), cifra «por decidir» (solo cambia el fondo, ≈1,1:1) y la pastilla del selector de sede, que por código **no tiene ningún indicador**. Se arregla **una vez** y llega a todas las pantallas. *(Cálculo de contraste por código y por mezcla de alfa; no son lecturas directas del navegador.)*
- **Chrome global:** «Buscar…» a 4,15:1 y «Ctrl K» a 3,32:1 (`BuscadorGlobal.tsx`); «Salir» de 16,5 px de alto; 18 Tab para salir del lateral sin «saltar al contenido».
- **Texto bajo 12 px:** 25 usos en `components/frescura` (26 con un 10 px), no todos de contenido que importa.
- **Hoja «Ya decidí» sin `pie-hoja-fijo`:** en un laptop de 768 px «Anotar» puede quedar bajo el pliegue. *Sin probar.*
- **Cifras que parecen iguales y solo una es botón** (`ResumenSede.tsx`, componente compartido del ERP).
- **Espacio doble** antes de «· Ventas a pedido» (cosmético).
- **375 px:** 12 blancos bajo 44 px, la mayoría del chrome; el comportamiento de la tarjeta móvil, sin probar.

## Prueba ciega
| Medida | Resultado | Calidad de la evidencia |
|---|---|---|
| Lectura de 5 s | coincide («ver prendas que llevan tiempo colgadas») | autorreportado |
| Primer intento sin retroceder | sí | autorreportado |
| Pasos | ~20 (sin lista) | **no entregó la lista pedida** |
| Dudas | «quizá más», «de lo medido es Nueva», qué dispara «Envejecida», por qué una prenda tiene tallas pero «—» en el piso | 4 |
| Palabras no entendidas | «quizá más», «de lo medido es Nueva» | 2 |
| Errores | ninguno reportado | |
| ¿Terminó la tarea? | **parcialmente**: la base no tenía prendas envejecidas | **la tarea no era alcanzable** |
> El primer ciego (Sonnet) fue bloqueado por un filtro de seguridad de la API (falso positivo) y se relanzó con Haiku, que entregó un informe flojo. **La ley 1 no se califica**
> hasta repetir con datos que permitan hacer la tarea y, después, con 3 a 5 colaboradoras reales.

## Antes de decir «listo»
- **Concurrencia:** pantalla de solo lectura salvo «Ya decidí» (agrega una fila, no actualiza). **No probado aquí:** la base local no tiene esas tablas.
- **Caída externa:** el fallo de lectura de «lo ya decidido» ocurrió de verdad y la pantalla **siguió dibujándose y lo avisó** [Observado]: degrada con gracia.
- **Persona sin contexto:** ciega inconclusa, real sin probar. **Está calificada, no certificada.**

## Después de ejecutar los 3 cambios (2026-10-05, mismo día; Felipe aprobó)
Commits `afab1e7a9` (cambio 1), `6506121ac` (cambio 2), `a205dc895` (cambio 3) y `724dd4172` (arreglo del medidor). Verificado en una página de ensayo con la salida
real guardada de la base (17 prendas, 2 por decidir; borrada al terminar) a 1440 px y 375 px, y con las pruebas (386 de Frescura y 444 con las reglas del repo, todas en verde).
- **[Medido]** columnas de la tabla **7 → 4**; cifras de la cabecera **4 → 2**; «Por decidir» **3 veces → 1** (frase) más su píldora; la metodología pasó de siempre abierta a un toque.
- **[Medido]** el medidor, al volver a pasar, **encontró un defecto que yo había introducido** (los botones nuevos medían 16 px) y quedó corregido. Contraste del texto: 0 fallas; huecos fuera de escala: 0.
- **Lo que NO se puede afirmar:** las notas de las leyes **no se recalificaron**. Hacerlo exige repetir los cuatro agentes con datos que permitan la tarea y, sobre todo, 3 a 5 colaboradoras reales.
  El oficio visual medido ahora (6 de 8 fallan, sin el menú lateral ni el buscador) **no es comparable** con el de antes (7 de 8, con el chrome global de la app real): la página de ensayo no los trae.
- **Pendiente de la lista aparte:** texto bajo 12 px (chips y leyendas) y el foco visible débil de todo el ERP (hay una tarea creada para cada uno). Las cifras de promedio y «% Nueva» **no son código muerto**: «Las N tiendas» (`FrescuraTiendas.tsx:55-56`) las sigue usando.

## Re-análisis 2026-10-09 · la pantalla de dos niveles y la vara de CAYLA (ADR-0208, act. 2026-10-07)

- **Fecha / SHA:** 2026-10-09 · `75e5a910` (`main` con los PR #889 y #892) · **Dispositivo que manda:** escritorio (Mac mini); 1024×768 y 375×812 medidos
- **Pregunta que debería resolver:** «¿Qué prendas de mi tienda llevan demasiado tiempo colgadas sin venderse y qué hago con cada una?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 segundos y la tarea se termina sola; lo que sobra es repetición (el mismo conteo seis veces, la contabilidad del almacén al pie) y lo que falta es que lo por decidir se vea sin bajar.»
- **Corrida:** 4 agentes (medidor = el script de la skill corrido por mí a 1440/1024/375 + `focus`, `sugerir`, `ui.mjs`, `tema:auditar`; ciega; revisor de leyes sobre código y capturas; escéptico con el navegador). Base local **sembrada** (Tienda Lima: 12 blusas vendidas + «Zz Fx Blusa Vieja» 40 días colgada; el cron local de la vara corrido: Camisas y Blusas «Sólido», 24 ventas en 60 días). Esta vez la tarea **era alcanzable** y la ciega la terminó.
- **Del informe anterior:** cambio 1 (una fila = una prenda = una frase) **cerrado**; cambio 3 (metodología a un toque, estados cuidados) **cerrado**; cambio 2 (lo que te toca arriba) **parcial**: la frase, «Esperan tu decisión» y lo por decidir primero están, pero el tablero (nivel 1, decisión 3 de Felipe) vuelve a poner la decisión al borde del pliegue y el conteo se repite.

### Notas (0–10)

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | **6** | [Observado] ciega: a los 5 s dijo bien qué era («qué tan nueva o vieja está cada prenda colgada; una pide decidir») y terminó la tarea al primer intento, sin preguntar, verificando por 5 señales; pero **13 toques** donde bastaba 1 (dudó en tocar «La cambié de lugar» «por si anotaba de golpe sin preguntar» y fue por el detalle → «Ya decidí» → opción → nota → Anotar), 11 dudas y 15 palabras. Real: **sin probar** |
| 2 Una pregunta, una respuesta | **6** | [Medido] la pregunta está escrita y contestada en la cabecera (`fraseEncabezado`); un solo `btn-primario` a la vista. Pero hay dos preguntas por diseño (tablero «Cómo está el piso» antes de «Esperan tu decisión», decisión 3) y a 1440×900 la primera prenda asoma por 10 px (fila en y 821–910; con ≥1 por decidir, la franja la lleva a ≈867 y el botón a ≈904); a 1024 hacen falta 237 px de scroll y a 375, 826 (tablero 727 px + filtros 264) |
| 3 Simplicidad profunda | **7** | [Medido] la fila es un veredicto («Hay que moverla · Lleva 40 días · No se mueve: pruébala 7 días en otro lugar»); decimales e índice solo en la hoja. Pero el chip de vara del tablero («Sólido / Aceptable / Aproximado / Contra CAYLA / Sin ventas») es un nivel de confianza en una palabra, no un veredicto, y **«Sin ventas» sale tachado** en 3 de 4 filas (`Chip` tacha el tono `apagado` por defecto, `Chip.tsx:51,75`; `FrescuraTablero.tsx:59` no pasa `tachado={false}` como sí hace `EstadoChip`); «quizá más» sigue en la hoja (`FrescuraDetalle.tsx:204`) |
| 4 Lenguaje de tienda | **7** | [Medido] estados y frases en palabras de tienda, tuteo, prueba de jerga en verde. Jerga real que nadie decidió: «su reloj está en pausa» (`FrescuraPanel.tsx:446`). Nombres decididos que la ciega no entendió: «Sólido», «Aproximado», «Vara de CAYLA» (decisiones 2 y 3 del 2026-10-07). Textos que la ciega leyó ambiguos: «Ya decidí» (¿botón o afirmación?), «Ver las 2 tiendas» (¿cambia de tienda?). «Eres admin…» ×2 es `ComboResponsable`, pieza compartida |
| 5 Contenido primero | **6** | [Medido] la prenda pasó de 34×42 sin color a `MiniaturaPrenda` de 60×60 con su color y su categoría (ADR-0333) y nombre de 15 px; sigue pesando menos que el título (46), las cifras (42) y las 4 barras del tablero (≈520×12), y llega después de 321 px de tablero y 110 de filtros |
| 6 Lo difícil, a un toque | **9** | [Medido] «¿Cómo se lee esto?» nace plegado con toda la metodología; cada fila tiene «¿Por qué?» y la hoja trae el porqué, la regla, cómo se vende, tallas y datos; las cifras de la barra van en texto, nada vive solo en hover. Falta: el chip de vara del tablero no tiene su porqué en la fila (vive en «¿Cómo se lee esto?») |
| 7 Perdonar antes que preguntar | **9** | [Medido] inventario del código: filtros, tablero, hoja → reversibles sin preguntar; «La cambié de lugar» / «La dejo hasta agotar» / «Anotar» → escriben sin «¿seguro?» con **Deshacer 10 s** (dentro del rango del repo: 7–15 s) y después **«Quitar lo anotado»** sin límite; la base es de solo agregar; lo que mueve stock navega a su pantalla. La única confirmación («¿Quitar lo anotado?») está justificada: no se puede deshacer |
| 8 Quitar antes de agregar | **5** | [Medido] con 1 por decidir, el **«1» se dice 6 veces** (cabecera, tablero, píldora, franja, grupo, pie) y el total 3; con 0, «Nada por decidir» ×5 + «Por decidir 0»; el pie lista **12 prendas por nombre en 6 renglones** (8 guardadas «y 4 más», 6 nunca colgadas: contabilidad del almacén en la pantalla de decidir); «Decididas 0» filtra cero; 3 de 4 filas del tablero dicen «Nada por decidir · Sin ventas»; «Toca una categoría…» es un manual de una línea |
| 9 De punta a punta | **7** | [Medido] bien: cargando, sin permiso, Taller, lectura caída con «Volver a intentar», sin lectura de decisiones (la fila solo ofrece «Ver por qué»), sin vara de CAYLA, error al anotar en 3 líneas junto al botón, vacío que dice cómo colgar, 375 px con botones de 44. Mal: los 4 vacíos, el buscador y los 2 avisos son a mano y no las piezas únicas `<Vacio>`, `<Buscador>`, `<Aviso>` (decididas el 2026-10-08, después de cortar la rama; las firmas de `familias.mjs` no los ven, por eso la deuda dice 0); la silueta de carga es la vieja (34×42, sin tablero: la pantalla salta ≈350 px); la hoja sin lectura dice «Vuelve a intentar» sin botón; la transición «1 por decidir → se ven las 5» no se anuncia |
| **Leyes (promedio de 9)** | **6,9 (±0,5)** | ninguna ley en 3; la más baja es la 8 en 5. Antes: 4,5 con cuatro leyes en 3 |
| **Oficio visual** | **7** | [Medido] 10 pasan (contraste de texto y de foco, foco visible por regla global, texto mínimo, alineación —todo en x = 333 dentro de la tarjeta—, espaciado par, color, teclado, sombras, orden) / 4 fallan: blancos con mouse (el nombre 117,8×18,8 y «¿Por qué?» 60,3×16,3, con la fila entera como objetivo equivalente: no blocker), blancos con dedo (los mismos a 375), jerarquía (9 tamaños; 6 dentro de la tarjeta), radios y alturas (6 radios visuales; filtros 40 / 31,5 / 28 y «¿Cómo se lee esto?» cae solo a una segunda línea a 1440 y 1024: 38 px de pliegue). Antes: 5 provisional |

Lo que el medidor marcó y el escéptico **refutó**: los «bordes casi alineados» (333 vs 334 es la caja contra su `<input>`; el resto, bloques distintos a 500 px) y el «hueco de 14,3 px» (son alturas de línea, no huecos); los textos pegados que leyó la ciega («8 dla mitad», «Camisas y Blusas1 prenda») son del lector de textos, no de la pantalla; «Deshacer se fue solo» es el patrón del repo. **Del chrome, aparte:** la cabecera del módulo entra 0,85 s después del contenido (`anim-sube` de `EncabezadoPagina`, no de Frescura), «Salir» 16,5 px, el buscador global a 4,15:1, la línea sede·fecha a 11 px, los combos y la caja a 40 px con dedo.

### Los 3 cambios de mayor impacto

1. **Que lo por decidir se vea sin bajar.**
   - **Antes:** [Medido] tablero de 321 px (727 a 375) + filtros de 110 px con «¿Cómo se lee esto?» caído a una segunda línea + franja: la primera prenda por decidir al borde a 1440 y bajo el pliegue a 1024 y 375; la silueta de carga no tiene tablero y la pantalla salta al cargar.
   - **Después:** con algo por decidir, el tablero se dibuja **compacto** (una línea por categoría: nombre · barra · «N por decidir» solo si N > 0 · la vara solo cuando es la excepción; ≈36 px por fila, cifras de la barra en el `aria-label` y en «¿Cómo se lee esto?»), y vuelve a su forma completa cuando no hay nada por decidir (ahí vale como mapa). La fila de filtros cabe en una línea («¿Cómo se lee esto?» pasa junto al título del tablero). La silueta de carga dibuja el tablero y filas de 89 px con cuadrado de 60.
   - **Leyes:** 2, 5, 9 · **Esfuerzo:** M · **Decide:** presentación (respeta la decisión 3: tablero arriba, lista abajo; solo cambia cuánto ocupa el tablero cuando hay algo que decidir) · **Verifica:** con la base sembrada (≥1 por decidir), la primera fila por decidir entera con su botón a 1440×900 sin scroll y a 1024×768 con ≤ 1 pantalla; `medir-oficio.js` sin blancos nuevos < 24 px; captura antes/después al mismo ancho.
2. **Decir cada cosa una vez (ley 8, la más baja).**
   - **Antes:** [Medido] el conteo por decidir 6 veces y el total 3; «Nada por decidir» ×4 en el tablero; «Decididas 0» que filtra cero; 6 renglones de nombres del almacén al pie; «Sin ventas» tachado; «Sólido»/«Aceptable» como chip en todas las filas.
   - **Después:** el número vive en la cabecera y en la píldora; el tablero dice «N por decidir» solo cuando N > 0; la píldora «Decididas» se esconde hasta que haya una; el pie se reduce a dos cifras con un toque («8 guardadas en el almacén después de colgarse · Ver cuáles» / «6 solo en el almacén, nunca colgadas · Ver cuáles», con la lista plegada: el dato no se pierde); el chip de vara solo en la excepción, como ya hace la fila con «aproximado»: «Sólido» y «Aceptable» se callan, «Aproximado» → «Pocas ventas: aproximado» (ámbar), «Contra CAYLA» → «Comparada con las 3 tiendas» (pizarra), «Sin ventas» → «Sin ventas aún» **sin tachar** (`tachado={false}`).
   - **Leyes:** 8, 3, 4 · **Esfuerzo:** S · **Decide:** presentación; **los cinco nombres de la vara son tuyos** (decisión 3): confirmar que el Sólido se calle y las palabras nuevas · **Verifica:** `get_page_text` con 1 por decidir: el «1» aparece ≤ 3 veces; pruebas de `varaTablero` para los 5 casos; captura del tablero sin texto tachado.
3. **Que el botón de la fila diga lo que va a pasar (lo que frenó a la ciega).**
   - **Antes:** [Observado + Medido] «La cambié de lugar» (hecho pasado, botón negro) junto a «No se mueve: pruébala 7 días en otro lugar» (sugerencia futura); un toque anota y la consecuencia («sale de Por decidir hasta el viernes 16») solo se lee después, en el aviso; la ciega no se atrevió y tardó 13 toques. «Ya decidí» y «Ver las 2 tiendas» leídos como afirmación y como cambio de sede; «su reloj está en pausa» es jerga; el nombre y «¿Por qué?» miden 19 y 16 px de alto; la hoja sin lectura no ofrece reintento.
   - **Después:** bajo la sugerencia, en la fila, la consecuencia en una línea antes de tocar («Cuando la muevas, toca el botón: la miro 7 días y te digo si sirvió»), y el botón conserva su verbo y su toque único (ley 7: sin «¿seguro?», con Deshacer); «Ya decidí» → «Anotar lo que hice», «Ver las 2 tiendas» → «Comparar las 2 tiendas», «su reloj está en pausa» → «no cuentan días mientras están guardadas»; el nombre y «¿Por qué?» a `min-h-7` (como «¿Cómo se lee esto?»); «Volver a intentar» junto al aviso de la hoja; y una frase de puente cuando lo último por decidir se anota («Nada por decidir: estas son todas»).
   - **Leyes:** 1, 4, 7, 9 + oficio 1 y 2 · **Esfuerzo:** S · **Decide:** presentación (no cambia qué se guarda ni cuándo; la alternativa —anotar recién al volver a tocar «Ya la cambié»— cambia el flujo y sería tuya) · **Verifica:** ciega otra vez con la misma tarea: ≤ 2 toques y 0 dudas sobre el botón; `medir-oficio.js` con 0 blancos de la pantalla < 24 px.

### Lo que sobra (ley 8; se propone esconder o plegar, nunca borrar datos)
«Nada por decidir» en cada fila del tablero (ruido ×4) · el conteo repetido (cabecera, tablero, píldora, franja, grupo, pie) · la píldora «Decididas 0» · el pie «Mostrando 1 de 5 · N unidades» cuando la franja ya lo dijo 200 px arriba · los 12 nombres del almacén al pie · el chip de vara cuando es «Sólido» o «Aceptable» · la instrucción «Toca una categoría…» (una fila que se vea tocable lo diría sola) · los encabezados de columna cuando hay una sola fila (32 px antes de la única prenda) · [Opinión] las dos cifras de la cabecera no cambian ninguna decisión; se quedan por el patrón de cabecera (ADR-0220).

### Lo que no pediste y importa más
**El botón primario de la fila afirma un hecho («La cambié de lugar») al lado de una sugerencia («pruébala 7 días»), y un toque anota sin que la consecuencia se haya leído.** No es un dato malo en silencio —la fila lo muestra al instante, Deshacer dura 10 s y «Quitar lo anotado» no vence— pero una persona que lee de arriba abajo lo toca como «hazlo» antes de mover la prenda: queda anotada una decisión que no ocurrió, la prenda sale 7 días de la lista, el sistema la mide 7 días y esa línea suma a «Este mes en Tienda Lima: N cambios de lugar terminaron; juntos vendieron…» (`notaDelMes`), el único termómetro de si «Ya decidí» sirve. La ciega lo sintió y por eso dio la vuelta larga. El cambio 3 lo resuelve diciendo la consecuencia antes; si prefieres que el sistema anote recién cuando la persona confirme que ya la movió, es un cambio de flujo y es tuyo.

### Lista aparte (no se ejecuta sin que Felipe lo mande)
- **Piezas únicas (ADR-0358):** los 4 vacíos → `<Vacio>` (con botón a Existencias y píldoras que quitan filtros), el buscador → `<Buscador>`, los 2 avisos → `<Aviso tono="info">`; y ampliar las firmas de `vacio`, `buscador` y `aviso` en `apps/web/unificar/familias.mjs` (hoy buscan `p-5`, `type="search"` y recuadros de tono: no ven a Frescura). Es trabajo de `/unificar migrar`, módulo por módulo.
- **Chrome global, igual que el 2026-10-05:** «Salir» 37×16,5; «Buscar…» 4,15:1 y «Ctrl»/«K» 3,32:1; a 375 px menú, Salir, avatar, Actividad, tema, ubicación y Buscar bajo 44 px; la cabecera del módulo entra 0,85 s después del contenido (`anim-sube`, `EncabezadoPagina.tsx:49,69`: el dato aparece antes que el título que lo nombra). Se arregla una vez para todo el ERP.
- **Piezas compartidas:** línea sede·fecha de `EncabezadoPagina` a 11 px; etiquetas de `ResumenSede` a 11 px a 375; `Desplegable forma="caja"` y `caja-cayla` a 40 px con dedo; `pildora-cayla` a 31,5; «Eres admin…» de `ComboResponsable` dos veces en el DOM de «Ya decidí».
- **Chip:** el default `tachado = true` del tono `apagado` (`Chip.tsx:51`) es una trampa para cualquier chip apagado que no sea anulación; Frescura lo evita en `EstadoChip` y lo olvidó en el tablero (cambio 2 lo arregla aquí; el default es de la pieza).
- **«Las N tiendas» (solo líder):** «de lo medido es Nueva», «quizá más», «Pocos datos», «Ventas a pedido llega con los botones de la caja» (`FrescuraTiendas.tsx:55-56,86`): la jerga del informe anterior se mudó a la hoja del líder.
- **Comentario viejo:** `lib/frescura-pantalla.ts:35` dice que «vara» nunca aparece en pantalla; desde el 2026-10-08 aparece en «¿Cómo se lee esto?» (nombre decidido por Felipe) y la prueba de jerga no cubre ese texto.
- **Hoja «Ya decidí» sin `pie-hoja-fijo`** (768 px de alto): sigue sin probar.
- **Rendimiento (`ui.mjs`):** sin streaming, 7 archivos cliente / 1 721 líneas, modales fijos; la silueta y la página real conviven ≈100 ms en el DOM.
- **`/chaos` no corrió:** guarda con `anotar_decision_frescura` y `anular_decision_frescura`; doble toque cubierto por `enVuelo` y la marca por prenda, concurrencia por `p_anterior_id`; nadie lo atacó a propósito.
- **Barra «Hay que moverla» en `bg-tinta`** (crema en oscuro, negra en claro): el estado más urgente sin color cálido, por los colores A; si el tablero debe avisar por color, es un ADR tuyo.
- **`replaceState`** en los filtros: el Atrás del navegador no deshace un filtro (decidido para no reabrir el loader; «Quitar filtros» lo cubre).

### Prueba ciega (Observado; un agente, una tarea, sin el repo)
| Medida | Resultado | Pasa si |
|---|---|---|
| Lectura de 5 s | «qué tan nueva o vieja está cada prenda colgada en el salón; en Camisas y Blusas hay una que me pide decidir» — coincide | ✅ |
| Primer intento | terminó sin retroceder ni preguntar; lo verificó por 5 señales (cabecera «Nada por decidir: todo en orden», píldoras «Por decidir 0 · Decididas 1», tablero, fila «Decidida · Se cambió de lugar · se revisa el viernes 16», hoja «Ya decidido… día 1 de 7») | ✅ |
| Pasos | **13** (mínimo: 1, el botón de la fila; +1 = 2): abrió «¿Cómo se lee esto?», el detalle, «Ya decidí», eligió, agregó nota, anotó, reabrió para comprobar | ❌ |
| Dudas | **11**: «Frescura del piso», «Sólido» vs «Sin ventas», «Ver las 2 tiendas», **«La cambié de lugar» (¿anota de golpe sin preguntar?)**, «y 1 más en el detalle», «Ya decidí» (¿botón?), cuál de las dos primeras opciones, «Falta: qué hiciste» (¿botón?), «Eres admin», «Deshacer» (se fue solo), las guardadas del pie (¿también me tocan?) | ❌ (cada una es hallazgo de ley 1, 3, 4 o 9) |
| Palabras no entendidas | **15**, de las que 3 son del lector de textos («8 dla mitad»…), 4 nombres decididos («Frescura del piso», «Sólido», «Aproximado», «Vara de CAYLA»), 1 pieza compartida («Eres admin»), 1 jerga real («su reloj está en pausa»); las demás las interpretó bien | ❌ |
| Errores evitables | 3 reportados, ninguno de la pantalla: la cabecera entró ~1 s después (chrome), la lista pasó de 1 a 5 al anotar (diseño, sin frase de puente), Deshacer se fue a los 10 s (patrón) | ✅ |
> Esta vez el formato se exigió y se cumplió (pasos numerados, conteos, declaración «No leí nada fuera de la pantalla»). **Ley 1 = 6: pasa con dudas; no pasa de 8 sin 3 a 5 colaboradoras reales.**

### Antes de decir «listo»
- **Concurrencia:** dos personas sobre la misma prenda → `p_anterior_id` y `version_cambiada` con «Ver» que refresca; doble toque → `enVuelo` + marca por prenda (leído en `useAnotarDecision.ts:58-67`, probado con pruebas unitarias en la revisión adversaria del 2026-10-08). `/chaos` no corrió: **sin atacar a propósito**.
- **Caída externa:** la libreta sin lectura → aviso único, la fila solo ofrece «Ver por qué» y la hoja dice por qué no se puede anotar [Medido]; la vara de CAYLA sin leer o vieja → se juzga contra la tienda y «¿Cómo se lee esto?» lo dice [Medido]; anotar sin red → 3 líneas junto al botón, sin anotar dos veces [Medido].
- **Persona sin contexto:** ciega **pasa con dudas** (13 toques, 11 dudas); real **sin probar**. **Calificada, no certificada.**

### Después de ejecutar los 3 cambios (2026-10-10; Felipe: «dale a los tres, y sí calla Sólido y Aceptable»)
Commit `fcd9638b` (los tres juntos: son la misma pantalla y se verifican con la misma corrida). Verificado contra la base local sembrada
(Tienda Lima, «Zz Fx Blusa Vieja» por decidir) a 1440×900, 1024×768 y 375×812; `tema:auditar` en claro y oscuro.
- **[Medido] Cambio 1:** la fila por decidir entera, con su botón y su consecuencia, en **y 758–869 a 1440×900, sin scroll** (antes 821–910,
  cortada por el pliegue); el tablero compacto mide 28 px por fila y «¿Cómo se lee esto?» ya no cae a una segunda línea. A 1024×768 el botón
  pide 217 px de scroll (antes 237 la fila) y la consecuencia 304: ahí la cabecera del módulo apila las cifras bajo el título (pieza
  compartida, `EncabezadoPagina`). A 375: botón 138×44, sin scroll horizontal. Todas las barras miden igual (493 px en compacto, 590 en
  completo) porque las columnas viven en la grilla madre y cada fila las hereda con `subgrid`: antes cada fila era su propia grilla y la que
  llevaba chip medía 497 contra 530.
- **[Medido] Cambio 2:** con 1 por decidir el «1» aparece **3 veces** (cabecera, tablero —por categoría—, píldora; antes 6: la franja
  «Esperan tu decisión» ya no lo repite); «Decididas» no aparece con 0; «Nada por decidir» ×2 (cabecera y puente; antes ×5); el pie son 2
  frases con «Ver cuáles» (antes 6 renglones de nombres); «Sin ventas aún» sin tachar (captura); `varaTablero` probado para los 5 casos
  (`frescura-pantalla.test.ts`, `frescura-respaldo-cayla.test.ts`).
- **[Medido] Cambio 3:** la consecuencia bajo el botón antes de tocarlo (captura); al tocarlo, aviso con Deshacer, la fila pasa a «Decidida»,
  el tablero vuelve a su forma completa y aparece el puente «Nada por decidir. Estas son todas las prendas colgadas en Tienda Lima.»;
  `medir-oficio.js` a 1440: **0 blancos de la pantalla bajo 24 px** (queda «Salir» 37×16,5, del chrome); «¿Por qué?» 60×28 y el nombre 28
  de alto.
- **`tema:auditar`** (admin, 1440×900, 3 escenarios, claro y oscuro): 0 hallazgos; capturas en `apps/web/tema/.salida/20261010-1347`
  (antes: `20261009-1617`), miradas: la cabecera, el tablero compacto, la fila con su consecuencia y el pie plegado caben en 987 px de alto
  (antes la página medía 1184).
- **Lo que NO se puede afirmar:** las leyes **no se recalificaron** (exige los 4 agentes y 3 a 5 colaboradoras reales) y la ciega **no volvió
  a correr** sobre la pantalla nueva: el cambio 3 se da por verificado solo cuando pase con ≤ 2 toques y 0 dudas sobre el botón. Del chrome
  global el medidor marca lo mismo del 2026-10-09 («Salir», «Buscar…» 4,15:1, «Ctrl»/«K» 3,32:1, la línea sede·fecha a 11 px). Marca, nuevo,
  5 «bordes casi alineados» de 1–3 px: la caja del buscador contra su `<input>` (refutado el 2026-10-09) y las cifras de la barra de filas
  distintas, que van alineadas a la derecha y por eso no comparten borde izquierdo: no es un defecto. A 375 los enlaces `btn-enlace`
  («Comparar las 2 tiendas», «¿Cómo se lee esto?», «Ver todas las prendas») miden 28 de alto, bajo los 44 con dedo: es la pieza única
  (ADR-0358), no de Frescura; va a la lista aparte.
- **Decisión que cambió (ADR-0208, actualización 2026-10-10):** de los cinco nombres de la vara en el tablero, «Sólido» y «Aceptable» se
  callan (siguen en «¿Cómo se lee esto?» y en «Las N tiendas»); «Aproximado» → «Pocas ventas: aproximado» (ámbar); «Contra CAYLA» →
  «Comparada con las 3 tiendas» (pizarra; texto fijo: si abre una cuarta tienda hay que tocarlo); «Sin ventas» → «Sin ventas aún» (apagado,
  sin tachar).

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-05 | `ab866fc82` | 4,5 (±1) · ley 1 sin nota | 5 (provisional) | — (primera corrida) |
| 2026-10-05 | `724dd4172` | sin recalificar | medición parcial, no comparable | 1, 2 y 3 ejecutados; falta la corrida 2 con datos y personas reales |
| 2026-10-08 | `22accd67` | sin recalificar | sin medir (`tema:auditar` necesita el Chromium de Playwright, no descargado) | ADR-0208 act. 2026-10-07 construido: umbral de evidencia 2, vara de CAYLA de respaldo, tablero por categoría (nivel 1), fila que ejecuta (nivel 2), un solo aviso; falta `/formidable` sobre la pantalla de dos niveles y la corrida 2 con personas reales |
| 2026-10-09 | `d6acc5ce1` (PR #889 fusionado) | sin recalificar | `tema:auditar` (admin, 1440×900, claro y oscuro, 3 escenarios: lista «Categoría», lista «Estado», una categoría del tablero elegida): **0 hallazgos solo en oscuro, 0 heredados, 0 manchas, 0 velos**; capturas miradas (`tema/.salida/20261009-1606`) | revisión adversaria antes del PR (16 arreglos); la migración pegada y verificada en producción; falta `/formidable` y `/chaos` sobre la pantalla nueva |
| 2026-10-09 | `75e5a910` (`main` con #889 y #892) | **6,9 (±0,5)** · ley 1: 6 (ciega: pasa con dudas; real sin probar) · la más baja, ley 8: 5 | **7** (10 pasan / 4 fallan; sin blocker) | re-análisis con base sembrada y los 4 agentes: cambios 1 y 3 del 2026-10-05 cerrados, 2 parcial; **3 cambios nuevos propuestos, esperan el OK de Felipe** |
| 2026-10-10 | `fcd9638b` | sin recalificar (la ciega sobre la pantalla nueva está pendiente) | `medir-oficio.js` a 1440: 0 blancos de la pantalla < 24 px (antes 2); `tema:auditar` claro y oscuro, 3 escenarios: 0 hallazgos | **los 3 cambios del 2026-10-09 ejecutados** y medidos a 1440/1024/375: tablero compacto con algo por decidir (la fila por decidir sin scroll a 1440×900), cada cosa una vez («1» ×6 → ×3, pie plegado, «Sólido»/«Aceptable» callados, «Sin ventas aún» sin tachar), la consecuencia antes del botón, «Anotar lo que hice», puente «Nada por decidir» |
