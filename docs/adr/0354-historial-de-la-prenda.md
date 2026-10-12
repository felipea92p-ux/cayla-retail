# ADR-0354 · Historial de la prenda: todos sus cambios y quién los hizo, sin ventas

- **Fecha:** 2026-10-06 · **Estado:** construido en la rama `claude/catalog-modal-history-tab-126842`. **Migración `20261006180000` EN PRODUCCIÓN
  el 2026-10-06** (por el MCP de Supabase: versión registrada `20261006165859 historial_de_la_prenda`, verificada: 5 disparadores, el parche de
  etiquetas y la lectura). **Migración `20261006180100` (Editar producto pide «Responsable») escrita, aplicada en local y SIN pegar en producción:
  se pega DESPUÉS de publicar la web** (ver «Orden de publicación»).
- **Pedido:** Felipe, 2026-10-06, con una captura de la vista rápida de «Vestido Summer · VES-0013»: *un botón entre «Etiquetas» y «Ver en
  Existencias», «Historia» o «Historial», donde se vean todos los cambios que tuvo la prenda —precios, colores, etiquetas…— y quién los hizo; hoy
  existe pero se ven las ventas, y no las quiere ahí.* Tres maquetas (`docs/maquetas/historial-prenda-2026-10/`); eligió la **A · Hilo del tiempo**,
  la firma **(a)** y aprobó la migración.
- **Complementa:** ADR-0059 y 20260915204541 (el ledger `historial_producto_cambios`), ADR-0207 (Actividad de Productos), ADR-0161/0162 (el combo
  «Responsable»), ADR-0136 act. 2026-10-05 (el movimiento de la vista rápida), ADR-0333 (la prenda sin foto). **Revoca en parte:** la acción soltada
  `producto_confirmar_cambios` de 20260929230000 (Editar producto vuelve a pedir responsable).

## El problema (medido, no supuesto)

1. **Salían las ventas.** `HistorialProductoPanel` juntaba los cambios de la ficha con `movimientos` (ventas, traslados, ajustes) con selector de sede.
2. **El «quién» no existía donde más importa.** En producción, el 2026-10-06, **los 40 cambios de precio guardados tenían `usuario_id` vacío** (también
   nombre, categoría, color y costo declarado). «Editar producto» era una acción soltada del combo y, en una terminal de tienda,
   `fn_actor_persona_id(true)` devuelve null.
3. **Faltaban cosas en el ledger:** etiquetas (`variante_etiquetas` sin disparador), un color o una talla nuevos (el disparador de `variantes` era solo
   AFTER UPDATE), las fotos que se cambian desde la ficha, el tejido y el patrón; y ninguna fila decía dónde se hizo el cambio.
4. Un precio cambiado en 5 variantes eran 5 filas, y nombre/descripción salían crudos («referencia»).

## Decisiones

**1. Se llama «Historial».** DECIDÍ ese nombre porque ya es la palabra del ERP para esto (el botón de la Tabla, la ruta `/productos/[id]/historial`, el
botón «Ficha» de Existencias que promete «historial»). DESCARTÉ «Historia» (suena al relato de la prenda, otra promesa) y «Cambios» (en CAYLA es el
módulo donde un cliente cambia una prenda).

**2. La hoja da vuelta la página; no se abre otra ventana.** «Historial» vive dentro de la vista rápida: lo de la ficha sale corto a la izquierda, el hilo
entra desde la derecha y «← Volver» hace lo inverso. Hereda la excepción de movimiento de la vista rápida (ADR-0136 act. 2026-10-05): el hilo se dibuja,
los nudos se encienden, cada tarjeta llega al verse, lo viejo se tacha, el precio cuenta; **sin rebote, sin bucle**, todo apagado con
`prefers-reduced-motion`. DESCARTÉ navegar a la ruta del historial desde la Grilla: abría una ventana encima de otra.

**3. Un guardado = un evento** (`lib/historial-prenda-reglas.ts`, pura y probada). Las filas de la misma persona (o de nadie) a menos de 2 minutos una de
otra son una tarjeta («Lucía editó el precio y la descripción»): la ficha hace hasta tres llamadas por «Confirmar y guardar». El mismo cambio en varias
variantes se dice una vez («en las 5 variantes», «en S · Negro y M · Negro», «en 3 de 9 variantes»). El nacimiento va siempre solo, abajo.

