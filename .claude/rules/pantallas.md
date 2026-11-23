---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/lib/combo-reglas.ts"
  - "apps/web/lib/categoria-de-prenda.ts"
---

## Toda pantalla ocupa todo el ancho (regla — ADR-0462, Felipe 2026-10-20)

**Una pantalla nueva usa el ancho completo de la pantalla: no se centra en una columna angosta.** El marco (`components/AppShell.tsx`) ya lo
hace solo: una ruta nueva no tiene que pedir nada. Lo que sí te toca es **llenar ese ancho con sentido**: cifras en fila, tabla a lo ancho,
una columna al costado (un ejemplo, un resumen, una vista previa) y campos de a dos cuando la pantalla es muy ancha, como Clientes ▸
Beneficios del club. Un párrafo largo o un formulario corto se topan por su cuenta (`max-w-prose`, `max-w-2xl`), nunca la pantalla entera.
Se revisa a 1440 y 1920 px, además de 375. Las pantallas que nacieron antes con el tope de 64 rem viven en `CON_TOPE_DE_ANCHO` (AppShell):
es deuda, solo baja, y `lib/ancho-completo.test.ts` falla si una ruta nueva entra ahí. Al revisar una de ellas a lo ancho, se saca de la lista
(y de `CON_TOPE_HOY` en la prueba). El Inicio («/») sigue con tope: el de almacén, el Observatorio y Aventurero lo quitan con `data-ancho-completo`.

## La prenda sin foto (regla — ADR-0333, Felipe 2026-10-04)

**Una prenda sin foto se dibuja SIEMPRE igual: el ícono de su categoría sobre el color de la prenda** (`MosaicoPrenda`), nunca el
isotipo de CAYLA, que es la marca (loader, tickets, etiquetas) y no un hueco. Se usa `<SinFoto>` / `<MiniaturaPrenda>` /
`<FotoDePrenda>` (`components/ui/`) pasándoles `colorHex` y `{...categoriaDe(fila)}` (`lib/categoria-de-prenda.ts`); no dibujes
otro «sin foto». Si la fila no trae la categoría, la miniatura dibuja la percha (no se cae): al cargar una prenda, pide
`categorias ( nombre, prefijo, familia )`. `lib/sin-foto.test.ts` falla si un archivo fuera de su lista de marca dibuja
`/cayla-isotipo.png`. Catálogo ▸ Productos, Apartados e Inicio de Almacén ya usan la misma pieza (ADR-0333); Movimientos, Traslados,
Cambios, Devoluciones, Compras y Resumen dibujan la percha porque su cargador aún no trae la categoría.

## La página no se encoge bajo el mouse (regla — ADR-0185)

**Un clic nunca debe hacer que la vista «se suba sola».** Pasa cuando algo al final de lo que se desplaza (página o
ventana) se acorta y el navegador recorta el scroll. Ya está cubierto por piezas del sistema, y una pantalla nueva
no tiene que hacer nada: `<PaginaEstable />` (montado una vez en `app/layout.tsx`) reserva el alto recortado tras
cada clic; `<Modal>` va anclado arriba en escritorio; `ComboResponsable` y `ComboBuscable` abren su lista flotando.
Lo que sí te toca: **un bloque que cambia de alto con cada opción de un mismo control** (los datos de cada medio de
pago) reserva su propio lugar —apila las variantes invisibles en una celda de grid, como `LineasPago`— para que ni
siquiera aparezca aire; no abras listas **dentro** del contenido (usa `usePosicionLista`), y una paginación al pie
lleva la vista al inicio de la tabla (las navegaciones por URL no las cubre la regla global). **Un clic que cambia de VISTA sin cambiar de
URL (un paso, una pantalla de éxito) no es un bloque que se encogió:** llama a `soltarPaginaEstable()` en un `useLayoutEffect`, o el título puede
quedar fuera de la pantalla; un flujo con `<EncabezadoFlujo>` lo hace con `useVistaDelPaso(paso)` (`lib/flujo-guiado-vista.test.ts`). Si se olvida, la regla
evita lo peor: no reserva cuando volver dejaría menos de un cuarto de la pantalla con contenido (`esCambioDeVista`). Detalle:
`docs/adr/0185-la-pagina-no-se-encoge-bajo-el-mouse.md`.

