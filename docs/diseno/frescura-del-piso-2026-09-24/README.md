# Frescura del piso

*CAYLA · Inteligencia y reportes · Propuesta para decidir*

> **Copia en el repo del artifact «Frescura del piso» (24-sep-2026), guardada el 2026-09-25.**
> Origen: <https://claude.ai/artifact/4WVzFBpN6HBARyRKhCx9Bn>. Si el artifact se edita después, esta copia no se entera.
>
> - **Estado: propuesta para decidir, sin código.** `retail.fn_frescura_piso` no existe todavía (verificado en `origin/main` el 2026-09-25). Las 12 decisiones del capítulo 11 ya están tomadas con Felipe; las de «Falta decidir» siguen abiertas. Antes de tocar el esquema hace falta un ADR para `productos.linea` (capítulo 12, pieza 6).
> - **Este archivo lleva el texto, las tablas y el contrato SQL.** Los gráficos y controles (semáforo del piso, curva de la carrera, tablero por sede, matriz, plan de espacio, tallas y marcas) los dibuja JavaScript y solo están en [`propuesta.html`](propuesta.html): ábrelo en el navegador.
> - `propuesta.html` es el original **sin** el bloque `frame-runtime` que la plataforma de artifacts inyecta al publicar (dos `<script>` de ≈36 KB que no son del documento). El script del documento y sus estilos están intactos. Carga sus fuentes desde Google Fonts; sin red usa las del sistema.
> - Las cifras del tablero, los nombres de prendas y las marcas son **simulados**. Los volúmenes del capítulo 12 (≈24.000 movimientos, 7.000 ventas, 1.300 variantes, 45 categorías) los da el propio documento; no se re-verificaron contra producción al guardar la copia.
> - Dueño del módulo: **Águila**, Inteligencia y reportes ([`13-inteligencia-y-reportes.md`](../../datos/modulos/13-inteligencia-y-reportes.md), [`AVIARIO.md`](../../datos/generado/AVIARIO.md)).

Tu clienta vuelve cada semana o dos. Esta herramienta responde, sede por sede, qué va a encontrar de nuevo, qué se está quedando y qué hacer antes de rebajar.

**Documento de trabajo** · 24 de septiembre de 2026 · Ideas de Felipe, ordenadas con investigación verificada · Todos los números del tablero son simulados

El piso de **Trujillo** hoy, ordenado por edad

Cada prenda del dibujo representa unas 10 unidades de moda colgadas. Los clásicos van aparte, porque no se miden por novedad.

**Lo que medimos**

Solo lo que la clienta puede ver y tocar: el piso. Cada modelo en cada color recibe un color de semáforo según cuánto lleva colgado comparado con lo que suele tardar su categoría en venderse en esa sede.

**Para qué**

Para actuar a tiempo, en orden y por sede: primero cambiar de lugar, luego trasladar y recién al final rebajar. El número que prueba que funciona es cuánto se vende a precio completo.

**La condición**

Que cada bajada del almacén al piso quede registrada en el momento. Sin ese registro, el tablero no mide la tienda: mide si se registró o no.

- Cómo leerlo
- 1 · Por qué importa
- 2 · Tres relojes
- 3 · La carrera
- 4 · Tablero
- 5 · Qué hacer
- 6 · Antes de rebajar
- 7 · Espacio
- 8 · Tallas y Taller
- 9 · ¿Da en el clavo?
- 10 · Quién hace qué
- 11 · Decisiones
- 12 · Programadores
- Glosario y fuentes

## Cómo leer este documento, según quién eres

- **Encargada de sede** Capítulos 2, 4, 5 y 6. Qué vas a ver cada lunes y qué hacer con cada prenda. Unos 10 minutos.
- **Socios y dirección** Capítulos 1, 4, 9 y 11. Por qué importa, cómo sabremos si funciona y qué falta decidir. Unos 8 minutos.
- **Benja y análisis** Capítulos 2, 3, 5 y 9. La lógica completa: relojes, percentiles, cuánto creerle a cada señal y dónde puede mentir.
- **Programadores** Capítulo 12, y el 11 para las reglas ya decididas. Qué existe en el ERP, qué falta y en qué orden construir.

## Capítulo 1 · Por qué importa: la ropa también tiene fecha de horneado

**Piénsalo así**

Una panadería no vende pan: vende pan del día. Lo de la mañana se vende solo, lo de ayer necesita ayuda, y lo de la semana pasada ya no debería estar en el mostrador.

En CAYLA pasa lo mismo, con una diferencia que lo complica: la ropa no se pone dura. Nadie se da cuenta de que una blusa lleva un mes colgada, salvo la clienta que vuelve cada semana y siente que **«aquí no hay nada nuevo»**. Esa sensación no aparece en ningún reporte de ventas: la clienta simplemente deja de entrar.

