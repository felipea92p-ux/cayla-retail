# ADR-0613 — La portada de la tienda pasa del desfile a tres paneles («L»)

- **Fecha:** 2026-11-05 · **Estado:** aceptada; construida y sin activar, hasta que Felipe la pruebe en su teléfono
- **Decidió:** Felipe
- **Relacionados:** ADR-0524 (el desfile como portada), ADR-0612 (letra y nota de existencias), ADR-0495 (Tráfico), `docs/maquetas/tienda-inicio-2026-11/`

## El problema

El desfile llama la atención, pero no invita a quedarse: tapa su propio título, tiene momentos vacíos y la primera grilla de prendas sale a 3,8 pantallas. Felipe pidió que la primera pantalla fuera lo más visual posible y que se viera muy bien en el celular, porque la mayoría entrará por ahí. Eligió la propuesta «L» mirando la maqueta (`docs/maquetas/tienda-inicio-2026-11/`, ronda 6).

## Lo que se decidió

**1. En la computadora, tres paneles; en el celular, una prenda por pantalla.** Tres prendas, cada una sobre un color, con «Lo nuevo» cruzando los paneles. Los grupos cambian cada 6 segundos, y se detienen con el mouse encima, con el foco o con la pausa. En el celular no cambian solos: se deslizan con el dedo, porque una prenda que cambia justo al tocarla lleva a otra (Baymard). Son las dos caras de `components/PortadaTresPaneles.tsx`.

**2. Las prendas salen solas, con una regla de Felipe:** «las 3 últimas ingresadas de 3 categorías, que tengan foto». Son las tres categorías con lo más reciente de la tienda elegida. Sale la última de cada una, después la penúltima y la antepenúltima: tres grupos de tres (`gruposDeLaPortada`, `lib/portada-l.ts`). Si una categoría se queda sin prendas, entra la siguiente, sin repetir ninguna. La «última» es la de `fn_tienda_lo_nuevo`: hasta 30 días desde su primera llegada a una tienda, salvo fijadas o quitadas a mano en la Vitrina.

**Por qué no grupos elegidos a mano.** Primero se armaron 6 outfits a mano. Felipe preguntó en qué se basaban, y la respuesta fue el criterio de quien los armó. Además, vencían: de 6, solo uno habría durado más de una semana. Y en los últimos 90 días, de 1893 tickets, las combinaciones más frecuentes son del mismo tipo (Polos + Polos: 84; Camisas y Blusas: 47; Tops: 40), no arriba, abajo y encima. La regla no dice que las prendas combinan ni suma un total: dice «Lo último que llegó».

**3. Los fondos son pastel y se eligen para que la prenda se distinga** (Felipe, al ver los primeros tonos fuertes: «colores pastel, no muy fuertes»). Son 10 tonos con el texto oscuro, que pasa de 9:1 sobre todos: 5 suaves, y 5 medios que solo entran si la prenda es tan clara que en uno suave se perdería. Por cada prenda se elige uno a una distancia de color suficiente (`fondosDelGrupo`, CIE76 ≥ 22; con 28 las prendas muy claras no tenían ningún tono posible), sin repetir dentro del grupo y atendiendo primero a la prenda con menos opciones. El color registrado de una prenda no siempre es el de su foto, así que al cargar el recorte se mide en la foto misma y se ajusta.

**4. El recorte se calcula una vez y se guarda.** `GET /api/recorte/<foto>?w=` quita el fondo blanco, deja su gris como sombra y entrega un WebP: un original de 2,5 MB queda en unos 110 KB, y Vercel lo guarda un año. Solo acepta nombres de fotos del almacén. Una prenda blanca o muy clara se confunde con su fondo, así que la regla no la elige; si un recorte falla, se muestra la foto tal cual.

**5. Una campaña vigente va primero.** Como hasta ahora: la portada es la de la campaña, y el desfile sigue como su sección. Al terminar la campaña vuelve L.

**6. Debajo, ropa antes que texto.** Cuando sale L, la lista de texto «El programa» cede su lugar a las categorías con una prenda real (`categoriasConFoto`, la más vendida de cada una en la tienda elegida) y a las prendas de la portada otra vez, para quien no llegó a verlas.

**7. Se publica escondida.** La tienda no tiene vistas previas en Vercel (`scripts/ci/vercel-ignorar-tienda.mjs`: sus variables solo existen en Producción). Por eso L se publica detrás de `/inicio?portada=l`: Felipe la prueba en su teléfono con las prendas de verdad y nadie más la ve. Activarla es otro PR, que también cambia el esqueleto de carga (`HeroeDelInicio` en `app/(catalogo)/loading.tsx`, hoy el del desfile).

