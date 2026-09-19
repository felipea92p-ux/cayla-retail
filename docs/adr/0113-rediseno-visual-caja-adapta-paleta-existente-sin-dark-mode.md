# ADR-0113 — Rediseño visual de Caja: se adapta a la paleta ya decidida, sin modo oscuro

**Fecha:** 2026-09-18
**Estado:** Aplicado (Caja y Punto de Venta)
**Nota de numeración:** escrito originalmente como ADR-0101; renumerado a 0102 al
sincronizar con `main`, donde esa numeración ya la había tomado la sesión de "Resumen de
Inventario" (`0101-resumen-inventario-quinta-pantalla.md`), fusionada mientras esta rama
seguía sin pushear. Renumerado por segunda vez, a **0113**, el 2026-09-18: `main` ya tenía
otro `0102-emitir-comprobante-idempotente-y-valida-igv.md` (dos ADR con el mismo número; el
de comprobantes conserva el 0102). Se tomó 0113 y no 0112 porque el 0112 ya lo habían
reclamado dos ramas en vuelo (`0112-ventas-y-devoluciones-solo-se-escriben-por-rpc` y
`0112-pos-comprobante-termico-y-ajustes-de-vender`): con 0112 habría un tercer choque.

## Contexto

Felipe pidió rediseñar Caja (visual e interactiva, con KPIs, dona de métodos de
pago, barras por hora, timeline de movimientos, historial de cierres) y
extender el mismo lenguaje visual a Punto de Venta, a partir de una maqueta
HTML de referencia (`CAYLA_CORP_OPS_202609_MockupCaja.html`).

La maqueta traía su propia paleta (fondo `#f9f9f7`/`#0d0d0d`, acento terracota
`#b6552f`/`#e07a4f`) con **modo oscuro persistente** y sombra visible en
tarjetas en reposo. Eso choca de punta a punta con decisiones ya tomadas y
documentadas en este repo:

- `globals.css:130` (puente shadcn/ui): *"Sin modo oscuro: el brandbook es una
  sola paleta, no dos."*
- Brandbook v3.0 (`design-tokens.ts`): tres colores únicos (rojo `#b8412d`,
  crema `#f5f0e8`, tinta `#1a1a18`), rojo capado a máximo 2 usos por pantalla
  como "acento sagrado".
- ADR-0012: sombras reactivadas **solo** para lo que flota (modal, desplegable)
  — "lo que está pegado al fondo (tarjetas, tablas, celdas) sigue sin sombra".

Se le presentó la disyuntiva a Felipe (paleta/dark mode nuevos solo para
Caja+POS como isla visual, vs. como estándar de toda la app, vs. traducir la
maqueta a la identidad ya existente) antes de escribir código.

## Decisión

**Se traduce el layout, las animaciones y los componentes de la maqueta a la
paleta CAYLA ya existente. Sin modo oscuro.** Elegido por Felipe entre las tres
opciones — ver conversación del 2026-09-18.

Consecuencias concretas de esa elección:

- **Colores categóricos nuevos, pero de DATO, no de marca**: `--color-metodo-efectivo`
  (azul `#2f5f8a`), `--color-metodo-tarjeta` (`#96541a`), `--color-metodo-yape`
  (`#1f7a68`), agregados a `globals.css` y `design-tokens.ts`. Los tres miden
  ≥4.5:1 sobre crema/papel (efectivo 5.92:1, tarjeta 5.18:1, yape/plin 4.59:1),
  misma vara que el resto de tokens. No cuentan contra el cupo de 2 rojos por
  pantalla — son una familia aparte, para que Caja y Vender pinten el mismo
  método con el mismo color sin gastar el acento de marca.
- **Sombra al pasar el mouse, no en reposo**: las tarjetas KPI usan
  `.card-cayla.alza-cayla` (ya existente, `globals.css`) — elevación + sombra
  SOLO en `:hover`, nunca en reposo. Cumple el pedido de "hover con elevación"
  sin reabrir ADR-0012.
