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
- [ ] **Oferta para una variante en concreto de una prenda (pedido de Felipe, 2026-11-18; decisión suya y trabajo de base).** Hoy una oferta
  elige el modelo entero (`retail.campana_regla_productos (regla_id, producto_id)`). Para elegir un color o una talla hace falta: decidir el nivel
  (un color con todas sus tallas, o talla por talla); una tabla nueva (`campana_regla_variantes`); que `fn_regla_alcanza_variante`,
  `fn_variantes_de_regla`, `guardar_oferta_completa`, los choques entre ofertas, la portada y la huella de la tienda web lo lean; lo mismo en la web
  (`lib/campana-reglas.ts`: `prendasQueAlcanza`, la frase, el nombre) y sus pruebas de Postgres. Toca precios en caja y en la tienda web: va con
  `/construir`, su ADR y su migración reservada.
