# 2026-10-02 · Actividad suma Existencias, Conteos y Traslados (ADR-0207, actualización)

## 2026-10-02 (La líder ve quién cargó, bajó, ajustó, contó y trasladó)
Qué hice: migración `20261002233000` con disparadores sobre `movimientos`, `conteos` y `transferencias` (sin tocar ninguna función que guarda) y carga de lo pasado; una línea por operación, no por prenda («bajó al piso 2 × «Blusa…» y «Casaca…»», «recibió el traslado 4 de Taller: llegaron 10 de 12, faltan 2»). La web reconoce también Clientes, Avisos y Productos, que ya anotaban y el panel decía que no; una prueba lo vigila desde las migraciones.
Por qué así: agrupar por transacción (`created_at` idéntico) da una línea legible sin tabla de pendientes, y el mismo código sirve para lo vivo y lo pasado; el stock que nace con un producto nuevo queda para Productos (siguiente etapa, visible en la sede de quien lo hizo).
Felipe se lleva: la migración ya está en producción (197 líneas de lo pasado cargadas) y el nombre de la prenda ahora es su referencia, también en Cambios; al desplegar la web, «Actividad» desde Existencias, Conteo o Traslados muestra lo de cada uno.

## 2026-10-02 (Productos también: quién creó, cambió el precio o descontinuó una prenda)
Qué hice: migración `20261002234500` (en local) con el alta y las ediciones de Productos desde `historial_producto_cambios`, una línea por guardado con su antes → después, y la frase del negocio en los cambios en bloque; nombre y descripción ahora entran al historial.
Por qué así: el historial ya guardaba cada campo con su antes y su después; Actividad solo lo agrupa y lo pone en palabras, en la sede de quien lo hizo (Felipe). El costo va sin montos porque la líder de tienda no tiene permiso de verlo.
Felipe se lleva: falta pegar Productos en producción; y las 133 líneas viejas de Existencias, que el permiso de Claude Code no dejó rehacer.