Lo que Felipe propone es convertir esa sensación en un número por sede, y ese número en decisiones: **qué bajar del almacén, qué cambiar de lugar, qué trasladar, qué rebajar y qué pedirle al Taller**. No es un reporte más, sino la forma de administrar la ventaja que CAYLA ya tiene: diseñar y producir en su propio taller, algo que casi ninguna tienda de su tamaño puede hacer.

La investigación muestra que el que mejor hizo esto en el mundo convirtió la novedad en su modelo de negocio:

17 visitas al año

La clienta de Zara entraba unas 17 veces al año, contra 3 o 4 en tiendas de la competencia. Las más fieles sabían qué día llegaban los camiones.

Caso HBS de Ghemawat y Nueno, datos de 2001-2002

¾ del piso

Unas tres cuartas partes de lo exhibido cambiaba cada 3 o 4 semanas. Un artículo vivía de 5 a 6 semanas en tienda.

Caso HBS; Caro, Gallien y otros, Interfaces 2010

15-20 % con rebaja

Zara vendía entre 15 y 20 % con rebaja, contra 30 a 40 % de sus pares europeos. El propio caso llama a esta cifra «muy aproximada».

Caso HBS

−44 % de utilidad

En 2018, H&M acumuló 3.400 millones de euros en inventario, anunció más rebajas y su utilidad del primer trimestre cayó 44 %, también por menores ventas.

FashionNetwork, 2018

**Cómo leer estas cifras:** vienen de empresas gigantes y de otra época. Sirven para entender el mecanismo, no para prometer resultados. Lo que CAYLA gane con esto lo vamos a saber midiendo en nuestras tres sedes (capítulo 9).

## Capítulo 2 · Tres relojes en la pared

La primera idea era un solo reloj: «¿cuánto lleva esta prenda?». Al conversarlo aparecieron **tres preguntas distintas**, y cada una necesita su propio reloj. Si se mezclan, el tablero se equivoca justo en lo que más importa.

### Reloj de tienda

- **Arranca cuando:** La prenda llega a la sede, al almacén.
- **Responde:** ¿Cuánta plata tengo parada aquí, y hace cuánto?
- **Su regalo:** La diferencia con el reloj de piso son los **días de espera en almacén**: ropa pagada que ninguna clienta puede ver.

### Reloj de piso

- **Arranca cuando:** Cada unidad se cuelga en el piso, y se detiene cuando se vende.
- **Responde:** ¿Esta prenda se vende más rápido o más lento que las de su categoría?
- **Ojo:** Los días en almacén y los días agotada no cuentan: en esos días nadie podía comprarla.

### Reloj de novedad

- **Arranca cuando:** El modelo en ese color aparece por primera vez en el piso de esa sede.
- **Responde:** ¿La clienta que vuelve ya lo vio?
- **Nunca se reinicia:** Reponer el Jean Austria azul no lo hace nuevo: para la clienta es el mismo jean en el mismo lugar.

### La vida de la Blusa Paracas terracota en Trujillo, con sus tres relojes

Ejemplo simulado

El 12 de septiembre se repusieron 4 unidades. Las nuevas unidades empiezan su propio reloj de piso, pero el reloj de novedad sigue corriendo desde el 5: la clienta ya conoce la blusa. Hoy tiene 19 días de novedad, y pasó 3 días esperando en el almacén antes de colgarse.

Regla decidida

Una prenda de moda es Nueva una sola vez en cada sede.

Si se agota y vuelve, no es novedad. Pero si se traslada a una sede donde nunca se exhibió, **allá sí es Nueva**: esa clienta nunca la vio. Al lado siempre se muestra la **edad en la cadena**, que nunca se reinicia. Así nadie «rejuvenece» una prenda paseándola de ciudad en ciudad.

**Y los clásicos (por ejemplo, un polo cuello camisero atemporal):** quedan fuera del semáforo de novedad, porque nadie espera que cambien. Pero entran al reloj de piso con más peso, porque al reponerse siempre acumulan mucha historia. A un clásico se lo compara con **su propia historia**, y a la moda con su categoría, porque un modelo de moda vive pocas semanas. Al clásico se le pregunta además: ¿están sus tallas clave en el piso?

**¿Qué se pinta?** El modelo en un color, con todas sus tallas juntas, en cada sede. Es lo que la clienta distingue a simple vista, y lo que la industria llama «opción». Las tallas se miden aparte: sirven para ver cuándo faltan tallas clave y qué tallas producir (capítulo 8).

## Capítulo 3 · ¿Cuándo deja de ser Nueva? La carrera de su categoría

**Piénsalo así**

Todos los jeans que se colgaron en Trujillo corren la misma carrera. Venderse es cruzar la meta. Tu jean no se juzga por sí solo: se juzga por dónde va en el pelotón.

