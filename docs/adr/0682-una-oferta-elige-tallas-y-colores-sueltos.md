# ADR-0682 — Una oferta elige tallas y colores sueltos de una prenda

**Fecha:** 2026-11-18 · **Estado:** aceptado por Felipe («Sí, color y talla»; la lista de 7 actividades de `/construir`, «Sí, empieza»).
Construye sobre ADR-0655 (Campañas y ofertas), ADR-0677 (la hoja de una oferta por fases) y ADR-0650 (fusionar productos).
**No está en producción:** son seis migraciones que se pegan con el OK de Felipe (ver «Cómo se pega»).

## Contexto

Una oferta elegía sus prendas por categoría, por insignia o **por modelo entero** (`retail.campana_regla_productos`). Felipe, al probar la
hoja nueva: «poder aplicar a una variante en concreto de una prenda». En tienda pasa a diario: se liquida el negro en S y M de una blusa, no
la blusa entera. Sin eso había que rebajar el modelo completo o armar una insignia a mano para tres tallas.

## Decisión

Una prenda entra a una oferta **entera** (su modelo, con las tallas y colores que tenga y los que nazcan después) o **por sus tallas y
colores sueltos**; nunca las dos cosas.

1. **El dato.** `retail.campana_regla_variantes (regla_id, variante_id)`, RLS encendido sin políticas (solo la leen funciones
   `security definer`, ADR-0195), con `on delete cascade` a la oferta y a la variante. Las tallas sueltas **se suman** a categorías, modelos
   e insignias. Una oferta con tallas sueltas y nada más rige **solo** en ellas: no cae en las prendas de su campaña (lo mismo que ya pasaba
   con las insignias). «Dejar fuera», Claurè, tiendas, fechas y días siguen igual.
2. **Una sola regla, en todas sus caras.** La regla de alcance de una oferta guardada lee las tallas sueltas en `fn_regla_alcanza_variante`
   (una prenda), `fn_variantes_de_regla` (todas, de una vez) y `fn_campanas_en_sede` (la caja, la tienda web, los apartados, el club y las
   etiquetas de precio). Lo que Vender lee para dibujar el ticket (`ofertas_de_grupo_vigentes`, `ofertas_de_monto_vigentes`) pasa a
   preguntarle a `fn_variantes_de_regla`: lo que el ticket muestra y lo que la base cobra salen del mismo lugar.
3. **Guardar.** `guardar_oferta_completa` las recibe en la forma (`p_forma.variantes`: su firma no cambia), deja las de antes en la
   historia, no guarda las tallas de un modelo elegido entero (sobran) y un monto de toda la compra no las lleva. `campana_reglas()` las
   devuelve. La pantalla solo ofrece elegir tallas si la base las devuelve (`ofertasPorVariante`), y la ruta se niega a guardarlas en una
   base que no las conoce: el código puede publicarse antes que las migraciones sin romper nada.
4. **Choques.** «Una prenda, una oferta por tienda y por día» ve las tallas sueltas: en la hoja antes de guardar
   (`fn_choques_de_oferta_por_variante`), en el candado al guardar y en el aviso de dos ofertas. Una oferta en la M no choca con otra en la S
   del mismo modelo.
5. **Tienda web.** La web cobra con las mismas funciones que la caja. Su huella (`tienda_catalogo_version`) suma la tabla y las tres
   funciones nuevas, y la portada (`fn_campana_portada`) anuncia también la campaña cuya única oferta elige tallas sueltas.
6. **La hoja.** La ficha de cada prenda se abre para elegir «Todo el modelo», un color (entra o sale entero) o una talla. **Leer la
   etiqueta de una prenda agrega su color con todas sus tallas**; por el nombre entra el modelo entero. «Deshacer» devuelve la prenda a
   como estaba. El nombre automático, la frase de «Revisar» y el cartel de la campaña cuentan las tallas sueltas por modelo y, si es uno
   solo, lo nombran: «Vestido Sofía (Negro)», «Blusa Emma (Negro S y M)». «En caja» nombra la talla que se rebaja.
7. **Fusionar y eliminar un producto.** Al fusionar, la oferta que tenía una talla que se juntó gana la talla que la absorbió y suelta la
   juntada; si tiene entero el modelo que queda, sus tallas sueltas de ese modelo se quitan. Al eliminar un producto sin historia, sus
   tallas se van de la oferta con él.

Lógica pura de la pantalla: `apps/web/lib/oferta-variantes.ts` (pasar de entera a suelta al tocar una talla o un color, leer una etiqueta,
decirlo en una línea) y `alcanceDicho` en `lib/campana-reglas.ts`.

## Descartado

- **Guardar «todo un color» como una fila (producto, color).** La base no tiene otra regla por color y una oferta dura días: «todo el
  color» lo arma la hoja con las tallas de ese momento. Una talla que nazca después no entra sola; el modelo entero sí la incluye.
