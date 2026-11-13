# ADR-0655 — Campañas y ofertas sale de Insignias: fila propia y tres preguntas por campaña

**Fecha:** 2026-11-13 · **Estado:** aceptado por Felipe (maqueta `docs/maquetas/campanas-y-ofertas-2026-11/`, «lo hacemos en una fila propia»
y la lista de actividades aprobada el mismo día). **Modifica ADR-0481** (las campañas como primera vista de Insignias). Esta es la actividad 1
de 9: solo la web, sin migración.

## Contexto

Desde el 2026-10-22 (ADR-0481) las campañas eran la primera pestaña de Catálogo ▸ Insignias. Entonces una campaña era nombre, fechas,
prendas y un porcentaje, y se parecía a una insignia. Desde ADR-0496 una campaña tiene **ofertas**, y lo que viene (3x2, descuento por
monto) las hace todavía más distintas. Felipe, el 2026-11-13: «con el término "insignias" no sabía que se podían aplicar promociones o
descuentos desde ese módulo», y la pantalla era «confusa, poco intuitiva»: cada campaña tenía cuatro botones (Editar, Prendas, Configurar,
Desactivar) y no se sabía cuál tocaba primero.

El orden que eligió Felipe mirando la maqueta:

| Palabra | Responde | Cambia el precio | Dónde vive |
|---|---|---|---|
| Insignia | ¿Qué es esta prenda? (Nuevo, Hecho a mano) | Nunca (desde la actividad 5) | Catálogo ▸ Insignias |
| Campaña | ¿Qué fecha celebramos? (Black Friday, Navidad) | Solo con sus ofertas | Catálogo ▸ Campañas y ofertas |
| Oferta | ¿Qué paga de menos el cliente? (−20 %, 3x2, S/ 30 desde S/ 300) | Sí | Dentro de cada campaña |

## Decisión

1. **Fila propia «Campañas y ofertas»** en Catálogo, antes de Insignias, con el calendario con corazón del módulo `campanas`. La abre el
   módulo Campañas o el de Insignias (`modulosAlternos: ["etiquetas"]`): los mismos dos que abrían las campañas dentro de Insignias, así que
   **nadie gana ni pierde acceso**. Insignias queda con Rotación, Artesanal y General y solo la abre su módulo. Ruta `/productos/campanas`.
   `/productos/insignias?vista=campanas`, y quien entra a Insignias solo con Campañas, van a `/productos/campanas`.
2. **Una sola pieza, dos modos.** `SellosPantalla` recibe `modo="campanas" | "insignias"`: la billetera de pases es la misma (ADR-0481), con
   su título, su frase y sus vistas.
3. **Tres preguntas por campaña** (`preguntasDeCampana`, `lib/sellos-pases.ts`, con su prueba): **Qué le das**, **En qué prendas** y
   **Cuándo y dónde**. Reemplazan a «Lo que ya tiene» en el pase abierto. Cada una dice si está respondida, la que sigue lleva el hilo de la
   guía de foco (ADR-0284, sin rojo), y tocarla abre la hoja que ya la responde: las ofertas (ADR-0496), las prendas o las fechas. Una oferta
   en borrador no cuenta como respondida: todavía no baja nada. «Cuándo y dónde» siempre está respondida (sin fechas rige siempre, sin
   tiendas en todas).
4. **Un botón y «Más».** El pase de una campaña lleva «Preparar la campaña» (abre lo primero que falta; con todo listo, «Ver sus ofertas»)
   y `<MenuAcciones texto="Más">` con cambiar nombre, ícono o fechas (o «Repetir el próximo año»), marcar prendas sueltas, imprimir sus
   etiquetas de precio, ver su diseño en la web y desactivar. Las insignias conservan sus botones de siempre.
5. **El mapa.** El «?» de la cabecera de las dos filas abre «¿Insignia, campaña u oferta?» (`MapaCampanas`): las tres palabras con su
   pregunta, ejemplos y dónde viven, y una lista de «¿qué quieres hacer?». Marca «Estás aquí».

## Lo que NO hace (las actividades que siguen)

La hoja nueva de la campaña en tres pasos (2), prenda por prenda dentro de una oferta (3), «una prenda, una oferta por tienda y por día»
(4), campañas sin fecha de fin y el paso de «Para liquidar» y «Sorteo» a campañas (5), el 3x2 y el monto en la caja y la web (6–8). Hasta la
actividad 5, Insignias todavía puede tener una insignia con descuento.

