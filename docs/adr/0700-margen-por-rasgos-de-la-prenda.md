# ADR-0700 — El margen del precio sugerido sube por lo que la prenda tiene

- **Fecha:** 2026-11-24 · **Estado:** en construcción, solo en local. Actividad 1 de 6 construida (reglas y Configuración ▸ Precios); nada en producción.
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
3. **Por defecto, mientras Felipe no diga otra cosa:** base 36 % (el tope del 30–36 % en estudio; Trujillo paga su tienda desde 37 %); el
   ámbar pasará a «bajo el objetivo» (base + casillas) en vez del piso de 48 %; las casillas nacen en «Compré ropa» y viajan a Recibir y al
   producto.
4. **Solo un Admin** cambia la base, los puntos y las listas (Felipe 2026-11-17: «las colaboradoras no deben saber ni pensar gastos»). Vive en
   Configuración ▸ Precios, sin módulo nuevo; cada función de escritura exige `fn_es_admin()`.
5. **Las reglas se guardan con fecha** (una fila por cambio): en 3 a 6 meses se calibran los puntos con las ventas (precios hedónicos), y
   para eso hay que saber qué regla regía cuando se fijó cada precio.

DECIDÍ: base + casillas con puntos, en filas que solo se agregan, con la cuenta de ADR-0668 en un solo archivo (`lib/margen-por-rasgos.ts`).
DESCARTÉ: (a) sumar las casillas encima del piso de 48 %: precios de × 2.3 a × 2.6, sobre los S/ 60 donde la venta de Trujillo cae; (b) las
casillas solo en Catálogo: casi todo entra por Recibir y la etiqueta ya va impresa cuando alguien las marca; (c) los puntos en un jsonb: un
candado por columna hace imposible un punto negativo o una casilla que falta.
SE ROMPE SI: alguien marca las cuatro casillas por costumbre en toda prenda (el +3 se vuelve +12 parejo); por eso dos salen de listas y no se
marcan a mano, y las casillas se guardarán con la prenda para medirlo.

## Qué se construyó (actividad 1)

- **Base** (`20261124170000_reglas_de_precio_por_rasgos.sql`, solo en local): `retail.reglas_de_precio` (una fila por cambio; candados: base
  20–60, casillas 0–10, base con todas ≤ 75 %; fila de fábrica 36 % y +3), `tejidos.se_nota`, `marcas.conocida`, `fn_reglas_de_precio()`,
  `fn_listas_de_precio()`, `guardar_reglas_de_precio`, `marcar_tejido_que_se_nota` y `marcar_marca_conocida` (solo Admin, firmadas con el
  responsable, anotadas en `configuracion_historial` y en Actividad). Prueba: `pnpm pruebas:reglas-de-precio` (38 casos).
- **La cuenta** (`lib/margen-por-rasgos.ts`): `sugerirPrecio` (regla → parecidas → techo de afuera → nunca perder) y `rebajaQueAguanta`,
  en céntimos enteros y con `pierdeConElPrecio` para que «Pierdes» diga lo mismo en todas partes. 19 pruebas, incluidas todas las de costo
  de S/ 1 a S/ 500.
- **Pantalla:** Configuración ▸ Precios (`VistaPrecios`): la base y los puntos (se guardan al salir), «Así queda» con un costo de ejemplo,
  y las dos listas con buscador. Quien no es Admin la ve sin poder cambiarla. Su guía interactiva tiene cuatro pasos nuevos.

## Lo que falta

Actividades 2 a 6: el ámbar contra el objetivo, las casillas en «Compré ropa», Recibir, Nuevo y Editar producto, y el cierre (diccionario,
bitácora, backlog). Producción espera el OK de Felipe.
