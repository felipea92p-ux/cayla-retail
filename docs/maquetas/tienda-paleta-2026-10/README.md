# Tienda online: nueva paleta y estética, seis direcciones (2026-10-24)

> **Resultado (2026-10-26): ninguna de las seis fue la elegida.** Felipe las miró (con su demo y un spike de tres, `../tienda-spike-2026-10/`) y **volvió a «G · Pasarela»**
> de la ronda del 2026-10-17 (`../tienda-rediseno-2026-10/g-pasarela.html`), con «La raya que viaja» para pestañas y «El velo» para la sede. Decisión y construcción: ADR-0524.
> Esta carpeta queda como historial de lo que se miró y descartó.

**Qué es:** seis maneras de rehacer cómo se ve la tienda online (`apps/tienda`), todas minimalistas, con las cuatro pestañas más
importantes de cada una: **portada, catálogo, prenda y bolsa**. Felipe elige tres, de esas tres sale un spike visual más profundo
y de ese, la mejor se construye completa en la tienda local. **Una maqueta no cambia la tienda:** nada de esto existe en `apps/tienda`.

**Por qué otra ronda:** la tienda de hoy es «A · Muro» (yeso frío y grafito, elegida el 2026-10-17 entre doce direcciones A–L,
`../tienda-rediseno-2026-10/`). Felipe dijo el 2026-10-24 que no lo convence la paleta ni la estética. Estas seis **no repiten ninguna
paleta de las doce anteriores** (yeso frío, vino, perla rosada, celadón, adobe, camel, lino…).

**Ronda 2 (misma fecha): «los siento muy planos».** La primera versión tenía la prenda como una ficha sobre un fondo liso. Se rehízo con
profundidad, sin dejar de ser minimalista:
- **Escenario de cada prenda:** luz desde arriba, borde un poco más oscuro y sombra de piso (`base.css`, `.tj-foto`/`.foto`).
- **Capas:** cada portada superpone piezas (titular que cruzan las placas, láminas ladeadas, arcos dobles, abanico con sello, óvalos
  delante de un disco, tarjetas apiladas sobre un campo rojo), el «look» se monta sobre un bloque de color y una prenda sobresale de la banda del Club.
- **Categorías con foto** en vez de botones, **catálogo con ritmo** (dos prendas grandes), **filtros que se quedan pegados** al bajar,
  **bolsa con tres pasos** (Tu bolsa · Tu tienda · Separada) y una etiqueta con lo que hay en cada tienda sobre la foto de la prenda.
- **Movimiento** que se apaga con «reducir movimiento»: las piezas entran una vez al llegar a la pantalla, parallax suave solo en
  la portada (cada capa a distinta velocidad), la tarjeta sube 6 px al pasar el mouse y muestra «Ver prenda». Sin rebote ni bucle.
- **Grano** de papel casi invisible en cuatro de las seis (`--grano`).

## Las seis

| | 1 · Blanco | 2 · Índigo | 3 · Musgo | 4 · Mantequilla | 5 · Arcilla | 6 · Rojo colibrí |
|---|---|---|---|---|---|---|
| Idea | Papel blanco y un solo color | Azul tinta sobre hueso | Verde apagado y arcos | Crema amarilla y negro cálido | Rosa tierra, minúsculas, óvalos | El rojo del logo, de verdad |
| Colores | `#fff` `#f1f1ef` `#111` `#d13730` | `#f3f0e8` `#15213b` `#c8342c` | `#eceee3` `#dde2cf` `#294034` | `#fbf6e2` `#f2e8b8` `#1f1b10` | `#f3e8de` `#e8d5c5` `#2b1c16` `#a8472a` | `#fbfaf7` `#17110f` `#d13730` |
| Letras | Inter Tight | Instrument Serif + Sans | Fraunces + DM Sans | Bricolage Grotesque + Figtree | Outfit (minúsculas) | Syne + Work Sans |
| Forma | Recta, sin marcos | Casi recta, lámina con filo | Arcos dobles y píldoras | Píldoras y tarjetas blandas | Óvalos y píldoras | Recta, bloques de color |
| Portada | Titular enorme cruzado por tres placas numeradas | Azul con aros finos + pila de láminas | Tres arcos bajo un sol pálido | Titular con pastillas de foto + abanico y sello | Disco de arcilla + óvalos escalonados | Campo rojo + palabra fantasma + dos tarjetas |
| Ganas | La prenda manda; se ve «caro» sin esfuerzo | Sastrería; el azul y el rojo del logo se llevan bien | Cálida y personal sin dejar de ser sobria | La más fresca y memorable | Distinta de todo lo que hay en la zona | Se reconoce a tres metros |
| Pagas | La menos memorable | Una serif fina pide fotos limpias | Verde con rojo roza lo navideño si el verde sube | Menos «lujo»; amarillea las prendas claras | Minúsculas y óvalos cuestan lectura | El rojo grande compite con prendas rojas |
| Se rompe si | las fotos son flojas o desiguales | se quiere algo joven o de promociones | llegan prendas verdes (se funden) | llegan prendas crema o amarillas | se vende ropa rosada o beige | se usa rojo en demasiadas partes |

