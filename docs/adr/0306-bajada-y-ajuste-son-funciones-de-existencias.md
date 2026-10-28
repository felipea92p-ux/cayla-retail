# ADR-0306 · «Bajada al piso» y «Ajustar stock» son funciones de Existencias, no módulos

- **Fecha:** 2026-10-02 · **Estado:** en el repo; migración sin pegar en producción (pide OK de Felipe).
- **Pedido:** Felipe, 2026-10-02: «si son pantallas u opciones del lado izquierdo, es un módulo y eso debe estar en roles;
  si no, no. Y quien tiene el módulo puede hacer todo lo que está dentro».
- **Migración:** `20261002120000_bajada_y_ajuste_dentro_de_existencias.sql`.
- **Reemplaza, en esto:** ADR-0208 (módulo «Bajada al piso»), ADR-0240 (reponer/retirar piden «Bajada al piso») y
  ADR-0250 (módulo «Ajustar stock»). Las tablas, la marca de reintento y Frescura de esos ADR no cambian.

## Problema

El Terminal de ventas tenía Existencias, Conteos y Traslados y «Reponer» no le funcionaba. Desde el 2026-09-27
`bajar_al_piso`, `mover_entre_piso_y_almacen` y `retirar_del_piso` exigían el módulo «Bajada al piso», y desde el 09-28
ajustar stock exigía «Ajustar stock». Ninguno tiene entrada en el menú y los dos nacieron sin rol (regla ADR-0161). Las
tiendas bajaban prendas del almacén al piso sin registrarlo, el piso no sumaba y Vender no dejaba vender. Y ajustar el piso
con «Reposición» ya no valía (migración 20260926000400, a propósito), así que no había salida.

## Decidí

1. **Un módulo es una entrada del menú izquierdo.** Una acción dentro de una pantalla es una función de su módulo.
   Quien ve el módulo hace todo lo de adentro (salvo lo «solo del líder», con `fn_es_lider()`). Va a CLAUDE.md
   («Módulos y roles») y lo vigila `lib/modulos.test.ts`: un módulo sin entrada de menú solo pasa si está declarado
   (Colaboradores, Roles, Configuración y Actividad, que tienen pantalla propia fuera del lateral).
2. `bajar_al_piso`, `mover_entre_piso_y_almacen` y `retirar_del_piso` piden `fn_ve_modulo('existencias')`.
3. `fn_puede_ajustar_stock()` = líder o Existencias / Conteos / Traslados (lo de antes de ADR-0250; ajustar queda dentro
   de esos módulos). `registrar_movimiento`, `ajustar_inventario` y `registrar_hallazgo_de_conteo` no cambian, salvo su
   mensaje de error.
4. Se retiran del catálogo `bajada_piso` y `ajustar_stock`. Producción (consultada 2026-10-02): 3 asignaciones de rol
   —Integrante: bajada_piso; Terminal Almacén: bajada_piso y ajustar_stock— y todos esos roles ya tienen Existencias, así
   que nadie pierde nada. `actividad`, `lider_modulos_ocultos` y `roles.pantalla_principal` no los nombran.
5. La web pregunta por Existencias donde preguntaba por esos dos módulos; se quita el aviso «pídesela a quien tenga el
   módulo Bajada al piso».

## Descarté

- **Que «Existencias» implique el módulo viejo con un alias en `fn_ve_modulo`:** deja un módulo fantasma en Roles y accesos.
- **Dejar «Ajustar stock» aparte «porque es delicado»:** es la decisión que dejó al terminal sin poder operar. Si una acción
  debe ser solo del líder, se dice con `fn_es_lider()`, no escondiéndola en un módulo sin menú.
- **Borrar historia:** `movimientos` y `bajada_piso_items` no se tocan; solo se borran 3 filas de configuración de roles.

## Efecto que se acepta

El Terminal de ventas (Existencias, Conteos, Traslados) y todo Integrante pasan a poder ajustar stock; hoy solo podían el
Terminal Almacén y el líder. Es lo que pide la regla; los ajustes siguen firmados con el responsable y quedan en `movimientos`.
**Apartar** sigue pidiendo «Apartados», que sí tiene entrada en el menú (Ventas ▸ Apartados).

## Cómo se pega

DESPUÉS de publicar la web de este PR. Una sola parte, sin políticas ni `alter` de tablas en uso (ADR-0195 no aplica),
idempotente. Se rompe si alguien vuelve a pegar 20260926000200, 20260927180000, 20261001150000 o 20260928130000.

## Actualización 2026-10-03 — la carga inicial «al piso» es de quien crea el producto

- **Pedido:** Felipe, 2026-10-03: «no deben existir restricciones: si tengo un módulo, debo poder hacer todo en ese módulo, sin
  importar si tengo Existencias o no».
- **Problema:** Nuevo producto (paso 4) apagaba «En piso de venta» a quien ve Productos pero no Existencias, porque
  `crear_producto_con_stock_inicial` cuelga las prendas con `bajar_al_piso` y esa pide Existencias. Era el mismo error que
  este ADR corrigió en el lateral: un módulo que obliga a tener otro.
- **Decidí:** `crear_producto_con_stock_inicial` y `cargar_stock_inicial` ponen, solo dentro de su transacción, la marca
  `retail.carga_inicial = 'si'` justo antes de la bajada y la quitan justo después; `bajar_al_piso` acepta la marca además del
  módulo. Reponer, subir y retirar por su cuenta siguen pidiendo Existencias (la prueba `F8` lo exige). La web ya no pregunta
  por Existencias en Nuevo producto (`NuevoProductoForm`) ni en la carga inicial de Editar producto.
- **Descarté:** darle `existencias` a quien ve `productos` (otra vez un módulo que arrastra a otro); y quitar el candado de
  `bajar_al_piso` (la reposición del piso sin Existencias es justo lo que ADR-0306 no quiere).
- **Migración:** `20261004000000_carga_inicial_al_piso_sin_existencias.sql`, por ancla, DESPUÉS de `20261002120000`
  (aborta con un mensaje claro si falta). Sin pegar en producción: pide OK de Felipe.
