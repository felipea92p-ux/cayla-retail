# ADR-0168 — Buscador de Apartados con miniatura y fotos servidas a su tamaño

**Fecha:** 2026-09-22
**Estado:** Aceptado e implementado (solo Apartados; el Punto de venta no cambia).
**Decide:** Felipe eligió la opción B de la demo `docs/maquetas/separaciones-2026-09/buscador.html`, con las prendas sin
disponible atenuadas al final y el cambio solo en Apartados. Lo técnico, este documento.

## Contexto
En Apartados, el nombre solo se buscaba al presionar Enter, y la lista que salía no tenía fotos. Además, todas las fotos
de prenda del ERP se sirven `unoptimized`, así que el navegador baja el archivo original aunque se vea de 44 px.

Se midió en producción el 2026-09-22 (bucket `retail-productos-fotos`): 31 fotos, con un promedio de 90 KB y la mayor de
199 KB. Con la foto original, una lista de 8 filas con foto bajaba unos 0,7 MB por búsqueda.

## Decisión
1. **Buscador en vivo** en `ApartarVista`, con la misma forma que el Punto de venta: *combobox*, flechas y Enter. Cada fila
   lleva una miniatura de 44 px.
   - La regla pura es `resultadosDelBuscador` (`lib/separaciones-reglas.ts`). Pone primero las prendas que se pueden
     apartar; las agotadas van al final, atenuadas y sin poder elegirse, y nunca le quitan lugar a una disponible.
   - Las agotadas muestran «N en el almacén: tráela al piso» o dónde más hay (`fn_stock_por_sede`, dato secundario).
   - El lector de código no cambia: el código exacto agrega directo.
2. **`FotoPrenda` de Apartados pasa por el optimizador de Next**, con `sizes` igual al ancho en pantalla (prop `ancho`).
   Así la miniatura, la ficha, «Escaneadas hace poco», Entregar y Todos bajan un WebP de su tamaño.
   - En la prueba local, 4 fotos de 24–38 KB bajaron a 0,1–0,4 KB en la lista y a 4 KB en la ficha (retina 2x).
   - `next.config.ts` permite al optimizador **solo** el Storage público de nuestro propio Supabase (`remotePatterns`
     armado desde `NEXT_PUBLIC_SUPABASE_URL`). Sin una lista cerrada, `/_next/image` serviría de proxy abierto.
3. **Solo se optimiza lo que el optimizador acepta** (`fotoOptimizable`, `lib/foto-prenda-reglas.ts`); lo demás se muestra
   como hoy. El motivo: `next/image` con un host no permitido no falla en silencio, **lanza y tumba la pantalla**
   (reproducido en local el 2026-09-22 con fotos de `localhost` contra una app configurada con `127.0.0.1`). Si una foto
   da 404, quedan las iniciales.

## Descartado
- **Tarjetas con foto grande (C):** muestran 4 a 6 resultados a la vista en vez de 8, se usan mal con el teclado y pesan
  más.
- **Transformaciones de imagen de Supabase (`/render/image`):** dependen del plan del proyecto y no se pudieron probar
  desde aquí. Vercel ya optimiza sin configurar nada más.
- **Generar la miniatura al subir la foto:** es lo más liviano a largo plazo, pero toca la subida de fotos del catálogo
  (otro módulo). Queda como opción si el cupo de optimización de Vercel llega a ser un problema; con ~31 fotos y un
  puñado de anchos, hoy no lo es.

## Se rompe si
- Cambia el host de Supabase y no se vuelve a desplegar (`remotePatterns` se arma en el build): `fotoOptimizable` compara
  contra la misma variable, así que las fotos se verían sin optimizar, no rotas.
- Alguien usa `next/image` optimizado con una URL que no pasó por `fotoOptimizable`.
- `dangerouslyAllowLocalIP` está activo solo en `next dev`; nunca debe llegar a producción.

## Cómo verificarlo
En `/vender/apartados`, escribe «blusa»:
- Aparece la lista con fotos y en la pestaña Red del navegador cada miniatura sale de `/_next/image?...&w=96` con pocos KB.
- Si escribes el nombre de una prenda sin disponible en la tienda, aparece gris al final con dónde hay.

---

## Actualización 2026-10-13 — el optimizador llega a las miniaturas de todo el ERP

