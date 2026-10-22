# Maqueta · Prendas de una etiqueta: escanear para agregar (2026-10-21)

Lo que pidió Felipe: *quiero poder agregar una prenda simplemente escaneando el QR y que me la encuentre, ya sea con el escáner desde el
teléfono o con la pistola de barras; también quiero que mejores el diseño de ese modal. Hazme una maqueta con los nuevos diseños,
sofisticados y con full animaciones.* La hoja es la de Campañas ▸ Etiquetas ▸ **Prendas** (`components/PrendasDeEtiquetaModal.tsx`).

**Abrir:** `index.html` (las tres con pestañas; atajos 1 · 2 · 3) o cada archivo suelto. Con un servidor estático de `docs/maquetas`
(la configuración `maquetas` de `.claude/launch.json`) y luego `/etiqueta-escanear-2026-10/`. La barra punteada de arriba no es parte de
la pantalla: cambia la etiqueta (**Sorteo −100 %**, **Black Friday −30 %** con los anillos por categoría, **Estreno** informativa), el
tema, el ancho (escritorio o 375 px), el movimiento, y trae **«Simular lectura»**, **«Etiquetas de prueba»** (QR de verdad de las prendas
de la maqueta) y **«▶ Ver cómo funciona»**, que recorre el flujo solo.

**Tu pistola de verdad funciona en la maqueta:** una ráfaga de teclas rápida rematada con Enter es una lectura (el mismo criterio de
`usePistola` / `lib/lectura-pistola.ts`), esté el cursor donde esté. Como el catálogo es inventado, una etiqueta real de CAYLA dirá
«No es de ninguna prenda»; para ver una lectura que entra, escanea una de «Etiquetas de prueba» (de la pantalla, si tu pistola es 2D).
En la cámara, **«Usar mi cámara de verdad»** la prende y lee con `BarcodeDetector` (Chrome en Android y en Mac).

**Elegida: B · La etiqueta que se llena (Felipe, 2026-10-22),** con dos pedidos: que todo se vea a primera vista, sin scrolls que no
hagan falta, y que la cámara aparezca solo en el teléfono. Construida en `components/PrendasDeEtiquetaModal.tsx` y
`components/etiqueta-prendas/`. De la maqueta NO se llevó el punto que late de «Lector listo» ni el láser en bucle del visor: sin ellos
no hace falta abrir excepciones nuevas en ADR-0136.

## Las tres direcciones

| | Qué es | Para quién brilla |
|---|---|---|
| **A · El lector en la caja** | La hoja de hoy, ordenada alrededor de UNA caja que busca y lee. Lo leído baja como tarjeta bajo la caja (la prenda, su talla y color, el precio que cuenta hasta «Gratis»), su fila respira en la lista y una tira guarda las lecturas de la pasada. El pie muestra las miniaturas de lo que cambia. | El cambio más corto desde lo que hay: se aprende sin explicarlo. |
| **B · La etiqueta que se llena** | La hoja a todo lo ancho: catálogo a la izquierda y, a la derecha, **la etiqueta colgada de su hilo**. Cada prenda que marcas o escaneas vuela de su fila a la etiqueta y se acomoda en su mosaico; la etiqueta se asienta, el número cuenta y abajo se ve la caja antes → después. Lo que se quita queda tenue y tachado. En el celular la etiqueta es una franja arriba. | La más «sofisticada»: se VE qué lleva la etiqueta, no solo se lee. |
| **C · Ráfaga** | Dos modos, ESCANEAR (de entrada) y LISTA. Escanear es una mesa: cada prenda cae como tarjeta sobre una pila con su sello; lo que no entra se aparta a «No entraron» con su motivo. Al lado, el marcador de la ráfaga. «Revisar» pasa a la Lista con «Lo que cambia» puesto. | Quien tiene 40 prendas del sorteo en los brazos y escanea sin mirar. |