## Actividad 2 (2026-11-13): la hoja de la oferta en el orden de la maqueta

`OfertasHoja` («Tres preguntas», ADR-0496) pasa de *Qué le das → Cuándo y dónde → Prendas (con el repaso al pie)* a **Qué le das → En qué
prendas → Cuándo y dónde → Revisa y activa**: qué prendas preguntar depende de la oferta (con el 3x2 será «¿con qué prendas se arma el
grupo?»), y el repaso —la frase, los avisos, el nombre y los botones de guardar o activar— es un paso propio. La guía de foco (`faltan`) y
la guía interactiva siguen ese orden. No cambia qué se guarda ni cómo cobra la caja. El ticket de varias prendas de la maqueta («Así cobra
la caja») llega con el 3x2 (actividad 6): para una rebaja, la etiqueta viva ya muestra el cobro de prendas reales.

## Actividad 3 (2026-11-13): prenda por prenda dentro de una oferta

Felipe: «Me pide por categoría, pero si quiero seleccionar las prendas, ¿cómo hago?». En «¿En qué prendas?» la hoja suma un segmento
**Por categoría | Prenda por prenda**: un buscador (sin tildes) y la lista de modelos del catálogo a la venta, cada uno con todas sus tallas y
colores (Felipe mide por modelo). Lo que entra por una categoría marcada lo dice («Entra por Polos») y no se marca dos veces.

En la base (`20261113210000_oferta_prenda_por_prenda.sql`, **sin pegar en producción**): la tabla `campana_regla_productos`; `fn_campanas_en_sede`
suma, por reemplazo anclado, que una oferta con categorías «solo» **o** modelos elegidos alcanza a esas categorías y esos modelos (sin ninguno
de los dos, a su campaña, como siempre); `campana_reglas()` devuelve `productos_solo`; y `guardar_oferta` envuelve a `guardar_campana_regla` y
deja los modelos en la misma transacción (el historial, que solo se agrega, suma una fila con los modelos de antes). La web llama a
`guardar_oferta` solo si la oferta trae o traía modelos: sin ellos sigue usando la función de siempre, así que publicar la web antes que la
migración no rompe nada salvo elegir prendas sueltas. Al elegir el primer modelo sin haber tocado las categorías, la hoja fija las categorías
que se veían: la oferta deja de ser «toda la campaña» y lo dice («rige solo en lo que marques»), porque la base no suma «toda la campaña» con
modelos sueltos. Prueba: `pnpm pruebas:campana-reglas` (83 de 83, con escenarios «Prenda por prenda»).

## Alternativas descartadas

- **Dentro de Insignias, renombrado «Insignias y ofertas».** No mueve nada, pero sigue mezclando dos preguntas en una pantalla y el nombre
  sigue sin decir «descuentos». Felipe lo comparó en la maqueta y eligió la fila propia.
- **Otra pantalla para las campañas.** Duplicaría la billetera; con un modo, la pieza decidida (ADR-0481) sigue siendo una.
- **Dar a Campañas solo su módulo (sin `etiquetas`).** Quien hoy ve las campañas por tener Insignias las habría perdido.

## Cómo se verifica

- `vitest`: `lib/sellos-pases.test.ts` (las tres preguntas), `lib/menu.test.ts` (la fila y su foto, `menu-hoy.golden.json`, cambiada a
  propósito), `lib/modulos.test.ts` (Campañas solo → Campañas y ofertas; Insignias solo → las dos filas), `lib/guias.test.ts` (guía
  `productos.campanas` nueva; `productos.sellos` sin los pasos de las campañas) y `lib/guia-de-foco.test.ts`.
- En el navegador, con datos inventados: escritorio 1440, oscuro y 375 px; `/milimetro auditar`: 0 textos bajo 4.5:1, foco visible en los
  8 controles, 0 blancos bajo 24 px (y bajo 44 con el dedo). La guía no se recorrió con `guias:recorrer`: necesita sesión y base local.

## Se rompe si

- Un enlace guardado apunta a `/productos/insignias` esperando las campañas: llega a Rotación. El de `?vista=campanas` sí redirige.
- Alguien agrega una séptima fila a Catálogo: el tope de hijas es 6 (`menu.test.ts`).
