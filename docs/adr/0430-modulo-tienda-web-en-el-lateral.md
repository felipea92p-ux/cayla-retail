# ADR-0430 — «Tienda web»: un grupo del lateral con todo lo de la tienda online, su Resumen y su lenguaje visual

- **Fecha:** 2026-10-16 · **Estado:** aceptado (Felipe pidió el módulo y eligió «Resumen» y «ricas, una vez, sin bucle» entre las
  opciones que se le mostraron). La migración `20261016174000` **no está en producción**: se pega con su OK (ver «Cómo se publica»).
- **Rama:** `claude/tienda-web-menu-module-e7c796`.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0426 (frenos y topes), ADR-0161 y ADR-0306 (módulos y roles: un módulo es una entrada
  del menú), ADR-0392 (el precedente de Gestión: un grupo de primer nivel con rutas propias y redirecciones), ADR-0136 (movimiento),
  ADR-0358 (una función, una pieza), ADR-0333 (la prenda sin foto).

## El problema

Felipe: «quiero aperturar un nuevo módulo en el menú lateral que se llame Tienda Web; ahí meter todo lo que está relacionado con esa tienda
web y que actualmente está desparramado por todo el sistema […] aparte necesito nuevos diseños, sofisticados, amigables y con full
animaciones, siempre manteniendo la estética de CAYLA».

Lo de la tienda online vivía en cuatro lugares: Ventas ▸ Pedidos web, Catálogo ▸ Vitrina web (con Looks y Esperan una talla), Clientes ▸
Recomendaciones y la pestaña «Tienda web» de Configuración. Para saber si la tienda online estaba sana había que entrar a los cuatro, y nada
decía en un solo lugar «esto es la web».

**Analogía CAYLA:** la tienda online es una vitrina con su propia puerta a la calle (ADR-0408). Hasta hoy el cuaderno de esa vitrina estaba
repartido entre la caja, el almacén y la oficina; ahora tiene su propio cajón en el mostrador.

## Decisiones

**DECIDÍ 1 — Un grupo de primer nivel, «Tienda web», justo después de Ventas, con rutas propias (`/tienda-web/…`).**
Hijas: Resumen (`/tienda-web`), Pedidos, Vitrina (Modelos, Looks y Esperan una talla), Recomendaciones y Ajustes. Va después de Ventas
porque es el otro canal de venta y sus pedidos se atienden a diario. Las direcciones de antes redirigen con su query en `next.config.ts`
(`?pedido=` compartido por WhatsApp abre igual), también `/configuracion?tab=tienda-web`.
**DESCARTÉ** dejar las rutas viejas bajo `/vender`, `/productos` y `/clientas`: la dirección diría Ventas o Catálogo mientras el menú dice
Tienda web, y Recomendaciones seguiría pasando por la puerta de Clientes. **SE ROMPE SI** alguien guardó un enlace a una sub-ruta que no
se redirige: hoy se cubren todas las que existían (`/productos/vitrina/:resto*` incluida).

**DECIDÍ 2 — Nadie gana ni pierde un permiso.** Cada pantalla conserva su módulo (`pedidos_web`, `vitrina_web`, `recomendaciones`). Ajustes
la abre `configuracion`, el mismo que guardaba esa pestaña (`fn_puede_configurar`), con `soloConModulo` en el árbol: con la regla fija de
antes de los roles, Configuración tampoco estaba en el lateral. Ajustes se abre en CAYLA Global, como Configuración.
**DESCARTÉ** un módulo propio para Ajustes: cambiaría quién puede guardar los datos de cada tienda, y eso es de Felipe.
**SE ROMPE SI** Felipe quiere que una encargada edite la tienda web sin poder tocar metas ni fondo de caja: entonces sí, un módulo aparte
y sus funciones preguntando por él. **→ Pasó el mismo día: ver «Actualización 2026-10-16 (b)».**

