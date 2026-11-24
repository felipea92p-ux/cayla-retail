# ADR-0700 — El margen del precio sugerido sube por lo que la prenda tiene

- **Fecha:** 2026-11-24 · **Estado:** en construcción, solo en local. Actividades 1 a 3 de 6 construidas (reglas y Configuración ▸ Precios; el
  ámbar contra el objetivo en Nuevo producto y Recibir; las casillas en «Compré ropa»); nada en producción.
- **Pidió:** Felipe, 2026-11-24: «margen 30 a 36 %; producto nuevo, tendencia, referencia y que aumente +3 %… casillas donde marquemos si es
  un producto nuevo, si tiene algo que lo diferencia, si es en tendencia». Solo para el precio de venta; el Taller va aparte.
- **Maqueta e investigación:** https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx (privada; trae cifras agregadas de producción, por eso
  no vive en el repo, que es público).
- **Sigue a:** ADR-0668 (la cuenta única: costo y precio con IGV, margen sobre el precio sin IGV). **Se cruza con:** ADR-0480 y ADR-0660
  («Compré ropa»: ahí quien compra escribe el precio de venta), ADR-0180 (la etiqueta de precio sale sola al recibir).

## El problema

El ERP sugería el precio de venta con una sola vara para toda prenda: el piso que aguanta una rebaja de 35 % (≈ costo × 2.27, 48 % de
margen). Un polo liso que el cliente compara con otras tiendas y una blusa que nadie más tiene salían igual. Medido en producción el
2026-11-24 (525 modelos de proveedor con stock y costo, margen de lista): mediana 36 % en Trujillo, 42 % en Arequipa y 29 % en Lima; 130
modelos bajo 30 % y 303 sobre 36 %.

## Decisión

1. **Margen objetivo = base + puntos de lo que la prenda tiene.** El margen es lo que queda del precio sin IGV (la cuenta de «Te quedan»),
   nunca un recargo sobre el costo («costo + 30 %» daría × 1.53, menos que el × 1.77 de hoy).
2. **La lista de Felipe (2026-11-24), seis:**
   - suman puntos, +3 cada una: «Nadie la tiene» y «En tendencia» (las marca quien compra), «Tela que se nota» (llega marcada si el tejido
     está en la lista del Admin; quien compra puede quitarla) y «Marca que el cliente conoce» (sale sola de la lista de marcas del Admin);
   - no suman puntos: las parecidas (si se venden más caras, se sugiere ese precio) y el precio que se vio afuera (un techo: el sugerido queda
     en el .90 justo debajo).
   - Quedaron fuera, a propósito: «Se vendió a precio lleno», «Pocas unidades» y acabado, calce y detalle de diseño.
3. **Base recomendada: 37 %** (Felipe pidió verla, 2026-11-24). Con los gastos y la planilla de octubre, Trujillo —la tienda que más gasta—
   paga su propia tienda desde × 1.87 el costo (36.9 %), y Arequipa paga tienda y oficina desde 36.2 %. Es la de fábrica y la pantalla la
   muestra con «Usar 37 %»; es un número con fecha (`MARGEN_BASE_RECOMENDADO`): si los gastos cambian, se rehace el análisis. Por defecto,
   mientras Felipe no diga otra cosa: el ámbar es «bajo el objetivo» (base + casillas) y no el piso de 48 %; las casillas nacen en «Compré
   ropa» y viajan a Recibir y al producto.
4. **En pantalla, «%» y no «puntos»** (Felipe 2026-11-24): «+3 %» suma al margen (37 % pasa a 40 %), no al precio. En la base y el código
   siguen siendo puntos de margen (`puntos_*`).
5. **Solo un Admin** cambia la base, los puntos y las listas (Felipe 2026-11-17: «las colaboradoras no deben saber ni pensar gastos»). Vive en
   Configuración ▸ Precios, sin módulo nuevo; cada función de escritura exige `fn_es_admin()`.
6. **Las reglas se guardan con fecha** (una fila por cambio): en 3 a 6 meses se calibran los puntos con las ventas (precios hedónicos), y
   para eso hay que saber qué regla regía cuando se fijó cada precio.

DECIDÍ: base + casillas con puntos, en filas que solo se agregan, con la cuenta de ADR-0668 en un solo archivo (`lib/margen-por-rasgos.ts`).
DESCARTÉ: (a) sumar las casillas encima del piso de 48 %: precios de × 2.3 a × 2.6, sobre los S/ 60 donde la venta de Trujillo cae; (b) las
casillas solo en Catálogo: casi todo entra por Recibir y la etiqueta ya va impresa cuando alguien las marca; (c) los puntos en un jsonb: un
candado por columna hace imposible un punto negativo o una casilla que falta.
SE ROMPE SI: alguien marca las cuatro casillas por costumbre en toda prenda (el +3 se vuelve +12 parejo); por eso dos salen de listas y no se
marcan a mano, y las casillas se guardarán con la prenda para medirlo.