**Qué cambió.** `MiniaturaPrenda` (`components/ui/PrendaCelda.tsx`, la miniatura de 27 archivos: Existencias, Catálogo ▸
Productos, Movimientos, Conteo, Frescura, Cambios, Devoluciones…) y `TilePrenda` (Análisis) dibujaban `<Image unoptimized>`:
bajaban el original de 1200×1500 (~90 KB) para pintarlo a 17–64 px. Ahora pasan por el optimizador de Next cuando la foto
es de nuestro Storage público. Con el ancho del dibujo, el navegador pide: 36 y 44 px → 48/96, 48 px → 48/96, 60 px → 64/128
(1×/2×); los tiles de 17 a 64 px → 32/48 hasta 64/128.

**Una sola pieza, no tres copias (ADR-0358).** Las dos decisiones que toda foto de prenda necesita viven ahora en
`components/ui/ImagenDePrenda.tsx`: *¿la optimiza Next o se muestra tal cual?* (`fotoOptimizable`, sin cambios) y *si no
carga, ¿qué se dibuja?* (el mosaico de «sin foto», ADR-0333). `FotoPrenda` de Apartados, que tenía su propia copia de ambas,
la usa también. Cada pieza conserva su caja, su recorte y su «sin foto»: `ImagenDePrenda` solo decide cómo se sirve.

**Un cambio de comportamiento, a propósito.** Antes, una foto de miniatura o de tile que no cargaba (404, host caído) dejaba
la imagen rota. Ahora cae al mismo «sin foto» de la prenda sin foto, como ya hacía `FotoPrenda`. La marca de «rota» se guarda
por URL, así que una celda que pasa a otra foto vuelve a intentarlo.

**Descartado.**
- *Marcar `PrendaCelda.tsx` como `"use client"`* para usar un hook: cuatro archivos de servidor
  (`ResultadoConteo`, `CabinaAlmacen`, `BloquesLaterales` y el propio) llaman `categoriaDe` desde ahí, y llamar a una función
  exportada por un archivo cliente desde el servidor tira la pantalla. Por eso la pieza compartida es un componente cliente
  aparte y `PrendaCelda.tsx` sigue sin marca.
- *Tocar `FotoDePrenda`* (la foto de 176 px del costado de una hoja) y los ~24 sitios más que siguen `unoptimized`
  (Existencias en tarjeta, Vender, Inicio de Almacén, ficha de producto…): es el mismo cambio y cabe en `ImagenDePrenda`,
  pero no se pidió y cada pantalla se mira por separado. Quedan anotados en `docs/backlog/`.

**Se rompe si.**
- **El cupo de transformaciones de Vercel.** Este ADR descartó preocuparse por él con «~31 fotos y un puñado de anchos».
  Con esta actualización cada foto puede pedirse a hasta unos 6 anchos distintos (32 a 128 en miniaturas y tiles, más los de
  `FotoPrenda`) en toda la app, y el catálogo creció: una lectura de producción del 2026-10-13, de otra sesión, contó 235
  productos aprobados, con una foto por color. Hay que mirar el consumo de «Image Optimization» en Vercel tras el primer mes;
  la salida si molesta es la que ya se anotó arriba: generar la miniatura al subir la foto. **No se midió en esta sesión:**
  contar las fotos de producción (`retail.producto_fotos`) no se pudo (lectura denegada), así que el número de fotos reales
  sigue sin saberse.
- Alguien vuelve a escribir `<Image unoptimized>` para una foto de prenda: `lib/imagen-de-prenda.test.tsx` prueba lo que sale
  al navegador (Storage propio → `/_next/image`; otro host o sin URL de Supabase → tal cual), pero no vigila archivos nuevos.

**Cómo verificarlo.** En Catálogo ▸ Productos (vista Tabla) o Existencias, con una prenda que tenga foto, la pestaña Red
muestra `/_next/image?url=…&w=48|96|64|128` en vez del archivo completo del Storage. Para ver el respaldo, abre una prenda
cuya foto dé 404: debe verse el ícono de su categoría sobre su color, nunca una imagen rota.

## Actualización 2026-10-14 (b) — todas las fotos de prenda pasan por `ImagenDePrenda`, y se precargan en el tamaño en que se ven

**Qué cambió.** Los ~24 sitios que quedaban con `<Image unoptimized>` (Existencias —tarjeta y panel de talla—, Vender —tarjeta y
hoja de opciones—, Productos —grilla—, vista rápida y hoja del modelo de Producción, Inicio de Almacén, ficha de producto, historial
de ventas, movimiento, escáner, traslados, proformas, «parecidas» del alta) ahora usan `ImagenDePrenda`. `<ImagenDePrenda>` ganó
`alFallar` (para quien además de dibujar el respaldo debe sacar la foto de una lista: `TrasladoMiniaturas`) y el respaldo puede ser
`null` donde la caja ya tiene su fondo. Quedan `unoptimized` a propósito (lista cerrada con su motivo en `lib/fotos-optimizadas.test.ts`):
`FotoAmpliada` («ver en grande»: se quiere el original), los dos isotipos locales, el dibujo generado, las muestras de tejido y
patrón y el avatar de persona.

