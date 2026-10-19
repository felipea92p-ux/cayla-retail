# ADR-0457 — Un producto nuevo nace con «Se ve en la web» encendido

- **Fecha:** 2026-10-19 · **Estado:** propuesto (migración y pruebas en la rama; **la migración está en producción desde el 2026-10-19 con el OK de Felipe**, ensayada en una transacción revertida y verificada por md5 del cuerpo)
- **Relacionados:** ADR-0408 (la Vitrina web y `vitrina_productos`), ADR-0371 (las prendas que se proponen nacen «pendiente» y un líder las aprueba), ADR-0377
  (las familias fuera de los motores no van en la web), CLAUDE.md principios 2 y 4.

## El problema

Un producto recién dado de alta no tenía fila en `retail.vitrina_productos`, y «sin fila» significa «no se ve en la web». Para que saliera, alguien tenía
que entrar a Tienda web ▸ Vitrina y encender cada modelo a mano. Felipe pidió (2026-10-19) lo contrario: **lo que se crea sale en la web por defecto, y lo
excepcional es esconderlo.**

## Lo que se decidió

Un disparador `AFTER` sobre `retail.productos` (`fn_vitrina_producto_nuevo_visible`, migración `20261019214000`) crea la fila de la vitrina con
`publicado = true` en dos momentos:

1. cuando **nace** un producto ya aprobado (lo da de alta un líder);
2. cuando se **aprueba** uno que nació pendiente (la prenda que alguien propuso al contar o al recibir). Sin esto, «Nuevo producto» saldría encendido y
   «Es nueva» al recibir saldría apagado: una excepción escondida en la regla.

Queda anotado en la Actividad (módulo `vitrina_web`, «se muestra en la web … (producto nuevo)»).

**Lo que no cambia, y por eso no hizo falta tocar nada más:**

- Encender no publica a ciegas: la tienda y la pantalla siguen preguntando `fn_vitrina_publicable` en cada lectura. Un producto creado ANTES de sus tallas
  (el orden real del alta) no sale hasta tener una talla activa con precio.
- Un producto de prueba y el empaque (familia con «Cuenta en Análisis…» apagado) no reciben fila.
- Esconderlo sigue siendo un toque en la Vitrina; ninguno de los dos disparadores corre otra vez sobre ese producto (solo al nacer y al aprobarse).
- **Los modelos que ya existen no se tocan** (no se rellena nada): no se muestra de golpe en la web lo que Felipe nunca decidió mostrar.

## Alternativas descartadas

- **Leer «sin fila» como «se ve».** Mostraría de una vez todos los modelos que hoy no están en la vitrina (~256 en producción).
- **Cambiar `crear_producto_con_variantes`.** Tiene cinco capas de reemplazos anclados y la alta nace por varios caminos (Nuevo producto, «Es nueva» al
  recibir, el conteo, el modelo nuevo del Taller); el disparador deja la regla en un solo lugar y un camino nuevo la hereda.
- **Una columna `visible_por_defecto`:** otra fuente de verdad para lo que ya dice `vitrina_productos.publicado`.

## Se rompe si

- Alguien da de alta un modelo para probar y no quiere que salga: si ya tiene tallas con precio, la tienda lo ve hasta que lo escondan o lo marquen «de prueba».
- La familia de un modelo pasa a «fuera de los motores» después de nacer: su fila queda encendida, pero `fn_vitrina_por_que_no` dice «empaque» y la tienda
  no lo muestra.

## Verificación

`pnpm pruebas:vitrina-web`, sección «Un producto nuevo nace visible» (8 escenarios: líder, Actividad, la tienda sigue pidiendo «se puede vender», prueba,
empaque, esconder se respeta, no se tocan los que ya existían, y la prenda pendiente que se aprueba). Dos suites que daban por hecho que un producto nuevo
nacía sin fila se ajustaron: `vitrina_web.mjs` (eliminar un producto con su fila) y `tienda_club.mjs` (su ayudante inserta o actualiza la fila).
