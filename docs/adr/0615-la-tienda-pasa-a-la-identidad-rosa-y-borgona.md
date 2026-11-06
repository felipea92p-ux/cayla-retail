# ADR-0615: la tienda pasa a la identidad rosa y borgoña

**Fecha:** 2026-11-05. **Estado:** activa para todos los clientes al fusionarse. Reemplaza a «G · Pasarela» (ADR-0524), a la letra DM Serif (ADR-0612) y a la portada de tres paneles (ADR-0613).

## Contexto
Felipe llevó el rediseño de la tienda de una referencia propia a una maqueta navegable (`docs/maquetas/tienda-rediseno-2026-11/`) y pidió implementarla, cambiando «look» por «outfit». Se empezó detrás de un interruptor (`?diseno=nuevo`), y Felipe pidió no publicarlo oculto: se activa para todos de una vez.

## Decisión
1. **Se activa para todos, sin interruptor.** `<html data-diseno="nuevo">` en `app/layout.tsx`. La alternativa era revisarlo oculto en `cayla.pe` antes de activarlo; Felipe la descartó a sabiendas de lo que quedó sin probar con sesión real (ver «Pendiente»).
2. **Un solo archivo de estilos, `app/estilos/diseno-nuevo.css`, sin CSS por página** (regla de Felipe). Cambia los tokens y las piezas compartidas; lo demás hereda.
3. **La letra de títulos pasa a Playfair Display**, que Felipe vio en la maqueta frente a DM Serif.
4. **Solo se promete lo que la tienda hace:** «Separa sin pagar», «Recoge en tu tienda», los plazos de `retail.tienda_ayuda()` y «Asesoría por WhatsApp». Los «Envíos a todo el Perú» y «Pagos 100% seguros» de la referencia no se usan, porque la tienda no los ofrece.
5. **El escenario es dibujo propio** (`docs/maquetas/tienda-rediseno-2026-11/recursos/generar.cjs`), sin imágenes de terceros. Las prendas son las fotos del catálogo; `lib/escena-portada.ts` equilibra su tamaño sin deformarlas. Las fotos de las modelos son las que dio Felipe, sin retoques.
6. **Con una campaña vigente manda la portada de la campaña;** sin tres prendas para la escena, el héroe de antes.
7. **En oscuro, lo que se escribe en vino pasa a un tono claro** (`--dn-acento`, `--dn-titulo`), porque el vino sobre oscuro no se lee, y las tarjetas de categoría usan la placa rosada de las prendas de «Lo nuevo», porque sobre oscuro se perdían las prendas negras (Felipe la prefirió al blanco).
8. **«Outfit» es solo el texto que lee el cliente.** Rutas (`/looks`), tablas y nombres del código no cambian, para no romper enlaces ni la medición.

## Actualización 2026-11-05: un solo sistema (auditoría de Felipe)
Un censo en 13 rutas y 2 anchos encontró 16 formas de botón, 35 combinaciones de ícono y 14 tamaños de título principal. Se decide, todo en `diseno-nuevo.css`:
- **Color:** el rojo institucional `#d13730` (del archivo oficial, `packages/shared/src/marca.ts`) es solo del logo, sin filtros. El borgoña es la acción y lo destacado. Marfil y arena, las superficies. Marrón, el texto. Rosa empolvado, los acentos. `--rojo` queda para errores.
- **El pie pasa a marfil:** sobre borgoña, el rojo del logo no se lee.
- **Botones:** principal, secundario y terciario, con variables para aclararlos sobre una superficie oscura, sin crear otro botón.
- **Botón de ícono:** 44 px, redondo y sin fondo; el fondo suave solo al pasar el mouse o presionar. Bajo 375 px miden 38 de ancho, para que quepan todos.
- **Esquinas, alturas, letra y márgenes:** una escala. Píldora lo que se elige, 8 px lo chico, 14 px lo que agrupa, 20 px las hojas.

## Qué se rompería sin esto
Sin un archivo único, cada página volvería a tener su propia versión de los mismos botones y títulos.

## Pendiente
Ver `docs/backlog/2026-11-05-tienda-rediseno-maqueta.md`.
