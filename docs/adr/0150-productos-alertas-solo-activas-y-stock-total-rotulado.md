# ADR-0150 — Productos: las alertas de stock solo cuentan prendas activas, «Stock» se llama «Stock total» y los números de la cabecera dejan de mentir

**Fecha:** 2026-09-22
**Estado:** Aceptado e **implementado en local** (rama `claude/pantalla-ebc078`). Verificado con la base local real (25 verificaciones de
integración; contra las funciones de producción fallan 9, y siete mutantes de una línea fallan todos), 14 pruebas unitarias nuevas (también con
mutación), tipos, lint, las pruebas de la app y una vista previa con datos inventados a 375 px y a 1 280 px. Pasó además una **revisión adversarial
de tres revisores independientes** (base de datos, pantalla y consecuencias en el resto del sistema): sus hallazgos están corregidos abajo o
declarados en «Lo que este ADR NO toca». **Una migración sin aplicar en producción** (ver «Cómo se pega en producción»).
**Decide:** Felipe, el 2026-09-22: «opción A, y haz las tareas #1 a #4» del análisis `docs/pantallas/productos.md`, y «corrige lo que encuentren
los revisores».
**Afecta:** `fn_productos` y `fn_productos_resumen` (mismas firmas y columnas); `ProductosGrilla.tsx`, `ProductosAgrupados.tsx`,
`page.tsx` de `/productos`; `components/ui/Chip.tsx` (una prop nueva, `tachado`, que por defecto deja todo como estaba);
`lib/productos-stock.ts` y `components/NotaStockTotal.tsx` (nuevos). **Ningún cambio de tablas, de permisos ni de políticas.**

## Contexto — el problema

El análisis de `/productos` (2026-09-21) encontró cuatro problemas: tres números de la cabecera decían algo distinto de lo que el ojo leía, y el
rojo se desbordaba:

1. **Los descontinuados disparaban alertas.** La lista incluye por defecto las prendas descontinuadas, y «sin stock», «stock bajo», «para pedir» y
   el bloque «A quién pedirle» las contaban a todas. Una prenda en liquidación, con ventas recientes y poco stock, salía como «para pedir» y la
   pantalla sugería comprársela otra vez al proveedor. Según una lectura de producción del 2026-09-21 (por confirmar con la consulta Q2 del análisis)
   «23 sin stock» eran 17 o 18 de verdad y los «3 para pedir» eran prendas de prueba descontinuadas.
2. **«Stock» sumaba toda la red** —todas las sedes y el Taller— bajo un selector de sede («TIENDA TRU») que parecía cambiarlo. Es una decisión de
   Felipe del 2026-09-15 (`20260915160000_productos_listado_filtros.sql`) que choca con R-48 («cada líder ve solo su sede»); nada en la pantalla
   decía de qué stock se hablaba.
3. **«190 variantes» era falso** (la base tiene 163): `fn_productos_resumen` contaba `count(v.id)` después de unir con `stock`, y una variante con
   stock en dos sedes se contaba dos veces.
4. **El rojo se desbordaba:** un «Stock 0» rojo por cada prenda agotada, más el rojo del subtítulo. Con 23 prendas en 0, más de la mitad de la
   grilla en rojo; el máximo por pantalla es 2 (`MAX_ROJO_POR_PANTALLA`).

## Decisión

**1. Una prenda descontinuada no dispara alertas.** Sigue listada, se puede buscar y reactivar (la Tabla tiene «Activar» en bloque), pero no cuenta
como «sin stock», «stock bajo» ni «para pedir», y no sale en «A quién pedirle». El filtro `p_stock` y el contador cambian **juntos**: el número de
arriba es lo que muestran las tarjetas de abajo, con o sin filtros de estado, color, precio, marca, proveedor o búsqueda (lo comprueba la prueba de
integración sobre 18 combinaciones). La Grilla marca la prenda con un chip «Descontinuado» (antes solo se veía dentro de la vista rápida), con fondo
propio para que se lea sobre una foto oscura, y el botón de la tarjeta lo dice también a un lector de pantalla («… (descontinuado)»). Si alguien pide
descontinuadas Y una alerta de stock a la vez —una combinación que no puede devolver nada—, la pantalla lo explica en vez del «Ningún producto calza»
genérico.

**2. «Stock bajo» y «sin stock» no se solapan** *(lo encontró la revisión adversarial)*. Una prenda activa con mínimo cargado y 0 unidades contaba en
los dos contadores y salía en las dos listas, pero la tarjeta (que ya era exclusiva) solo decía «sin stock». Ahora «bajo» exige tener unidades: 0 es
«sin stock», no las dos cosas. Hoy el efecto es casi nulo (38 de 39 productos activos no tienen mínimo) pero deja de haber un mismo problema contado
dos veces.

