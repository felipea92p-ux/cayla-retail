# ADR-0208 — Frescura del piso: tres relojes, modelo+color por sede y percentiles de su categoría

**Fecha:** 2026-09-24
**Estado:** Diseño aprobado por Felipe el 2026-09-24, en cinco tandas de preguntas. Desde el 2026-09-25 se construye
**por bloques** (ver «Orden de construcción»). **Los bloques 1 y 2 están construidos y fusionados en `main`** desde el
2026-09-25: el 1 (bajar al piso escaneando, «Reposición» cerrada en el piso y la lectura de qué bajadas fueron tardías;
#434, ver «Construcción — bloque 1») y el 2 («Retirar del piso»; #440, `60d5aa4d`, ver «Actualización 2026-09-25 —
bloque 2» y «Actualización 2026-09-25 — revisión del bloque 2»). **La web de los dos ya está publicada** (Vercel
publica cada push a `main`). **En producción, según Felipe (2026-09-25):** la `0200` y la `0400` están pegadas y
`fn_verificar_bajadas()` devuelve 0 filas; la `0000` y la `0300` están sin confirmar; la `0100` no se confirmó por
separado, pero sus dos tablas tienen que existir, porque `fn_verificar_bajadas()` las lee y respondió. Falta confirmar
(o pegar) la `0000` y la `0300` cuanto antes, pegar después la `20260926150000` de la revisión y encender el módulo en
los roles (ver (f)). El bloque 1 se probó en el navegador sin base de datos (respuestas simuladas; escritorio y 375 px):
ver «Verificación en local». Del bloque 3 en adelante no hay nada construido.
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
accesos (`20260926150000`) y la opción `bloqueado` de `<Modal>`.

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
   lectura. **Construido el 2026-09-25 y fusionado (#434); en producción, en parte** (estado en la cabecera y en (f)).
   El indicador de «confianza del registro» por sede pasó al bloque 3.
2. **Bloque 2 — «Retirar del piso»** (paso 2): no hace falta una función nueva, falta la pantalla. Es `mover_interno`
   con origen (piso) y destino (almacén) invertidos. *Corregido el 2026-09-25: este punto decía «la función existe»
   pensando en `devolver_a_almacen`, que era del modelo V1 y ya no existe; `bajar_a_piso` tampoco.*
   **Construido y fusionado el 2026-09-25** (#440, `60d5aa4d`; ver «Actualización 2026-09-25 — bloque 2»). Su web ya
   está publicada; la revisión suma la migración `20260926150000`, por pegar.
   - **Pendiente entre el bloque 2 y el 3: el candado de `mover_interno`** (un token contra el doble envío, como el de
     `bajar_al_piso`). Hoy «Reponer» y «Retirar del piso» pueden mover dos veces si se reenvía el mismo pedido. Va
     ANTES del bloque 3 porque el indicador de confianza (Σ `cantidad`) y los relojes leen esas filas: un envío doble
     infla las dos cosas. Es un cambio de la base, con su migración y su ensayo (detalle en «Actualización 2026-09-25
     — revisión del bloque 2»).
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
  alto de esa ventana).
- **Desde el bloque 2 (hallado en su revisión): un retiro DESPUÉS de una bajada no la corrige.** Si se escanearon 10
  y solo se colgaron 6, y a los 5 minutos se retiran 4 con «Retirar del piso», la bajada sigue con cantidad 10:
  `bajada_piso_items` guarda la cantidad original, ninguna función la corrige, y `fn_bajadas_del_piso` la lee entera
  (`20260926000300`). El denominador del indicador (Σ `cantidad`) cuenta 4 prendas que nunca se colgaron. La ventana
  del punto anterior mira ANTES de la bajada y no ve este retiro. Por eso el contrato del bloque 3 tiene que netear
  también los retiros de la misma prenda en [t, t + ventana]. Hasta entonces, «Retirar del piso» devuelve la prenda al
  almacén, pero no deshace la bajada.

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

**Estado al 2026-09-25 (lo dijo Felipe; corregido en la revisión del bloque 2).** El orden de abajo ya no se cumplió:
la web de los bloques 1 y 2 salió con la fusión del #434 y del #440 (Vercel publica cada push a `main`), antes de
confirmar la `0000`. Hoy: `0200` y `0400` **pegadas** (`fn_verificar_bajadas()` = 0 filas); `0100` no confirmada por
separado, pero sus tablas existen si esa función respondió; `0000` y `0300` **sin confirmar**. Lo que queda:
1. Confirmar la `0000` y la `0300` con consultas de solo lectura en el SQL Editor: `select count(*) from retail.modulos
   where clave = 'bajada_piso';` (1) y `select to_regprocedure('retail.fn_bajadas_del_piso(uuid, timestamptz,
   timestamptz, integer)') is not null;` (`true`). La que falte se pega **cuanto antes**: mientras falte la `0000`,
   Roles y accesos muestra «Bajada al piso» y encenderlo falla, y el mensaje de la `0400` le dice a la colaboradora que
   pida al líder ese mismo módulo. Las dos se pueden repegar.
2. Pegar `20260926150000_existencias_incluye_retirar_del_piso.sql` **después de la `0000`**: el upsert de la `0000`
   escribe el texto viejo de Existencias; si la `0000` se pega (o se repega) después, hay que repegar la `150000`.
3. Encender «Bajada al piso» en los roles (ver abajo) y refrescar el diccionario (paso 7).

El orden original, que sigue valiendo como referencia de qué hace cada archivo: cinco archivos, una ejecución por
archivo, con la web publicada entre el cuarto y el quinto. Ya traen `retail.` y se pueden repegar (en local, cada uno
se aplicó dos veces seguidas sin error). Sus cabeceras dicen «PARTE n de 5» y repiten este mismo orden.
1. `20260926000000_bajada_piso_modulo.sql`: solo el módulo «Bajada al piso» y el texto corregido de Existencias
   («Consultar stock, reponer el piso, ajustar stock, apartar prendas»; la `20260926150000` de la revisión del bloque 2
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
8. *(Revisión del bloque 2)* `20260926150000_existencias_incluye_retirar_del_piso.sql`, **después de la `0000`**: un
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
  una nota en ADR-0202, porque `20260924030000` ya está en producción.
- **Preguntas abiertas para Felipe:**
  - ¿Se enciende en la Terminal de ventas? Resuelve el «Stock insuficiente» de la cajera, pero facilita justo la
    bajada al cobrar. Por defecto: Terminal Almacén y quien cuelga; la de ventas, después de decidir la D-40.
  - **D-40 contra la caja, antes del bloque 3:** o manda V2 (la caja dice «hay N en el almacén: tráela al piso» y la
    D-40 se retira por escrito), o manda la D-40 (la caja baja sola, toda bajada nace tardía y la marca se redefine).
    Sin eso, el indicador mide el diseño de la caja y no a las colaboradoras.
  - «Reponer» solo aparece en las filas con 7 o menos en el piso (`UMBRAL_REPOSICION_PISO`). Quien tiene Existencias sin
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
  no trajo migración; su revisión sumó una chica, solo de texto (`20260926150000`).
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
  prendas». La pantalla lo lee de `lib/modulos.ts`, y la `20260926150000` deja la base con el mismo texto (ninguna
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
  que mirar también [t, t + ventana], no solo [t − ventana, t] (ver «Límites conocidos de la marca»).

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
   aparte, ya pegada la `20260926150000`: `select incluye from retail.modulos where clave = 'existencias';` da el
   mismo texto.

**La lección.** El bloque 1 y el bloque 2 los trabajaron dos sesiones distintas el mismo día, sobre el mismo módulo y
con dos planes. La revisión cruzada encontró sobre todo textos que prometían lo que la pantalla no hacía: un «no se
guardó nada» que podía ser falso, un «dilo en la nota» que nadie iba a leer, un filtro que decía «bajada o retiro» y
traía más, un PR que el documento daba por pendiente cuando ya estaba en `main`. Un texto de pantalla o de documento
es parte del contrato: se revisa como el código.
