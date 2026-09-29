# Spike visual · Íconos en «Categorías» (2026-09-29)

> **Estado: Felipe eligió D («Banner arriba», con píldoras y color por familia) y está construida — ver
> [ADR-0287](../../adr/0287-categorias-con-icono-por-prenda-y-la-tarjeta-de-atributos.md).** Este documento queda como registro
> del spike y del porqué; la pantalla real ya no es esto, es `components/CategoriasLista.tsx` con `MuestraCategoria.tsx`.
> Investigación de mercado que respalda las opciones:
> [`docs/investigacion/2026-09-29-categorias-como-se-muestran.md`](../../investigacion/2026-09-29-categorias-como-se-muestran.md).

`spike.html`: un solo archivo, se abre con doble clic o con el servidor `maquetas` de `.claude/launch.json`. Es la pantalla
real de `/productos/categorias` con las **42 categorías activas de verdad** (nombres, prefijos y familias salen de
`retail.categorias`, base local, 2026-09-29) y **cifras de productos inventadas** (el catálogo real está casi vacío). Nada se
guarda. Arriba, una barra punteada con los controles (no es parte del ERP). Un clic en una tarjeta abre la Vista rápida con
el mismo ícono. Enlace directo (solo en un navegador normal): `spike.html#v=d&ancho=celular`.

**Solo lo visual:** no se toca ninguna función, ruta, RPC ni migración. Excepción a vigilar: las **píldoras por familia** de
la captura de Atributos no existen hoy en Categorías; filtrar por familia es un comportamiento nuevo (chico, en el navegador).
Por eso hay un interruptor «Barra: Solo buscador».

## La captura de Felipe ya trae el molde

La pantalla que Felipe mandó (Atributos ▸ Etiquetas) está hecha con piezas que **ya existen** (ADR-0261, `components/atributos/kit.tsx`):
`BarraAtributos` (píldoras + buscador + «+ Agregar»), `TituloGrupo` (punto + nombre + cuenta), `TarjetaAtributo` (muestra 3:1,
nombre de 15 px, líneas chicas) y `GRILLA_ATRIBUTOS` (5 por fila). La muestra la pinta `MuestraIcono` (`MuestraEtiqueta.tsx:281`,
compartida con Temporadas): el dibujo grande al centro, **dos ecos al 18 % a los lados** y el tinte del grupo (`TONOS`:
el color pleno diluido 14 % sobre crema). Ese molde solo pide una función `dibujo(acento)` centrada en (0,0), de ±14 unidades.
Los 42 íconos de este spike están hechos para entrar ahí.

Tonos por familia (los mismos de Etiquetas y Temporadas, **nunca rojo**): Indumentaria taupe · Calzado pizarra · Accesorios
ámbar · Bisutería verde · Belleza neutro · Papelería pizarra. Son cinco tonos para seis familias: pizarra se repite en dos que
no son vecinas.

## Las versiones (`Ancho` escritorio = 1180 px; alturas medidas en la maqueta, con el mismo dato inventado en todas)

| | Qué es | Indumentaria / pantalla entera | Ganas | Pagas |
|---|---|---|---|---|
| **Hoy** | La percha idéntica a 20 px y 30 % de tinta. | 552 / 1.631 px | — | No dice qué prenda es. |
| **A** | La tarjeta de hoy con el ícono de la prenda, a 28 px. | 584 / 1.719 (+6 %) | El cambio más chico. | A 20 px no se distingue un blazer de un abrigo; los 28 px estiran cada fila. |
| **B** | Tarjeta chica con muestra 4:3, 8 por fila. | 558 / 1.700 | Parecida a Atributos. | No ahorra alto; sin sitio para temporada. |
| **C · Banner a la izquierda** | Tu C con el molde de Atributos: banner de 104×64 a la izquierda (dibujo + ecos + tinte), nombre, prefijo, «N productos», temporada. Píldoras y título de grupo con punto. | **569 / 1.663 (+3 % / +2 %)** con banner; ver opciones abajo | El nombre manda; se ve como Atributos y se ve «bonito». | **Es una forma de tarjeta nueva** (Atributos tiene una sola, vertical): dos gramáticas de tarjeta dentro de Catálogo (Brooks; ADR-0261 se escribió para que no pase). Con banner **ya no ahorra alto**. |
| **D · Banner arriba** | La tarjeta de Atributos tal cual: `TarjetaAtributo` + `MuestraIcono`, 5 por fila. | 727 / 1.911 (+32 % / +17 %) | **Cero componentes nuevos**: solo un `dibujo` por prefijo y un mapa de tonos. Igual a Atributos en todo (movimiento de los ecos al pasar el mouse incluido) y un cambio futuro del kit llega solo. | Es la más alta: la pantalla crece 280 px y son 5 por fila (cada tarjeta más alta que hoy). |

### Opciones de C, según la investigación (interruptores «Miniatura», «Color», «Barra»)

