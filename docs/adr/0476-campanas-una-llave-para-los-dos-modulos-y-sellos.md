# ADR-0476 — Campañas: una llave para los dos módulos y para Sellos

- **Fecha:** 2026-10-22 · **Estado:** migración `20261022203000_campanas_llave_de_los_tres_modulos.sql` y su prueba
  (`pnpm pruebas:campanas-llave-unica`, 27/27 en local) en la rama `claude/campanas-llave-unica`. **Pegada en producción el 2026-10-22** (orden de Felipe, después de `20261022151000` de ADR-0473; quedó registrada como `20261022204822`). Verificada: las 10 funciones con el md5 de esta migración aplicada en local, lo de diseño de #1190 sin permiso de ejecutar, `campana_disenos` comentada.
- **Relacionados:** ADR-0436 (Campañas con diseño propio, PR #1190, **sin fusionar**), ADR-0471 (Tienda web ▸ Campañas,
  `campanas_web`), ADR-0473 (Catálogo ▸ Campañas y «Sellos», otra rama), ADR-0161 y ADR-0306 (módulos y roles), ADR-0293 (descuento
  por etiqueta), ADR-0195 (políticas y deadlocks).

## El problema

Una campaña (Día del Gato, Navidad) es una fila de `retail.etiquetas` con estilo `campana`. Al 2026-10-22, consultado en producción
en solo lectura:

- **Dos módulos de campañas en Tienda web con el mismo orden (67):** `campanas` (de #1190; su pantalla nunca se publicó; su tabla
  `campana_disenos` está vacía; lo tiene el rol Terminal Almacén) y `campanas_web` (de ADR-0471; es la pantalla que se usa; 1 diseño
  programado; ningún rol).
- **Producción y el repo no decían lo mismo.** De #1190 se pegaron 4 de sus 8 migraciones. Una de ellas, `20261017151000`, hizo que
  configurar una campaña o ponérsela a una prenda pidiera el módulo `campanas` (`fn_puede_campanas`, 13 funciones), no Etiquetas.
  El repo seguía creyendo que bastaba Etiquetas. Efecto real: desde el 2026-10-17, **Compras y Terminal de ventas** (tienen Etiquetas,
  no `campanas`) no podían armar una campaña ni ponérsela a una prenda, y una campaña que creaban nacía «por aprobar».
- **La web borra `campanas` sin aviso:** `guardar_modulos_rol` guarda la lista de módulos que manda la pantalla, y la web no conocía
  `campanas`. #1190 decía que las dos terminales lo tenían; hoy solo Terminal Almacén.
- **Choque con ADR-0473:** el módulo nuevo `campanas_catalogo` parchaba `fn_puede_editar_etiquetas`, que para una campaña la base de
  producción ya no pregunta: quien recibiera ese módulo vería la pantalla y la base le rechazaría cada guardado.

## Lo que decidió Felipe (2026-10-22)

«Quiero que se pueda editar, agregar prendas y demás cosas a las campañas desde ambos módulos.» Eligió, mirando las opciones:

1. **La llave:** quien ve «Campañas» o «Campañas de la tienda web» edita TODO de una campaña: nombre, fechas, descuento, categorías,
   prendas, activarla o no.
2. **La pantalla:** la ficha de cada campaña en Tienda web suma las pestañas Datos y Prendas con la MISMA pieza que Catálogo ▸ Campañas.
3. **El módulo:** se reusa `campanas`, que se muda a Catálogo (lo hace la migración de ADR-0473). No nace `campanas_catalogo`.
4. **Sellos:** quien ve Sellos (`etiquetas`) también configura campañas, como antes del 2026-10-17.

## Lo que hace esta migración

1. `fn_puede_campanas()` = líder, o un rol con `campanas`, `campanas_web` o `etiquetas`. Es LA llave de una campaña.
2. Trae al repo, como corren en producción (md5 comparados uno por uno), lo que #1190 dejó pegado de esa llave: `fn_puede_tocar_etiqueta`,
   el disparador de alta, `etiquetar_variantes`, `actualizar_campana_etiqueta`, y las funciones de pantalla `crear_campana`,
   `guardar_campana`, `activar_campana`, `campana_detalle` y `fn_campana_nombre_valido`. Solo cambian los mensajes, que nombran los tres
   módulos. Con ellas, las dos pantallas guardan una campaña sin pasar por la política `etiquetas_update` (que sigue pidiendo Sellos para
   escribir la fila directo).
3. **Archiva** (no borra) lo de #1190 para su editor de diseño, que reemplazó ADR-0471: les quita el permiso de ejecutar a
   `campana_diseno`, `guardar_diseno_borrador`, `publicar_diseno_campana` y `volver_al_diseno_anterior`, y deja un comentario de archivada
   en `retail.campana_disenos`. Solo si existen (en local y en el CI no existen).

**Un sello que no es campaña sigue siendo solo de Sellos.** Con un módulo de Campañas no se le ponen prendas ni descuento.

## Qué no hace

- No crea, no mueve ni renombra el módulo `campanas` (ADR-0473) y no le da un módulo a ningún rol (ADR-0161). Terminal Almacén conserva
  `campanas`; si Compras o Terminal de ventas deben tener Campañas, se lo da el líder en Roles y accesos. Con Sellos ya pueden.
