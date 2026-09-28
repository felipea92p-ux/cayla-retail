# ADR-0208 — Frescura del piso: tres relojes, modelo+color por sede y percentiles de su categoría

**Fecha:** 2026-09-24
**Estado:** Diseño aprobado por Felipe el 2026-09-24, en cinco tandas de preguntas. Desde el 2026-09-25 se construye
**por bloques** (ver «Orden de construcción»). **Los bloques 1 y 2 están construidos y fusionados en `main`** desde el
2026-09-25: el 1 (bajar al piso escaneando, «Reposición» cerrada en el piso y la lectura de qué bajadas fueron tardías;
#434, ver «Construcción — bloque 1») y el 2 («Retirar del piso»; #440, `60d5aa4d`, ver «Actualización 2026-09-25 —
bloque 2» y «Actualización 2026-09-25 — revisión del bloque 2»). **La web de los dos ya está publicada** (Vercel
publica cada push a `main`). **En producción, según Felipe (2026-09-25):** la `0200` y la `0400` están pegadas y
`fn_verificar_bajadas()` devuelve 0 filas; la `0000` y la `0300` están sin confirmar; la `0100` no se confirmó por
separado, pero sus dos tablas tienen que existir, porque `fn_verificar_bajadas()` las lee y respondió. **Actualización 2026-09-26: todo pegado**, verificado por efectos el 2026-09-26 (consulta de solo lectura de Felipe y lectura directa): `0000` a `0400`, `20260926170000`, `20260926200000` y `20260926200100`. «Bajada al piso» está encendido en el rol Integrante (no en las
terminales; ver (f)). El bloque 1 se probó en el navegador sin base de datos (respuestas simuladas; escritorio y 375 px):
ver «Verificación en local». Del bloque 3 en adelante no hay nada construido; **sus decisiones se tomaron el 2026-09-26** (ver «Actualización 2026-09-26 — decisiones del bloque 3» y ADR-0246, temporadas). *2026-09-27:* el paso 3a (temporadas, ADR-0246) ya está en producción, y el diseño del 3c está en «Actualización 2026-09-27 — diseño 3c». El paso 2 del 3c (núcleo de bajadas: retiros descontados, `corregida`, carga inicial marcada) está construido y sin pegar: «Paso 2 construido (2026-09-27)», al final (con su revisión 2: el cálculo rehecho sin cruces, por el colapso con historia de otra tienda; y su revisión 3: la regla del piso de antes, decidida — se queda la vigente —, y cuatro huecos más vigilados). *2026-09-27 (noche):* los pasos 1 y 2 del 3c ya están **pegados en producción** (md5 verificados: libro `a3d9fb69…`, núcleo `fcfd2c4b…`, puerta `34a7e0cc…`), y el **paso 3 (la lectura) está construido y sin pegar**: «Paso 3 construido (2026-09-27)», al final. *2026-09-27 (revisión 5):* los cinco hallazgos que quedaban del paso 3 y sus seis decisiones pendientes, cerrados (dos de Felipe: la temporada cuenta desde que la prenda llegó a CAYLA, y un pilar de temporada pasada entra a «Por decidir»): «Revisión 5 del paso 3», al final. *2026-09-27 (revisión 7, noche):* Felipe decidió la pregunta 7 (la carga inicial no le reinicia la temporada a lo que llegó por lote) y R7-1 (lo apartado para una clienta no está colgado); van en un tercer archivo, `20260928120320`, porque el PR #544 ya se había fusionado. El paso 3 se pega en tres archivos: «Revisión 7 del paso 3», al final. *2026-09-28 (revisión 9):* el PR #545 (revisiones 7 y 8) se fusionó con esta revisión corriendo; sus hallazgos van en un cuarto archivo, `20260928120330` (lo apartado junto a una bajada tardía, la orden del Taller revertida, lo que nunca se colgó y el desempate del mismo instante), y Felipe decidió la pregunta 8 («sigue vendiendo» también sin dato de rapidez) y que una separación abierta es venta desde que se aparta. **El paso 3 se pega en cuatro archivos** y sigue sin nada en producción: «Revisión 9 del paso 3», al final.
**Número:** se escribió como 0198 (2026-09-24), pasó a 0199 porque Finanzas tomó el 0198, y a 0207 porque main tomó
hasta el 0206, y a 0208 porque el PR #424 (actividad por módulo, ya con su migración en producción) tomó el 0207. El ADR-0199 de main es otro tema («comportamiento comercial piso vs
almacén»), y este ADR se apoya en él (ver (d)).
**Módulo:** Inteligencia y reportes (Águila). Los bloques 1 y 2 viven en Inventario (Halcón).
**Documento para el equipo:** `docs/maquetas/frescura-del-piso-2026-09/frescura-del-piso.html`, publicado como artifact
privado. Todos sus datos son simulados.
**Afectará cuando se construya:** una lectura SQL nueva sobre `movimientos` y `stock`; `productos` (columna nueva
`linea`); campañas por sede (Caja); una tabla de capacidad de exhibición por categoría, sede y temporada.
**Afecta desde el bloque 1:** dos tablas nuevas (`bajadas_piso`, `bajada_piso_items`), el módulo `bajada_piso`, las
funciones `bajar_al_piso`, `fn_bajadas_del_piso`, `fn_verificar_bajadas` y `fn_prenda_corta`, un candado nuevo dentro de
`registrar_movimiento` («Reposición» ya no toca el piso), la pantalla `/inventario/bajar` con su botón «Bajar al piso»
en Existencias, y Existencias ▸ Ajustar stock, que deja de ofrecer «Reposición» en el piso. `movimientos` y `stock` no
cambian.
**Afecta desde el bloque 2:** el menú «⋯» de cada talla en Existencias («Retirar del piso»), `ReponerPisoModal` con dos
sentidos, y cómo Movimientos nombra un movimiento interno (la columna «Movimiento», el filtro y el detalle), que también
se ve en Inicio y en el historial del producto. Con su revisión, además: el texto del módulo Existencias en Roles y
accesos (`20260926170000`) y la opción `bloqueado` de `<Modal>`.

## El problema

Felipe lo planteó así: la clienta vuelve cada 1 o 2 semanas, y si ve lo mismo siente que «aquí no hay novedad» y deja
de venir. Ningún número del ERP lo mide. Tampoco hay una forma ordenada de decidir qué liquidar, entender por qué se
queda una prenda (color, talla, ubicación o defecto), repartir el espacio entre categorías o avisarle al Taller que el
piso se está poniendo viejo.

Lo que existe hoy no cubre eso:

- «Estancada» (45 días sin venta) solo existe en el documento del módulo, que describe V1.
  `UMBRAL_ESTANCADO_DIAS` (`packages/shared/src/enums.ts:41`) está declarada pero ningún archivo la importa: es código
  muerto.
- La señal viva de «esto se quedó» es `posible_sobrestock` (`apps/web/lib/resumen-reglas.ts:842-850`: cobertura,
  sell-through y un mínimo de evidencia). Mide cuánto dura el stock, no cuánto lleva la prenda a la vista.

## Decisión

1. **Nombre:** «Frescura del piso». La cifra de cabecera se llama «Edad del piso», en días. «Mapa de calor» no se usa.
2. **Solo cuenta el piso.** El tiempo en el almacén de la sede nunca cuenta como exhibición. Coincide con cómo ya se
   calcula `dias_con_stock` (`20260919141804_resumen_inventario_v2.sql`: «en venta = piso > 0»).
3. **Tres relojes:**
   - **De tienda:** desde que la prenda llega a la sede. La diferencia con el reloj de piso son los días de espera en
     almacén.
   - **De piso:** por unidad, desde que se cuelga hasta que se vende.
   - **De novedad:** por modelo+color en la sede, desde la primera vez que se exhibe.
4. **Unidad:** el modelo+color por sede, es decir `(producto_id, color_codigo, ubicacion_id)`. Las tallas se miden
   aparte: tallas clave que faltan y curvas de talla por sede para el Taller.
5. **Referencia:** la categoría en la sede, no el modelo, porque los modelos de moda viven pocas semanas y se
   descontinúan. Si la categoría tiene pocos datos, se usan las tres sedes juntas.
6. **Tramos por percentiles de la categoría:**
   - Nueva: hasta el día en que se vendió la mitad de la categoría (P50).
   - Vigente: hasta el día en que se vendieron 3 de cada 4 (P75).
   - Envejecida: hasta el día en que se vendieron 9 de cada 10 (P90).
   - Crítica: después del P90.

   Se calcula con Kaplan-Meier: lo que sigue colgado cuenta como «al menos N días». Se recalcula en vivo. Si la curva
   no llega a un corte, la pantalla dice «aún sin referencia» y muestra el porcentaje vendido a N días.
7. **Días agotada:** no cuentan.
8. **Sin tope absoluto de novedad** hasta medir cada cuánto vuelve la clienta. Para eso hay que identificarla en caja,
   con su permiso.
9. **Una prenda de moda es Nueva una sola vez en cada sede.** Reponerla o que vuelva después de agotarse no la hace
   nueva. Trasladarla a una sede donde nunca se exhibió sí: allá es Nueva. La «edad en la cadena» nunca se reinicia y
   se muestra al lado.
10. **Clásicos** (término de Felipe; por ejemplo, un polo cuello camisero atemporal): quedan fuera del semáforo de
    novedad, pero entran al reloj de piso con más peso y se comparan con su propia historia. Se les mide además la
    disponibilidad de sus tallas clave. El líder decide qué productos son clásicos.
11. **Rebaja:** por sede, la aprueba el líder, nunca es automática y va en tramos de precio. Antes de rebajar se sigue
    una escalera:
    1. Diagnosticar.
    2. Cambiar de lugar por 7 días.
    3. Trasladar a una sede donde nunca estuvo.
    4. Rebaja chica, solo en esa sede.
    5. Liquidar aparte, lejos de la entrada.
12. **Espacio:** un plan de capacidad por categoría, sede y temporada, configurable, medido en ganchos y frentes (no en
    m²).

El número que prueba que la herramienta funciona es el **% de venta a precio completo** por sede, contra una línea
base de los 6 meses anteriores al lanzamiento.

## Decisiones estructurales

**Regla de los tramos**
- **Decidí:** percentiles de la categoría en la sede, sobre el reloj de novedad del modelo+color.
- **Descarté:**
  - Cortes fijos de 7 y 15 días: dependen de cada cuánto vuelve la clienta, que hoy no se mide, y pintan de rojo por
    diseño a las categorías lentas.
  - El «promedio de lo vendido × 1,3» que propuso Felipe:
    - El promedio deja fuera lo que sigue colgado y acorta la referencia. En la simulación de vestidos de fiesta, el
      promedio bajaba de 55 a 31 días.
    - El mismo 30 % es alarma en tops, donde casi todo se vende entre el día 4 y el 8, y es ruido en vestidos de
      fiesta, que se venden entre el día 2 y el 75.

  Felipe eligió percentiles después de ver las dos reglas lado a lado.
- **Se rompe si** las colaboradoras registran la bajada al piso recién al cobrar. La caja solo vende lo que figura en el
  piso, así que ese día se registra la bajada y los días en piso quedan cerca de 0: aparecen estrellas falsas.
  - Mitigación: registrar la bajada con un escaneo por fardo. (Bloque 1: el fardo no tiene código propio, así que es
    una sesión de escaneo prenda por prenda; ver «Construcción — bloque 1».)
  - Toda bajada registrada 10 minutos o menos antes de una venta queda marcada como tardía y fuera del cálculo.
  - Un indicador de «confianza del registro» por sede.

**Nombre**
- **Decidí:** «Frescura del piso».
- **Descarté:** «mapa de calor». En retail ya significa el tráfico de clientas por zona, medido con cámaras o sensores,
  y en esos mapas el rojo significa «se vende bien»: justo al revés de lo que se quiere mostrar.
- **Se rompe si** algún día CAYLA mide tráfico por zona y quiere ese nombre: queda libre para eso.

**Rebaja**
- **Decidí:** por sede, aprobada por el líder y en tramos de precio.
- **Descarté:**
  - La campaña para las 3 sedes, que es como funciona hoy: rebaja en una sede lo que en otra todavía es Nueva.
  - La rebaja automática al pasar X días: le enseña a la clienta frecuente a esperar la rebaja.
- **Se rompe si** los precios distintos por sede generan reclamos de clientas que compran en dos ciudades. Hoy no se
  sabe cuántas hay.

## Lo que se cierra de los dos hallazgos del benchmark

1. **«Dos motores calculan cuánto se vende por día sin hablarse.»** Es cierto. Responden preguntas distintas y se
   quedan separados a propósito. Felipe pidió que se lo explicaran mejor y no tomó una decisión explícita; queda
   documentado así:
   - `fn_productos` / `fn_productos_resumen` (SQL) calculan la `demanda_diaria` como ventas de 30 días calendario ÷ 30,
     global por producto. La usa Compras para el punto de reorden: el proveedor despacha para la empresa, no para una
     tienda.
   - `calcularVelocidad` (`resumen-reglas.ts:179`) calcula ventas netas ÷ días con stock en el piso, por sede. La usa
     el Resumen para reponer y trasladar.
   - La `lib/inteligencia.ts` que mencionaba el hallazgo ya no existe: V2 la borró el 2026-09-12. La fórmula del punto
     de reorden pasó a SQL (`20260916100000_punto_reorden.sql:19-20`).
   - **Se rompe si** Compras necesita reponer por sede: ahí las dos preguntas se vuelven una y conviene una sola
     fuente.
2. **«La sugerencia de traslado ignora el almacén de la sede destino.»** Era un bug real, pero de V1.
   - `pre-v2-cutover:apps/web/lib/inteligencia.ts:133-167` sugería traslados mirando solo `stockPorSede` (el piso).
   - En V2, `planDeReposicion` suma piso y almacén del destino antes de decidir cuánto falta (`calcularUtilizable`,
     `resumen-reglas.ts:127`, usado en `:592`). Del origen cede solo lo que está en su almacén (`cedibleDe`, `:407`).
   - Estaba cerrado; el documento `docs/datos/modulos/13-inteligencia-y-reportes.md` lo seguía describiendo como
     vigente y se corrige en la misma entrega.

## Orden de construcción

Viene del anexo técnico del documento. **Felipe decidió el 2026-09-25 avanzar por bloques**: uno a la vez, cada uno
verificable y pegado antes de empezar el siguiente, en vez de construir todo de golpe. Los 12 pasos del diseño quedan
agrupados en siete bloques (entre paréntesis, el número de paso original). Las migraciones y el código del bloque 1
conservan la numeración vieja en sus comentarios: su «paso 1» es el bloque 1, su «paso 2» es el bloque 2, y sus «paso
3» y «paso 4» (el indicador y el FIFO) son el bloque 3.

**La regla se rompió dos veces, y solo una con decisión (2026-09-25).**
- *Excepción aprobada (opción A):* el bloque 2 se construyó antes de pegar el 1. Salió de la tarea 3 del plan paralelo
  «del termómetro», que ya estaba construida, y Felipe eligió rescatar solo el retiro, rebasado sobre el bloque 1
  (según la sesión que lo construyó, BITÁCORA del 2026-09-25). Las razones que dio esa sesión: sin retiro, una prenda
  guardada sigue envejeciendo como si estuviera colgada, y el retiro no necesitaba migración (es `mover_interno` al
  revés).
- *Sin decisión explícita:* la web del bloque 1 salió con la fusión del #434 (Vercel publica cada push a `main`) antes
  de pegar la `0000`, contra lo que pedía (f). No lo aprobó nadie: simplemente pasó, y dejó el botón y el módulo a la
  vista antes que su base. La equivalencia entre las tareas de ese plan y estos bloques está en BACKLOG
(«Frescura del piso — plan del termómetro»).

