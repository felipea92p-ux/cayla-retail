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