## Qué se construyó (actividad 1)

- **Base** (`20261124170000_reglas_de_precio_por_rasgos.sql`, solo en local): `retail.reglas_de_precio` (una fila por cambio; candados: base
  20–60, casillas 0–10, base con todas ≤ 75 %; fila de fábrica 37 % y +3), `tejidos.se_nota`, `marcas.conocida`, `fn_reglas_de_precio()`,
  `fn_listas_de_precio()`, `guardar_reglas_de_precio`, `marcar_tejido_que_se_nota` y `marcar_marca_conocida` (solo Admin, firmadas con el
  responsable, anotadas en `configuracion_historial` y en Actividad). Prueba: `pnpm pruebas:reglas-de-precio` (38 casos).
- **La cuenta** (`lib/margen-por-rasgos.ts`): `sugerirPrecio` (regla → parecidas → techo de afuera → nunca perder) y `rebajaQueAguanta`,
  en céntimos enteros y con `pierdeConElPrecio` para que «Pierdes» diga lo mismo en todas partes. 19 pruebas, incluidas todas las de costo
  de S/ 1 a S/ 500.
- **Pantalla:** Configuración ▸ Precios (`VistaPrecios`): la base (con la recomendada y «Usar 37 %») y el % de cada casilla (se guardan al
  salir), «Así queda» con un costo de ejemplo,
  y las dos listas con buscador. Quien no es Admin la ve sin poder cambiarla. Su guía interactiva tiene cuatro pasos nuevos.

## Qué se construyó (actividad 2)

- **El ámbar contra el objetivo:** `margenALaVista(costo, precio, margenObjetivo)` compara exacto en céntimos (`llegaAlObjetivo`); la línea
  «Te quedan», el nivel de Nuevo producto («Bajo tu objetivo») y el aviso «Revisa el precio» de Recibir dicen lo mismo. La regla llega a
  toda hoja desde el layout de la app (`ReglasDePrecioProveedor`, `useMargenObjetivo`); si no se puede leer, vale la de fábrica. El .90 de
  CAYLA pasó a la cuenta única (`aNoventaCts`). La propuesta con IA sigue con su piso de 48 % hasta la actividad 5.

## Qué se construyó (actividad 3)

- **«Compré ropa» con las casillas** (`20261124174000_compra_con_rasgos_de_la_prenda.sql`, solo en local): `orden_compra_items.rasgos` (los
  códigos de ADR-0700, en el orden de la hoja) y `precio_visto_afuera` (techo del sugerido), con sus candados y sus lectores
  (`fn_rasgos_de_linea`, `fn_precio_visto_de_linea`). Las escribe `fn_registrar_compra_rapida_base` en la misma transacción que crea la línea,
  con un reemplazo anclado que NO toca el bloque que ancla 20261113211000 (las pruebas que la vuelven a pegar siguen pasando). No es
  `sugerido_motivos`: lo que la prenda tiene es de la prenda, y una prenda «a la espera de precio» también lo guarda. `fn_reglas_de_precio`
  trae además las listas (ids). Prueba: `pnpm pruebas:compra-con-rasgos` (18 casos).
- **La hoja de prenda** (`mi-plata/HojaPrenda.tsx`): «¿Qué tiene esta prenda?» (tres casillas a mano y la marca sola, cada una con su «+3 %»),
  «Sugerido S/ …» que se escribe de un toque, «¿La vieron más cara afuera?» y la línea «Te quedan» de la cuenta única. Se fue «Por cada una
  ganas» (`gananciaPorPrenda`): era la resta simple con IGV que ADR-0668 descartó (S/ 30.90 → S/ 54.90 decía «ganas S/ 24.00»; quedan S/ 15.63).
- Aquí no se pregunta el tejido: «Tela que se nota» la marca quien compra; llega sola por el tejido donde se elige (actividad 4).
- **Queda abierto:** «Editar orden» del escritorio reescribe las líneas sin estas columnas (`fn_orden_compra_escribir_lineas`): una compra
  editada ahí pierde sus casillas. «Corregir la compra» no.

## Lo que falta

Actividades 2 a 6: el ámbar contra el objetivo, las casillas en «Compré ropa», Recibir, Nuevo y Editar producto, y el cierre (diccionario,
bitácora, backlog). Producción espera el OK de Felipe.