**Nueva:** todavía no llegó a la meta la mitad del pelotón. **Vigente:** ya llegó la mitad, pero no 3 de cada 4. **Envejecida:** ya llegaron 3 de cada 4 y tu jean sigue corriendo. **Crítica:** ya llegaron 9 de cada 10. Los que siguen corriendo también son parte de la carrera: si solo contáramos a los que llegaron, la carrera parecería más corta de lo que es.

### La carrera de la categoría en Trujillo: qué parte del pelotón sigue sin venderse

Tu prenda lleva **16** días colgada en el piso

Vigente

*Ver los datos de la curva en tabla (interactivo: ver propuesta.html)*

**Cuando la cuenta no alcanza, el tablero no inventa números.** En blusas y vestidos, todavía no se vendieron 9 de cada 10 en el período, así que el corte de Crítica aparece como «aún sin referencia» y se muestra lo que sí se sabe: qué porcentaje se vendió a los 45 días. Es preferible un «no sabemos todavía» a una cifra falsa.

### ¿Por qué no «el promedio más 30 %»? Las dos reglas, con 20 prendas colgadas hoy

*Selector interactivo (solo en `propuesta.html`): «Percentiles de su categoría» frente a «Promedio de lo vendido × 1,3».*

En una categoría pareja (tops: casi todos se venden entre el día 4 y el 8) las dos reglas dicen lo mismo. En una dispareja (vestidos de fiesta: de 2 a 75 días) el promedio × 1,3 pinta de rojo a más de la mitad del perchero, por dos razones: el promedio deja fuera a los que siguen colgados, y un 30 % de más es mucho en tops pero casi nada en vestidos de fiesta. Los percentiles se estiran solos según cada categoría.

**Sin datos** Menos de 5 ventas del modelo en la sede. Se muestra en gris y se espera.

**Señal** Entre 5 y 15 ventas. Alcanza para revisar la prenda, no para decidir sobre ella.

**Firme** Más de 15 ventas. Alcanza para decidir con tranquilidad.

**Cuánto creerle a cada color.** Con lotes de 8 a 12 unidades por sede, la mayoría de las prendas van a estar en «señal». El tablero es un radar que te dice dónde mirar; la decisión la toma una persona.

## Capítulo 4 · El tablero, como se vería un lunes

Esto es lo que la encargada y el líder abrirían cada lunes. Elige una sede y todas las cifras cambian.

Simulado Las metas son provisionales: se fijan después de medir la línea base de cada sede.

### ¿Qué sede está más fresca?

### Porcentaje del piso que es Nueva, últimas 8 semanas

### ¿Dónde está parado el piso? Porcentaje Envejecida o Crítica, por categoría · cada sede se compara con su propia historia. Trujillo lleva 6 semanas bajando: esa caída dispara la alerta de poca novedad hacia el Taller (capítulo 8). La historia real del piso empieza el 14 de septiembre; estas semanas son ilustrativas.

Más oscuro significa más ropa que se quedó. El número pequeño son las unidades colgadas. Los clásicos no aparecen porque no se miden por novedad.

### La foto y la película

**Piénsalo así**

Si le tomas una foto al paradero a las 8 de la mañana, solo ves a los que esperan hace rato. Los que agarraron la primera combi ya no están.

Con el piso pasa igual: lo que se vende rápido desaparece y lo lento se acumula. Por eso la foto (la edad de lo que sigue colgado) siempre se ve peor que la película (cuánto tardó en venderse lo que sí se vendió). Hay que mirar las dos.

## Capítulo 5 · Qué hacer con cada prenda: la matriz de Trujillo

El semáforo dice **cuánto lleva** la prenda. Falta otra pregunta: **¿se vende más rápido o más lento que su categoría a la misma edad?** Cruzando las dos sale la acción. La línea del 100 significa «igual que su categoría»: arriba va más rápido y abajo más lento.

### Cada punto es un modelo en un color · tamaño = unidades en el piso

Simulado

#### Antes de leer la matriz, se revisan cuatro casos aparte

**Faltan tallas clave** No es que no guste: le faltan tallas. Se juntan tallas o se retira del piso. Nunca se rebaja por esto.

**Clásico** Queda fuera de la matriz de novedad. Se mide por disponibilidad y contra su propia historia.

**Pocos datos** Menos de 6 unidades exhibidas o menos de 5 ventas. Se muestra en gris y se espera.

**En rebaja** Su rapidez viene de la rebaja, así que se mide aparte y no se compara con su categoría.

### El reporte del lunes de Trujillo, lo que sale de la matriz

## Capítulo 6 · Antes de rebajar, una escalera

**Piénsalo así**

Un buen médico no empieza operando. Primero revisa, luego receta lo más barato y solo al final interviene.

Rebajar le cuesta margen a CAYLA y además le enseña a la clienta frecuente a esperar la rebaja. Por eso es el tercer escalón, no el primero. Y la investigación agrega algo clave: **el momento de actuar es cuando la prenda está Vigente**, no cuando ya está Envejecida, porque trasladar solo funciona mientras a la prenda todavía le quedan semanas de venta.

