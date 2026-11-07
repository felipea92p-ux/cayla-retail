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

## Actualización 2026-11-05: la franja de arriba es manual
Un mensaje a la vez con flechas, sin rotación automática: Felipe pidió priorizar lo manual si es más accesible y estable, y los mismos beneficios ya se ven bajo la portada. El plazo de cambio sale de `retail.tienda_ayuda()`. Los modos de campaña «quieta» y «marquesina» siguen como los programe el líder.

## Actualización 2026-11-06: los mensajes de la franja pasan solos
Felipe, al verla publicada: quieta no se nota y nadie va a tocar las flechas. Se quitan las flechas y cada mensaje se queda 4,5 s. Se detiene con el mouse encima o con el foco en su enlace, y con «reducir movimiento» se queda el primero. Reemplaza a la actualización del 2026-11-05.

## Qué se rompería sin esto
Sin un archivo único, cada página volvería a tener su propia versión de los mismos botones y títulos.

## Pendiente
Ver `docs/backlog/2026-11-05-tienda-rediseno-maqueta.md`.

## Actualización 2026-11-06: el rojo de CAYLA reemplaza al vino
Felipe preguntó por qué la tienda no usaba el color de identidad. El vino venía de su imagen de referencia, y la regla de «el rojo solo en el logo» la había puesto la auditoría, sin comparar los dos colores. Se comparó en una maqueta sobre capturas de `cayla.pe`, en seis pantallas ([Rojo CAYLA en la tienda](https://claude.ai/artifact/VJ9KRam2LpTQai2CJJu9ud), privada), y Felipe eligió el rojo mirándola. Reemplaza a la línea «Color» de la actualización del 2026-11-05:
- **Rojo del logo `#d13730`** (`--dn-rojo`, `--t-oscuro`): botones principales, franja de arriba y puntos de la portada. Con letra blanca da 4,88; con la crema daba 4,45, por eso la franja pasa a blanco.
- **Rojo hondo `#ad2a24`** (`--dn-rojo-hondo`, `--t-hero`): bloques grandes (Club, «Arma tu outfit», fondo de Entrar) y el botón al pasar el mouse, porque el rojo pleno cansa en mucha superficie.
- **Rojo de letra `#a8281f`** (`--dn-acento`, `--t-oferta`): letra chica y ofertas. El del logo sobre rosa da 3,94 y sobre el escenario 3,68; este, de 5,11 en adelante. En oscuro esa letra sigue en su tono claro.
- **Títulos en marrón** (`--dn-titulo`). **Las sombras pasan a marrón** (`--dn-sombra-tono`): teñidas de rojo se veían como un resplandor que manchaba lo de abajo.
- **El fondo de la modelo** en «Arma tu outfit» es un halo claro que se apaga en el mismo rojo del bloque, antes de llegar al texto. Sube de 34 % a 50 % de arena porque sobre el rojo el 34 % casi no se notaba, y así desaparece la línea recta que había entre la foto y el texto.

**Lo que se paga:** los errores (`--rojo`) quedan en el mismo tono que las ofertas, así que se distinguen por su ícono y su frase, no por el color. **Lo vigila** `apps/tienda/lib/css-de-la-tienda.test.ts`: no queda vino en ningún CSS, las acciones usan exactamente el rojo del logo y todo lo que se lee llega a 4,5. Los nombres del archivo y del ADR siguen con «borgoña» porque son historia.
