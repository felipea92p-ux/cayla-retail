# ADR-0565 · Movimientos ▸ «Ingresos»: qué prendas entraron, por modelo

- **Fecha:** 2026-10-28 · **Estado:** construido en la rama; **la migración está en producción desde el 2026-10-29** (Felipe: «pega todas las migraciones en prod»), registrada por `apply_migration` como `20261029135109 ingresos_por_modelo` (la hora de aplicación, no la del archivo `20261029022000`).
- **Pedido (de una colaboradora, contado por Felipe):** cuando llega un fardo, la persona de compras le pide saber qué prendas entraron —por modelo, sin
  colores ni tallas, «a veces» con ellos—. En Movimientos buscó lo cargado como «Stock inicial» desde el día que llegó el fardo hasta hoy y no pudo: salían
  decenas de filas por color y talla, no sumaba por modelo y no logró pasarlo a Excel. Quería algo como su Excel, «no tan feo, o más útil».
- **Las 15 respuestas de Felipe** (2026-10-28): por modelo con foto; con cada fardo y **después** de que llegó, filtrando desde ese día hasta hoy; cuenta el
  **stock inicial** y la **mercadería recibida**; Nuevo o Reingreso con etiqueta; precio y costo; colores y tallas que se abren al tocar; ordenar y filtrar
  columnas; descargar Excel e imprimir o PDF; vive **dentro de Movimientos**; la persona de compras entra sola y ve todo Movimientos; la sede que esté elegida;
  sin comparar contra la factura (más adelante).

## Decisión

1. **Una pestaña de Movimientos, no un módulo** (como «Pérdidas», ADR-0328 act. 14, y ADR-0306): `?vista=ingresos`. Quien ve Movimientos la ve; no hay entrada
   nueva en Roles y accesos. Que la persona de compras vea **todo** Movimientos fue decisión de Felipe.
2. **La suma la hace Postgres:** `retail.fn_ingresos_por_modelo(p_ubicacion_id, p_desde, p_hasta)`, **solo lectura**, `security definer`, con los permisos de Pérdidas
   (`fn_ve_modulo('movimientos')` y `fn_puede_operar_ubicacion`), frontera a la medianoche de Lima, tope de un año. Suma por modelo los `movimientos` `entrada` con motivo
   `carga_inicial` o `recepcion` de esa sede. **No cuenta traslados anulados, ajustes ni otra sede, y no resta lo que se ajustó o vendió después** (lo dice una nota en la pantalla).
3. **Nuevo o Reingreso:** «Nuevo» = el modelo no tenía **ningún** ingreso antes del rango en **ninguna** sede (un traslado anulado no es un ingreso). Se mide por
   ingresos y no por la fecha de creación del modelo, porque lo que importa es cuándo entra el stock.
4. **El precio es el de la sede** (`fn_precio_en_sede`: el propio de la tienda y, sin él, el de la grilla), único o rango por tallas.
5. **El costo solo lo ve quien ve el dinero** (`fn_puede_ver_dinero_de_compras()`, ADR-0183: la columna `variantes.costo` está cerrada). Sin permiso la función lo
   devuelve `null`, la tabla **no dibuja la columna** y el archivo **no la lleva**; nunca un 0. Un costo en 0 es «Sin costo» y no entra al rango.
6. **Buscar, filtrar, ordenar y abrir ocurren en el navegador** con lo que el rango ya trajo (sin loader, ADR-0149). El filtro Nuevos/Reingresos solo se ofrece si hay de las dos clases.
7. **Excel es un CSV con BOM armado en el navegador** (`lib/exportar-csv.ts`: el repo no tiene librería de .xlsx y no se sumó una): baja **lo que se ve** (búsqueda, filtro y orden), por
   modelo o con una fila por color y talla. Ningún texto empieza con `=`, `+`, `-` ni `@` (Excel lo ejecutaría como fórmula). **Las fotos van en la versión impresa**, no en el archivo.
8. **Imprimir:** una hoja A4 clara con foto (`#ingresos-print`, montada pegada a `<body>` solo mientras se imprime, como el comprobante), que espera a que carguen las fotos.

## Descartado

- **.xlsx real** (fotos y hojas aparte): suma una dependencia nueva; se deja a Felipe si el CSV no alcanza.
- **Agrupar por «fardo»** con un nombre al ingresar: cambia el flujo de ingreso; se eligió «por fechas».
- **Usar `lotes`** (proveedor y guía del fardo) como identidad: solo la mercadería *recibida* los tiene; el stock inicial no. Queda como mejora posible.

## En producción (2026-10-29)

Antes de pegar se leyó producción (solo lectura): existían `fn_precio_en_sede`, `fn_puede_ver_dinero_de_compras`, `fn_ve_modulo`, `fn_puede_operar_ubicacion` y todas las columnas que usa. Después: la función existe (`security definer`, estable), `anon` no la ejecuta y `authenticated` sí. Prueba funcional que se revierte sola, con una cuenta de líder y los últimos 30 días de la sede con ingresos más reciente: la función suma **1.146** unidades, igual que una suma directa del libro y que la suma del detalle por color y talla (194 modelos). Pendiente de producción: que el `?vista=ingresos` de la web llegue con el PR.

**Pendiente de diseño:** Movimientos ya tiene un filtro opcional por empresa (CAYLA o CLAURE en Lima, ADR-0532, `fn_empresa_de_prenda_en_sede`). Ingresos muestra todo, como Movimientos por defecto; sumarle ese filtro queda para después.

## Verificación

`pnpm pruebas:ingresos-por-modelo` (33 casos contra Postgres, con modelos propios dentro de una transacción con ROLLBACK y números calculados a mano), `lib/ingresos-reglas.test.ts` y
`lib/ingresos-exportar.test.ts`, la guía interactiva de Movimientos recorrida en escritorio y a 375 px, el auditor de modo oscuro (0 hallazgos solo en oscuro, cuentas admin e integrante) y
el contenido real de los archivos bajados.
