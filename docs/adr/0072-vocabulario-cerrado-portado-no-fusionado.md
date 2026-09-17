# ADR-0072 — El vocabulario cerrado de V1 se porta a V2; la rama entera no se fusiona

**Nota de renumeración (2026-09-16):** nació como ADR-0035, mismo número que
`0035-la-factura-de-compra-es-el-eje-de-recepcion-y-pago.md` (colisión de dos
sesiones paralelas asignando "el siguiente libre" el mismo 2026-09-12). Compras
se queda con 0035 por ser la decisión más antigua; esta pasa a 0072.

**Fecha:** 2026-09-12
**Estado:** Construido y verificado en local (navegador + consulta directa a Postgres).
**Afecta:** `supabase/migrations/20260912235500_vocabulario_cerrado.sql`,
`supabase/migrations/20260912235600_activos_fijos.sql`, `supabase/seed.sql`

## Contexto

El corte V1→V2 (`0af2f1b`, autorizado por Felipe) reemplazó el árbol completo de retail
por un núcleo más simple, validado en un laboratorio aparte. `retail.colores` y
`retail.categorias` de V2 sobrevivieron con forma, pero sin dos piezas que V1 aprendió a
las malas: el candado que evita que "Azul marino" y "azul marino" convivan como dos
colores distintos (V1 lo agregó en ADR-0024 después de sufrir el bug — fusionar dos
colores duplicados significa mover stock real y reescribir `movimientos`), y el código
corto de prenda (`BLU-0042-AZM-M`) que hace escaneable e imprimible cada variante.

Antes de reconstruir esto, se evaluó fusionar la rama completa donde ya estaba
construido (`trix/catalogo-vocabulario`, 57 migraciones sobre el núcleo V1). Un intento
real (`git merge --no-commit --no-ff`) mostró el tamaño del problema: 350 archivos
tocados. La mayoría no eran conflictos de Git — eran archivos que V2 ya había borrado a
propósito (`components/OrdenesProduccion.tsx`, `RecibirLoteForm.tsx`, `ConteoPanel.tsx`,
`InventarioAgrupado.tsx`, módulos enteros de Producción/Inventario V1/Finanzas) y que la
rama V1 nunca tocó desde el ancestro común — Git resuelve eso como un borrado limpio, sin
avisar. Y `supabase/migrations/` habría quedado con los dos núcleos completos a la vez:
mismos nombres de tabla, dos definiciones distintas, sin que Git lo marcara como
conflicto porque los archivos de cada lado tienen nombres distintos.

Antes de descartar la fusión, se verificó qué dato real quedaba en juego (volcado de
producción del 12-sep, `docs/datos/generado/retail_filas.json`, rama trix): catálogo
(`productos`/`variantes`) en 5/19 filas — confirmado test. Facturación/SUNAT (2
comprobantes reales) — ya rescatada por el propio corte a V2. Egresos/Patrimonio/
Contabilidad (`gastos`, `patrimonio_items`, `asientos`, `cuentas_contables`) — cero
filas. La única excepción real: `activos_fijos`, 39 filas, sin tabla equivalente en V2.

## La decisión

**Se porta el vocabulario y `activos_fijos` como migraciones nuevas sobre el esquema real
de V2 — no se fusiona la rama V1.** Concretamente:

- `fn_clave_texto` (normalizador IMMUTABLE) + `colores_clave_unica` (índice único sobre
  `fn_clave_texto(nombre)`) + los 30 colores reales de CAYLA, con `familia_color`/`orden`
  agregados a la tabla que V2 ya tenía.
- `categorias.familia` (6 fijas) + `.prefijo` (3 mayúsculas, único) + las 37 categorías
  reales — agregado a la tabla existente, sin tocar el `nombre unique` global que V2 ya
  eligió (distinto del `(familia, nombre)` de V1; no había razón de negocio para
  cambiarlo).
- Código corto: `codigos_correlativos` + `fn_siguiente_correlativo` (tabla, no
  `sequence` — no transaccional, deja huecos en un rollback) + `fn_token_talla` +
  `fn_asignar_codigo_producto` + `fn_asignar_codigo_variante`, todos idempotentes igual
  que en V1.

**El código se acuña con un TRIGGER `after insert on variantes`, no dentro de una RPC.**
Es la diferencia deliberada más importante frente a V1: ahí, `recibir_lote`,
`crear_producto_con_variantes` y `registrar_produccion` insertaban variantes cada una por
su cuenta, y 3 de esos 5 caminos se olvidaban de llamar a `fn_asignar_codigo_variante` —
la causa raíz de que prendas reales nacieran invisibles para la pistola. V2 hoy no tiene
una sola función que cree variantes (ni siquiera existe todavía); un trigger cierra la
puerta para cualquier camino de escritura, presente o el que se agregue mañana, sin
depender de que alguien se acuerde de llamar a la función correcta.

**`activos_fijos` se porta simplificada: sin la FK a `cuentas_contables`.** V1 la tenía
(`cuenta_codigo references cuentas_contables(codigo)`), pero Contabilidad no tiene dato
real y no se reconstruye hoy — exigir esa FK habría bloqueado traer los 39 activos reales
hasta que Contabilidad exista en V2. Queda como texto libre, documentado, sin candado;
la migración que reconstruya Contabilidad sobre V2 agrega la FK real.

**`seed.sql` se ajusta con `on conflict do nothing`** en sus inserts de `categorias` y
`colores` de prueba — colisionaban en nombre/código con el vocabulario real recién
agregado.

## Consecuencias

- Cualquier variante que se inserte de ahora en más —desde cualquier pantalla o RPC,
  presente o futura— nace con código corto si su color calza con el vocabulario, sin que
  nadie tenga que acordarse de pedirlo.
- Ninguna pantalla de V2 lee `variantes.codigo` todavía — la base está lista, la UI no.
  Conectarla (Catálogo, una futura pantalla de Etiquetas) es trabajo aparte.
- Producción, Inventario V1 y Finanzas siguen fuera de V2. Si vuelven, es una decisión de
  producto de Felipe, no una consecuencia automática de esta migración — este ADR no la
  toma por él.
- `trix/catalogo-vocabulario` queda intacta como referencia — cualquier pieza que se
  decida rescatar después (Producción, por ejemplo) tiene ahí la versión ya construida y
  verificada sobre V1, para adaptar con el mismo criterio que este ADR, no para fusionar
  a ciegas.

## Cómo se verificó

`npx supabase db reset` limpio sobre las migraciones de V2 + estas dos nuevas + el stub
local de Dynamic (`0000_local_stub_dynamic.sql`, copiado del ejemplo — hueco de
`CONTRIBUTING.md` no documentado hasta ahora en este ADR). Confirmado por consulta directa
a Postgres: 30 colores, 37 categorías con prefijo. El candado de duplicados rechaza un
insert de prueba ("azul  MARINO", distinto en mayúsculas/espacios de "Azul marino") con
`ERROR: duplicate key value violates unique constraint "colores_clave_unica"`. Los
productos del seed (`Blusa Emma`, etc.) salieron con código corto real (`BLU-0001-BEI-L`)
sin que el seed mismo lo pidiera — el trigger lo puso solo. En navegador,
`/productos` carga sin errores con los swatches de color reales. `tsc --noEmit` y
`eslint` sobre todo el repo, limpios.
