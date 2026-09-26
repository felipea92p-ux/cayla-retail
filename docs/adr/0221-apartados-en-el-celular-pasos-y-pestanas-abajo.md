# ADR-0221 — Apartados en el celular: pasos y pestañas abajo

**Fecha:** 2026-09-26
**Estado:** Aprobado por Felipe el 2026-09-26 («la forma puede ser pasos + pestañas abajo»).
**Afecta:** `apps/web/components/apartados/` (`ApartadosPanel`, `ApartarVista`, `EntregarVista`, `TodosVista`,
`ModalesApartado`, `piezas`) y `apps/web/lib/separaciones-reglas.ts`. Solo web, sin migración.
**Spike:** `docs/maquetas/apartados-v2-2026-09/` (PR #477), capturas `08`–`10`.

## El problema

Por debajo de `lg` (1024 px), Apartados apilaba las dos columnas. El ticket, los datos de la clienta y «Confirmar
apartado» quedaban debajo de toda la búsqueda y de la prenda recién escaneada, y el formulario del adelanto eran seis
bloques seguidos. La mayoría del equipo trabaja con el teléfono gran parte del día. Además no había cámara, aunque Vender
ya la tiene desde el 2026-09-25.

## Decisión

- **Pestañas abajo, solo en el celular.** Apartar / Entregar / Todos quedan a la altura del pulgar, con la insignia de
  «necesitan algo». No es un segundo menú: el ☰ sigue siendo el del ERP (ADR-0206). En computador siguen arriba.
- **Apartar en tres pasos:** prendas → clienta → adelanto, cada uno en la pantalla entera. En computador «clienta» y
  «adelanto» siguen siendo un solo formulario a la derecha (el tipo `Paso` los separa; `max-lg:hidden` decide qué se ve).
- **Barra negra fija encima de las pestañas** (`BarraMovil`): muestra el total o el saldo y lleva el botón del paso
  siguiente («Clienta →», «Adelanto →», «Confirmar», «Cobrar»). Si falta un dato de la clienta, en vez de avanzar muestra
  los avisos: el paso siguiente no tiene esos campos.
- **Las dos piezas fijas van en un portal a `document.body`** (`EnCuerpo`, como ADR-0211): la hoja entra con un
  `transform` (`anim-sube`) y un `position: fixed` adentro se pegaría a la hoja mientras dura la animación.
- **Cámara en el teléfono:** el mismo `EscanerCamara` de Vender, con el mismo camino que la pistola
  (`resolverCodigoV2` + `agregar`, que ahora devuelve el `EstadoEscaneo`).

## Arreglos del mismo PR (los vistos en las capturas de Felipe)

1. El ticket y Entregar muestran color · talla · código: en producción el `sku` está vacío en casi todas las variantes
   (ADR-0058) y se leía «· 1 u.». Se usa `codigoPrenda` y, en Entregar, el catálogo por `varianteId`.
2. El celular pide 9 dígitos **que empiecen en 9** (`esCelularPeru`, con prueba), lo mismo el número de Yape o Plin, y
   los avisos de formato (celular, DNI, RUC, número de devolución) salen al dejar el campo, no recién al confirmar.
3. Los botones de «Apartado registrado» y «Apartado entregado» van en un pie pegado al fondo de la hoja: con la
   pantalla baja se cortaban.
4. Se quitó «Buscar apartado» en Apartar: repetía la pestaña Entregar.
5. «En custodia» dice «Anticipos: entran a ventas al entregar»; el «S/0.00 en el cajón» parecía plata faltante.

## Alternativas descartadas

- **Pasos + barra fija, con pestañas arriba** (la que recomendaba el spike): Felipe prefirió las pestañas al alcance del
  pulgar.
- **Apilado + «Ver ticket»** (la barra de Vender): es el cambio más chico, pero el formulario seguía siendo largo.

## Cómo se verifica

`/vender/apartados` a 375 px (PL-105): agrega dos tallas, toca «Clienta», escribe un DNI de 9 dígitos y sal del campo
(debe avisar), completa y toca «Adelanto»; en Entregar elige un apartado y la barra dice su saldo. En computador
(≥1024 px) la pantalla se ve como antes, sin pestañas abajo. Capturas a 375 px en
`docs/maquetas/apartados-v2-2026-09/implementacion-375px/` (página de prueba con datos inventados, sin base).