**Lo que no cambia en ninguna:** el logo oficial (`packages/shared/src/marca.ts`, copiado en `marca-svg.js`; solo cambia de color donde
lo pide el fondo), que sin cuenta no se ven precios, el stock por tienda, separar sin pagar, confirmar por WhatsApp, pagar al recoger y el
tope de 3 separaciones abiertas.

## Cómo se abre
Hace falta un servidor local. Desde la raíz del repo, con `preview_start` de `maqueta-referentes` (`.claude/launch.json`) o:

```bash
python3 -m http.server 3033 --bind 127.0.0.1 --directory docs/maquetas
```

y abrir `http://localhost:3033/tienda-paleta-2026-10/`. Cada dirección tiene su barra negra de revisión (cambia de dirección, de pestaña y
entre escritorio y celular); no es parte del diseño. Las fotos se leen del almacén público de la tienda, no se copian al repo (es público).

## La demo (2026-10-26)
Cada dirección se recorre sola con `?demo` (botón «▶ Demo» en su barra y «▶ Ver demo» en la comparación): baja por la portada, pasa el mouse
por categorías y prendas, entra al catálogo, filtra por pantalones y por Trujillo, abre una prenda, elige color y talla, la agrega a la bolsa,
escoge tienda, separa y arma el mensaje de WhatsApp. Un cursor y un rótulo abajo a la izquierda dicen qué se ve; **Esc la detiene**. Dura
unos 80 s y no guarda nada. Está en `demo.js`; el «pasar el mouse» lo simula la clase `.is-hover` (`base.css`), así se ve igual sin mouse.
Para grabarla como video se abre con `?previa&demo` (sin la barra de revisión) y la página deja `window.__demoListo = true` al terminar.
Los videos no se guardan en el repo (llevan las fotos de la tienda y el repo es público): se grabaron con Chrome sin ventana
(`Page.startScreencast`) y se codificaron a MP4 con un script de Swift (`AVAssetWriter`), sin instalar nada.

## Cómo está hecho
`base.css` (estructura, adaptación al ancho y la profundidad compartida) + una piel por dirección (`blanco.css`…`rojo.css`) + `tienda.js`
(las cuatro pestañas, la bolsa, filtros, separar, entrada al hacer scroll y parallax) + `datos.js` (las 13 prendas reales, igual que la
maqueta anterior). Cada piel define sus variables (`--bg`, `--surface`, `--luz`, `--ink`…) y la composición de su portada; lo demás sale
solo de la base.

## Qué es real y qué de ejemplo
Real: los nombres y las fotos de 13 prendas de la tienda pública y las dos tiendas con su dirección, horario y WhatsApp. De ejemplo:
precios, colores de más, tallas, stock, los looks y el número de la separación.

## Cómo se verificó (y qué no)
- **Capturas de página completa** con Chrome sin ventana a 1440 y 390 px, de las 24 vistas (6 × 4), revisadas una por una.
- **Contraste** (WCAG, calculado con la fórmula del estándar): texto, texto tenue sobre el fondo y sobre el lienzo de la prenda, botón y banda,
  en las seis: **todo ≥ 4,5 : 1**; el logo contra su fondo, ≥ 3 : 1 (4,2 en el peor caso, Musgo).
- **Camino de separar con clics reales** en las seis: sin talla pide la talla, agrega a la bolsa, sin tienda pide la tienda, dice cuánto hay
  en la elegida, separa y arma el mensaje de WhatsApp; los filtros del catálogo se combinan bien; ninguna pantalla se sale del ancho.
- **No se probó** con clientas reales ni a 1920 px ni en un iPhone/Android de verdad; el parallax y la entrada al hacer scroll se vieron
  funcionando solo en capturas y en el navegador integrado.

## Después de elegir
1. Felipe elige **tres**: de esas tres se hace un spike más profundo (todas las pestañas con «Entrar», celular, movimiento y datos reales).
2. Felipe elige **una**: se vuelve un sistema en `apps/tienda/app/globals.css` (única fuente de la tienda) y se construye con `/construir`,
   pantalla por pantalla, **sin perder** la velocidad ganada (tandas, esqueletos) ni la coordinación con las sesiones que tocan la cabecera,
   la ficha y los looks.
3. Un ADR con lo elegido, lo descartado y en qué escenario se rompe.