1. **Bloque 1 — Bajada al piso, «Reposición» cerrada en el piso y marca de bajada tardía** (paso 1). Registro de la
   bajada con escaneo por fardo; permiso para bajar sin darle a la persona todo Existencias; la marca tardía como
   lectura. **Construido el 2026-09-25 y fusionado (#434); en producción completo desde el 2026-09-26** (ver (f)).
   El indicador de «confianza del registro» por sede pasó al bloque 3.
2. **Bloque 2 — «Retirar del piso»** (paso 2): no hace falta una función nueva, falta la pantalla. Es `mover_interno`
   con origen (piso) y destino (almacén) invertidos. *Corregido el 2026-09-25: este punto decía «la función existe»
   pensando en `devolver_a_almacen`, que era del modelo V1 y ya no existe; `bajar_a_piso` tampoco.*
   **Construido y fusionado el 2026-09-25** (#440, `60d5aa4d`; ver «Actualización 2026-09-25 — bloque 2»). Su web ya
   está publicada; la revisión sumó la migración `20260926170000`, pegada el 2026-09-26.
   - **Entre el bloque 2 y el 3: el candado de `mover_interno`** (un token contra el doble envío, como el de
     `bajar_al_piso`). Va ANTES del bloque 3 porque el indicador de confianza (Σ `cantidad`) y los relojes leen esas
     filas: un envío doble infla las dos cosas. **Construido y en producción el 2026-09-26** (migraciones `20260926200000`
     y `20260926200100`, web #458; ver «Actualización 2026-09-26 — la marca de `mover_interno`»).
3. **Bloque 3 — La pantalla de Frescura** (pasos 3, 4, 5 y 7): reloj de novedad por modelo+color, reloj de piso por
   unidad con emparejamiento FIFO, curva de Kaplan-Meier con P50, P75 y P90 por categoría y sede, tramos e índice de
   rapidez, el indicador de «confianza del registro» por sede (contrato en (d)) y atributos y marcas en la lectura. Se
   construye encima del dominio de Inventario de main, no al lado (regla en (d)). Nace como módulo nuevo, solo para el
   líder (ADR-0161). Si Felipe la aprueba, entra aquí la marca de «retirada de la venta» (ver «Lo que falta decidir»).
4. **Bloque 4 — Clásicos y tallas clave** (paso 6): `productos.linea` («moda» o «clásico») y tallas clave por
   categoría. Es un cambio de esquema.
5. **Bloque 5 — Traslado por novedad y alerta al Taller** (pasos 8 y 9): llevar a otra sede lo que allá nunca se
   exhibió, y avisar a Producción y Compras cuando el piso tiene poca novedad.
6. **Bloque 6 — Capacidad por temporada** (paso 11): plan de capacidad por categoría, sede y temporada, en ganchos y
   frentes. Es un cambio de esquema.
7. **Bloque 7 — Rebaja por sede** (paso 10), en tramos de precio. Toca la caja: va al final, con migración y ensayo
   antes de producción.

Fuera de los bloques: zonas de exhibición (paso 12), más adelante.

**Números** (*corregidos el 2026-09-25*):
- Los que decía este ADR («hoy: cerca de 24.000 movimientos, 7.000 ventas, 1.300 variantes y 45 categorías») salieron
  del volcado del 2026-09-23, que todavía tenía la **demo**. La demo se retiró de producción el 2026-09-24 y quedaron
  3 productos reales (BITÁCORA, «Demo de 90 días retirada de producción»). Producción hoy tiene unos **42 movimientos y
  0 a 1 ventas** (consulta de solo lectura del 2026-09-25). Las 1.300 variantes y las 45 categorías venían del mismo
  volcado y no se volvieron a medir.
- «Unos 250.000 movimientos en 3 años» era la demo multiplicada por 10, no una proyección. Todavía no hay una
  proyección medida.
- El escaneo prenda por prenda multiplica las filas de `movimientos`: cada bajada escribe una fila por prenda distinta
  (modelo, talla y color), y hasta ahora casi nada de lo que subía al piso dejaba fila de bajada. Estimación sin medir:
  de 10.000 a 100.000 filas de bajada por tienda al año, y unos 1.000 documentos de bajada.
- Aun así, la curva de una categoría en una sede a 120 días sigue siendo de cientos a pocos miles de unidades: se
  calcula al vuelo. Una foto diaria guardada en una tabla solo hace falta si una pantalla tarda más de 1 segundo por
  sede. La lectura de bajadas tardías del bloque 1 tiene el mismo umbral: con carga sintética (una tienda, 2.000
  prendas, 20.001 bajadas y 10.001 ventas) tardó unos 560 ms a 120 días y unos 157 ms a 30 días (detalle en
  «Verificación en local»).
- Consecuencia: la herramienta arranca sin historia. Los percentiles, la curva de Kaplan-Meier y el mínimo de 20
  bajadas del indicador de confianza van a tardar semanas en tener datos. La línea base del % a precio completo
  tampoco existe todavía.

## Lo que falta decidir

- Tallas clave por categoría y qué productos son clásicos: los decide el líder.
- Mínimo de datos por categoría. Propuesta: 20 modelos+color o 30 unidades en 8 semanas.
- Ventana de la curva. Propuesta: 90 a 120 días.
- Metas de % de piso Nueva y de novedades por semana. Propuesta: 25 % y 10, ajustadas a la capacidad de cada sede.
- Costo y días de un traslado en cada ruta.
- Identificar a la clienta en caja.
- Si la alerta al Taller solo avisa o abre una orden. Propuesta: solo avisa.
- Lo que abrió el bloque 1 (a quién se le enciende la bajada, la D-40 frente a la caja, «Reposición» en el almacén, la
  exclusión de las prendas por regularizar, el mínimo de muestra del indicador): ver «Construcción — bloque 1», punto
  (g).
- Lo que abrió el bloque 2: una marca de «retirada de la venta» por talla y sede, con un motivo cerrado del retiro. Sin
  ella, Existencias («Reponer», «Por colgar»), Análisis y la consulta 05 del termómetro leen un retiro a propósito como
  falta de reposición. Ver «Actualización 2026-09-25 — revisión del bloque 2», «Lo que hereda el bloque 3».

## Construcción — bloque 1 (2026-09-25): bajar al piso escaneando, cerrar «Reposición» en el piso y saber qué bajadas fueron tardías

Felipe pidió construir el primer paso, que hoy es el bloque 1. Antes de escribir código, siete lectores revisaron el
repo y producción (solo lectura). Con eso compitieron tres diseños y se armó un plan, y siete paquetes se construyeron
en paralelo. Después, tres revisores adversariales (base y concurrencia; web y contrato; negocio y documentos)
encontraron fallas; se fusionó `origin/main`, que traía el retiro de «+ Nuevo» (ADR-0204) y el libro único de piso y
almacén (ADR-0202); y cuatro paquetes más corrigieron todo. **Al cerrar el bloque no se había pegado nada en
producción** (lo que se pegó después está en la cabecera y en (f)).

Qué queda, en una frase: la colaboradora entra por el botón «Bajar al piso» de Existencias, escanea con la pistola cada
prenda que cuelga y confirma una vez; la base baja todo o nada y no repite si ella vuelve a confirmar; «Reposición» ya
no sube ni baja prendas en el piso; y el líder puede preguntar qué bajadas se registraron al cobrar en vez de al colgar.

### (a) Lo que la realidad corrigió

Seis supuestos del diseño no calzaban con el código ni con la base:

1. **`bajar_a_piso` y `devolver_a_almacen` no existen.** Eran del modelo V1 (`stock_almacen`). Hoy bajar y retirar del
   piso es la MISMA función: `retail.mover_interno(p_ubicacion_id, p_variante_id, p_cantidad,
   p_sububicacion_origen_id, p_sububicacion_destino_id, p_nota)`. Mueve una prenda por llamada; retirar es invertir
   origen y destino. Escribe una fila de tipo `traslado` con motivo `movimiento_interno`, que Movimientos rotulaba
   entonces «Reposición interna» (desde el bloque 2, «Bajada al piso» o «Retiro del piso»; ver «Movimientos nombra la
   bajada y el retiro por su par»). No tiene token ni candado de módulo: solo pregunta si la cuenta opera esa tienda.
   En la web la usaba solo el botón «Reponer» de Existencias, una prenda por vez, en un modal.
2. **El «fardo» no se puede escanear.** Un `lote` es una recepción de un proveedor y no tiene código legible. Los
   códigos de barras identifican una prenda (modelo, talla y color), no una unidad ni un fardo. Y `stock` no guarda de
   qué lote viene cada unidad: se sabe cuánto ENTRÓ de un lote, no cuánto sigue en el almacén. `movimientos.lote_id` no
   sirve para marcar la bajada: `apps/web/lib/compras.ts:614-621` suma todo lo que lleva ese lote y contaría la bajada
   como mercadería recibida.
3. **Hoy se escanea solo con pistola tipo teclado:** el código llega como texto más Enter. No hay cámara ni librería.
4. **Producción está casi vacía:** unos 42 movimientos y 0 a 1 ventas (ver «Números», corregido).
5. **El piso de hoy casi no entró por bajada.** 92 de las 146 unidades que hay en el piso entraron el 2026-09-24 por
   Existencias ▸ Ajustar stock ▸ Piso ▸ «Reposición»: un ajuste que suma en el piso sin restar del almacén (cifra de un
   lector, no repetida). Esas unidades no dejan rastro de bajada y ninguna cifra de Frescura las ve.
6. **La venta exige la unidad en el piso.** `registrar_venta` descuenta del piso. Con piso 0 la caja dice «está
   agotada» sin avisar que hay en el almacén (`apps/web/components/PuntoDeVenta.tsx:561-563`). La colaboradora va a
   Existencias, baja y vuelve a cobrar: ahí nace la bajada tardía. Eso contradice la D-40 («la caja no se frena nunca
   por un trámite», `docs/datos/DECISIONES-2026-09-12.md`), que no está implementada.

Y dos más, de permisos: el candado de Existencias está solo en la pantalla (el layout de `/inventario` no protege
nada), y Existencias en Roles y accesos no es solo «reponer»: también ajusta stock y aparta.

Mientras se construía, main cambió otras dos cosas:

7. **«+ Nuevo» ya no existe.** El plan ponía la entrada como una acción de «+ Nuevo»; main retiró ese botón entero,
   en escritorio y en el celular, el mismo día (ADR-0204). La entrada pasó a un botón en Existencias (ver (b)).
8. **El libro de piso y almacén ya tenía una fuente única.** Main juntó en `retail.fn_ledger_puntos` (ADR-0202) el
   saldo de partida, qué es un delta y a qué cubeta va, con la venta decidida por `fn_es_venta_de_stock` y el traslado
   interno por `fn_es_traslado_interno`. La primera versión de la lectura de tardías copiaba ese cálculo, decidía por
   su cuenta qué es venta y ya difería del libro en un caso (una transferencia que llega de otra tienda directo al
   piso); se rehízo encima del libro (ver (b)).

**La lección.** Los documentos escritos a mano (`ARQUITECTURA.md`, `docs/datos/05-SEGURIDAD.md`,
`docs/datos/modulos/05-inventario-y-movimientos.md`) seguían describiendo funciones de V1 que ya no existen, y este ADR
las repitió («la función existe»). Los números del ADR salieron de un volcado que todavía tenía la demo. Antes de
diseñar sobre un nombre, se busca en `supabase/migrations/` y en `docs/datos/generado/` (que escribe un script leyendo
la base); antes de apoyarse en una cifra, se le pregunta a producción. Y antes de construir sobre `main`, se trae
`main` al día: dos de los hallazgos bloqueantes de la revisión existían solo porque la rama llevaba horas sin fusionar.
En esta entrega esos documentos quedaron con notas «(V1; hoy: …)».

### (b) Decisiones

**Una sola función que guarda, encima de `mover_interno`**
- **DECIDÍ:** `retail.bajar_al_piso` recibe la lista entera, bloquea las prendas con `fn_bloquear_en_orden` (el mismo
  orden que ventas, traslados y recepciones, ADR-0190), valida todo con las prendas ya bloqueadas y recién entonces
  llama a `mover_interno` una vez por prenda, dentro de la misma transacción. La fila del libro es idéntica a la del
  botón «Reponer»: un solo productor de la fila «almacén → piso».
- **DESCARTÉ:** escribir directo en `movimientos` y llamar al motor: habría dos productores de la misma fila y, si algún
  día se separan, la lectura de bajadas tardías solo vería bien a uno. Y llamar N veces desde la web: no es todo o
  nada, y `mover_interno` no tiene token.
- **SE ROMPE SI:** alguien le pone a `mover_interno` un candado que exija Existencias (revisar la D-26): quien solo
  tenga «Bajada al piso» dejaría de poder bajar, y la prueba «rol con solo bajada_piso baja» lo detecta. O una bajada
  de 300 prendas tarda más de ~1 s por lo que cuesta firmar y validar la tienda en cada llamada (estimación sin medir).

**Token obligatorio y huella de la lista, en dos tablas propias**
- **DECIDÍ:** cada intento lleva un `p_token` que genera la pantalla, y es obligatorio. La base guarda una huella md5
  de la lista ordenada. Mismo token y misma lista = la misma bajada, sin mover nada otra vez (`ya_registrada = true`).
  Mismo token con otra lista = error, no se mueve nada, y el error trae en su `detail` las líneas que ya se guardaron
  con ese token, para que la pantalla le deje a ella solo lo que faltaba (ver «Envío incierto»). Se guarda en
  `bajadas_piso` (el documento) y `bajada_piso_items` (una fila por prenda, cuya llave es el movimiento). `movimientos`
  y `stock` no cambian.
- **DESCARTÉ:** solo un candado de sesión: se suelta al confirmar y el reintento repetiría la bajada. El token opcional
  de ADR-0190: la pantalla reenvía el mismo token con la lista ya editada y la base devolvería el documento viejo, sin
  la prenda agregada. Una columna nueva en `movimientos`: toca el núcleo. Una lista de ids sin tabla: dos bajadas
  podrían citar el mismo movimiento.
- **SE ROMPE SI:** el token se pierde entre dos intentos: se cortó la red justo después de guardar, el navegador no
  pudo guardar el borrador (modo privado) y ella recarga la página. El intento nuevo lleva otro token y la bajada se
  repite, hasta donde alcance el almacén. Movimientos lo muestra como dos filas de la misma prenda a minutos de
  distancia.

**Envío incierto: la lista se congela hasta saber qué pasó**
- **DECIDÍ:** si la red se corta y no se sabe si la base guardó, la pantalla congela la lista (escáner, −, +, número y
  Quitar apagados) y solo ofrece «Confirmar de nuevo», con la misma lista y el mismo token. El borrador del navegador
  (versión 2) anota la hora del envío (`enviadoEn`) ANTES de llamar a la base y se borra con cualquier respuesta de
  ella; si ella recarga, la lista vuelve congelada con «Enviaste esta bajada a las HH:mm y no llegó la respuesta. Pulsa
  «Comprobar»: si ya se guardó, no se repite.», sin «Empezar de nuevo». Si aun así llega `bajada_token_reusado`, la
  pantalla resta lo guardado (`loQueFalta`), conserva solo lo que falta con un token nuevo y agrega «Te quedan N
  prendas por confirmar.».
- **DESCARTÉ:** dejar la lista editable después del corte, como estaba. Cualquier prenda sumada cambia la huella, la
  base responde «ya se guardó» y la pantalla vaciaba TODO, incluidas prendas que nunca se guardaron. Y el borrador
  sin marca de envío: al recargar decía «sin confirmar» aunque la bajada sí se había guardado, y «Empezar de nuevo»
  con un token nuevo bajaba el fardo dos veces (el revisor lo reprodujo: el sistema quedó con 6 en el almacén y 4 en el
  piso, cuando la verdad era 8 y 2).
- **SE ROMPE SI:** el borrador enviado vence (a las 12 horas, como todos) antes de que ella vuelva: se descarta sin
  comprobar y ella podría escanear otra vez lo ya bajado. O la base deja de mandar el `detail` (una `0200` vieja): la
  pantalla vuelve a vaciar la lista con «Empezar otra bajada», que no duplica pero pierde lo que no se guardó. O la
  base cambia la redacción «a las HH:MM»: la tarjeta pierde la hora (la prueba de contrato de `bajada-reglas.test.ts`
  se pone roja antes).

**Un reenvío solo sale de la duda cuando la base miró la marca**
- **DECIDÍ:** `bajar_al_piso` revisa en este orden: módulo y tienda → forma de la lista → la MARCA (candado y búsqueda)
  → recién entonces el responsable. Comprobar una bajada ya guardada no escribe nada, así que responde «ya estaba
  registrada» aunque la responsable haya marcado su salida en el medio. La pantalla, en un reenvío, solo suelta la
  marca de «enviado» cuando la respuesta prueba que la base la miró (`respuestaResuelveLaMarca`: éxito, marca reusada o
  ajena, responsable, tienda sin piso, prendas que no alcanzan, o un choque de candados 40P01). Con un corte, una
  sesión vencida, el módulo apagado o sin permiso en la tienda, la lista sigue congelada, el borrador conserva la hora
  del envío y debajo del rechazo sale: «Todavía no sabemos si la bajada que enviaste a las HH:mm se guardó. Cuando se
  resuelva lo de arriba, pulsa «Comprobar»: si ya se había guardado, no se repite.».
- **DESCARTÉ:** tratar cualquier respuesta con código como definitiva, como hacía la primera corrección: la base
  rechazaba por el responsable ANTES de mirar la marca, la pantalla borraba la marca y, al recargar, decía «sin
  confirmar» de una bajada que sí se había guardado (el revisor lo reprodujo con la responsable que marcó su salida).
- **SE ROMPE SI:** alguien reordena la función y pone un rechazo nuevo antes de la marca sin sumarlo a la lista de la
  pantalla, o uno después sin quitarlo de la lista. `bajada-reglas.test.ts` lee la migración y se pone rojo si el orden
  cambia; `pruebas:bajada-al-piso` prueba «misma marca, misma lista, responsable fuera de turno → ya estaba registrada»
  (con la función mutada al orden viejo, cae ese caso y el de la firma única: 49/51).

**Lo que la pistola lee mientras se guarda no se pierde**
- **DECIDÍ:** mientras se guarda, mientras se refresca la página o mientras el loader global está a la vista (la app
  queda `inert`, ADR-0149), un oyente en `window` guarda en un búfer lo que manda la pistola. Al quedar libre, cada
  código se lee con la lógica normal sobre la lista y los topes nuevos, y un código a medias vuelve al campo para que
  la pistola lo termine.
- **DESCARTÉ:** avisar en la tarjeta de éxito «lo que escaneaste mientras se guardaba no se leyó»: la pistola pita
  igual y ella no está mirando la pantalla. Y cambiar la regla del loader, que es de todo el ERP.
- **SE ROMPE SI:** el loader deja de anunciarse por `esperaOcupada()` (`lib/espera-estado.ts`), o pasa a frenar también
  el teclado de `window` y no solo el de los hijos de `body`. En el navegador se vio funcionar: escaneos hechos mientras
  la página se recargaba aparecieron en la lista al quedar libre.

**Permiso: módulo propio, sin que Existencias lo implique**
- **DECIDÍ:** módulo `bajada_piso` («Bajada al piso», grupo Inventario, orden 85, delegable, nace sin rol). El candado
  vive DENTRO de la función: `retail.fn_ve_modulo('bajada_piso')`. Ver Existencias no da la bajada. No hay
  `fn_puede_bajar_al_piso()`. Felipe lo confirmó el 2026-09-25: es un interruptor propio.
- **DESCARTÉ:** que Existencias implique la bajada (`moduloAlterno` y una capacidad de dos módulos), que proponía la
  síntesis previa: ADR-0161 dice que el código nunca asigna un módulo a un rol, y la casilla de Roles y accesos diría
  «no» mientras la persona sí puede. Nadie pierde nada sin ella: «Reponer» y `mover_interno` no cambian. Y
  `fn_capacidad_por_modulos`: el rol Integrante es «limitado como hoy» y no podría bajar aunque el líder le encienda el
  módulo.
- **SE ROMPE SI:** Felipe quiere que la Terminal Almacén baje el día 1 sin tocar Roles y accesos: son pocas líneas
  (sumar `fn_ve_modulo('existencias')` en la función, mostrar el botón de Existencias con cualquiera de los dos módulos
  y ajustar las pruebas). O el líder lo enciende en la Terminal de ventas y las cajeras bajan al cobrar: suben las
  tardías (eso es una decisión de negocio).

**Sin precarga desde la recepción**
- **DECIDÍ:** «por fardo» es una SESIÓN: abres el fardo, escaneas cada prenda que cuelgas y confirmas una vez. La
  función no recibe `lote_id`.
- **DESCARTÉ:** precargar las líneas de un lote, que también proponía la síntesis: no hay fardo como cosa, `stock` no
  sabe cuánto de un lote sigue en el almacén, y confirmar una precarga sin escanear registra lo supuesto y no lo
  colgado, que es justo la falsedad que Frescura quiere medir. Además abre el problema de bajar dos veces el mismo lote.
- **SE ROMPE SI:** las sesiones reales pasan de ~10 minutos por fardo (300 prendas a 1–2 s cada una, estimación) y las
  colaboradoras dejan de escanear. Primero va la guía de solo lectura del 1b (ver (g)); la precarga, solo si no
  alcanza.

**Entrada: un botón «Bajar al piso» en Existencias**
- **DECIDÍ (Felipe, 2026-09-25):** la única entrada a `/inventario/bajar` es un botón «Bajar al piso» en la cabecera de
  Existencias, a la izquierda de «+ Nuevo traslado». Aparece solo si el rol ve «Bajada al piso», si la sede que se mira
  es la sede activa (la pantalla baja siempre en la sede activa) y si esa sede separa piso y almacén. En
  `/inventario/bajar`, «← Volver a Existencias» aparece solo si el rol ve Existencias. El lateral no cambia: `menu.ts` y
  `menu-hoy.golden.json` quedan idénticos a main.
- **DESCARTÉ:** la acción en «+ Nuevo» que traía el plan: main retiró ese botón entero el mismo día (ADR-0204). Una
  hoja en Inventario, en el lateral: el perfil que analiza ya tiene 6 hijas y el tope es 6 (`menu.test.ts`: si no
  cabe, se regrupa; «estos números no se suben para que la prueba pase»). El Inicio de las terminales: `accesosInicio`
  no se filtra por módulo y le mostraría el acceso a quien no puede usarlo.
- **Consecuencia aceptada por Felipe:** quien tiene «Bajada al piso» sin Existencias no tiene cómo llegar a la
  pantalla, salvo escribiendo la dirección `/inventario/bajar` o con un marcador del navegador. Hoy nadie está en ese
  caso: el módulo nace solo para el líder.
- **SE ROMPE SI:** Felipe le da «Bajada al piso» sin Existencias a un rol (por ejemplo, una Terminal Almacén recortada
  para que no ajuste stock): no encuentra la pantalla. Entonces se abre una entrada propia (regrupar Inventario, o el
  Inicio filtrado por módulo) en un cambio aparte, con el OK de Felipe al menú. O un rediseño de Existencias quita la
  cabecera y el botón se va con ella.

**La marca tardía se calcula al leer, encima del libro único**
- **DECIDÍ:** `retail.fn_bajadas_del_piso` la calcula al leer. Reconoce la bajada por su FORMA (un traslado interno de
  la tienda según `fn_es_traslado_interno`, del almacén al piso), así que cuenta también las del botón «Reponer». El
  nivel del piso, los deltas, la venta y el saldo de partida salen de UNA llamada a `retail.fn_ledger_puntos`
  (ADR-0202) con las prendas de las bajadas; esta función solo agrega tres cosas propias: que la venta haya salido del
  piso, que no sea de las `prendas_por_regularizar` y que cuente a la hora de la venta. Si el stock y el libro no
  cuadran, la fila sale «dudosa» y queda fuera de cualquier indicador. Sin pantalla: solo el líder, por SQL.
- **DESCARTÉ:** guardar la marca: es imposible, porque la venta todavía no existe cuando se baja y `movimientos` no se
  edita. Reconstruir el piso por su cuenta, como hacía la primera versión: era un tercer cálculo del mismo libro, ya
  difería de él (una transferencia que llega de otra tienda directo al piso daba piso 4 aquí y 2 en el libro), y una
  corrección futura del libro no le llegaría. La exclusión de las prendas por regularizar sí se mantuvo, a propósito,
  como regla propia de esta lectura (ver (g)). Una consulta por cada bajada (unas
  2·N·M evaluaciones): pasaría el límite de 8 s a 120 días. La regla simple «bajada 10 minutos o menos antes de una
  venta»: marca como tardía una bajada legítima de una prenda que se vende rápido. Mostrársela a las colaboradoras: una
  cifra que te mide se vuelve la meta y deja de medir.
- **SE ROMPE SI:** hay ventas sin conexión que se sincronizan horas después (se sellan con la hora de sincronización);
  o el stock deja de cuadrar con el libro (la fila sale «dudosa»); o `fn_ledger_puntos` deja de dar un punto de piso
  por movimiento con su `oid` (la bajada desaparece del resultado en silencio, en vez de salir «dudosa»); o la lectura
  pasa de 1 s por tienda a 120 días. Hoy mide unos 560 ms con carga sintética (la versión con cálculo propio daba unos
  126 ms), y casi todo es el libro: lo primero es el semi-join por hash en `fn_ledger_puntos` (unos 330 ms, las mismas
  filas), no un índice.

**Movimientos nombra la bajada y el retiro por su par de sububicaciones** (reescrita en la revisión del bloque 2; la
decisión anterior está en «Historia», al final)
- **DECIDÍ:** una fila es «interna» por su ESTRUCTURA y no por su motivo: la categoría `interno` que devuelve
  `fn_movimientos`, la misma que decide `fn_es_traslado_interno` (ADR-0203). Y se nombra por el PAR exacto de
  sububicaciones, el mismo que usa `fn_bajadas_del_piso`: almacén de tienda → piso de venta = «Bajada al piso»; piso de
  venta → almacén de tienda = «Retiro del piso». Cualquier otro par (cuarentena, sin origen, racks del Taller) conserva
  el nombre de su proceso: «Movimiento interno» si lo escribió `mover_interno`, «Activación piso/almacén» si es la
  activación. El filtro del motivo `movimiento_interno` se llama «Movimiento interno», porque trae todo lo que escribe
  `mover_interno`, sea cual sea el par. El detalle dice «unidades movidas». El motivo en la base no cambia
  (`apps/web/lib/movimientos-reglas.ts`: `etiquetaMovimiento` e `INTERNO_POR_PAR`).
- **DESCARTÉ:**
  - Nombrar solo por el destino, como hizo el bloque 2: una salida de cuarentena al piso se llamaba «Bajada al piso»
    aunque `fn_bajadas_del_piso` no la cuenta como bajada, y una fila sin origen que llega al almacén se llamaba «Retiro
    del piso» sin haber estado nunca en el piso.
  - Decidir «interno» por el motivo (`motivo = 'movimiento_interno'`): ADR-0203 lo prohíbe en código nuevo, y un
    traslado interno escrito con otro motivo quedaría con otro nombre.
  - Mantener el filtro como «Bajada o retiro del piso»: prometería algo que no entrega, porque trae también los otros
    pares.
  - Mantener «Reposición interna» para los dos sentidos (la decisión del bloque 1): con el retiro, un mismo nombre no
    dice hacia dónde fue la prenda.
- **SE ROMPE SI:** una pantalla nueva mueve entre almacén y piso con otro motivo y alguien espera verla bajo el filtro
  «Movimiento interno» (el filtro va por motivo; el nombre, por estructura). O `fn_movimientos` deja de devolver el tipo
  de la sububicación de origen o de destino: todo cae en «Movimiento interno». O una activación futura se escribe de
  almacén a piso: se nombraría «Bajada al piso», y `fn_bajadas_del_piso` también la contaría como bajada.
- **Historia:** el bloque 1 decidió no cambiar el nombre (la bajada seguía como «Reposición interna» y «unidades
  repuestas») y dejó escrito que, cuando existiera el retiro, se distinguiría por el tipo de las sububicaciones de
  origen y de destino, no por el motivo. El bloque 2 lo resolvió a medias: nombraba solo por el destino y filtraba
  antes por el motivo. La revisión lo dejó como dice el DECIDÍ.

**«Reposición» cerrada en el piso**
- **DECIDÍ (Felipe, 2026-09-25):** un ajuste con motivo «Reposición» sobre el piso de una tienda se rechaza en la base,
  suba o baje (`20260926000400`: un candado dentro de `registrar_movimiento`, hint `reposicion_piso_cerrada`).
  Existencias ▸ Ajustar stock ya no ofrece «Reposición» cuando la ubicación es Piso, y en su lugar muestra la nota
  «Para subir prendas del almacén al piso usa «Bajar al piso» o «Reponer», en Existencias: así salen del almacén. Si
  ninguno te aparece para esta prenda, pídele al líder que active «Bajada al piso» en tu rol. Para guardar prendas del
  piso en el almacén usa «Retirar del piso», en el menú «⋯» de la talla en Existencias. Si al contar encontraste
  prendas de más en el piso, elige «Conteo físico».» (la oración de «Retirar del piso» la sumó la revisión del bloque
  2; el mensaje de la base no la tiene, ver «`registrar_movimiento`: candado nuevo»). Lo que sube del almacén se baja;
  lo que baja al almacén se retira; lo que aparece de más al contar va por «Conteo físico». El Taller (que no separa
  piso y almacén) y el almacén no cambian.
- **DESCARTÉ:** solo avisar, que es lo que se había construido primero: una nota no cambia el hábito (92 de las 146
  unidades del piso de producción entraron por ahí el 2026-09-24), y además decía «esto suma prendas al piso» justo
  cuando la base lo iba a rechazar. Cerrar solo el ajuste que suma: el par «−N en el almacén, +N en el piso» hecho a
  mano es la misma bajada falsa, sin hora de colgado y sin rastro de bajada. Renombrar el motivo: el modal y el libro
  dirían cosas distintas.
- **SE ROMPE SI:** alguien usa «Otro» o «Conteo físico» para lo mismo: ninguna base impide mentir sobre el motivo, y el
  piso sube sin bajada (`fn_bajadas_del_piso` no lo ve y el reloj de piso queda con un hueco). O alguien vuelve a pegar
  `20260921120000`, que recrea `registrar_movimiento` desde el archivo y borra este candado junto con los otros
  parches en vivo.
- **«Reposición» en el ALMACÉN sigue abierta:** un ajuste «Reposición» en el almacén se sigue aceptando. Queda como
  pendiente en BACKLOG: ¿se cierra también, o es la forma legítima de corregir el almacén?

**Dos más, chicas:**
- Todos los errores de negocio salen con el código P0001 y una pista (`hint`) estable; nada con 42501 propio, porque
  `traducirError` solo deja pasar P0001 tal cual y un 42501 caería en «No se pudo… avisa a Felipe».
- La lista vive en el navegador y la base se toca una sola vez, al confirmar. Hay un borrador por tienda en el
  navegador (versión 2: la lista, el token, la hora de creación y, si ya se envió, la del envío) que vence a las 12
  horas y se ofrece retomar. No se guarda por lectura como en Conteo: `mover_interno` SUMA, y un reintento duplicaría.

### (c) El contrato

**`retail.bajar_al_piso(p_ubicacion_id uuid, p_items jsonb, p_token uuid) returns jsonb`**
- `security definer`, sin valores por defecto. La ejecuta `authenticated`, no `anon`. No empieza con un prefijo de
  lectura, así que el loader global la trata como guardado.
- Entra: `[{"variante_id": "<uuid>", "cantidad": <1 a 999999>}, …]`, de 1 a 300 prendas distintas. La misma prenda
  repetida se suma en una línea. No recibe sububicaciones: el origen es el almacén de ESA tienda y el destino, su piso.
- Sale: `{"bajada_id": "<uuid>", "ya_registrada": false|true, "lineas": <int>, "unidades": <int>, "registrada_en":
  "<fecha y hora>"}`.
- Candados en orden fijo: primero el del token, después las prendas con `fn_bloquear_en_orden`. Se valida con todo
  bloqueado y recién entonces se escribe.
- Todo o nada: si una sola prenda no alcanza, no se baja ninguna, y el error las nombra a todas (hasta 5 en el texto,
  hasta 50 en `detail` como JSON). Ejemplo: «No se bajó nada. Blusa lino · M · Blanco: pides 3 y en el almacén hay 1
  (2 apartadas para clientas). Puede que otra persona ya las haya bajado: revisa el piso y corrige esas líneas.» Con
  una sola apartada dice «(1 apartada para una clienta)»; con seis prendas con problema, «. Y 1 prenda más»; con más,
  «. Y N prendas más».
- Firma con `retail.fn_actor_persona_id(true)`: el responsable del combo (ADR-0162).
- Pistas de error: `bajada_sin_token`, `bajada_sin_modulo`, `bajada_sin_tienda`, `responsable_requerido`,
  `bajada_vacia`, `bajada_linea_invalida`, `bajada_muy_larga`, `bajada_token_ajeno`, `bajada_token_reusado`,
  `bajada_tienda_sin_piso` y `bajada_sin_alcance`. Los textos exactos están en `20260926000200`.
- **`bajada_token_reusado`** (mismo token, otra lista): «Esa bajada ya se guardó a las HH:MM con N prendas. No se
  repitió: la pantalla te deja solo lo que faltaba.» La hora es la de Lima; N son las unidades ya guardadas, y con una
  sola dice «con 1 prenda». El `detail` es el texto de un arreglo JSON con las líneas ya guardadas, en orden de prenda:
  `[{"cantidad": 2, "variante_id": "<uuid>"}, …]` (hasta 300). Se lee como JSON y nunca se compara como texto: las
  claves salen en el orden en que las escribe `jsonb`. Por PostgREST llega como `details`.

**Tablas** (RLS encendido y sin políticas, más `revoke` a todos: solo las leen las funciones)
- `bajadas_piso`: `id`, `token_cliente` (único), `ubicacion_id`, `persona_id`, `huella` (md5, 32 caracteres) y
  `created_at`. No guarda líneas ni unidades: se cuentan desde los ítems.
- `bajada_piso_items`: `movimiento_id` (la llave: un movimiento pertenece a una sola bajada), `bajada_id`,
  `variante_id` y `cantidad > 0`. Una fila por bajada y prenda. Nunca la «Prenda sin registrar».
- Cuatro disparadores. Uno por tabla impide editar o borrar: «Una bajada registrada no se edita ni se borra. Si te
  equivocaste, registra el movimiento contrario.» Otro por tabla, el mismo de `movimientos`
  (`fn_historial_sin_truncate`), impide vaciarlas con TRUNCATE. Se crean con `create or replace trigger`, nunca con
  `drop trigger` (ADR-0195).

**Lo que el esquema hace imposible:** una bajada a medias; la misma bajada dos veces; un movimiento en dos bajadas o
un ítem sin movimiento; la misma prenda dos veces en una bajada; bajar la «Prenda sin registrar»; dejar stock negativo
o mover lo apartado para una clienta; bajar desde cuarentena o a otra tienda; editar, borrar o vaciar las bajadas; una
bajada sin autor; que la baje una cuenta sin el módulo; y, con la `0400`, que un ajuste «Reposición» suba o baje el
piso. **Lo que no puede impedir** (un documento sin ítems, o un ítem cuyo movimiento no sea almacén → piso de la misma
tienda) lo vigila `retail.fn_verificar_bajadas()`, solo desde el SQL Editor, que debe devolver cero filas siempre.

**`retail.fn_bajadas_del_piso(p_ubicacion_id uuid, p_desde timestamptz default null, p_hasta timestamptz default
null, p_minutos integer default 10)`**
- Solo lectura y solo el líder; cuando exista el módulo Frescura pasará a `fn_ve_modulo('frescura')`. Por defecto mira
  los últimos 30 días. La ventana va de 1 a 240 minutos y el rango máximo es de 120 días. El Taller (sin piso y
  almacén separados) y una tienda inactiva devuelven cero filas, sin error.
- Una fila por movimiento de bajada: `movimiento_id`, `bajada_id` (vacío si vino por «Reponer»), `variante_id`,
  `persona_id`, `bajada_en`, `cantidad`, `piso_antes`, `vendidas_en_ventana`, `unidades_tardias`, `cerrada` y `estado`
  (`normal`, `tardia`, `en_curso` o `dudosa`).
- `piso_antes`: lo que había en el piso justo antes de la bajada = nivel − delta en el punto de piso de
  `fn_ledger_puntos` cuyo `oid` es el movimiento de la bajada.
- `vendidas_en_ventana`: unidades de esa prenda que salieron del piso por venta (`es_venta` del libro, es decir
  `fn_es_venta_de_stock`, con delta negativo en el piso) en los `p_minutos` siguientes, con los dos extremos incluidos
  y a la hora de la venta (`coalesce(ventas.created_at, movimientos.created_at)`). No cuentan las anuladas, la entrega
  de un apartado ni la regularización de la «Prenda sin registrar» (`prendas_por_regularizar`; esta exclusión vale
  solo aquí, no en Análisis).
- **`unidades_tardias = min(cantidad, max(0, vendidas en los 10 minutos − piso_antes))`.** Traducido: si antes de
  bajar ya había en el piso lo suficiente para lo que se vendió en esos 10 minutos, la bajada no fue tardía; lo que
  faltó para cubrir esas ventas se bajó al cobrar. Ejemplo: piso vacío, se bajan 3 y a los 3 minutos se vende 1: 1
  unidad tardía. Piso con 5, se bajan 3 y se venden 2: ninguna.
- Con `piso_antes` negativo (el stock y el libro no cuadran), `unidades_tardias` queda vacío y el estado es `dudosa`.
- Depende de `20260924030000_ledger_fuente_unica.sql` (`fn_ledger_puntos` y `fn_es_traslado_interno`): si falta, la
  migración se detiene antes de crear nada.

**Límites conocidos de la marca:**
- Una venta sin conexión se sella con la hora en que se sincronizó: una bajada tardía puede no verse. El arreglo va en
  `registrar_venta` (bloque 7, que toca la caja).
- «La clienta pidió otra talla y se la trajeron del almacén» no se distingue de «bajarla al cobrar».
- Castiga la primera bajada de una prenda que se vende muy rápido con el piso vacío.
- La hora de cada movimiento es la del INICIO de su transacción, no la del final: una bajada que espera un candado y una
  venta en el mismo momento pueden quedar en orden distinto. La ventana de 10 minutos lo amortigua; ningún diseño lo
  evita.
- Una ENTRADA al piso dentro de la ventana que no es bajada (una devolución, la anulación de una venta, la prenda que
  vuelve en un cambio) puede marcar tardía una bajada correcta: la fórmula mira el piso de antes, no lo que llegó
  después (la prueba T18 fija ese comportamiento). Cambiar la fórmula es decisión del contrato del bloque 3.
- Una transferencia que llega de otra tienda directo al piso sí entra al cálculo, porque la cuenta el libro (T19).
- **Desde el bloque 2:** un retiro equivocado que se corrige volviendo a bajar la prenda deja una bajada con el piso de
  antes ya rebajado por el retiro. Si hay una venta en la ventana de 10 minutos, se le atribuye como tardía (a quien
  hizo la re-bajada), y la re-bajada infla Σ `cantidad` (el denominador del indicador de confianza del bloque 3).
  Ejemplo: piso 2; 10:00 se retiran 2 por error; 10:01 se corrigen con «Reponer» 2; 10:05 se vende 1 → `tardia`.
  Pendiente: una prueba en `scripts/pruebas/frescura_bajadas.mjs` que fije el caso, y en el contrato del bloque 3
  descontar de la bajada los retiros de la misma prenda en [t − ventana, t] (o tomar como piso de antes el nivel más
  alto de esa ventana). *Resuelto en el paso 2 de 3c, `20260928120200`, sin pegar, con la primera opción (cada retiro
  se descuenta de una sola bajada y el piso de antes suma lo retirado en [t − ventana, t)); el nivel más alto se
  descartó porque absorbe las ventas de los minutos previos: ver «Paso 2 construido (2026-09-27)» al final.*
- **Desde el bloque 2 (hallado en su revisión): un retiro DESPUÉS de una bajada no la corrige.** Si se escanearon 10
  y solo se colgaron 6, y a los 5 minutos se retiran 4 con «Retirar del piso», la bajada sigue con cantidad 10:
  `bajada_piso_items` guarda la cantidad original, ninguna función la corrige, y `fn_bajadas_del_piso` la lee entera
  (`20260926000300`). El denominador del indicador (Σ `cantidad`) cuenta 4 prendas que nunca se colgaron. La ventana
  del punto anterior mira ANTES de la bajada y no ve este retiro. Por eso el contrato del bloque 3 tiene que netear
  también los retiros de la misma prenda en [t, t + ventana]. Hasta entonces, «Retirar del piso» devuelve la prenda al
  almacén, pero no deshace la bajada. *Resuelto en el paso 2 de 3c (`cantidad_efectiva`, `20260928120200`, sin pegar).*

**Límite de la escritura: el orden de candados no es global todavía.** `bajar_al_piso` toma el stock en orden de prenda
(`fn_bloquear_en_orden`, ADR-0190), como ventas, `iniciar_traslado`, recepciones y `cerrar_conteo`. Pero
`confirmar_traslado`, `cerrar_traslado_con_diferencia` y `anular_venta` todavía escriben prenda por prenda sin
pre-bloquear: si una de ellas y una bajada tocan las mismas dos prendas en orden cruzado en el mismo segundo, Postgres
mata una (40P01). Nada queda a medias: la transacción se deshace entera, la marca queda libre y la pantalla dice «Otra
operación estaba moviendo las mismas prendas en ese momento. No se guardó nada: vuelve a confirmar.». Es un hueco
anterior de ADR-0190 (una venta también puede chocar así); el arreglo es que esas tres funciones pre-bloqueen, con su
migración y un caso de concurrencia: queda en el BACKLOG.

**`registrar_movimiento`: candado nuevo (`20260926000400`)**
- Si `p_tipo = 'ajuste'`, el motivo es `reposicion` (con o sin tilde) y la sububicación es de tipo `piso_venta`,
  rechaza con P0001, hint `reposicion_piso_cerrada` y este texto exacto: `«Reposición» no se usa en el piso: las
  prendas que suben del almacén se registran con «Bajar al piso» o con «Reponer», en Existencias, para que salgan del
  almacén (si ninguno te aparece, pídele al líder que active «Bajada al piso» en tu rol). Si al contar encontraste
  prendas de más, elige «Conteo físico».`
- Va después de los candados de permiso y de ubicación: a quien no puede ajustar le sigue saliendo el de permiso.
- Se inserta en la definición viva de la función (no se reescribe desde un archivo) y se puede pegar dos veces.
- **No nombra «Retirar del piso»:** se escribió antes del bloque 2 y ya está pegada en producción, así que su archivo
  no se edita. La nota de la pantalla (Ajustar stock ▸ Piso) sí lo nombra desde la revisión del bloque 2. Si algún día
  se vuelve a tocar este candado, se le suma la misma oración en una migración nueva.

**La pantalla** (`apps/web/lib/bajada-reglas.ts`, lógica pura y probada; `components/BajarAlPisoForm.tsx`)
- Entrada: el botón «Bajar al piso» de Existencias (`app/(app)/inventario/page.tsx`), con las tres condiciones de (b).
- `interpretarErrorDeBajada` trata como «red» (envío incierto) todo error que llega sin código de Postgres. En
  `token_reusado` devuelve `guardadas`, leídas del `details` de forma estricta: si una sola entrada no es válida o el
  arreglo viene vacío, devuelve `null`, porque descontar de menos haría bajar dos veces lo ya bajado.
- `resolverTokenReusado`, `loQueFalta` (antes `loQueNoViajo`) y `conTopeDeLaBase` viven en `lib/bajada-reglas.ts`.
- Textos:
  - Red: «Se cortó la conexión y no sabemos si la bajada se guardó. Tu lista sigue aquí: pulsa «Confirmar de nuevo». Si
    ya se había guardado, no se repite.»
  - Escaneo con la lista congelada: «Primero pulsa «{botón}»: no sabemos si la bajada anterior se guardó.»
  - Borrador ya enviado: «Enviaste esta bajada a las {HH:mm} y no llegó la respuesta. Pulsa «Comprobar»: si ya se
    guardó, no se repite.»
  - Token reusado con faltantes: el texto de la base + « Te quedan {m} prendas por confirmar.» («Te queda 1 prenda por
    confirmar.»). Sin faltantes: la tarjeta de éxito con «Esta bajada ya estaba registrada a las {HH:mm}. No se
    repitió.».
  - Prenda sin almacén: «{prenda}: el sistema no tiene unidades en el almacén de {sede} (cuenta {N} en el piso). Si la
    tienes en la mano, revisa que el fardo esté recibido en Recibir mercadería o avisa al líder.» (sin el paréntesis si
    el piso está en 0).
- Borrador `{ v: 2, token, lineas, creadoEn, enviadoEn? }`; un borrador `v: 1` se lee como no enviado.

### (d) Lo que hereda el bloque 3

**El indicador de confianza del registro** (no se construye ahora)
- **Confianza del registro por sede** = 1 − Σ `unidades_tardias` ÷ Σ `cantidad`, sobre las filas **cerradas y no
  dudosas** de los últimos 30 días.
- El denominador son las unidades **bajadas**, no las vendidas: una bajada hecha a tiempo tarda semanas en venderse y,
  si se dividiera por lo vendido, quedaría fuera justo lo que se hizo bien.
- Mínimo de muestra propuesto: 20 bajadas cerradas en 30 días. Si no llega, dice «sin datos». Lo decide Felipe.
- Lo ve solo el líder, por sede. `fn_bajadas_del_piso` ya devuelve `persona_id`, pero ninguna pantalla lo muestra a
  las colaboradoras.

**Regla: el bloque 3 se construye encima del dominio de Inventario, no al lado**

Desde el 2026-09-24 main tiene un dominio de «comportamiento comercial piso vs almacén» (ADR-0199 de main, con los
ADR-0200 a 0203 encima):
- el libro de piso y almacén sale de una sola función, `retail.fn_ledger_puntos` (ADR-0202), con la venta decidida
  por `fn_es_venta_de_stock` y el traslado interno por `fn_es_traslado_interno` (ADR-0203);
- la exposición en el piso se mide por cohortes FIFO en `apps/web/lib/inventario-exposicion.ts` (`armarCohortes`), y
  ese reloj se PAUSA cuando la prenda vuelve al almacén y sigue cuando regresa: nunca se reinicia (ADR-0200).

Eso es, casi palabra por palabra, el «reloj de piso por unidad con emparejamiento FIFO» de este ADR. Por eso:
1. Los relojes y los percentiles del bloque 3 leen los puntos de `fn_ledger_puntos` (una llamada con el arreglo de
   prendas, nunca una por prenda) y la venta de `fn_es_venta_de_stock`. No reconstruyen el piso ni deciden qué es
   venta.
2. El reloj de piso por unidad reutiliza las cohortes de `inventario-exposicion.ts`, o las lleva a SQL como la ÚNICA
   implementación, que Análisis pasa a leer también. No se escribe un segundo FIFO.
3. Si Frescura necesita una regla distinta (por ejemplo, la exclusión de `prendas_por_regularizar`, que hoy vale solo
   en `fn_bajadas_del_piso`), se discute como un cambio del dominio, con su ADR, y no como una copia con un ajuste.

- **DECIDÍ:** esta regla, antes de empezar el bloque 3.
- **DESCARTÉ:** una lectura propia (`fn_frescura_piso`, el nombre provisional del anexo técnico) que reconstruya el
  libro y empareje FIFO por su cuenta: sería un tercer cálculo del mismo libro. La primera versión de
  `fn_bajadas_del_piso` ya mostró cómo divergen: con una transferencia de Lima que llega después de la bajada, una daba
  piso 4 y la otra 2.
- **SE ROMPE SI:** la curva de Kaplan-Meier armada con las cohortes de la web no cabe en el tiempo de una pantalla
  (estimación sin medir: cientos a pocos miles de unidades por categoría y sede, así que debería caber); entonces las
  cohortes bajan a SQL, pero como la única implementación. O main cambia la regla de madurez de sus cohortes (los 7
  días del sell-through de exposición) pensando solo en Análisis: Frescura debe depender del reloj, no de esa regla.

### (e) La consulta para mirarlo hoy, sin pantalla

La función pregunta si quien consulta es líder, y en el SQL Editor no hay sesión de nadie. Por eso se pegan las dos
líneas juntas, en UNA sola ejecución, con el `auth_user_id` de un líder (sale de `public.personas`). No escribe nada:

```sql
select set_config('request.jwt.claim.sub', '<auth_user_id de un líder>', true);
select * from retail.fn_bajadas_del_piso('<id de la tienda>', now() - interval '1 day');
```

Verificado en local el 2026-09-25, sobre un Postgres desechable con las cinco migraciones:
- Las dos líneas en una ejecución responden (una fila en Tienda Trujillo con los datos de prueba).
- La segunda línea sola, o las dos en ejecuciones separadas, responden «Solo el líder puede ver cómo se registran las
  bajadas al piso.» (hint `bajadas_solo_lider`).
- Se usa `request.jwt.claim.sub` y no `request.jwt.claims`: la primera forma la leen tanto el `auth.uid()` de la base
  local como el de Supabase, y la segunda solo el de Supabase (con la segunda, la base local respondió «Solo el
  líder…»).
- En el SQL Editor de producción no se probó.

### (f) Cómo se pega en producción

**Actualización 2026-09-26: está todo en producción.** Una consulta por efectos (solo lectura; una fila por migración)
dio «sí» a la `0000`, `0100`, `0200`, `0300` y `0400`; Felipe pegó después la `20260926170000` y se leyó el texto nuevo
de Existencias en la base. Roles: «Integrante» ve Productos, Vender, Existencias y Bajada al piso; las 3 «Terminal
Almacén» ven Existencias y Productos, sin «Bajada al piso» (si la pistola va en esa terminal, falta marcarlo en su rol,
sin SQL). Lo de abajo queda como registro de cómo se llegó.

**Estado al 2026-09-25 (lo dijo Felipe; corregido en la revisión del bloque 2).** El orden de abajo ya no se cumplió:
la web de los bloques 1 y 2 salió con la fusión del #434 y del #440 (Vercel publica cada push a `main`), antes de
confirmar la `0000`. Hoy: `0200` y `0400` **pegadas** (`fn_verificar_bajadas()` = 0 filas); `0100` no confirmada por
separado, pero sus tablas existen si esa función respondió; `0000` y `0300` **sin confirmar**. Lo que queda:
1. Confirmar la `0000` y la `0300` con consultas de solo lectura en el SQL Editor: `select count(*) from retail.modulos
   where clave = 'bajada_piso';` (1) y `select to_regprocedure('retail.fn_bajadas_del_piso(uuid, timestamptz,
   timestamptz, integer)') is not null;` (`true`). La que falte se pega **cuanto antes**: mientras falte la `0000`,
   Roles y accesos muestra «Bajada al piso» y encenderlo falla, y el mensaje de la `0400` le dice a la colaboradora que
   pida al líder ese mismo módulo. Las dos se pueden repegar.
2. Pegar `20260926170000_existencias_incluye_retirar_del_piso.sql` **después de la `0000`**: el upsert de la `0000`
   escribe el texto viejo de Existencias; si la `0000` se pega (o se repega) después, hay que repegar la `170000`.
3. Encender «Bajada al piso» en los roles (ver abajo) y refrescar el diccionario (paso 7).

El orden original, que sigue valiendo como referencia de qué hace cada archivo: cinco archivos, una ejecución por
archivo, con la web publicada entre el cuarto y el quinto. Ya traen `retail.` y se pueden repegar (en local, cada uno
se aplicó dos veces seguidas sin error). Sus cabeceras dicen «PARTE n de 5» y repiten este mismo orden.
1. `20260926000000_bajada_piso_modulo.sql`: solo el módulo «Bajada al piso» y el texto corregido de Existencias
   («Consultar stock, reponer el piso, ajustar stock, apartar prendas»; la `20260926170000` de la revisión del bloque 2
   lo cambia por «Consultar stock, reponer y retirar del piso, ajustar stock, apartar prendas»). **Antes de publicar
   la web:** si la web sale primero, Roles y accesos pinta un módulo que la base no conoce y encenderlo falla.
2. `20260926000100_bajada_piso_tablas.sql`: las dos tablas y sus cuatro disparadores (no editar, no borrar, no vaciar),
   con `lock_timeout = '3s'`. **Fuera de hora pico:** las llaves hacia `movimientos`, `variantes`, `ubicaciones` y
   `public.personas` toman un candado breve sobre tablas en uso; si no lo consigue en 3 s, falla sin daño y se repega.
   Sin políticas ni `drop trigger`: los disparadores van con `create or replace trigger` (CLAUDE.md y ADR-0195:
   `drop trigger` y `create policy` toman las 21 tablas de `auth` y `storage`). `pruebas:bajada-al-piso` lee las cinco
   partes y se pone roja si alguna vuelve a traer un `drop trigger` o una política.
3. `20260926000200_bajada_piso_funciones.sql`: primero unas guardas que abortan con un mensaje claro si falta algo (por
   ejemplo, si `mover_interno` no firma con el responsable: «pega antes 20260923100000»); luego `fn_prenda_corta`,
   `bajar_al_piso` y `fn_verificar_bajadas`. Solo crea funciones: no toma candados de tablas.
4. `20260926000300_frescura_lectura_bajadas.sql`: `fn_bajadas_del_piso`. Necesita `20260924030000_ledger_fuente_unica`
   (ADR-0202); si faltara, se detiene antes de crear nada. **Verificado el 2026-09-25** con una consulta de solo lectura
   de Felipe: todas las dependencias de las cinco partes existen en producción (`fn_ledger_puntos`,
   `fn_es_traslado_interno`, `fn_es_venta_de_stock`, `fn_historial_sin_truncate`, `fn_bloquear_en_orden` con 4
   parámetros, `fn_ids_de_items`, `fn_ve_modulo`, `fn_actor_persona_id`, `mover_interno`). Para volver a confirmarlo, en el SQL Editor de producción (solo lectura): `select to_regprocedure('retail.fn_ledger_puntos(uuid,
   timestamptz, uuid[])') is not null, to_regprocedure('retail.fn_es_traslado_interno(text, uuid, uuid)') is not null;`
   (dos `true`). `pnpm datos:generar:produccion` no sirve para esto: arma el diccionario desde el volcado guardado, no
   pregunta a producción. Va aparte porque el bloque 3 le cambiará las entrañas sin tocar el camino que
   guarda stock.
5. **Publicar la web.** *Ya ocurrió: salió con la fusión del #434 (y la del bloque 2, con el #440).*
6. `20260926000400_reposicion_no_toca_el_piso.sql`: el candado de «Reposición» en el piso. *Ya pegada (Felipe,
   2026-09-25).* **Después de la web:** su mensaje manda al botón «Bajar al piso» de Existencias, y pegada antes
   cierra la puerta y manda a un botón que todavía no está. Solo reemplaza `registrar_movimiento` insertando el bloque
   en su definición viva: no toma candados de tablas.
7. Después: comprobar en el SQL Editor que quedó, con `select to_regprocedure('retail.bajar_al_piso(uuid, jsonb,
   uuid)') is not null;`, y refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) antes de
   `pnpm datos:generar:produccion` (nunca `pnpm datos:generar` a secas). `datos:comparar` NO ve esta llamada: la pantalla
   la hace con la constante `RPC_BAJADA` y el comparador solo reconoce el nombre escrito entre comillas. El nombre y
   los parámetros los cruza `bajada-reglas.test.ts` contra la migración (no contra producción).
8. *(Revisión del bloque 2)* `20260926170000_existencias_incluye_retirar_del_piso.sql`, **después de la `0000`**: un
   solo `update` del texto `incluye` de Existencias. Sin políticas ni `alter`: no aplica el bloqueo mutuo de ADR-0195.
   Se puede repegar. Comprobar: `select incluye from retail.modulos where clave = 'existencias';` dice «Consultar
   stock, reponer y retirar del piso, ajustar stock, apartar prendas». Entra al diccionario recién cuando esté pegada
   (mismo refresco del paso 7).

El día 1 el módulo solo lo ve el líder. **Felipe decide en qué roles encender «Bajada al piso»** (Colaboradores ▸
Roles y accesos), en los de quien cuelga prendas; nunca desde el código (ADR-0161). En producción (2026-09-25) el rol
«Integrante» (17 personas) no ve Existencias, así que no llega al botón; las 3 «Terminal Almacén» y las 3 «Terminal de
ventas» sí. Lo recomendado es encenderlo en «Terminal Almacén» (se baja desde la terminal, eligiendo la Responsable) y
no en la de ventas hasta decidir la D-40. Hasta entonces las bajadas siguen
entrando por «Reponer» y, con la `0400` pegada, ya no por el ajuste en el piso. Quien reciba «Bajada al piso» sin
Existencias no verá el botón (ver (b), «Entrada»).

**Verificación en local** (Postgres 17 desechable: una copia de main con el seed más las cinco migraciones; los
guiones se corren con `PATH=<pg>/bin:$PATH CAYLA_PGDATABASE=<base> LC_ALL=en_US.UTF-8 node scripts/pruebas/<x>.mjs`):
- Migraciones: las cinco, aplicadas dos veces seguidas: exit 0 en todas. La `0400` pegada dos veces deja su bloque
  una sola vez dentro de `registrar_movimiento`, y `reposicion_piso_cerrada.mjs` sigue en 10/10.
- `bajada_al_piso.mjs` (`pnpm pruebas:bajada-al-piso`): **51/51**, con ROLLBACK. Cubre permisos (incluidos «rol con
  solo bajada_piso baja y no puede ajustar» y «rol con solo Existencias no baja por aquí, pero Reponer le sigue
  funcionando»), firma, todo o nada, idempotencia (con tres casos del `detail` de `bajada_token_reusado`), forma de la
  lista, los plurales de `bajada_sin_alcance`, los cuatro disparadores (UPDATE, DELETE y TRUNCATE rechazados), que
  ninguna de las cinco partes quite un disparador ni cree o quite una política, y que la validación previa coincida
  con la del motor, y el reintento con la misma marca y la responsable fuera de turno («ya estaba registrada»; una
  marca nueva con ella fuera de turno sigue rechazada).
- `BASE_DESECHABLE=1 … bajada_al_piso_concurrencia.mjs`: **5/5 en dos corridas**. Mismo token a la vez, dos bajadas
  por la última unidad, listas en orden inverso sin bloqueo mutuo, respuesta perdida (con el `detail` y «con 1
  prenda»). Usa COMMIT: no va al CI.
- `frescura_bajadas.mjs` (`pnpm pruebas:frescura-bajadas`): **64/64** (T0 a T21). T0 revisa el código de la función:
  llama a `fn_ledger_puntos(` una sola vez y no lee `stock` por su cuenta. Contra la versión anterior de la función, la
  misma prueba da 59/63: los casos nuevos detectan el cambio.
- `reposicion_piso_cerrada.mjs` (`pnpm pruebas:reposicion-piso-cerrada`, paso propio en CI): **10/10** con la `0400`;
  en la misma base sin la `0400`, **6/10** (la prueba se da cuenta de que falta).
- Mutaciones, cada una restaurada después: el responsable pedido antes de la marca (el orden viejo), 49/51; sin el
  `detail` del token reusado, 46/49 (con la versión de 49 casos); sin los disparadores de TRUNCATE,
  47/49; `<` en vez de `<=` en el borde de la ventana, 63/64 (solo T3a); sin excluir `prendas_por_regularizar`, 62/63
  (T8); con la hora del movimiento en vez de la de la venta, 63/64 (T21). Quitar `fn_es_traslado_interno` no tumba
  nada (63/63): las llaves compuestas de sububicaciones ya obligan a que sea la misma tienda.
- Pruebas vecinas sobre la base con el bloque: `fn_aplicar_movimiento` 11/11, `apartar_stock` 46/46,
  `concurrencia_orden_y_doble_clic` 15/15 y `fn_ledger_fuente_unica` 48/48 (igual que sin el bloque).
  En este Postgres desechable (Homebrew, no `supabase start`), `roles_por_modulo` da 67/70 y
  `actor_firma_las_operaciones` 28/30, con y sin el bloque: son rojos del entorno. En el CI de main las dos están en
  verde (70/70), y desde #423 ese job es obligatorio: el veredicto sobre ellas es el CI del PR, y un rojo ahí se trata
  como del bloque hasta demostrar lo contrario.
- `node scripts/migraciones/versiones.mjs`: 300 archivos, ninguna versión repetida.
- Web (`apps/web`): `pnpm exec tsc --noEmit` sin salida; `vitest run` completo, **145 archivos y 77.097 pruebas**;
  `lib/bajada-reglas.test.ts`, 89 (incluye la regla de cuándo un reenvío sale de la duda, que lee el orden de la
  migración, e la prueba que cruza el texto y el `detail` de `bajada_token_reusado` con la
  migración); eslint sin errores en los 11 archivos tocados; `git diff origin/main -- apps/web/lib/menu.ts
  apps/web/lib/menu-hoy.golden.json` vacío (el lateral no cambia) y `lib/modulos.test.ts` idéntico a main (33/33).
- Las reglas de la pantalla contra la base real (`bajar_al_piso` llamada como líder en una copia desechable y sus
  respuestas pasadas por `lib/bajada-reglas.ts`): misma lista → «ya estaba registrada»; con más prendas → quedan solo
  las 3 que faltaban y «Te quedan 3 prendas por confirmar.»; con menos → «ya estaba»; con una → «Te queda 1 prenda por
  confirmar.». Stock final sin duplicar.
- Tiempo de `fn_bajadas_del_piso` con carga sintética (una tienda, 2.000 prendas, 20.001 bajadas y 10.001 ventas):
  - 120 días: 559,6 a 573,7 ms (`explain analyze`: 541,6 ms). 30 días, el valor por defecto: 156 a 159 ms. Caso
    concentrado (200 prendas × 100 bajadas × 50 ventas): 400 a 428 ms.
  - Bajo el umbral de 1 s por tienda, pero entre 2,2 y 4,6 veces más lenta que la versión que reconstruía el piso por su
    cuenta (124 a 133 ms a 120 días, 34 ms a 30 días), con las mismas filas: 0 distintas sobre 20.001.
  - La causa está en `fn_ledger_puntos`: compara cada fila contra el arreglo entero de prendas (`= any` en un plan
    genérico). Con un semi-join por hash baja a unos 330 ms sin cambiar un resultado. Es un cambio del libro, con su
    propia migración: queda en el BACKLOG.
- La consulta del punto (e): verificada en local (ver (e)).
- **Prueba en navegador** (2026-09-25; servidor de desarrollo con una ruta temporal ya borrada, sin base: las
  respuestas de `bajar_al_piso` simuladas interceptando `fetch`, con los mismos cuerpos que da PostgREST):
  - La cabecera de Existencias con «Bajar al piso» y «+ Nuevo traslado». Se encontró y se corrigió que el secundario,
    transparente sobre la foto, casi no se leía: ahora lleva fondo de papel.
  - Escaneo por SKU y por código de barras, con mayúsculas o no: cada lectura suma 1, la última prenda tocada sube, el
    campo se limpia siempre, y los cuatro avisos (código desconocido, sin almacén, todo apartado, tope) con su texto.
  - Corte de red real (la base de mentira no responde): banner, lista congelada (campo, −, + y Quitar apagados), botón
    «Confirmar de nuevo», nota «Hasta comprobar…», borrador v2 con la hora del envío; escanear congelada muestra
    «Primero pulsa…» y no suma. Al recargar: «Enviaste esta bajada a las 17:05…», solo «Comprobar» (sin «Empezar de
    nuevo»).
  - «Comprobar» con el módulo apagado: sigue congelada, el borrador conserva la hora y sale el texto de la duda. Con
    «ya estaba registrada»: mismo token en las dos llamadas, tarjeta «Se bajaron 5 prendas… ya estaba registrada a las
    17:05. No se repitió.», lista y borrador vacíos.
  - Prendas que no alcanzan: la línea en rojo con «hay 1», el «+» topado y la lista intacta. Marca reusada con lo
    guardado en el `detail`: queda solo la prenda que faltaba, «Te queda 1 prenda por confirmar.», y la siguiente
    confirmación va con token nuevo y solo esa prenda.
  - A 375 px: sin desplazamiento horizontal, el pie pegado al borde de abajo (0 px) y botones de 44 px. En la consola,
    solo los dos rechazos de conexión provocados a propósito.
  - Hallazgo de la herramienta, no de la pantalla: su «escribir» no dispara una tecla por carácter; una pistola real sí
    (se comprobó con teclas sueltas).
- **Lo que no se probó:** la llamada real desde el navegador a través de Supabase, y el SQL Editor de producción.

**Cómo lo verifica Felipe con la pistola real, ya pegado:**
1. Como líder, Existencias en una tienda que separa piso y almacén ▸ «Bajar al piso». Escanea **5 prendas DISTINTAS**
   (cada una de otra talla o de otro color) y confirma. En Movimientos salen **5 filas** «Bajada al piso» con la misma
   hora (hasta el bloque 2 esta receta decía «Reposición interna»: ese nombre ya no existe); en Existencias, el piso de
   cada una subió y el almacén bajó lo mismo. Cinco unidades de la misma talla y color dan UNA fila, con cantidad 5.
2. Que no se repite: arma otra bajada, pulsa «Confirmar» y, justo después, pon la red en «Sin conexión» (herramientas
   del navegador ▸ Red). Vuelve a conectar y pulsa «Confirmar de nuevo». Si la base alcanzó a guardar, dice «Esta
   bajada ya estaba registrada a las HH:mm. No se repitió.»; si el corte llegó antes, guarda normal. En los dos casos,
   Movimientos la muestra UNA sola vez. Pulsar «Confirmar» dos veces rápido no prueba esto: el segundo clic lo frena la
   pantalla antes de llegar a la base.
3. Ajustar stock en esa tienda: con «Piso de venta», el Motivo ya no ofrece «Reposición» y se ve la nota; con «Almacén
   de tienda», vuelve.
4. La consulta del punto (e), con el `auth_user_id` de un líder.

### (g) Lo que quedó para después

- **1b:** una guía de solo lectura por recepción (llegaron / ya bajadas / faltan) y «Bajadas de hoy».
- **Deshacer:** no hay. Desde el bloque 2, lo que se escaneó de más vuelve al almacén con «Retirar del piso», pero eso
  no corrige la bajada: sigue contando con su cantidad original (ver «Límites conocidos de la marca»). La lista en
  pantalla es la revisión previa.
- `mover_interno` («Reponer» y, desde el bloque 2, «Retirar del piso») sigue sin token ni candado de módulo (D-26): un
  envío repetido mueve dos veces, y la lectura de tardías cuenta esas filas. Es el «candado de `mover_interno`», con
  su lugar entre el bloque 2 y el 3 (ver «Orden de construcción»).
- Un hook de escaneo compartido: Vender, Recibir y Bajar tienen copia del mismo efecto (refactor aparte). Bajar tiene
  además el búfer de la pistola.
- Una entrada para quien tenga «Bajada al piso» sin Existencias (el Inicio de las terminales, filtrado por módulo, o una
  hoja propia regrupando Inventario): solo si Felipe llega a dar el módulo así.
- Que `confirmar_traslado`, `cerrar_traslado_con_diferencia` y `anular_venta` pre-bloqueen con `fn_bloquear_en_orden`
  (ver «Límite de la escritura»), con un caso C6 de concurrencia.
- Enseñarle a `scripts/datos/comparar.mjs` a resolver las constantes `RPC_*`, para que vea `bajar_al_piso`.
- `fn_ledger_puntos` más rápido: el semi-join por hash (de unos 560 a unos 330 ms a 120 días), con una migración nueva y
  una nota en ADR-0202, porque `20260924030000` ya está en producción. *Hecho el 2026-09-27: `20260928120010` (ADR-0202, «Actualización 2026-09-27»); falta pegarla.*
- **Preguntas abiertas para Felipe:**
  - ¿Se enciende en la Terminal de ventas? Resuelve el «Stock insuficiente» de la cajera, pero facilita justo la
    bajada al cobrar. Por defecto: Terminal Almacén y quien cuelga; la de ventas, después de decidir la D-40.
  - **D-40 contra la caja, antes del bloque 3:** o manda V2 (la caja dice «hay N en el almacén: tráela al piso» y la
    D-40 se retira por escrito), o manda la D-40 (la caja baja sola, toda bajada nace tardía y la marca se redefine).
    Sin eso, el indicador mide el diseño de la caja y no a las colaboradoras.
  - «Reponer» solo aparece en las filas con 7 o menos en el piso (`UMBRAL_REPOSICION_PISO`). *Desde ADR-0231 (2026-09-26):
    con 4 o menos libres en el piso y algo en el almacén; la pregunta de abajo sigue igual con ese número.* Quien tiene Existencias sin
    «Bajada al piso» no tiene camino con rastro para subir una prenda que ya tiene 8 o más en el piso: ¿«Reponer» se
    ofrece en toda fila con almacén disponible, o basta con encender «Bajada al piso»?
  - «Reposición» en el ALMACÉN queda abierta por ahora (Felipe, 2026-09-25): decidir más adelante si se cierra. Se usa:
    el 2026-09-25 se cargaron así 60 unidades en el almacén (20 ajustes, 1 persona), sin recepción ni fecha de llegada.
  - ¿La exclusión de `prendas_por_regularizar` debe valer también en Análisis (`fn_es_venta_de_stock`)? Hoy Análisis
    cuenta como venta la salida de `regularizar_prenda`, a la hora de la regularización; Frescura la excluye.
  - ¿20 bajadas cerradas y 10 minutos para el indicador? ¿Solo líder y por sede, o también por persona?
  - ¿Hay una pistola en el almacén donde se abre el fardo, y toda prenda del piso lleva una etiqueta legible? Si no,
    escanear es más lento que «Reponer» y la pantalla no se usará.

### (h) Una discrepancia que se documenta y no se toca

`CONTRIBUTING.md` (§1) y ADR-0010 dicen que las migraciones del repo van SIN el prefijo `retail.` y que el prefijo se
agrega solo al pegar en producción (`CLAUDE.md` decía lo mismo hasta que main lo corrigió el 2026-09-25, 6c050f87). La realidad es la contraria: las 272 migraciones con fecha y hora que
hay al 2026-09-25, contando las cinco de este bloque (`ls supabase/migrations | grep -E '^[0-9]{14}_.*\.sql$' | wc -l`),
contienen `retail.`, y `apps/web/lib/modulos.test.ts` exige `insert into retail.modulos`. Las cinco migraciones nuevas
siguen la realidad. `CONTRIBUTING.md` y ADR-0010 **no se editan** sin la decisión de Felipe.

## Actualización 2026-09-25 — bloque 2: «Retirar del piso»

Felipe eligió rescatar solo el retiro del plan paralelo «del termómetro» (tarea 3), sin sus motivos nuevos de ajuste
(`carga_existente` y un valor propio para «Encontré de más»): cargaban prendas al piso sin pasar por el candado de
«Reposición» de este ADR (`20260926000400`), así que se descartaron.

- **Qué hace:** en Existencias, cada talla con piso DISPONIBLE mayor que 0 (en una tienda que separa piso y almacén)
  tiene «Retirar del piso» en el menú «⋯» de su fila, con Responsable. Es `retail.mover_interno` con origen piso y destino
  almacén; el mismo modal que «Reponer» (`ReponerPisoModal`, ahora con `sentido: 'bajar' | 'retirar'`). El bloque 2
  no trajo migración; su revisión sumó una chica, solo de texto (`20260926170000`).
- **Lo apartado no se retira:** el tope es el piso disponible y la base lo impide igual.
- **Nombres:** el modal de la fila sigue llamándose «Reponer piso» (como su botón «Reponer»); «Bajar al piso» es el
  botón de la pantalla de escaneo de este ADR. En Movimientos, las dos formas de subir quedan como «Bajada al piso»
  (y el retiro, «Retiro del piso»), y el aviso de éxito de «Reponer» dice «unidades bajadas al piso» para que la
  palabra lleve a su fila. Cómo se decide cada nombre: «Movimientos nombra la bajada y el retiro por su par».
- **El semáforo contradice al retiro (hallado en la revisión, decisión de Felipe en el bloque 3):** «Reponer»
  (`necesitaReponerPiso`) y «Por colgar» (`porColgar`) solo miran cifras. Después de retirar, la talla vuelve a pedir
  que la bajen, y el turno siguiente deshace la decisión de la encargada. Mientras no exista una marca de «retirada
  de la venta» por talla y sede que apague esa alarma, el modal avisa ANTES de confirmar (`avisoTrasRetiro`) y
  ofrece una **nota opcional** del motivo, que viaja como `p_nota` a `mover_interno`. **Ninguna de las dos cosas
  protege la decisión:** el aviso solo informa a quien retira, y la nota solo se lee en el detalle de un movimiento
  (Movimientos, o el historial del producto), nunca en la fila de Existencias donde el turno siguiente vuelve a bajar
  la prenda. Esa marca, junto con un motivo cerrado del retiro (fin de temporada, cambio de exhibición…), es lo que
  Frescura necesita para distinguir un retiro que pausa el reloj de uno que saca la prenda de la venta.
- **Riesgo que sigue abierto:** `mover_interno` no tiene token (ver (g)): un envío repetido de «Retirar» retira dos
  veces. La pantalla frena el doble clic y, desde la revisión, no deja cerrar mientras guarda y no dice «no se guardó
  nada» tras un corte de red; el candado en la base es trabajo pendiente, igual que para «Reponer».
- **Límite nuevo de la marca de tardías:** retiro equivocado → re-bajada → venta en la ventana (ver «Límites conocidos
  de la marca»).

## Actualización 2026-09-25 — revisión del bloque 2

Una revisión adversarial del #440 (tres lentes: integridad con el bloque 1 y la base; pantalla y colaboradora;
documentos) encontró hallazgos menores, ninguno bloqueante. Felipe pidió un PR de corrección. Tres decisiones quedaron
fijas antes de empezar: no se toca la base de `mover_interno` (su token va aparte), no se toca la lógica de Análisis
(va al bloque 3) y no se edita la `0400`, que ya está pegada.

**Qué se corrigió**
- **Corte de red, con respuesta honesta.** Si la conexión se cae, el modal ya no dice «No se guardó nada — vuelve a
  intentar»: dice «Se cortó la conexión mientras se intentaba retirar del piso (o reponer el piso): no podemos
  confirmar si llegó a guardarse. Antes de volver a intentarlo, revisa si ya aparece registrado.»
  (`mensajeErrorMovimientoPiso` en `lib/inventario-reglas.ts`, con `confirmarAntesDeRepetir`). Si la base SÍ respondió
  con un error, refresca las cifras; con la red caída no refresca, porque un refresh sin red se vuelve navegación
  completa y borraba el mensaje. Mientras guarda no se puede cerrar: «Cancelar» apagado, y Escape, el velo y la ✕ sin
  efecto (opción nueva `bloqueado` de `<Modal>`, falsa por defecto: ningún otro modal cambia). Ese bloqueo tiene tope:
  a los 20 s sin respuesta la llamada se corta (`abortSignal`), se trata como corte de red y el modal se puede cerrar.
- **«Reponer» y «Retirar del piso» salen solo en la sede activa.** Firman con el Responsable de la sede activa: si el
  líder miraba otra sede (`?ubicacion=`), el movimiento quedaba allá firmado por alguien de turno acá. Es la misma
  condición que ya tenía «Bajar al piso». La misma regla se extendió después (a pedido de Felipe, 2026-09-26) a todo
  lo que escribe desde Existencias: «Apartar» y «Ajustar» en la fila, y «Liberar» (apartados) y resolver o liquidar
  dañados en sus modales. Mirando otra sede, esas acciones no se ofrecen y una nota dice que se cambie la sede activa
  en la cabecera. (Productos ya ajustaba siempre en la sede activa.)
- **El aviso del retiro no promete de más.** Dice «libre» o «libres» (la cifra es neta de lo apartado, y la tabla
  muestra el piso físico) y termina en «Si la guardas a propósito, avisa a tu equipo: en Existencias la nota no se ve,
  solo al abrir el movimiento.», en vez de «dilo en la nota».
- **El modal no salta y dice qué es retirar.** El recorrido («Piso de venta → Almacén de tienda») pasó a la bajada
  del título; el aviso tiene su propio bloque con el alto reservado (ADR-0185), que sin aviso aclara «Pasan al almacén
  de la tienda: siguen siendo stock de la tienda (no es una baja), pero la caja no las cobra hasta que vuelvan al
  piso.» (una primera versión decía «siguen disponibles para vender», y era falso: la venta descuenta del piso). Salen
  los textos propios de «no alcanza» (`noValidate`), un error viejo se borra al cambiar la cantidad, y al cerrar el
  foco vuelve al «⋯» de la fila, que no depende del semáforo (tras reponer, el refresh suele quitar el botón
  «Reponer»); el «⋯» se anuncia con talla y color.
- **Movimientos nombra por el par exacto** (reescrita la decisión: «Movimientos nombra la bajada y el retiro por su
  par»). El filtro pasó a llamarse «Movimiento interno».
- **Ajustar stock ▸ Piso nombra «Retirar del piso»** en su nota. El mensaje de la `0400` en la base no (ver
  «`registrar_movimiento`: candado nuevo»).
- **Roles y accesos dice qué da Existencias:** «Consultar stock, reponer y retirar del piso, ajustar stock, apartar
  prendas». La pantalla lo lee de `lib/modulos.ts`, y la `20260926170000` deja la base con el mismo texto (ninguna
  prueba compara los dos: `lib/modulos.test.ts` no lee `incluye`, y `bajada_al_piso.mjs` P1 fija el de la base). Por ADR-0161, quien ve un módulo hace todo lo que hay en él, y las
  terminales de ventas ven Existencias: el líder tiene que poder leerlo.
- **Probado en el navegador** (sin base, respuestas simuladas; escritorio y 375 px): el formulario no cambia de alto
  al escribir, «no alcanza» sale con su texto propio, un corte de red da el mensaje honesto sin recargar la página, una
  respuesta que nunca llega bloquea el cierre hasta el tope de 20 s y después se puede cerrar, y el foco vuelve a quien
  abrió el modal.
- **Documentos:** estados falsos corregidos (el bloque 2 ya estaba fusionado; la web ya estaba publicada), las recetas
  dicen «Bajada al piso», el bloque 2 tiene su receta, y se borró la copia duplicada del documento del equipo que el
  #440 había sumado en `docs/diseno/` (la vigente es `docs/maquetas/frescura-del-piso-2026-09/`).

**El texto de la migración nueva**
- **DECIDÍ:** un `update` del texto `incluye` de 'existencias', y nada más.
- **DESCARTÉ:** un upsert como el de la `0000`: pisaría el orden, `solo_lider` y `delegable` si alguien los cambió
  después y vuelve a pegarla. No nombrarlo: el retiro entró al módulo sin que el texto lo dijera. Y cambiar solo la web
  (`lib/modulos.ts`): la pantalla quedaba bien, pero la base y el diccionario seguían sin nombrar el retiro.
- **SE ROMPE SI:** alguien pega (o repega) la `0000` después de esta: su upsert repone «reponer el piso» en la base
  (Roles y accesos no cambia, porque lee `lib/modulos.ts`; se desalinean la base y el diccionario). Se arregla
  repegando la `150000`.

**Lo que hereda el bloque 3** (ninguno se resolvió aquí)
- **La marca de «retirada de la venta» apaga más que el semáforo de Existencias.** Análisis también lee mal un retiro:
  si la tanda llevaba menos de 7 días en el piso, la lectura «reposición reciente» (`reposicion_reciente`,
  `lib/resumen-lectura.ts`) dice que las unidades «entraron al piso hace poco» y la ficha las cuenta como «nuevas
  pendientes», aunque están pausadas en el almacén; si se retira la talla entera, la regla `problema_reposicion` lo
  lee como falta de reposición («cada quiebre es venta que no se hizo»). Y la consulta 05 del termómetro cuenta lo
  retirado a propósito como «por colgar», con los días desde que llegó al almacén. La marca del bloque 3 tiene que
  apagar las tres lecturas, no solo `necesitaReponerPiso` y `porColgar`. Antes del #440 ninguna pantalla devolvía
  prendas del piso al almacén: estos casos recién empiezan a tener datos reales.
- **Un retiro correctivo DESPUÉS de una bajada no la netea** en `fn_bajadas_del_piso`. El contrato del bloque 3 tiene
  que mirar también [t, t + ventana], no solo [t − ventana, t] (ver «Límites conocidos de la marca»). *Resuelto en el
  paso 2 de 3c, sin pegar.*

**El candado de `mover_interno`** (pendiente, entre el bloque 2 y el 3)
- Qué es: un token contra el doble envío en `mover_interno`, como el de `bajar_al_piso`, para que un reintento
  devuelva «ya estaba registrado» en vez de mover otra vez. Hoy la pantalla frena el doble clic y el cierre durante el
  guardado, y tras un corte de red pide revisar antes de repetir; nada impide que alguien repita igual.
- Por qué va antes del bloque 3: el indicador de confianza (Σ `cantidad`) y los relojes de piso leen esas filas, y un
  envío doble las infla.
- Por qué va aparte: toca una función en producción que usan «Reponer», «Retirar del piso» y `bajar_al_piso`. Si el
  token entra como parámetro, cambia su firma: la `0200` la busca con 6 argumentos, y `pruebas:una-sola-firma` no deja
  dos versiones. Cómo se agrega (parámetro nuevo o función aparte) se decide en ese paso, con su migración, su ensayo y
  un caso de concurrencia.

**Cómo lo verifica Felipe (bloque 2 y su revisión, con la web de la revisión ya publicada)**
1. Como líder, en Existencias de una tienda que separa piso y almacén, con la sede activa en la cabecera: «⋯» de una
   talla con piso libre ▸ «Retirar del piso». Bajo el título se lee «Piso de venta → Almacén de tienda». Retira **2**
   con una nota (por ejemplo, «cambio de exhibición») y confirma. En Existencias, el piso de esa talla bajó 2 y el
   almacén subió 2. En Movimientos sale una fila «Retiro del piso»; al abrirla, el detalle dice «unidades movidas» y
   muestra la nota.
2. Mirando otra sede (desde un enlace con `?ubicacion=`), ni «Reponer» ni «Retirar del piso» aparecen.
3. En Movimientos, tipo «Internos»: debajo sale el proceso «Movimiento interno» (junto a «Activación piso/almacén»), y
   trae la bajada y el retiro.
4. Ajustar stock ▸ ubicación Piso: la nota nombra «Retirar del piso».
5. En Colaboradores ▸ Roles y accesos, Existencias dice «Consultar stock, reponer y retirar del piso, ajustar stock,
   apartar prendas» (la pantalla lo lee de `lib/modulos.ts`). La base se comprueba
   aparte, ya pegada la `20260926170000`: `select incluye from retail.modulos where clave = 'existencias';` da el
   mismo texto.

**La lección.** El bloque 1 y el bloque 2 los trabajaron dos sesiones distintas el mismo día, sobre el mismo módulo y
con dos planes. La revisión cruzada encontró sobre todo textos que prometían lo que la pantalla no hacía: un «no se
guardó nada» que podía ser falso, un «dilo en la nota» que nadie iba a leer, un filtro que decía «bajada o retiro» y
traía más, un PR que el documento daba por pendiente cuando ya estaba en `main`. Un texto de pantalla o de documento
es parte del contrato: se revisa como el código.

## Actualización 2026-09-26 — la marca de `mover_interno`

**El problema.** «Reponer» y «Retirar del piso» llaman a `mover_interno`, que no tenía marca contra el doble envío. Si
la conexión se corta DESPUÉS de que la base guardó, la colaboradora no sabe si se guardó; si vuelve a confirmar, la
prenda se mueve dos veces: el piso queda con otra cifra que la que está colgada, la caja deja de cobrar una prenda que
sí está a la vista, y el bloque 3 contaría una bajada o un retiro que no pasó. La pantalla ya frenaba el doble clic y
el cierre durante el guardado; nada frenaba el reintento después de un corte.

**La analogía.** Es la guía de traslado numerada del Taller: si la guía 0412 ya está archivada, una segunda hoja con
el mismo número no mueve otro fardo, solo confirma que el primero salió. Y si alguien trae la 0412 con otra cantidad,
no se acepta: esa guía ya dice otra cosa.

**DECIDÍ:** `mover_interno` suma un séptimo parámetro opcional, `p_token uuid default null`, y una tabla
`retail.movimientos_internos_intentos` (la marca, el movimiento que produjo y una huella md5 de tienda, prenda,
cantidad, origen, destino y nota). Con marca: candado de transacción sobre ella, y si ya se usó con la misma huella
devuelve el MISMO movimiento sin mover nada; con otra huella rechaza (`mover_interno_token_reusado`). Sin marca, igual
que antes: así la sigue llamando `bajar_al_piso`, que ya tiene su marca por bajada. La marca se mira ANTES de pedir
responsable (la lección del bloque 1): comprobar algo ya guardado no escribe nada. La tabla solo la escribe la función
(RLS sin políticas, sin privilegios de afuera) y sus filas no se editan, no se borran ni se vacían.
**DESCARTÉ:** una función aparte con token (`mover_interno_con_marca`): dos funciones que hacen lo mismo, y la próxima
corrección se aplicaría a una sola. Y hacer la marca obligatoria: rompería `bajar_al_piso`, el seed y las pruebas que
la llaman con seis argumentos, a cambio de nada (ellas no se reintentan solas).
**SE ROMPE SI** alguien vuelve a pegar `20260914230000` (recrearía la versión de seis parámetros al lado: dos firmas,
y `pruebas:una-sola-firma` lo detecta), o si la web con `p_token` sale antes de pegar las dos migraciones («Reponer» y
«Retirar» fallarían con «función no encontrada» hasta pegarlas; `pnpm datos:comparar` ya lo avisa:
«manda `p_token` y producción no lo acepta»).

**Cómo se ve mal hecho.** Guardar la marca en el navegador y confiar en ella (se pierde al recargar); poner la marca
DESPUÉS del responsable (un reintento con la responsable ya fuera de turno diría «no está de turno» aunque el
movimiento ya estaba guardado); o dejar que la pantalla cambie la cifra y reenvíe con la misma marca.

**La pantalla** (`apps/web/components/ReponerPisoModal.tsx`): una marca por modal abierto. Tras una respuesta incierta
(`esRespuestaIncierta`, que pasó de `bajada-reglas.ts` a `error-escritura.ts` para que la usen las dos pantallas) la
cantidad y la nota quedan fijas y el botón dice «Confirmar de nuevo»: la única salida es reenviar lo mismo o cerrar.
No se descongela con un rechazo posterior (un corte de tiempo mientras el primer envío seguía en curso no prueba nada);
el texto suma «Aún no sabemos si el envío anterior se guardó…» y ofrece cerrar y revisar Existencias (la base ya
respondió, así que las cifras se refrescaron). Congelado, el tope de la pantalla no frena el reenvío: puede que ya
descuente ese mismo envío, y la pregunta es para la base. La nota se manda escrita en el objeto (sin `...`) para que
`datos:comparar` pueda leer la llamada entera.

**La guarda de la `0200`.** Buscaba `mover_interno` por su firma de seis parámetros; ahora la busca por nombre, para
que la `0200` se pueda volver a pegar después de la `200100` (las pruebas del CI lo hacen). Solo cambia la guarda, no
lo que crea: en producción no hay que volver a pegarla.

**Estado:** en producción desde el 2026-09-26. Felipe pegó las dos partes en orden y la base respondió con UNA sola
firma de `mover_interno`, terminada en `p_token uuid` (la guarda de la segunda parte exige la tabla, así que la tabla
también está); después fusionó la web (#458, `306a30f9`).

**Cómo se pega (en este orden, fuera de hora pico):**
1. `20260926200000_mover_interno_intentos_tabla.sql` (la tabla; su FK toma un candado breve sobre `movimientos`, con
   `lock_timeout` de 3 s: si no lo consigue, falla sin daño y se vuelve a pegar).
2. `20260926200100_mover_interno_con_marca.sql` (la función). Si el cuerpo vivo de `mover_interno` no mide
   `ab13725880e28cabc97d3261d4db8396` (medido en producción el 2026-09-25), aborta sin tocar nada: alguien lo parchó en
   vivo y hay que reescribir la migración desde la definición real.
3. Recién entonces fusionar la web.

**Cómo lo verifica Felipe:**
1. Después de pegar: `select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'mover_interno' and
   pronamespace = 'retail'::regnamespace;` da UNA fila que termina en `p_token uuid`.
2. Con la web publicada, en Existencias, «Reponer» 1 prenda: el piso sube 1 y en Movimientos sale UNA «Bajada al piso».
   Luego `select count(*) from retail.movimientos_internos_intentos;` da 1 (o una más que antes).
3. Una bajada por «Bajar al piso» sigue funcionando igual (no usa esta marca: esa tabla no crece).

**Qué cubren las pruebas.** `pnpm pruebas:mover-interno-marca` (12 casos, en el CI): una sola firma, sin marca igual
que antes, reintento = mismo movimiento, otra cifra/nota/sentido rechazado, intento fallido deja la marca libre, la
marca antes del responsable, la tabla inmutable, la guarda md5 aborta, pegada dos veces, y `bajar_al_piso` sin cambios.
Aparte, contra un Postgres desechable y con COMMIT: dos envíos simultáneos con la misma marca dan UN movimiento (el
segundo espera el candado y responde el mismo). En el navegador, con la red cortada a propósito: corte → congelado →
rechazo → éxito, tres envíos con la misma marca, la misma cifra y la misma nota; un modal nuevo estrena marca.

## Nota 2026-09-26 — ADR-0240 revierte «Reponer le sigue funcionando con solo Existencias»

Felipe eligió la opción A del análisis de Existencias: mover piso↔almacén es de «Bajada al piso» por CUALQUIER puerta.
«Reponer» y «Retirar del piso» pasan por `mover_entre_piso_y_almacen`, que pide el módulo, y `mover_interno` queda
interno. La prueba `bajada_al_piso.mjs` (P2) ahora afirma lo contrario de lo que decía. Antes de publicarlo hay que
encender «Bajada al piso» en los roles que hoy reponen desde Existencias (aquí se anotaron las Terminal Almacén y de
ventas): ver ADR-0240, «Se rompe si».

## Actualización 2026-09-26 — decisiones del bloque 3 (Felipe, en rondas de preguntas)

Cierra «Lo que falta decidir» del bloque 1 (punto (g)) y lo que abrió el bloque 2. Las temporadas tienen su propio ADR
(ADR-0246). Nada de esto está construido todavía.

**1. La caja no se frena (D-40), pero pregunta de dónde vino la prenda.** Si la caja encuentra una prenda que el sistema
cree en el almacén, ofrece dos botones:
- **«La traje del almacén»** = **a pedido**: no cuenta para el piso ni para la rotación, y suma a «tallas que faltaban en
  el piso».
- **«Ya estaba colgada»** = **error de registro**: la prenda sale del cálculo de edad y baja la confianza de la sede.
- Como «a pedido» puede esconder prendas colgadas sin registrar, el indicador muestra también el **% de ventas «a
  pedido»** por sede.

**2. «Es para una clienta» al bajar o reponer.** Idea de Felipe: un interruptor (apagado por defecto) en «Bajar al piso»
y en «Reponer» marca la bajada como «a pedido». Hoy «Reponer» pasa por `mover_entre_piso_y_almacen` (ADR-0240): el
interruptor va en esa puerta y en `bajar_al_piso`.

**3. Bajada tardía.** En las tiendas se cuelga por fardo **y** suelto durante el día, así que el tamaño de la bajada no
alcanza para detectarla. Queda así: una bajada **sin** marca «para una clienta» cuya prenda se vende en 10 minutos o menos
es «probable registro tardío» (sale del cálculo de edad y se cuenta aparte). Con los dos botones de la caja y el
interruptor, casi no debería pasar.

**4. Retirar del piso con motivo.** Motivo cerrado: fin de temporada, cambio de exhibición, dañada, otro. «Fin de
temporada» marca esa talla en esa sede como **«retirada de la venta»**: deja de pedir «Reponer» y «Por colgar» hasta que
se vuelva a bajar. Las tallas marcadas se listan para que no se olviden.

**5. Confianza de cada cifra.** Se muestran cifras **desde el primer día**, con tres niveles y el bueno en silencio:
«Pocos datos» (ámbar), «Aceptable» (gris) y «Sólido» (sin etiqueta). Lo que mueve plata espera el «Sólido»: el traslado
sugerido (bloque 5) y la rebaja (bloque 7).

**6. El semáforo de cada prenda se mide contra su propia sede**, siempre, y la vara se construye de a poco; el promedio
de la categoría en las 3 sedes (CAYLA) queda a la vista como referencia. Con 0 ventas de esa categoría en esa sede no hay
semáforo: solo los días colgada y la referencia de CAYLA. Umbrales del aviso: 1-9 ventas «Pocos datos», 10-19
«Aceptable», 20 o más «Sólido».

**7. Diferencias entre sedes.** Según Felipe, pesan sobre todo la clienta de cada ciudad y el local (puerta a la calle,
tránsito); también el equipo y el surtido. Por eso la comparación entre sedes es del líder, y a los equipos se les
muestra su propia evolución.

**8. El indicador de confianza del registro** lo ven:
- el **líder**, todas las sedes;
- las **3 Terminal de ventas**, solo su sede y como equipo (no por persona): en grande, su sede contra su propio mes
  anterior; con un enlace discreto en gris, «Ver ranking y promedio de CAYLA». Va como módulo propio que Felipe le da a
  ese rol (ADR-0161: nace solo para el líder).

**9. La bajada escaneada se hace desde la Terminal Almacén.** Felipe marca «Bajada al piso» en ese rol (Roles y accesos,
sin SQL). **Urgente desde ADR-0240:** sin ese módulo, esas terminales ya no pueden «Reponer» ni «Retirar del piso».

**10. «Ajustar stock» sale de Existencias a un módulo propio.** Hoy «Integrante» (17 personas) ajusta porque ve
Existencias, Conteos y Traslados (`fn_puede_ajustar_inventario`). Va en un PR de roles aparte; nace solo para el líder.
ADR-0240 ya hizo que el ajuste se guarde de una vez y con marca contra el doble envío.

**Orden de construcción del bloque 3** (decisión técnica; cada paso con su PR y su prueba):
- **3a · Temporadas** (ADR-0246): la lista, el calendario de SENAMHI, las columnas y la pestaña en Atributos, el campo en
  el alta y la lista «Sin temporada». Va primero porque el resto la usa para comparar.
- **3b · Marcas de origen:** los dos botones de la caja, el interruptor «Es para una clienta» y el motivo del retiro con
  «retirada de la venta». Toca Vender: se prueba a 375 px.
- **3c · La pantalla de Frescura:** el semáforo contra la sede con la referencia de CAYLA, los niveles de confianza, el
  fin de estación con sus sugerencias y el indicador (líder y Terminal de ventas). Encima de `fn_ledger_puntos` y de
  `inventario-exposicion.ts`, como exige (d).
- Aparte, sin depender de Frescura: el módulo «Ajustar stock».

## Actualización 2026-09-27 — diseño 3c

**Dónde vive (Felipe, 2026-09-27): directo en Inventario**, como sexta fila: Existencias, Movimientos, Traslados,
Conteo, Análisis y **Frescura del piso**, ruta `/inventario/frescura`. **Módulo propio `frescura`**, sin permiso nuevo
aparte del módulo, que **nace solo para el líder** (ADR-0161); el líder decide después a qué rol se lo da.
- *Descarté* el subgrupo «Diagnóstico» (Análisis + Frescura), que respetaba el tope de 6 hijas de `menu.test.ts`:
  escondía un clic más adentro la pantalla que se debería mirar cada semana.
- *El tope:* el líder ve 6 filas («Recibir mercadería» solo sale a quien NO ve Compras). Llegaría a 7 únicamente un rol
  que vea Análisis y Frescura y reciba mercadería sin ver Compras; hoy no existe. Para ese caso, Inventario queda con
  una excepción escrita al tope (`EXCEPCIONES_TOPE_HIJAS`, 7) en vez de esconder Frescura.
- *Se rompe si* un rol con esa combinación aparece y además Inventario suma otra pantalla: entonces sí hay que regrupar.

**El dato que manda sobre el diseño: la mitad del piso no tiene edad.** De las 211 unidades que entraron al piso de TRU
(consulta de solo lectura del 2026-09-27), 104 llegaron por bajadas normales, 95 por bajadas de la **carga inicial** (15
filas del 26-sep) y 12 por ajustes de «Reposición» del 24-sep. El **51 %** ya estaba colgado antes de que existiera el
sistema: su reloj diría el día de la carga, no el día en que se colgó. Por eso esas unidades llevan una marca de **edad
desconocida**: dicen «al menos N días», pueden subir de tramo, pero nunca son «Nueva» ni entran a la vara (ADR-0248). El
color del semáforo va a llenar el piso en semanas, no en días.

**Seis pasos, terreno primero** (cada uno con su PR y su prueba; la numeración de migraciones la fija cada PR):
1. **Terreno del dominio** (ADR-0248): el FIFO consume por antigüedad y no por el orden del arreglo;
   `historiaDeCohortes` da, además de las cohortes, cada venta y pérdida con lo que llevaba expuesta; la marca de edad
   desconocida viaja con la unidad; y `fn_ledger_puntos` pasa de `= any(…)` a un semi-join (ADR-0202, sin cambiar
   resultados).
2. **Núcleo de bajadas:** primero un refactor que da exactamente lo mismo (`fn_bajadas_del_piso` pasa a envolver un
   núcleo); después el cambio de conducta que pedía (c): netear los retiros de la misma talla alrededor de la bajada,
   el estado `corregida` y la marca de carga inicial, que sale del indicador de confianza.
3. **Lectura y reglas:** el módulo `frescura`; una lectura por sede (`fn_frescura_sede`, una sola llamada al libro) y el
   indicador (`fn_confianza_registro`, por sede y mes de Lima, sin nombres de personas); y en la web, lógica pura
   (Kaplan-Meier con P50, P75 y P90, la ventana de 30 a 120 días, los niveles de confianza y el estado de cada prenda).
4. **La pantalla:** maqueta primero, para que Felipe elija colores y frase de acción; luego el menú y la ruta.
5. **Análisis usa la regla de Frescura:** «Estancadas» deja el corte fijo de 14 días y pasa a «vieja y lenta» (la misma
   definición de Frescura), con un enlace.
6. ~~El indicador en la Terminal de ventas~~ **pasa al 3b** (ver abajo).

**Decisiones de Felipe del 2026-09-27 (cierran las preguntas del diseño):**

1. **«Envejecida» no depende de la temporada.** Una prenda envejece cuando es **más lenta que su categoría en su sede**:
   los tramos (Nueva, Vigente, Envejecida, Crítica) salen de la curva de **categoría × sede**, sin partirla por mitad del
   año. La temporada da **otro aviso, aparte: «Temporada pasada»**, cuando termina su estación (con sugerencias, sin
   rebaja automática). Los clásicos se siguen midiendo contra su propia historia, y es la temporada la que dice que una
   prenda es clásica. Reemplaza la decisión 8 de ADR-0246 («en la misma mitad del año»).
   - *Descarté* partir la vara por mitad del año: mezclaba dos preguntas (¿se vende más lento que sus hermanas? / ¿ya
     pasó su estación?) y, con 7 ventas en producción, dejaba cada mitad sin datos.
   - *Descarté* no dar aviso de temporada: el bikini que se vende bien hasta el 20 de marzo se vería recién semanas
     después, cuando ya se hubiera puesto lento.
   - *Lo que se paga:* en una categoría que mezcla verano e invierno, fuera de estación las prendas lentas estiran la
     vara de toda la categoría y las demás parecen «Nuevas» unos días más. El aviso «Temporada pasada» marca a las de
     la estación que terminó; si una categoría lo sufre de verdad, se parte la categoría, no la vara.
   - *Sin temporada* (56 prendas de producción, modelo y color de 17 productos, al 2026-09-27): se miden igual que las
     demás; no reciben el aviso de fin de estación y llevan el chip «Sin temporada · complétala» (un clásico sin temporada
     se mediría como moda).
2. **El indicador de registro de la Terminal de ventas va en Caja y sale con los dos botones del 3b** («La traje del
   almacén» / «Ya estaba colgada»). Antes de esos botones, «la clienta pidió otra talla y se la trajeron» cuenta como
   bajada tardía y la cifra castigaría al equipo por atender bien. En el 3c, el indicador lo ve solo el líder, en Frescura.
   El módulo `registro_piso` nace con la tarjeta, no antes (Roles y accesos no ofrece un módulo que no muestra nada).
   - *Descarté* Inicio: una terminal de ventas nunca ve Inicio (al entrar va a Vender, regla del 2026-09-21, y el menú
     se lo esconde).
3. **Menú:** directo en Inventario (arriba, «Dónde vive»).

### Paso 2 construido (2026-09-27): el núcleo de las bajadas

**Estado:** construido en la rama `claude/frescura-3c-bajadas` (#537) y **pegado en producción el 2026-09-27** (md5 verificados
ese día: puerta `34a7e0cc…`, núcleo `fcfd2c4b…`). Se pegó `20260928120100` y
después `20260928120200`, cada una sola en el SQL Editor, a cualquier hora (solo funciones: sin políticas, sin
`drop trigger`, sin `alter` de tablas). Ninguna pantalla llama hoy a `fn_bajadas_del_piso`, así que no hay web que
esperar: el primer consumidor es el paso 3.

**Parte 1, `20260928120100_bajadas_nucleo.sql` (refactor, mismos resultados).** El cálculo de hoy pasa letra por letra a
`retail.fn_bajadas_del_piso_nucleo(...)`, interno (`revoke` a public, anon y authenticated), y `fn_bajadas_del_piso`
queda como su puerta con el MISMO candado de líder, el mismo texto y la misma pista. Así `fn_frescura_sede` y
`fn_confianza_registro` (paso 3) usan el cálculo con su propio candado sin copiarlo. La guarda exige el cuerpo vivo de
la `0300`: md5 `91e2d0c19981952706c7b75d8514eb26`, **igual en producción y en una base armada desde el repo** (consulta
de solo lectura del 2026-09-27; a diferencia del libro en el paso 1, aquí no hubo diferencia de comentarios). Ninguna
migración posterior a la `0300` recrea ni parcha la función. Verificado: los 64 casos de `frescura_bajadas.mjs` iguales
y, con carga sintética, 0 filas distintas en 20.001 bajadas.

**Parte 2, `20260928120200_bajadas_netear_retiros.sql` (cambio de conducta, lo que pedía (c)).** Para cada bajada (tienda,
prenda, hora t, cantidad c), con la ventana W (10 minutos por defecto). Un **retiro** es lo que pasó del piso al almacén
de la misma tienda (el par inverso de la bajada, por estructura); piso → cuarentena no es retiro.
- `piso_antes` = el nivel del piso **justo antes** de la bajada (como en la `0300`) **+ todo lo retirado** de esa prenda en
  [t − W, t), aunque ese retiro se descuente de otra bajada: describe lo que estaba colgado antes de que alguien lo
  retirara. Una venta de los minutos previos no se suma (esa prenda ya no estaba), ni un retiro de la misma hora exacta
  (en la tienda no pasa: retiro y bajada de la misma prenda nunca van en una transacción). Si el nivel justo antes es
  negativo, `piso_antes` es ese nivel, sin sumar retiros, y la fila sigue «dudosa».
- **Cada retiro se descuenta de UNA sola bajada** de la misma prenda: la más cercana en el tiempo, antes o después, a W o
  menos; si dos quedan a la misma distancia, la de antes del retiro; si aún empatan (dos bajadas en el mismo instante), la
  de menor id. Un retiro sin bajada a W o menos no se descuenta de ninguna.
- `retiradas_en_ventana` (nueva) = lo de los retiros que le tocaron. `cantidad_efectiva` (nueva) = máx(0, c − retiradas):
  lo que sobra de un retiro más grande que su bajada no pasa a otra.
- `unidades_tardias` se topa por la **efectiva**, no por la cantidad.
- Estado nuevo **`corregida`** cuando la efectiva es 0. Orden: dudosa → corregida → tardia → en_curso → normal.
- `es_carga_inicial` (nueva) = una entrada `carga_inicial` de la misma prenda y tienda en el mismo instante: las dos
  puertas de la carga (alta de producto, ADR-0212; Ajustar stock, ADR-0235) escriben la entrada y la bajada en la misma
  transacción, y `created_at` es la hora de inicio de la transacción.
- Las bajadas y los retiros se leen desde dos ventanas antes de `p_desde` hasta dos después de `p_hasta` (el libro sigue
  leyéndose desde `p_desde`): la bajada de los primeros minutos del rango ve sus retiros de antes, y la bajada de fuera del
  rango que le disputa un retiro también está. La misma bajada da la misma fila con cualquier rango que la incluya (T27).
- Las tres columnas nuevas van al final. Las dos funciones se recrean con `drop` + `create` (cambia el tipo de fila).

**La regla del piso de antes y de los retiros (corregida el 2026-09-27, antes de pegar)**
- **DECIDÍ:** piso de antes = nivel justo antes + los retiros de [t − W, t), y cada retiro a una sola bajada (la más
  cercana; empate, la de antes del retiro).
- **DESCARTÉ:** la primera versión de la `120200` (nunca pegada): piso de antes = el **nivel más alto de la ventana** y
  cada retiro descontado de **toda** bajada a W o menos. El nivel más alto absorbe las **ventas** de los minutos previos
  (T6: la segunda bajada veía un piso de 10 porque 3 minutos antes se había vendido una; en la tienda era 9), así que
  escondía justo el registro tardío que la marca busca. Y descontar de todas contaba dos veces el mismo retiro: con
  bajadas de 2 y 3 y un retiro de 2 entre ellas, las efectivas sumaban 1 cuando quedaron 3 colgadas, y el denominador del
  indicador de confianza (Σ efectiva) salía corto.
- **SE ROMPE SI** hay varios retiros y re-bajadas de la misma talla dentro de 10 minutos: la más cercana no siempre es la
  que se corrigió, y la corrección puede quedar en la bajada equivocada (una sale «corregida» y la que de verdad se deshizo,
  no), aunque el total de cantidades efectivas cuadra. El motivo del retiro del 3b es lo que lo desambigua.

**Casos que cambian respecto de la `0300`** (pruebas de `scripts/pruebas/frescura_bajadas.mjs`; los demás dan lo mismo):
- **T9** (piso→almacén de 1 a los 10:00 exactos antes de bajar 1): de «normal» con `piso_antes` 1 a **«corregida»**
  (retiradas 1, efectiva 0, `piso_antes` 2).
- **T14** (historia mezclada): `piso_antes` de 4, 5, 7 a **4, 6, 7** (el retiro de −50 minutos cae en [t − 10, t) de la
  segunda); ese retiro queda a 10 minutos justos de la primera y de la segunda: empate → la de antes del retiro
  (efectivas **2, 2, 1**).
- **El ejemplo de (c)** (piso 2; se retiran 2; al minuto se reponen 2; a los 5 se vende 1): de «tardia» con 1 tardía a
  **«corregida»** sin tardías (T24).

**Casos que la regla corregida cambió respecto de la primera `120200`:** T6 (`piso_antes` vuelve a 9, como en la `0300`;
tardías igual), T14 (`piso_antes` 4, 7, 8 → 4, 6, 7; efectivas 2, 1, 1 → 2, 2, 1), T25 «doble» (bajadas de 2 y 3, retiro
de 2 a 3 y 1 minuto: efectivas 0 y 1 → **2 y 1**; la primera pasa de «corregida» a «tardia» con 2 tardías, porque se
vendieron 3 con el piso vacío) y T28 (la venta de la misma hora ANTES de la bajada ya no sube el piso de antes: 2 → 0,
«normal» → «tardia», como en la `0300`). Casos nuevos de la regla: T24 ampliado (una bajada 5 minutos antes del retiro
conserva sus 2 y el retiro va a la re-bajada, a 1 minuto: Σ efectivas 2), T29 (empate a 4 y 4 minutos → la de antes, Σ 3;
retiro de 5 sobre una bajada de 2 → efectiva 0 y la siguiente conserva sus 3; retiros a 11 minutos → ni se descuentan ni
suman; «dudosa» con un retiro en la ventana → −2, no −1; dos bajadas en el mismo instante → el retiro va a la de menor
id), T26 (dos entradas de carga en el mismo instante no duplican la bajada), T27 (la disputa con una bajada de fuera del
rango) y T28 (un retiro de la misma hora no suma al piso de antes pero se descuenta). 104 verificaciones.

**Revisión del 2026-09-27 (pruebas de mutación, antes de pegar).** Se le hicieron 47 cambios chicos a propósito al
cuerpo del núcleo (un `sum` por un `max`, un borde que se corre, un estado antes que otro) y se corrió la prueba contra
cada uno: 16 pasaban sin que nada fallara, y uno más (quitar el desempate por hora) pasaba 1 de cada 10 veces, según
el azar de los ids. La regla estaba bien escrita, pero nada la vigilaba en esos puntos. Se agregaron los casos que los
hacen fallar; el cuerpo de la función no cambió (núcleo `94d587570d8db50cf69c9b6bd982a01e`, mismo costo: re-medido,
304 → 317 ms sin retiros y 329 → 357 ms con 4.001):
- **T27, el borde de `p_hasta`** (el espejo del de `p_desde`): la bajada del último minuto del rango ve su retiro de 5
  minutos después, y un retiro que le disputa una bajada 12 minutos después de ella (a más de una ventana de `p_hasta`) va
  a esa, igual que con el rango de 30 días. Sin esto, leer los retiros solo hasta `p_hasta` o hasta `p_hasta + W` pasaba.
- **T29, dos retiros para la misma bajada** (1 y 2 en la ventana previa de una bajada de 5): se suman en `piso_antes`
  (0 + 1 + 2 = 3) y en `retiradas` (3). Sin esto, tomar el mayor pasaba.
- **T29, el retiro previo pesa en las tardías cuando la efectiva es > 0** (piso 2; se retiran 2; se bajan 5; se venden
  2): 0 tardías, «normal». Con el nivel justo antes (0) saldrían 2 tardías: se volvería a acusar a quien repuso.
- **T29, la «dudosa» no se tapa con un retiro** (nivel justo antes −1 y un retiro de 2 en la ventana): sigue «dudosa»
  con `piso_antes` −1. Decidirla después de sumar los retiros la daba por «normal».
- **T31, bordes que ninguna prueba miraba:** piso → cuarentena no es retiro; la ventana de los retiros y el margen de
  lectura siguen a `p_minutos` (con 5 y con 30), no a 10 ni a 20 minutos fijos; «dudosa» manda sobre «corregida» y
  «corregida» sobre «en_curso»; en el empate de distancia manda la hora (la de antes) y no el id; una carga inicial 30
  segundos antes o de otra tienda no marca la bajada.
- **T30, el límite de abajo** fijado tal cual es hoy, para que cambiarlo sea una decisión y no un accidente.
124 verificaciones. De los 47 cambios, 45 hacen fallar la prueba (el del desempate, 10 de 10 veces); los otros dos no
cambian ninguna fila posible, porque el libro ya hace ese trabajo: quitar el filtro de la «Prenda sin registrar» (el libro
no la lee) y el límite inferior de las bajadas (el libro empieza en `p_desde`, y una bajada sin su punto no sale).

**Revisión 2 del 2026-09-27 (antes de pegar): el cálculo se rehízo sin cruces y la prueba vigila cinco huecos más.**
Seis hallazgos confirmados ejecutando:
- **El plan colapsaba con historia de otra tienda** (el más serio): ver «La decisión estructural» abajo. El cuerpo nuevo
  da las mismas filas que el anterior (0 diferencias a 1, 7, 30, 60 y 120 días, con y sin retiros, con 60.000 y 300.000
  movimientos de otra tienda) y la regla no cambió: 1.500 escenarios al azar de la revisión, 0 diferencias contra la regla
  escrita calculada aparte.
- **La guarda de la `120200` mira el núcleo Y la puerta, pero ninguna prueba parchaba la puerta**: quitar esa mitad de la
  guarda pasaba (en esos casos la migración recrea la puerta con `drop` + `create` y borra el parche en silencio, lo que
  rompió Análisis con el PR 397). Nuevo caso «T23 (la puerta)»: con la `120200` ya pegada, y justo después de la `120100`.
- **Cuarentena → almacén contado como retiro** (definir el retiro solo por su destino) y **almacén → cuarentena tomado
  como bajada** (definirla solo por su origen): los dos pasaban, y los dos esconden o mueven una corrección. Casos
  nuevos en T31 (CUAR-ALM, ALM-CUAR).
- **Dos retiros IGUALES**: T29 usaba 1 y 2, y «sumar sin repetidos» daba lo mismo. Caso nuevo T29 IGUALES (1 y 1, con
  una venta: la tardía falsa aparece si se suman sin repetidos). En el mismo espíritu, dos ventas iguales del mismo
  instante (un `union` en vez de `union all` las juntaba).
- **El piso de antes suma un retiro que la regla le dio a la bajada anterior**: pide otra regla de negocio, así que quedó
  como decisión de Felipe y la prueba T32 fijó lo de ese día. **Decidida el mismo 2026-09-27: se queda la regla vigente**
  (ver «Límites», abajo, y la «Revisión 3»).
Además, como el cuerpo es nuevo, la prueba suma los bordes que ese cuerpo tiene (el borde exacto de `p_desde − 2W`, la
carga de 1 segundo antes o 30 segundos después, el retiro con la bajada de después a medio segundo, el orden de salida y
el rango por defecto de 30 días). **141 verificaciones.** Pruebas de mutación sobre el cuerpo nuevo: 37 cambios chicos a
propósito (34 al cálculo y 3 a la guarda); con la prueba de antes pasaban 14; con la de ahora, 35 hacen fallar la prueba
y los 2 que quedan no cambian ninguna fila posible (sin la condición «no hay retiros» la bajada sale dos veces antes de
agruparse por id, y la agrupación la vuelve una; una carga fuera del rango no comparte instante con una bajada del
rango). Los mutantes de la revisión sobre el cuerpo anterior (`sum(distinct)`, retiro por destino, bajada por origen, la
guarda sin la puerta) también fallan con la prueba de ahora.

**Revisión 3 del 2026-09-27 (antes de pegar): la decisión del piso de antes, cuatro huecos más vigilados y la guarda de
la parte 1 mira el núcleo.** El cálculo no cambió; el cuerpo del núcleo, solo en dos comentarios que mentían (decían «si
no hay ningún retiro en el rango», y la condición real es la tienda entera entre `p_desde − 2W` y `p_hasta + 2W`): como
el md5 mide también los comentarios, el núcleo pasa a `fcfd2c4b2c4f24dd2184eb2cd7a12678` y la guarda de la `120200` acepta
ese para volver a pegarla.
- **La regla del piso de antes, decidida:** se queda la vigente (ver «Límites»). Los gemelos de T32 (B, «retiro por
  error») la fijan: con la «variante C» (sumar al piso de antes solo lo retirado antes que se le asignó a ESA bajada)
  darían vuelta, y la prueba lo dice en su comentario.
- **La rama con retiros se elige por la tienda entera, y ninguna prueba lo vigilaba:** pedir «un retiro en el rango»
  (desde `p_desde`, en `[p_desde, p_hasta)` o hasta `p_hasta`) pasaba, porque en T27 los cuatro sub-casos comparten una
  transacción y siempre había un retiro de OTRO sub-caso dentro del rango. Nuevo T27 (único retiro), dos casos, cada uno
  en su propia transacción: el único retiro de la tienda cae fuera del rango y dentro de la ventana ampliada.
- **El borde de `p_hasta` en la rama con retiros** (`r.t <= v_hasta` pasaba: T17 no tiene retiros). Nuevo T17 (con
  retiros), también con el borde de `p_desde`.
- **«cerrada» no es final:** ver «Límites». T33 fija el valor de hoy.
- **La guarda de la `120100` miraba solo la puerta:** volver a pegarla con su núcleo parchado en vivo lo pisaba con
  `create or replace` sin avisar (lo que rompió Análisis con el PR 397). Ahora exige que el núcleo no exista o sea el suyo
  (`8d38d6dd…`). Nuevo T22 (el núcleo). Esa guarda vive fuera del cuerpo de las funciones: sus md5 no cambian.
**160 verificaciones.** Pruebas de mutación sobre el núcleo (los 38 cambios de la revisión 3 y la variante C): el del
borde de `p_hasta` en la rama con retiros y los tres de la rama («desde p_desde», «en el rango», «hasta p_hasta») ahora
fallan; la variante C hace fallar 17 afirmaciones de conducta (más las 2 de la guarda que falla cualquier cambio del
cuerpo), entre ellas las 3 de los gemelos. Quitar la mitad nueva de la guarda de la `120100` también falla. Siguen pasando
13 de los 38, los mismos que la revisión dejó vivos también con los casos que proponía, y quedan fuera de este arreglo:
dos equivalentes (la bajada que va a su propio instante por otro camino; la rama elegida por prenda), tres de la marca de
carga (`max` en vez de `min`, sin exigir `tipo = 'entrada'`, la ventana hacia atrás: hacen falta dos cargas de la misma
prenda a W o menos), el orden de salida de dos bajadas del mismo instante, el borde exacto de `p_hasta + 2W`, y seis
filtros de `internos`, `juntas` y la lectura del libro (la centinela, `fn_es_traslado_interno`, el punto del libro, `ord
= 1`, `es_bajada` en la rama con retiros, el «después» desde el mismo instante) que esta ronda no revisó uno por uno.
Cada migración pegada dos veces con `psql -1 -f` (`0300` → `120100` ×2 → `120200` ×2) deja los mismos md5, y
la `120100` después de la `120200` aborta con su aviso.

**En producción hoy** (ensayo de solo lectura del 2026-09-27: el cuerpo final como un `select` sobre Tienda TRU, sin
crear nada): 40 bajadas (199 unidades) y **ningún retiro**, así que ninguna fila cambia de `piso_antes`, estado ni
tardías; **15 de las 15 bajadas de la carga inicial del 26-sep (95 unidades) salen con `es_carga_inicial`**, y ninguna
otra. AQP, LIM y el Taller no tienen bajadas. Repetido con el cuerpo de la revisión 2 (el mismo `select`, sin crear
nada; 161 movimientos en toda la base): las mismas 40 filas, y 0 filas distintas contra el cálculo anterior y contra la
`0300`.

**Límites** (fijados en las pruebas):
- Un retiro legítimo de la misma prenda dentro de la ventana también se descuenta: no se distingue hasta el motivo del
  retiro del 3b.
- Con varios retiros y re-bajadas de la misma talla en 10 minutos, la corrección puede ir a la bajada equivocada (el
  «SE ROMPE SI» de arriba).
- La carga inicial se reconoce por el instante exacto: registrada en dos transacciones (carga y, aparte, su bajada), no
  se marca.
- **El piso de antes suma TODO lo retirado en [t − W, t), también un retiro que la regla le descontó a OTRA bajada
  (DECIDIDO el 2026-09-27; T30, T32 y T32 (gemelos)).** Era la «decisión pendiente» de la revisión 2. El libro solo ve
  «bajada, retiro, bajada, ventas» y no sabe cuál de estas dos historias pasó:
  - **A, «colgaron de más»** (T32): se bajan 3 y solo cabe 1; a los 2 minutos se retiran 2 (esas prendas nunca quedaron
    en el piso); a los 8, otra colaboradora baja 1; se venden 2. La de los 8 minutos tuvo 1 tardía real.
  - **B, «retiro por error»** (T32 (gemelos), hallados en la revisión 3): a las 9:57 se bajan 2 de verdad; a las 10:00 se
    retiran 2 por error; a las 10:08 otra colaboradora las vuelve a colgar; a las 10:12 se venden 4. Sin el error nadie
    tiene tardías: la de 10:08 solo corrigió.
  Las dos tienen la misma forma en el libro, así que toda regla del piso de antes acierta en una y falla en la otra.
  - **DECIDÍ:** se queda la regla vigente. En B nunca culpa a quien corrige: la re-bajada sale con 0 tardías y
    «normal» (FALSA2 y EMPATE), también cuando la corrección se hace en dos re-bajadas de 1 (la segunda suma el retiro a
    su piso de antes: 0 tardías; con esta regla, que lo que sobra de un retiro no pase a la bajada siguiente ya no deja
    una tardía falsa). ADR-0208 pone primero no castigar al equipo por corregir ni por atender bien.
  - **DESCARTÉ:** la «variante C», sumar al piso de antes solo lo retirado ANTES de la bajada que la regla le asignó a
    ESA misma bajada (probada en este mismo cálculo: una suma más en el mismo recorrido, mismo costo, 331 y 402 ms contra
    329 y 403). Atrapa las tardías de A (T30, T32), pero en los gemelos de T32 (B) **culpa a quien corrige**: la re-bajada
    de FALSA2 sale «tardia» con 2 tardías (`piso_antes` 2), la de EMPATE con 2 (`piso_antes` 1) y la segunda de dos
    re-bajadas con 1. No es «C arregla las dos»: C cambia qué caso falla. Descarté también «sumar solo lo retirado que
    todavía no se volvió a colgar»: arregla T30 y no T32 (da lo mismo que la regla vigente en los tres casos de T32).
  - **SE ROMPE SI** una colaboradora cuelga menos de lo escaneado, retira el sobrante y en los 10 minutos siguientes otra
    baja la misma talla y se vende: esa tardía no se ve (T32: `piso_antes` 3 cuando el libro dice 1; con la carga inicial,
    10 cuando dice 6; en el empate de T29 con 3 vendidas, 1 tardía donde hubo 3). Y su otra forma (T30): un retiro por
    error ya repuesto y una bajada real 2 minutos después; el retiro cuenta dos veces (`piso_antes` 4, el libro nunca
    pasó de 3) y la tardía no se ve. Lo que distingue A de B es el motivo del retiro del 3b («no cabía» / «por error»):
    con él, la regla puede elegir por caso. Hoy TRU no tiene retiros (en producción no cambia nada); sí pesa en el
    indicador del paso 3, que así puede esconder alguna tardía y nunca inventa una por corregir.
- **«cerrada» no es final (T33, hallado en la revisión 3).** Una bajada se cierra a los W minutos, pero su fila puede
  cambiar hasta 2W después de la bajada: si un retiro de su ventana queda más cerca de una bajada de la misma talla que
  llega DESPUÉS, el retiro pasa a esa (la regla de los retiros mira las dos direcciones). La fila solo puede PERDER
  retiros: su efectiva y sus tardías suben, nunca bajan. Ejemplo: piso 0; se baja 1 y a los 2 minutos se vende; una
  clienta devuelve 1 al piso; a los 9 se retira 1 → «corregida», y cerrada al minuto 10. Al minuto 10 otra baja 1 de la
  misma talla: el retiro queda a 1 minuto de esa y a 9 de la primera, que pasa a «tardia» con 1 tardía. Lo hereda el
  paso 3: una fila «cerrada» puede entrar al indicador (deja de ser «corregida») o sumarle una tardía hasta 2W después;
  si el indicador necesita una cifra que no se mueva, cuenta solo las bajadas de hace más de 2W.

**La decisión estructural: cómo se calcula (rehecha en la revisión 2 del 2026-09-27, antes de pegar)**
- **DECIDÍ:** ningún paso cruza dos conjuntos CALCULADOS entre sí. Los retiros y las bajadas se ordenan por prenda y hora
  una vez y, con funciones de ventana, cada retiro encuentra la bajada más cercana antes y después (a W o menos) y cada
  bajada suma lo retirado en su ventana previa; lo de cada instante se lo lleva la bajada de menor id (otra ventana por
  prenda e instante). Los puntos del libro que suben el piso, las ventas desde el piso y las entradas de carga inicial
  van a UNA línea de tiempo por prenda (lo vendido en [t, t + W] y la carga del mismo instante salen de un solo
  recorrido), y cada bajada se junta con su punto del libro agrupando por id, no cruzando. Los únicos cruces que quedan
  son búsquedas por índice en tablas (`movimientos`, `venta_items`, `ventas`, `bajada_piso_items`). Si la tienda no tiene
  ningún retiro entre `p_desde − 2W` y `p_hasta + 2W` (lo normal hoy), los pasos de los retiros ni se recorren. Es esa
  ventana ampliada, no el rango pedido: un retiro de fuera del rango puede tocarle a una bajada del rango (T27 (único
  retiro)).
- **DESCARTÉ (1)** el cálculo anterior de la misma `120200` (nunca pegado, núcleo `94d587570d8db50cf69c9b6bd982a01e`):
  cruzaba los retiros con sus bajadas y las bajadas con el libro y con las ventas. Con una sola tienda en `movimientos`
  iba bien (se midió así), pero Postgres estima esos pasos con la fracción de la tabla que es de ESA tienda, y con
  historia de otra tienda los ve de 1 a 30 filas cuando son miles: los cruza fila por fila. Con 60.000 entradas de Tienda
  Lima, 30 días pasaban de 39 a 417 ms y 60 días de 0,13 a 2,97 s; con 300.000, la `120100` (el cálculo de la `0300`, el
  de producción) llegaba a 15,7 s a 60 días. Este núcleo reemplaza a los dos.
- **DESCARTÉ (2)** apagar los bucles anidados en el núcleo (`set enable_nestloop = off`, lo que proponía la revisión como
  arreglo simple): da las mismas filas y quita el colapso, pero también apaga las búsquedas por índice, las del libro
  incluidas (hereda el ajuste): cada llamada recorre `movimientos`, `venta_items` y `ventas` enteras aunque pida un día.
  Medido: 1 día, 11 ms con este núcleo y 41 ms con el ajuste (336.000 movimientos), y crece con la tabla, no con lo pedido.
- **SE ROMPE SI** alguien vuelve a escribir un cruce entre dos pasos calculados (ninguna prueba de conducta lo ve: se
  mide con carga y con historia de otra tienda, como abajo), si el libro deja de dar un punto de piso por movimiento con
  su `oid` y su hora exacta (la bajada deja de encontrar su nivel), o si «Retirar del piso» empieza a devolver a otra
  sububicación que no sea el almacén de la tienda (el retiro dejaría de descontarse sin aviso).

**Cuánto cuesta** (Postgres 17 desechable, con el libro del paso 1; una tienda, 2.000 prendas, 20.001 bajadas y 10.001
ventas, a 120 días; mediana de 5 a 7 corridas intercaladas; mismas filas que el cálculo anterior en todos los rangos):
- sin retiros: de 313 ms (parte 1) a **333 ms (+6 %)**; a 30 días, 37 → 41 ms.
- con 4.001 retiros (dos por prenda, mucho más de lo real): de 338 a **409 ms (+21 %)**; el cálculo anterior daba 368.
- con 60.000 entradas de otra tienda en un año: 30 días 37 → 45 ms, 60 días 136 → 166 ms, 120 días 350 → 443 ms (el
  cálculo anterior: 438 ms, 2,93 s y 379 ms).
- con 300.000 movimientos de otra tienda en dos años: 1 día 11 ms, 30 días 45 ms (la `120100`: 673 ms), 60 días 164 ms,
  120 días 450 ms.
La primera versión (el nivel más alto) costaba 365 y 393 ms sin historia.

**Cómo se verifica después de pegar** (solo lectura):
`select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and proname like 'fn_bajadas_del_piso%';`
da dos filas: la puerta `34a7e0cc5f421333761e8bda92a582eb` (mide lo mismo tras la parte 1 y tras la 2: solo cambian
sus columnas) y el núcleo `8d38d6dd6c657ab06b2e8a7c0b66a53b` tras la parte 1 y `fcfd2c4b2c4f24dd2184eb2cd7a12678` tras
la 2 (desde la revisión 3, que solo corrigió dos comentarios del cuerpo; antes eran `08bfa7b8d2c90eaed85a5c4366a21db4`
en la revisión 2 y `94d587570d8db50cf69c9b6bd982a01e`, y ninguno de los dos se pegó). Y la consulta de (e) devuelve las columnas `retiradas_en_ventana`, `cantidad_efectiva` y `es_carga_inicial`.

**Lo que hereda el paso 3:** el indicador de confianza (`fn_confianza_registro`) divide por Σ `cantidad_efectiva`, no por
Σ `cantidad`, y deja fuera las filas `dudosa`, `corregida` y `es_carga_inicial`, además de las que no están cerradas.
Hereda también dos límites de «Límites»: con la regla decidida del piso de antes, el indicador puede esconder alguna
tardía (T30, T32) y nunca inventa una por corregir; y una fila «cerrada» todavía puede cambiar hasta 2W después de la
bajada (T33): si la cifra no debe moverse, que cuente solo las bajadas de hace más de 2W.

**Revisión 4 del 2026-09-27 (mutantes, después de pegar; la prueba, no la función).** De los 13 cambios que seguían
pasando en la revisión 3, **4 ya hacen fallar la prueba y 9 son equivalentes** (no cambian ninguna fila posible). Casos
nuevos en `frescura_bajadas.mjs` (**166 verificaciones**): **T34** (dos cargas de la misma prenda a 5 minutos, cada una con
su bajada, salen las dos marcadas: mata el `max` en vez de `min`; un ajuste «carga_inicial» del mismo instante no marca:
mata «sin exigir `tipo = 'entrada'`»), **T35** (tres bajadas del mismo instante salen por id: mata `id desc`) y **T36**
(una merma del piso con el almacén como destino suelto no es retiro, y una recepción al almacén con el piso como destino
suelto no se lleva un retiro: mata «sin `fn_es_traslado_interno`»; la base acepta esas filas). Los 9 equivalentes, con su
razón en la cabecera del script: el «después» desde el mismo instante, la bajada que va a su `t_antes`, la carga contada
con `max` en `[t − W, t]` (la revisión 3 creía que hacían falta dos cargas: no alcanza), la rama con retiros elegida por
prenda, `< v_hasta + 2W` en vez de `<=`, sin excluir la centinela (el libro no la reconstruye), sin `ord = 1`, y sin el
punto del libro en `juntas` o sin `es_bajada` (se cubren entre sí por el CHECK `cantidad > 0`). Además de los argumentos,
un diferencial al azar (8 historias densas × 100 rangos) da 0 lecturas distintas de 800 para cada equivalente, y ve a los
4 que ahora mueren (80 a 680 de 800). En producción (solo lectura): 69 pares de traslados internos en el mismo instante
(el orden de T35 pasa de verdad), las 64 filas `carga_inicial` son entradas, ninguna carga repetida a 10 minutos, ninguna
fila con destino suelto. T34 y T36 describen estados que hoy solo se arman a mano.
- **Lo que no se hizo (es de Felipe):** la base acepta un `sububicacion_destino_id` en una fila que no es traslado, y
  nadie lo lee. Un CHECK (`tipo = 'traslado' or sububicacion_destino_id is null`) haría imposible ese estado; es un
  cambio de esquema de producción.

### Paso 3 construido (2026-09-27): la lectura de una sede y el indicador de registro

**Estado:** construido en la rama `claude/frescura-3c-lectura`, **sin pegar en producción** (las tres funciones no existen
allá; consulta de solo lectura del 2026-09-27). Se pega `20260928120300_frescura_lectura.sql` sola en el SQL Editor, a
cualquier hora (solo `create or replace function`, `revoke` y `grant`: sin políticas, sin `drop trigger`, sin `alter`), y
DESPUÉS `20260928120310_frescura_lectura_revision3.sql`, también sola (las correcciones de la revisión 3; ver «Revisión 4
del paso 3»).
Ninguna pantalla la llama todavía: la web que la usa es la del paso 4. *El PR #542 llevó a main la versión de la
integración; las revisiones 3 a 6 van en el PR #544. Los md5 esperados, lo que queda para el paso 4 y los hallazgos que
siguen abiertos: «Cierre del paso 3», al final.*

**Qué hay.**
- `retail.fn_es_llegada(tipo, motivo, lote, producción, recepción)`, `immutable`, sin EXECUTE para nadie de afuera: el
  predicado de «llegada» que vivía dentro de `fn_resumen_comparacion` (`20260924030000`), con nombre propio. La prueba lo
  LEE del cuerpo vivo de esa función y lo compara: 0 diferencias en las 160 filas del seed y en 560 combinaciones.
- `retail.fn_frescura_sede(p_ubicacion_id, p_dias default 120) → jsonb`, `security definer`, `stable`, plan a medida.
  Candado: `fn_es_lider() and fn_puede_operar_ubicacion(p)`; si no, `P0001` con la pista `frescura_sin_permiso` (el
  módulo `frescura` nace con la pantalla, decisión 4 del plan). Una llamada a `fn_ledger_puntos` (la lista nunca nula) y
  una a `fn_bajadas_del_piso_nucleo`. El Taller, una tienda inactiva, sin almacén, nula o inexistente → `{"separa_piso":
  false}`.
- `retail.fn_confianza_registro(p_ubicacion_id default null, p_meses default 2)`: por tienda y mes de Lima, `filas`,
  `unidades` (Σ `cantidad_efectiva`), `tardias`, `confianza = 1 − tardías ÷ unidades` (4 decimales; nula sin unidades) y
  `nivel` por filas (1-9 `pocos_datos`, 10-19 `aceptable`, 20+ `solido`). Fuera: no cerradas, `dudosa`, `corregida`, carga
  inicial y las de hace menos de 2W (T33: la cifra no se mueve después de mostrarse). **Sin `persona_id`.** Candado:
  `fn_es_lider()`; con tienda, además operarla. `p_meses` de 1 a 3.
- Web: `lib/frescura-reglas.ts` (puro: Kaplan-Meier con P50/P75/P90, ventana de 30 a 120 días, niveles, reloj de
  novedad, rapidez, `estaQuieta`, estado cerrado de cada prenda, cifras de la sede, referencia de CAYLA y la vuelta del
  líder `armarFrescuraLider`, con la RPC inyectada); `lib/frescura.ts` (solo dice a quién preguntar: tiendas activas y
  `supabase.rpc`); `lib/prenda-clave.ts` (la clave modelo+color en un solo lugar, que Análisis ahora usa); tipos a mano en
  `packages/database`. El FIFO sigue siendo uno solo: `historiaDeCohortes`.

**El contrato** (el jsonb): `{separa_piso, desde, ahora, prendas[], eventos{variante: [[ts, delta, marcas, oid]]},
tardias[{oid, variante_id, bajada_en, unidades_tardias}], dudosas[]}`. Cada prenda: `variante_id, producto_id,
producto_nombre, codigo, color_codigo, color_nombre, talla, categoria_id, categoria_nombre, temporada, temporada_origen,
es_clasico, fin_estacion, en_estacion_ahora, primera_exhibicion, ultima_llegada, piso_hoy, almacen_hoy`. Marcas: 1 venta,
2 interno (piso ↔ almacén o cuarentena), 4 edad desconocida (saldo inicial positivo, entrada al piso que no es interna ni
llegada, bajada de la carga inicial: la carga por la puerta real llega con 6).
- **Cómo se vigila que las dos mitades hablen lo mismo:** `apps/web/lib/__fixtures__/frescura-sede.json` es la salida
  REAL de las dos funciones sobre una tienda sembrada (caso T13 de `frescura_lectura.mjs`: 12 modelos que hacen la vara
  de las blusas, una nueva en tres tallas, una vieja de 40 días, la carga inicial, una tardía, un retiro, una dudosa, una
  solo en almacén, una chompa de invierno, un clásico y una sin temporada). `frescura-contrato.test.ts` (18 pruebas)
  exige que la web la lea ENTERA (ninguna prenda, evento, tardía ni fila perdida; cada marca en su bit) y que diga de cada
  prenda lo que su historia dice; T13, en el CI de SQL, exige que la salida de hoy tenga la misma forma (claves y tipos)
  que ese archivo. Cambiar el contrato de un lado sin el otro rompe una de las dos. Se rehace con
  `FRESCURA_FIXTURE_ESCRIBIR=1 pnpm pruebas:frescura-lectura`. Probado a propósito: renombrar `talla`, `oid` o `mes`, o
  leer la marca 4 en otro bit, hace fallar la prueba de la web.
- **Un cambio de la integración:** la vuelta del líder (una lectura por tienda en paralelo + una confianza, cada bloque
  con su aviso, la referencia de CAYLA que no se arma a medias) pasó de `frescura.ts` a `armarFrescuraLider` en
  `frescura-reglas.ts`, con la RPC como parámetro: `frescura.ts` importa Supabase por el alias `@/`, que vitest no
  resuelve, así que esa lógica no se podía probar con la salida real. Ahora se prueba con ella, también sus caídas (sin
  permiso, respuesta con otra forma, la base que no responde, el Taller).

**Cifras.**
- Pruebas: `frescura_lectura.mjs` **109** (T0 a T13); `frescura_bajadas.mjs` 166; vecinas sin cambios (`bajada_al_piso`
  51, `fn_ledger_fuente_unica` 48, `una_sola_firma` 2, `temporadas` 25, `roles_por_modulo` 70, `roles_cobertura_modulos`
  31, `actor_firma_las_operaciones` 30, `reposicion_piso_cerrada` 10, `mover_interno_marca` 12, `alta_con_stock_inicial`
  28), cada una sobre una base nueva con todas las migraciones. Web: `frescura-reglas.test.ts` 68 y
  `frescura-contrato.test.ts` 18; vitest completo 205 archivos, 78.384 pruebas.
- Mutación sobre el SQL: 22 cambios a propósito, los 22 hacen fallar la prueba.
- Costo (Postgres 17 desechable; una tienda, 2.000 prendas en 200 modelos con temporada, 20.000 bajadas, 10.000 ventas):
  `fn_frescura_sede` a 120 días **733 ms** (722-757; el núcleo ~330 y el libro ~180), 3,9 MB de jsonb entre la base y el
  servidor; a 30 días 205 ms. `fn_confianza_registro` 126 ms (una tienda) y 127 ms (todas). La lógica en TypeScript, 110
  a 150 ms por sede con esa carga (el plan estimaba 30): no quiebra el límite de 1 s por sede.
- **En producción (ensayo de solo lectura, el cuerpo como `select` sobre Tienda TRU, sin crear nada):** 89 prendas (45
  en el piso, 50 con almacén; 44 modelo+color); 21 con edad desconocida, todas en el piso (107 de 211 unidades: 95 de la
  carga inicial, 12 de ajustes); **89 de 89 sin temporada**, 0 con temporada pasada; 1 tardía, 0 dudosas. Confianza de
  septiembre: 25 bajadas, 104 unidades, 1 tardía (0,9904, `solido`); con la carga inicial habrían sido 40 y 199.

**Límites** (fijados en las pruebas o vistos en la salida real; se deciden en la maqueta del paso 4):
- **Sin «llegada», nunca «Temporada pasada».** En TRU, 34 de las 89 prendas entraron por ajustes «reposicion» y
  «conteo_fisico» al almacén: aunque les pongan temporada, `fin_estacion` queda nulo. El plan hablaba de una «llegada
  estimada» (la primera entrada); no se hizo, y si se quiere va como campo aparte (`llegada_estimada`), no cambiando en
  silencio lo que significa `ultima_llegada`.
- **Con la curva sin P50, lo más viejo de una categoría lenta sale «Nueva».** Un corte que la curva no alcanza queda
  después de su observación más larga, y toda prenda antes de ese punto tiene tramo: en la salida real, la chompa de
  invierno lleva 39 días colgada y sale «Nueva» (su categoría vendió 1 de 6, `pocos_datos`). Es honesto (menos de la
  mitad se vendió en 39 días), pero en la pantalla se lee como «recién llegada»; con 7 ventas en producción va a ser lo
  común al principio. La maqueta tiene que decidir si «Nueva» con `pocos_datos` se dice distinto. *Corregido en la
  revisión 3 (abajo): sin P50 no hay tramo, «aún sin referencia», como dice la decisión 6.*
- **La rapidez con pocos datos se compara contra sí misma.** La misma chompa tiene índice 100 porque es casi toda la curva
  de su categoría: queda como «pilar», no va a «por decidir» aunque su temporada pasó, y el aviso «Temporada pasada» sale
  sin sugerencias. *Corregido en la revisión 3: la rapidez se mide contra el resto de su categoría, y la temporada
  pasada sugiere «retirar» aunque sea un pilar.*
- **Lo que solo está en el almacén** viaja sin eventos y sale con estado «Nueva» y 0 segundos (no pesa en las cifras del
  piso). La pantalla la filtra o la nombra aparte; el tipo cerrado no tiene un estado «nunca colgada».
- Los clásicos solo traen «fuera de su estación» y «guardar hasta su estación»: todavía no se comparan contra su propia
  historia.
- `en_estacion_ahora` es «hoy cae en alguna aparición de su temporada», no en la de su última llegada. Una variante
  inactiva con stock, sin ninguna activa en su modelo+color, sale sin temporada (`fn_temporada_efectiva` solo mira
  activas). *Lo de la variante inactiva, corregido en la revisión 3 (`fn_temporada_efectiva_nucleo`).*
- Hoy un líder opera todas las sedes, así que «líder de otra sede» no se puede armar con datos: la prueba reemplaza
  `fn_puede_operar_ubicacion` dentro de su transacción para vigilar que el candado la pregunte.

**Lo que queda para el paso 4 (la pantalla):** la maqueta primero (colores, frase de acción, cómo se dicen «Nueva con
pocos datos», «nunca colgada» y la temporada pasada de un pilar); el módulo `frescura` (migración propia con
`insert into retail.modulos`, orden 215, sin `rol_modulos`, ADR-0161) y su fila en `lib/modulos.ts`; el candado de
`fn_frescura_sede`, `fn_confianza_registro` y `fn_bajadas_del_piso` pasa de «líder» a «ve Frescura y opera la sede»
(`persona_id` solo para el líder); el menú (directo en Inventario, 6.ª fila, con `EXCEPCIONES_TOPE_HIJAS`); la ruta
`/inventario/frescura` con `exigirModulo("frescura")`, `loading.tsx` con `<EsperaPantalla/>`; y verificar en TRU como
líder, en escritorio y a 375 px.

### Revisión 3 del paso 3 (2026-09-27): lo que se corrigió y lo que queda para Felipe

Tres revisores (SQL, reglas, pruebas) encontraron 16 problemas, todos confirmados ejecutando. Se arreglaron con una
prueba que falla con el código de antes (o con el cambio a propósito que la dejaba pasar) y pasa con el de ahora. Nada
de esto está en producción: la migración sigue sin pegar y se corrigió en su lugar (sus md5 cambiaron en la guarda). *Eso
fue un error: `20260928120300` ya estaba en main con la orden de pegarla. Las correcciones pasaron a su propio archivo,
`20260928120310_frescura_lectura_revision3.sql`, y `20260928120300` volvió a ser la de main («Revisión 4 del paso 3»).*

**Qué cambió en la base (hoy en `20260928120310_frescura_lectura_revision3.sql`):**
- `fn_confianza_registro` ya no cuenta las bajadas de productos `es_prueba` (fn_frescura_sede ya los sacaba). Una
  bajada de práctica tardía ponía la confianza del mes en 0 (T10b).
- **`primera_exhibicion` es del modelo+color, no de la talla** (cambia lo que significa el campo, no su forma): la
  primera vez que CUALQUIER talla de ese modelo+color entró al piso de la tienda, esté o no en la lista. Antes, si la
  talla S se colgó hace 149 días y se agotó antes de la ventana, y la M se colgó hace 10, la S no llegaba (sin stock ni
  movimiento en la ventana) y la prenda volvía a ser «Nueva»; repuesta en la MISMA talla, no. La novedad es del
  modelo+color (decisiones 4 y 9), así que el dato también (T2d).
- **La temporada incluye lo descontinuado.** `fn_temporada_efectiva` solo mira variantes activas (es la lista de lo que
  se puede completar); una talla desactivada con stock perdía su temporada, nunca avisaba «Temporada pasada» y pedía
  completar una temporada que ya tenía. La regla (color → producto → categoría) pasó a `fn_temporada_efectiva_nucleo(p,
  p_con_inactivas)`, y `fn_temporada_efectiva(p)` la envuelve con `false`: misma firma, mismas filas (la prueba lo
  compara en todo el catálogo), mismos permisos, y la regla sigue en UNA función (ADR-0246). Frescura llama al núcleo con
  `true` (T4d). La guarda exige que `fn_temporada_efectiva` tenga su cuerpo de `20260928100000` (1cc652ba…, el mismo que
  producción el 2026-09-27) o el nuevo.
- Costo con la carga sintética: 754 ms a 120 días (antes 733), 233 ms a 30; la confianza, 128-140 ms.

**Qué cambió en la web (`lib/frescura-reglas.ts`):**
- **Una bajada tardía ya no deja a la prenda sin «Nueva».** Sus unidades siguen saliendo de la vara (`excluirTardias`),
  pero la tardía no es «edad desconocida»: ADR-0248 (decisión 3) enumera qué lo es (saldo inicial, entrada al piso que no
  es interna ni llegada, bajada de la carga inicial) y la tardía no está. Marcarla «al menos» dejaba sin «Nueva» para
  siempre al fardo nuevo que se vende a los 3 minutos y, antes del 3b, a lo traído a pedido; en TRU, la única tardía es
  justo la primera bajada de su modelo+color. `relojNovedad` ya no recibe las tardías.
- **Sin P50 no hay tramo** («aún sin referencia», con el % vendido que ya trae `VaraCategoria.vendidoAlFinal`, como dice la
  decisión 6). Antes toda prenda con edad conocida de una categoría que no vendió la mitad salía «Nueva», aunque llevara
  60 días sin vender una, y con nivel «Sólido». La regla «antes de `tMax`» queda solo para P75 y P90 cuando hay P50.
- **La rapidez se mide contra el RESTO de su categoría** (`curvaSin`, restando instante por instante, sin reordenar).
  Con la prenda adentro, la identidad de Nelson-Aalen daba 100 exacto a la única prenda de su categoría: «pilar» siempre,
  nunca «quieta», aunque fuera Crítica. Si el resto no vendió a esas edades, la rapidez es «sin dato» → «revisa sus
  ventas», nunca «pilar».
- **La temporada pasada sugiere «retirar» aunque la prenda sea un pilar** (con algo en el piso): ADR-0246, decisión 10,
  y el ejemplo del bikini que se vende bien hasta el 20 de marzo.
- Pruebas nuevas que vigilan lo que ningún caso vigilaba: la repuesta a través del borde de la ventana (T2b y su gemela en
  la web), piso + almacén + cuarentena (T2c), la última llegada en una aparición ANTERIOR de su temporada (T4c), el mes de
  Lima con la sesión en UTC como producción (el preludio de la prueba ahora corre en UTC; T10c y la lectura del texto en
  T0), las dos tallas con llegadas de estaciones distintas, la talla dudosa en una prenda de dos tallas, la ventana de la
  rapidez igual a la de la vara, y una respuesta sin `separa_piso` que nunca se lee como «el Taller».
- Cifras: `frescura_lectura.mjs` 132 (antes 109); `frescura-reglas.test.ts` 80 y `frescura-contrato.test.ts` 18; vitest
  completo 205 archivos, 78.396 pruebas; vecinas sin cambios (`temporadas` 25, `frescura_bajadas` 166, `roles_por_modulo`
  70, `roles_cobertura_modulos` 31, `una_sola_firma` 2, `fn_ledger_fuente_unica` 48, `bajada_al_piso` 51,
  `alta_con_stock_inicial` 28, `actor_firma_las_operaciones` 30, `reposicion_piso_cerrada` 10, `mover_interno_marca` 12,
  `fn_resumen_comparacion` 25). Mutación: 9 cambios a propósito en el SQL y 11 en la web; todos hacen fallar la prueba (y el código de antes falla 3 casos SQL y 11 de la web).
  El archivo de la web (`__fixtures__/frescura-sede.json`) se rehízo con la salida nueva.

**Decisiones pendientes para Felipe** (no se tocaron: son reglas del negocio, no del código). **Las cuatro, DECIDIDAS el
2026-09-27** (las 1 y 2 por Felipe, las 3 y 4 técnicas): ver «Revisión 5 del paso 3».
1. **¿Un traslado entre tiendas es «llegada» para la temporada?** *DECIDIDA (Felipe, 2026-09-27): no; la temporada
   cuenta desde que la prenda llegó a CAYLA (`fn_es_llegada_a_cayla`, `ultima_llegada_cayla`).* Hoy `fin_estacion` sale de la última llegada a la
   TIENDA, y la recepción de un traslado cuenta (el predicado es el de Análisis, donde «entradas» es lo que recibió la
   sede). La chompa que llegó del proveedor en julio de 2025 y se trasladó en abril de 2026 queda con el fin del invierno
   2026: la tienda que la recibe no ve «Temporada pasada» hasta setiembre, justo cuando se trasladó para liquidarla.
   Recomendación del revisor: para la temporada, la última llegada a CAYLA (lote, producción o carga inicial, en
   cualquier tienda), con un segundo predicado de nombre propio; `fn_es_llegada` no se toca.
2. **¿Un pilar de venta de temporada pasada entra en «Por decidir»?** Hoy no (un pilar nunca va al perchero), pero ya
   recibe «retirar». El plan dice las dos cosas. *DECIDIDA (Felipe, 2026-09-27): sí, con su propia sugerencia
   («sigue vendiendo: decide si la dejas hasta agotar o la retiras»), nunca «trasladar» ni «rebajar».*
3. **«Colgada 100 días sin vender en una categoría que rota en días»**: hoy dice «revisa sus ventas» (en la ventana de 30
   días de la vara su edad es desconocida, así que su rapidez es «sin dato») y no «por decidir». Lo decide la ventana de
   la vara y no estaba escrito. *DECIDIDA (técnica, 2026-09-27): va a «Por decidir»; la rapidez se mide con toda la
   lectura (hallazgo 1 de la revisión 5).*
4. **Una prenda sin tramo (categoría sin P50) no recibe sugerencias** aunque lleve 60 días sin vender una: la maqueta
   del paso 4 decide cómo se dice «aún sin referencia» y si esa prenda merece un «revisa sus ventas». *DECIDIDA (técnica,
   2026-09-27): la recibe si lleva 30 días o más colgada sin ninguna venta en los últimos 30 (la regla «callada»).*

### Revisión 4 del paso 3 (2026-09-27): la migración partida en dos, la rapidez de lo que vino en la carga y los tramos «al menos»

Tres revisores (SQL, reglas, pruebas) encontraron 10 problemas, todos confirmados ejecutando. Cada arreglo lleva una
prueba que falla con el código de antes (o con el mutante que la dejaba pasar) y pasa con el de ahora. Nada de esto está
en producción; consultado con un `select` el 2026-09-27: ninguna de las funciones del paso 3 existe y
`fn_temporada_efectiva` tiene su cuerpo de `20260928100000` (`1cc652ba…`).

**La migración, partida en dos (hallazgo 1).** La revisión 3 corrigió `20260928120300` editándola en su lugar, pero el PR
#542 ya la había llevado a main con la orden de pegarla (en el BACKLOG de main, con los md5 viejos). Quien siguiera esa
orden dejaba producción con los errores de la revisión 3, y la versión corregida ya no entraba: su guarda veía un cuerpo
que no conocía y abortaba con «alguien la cambió en vivo», cuando era la versión anterior del mismo archivo. Además, una
base local que ya corrió `20260928120300` no vuelve a ejecutar el archivo editado. Ahora:
- `20260928120300_frescura_lectura.sql` es exactamente la de main (md5 del archivo `40bf970f…`).
- `20260928120310_frescura_lectura_revision3.sql` trae las correcciones (`fn_temporada_efectiva_nucleo`, el envoltorio de
  `fn_temporada_efectiva`, `fn_frescura_sede` y `fn_confianza_registro`, con los mismos cuerpos que la revisión 3). Su
  guarda pide `20260928120300` ya pegada (`fn_es_llegada` `5089ba50…`, y las dos lecturas presentes) y, para cada función
  que reescribe, acepta solo dos cuerpos: el de `20260928120300` (`644e1012…`, `9c714f98…`; `1cc652ba…` para
  `fn_temporada_efectiva`) o el suyo. Se puede pegar dos veces. Al revés también es seguro: con ella pegada, volver a pegar
  `20260928120300` aborta y no deshace nada.
- La prueba T12b parte del estado real de producción y lo recorre: la de main entra, la corregida entra encima, la de main
  otra vez aborta, y sin la de main la corregida la pide. Con la corrección editada en el mismo archivo, T12b falla en 5
  verificaciones. Regla que queda: **una migración que ya está en main no se edita; la corrección va en un archivo nuevo
  cuya guarda acepta el cuerpo anterior** (como `20260928120200` con `20260928120100`).

**Qué cambió en la web (`lib/frescura-reglas.ts`):**
- **La rapidez es «sin dato» si alguna venta de la ventana salió de lo que tiene edad desconocida** (hallazgo 2).
  `historiaDeCohortes` le da las ventas a la cohorte más vieja: una talla de la carga inicial que se repone vende primero
  lo de la carga, y las unidades repuestas (con edad conocida) parecían sin vender. La rapidez salía 0, «lenta», y la
  prenda iba a «Por decidir» con «Trasladar», justo lo que prohíbe la corrección 4 del plan. Dos gemelas con la misma
  historia física: K (todo con edad conocida) sale Crítica con rapidez 125, un pilar; U (la primera bajada de la carga)
  salía rapidez 0 con [cambiar_lugar, trasladar] y ahora sale sin dato, con «revisa sus ventas». `unidadesParaVara`
  (reemplaza a `observacionesDe`) devuelve, además de las unidades con edad conocida, cuántas ventas salieron de lo
  desconocido; `rapidez` recibe ese número. En TRU (select del 27-sep) hay 21 tallas con unidades de edad desconocida en
  el piso: la primera reposición de cualquiera lo habría disparado.
- **«Trasladar» exige «Sólido» en la referencia que de verdad midió la rapidez** (hallazgo 3): 20 o más ventas del RESTO
  de su categoría (`Rapidez.referencia`, que sale de `curvaSin`). La vara cuenta las ventas de la propia prenda: la
  falda que es 28 de las 30 ventas de su categoría tenía vara «Sólido» y se medía contra 2. Ahora recibe solo
  «cambiar de lugar». En TRU, 5 de las 8 categorías con stock tienen 1 o 2 modelo+color.
- **Sin el corte siguiente, el tramo que ya pasó, como piso** (hallazgo 4, parte b): si falta P75 o P90 y la prenda ya
  pasó todo lo que la curva vio (`tMax`), se sabe igual que pasó el corte anterior. Antes salía «aún sin referencia»
  (null) y sin ninguna sugerencia; ahora es, por ejemplo, «al menos Envejecida» (`estado.alMenos`) y, si es vieja y sin
  dato de rapidez, «revisa sus ventas». Es el caso de la prenda de la carga inicial, que siempre tiene el reloj más largo.
  `tramoDe` devuelve `{ tramo, alMenos }`; `sin_vara` queda solo para la categoría sin P50. `estado.alMenos` pasa a decir
  «el tramo es un piso» (por el reloj o por la curva).
- **Tolerancia y reloj en milisegundos enteros** (hallazgo 5). El reloj sumaba tramos ya divididos entre 1000 y la
  exposición de la unidad colgada era una sola resta: en 293 de 2.000 historias al azar el reloj de la prenda más vieja
  quedaba 1e-11 arriba de `tMax` y salía «aún sin referencia» en vez de «Vigente». `relojNovedad` suma en milisegundos
  y divide una vez, y `tramoDe` compara con 1 microsegundo de tolerancia hacia los dos lados (`tMax` y los cortes).
- Pruebas nuevas (mataban mutantes vivos): el corte exacto con S = 0,5 y 0,25 (w15), el borde `segundos = tMax` (w20),
  `curvaSin` con las unidades propias desordenadas como vienen del FIFO (x20), el reloj exacto con horas con
  milisegundos, y las historias de las gemelas, la falda, el pantalón de la carga y la prenda más vieja por `analizarSede`.
  En SQL: la talla cuyo único movimiento de la ventana es la venta o un ajuste negativo (T2e, T2f; mutantes m01 y m02: sin
  ella, un modelo de 110 días colgado parecía recién llegado), el almacén → cuarentena que no es exhibición (T2g, p07), la
  última llegada de ESTA tienda (T4e, m50: un lote de Trujillo movía el fin de estación), y tres casos de borde (T7b, T9b,
  T9c).
- Cifras: `frescura_lectura.mjs` 152 (antes 132); `frescura-reglas.test.ts` 94 (antes 80) y `frescura-contrato.test.ts` 18;
  vitest completo 205 archivos, 78.410 pruebas; vecinas sin cambios (`temporadas` 25, `frescura_bajadas` 166,
  `fn_resumen_comparacion` 25, `roles_por_modulo` 70, `roles_cobertura_modulos` 31, `fn_ledger_fuente_unica` 48,
  `bajada_al_piso` 51). El código de antes falla 22 pruebas de la web; cada mutante (w15, w20, x20, el reloj por tramos y
  la tolerancia quitada) hace fallar al menos una; los mutantes SQL m01, m02, m50 y p07 hacen fallar su caso nuevo.

**Decisiones pendientes para Felipe** (no se tocaron; se suman a las cuatro de la revisión 3). **Las dos, DECIDIDAS el
2026-09-27 (técnicas): ver «Revisión 5 del paso 3».**
5. **¿El tramo de una prenda se mide contra su categoría SIN ella, como ya se mide su rapidez?** Hoy los cortes (P50, P75,
   P90 y `tMax`) incluyen las unidades de la propia prenda, y dos casos quedan mal: el pantalón de 70 días con 0 de 3
   vendidas (edad conocida) sale «Vigente», porque sus 3 unidades sin vender llevan el P50 de su categoría de 10 a 30 días
   y borran el P75 (sin ella: P50 10, P75 30, y sería «al menos Envejecida» y, lenta, «por decidir»); y la falda que es 28
   de las 30 ventas de su categoría sale Crítica contra un P90 de 67,5 días que puso ella misma. Recomendación: sí.
   Ganas: lo más quieto de cada categoría deja de esconderse detrás de sus propias unidades. Pagas: cada prenda se juzga
   con cortes un poco distintos de los que la cabecera de su categoría muestra (hay que decirlo en la pantalla) y una
   curva por prenda (medir antes de publicar). La prueba «PENDIENTE DE FELIPE: el pantalón de 70 días…» documenta lo de
   hoy. Si no responde, el paso 4 lo construye así y la maqueta lo muestra para que lo objete. *DECIDIDA (2026-09-27):
   sí, construido en la revisión 5; esa prueba ahora exige «al menos Envejecida» y «Por decidir».*
6. **«Al menos Vigente» sin dato de rapidez no recibe «revisa sus ventas».** El pantalón de la carga inicial (70 días,
   nada vendido) en una categoría cuyo P75 no existe sale «al menos Vigente» y sin sugerencia: «revisa sus ventas» hoy
   es solo para Envejecida y Crítica. Recomendación: que un tramo «al menos» sin dato también la reciba. *DECIDIDA
   (2026-09-27): la recibe, junto con la 4, bajo la regla «callada».*


### Revisión 5 del paso 3 (2026-09-27): los cinco hallazgos que quedaban y las seis decisiones

Cinco hallazgos de la revisión anterior (uno de la regla, tres de pruebas de SQL que faltaban y uno de la web) y las seis
decisiones pendientes de las revisiones 3 y 4, dos de Felipe y cuatro técnicas. Cada cambio lleva una prueba que falla con
el código de antes (o con el cambio a propósito que la dejaba pasar) y pasa con el de ahora. Nada de esto está en
producción: consultado con un `select` el 2026-09-27, ninguna función del paso 3 existe y `fn_temporada_efectiva` sigue
con su cuerpo de `20260928100000` (`1cc652ba…`). La base va en `20260928120310_frescura_lectura_revision3.sql`, editada
en su lugar (no está en main ni en producción); `20260928120300` no se toca.

**Los cinco hallazgos.**
1. **La rapidez se mide con las unidades de TODA la lectura** (`lib/frescura-reglas.ts`, `analizarSede`). Se medía con
   las unidades recortadas a la ventana de la vara, y el recorte convertía en «edad desconocida» lo que ya estaba colgado
   al empezar esa ventana: la prenda colgada hace 60 días que vendió 2 en la ventana de 30 salía «sin dato». ADR-0248
   solo reconoce como desconocido el saldo con que arranca la LECTURA, la carga inicial y los ajustes. La vara de la
   categoría no cambia (sigue en su ventana); cada talla guarda sus unidades de la lectura entera (`todas`) además de las
   de cada ventana, y si la ventana cubre la lectura son el mismo objeto. Prueba: «la venta de lo que YA colgaba al empezar
   la ventana de la vara…» (antes, rapidez nula; ahora 2 vendidas contra 25 del resto) y la del saldo de la lectura, que
   sigue sin dato.
2. **`piso_hoy` y `almacen_hoy` son solo de ESTA tienda**: T2h (la misma talla con 3 en el piso y 1 en el almacén de
   Trujillo no suma). El cambio a propósito que quita `s.ubicacion_id = p_ubicacion_id` la hace fallar (`piso=5,alm=1`).
3. **`fn_temporada_efectiva` sigue `security definer`**: T4g la llama como `authenticated` (líder e integrante) de las dos
   formas en que la usa la web (`catalogo-v2.ts`: la ficha con `p_producto_id` y la lista paginada de /productos sin
   argumentos). Lleva su propio control: con `security invoker`, dentro de un savepoint, da 42501 (el envoltorio llama al
   núcleo, que nadie de afuera puede ejecutar).
4. **`fn_confianza_registro` cuenta las tardías en UNIDADES**: T10d, una bajada de 3 con 2 tardías y otra normal de 3 = 2
   filas, 6 unidades, 2 tardías, 0,6667 (contando filas tardías daría 1 y 0,8333: el cambio a propósito lo muestra).
5. **Las ventas sin edad de OTRA talla del mismo modelo+color dejan la rapidez sin dato** (E-Y08): el modelo con la talla
   conocida primero (L, 4 repuestas sin vender) y la carga inicial en la S (10 vendidas) no queda «lenta» ni recibe
   «Trasladar». Ya pasaba con el código de antes; la prueba vigila el cambio a propósito que suma solo las de la primera
   talla.

**Decisión 1 (Felipe): la temporada de una prenda cuenta desde que LLEGÓ A CAYLA.**
- **DECIDÍ:** `fin_estacion` sale de la última llegada A CAYLA de su MODELO+COLOR (cualquier talla, activa o no, en
  cualquier sede): lote o recepción de compra, producción del Taller o carga inicial. Predicado nuevo con nombre propio,
  `retail.fn_es_llegada_a_cayla(tipo, motivo, lote, producción, recepción)` = `fn_es_llegada(...)` y sin recepción de
  traslado (immutable, sin `search_path` propio para que se expanda en la consulta, sin EXECUTE para nadie de afuera).
  `fn_es_llegada` no se toca (es el predicado de Análisis). La lectura trae un campo nuevo, `ultima_llegada_cayla` (en la
  web, `ultimaLlegadaCayla`); `ultima_llegada` sigue siendo la de esa talla a esa tienda, con la recepción de un traslado.
  La novedad («Nueva») sigue siendo por tienda (decisión 9). `en_estacion_ahora` no cambia: no depende de ninguna llegada.
- **DESCARTÉ:** seguir con la última llegada a la tienda, porque la chompa que llegó del proveedor en julio de 2025 y se
  trasladó en abril de 2026 para liquidarla quedaba con el fin del invierno 2026 y no avisaba «Temporada pasada» hasta
  setiembre, justo en la tienda que la recibió para sacarla. Y descarté reescribir la lista de llegadas en el predicado
  nuevo: se escribe como `fn_es_llegada` menos la recepción, así una llegada que se agregue allá (con su prueba contra
  Análisis) la hereda la temporada.
- **SE ROMPE SI** la mercadería que llega de afuera entra por una puerta que no deja lote, producción ni `carga_inicial`
  (hoy, los ajustes «reposicion» y «conteo_fisico» de TRU): ese modelo+color no tiene llegada a CAYLA y nunca avisa
  «Temporada pasada», tampoco en la tienda que lo recibe trasladado (antes, la recepción le daba un fin). Y si el Taller
  repite un modelo+color en su temporada, las unidades viejas de ese modelo+color en otra tienda dejan de avisar hasta el
  fin de la estación nueva: es la regla (el modelo está en temporada en CAYLA), pero la tienda lo va a preguntar.
- Pruebas: T8b (≡ `fn_es_llegada` sin recepción en el seed y en todas las combinaciones, nunca nula, y la tabla de verdad
  escrita a mano), T4f (la chompa trasladada: tienda 2026-04-10, CAYLA 2025-07-15, fin primavera 2025, en sus dos tallas
  aunque la M nunca llegó por su cuenta; la producción del Taller y la carga inicial de Trujillo cuentan; lo solo
  trasladado queda sin fin), T4e cambia (el lote de Trujillo de 2026 ahora SÍ mueve el fin, no la última llegada a la
  tienda), T4 y T13 con el campo nuevo (la chompa M del archivo de la web tiene otro lote en Trujillo: los dos campos
  difieren y `frescura-contrato.test.ts` exige que la web no los cruce). Tres cambios a propósito (predicado sin la
  exclusión, llegada solo de esta tienda, fin desde `ultima_llegada`) hacen fallar T4e, T4f y T8b.
- En producción hoy no cambia nada: el 2026-09-27 las entradas son 64 de carga inicial (33 modelo+color) y 3 de un lote
  (1 modelo+color); ninguna recepción de traslado.

**Decisión 2 (Felipe): un pilar de venta de temporada pasada SÍ entra a «Por decidir».**
- **DECIDÍ:** `estaQuieta` devuelve verdadero con la temporada pasada aunque sea pilar (un pilar sigue sin entrar por
  viejo), y `sugerenciasDe` le da SOLO una sugerencia propia, `sigue_vendiendo` («Sigue vendiendo: decide si la dejas
  hasta agotar o la retiras»): ni «cambiar de lugar», ni «trasladar», ni «retirar» a secas.
- **DESCARTÉ:** dejarlo fuera de «Por decidir» con «retirar» (lo de la revisión 3), porque lo que no está en «Por
  decidir» el líder no lo revisa, y «retirar» era una orden donde hay una decisión (el bikini que se vende bien el 21 de
  marzo puede quedarse hasta agotarse). Y descarté la escalera normal (cambiar de lugar, trasladar): mover lo que se vende
  no tiene sentido.
- **SE ROMPE SI** un pilar por su índice de la lectura entera dejó de venderse en las últimas semanas: igual dice «sigue
  vendiendo». Es raro (el índice cuenta 120 días) y la pregunta sigue siendo la correcta; si pasa, se le suma la
  condición de haber vendido en los últimos 30 días. *No era raro (el éxito que deja tallas sueltas): la condición se sumó en la revisión 6
  (corrección 1).*
- Pruebas: el bikini (quieta, `["sigue_vendiendo"]`, con vara «Sólido», almacén y 20 ventas del resto: todo lo que
  «trasladar» pide), el pilar por viejo sin temporada pasada sigue fuera, y la combinatoria de sugerencias (ningún pilar
  de temporada pasada con algo en el piso recibe otra cosa; nadie más recibe `sigue_vendiendo`).

**Decisión 3 (técnica): «colgada 100 días sin vender en una categoría que rota en días» va a «Por decidir».** Queda
resuelta por el hallazgo 1: con toda la lectura, sus 2 unidades colgadas 100 días esperaban lo que la categoría vende en
días; rapidez 0, Crítica, quieta, «cambiar de lugar» (sin almacén, sin «trasladar»). La prueba que decía «sin dato, no
lenta» ahora exige esto.

**Decisiones 4 y 6 (técnicas): la prenda «callada» recibe «revisa sus ventas».**
- **DECIDÍ:** sin tramo firme (su categoría sin P50, sin ventas en la sede, sin edad conocida, o un tramo «al menos»),
  en el piso, colgada 30 días o más (`DIAS_CALLADA`, la ventana más corta de la vara) y sin ninguna venta de su
  modelo+color en la tienda en los últimos 30: «revisa sus ventas», con o sin dato de rapidez. Nunca queda una prenda
  quieta sin ninguna pista. Si la lectura no cubre 30 días (p_dias < 30), no se sabe y no se sugiere (`ventasRecientes`
  nulo). La web lleva `ventasRecientes` por prenda.
- **DESCARTÉ:** la regla literal sin exigir 30 días colgada, porque marcaba «revisa sus ventas» a lo que se colgó hace 3
  días en una categoría sin P50 (no vendió en 30 días porque no estuvo 30 días). Y descarté exigir «sin dato de rapidez»:
  una prenda sin tramo con rapidez 0 no es «vieja» (no hay tramo), no está quieta y se quedaba sin ninguna pista.
- **SE ROMPE SI** una categoría entera vende por temporadas cortas (un modelo que se vende en diciembre y nada el resto
  del año): en noviembre pide «revisa sus ventas» aunque esté esperando su mes. Hoy la temporada lo explica al lado.
- Pruebas: «al menos Vigente» a los 70 días (antes, ninguna sugerencia), sin tramo, sin ventas en la sede y sin edad
  conocida; y las que NO la reciben (vendió 1 en 30 días, lectura corta, 29 días colgada, sin piso, tramo firme, clásico,
  dudosa).

**Decisión 5 (técnica): el TRAMO se mide contra su categoría SIN la prenda, como la rapidez.**
- **DECIDÍ:** los cortes (P50, P75, P90) y la observación más larga contra los que se ubica cada prenda son los de su
  categoría sin sus unidades (las de la ventana de la vara). La cabecera de la categoría (`VaraCategoria`) sigue
  mostrando la curva completa. `FrescuraPrenda.categoriaSinElla` trae contra qué se midió (cortes, tMax y ventas del
  resto). **Para el paso 4: la pantalla tiene que decir que cada prenda se mide sin ella** (una prenda que es mucho de su
  categoría puede quedar en un tramo que los cortes de la cabecera no explican). La única prenda de su categoría que
  vende queda «aún sin referencia» (sin ella no hay contra qué medirla) en vez de Crítica contra cortes que ella ponía.
- **DESCARTÉ:** los cortes con la prenda adentro, porque lo más quieto se escondía detrás de sus propias unidades: el
  pantalón de 70 días con 0 de 3 vendidas llevaba el P50 de 10 a 30 días, borraba el P75 y salía «Vigente»; ahora es «al
  menos Envejecida», lento y «Por decidir» (la prueba «PENDIENTE DE FELIPE» ahora exige esto). Y descarté rearmar la
  curva del resto por prenda (`kaplanMeier` sobre el resto, un orden por prenda) o guardarla por prenda: guardándola,
  `analizarSede` pasó de 191 a 372 ms en la carga sintética.
- **SE ROMPE SI** una categoría pasa de decenas de miles de ventas en 120 días en una sede con miles de modelo+color: cada
  prenda recorre los instantes con venta de su categoría (lo mismo que ya hacía la rapidez desde la revisión 3). Entonces,
  sumas prefijas por cada «en riesgo» distinto (se descartaron ahora por memoria: crecen con prendas × instantes).
- Cómo se calcula: `contraElResto(curva, propias, suyas)` resta sobre la curva acumulada de la categoría, en una
  pasada por sus instantes con venta y por tramos entre los instantes de la prenda, sin guardar la curva del resto; en
  la misma pasada salen los cortes, la observación más larga, las ventas del resto y lo que espera cada unidad para la
  rapidez. `rapidez(vendidas, esperadas, referencia, ventasSinEdad)` pasa a recibir esas cuentas. `curvaSin` (la curva
  del resto guardada) y `riesgoAcumuladoEn` se borraron: solo las usaban las pruebas, y el candado «probado = en
  pantalla» (`reglas-sin-uso.test.ts`, ADR-0234) no deja exportar una regla que ninguna pantalla usa; las pruebas miden
  ahora el mismo camino que la pantalla. Una prueba de 400 categorías al azar (empates, pesos, unidades sin vender en el
  instante de una venta) exige que `contraElResto` sea `kaplanMeier` del resto (cortes, observación más larga, ventas y
  lo esperado en cada medio día); cuatro cambios a propósito en la resta la hacen fallar.

**Costo (medido el 2026-09-27; Postgres 17 desechable; mediana de 7 corridas en SQL y de 9 en la web).**
- SQL, la carga del paso 3 (una tienda, 2.000 prendas en 200 modelos con temporada, 20.000 bajadas, 10.000 ventas):
  `fn_frescura_sede` 763 ms a 120 días (antes, en la misma base, 759) y 221 a 30 (antes 229). La llegada a CAYLA es una
  búsqueda por índice por modelo+color, como la primera exhibición.
- Web, `leerFrescuraSede` + `analizarSede` sobre la salida real de esa carga (1.006 modelo+color, 2.016 tallas, una
  categoría con 6.604 ventas): **~155 ms** (antes de esta revisión, ~193; con D5 sin optimizar, 372). Sobre la carga de
  `p1/carga.sql` (2.000 tallas de un solo modelo): ~158 ms (antes ~155). Queda en el borde del objetivo de ~150 ms, sin
  quebrar el límite de 1 s por sede. Lo que queda: ~73 ms armar las unidades de cada talla en cada ventana de la vara
  (cuando ninguna ventana alcanza, se arman las cuatro) y ~50 ms la pasada por prenda (medido con un perfil de cada paso).

**Cifras.** `frescura_lectura.mjs` **177** (antes 152); `frescura-reglas.test.ts` **101** (antes 94) y
`frescura-contrato.test.ts` 18; el archivo de la web (`__fixtures__/frescura-sede.json`) se rehízo con la salida nueva.
Con el código de antes fallan 21 pruebas de la web (varias porque `contraElResto` no existía y `rapidez` recibía la
curva) y 14 verificaciones de SQL; los 14 cambios a propósito de la web y los 6 del SQL hacen fallar su prueba.


### Revisión 6 del paso 3 (2026-09-27): el pilar que dejó de venderse, la reposición de lo que vino en la carga, y dos preguntas para Felipe

Tres revisores (SQL, reglas, pruebas) miraron la revisión 5 y encontraron 10 problemas, todos confirmados ejecutando. Ocho
se corrigen (dos reglas de la web y seis pruebas que faltaban), cada uno con una prueba que falla con el código de antes
o con el cambio a propósito que la dejaba pasar. Dos cambiarían una decisión de Felipe (la 1 y la 2 de la revisión 5): no se tocaron y quedan abajo como preguntas, con una
prueba marcada «PENDIENTE DE FELIPE» que documenta lo de hoy. **La base no cambia**: `20260928120310` es la misma de la
revisión 5 (mismos md5). Lo que se agrega son pruebas.

En producción no hay nada de esto (consultado con un `select` el 2026-09-27): de las funciones del paso 3 solo existe
`fn_temporada_efectiva`, con su cuerpo de `20260928100000` (`1cc652ba…`). Tienda AQP y Tienda LIM tienen 0 movimientos y
Tienda TRU 161. De los 34 modelo+color que entraron alguna vez, 33 entraron solo por carga inicial y 1 por lote.

**Corrección 1: el pilar que dejó de venderse ya no es pilar** (hallazgo de reglas). `lib/frescura-reglas.ts`.
- **El problema.** Desde que la rapidez se mide con toda la lectura (A1), un éxito que vendió 14 de 20 en sus 3 primeros
  días y después nada (le quedaron 1 S y 5 L) seguía «más rápido que su categoría» durante los 120 días. Salía Crítica y
  no entraba a «Por decidir» porque era pilar. Tampoco recibía sugerencia, porque su tramo es firme y no contaba como
  callada. Con la temporada pasada le decía «Sigue vendiendo» a algo que llevaba 112 días sin vender. Es lo normal en un
  éxito de moda que deja tallas sueltas, no algo raro.
- **DECIDÍ:** aplicar lo que ya decía el «SE ROMPE SI» de la decisión 2: un pilar tiene que seguir vendiéndose. El tipo
  `Recientes` es ahora la ÚNICA medida de «¿se sigue vendiendo?» (la usan el pilar y la prenda callada):
  - `vendio`: su modelo+color vendió algo en la tienda en los últimos 30 días.
  - `dejo_de_vender`: lleva 30 días o más colgada y no vendió nada en esos 30.
  - `no_se_sabe`: la lectura no cubre 30 días, o no vendió pero lleva menos tiempo colgada.

  `esPilar(rapidez, recientes)` exige índice ≥ 100 y no `dejo_de_vender`. Con dato de rapidez, una prenda es pilar o
  lenta, nunca las dos ni ninguna: `estaQuieta` toma por lenta a la que dejó de venderse. `callada` es `recientes =
  dejo_de_vender` sin tramo firme: la misma cuenta, no una copia. El éxito de las tallas rotas ahora es Crítica, quieta,
  con «cambiar de lugar». Con la temporada pasada recibe «cambiar de lugar» y «retirar», no «sigue vendiendo».
- **DESCARTÉ:**
  - Darle también «revisa sus ventas», porque la escalera ya es una pista, y «revisa sus ventas» quedó para cuando no
    hay dato (decisiones 4 y 6).
  - Medir «reciente» con la vara de su categoría (su P50) en vez de 30 días fijos, porque sería otra ventana distinta
    en cada categoría. Los 30 días son lo que la pantalla ya llama «reciente».
- **SE ROMPE SI** una categoría lenta (P50 de más de 30 días, como un abrigo caro) tiene un pilar verdadero que pasa 30
  días sin vender por azar. Pierde el «pilar» y, si es Envejecida o Crítica, va a «Por decidir» con «cambiar de lugar»,
  que es la sugerencia que no mueve plata. Con 5 unidades en el piso y P50 de 45 días, la chance de 30 días sin una
  venta ronda el 10 %. Si pasa seguido, «reciente» se mide contra lo que la categoría vende en esos días, no contra cero.
  *Revisión 7 (corregido, R7-2): `recientesDe` comparaba con el reloj TOTAL de la prenda, no con lo que estuvo colgada
  en esos 30 días. Un pilar que se agotó (piso en 0, sin poder vender) y se repone quedaba «dejó de vender» apenas se
  colgaba. Ahora son sus últimos 30 días EN EL PISO: ver «Revisión 7 del paso 3».*

**Corrección 2: las ventas de una carga que se agotó antes de la reposición ya no vetan la rapidez** (hallazgo de reglas).
- **El problema.** La rapidez era «sin dato» si había CUALQUIER venta de lo que no tiene edad (carga inicial, ajuste,
  saldo de la lectura) en toda la lectura. La regla nació para las gemelas K y U: la carga y lo repuesto cuelgan juntos y
  el FIFO le da las ventas a la carga. Pero con A1 una venta de la carga de hace 100 días vetaba 120 días la rapidez de lo
  repuesto aunque la carga se hubiera agotado mucho antes. Es el camino normal en producción: carga inicial, se agota, se
  repone por lote. Durante 120 días la reposición nunca salía «lenta» y no llegaba a «Por decidir» ni a «Trasladar».
- **DECIDÍ:** solo cuentan las ventas sin edad hechas DESDE que la prenda (cualquiera de sus tallas) colgó su primera
  unidad con edad conocida en la lectura (`ventasQueEsconden`; `unidadesParaVara` devuelve cada venta sin edad con su
  hora, y `primeraConEdad`). Una venta en el mismo instante en que cuelga lo repuesto también cuenta: ahí tampoco se sabe
  cuál se vendió. K y U siguen sin dato: sus ventas de la carga son posteriores a la bajada de lo repuesto. E-Y08
  también: la S de la carga vende después de que cuelga la L. La reposición de la carga agotada vuelve a ser lenta,
  quieta, con «cambiar de lugar» y «trasladar».
- **DESCARTÉ:** la regla exacta, «mientras había en el piso alguna unidad con edad conocida de la prenda», porque pide
  la historia del FIFO de cada talla en cada instante de las otras tallas: otro recorrido por talla o cambiar el FIFO
  único de `inventario-exposicion.ts`, que es de Análisis también.
- **SE ROMPE SI** (reescrito en la revisión 7; la primera versión hablaba de «otra reposición» y no nombraba la puerta
  más común) una unidad entra al piso sin lote después de que la prenda colgó lo conocido y se revende: una devolución
  (`aprobar_devolucion`), un cambio de talla (`registrar_cambio`, el evento `…:1:4`) o un ajuste «reposicion» al piso
  (TRU ya tiene 6, con 12 unidades). Con esta regla, UNA venta así dejaba sin dato la rapidez de toda la prenda por la
  lectura entera, y «sin dato» no era el lado seguro: el éxito de temporada pasada perdía «sigue vendiendo» y recibía
  «cambiar de lugar» y «retirar». Corregido en la revisión 7 (R7-3): la rapidez se mide contando y sin contar esas
  ventas, y queda sin dato solo si las dos cuentas no dicen lo mismo.

**Las pruebas que faltaban** (hallazgos de pruebas). Cada una mata el cambio a propósito que el revisor dejó vivo:
- **A1, lo que se resta de la curva** (web). La prenda que vendió 4 (o 12) antes de la ventana de la vara y hoy tiene 2
  recién colgadas: índice 147, con las esperadas escritas a mano (2,72). Restando también sus unidades viejas, el índice
  bajaba a 85 y el pilar de 12 iba a «Por decidir».
- **Tardías en la rapidez y en la vara de 120 días** (web): 50 ventas en la categoría y 0 vendidas en la prenda. Sin
  excluir las tardías eran 52.
- **Ventas recientes** (web). Un retiro al almacén no es una venta: la prenda callada sigue con «revisa sus ventas». La
  venta de OTRA talla del mismo modelo+color sí cuenta. Con esto mueren los tres cambios a propósito: cualquier salida
  contada como venta, solo la primera talla y 7 días en vez de 30.
- **D1, la llegada a CAYLA es del modelo+color** (SQL, T4h). El color que llegó en 2025 conserva la primavera 2025 aunque
  otro color del mismo modelo llegara en 2026.
- **`fn_temporada_efectiva` contra su cuerpo de `20260928100000`** (SQL, T4d). Se crea como `pg_temp` y se compara en
  los dos sentidos. Compararla solo con el núcleo era circular: con el estado del producto nulo en el núcleo cambiaban los
  dos lados y «Sin temporada» quedaba en 0. Ahora da 34 filas distintas.
- **La recepción de un traslado directo al piso tiene fecha** (SQL, T3): marca 0. Con `fn_es_llegada_a_cayla` en la
  marca, salía 4 (edad desconocida).

**Pendientes para Felipe** (se suman a las de las revisiones 3 y 4, ya decididas). Ninguna bloquea pegar la base: la 7
cambiaría una línea de `20260928120310` antes de pegarla, y la 8 solo cambia la web.

7. **¿Una carga inicial posterior reinicia la temporada de lo que llegó de verdad?** Hoy sí: la llegada a CAYLA es la
   ÚLTIMA (decisión 1) y la carga inicial cuenta. Un bikini de verano llegó por lote a esta tienda el 15 de enero de
   2026 y sigue colgado: es «Temporada pasada». Si HOY otra sede (AQP o LIM, que tienen 0 movimientos, al incorporarse) o
   esta misma tienda carga otra talla del mismo modelo+color por Existencias ▸ Ajustar stock (`cargar_stock_inicial`,
   abierta a quien ajusta stock), su fin pasa al verano siguiente y deja de avisar en TODAS las sedes. La carga inicial no
   es mercadería que llega: es stock que ya estaba y el sistema recién conoce (ADR-0248). Prueba T4i, «PENDIENTE DE
   FELIPE».
   - **Recomendación:** la carga inicial cuenta como llegada a CAYLA solo si el modelo+color no tiene lote ni producción,
     y entre varias cargas manda la PRIMERA. En `llegada_cayla_de`:
     `coalesce(max(m.created_at) filter (where m.motivo is distinct from 'carga_inicial'), min(m.created_at) filter
     (where m.motivo = 'carga_inicial'))`. Probado como cambio a propósito: solo cambian las dos verificaciones de T4i y el
     resto de la suite pasa.
   - **Ganas:** incorporar AQP y LIM no le borra «Temporada pasada» a TRU.
   - **Pagas:** una prenda que de verdad volvió a llegar y se registró como carga inicial no reinicia su estación. Es
     poco probable: la carga inicial es de una vez por tienda y talla.
   - Si Felipe mantiene la regla de hoy, esto se escribe en el «SE ROMPE SI» de la decisión 1 y en la nota de ADR-0246.
   - **Si no responde**, se pega `20260928120310` como está (la regla de hoy). La recomendación entraría después en
     una migración nueva cuya guarda acepte el cuerpo `51babffc…`.
8. **¿Lo que no tiene dato de rapidez y se sigue vendiendo recibe «sigue vendiendo» con la temporada pasada?** Hoy no:
   la decisión 2 alcanza solo al pilar, que necesita índice. Dos bikinis con la misma historia (10 colgados, 8 vendidos
   en 16 horas, temporada pasada) reciben respuestas distintas. El del lote recibe «sigue vendiendo». El de la carga
   inicial (sin dato: no se le puede medir la edad) recibe «revisa sus ventas», «cambiar de lugar» y «retirar», justo lo
   que la decisión 2 descartó para lo que se vende. En TRU, 33 de los 34 modelo+color vinieron solo en la carga: cuando
   termine su estación, todos sus éxitos recibirán esto. Prueba «PENDIENTE DE FELIPE» de los gemelos en
   `frescura-reglas.test.ts`.
   - **Recomendación:** que lo sin dato que vendió en los últimos 30 días (`recientes = vendio`) reciba «sigue vendiendo».
   - **Ganas:** los gemelos iguales; el éxito de la carga no recibe una orden de moverlo.
   - **Pagas:** sin índice no se sabe si vende «bien». La chompa del archivo de la web (1 de 4 vendida en 42 días, en
     una categoría sin referencia) también diría «sigue vendiendo», no «retirar». Ese cambio se probó y rompe
     `frescura-contrato.test.ts` en ese punto: por eso no se aplicó sin preguntar.
   - **La otra opción** del revisor: solo quitarle «cambiar de lugar» y dejarle «revisa sus ventas» y «retirar».
   - **Si no responde**, el paso 4 lo muestra en la maqueta con los dos bikinis lado a lado para que lo decida viéndolo.

**Cifras.**
- `frescura_lectura.mjs`: **184** (antes 177).
- `frescura-reglas.test.ts`: **109** (antes 101), y `frescura-contrato.test.ts` 18.
- Con el código de antes fallan 6 pruebas de la web: las dos correcciones, la forma nueva de `unidadesParaVara` y la
  combinatoria.
- De los 18 cambios a propósito de la web (los 5 del revisor y 13 nuevos sobre las dos correcciones) mueren 17. El otro
  es equivalente: sin nada con edad conocida, la rapidez ya es «sin dato». Mueren los 3 del SQL.
- Los 63 cambios a propósito de la web de la revisión 5, corridos contra este código: mueren 57 (con el código de antes,
  49). Siguen vivos 6 que ningún revisor dio como hallazgo: clásicos medidos contra el resto, el umbral de P90 menos EPS,
  «la lectura cubre 30 días» estricto o siempre, «revisa sus ventas» sin piso, y `ultimaLlegadaCayla` de la talla más
  vieja (la base ya la da igual en todas las tallas).
- La recomendación de la pregunta 7, aplicada como cambio a propósito, cambia solo las dos verificaciones de T4i.
- Costo: `analizarSede` sobre las dos cargas sintéticas de la revisión 5 tarda ~160 ms antes y después (mediana de 9,
  dentro del ruido de ±5 ms). La hora de cada venta sin edad se lee solo si la prenda colgó algo con edad conocida.
  Leerla siempre (también en las ventanas de la vara, donde no se usa) sumaba hasta ~10 ms.
- Vecinas sin cambios: `frescura_bajadas` 166, `temporadas` 25, `roles_por_modulo` 70, `roles_cobertura_modulos` 31,
  `una_sola_firma` 2, `fn_ledger_fuente_unica` 48, `bajada_al_piso` 51, `fn_resumen_comparacion` 25; vitest completo
  206 archivos.


### Cierre del paso 3 (2026-09-27, noche): cómo se pega, qué queda para el paso 4 y qué sigue abierto

*Actualización (revisión 7, 2026-09-27, noche): el orden de pegado ahora son TRES archivos, las preguntas 7 y R7-1 están
decididas y los siete hallazgos, cerrados. Ver «Revisión 7 del paso 3», abajo; lo de esta sección queda como historia.*

**Dónde quedó.** El PR #542 llevó a main la versión de la integración (`20260928120300` y la web de entonces). Las
revisiones 3 a 6 van en el **PR #544** (rama `claude/frescura-3c-lectura`): la web corregida, las pruebas y
`20260928120310_frescura_lectura_revision3.sql`. `20260928120300` sigue idéntica a la de main (md5 del archivo
`40bf970f…`); `20260928120310` es `e121f11e…`. Aquí se cierra el ciclo de revisiones. Los siete hallazgos de la revisión
7 no se corrigieron y quedan abajo, con su caso escrito para rehacerlo.

**Producción hoy** (un `select` del 2026-09-27 por la noche). Los pasos 1 y 2 están pegados: `fn_ledger_puntos`
`a3d9fb69…`, `fn_bajadas_del_piso` `34a7e0cc…`, `fn_bajadas_del_piso_nucleo` `fcfd2c4b…`. `fn_temporada_efectiva`
tiene `1cc652ba…`. No existe ninguna función del paso 3.

**Cómo se pega.** Cada migración va sola en el SQL Editor, a cualquier hora: solo trae funciones, `revoke` y `grant`, sin
políticas, sin `drop trigger` y sin `alter` (ADR-0195). Después de cada una se verifica con
`select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and proname in (…)`.

1. `20260928120300_frescura_lectura.sql`. Tiene que dar:
   - `fn_es_llegada` `5089ba50874f611d96d5df751b63ed57`
   - `fn_frescura_sede` `644e10126796adc1111702290c14f2bb`
   - `fn_confianza_registro` `9c714f98dd2776eebb505846eb24c33a`
   - `fn_temporada_efectiva` sin cambio: `1cc652ba0bef3e9783a014b840cb870f`
2. `20260928120310_frescura_lectura_revision3.sql`. **Nunca se pega solo la primera**: eso deja en producción los errores
   de la revisión 3. Tiene que dar:
   - `fn_es_llegada` igual
   - `fn_es_llegada_a_cayla` (nueva) `7e1ffb6d9853027ec685fef46ec72a4c`
   - `fn_frescura_sede` `51babffc09da4073691ee251882967c8`
   - `fn_confianza_registro` `8c6f5e6c27916b99be10020b772bd6e0`
   - `fn_temporada_efectiva_nucleo` (nueva) `2bf80eb239248cce88cf8062238f4dfc`
   - `fn_temporada_efectiva` `e96b3c6c51fd12ca712e76d63efd6448`: el envoltorio, que da las mismas filas.

Lo verifiqué el 2026-09-27 en una base nueva:
- Con todas las migraciones menos `20260928120310`, la base da los md5 del punto 1.
- Pegando `20260928120310` encima, en una sola transacción como el SQL Editor, da los del punto 2.
- Pegándola otra vez no cambia nada.

Después se corre `pnpm datos:generar:produccion` con un volcado nuevo y `pnpm datos:comparar`, y se regeneran los tipos
de `packages/database`.

**Antes de pegar la segunda, dos preguntas para Felipe:** la 7 (revisión 6) y R7-1 (abajo). Si alguna respuesta cambia
`fn_frescura_sede`:
- Mientras el #544 no se fusione, `20260928120310` se edita en su lugar. Cambia su md5 aquí, en la guarda y en T12b.
- Después de fusionarlo, la corrección va en un archivo nuevo cuya guarda acepte `51babffc…` (la regla de la revisión 4).
- Si Felipe no responde, se pega como está.

**Las decisiones.** Las seis de las revisiones 3 y 4 están DECIDIDAS («Revisión 5 del paso 3»):
- **D1 (Felipe):** la temporada cuenta desde la última llegada A CAYLA del modelo+color. La recepción de un traslado no
  cuenta.
- **D2 (Felipe):** un pilar de temporada pasada entra a «Por decidir» con «sigue vendiendo». Desde la revisión 6, solo si
  se sigue vendiendo.
- **D3 (técnica):** la prenda colgada 100 días sin vender en una categoría que rota en días va a «Por decidir».
- **D4 y D6 (técnicas):** la prenda callada recibe «revisa sus ventas». Callada es la que no tiene tramo firme, lleva 30
  días colgada y no vendió nada en esos 30.
- **D5 (técnica):** el tramo se mide contra la categoría sin la prenda.

Quedan abiertas la 7 y la 8 (revisión 6) y R7-1.

**Lo que queda para el paso 4 (la pantalla)**, además de lo de «Paso 3 construido»:
- **La frase de que cada prenda se mide sin ella (D5).** Los cortes de la cabecera son de la categoría entera, pero cada
  prenda se ubica contra el resto de su categoría (`categoriaSinElla`). Sin la frase, una prenda que pesa mucho en su
  categoría cae en un tramo que la cabecera no explica, y el líder lo lee como un error. Texto para la maqueta: «Cada
  prenda se compara con el resto de su categoría, sin contarse a sí misma».
- Cómo se dicen «aún sin referencia» (la categoría sin P50) y el tramo «al menos».
- Qué se muestra de lo que solo está en el almacén. Nunca estuvo colgado y hoy sale «Nueva» con 0 segundos.
- La última llegada a CAYLA (`ultima_llegada_cayla`) junto al aviso «Temporada pasada», y el texto de «sigue vendiendo».
- Los dos bikinis gemelos lado a lado, si la pregunta 8 sigue sin respuesta.
- Si se agrega `llegada_estimada` para lo que no tiene ninguna llegada: sin ella, esas prendas nunca son «Temporada
  pasada».
- Cómo se muestra lo apartado, según R7-1.
- El módulo `frescura`, el candado de las tres lecturas («ve Frescura y opera la sede»), el menú y la ruta, y la
  verificación en TRU en escritorio y a 375 px.
- **R7-2 y R7-3 corregidas antes de publicar.** Son reglas de la web que el líder vería apenas exista la pantalla. No
  bloquean pegar el SQL.

**Los hallazgos de la revisión 7, abiertos.** Tres revisores (SQL, reglas y pruebas) miraron la revisión 6 y encontraron
siete hallazgos. Cada revisor confirmó el suyo ejecutándolo. Las reproducciones quedaron en el espacio temporal de la
sesión, que no se guarda: por eso cada hallazgo lleva su caso escrito.

- **R7-1 (SQL; decide Felipe antes de pegar `20260928120310`): `piso_hoy` cuenta lo apartado para una clienta.**
  - **El problema.** `apartar` sube `stock.cantidad_apartada` y no baja `cantidad`. El lateral `st` de
    `fn_frescura_sede` suma `cantidad`, y el jsonb no trae lo apartado, así que la web no puede separarlo.
  - **El caso.** 4 llegan hace 61 días, se cuelgan hace 60 y se vende 1. Las 3 que quedan se apartan hace 50 días. Sale
    Crítica, quieta y con «cambiar de lugar», exactamente igual que su gemela sin apartar: `porDecidir` 2 en vez de 1.
  - **Por qué importa.** Contradice a la herramienta de retiro de este mismo ADR, que mide el piso neto de lo apartado.
    En producción, TRU tiene 1 unidad apartada en el piso (select del 27-sep), y una separación con abonos dura semanas.
  - **Recomendación: lo apartado no está colgado para Frescura.**
    - En SQL: `apartadas_hoy` en el lateral y en el jsonb.
    - En la web: `quieta` y las sugerencias sobre `piso_hoy − apartadas_hoy`, y si todo está apartado, fuera de «Por
      decidir».
    - Pruebas: T2 con una prenda apartada, y en la web la apartada contra su gemela.
    - **Ganas:** el líder no ve como quieta una prenda que ya tiene dueña.
    - **Pagas:** un campo más en el contrato; T13 y el archivo de la web se rehacen.
  - Si Felipe decide que sí cuenta, se escribe con su SE ROMPE SI: «una separación de semanas aparece como Crítica».
- **R7-2 (regla de la web; la corrección 1 de la revisión 6 la introdujo): el pilar que se agotó y se repuso «dejó de
  vender».**
  - **El problema.** `recientesDe` compara las ventas de los últimos 30 días con el reloj TOTAL de la prenda. No mira si
    la prenda estuvo en el piso en esos 30 días.
  - **El caso.** Una categoría con vara de 30 días «Sólido» (P50 de 4 días). Llegan 60 por lote hace 100 días y se vende
    1 por día. El piso quedó en 0 hace 35 días; ayer se colgaron 5 y quedan 15 en el almacén. Sale Crítica, quieta, con
    «cambiar de lugar» y «trasladar». Con la temporada pasada recibe «cambiar de lugar», «trasladar» y «retirar» en vez
    de «sigue vendiendo».
  - **Por qué importa.** Es el camino normal de un éxito, y dura hasta su primera venta después de reponer.
  - **Arreglo sugerido:** medir «dejó de vender» con los segundos colgada desde la última venta del modelo+color en la
    sede (`relojNovedad` desde la última venta, o desde el inicio de la lectura si es posterior). El revisor lo probó y
    pasan las 127 pruebas.
- **R7-3 (regla de la web): una devolución, un cambio o un ajuste «reposicion» que se revende deja sin rapidez a todo el
  éxito.**
  - **El problema.** Esas unidades entran al piso sin lote y llevan la marca 4 (un `registrar_cambio` real da el evento
    `…:1:4`). Si se revenden después de que la prenda colgó lo conocido, `ventasQueEsconden` deja sin dato la rapidez de
    la lectura entera. Es lo que describe mal el «SE ROMPE SI» de la corrección 2.
  - **El caso.** Un bikini de invierno (estación terminada el 22-sep): llegan 13 por lote hace 10 días, se cuelgan 10 y se
    venden 8 en 16 horas. A las 20 horas una clienta devuelve uno. Se venden 3 más, y la última es la devuelta. A las 48
    horas bajan los 3 del almacén. Sale sin rapidez, con «revisa sus ventas», «cambiar de lugar» y «retirar». Su gemelo
    sin la devolución sale con rapidez 261 y «sigue vendiendo».
  - **En producción,** según el revisor, TRU ya tiene 6 ajustes «reposicion» directo al piso (12 unidades).
  - **Arreglo sugerido:** calcular la rapidez dos veces, sin contar esas ventas y contándolas como vendidas. Si las dos
    dan el mismo veredicto (pilar o lenta), vale ese; si no, queda sin dato. El revisor lo probó: de las pruebas del repo
    cambia una, la reposición «ambigua» de la carga, que pasa de sin dato a lenta. La alternativa es la regla exacta que
    la corrección 2 descartó.
- **R7-4 a R7-7: pruebas que faltan.** No cambian código: el comportamiento de hoy es el que documenta este ADR. Son
  cambios a propósito que sobreviven las 127 pruebas de la web:
  - **R7-4, `ventasQueEsconden` con varias tallas.** Sobreviven tres cambios: tomar la MAYOR `primeraConEdad`, mirar solo
    la primera talla, y medir sobre la ventana de la vara (`enLaVara` en lugar de `suyas`). Dos de ellos terminan en
    «Trasladar». Casos:
    - RZ-3: la M conocida el día 40, la S de la carga vendiendo los días 70 a 85 y la L el día 100. Rapidez nula, sin
      «trasladar».
    - RZ-4: E-Y08 con la talla de la carga primero en la lista.
    - RZ-5: una reposición dentro de la ventana de la vara, con 2 vendidas.
  - **R7-5, el lector de la lectura.** Si convierte en `false` un `en_estacion_ahora` nulo, nada lo nota. Es el caso del
    clásico: `fn_ocurrencia_temporada` no da fila y el valor llega nulo. Con ese cambio, todo clásico recibe «guardar
    hasta su estación». Falta, en `frescura-contrato.test.ts`, exigir para el clásico `fueraDeSuEstacion: false` y
    `sugerencias: []`, y `enEstacionAhora: null` en la lectura.
  - **R7-6, el modelo+color en `analizarSede`.** Sobreviven agrupar sin el color y tomar el almacén de la primera talla.
    Casos:
    - RZ-1: dos colores del mismo producto, uno viejo y quieto y el otro «Nueva». Tienen que salir dos prendas.
    - RZ-2: el almacén solo en la segunda talla. Tiene que dar `almacenHoy` 3 y «trasladar».
  - **R7-7, la vara.** Sobreviven tres cambios:
    - Contar como venta toda salida con edad conocida. Un traslado o una merma acortarían la curva. Caso RZ-6.
    - `alcanza` sin exigir el P90. RZ-7: 20 vendidas con P75 y sin P90 en 30 días; se elige 60.
    - El P90 exacto en `restar`, el «umbral de P90 menos EPS» que la revisión 6 ya listó vivo. RZ-8: el resto con 9 de
      10 vendidas da un P90 de 9 días.

**Cifras del cierre** (2026-09-27; cada suite SQL en una base nueva con todas las migraciones).
- SQL: `frescura_lectura` 184, `frescura_bajadas` 166, `temporadas` 25, `roles_por_modulo` 70, `roles_cobertura_modulos`
  31, `una_sola_firma` 2, `fn_ledger_fuente_unica` 48, `bajada_al_piso` 51, `fn_resumen_comparacion` 25. Todas en verde.
- Web: vitest completo, 206 archivos y 152.162 pruebas, todas en verde (147.543 son de `menu.test.ts`, de main, que
  este PR no toca); `frescura-reglas.test.ts` 109 y `frescura-contrato.test.ts` 18; `tsc` limpio.
- `scripts/migraciones/versiones.mjs`: 351 archivos, ninguna versión repetida. `scripts/adr/numeros.mjs`: 236 ADR, ningún
  número repetido.
- `origin/main` no avanzó desde el último merge (`7440eddf`): no hubo nada que traer.


### Revisión 7 del paso 3 (2026-09-27, noche): las dos decisiones de Felipe, las dos reglas de la web y las pruebas que faltaban

*Actualización (revisión 8, 2026-09-27, noche): R7-1 quedaba a medias. «El FIFO de la vara no los ve», abajo, ya no
rige: lo apartado es una venta desde que se apartó, o una pausa si la clienta no se la llevó. `20260928120320` solo cambió
comentarios, pero su `fn_frescura_sede` da otro md5: `7da85d7b7010659ba5a36a2478c89ad4` (archivo `81e3ddeb…`). Ver
«Revisión 8 del paso 3», abajo.*

Felipe respondió las dos preguntas que quedaban antes de pegar (la 7 de la revisión 6 y R7-1). Los otros cinco hallazgos
de la revisión 7 eran técnicos y se corrigen aquí. Cada arreglo lleva una prueba que falla con el código de antes.

**Un desvío: la base va en un archivo nuevo, `20260928120320_frescura_lectura_revision7.sql`.** El plan era editar
`20260928120310` en su lugar, porque no estaba en main. Pero Felipe fusionó el PR #544 el 2026-09-28 a las 03:31 (UTC),
antes de empezar este trabajo, y `20260928120310` ya está en main. Rige la regla de la revisión 4: una migración que está
en main no se edita. Una base que ya la corrió no la vuelve a leer, y quien pegue la versión de main quedaría con una
guarda que no conoce la corregida. Por eso las dos decisiones van en un tercer archivo, que solo reescribe
`fn_frescura_sede`. `20260928120300` y `20260928120310` quedan idénticas a main (archivos `40bf970f…` y `e121f11e…`).
Producción sigue sin nada del paso 3 (`select` del 27-sep por la noche: solo `fn_temporada_efectiva`, `1cc652ba…`), así
que se pegan las tres, en orden.

**Pregunta 7, DECIDIDA por Felipe el 2026-09-27: una carga inicial posterior no le reinicia la temporada a lo que llegó
por lote.** `20260928120320`, `llegada_cayla_de`.
- **El problema.** La llegada a CAYLA era la ÚLTIMA de cualquier clase, y la carga inicial contaba como una más. El
  bikini que llegó por lote a TRU en enero dejaba de avisar «Temporada pasada» en TODAS las sedes apenas AQP o LIM (0
  movimientos hoy) cargaban una talla del mismo modelo+color al incorporarse. Lo mismo si TRU cargaba una talla nueva por
  Existencias ▸ Ajustar stock.
- **DECIDIÓ Felipe:** la carga inicial cuenta como llegada a CAYLA solo si el modelo+color NO tiene lote ni producción.
  Entre varias cargas iniciales manda la PRIMERA. En SQL: `coalesce(max(created_at) filter (lote o producción),
  min(created_at) filter (lo demás, que es la carga inicial))`, sobre lo que ya filtra `fn_es_llegada_a_cayla`. El campo
  sigue llamándose `ultima_llegada_cayla`. Es la llegada a CAYLA que manda: la última por lote o producción y, sin
  ninguna, la primera carga.
- **DESCARTÉ:**
  - Mantener la regla de hoy, porque incorporar AQP y LIM le borraría «Temporada pasada» a TRU.
  - Sacar la carga inicial de `fn_es_llegada_a_cayla`, porque 33 de los 34 modelo+color de TRU vinieron solo en la carga
    y sin ella nunca serían «Temporada pasada».
- **SE ROMPE SI** una prenda que de verdad volvió a llegar de afuera se registra como carga inicial. Su estación no vuelve
  a empezar y avisa «Temporada pasada» antes de tiempo. Es poco probable: la carga inicial es una vez por tienda y talla.
- **En producción hoy no cambia nada:** de los 34 modelo+color que llegaron alguna vez, 33 vinieron solo en la carga
  (todas sus cargas en el mismo instante), 1 solo por lote y ninguno por las dos puertas (`select` del 27-sep).
- **Prueba:** T4i. Las dos verificaciones que decían «PENDIENTE DE FELIPE» ahora exigen el lote de enero (en otra sede y
  con una talla nueva en esta). Una nueva: el modelo+color que solo vino en cargas conserva la estación de la primera.

**R7-1, DECIDIDA por Felipe el 2026-09-27: lo apartado para una clienta no está colgado.** `20260928120320` y
`lib/frescura-reglas.ts`.
- **El problema.** `apartar` sube `stock.cantidad_apartada` y no baja `cantidad` (ADR-0141). Frescura contaba como
  colgado lo que ya tiene dueña: una separación de 50 días salía Crítica, quieta y con «cambiar de lugar», igual que su
  gemela libre.
- **DECIDIÓ Felipe:** lo apartado no está colgado, y en SQL si se puede. Quedó así:
  - **SQL.** `piso_hoy` y `almacen_hoy` son lo LIBRE (sin lo apartado). `apartadas_hoy` es lo apartado de la prenda en la
    tienda (piso y almacén, sin cuarentena), para que la pantalla lo diga. El campo nuevo `apartados`, al lado de
    `eventos`, trae por prenda los puntos `[ts, delta]` de lo apartado EN EL PISO, con el signo de lo que cambia lo libre
    (apartar resta, liberar suma). Primero va el saldo con que arranca la ventana, a la hora de `desde`: lo apartado hoy
    menos lo que la ventana apartó y liberó, con la misma ancla en `stock` que usa el libro.
  - **Web.** El reloj de novedad suma `apartados` a los eventos del piso: una prenda con todo lo colgado apartado no
    envejece, y al liberarse sigue donde iba. El FIFO de la vara no los ve, porque la unidad apartada es la misma unidad
    con su misma edad. Con `piso_hoy` ya libre, la prenda con todo apartado no es quieta, no recibe sugerencias y no pesa
    en las cifras de la sede (unidades en el piso, edad del piso, «Por decidir»). «Trasladar» mira el almacén libre.
- **DESCARTÉ:**
  - Traer solo `apartadas_hoy` y restar en la web, que era la recomendación de la revisión 7. Sería una cuenta con dos
    dueños, y cualquier pantalla que olvide restar volvería a mostrar colgado lo que tiene dueña. Con `piso_hoy` ya libre,
    nadie tiene que acordarse.
  - Mover lo apartado a otra sububicación, que ADR-0236 ya descartó (tocaría el núcleo y la entrega).
  - Tratar «apartar» como una salida del FIFO. La curva lo contaría como una unidad que salió sin venderse y, al liberarse,
    como una cohorte nueva de edad desconocida.
- **SE ROMPE SI:**
  - `stock.cantidad_apartada` deja de cuadrar con los movimientos (`fn_verificar_apartados` lo dice). El saldo con que
    arranca la ventana saldría corrido.
  - Una unidad apartada y después entregada se vende tarde para la vara: sus días apartada cuentan como días colgada
    hasta la venta. Una separación de 3 semanas alarga 3 semanas la salida de esa unidad en la curva. Con 1 unidad
    apartada en TRU hoy no mueve ningún corte. Si las separaciones llegan a ser una parte visible de lo vendido de una
    categoría, la vara tendría que cortar la unidad cuando se aparta.
- **Para la pantalla (paso 4):** una prenda con todo apartado conserva el tramo que tenía cuando se apartó (el reloj se
  detiene, no se borra), sin sugerencias. La pantalla tiene que mostrarla como «apartada», no con su chip de tramo a
  secas.
- **Pruebas:**
  - SQL, T2i. La separación del caso de la revisión 7 (piso libre 0, 3 apartadas, un punto de −3). Una apartada antes de
    la ventana (solo el saldo). Una separación partida por el borde de 30 días (el saldo son 2 aunque hoy quede 1). Una
    liberada. La entrega (liberar y vender en el mismo instante). Lo apartado en el almacén (no toca el piso, pero
    `almacen_hoy` es 0). En toda prenda, eventos más apartados dan lo libre de hoy.
  - SQL, T13. Un vestido apartado en el archivo de la web.
  - Web. La apartada contra su gemela («Por decidir» 1 y no 2, y la edad del piso sin ella). El reloj que se detiene y
    sigue. La lectura de los dos campos nuevos, y una base de antes sin ellos. El vestido de la salida real, colgado 10
    días y no 40.
- **Costo** (la carga sintética de siempre, con 200 apartados y 50 liberaciones en la ventana, 11 corridas alternadas):
  - `fn_frescura_sede`: 757 ms (742-795) contra 754 (729-817) de `20260928120310` a 120 días, y 230 (223-233) contra 224
    (217-233) a 30 días.
  - La lista de prendas se mira con `= any(v_ids)`. Con la semiunión de `20260928120010` la lectura de lo apartado tardaba
    44 ms: las filas son pocas y la semiunión se rearmaba por fila. Con `= any`, 6 ms.
  - `analizarSede` en la web: 144 ms contra 142.

**R7-2, corregida: «dejó de vender» se mide en días en el piso, no de calendario.** `lib/frescura-reglas.ts`.
- **El problema.** `recientesDe` comparaba las ventas de los últimos 30 días de calendario con el reloj TOTAL de la
  prenda. Un éxito que se agotó hace 35 días y se repuso ayer quedaba «dejó de vender» apenas se colgaba. Salía Crítica,
  quieta, con «cambiar de lugar» y «trasladar», y con la temporada pasada perdía «sigue vendiendo».
- **DECIDÍ:** las ventas «recientes» son las de sus últimos 30 días EN EL PISO, con algo libre colgado. Se cuentan hacia
  atrás desde hoy saltando lo agotado, lo guardado y lo apartado (`inicioDeSusUltimosDias`). «Dejó de vender» exige que la
  lectura la tenga colgada esos 30 días. Salen de la MISMA línea de tiempo que el reloj de novedad (`LineaDelPiso`, que
  `analizarSede` arma una vez por prenda y le pasa a `relojNovedad`). El éxito repuesto ayer suma 1 día desde ayer y 29
  antes de agotarse: vendió 30, sigue pilar, sin sugerencias y, con la temporada pasada, «sigue vendiendo».
  `ventasRecientes` es ahora ese número, y la pantalla puede decirlo tal cual.
- **DESCARTÉ** la del revisor, los segundos colgada desde la última venta con las ventas de 30 días de calendario. Da el
  mismo veredicto en el caso del pilar, pero mide la pregunta con dos varas. La cifra que mostraría la pantalla («0 ventas
  en 30 días») contradiría el veredicto («se sigue vendiendo»).
- **SE ROMPE SI** una prenda vuelve al piso después de meses guardada. Sus ventas de antes de guardarla cuentan como
  «recientes», aunque sean de otra estación. Es la regla (en el piso no se vendió peor). La temporada pasada ya la manda
  a «Por decidir» con su propia sugerencia.
- **Pruebas:**
  - El pilar agotado y repuesto: 61 días colgado y 30 ventas recientes. Da pilar, sin sugerencias, y «sigue vendiendo»
    con la temporada pasada.
  - La prenda guardada 50 días en medio: vendió en sus 30 días en el piso. Sin esa venta, «dejó de vender».
  - `inicioDeSusUltimosDias` en sus bordes.

**R7-3, corregida: las ventas que pudieron esconderse se cuentan de las dos maneras.** `lib/frescura-reglas.ts`,
`rapidez`.
- **El problema.** Una devolución, un cambio de talla o un ajuste «reposicion» al piso entra sin lote y lleva la marca 4.
  Si esa unidad se revendía después de que la prenda colgó lo conocido, `ventasQueEsconden` dejaba sin dato la rapidez de
  TODA la prenda por la lectura entera. El bikini de temporada pasada con una devuelta recibía «revisa sus ventas»,
  «cambiar de lugar» y «retirar». Su gemelo sin devolución recibía «sigue vendiendo».
- **DECIDÍ:** con ventas escondidas, la rapidez se mide dos veces. Una sin contarlas (lo que se sabe) y otra contándolas
  como vendidas de lo conocido (lo que podría ser). Si las dos dicen lo mismo (pilar o lenta), vale la primera; si no,
  «sin dato». El bikini devuelto da el mismo índice que su gemelo (261 en la salida real que corrió el revisor) y recibe
  «sigue vendiendo». Las gemelas K y U y E-Y08 siguen sin dato, porque contar las escondidas les cambia el veredicto.
- **DESCARTÉ:**
  - La regla exacta («mientras había en el piso una unidad conocida de la misma talla»), por lo mismo que en la revisión 6:
    pide el estado del FIFO en cada instante y cambiar `inventario-exposicion.ts`, que es de Análisis también.
  - Quitarle la marca 4 a devoluciones y cambios. Su edad en el piso tampoco se sabe: la unidad se vendió y volvió.
- **SE ROMPE SI** hay muchas ventas escondidas en una prenda que está justo debajo del índice 100. La segunda cuenta
  suma las ventas, pero no acorta las esperadas de lo conocido: si de verdad se vendió una unidad conocida, esa unidad
  esperaba menos. Esa cuenta se queda corta del lado «pilar», y la prenda sale «lenta», va a «Por decidir» y, con
  «Sólido» y almacén, recibe «trasladar». Con 1 venta escondida contra 5 o más unidades la diferencia no llega a la
  esperanza de una sola unidad. Si pasa seguido, se escribe la regla exacta.
- **Lo que cambia de antes:** la reposición «ambigua» de la carga de la revisión 6 (la carga vende el día 101, un día
  después de colgar lo repuesto) pasa de «sin dato» a lenta. Aun contada como de lo repuesto, 1 de 5 en 20 días es lenta
  contra blusas que se venden en 2 a 10 días. RZ-3 del revisor se reescribió para que las dos cuentas no coincidan (la L
  llega el día 118, no el 100). Si no, con la regla nueva ya no distinguía el cambio a propósito que tenía que matar.
- **Pruebas:** las dos cuentas con números escritos a mano (1, 4 y 5 escondidas contra 4,28 esperadas; un pilar que
  sigue pilar; sin evidencia, sin dato), y los bikinis devuelto y gemelo.

**R7-4 a R7-7, las pruebas que faltaban.** Son los casos que escribió el revisor (RZ-n), en `frescura-reglas.test.ts`
(«R7-4 a R7-7: las pruebas que faltaban») y en `frescura-contrato.test.ts`:
- **R7-4:** RZ-3, RZ-4 y RZ-5 (`ventasQueEsconden` con varias tallas).
- **R7-5:** el clásico de la salida real, con `en_estacion_ahora` nulo: `fueraDeSuEstacion` false y sin sugerencias.
- **R7-6:** RZ-1 y RZ-2 (el modelo+color en `analizarSede`).
- **R7-7:** RZ-6, RZ-7 y RZ-8 (la vara).
- **Además**, RZ-9 a RZ-15 y RZ-17 a RZ-19: tardías, bordes de las constantes, sugerencias sin piso y lo que leerá la
  pantalla. Ninguna reveló un error del código: todas pasan con el código de antes, y cada una mata su cambio a propósito.

**Cómo se pega (reemplaza el orden de «Cierre del paso 3»).** Cada archivo va solo en el SQL Editor, a cualquier hora:
solo traen funciones, un comentario, `revoke` y `grant`, sin políticas, sin `drop trigger` y sin `alter` (ADR-0195).
Después de cada uno se verifica con `select proname, md5(prosrc) from pg_proc where pronamespace =
'retail'::regnamespace and proname in ('fn_es_llegada', 'fn_es_llegada_a_cayla', 'fn_frescura_sede',
'fn_confianza_registro', 'fn_temporada_efectiva_nucleo', 'fn_temporada_efectiva')`.

1. `20260928120300_frescura_lectura.sql` (archivo `40bf970f…`, idéntico a main). Tiene que dar:
   - `fn_es_llegada` `5089ba50874f611d96d5df751b63ed57`
   - `fn_frescura_sede` `644e10126796adc1111702290c14f2bb`
   - `fn_confianza_registro` `9c714f98dd2776eebb505846eb24c33a`
   - `fn_temporada_efectiva` sin cambio: `1cc652ba0bef3e9783a014b840cb870f`
2. `20260928120310_frescura_lectura_revision3.sql` (archivo `e121f11e…`, idéntico a main). Tiene que dar:
   - `fn_es_llegada` igual
   - `fn_es_llegada_a_cayla` (nueva) `7e1ffb6d9853027ec685fef46ec72a4c`
   - `fn_frescura_sede` `51babffc09da4073691ee251882967c8`
   - `fn_confianza_registro` `8c6f5e6c27916b99be10020b772bd6e0`
   - `fn_temporada_efectiva_nucleo` (nueva) `2bf80eb239248cce88cf8062238f4dfc`
   - `fn_temporada_efectiva` `e96b3c6c51fd12ca712e76d63efd6448`
3. `20260928120320_frescura_lectura_revision7.sql` (archivo `81e3ddeb…` desde la revisión 8; antes `63e0894b…`). **Nunca
   se detiene en la segunda**: sin esta, la pantalla contaría lo apartado como colgado y la carga de AQP o LIM reiniciaría
   temporadas. Tiene que dar las cinco de la segunda sin cambio y:
   - `fn_frescura_sede` `7da85d7b7010659ba5a36a2478c89ad4` (revisión 8: solo cambiaron comentarios de adentro; antes
     `09e154ad…`, que nunca se pegó en ninguna parte)

**Lo verifiqué el 2026-09-27, en bases nuevas** (Postgres 17 desechable, cada archivo en UNA transacción, como el SQL
Editor):
- Con todas las migraciones menos `20260928120310` y `20260928120320`, la base da los md5 del punto 1. Pegando
  `20260928120320` ahí, aborta pidiendo `20260928120310` y no cambia nada.
- Pegando `20260928120310` da los del punto 2. Pegada otra vez, no cambia nada.
- Pegando `20260928120320` da los del punto 3. Pegada otra vez, no cambia nada, y son los mismos de una base con todas
  las migraciones.
- Después de la tercera, volver a pegar `20260928120310` o `20260928120300` aborta sin deshacer nada. El aviso de la 120310
  dice «alguien la cambió en vivo» porque no conoce el cuerpo nuevo; es el aviso de siempre de su guarda y no se edita.
- Sobre producción de hoy, sin ninguna de las tres, `20260928120310` sola y `20260928120320` sola abortan pidiendo
  `20260928120300`.
- La prueba T12b recorre ese mismo orden dentro de la suite, con los md5 escritos, y la guarda de la 120310 contra un
  parche en vivo de cada una de las seis. T12 prueba la guarda de la tercera: aborta si están parchadas `fn_frescura_sede`
  o una de las tres que usa, y deja entrar un parche de las dos que no toca.

Después se corre `pnpm datos:generar:produccion` con un volcado nuevo y `pnpm datos:comparar`, y se regeneran los tipos de
`packages/database`.

**Lo que queda abierto:**
- **La pregunta 8** (revisión 6), para la maqueta y no para el SQL: si lo que vino en la carga y se sigue vendiendo
  recibe «sigue vendiendo» con la temporada pasada. Su prueba «PENDIENTE DE FELIPE» sigue igual.
- **Del paso 4**, lo de «Cierre del paso 3», más:
  - Cómo se ve una prenda apartada, que conserva su tramo sin sugerencias.
  - Que «ventas recientes» son las de sus últimos 30 días en el piso.

**Cifras** (2026-09-27; cada suite SQL en una base nueva con todas las migraciones).
- **SQL:** `frescura_lectura` **205** (antes 184), `frescura_bajadas` 166, `temporadas` 25, `roles_por_modulo` 70,
  `roles_cobertura_modulos` 31, `una_sola_firma` 2 (646 funciones), `fn_ledger_fuente_unica` 48, `bajada_al_piso` 51,
  `fn_resumen_comparacion` 25. Todas en verde; el único error del armado es el conocido de la talla «Única».
- **Web:** vitest completo, 206 archivos y 152.189 pruebas en verde; `frescura-reglas.test.ts` **133** (antes 109) y
  `frescura-contrato.test.ts` **21** (antes 18); `tsc` limpio.
- **Con el código de antes:** fallan 10 pruebas de la web (las de R7-1, R7-2 y R7-3). En una base sin `20260928120320`
  fallan 17 verificaciones del SQL: 8 de T2i, 3 de T4i, las 2 claves del contrato, la forma del archivo de la web y 3 de
  las guardas que esperan la tercera.
- **Cambios a propósito:** en la web mueren los 18. Son los 10 que sobrevivían en la revisión 7 y 8 nuevos, sobre R7-1,
  R7-2 y R7-3. Uno de ellos (lo apartado de la primera talla) vivía hasta que se sumó la prenda de dos tallas apartadas.
  En el SQL de `20260928120320` mueren los 9: dos de la llegada a CAYLA y siete de lo apartado (signo, saldo, liberaciones,
  sububicación, piso, almacén y apartadas).
- **La salida real de los escenarios del revisor**, por la web nueva:
  - El pilar agotado: pilar, sin sugerencias (con invierno, «sigue vendiendo»).
  - El bikini devuelto: 261, igual que su gemelo, con «sigue vendiendo».
  - La separación: 10 días colgada, sin sugerencias; «Por decidir» 1 y no 2.
- `scripts/migraciones/versiones.mjs`: 352 archivos, ninguna versión repetida. `scripts/adr/numeros.mjs`: 236 ADR, ningún
  número repetido.

### Revisión 8 del paso 3 (2026-09-27, noche): lo apartado en la vara y la rapidez (R7-1 completo)

*Actualización (revisión 9, 2026-09-28): la «Pregunta para Felipe» de abajo está DECIDIDA (la separación abierta cuenta
como venta desde que se aparta), el orden de pegado ahora son CUATRO archivos (se suma `20260928120330`) y la vuelta de
una pausa ya no lleva la marca de edad desconocida. Ver «Revisión 9 del paso 3», abajo.*

La verificación de la revisión 7 encontró que R7-1 quedaba a medias, y dos pruebas que faltaban. Los tres hallazgos se
confirmaron ejecutándolos. Esta revisión NO cambia ninguna decisión de Felipe: completa la de R7-1 («lo apartado no está
colgado») en la parte que la revisión 7 dejó fuera. Lo que se revierte es una elección técnica de la revisión 7 («El FIFO
de la vara no los ve»).

**El problema (importante).** El reloj de novedad ya restaba lo apartado de lo libre, pero el FIFO de la vara no lo veía.
Cada unidad apartada entraba a la rapidez de su prenda como colgada y sin vender, y sumaba ventas esperadas. En la curva
de la categoría quedaba como una observación «al menos N días», que corría los cortes de las demás prendas. Tampoco
contaba como venta reciente. La salida real de una sede sembrada (vara de 24 blusas, `analizarSede`) daba:
- **P**, 6 colgadas hace 60 días: le apartan 4 en los días 1 a 4 y 1 hace 10 días; queda 1 libre y 2 en el almacén. Salía
  rapidez 0 (0 de 9,39), Envejecida, quieta, con «cambiar de lugar» y «trasladar».
- **Q**, su gemela, vendió esas 5 en los mismos instantes. Salía 136 (5 de 3,68), Vigente y sin sugerencias.
- **PE** apartó 4 y las entregó hace 20 días. Salía 52, lenta, porque cada entrega contaba como venta a los 40 días de
  colgada.

La rapidez alimenta el estado y «Por decidir»: lo apartado seguía pesando justo donde Felipe dijo que no.

**DECIDÍ: lo apartado es una venta desde que se apartó, o una pausa si la clienta no se la llevó.**
`eventosConApartados` en `apps/web/lib/frescura-reglas.ts` lo aplica, talla por talla, a los eventos que leen la vara de la
categoría, la rapidez y las ventas recientes. El reloj sigue igual: resta lo apartado de lo libre. Cada liberación cierra
lo más viejo que seguía apartado de la talla.
- **Lo que sigue apartado hoy:** una venta a la hora en que se apartó. La clienta ya la eligió: es demanda.
- **Lo que se entregó:** una venta a la hora en que se apartó, y la venta de la entrega no se cuenta otra vez. Se
  reconoce la entrega porque la liberación va seguida de una venta de la misma talla dentro de los 10 minutos
  (`VENTANA_ENTREGA_SEGUNDOS`). Entregar una separación libera y vende en la misma operación: las 2 entregas de TRU (26-sep)
  tienen 0 segundos entre las dos. «Se la entrego a la clienta ahora», de Apartados, se cobra enseguida en Vender.
- **Lo que se liberó sin venderse** (la clienta no vino, un error): una PAUSA, como guardarla en el almacén. No suma días
  colgada mientras estuvo apartada, y vuelve con la edad que tenía. En `historiaDeCohortes` es la misma pausa que usa un
  traslado piso↔almacén; `inventario-exposicion.ts` no cambia.
- **Ventas recientes:** lo que se apartó en sus últimos 30 días en el piso cuenta como venta de esos días. Lo que ya estaba
  apartado al empezar la lectura (el saldo, a la hora de `desde`) no, porque no se sabe cuándo se apartó.

La misma sede, con la regla nueva: P, Q y PE dan **las tres 92 (5 de 5,42)**, el mismo estado, las mismas sugerencias y 1
venta reciente. Q cambió de 136 a 92, y «Por decidir» de 7 a 9. Las apartadas de las demás prendas (X, Z, P y PE) ahora
son lo que eran: ventas rápidas. La categoría es más rápida de lo que la curva vieja decía, y Q, con 1 unidad colgada 60
días, queda un poco más lenta que ella. En las otras tres sedes del verificador las gemelas también coinciden: 102 y 102
(antes 0 y 132), 54 y 54 (antes 0 y 73), y 95, 95 y 95 (antes 0, 139 y 53).

**DESCARTÉ:**
- **Solo la pausa** (lo apartado no suma días, pero tampoco es venta). P quedaba con su unidad libre colgada 60 días y 0
  vendidas: rapidez 0, lenta y «trasladar». La demanda de 5 clientas no contaba para nada.
- **Leer `apartados.cierre_motivo` en la base** y mandarlo en un tercer campo de cada punto. Es exacto para «entregada»,
  pero «entregada» también cierra el apartado de un pedido que llegó para volver a apartarlo como separación
  (`20260927140000`, sin venta después). Además cambiaba el contrato de `20260928120320` y el archivo de la web. La ventana
  de 10 minutos cubre los dos caminos reales de una entrega sin tocar la base.
- **Dejar la revisión 7 como estaba:** es el hallazgo.

**SE ROMPE SI:**
- **Una separación larga termina abandonada.** Mientras está abierta cuenta como venta desde que se apartó, y la prenda
  parece que se vende. Al liberarse, la lectura siguiente la vuelve pausa, y el veredicto puede cambiar de un día a otro.
  Con 1 unidad apartada hoy en TRU no mueve nada. Si pasa seguido, la separación vencida se lee como pausa desde que vence.
- **Lo entregado por Apartados se cobra más de 10 minutos después.** Se lee como pausa más una venta normal, y el FIFO se
  la da a la unidad libre más vieja, como a cualquier venta. El conteo es el mismo; los días de esa venta, no.
- **Una clienta libera y otra compra la misma talla dentro de los 10 minutos.** Se lee como entrega, y esa venta queda a la
  hora en que se apartó. El conteo es el mismo.
- **Varias separaciones de la misma talla a la vez.** La base no dice qué apartado cierra cada liberación: se cierra el más
  viejo. Con entregas y abandonos mezclados, la hora de cada venta puede correrse lo que separa a esos apartados.

**Pregunta para Felipe, que no bloquea pegar.** Hoy una separación cuenta como venta desde que se aparta. Si él prefiere que
cuente solo cuando se entrega, es un cambio en `eventosConApartados`: lo abierto pasa de venta a pausa. En ese caso, P
vuelve a salir lenta mientras sus 5 separaciones sigan abiertas.

**Las dos pruebas que faltaban (hallazgos menores, confirmados).**
- **SQL, T4i:** lote más producción, y dos producciones con una carga después. Antes, tratar la producción como una carga
  (la PRIMERA en vez de la última) solo fallaba en las verificaciones de md5 y de guarda. Además le ponía «Temporada
  pasada» a lo que el Taller acaba de producir. Ahora fallan 2 verificaciones de conducta: LOTE_Y_TALLER y
  DOS_PRODUCCIONES dan `cayla=octubre_2025,fin=primavera_2025`.
- **Web:** la prenda de dos tallas con la S apartada (el reloj se detiene y es venta reciente, aunque la S no sea la
  primera talla), y el borde 100 en las dos cuentas de R7-3 (`rapidez(4, 4, 30, 1)` sigue pilar; `rapidez(3, 4, 30, 1)` es
  sin dato). Los dos cambios a propósito que sobrevivían ahora mueren.

**La base.** `20260928120320` solo cambia comentarios, en la cabecera y adentro de `fn_frescura_sede` (el de adentro decía
«el FIFO no lo ve»). La conducta es la misma, pero su md5 pasa de `09e154ad…` a **`7da85d7b7010659ba5a36a2478c89ad4`**, y la
guarda nombra el nuevo. El archivo pasa a `81e3ddeb…`. El `09e154ad…` no se pegó en ninguna parte: `20260928120320` no
está en main ni en producción. Producción, en un `select` del 2026-09-27 por la noche: solo `fn_temporada_efectiva`,
`1cc652ba…`.

**Cómo se pega (reemplaza el punto 3 de «Revisión 7 del paso 3»).** Cada archivo va solo, en el SQL Editor, en este orden:
1. `20260928120300` (archivo `40bf970f…`).
2. `20260928120310` (archivo `e121f11e…`). Los md5 de estas dos no cambian.
3. `20260928120320` (archivo `81e3ddeb…`). Tiene que dar las cinco de la segunda sin cambio y `fn_frescura_sede`
   `7da85d7b7010659ba5a36a2478c89ad4`.

Lo reproduje en bases nuevas, cada archivo en UNA transacción:
- 120320 sin 120310 aborta y no cambia nada.
- 120310 y 120320, pegadas dos veces cada una, no cambian nada la segunda vez.
- Tras 120320, volver a pegar 120310 o 120300 aborta y no deshace nada.
- Da los mismos md5 que una base con todas las migraciones.
- Sobre producción de hoy, 120310 sola y 120320 sola abortan.

T12b recorre el mismo orden dentro de la suite: lee el md5 nuevo de la guarda.

**Costo.**
- **Web:** `analizarSede`, con la carga sintética de siempre (2.016 prendas, 200 apartados), tarda 157-162 ms contra
  144-147 de la revisión 7 (5 corridas de 9). Son unos 12 ms más: las tallas con algo apartado arman sus eventos dos veces,
  una para la vara y otra para las ventas recientes.
- **Base:** no cambia, porque solo cambiaron comentarios.

**Pruebas nuevas** (con el código de la revisión 7 fallan 6 de las 8 de la web; las otras 2 vigilan lo que ya estaba
bien: sin nada apartado, y lo liberado que no es venta):
- `eventosConApartados`:
  - Sin nada apartado.
  - Lo abierto y el saldo.
  - La entrega: mismo instante, a los 5 minutos, una venta de 2 y una entrega parcial.
  - La pausa, con su edad de 25 días y no 40.
  - Cobrada a los 11 minutos.
  - Apartada y liberada en el mismo instante.
  - Una venta de otra unidad antes de liberarla.
  - Cerrar lo más viejo.
  - El libro que no cuadra.
- `analizarSede`:
  - P, Q y PE iguales, con la misma vara de categoría.
  - Lo liberado no es venta, y el saldo no es reciente.
  - La segunda talla.

13 cambios a propósito sobre `eventosConApartados` y su uso mueren todos. Los 35 de la revisión 7 (18 del constructor y
17 del verificador) mueren, menos uno que da lo mismo (el orden de lo apartado frente a los eventos del mismo instante en
el reloj).

**Cifras** (2026-09-27; cada suite SQL en una base nueva con todas las migraciones).
- **SQL:** `frescura_lectura` **207** (antes 205), `frescura_bajadas` 166, `temporadas` 25, `roles_por_modulo` 70,
  `roles_cobertura_modulos` 31, `una_sola_firma` 2, `fn_ledger_fuente_unica` 48, `bajada_al_piso` 51,
  `fn_resumen_comparacion` 25. Todas en verde; el único error del armado es el conocido de la talla «Única».
- **Web:** vitest completo, 206 archivos y 152.197 pruebas en verde. `frescura-reglas.test.ts` tiene **141** (antes 133)
  y `frescura-contrato.test.ts` 21. `tsc` limpio.
- `scripts/migraciones/versiones.mjs`: 352 archivos, ninguna versión repetida. `scripts/adr/numeros.mjs`: 236 ADR, ningún
  número repetido.

**Para la pantalla (paso 4), además de lo de antes:** «ventas recientes» incluye lo que se apartó en esos días. Una prenda
con separaciones abiertas puede ser pilar sin una sola boleta: la pantalla tiene que poder decir «3 apartadas».

### Revisión 9 del paso 3 (2026-09-28): lo apartado junto a una bajada tardía, la orden revertida, lo que nunca se colgó y dos decisiones de Felipe

Seis buscadores (SQL de producción, negocio, mutación del SQL, mutación de la web y dos de «punta») miraron la revisión 8.
Encontraron 21 hallazgos. Un verificador independiente reprodujo cada uno: 8 quedaron confirmados y 13 descartados. De los
descartados, 10 eran huecos de prueba (el código hace lo que se decidió, pero ningún cambio a propósito lo vigila) y se
cierran aquí con pruebas. Los otros 3 no piden nada (abajo).

**Por qué un cuarto archivo.** El PR #545 (revisiones 7 y 8) se fusionó a main el 2026-09-28 mientras esta revisión
corría. `20260928120320` ya está en main y no se edita (la regla de la revisión 4). Lo de la base va en
`20260928120330_frescura_lectura_revision9.sql`, que solo reescribe `fn_frescura_sede` y se pega DESPUÉS de las tres. Nada
del paso 3 está en producción todavía (`select` del 2026-09-28: solo `fn_temporada_efectiva` `1cc652ba…` y los pasos 1 y
2).

**La lección.** Fusionar con la revisión corriendo obliga a abrir un archivo nuevo por cada ronda de hallazgos: ya van
tres (`120310`, `120320`, `120330`) para una misma lectura que ninguna pantalla usa. Por eso el PR de esta revisión va en
**borrador** hasta que su verificación termine: GitHub no deja fusionar un borrador. Es la regla de ADR-0251 (rama
`claude/proceso-sql-pegado`, todavía no en main): «un PR con una revisión corriendo va en BORRADOR».

#### N1, F1 y F2 (juntos): lo apartado en los 10 minutos de una bajada

- **El problema.** La revisión 8 decidió que lo apartado es una venta desde que se apartó, y que la gemela vendida, la
  separada y la entregada dan lo mismo. Pero las bajadas tardías salían del núcleo, que solo mira ventas, y la web las
  limpiaba ANTES de leer lo apartado (`excluirTardias` → `eventosConApartados`). Tres síntomas:
  - **N1 y F1.** Separar una prenda recién bajada (en Vender, o el pedido de otra sede, que `separar_pedido_para_apartar`
    baja y separa en el MISMO instante) entraba a la vara y a la rapidez como una venta de 0 a 3 minutos. La gemela vendida
    a los 3 minutos es tardía y sale. La blusa del caso: la vendida, rapidez 0, quieta, con «cambiar de lugar» y
    «trasladar»; la separada, rapidez 148, pilar, sin sugerencias. Y esas ventas de 0 segundos acortaban los cortes que
    juzgan a TODAS las blusas.
  - **F2.** Entregar una separación dentro de la ventana de su bajada dejaba una unidad fantasma: `excluirTardias` borraba
    la venta de la entrega y la liberación quedaba como pausa sobre un piso vacío. El FIFO tenía 1 colgada donde el piso
    tenía 0: rapidez 51 contra 123 de la gemela, quieta y con «trasladar».
- **DECIDÍ** dos cambios chicos, uno en cada lado.
  - **Web** (`analizarSede`): el orden al revés, `excluirTardias(eventosConApartados(…))`. Así la venta que deja lo
    apartado (a la hora en que se apartó) ya está cuando se buscan las ventas que delataron la bajada, igual que la venta
    de la gemela. Arregla F2 solo.
  - **Base** (`fn_frescura_sede`): las tardías de la LECTURA cuentan lo apartado. Lo que se apartó en [t, t + 10 min] es
    vendido, y el piso de antes es el LIBRE (R7-1). Juntas, las dos cosas son una resta sola, con las cifras del mismo
    núcleo: `mínimo(efectiva, máximo(0, vendidas − piso de antes + apartado en el piso al cerrar la ventana))`. Sin nada
    apartado en la talla, es el número del núcleo, tal cual. Lo apartado se busca en el mismo mapa `apartados` que va a
    la web (se arma ahora antes del núcleo).
  - **La W (10 minutos) queda escrita una vez** en la función (`c_minutos`) y se le pasa al núcleo: la misma para las
    ventas y para lo apartado.
  - **El indicador de registro (`fn_confianza_registro`) NO cambia.** No castiga lo que se trajo a pedido para una clienta
    (plan 3c, riesgo 3). Por eso, desde ahora, las tardías de la lectura y las del indicador no son las mismas cuando hay
    algo apartado. La pantalla (paso 4) no puede mostrar la lista de tardías de la lectura como «el registro del equipo».
- **Por qué el piso LIBRE y no el del núcleo.** Con el piso del núcleo (que cuenta lo apartado como colgado), la segunda
  clienta del caso N1 ya no era tardía: la primera seguía con su separación en la misma talla, y el piso de antes era 1.
  Las gemelas solo coincidían la primera vez (lo mostró la prueba de las cuatro gemelas del archivo real, con tres rondas).
  Con el libre, las tres rondas dan lo mismo. Y lo que se entrega en la ventana no pesa: suma 1 a lo vendido y 1 a lo
  liberado.
- **DESCARTÉ:**
  - **Solo la web** (la segunda pasada del verificador de N1, con el piso libre calculado por la web). Serían dos
    implementaciones del «piso de antes»: la de la web no descuenta los retiros de [t − 10, t) como el núcleo, y hay que
    marcar a mano cuáles ventas salieron de un apartado. Son 50 líneas más contra una resta en SQL que usa las cifras del
    propio núcleo.
  - **Solo el SQL** (la propuesta del buscador de F1). El verificador lo probó: no cambia nada, porque la web limpiaba
    las tardías antes de ver lo apartado.
  - **Contar lo apartado también en el indicador.** Castigaría atender a una clienta con lo que se trajo del almacén: es
    lo que la decisión 2 del diseño 3c quiere evitar. Lo decide Felipe si algún día lo quiere.
  - **«Lo apartado menos lo liberado en la ventana», sin mirar lo apartado de antes.** Con dos separaciones seguidas de la
    misma talla, la segunda no salía tardía (la prueba T9d «DOS» lo vigila).
- **SE ROMPE SI:**
  - Una separación hecha en los 10 minutos de una bajada se abandona DESPUÉS de esos 10 minutos y en la ventana hubo otra
    venta que el piso libre de antes explicaba. La lectura saca esa venta de la vara. La web solo saca lo que en la ventana
    cuenta como venta, pero el tope viene de la base. Pide dos cosas de la misma talla en los mismos 10 minutos.
  - La pantalla del paso 4 muestra las tardías de la lectura como si fueran las del indicador.
- **En producción hoy no cambia nada:** 3 apartados, ninguno a 10 minutos de una bajada; 0 pedidos de otra sede (`select`
  del 2026-09-28).

#### R9-SQL-2: la orden del Taller revertida no es una llegada a CAYLA

- **El problema.** Una orden cerrada y después revertida (o revertida y anulada) dejaba su entrada «producción» en el
  libro, y `llegada_cayla_de` la tomaba como la última llegada del modelo+color. Reiniciaba su temporada en todas las sedes
  hasta la estación siguiente y apagaba «Temporada pasada», aunque esa mercadería nunca llegó.
- **DECIDÍ:** una entrada de producción cuenta solo si su orden SIGUE inventariada (`producciones.inventariado_at`, la
  convención de `fn_origen_producto`). Cerrar → revertir → anular, y revertir sin volver a cerrar, ya no mueven la
  temporada. Cerrar → revertir → volver a cerrar sí (las dos entradas pasan y manda la última, el segundo cierre).
  `fn_es_llegada_a_cayla` no cambia.
- **DESCARTÉ** netear cada entrada contra las salidas «reversion_produccion» de la misma orden y talla: da lo mismo en los
  casos reales y es más código en la consulta.
- **SE ROMPE SI** una orden cerrada hace meses se revierte para corregir el costo y se vuelve a cerrar: la temporada cuenta
  desde el segundo cierre. Ya pasaba antes; esto no lo empeora.
- **Lo que NO se tocó:** `fn_es_llegada` (las «entradas» de Análisis en `fn_resumen_comparacion`) sigue contando la
  producción revertida como entrada. Queda anotado en BACKLOG.
- **Pruebas:** T4j, con las funciones reales como el líder (`cerrar_produccion`, `revertir_produccion`,
  `anular_produccion`). Las órdenes de prueba de T4f y T4i ahora nacen cerradas e inventariadas: insertaban entradas de
  producción contra órdenes en proceso, un estado que solo deja una reversión.

#### N3: lo que entra al piso y se aparta en el mismo instante no es exhibición

- **El problema.** El pedido de otra sede sube la prenda al piso y la separa en una transacción: 0 segundos a la vista.
  Esa entrada era la primera exhibición del modelo+color. Si fue hace más de 120 días, el modelo quedaba «al menos» para
  siempre en esa sede y nunca volvía a ser «Nueva» la primera vez que de verdad se colgaba (decisión 9).
- **DECIDÍ:**
  - **Base.** En `primera_de`, una entrada al piso cuenta solo si entra más de lo que se aparta en su mismo instante, de la
    misma talla, en el piso de la tienda. Bajar 3 y apartar 1 al mismo tiempo sí es exhibición; bajar 1 y apartarlo a los
    3 minutos (en Vender) también.
  - **Web.** Sin primera exhibición (lo único que entró se apartó en el mismo instante), el reloj es «al menos» solo si
    algo de lo que entró tiene edad desconocida. Sin este cambio, el arreglo de la base dejaba «sin edad conocida» al
    pedido todavía separado dentro de la ventana (el verificador lo mostró).
- **DESCARTÉ:**
  - Dejarlo escrito como límite hasta el paso 4. No pasa antes de enero de 2027, pero el arreglo cuesta una búsqueda por
    índice y el paso 4 no debería heredar una lectura que miente.
  - Extenderlo a la bajada tardía de fuera de la ventana (lo que proponía el buscador). Esa unidad sí estuvo en el piso y
    se vendió desde ahí: es exhibición.
- **SE ROMPE SI** alguien baja una prenda y la aparta en la misma transacción sin que sea un pedido (hoy solo
  `separar_pedido_para_apartar` lo hace): tampoco cuenta como exhibición.

#### N2: la separación liberada vuelve con su edad

- **El problema.** R8 dice que lo liberado sin venderse es una pausa y vuelve con la edad que tenía. Pero la vuelta
  llevaba la marca de edad desconocida. Si mientras duraba la separación se bajaba otra unidad de la misma talla, esa
  bajada reanudaba la pausa (el FIFO de siempre) y la vuelta abría una cohorte «sin edad». La venta siguiente salía sin
  edad, la rapidez del éxito quedaba sin dato y el pilar de temporada pasada perdía «sigue vendiendo».
- **DECIDÍ:** la vuelta es la MISMA entrada interna que volver a colgar desde el almacén, sin la marca. La apartada queda
  igual a su gemela guardada. `inventario-exposicion.ts` no cambia.
- **DESCARTÉ** separar la pausa del apartado de la del almacén, para que una bajada no pueda reanudarla. Toca el FIFO único
  que comparte con Análisis (ADR-0208 (d)).
- **SE ROMPE SI** una separación no llegó a pausar nada (el libro no cuadra): la vuelta entra como unidad nueva con edad
  conocida, contada desde que se libera. Hoy no pasa en la operación normal.

#### F3: el desempate de los eventos del mismo instante

- **El problema.** `eventos` desempataba por el uuid, que es al azar. Regularizar una «Prenda sin registrar» como «llegó
  nueva» escribe la entrada y la venta en la misma transacción, con la misma hora. Con el piso en 0, la mitad de las veces
  la salida iba primero: el FIFO perdía la venta y dejaba una unidad fantasma. El verificador lo midió: 8 veces «revisa sus
  ventas» y 8 veces «cambiar de lugar» + «trasladar», con la misma historia.
- **DECIDÍ:** en un mismo instante, las entradas antes que las salidas (`order by ts, ord, delta desc, oid`).
  `fn_aplicar_movimiento` no deja sacar lo que no hay, así que con el piso en 0 es el único orden que pudo pasar.
- **DESCARTÉ** ordenar en la web (`historiaDeCohortes`): ese FIFO también es de Análisis, que ya está en producción.
- **SE ROMPE SI** un flujo nuevo escribe en una transacción una salida y DESPUÉS una entrada de la misma talla en el piso,
  con stock de sobra: se leería al revés siempre. Hoy ninguno lo hace (`regularizar_prenda` y `registrar_cambio` escriben
  primero la entrada).
- **Lo que no cambió:** los puntos de `apartados` siguen desempatando por uuid. Ahí el signo no decide el orden (apartar y
  liberar en un mismo instante son posibles en los dos órdenes). Queda abierto, abajo.

#### R9-MUT-1: el indicador sin tienda da a cada sede sus cifras

- **El problema.** Ninguna prueba vigilaba que `fn_confianza_registro()` sin tienda (la llamada de la web) diera a cada
  sede sus propias cifras. Con el cruce sin la sede, Lima salía con las cifras de Trujillo, y la suite seguía en verde si
  el seed tenía menos de 20 minutos.
- **DECIDÍ:** la prueba T10e (la del verificador). Dos tiendas con cifras distintas, y cada fila de la llamada sin tienda
  igual a la de esa tienda pedida sola. No depende de la edad del seed. La función no cambia.

#### Las dos decisiones de Felipe (2026-09-28)

- **Pregunta 8 (revisión 6), DECIDIDA: un éxito sin dato de rapidez recibe «sigue vendiendo».** Lo que vino en la carga
  inicial no tiene dato de rapidez. Si su temporada ya pasó y vendió en sus últimos 30 días en el piso (`recientes =
  vendio`), recibe lo mismo que su gemelo con dato: solo «sigue vendiendo», nunca «trasladar» (`sugerenciasDe`).
  - **Paga:** sin índice no se sabe si vende «bien». La chompa de invierno del archivo de la web (1 de 4 vendida en 42
    días, en una categoría sin referencia) también dice «sigue vendiendo». Felipe aceptó pagar eso.
  - **El que no vendió en sus últimos 30 días** sigue con su escalera y «retirar»: la regla es «se sigue vendiendo», no «no
    tiene dato».
  - **La prueba de los bikinis gemelos** (antes «PENDIENTE DE FELIPE») ahora exige lo mismo para los dos. La venta de la
    chompa del archivo va relativa a hoy (hace 10 días), para que la prueba no dependa del día en que se rehaga.
- **Revisión 8, DECIDIDA: una separación abierta cuenta como venta DESDE QUE SE APARTA.** Confirma lo construido. Si la
  clienta no vuelve, la lectura siguiente la vuelve pausa (el «SE ROMPE SI» de la revisión 8). No cambia código.

#### Los huecos de prueba (descartados como defecto, cerrados con pruebas)

Ninguno cambia conducta. Cada prueba cae con su cambio a propósito:

- **La W de 10 minutos en las dos lecturas y el corte 2W del indicador (T9e).** Una venta a los 7 minutos es tardía en
  `fn_frescura_sede` y en `fn_confianza_registro`. En el indicador, la bajada de hace 17,5 minutos todavía no cuenta y la de
  hace 21 sí. Mueren W = 5 en cualquiera de las dos y 2W = 16 o 22.
- **Los bordes de las dos ventanas de la web.** A los 10 minutos justos, la venta es la entrega y delata la bajada; un
  milisegundo después, no. Mueren 9 minutos, 10,9 minutos y el borde sin incluir, en cada una.
- **El FIFO** (`inventario-exposicion.test.ts`):
  - La parte que vuelve del almacén conserva sus días.
  - Dos pausas seguidas suman.
  - Una pérdida de lo que no tiene edad conserva la marca. Además, en `frescura-reglas.test.ts`, esa pérdida no entra a
    la curva.
- **La entrega tiene que ser una venta.** Liberar y retirar al almacén a los 3 minutos es pausa y retiro.
- **Una venta no es la entrega de dos liberaciones.**
- **Las ventas recientes y el reloj leen los eventos CON las tardías.** La talla que se trajo del almacén cuando la clienta
  la pidió vendió en sus últimos 30 días; la historia que es solo una tardía tiene 3 minutos de reloj, no 0.

**Los otros tres descartados, que no piden nada:**
- **El costo con 3 años de historia** (R9-SQL-1). El costo crece con la vida de los modelo+color de la lista, no con el
  libro entero. El cruce de 1 s ya es el riesgo aceptado de este ADR («SE ROMPE SI … la lectura pasa de 1 s por tienda»), y
  su remedio es la foto diaria.
- **La prenda cuya única entrada de la ventana es a la cuarentena** (R9-MUT-4). Entra a la lista sin hacer daño, como la
  que solo está en el almacén.
- **Las prendas sin categoría** (F4). Ningún camino vigente crea una: los tres caminos de alta exigen una categoría activa.

#### Cómo se pega (reemplaza el de «Revisión 8»)

Cada archivo va solo en el SQL Editor, en este orden, a cualquier hora. Solo traen funciones, un comentario, `revoke` y
`grant`: sin políticas, sin `drop trigger`, sin `alter` (ADR-0195). Después de cada uno se verifica con `select proname,
md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_es_llegada',
'fn_es_llegada_a_cayla', 'fn_frescura_sede', 'fn_confianza_registro', 'fn_temporada_efectiva_nucleo',
'fn_temporada_efectiva')`.

| Después de pegar | Archivo (md5) | `fn_es_llegada` | `fn_es_llegada_a_cayla` | `fn_frescura_sede` | `fn_confianza_registro` | `fn_temporada_efectiva_nucleo` | `fn_temporada_efectiva` |
|---|---|---|---|---|---|---|---|
| Nada (producción hoy) | — | — | — | — | — | — | `1cc652ba0bef3e9783a014b840cb870f` |
| `20260928120300` | `40bf970f…` | `5089ba50874f611d96d5df751b63ed57` | — | `644e10126796adc1111702290c14f2bb` | `9c714f98dd2776eebb505846eb24c33a` | — | `1cc652ba0bef3e9783a014b840cb870f` |
| `20260928120310` | `e121f11e…` | igual | `7e1ffb6d9853027ec685fef46ec72a4c` | `51babffc09da4073691ee251882967c8` | `8c6f5e6c27916b99be10020b772bd6e0` | `2bf80eb239248cce88cf8062238f4dfc` | `e96b3c6c51fd12ca712e76d63efd6448` |
| `20260928120320` | `81e3ddeb…` | igual | igual | `7da85d7b7010659ba5a36a2478c89ad4` | igual | igual | igual |
| `20260928120330` | `93a6f028…` | igual | igual | **`affb0187f217b2da43c452007c1b2eed`** | igual | igual | igual |

Lo reproduje el 2026-09-28 sobre una copia de `aud_main` (producción antes del paso 3), cada archivo con `psql -1` (UNA
transacción, como el SQL Editor):
- 120300 → 120310 → 120320 dan las tres primeras filas. Es producción cuando Felipe pegue las tres.
- 120330 encima da la cuarta; pegada otra vez, no cambia nada.
- Con 120330 ya pegada, volver a pegar 120320, 120310 o 120300 aborta («otro cuerpo») y no deshace nada.
- Fuera de orden: 120330 sobre 120310 sin 120320 aborta con «pega antes 20260928120320» y deja los md5 de 120310. Después,
  120320 y 120330 entran.
- 120330 sola sobre producción de hoy aborta pidiendo 120300, 120310 y 120320.
- T12b recorre el mismo orden dentro de la suite (las cuatro, cada una dos veces, y la de revisión 9 fuera de orden).

Después se corre `pnpm datos:generar:produccion` con un volcado nuevo y `pnpm datos:comparar`, y se regeneran los tipos de
`packages/database`.

#### Costo

La carga sintética de siempre: una tienda, 2.000 prendas en 200 modelos con temporada, 20.000 bajadas, 10.000 ventas, 200
apartados y 50 liberaciones. El cuerpo de 120320 y el de 120330, en la misma base, 11 corridas alternadas:
- **`fn_frescura_sede`:** 848 ms (810-867) contra 810 (789-883) a 120 días, y 321 (312-333) contra 299 (294-308) a 30 días.
  Son +5 % y +7 %, dentro del +20 % permitido. Sin la búsqueda de N3 serían unos 14 ms menos a 120 días. Con esa carga,
  las dos dan la misma lectura: no hay nada apartado junto a una bajada.
- **`analizarSede`:** 144-146 ms contra 143-145 (3 series de 9): no cambia. Las lecturas no son iguales porque las 50
  liberaciones de la carga ahora vuelven con su edad (N2).

#### Cifras (2026-09-28; cada suite SQL en una base nueva con todas las migraciones)

- **SQL:** `frescura_lectura` **231** (antes 207), `frescura_bajadas` 166, `temporadas` 25, `roles_por_modulo` 70,
  `roles_cobertura_modulos` 31, `una_sola_firma` 2, `fn_ledger_fuente_unica` 48, `bajada_al_piso` 51,
  `fn_resumen_comparacion` 25. Todas en verde; el único error del armado es el conocido de la talla «Única».
- **Web:** vitest completo, 206 archivos y 152.211 pruebas en verde. `frescura-reglas.test.ts` tiene **151** (antes
  141), `frescura-contrato.test.ts` 22 (antes 21) e `inventario-exposicion.test.ts` 57 (antes 54). `tsc` limpio.
- **Con el código de antes:**
  - En la web fallan 14 de las 230 pruebas de Frescura y del FIFO.
  - En una base sin 120330 fallan 10 verificaciones del SQL: 6 de conducta (T9d, T3b, dos de T2j y dos de T4j) y 4 de md5,
    guarda y archivo.
- **Cambios a propósito:**
  - En la web mueren los 18: el orden de antes, la marca de la pausa, «al menos» sin primera exhibición, «sigue
    vendiendo» sin dato (de más y de menos), los dos bordes (tres cambios cada uno), la entrega que no es venta, una venta
    para dos liberaciones, recientes y reloj sin las tardías, y los tres del FIFO.
  - En el SQL mueren los 16, cada uno por una verificación de conducta, no solo por el md5:
    - sin lo apartado, sin lo apartado de antes, 5 minutos, sin el borde;
    - W = 5 en el núcleo y en toda la función;
    - tres sobre N3;
    - sin R9-SQL-2;
    - dos sobre el orden;
    - y cuatro sobre el indicador: W = 8, W = 11, el núcleo con W = 5 y el cruce sin la sede.
- `scripts/migraciones/versiones.mjs`: 353 archivos, ninguna versión repetida. `scripts/adr/numeros.mjs`: 236 ADR, ningún
  número repetido.

#### Lo que queda abierto

- **`fn_es_llegada` (Análisis) cuenta la producción revertida como entrada.** Es el mismo caso de R9-SQL-2 en
  `fn_resumen_comparacion`. No se tocó; está en BACKLOG.
- **Los puntos de `apartados` del mismo instante siguen desempatando por uuid.** Apartar y liberar la misma talla en una
  transacción son posibles en los dos órdenes, así que el signo no decide. Hoy ningún flujo lo hace en el piso.
- **El libro (`fn_ledger_puntos`, paso 1, en producción) también desempata por uuid.** F3 corrige solo la lista que lee la
  web. Si alguna vez una bajada y una salida de la misma talla caen en la misma transacción con el piso en 0, el núcleo
  podría ver un piso de antes negativo («dudosa»). No hay caso real; se mira si aparece.
- **Para el paso 4:**
  - Las tardías de la lectura no son las del indicador (lo apartado cuenta en la primera, no en la segunda).
  - Un modelo cuyo único paso por el piso fue un pedido separado al instante no tiene primera exhibición: se muestra
    «Nueva» con 0 segundos, como lo que solo está en el almacén.
  - «Sigue vendiendo» también para lo que no tiene dato de rapidez.