- **Radios**: la escala real (4/8/12/16/22px, ADR-0012) ya cubre lo pedido
  (12-16px) — no hizo falta ningún cambio acá.
- **Badge de estado reinterpretado**: la maqueta pedía "Caja balanceada" /
  "Descuadre detectado" calculado en vivo contra ingresos/egresos/ventas. Eso
  es imposible de calcular honestamente: `getResumenCaja` es un **conteo
  ciego** (ADR-0042) — a propósito no expone el monto esperado del cajón
  mientras la caja sigue abierta, así que no hay ningún "esperado" real contra
  el cual comparar antes del cierre. El badge se re-especificó contra una señal
  real y disponible: la cola de ventas offline sin sincronizar
  (`ventas-offline.ts`) — verde "Todo sincronizado" / ámbar "N venta(s) sin
  sincronizar". Mismo lenguaje visual (ícono+texto+color), dato verdadero.
- **Banner de alerta de egresos, no construido**: la maqueta mostraba "egresos
  32% por encima del promedio semanal". No existe ningún rollup histórico de
  egresos por día en ningún lado (`getHistorialCierres()` no trae desglose de
  egresos). Se decidió NO inventar el número — queda en BACKLOG.
- **"vs. mismo día de la semana anterior" en la barra de meta, no construido**:
  mismo motivo — no hay una cifra de "ventas totales del mismo día hace una
  semana" en ningún lado; `montoCierreSistema` mide otra cosa (lo esperado en
  el cajón, no el total vendido). Queda en BACKLOG.

## Consecuencias

- Nueva columna `retail.ubicaciones.meta_venta_diaria numeric null`
  (`20260918100000_meta_venta_diaria_por_ubicacion.sql`) — nullable, sin
  default inventado; si es null, la barra de meta simplemente no se muestra.
  Aplicada en local; **pendiente producción con ok de Felipe**.
- `lib/caja.ts`: `MovimientoCaja` gana `registradoPorNombre` (resuelto vía
  `fn_nombres_personas`, mismo patrón que el resto del archivo); nueva
  `getSeriesVentasCaja()` para la serie horaria y el desglose por método —
  separada de `ResumenCaja` a propósito, para no mezclar el contrato del
  conteo ciego con lo que existe solo para dibujar.
- Punto de Venta, extendido en el mismo hilo: la mayoría de `PuntoDeVentaCatalogo.tsx`/
  `PuntoDeVentaTicket.tsx` ya calzaba (tarjetas de producto, total en serif, botón
  "Cobrar") — solo cambiaron los chips de categoría/stock (`rounded-lg`→`rounded-md`,
  el radio real de la "pastilla") y el color del selector de método de pago, ahora con
  los mismos 3 categóricos de la dona de Caja.

## Adenda 2026-09-18 (segunda tanda) — acciones arriba, sin "Cambios", dona con profundidad y movimiento

**Pedido:** las acciones de la caja arriba y a un lado (no en la barra de abajo), fuera el
botón "Cambios", y una dona "menos plana" con animación al entrar a la vista y al pasar el mouse.

**Decisión.**

- **Acciones al encabezado.** "+ Ingreso / egreso" y "Cerrar caja" pasan a la derecha del
  encabezado de `CajaAbiertaPanel.tsx`; desaparece la barra fija (y el `pb-24` que le hacía
  lugar). El chip de sincronización pasa junto al título para dejarles el lado. "Cambios" no se
  pierde: sigue en el menú lateral (Ventas → Cambios).
- **La dona es ahora `components/ui/DonaMetodos.tsx`** (sale de `Graficos.tsx`: necesita estado
  y entrada animada; las otras tres formas siguen siendo funciones puras). SVG puro, sin
  librería, igual que el resto de los gráficos — no hizo falta ningún componente externo.
  Lenguaje de cuadrante de reloj: bisel de 100 marcas que es una escala de porcentaje real (1 %
  cada una), arcos con degradado y resplandor, y una aguja que barre y descubre el anillo al
  entrar. Al apuntar un método —en el arco o en su fila de la leyenda— el arco se adelanta, los
  otros se apagan, se encienden sus marcas del bisel y el centro muestra su % y su monto.