**4. Sin ventas ni stock, y lo dice.** La nota del pie lleva a Movimientos (`?q=<código>`) a quien ve ese módulo. La misma pieza reemplaza a
`HistorialProductoPanel` en `/productos/[id]/historial` y en su ventana desde la Tabla (el panel y `lib/historial-producto*.ts` se borraron;
`tonoCategoria` de Movimientos quedó sin uso y también).

**5. Lo que faltaba se anota por disparador** (`20261006180000`), como todo el ledger desde 20260915204541: ninguna pantalla puede olvidarse.
`etiqueta` (valor = etiqueta_id; vacío del otro lado), `variante_nueva` (`{"color","talla","precio"}` de ese momento), `foto` (la URL), `tejido_id`,
`patron_id`; y la columna `ubicacion_id` se llena sola con la sede de la operación (`fn_historial_sede`). **Lo que nace junto con la prenda no es un
cambio** (`productos.created_at = now()`): el alta ya la cuenta `producto_origen`.

**6. El ledger dice solo lo que cambió.** `actualizar_variantes_etiquetas` borraba todas las etiquetas y las volvía a poner en cada guardado: con el
disparador habría anotado «quitó Oferta / puso Oferta» sin cambio alguno. Parche ANCLADO a la función viva: quita solo lo que sale y pone solo lo que entra
(el resultado final es idéntico). Y como `agregar_foto_producto` (ADR-0283, hoy solo en ramas: no está en `main` ni en producción) escribe su propia fila
`foto` = 'agregada', un filtro ANTES de insertar en el ledger la descarta cuando el disparador ya anotó esa foto. DESCARTÉ parchar esa función: no existe
en producción y daría igual en qué orden se fusionen las ramas.

**7. Editar producto vuelve a pedir «Responsable» (opción «a» de Felipe).** La hoja «Revisa y guarda los cambios» trae el combo «Quién hace estos cambios»
(el mismo `stock.responsable` del ajuste de stock: una persona por guardado), viene elegido con quien inició sesión si está de turno, y el botón espera
con su porqué. `20261006180100` saca `producto_confirmar_cambios` de `acciones_sin_responsable`. DESCARTÉ la opción (b) (anotar solo la terminal): el
pedido es justamente saber quién.

**8. Lectura `fn_historial_prenda`** (security definer, `authenticated`): cada fila con los nombres ya resueltos (nunca un uuid), el color del dato, quién
(nombre, rol, su sede), dónde, y una fila `alta` armada de `producto_origen` con los colores, tallas y precio con que nació (y prefijo y familia, para
dibujarla sin foto como siempre, ADR-0333). El costo, solo a quien ve el dinero de compras (`fn_puede_ver_dinero_de_compras`), ahora en la base y no en la web.

## Orden de publicación (importante)

1. `20261006180000` — **ya en producción**: no rompe nada con la web vieja (solo agrega filas y una función).
2. Publicar la web (este PR). La web nueva manda el responsable, así que funciona con la clave `producto_confirmar_cambios` adentro o afuera.
3. Recién entonces, `20261006180100`. Antes, la web vieja (que no manda responsable) quedaría rechazada en cada terminal al guardar la ficha.

## Lo que se sabe que falta

- **El pasado no se reconstruye:** lo anterior a cada disparador no quedó anotado. Los cambios viejos sin persona salen como «Nadie quedó anotado» con un
  «¿Por qué?»; una prenda sin `producto_origen`, como «Nació antes de que se anotara quién crea cada prenda».
- **Diccionario refrescado** el 2026-10-06 desde producción (foto de las 17:05 UTC, 166 relaciones, 906 funciones; las 1.172 huellas verificadas). Trajo
  también las tablas del Plan del piso de otra sesión (`grupos_mix`, `categoria_grupo_mix`), a las que se les dio pájaro (Halcón) para que el aviario no frene.
- `fn_historial_producto_cambios` sigue viva sin uso (borrarla es otra migración).
- `/formidable` sobre la pantalla nueva, pendiente (es obligatoria con tablero).

## Cómo se verificó

`node scripts/pruebas/historial_prenda.mjs` (11 casos contra Postgres, también en CI), `pruebas:actividad-productos` y `pruebas:responsable-omitido` en
verde; 368 archivos de prueba de la web, `tsc` y ESLint en verde; en el navegador con el ERP local: editar un precio en «Editar producto» → la hoja pide
«Quién hace estos cambios» → el historial dice «Felipe Alvarez bajó el precio · S/ 129.90 → S/ 119.90 · −8 % · en las 3 variantes» con la sede; claro,
oscuro (auditoría `tema:auditar`: 0 hallazgos solo en oscuro) y 375 px.