- **Una insignia interna por oferta** (reusar `campana_regla_insignias`): la insignia se ve en la prenda (Existencias, la tienda web) y
  habría que esconderla en cada pantalla.
- **Cambiarle la firma a las funciones de listas** (`fn_oferta_alcanza_variante_con_insignias`, `fn_variantes_de_oferta_con_insignias`):
  sus líneas son anclas de migraciones anteriores que las pruebas vuelven a pegar. Los choques, que necesitan la regla antes de guardar,
  van en funciones nuevas.
- **Que leer una etiqueta agregue solo esa talla, o el modelo entero.** Solo la talla obligaría a leer cada talla de la percha; el modelo
  entero rebajaría colores que nadie tenía en la mano. Quien lee tiene una prenda de un color.
- **Dejar en la oferta la talla que se juntó al fusionar** (como hace ADR-0655 con el modelo duplicado): una talla juntada no se ve en
  ninguna pantalla, y la hoja la contaría como una prenda más.

## Lo que se aprendió construyéndolo

- **El texto nuevo de una función parchada va donde no rompa un ancla vieja.** La primera versión agregaba la rama de las variantes al
  final de `fn_campanas_en_sede`: ese final es el ancla de 20261113223000, y `pruebas:campana-reglas`, que la vuelve a pegar, daba 106 de
  107. Las dos piezas nuevas van antes de ese final. Lo mismo en la portada: la alternativa nueva va fuera del paréntesis de 20261114071000.
- **La base local de un worktree miente si tiene datos propios.** Tres suites daban rojos por ofertas activas que ya vivían en esa base, y
  una por la regresión de arriba. Se separaron levantando una base limpia y desechable, como la del CI, y corriendo ahí antes y después de
  las migraciones.
- **Las pruebas de deriva hicieron su trabajo.** La tabla nueva la frenaron, con su nombre, la huella de la tienda web, fusionar productos
  y eliminar producto: cada una pidió decir qué le pasa.

## Se rompe si

- Alguien cambia el bloque de ofertas de `fn_campanas_en_sede`, el final de `fn_variantes_de_regla` o de `fn_regla_alcanza_variante`, la
  línea de ADR-0655 en `fusionar_productos` o el final de la condición de `fn_campana_portada` antes de pegar: cada reemplazo anclado se
  detiene sin aplicar nada.
- La regla cambia en una de sus caras y no en las otras: `pruebas:ofertas-por-variante` las compara.

## Cómo se pega en producción (con el OK de Felipe; nada pegado al 2026-11-18)

En este orden, cada una en un pegado aparte (`lock_timeout` 3 s, idempotentes, sin `alter` de tablas en uso ni políticas):
`20261118232000` (la tabla y la regla) → `20261118233000` (lo que lee la caja) → `20261118234000` (los choques) → `20261118235000` (la
huella de la tienda web) → `20261119010000` (fusionar) → `20261119011000` (la portada). Van después de `20261116180000`. Antes de pegar,
leer en producción la definición viva de las funciones ancladas: si alguna cambió, el reemplazo lo dice y no aplica nada. Después,
refrescar el volcado y el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).

## Verificado

- **Base (en una base limpia, como la del CI, con las seis migraciones):** `pruebas:ofertas-por-variante` 44 de 44 (alcance, guardar, 3x2 y
  monto, choques, tienda web, portada, pegar dos veces); `campana-reglas` 107, `monto-con-escalones` 45, `ofertas-por-insignia` 27,
  `aviso-dos-ofertas` 9, `ofertas-candados` 17, `ofertas-de-grupo` 25, `ofertas-tope-y-monto` 18, `rebaja-rapida` 57,
  `caja-ofertas-de-grupo` 30, `apartados-ofertas-de-grupo` 18, `tienda-ofertas-de-grupo` 12, `tienda-catalogo-version` 22,
  `fusionar-productos` 55 (el caso 45, con tres productos a la vez), `eliminar-producto` 42 y `eliminar-producto-con-historia` 66,
  `una-sola-firma` 2, `deriva-produccion` 13.
- **Web:** tipos, lint, las 956 suites de la web y Knip en verde; guía de Campañas al día con sus huellas.
- **Navegador (base local con las migraciones, 1280 px y 375 px, en claro):** leer la etiqueta negra agrega «Vestido Sofía · Negro»; la
  azul completa el modelo; «Deshacer» lo devuelve a solo negro; la frase, el nombre, «En caja», el choque con otra oferta y el cartel lo
  dicen; se guarda, se vuelve a abrir con sus tallas marcadas y se retira.

## No verificado

- La cámara y una pistola de verdad; el modo oscuro de la fase de prendas; `guias:recorrer`; `/formidable` y `/chaos` de la hoja.
- `roles-cobertura` da 30 de 32 con y sin estas migraciones: los dos rojos vienen de `main` y no son de este cambio.
- Nada en producción.

**Dynamic:** no cambia `vidrio/recetas.css` ni `components/ui/`: no le llega nada.