- **Excepciones declaradas, solo para esta dona** (no sientan precedente para tarjetas ni para
  los otros gráficos):
  1. *Degradado y resplandor.* La "Capa de movimiento" de `globals.css` y ADR-0012 sostienen
     "sin gradiente" y "sin sombra en lo que está pegado al fondo". La dona lleva un degradado por
     arco (una sola luz, arriba-izquierda, para todos) y un resplandor desenfocado del color de
     su método.
  2. *Entrada animada.* Se levanta, para esta dona, la regla "nada se anima solo al entrar a la
     pantalla": barrido de 1,3 s cuando queda ≥ 40 % a la vista, que se repite si sale entera y
     vuelve; el total cuenta hasta su cifra y las filas de la leyenda entran escalonadas.
- **Lo que se mantiene:** nada rebota (todo con `--ease-cayla`: "instrumento, no juguete");
  `prefers-reduced-motion` ve el resultado sin el viaje (`.anim-dona-*` en `globals.css`, la
  aguja se oculta); la dona sigue siendo decorativa (`aria-hidden`), con la leyenda y la tabla
  alternativa como texto real. Los colores siguen siendo los tres de dato (`--color-metodo-*`).
- **Geometría separada y probada:** `lib/dona-geometria.ts` (arcos, huecos, desfases, a qué
  arco pertenece cada marca) con `dona-geometria.test.ts` — mismo patrón que
  `caja-panel-reglas.ts`.

**Se rompe si:**

- Se cambia `RADIO` sin rehacer el `viewBox` (200×200) y los radios fijos del bisel, la esfera y
  la aguja: están escritos contra 70.
- Se toca el largo de la máscara de barrido (`BARRIDO` = circunferencia redondeada arriba) sin
  que `--dona-c` lo siga: el barrido deja un tramo sin descubrir. Hoy el CSS lo lee del
  componente, así que solo pasa si alguien escribe el número a mano en `globals.css`.
- Se agrega una animación con `both`/`forwards` a las filas de la leyenda: fijaría su opacidad
  y el atenuado al apuntar dejaría de verse (por eso `.anim-dona-fila`/`-barra` usan
  `backwards`).

**Verificación.** En navegador (Playwright) contra una página temporal con datos de mentira,
ya borrada — no se usó la sesión real para no cruzar la cookie de Supabase con otro `next dev`:
2, 3 y 1 método; ratón real sobre el anillo (arco correcto, área de apuntado que no captura el
bisel, restablece al salir); entrada y re-entrada por scroll; escritorio, tablet y móvil;
consola sin avisos. El navegador de pruebas iba a ~1 fps, así que el movimiento se verificó
buscando instantes exactos con la API de animaciones y no a ojo en tiempo real. **No
verificado:** con la caja real, ni con un dedo en una pantalla táctil (el toque alterna el
método apuntado; está razonado, no ejercitado).

### Tercera tanda — encabezado sin avatar, reloj y estado con vida

- **Sin avatar.** Las iniciales no informaban (el nombre ya está en la línea de al lado);
  `iniciales()` sale de `caja-panel-reglas.ts` con su prueba. Se conserva lo que sí informa: la
  hora que corre y el estado de sincronización.
- **`RelojDeCaja`**: la hora en serif con cada dígito en su caja de ancho fijo (rueda a su lugar
  solo el que cambió), una aguja de segundos que da la vuelta cada 60 s y arranca en el segundo
  real, y "Abierta desde… · lleva 2 h 08 min" (`duracionAbierta`, regla pura probada).
- **`EstadoSync`**: onda suave detrás del ícono, visto que se traza al aparecer y re-asentado
  al cambiar de estado. Región `role="status"` estable, y el ícono distinto (visto/alerta)
  mantiene el estado legible sin depender del color.
