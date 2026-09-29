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

---

## Actualización 2026-09-29 — SUNAT público como primera opción, el proveedor de pago como respaldo

**Pedido de Felipe:** usar como primera opción dos URL de SUNAT
(`ww1.sunat.gob.pe/ol-ti-itfisdenreg/itfisdenreg.htm?accion=obtenerDatosDni&numDocumento=…` y
`…accion=obtenerDatosRuc&nroRuc=…`) y, si no encuentra el número o falla, seguir con el proveedor de pago.

**Qué es ese servicio (verificado contra la respuesta real, 2026-09-29).** `itfisdenreg` es el backend del formulario
público de *denuncias* de SUNAT: al tipear un DNI o RUC prellena el nombre del «denunciado». **No es una API
documentada, no tiene contrato ni versión ni garantía de disponibilidad para terceros.** Detrás hay un firewall F5.

| Caso | Respuesta real |
| --- | --- |
| RUC existe | `{"message":"success","lista":[{"apenomdenunciado":"RAZÓN SOCIAL␠␠␠…","direstablecimiento":"AV. … - Nro: 1472  - LIMA", …}]}` |
| No existe (DNI o RUC) | `{"error":"No existen datos para los filtros seleccionados"}` con **HTTP 200**, no 404 |
| Content-Type | `text/plain`, aunque el cuerpo es JSON |
| Latencia medida | 40–500 ms |

**Decisión (mantiene la de arriba: adaptadores propios; suma una fuente):**

1. `consultarPadron` (`lib/padron.ts`) pasa a ser un orquestador: **caché → SUNAT público (tope 3 s) → proveedor de pago**.
   «No lo encuentra» y «falla» caen ambos al de pago, como se pidió. Si SUNAT contesta, el de pago **no se llama**: no
   se gasta cuota.
2. **Con SUNAT público ya no hace falta contratar proveedor** para que el padrón funcione. Sin `PADRON_PROVEEDOR`, el
   respaldo simplemente no existe; si SUNAT también falla, el motivo que se muestra es el de SUNAT (no «la consulta no
   está activada», que sería falso).
3. **Interruptor de circuito** (por instancia, como la caché): 3 fallos seguidos de SUNAT (timeout, HTTP ≠ 2xx, cuerpo
   que no es JSON —típico de una página de firewall—, formato irreconocible) la saltan 5 minutos. Sin esto, si SUNAT
   bloquea las IP de Vercel, **cada** consulta pagaría 3 s de espera antes de llegar al proveedor. «No existe ese
   número» **no** cuenta como fallo: es una respuesta válida.
4. **Palanca `PADRON_SUNAT_PUBLICO`**: vacío = DNI y RUC; `solo_dni` = el RUC va directo al proveedor; `no` = apagado.
   Cambiarla es una variable de entorno y un redeploy, no código.
5. Ante cualquier forma que el lector no reconoce devuelve `sin_respuesta` → cae al de pago. **Un formato desconocido
   nunca produce un nombre inventado.**

**Lo que se pierde, y por qué importa (decisión pendiente de Felipe).** SUNAT público para RUC trae razón social y
dirección, **pero no estado ni condición** (ACTIVO / BAJA, HABIDO / NO HABIDO). `advertenciasDe` vive de esos dos campos,
y el contexto de arriba dice por qué: una factura a un RUC de baja o no habido la rechaza SUNAT, el correlativo ya se
consumió y la clienta pierde el crédito fiscal. Con SUNAT como primera opción para RUC, **esa advertencia deja de salir**
en los RUC que SUNAT resuelve; la pantalla lo dice («No informa si el RUC está activo y habido») en vez de dejar que la
ausencia de chips se lea como «todo en orden». La emisión no se bloquea (la advertencia nunca bloqueó): SUNAT lo revisa al
transmitir vía Lucode. Si Felipe prefiere no perder esa red de seguridad en facturas: `PADRON_SUNAT_PUBLICO=solo_dni`
(RUC con estado, pagando esa consulta; DNI gratis). Se aplicó lo pedido —gratis primero en ambos— y se deja la palanca.

**Lo que NO se verificó.** Solo se vio el éxito del RUC (con el RUC de la propia SUNAT, dato público) y el «no existe»
del DNI. **El éxito del DNI no se probó con un número real**: se asume la misma estructura (`apenomdenunciado`). Si el
orden del nombre difiere del proveedor de pago (APELLIDOS NOMBRES vs. NOMBRES APELLIDOS), el nombre se ve distinto según la
fuente; no afecta a la validez de una boleta, pero conviene confirmarlo con un DNI real y normalizar el orden.
Tampoco se probó **desde las IP de Vercel**: esto solo se sabrá en producción, y el interruptor es la red por si SUNAT las bloquea.

**Se rompe si:** SUNAT cambia el formato o el nombre de los campos (el lector cae al de pago, sin nombre inventado);
retira o protege el endpoint (interruptor de circuito → de pago); o lo limita por volumen (la caché de 24 h/1 h y el tope
de 60 consultas/min por persona de `/api/padron` ya frenan un bucle desbocado).

**Datos personales.** El DNI de la clienta ahora sale primero hacia SUNAT y solo si falla hacia el proveedor de pago;
`docs/datos/06-DATOS-PERSONALES.md` §6 lo refleja.

**Pruebas.** `lib/padron.test.ts`: 45 casos, incluido el orden de fuentes, el interruptor de circuito y la respuesta real
de SUNAT. Se comprobó por mutación que rompen si el interruptor no se abre, si «no existe» cuenta como fallo o si se llama
al de pago aunque SUNAT haya acertado. Verificación real: `consultarPadron("ruc", "20131312955")` sin ningún proveedor
configurado devolvió la razón social en 218 ms.

**Cómo se revierte:** `PADRON_SUNAT_PUBLICO=no` (sin código). Para quitarlo del todo, borrar de `lib/padron.ts` la sección
«SUNAT público» y dejar `consultarPadron` llamando solo a `consultarProveedorPago`.