- **Diagnosticar**

¿Le faltan tallas clave? ¿Es un clásico? ¿Hay pocos datos? ¿Está escondida, en el fondo o doblada debajo de otra?

*(costo: Gratis)*

- **Cambiar de lugar por 7 días**

A la entrada, a un maniquí o a una mesa. Cuesta casi nada y se puede deshacer. El resultado se mide: ventas de los 7 días anteriores contra los 7 siguientes.

*(costo: Casi gratis)*

- **Trasladar a una sede donde nunca estuvo**

Solo si allá su categoría se vende entre 1,5 y 3 veces más rápido, si le quedan 2 o 3 semanas de venta útil y si lo que se salva supera el costo del envío. Tiene que poder explicarse en una frase.

*(costo: Envío)*

- **Rebaja chica, solo en esa sede**

La herramienta la propone y el líder la aprueba; nunca es automática. Se aplica en pocos tramos de precio (por ejemplo, «blusas de S/ 119-139 pasan a S/ 99»), no prenda por prenda, para evitar errores al reetiquetar.

*(costo: Margen)*

- **Liquidar aparte**

Al pasar a Crítica: un perchero de oportunidades, lejos de la entrada, donde la clienta frecuente no confunda liquidación con novedad.

*(costo: Mucho margen)*

## Capítulo 7 · ¿Cada categoría tiene el piso que se gana?

Hoy se baja del almacén lo que aparece primero. La propuesta es otra: comparar **qué parte de las perchas ocupa cada categoría** con **qué parte de la venta trae**. Si los jeans ocupan el 14 % de las perchas y traen el 18 % de la venta, les falta piso. Y como dijo Felipe, el reparto cambia con la temporada: en verano las faldas ganan perchas y en invierno las chompas, así que es un **plan de espacio por temporada** que se configura.

### Arequipa: perchas frente a venta, por categoría

% de las perchas % de la venta · Índice: 100 = justo · más de 100 = le sobra piso · menos de 100 = le falta

Una categoría «destino» (la que hace venir a la clienta) puede quedarse por encima de 100 a propósito. Más espacio vende más, pero poco: en promedio, 10 % más de espacio suma cerca de 1,7 % de venta (meta-análisis de Eisend, 2014, sobre todo en supermercados). La ganancia grande es otra: **liberar percha para lo nuevo**.

### ¿Cuántos modelos caben? La capacidad de cada pared

Ganchos de la pared de jeans Unidades por modelo+color (una por talla) Modelos+color colgados hoy

## Capítulo 8 · Tallas, marcas y el Taller: lo que el piso le enseña a quien produce

### Jeans: qué tallas se agotan antes y cuáles se quedan, por sede

Se agota antes (vende más de lo que llegó) · Se queda (termina como resto de talla)

Índice = parte de la venta ÷ parte de lo recibido × 100. En Arequipa la 26 se agota antes y la 34 se queda. Esa es información para cortar la próxima tanda del Taller con otra curva de tallas para Arequipa.

### La tarjeta de marcas, con el Taller medido con la misma vara

Una marca cuyo producto envejece y termina rebajado le cuesta margen a CAYLA. Con esta tarjeta se negocia un cambio o una devolución antes de rebajar. El retorno sobre el inventario (GMROI) usa el costo, así que solo lo ve quien tiene permiso de dinero.

### La alerta de poca novedad: el piso le habla al Taller

Alerta · Trujillo

**Trujillo lleva dos semanas por debajo de la meta de 25 % Nueva (19 % y 17 %)**, y esta semana colgó solo 5 modelos nuevos de los 10 propuestos. La alerta aparece en Producción y en Compras: *«Trujillo necesita novedad: 5 modelos nuevos esta semana. Candidatos: repetir en lote chico la Promesa (Top Lúcuma) y trasladar desde Lima la Blusa Colca crema, que Trujillo nunca tuvo.»*

Hoy el Taller solo recibe una señal: repetir lo que se vende. Con esta alerta recibe la otra mitad: **el piso se está poniendo viejo**. La orden la decide una persona.

## Capítulo 9 · ¿Da en el clavo? Una respuesta honesta

Veredicto

Sí da en el clavo: ataca el problema correcto. Pero el martillo es el registro.

La frescura es la ventaja que CAYLA puede defender, porque tiene taller propio y su clienta vuelve seguido. Esta herramienta convierte esa ventaja en una rutina que se puede medir y exigir. Pero sin el registro de cada bajada al piso, el tablero mide la disciplina de registro y no la tienda.

### Lo que sí resuelve

