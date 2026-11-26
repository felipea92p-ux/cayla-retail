# ADR-0321 · Vender registra la bajada al piso que se olvidó, sin frenar la venta

- **Fecha:** 2026-10-03 · **Estado:** construido en la rama `claude/prenda-no-registrada-piso-cbbfbf`, PR abierto. **Producción: la migración
  `20261003233000_bajar_al_piso_desde_vender.sql` está pegada desde el 2026-10-03** (con el ok de Felipe; versión `20261003194152`, ver «Aplicación en
  producción»). La web que la llama **todavía no está publicada**: nadie ve el botón hasta fusionar.
- **Pedido:** Felipe, 2026-10-03: «a veces están bajando prendas sin registrar en el sistema que se bajaron a piso. Después, al escanear el QR en el
  punto de venta, no les permite. Debe salir un aviso que diga que la prenda no se registró como bajada a piso y darle clic para que igual la agregue
  al ticket y desde ahí mismo actualizar las existencias […] para no interrumpir la venta cuando hay ese tipo de errores humanos».
- **Decisión de negocio de Felipe (2026-10-03):** **un solo botón** («Agregar y registrar la bajada»). Los dos botones del ADR-0208, bloque 3b
  («Ya estaba colgada» / «La traje del almacén»), siguen pendientes.
- **Cumple:** la D-40 («la caja no se frena nunca por un trámite», `docs/datos/DECISIONES-2026-09-12.md`), que hasta hoy la caja solo decía con un
  texto. **Complementa:** ADR-0208 (bajada al piso, marca de reintento, Frescura), ADR-0306 (una acción dentro de una pantalla es de su módulo),
  ADR-0162 (firma el responsable), ADR-0190 (candados en orden), ADR-0136 (modales), ADR-0284 (guía de foco).

## Qué había

- Una venta descuenta el **piso**, nunca el almacén en silencio (`inventario_piso_almacen.sql`). Con el piso en 0 y la prenda en el almacén de la
  misma tienda, Vender decía «está en el almacén: que la bajen en Inventario ▸ Existencias ▸ Reponer (aunque ya la tengas en la mano…)» y la prenda
  **no entraba al ticket**. La colaboradora dejaba a la clienta esperando, iba a Existencias, registraba y volvía a escanear.
- Y no siempre podía: «Reponer» pide **Existencias**, y el rol «Terminal de ventas» de la siembra ve Vender, Caja, Cambios, Devoluciones, Historial
  y Clientas, **no Existencias**. El aviso la mandaba a una pantalla que no tenía.

## Decidí

1. **El aviso ofrece el camino y su botón lo hace.** Cuando lo que frena a la prenda es el almacén de ESTA tienda —piso en 0 (`en_almacen`) o las
   del piso ya en el ticket con más en el almacén (`tope`), la condición de `quedoEnAlmacen`—, el aviso dice
   «*Blusa Paracas · M* no se registró como bajada al piso · En el sistema hay 0 en el piso y 2 en el almacén de Tienda TRU. Si ya la tienes en la
   mano, agrégala: la bajada queda registrada» y su botón **«Agregar y registrar la bajada»** registra la bajada y suma la prenda al ticket.
   «Agotada» y «apartada» no lo ofrecen: no hay nada que bajar. El aviso dura 15 s (hay que leer y decidir con la clienta delante).
2. **Una función nueva, con el candado de Vender** (`bajar_al_piso_desde_vender`, migración `20261003233000`). Pide **`fn_ve_modulo('vender')`**, no
   Existencias: el botón vive en Vender, y por ADR-0306 lo de adentro de una pantalla es de su módulo. Pide operar la tienda, firma el responsable
   (`fn_actor_persona_id(true)`), bloquea la prenda en el orden de ventas y traslados y escribe **la misma fila que «Reponer»** (`mover_interno`
   almacén → piso, `traslado`/`movimiento_interno`) con la nota **«Bajada registrada desde Vender»**. Movimientos, Actividad y Frescura la leen sin
   cambios.
