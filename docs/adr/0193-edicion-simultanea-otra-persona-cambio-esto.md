# ADR-0193 — Edición simultánea: «otra persona cambió esto» (control optimista de versión)

- **Fecha:** 2026-09-23
- **Estado:** construido y probado en local; migración `20260924160000_edicion_simultanea_con_version.sql` **por pegar en
  producción**. Orden: **primero la base, después la web** (la web vieja funciona igual con la base nueva; la web nueva con
  la base vieja fallaría al leer `version`).
- **Contexto:** etapa 5 de la auditoría de concurrencia (ADR-0188 es la etapa 1). Felipe, 2026-09-23: «que funcione con
  varios usuarios en simultáneo».

## Problema

Hoy, al editar, **gana el último en guardar y nadie se entera**:

- **Ficha de producto.** `ProductoForm` manda TODAS las variantes (precio, activo, costo) y todas las fotos a
  `catalogo_actualizar_producto`, con los valores que vio al abrir. Si la líder sube el precio de la M de S/ 59 a S/ 69 y
  guarda, y una colaboradora que abrió la misma prenda antes corrige la descripción y guarda, el precio vuelve a S/ 59. En
  caja se cobra el precio viejo y nadie sabe por qué.
- **Roles y accesos.** `guardar_modulos_rol` reemplaza el conjunto COMPLETO de módulos. Dos líderes retocando el mismo rol
  se borran los cambios entre sí (y la misma persona, con dos clics seguidos en la matriz antes de que la pantalla se
  refresque, perdía el primero).

`productos` y `variantes` no tenían ni `updated_at` ni versión: la base no podía saber que la ficha estaba vieja.

## Decisión

**Control optimista de versión.** Nadie bloquea a nadie mientras edita (una ficha abierta toda la tarde no traba a
nadie); se comprueba al guardar.

1. **`productos.version` y `roles.version`** (`integer not null default 1`). Un disparador `before update` la pone en
   `old.version + 1` en CADA escritura de la fila, venga de donde venga: la RPC de la ficha, «Descontinuar» en bloque de
   /productos (que escribe la tabla directo), el censo (`revisar_producto_censo`), `archivar_producto_prueba`, renombrar o
   archivar un rol. Lo que mande quien escribe se ignora: la versión no se fija a mano.
2. **Los módulos de un rol** viven en `rol_modulos`: un disparador ahí sube la versión del rol dueño en cada alta, baja o
   cambio. Guardar sin cambios no la sube.
3. **Las RPC reciben `p_version_esperada integer default null`** y **devuelven la versión nueva** (antes `void`). Si la
   versión no coincide: `raise … using errcode = 'PT409', hint = 'version_cambiada'` con el mensaje «Otra persona cambió
   esta prenda (este rol) mientras la editabas (lo editabas). Recarga para ver sus cambios.» Sin versión, como hasta hoy.
4. **La web** lee la versión al abrir (`getProducto`, `getRoles`), la manda al guardar y, ante el rechazo
   (`esVersionCambiada` en `lib/error-escritura.ts`), **no cierra el formulario**: aviso de error con botón «Recargar»
   (los avisos de error ahora aceptan `accion`) y, en la ficha, una nota fija junto a «Guardar cambios». En Roles,
   «Recargar» es `router.refresh()`: el borrador se conserva y la barra pasa a comparar contra lo que el rol tiene ahora.
   Tras un guardado bueno la pantalla usa la versión que devolvió la base (`conGuardadosLocales` en roles): reintentar solo
   las etiquetas de la ficha o dos clics seguidos en la matriz no chocan consigo mismos.

### Por qué el código de error `PT409`

PostgREST trata los SQLSTATE `PTxyz` como «responde con HTTP xyz»: el navegador recibe un **409 Conflict** de verdad y
`error.code === "PT409"`, que no se confunde con ningún otro rechazo. Se descartó `40001` (serialization_failure): es de
Postgres, significa «reintenta la transacción tal cual» —lo contrario de lo que hay que hacer aquí— y otras capas lo
reintentan solas. `P0001` (el de siempre) no se distingue de los demás `raise exception`.

