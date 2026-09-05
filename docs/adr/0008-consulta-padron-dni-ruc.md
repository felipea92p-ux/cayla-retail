# ADR-0008 — La consulta de DNI/RUC pasa por un adaptador propio, no por un proveedor amarrado

**Fecha:** 2026-09-05
**Estado:** Construido y verificado (43 pruebas, `next build` limpio, los seis estados
de pantalla vistos en el navegador). Falta que Felipe contrate un proveedor y
ponga dos variables de entorno.

## Contexto

Felipe pidió que el apartado de boletas y facturas lea el DNI de la clienta —o
el RUC de la empresa cuando es factura— y **muestre los datos para poder
verificar en pantalla que están bien** antes de emitir.

Tres hechos del terreno peruano condicionan todo lo demás:

1. **Ni RENIEC ni SUNAT publican una API REST abierta.** Todo el mercado pasa
   por intermediarios (Decolecta —que es además el motor de apis.net.pe—,
   Factiliza, apidni, y varios más). Todos cobran por consulta, todos exigen un
   token, y algunos cambian de dominio o desaparecen: al investigar esto se
   encontró un reporte público de que uno de ellos "no está funcionando en
   2026".
2. **Nubefact, el OSE ya elegido en ADR-0005, no sirve para esto.** Su API es
   para *emitir* comprobantes, no para consultar el padrón. Son dos
   integraciones distintas con dos proveedores distintos.
3. **Un RUC dado de baja o "no habido" no es un detalle cosmético.** SUNAT
   rechaza la factura emitida a ese receptor y la clienta pierde el crédito
   fiscal — con el correlativo ya consumido y sin forma de deshacerlo.

## Decisión

**DECIDÍ:** una capa de adaptadores propia (`apps/web/lib/padron.ts`) con tres
proveedores ya implementados, elegidos con dos variables de entorno
(`PADRON_PROVEEDOR`, `PADRON_TOKEN`), detrás de una ruta de servidor
(`/api/padron`) que el navegador consume. Y la validación estructural del
número —incluido el **dígito verificador del RUC (módulo 11 de SUNAT)**— vive
aparte, en `packages/shared/src/documento.ts`, sin red y sin token.

**DESCARTÉ: llamar a la API del proveedor directamente desde el navegador**,
porque el token viaja en el bundle: cualquiera con la consola abierta lo copia
y consume la cuota pagada de CAYLA. Además choca con CORS.

**DESCARTÉ: amarrar el código a un solo proveedor** (que era lo más corto de
escribir), porque el día que suba el precio, caiga o desaparezca —cosa
documentada que ya le pasó a uno de ellos— habría que abrir el formulario de
facturación para cambiar de proveedor. Con adaptadores, es cambiar dos
variables de entorno y volver a desplegar.

**DESCARTÉ: una tabla nueva `clientes` para cachear las consultas.** La memoria
durable ya existe y es `comprobantes`: si a ese documento ya se le emitió algo,
el nombre está en casa — gratis, instantáneo, y disponible aunque el padrón esté
caído. La ruta busca ahí antes de gastar una consulta. Una tabla más habría
duplicado la fuente de verdad del nombre de una clienta sin resolver nada que
`comprobantes` no resuelva.

**SE ROMPE SI:** un proveedor cambia los nombres de sus campos JSON sin avisar
(no hay contrato versionado). Mitigación: cada campo se lee de una lista de
nombres posibles, y `lib/padron.test.ts` prueba las tres formas documentadas —
si mañana entra un cuarto proveedor, se agrega su caso ahí y se ve al instante
qué se rompe. **También se rompe si** SUNAT cambia el algoritmo del dígito
verificador (no ha cambiado en décadas; y si cambiara, tres RUCs reales en
`lib/documento.test.ts` fallarían de inmediato).

## Degradación (principio 9: todo falla, todo el tiempo)

El sistema **nunca** bloquea una emisión porque una API de un tercero no
respondió. En orden, lo que sigue funcionando cuando cada pieza cae:

| Qué está caído | Qué sigue funcionando |
| --- | --- |
| No hay proveedor contratado (**hoy**) | Validación de formato + dígito verificador del RUC; nombre a mano. La pantalla lo dice con esas palabras. |
| El padrón no responde / se agotó la cuota | Lo anterior + el nombre de un comprobante anterior a ese mismo documento. |
| Internet caído | Validación de formato y dígito verificador (son puro cálculo local). |

Tope de 5 segundos por consulta: quien atiende no se queda mirando un spinner
porque la API de un tercero está lenta.

## Hallazgo lateral que se arregló en el camino

El `middleware.ts` redirigía **toda** petición sin sesión a `/login`, incluidas
las rutas de API. Un `fetch()` sigue ese redirect en silencio, recibe el HTML
del login e intenta leerlo como JSON: el formulario terminaba diciendo "no se
pudo consultar" cuando lo que había pasado era que la sesión venció. Ahora
`/api/*` sin sesión devuelve `401 {"error":"Sesión vencida. Vuelve a entrar."}`.
Esto también destapaba el mismo problema en `/api/export/inventario`, que ya
traía su propio control de sesión y nunca llegaba a ejecutarlo.

## Cómo se activa

1. Contratar uno de: `decolecta` (decolecta.com), `apisnetpe` (apis.net.pe) o
   `factiliza` (factiliza.com).
2. En Vercel → Settings → Environment Variables:
   - `PADRON_PROVEEDOR` = uno de esos tres nombres, tal cual.
   - `PADRON_TOKEN` = el token del proveedor.
3. Volver a desplegar. Nada más: ninguna migración, ningún cambio de esquema.

## Cómo se revierte

Borrar `apps/web/app/api/padron/`, `apps/web/lib/padron.ts`,
`apps/web/components/ConsultaDocumento.tsx`,
`packages/shared/src/documento.ts` y sus pruebas, y devolver a
`ComprobantesPanel.tsx` los dos campos de texto sueltos que tenía antes. No hay
nada que revertir en la base de datos: esta funcionalidad no toca el esquema.
