# ADR-0150 — Datos de demostración: 90 días de historia sintética, cargados con un generador SQL desechable

- **Fecha:** 2026-09-21
- **Estado:** En curso — Fase 1 (catálogo) ensayada con `ROLLBACK`; fases 2-7 pendientes. **Nada está escrito en producción.**
  **Numeración provisional:** verificar en refs remotas antes de subir (los números de ADR chocan entre sesiones paralelas).
- **Decide:** Felipe (volumen ×3, personas reales como autoras, carga desechable, isotipo como imagen, él pega el `COMMIT`).
  Arquitectura: este documento.
- **Toca:** solo datos. **No cambia el esquema ni `apps/web`.** Archivos: `scripts/demo/sembrar-90-dias.sql` (y, en las fases
  siguientes, `verificar-90-dias.sql`, `deshacer-90-dias.sql` y `docs/demo-90-dias/QUE-MIRAR.md`).

## Contexto — el problema

Producción aún no tiene uso real: 45 productos, 17 ventas de prueba, 480 movimientos. Con ese volumen no se puede ver cómo se
comportan Análisis, Compras, Caja, Movimientos ni el rendimiento, ni comprobar que el stock cuadra después de meses de
operación. Hay que probar la integración en un entorno de verdad, con tres meses de historia coherente.

## Decisión

**Un generador determinista en SQL, dentro de una sola transacción, con `INSERT` directo y fechas históricas explícitas.**
Ninguna RPC de escritura acepta fecha (`registrar_venta`, `abrir_caja`, `cerrar_caja`… sellan `now()`), y `movimientos` es
inmutable: una fecha mal puesta no se corrige. Llamar las RPC dejaría todo «hoy», quemaría correlativos reales (B004, F004) y
exigiría suplantar usuarios. Un generador por conjuntos dentro de la base produce ~90.000 filas en segundos y se ensaya con
`ROLLBACK` sobre el esquema real.

Reglas que lo gobiernan:

1. **Marcado:** todo id sembrado empieza en `5eed` (`overlay(md5('seed:'||tabla||':'||clave) placing '5eed' from 1 for 4)`),
   así se filtra, se verifica y se deshace sin tocar lo real.
2. **Determinista:** misma semilla, mismos datos. Las elecciones se hacen con un hash del id del producto, no con `random()`
   suelto (ver «Lo que enseñó la Fase 1»).
3. **Nada se apaga:** los triggers corren en la carga (solo `INSERT`). Apagar el candado de `movimientos` queda solo para
   *deshacer*, con OK explícito ese día.
4. **Comprobantes:** jamás `pendiente` ni `rechazado` (el botón «Transmitir» los mandaría a SUNAT). Series demo, `aceptado`,
   entorno `sandbox`. **No se toca `series_comprobantes`.**
5. **Los chequeos abortan la transacción** (`RAISE EXCEPTION`) antes del final: un `COMMIT` con datos que no cuadran no existe.
6. **Ensayo y definitivo son el mismo archivo.** La última línea es `ROLLBACK;`; Felipe la cambia por `COMMIT;` y antepone
   `set search_path to retail, public;` al pegarlo en el SQL Editor de producción.
7. **Quién es «líder»:** `retail.colaboradores.rol = 'lider'` (no el rol de `public.personas`). Los triggers de alta miran
   `auth.uid()`; el script fija `request.jwt.claim.sub` al `auth_user_id` de un líder para que el catálogo quede aprobado.
8. **Quién firma:** los 9 líderes (sin sede) y los colaboradores de `colaboradores.ubicacion_asignada_id` (TRU 11, AQP 2, Taller 3).

## Fase 1 — catálogo (ensayada)

220 productos, 1.261 variantes, 441 fotos, 126 vínculos a 3 campañas. Reparto por categoría con cantidades fijas (Polos+Tops 22 %,
complementos 21 %, blusas 9 %), bandas de precio por categoría terminadas en `.90`, costo 38-48 %, 67 marcas (concentradas: 19, 16 y 13
prendas en las tres mayores), 31 colores, 180 de Otoño-Invierno y 40 de Primavera-Verano, códigos únicos y en orden cronológico.
Las tres campañas reales (Fiestas Patrias, Día Internacional del Gato y del Perro) ya existen sin descuento; **no se tocan**: las
demo son nuevas y llevan «(demo)» en el nombre. El SKU manual queda vacío (el trigger asigna código y código de barras).

## Lo que enseñó la Fase 1 (para no repetirlo en las fases siguientes)

- **Un subselect que no depende de la fila se evalúa una sola vez.** `cross join lateral (… order by random() limit 1)` dio la
  misma marca a las 220 prendas y `colores` dio los mismos dos colores. Los conteos pasaban; solo un diagnóstico de variedad
  lo mostró. Por eso ahora hay un chequeo de variedad (≥ 10 marcas, ≥ 15 colores) y toda elección depende de un hash del id.
- **El orden de inserción es el orden de los correlativos:** el trigger de variantes asigna `codigo` en el orden en que entra
  cada fila. El `INSERT … SELECT` lleva `ORDER BY` por fecha de alta y un chequeo verifica que no haya inversiones.
- **`retail.etiquetas` tiene clave única por nombre normalizado** (`fn_clave_texto`): una campaña demo con el nombre de una real
  aborta. Las reales ya traían las mismas tres fechas.
- **`referencia` es el nombre del producto** en la pantalla actual (los datos viejos la usan como código); se sigue la convención de
  la pantalla.

## Qué falta (fases 2-7) y lo que se decidirá con Felipe

Demanda, inventario inicial y abastecimiento derivado, ventas/caja/comprobantes, postventa/taller, cierre y ensayo completo con
prueba de reversibilidad. **Pendiente de Felipe:** el día en que termina la ventana (el del `COMMIT`; hoy el script usa
`current_date`) y una ventana tranquila, porque hay pruebas en producción en vivo (última venta el 2026-09-21 15:42 UTC).
Antes del `COMMIT`: confirmar en Supabase (Database → Backups) que hay una copia de ese día.

## Consecuencias

- Mientras exista la carga, hay ventas con nombres de colaboradoras reales (rankings por vendedora). Operar devoluciones o el botón
  «Anular» sobre boletas sembradas llamaría a Lucode sandbox: no usarlo.
- «Hoy» envejece: las pantallas de «hoy» solo ven el día Lima actual. Para refrescar se re-siembra (`deshacer` + `sembrar`).
- La base de producción es también la de Dynamic: ensayos pequeños primero, carga completa fuera de horario.