### La carrera al guardar

Un `select version` suelto no basta: dos guardados a la vez leerían los dos la versión 5 y pasarían. La RPC de productos
relee la fila con `for update` **filtrando por la versión**: el segundo espera al primero y, al despertar, Postgres
reevalúa el filtro con la fila ya cambiada, no la encuentra y rechaza. Si no la encuentra por RLS (sin permiso para
editar) y no por versión, sigue y el `update` da su mensaje de siempre. `guardar_modulos_rol` ya bloqueaba el rol con
`for update` antes de comparar.

### Por qué tocar `productos` (núcleo, principio 1) es razón de peso

Es el único lugar donde la base puede saber que una ficha está vieja, y el daño que evita es de dinero (precios pisados en
silencio, principio 2: un estado que nadie decidió). Es una columna aditiva con valor por defecto constante: no reescribe
la tabla, no cambia ninguna consulta ni lectura existente, y nada del modelo producto/variante/stock cambia de forma.

### Por qué las variantes no llevan versión propia

Se editan solo desde la ficha del producto, y esa RPC siempre escribe la fila del producto (sube su versión). Ninguna otra
función cambia `precio` ni `activo` de una variante existente. Una versión por variante agregaría 1.300 filas que vigilar
sin cubrir ningún caso más.

## Qué queda fuera (pendientes)

- **El costo que recalcula una recepción.** `fn_recalcular_costo_variante` actualiza `variantes.costo` (costo promedio) y
  NO sube la versión del producto. Si alguien con permiso de dinero tiene la ficha abierta mientras se recibe esa prenda,
  al guardar pisa el costo promedio con el que vio al abrir. No se resolvió subiendo la versión desde la recepción porque
  (a) cada recepción rechazaría las fichas abiertas de sus prendas aunque nadie tocara el costo, y (b) una recepción de
  varios productos bloquearía filas de `productos` en orden arbitrario: dos recepciones cruzadas podrían bloquearse entre
  sí. La salida correcta es que la ficha mande el costo **solo si la persona lo cambió** (y que la RPC no lo toque si no
  viene) — cambio de contrato de la RPC que va con su propio paso.
- **Etiquetas de variante** (`actualizar_variantes_etiquetas`): van en un segundo llamado y solo mandan las variantes cuyas
  etiquetas cambiaron en la ficha; no se versionan.
- **Otras pantallas de edición** (marcas, categorías, clientas, colaboradores): mismo riesgo en menor grado (un campo, no
  un conjunto). Se revisan si aparece el caso; el patrón queda hecho.
- Dos sesiones reales con COMMIT (no dentro de una transacción de prueba) no se probaron en el local compartido para no
  dejar datos; la semántica de `for update` + filtro es la estándar de Postgres (READ COMMITTED, reevaluación de la fila).

## Verificación

- `pnpm pruebas:edicion-simultanea` (12 casos, todo con ROLLBACK, como Felipe con rol `authenticated`): primera sesión
  pasa y devuelve la versión nueva, segunda con la misma versión recibe PT409 y no escribe nada; sin versión guarda como
  hoy; con la versión devuelta vuelve a guardar; «Descontinuar» en bloque sube la versión; `version = 999` a mano no
  cuela; roles: guardar sin cambios no sube la versión, cambiar módulos sí, versión vieja → PT409, renombrar sube la
  versión.
- La migración corre dos veces seguidas (la segunda no cambia nada) y también sobre el cuerpo de producción de
  `catalogo_actualizar_producto` (el de 20260923193700, con el candado de costo): las anclas calzan y el candado se conserva.
- `pnpm pruebas:roles` 70/70, `pruebas:deriva-produccion` en verde (una sola firma de cada RPC).
- Web: typecheck, lint y vitest (`error-escritura`, `roles-reglas`).
