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

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-05 | `ab866fc82` | 4,5 (±1) · ley 1 sin nota | 5 (provisional) | — (primera corrida) |
| 2026-10-05 | `724dd4172` | sin recalificar | medición parcial, no comparable | 1, 2 y 3 ejecutados; falta la corrida 2 con datos y personas reales |