## Lo que queda para después

- **Quitar una prenda de la portada a mano:** hoy se hace quitándola de Lo nuevo en la Vitrina. Con el uso se verá si hace falta otra cosa.
- **Categorías que no deberían salir:** una categoría como Lencería puede salir si recibe algo; hoy no hay manera de excluirla, salvo el interruptor de la familia.
- **El armador no se abre con el grupo:** «Arma tu outfit» lleva a `/looks/arma`, que no recibe prendas elegidas y todavía dice «look».
- **El peso del color:** los fondos salen de cada prenda y no siguen el tema oscuro, como la foto.

## Con qué se va a comparar

Tienda web ▸ Tráfico, solo visitas desde Perú (`left(region, 2) = 'PE'`), porque desde el paso a cayla.pe la mayoría de lo que viene de fuera parece robots. Del 31 de octubre, 16:36 (corte a cayla.pe), al 5 de noviembre, 15:12, hora de Lima:

| Personas | Abrieron una prenda | Eligieron talla | A la bolsa | Separaron |
|---|---|---|---|---|
| 128 | 30 (23,4 %) | 3 | 1 | 1 |

**Es poca muestra:** sirve de referencia, no para declarar un ganador con pocos días. Se repite la misma consulta con la portada nueva, y se compara sobre todo «abrieron una prenda»: lo que pase con separar necesitará bastante más tiempo.

## Actualización 2026-11-10 — el recorte no se mete por las rayas blancas de la tela

**Qué pasó.** Felipe vio en la portada el short de rayas rosa y blanco (foto `196f836a…`) con las rayas blancas transparentes: el color del fondo se veía a través
de la prenda. `recortarFondo` buscaba el fondo inundando desde los bordes por todo lo «casi blanco», y las rayas blancas de la tela tocan el blanco de la foto en la
pretina y en el bajo, sin borde que las separe: el fondo entraba por ellas. Lo mismo, medido sobre 38 fotos de la portada y del catálogo, le pasaba a una falda de
rayas finas (casi toda transparente), al cinturón blanco (se veía celeste) y a la plata de aretes y pulseras (se veía lavada).

**Decisión.** Dos señales en vez de una, ambas medidas en las fotos reales:
- **Fondo puro** (claro como las esquinas de la foto, 250 para arriba): se sigue por donde vaya, también por un hueco angosto, como entre las cadenas de un collar.
  El blanco de estudio mide 252–255; el blanco de una tela, 224–246.
- **Claro dudoso** (blanco hueso, gris claro, sombra): solo es fondo si es ANCHO, a más de 1,2 % del lado mayor (18 px en una foto de 1500) de cualquier cosa que no
  sea claro. Una raya de tela no lo es. Los huecos encerrados siguen la misma regla: una franja blanca larga y angosta ya no es un hueco.
- Al final, el fondo vuelve a abrazar la orilla de la prenda hasta esa misma profundidad (con menos, el jean y los aretes salían con un halo blanco).

`VERSION_DEL_RECORTE` pasa a 3: Vercel vuelve a calcular cada recorte la primera vez que se pide (~250 ms en el servidor, y luego un año guardado).

**Lo que se paga.** Una raya blanca que corre justo por la orilla de la prenda pierde hasta 18 px de ancho (en la falda, un mordisco en el borde de arriba a la
izquierda); las de adentro quedan enteras. Las prendas con fondo puro alrededor no cambian (collar, jean, bolso, blazer: menos de 2 % de puntos distintos).

**Descarté.** (a) Usar el recorte oficial del probador (el de la IA, `retail.foto_recortes`) cuando existe: es mejor fuente, pero este short no lo tiene (su foto se
subió con fondo blanco, ADR-0442) y cambia el aspecto de toda la portada; queda como siguiente paso. (b) Solo subir el grosor: deja entrar el fondo por los huecos
angostos de los accesorios. (c) Solo el tono: la sombra gris y el blanco de una tela no se distinguen por color.

**Prueba.** `lib/recorte.test.ts`: tres casos nuevos (raya blanca de tela que toca el fondo, pasillo de fondo puro entre dos piezas, franja blanca encerrada). 1084
pruebas de la tienda, `tsc`, `eslint` y `knip` en verde; comparación antes/después sobre 38 fotos reales, mirada una por una en las que cambian.
