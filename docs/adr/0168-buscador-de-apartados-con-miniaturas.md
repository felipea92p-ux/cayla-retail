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