**3. Opción A: «Stock total».** El número no cambia (sigue siendo el total de la red, decisión del 2026-09-15); lo que cambia es que **lo dice**:
«Stock total 12» en la tarjeta y en la Tabla, un `title` «Suma de todas las sedes y el Taller.» y una línea siempre visible bajo los contadores
(un `title` no se ve en una tablet) con un enlace a Inventario para ver una sola sede. **La opción B (cifra «vendible en mi sede») y la C («hay en
otra sede») quedan sin decidir**: dependen de resolver R-48 contra la decisión del 2026-09-15.

**4. «N variantes» cuenta variantes:** `count(distinct v.id)`. **Una sola migración, a propósito** *(lo encontró la revisión adversarial)*: yo la había
partido en dos archivos («un cambio de resultado no se mezcla con otro»), pero se pegan a mano en el SQL Editor y las dos reemplazaban las mismas
funciones enteras: pegadas en otro orden, una dejaba la versión vieja del contador de variantes, y la segunda pegada sola dejaba el resumen sin
coincidir con la lista. Un archivo, un pegado, atómico.

**5. «Sin stock» no es rojo, y se llama igual en toda la pantalla.** Un chip neutro en la tarjeta (texto en tinta en la Tabla). «Stock bajo» se dice
también con palabras («Stock bajo: 3» en la Grilla, «3 · bajo» en la Tabla): ya no depende solo del color. Antes la tarjeta decía «Agotado» y el
subtítulo y el filtro «sin stock»: una persona contaba 17 tarjetas «Agotado» y no llegaba al número de arriba. Una descontinuada en 0 dice «Stock
total 0» (un hecho, no una alerta). El único rojo de la pantalla en el caso normal es el «N sin stock» del subtítulo (cuando el líder tiene prendas
pendientes de revisar hay además un borde rojo en ese aviso).

La regla de qué prenda pide atención vive en `lib/productos-stock.ts` (`alertaDeStock`) y la usan la Grilla y la Tabla: antes cada una tenía su
copia. Está duplicada con la de SQL a propósito —la base cuenta, la pantalla pinta— y una prueba fija que coincidan en los casos borde.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** las alertas de stock solo cuentan prendas `estado = 'activo'`, en la base (contadores y filtro) y en la pantalla (chips).
**DESCARTÉ:** ocultar los descontinuados por defecto (`estado = activo` en la lista). Costo concreto: la Tabla trae «Activar» en bloque y el flujo
Activo → Descontinuado se verificó en esta pantalla (BITÁCORA 2026-09-15); ocultarlos obligaría a buscarlos con un filtro para reactivar una prenda.
**SE ROMPE SI:** una prenda descontinuada todavía se vende y de verdad hay que reponerla (una liquidación que resulta ser un éxito): dejaría de salir
en «A quién pedirle» y habría que reactivarla primero, que es lo correcto —un descontinuado que se sigue pidiendo ya no está descontinuado—, pero hay
que saberlo.

**DECIDÍ:** el número sigue siendo el total de la red y se rotula (opción A).
**DESCARTÉ:** cambiarlo ya a «mi sede» (opción B). Costo concreto: cambia el contrato de dos funciones `security definer` que tendrían que validar la
sede con `fn_puede_operar_ubicacion` (si no, cualquiera lee la sede ajena pasando su id), y el «para pedir» seguiría midiendo la demanda de toda la red.
**SE ROMPE SI:** una colaboradora de TRU lee «Stock total 3», entiende que son de su tienda y le promete una prenda a una clienta que en realidad está
en el Taller. El rótulo lo dice, pero no lo impide: solo la opción B lo impide.

**DECIDÍ:** una sola migración para las dos funciones.
**DESCARTÉ:** dos archivos, uno por cambio visible. Costo concreto: el orden de pegado deja de ser opcional y nada lo detecta después.
**SE ROMPE SI:** alguien quiere revertir solo uno de los dos cambios: tendrá que escribir la versión intermedia a mano.

## Lo que este ADR NO toca (queda abierto, sin decidir)

- **R-48 contra la decisión del 2026-09-15** (qué número debe ver una tienda): sigue abierta. Opciones y recomendación en la sección 8 de
  `docs/pantallas/productos.md`. Cuando se decida, R-48 en `docs/datos/15-COMO-OPERA-CAYLA.md` debe llevar la excepción explícita (hoy no la lleva).
