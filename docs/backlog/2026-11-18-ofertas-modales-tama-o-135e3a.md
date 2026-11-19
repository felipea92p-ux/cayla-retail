# Ofertas: la hoja de una oferta por fases y en grande (ADR-0677, actualización b) · pendientes

- [ ] **Probar con una base local al día:** `pnpm --filter web guias:recorrer` de Campañas (escritorio y 375 px), guardar / activar / retirar de
  punta a punta y «Nuevo descuento» en el navegador. La base local compartida (`cayla-retail`, :54421) no tiene `retail.guardar_oferta_completa`
  ni la lista de descuentos: está atrás de `main` y solo Felipe la actualiza (`/actualizar-flujo`).
- [ ] **`/formidable` y `/chaos` de la hoja por fases** (prueba ciega: ¿se entiende «Siguiente» y la barra de fases?; doble clic en «Siguiente» y
  en «Guardar cambios» desde una fase intermedia).
- [ ] **¿El tamaño grande pasa al resto del ERP? (decisión de Felipe, `/unificar`).** Píldoras de 44 px, nombres de control de 16 px sin versalitas,
  segmento y categorías de 44 px hoy crecen SOLO dentro de la hoja de ofertas (`.of-wz`, `app/estilos/ofertas.css`). Las demás hojas del módulo
  que siguen con el tamaño de siempre: «Editar la campaña / la insignia» (`sellos/EditarEtiquetaModal.tsx`), «Prendas con dos ofertas»
  (`sellos/AvisoDosOfertas.tsx`), «Agregar prendas al descuento» (`campanas/AgregarAlDescuento.tsx`) y aprobar / rechazar (`SellosPantalla.tsx`).
- [ ] La hoja «Configuración» de una campaña (`EtiquetasLista.tsx`) ya usaba el paso grande para su %; sus opciones y nombres siguen chicos.
- [ ] **El pie pegado flota cuando `<PaginaEstable>` reserva alto (pieza del sistema, decisión de Felipe).** En cualquier hoja con `pie-hoja-fijo`
  cuyo contenido se acorta tras un clic estando desplazada, la reserva (ADR-0185) se suma como `padding-bottom` de la hoja y el pie pegado se mide
  desde ese relleno: queda a media hoja, encima del contenido. En la hoja de ofertas se resolvió sin tocar el sistema (alto fijo y
  `data-sin-reserva`). El arreglo de fondo: que `PaginaEstable` publique la reserva en una variable y `.pie-hoja-fijo` la reste de su `bottom`
  (`components/ui/PaginaEstable.tsx`, `app/globals.css`, `estilos/vidrio/hoja.css`), con su prueba. Toca piezas que Dynamic mira.
- [ ] **Probar la fase 2 en tienda:** leer etiquetas con una pistola de verdad y con la cámara del teléfono (en local no hay cámara ni pistola).
  Confirmar qué trae impreso el código de la etiqueta (SKU, `variantes.codigo` o de fábrica): los tres los reconoce `buscar_prenda_para_rebaja`.
- [ ] **¿El botón sutil cambia en todo el ERP? (decisión de Felipe, `/unificar`).** Felipe: «hay dos botones planos que parecen solo texto»
  («Elegir todas», «Quitar todas»). En la hoja de ofertas pasaron a `btn-secundario`; `btn-sutil` sigue siendo la pieza decidida para una acción
  chica dentro de una hoja (ADR-0358, ronda 9) en el resto del ERP.
- [ ] La grilla de categorías de la hoja «Configuración» de una campaña (`EtiquetasLista.tsx`) sigue con su aspecto de antes; las píldoras por
  familia solo están en la hoja de una oferta.
- [x] ~~Oferta para una variante en concreto de una prenda~~ — hecho en ADR-0682 (2026-11-18).

## Ofertas por talla y color (ADR-0682) · pendientes

- [ ] **Pegar en producción (decisión de Felipe).** Seis migraciones, en este orden y cada una en su pegado: `20261118232000`,
  `20261118233000`, `20261118234000`, `20261118235000`, `20261119010000`, `20261119011000`. Antes, leer en producción la definición viva de
  las funciones ancladas (`fn_campanas_en_sede`, `fn_variantes_de_regla`, `fn_regla_alcanza_variante`, `guardar_oferta_completa`,
  `ofertas_de_grupo_vigentes`, `ofertas_de_monto_vigentes`, `campanas_ofertas_que_chocan`, `fusionar_productos`, `fn_campana_portada`).
  Mientras no se peguen, la hoja no ofrece elegir tallas (`ofertasPorVariante`) y todo sigue como antes. Después: refrescar el volcado y el
  diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Probar en tienda:** leer etiquetas con la pistola y con la cámara del teléfono. Si el código impreso es el de fábrica y lo comparten
  varias tallas del modelo, entra el modelo entero (no hay un color que deducir): confirmar que eso es lo que se quiere.
- [ ] **Sin mirar:** el modo oscuro de la fase de prendas con el panel de tallas abierto; `pnpm --filter web guias:recorrer` de Campañas.
- [ ] **`/formidable` y `/chaos` de la hoja** (doble clic en «Activar» con tallas sueltas; dos pestañas editando la misma oferta; fusionar
  un producto mientras su oferta está abierta en otra pestaña).
- [ ] **Una talla nueva de un color que la oferta tiene «entero» no entra sola** (la oferta guarda las tallas de ese momento; el modelo
  entero sí la incluye). Si en tienda molesta, se decide entonces si «todo el color» se guarda como regla.
- [ ] **`pruebas:roles-cobertura` da 30 de 32 en `main`** (cuatro funciones de descuentos y rebajas en `SOLO_LIDER` que ya no exigen solo
  líder por un ayudante): no es de este cambio; lo vio esta rama al correr en una base limpia.
- [ ] **Cuatro suites de la base no aceptan otro contenedor** (`eliminar_producto`, `eliminar_producto_con_historia`, `una_sola_firma`,
  `deriva_produccion` lo llevan escrito a mano): con `--contenedor` corren igual contra la base local compartida. Hacen ROLLBACK y no
  dejan nada, pero el resultado no es el de la base que se pidió.
