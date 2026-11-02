# Vitrinas Shopify para la tienda web de CAYLA (2026-10-31)

**Para qué:** Felipe pidió mirar tiendas de moda reconocidas en Shopify como inspiración para rediseñar `apps/tienda` (tienda.cayla.pe, hoy
«G · Pasarela», ADR-0524). Se capturaron diez en vivo (portada, catálogo y ficha; 1440 y 390 px; 93 capturas) y se compararon con la tienda
de producción. El informe completo con las capturas es un Artifact privado de Felipe: «Vitrinas Shopify para CAYLA»
(`https://claude.ai/artifact/X6NL7PxdRyun8JMgqEcB59`). Las capturas **no** van al repo: son de sitios de terceros y sirven para decidir, no para
publicar ni copiar.

**Lo que siguió:** de las tres rutas del informe, Felipe eligió la B (editorial cálido) y después siguió afinando en maquetas: ver
`docs/maquetas/tienda-sofisticada-2026-10/README.md` (estado y decisiones) y `docs/maquetas/tienda-editorial-2026-10/`.

## Veredicto

La diferencia entre CAYLA y estas tiendas no está en la paleta ni en las letras, sino en la **foto** y en la **ficha**: todas venden con la
prenda puesta en una persona y con fotos de campaña (CAYLA solo muestra recortes), y sus fichas responden lo que frena una compra: qué talla
me queda, con qué lo combino y si la puedo ver en una tienda.

## Lo que más mueve la aguja, en orden

1. **Fotos con la prenda puesta, además del recorte** (Kotn, Rouje, Christy Dawn, Johanna Ortiz): una foto en modelo por prenda y la ficha
   que alterna recorte y persona; Kotn agrega la altura y la talla de la modelo. Es fotografía, no código. Decide Felipe.
2. **Ficha al estilo Rouje:** «Disponibilidad en tienda» como segundo botón, guía de tallas en la línea de la talla y una barra de calce.
   CAYLA ya tiene lo difícil (stock por tienda); faltan medidas reales por categoría, que no se inventan.
3. **«Combínalo con» en cada ficha**, sacado de los looks que ya arma el ERP (ADR-0468). Sube el ticket sin datos nuevos.
4. **Catálogo con prendas desde el primer pantallazo** (Kotn): título bajo, categorías en una línea que se desliza, una foto editorial
   cada 12 prendas (Rouje). En la tienda de hoy la primera prenda aparece a 586 px; en Kotn, a 268.
5. **Portada que abre con campaña** (Skims, Kith, Johanna Ortiz, Dôen): foto a sangre, una frase, uno o dos botones.
6. **Entrar por categoría con fotos grandes** (Kotn, Skims, Dôen). Revertiría parte de ADR-0455.
7. **Contar el origen con cifras reales** (Christy Dawn, Kotn). Las cifras del taller de Lima las da Felipe.

## Las diez tiendas

| Tienda | Lo que se lleva CAYLA |
|---|---|
| Rouje | «Disponible en boutique», calce, guía de tallas, foto editorial dentro de la grilla |
| Kotn | Catálogo compacto, «Styled with», altura de la modelo, cifras de origen |
| Dôen | Collage «Explore» de fotos enmarcadas, pestañas de detalle, sección de tiendas |
| Christy Dawn | «Style it with», tallas agotadas tachadas, cifras del origen |
| Johanna Ortiz | Sobriedad, política de cambios dentro de la ficha, la fachada de la tienda física |
| Polène | Recorte y campaña conviviendo: el recorte sobre blanco funciona si la campaña pone la emoción |
| Kith | Comprar el look entero desde la portada |
| Skims | Categorías con foto, buscador visible en el celular (no expone Shopify; se incluyó como referencia) |
| Faithfull | «Styling notes» con fotos tipo celular, baratas y cercanas |
| Cuyana | Se capturó; aporta poco que no tengan las demás |

Djerf Avenue se descartó: solo mostró su selector de país.

## Lo que no hay que copiar

Avisos que tapan la tienda al entrar (país, cookies, boletín), pago en cuotas (CAYLA no cobra en línea: se separa y se paga en tienda),
burbujas de chat encima de las fotos, y el escudo de la ciudad como selector de sede (mejor la palabra: «LIMA ▾»).

## Las tres rutas que propuso el informe

- **A · Pasarela completa** (la recomendada entonces): mantener la Pasarela y sumarle ficha, «Combínalo con», catálogo compacto y el taller.
- **B · Editorial cálido** (Dôen, Christy Dawn, Johanna Ortiz): papel cálido, collage de campaña, el taller al frente. **La que eligió Felipe.**
- **C · Catálogo limpio** (Kotn, Skims): letra sin serifa, grilla densa.

## Cómo se hizo

Navegador sin cabeza desde Perú, sin cuenta y rechazando cookies cuando se pudo. Shopify se confirmó leyendo la página en Polène, Rouje,
Dôen, Kotn, Christy Dawn, Kith, Johanna Ortiz, Cuyana y Faithfull.