**DECIDÍ 3 — El lateral pasa de 8 a 9 filas de primer nivel** (`TOPE_FILAS` en `menu.test.ts`). Lo pidió Felipe: un grupo nuevo en el
lateral. Ventas vuelve a 6 hijas y su excepción se borra. **SE ROMPE SI** nace otro grupo de primer nivel: entonces se regrupa (D-84) y
el tope no vuelve a subir.

**DECIDÍ 4 — Resumen con módulo propio (`tienda_web`), sin funciones propias en la base.** Felipe eligió «Sí, con Resumen». Nace solo
para el líder (migración sin `rol_modulos`). La página lee, en paralelo y SOLO las de los módulos que la cuenta ve, las mismas lecturas
de Pedidos, Vitrina, Recomendaciones y Ajustes, y las convierte con las reglas de cada pantalla (`cifrasDe`, `cifrasEsperan`,
`cifrasLooks`, `estadoSedeWeb`) en `lib/tienda-web-resumen.ts`. Sin el módulo, `/tienda-web` lleva a la primera pantalla del grupo que se
ve. La misma migración lleva los tres módulos de la tienda online al grupo «Tienda web» de Roles y accesos.
**DESCARTÉ** una función `fn_tienda_web_resumen` en la base: duplicaría las reglas de cuatro pantallas en SQL y dos definiciones de «por
confirmar» terminan diciendo cosas distintas. **SE ROMPE SI** el Resumen se vuelve lento por leer cinco cosas: hoy son lecturas que ya
se hacen en sus pantallas (la más pesada, `fn_vitrina_modelos`, con ~300 modelos en producción), y van en paralelo.

**DECIDÍ 5 — Un lenguaje visual propio, hecho de piezas únicas más tres piezas nuevas que ninguna familia cubría.**
La **ventana** (`MarcoWeb`): un navegador con la dirección de la tienda, para lo que se ve como lo ve el cliente (la vitrina del Resumen,
la tarjeta de cada tienda en Ajustes). El **mosaico** de prendas en su foto vertical (Resumen, la vista «Vitrina», los looks como percha).
El **camino** (`Camino`): las cifras de los pasos de un pedido unidas por lo que las hace avanzar y su plazo (Resumen y Pedidos). Lo demás
son las piezas de `/unificar`: `TarjetaCifra`, `Chip`, `Tabla`, `Vacio`, `Aviso`, `BarraAvance`, `SegmentoDeslizante`, `EnlaceVer`…
**DESCARTÉ** rehacer las pantallas con piezas a mano (tarjetas de cifra, pestañas o tablas propias): la colaboradora aprendería dos veces
lo mismo (ADR-0358).

**DECIDÍ 6 — Movimiento rico, una vez, sin bucle** (ADR-0136 act. 2026-10-16; Felipe eligió esta opción frente a «ricas y vivas»). La
ventana se asienta y su barra recibe un barrido de luz; las prendas entran en cascada; el camino se dibuja tramo a tramo y asoman sus
puntas; la bandeja entra en cascada con su filo de color; las cifras cuentan. Todo con `--ease-cayla`, sin rebote, ninguna pieza dura más
de 1,2 s, y nada se mueve con «reducir movimiento». El único latido es el punto de `<TarjetaCifra vivo>` en «Por confirmar» cuando el
primero está a menos de 3 h de cerrarse (una señal, no adorno). Lo vigila `lib/tienda-web-movimiento.test.ts`.
**DESCARTÉ** bucles decorativos (una vitrina que rota sola, brillos continuos): distraen en el mostrador, donde Pedidos se atiende con
un cliente esperando.

## Lo que cambió en cada pantalla

- **Resumen (nuevo):** la vitrina en su ventana (lo fijado en Lo nuevo y lo que tiene foto primero; dos filas en el celular), cómo está
  cada tienda en la web, «Lo que te pide hoy» de lo urgente a lo que informa (cada cosa lleva a la pantalla que la resuelve) y el camino
  de los pedidos de la tienda donde se está.