- **Excepción declarada, ampliada.** La primera adenda levantó "nada se anima solo al entrar" para
  la dona. Aquí hay además movimiento **continuo** (la aguja y la onda no paran mientras la caja
  está abierta): es una hora real que corre y un estado real, no adorno, y se apaga por completo
  con `prefers-reduced-motion` (`.anim-caja-aguja`/`.anim-caja-ping` a `animation: none`; la
  onda parte de `opacity: 0` para no quedar como un disco sólido). El "hilo vivo" rojo sigue
  siendo lo único rojo que se mueve: la aguja es de tinta.
- **Hidratación:** el reloj y "Abierta desde…" nacen en `null` y se muestran al montar. La hora
  del servidor (UTC en Vercel) difiere de la del cliente; antes "Abierta desde las…" se pintaba
  en el servidor y podía desajustarse.
- **Colores de método de pago:** la dona lee los tokens `--color-metodo-*`. La rama del POS
  (sin fusionar) los cambia por cobre/plomo/morado y agrega `plin`/`transferencia`; se comprobó
  pisándolos en una vista previa que la dona sigue viéndose bien sin tocar código. Cuando
  llegue, hay que revisar que `ETIQUETA_METODO` (`CajaAbiertaPanel.tsx`) use el token propio de
  `transferencia` en vez de `--color-taupe`.

### Cuarta parte — "Ventas por hora" se cambia por "Ritmo del día"

- **Por qué se quita el gráfico por hora.** No se entendía (sin cifras, la barra mayor siempre
  llenaba la caja, la raya roja de la hora sin ventas parecía dato) y con pocas ventas al día un
  histograma por hora es casi ruido: es una herramienta de reporte (necesita semanas), no de caja
  abierta. La lista de "Movimientos recientes" ya dice la hora de cada venta.
- **Qué lo reemplaza (elegido por Felipe entre tres caminos comparados).** `RitmoDelDia`: ventas,
  ticket promedio y desde la última venta, y una línea de tiempo apertura → ahora con una venta
  por punto (tamaño = monto, color = método, pago mixto = punto partido, apilado si caen juntas).
  Contesta "¿cómo va el día?" en dos segundos con pocas o muchas ventas. Sin consultas nuevas.
- **Reglas de datos** (`ritmoDelDia`, con pruebas): `fn_ventas_del_dia` trae las ventas de hoy de
  la ubicación, incluidas las de cajas anteriores del mismo día → solo cuentan las posteriores a
  la apertura de ESTA caja; si quedó abierta de ayer, el eje arranca a medianoche y la etiqueta
  dice "Desde medianoche". La `hora` es texto `HH:MM` en hora de Lima: el eje se calcula en
  hora de Lima, no en la del navegador.
- **Movimiento:** la línea se traza y los puntos entran de izquierda a derecha al ver la tarjeta
  (se repite al volver a verla), y el extremo "ahora" lleva la misma onda que el estado de
  sincronización. Mismas excepciones y mismo `prefers-reduced-motion` que la dona.
- **Se rompe si** `hora` dejara de venir como `HH:MM` de Lima (los puntos caerían corridos), o si
  `ventasHoy` dejara de incluir las ventas de la caja actual (las cifras no coincidirían con los
  KPI de arriba, que salen de `resumen`).

### Quinta parte — la Caja usa todo el ancho de la pantalla

- **Decisión.** `/caja` entra en `SIN_TOPE_DE_ANCHO` (`AppShell.tsx`), la lista que ya usan Vender,
  Compras, Productos e Inventario: el tablero deja de vivir en la columna de lectura de
  `max-w-5xl` (~1023 px) y a 1878 px de pantalla pasa a ~1526 px de contenido. Pedido de Felipe,
  con la misma razón que dio para el Punto de Venta: sobraba margen a los lados.
