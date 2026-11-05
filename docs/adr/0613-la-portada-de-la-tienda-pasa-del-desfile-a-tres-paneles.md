# ADR-0613 — La portada de la tienda pasa del desfile a tres paneles («L»)

- **Fecha:** 2026-11-05 · **Estado:** aceptada; construida y sin activar, hasta que Felipe la pruebe en su teléfono
- **Decidió:** Felipe
- **Relacionados:** ADR-0524 (el desfile como portada), ADR-0612 (letra y nota de existencias), ADR-0495 (Tráfico), `docs/maquetas/tienda-inicio-2026-11/`

## El problema

El desfile llama la atención, pero no invita a quedarse: tapa su propio título, tiene momentos vacíos y la primera grilla de prendas sale a 3,8 pantallas. Felipe pidió que la primera pantalla fuera lo más visual posible y que se viera muy bien en el celular, porque la mayoría entrará por ahí. Eligió la propuesta «L» mirando la maqueta (`docs/maquetas/tienda-inicio-2026-11/`, ronda 6).

## Lo que se decidió

**1. En la computadora, tres paneles; en el celular, una prenda por pantalla.** Tres prendas que combinan, cada una sobre su color, con «Lo nuevo» cruzando los paneles. Los grupos cambian cada 6 segundos, y se detienen con el mouse encima, con el foco o con la pausa. En el celular no cambian solos: se deslizan con el dedo, porque una prenda que cambia justo al tocarla lleva a otra (Baymard). Son las dos caras de `components/PortadaTresPaneles.tsx`.

**2. Los grupos los elige una persona, y lo que manda es lo que hay.** Un grupo armado por una regla no se ve como un outfit, así que están en `GRUPOS_DE_PORTADA` (`lib/portada-l.ts`), por el código de cada prenda y con su color. Un grupo solo sale si sus tres prendas siguen siendo nuevas (`fn_tienda_lo_nuevo`: hasta 30 días desde su primera llegada a una tienda, salvo fijadas en la Vitrina) y se pueden recoger en una misma tienda: la elegida o, con «Todas», alguna. Por eso los grupos vencen: hay que renovarlos cada pocas semanas. El 2026-11-05, un día después de armar la maqueta, una prenda del grupo 3 ya no tenía stock en ninguna tienda: por eso esto no es opcional.

**3. Sin grupos completos, tres prendas sueltas.** Hoy Lima tiene 9 prendas nuevas de arriba y ninguna de abajo ni para encima. Ahí salen tres prendas nuevas, de tipos distintos si se puede, sin decir que combinan y sin total. Con menos de tres, sigue la portada de siempre.

**4. El recorte se calcula una vez y se guarda.** `GET /api/recorte/<foto>?w=` quita el fondo blanco, deja su gris como sombra y entrega un WebP: un original de 2,5 MB queda en unos 110 KB, y Vercel lo guarda un año. Solo acepta nombres de fotos del almacén. Una prenda blanca se confunde con su fondo: no se recorta y se muestra la foto tal cual, y las prendas sueltas no la eligen.

**5. Una campaña vigente va primero.** Como hasta ahora: la portada es la de la campaña, y el desfile sigue como su sección. Al terminar la campaña vuelve L.

**6. Debajo, ropa antes que texto.** Cuando sale L, la lista de texto «El programa» cede su lugar a las categorías con una prenda real (`categoriasConFoto`, la más vendida de cada una en la tienda elegida) y a las prendas de la portada otra vez, para quien no llegó a verlas.

**7. Se publica escondida.** La tienda no tiene vistas previas en Vercel (`scripts/ci/vercel-ignorar-tienda.mjs`: sus variables solo existen en Producción). Por eso L se publica detrás de `/inicio?portada=l`: Felipe la prueba en su teléfono con las prendas de verdad y nadie más la ve. Activarla es otro PR, que también cambia el esqueleto de carga (`HeroeDelInicio` en `app/(catalogo)/loading.tsx`, hoy el del desfile).

## Lo que queda para después

- **Elegir los grupos desde el ERP:** una pantalla para el líder, con su migración. Mientras tanto, cambiar un grupo es un cambio en `lib/portada-l.ts`.
- **El armador no se abre con el grupo:** «Arma tu outfit» lleva a `/looks/arma`, que no recibe prendas elegidas y todavía dice «look».
- **El peso del color:** los fondos salen de cada prenda y no siguen el tema oscuro, como la foto.

## Con qué se va a comparar

Tienda web ▸ Tráfico, solo visitas desde Perú (`left(region, 2) = 'PE'`), porque desde el paso a cayla.pe la mayoría de lo que viene de fuera parece robots. Del 31 de octubre, 16:36 (corte a cayla.pe), al 5 de noviembre, 15:12, hora de Lima:

| Personas | Abrieron una prenda | Eligieron talla | A la bolsa | Separaron |
|---|---|---|---|---|
| 128 | 30 (23,4 %) | 3 | 1 | 1 |

**Es poca muestra:** sirve de referencia, no para declarar un ganador con pocos días. Se repite la misma consulta con la portada nueva, y se compara sobre todo «abrieron una prenda»: lo que pase con separar necesitará bastante más tiempo.