- ✓ **Convierte la novedad en rutina.** Cada sede sabe cada lunes qué parte de su piso es nueva y qué hacer con lo que no.
- ✓ **Ataca la fuga de margen más cara:** rebajar tarde, hondo y en las tres sedes a la vez.
- ✓ **Da un idioma común** a tres sedes: Nueva, Vigente, Envejecida y Crítica significan lo mismo en Trujillo, en Arequipa y en Lima.
- ✓ **Conecta el piso con quien produce y compra:** la alerta de poca novedad, las curvas de talla por sede y la tarjeta de marcas.
- ✓ **Destapa el almacén:** por primera vez se sabe cuántos días espera la ropa antes de colgarse, y cuánta nunca sale.

### Lo que todavía no resuelve

- ! **No ve lo que la clienta pidió y no había.** Solo ve lo que se vendió. Hace falta registrar los pedidos no atendidos.
- ! **No sabe en qué lugar de la tienda está la prenda.** «Está escondida» sigue siendo intuición hasta registrar al menos los cambios de lugar.
- ! **Es un radar, no un juez.** Con 8 a 12 unidades por modelo y sede, casi todo será «señal» y no «firme».
- ! **No sabe cada cuánto vuelve la clienta** mientras no se identifique en caja, con su permiso. Por eso hoy no hay tope absoluto de novedad.

### Las cuatro condiciones para que funcione

- **Registrar la bajada al piso con un escaneo por fardo**, más un botón de «Retirar del piso» (hoy no existe), y un indicador de cuánto creerle al tablero de cada sede.
- **Rebaja por sede, aprobada por el líder** y en tramos de precio. Ya está decidido; falta construirlo en la caja.
- **Una reunión de piso de 20 minutos cada lunes** por sede, con el reporte de la matriz. Sin esa reunión, el tablero es un adorno.
- **Medir antes de lanzar:** qué parte de la venta de los últimos 6 meses fue a precio completo, en cada sede. Sin línea base no podremos decir si funcionó.

### Dónde nos podría mentir, y cómo se evita

| Si pasa esto… | El tablero mostraría… | Se evita con… |
| --- | --- | --- |
| La colaboradora cuelga la ropa sin registrarlo y lo registra recién al cobrar (la caja solo vende lo que figura en el piso) | Prendas que «se vendieron en 0 días»: **estrellas falsas** | Registro por escaneo; toda bajada registrada 10 minutos antes de una venta queda marcada como tardía y fuera del cálculo |
| Se descuelga ropa y nadie lo registra | Prendas que envejecen sin estar a la vista: **rojo falso** | Botón de «Retirar del piso» |
| Arranque: el 14 de septiembre todo el stock pasó al almacén | Las primeras semanas todo parece Nuevo | Un aviso de «período de arranque»: no se concluye nada antes de 4 a 6 semanas |
| Las ventas con rebaja entran a la carrera de la categoría | La categoría parece más rápida y todo lo que está a precio completo, más lento | Medir aparte lo que está en rebaja |
| Se traslada ropa solo para «limpiar el rojo» | Una sede en verde con stock viejo que se pasea | La edad en la cadena nunca se reinicia, y cada traslado se mide contra su costo |
| Se mira solo la foto del piso | Una tienda que parece peor de lo que está | Foto y película juntas, y cada sede comparada con su propia historia |

### Cómo sabremos si funcionó

**Número principal** El % de la venta a precio completo sube respecto de la línea base de cada sede.

**Frescura** La edad del piso baja y el % de piso Nueva se sostiene cerca de la meta.

**Almacén** Bajan los días de espera y las unidades con más de 30 días sin colgarse.

**Acciones** Cada cambio de lugar y cada traslado muestra su efecto a 7 días, y aprendemos cuál paso de la escalera funciona en nuestras tiendas.

## Capítulo 10 · Quién hace qué, y cada cuánto

### Encargada de sede · cada día y los lunes

- Registra cada bajada al piso con un escaneo, y cada retiro.
- Los lunes, 20 minutos con el reporte: cambia de lugar, completa tallas y junta los restos de talla.
- Firma cada acción con el combo «Responsable».

### Líder · cada semana

- Aprueba las rebajas por sede en tramos de precio.
- Aprueba los traslados por novedad.
- Marca qué productos son clásicos y cuáles son las tallas clave de cada categoría.

### Dirección · cada mes

- Plan de espacio por temporada y rol de cada categoría.
- Tarjeta de marcas y del Taller.
- % de venta a precio completo por sede, contra la línea base.

### Taller y Compras · cada semana

- Reciben la alerta de poca novedad por sede.
- Ajustan la curva de tallas por sede.
- Repiten en lote chico las Promesas.

## Capítulo 11 · Lo que ya decidimos y lo que falta decidir

### Decidido con Felipe · 24 de septiembre de 2026