## Buscador y paginado de combos (regla — ADR-0209)

**Todo combo hereda la misma regla sin que la pantalla haga nada:** con más de 8 opciones aparece un campo
para buscar (escribiendo, sin tildes ni mayúsculas); con más de 50 ya filtradas, la lista se completa sola al
bajar el scroll en vez de cortar de golpe. La regla vive en `apps/web/lib/combo-reglas.ts` (pura, con
pruebas) y el estado que la usa en `apps/web/components/ui/useCombo.ts`; la aplican `Desplegable`/
`CampoSelect`, `ComboBuscable`, `ComboResponsable` y `DesplegablePildora` (píldoras de filtro) — con 8
opciones o menos ninguno cambia de comportamiento. **No reimplementes un corte a mano ("se muestran N, sigue
tipeando") ni un buscador propio**: un combo nuevo se alimenta con `opciones`/`valor`/`onValor` vía
`CampoSelect` (formulario), `Desplegable` (sin caja de `Campo` alrededor, ej. cabecera o píldora) o
`ComboBuscable` (catálogo, tipeo inmediato) y la regla llega sola. **Desde el 2026-09-26 no hay ni un `<select>`
del navegador en la web, Finanzas incluida, y `apps/web/lib/sin-select-nativo.test.ts` hace fallar el CI si
aparece uno** (`SelectNativo`/`CampoSelectNativo` ya no existen). Lo que antes empujaba al nativo tiene su
equivalente: `<optgroup>` → `Opcion.grupo`; `<option disabled>` → `Opcion.deshabilitada` (se ve, no se elige);
un «Elige…» que solo bloquea guardar → `marcador`, no una opción; foco-en-error → las props `id` (y `ref`, en
`Desplegable`). En Finanzas el combo es `SelectFin` (kit): el mismo `Desplegable` con la caja del spike
(`forma="fin"`); `className` lo ubica en la fila (`w-fit`, `fin-mes-chico`, `fin-compacto`), no lo pinta. La
forma `caja` es hueso, igual que `CampoTexto caja`. Detalle: ADR-0209, actualizaciones del 2026-09-26.
**Todo combo abre tan rápido como el selector de sede:** su lista flotante se cuelga con `useDestinoFlotante` y entra con
`anim-revelar` (240 ms, sin espera). Dentro de un `<Modal>`, el hook la cuelga de la capa de la hoja
(`[data-capa-flotante]`, fuera de la cascada). **Nunca la cuelgues suelta en la hoja:** la cascada la toma por contenido y
la retrasa hasta 1 s (ADR-0211, «Actualización 2026-09-26 (b)»; lo vigila `lib/combos-fuera-de-la-cascada.test.ts`).

## Poco texto a la vista (regla — Felipe 2026-11-13)

**Felipe: «hay demasiado texto, hay que evitar esto».** Nació de una opción que decía en tres frases lo que su nombre ya decía. Vale para toda
pantalla, hoja o pieza nueva o editada:
1. **Una opción, un botón o un bloque: su nombre y, como mucho, UNA línea de 8 palabras o menos.** Nada más a la vista.
2. **Lo que explica** (cómo funciona, cuánto cuesta o tarda, las excepciones) **no va a la vista**: va detrás del «?» (`<Ayuda>`) o aparece recién
   donde se usa (en la hoja que se abre, junto al botón que lo gasta).
3. **Un estado lo dice el control** (el interruptor prendido, un `<Chip>`), nunca una frase debajo («Apagado: las fotos se suben tal cual»).
4. **No se repite:** si el título lo dice, la línea no lo vuelve a decir; si la pieza ya lo muestra, no se escribe.

Ejemplo: «Foto de catálogo con IA» + «Maniquí invisible, sin fondo.» + el interruptor; el tiempo y el costo van en el pie de la hoja que se abre.
Lo revisan `/textos` y `/formidable` (ley 8, «quitar antes de agregar»).