| Opción | De dónde sale | Indumentaria / pantalla | Nota |
|---|---|---|---|
| **Miniatura · Banner chico** | El molde de Etiquetas/Temporadas | 569 / 1.663 | Por defecto. Lo más parecido a la captura. |
| **Miniatura · Cajón 44 px** | Odoo POS y `Thumbnail` de Shopify Polaris: un cajón cuadrado, foto o ícono | **438 / 1.094 (−21 % / −33 %)** | 4 por fila, con el tinte y el ícono de su familia. La mejor densidad **con** color. |
| **Miniatura · Foto si existe** | Uniqlo, Odoo POS («Show category images»), Polaris: foto de un producto de la categoría; sin foto, la silueta sobre el color de su familia | 477 / 1.203 (−14 % / −26 %) | Cajón de 64 px. Aquí 7 categorías tienen foto **de mentira** para ver el estado mixto de hoy. Traer la foto real pide un dato nuevo (función): fuera de este pedido. |
| **Miniatura · Solo texto** | H&M (36 categorías en píldoras de 48 px sin una imagen), Zara, Zalando, Ripley; NN/g: el texto navega más rápido en niveles amplios | **187 / 615 (−66 % / −62 %)** | Las 42 caben en una pantalla. Con punto de color por familia. Es lo que la evidencia más respalda, y lo contrario de lo que Felipe pide (que el ícono ayude a identificar). |
| **Color por familia · Sí / No** | Odoo POS, Loyverse, Square, Clover: la categoría tiene identidad de color | — | «No» = todo en el tono «General» de Etiquetas. |
| **Barra · Píldoras / Solo buscador** | Atributos ▸ cualquier pestaña | — | Ver la nota de arriba: filtrar por familia es comportamiento nuevo. |
| **Prueba sin etiqueta** | NN/g: mostrar los íconos **sin** nombre a personas reales | — | «¿Qué esperas encontrar en esta?» a 5 colaboradoras; los que fallen cambian de silueta o quedan con nombre. |

**No construí** (la investigación los muestra, pero necesitan datos que no hay): el mosaico de **cuatro fotos** de Amazon
(necesita muchas fotos por categoría) ni juntar categorías como Zara («Vestidos | Monos»), que es cambiar la taxonomía, no
lo visual.

## Lo que comparten todas

- **Un ícono por categoría en el trazo de la percha de hoy** (`IconoFamilia.tsx`: 24×24, trazo 1,5, esquinas redondas). Son 42,
  dibujados aquí: ningún set público los trae (blazer, body y conjunto no existen en ninguno de los 18 medidos) y así no se
  mezclan autores ni licencias ni se suma una dependencia. La pestaña «Los 42 íconos» los muestra. En los banners llevan un
  relleno tenue (14 %) en la silueta, como los dibujos de Etiquetas (`liquidar`, `unica`).
- **La clave es el PREFIJO, no el nombre.** Los nombres se renombran (`Poleras/Sudaderas` → `Poleras`) y el prefijo (`SUD`)
  queda fijo apenas hay un producto. **Una categoría nueva cae al ícono de su familia** (la percha), en el tono de su familia.
  Interruptor «Categoría nueva sin ícono».
- **El nombre nunca se va** (NN/g: casi ningún ícono se entiende sin etiqueta).

## Lo que dice el mercado (resumen; detalle y fuentes en la investigación)

- **0 de 15 sitios de moda revisados usan un ícono por prenda**; el nivel fino va en texto (Zara, H&M, Zalando, Ripley). Son
  tiendas: la foto del producto está justo debajo. Mercado Libre pone ícono solo a la **familia**, como CAYLA hoy.
- **A favor de Felipe:** NN/g dice que un ícono suele representar una categoría mejor que una foto, con condiciones (etiqueta
  visible, probarlo sin etiqueta con personas reales).
- **POS y back-office:** Odoo, Loyverse, Square, Clover y Lightspeed dan a la categoría **color**, y foto opcional. Aquí el
  color por familia sale de los tonos que Atributos ya usa (el informe sugería una paleta nueva; no).
- **Riesgo al dibujar 42 íconos:** a tamaño chico se confunden las prendas que H&M funde en texto. Mi inspección de los míos
  (interruptor «Solo íconos»): polo, vestido, falda, short, pantalón, jeans, enterizo, top, body, chaleco, conjunto y lencería
  se leen; **abrigo, casaca, blazer, chompa y polera se parecen entre sí**. Es mi ojo, no una prueba.

## Recomendación

**D si quieres la estética de Atributos con el menor riesgo; C con «Cajón 44 px» si quieres la densidad.** C con banner chico
tiene lo bonito de D con lo caro de los dos: la altura de hoy y una tarjeta nueva que mantener. D reusa las piezas que ya
existen, y el precio es 280 px más de scroll en una pantalla que un líder abre rara vez.

## Cómo verificarlo tú (5 minutos, con 5 colaboradoras)

Pon **«Solo íconos»** y pregúntale a cada una, sin decirle nada más: *«¿qué esperas encontrar en esta?»*. Anota cuáles falla la
mayoría; esas cambian de silueta o se quedan con el nombre. Es el método de NN/g; sin él, esto es opinión mía.

## Lo que hay que decidir antes de construirlo

1. **¿D, C-banner o C-cajón?** (y si va la barra de píldoras).
2. **Al construir, unificar `TONOS` con los tokens.** `MuestraEtiqueta.tsx:26-31` guarda los tonos como hex literales **de antes
   del 2026-09-22** (ámbar `#8C631F`, verde `#556E49`; hoy los tokens son `#74501a` y `#48603f`). Si Categorías los reusa, hereda
   la deriva; corregirlo en un solo lugar cambia un poco el tono de Etiquetas y Temporadas también.
3. **Temporada y «N sub»:** en C y D caben como línea; en B no. Hoy la tarjeta también avisa qué subcategoría respondió al buscador.
4. **¿Quién elige el ícono de una categoría nueva?** Hoy nadie (percha). Elegirlo exige una columna en `categorias`.
5. **¿También en el alta de producto?** `alta-producto/ArbolCategoria.tsx:196-205` elige la categoría con botones de solo texto.
   Ahí el ícono evita el error «más caro del alta» (prefijo, tallas, tejidos y patrones cuelgan de la categoría).