- **Qué NO se estira.** La lista actúa por prefijo, así que entran también el formulario de abrir
  caja (un campo, sin tope propio) y el historial de cierres (tabla con una columna flexible). Los
  dos conservan `max-w-5xl` puesto por su cuenta: no fueron pensados para estirarse y no eran lo que
  se pidió. Quien no tiene caja abierta ve lo mismo que antes.
- **Aprovechar, no solo estirar.** Con todo el ancho la fila de abajo pasa a dos columnas iguales
  alineadas con la de arriba (`2xl`), y la dona escala con el ancho de su tarjeta (container
  queries), no con el de la pantalla.
- **Se rompe si** se agrega otra ruta bajo `/caja` que sea una tabla o un formulario: heredará el
  ancho completo y habrá que toparla como esas dos.

### Sexta parte — el tablero decide por su propio ancho, y se actualiza en vivo

- **La disposición sigue al ancho del tablero, no al de la ventana** (`@container` en un contenedor que
  envuelve encabezado, meta, KPI y cuerpo). Razón medida: la barra lateral y los márgenes se comen ~350 px,
  así que la misma pantalla da 700 o 1500 px de tablero. Umbrales: 560/800 (columnas de KPI), 720
  (encabezado en dos zonas), 900 (dos columnas) y 1400 (encabezado en tres zonas y cuerpo en tres columnas).
- **Por qué el rango medio no es 2×2:** una tarjeta mucho más alta que su vecina en una fila de dos
  columnas la estira y la deja medio vacía (el historial quedó a 555 px con la mitad en blanco). En su
  lugar, historial y movimientos a ancho completo (estos en dos columnas). En ancho de sobra,
  "Movimientos" pasa a riel alto a la derecha: su alto natural coincide con las dos filas de la izquierda.
- **Los modales van FUERA del contenedor.** `container-type` aplica contención de layout, y el `Modal`
  del sistema usa `fixed inset-0` sin portal: dentro del contenedor, su overlay cubriría el tablero y no
  la ventana. Se comprobó que cubre 0,0 · 1878×978.
- **Actualización en vivo por sondeo, no por Realtime.** ADR-0018: Realtime no está activo sobre ninguna
  tabla y habilitarlo es un `alter publication` en el proyecto compartido con Dynamic, que se confirma con
  Felipe. `useCajaEnVivo` sondea cada 5 s con dos conteos (`HEAD` + `count=exact` sobre `ventas` y
  `caja_movimientos`, mismo RLS que las lecturas del servidor) y hace `router.refresh()` solo si el número
  cambia. No sondea con la pestaña oculta ni sin red; si falla, retrocede hasta un minuto. La huella
  compara contra la MEDICIÓN anterior, no contra lo que pintó el servidor: un panel servido desde la
  caché del router (`staleTimes`, ADR-0021) puede llevar hasta 30 s de retraso hasta la siguiente
  novedad — el compromiso ya aceptado allí.
- **Cómo se ve una venta nueva** (`useIdsNuevos`, `useAumento`): aviso "Nueva venta" con el sistema de
  avisos existente, velo e insignia "+S/…" en la tarjeta que subió, la dona señalando sola el método que
  creció (reusa el resalte del ratón; el ratón manda), onda en el punto nuevo del ritmo y resaltado de la fila
  nueva. Lo que ya estaba al abrir la pantalla no es "nuevo"; lo nuevo caduca a los 8 s. Todo termina
  invisible: con `prefers-reduced-motion` no queda nada pintado y quien informa es el aviso.
- **Se rompe si** alguien mueve un `Modal` dentro del contenedor `@container` (su overlay dejaría de cubrir
  la ventana), o si una consulta del sondeo deja de estar permitida por RLS para quien mira el tablero
  (el sondeo fallaría en silencio y el panel quedaría como antes, sin en vivo).
- **Falta** activar Realtime (necesita el ok de Felipe para el DDL) y ver el bucle completo con una
  sesión real: las piezas se verificaron por separado, no de punta a punta.