**Por qué ahora.** Medido en producción el 2026-10-14 (lectura de `storage.objects`): 919 objetos en `retail-productos-fotos`, 227 MB,
**JPEG** con mediana de 214 KB, p90 de 415 KB, 43 de más de 500 KB y una de 2,5 MB (la cifra de «~90 KB» de la sección anterior
era de cuando había 31 fotos). Con `sharp` (WebP calidad 75, lo que hace Next) una foto de 214 KB baja a 1,2 KB a 96 px, 3,8 KB a
256 px y 13 KB a 640 px; una de 408 KB, a 1,9 · 6,2 · 44 KB. Una pantalla de Existencias con 60 tarjetas pasa de ~13 MB a ~72 KB.

**Precarga.** Cambiar de color mostraba la caja en blanco: la foto se pedía recién al cambiar. Ahora `components/ui/precargar-miniaturas.ts`
baja las de los otros colores (al abrir la hoja, o al entrar el mouse a la tarjeta) con el `src`, `srcset` y `sizes` EXACTOS que
`<Image>` va a pedir (`getImageProps`); el navegador reusa esa versión y no hay petición nueva al cambiar (verificado en el navegador:
0 peticiones tras dos cambios). En la vista rápida la capa nueva solo entra cuando su foto está lista (tope de 2,5 s), así que la
anterior se queda a la vista en vez del blanco.

**Caché a 31 días (`images.minimumCacheTTL`, `next.config.ts`).** Next 16 trae 4 horas por defecto. Las fotos se suben siempre con `upsert: false` y un uuid
(`lib/producto-fotos.ts`), así que un archivo nunca cambia bajo su nombre y cachear largo no puede mostrar una foto vieja. Medido el 2026-10-14
(`vercel usage`, equipo `cayla`, plan Pro): el consumo de «Image Optimization» desde el 11-jul suma US$ 0,048 (la cuenta total, US$ 187,6, es 79 % minutos de
build): hoy no es un costo; la caché larga evita que lo sea al sumar ~900 fotos × sus anchos. Si algún día se reemplaza una foto con el mismo nombre:
`vercel cache invalidate --srcimg <url>`. Las fotos del Storage llegan con `cache-control: no-cache` (el navegador vuelve a preguntar por cada una);
las del optimizador salen con caché larga, y eso también explica parte de la lentitud de antes.

**Se rompe si.** El cupo de «Image Optimization» de Vercel se agota (hoy muy lejos: ver arriba) (919 fotos × varios anchos: mirar el consumo el primer mes;
salida: generar al subir una versión chica en `lib/preparar-foto.ts`). **No se midió el tiempo de la primera petición de cada foto en
Vercel** (solo bytes). Una foto nueva vuelve a `unoptimized`: `lib/fotos-optimizadas.test.ts` lo hace fallar.

**Tres ajustes más (2026-10-14).** (1) `<ImagenDePrenda fondo={colorHex}>`: mientras llega la foto, la caja muestra el color de la prenda (inline, es dato y no cambia en
oscuro) y la foto se funde encima; antes era una caja beige vacía. (2) Adelantar la foto de la pantalla que abre cada tarjeta: Productos → vista rápida, Vender → hoja
de opciones, Existencias → panel de talla, al entrar el mouse (`precargarMiniaturas` / `precargarFotoFija`); los tamaños de cada pantalla viven juntos en
`lib/fotos-tamanos.ts` porque donde se pinta y donde se adelanta deben decir EXACTAMENTE lo mismo. La foto del panel de talla se declaró con su caja real (272 × 363)
y deja de pedir el ancho de 1080 en retina. (3) `images.imageSizes: [48, 96, 256]` y `deviceSizes: [640, 1080]` en `next.config.ts`: 5 anchos por foto en vez de 16
(verificado: el srcset de una miniatura sale `48,96,256,640,1080`). Se rompe si alguien dibuja una foto a un ancho que ningún valor cubre bien (se sirve la
versión mayor más cercana: más pesada, nunca más borrosa) o si la precarga de una pantalla usa otro `sizes` que la pantalla.
