# ADR-0214 — Calidad: tasa de devolución sobre una cohorte madura y contra el resto

**Fecha:** 2026-09-18
**Estado:** Construido y verificado en la parte que no depende de la base real (ver "Qué está y qué no está
verificado"). **La migración NO está en producción** — la pega Felipe.
**Afecta:** `supabase/migrations/20260918191500_fn_origen_producto.sql` (la regla de atribución, compartida con
Rentabilidad) y `20260918192000_panel_calidad.sql` (dos funciones de solo lectura),
`apps/web/lib/calidad.ts`, `calidad-reglas.ts`, `components/PanelCalidadVista.tsx`, `app/(app)/comercial/calidad/`
y un enlace desde `/comercial`. No toca ninguna RPC de post-venta ni ninguna tabla.
**Relacionado:** ADR-0110 (panel comercial: misma hora de Lima, mismo candado de líder). Cierra la sugerencia de la
auditoría del 17-sep "reporte de prendas dañadas por sede y mes con datos que ya existen".

## Contexto

Felipe quiere detectar qué talla o qué proveedor genera devoluciones. Los datos existen — `devolucion_items.condicion`,
`venta_anulacion_items.condicion`, `cambios` — pero solo viven fila por fila. El objetivo de negocio es decidir
qué dejar de comprar, a quién reclamarle y qué talla revisar de medidas.

Dos preguntas de datos definieron el diseño:
1. **¿Cómo se llega de una prenda vendida a su proveedor?** En V2 el producto NO guarda su proveedor (la columna era
   del modelo V1). El vínculo existe solo a través de las compras (`compra_items` → `compras.proveedor_id`), y de las
   producciones del Taller (`producciones.producto_id`). Además `variantes.talla` (texto) ya no existe: la talla vive
   en `tallas.valor` vía `talla_id`.
2. **¿Cómo se mide una "tasa" que no engañe?**

## Decisión

**DECIDÍ:**
1. **La cohorte es madura.** Solo entran ventas que ya cumplieron su plazo de cambio (15 días,
   `DIAS_PLAZO_CAMBIO`, que se le pasa al SQL para que exista una sola cifra). Una prenda vendida hace 3 días no tuvo
   tiempo de ser devuelta: contarla como "vendida y no devuelta" bajaría la tasa de los últimos días y el mes en
   curso siempre parecería el mejor. Las devoluciones se cuentan sin importar cuándo ocurrieron: son las de esas
   ventas. Costo declarado: la pantalla no ve las últimas dos semanas.
2. **Atribución al proveedor de la compra más reciente anterior a la venta** (decisión de Felipe: "comprar lo mismo a
   dos proveedores en la misma fecha casi no ocurre"). Se mira hacia atrás desde la fecha de la venta: una compra
   posterior no explica una prenda ya vendida. El Taller cuenta como otro origen posible (producción terminada e
   inventariada, no muestra, no anulada). Gana el más reciente. Sin ninguno: "Sin origen registrado", visible. Las
   compras anuladas no cuentan. **La regla vive una sola vez** en `fn_origen_producto`, que también usa Rentabilidad
   (ADR-0118): dos copias de la misma regla son dos pantallas que tarde o temprano dan números distintos.
3. **Una tasa con pocas ventas no es una tasa.** Una fila con menos de 10 unidades vendidas se marca "muestra chica" y
   va al final: una talla con 2 ventas y 1 devolución "tiene 50%" y es el número más alto de la pantalla sin decir
   nada. "Requiere atención" exige a la vez una tasa de al menos el doble Y al menos 3 devoluciones.
4. **Cada fila se compara contra el RESTO, no contra el total.** Si una talla concentra 21 de las 38 devoluciones, el
   promedio general la incluye: ella misma sube la vara con la que se mide. En la primera versión la talla L (17,5%
   frente a 9,2% general) salía "dentro de lo normal" siendo el problema; contra el resto (5,8%) son 3 veces. Esto lo
   destapó la prueba visual, no el diseño.
5. **Una sola pasada SQL para las cuatro vistas** (`GROUPING SETS`: producto, talla, origen, categoría, total): las
   cuatro suman exactamente lo mismo porque salen de las mismas filas. Probado.
6. **Solo líder, solo lectura, hora de Lima**, con el mismo candado que ADR-0110.
7. **La pantalla es una subpágina** (`/comercial/calidad`) enlazada desde el panel comercial. No toca el menú que
   Felipe ordenó el 16-sep.

**DESCARTÉ:**
- **Atribución proporcional a lo recibido** (60% proveedor A, 40% Taller): la más justa, pero cifras con decimales y
  depende de que todas las recepciones estén bien registradas. Felipe eligió la simple.
- **Atribuir solo si el origen es único**: nunca acusa por error, pero con datos mezclados dejaría mucho "sin atribuir".
- **Comparar contra el promedio general**: se disimula a sí mismo (ver punto 4).
- **Una prueba estadística de significancia**: da falsa precisión con pocos datos. Se usa una regla de tres umbrales
  honestos, declarados y provisionales.
- **Contar la fecha de la devolución en vez de la de la venta**: la tasa "devueltas de este mes ÷ vendidas de este mes"
  mezcla dos poblaciones distintas.

**SE ROMPE SI:**
- Dos proveedores surten el mismo producto en fechas cercanas: se atribuye al de la última compra, sin avisar.
- Una prenda entra sin compra ni producción (carga manual, censo): sale como "Sin origen registrado". No se pierde, pero
  si es la mayoría del catálogo la vista por proveedor no dice nada. **Hoy el catálogo real casi no está cargado**, así que
  la primera lectura útil llega cuando haya compras reales.
- La migración no está en producción: la pantalla falla al abrir (usa `exigir()` a propósito: prefiere no mostrar nada
  antes que mostrar ceros con cara de normalidad). Orden de despliegue: primero el SQL, después el código.
- Se agrega una condición nueva de devolución sin decidir si cuenta como "dañada".
- Los umbrales (10 ventas, 2 veces, 3 devoluciones) son provisionales: se calibran con meses reales.

## Estados imposibles (Lamport)

| Estado imposible | Se impide con |
|---|---|
| Un no-líder lee la calidad de todas las tiendas | `fn_es_lider()` dentro de cada función + `revoke ... from public` + `grant` solo a `authenticated` |
| Una devolución pendiente o rechazada contada como devuelta | el filtro `estado = 'aprobada'`; una mutación que lo quita hace fallar la prueba |
| Una venta anulada contada como vendida | el filtro `estado = 'completada'` |
| Una compra o producción anulada, o una muestra, atribuyendo un origen | filtros explícitos; tres mutaciones hacen fallar la prueba |
| Una compra POSTERIOR a la venta atribuyendo la prenda | `fecha_emision <= día de la venta`; una mutación hace fallar la prueba |
| Ventas de los últimos 15 días diluyendo la tasa | la cohorte termina 15 días antes de hoy; una mutación hace fallar la prueba |
| Un total con NULL en una ventana vacía | `coalesce(..., 0)` — lo cazó la prueba, no el diseño |
| Una tasa 0/0 (`NaN`) en pantalla | `tasa()` devuelve null y la vista muestra "—" |
| Una fila con pocas ventas arriba en rojo | estado `muestra_chica`, va al final; probado |

## Qué está y qué no está verificado

**Verificado (con evidencia):**
- `scripts/pruebas/panel_calidad_aislado.sql`: 27 verificaciones sobre un Postgres desechable (sin Supabase ni Docker),
  con ventas anuladas, compras anuladas, una producción de muestra, una anulada, una compra posterior a la venta, una
  devolución pendiente y una rechazada, y una venta que aún no cumplió su plazo. **Seis mutaciones del SQL** (sin
  maduración, origen futuro, todas las devoluciones, con muestras, con compras anuladas, y la función de origen abierta a
  `authenticated`) hacen fallar la prueba.
- `lib/calidad-reglas.test.ts`: 26 pruebas de las reglas, incluido el caso de la fila que se disimula a sí misma.
  Suite completa: 734 en verde. `tsc`, `eslint` y `next build` en verde.
- Pantalla vista en escritorio y celular con datos inventados, sin scroll horizontal de página. Al mirarla aparecieron
  dos defectos que las pruebas no veían: el criterio de "contra el resto" (punto 4) y espacios que el compilador de JSX
  se comía entre un número y su palabra ("15días").

**NO verificado:**
- **La integración con el esquema real** (RLS, `fn_es_lider` verdadera, `getUbicaciones` real, la página autenticada).
  La prueba aislada usa tablas mínimas con los nombres de las migraciones y un `fn_es_lider()` de mentira. Docker no
  respondía.
- **La pantalla con datos reales**: los del navegador eran inventados.
- El rendimiento con volumen real: la estimación es de decenas de milisegundos a 90 días; no se midió.

## Cómo se deshace

```sql
drop function retail.fn_calidad(date, integer, integer);
drop function retail.fn_calidad_danadas(date, integer);
```

Sin pérdida de datos: solo lectura.

## Pendiente

- Abrir `/comercial/calidad` como líder contra el stack local con Docker arriba, y como colaboradora (debe redirigir).
- Aplicar en producción, en este orden: `20260918191500_fn_origen_producto.sql` y luego `20260918192000_panel_calidad.sql`. Depende de que existan `variantes.talla_id`,
  `compras.estado` y `producciones.es_muestra` (verificarlo con `docs/datos/VERIFICAR-PRODUCCION-2026-09-18.sql`).
- Cambios por talla de origen a talla de destino (un cambio de M a L dice más sobre las medidas que un cambio suelto).
- Motivo de la devolución: `devoluciones.motivo` es texto libre; con un vocabulario cerrado se podría separar "talla" de
  "defecto" de "no le gustó".
- Un índice sobre `compra_items(producto_id)` cuando una llamada pase de ~200 ms.
