# Flujo — Catálogo ▸ Productos ↔ Inventario ▸ Existencias (`/productos` ↔ `/inventario`)

> Modo: completo (flujo de dos pantallas y sus costuras) · Fecha: 2026-09-28 · Rol/sede: Felipe, Líder y Admin, Tienda TRU · Datos: **real** (consultas de solo lectura a producción hechas en la sesión, sin escribir nada)
> SHA analizado: `cac1d565` (origin/main). Si cambian `fn_productos`, `fn_productos_resumen`, `fn_stock_por_sede`, `fn_resumen_variantes`, `lib/inventario-v2.ts`, `lib/catalogo-v2.ts`, `ProductosGrilla.tsx`, `ProductosAgrupados.tsx` o `InventarioPanel.tsx`, este análisis está vencido.
> Archivos: `app/(app)/productos/page.tsx` · `components/ProductosGrilla.tsx` · `components/ProductosAgrupados.tsx` · `lib/catalogo-v2.ts` · `app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `lib/inventario-v2.ts` · `lib/existencias-*.ts` · RPC `fn_productos`, `fn_productos_resumen`, `fn_stock_por_sede`, `fn_resumen_variantes` · tablas `productos`, `variantes`, `stock`, `movimientos`, `transferencia_items`
> Otra sesión tocándola: no hay filas activas sobre Catálogo ni Existencias en `docs/SESIONES-ACTIVAS.md` (las de Existencias de esa tabla ya no existen en `origin`). Análisis previos de cada pantalla por separado: `docs/pantallas/productos.md` (2026-09-21) y `docs/pantallas/inventario.md`; este es el primero de la **costura** entre las dos.
> Decisiones: las 32 respuestas de Felipe del 2026-09-28 están en **ADR-0261**. Este archivo las usa; no las repite todas.

## 0 · Veredicto
El stock no está desincronizado (0 descuadres entre `movimientos` y `stock`), pero **el sistema usa al menos seis definiciones distintas de «stock» y cuatro palabras para «estado»**. Por eso la misma prenda dice cosas distintas según la pantalla. Además, **la base deja vender, trasladar, ajustar y recibir tallas retiradas y productos descontinuados**: solo algunas pantallas los filtran.
**Cumple su finalidad:** 4/10 (tope 5: hay escrituras de stock sin candado de estado) · **Relevancia:** 9,0/10 — **Núcleo**

## 1 · Finalidad declarada
«El Catálogo dice **qué vendemos** (modelo, precio, fotos, estado) y el Inventario dice **cuánto hay y dónde**; las dos hablan del mismo producto con el mismo número.» Fuente: `CLAUDE.md` principios 1, 2 y 4 (núcleo `productos`/`variantes`/`stock`/`movimientos`, una sola fuente de verdad), `docs/pantallas/productos.md` tarea #9 («un solo universo de variantes vigentes para Productos e Inventario», abierta) y la decisión de Felipe de hoy: «dos pantallas, un número» (ADR-0261). **¿Docs y pantallas coinciden?** No: los docs prometen una sola fuente y las pantallas calculan cada una la suya. Manda la promesa, así que el defecto está en las pantallas.

## 2 · Objeción
1. **«Stock» significa seis cosas** `[código]` `[producción]`:
   - Catálogo: toda la red con Taller, cuarentena, apartadas, tallas retiradas y pruebas. `fn_productos` en `supabase/migrations/20260924180000_…sql:204-223`.
   - Existencias: la sede elegida, sin cuarentena, menos apartadas, sin tallas retiradas y sin pruebas. `lib/inventario-v2.ts:84-134, 277-294`.
   - «% vs. semana anterior» y el valor por categoría de Existencias: con apartadas y con pruebas. `fn_resumen_variantes`, `20260919141804:277`. El número de la tarjeta y su porcentaje miden universos distintos.
   - «Dónde más hay» y «En la red»: físico con cuarentena y apartadas. `fn_stock_por_sede`, `20260922170000:225-240`.
   - Buscar y Etiquetas: con cuarentena. Además, el alcance de Buscar depende del rol. `buscar/page.tsx:87-98`, `lib/etiquetas-precio.ts:138-141`.
   - Ajustar (desde Catálogo): valida contra el físico, pero la base valida contra lo libre. Con 1 apartada, la pantalla acepta «2 → 0» y la base lo rechaza. `AjustarInventarioModal.tsx:139-144` contra `20260920160000:13-19`.
2. **Las escrituras no revisan el estado** `[código]` `[producción]`: `registrar_venta`, `iniciar_traslado`, `confirmar_traslado`, `registrar_recepcion_traslado`, `ajustar_inventario`, `recibir_lote`, `recibir_compras`, `conteo_contar`, `cerrar_conteo`, `mover_interno` y `mover_entre_piso_y_almacen` no miran `variantes.activo`, `productos.estado`, `estado_alta` ni `es_prueba`. Verificado en los cuerpos de producción el 2026-09-28: ninguno contiene `v.activo` ni `es_prueba`. Hoy protege la costumbre de las pantallas, no la base (principio 2).
3. **«Prenda» significa dos cosas** `[visto]` `[producción]`: Existencias cuenta «50 prendas» (producto + color) y el Catálogo, 33 productos. «Test de Produto 2» sale 4-5 veces en una pantalla y 1 en la otra.
4. **Pruebas que suman como reales** `[producción]`: «Test de Produto 2» (78 u.), «Fhfh» (15 u.) y «Prueba Pantalon» (20 u.) no están marcadas como prueba, así que inflan todas las cifras. «Producto de Prueba» (160 u.) sí está marcado: Existencias lo esconde y el Catálogo lo suma.
5. **Unidades fantasma** `[producción]`: «Prueba Pantalon» tiene 6 u. en tallas desactivadas. Existencias no las muestra, Vender no deja cobrarlas y el Catálogo las suma. El esquema lo permite: nada impide retirar una talla con stock.
6. **Un bug de conteo** `[código]`: Existencias suma como «en camino» los traslados `recibido_con_diferencia` completos (`inventario-v2.ts:272-273`), aunque lo que coincidió ya entró al stock. Cuenta dos veces lo recibido. Hoy no se ve porque hay 0 traslados en camino.

Trade-off: arreglar pantalla por pantalla es más rápido, pero las fórmulas se vuelven a separar en la siguiente pantalla nueva, como ya pasó seis veces. Por eso la tarea raíz es la #2.

## 3 · Lo que está bien y no se toca
- **El motor de stock es sano.** `movimientos` es append-only, `stock` es derivado, el insert directo está revocado (`20260915150000:84`) y existe `recalcular_stock`. Hoy se reconstruyó `stock` desde los 188 movimientos y dio **0 descuadres** con las 160 filas `[producción]`.
- **Los candados de cantidad:** `stock.cantidad >= 0` (`0002_esquema.sql:117`) y `cantidad_apartada <= cantidad` (`20260920160000:79-88`) `[código]`.
- **Existencias es coherente consigo misma.** «Disponible total 381» = 382 reales − 1 apartada; «106 tallas» y «55 por colgar» cuadran exacto con la base `[visto]` `[producción]`. Su definición (libre, por sede, sin pruebas) es la que Felipe eligió para todo: se vuelve la regla, no se descarta.
- **Las campañas de descuento ya están modeladas como en Shopify y Odoo:** etiqueta con %, fechas y categorías o prendas; gana el mayor (`20260918160000`, `20260918170000`) `[código]`. Las rebajas que pidió Felipe no necesitan otro modelo.
- **`prendas_por_regularizar` (ADR-0179)** ya resuelve «vendí algo que el sistema no tenía». Se reutiliza para la venta en 0 (tarea #10), no se construye otra tabla.
- **El borrado con historia de stock (ADR-0252, en producción)** ya es la opción «Eliminar prueba» que pidió Felipe para 5 de sus 6 pruebas.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Cada pantalla respeta la paleta y el orden; el problema es de palabras, no de forma: «Stock total», «Disponible», «Sin stock», «Agotado» y «Descontinuado/Desactivar/Archivar» para cosas que no se corresponden | `[visto]` ambas capturas |
| Lógica de negocio | 3 | Seis definiciones de stock; descontinuado sigue pidiendo «Reponer»; pruebas y tallas retiradas suman | `existencias-recomendaciones.ts:133`, `20260924180000:204-223` |
| Arquitectura | 3 | No hay UNA función de «cuánto hay»; cada pantalla suma `stock` a su manera; las escrituras no validan estado | §2, `[producción]` cuerpos de funciones |
| Funciones | 4 | Fantasmas: «Archivar» (`ProductosAgrupados.tsx:432`, solo un `alert`) y «Permitir venta sin stock» (`20260915224500:85`, nadie la lee). Duplicada: Ajustar en Catálogo y en Inventario | `[código]` |
| Utilidad | 4 | La colaboradora ve «Stock total 58» en el Catálogo y otro número en Existencias; no sabe cuál creer ni a quién preguntar | `[visto]` `[inferido]` |
| Conexión con el ERP | 4 | Vender, Buscar, Etiquetas y Análisis heredan cada uno su propia suma; Finanzas (`fn_bal_stock`) suma todo sin filtro | `[código]` |

**Estética.** Los componentes son los del sistema (`TarjetaCifra`, `Tabla`, `Chip`). Lo que falla es que la misma idea tiene nombres distintos: la tarjeta dice «Stock total» y la nota fija aclara «suma de todas las sedes y el Taller» (`NotaStockTotal.tsx:12`), mientras Existencias dice «Disponible» de la sede.

**Lógica de negocio.** Reglas de Felipe (ADR-0261) contra lo que existe:
- **Stock de la sede elegida más el resto:** hoy el Catálogo muestra toda la red.
- **Restar apartados y dejar fuera la cuarentena:** el Catálogo no lo hace.
- **Descontinuado = se vende lo que queda:** Existencias le sigue pidiendo «Reponer».
- **Una talla con stock no se retira:** hoy sí se retira, y aparecen unidades fantasma.
- **Pendiente de aprobación = solo se vende:** hoy se opera como cualquier otro producto.
- **Stock bajo:** hay tres reglas (mínimo sobre la red, piso ≤ 4, almacén ≤ 10), y Felipe eligió «mínimo por talla y sede».

**Arquitectura.**
- **Estados imposibles que el esquema permite:**
  - talla retirada con stock o con apartados;
  - descontinuado con «Reponer»;
  - producto pendiente trasladado a otra sede.
- **Transacción:** cada escritura ya es todo-o-nada. Lo que falta es la validación de estado dentro de esa misma transacción (#6).
- **Concurrencia:** la función de lectura (#2) es de solo lectura sobre una foto consistente, así que no agrega carreras.
- **Volumen:** 160 filas de stock hoy. En 3 años, ~400 productos × ~20 tallas × 4 sedes ≈ **32 000 filas** como techo. Una suma agrupada sobre eso tarda milisegundos: no hace falta caché ni vista materializada (número antes que opinión).

**Funciones.** Existen y funcionan: el motor, Existencias, Eliminar (ADR-0218/0252) y las campañas. Hay dos fantasma: «Archivar» y «Permitir venta sin stock». Falta el enlace del Catálogo a Existencias y a «Pedir a otra sede». Sobra el Ajustar del Catálogo (Felipe: «solo en Inventario»).

**Utilidad.** Escenario: una clienta pregunta por la Blusa Carlita en TRU. La colaboradora abre el Catálogo («Stock total 58»), va a la percha y encuentra menos, porque parte está apartada o en cuarentena. Abre Existencias y ve otro número. Si la blusa estuviera solo en LIM, el Catálogo diría «Stock total 60» sin decir dónde. Duda, y la venta depende de que llame a alguien.

**Conexión con el ERP.**
- **Aguas arriba:** Recibir, Producción, Traslados, Conteo y el alta con stock (ADR-0212).
- **Aguas abajo:** Vender, Buscar, Etiquetas, Análisis, «A quién pedirle», Finanzas (`fn_bal_stock`).
- **Pájaro dueño:** Inventario (`docs/datos/generado/AVIARIO.md`).
- **Externos:** ninguno en esta costura. Si un día se vende online (Shopify está investigado y no integrado), la cifra disponible de la #2 es la que se publicaría.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Decide qué comprar, qué trasladar y qué ofrecer; alimenta «A quién pedirle», Análisis y Finanzas |
| Dinero y stock que toca | ×1 | 10 | Es el stock; las escrituras sin candado mueven unidades de verdad |
| Frecuencia y personas que la usan | ×1 | 9 | Todas las colaboradoras, todo el día, en cada consulta de una clienta |
| Qué se detiene si falla | ×1 | 8 | La venta sigue, pero con promesas falsas a la clienta y compras mal calculadas |

Relevancia = (2·9 + 10 + 9 + 8) / 5 = **9,0** — Núcleo.

## 6 · Conexión con el ERP
- **Aguas arriba:** `recibir_lote`, `recibir_compras`, producción, `iniciar_traslado` → `confirmar_traslado`, `cerrar_conteo`, `fn_cargar_stock_inicial` (puerta temporal hasta el **15-oct**, ADR-0261).
- **Aguas abajo:** `registrar_venta`, `apartar_stock`, `separar_prendas`, Buscar, Etiquetas, Análisis (`fn_resumen_variantes`), «A quién pedirle» (`fn_productos(p_stock='reponer')`), Finanzas (`fn_bal_stock`).
- **Pájaro dueño y vecinos:** Inventario es el dueño de la cifra; Catálogo es el dueño del estado (producto, talla, prueba).
- **Externos, y qué pasa si caen:** ninguno. La lectura es local a Postgres: si Supabase no responde, ninguna pantalla muestra cifras (se degrada así, no pierde este dato, porque la cifra se deriva de `movimientos`).

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Sacar las pruebas de las cifras (datos de producción)
- **Dónde:** Productos ▸ Eliminar (ADR-0252, ya en producción) para 5 productos. Para uno, una decisión.
- **Qué:**
  - **«Y.j.j»** nunca se movió: lo elimina un Líder o un Admin.
  - **«Fdhh», «Fhfh», «Prueba Pantalon» y «Producto de Prueba»** solo tienen historia de stock y ninguna venta: los elimina un Admin (Felipe), con respaldo.
  - **«Test de Produto 2»** tiene **una venta completada del 26-sep, no marcada como prueba, en una caja ya cerrada** (2 líneas, solo ese producto). El botón no la alcanza y está bien que no la alcance. Felipe decide:
    - (a) marcar esa venta y el producto como prueba: salen de todas las cifras y la historia queda;
    - (b) purgarlos con la receta del ADR-0224 (`scripts/purga/purgar-producto-de-prueba.sql`, la misma que se usó con Top Aurora: ensayo, «dale», respaldo).
  - **El resto de la práctica.** Según el ADR-0252, los productos que cargó el equipo de TRU entre el 22 y el 28-sep «todo era práctica» (Felipe). Si es así, el Catálogo real es mucho más chico que 33, y las 12 tareas se prueban sobre muy pocos productos reales. Felipe confirma cuáles quedan antes de la #2.
- **Por qué en este puesto:** 113 u. de mentira en TRU (78 + 15 + 20) distorsionan cualquier comprobación de las tareas siguientes. Es la más barata y la primera que Felipe puede hacer solo.
- **Cómo lo verificas tú:** el Catálogo cuenta 27 productos. En Existencias de TRU, «Disponible total» baja de 381 a unos 275 y ninguna fila dice «Test de Produto 2».
- **Esfuerzo / dependencias:** S · ninguna.

### #2 · Reconstruir — Una sola cifra de stock en la base
- **Dónde:** migración nueva con `retail.fn_existencias(p_ubicacion_id uuid default null)`. Sobre ella se rehacen las sumas de:
  - `fn_productos` (`20260924180000:204-223`) y `fn_productos_resumen` (`20260922120000:250,260`);
  - `fn_stock_por_sede` (`20260922170000:225-240`);
  - el `disponible` de `fn_resumen_variantes` (`20260919141804:277`).

  Contrato completo en ADR-0261.
- **Por qué en este puesto:** es la raíz. Las tareas #3, #4, #8 y #11 son pantallas que la leen; sin ella, cada arreglo vuelve a ser una suma propia.
- **Cómo lo verificas tú:** una consulta de solo lectura en producción compara `fn_existencias` con `recalcular_stock` y da 0 diferencias. «Test de Produto 2» en TRU (si sigue) dice físico 78, apartado 1 y disponible 77, igual en el Catálogo y en Existencias.
- **Esfuerzo / dependencias:** L · ninguna (conviene después de la #1).
- **DECIDÍ:** una función de solo lectura por talla × sede que devuelve físico, dañado, apartado, disponible, piso y almacén libres, y en camino entrante. Deja afuera las pruebas y la pieza «Monto manual». Ninguna pantalla vuelve a sumar `stock` por su cuenta.
- **DESCARTÉ:**
  - una vista materializada o una columna calculada en `stock`: con ~32 000 filas como techo en 3 años, la suma directa tarda milisegundos, y una copia más es otra cosa que se puede desincronizar;
  - arreglar cada pantalla por separado: ya hay seis, y la séptima volvería a divergir.
- **SE ROMPE SI:** una pantalla nueva vuelve a hacer `from stock` directo. Para eso, la #2 lleva una prueba en CI que falla si `apps/web` suma `stock.cantidad` fuera de `lib/existencias`.

### #3 · Corregir — El Catálogo habla de la sede elegida
- **Dónde:** `ProductosGrilla.tsx:249-259`, `ProductosAgrupados.tsx:215-253`, `NotaStockTotal.tsx:12`, cabecera `page.tsx:218-285`, `fn_productos`. Se quita «Ajustar inventario» del Catálogo (`AjustarInventarioModal` desde la ficha) y se enlaza a Inventario.
- **Qué:** la tarjeta dice «**N aquí** · +M en otras sedes · K en taller · +J en camino», con «1 apartado» y «2 dañadas» aparte. Tocar el número abre Existencias filtrada. «0 aquí · 60 en LIM» enlaza a «Pedir a otra sede».
- **Por qué en este puesto:** es lo que Felipe vio primero; con la #2 hecha, es una pantalla que lee, no una fórmula nueva.
- **Cómo lo verificas tú:** en TRU, la Blusa Carlita dice lo mismo en la tarjeta y en Existencias. Al cambiar la sede a LIM, la Falda Milagros pasa de «0 aquí · 60 en LIM» a «60 aquí».
- **Esfuerzo / dependencias:** M · no antes de la #2.

### #4 · Corregir — Existencias, Vender, Buscar, «Dónde más hay» y Etiquetas leen la misma cifra
- **Dónde:** `lib/inventario-v2.ts:84-134, 169-193, 244-294`, `buscar/page.tsx:87-98, 140`, `lib/etiquetas-precio.ts:138-141`, `DetallePrendaExistencias.tsx:243`, `InventarioPanel.tsx:742-746` (% vs. semana).
- **Por qué en este puesto:** después del Catálogo, son las pantallas donde la colaboradora le promete algo a la clienta.
- **Cómo lo verificas tú:** Buscar y Vender dicen el mismo número para la misma talla. El «% vs. semana anterior» de «Disponible total» deja de mezclar pruebas y apartados.
- **Esfuerzo / dependencias:** M · no antes de la #2.

### #5 · Corregir — «En camino» cuenta dos veces lo ya recibido
- **Dónde:** `lib/inventario-v2.ts:272-273` (suma `recibido_con_diferencia` completo). Comparar con `lib/traslados-reglas.ts:176-177`.
- **Por qué en este puesto:** es un número falso, aunque hoy no se ve (0 traslados en camino). El primer traslado con diferencia lo mostraría.
- **Cómo lo verificas tú:** un traslado de 10 recibido con 9. Después de recibirlo, Existencias del destino dice «En camino 0», no 10.
- **Esfuerzo / dependencias:** S · ninguna (se puede hacer ya; la #2 lo absorbe después).

### #6 · Reconstruir — Candados de estado en la base
- **Dónde:** `retail.fn_exigir_variante_operable(p_variante_id, p_operacion)`, llamada desde las ~12 escrituras de §2.2.
- **Qué:** una sola regla para cada caso:
  - talla retirada: nada;
  - descontinuado: vender, apartar, trasladar, contar y ajustar a la baja, pero no comprar, recibir de proveedor ni producir;
  - pendiente de aprobación: vender y contar, nada más;
  - prueba: todo (sirve para practicar; se excluye de las cifras en la #2).
- **Por qué en este puesto:** hoy protege la costumbre de las pantallas. Cualquier pantalla nueva o llamada directa se lo salta.
- **Cómo lo verificas tú:** en un Postgres desechable, vender una talla retirada da «Esta talla está retirada del catálogo», y recibir de proveedor un descontinuado da «Está descontinuado: se vende lo que queda, no se compra más».
- **Esfuerzo / dependencias:** L · ninguna técnica. Coordinar el ensayo con la #2 (las dos tocan producción).
- **DECIDÍ:** una función de permiso por operación, llamada dentro de la misma transacción de cada escritura.
- **DESCARTÉ:**
  - un trigger sobre `movimientos`: no sabe si el movimiento es una venta, una devolución o un traslado, y la regla depende de eso;
  - dejarlo en las pantallas: es lo que ya falló.
- **SE ROMPE SI:** una clienta devuelve una prenda de una talla ya retirada. La devolución tiene que entrar igual (la prenda existe y la plata se devuelve). La regla la acepta, reactiva la talla y deja un aviso al líder, en vez de rechazar la devolución.

### #7 · Corregir — Una talla con unidades no se retira
- **Dónde:** trigger `before update of activo on retail.variantes`: rechaza `true → false` si hay `cantidad > 0` o `cantidad_apartada > 0` en cualquier sede. La edición está en `catalogo_actualizar_producto` (`20260923193700:573-578`).
- **Por qué en este puesto:** cierra el estado imposible «unidades fantasma» en el esquema, no en la pantalla.
- **Cómo lo verificas tú:** al desactivar una talla con 1 u. aparece «Tiene 1 en TRU: véndela, trasládala o ajústala primero».
- **Esfuerzo / dependencias:** S · después de la #1 («Prueba Pantalon», el único caso de hoy, desaparece con ella).

### #8 · Corregir — «Prenda» = el modelo, también en Existencias
- **Dónde:** `lib/existencias-prendas.ts`, `components/ExistenciasPorPrenda.tsx:114`, el selector «Por prenda / Por talla».
- **Qué:** la vista por defecto agrupa por producto, con los colores adentro. Se suma una vista «Por color» para reponer.
- **Por qué en este puesto:** es la diferencia de conteo más visible (50 contra 33), pero no mueve plata.
- **Cómo lo verificas tú:** Existencias dice «27 prendas» y el Catálogo «27 productos» (después de la #1).
- **Esfuerzo / dependencias:** M · después de la #4.

### #9 · Mejorar — Pruebas: lo que el botón no alcanza, y el «Archivar» fantasma
- **Dónde:** `ProductosAgrupados.tsx:432-438` («Archivar» solo muestra un `alert`), filtro «Pruebas» en `FiltrosProductos.tsx`, `archivar_producto_prueba` (`20260922130000:108`), `ventas.es_prueba`.
- **Qué:**
  - «Archivar» del menú se quita (lo reemplaza «Eliminar», ADR-0252).
  - Mientras haya pruebas marcadas, el Catálogo tiene un filtro «Pruebas» para encontrarlas y eliminarlas.
  - Una prueba con ventas se maneja marcando la venta como prueba, no borrándola.
- **Por qué en este puesto:** con la #1 hecha, lo que queda son pocos casos y una limpieza de interfaz.
- **Cómo lo verificas tú:** el menú «···» no tiene botones que no hacen nada. El filtro «Pruebas» lista solo lo marcado.
- **Esfuerzo / dependencias:** M · después de la #1.
- **DECIDÍ:** el borrado se queda donde lo dejó el ADR-0252 (nunca con ventas). Una venta de prueba se marca, no se borra.
- **DESCARTÉ:** un botón que borre también ventas: cambia la historia de una caja cerrada y el esperado de un turno que alguien ya firmó.
- **SE ROMPE SI:** una «venta de prueba» cobró plata real a una clienta. Entonces no era prueba, y marcarla la sacaría de las ventas del mes. Por eso lo marca solo un líder, venta por venta, viendo la caja.

### #10 · Reconstruir — Venta de una talla en 0 → «por regularizar»
- **Dónde:** `registrar_venta` (`20260922150000:406-418`) y `prendas_por_regularizar` (ADR-0179, `20260923161700:59`). Se quita la casilla «Permitir venta sin stock» (`ProductoForm.tsx:665`, columna `20260915224500:85`, que nadie lee).
- **Qué:** si la talla dice 0 y la prenda está en la mano, la colaboradora vende con el visto del responsable. La línea se cobra sin descontar stock (nunca negativo) y nace una fila «por regularizar» con la talla. Almacén o el líder la resuelve contando esa talla y las vecinas: casi siempre alguien vendió la M como S, o marcó 2 en vez de 1.
- **Por qué en este puesto:** Felipe lo vio pasar en caja. Hoy la salida es no vender o inventar un ajuste sin nombre.
- **Cómo lo verificas tú:** vendes una talla en 0. La venta sale, el stock sigue en 0 (no −1) y aparece en «Por regularizar» con la talla, la hora y quién la vendió.
- **Esfuerzo / dependencias:** M/L · después de la #6.
- **DECIDÍ:** un flujo para todos los productos, no una casilla por producto.
- **DESCARTÉ:**
  - hacer funcionar la casilla, que era la opción literal de Felipe: el desfase que él describe le pasa a cualquier producto, no a los que alguien marcó antes;
  - stock negativo: rompe el candado `cantidad >= 0` y no dice por qué faltó.
- **SE ROMPE SI:** nadie resuelve los pendientes y se acumulan. Por eso el pendiente aparece en Inicio del líder con su antigüedad, como las demás tareas vencidas.

### #11 · Mejorar — Descontinuado completo, y las palabras
- **Dónde:**
  - `lib/existencias-recomendaciones.ts:133`: no pedir «Reponer» a un descontinuado;
  - `fn_productos` (alertas) y «A quién pedirle»: no pedirlo al proveedor;
  - `ProductosAgrupados.tsx:117-121, 505`: «Desactivar» en bloque pasa a llamarse «Descontinuar»;
  - las tallas se llaman «Activa/Retirada»;
  - el historial de la ficha muestra todas las sedes con filtro (`lib/movimientos-v2.ts:237`, `HistorialProductoPanel.tsx`);
  - un descontinuado sin unidades en ninguna sede sale solo de las listas y queda en el filtro «Descontinuados».
- **Por qué en este puesto:** hoy nadie descontinúa (33 de 33 activos), así que no daña nada todavía. Pero es lo que va a pasar al cerrar la primera temporada.
- **Cómo lo verificas tú:** descontinúas un producto con 3 u. Deja de salir en «Reponer» y «Pedir», se sigue vendiendo, y al vender la última desaparece del Catálogo y de Existencias.
- **Esfuerzo / dependencias:** M · después de la #2.

### #12 · Mejorar (bajo valor ahora / después de la #2) — Datos del catálogo que desalinean
- **Dónde y qué:**
  - Color obligatorio en toda talla: los 5 Bodys no tienen color (`variantes.color_codigo` nulo), y hay que cargarlos antes del `not null`.
  - Precio único por producto con excepción por talla o color, y rango en la tarjeta si difieren. Hoy 31 de 32 productos tienen un solo precio; el único distinto es de prueba.
  - Rebaja visible «antes/ahora» en tarjeta, etiqueta y Vender, apoyada en las campañas que ya existen.
  - Mínimo por talla y sede, con valor por defecto de la categoría (tabla nueva: lleva su propio ADR).
  - Cerrar la carga de stock desde el alta el **15-oct**.
- **Por qué al final:** ninguno causa hoy una cifra falsa. Son el terreno para que las cifras se sigan pareciendo.
- **Cómo lo verificas tú:** cada uno por separado. Por ejemplo, desde el 16-oct el alta ya no ofrece «Cuántas tienes hoy».
- **Esfuerzo / dependencias:** M en total, repartido · después de la #2.

## 8 · Estrategia alternativa
Se comparó con **una sola pantalla** (Catálogo e Inventario fusionados en una lista con vistas):

| Opción | Ganas | Pagas |
|---|---|---|
| Una sola pantalla | Un solo lugar | Una pantalla pesada; roles distintos ven cosas distintas |
| Dos pantallas, un número | Una sola cifra que no se puede volver a separar | Rehacer cómo leen las dos pantallas |

**Felipe eligió «dos pantallas, un número» (2026-09-28).** No queda por decidir.

## 9 · Referentes de ERP y futuro
- **Shopify** (verificado 2026-09-28, help.shopify.com):
  - las promociones van como descuento automático con fecha de inicio y fin, no editando el precio;
  - el «compare-at price» (precio anterior tachado) no se usa para promociones porque no tiene programación y hay que revertirlo a mano.
  - En CAYLA equivale a la campaña con fechas que ya existe.
- **Odoo** (verificado 2026-09-28, odoo.com/documentation): las listas de precios tienen reglas por producto, categoría o variante con «válido desde/hasta», y aplican también en el punto de venta. Es el mismo modelo de las etiquetas de campaña.
- **Futuro (no pasa el filtro de hoy):** publicar la cifra disponible a una tienda online. La #2 la deja lista para eso, sin construir nada ahora.

## 10 · Fuera de esta pantalla
**El equipo prueba y aprende en la caja real.** «Test de Produto 2» tiene una venta completada, no marcada como prueba, dentro de una caja cerrada del 26-sep. Mientras no exista un lugar de práctica, cada capacitación vuelve a ensuciar cifras, cajas y Finanzas, y cada limpieza cuesta una decisión de Felipe.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:catalogo-inventario]` #1 Sacar las pruebas: 5 con Eliminar (ADR-0252), «Test de Produto 2» a decidir — S
- [ ] `[pantalla:catalogo-inventario]` #2 `fn_existencias`: una sola cifra de stock en la base — L
- [ ] `[pantalla:catalogo-inventario]` #3 Catálogo por sede elegida, sin Ajustar, con enlaces — M
- [ ] `[pantalla:catalogo-inventario]` #4 Existencias/Vender/Buscar/Etiquetas/«Dónde más hay» sobre la #2 — M
- [ ] `[pantalla:catalogo-inventario]` #5 «En camino» no suma `recibido_con_diferencia` — S
- [ ] `[pantalla:catalogo-inventario]` #6 `fn_exigir_variante_operable` en las ~12 escrituras — L
- [ ] `[pantalla:catalogo-inventario]` #7 No retirar una talla con unidades (trigger) — S
- [ ] `[pantalla:catalogo-inventario]` #8 Existencias «por prenda» = modelo; vista «por color» — M
- [ ] `[pantalla:catalogo-inventario]` #9 Quitar «Archivar» fantasma; filtro «Pruebas»; ventas de prueba se marcan — M
- [ ] `[pantalla:catalogo-inventario]` #10 Venta en 0 → «por regularizar»; quitar la casilla muerta — M/L
- [ ] `[pantalla:catalogo-inventario]` #11 Descontinuado completo y palabras «Retirada/Descontinuar» — M
- [ ] `[pantalla:catalogo-inventario]` #12 Color obligatorio, precio con excepción, rebaja visible, mínimo por talla y sede, cierre del alta 15-oct — M

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Catálogo · tarjeta | «Stock total N» / «Sin stock» | Suma de toda la red con cuarentena, apartadas, tallas retiradas y pruebas | ajustar (#3) | `ProductosGrilla.tsx:249-259` |
| Catálogo · tarjeta | Precio «S/90.00» | Precio de una talla, sin decir cuál | ajustar (#12) | `[visto]` |
| Catálogo · tarjeta | «MUESTRA» | Productos sin foto | bien | `[visto]` |
| Catálogo · cabecera | «Sin stock / Stock bajo / Para pedir» | Ignora el filtro `stock` mientras la paginación lo respeta | ajustar (#3) | `catalogo-v2.ts:412-417`, `page.tsx:297-303` |
| Catálogo · menú fila | «Archivar» | Un `alert` «no conectado» | sobra (#9) | `ProductosAgrupados.tsx:432` |
| Catálogo · ficha | «Permitir venta sin stock» | Nada: nadie lo lee | sobra (#10) | `ProductoForm.tsx:665` |
| Catálogo · ficha | Ajustar inventario | Valida contra otro número que la base | sobra (#3) | `AjustarInventarioModal.tsx:139-144` |
| Existencias · cifras | «Disponible total 381» | Libre de TRU sin pruebas | bien (es la regla) | `[producción]` |
| Existencias · cifras | «% vs. semana anterior» | Universo con pruebas y apartadas | ajustar (#4) | `fn_resumen_variantes:277` |
| Existencias · cifras | «En camino hacia acá» | Suma `recibido_con_diferencia` completo | ajustar (#5) | `inventario-v2.ts:272-273` |
| Existencias · cifras | «Dañado / Cuarentena» | Cuenta filas, no unidades | ajustar (#4) | `InventarioPanel.tsx:759` |
| Existencias · lista | «Por prenda» | Una fila por producto + color | ajustar (#8) | `[visto]` |
| Existencias · acción | «Reponer» a un descontinuado | Pide reponer lo que no se repone | ajustar (#11) | `existencias-recomendaciones.ts:133` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-28 | completo (flujo) | 4/10 | 9,0 Núcleo | — (primer análisis de la costura) |
| 2026-09-28 (tarde) | ejecución, no re-análisis | — | — | #2, #3, #5 y #7 hechas en la rama (sin pegar); #4 solo la parte de la base. Ver BACKLOG «🧮 Catálogo ↔ Inventario» |