- **Pedidos:** las cuatro cifras pasan a ser el camino del pedido (siguen filtrando); cada pedido abierto lleva el reloj de su plazo
  (`relojDelPlazo`), con el tono de su chip.
- **Vitrina:** abre en la vista «Vitrina» (cartas con foto, lo libre por tienda, insignias e interruptor; lo apagado, atenuado) y conserva
  «Lista». **Looks:** perchas con sus prendas lado a lado. **Esperan una talla:** sin cambios (ya usaba las piezas únicas).
- **Recomendaciones:** cada una como un mensaje, con la respuesta de CAYLA debajo si la hay.
- **Ajustes:** la tarjeta de cada tienda «así te ve el cliente», al día mientras se escribe, y la vida de un pedido con sus plazos.

Mismas funciones de la base, mismas hojas, mismas reglas: cambia cómo se ve y dónde vive, no qué hace.

## Cómo se ve mal hecho

- El Resumen calculando «por confirmar» con su propia regla: el número del Resumen y el de Pedidos dirían cosas distintas.
- Un Resumen que muestra los pedidos a quien no tiene «Pedidos web»: lo que no se ve en el menú tampoco se ve aquí.
- Una animación que se repite en Pedidos: la colaboradora mira el brillo en vez del pedido.
- Mover Ajustes a un módulo nuevo «porque queda más limpio»: alguien que hoy configura la tienda web dejaría de poder hacerlo.

## Cómo se publica

1. Pegar `supabase/migrations/20261016174000_tienda_web_modulo_resumen.sql` en el SQL Editor de producción (idempotente, sin políticas,
   todo con el prefijo `retail.`). Antes de pegarla, la web publicada no muestra el Resumen a nadie (nadie tiene `tienda_web`): el grupo
   abre en Pedidos, y Roles y accesos sigue mostrando los tres módulos en sus grupos de antes.
2. Fusionar el PR. Las direcciones viejas siguen llegando.
3. Dar «Pedidos web» a los roles de las tiendas en Roles y accesos (hoy solo lo tiene «Terminal Almacén»: un pedido que nadie confirma
   se cierra solo a las 24 h). Es decisión de Felipe, no del código.

## Cómo se verifica

`pnpm --filter web test` (menú, módulos, roles, guías, foco, vuelta, tema y `tienda-web-*`), y en el navegador contra una base local con
datos de ejemplo: el lateral, las siete pantallas a 1366 y 375 px, claro y oscuro, y las redirecciones de las direcciones viejas.

## Actualización 2026-10-16 (b) — «Ajustes» pasa a ser el módulo «Datos y plazos de la tienda web»

Felipe lo pidió al ver el grupo en Roles y accesos: «debe ser un módulo, y "Ajustes" es muy general». Es justo el «se rompe si» de la
DECIDÍ 2, así que se hizo (migración `20261016223000_tienda_web_modulo_ajustes.sql`):

- **Módulo `ajustes_web`** («Datos y plazos de la tienda web», grupo «Tienda web», orden 69, delegable). Nace SIN rol: solo el líder. La
  fila del lateral y el título de la pantalla dicen «Datos y plazos» (la ruta sigue siendo `/tienda-web/ajustes`: cambiarla rompería
  enlaces guardados sin ganar nada).
- **Una sola llave nueva, `fn_puede_ajustes_tienda_web()`** (el líder o el módulo), para las tres funciones propias de la pantalla:
  `fn_configuracion_tienda_web`, `guardar_sede_tienda_web` y `guardar_parametros_tienda_web`. **Configuración ya NO las abre.**
- **`guardar_whatsapp_tienda` acepta las dos llaves** (`fn_puede_configurar()` o la nueva): la comparte Configuración ▸ Tiendas y caja con
  esta pantalla, y el WhatsApp es parte de lo que la web muestra de cada tienda.