Las tres comparten el mismo modelo, la misma cámara y el mismo Revisar → aplicar → sello.

## Lo que la lectura hace (igual en las tres) — decisiones de negocio para Felipe

1. **Una lectura marca la TALLA Y COLOR leída** (la prenda que tienes en la mano), no el producto entero. Justo después, la tarjeta
   ofrece «Ponérsela a sus otras N tallas» de un toque. *Propuesta: así.* La otra opción —marcar todo el producto— es un clic menos
   cuando el sorteo es por modelo, pero etiqueta tallas que nadie escaneó.
2. **Leer dos veces no quita la etiqueta** («Ya la llevaba»). La pistola a veces lee dos veces y la cámara vuelve a ver la misma
   etiqueta: si alternara, la segunda lectura desharía la primera sin que nadie lo note. Para quitar con el lector está el segmento
   **Al escanear: Poner | Quitar**. *Propuesta: así.*
3. **Lo que no entra se dice, no se marca:** una prenda que ya la lleva por su categoría («Por su categoría»), una talla desactivada
   («Ya no se vende») o un código que no es de CAYLA («No es de CAYLA», con «Buscar por nombre»).
4. **Nada se guarda al escanear.** Escanear es lo mismo que marcar la casilla: el cambio se ve en la hoja y se guarda al aplicar, con la
   misma confirmación de hoy cuando la etiqueta baja precios (ahora con el antes → después que cuenta y el aviso de «por debajo del costo»).
   La base no cambia: sigue siendo UNA llamada a `etiquetar_variantes` (20260919010000) con ids de variante.

## Movimiento que pide tu OK (ADR-0136)

Todo es «una vez, sin rebote» salvo tres cosas que son señal y no adorno, y que hoy no están en la lista de excepciones:

- el **punto de «Lector listo»** que late junto a la caja (dice «puedes disparar ya», como el punto del chip «Vencida»);
- el **láser del visor** de la cámara, que barre arriba y abajo mientras la cámara lee (hoy `EscanerCamara` no lo tiene);
- en B, la **etiqueta que se asienta** al recibir una prenda (un vaivén que solo vuelve a su lugar, sin pasarse: no rebota).

Si alguna no va, se quita sin tocar lo demás. Con «Mov.: Sin» (o `prefers-reduced-motion`) todo se apaga.

## Cómo se construiría en el ERP (después de elegir)

- **Pistola:** `usePistola(campoBuscador, { fuera: "leer", alLeer })` dentro de la hoja; `alLeer` resuelve con `resolverCodigoV2` sobre las
  variantes ya cargadas (hay que traer `sku` y `codigos_barras` en el `select` de la hoja) y marca la variante. Lógica pura y probada en
  `lib/etiquetar-prendas.ts` (`leerCodigo(estado, codigo, modo)`, con los 7 resultados de arriba).
- **Cámara:** `EscanerCamara` hoy está atado al ticket (la bolsa, el total). Se generaliza su bandeja (lo que muestra abajo y a dónde vuela
  la prenda) para que la hoja de etiquetas la use sin copiar el visor; Vender no cambia.
- **Guía de foco, guía interactiva, /sugerir, /chaos** del modal se ponen al día en el mismo PR (es un modal que guarda).

## Archivos

- `_base.css` — tokens del ERP (claro y oscuro) y piezas: copia de `recibir-fardo-2026-10/_base.css` más lo nuevo (caja del lector,
  segmento, fila y tallas, tarjeta de lectura, cámara, revisar, sello).
- `_datos.js` — 32 productos inventados con el formato de código de la etiqueta (`CMS-0012-NEG-M`), las tres etiquetas y los íconos.
- `_comun.js` — el modelo, la pistola, el QR, la cámara, la lista compartida, revisar y aplicar, la barra y la demo.
- `a-lector.html`, `b-etiqueta.html`, `c-rafaga.html` — cada cara.