- Se llama **Frescura del piso**. La cifra de cabecera es la **edad del piso**, en días. «Mapa de calor» queda libre: en retail significa el tráfico de clientas por zona.
- **Solo cuenta el piso.** El tiempo en el almacén nunca cuenta como exhibición.
- **Tres relojes:** tienda, piso y novedad.
- Lo que se pinta es el **modelo+color en cada sede**. Las tallas son una señal aparte.
- La vara es **la categoría en esa sede**, no el modelo. Con pocos datos se usa la de las tres sedes.
- **Regla de percentiles:** la mitad, 3 de cada 4 y 9 de cada 10, contando lo que sigue colgado y recalculada en vivo.
- Los días agotada no cuentan.
- **Sin tope absoluto de novedad** hasta medir cada cuánto vuelve la clienta.
- **Una prenda de moda es Nueva una sola vez en cada sede.** La edad en la cadena nunca se reinicia.
- **Clásicos:** fuera del semáforo de novedad, dentro del reloj de piso y comparados con su propia historia.
- **Rebaja por sede, la aprueba el líder**, nunca automática y en tramos de precio.
- **El espacio se configura por temporada.**

### Falta decidir (con propuesta)

| Pregunta | Propuesta |
| --- | --- |
| ¿Cuáles son las tallas clave de cada categoría? | Las define el líder: por ejemplo 28-30-32 en jeans, S-M-L en blusas |
| ¿Qué productos son clásicos? | El líder los marca en el producto |
| ¿Cuántos datos mínimos necesita una categoría? | 20 modelos+color o 30 unidades en 8 semanas; si no llega, se usa la de las tres sedes |
| ¿Qué ventana de tiempo usa la carrera? | Los últimos 90 a 120 días, para no mezclar invierno con verano |
| ¿Meta de % Nueva y de novedades por semana? | 25 % y 10, ajustadas a la capacidad de cada sede después de medir |
| ¿Cuánto cuesta y cuánto tarda un traslado? | Medirlo en las tres rutas: define cuándo conviene trasladar antes que rebajar |
| ¿Identificamos a la clienta en caja? | Sí, solo con su permiso: es la única forma de saber cada cuánto vuelve |
| La alerta al Taller, ¿solo avisa o abre una orden? | Solo avisa; la orden la decide una persona |

## Capítulo 12 · Para programadores: cómo se construye sobre el ERP que ya existe

Dueño del módulo: **Águila** (Inteligencia y reportes). Arquitectura real: Next.js + Supabase, schema `retail` en producción y RLS. Todo movimiento de stock ya se escribe en `movimientos`, que es append-only. **Casi todo lo que sigue es lectura:** funciones SQL `security definer` de solo lectura, con el mismo patrón que `fn_resumen_variantes`, y reglas puras en `lib/*-reglas.ts` con sus pruebas.

### Unidad y relojes

- **Unidad:** `(producto_id, color_codigo, ubicacion_id)`. La talla se suma y solo se usa para la curva rota y las curvas por sede.
- **Reloj de tienda:** la primera entrada o recepción de traslado en la sede, al almacén.
- **Reloj de piso por unidad:** se empareja cada `mover_interno` de almacén a piso con cada venta desde el piso, asumiendo que primero se vende la unidad más antigua (y la pantalla lo dice). Se excluyen las bajadas marcadas como tardías.
- **Reloj de novedad:** el primer instante en que el modelo+color tuvo piso > 0 en la sede. En moda nunca se reinicia. **Edad en la cadena:** el primer piso > 0 en cualquier sede.
- Las devoluciones heredan el reloj de su modelo+color. Los ajustes de conteo nunca reinician un reloj.

### La carrera (curva de la categoría)

- Se usa Kaplan-Meier por `categoría × sede` sobre las unidades, con dos datos por unidad: días en piso y si se vendió. Lo que sigue colgado entra como «al menos N días». Es un producto de fracciones y se calcula en Postgres, sin librerías.
- Ventana de 90 a 120 días. Las unidades rebajadas se cuentan como sin vender hasta el día de la rebaja, y los clásicos quedan fuera.
- Cortes P50, P75 y P90. Si la curva no cruza el corte, se devuelve `null` y la pantalla muestra «aún sin referencia» junto con el % vendido a N días.
- Con pocos datos se sube al nivel siguiente: la categoría madre o las tres sedes.

```sql
-- Contrato de la lectura (propuesta, nombre provisional)
retail.fn_frescura_piso(p_ubicacion_id uuid, p_hasta date default current_date)
  returns table (
    producto_id uuid, color_codigo text, categoria_id uuid,
    linea text,                 -- 'moda' | 'clasico'   (columna nueva en productos)
    edad_novedad_dias numeric,  -- reloj de novedad en la sede
    edad_cadena_dias  numeric,  -- nunca se reinicia
    unidades_piso int, ventas_periodo int,
    tramo text,                 -- 'nueva' | 'vigente' | 'envejecida' | 'critica' | null
    indice_rapidez numeric,     -- % vendido a igual edad ÷ el de la categoría × 100
    evidencia text,             -- 'sin_datos' | 'senal' | 'firme'
    curva_rota boolean, en_campana boolean,
    p50 numeric, p75 numeric, p90 numeric  -- null = aún sin referencia
  )
-- Promete: solo lee movimientos/stock; nunca escribe. Asume: bajadas tardías ya marcadas.
```