- **Nadie pierde nada hoy:** medido en producción el 2026-10-16, ningún rol activo tiene «Configuración» (solo el líder, que pasa por
  `fn_es_lider()`). Mañana, quien reciba Configuración ya no ve «Datos y plazos» a menos que también se le dé el módulo nuevo.
- El Resumen pide `ajustes_web` (no `configuracion`) para la tarjeta «Tiendas en la web» y el aviso «no se ven»; el aviso «Completar» lleva
  a la misma pantalla.
- **Se rompe si:** alguien con Configuración abre un enlace viejo `/configuracion?tab=tienda-web` (redirige a `/tienda-web/ajustes`): sin el
  módulo nuevo ve «Sin acceso».

## Actualización 2026-10-17 — Pedidos: una sola navegación, «Lo que te toca» y cada fila con su verbo

Felipe pidió críticas de Pedidos con una maqueta (`docs/maquetas/pedidos-web-2026-10/index.html`, con la pantalla de antes al lado) y
eligió construir las siete. Mismas funciones de la base, mismas hojas, mismos permisos: cambia qué se muestra y en qué orden. La lógica
es pura y probada (`lib/pedidos-web-reglas.ts`: `estacionesDe`, `tramosDelCamino`, `reglasDelCamino`, `loQueTeToca`, `relojDeFila`,
`verboDe`, `porQueSeCerraron`, `todoAlDia`).

**DECIDÍ 7 — El camino es la única navegación de Pedidos: sus estaciones filtran y se quitó la fila de pestañas.** Las tres cifras y
tres de las cuatro pestañas llevaban al mismo lugar («Por confirmar» se leía tres veces en la primera pantalla). Ahora el camino tiene
cuatro estaciones (Por confirmar, Por cobrar, Por entregar y Cerrados), cada una un `<TarjetaCifra>` que filtra (la que filtra se rellena
de arena, como decidió `/unificar`); tocarla de nuevo, o la píldora `<FiltroPuesto>` del título, la quita. **Sin filtro, la lista es «Lo
que te toca»**: todo lo que pide algo, mezclado, con lo que se pierde arriba (se cierra solo en menos de 3 h → ya pasó su aviso o hay
plata por devolver → lo demás por confirmar → lo que solo avisa → lo que espera una prenda). `?pestana=` sigue siendo el filtro: los
enlaces guardados y los del Resumen siguen sirviendo.
**DESCARTÉ** dejar las pestañas y que las cifras solo informen: dos controles para lo mismo, y con 0 a 5 pedidos abiertos por tienda
(producción, 2026-10-17: 11 pedidos web en total) una sola lista ordenada responde «¿qué hago ahora?» mejor que cuatro.
**SE ROMPE SI** una tienda llega a decenas de pedidos abiertos a la vez: «Lo que te toca» se vuelve larga y el filtro deja de ser opcional.
Entonces se pagina, no se vuelve a las pestañas.

**DECIDÍ 8 — Las estaciones cuentan pedidos; la plata va en su pie y «Cobrado hoy» sale del camino.** Antes la fila decía
«0 · S/ 0.00 · 0 · S/ 0.00» y «Cobrado hoy», al final del camino, se leía como el paso que sigue a entregar. Ahora «Por cobrar» dice
cuántos pedidos y abajo «Faltan S/ 426.00»; «Cobrado hoy» va a la derecha de la cabecera (`ResumenSede`, solo si hay algo) en Pedidos y
en el título de la sección en el Resumen. La plata por devolver de un anulado va en el pie de «Cerrados», en rojo.

