# ADR-0601 · Comparar con SUNAT: la propuesta del SIRE contra el ERP

- **Fecha:** 2026-11-02 · **Estado:** construido y probado en local con datos inventados (5 actividades, un commit cada una). Tres migraciones
  **sin pegar en producción** (`20261102202000`, `…203000`, `…204000`). La API del SIRE probada con un SUNAT falso, **no contra el real**.
- **Decide:** Felipe, 2026-11-02: «hay que implementarlo para ahorrar el proceso de comparación y dejar todo a un solo clic»; aprobó las 5
  actividades (con la API) y que el cierre solo avise.
- **Toca:** ADR-0195 F8 (Impuestos), ADR-0573 (la pantalla de Impuestos), ADR-0560 (CLAURE con el RUC de CAYLA), ADR-0005 (la Clave SOL).
- **Investigación:** `docs/investigacion/2026-11-02-sire-api-al-erp.md`.

## El problema primero

Cada mes SUNAT arma la «propuesta» del Registro de Compras (RCE) y del de Ventas (RVIE) del SIRE con los comprobantes electrónicos que
recibió a nombre de CAYLA. El contador la acepta y la genera en el portal, casi siempre tal cual. Nadie la comparaba con el ERP: una factura
de un proveedor que nadie registró (un gasto oculto, o alguien usando el RUC), o una registrada que el proveedor nunca envió (su IGV no se
descuenta: se paga de más sin saberlo), pasaban sin que nadie lo viera.

## Qué se decidió

1. **Finanzas ▸ Impuestos ▸ Comparar con SUNAT** (`/finanzas/impuestos/sire`, pestañas Compras y Ventas). Se sube el txt (o el .zip) de la
   propuesta; la web lo lee **por el nombre de la columna** (SUNAT agrega columnas con cada resolución) y rechaza otro mes, otro RUC o el
   registro equivocado. Se cruza con **el mismo registro que baja el contador** (`fn_impuestos_registro_compras` / `_ventas`): lo que SUNAT
   no tiene, lo que falta en el ERP, montos distintos, comprobantes en papel y lo que cuadra.
2. **Compras se empareja por tipo + serie + número + RUC** (dos proveedores repiten serie y número); **ventas, sin el documento del
   cliente** (la serie y el número son de CAYLA). En ventas, una anulación del ERP que SUNAT tiene vigente dice «la baja no llegó».
3. **Cada diferencia se resuelve** (`sire_resoluciones`): «Es de CLAURE», «Va en otro mes», «Nadie la reconoce», «Se la pedí al
   proveedor», «Revisada». La resolución vive **por la llave del comprobante**, no por la línea: sobrevive a subir otra versión.
   Deshacer no borra.
4. **Nada se borra:** subir otra vez el mismo mes agrega una versión; la vigente es la última.
5. **Se avisa donde se decide, sin bloquear:** «Antes de declarar» (Impuestos) y un aviso en la unidad «empresa» del Cierre de mes.
   Los dos salen **del mismo cruce** (`getEstadoSire`): no hay una segunda cuenta de diferencias en la base.
6. **La API del SIRE, solo para LEER:** un cron de Vercel (`/api/sire/propuesta`, del 2 al 10 a las 8:30 de Lima) trae las dos propuestas del
   mes anterior y las guarda como `origen = 'api'` (`guardar_propuesta_sire_api`, solo `service_role`, sin repetir una versión igual).

## Lo que no se hizo, a propósito

- **Aceptar, reemplazar o generar el registro desde el ERP.** «Generar» ni siquiera está en la API (manual RVIE v31: el preliminar se
  registra «para que pueda continuar con la Generación en el portal WEB»), y subir archivos exige un cliente TUS documentado solo en Java.
  Mover el registro legal desde el ERP agrega riesgo sin quitar trabajo: el contador sigue entrando al portal. El «un solo clic» que queda
  es ese: aceptar y generar en el portal, con todo ya revisado.
- **Guardar credenciales en la base.** `SIRE_CLIENT_ID`, `SIRE_CLIENT_SECRET`, `SIRE_USUARIO_SOL` y `SIRE_CLAVE_SOL` viven en las
  variables de entorno del servidor. Deben ser de un **usuario secundario de SOL** con permiso solo para el SIRE.
- **Repetir el cruce en SQL para el cierre** (`fn_cierre_panel`): habría dos reglas que se desfasan. El aviso del cierre lo arma la web.
- **Llevar los datos de la factura ya escritos a Gastos** («Registrarla en Gastos» abre la hoja vacía): toca otro módulo; queda en el backlog.

## Contratos

- `sire_propuestas` / `sire_lineas`: todo o nada; nunca se borra; `subida_at = clock_timestamp()` (dos subidas en la misma transacción
  tenían la misma hora y la vigente salía al azar: lo encontró la prueba).
- `sire_resoluciones`: una vigente por (registro, mes, llave) con índice único parcial; dos personas a la vez, una gana (`ya_resuelta`).
- La llave (`claveComprobante`) y el CHECK de `sire_resoluciones.clave` tienen la misma forma; lo vigila `lib/sire-cruce-reglas.test.ts`.
- «IGV en juego»: en montos distintos, la diferencia de IGV; en lo demás, el IGV entero del comprobante.

## Cómo se verifica

- `pnpm pruebas:sire-propuestas` (13 casos, ROLLBACK) y las pruebas de `lib/sire-*.test.ts` y `lib/zip-leer.test.ts`.
- En local: subir una propuesta de ejemplo en `/finanzas/impuestos/sire?mes=2026-10` (compras y ventas), resolver y deshacer una
  diferencia, ver la línea en «Antes de declarar» y el aviso en `/finanzas/cierre?mes=2026-10&sede=empresa`.
- **Falta, y es de Felipe:** pegar las tres migraciones en producción (en orden, cada una sola); crear el usuario secundario de SOL y sus
  credenciales de API, cargarlas en Vercel (Production) y mirar la primera corrida del cron; subir **una propuesta real** para confirmar
  los títulos de las columnas (el lector se escribió con los del anexo de la RS 112-2021).