- **Inventario cuenta distinto.** Existencias y su Resumen (`inventario-v2.ts:114,337`; `20260918080000_resumen_inventario.sql`, donde se declara a
  propósito «un producto descontinuado con stock SÍ entra») siguen contando las descontinuadas como sin stock, stock bajo y reponer piso, porque solo
  filtran `variantes.activo`, y «Desactivar» en bloque cambia `productos.estado` y no `variantes.activo`. Productos e Inventario pueden dar hoy dos
  respuestas para la misma prenda. Es otro módulo: se decide con Felipe antes de tocarlo.
- **Inicio** (`app/(app)/page.tsx`) cuenta «Productos activos» sobre todas las filas de `productos` (descontinuadas y el producto especial de cargos
  incluidos) y «Variantes (SKU)» sobre todas las de `variantes`: no coincide con Productos y la etiqueta «activos» es falsa.
- **Variantes inactivas** (tarea #9 del análisis): `total_variantes`, `stock_total`, los swatches y el rango de precio siguen contando variantes
  inactivas. Hoy no hay ninguna en un producto activo; decidir que «variantes» signifique «vigentes» es otro cambio.
- **El costo de `fn_productos`** (`lead_time` recorre todas las recepciones en cada evaluación): hoy cuesta 0 (0 lotes y 0 compras), crece con Compras.
  Tarea #7 del análisis, con medición previa.
- **Ramas viejas sin fusionar** (`producto-estado-publicacion-e3c13e`, `ecstatic-booth-676259`, 647 commits detrás de `main`) traen otra versión de
  estas dos funciones (`20260917202000_productos_filtro_publicacion.sql`): si algún día se reviven, su rebase tendrá que conservar el filtro `activo`
  y el `distinct`.
- **El texto del diccionario** («descontinuada desaparece del catálogo»; un estado `agotada` que el `CHECK` real no admite) viene de
  `docs/datos/modulos/02-catalogo-y-vocabulario.md`, que describe V1 y lo avisa en su encabezado; no se corrige en este cambio.

## Cómo se pega en producción (lo hace Felipe, DESPUÉS de revisar)

Un solo archivo: `supabase/migrations/20260922120000_productos_alertas_solo_activas_y_variantes_distintas.sql`.

Ya trae `set search_path = retail, public, extensions;`: sirve tal cual en el SQL Editor del proyecto de Dynamic. Es `create or replace` con la misma
firma: **el orden de despliegue respecto del código no importa** (la pantalla vieja funciona con la migración nueva, y la pantalla nueva funciona con
la migración vieja; solo los contadores se ven distintos hasta que se pegue). Idempotente: se puede pegar dos veces. Después, verificar:

```sql
-- «sin stock» y «para pedir» por estado: los descontinuados deben dar 0 en para_pedir y no contar en el resumen
select estado, count(*) as productos, count(*) filter (where stock_total = 0) as sin_stock, count(*) filter (where reponer_de_proveedor) as para_pedir
from (select distinct producto_id, estado, stock_total, reponer_de_proveedor from retail.fn_productos(p_por_pagina => 100)) t group by estado;
-- el subtítulo debe decir lo mismo que la suma de activos de arriba, y las variantes deben ser las reales
select * from retail.fn_productos_resumen();
select count(*) as variantes_reales from retail.variantes where producto_id <> '11111111-1111-4111-8111-111111111111'::uuid;
```

## Cómo lo verificas tú

- En `/productos` (Grilla): cada tarjeta dice «Stock total N», o un chip «Sin stock» **sin rojo**, o «Stock bajo: N» en ámbar; las prendas
  descontinuadas llevan el chip «Descontinuado» abajo a la izquierda de la foto; debajo del subtítulo hay una línea «Stock total — Suma de todas las
  sedes y el Taller…».
- En la Tabla: la columna se llama «Stock total» (en dos líneas, sin quitarle ancho a «Producto») y las filas sin stock dicen «Sin stock» en tinta.
- Filtros «Estado = Descontinuado» + «Stock = Sin stock»: la pantalla explica por qué no hay nada.
- Con la migración pegada: «N sin stock» y «N para pedir» no incluyen descontinuadas, y «N variantes» coincide con `variantes_reales`.
- CI: `pnpm pruebas:productos-alertas-de-stock` (25 verificaciones) y `pnpm test`.

## Qué se rompería sin esto

Una liquidación real disparando «A quién pedirle» hacia un proveedor, un encabezado con un número de variantes que crece solo al mover stock entre
sedes, y una grilla donde el rojo (el único color que avisa) está en la mitad de las tarjetas y por eso ya no avisa.