**DECIDÍ 9 — El tramo que CIERRA el pedido se ve distinto de los que solo avisan, y el camino tiene su último tramo.** «Confirmas · se
cierra a las 24 h» lleva el reloj, el hilo entero y el plazo en rojo profundo: si se cumple, la venta se pierde. «Te paga · aviso a las
48 h» y «Lo recoge · aviso a los 7 días» llevan la campana y el hilo punteado, que aparece en vez de dibujarse (una raya punteada no se
puede «trazar»; sigue siendo una vez, sin bucle, `--ease-cayla`). Los plazos salen de Datos y plazos, nunca escritos en la pantalla.
Desde 1280 px el camino va en una fila (cuatro tarjetas necesitan ~150 px cada una con el lateral abierto); más angosto, de a dos sin tramos.

**DECIDÍ 10 — Cada fila dice su plazo una vez y su verbo.** Antes: insignia («Por confirmar · vence en 2 h») + frase («Revisa el stock y
confírmalo») + barra, y ningún botón. Ahora el reloj dice CUÁNDO y qué pasa si no («Se cierra solo en 2 h · Si nadie lo confirma, se
pierde»), con la barra del plazo, y el botón dice QUÉ: Confirmar, Registrar pago, Escribirle, Entregar, Ver pedido o Devolver. **El botón
solo abre la hoja del pedido** (la misma que tocar la fila): nada se confirma, cobra ni entrega sin pasar por ella y su «Responsable».
**DESCARTÉ** que «Registrar pago» abriera directo la hoja de pago encima: mientras la URL trae el pedido nuevo, la hoja podía abrirse
sobre el pedido que estaba abierto antes y cobrarle al equivocado. **SE ROMPE SI** alguien espera que «Confirmar» confirme en un toque:
abre la hoja, y la guía lo dice.

**DECIDÍ 11 — Sin nada que hacer, «Todo al día» en una línea.** Con todo en cero la pantalla decía «nada» diez veces (siete ceros y tres
frases). Ahora: «No hay pedidos web esperando en Tienda TRU. El último (W-0009) llegó hoy a las 11:40 y se cerró: el cliente desistió.»
(`<Vacio>`), sin el camino, y debajo los cerrados con sus tres primeras filas a la vista.

**DECIDÍ 12 — La nota de cinco reglas del pie pasó a «¿Cómo funciona?».** Un botón de la cabecera abre una regla bajo cada estación, en
la misma grilla del camino (`Camino reglas`). Ninguna regla nueva: son las mismas de la nota, con el plazo de Datos y plazos.

**DECIDÍ 13 — Lo cerrado dice por qué se cerró.** Una `<BarraApilada>` con su leyenda: entregado (verde), nadie lo confirmó a tiempo
(rojo: una venta perdida), no hay stock (ámbar) y lo del cliente. Si hay «no hay stock», una línea: la vitrina está mostrando prendas que
esta tienda no tiene.

**Piezas.** `components/tienda-web/CaminoDePedidos.tsx` arma las cuatro estaciones para Pedidos (filtran) y para el Resumen (llevan a
Pedidos con el filtro puesto): antes cada pantalla armaba sus tarjetas por su cuenta. `<TarjetaCifra>` gana `guia` (el ancla de la guía
interactiva, sin cambiar su cara). La guía de Pedidos se rehízo con los pasos nuevos (Todo al día, ¿Cómo funciona?, el camino, Lo que te
toca, el plazo, el verbo, lo cerrado) y su huella se aceptó.

**Lo que quedó fuera, a propósito:**
- **Quién ve Pedidos (decisión de Felipe, no de código).** En producción el módulo `pedidos_web` lo tiene solo el rol «Terminal Almacén»
  (y los líderes). La «Terminal de ventas» —la Caja, donde el cliente paga en efectivo y recoge con su código— y los integrantes de
  tienda no lo ven. Se da en Colaboradores ▸ Roles y accesos (el módulo es delegable).
- **Verlo con datos reales.** La base local compartida va 218 migraciones atrás (no tiene `pedidos_web`): la pantalla se miró con datos de
  ejemplo en una ruta temporal (1366 px, claro y oscuro, 375 px) y `guias:recorrer` queda para cuando la base local esté al día.