3. **La caja manda cuántas tiene que haber en el piso, no cuántas bajar** (`p_piso_necesario` = las del ticket + la que entra + lo vendido sin
   conexión que aún no subió). La base baja **solo lo que falta**: si otra persona ya registró la bajada en Existencias mientras tanto, o la caja veía
   un piso viejo, no se baja nada y la prenda igual entra. Así un reenvío tras un corte de red tampoco cuenta la misma prenda dos veces en el piso.
   Vuelve lo libre en el piso y en el almacén DESPUÉS, y la caja lo usa sin releer.
4. **Se registra al tocar, no al cobrar.** La bajada es un hecho físico (la prenda ya está en el piso, o en la mano) aparte de la venta: si la clienta
   se arrepiente, la prenda sigue registrada donde está. Por eso **no** va dentro de `registrar_venta`.
5. **Si nadie eligió quién atiende**, sale una hoja chica «Registrar la bajada al piso» con **el mismo combo del ticket**
   (`components/punto-de-venta/RegistrarBajadaModal.tsx`): lo elegido ahí queda elegido para el cobro, así que no se pregunta dos veces. Con el
   responsable ya elegido (o una cuenta Admin) la hoja ni aparece.
6. **La cámara del teléfono** no pinta avisos encima del visor (le taparía la ✕): al cerrarla, el único aviso con lo que quedó fuera trae el botón
   «Agregar las N y registrar la bajada», para todas de una vez (una por una; si la base rechaza por el responsable o se cae la red, se detiene).
7. **El catálogo de Vender dice lo mismo:** la talla «en el almacén» de la ventana «Elige la talla» ya no está apagada (tocarla trae el aviso con el
   botón), y su texto y el del tooltip de la grilla dicen «si la tienes en la mano, tócala: se registra la bajada» en vez de mandar a Existencias.
8. **El botón de un aviso se toca con el dedo:** medía 16 px de alto; con relleno y márgenes negativos llega a 32 px sin moverse (vale para todo
   botón de aviso, «Deshacer» incluido; `app/estilos/avisos.css`).

## Descarté

- **Bajar dentro de `registrar_venta` (todo en una transacción).** Era lo más atómico, pero `registrar_venta` es la función más parchada del repo
  (18 parámetros, candado de huella; ese mismo día la parchaba el redondeo, ADR-0311), y una venta abandonada no registraría la prenda que ya está en
  el piso. *Lo que se paga:* dos escrituras separadas (la bajada y, después, la venta); cada una es todo o nada, y una bajada sin venta es verdad.
- **Abrir `bajar_al_piso` o `mover_entre_piso_y_almacen` también a Vender** (`existencias or vender`). Habría dejado a Vender mover listas enteras
  piso↔almacén y en las dos direcciones, y sus mensajes dirían «módulo Existencias». La puerta nueva hace una sola cosa: almacén → piso de lo que
  el ticket necesita.
- **Mandar «cuántas bajar».** Con dos personas registrando la misma prenda a la vez (una en Existencias, otra en la caja), la misma unidad quedaba
  dos veces en el piso y faltaba en el almacén.
- **Los dos botones del ADR-0208 (3b) ahora.** Felipe eligió uno (más rápido con la clienta esperando, sin columna nueva ni cambios en Frescura).
- **Agregar sin preguntar a nadie** (registrar al tocar sin aviso). El pedido es un aviso y un clic: el clic es la confirmación de que la prenda está
  en la mano, y sin él la caja bajaría prendas por un escaneo equivocado.

## Efecto que se acepta

- **Frescura** verá estas bajadas como «probable registro tardío» si la prenda se vende en menos de 10 minutos. Para el olvido, es exactamente lo que
  pasó; para la prenda que trajeron del almacén a pedido de la clienta, la cuenta castiga igual que hoy cuando van a Existencias. Lo arregla el 3b.
