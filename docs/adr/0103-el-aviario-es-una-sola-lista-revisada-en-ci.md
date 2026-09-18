# ADR-0103 — El aviario es una sola lista, en código, revisada en CI

**Fecha:** 2026-09-18
**Estado:** Construido y verificado en local (`node scripts/datos/aviario.mjs --verificar`
en verde, y sus caminos de error probados sobre una copia). **Pendiente:** Felipe aprueba
línea por línea las asignaciones de abajo antes de fusionar.
**Afecta:** `scripts/datos/aviario.mjs` (nuevo), `scripts/datos/generar.mjs`,
`docs/datos/generado/AVIARIO.md` (nuevo, generado),
`docs/datos/generado/DICCIONARIO-RETAIL.md` (regenerado), `docs/datos/07-GOBIERNO.md`
§1/§4/§8, `docs/datos/generado/COMO-REFRESCAR.md`, `.github/workflows/ci.yml`,
`package.json`. Ninguna tabla, función ni pantalla.
**A qué pájaro toca:** Gorrión (plataforma y esquema). De rebote, a los 14: define a quién
se le pregunta antes de cambiar cada tabla.

## El problema

D-09 le dio a cada módulo un pájaro dueño, y `07-GOBIERNO.md` §1 tenía el índice
«tienes un nombre de tabla, quieres el pájaro» con una promesa: *si mañana nace una tabla
nueva, nace con dueño o no nace*. Ese índice se escribió a mano contra V1 el 2026-09-12,
el mismo día del corte a V2, y nadie lo movió. Medido el 2026-09-18 contra producción
(consulta en vivo de solo lectura: 60 tablas y vistas en `retail`, las mismas del volcado
del 17-sep):

- **26 de las 47 tablas que repartía ya no existen** (`sedes`, `stock_almacen`, las cinco
  `taxonomia_*`, `importaciones`, `asientos`, `ordenes_compra`…).
- **39 de las 60 reales no tenían pájaro** (`compras`, `venta_items`, `transferencias`,
  `insumos`, `tejidos`…).
- **El generador del diccionario llevaba otra lista** (V2, 2026-09-15) que asignaba 39,
  dejaba 21 «sin módulo» y contradecía a GOBIERNO en dos repartos (`proformas`,
  `ubicacion_datos_fiscales`), con un comentario en el código que lo admitía.

No fue descuido de nadie: fue diseño. Dos listas escritas a mano que responden la misma
pregunta, y ninguna máquina que avise cuando se separan. Se separaron en tres días.

## La decisión

**DECIDÍ:** una sola lista tabla→pájaro, `AVIARIO` en `scripts/datos/aviario.mjs`. De ahí
salen el índice `generado/AVIARIO.md` y las secciones del diccionario. `pnpm datos:aviario
--verificar` corre en CI (job `verificar`, sin base de datos: lee el volcado commiteado) y
falla si una tabla de producción no tiene pájaro, si una tabla aparece dos veces, si los
14 pájaros (número, nombre, módulo) no coinciden con la tabla de GOBIERNO §1, o si
`AVIARIO.md` quedó viejo. Una tabla del aviario que no está en producción solo avisa:
puede ser SQL que todavía no se pegó.

**DESCARTÉ:** poner al día las dos listas a mano, porque ya se habían separado en tres
días (12→15-sep) y se volverían a separar con la próxima tabla. También descarté dejar la
lista en GOBIERNO y leerla desde el script: obligaría a parsear una tabla Markdown de 60
filas y mezclaría en un mismo archivo lo que edita cualquiera (quién lleva un pájaro) con
lo que edita quien crea tablas.

**SE ROMPE SI:** alguien pega en producción una tabla nueva y nadie refresca el volcado.
La alarma es tan fresca como `retail_columnas.json` y no ve lo que ese archivo no dice.
También si alguien le cambia el formato a la tabla de pájaros de GOBIERNO §1 (el script
la encuentra por su encabezado `| # | Pájaro | Módulo |`), pero ahí CI falla con un
mensaje explícito, no en silencio.

**Lo que la alarma NO mira, a propósito:** la columna «Lo lleva». Apuntarse a un pájaro
sigue siendo editar una línea de GOBIERNO y commitearla (D-09). Nadie tiene que correr
un script para eso, y la prueba sobre una copia lo confirmó.

**Alcance:** solo el schema `retail`. Las tablas de `public` son del sistema de personas
(Dynamic) y no entran en el aviario.

## Las asignaciones, para aprobar línea por línea

Las 21 que no tenían pájaro:

| Tabla(s) | Pájaro | Por qué |
|---|---|---|
| `tallas`, `tejidos`, `patrones`, `etiquetas`, `categoria_tallas`, `categoria_tejidos`, `categoria_patrones`, `variante_etiquetas` | 02 Loro | Vocabulario propio de CAYLA, con el mismo proponer/aprobar de `colores` (ADR-0070, ADR-0095) |
| `producto_fotos`, `historial_producto_cambios` | 02 Loro | La ficha de la prenda y el registro de quién la cambió |
| `costo_historial` | 05 Halcón | El costo promedio nace con cada entrada de stock (`movimiento_id`, `stock_previo`) |
| `prendas_danadas` | 05 Halcón | La cuarentena de una prenda dañada entra y sale por movimientos |
| `transferencia_recepciones` | 05 Halcón | Va con `transferencias`, que ya era de Halcón |
| `venta_anulacion_items` | 07 Colibrí | Va con `ventas` |
| `producciones`, `produccion_lineas`, `insumos`, `insumo_lotes`, `movimientos_insumo`, `v_insumo_saldos` | 10 Gallito | Producción del Taller e insumos (D-47, ADR-0090) |
| `gastos` | 11 Garza | Es la plata del día |

Las 3 que cambian lo que ya estaba escrito:

| Tabla | Antes | Ahora | Por qué |
|---|---|---|---|
| `proformas` | Colibrí (GOBIERNO) / Cuervo (generador) | 08 Cuervo | Nace, vive y se convierte en comprobante dentro de Facturación: `0010_facturacion.sql`, pantalla `vender/facturacion` |
| `ubicacion_datos_fiscales` | Ganso (generador) | 08 Cuervo | Es lo que se imprime en la boleta y nace en `0010_facturacion.sql`; el mismo argumento que GOBIERNO ya daba para `sede_datos_fiscales` |
| `sububicaciones` | Ganso (generador) | 05 Halcón | Es dónde está la prenda (`stock.sububicacion_id`), no una frontera de permisos (D-26) |

El resto (36 tablas) queda donde el generador ya lo tenía.

## Cómo se verificó

- **Línea base:** con el código sin tocar, regenerar el diccionario desde el volcado no
  cambia nada. Después del refactor que saca la lista del generador, tampoco. Por eso ese
  refactor va en un commit propio, sin cambio de comportamiento.
- **La lista de 60** se comparó con producción en vivo (`information_schema.tables`, solo
  lectura, 2026-09-18) y coincide con el volcado del 17-sep.
- **Cuatro caminos de error**, probados sobre una copia en un directorio aparte: tabla
  nueva sin pájaro, tabla en dos pájaros, pájaro renombrado en GOBIERNO y `AVIARIO.md`
  viejo. Los cuatro terminan en exit 1 con un mensaje que dice qué editar. Y dos caminos
  que **no** deben fallar: alguien se apunta a un pájaro (exit 0), y una tabla asignada
  que todavía no está en producción (aviso, exit 0).
- **El diccionario regenerado:** comparadas sus líneas ordenadas contra las de antes,
  solo cambian los títulos de sección y el texto de cabecera. Ningún dato de tabla cambia.