### Qué existe y qué falta, en orden de construcción

| # | Pieza | Hoy | Falta | Esquema |
| --- | --- | --- | --- | --- |
| 1 | Bajada al piso | Existe `mover_interno` con fecha y responsable, pero se baja una talla por vez y quien solo tiene «vender» no puede bajar | Escaneo por fardo, permiso sin darle todo el módulo Existencias, marca de bajada tardía (10 minutos antes de una venta) e indicador de confianza por sede | Menor |
| 2 | Retirar del piso | La función existe, pero no tiene botón | El botón en Existencias | No |
| 3 | Reloj de novedad | `fn_resumen_variantes` ya reconstruye el piso por talla desde el ledger; `primer_ingreso` no sirve (cuenta desde el almacén y nunca se reinicia) | Agrupar por modelo+color y calcular la primera exhibición continua por sede y en la cadena | No |
| 4 | Reloj de piso + carrera | Existe la velocidad por días con stock en el piso (`calcularVelocidad`) | Emparejamiento FIFO, Kaplan-Meier y P50/P75/P90 por categoría y sede | No |
| 5 | Tramos e índice | Hay bandas de cobertura (otra pregunta) y la marca de alta demanda contra toda la sede | Tramos por percentil, índice a igual edad y las tres marcas de evidencia | No |
| 6 | Clásicos y tallas clave | No existen | `productos.linea` ('moda' o 'clasico') y tallas clave por categoría | **Sí**, con ADR |
| 7 | Atributos y marcas en la lectura | Color, tejido, estampado, marca y proveedor ya existen en el catálogo | Traerlos a la lectura y limpiar los productos marcados «CAYLA» por defecto | No |
| 8 | Traslado por novedad | Traslado en dos fases, hoy solo para reponer | Sugerirlo hacia una sede donde el modelo nunca estuvo; el reloj arranca en destino al colgarse | No |
| 9 | Alerta al Taller | El módulo de Producción empuja a repetir lo que se vende | La señal de poca novedad por sede, visible en Producción y en Compras | No |
| 10 | Rebaja por sede | La campaña rige en las 3 sedes a la vez | Campaña por sede y en tramos de precio. **Toca la caja y el dinero:** diseño aprobado por Felipe; migración y ensayo antes de producción | **Sí** |
| 11 | Espacio por temporada | No existe | Tabla de capacidad por categoría, sede y temporada, en ganchos y frentes | **Sí** |
| 12 | Zonas de exhibición | No existen | Más adelante: un registro sin mover stock (crear la zona como otra ubicación rompería la caja) | Sí |

### Reglas del repo que aplican

- **Módulo nuevo (ADR-0161):** una migración propia con `insert into retail.modulos` y sin rol asignado; agregarlo a `CLAVES_MODULO` y `MODULOS`, y ponerle un `layout.tsx` con `exigirModulo`. Nace visible solo para el líder.
- **Carga (ADR-0149):** las lecturas con prefijo `fn_` ya están en la lista de solo lectura de `espera-reglas.ts`.
- **Pantalla (ADR-0169):** `CabeceraPantalla`, luego `TarjetaCifra`, luego la tabla y al final una `nota-cayla`. Los colores del semáforo pasan a ser tokens.
- **Producción:** todo va con el prefijo `retail.` en el SQL Editor, y después `pnpm datos:generar:produccion` y `datos:comparar`.

### Números antes que opiniones

- Hoy hay cerca de 24.000 movimientos, 7.000 ventas, 1.300 variantes y 45 categorías. En 3 años, con unas 10 veces más, serían del orden de 250.000 movimientos.
- La carrera de una categoría en una sede, con una ventana de 120 días, usa del orden de cientos a pocos miles de unidades. Se puede calcular al vuelo.
- **Se rompe si** la pantalla tarda más de 1 segundo por sede. En ese caso, una foto diaria de la lectura guardada en una tabla. No antes.

### Archivos para empezar

- `supabase/migrations/20260919141804_resumen_inventario_v2.sql`
- `supabase/migrations/20260914230000_inventario_piso_almacen.sql`
- `supabase/migrations/20260916150000_traslados_dos_fases.sql`
- `apps/web/lib/resumen-reglas.ts` · `ReponerPisoModal.tsx`
- `apps/web/lib/produccion-decision-reglas.ts`

## Glosario

