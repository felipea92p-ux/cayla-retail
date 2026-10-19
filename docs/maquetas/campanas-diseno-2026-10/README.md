# Tienda web ▸ Campañas: maqueta navegable (2026-10-16)

**Qué es:** un prototipo tocable, sin código real ni base de datos, del submódulo **Campañas**: cada campaña con su propio
diseño en la portada de la tienda online, armado por una colaboradora sin programa de diseño, y lo que hoy vive en
Catálogo ▸ Atributos ▸ Etiquetas ▸ «Configurar campaña» (descuento, fechas, dónde rige, prendas, etiquetas de precio).
Todo va en `index.html`, que se abre directo en el navegador. **Una maqueta no cambia el ERP ni la tienda.**

## El problema

La portada de la tienda online (`apps/tienda/app/page.tsx`) pinta toda campaña con los mismos tokens fijos de
`apps/tienda/app/globals.css` (`--t-hero: #6a2118` y compañía): Día del Gato, Navidad y Black Friday saldrían iguales. Y
`retail.tienda_portada()` solo anuncia campañas **con descuento**: de las 12 campañas activas en producción (16-oct, solo
lectura), solo «Día Internacional del Gato» lo tiene, así que Halloween, Navidad y Black Friday nunca saldrían.

## Cómo se usa

La barra negra de arriba salta entre pantallas; también por enlace (`index.html#editor`, `#publicar`, `#datos`, `#ideas`,
`#decidir`). «ERP claro / oscuro» cambia el tema del ERP; dentro del editor, «Claro / Oscuro» cambia el de la tienda.

1. **Campañas** (`#lista`): la línea «La portada, día a día» dice qué campaña sale cada día (y cuándo sale «Lo nuevo»),
   con los colores de su diseño; debajo, cada campaña con su portada en miniatura y su estado.
2. **Diseñar** (`#editor`): siete pasos con la guía de foco (`Sigue aquí`), todos con un valor de fábrica: estilo de
   partida (8), colores (14 paletas curadas, las sacadas de las prendas de la campaña y «Mi color»), fondo (degradado,
   liso, con dibujo —8 estampados y 3 intensidades— o con foto), acomodo (polaroids, foto grande, mosaico, solo letras),
   texto (desde qué palabra va la cursiva, tamaño y una frase propia de 60 letras), prendas (hasta 3 o 4, en orden) y
   detalles (cuenta regresiva, el % gigante, el colibrí, un sello). La vista previa cambia con cada toque, en computadora y
   celular, claro y oscuro. **Sorpréndeme** arma una combinación al azar entre lo curado; **Deshacer** vuelve atrás.
   La **revisión** mide el contraste real (WCAG) en los dos temas y avisa lo que se ve mal; si la letra no se lee,
   «Publicar» se apaga y dice por qué.
3. **Publicar** (`#publicar`): la hoja con la portada en los dos tamaños, cuándo se ve y cuándo se quita, la revisión y el
   responsable. El diseño anterior queda guardado.
4. **Lo que venía de Atributos** (`#datos`): las pestañas Datos y Prendas de la campaña.
5. **Ideas** (`#ideas`): la misma campaña en varios estilos y otras campañas con el suyo, también en celular.
6. **Decisiones** (`#decidir`): las tres decisiones de Felipe, con Ganas / Pagas y la elegida marcada.

## Qué es real y qué es inventado

- **Real** (producción, 16-oct, solo lectura): los nombres, fechas y descuentos de las campañas; las prendas etiquetadas
  en Día del Gato, Halloween y Aniversario, con sus colores (`colores.hex`); la portada de hoy (el estilo «Clásico CAYLA»
  reproduce las medidas de `globals.css` y `collage.css` de la tienda).
- **Inventado:** los diseños de cada campaña salvo el de Día del Gato, la foto de fondo (un dibujo de ejemplo), la
  colaboradora (Rosa Medina) y la regla de quién sale primero en la portada.
- Las prendas se dibujan con la silueta de su categoría en su color (como `DibujoPrenda` de la tienda), no con sus fotos:
  el repo es público y las fotos no viven aquí.

## Decisión de diseño que la maqueta ya toma

DECIDÍ: **libertad dentro de un marco**: paletas curadas (con su versión de noche y el contraste medido), estampados
dibujados por nosotros, cuatro acomodos y un tope a la frase; «Mi color» elige solo la letra y el acento.
DESCARTÉ: un editor libre (cualquier color, cualquier letra, cualquier posición) porque la primera portada con letra
amarilla sobre crema la ve todo cliente, y en modo oscuro una portada clara encandila; arreglarlo después es tarde.
SE ROMPE SI: una campaña pide algo que el marco no tiene (un video, la foto de una modelo a pantalla completa con texto
encima de la cara): se suma un acomodo nuevo, no se abre el marco.

## Decidido (Felipe, 2026-10-17)

1. **Dónde vive en el menú:** grupo nuevo «Tienda web» con Vitrina web y Campañas (Catálogo baja de 6 a 5 pantallas). El
   descuento de una campaña lo cobra la caja de las tres tiendas; la pantalla lo dice («Se cobra en»).
2. **Una campaña sin descuento sale en la portada** si tiene prendas o diseño propio; con dos a la vez, la de descuento primero
   salvo que se cambie a mano.
3. **Quién diseña: todo junto, como hoy.** Una sola llave: quien ve Campañas diseña y también pone el descuento (se descartó
   separar el diseño del descuento).

## Cómo se construye

- **Contrato:** `retail.tienda_portada()` devuelve, además de `{nombre, pct, hasta}`, el `diseno` publicado de esa campaña
  (paleta por clave, fondo, estampado, acomodo, corte de la cursiva, frase, prendas, detalles). La tienda lo valida con Zod
  como ya valida la campaña (`apps/tienda/lib/portada.ts`); **si falta o no pasa, sale el rojo de siempre** (principio 9).
- **Datos (borrador):** una tabla aparte de `etiquetas` (el diseño no es el descuento) con un diseño publicado por campaña
  como máximo (índice único parcial), la paleta como clave de un catálogo y no como hex suelto (un `check` contra las
  paletas, y «Mi color» guardado con su contraste ya verificado), y la frase con tope de 60. La foto, en Storage.
- **La portada lee una vez por minuto** (`lecturaCompartida` de 60 s y la página de 5 min): «se ve en menos de 5 minutos».
- Lo que la maqueta no resuelve: cómo se recorta una foto real al celular, y el peso de la foto en la portada.
