# ADR-0615: la tienda pasa a la identidad rosa y borgoña, oculta hasta que Felipe la active

**Fecha:** 2026-11-05. **Estado:** en construcción, oculta para los clientes. Reemplazará a «G · Pasarela» (ADR-0524) y a la portada de tres paneles (ADR-0613) al activarse.

## Contexto
Felipe llevó el rediseño de la tienda de una referencia propia a una maqueta navegable (`docs/maquetas/tienda-rediseno-2026-11/`) y pidió implementarla, cambiando «look» por «outfit». La tienda no tiene vistas previas (`scripts/ci/vercel-ignorar-tienda.mjs`), así que solo se ve de verdad en producción.

## Decisión
1. **Se construye detrás de un interruptor del navegador.** `?diseno=nuevo` lo enciende y lo recuerda; `?diseno=actual` vuelve. Lo decide un script en el `<head>` (`lib/diseno.ts`), como el tema. Descarté una cookie: leerla en el servidor volvería dinámicas las páginas en caché. Descarté una rama larga: el repo recibe varias fusiones por hora y chocaría siempre.
2. **Un solo archivo de estilos, `app/estilos/diseno-nuevo.css`, sin CSS por página** (regla de Felipe). Cambia los tokens y las piezas compartidas; lo demás hereda. Todo está bajo `:root[data-diseno="nuevo"]`. Al activar, sus tokens pasan a `globals.css`.
3. **Las piezas nuevas del Inicio están en la página, escondidas con `display: none`.** Sus fotos son perezosas y dentro de un `display: none` no se piden: se midió que un cliente no baja ninguna. La escena no rota si el interruptor está apagado.
4. **La letra de títulos pasa a Playfair Display** (Felipe la vio en la maqueta frente a DM Serif, ADR-0612, y pidió implementarla). Sin precarga, para que quien no la use no la baje.
5. **Solo se promete lo que la tienda hace:** «Separa sin pagar», «Recoge en tu tienda», los plazos de `retail.tienda_ayuda()` y «Asesoría por WhatsApp». Los «Envíos a todo el Perú» y «Pagos 100% seguros» de la referencia no se usan, porque la tienda no los ofrece.
6. **El escenario es dibujo propio** (`docs/maquetas/tienda-rediseno-2026-11/recursos/generar.cjs`), sin imágenes de terceros. Las prendas son las fotos del catálogo; `lib/escena-portada.ts` equilibra su tamaño sin deformarlas. Las fotos de las modelos son las que dio Felipe, sin retoques.
7. **«Outfit» es solo el texto que lee el cliente.** Rutas (`/looks`), tablas y nombres del código no cambian, para no romper enlaces ni la medición.

## Qué se rompería sin esto
Sin el interruptor, cada PR de esta etapa cambiaría la tienda a medias frente a los clientes. Sin un archivo único, cada página volvería a tener su propia versión de los mismos botones y títulos.

## Pendiente
Ver `docs/backlog/2026-11-05-tienda-rediseno-maqueta.md`.
