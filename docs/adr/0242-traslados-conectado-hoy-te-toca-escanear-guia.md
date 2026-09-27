# ADR-0242 · Traslados conectado: «Hoy te toca», escanear al enviar, guía con QR y un solo Nuevo traslado

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe sobre el spike (`docs/maquetas/traslados-conectado-2026-09/`, PR #515).
  **Todavía no hay nada construido:** este ADR fija qué se construye y en qué orden.
- **Sigue a:** ADR-0239 (recibir sin perder nada: conteo a ciegas, piso o almacén, anular), ADR-0233 (pedidos entre tiendas
  para apartar), ADR-0237 (Existencias conectada: marcar varias → Trasladar), ADR-0101 (traslado sugerido desde Análisis),
  ADR-0220 (cabecera de Inventario), ADR-0136 (hojas).
- **Número:** 0240 y 0241 los toman PRs abiertos (#514 Existencias, #517 Movimientos).

## Problema

1. La lista repetía cinco veces «tienes que recibir» (franja, tarjeta, fondo, chip, botón) y en el celular empujaba el primer
   traslado a ~990 px, bajo el borde. Además había tres formas de filtrar, con solo 4 sedes.
2. Traslados no mostraba el trabajo que otras pantallas le generan: los pedidos para apartar de otra sede viven solo en
   Apartados, y las sugerencias de reposición solo en Análisis.
3. Después de recibir no había un siguiente paso: lo que entra al almacén no se vende hasta bajarlo al piso, y nadie lo recuerda.
4. Nuevo traslado es un combo por línea, con un texto largo de variante, y pide hora y minutos que nadie usa. Además cuelga de
   la dirección de Existencias (`/inventario/mover`): el menú marca Existencias y «Volver» siempre lleva a Traslados.

## Decisiones (Felipe, 2026-09-26)

### D-1 · La lista es «Hoy te toca»
Arriba, una bandeja de tareas: cada tarjeta es algo que hacer ahora, con su botón (contar un traslado que llega, enviar un
pedido de otra tienda, un sugerido, un pedido tuyo pendiente). Debajo, todos los traslados con buscador, sin tarjetas de
cifras ni píldoras de filtro. Se van la franja «necesita tu acción», las cuatro `TarjetaCifra`, las píldoras de dirección,
«Más filtros» y la nota del pie.
- **Descartado:** pestañas (quedaban mejor con muchos traslados, pero Felipe prefirió la bandeja para quien recién empieza) y
  cifras + tabla (dos lugares que filtran).
- **Se rompe si** hay muchos pendientes a la vez: la bandeja se alarga. Mitigación al construir: a partir de 6 tareas, la
  bandeja muestra las 4 más urgentes y un «Ver las N» (regla pura, con prueba).

### D-2 · Nuevo traslado: escanear + buscar
La pistola o la cámara suma de a una prenda. Escribiendo, busca por palabras (sin tildes ni mayúsculas, como el combo de
ADR-0209) y muestra foto, talla, color y cuánto hay para mover. La cantidad se corrige con − / +. El destino se elige con
botones (uno por sede) y la llegada, por día: «Hoy / Mañana / Pasado mañana / Otro día». Hay un resumen «La caja» con el
botón de enviar: a la derecha en computadora, fijo abajo en el celular. Se conserva lo que ya funciona: el token contra el
doble clic (ADR-0190), el tope por stock movible del almacén, el prellenado por URL y el combo «Responsable».

### D-3 · Con la caja: guía con QR + WhatsApp
Al enviar se ofrecen dos cosas:
- **Imprimir la guía** (térmica de 80 mm o A4), con un QR que abre el conteo de ESE traslado.
- **Un mensaje de WhatsApp** listo para la otra sede, con enlace directo.

**Ni la guía ni el mensaje dicen cuántas prendas van**, porque la otra sede cuenta a ciegas (ADR-0239, D-130). Dicen qué
buscar y traen una casilla para anotar.

### D-4 · Un solo Nuevo traslado, en Traslados
El formulario pasa a `/inventario/traslados/nuevo` y `/inventario/mover` redirige conservando los parámetros, así siguen
funcionando los enlaces de Producción, Cambios, Análisis y Existencias. Los tres caminos de Existencias (el botón de la
cabecera, «Trasladar» con varias marcadas y «Trasladar» desde el detalle de una prenda) llevan ahí con las prendas cargadas.
Si viniste de Existencias, «Volver» te regresa a Existencias. El menú marca Traslados (cierra el hallazgo §16).
- **Descartado:** dejarlo en `/inventario/mover`, porque la dirección seguiría colgando de Existencias; y una hoja sobre
  Existencias, porque la misma interfaz viviría en dos lugares.

### D-5 · Existencias conserva «+ Nuevo traslado» y suma «Traslados · N por recibir»
Va en la fila de pantallas relacionadas (ADR-0237), solo si el rol ve Traslados, para que quien está en Existencias sepa que
llegó una caja. **Espera a que se fusionen #514, #516 y #517**, que tocan la misma cabecera.

### D-6 · Conexiones: las cuatro
En orden de beneficio para la colaboradora:
1. **Después de recibir** (en el detalle, al confirmar), bajo el título «Lo siguiente». Las acciones:
   - «Bajar al piso», ya cargado, si entró al almacén (`/inventario/bajar?lineas=`).
   - «Imprimir etiquetas» (`/etiquetas-de-precio?variantes=`).
   - «Avisar a la clienta» por WhatsApp, si una prenda quedó apartada (ADR-0233).
   - «Ver en Existencias».
2. **Pedidos de otras tiendas** (ADR-0233): en «Hoy te toca», con «Enviar» (`enviar_pedido_para_apartar`) y «No la tengo».
3. **Sugeridos** (Análisis, `resumen-acciones.ts`): «Armar traslado» prellenado. Solo para quien ve Análisis.
4. **Pedir a otra sede** (D-7).

### D-7 · «Pedir a otra sede» extiende los pedidos de ADR-0233 (clienta opcional)
Una sola tabla de pedidos entre sedes (`retail.separacion_pedidos`), una sola lista «Por enviar» y una sola forma de
enviarlos:
- **Con clienta:** es un pedido para apartar, como hoy; al llegar se aparta.
- **Sin clienta:** es reposición y entra al stock sin más.
- **Descartado:** una tabla propia de Traslados, porque quedarían dos listas de pedidos y dos formas de enviarlos.
- **Pagas:** se toca una tabla de Apartados. El disparador `trg_pedidos_al_llegar` debe apartar solo si hay clienta, y
  `fn_pedidos_para_apartar` debe seguir mostrando en Apartados solo los pedidos con clienta.
- **A diseñar antes de la migración** (tanda 4): hoy la tabla es una fila por variante con los datos de la clienta
  obligatorios. Un pedido de reposición trae varias prendas, así que habrá que decidir cómo se agrupan (p. ej. un `grupo_id`)
  y si «Enviar» manda el grupo en un solo traslado. La migración pide el OK de Felipe antes de pegarla en producción, y en
  partes, según la regla de políticas y deadlocks.

## Orden de construcción (un PR por tanda, cada una verificable en el navegador a 1440 y 375 px)

1. **Nuevo traslado** (D-2, D-4): ruta nueva, redirección, escaneo y búsqueda, destino en botones, llegada por día, «Volver»
   según de dónde viniste. Sin migración.
2. **«Hoy te toca»** (D-1) con los pedidos de otras tiendas y los sugeridos (D-6.2, D-6.3). Sin migración, salvo que falte
   una lectura de pedidos por sede de origen para la lista: `fn_pedidos_para_apartar` ya existe.
3. **Después de recibir y guía con QR + WhatsApp** (D-3, D-6.1). Sin migración.
4. **Pedir a otra sede** (D-7). Con migración y OK de Felipe.
5. **Acceso en Existencias** (D-5), cuando se fusionen #514, #516 y #517.

## Verificación
Cada tanda: `lint`, `typecheck`, pruebas de las reglas puras nuevas (`lib/traslados-*-reglas.ts`) y un recorrido en el
navegador local con capturas a 1440 y 375 px (PL-105 no obliga a Traslados, pero la mayoría de las colaboradoras lo usarán
en el teléfono). La tanda 4 suma su prueba SQL en `scripts/pruebas/` y en CI.