- **Quien ve Vender puede registrar una bajada** (almacén → piso de su tienda, de lo que su ticket necesita), aunque su rol no vea Existencias. Es la
  regla de ADR-0306; queda firmada con el responsable y en `movimientos` con su nota.

## Cómo se pega en producción

`20261003233000_bajar_al_piso_desde_vender.sql`, **tal cual y en una vez**, en el SQL Editor (trae `retail.` y `set search_path`), **ANTES de publicar
la web**. Solo `create or replace function` + `comment` + `revoke` + `grant`: no toma las tablas de `auth`/`storage` (ADR-0195), no lleva políticas,
`drop trigger` ni `select … into` entre comillas (ADR-0288). Re-ejecutable. Si la web se publicara antes, el botón responde «Registrar la bajada desde
Vender todavía no está activo. Regístrala en Inventario ▸ Existencias ▸ Reponer…» (probado quitando la función en local): no se pierde ninguna venta.
Verificación: `select pg_get_function_identity_arguments(p.oid) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname =
'bajar_al_piso_desde_vender';` → una fila, «p_ubicacion_id uuid, p_variante_id uuid, p_piso_necesario integer, p_token uuid».

## Aplicación en producción (2026-10-03)

Felipe dio el ok («pega la migración y abre el PR»). Antes, solo lectura: la función no existía; `mover_interno` (7 parámetros, con la misma clave de
candado de marca y `fn_actor_persona_id(true)`), `fn_bloquear_en_orden` (con sus valores por defecto), `fn_prenda_corta`, `fn_ve_modulo`,
`fn_puede_operar_ubicacion`, `movimientos_internos_intentos` y el módulo `vender` estaban como la función los usa. Y el dato que confirma el problema:
**la Terminal de ventas de producción tiene Vender y no Existencias**. Se aplicó el archivo tal cual por `apply_migration` (queda como
`20261003194152 bajar_al_piso_desde_vender` en `supabase_migrations.schema_migrations`). Después: una sola firma, `security definer` con el
`search_path` de la casa, anon no la ejecuta y authenticated sí, **el md5 del cuerpo vivo es idéntico al de una base armada desde el archivo**
(`562d05c0cc63a7a88bc96089acd09c69`), y dos llamadas sin sesión rechazan sin escribir nada (`bajada_vender_sin_token`, `bajada_vender_sin_modulo`).
El volcado de `docs/datos/generado/` se refrescó por diferencia en el mismo PR (foto 19:50 UTC: 154 relaciones, 795 funciones; entraron esta función
y `fn_comparativa_caja`, que otra rama pegó el mismo día).

**Renumerado el mismo día:** nació como ADR-0320, pero otro PR («Reponer y subir prenda abren el modelo entero») fusionó primero
su propio 0320. Este pasó a **0321** con todas sus referencias, y el comentario de la función en producción se actualizó para que diga
0321 (`comment on function`, el mismo texto del archivo; el cuerpo no cambió: md5 `562d05c0…`).

## Cómo se verificó (2026-10-03)

- **Base:** `pnpm pruebas:bajada-desde-vender`, 26/26 (forma; permisos: Vender sí sin Existencias, sin Vender no, otra tienda no; Terminal de ventas
  con responsable presente firma, sin responsable o ausente no; solo lo que falta, 0 si ya alcanza; lo apartado no cuenta; sin almacén libre no mueve
  nada; misma fila que «Reponer»; reintento con la misma marca; datos inválidos y el Taller). Cada caso en ROLLBACK. Cableada en el CI.
- **Web:** `lib/bajada-desde-vender.test.ts` (el contrato contra la migración, la respuesta, los errores) y `lib/vender-stock-local.test.ts` (los
  textos de los avisos). Tipos, lint y las 311 pruebas de `lib/`.
