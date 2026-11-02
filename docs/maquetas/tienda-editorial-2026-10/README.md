# B · Editorial cálido (maqueta, 2026-10-31)

**Qué es:** la dirección que Felipe eligió el 2026-10-31 después de ver el informe «Vitrinas Shopify para CAYLA» (10 tiendas de moda en
Shopify comparadas con tienda.cayla.pe). Toma de Dôen las fotos enmarcadas con su boleto y una palabra en letra de mano, de Christy Dawn
los bloques que alternan foto y texto con las cifras del origen, de Johanna Ortiz la portada en dos columnas, de Rouje la ficha con
«¿En qué tienda está?» y de Kotn el catálogo con prendas desde el primer pantallazo y «Combínala con».

**Todavía no es una decisión de construir:** reemplazaría a «G · Pasarela» (ADR-0524). El ADR se escribe cuando Felipe apruebe la maqueta.
**Después de esta vinieron más rondas:** el estado y las decisiones están en `../tienda-sofisticada-2026-10/README.md`.

## Cómo verla

`preview_start maqueta-referentes` y abrir `http://localhost:3031/tienda-editorial-2026-10/index.html`. Abajo hay una barra para pasar
entre Inicio, Catálogo y Ficha y para cambiar a modo oscuro.

## Las fotos

Salen de la carpeta de Drive «FOTOS PARA WEB ▸ EDITADAS» (57 fotos de estudio). Se bajan a `fotos/` (en 1600 px) y **no entran al repo**:
`fotos/` está en el `.gitignore` de esta carpeta porque el repo es público y son fotos de personas (si pueden subirse lo decide Felipe).
Para bajarlas: `node docs/maquetas/tienda-editorial-2026-10/bajar-fotos.mjs`. La lista de ids está en `fotos-drive.json`; `fNN.jpg` es el
orden de la carpeta en Drive (comprobado el 2026-11-02 con md5 contra las bajadas del 31-oct; las dos «IMG_2127 (F).jpg» se distinguen por id).
Las maquetas C a I, en `../tienda-sofisticada-2026-10/`, usan estas mismas fotos.

## Lo que es de ejemplo (no inventar en la tienda real)

- Nombres y precios de las prendas.
- «La modelo mide 1,60 m y usa talla S», la barra de calce y la composición de la tela: hacen falta esos datos por prenda.
- La guía de tallas: no hay medidas por categoría en la base; hay que tomarlas en el taller.
- Las dos cifras del taller («— —»): las da Felipe. La tercera (3 tiendas) es real.
- Direcciones, horarios y la regla de cambios («con el plazo que dice tu boleta») son los reales de la tienda de hoy.

## Paleta y letras

Papel `#f3ede4` (el beige del fondo del estudio), cacao `#2b211b` para el texto, vino `#7a2430` como acento y el rojo del colibrí solo en
el logo. Cormorant (títulos), Hanken Grotesk (texto) y Pinyon Script (una palabra de mano por sección). Movimiento: una vez, sin rebote ni bucle.
