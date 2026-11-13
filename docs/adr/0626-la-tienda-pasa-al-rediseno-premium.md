# ADR-0626: La tienda pasa al rediseño Premium, sobre su identidad y sin cambiar sus reglas

**Fecha:** 2026-11-07. **Decide:** Felipe («implementa el diseño completo de la maqueta en producción», con la lista de actividades
aprobada). **Contexto:** la maqueta navegable `docs/maquetas/tienda-premium-2026-11/` (PR #1695) y su auditoría, sobre la identidad de
ADR-0615.

## El problema

La maqueta Premium propuso, pantalla por pantalla, qué cambiar en cayla.pe. Llevarla tal cual a `apps/tienda` chocaba en varios
puntos con reglas que ya estaban decididas: cada tienda muestra solo lo suyo (ADR-0458), las listas no llevan migas (Felipe 2026-10-15),
el catálogo pagina de 30 en 30 (Felipe 2026-10-19) y la tienda y el ERP no comparten estilos (ADR-0616). Además, varias propuestas ya
existían en la tienda con otra forma (la talla obligatoria que avisa, la barra de compra fija en el celular, las fichas de filtros que se
quitan, la hoja de filtros con «Ver N prendas»).

## Decisión

1. **Se lleva lo visual y lo que ordena, no lo que cambia reglas.** Lo aplicado, en commits por actividad de `claude/tienda-premium-implementacion`:
   - Base: botón secundario con borde de tinta, borde de control de 3,7:1 (`--dn-borde-control`), error global con la identidad.
   - Cabecera y pie: un texto de búsqueda («Busca blusas, jeans…»), la tienda elegida a la vista, el pie en cuatro columnas,
     «Recomendaciones» deja de flotar y pasa al pie («Envíanos una sugerencia»).
   - Tarjeta: una sola insignia automática (descuento > puesto > nuevo); en «Lo nuevo», sin «Nuevo» repetido; la disponibilidad con un punto.
   - Inicio: Club en un bloque vino (`--dn-vino`, el mismo `--rojo-profundo`) con los cuatro beneficios de sus Términos y su enlace
     «Cómo funciona», bajadas en las secciones, «Así se separa» al final. **Sin «Outfits listos» ni «Las ofertas»** (Felipe, 2026-11-07:
     demasiada información para la primera pantalla): las dos siguen en el menú y en el pie. Con ellas se fueron `OfertasPorCampana`,
     `OutfitUnico` y sus estilos, que solo usaba el Inicio.
   - Catálogo: grupos, categorías, Color y Talla como fichas de 40 px; el puesto de «Más vendidos» solo en los tres primeros; el vacío con «Ver lo nuevo».
   - Ficha: la leyenda de la foto ya no tapa los puntos de la galería.
   - Búsqueda: cada resultado dice cuánto hay (la nota de su tarjeta), sin escribir ofrece lo recién llegado y el conteo dice «8 de 29».
   - Un nombre por destino: «Outfits listos» (lo armado por CAYLA, /looks) y «Arma tu outfit» (la herramienta, /looks/arma).
   - Bolsa: «Pagas hoy S/ 0.00» y los pasos con los plazos de Configuración ▸ Tienda web (`pasosDelPedido`).
   - Entrar y recuperar: una sola tarjeta de dos columnas con el Club en vino; el beneficio que no era de la cuenta («Mira cuánto hay») sale.
   - Páginas nuevas: `/club` (las reglas de los puntos con las cifras de la caja, `reglasDelClub`) y `/preguntas-frecuentes`
     (`preguntasFrecuentes`). Las dos entran a `RUTAS_MEDIDAS`.
2. **Toda cifra sale de la base.** Plazos, reglas del Club y disponibilidad se leen de lo que ya usa la caja; sin base, se dicen sin número.
   Nada de lo que la tienda no decidió (medios de pago, envíos) aparece.
3. **Lo que la maqueta proponía y no se hizo, a propósito:**
   - Las tres tiendas en la ficha: ADR-0458 (cada tienda muestra solo lo suyo, con la pista «Hay en …»).
   - Migas en las listas: Felipe 2026-10-15.
   - Columna de filtros y «Ver 24 más» en el catálogo: Felipe eligió pulir los filtros actuales (2026-11-07); lo otro cambia direcciones
     que ya se comparten y queda en el backlog.
   - Una página por tienda: la tarjeta de `/tiendas` ya tiene todo lo que la página tendría.
   - Lo marcado «Decide Felipe» en la maqueta (cambiar de tienda sin vaciar la bolsa, guía de tallas, fotos de tiendas, textos que se
     contradicen): no se tocó.

## Descarté

- **Copiar `premium/sistema.css` a la tienda:** sería una segunda identidad al lado de `diseno-nuevo.css`. Los cambios van como tokens y
  reglas sobre la que ya existe (ADR-0615), que es lo que la maqueta reusaba.
- **Rehacer el probador para que solo se toque:** ya se elige tocando a la derecha; se cambió el texto de ayuda para decirlo primero.

## Cómo se verificó

Cada actividad, en local con 375 prendas reales de cayla.pe sembradas en la base local (las previas de Vercel no construyen la tienda), a
1440 y a 390 px: sin desborde horizontal. Las 1064 pruebas de la tienda, tipos, lint y Knip en verde.
