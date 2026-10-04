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

## Tanda 4 construida (2026-09-26, desde Análisis conectado, ADR-0245)

Felipe la pidió junto con Análisis («con migración de todo»), porque la integrante que ve algo agotado en su sede no
podía traerlo: `iniciar_traslado` exige operar el origen. **La migración no está en producción: pide el OK de Felipe.**

- **Migración `20260927210000_pedir_a_otra_sede.sql`**, una sola parte y sin políticas ni `drop trigger`:
  - En `separacion_pedidos`, la clienta pasa a ser opcional: van los tres datos o ninguno.
  - Columnas y estados nuevos: `grupo_id` (varias tallas pedidas juntas) y el estado `recibido`, final de una
    reposición.
  - Dos CHECK nuevos: una reposición nunca queda en `llego` ni `apartado`, y siempre tiene grupo.
  - La tabla estaba vacía en producción (consultado el 2026-09-26).
- **RPC:**
  - `pedir_a_otra_sede(p_ubicacion_id, p_origen_id, p_lineas jsonb, p_nota, p_token) → grupo_id`. La aceptan
    Traslados o Análisis, operando la sede que pide.
  - `enviar_pedido_a_otra_sede(p_grupo_id, p_fecha_estimada_llegada, p_token) → transferencia`. Solo con Traslados:
    un solo `iniciar_traslado` con todo el grupo.
  - `cancelar_pedido_a_otra_sede(p_grupo_id, p_motivo)`: cualquiera de las dos sedes. Es «No la tengo» o «Ya no la
    necesito».
  - `fn_pedidos_entre_sedes(p_ubicacion_id)`: la lectura.
- **Se cambió `fn_apartar_pedidos_que_llegaron` y no el disparador.** Desde `20260927160000` el pedido que llega se
  atiende línea por línea en esa función. El disparador ya hacía lo correcto para la reposición («no llegó» →
  cancelado).
- **Siguen igual para los pedidos con clienta:** `fn_pedidos_para_apartar`, `enviar_pedido_para_apartar` y
  `cancelar_pedido_para_apartar`. Las tres filtran o rechazan la reposición.
- **Envío completo o nada:** «Enviar» manda el grupo entero. Si al origen le falta stock, falla `iniciar_traslado`, y la
  salida es «No la tengo». No hay envío parcial por prenda.
- **Web provisional hasta la bandeja «Hoy te toca» (tanda 2):**
  - `PedidosEntreSedes` en `/inventario/traslados`: «Te piden» (Enviar con llegada Hoy / Mañana / Pasado mañana, y
    No la tengo) y «Pediste».
  - `PedirAOtraSedeModal`, que usa Análisis.
  - Si la función no existe en la base, la tarjeta no aparece y la lista de traslados sigue.
- **Pruebas:**
  - `pnpm pruebas:pedir-a-otra-sede`: 71/71 (en CI).
  - `pruebas:separaciones`: 77/77 y `pruebas:traslados-recibir-sin-perder-nada`: 58/58, antes y después.
  - Todo se corrió en un stack Supabase aparte, sin tocar el Postgres local compartido.

## Actualización 2026-10-03: lo que se construyó desde el análisis de Traslados (tareas #4 a #7, rama `claude/traslados-tareas-4-a-7`)

Solo web, sin migración. Cuatro cortes verificables, cada uno con su commit y verificado en Chrome contra una pila Supabase propia.

- **Tanda 1, parcial (D-4).** «Nuevo traslado» vive en `/inventario/traslados/nuevo`; `/inventario/mover` solo redirige con todos sus
  parámetros (los enlaces de Producción, Cambios, Análisis y Frescura no se tocaron). El menú marca Traslados. «Volver» va a Existencias
  solo si se llegó desde ahí (`?desde=existencias`). **Falta:** escáner y búsqueda con foto (D-2), destino en botones, llegada por día y el
  resumen «La caja».
- **D-3, parcial.** Al enviar sale «Traslado N», la lista de lo que va en la caja (con cantidades: quien envía las sabe) y un mensaje para
  la otra sede con «Copiar» y «Abrir WhatsApp». El mensaje **no dice cuántas prendas van**: la función recibe solo nombres, así que el
  tipo impide colar una cantidad. **Falta:** la guía impresa con QR.
- **D-6.1, parcial.** «Lo siguiente» tras recibir: «Bajar estas al piso» (solo lo que HOY sigue en el almacén) e «Imprimir etiquetas»;
  Etiquetas entiende `?traslado=`. **Falta:** «Avisar a la clienta» y «Ver en Existencias».
- **Tanda 4, entrada desde Traslados (D-7).** «Pedir a otra sede» en la cabecera y en el estado vacío; el modal gana el modo «elegir» (la
  tienda y las prendas). El modo de Análisis no cambió.

### Decisiones tomadas por el camino

```
DECIDÍ:      el modal de pedir ofrece solo lo que la otra tienda puede ENVIAR (su almacén, `fn_existencias`: almacen_libre + sin_lugar).
DESCARTÉ:    ofrecer piso + almacén (lo que hacen hoy `pedir_a_otra_sede` y Análisis), porque un traslado sale solo del almacén
             (`iniciar_traslado`): el pedido llegaría y la otra tienda respondería «No la tengo»; en TRU ~la mitad del stock está en el piso.
SE ROMPE SI: Felipe quiere que pedir también pueda tomar del piso: es un cambio de una línea (`filasEnviables`, almacen_libre → disponible).
```

- **Fuente de datos:** `fn_existencias` de ESA sede (una sede por llamada), no `fn_stock_por_sede_json` (la red entera, ~1,5 MB con 5
  sedes, y su puerta propia deja a una terminal con la red vacía: ver pendientes).
- **El token (ADR-0190) va atado al contenido del pedido:** reintentar lo mismo no duplica; si cambian la tienda o las prendas tras un
  corte de red, es otro pedido. Con un token por apertura, la base devolvía el pedido viejo y el modal avisaba un éxito falso.
- **El aviso dice «guardado», no «enviado»:** la otra tienda no se entera sola (el menú no cuenta los pedidos).
- **El formulario de envío sigue bloqueado hasta que sale la pantalla de «enviado»:** el token ya se renovó y un clic durante la lectura
  del número creaba un traslado duplicado (reproducido: la base pasó de 16 a 18; con la corrección, solo 1).

### Pendientes y decisiones de Felipe

1. **SQL (con su OK):** `pedir_a_otra_sede` y `fn_pedidos_entre_sedes.disponible_en_origen` todavía cuentan piso + almacén.
2. **SQL:** `fn_stock_por_sede()` conserva su propia puerta (`colaboradores`), no `fn_tiene_acceso_retail()` (ADR-0289): una terminal ve la
   red vacía también en Vender («dónde más hay»).
3. **Conteo a ciegas (ADR-0239 D-130):** solo vale dentro del detalle del traslado. Existencias de la sede destino muestra «En camino hacia
   acá: N unidades» (también por prenda y en el CSV) y la tarjeta «Prendas en tránsito» de Traslados suma lo que viene. ¿Se ocultan o se acepta?
4. **WhatsApp:** el aviso usa `ubicaciones.whatsapp_numero`, que nació para el QR del club. ¿Lo lee quien recibe las cajas?
5. **Avisar a quien recibe un pedido:** un pedido «Te piden» no suma al número del menú ni avisa por WhatsApp (tanda 2, «Hoy te toca»).
6. Sin construir todavía: tanda 2 completa, tanda 5, la guía de foco del formulario de envío (tarea #8 del análisis).
