# ADR-0472 — Catálogo dice lo que cobra la caja hoy (el descuento de campaña se ve, no se guarda)

- **Fecha:** 2026-10-21 · **Estado:** código y pruebas listos en la rama `claude/product-price-discount-tag-bug-9b1e21`. **Sin migración ni RPC
  nueva:** lee `retail.fn_campanas_por_variante`, que ya existe en producción desde el 2026-09-18.
- **Relacionados:** ADR-0107 (campañas: un solo descuento, el mayor), ADR-0108 (etiquetas con descuento), ADR-0180 (la etiqueta de papel dice
  lo que cobra la caja el día que se imprime), ADR-0302 y ADR-0403 (la cuenta del descuento), ADR-0370 (precio propio de cada tienda), ADR-0441
  (reimprimir al guardar una campaña), ADR-0257 (la ficha guarda todo con «Revisar y guardar»).

## El problema

Felipe, 2026-10-21: al editar un producto y ponerle una etiqueta con descuento, «se guarda que el producto tiene la etiqueta pero no se guarda
el nuevo precio». Lo mismo al agregar prendas desde la propia etiqueta (hoja «Prendas»).

No era un error al guardar. El historial de producción muestra que las etiquetas se guardaron («Aniversario CAYLA» −10 % en 27 tallas,
«Para liquidar» −20 % en 5), y en local la caja cobró S/ 63.90 por una prenda de S/ 79.90 con 20 %. El descuento se calcula al cobrar
(`fn_campanas_por_variante` + `fn_descuento_campana`) y lo aplican Vender, `registrar_venta`, la tienda web y la etiqueta de papel. Pero
Editar producto, la lista de Productos y la vista rápida mostraban solo `variantes.precio`: ninguna pantalla de Catálogo decía que la caja ya
cobraba otro número. Y al poner o quitar la etiqueta desde la ficha o desde «Prendas», nada avisaba que la etiqueta de papel colgada en la
percha quedaba con el precio de antes (la hoja «Campaña» sí lo hacía desde ADR-0441).

## Lo que se decidió

1. **El descuento no se guarda en el precio.** Sigue calculándose al cobrar. Catálogo lo **muestra** con la misma regla de la caja.
2. **Lista y vista rápida** (Grilla, Tabla, vista rápida): el precio de lista tachado, el que cobra la caja y la insignia «−20 %»
   (`<PrecioConCampana>`, `components/ficha-producto/`). La vista rápida nombra además la campaña y hasta cuándo. Se lee con
   `campanasQueCobra` (`lib/etiquetas-precio.ts`), la misma función de la etiqueta de papel, sobre las variantes de la página.
3. **Editar producto:** en la tarjeta «Precio de la prenda» del panel derecho, una frase: «Con Aniversario CAYLA (−10 %) la caja cobra
   S/ 71.90 hasta el 25 oct.». Mientras se ponen o quitan etiquetas, se cambia la categoría o el precio, la frase pasa a ámbar (como todo lo
   cambiado de la ficha) y dice lo que cobrará **al guardar**, o que vuelve al precio de lista. Como la ficha todavía no guardó, aquí la regla
   de la base se replica sobre lo que está en pantalla (`campanasDeLaFicha`, igual que el alta con `campanaDelAlta`).
4. **Reimprimir al guardar.** Si el precio que cobra la caja HOY cambió en alguna variante (una campaña que entra o sale, otro precio), el
   aviso de éxito lo dice y ofrece «Imprimir sus etiquetas» de esas variantes, desde la ficha y desde «Prendas». Usa el texto y el destino de
   ADR-0441 (`avisoReimprimir`, `destinoReimprimir`), así los tres caminos hablan igual. En la ficha, si además entraron unidades, ese botón
   reemplaza a la hoja «Etiquetas de lo que entró», que solo imprimiría las nuevas.
5. **Con precio propio de la tienda** (ADR-0370), la caja de esa tienda rebaja desde su precio, y la frase lo dice («la caja de Trujillo»).
6. **El día es el de Lima** en Editar producto (antes era la fecha UTC: pasadas las 7 pm, una campaña que termina hoy dejaba de ofrecerse).

## Descartado

- **Guardar el precio rebajado en `variantes.precio`:** la caja descontaría dos veces mientras la etiqueta siga puesta (79.90 → 71.90 guardado
  → 64.70 cobrado), el precio se quedaría bajo cuando la campaña venza (habría que subirlo a mano, prenda por prenda) y el historial anotaría
  una baja de precio que nadie decidió. Es el cartel «−10 % en caja» en el perchero contra recoser cada etiqueta.
- **Una función nueva en la base para la ficha:** la ficha necesita el resultado ANTES de guardar; la base solo sabe lo guardado.
- **Solo la ficha y «Prendas» (la opción B):** la lista y la vista rápida seguían sin decir qué prendas están rebajadas.
- **Rojo para la insignia:** en una página de 20 tarjetas pasaría el tope de rojos por pantalla; va en pizarra (lo informativo).

## Se rompe si

- Una tienda tiene precio propio y la ficha rebajara desde el precio de la prenda: mostraría un monto que ninguna caja cobra. Por eso rebaja
  desde el precio de la tienda activa, como la vista rápida y la Tabla.
- La regla de `fn_campanas_por_variante` cambia (por ejemplo, campañas por tienda) y `campanasDeLaFicha` no: la ficha diría otra cosa que la
  caja. La lista y la vista rápida no tienen ese riesgo: leen la función.
- `campanasQueCobra` no responde: la lista muestra el precio de lista, como antes (no se cae ni inventa un descuento).

## Verificado

Pruebas puras (`lib/precio-de-hoy.test.ts`: la cuenta contra la caja en todos los precios de S/ 1 a S/ 300 con los % de siempre, la regla de
la ficha, las frases; `lib/etiquetar-prendas.test.ts`), la batería completa de la web, Knip, tipos y lint. En el navegador contra la base
local: la ficha de una blusa de S/ 69.90 dice en ámbar «Al guardar, con Nuevo (−20 %) la caja cobrará S/ 55.90» y, guardada, «Con Nuevo
(−20 %) la caja cobra S/ 55.90»; el aviso ofrece «Imprimir sus etiquetas»; la Grilla, la Tabla y la vista rápida tachan S/ 69.90 y dicen
S/ 55.90 −20 %; desde «Prendas» de la etiqueta, una falda de S/ 74.90 pasa a S/ 59.90 y su etiqueta de papel sale con ese precio; a 375 px
la tarjeta no desborda. La base local se restauró a la foto de antes de la prueba.

## Sin verificar

`/chaos` y `/formidable` no se corrieron sobre estas pantallas (no cambia lo que guardan, solo lo que dicen); producción.