- **Navegador, local, sesión de líder en Tienda Trujillo:** escritorio 1280×800 con el lector (código + Enter): el aviso del almacén, el botón, la
  prenda en el ticket, «Bajada registrada y agregada al ticket» y la fila en la base («Bajada registrada desde Vender», firmada); el caso «tope» (una
  segunda unidad); y la base sin la función (el aviso de falla, sin agregar). A **375 px** con la búsqueda por código: el aviso cabe, el botón mide
  32 px y la prenda entra; la hoja del responsable (forzada un momento en el servidor local, porque la cuenta Admin no la necesita) se ve y completa.
  El stock local quedó como estaba al empezar.
- **No se pudo probar en el navegador:** la cámara (el panel la bloquea; el camino es el mismo `agregar` y el aviso al cerrarla) ni la hoja con una
  cuenta sin responsable elegido de verdad (Terminal o integrante).

## Actualización 2026-11-25 · En el celular, la bajada se ofrece en una hoja abajo, no en el aviso de arriba

**Qué pasaba (medido a 375 × 812, cuenta de integrante en Tienda Trujillo, base local).** La talla del almacén se toca abajo, con el pulgar (la casilla
punteada de la grilla, a 680 px). El aviso salía **arriba**, de 16 a 204 px, tapando la cabecera con cuatro líneas; su botón era un enlace en
versalitas de 13 px partido en dos líneas («AGREGAR Y REGISTRAR LA / BAJADA», a 142 px); se iba solo a los 15 s; y como la cuenta de tienda llega
sin responsable elegido (modo «atención»), al tocarlo abría **otra** hoja para elegir quién atiende, con su botón apagado. Desde la ventana «Todo de
la prenda», además, tocar la talla cerraba esa ventana para no tapar el aviso. Tres saltos de un extremo al otro de la pantalla para una sola acción.

**Decidí.**
1. **Donde el ticket ya vive en su hoja (`apilado`, bajo 1024 px), tocar una talla del almacén abre UNA hoja abajo** (`RegistrarBajadaModal`):
   «¿La tienes en la mano?», la prenda con su foto, color y talla, la línea «0 en el piso · 5 en el almacén» (o «La del piso ya está en el ticket ·
   3 en el almacén» en el tope), quién atiende (el mismo combo del ticket) y «Agregar y registrar» a 44 px, en la zona del pulgar (743 de 812 px).
   Los textos y la línea de stock son puros (`textosHojaBajada`, `stockDeBajada` en `lib/vender-stock-local.ts`, con su prueba). Lo decide
   `bajadaEnHoja` en `PuntoDeVenta.tsx`: misma condición que el botón del aviso (`quedoEnAlmacen`), más `apilado`.
2. **En el escritorio no cambia nada:** sigue el aviso con su botón, porque no le quita el foco al lector de códigos y un clic registra. La hoja sale
   ahí solo si falta quién atiende, como antes, ahora con la prenda a la vista.
3. **La ventana «Todo de la prenda» ya no se cierra en el celular** (`bajadaEnHoja` en `OpcionesDePrendaModal`): la hoja de la bajada va encima y,
   al confirmar, se vuelve a las tallas con el visto dibujado cuando la base responde (no al tocar).
4. **La cámara del teléfono**, al cerrarse con prendas que quedaron fuera por el almacén, abre la misma hoja con todas («¿Tienes las 3 en la mano?»).
5. **La hoja tiene guía de foco** (`lib/bajada-desde-vender-guia.ts`, de «no-aplica» a «aplicada») y su botón ya **no se apaga** por falta de
   responsable (ADR-0611, mejora 4): al tocarlo, el combo dice qué falta. **Espera a la base** con «Agregando…» (`<Boton cargando>`) y recién
   entonces se cierra: un doble toque caía en el «Listo» de la ventana de tallas, que está en el mismo lugar, y la cerraba. Lleva la guardia del
   Enter (`enterNoGuarda`).