- No toca `tienda_portada()`: sigue leyendo `campana_disenos` y devuelve `diseno: null`, que la tienda ya tolera.
- No trae al repo las otras funciones de #1190 que viven en producción sin pantalla (`campanas_lista`, `campanas_portada_dias`,
  `fn_campana_en_portada`, el `tienda_portada` con diseño): ninguna pantalla de `main` las llama.

## Descartado

- **Copiar `20261017151000` tal cual:** su número es de la rama de #1190 y reemplaza por ancla desde un texto que en producción ya no
  está. Aquí cada función va completa y una guarda al principio comprueba que lo que hay es lo del repo, lo de producción o esto
  mismo; si no, no aplica nada.
- **Abrir la política `etiquetas_update` a las campañas:** una política toma en exclusiva las tablas de `auth` y `storage` (ADR-0195),
  y las funciones `security definer` ya hacen el trabajo.
- **Tres llaves distintas** (Catálogo todo, Tienda web solo prendas, el descuento solo en Catálogo): Felipe eligió una sola.
- **Retirar `campanas` y llevar la llave a un módulo nuevo** (la alternativa B): `retail.modulos` no tiene columna de archivo y
  Terminal Almacén perdía el acceso hasta que el líder le diera el nuevo.

## Verificado

- `APLICAR_ANTES=… pnpm pruebas:campanas-llave-unica`: 27/27 en el Postgres local, en transacciones con ROLLBACK. Con cada uno de los tres
  módulos: crea, lee, guarda, pone y quita prendas, desactiva. Sin ninguno: cada puerta la rechaza. Un sello no es de Campañas. La
  migración se aplica dos veces seguidas.
- **Desde el estado de producción:** la `20261017151000` de #1190 y después esta, en una transacción. El diff de los cuerpos solo muestra
  mensajes y comentarios, y lo de diseño queda sin permiso.
- `versiones`, reservas, `sin-drop-trigger` y las 42 pruebas del SQL pegado, en verde.

## Sin verificar

La suite completa de Postgres en un stack propio (la corre el CI). La base local compartida está a medio
migrar: no tiene `campanas_web` y sí tiene la fila de `campanas`.

## Actualización 2026-10-24 — #1190 se cierra y la portada vuelve a `main`

**Qué cambia.** #1190 (ADR-0436) se cierra sin fusionar (decisión de Felipe, tras un diagnóstico de solo lectura del 2026-10-23). Este ADR había dejado
`tienda_portada()` como la de #1190 «a propósito»; esa pieza era lo único vivo que ataba la tienda a #1190 (668 llamadas desde el 17-oct) y lo que mantenía
la deriva diaria en rojo desde el 15-oct. La migración `20261024155000_campanas_cierre_de_1190_portada_a_main_y_archivo.sql` (borrador, sin pegar):

1. Devuelve `tienda_portada()` EXACTAMENTE a la de `20261014220000` (guarda de md5: solo acepta la de #1190 o la de main).
2. Quita el EXECUTE de `public`, `anon` y `authenticated` a las 10 funciones de diseño que #1190 dejó (donde ya estaba quitado no cambia nada), y las comenta «ARCHIVADA».
3. Corrige el comentario de `campana_disenos` (decía que `tienda_portada()` la sigue leyendo).

Nada se borra. `scripts/migraciones/deriva.mjs` registra lo archivado como diferencia CONOCIDA, con las 10 funciones y los dos permisos de la tabla **congelados por
huella**: si alguien vuelve a abrir su EXECUTE (re-pegar `20261017160000`, `144000`, `200000` o `231000`), la huella cambia y la revisión diaria lo muestra.

**DECIDÍ:** cerrar #1190 y limpiar. **DESCARTÉ:** fusionarlo (33 archivos en conflicto, dos sistemas de diseño de campaña paralelos, su editor ya no tiene permiso de
ejecutar en producción y en el CI sus migraciones corren después de las de main, donde `144000` y `151000` abortan en su propia guarda); y marcar su casilla de
«SQL pegado» (producción tiene 4 de sus 8 migraciones: la comprobación fallaría por las otras 4). **SE ROMPE SI:** se borra `fn_campana_en_portada`,
`fn_diseno_json` o `campana_disenos` ANTES de pegar la migración (la portada se queda sin campaña en silencio), o se re-pega una de las migraciones congeladas de #1190.

**Se pierde, hasta rehacerlo sobre `campana_web_disenos`:** campañas sin descuento en la portada (`204000`), el carrusel (`210000`), la puerta de Editar producto
(`212000`; sigue abierta por ADR-0293), el editor de siete pasos con fondo con foto (`231000`) y `packages/portada`. La rama de #1190 se conserva: ahí vive ADR-0436
(35 decisiones) y su maqueta.

**Ensayo (base desechable = main + las 4 migraciones de #1190 pegadas; funciones y permisos idénticos a producción):** `pnpm pruebas:tienda-puerta` pasa de 35/36 a
36/36; con dos campañas de prueba devuelve la misma campaña que antes sin la clave `diseno`; pegada dos veces seguida no cambia las huellas; en una base de main sin
#1190 no cambia nada; si `tienda_portada()` fue tocada a mano, la guarda aborta sin aplicar nada; `deriva.mjs` pasa de «4 diferencias» a «58 conocidas, 0 sin explicar».
**Sin verificar:** pegarla en producción (no se hizo) y ver la tienda real en un navegador. Sigue en rojo la deriva por `fn_analisis_pedido_en_camino(uuid)`, de la rama
`claude/skills-todos-agents-94f745` (sin PR), que no es de este cierre.
