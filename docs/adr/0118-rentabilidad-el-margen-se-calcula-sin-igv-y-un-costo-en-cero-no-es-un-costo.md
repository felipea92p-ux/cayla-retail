# ADR-0118 — Rentabilidad: el margen se calcula sin IGV y un costo en cero no es un costo

**Fecha:** 2026-09-18
**Estado:** Construido y verificado en la parte que no depende de la base real (ver "Qué está y qué no está
verificado"). **La migración NO está en producción** — la pega Felipe.
**Afecta:** `supabase/migrations/20260918194000_panel_rentabilidad.sql` (una función de solo lectura; llama a `fn_origen_producto`, de
`20260918191500_fn_origen_producto.sql`, que se pega ANTES),
`apps/web/lib/rentabilidad.ts`, `rentabilidad-reglas.ts`, `components/PanelRentabilidadVista.tsx`,
`app/(app)/comercial/rentabilidad/` y un enlace desde `/comercial`. No toca ninguna tabla ni RPC de escritura.
**Relacionado:** ADR-0110 (panel comercial, misma hora de Lima y mismo candado), ADR-0113 (Calidad: cuenta la otra mitad,
las devoluciones), ADR-0035 (el costo de compra se guarda SIN IGV).

## Contexto

Felipe quiere saber qué vende mucho pero deja poco, y qué deja mucho pero rota lento. Los datos existen: cada línea de venta
sella su costo del día (`venta_items.costo_unitario`), el stock vive en `stock`, y el origen de cada prenda (proveedor o
Taller) se deduce de compras y producciones. Lo difícil no es sumar: es que **hay tres formas de mostrar una ganancia
que no existe sin que ningún número dé error**, y esta pantalla las cierra.

## Decisión

**DECIDÍ:**
1. **El margen se calcula sobre la venta SIN IGV.** El precio de venta lleva el IGV adentro (el punto de venta dice "Incluye
   IGV 18%") y el costo se guarda sin IGV (ADR-0035; con boleta el IGV va dentro del costo porque no se recupera). Restar el
   costo de un precio con IGV infla el margen un 18%: una blusa vendida a S/118 que costó S/60 no deja S/58, deja S/40. Venta
   neta = lo pagado ÷ (1 + IGV). El IGV entra como **parámetro** (`p_igv`), no escrito dentro del SQL.
2. **Un costo en cero no es un costo.** `venta_items.costo_unitario` acepta 0 (es el valor de una prenda sin costo cargado).
   Una prenda vendida con costo 0 saldría con 100% de margen y encabezaría cualquier ranking con una ganancia inventada. El
   margen se calcula solo sobre las líneas con costo mayor que 0; `unidades_sin_costo` dice cuántas quedaron fuera, y la
   pantalla muestra "—" cuando no hay costo y "margen parcial" cuando hay poco. Una tarjeta "Costo cargado" dice qué fracción
   de lo vendido cuenta.
3. **Una fila con menos de 10 unidades vendidas es "muestra chica"**, y no entra a la mediana ni se le da lectura: un margen
   con tres ventas puede ser cualquier cosa.
4. **"Mucho" y "poco" se miden contra la mediana de las demás filas comparables de esa misma tabla**, no contra un número
   fijo ni un promedio (la mediana no se deja arrastrar por un caso extremo). Con menos de 5 filas comparables no se juzga.
   - *Vende mucho y deja poco*: vende igual o más que la mediana y su margen está por debajo.
   - *Deja buen margen pero rota lento*: margen igual o mayor que la mediana y su sell-through por debajo.
   - *Inventario parado*: hay stock vendible y cero ventas en la ventana.
5. **El stock es lo vendible hoy: sin la cuarentena.** Una prenda dañada no se puede vender; contarla haría parecer que sobra
   inventario. **Difiere a propósito de `fn_productos.stock_total`, que sí suma la cuarentena** (esa es una inconsistencia
   conocida, no se replica). El stock **no se atribuye a un origen**: un producto pudo surtirse de dos.
6. **El origen sale de una función única** (`fn_origen_producto`, en su propia migración anterior a Calidad y a Rentabilidad): la
   compra más reciente anterior a la venta, o el Taller (decisión de Felipe en ADR-0113). **Calidad y Rentabilidad la llaman las
   dos: no pueden discrepar.** Se concede a nadie: solo la ejecutan las funciones definer que la llaman (revoke explícito,
   porque `0005_grants.sql` concede EXECUTE por defecto a `authenticated`).
7. **Una sola pasada SQL** (`GROUPING SETS`: producto, categoría, temporada, origen, total). Un producto con stock y sin
   ventas aparece igual (unión completa de las dos fuentes): el inventario parado no se pierde.
8. **El margen es antes de devoluciones**, que se muestran aparte en el dato (`unidades_devueltas`) y se cuentan en Calidad.
9. **Solo líder, solo lectura, hora de Lima, subpágina de Comercial.**

**DESCARTÉ:**
- **Margen sobre el precio con IGV**: es más simple y es un 18% mentira.
- **Tratar el costo en cero como margen 100%**: es lo que haría un cálculo ingenuo.
- **Excluir del todo a las prendas sin costo**: las esconde. Se muestran con "sin costo cargado" y la cobertura, para que
  cargar el costo sea la acción obvia.
- **Umbrales fijos** (p. ej. "margen bajo es menos de 40%"): un umbral fijo no sabe si CAYLA opera con 60% o con 30%; la
  mediana se adapta al negocio.
- **Reutilizar `fn_productos` para el stock y la velocidad**: está paginado, mezcla filtros de catálogo y suma la cuarentena.
- **Atribuir el stock a un origen**: inventaría una atribución que los datos no sostienen.
- **Netear las devoluciones del margen**: mezcla dos preguntas (rentabilidad y calidad) y exige decidir qué pasa con el costo
  de una prenda que vuelve dañada. Se muestran por separado.

**SE ROMPE SI:**
- **El costo no está cargado** (el caso más probable hoy): la pantalla lo dice a la cara ("Falta el costo de N unidades") y
  el margen sale "—", pero **no se puede decidir precios con ella hasta que el catálogo tenga costos**.
- **El costo cargado es el equivocado**: la pantalla no puede saberlo. `venta_items.costo_unitario` copia el costo de la
  variante el día de la venta; por lo que dicen las migraciones, `cerrar_produccion` lo actualiza con el costo real de la
  corrida, **pero eso no está verificado con datos**.
- **La tasa de IGV cambia** y alguien manda otra: la venta neta cambia con ella. Hoy sale de una constante compartida.
- **Un producto recién lanzado**: la velocidad se mide sobre toda la ventana de 90 días, así que parecerá lento.
- **Dos proveedores en fechas cercanas** para un mismo producto: se atribuye al último, sin avisar.
- La migración no está en producción: la pantalla falla al abrir (usa `exigir()`: prefiere no mostrar nada antes que ceros con
  cara de normalidad). Orden de despliegue: primero el SQL, después el código.

## Estados imposibles (Lamport)

| Estado imposible | Se impide con |
|---|---|
| Una ganancia inventada por costo en cero | el margen sale solo de líneas con `costo_unitario > 0`; una mutación que lo quita hace fallar la prueba |
| Un margen inflado por el IGV | venta neta = pagado ÷ (1 + IGV); una mutación que lo quita hace fallar la prueba |
| Stock de cuarentena contado como vendible | `where sububicacion.tipo <> 'cuarentena'`; una mutación lo detecta |
| Stock multiplicado por el número de ventas o de variantes | el stock se calcula UNA vez por producto, aparte de las ventas; probado con un producto de 2 variantes y 3 ventas |
| Una venta anulada, o fuera de la ventana, sumando | filtros de estado y de fechas; dos mutaciones lo detectan |
| Un no-líder leyendo la rentabilidad | `fn_es_lider()` dentro de la función + `revoke`/`grant` explícitos |
| La función de origen ejecutable por cualquier colaboradora | `revoke ... from public, anon, authenticated`; probado con los permisos por defecto de `0005_grants.sql` simulados |
| Un margen 0/0 en pantalla | las reglas devuelven null y la vista muestra "—" |

## Qué está y qué no está verificado

**Verificado (con evidencia):**
- `scripts/pruebas/panel_rentabilidad_aislado.sql`: 29 verificaciones sobre un Postgres desechable (sin Supabase ni Docker).
  **Siete mutaciones del SQL** (sin IGV, con cuarentena, con anuladas, sin límite de fecha, costo cero como válido, función de
  origen abierta, stock multiplicado) hacen fallar la prueba.
- `lib/rentabilidad-reglas.test.ts`: 28 pruebas de las reglas. Suite completa: 832 en verde. `tsc`, `eslint` y `next build`.
- Pantalla vista en escritorio y celular con datos inventados que cubren cada lectura, sin scroll horizontal de página.

**NO verificado:**
- **La integración con el esquema real** (RLS, `fn_es_lider` verdadera, la página autenticada). La prueba aislada usa tablas
  mínimas con los nombres de las migraciones. Docker no respondía en esta sesión.
- **La pantalla con datos reales**: los del navegador eran inventados, y **hoy casi no hay costos cargados**.
- Que `venta_items.costo_unitario` refleje el costo real de la corrida del Taller.
- El rendimiento con volumen real.

## Cómo se deshace

```sql
drop function retail.fn_rentabilidad(date, integer, numeric);
-- fn_origen_producto se deshace aparte, y solo después de deshacer también Calidad (que la usa).
```

Sin pérdida de datos: solo lectura.

## Pendiente

- Abrir `/comercial/rentabilidad` como líder contra el stack local, y como colaboradora (debe redirigir).
- Aplicar en producción, en orden: `20260918191500_fn_origen_producto.sql`, `20260918194000_panel_rentabilidad.sql` (y Calidad, `192000`,
  que también necesita la primera).
- Velocidad sobre "días observables" en vez de toda la ventana, como ya hace el Resumen de Inventario.
- Mover `IGV_TASA` a una tabla de parámetros (ADR-0109), de donde debería salir el `p_igv`.
- Valorizar el inventario parado (stock × costo) para ver cuánta plata está detenida.