- **Piso · sales floor:** Lo colgado o doblado a la vista de la clienta. Es lo único que se puede vender.
- **Almacén de la sede · backroom:** El stock de la tienda que la clienta no ve.
- **Modelo+color · option:** Un modelo en un color, con todas sus tallas. Es la unidad del semáforo.
- **Novedad · newness:** Lo del piso que la clienta todavía no vio en sus visitas anteriores.
- **Edad del piso:** El promedio de días de novedad de lo que está colgado. Es la «temperatura» de la sede.
- **Percentil 50 / 75 / 90:** El día en que ya se vendió la mitad, 3 de cada 4 o 9 de cada 10 de la categoría.
- **Dato censurado:** Una prenda que todavía no se vende: se sabe que tardará al menos N días, pero no cuántos.
- **Índice de rapidez:** 100 = igual que su categoría a la misma edad. 200 = el doble de rápido.
- **Curva rota · broken sizes:** Faltan las tallas que más se venden, y la prenda vende menos aunque guste.
- **Venta a precio completo:** La parte de lo vendido que salió sin ninguna rebaja. Es el número que prueba si esto funciona.
- **Foto y película:** La foto es la edad de lo que sigue colgado; la película, cuánto tardó en venderse lo vendido.
- **Índice espacio-venta · fair share:** % de perchas ÷ % de venta × 100. Más de 100 significa que le sobra piso.
- **GMROI:** Margen del año ÷ inventario promedio al costo: cuánto margen deja cada sol invertido en ropa.
- **Bajada tardía:** Una bajada al piso registrada minutos antes de venderse. Delata que la prenda ya estaba colgada sin registro.

### Fuentes verificadas

Cada dato pasó por un verificador que intentó desmentirlo. Lo que no se pudo confirmar quedó fuera del documento.

- [Ghemawat y Nueno, ZARA: Fast Fashion (caso HBS)](https://didierdiaz.com/wp-content/uploads/2019/10/Zara-fast-fashion-Case-study-HVR.pdf)
- [Caro, Gallien y otros, Interfaces 2010](http://web.mit.edu/jgallien/www/ZaraInterfaces2010.pdf)
- [Caro y Gallien, Inventory Management of a Fast-Fashion Retail Network](https://web.mit.edu/jgallien/www/InvMgtRetailNetworkCaroGallien2007.pdf)
- [Caro y Gallien, Clearance Pricing Optimization (Operations Research 2012)](https://escholarship.org/uc/item/0fm8d8sv)
- [Inditex, preguntas frecuentes](https://www.inditex.com/itxcomweb/us/en/press/frequent-questions)
- [Oracle Retail Markdown Optimization](https://docs.oracle.com/cd/E12578_01/mdo/pdf/130/mdo-130-cg.pdf)
- [Square, reporte de antigüedad del inventario](https://squareup.com/help/us/en/article/8265-track-aging-inventory-with-square-for-retail)
- [Odoo, antigüedad del inventario](https://www.odoo.com/documentation/17.0/es_419/applications/inventory_and_mrp/inventory/warehouses_storage/reporting/aging.html)
- [Analyse-it, Kaplan-Meier y censura](https://analyse-it.com/learn/kaplan-meier-survival-curves)
- [Hattingh y Uys, modelos de supervivencia en moda (2014)](https://www.ajol.info/index.php/orion/article/download/111549/101328)
- [Fisher y Raman, Accurate Response to Early Sales (1996)](https://pubsonline.informs.org/doi/abs/10.1287/opre.44.1.87)
- [Jain, Rudi y Wang, Stock-Out Timing (2015)](https://web2-bschool.nus.edu.sg/wp-content/uploads/media_rp/publications/6isNE1485323583.pdf)
- [Eisend, elasticidad al espacio, meta-análisis (2014)](https://ideas.repec.org/a/eee/jouret/v90y2014i2p168-181.html)
- [Increff, reglas para trasladar entre tiendas](https://www.increff.com/blog/inter-store-transfers-optimize-inventory-sales)
- [Umbrex, cuándo decidir una rebaja](https://umbrex.com/resources/retail-industry-playbooks/markdown-optimization-playbook/markdown-cadence-and-decision-timing/)
- [BCG, rebajas por atributo y por tienda](https://www.bcg.com/publications/2020/advanced-analytics-fashion-company-markdowns)
- [FashionNetwork, H&M y su stock sin vender (2018)](https://us.fashionnetwork.com/news/H-m-faces-up-to-growing-problem-of-unsold-stock,963623.html)
- [Style Arcade, la reunión comercial del lunes](https://www.stylearcade.com/blog/monday-retail-trade-how-fashion-merchandisers-can-smash-reporting-to-drive-profit-growth)
- [Xovis, qué es un mapa de calor en retail](https://www.xovis.com/insights/detail/heat-maps-in-retail-understanding-zones-of-interest-use-case)
- [Martec, KPIs de retail y stock fresco](https://www.martec-international.com/userfiles/file/improving-business-performance-using-retail-kpis-v1.pdf)

Frescura del piso · propuesta de trabajo de CAYLA. Ideas de Felipe; investigación y diseño con Claude, módulo Águila (Inteligencia y reportes).

Los nombres de prendas, las marcas y todas las cifras del tablero son simulados, con fines de explicación.
