# ADR-0247 · «Ajustar stock» se separa de Existencias, como módulo propio

- **Fecha:** 2026-09-27 · **Estado:** propuesto, sin pegar en producción.
- **Pedido:** Felipe, 2026-09-26: sacar «Ajustar stock» de Existencias y darle su propio módulo en Roles y accesos,
  que nace disponible SOLO para el líder.
- **Migración:** `20260928110000_ajustar_stock_modulo_propio.sql`.
- **Complementa:**
  - ADR-0161/0178: un rol decide solo «ve/no ve» por módulo; «solo das lo que tienes».
  - ADR-0240: «una puerta, un candado» — este ADR cierra la puerta que el 0240 dejó abierta a propósito.
  - ADR-0235: un ajuste no es la primera carga (`cargar_stock_inicial` sigue sin este candado).
  - ADR-0160: D-13, el candado de líder original de `registrar_movimiento` (este ADR lo reemplaza, no lo repite).

## Problema

`retail.fn_puede_ajustar_inventario()` (D-13, 2026-09-21) le da la capacidad de ajustar stock a cualquier cuenta que
VEA Existencias, Conteos o Traslados — no a quien tiene un módulo que lo diga. El rol «Integrante» (17 cuentas en
producción, consultado en vivo el 2026-09-26) tiene los tres, así que cualquier integrante puede subir o bajar el
stock de una prenda sin que el líder lo haya decidido módulo por módulo. Es la misma clase de hueco que ADR-0240 cerró
para reponer, retirar y apartar — «dos puertas para la misma escritura, con candados distintos» — pero ADR-0240 dejó
esta puerta afuera a propósito (BACKLOG: «Existencias: una puerta, un candado», pendiente #3 A/B).

## Decidí

1. **Módulo nuevo `ajustar_stock`** (grupo Inventario, orden 86, entre Bajada al piso y Conteos), delegable, **sin
   fila en `rol_modulos`**: nace disponible SOLO para el líder (ADR-0161), Felipe lo delega después.
2. **`retail.fn_puede_ajustar_stock()`**: líder, o el rol ve el módulo (espeja `fn_capacidad_por_modulos`, el mismo
   patrón de `fn_puede_ajustar_inventario`, `fn_puede_editar_catalogo`, etc.).
3. **El candado real cambia en `registrar_movimiento`**: de `fn_puede_ajustar_inventario()` a
   `fn_puede_ajustar_stock()`. Es la única función que ESCRIBE un ajuste/entrada/salida suelto; hoy su único llamador
   es `ajustar_inventario` (ADR-0240 ya dejó a la web sin otra puerta para esto).
4. **`ajustar_inventario` pide el mismo módulo por su cuenta**, antes de tomar cualquier lock, solo cuando la lista de
   ajustes no está vacía. No es redundante sin motivo: evita bloquear el stock de varias prendas (`fn_bloquear_en_orden`)
   y llamar a `cargar_stock_inicial` para nada, si la cuenta no puede ajustar. El candado que de verdad protege sigue
   siendo el de `registrar_movimiento` (defensa en profundidad, no dos verdades).
5. **La pantalla muestra el botón «Ajustar» (Existencias, Productos, Movimientos) solo con el módulo**: nuevo permiso
   `ajustarStock` en `lib/menu.ts`, derivado en `lib/modulos.ts` de `completo("ajustar_stock")` — sin mezclarlo con
   `ajustarInventario`, que sigue significando otra cosa (punto 6).
6. **No toqué `fn_puede_ajustar_inventario()`, `cerrar_conteo` ni `cerrar_traslado_con_diferencia`.** Felipe decidió
   (2026-09-26) dejarlos como están por ahora: cerrar un conteo o un traslado con diferencia sigue siendo «Existencias,
   Conteos o Traslados», no el módulo nuevo. El permiso `ajustarInventario` (frontend) tampoco cambia: sigue gateando
   `puedeCerrar` (Conteo) y `puedeCerrarDiferencia` (Traslados), y el contador «traslados por atender con diferencia»
   (`getTrasladosPorAtender`, `caja-tablero.ts`, `layout.tsx`, `page.tsx`).
7. **No toqué `cargar_stock_inicial`/`fn_cargar_stock_inicial`** (ADR-0212/0235): sigue aceptando
   `fn_puede_editar_catalogo() or fn_puede_ajustar_inventario()`, exactamente igual. Cargar la primera cantidad de una
   prenda nueva no es ajustar (ADR-0235): son problemas distintos y esta migración no reabre esa puerta.
8. **Sin pantalla nueva para pedir un ajuste.** Felipe decidió (2026-09-26): quien vea un stock que no cuadra se lo
   dice a una líder de su sede, que ajusta ella con el mismo modal de siempre. El mensaje de error de
   `registrar_movimiento` lo dice: «Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo
   ajuste».

## Descarté

- **Que Integrante conserve el módulo un tiempo, hasta que Felipe lo quite a mano.** Felipe decidió (2026-09-26) que
  el hueco se cierra el mismo día que se pega la migración: el módulo nace sin rol, como manda ADR-0161. Costo
  aceptado: las 17 integrantes pierden el botón «Ajustar» de golpe, hasta que Felipe delega el módulo.
- **Una pantalla «Pedir ajuste» dentro del sistema** (tabla + bandeja de aprobación). Felipe decidió (2026-09-26) que
  hoy no hace falta: el pedido viaja por fuera del sistema (a la líder), sin tabla ni pantalla nueva. Si en el futuro
  eso no alcanza, es una migración y un ADR propios — no se cuela aquí.
- **Que cerrar un conteo o un traslado con diferencia también pidan «Ajustar stock».** Felipe decidió (2026-09-26) no
  tocarlos ahora: son la aprobación de lo contado/recibido, un problema distinto (y ADR-0244 está trabajando sobre
  Conteo en paralelo — tocar su candado en el mismo PR habría chocado con esa sesión). Sigue abierto: una integrante
  con Conteos puede dejar el stock en cualquier cifra contando mal a propósito y cerrando ella misma. Queda en
  BACKLOG para que Felipe lo decida por separado.
- **Cambiar qué significa `fn_puede_ajustar_inventario()`** (por ejemplo, redirigirla al módulo nuevo). Eso habría
  cambiado también `cargar_stock_inicial`, `cerrar_conteo` y `cerrar_traslado_con_diferencia` sin que nadie lo pidiera.
  Una función, un significado: se creó `fn_puede_ajustar_stock()` aparte.

## Se rompe si

- **Se publica la web sin encender antes «Ajustar stock» en los roles que hoy ajustan y deben seguir haciéndolo.** Al
  2026-09-26, «Integrante» (17 cuentas) es el único rol con cuentas que ajusta stock por Existencias/Conteos/Traslados
  hoy; las Terminal Almacén/de ventas tienen 0 cuentas. **Antes de publicar, Felipe revisa en Roles y accesos** —
  nunca se asigna desde el código (ADR-0161).
- **Una integrante cuenta mal a propósito y cierra su propio conteo.** `ajustar_stock` no cierra ese hueco (punto de
  «Descarté»): sigue siendo del rol con Conteos, sin este módulo de por medio.
- **Dos personas ajustan la misma prenda a la vez.** Sin cambios respecto a ADR-0240: las dos pasan (una detrás de la
  otra, por el candado de `ajustar_inventario`); esto no lo toca.

## Cómo se despliega (producción: con el visto bueno de Felipe)

1. Se pega `20260928110000` sola (crea un módulo y reemplaza dos funciones; sin políticas ni `alter` de tablas en uso).
2. Felipe revisa en Roles y accesos si algún rol necesita «Ajustar stock» ahora mismo (recomendado: ninguno, se delega
   después) y lo enciende si corresponde, ANTES de que las integrantes lo necesiten.
3. Se publica la web.
4. Se refresca el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) y se corre `pnpm datos:comparar`.