6. El error de red decía «Vuelve a escanearla»; en el celular se toca, no se escanea: ahora dice «Vuelve a agregarla».

**Descarté.** *Llevar el aviso abajo en el celular*: seguiría yéndose solo y abriendo una segunda hoja para el responsable. *Usar la hoja también en
el escritorio*: le quitaría el foco al lector entre una lectura y la siguiente. *Lo que se paga:* dos caras para la misma acción según el ancho,
la misma división que ya tiene el ticket (columna en escritorio, hoja en el celular).

**No cambia:** la base (`bajar_al_piso_desde_vender` y su contrato), qué prendas se ofrecen, ni el aviso de éxito. Verificado en el navegador
(Playwright, 375 × 812 con dedo, claro y oscuro; 1440 × 900): grilla, ventana de tallas, tope, Cancelar, «atrás», doble toque (una sola fila en
`movimientos`, firmada por quien atiende) y red caída (aviso, 0 filas). La cámara no se pudo abrir en el navegador de prueba.

## Actualización 2026-11-25 (b) · La cámara del celular: la bajada desde su fila, y cada lectura se nota

**Pedido (equipo, 2026-11-25):** «en el celular las prendas se escanean con cámara, ¿qué se haría si una prenda está en almacén y no en piso? Además,
cuando se escanea alguna prenda no hay ninguna indicación de que ya fue escaneada ni sonido, como al escanear cuando se baja a piso».

**Qué pasaba (medido con una cámara simulada en Chromium, 375 × 812, animaciones apagadas, que es lo de fábrica, ADR-0625).** Sí sonaba (el bip
agudo al entrar, el grave al no entrar), pero lo único que cambiaba en pantalla era una fila chica abajo: sin vuelo ni destello, el visor no decía
nada. La misma etiqueta sostenida 2,5 s **entraba dos veces** al ticket (la pausa era de 2 s), sin aviso. Lo del almacén solo decía «No entró · en
almacén» y se resolvía recién al cerrar la cámara.

**Decidí.**
1. **La regla de lectura de Conteo** (`debeContarLectura`, `lib/conteo-conectado.ts`): la misma etiqueta quieta nunca vuelve a entrar; para la
   segunda prenda igual, la etiqueta sale del cuadro y entra otra. Medido: quieta 12 s, entra una vez.
2. **Cada lectura se ve sin animaciones:** las esquinas del visor toman el tono de la lectura un momento (verde o ámbar: color, no movimiento) y
   la fila más nueva queda marcada, con su ✓ si entró.
3. **«Ya estaba en el ticket» se dice y se oye:** la fila dice «van 2». **Ese mismo día el equipo pidió que la cámara pregunte** «¿Sumar otra?»
   como Bajar al piso: ver ADR-0562, actualización 2026-11-25. «van 2» queda para lo que entra igual (Sumar, o una prenda «varias iguales»).
4. **Lo del almacén se agrega desde su fila:** «Agregar» (`sePuedeBajar`) abre la hoja «¿La tienes en la mano?» encima de la cámara, que deja de
   leer mientras tanto (`pausada`); si se registra, la fila pasa a «entró» con su bip, y al cerrar la cámara ya no se pregunta por ella. Lo que no
   se tocó sigue saliendo en la hoja al cerrar la cámara. El aviso de éxito no se pinta con la cámara abierta (le taparía la ✕): lo dice la fila.

**Verificado:** cámara simulada con etiquetas reales del seed (Casaca Luciana del piso, Pantalón Mía y Vestido Antonella del almacén): una vez
quieta, «van 2» con el doble toque, «Agregar» → hoja → registrada → «entró», Cancelar (la cámara sigue y la etiqueta quieta no se relee), red caída
(aviso, 0 filas en `movimientos`). Claro y oscuro. **No probado en un teléfono real:** el sonido en el aparato (un iPhone en silencio no deja sonar
al navegador, en ninguna pantalla).