## Antes de decir «listo»

1. **Concurrencia:** dos cuentas ajustando la misma prenda a la vez no cambia con este ADR — sigue protegido por el
   candado 2 de `ajustar_inventario` (`fn_bloquear_en_orden`, ADR-0240), que este ADR no toca.
2. **Caída externa:** este cambio no llama a SUNAT, Lucode, ni a la consulta de padrón — no depende de ninguna
   integración externa. Si `authenticated` pierde conexión a mitad del ajuste, `ajustar_inventario` ya resuelve eso
   con su marca de reintento (ADR-0240); este ADR no lo modifica.
3. **Persona sin contexto:** una integrante sin el módulo ya no ve el botón «Ajustar» (no llega a un error de
   permisos en pantalla); si de todos modos algo llegara a llamar a la base directamente, el mensaje nombra el módulo
   exacto y a quién pedírselo, no un «42501» desnudo.

## Verificación

- `pnpm pruebas:existencias-candados-y-ajuste`: casos nuevos para `ajustar_stock` (ver el script).
- `pnpm pruebas:roles`: un módulo recién creado (`ajustar_stock`) solo lo ve el líder.
- `lib/modulos.test.ts` y `lib/menu.test.ts`: el catálogo de la web es el de la base; el permiso `ajustarStock` no
  cambia el menú de HOY (Integrante sigue viendo las mismas pantallas; solo deja de ver el botón «Ajustar» dentro de
  ellas).
- En el navegador, con la cuenta de integrante en Trujillo: en Existencias y en Productos, «Ajustar» no aparece; en
  Movimientos, el atajo «Corregir» tampoco. Con la cuenta de líder, todo sigue igual.
