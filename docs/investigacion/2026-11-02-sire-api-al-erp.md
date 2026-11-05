# SIRE por API en el ERP: ¿se puede, para qué sirve y hace falta hoy? (2026-11-02)

**Alcance:** solo investigación, no se construye nada. **Commit analizado:** `9923a1484` (main, 2026-11-02).
**Pregunta de Felipe:** «Analiza a profundidad si es posible integrar el SIRE mediante una API al ERP, para qué serviría,
qué beneficios traería y si es necesario actualmente».

Nada de aquí es asesoría tributaria. Lo técnico sale de los manuales oficiales de SUNAT (leídos, no resumidos de
blogs); lo de quién está obligado y quién presenta lo confirma el contador.

---

## Respuesta corta

1. **Sí se puede.** SUNAT publica una API REST oficial del SIRE, una para Ventas (RVIE) y otra para Compras (RCE).
2. **Pero no hace todo:** el último paso, **«Generar» el registro (lo que deja la constancia), no está en la API**:
   se hace en el portal SOL. La API llega hasta «registrar el preliminar».
3. **Pide la Clave SOL** de la empresa (o de un usuario secundario) guardada en el servidor. Es la llave tributaria
   de CAYLA: ese es el costo principal, más que el código.
4. **El beneficio real no es «presentar el SIRE desde el ERP»** (eso el contador lo hace en minutos en el portal). Es
   **comparar**: la propuesta de compras de SUNAT es la lista oficial de **todas las facturas electrónicas que los
   proveedores emitieron al RUC de CAYLA**. Cruzarla con Compras y Gastos encuentra crédito fiscal de IGV perdido,
   compras que nadie registró y facturas emitidas a tu RUC que no reconoces.
5. **¿Hace falta hoy? No por API.** Hace falta primero la reunión con el contador (quién presenta el SIRE, pendiente
   desde el 2026-10-15). Después, el mismo beneficio se consigue **subiendo al ERP el archivo de la propuesta** que se
   descarga del portal: cero Clave SOL en el sistema, cero dependencias nuevas. La API se justifica solo si ese
   archivo se sube cada mes y subirlo duele.

---

## 1. Qué es el SIRE y qué le toca a CAYLA

El SIRE (Sistema Integrado de Registros Electrónicos) reemplaza al PLE para el Registro de Ventas e Ingresos (RVIE) y
el Registro de Compras (RCE). SUNAT arma cada mes una **propuesta** con los comprobantes electrónicos que ya recibió
(los que CAYLA emitió por Lucode y los que los proveedores emitieron a su RUC); el contribuyente la **acepta**, la
**reemplaza** o la **completa**, y luego la **genera**.

- La RS 000125-2026/SUNAT (30-jun-2026) dice que todo sujeto obligado a llevar el Registro de Ventas y el de Compras
  «lo haga de manera conjunta a través de dicho sistema», y posterga al **periodo octubre 2026** el último grupo
  (principales contribuyentes de más de 2 300 UIT). Para el resto, el SLE-PLE se cerró en **setiembre 2026**.
- Para el Régimen MYPE Tributario, la página de SUNAT y fuentes secundarias dan **agosto 2024** como inicio para quien
  ya llevaba esos registros.
- CAYLA: RUC 20605964550, RMT (ADR-0485, «por confirmar»), unas **324 UIT en 2025** (ADR-0417). Lleva Registro de
  Ventas y de Compras por régimen, así que **casi con seguridad ya está obligada al SIRE**, y el contador lo presenta
  hoy en el portal. **Confirmar con el contador** (es la pregunta abierta en `docs/backlog/2026-10-26-tax-module-review-8c3198.md:8`).

Consecuencia: **la obligación legal no depende del ERP.** La API es una comodidad, no un requisito.

## 2. Cómo funciona la API (manuales oficiales)

Fuentes: *Manual del servicio API del RVIE* v31 (carpeta 2026-09) y *Manual de servicios Web API SIRE Compras* v28,
ambos en cpe.sunat.gob.pe.

**Acceso**
- En SOL: *Empresas ▸ Credenciales de API SUNAT ▸ Gestión*, se registra la aplicación, se marca la URI
  «MIGE RCE y RVIE - SIRE» y SUNAT entrega `client_id` y `client_secret`.
- Token: `POST https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/` con
  `grant_type=password`, `scope=https://api-sire.sunat.gob.pe`, `client_id`, `client_secret`,
  **`username = RUC + usuario SOL`** y **`password = Clave SOL`**. Luego `Authorization: Bearer <token>`.
- «Los servicios del API SIRE **no deben ser consumidos desde un cliente Web**» (CORS): en CAYLA iría solo en el
  servidor (route handler o cron), nunca en el navegador. Igual que Lucode y el padrón hoy.

**Qué se puede hacer (≈37 servicios en Ventas, ≈61 en Compras)**

| Grupo | Servicios clave | Cómo responde |
|---|---|---|
| Leer | consultar periodos, **descargar propuesta** (`…/rvie/propuesta/web/propuesta/{AAAAMM}/exportapropuesta`, en txt o xls), descargar no incluidos, resumen, inconsistencias, **reporte de casillas** (lo que va al 621), RCE por periodo, reporte CAR, constancia | Asíncrono: devuelve un **ticket**; se consulta (`…/consultaestadotickets`) hasta el estado «06 Terminado» y se baja el zip |
| Escribir | **aceptar propuesta** (`…/{AAAAMM}/aceptapropuesta`), **registrar preliminar**, excluir o incluir comprobantes, eliminar del preliminar, tipo de cambio | Ticket o vacío si terminó |
| Subir archivos | reemplazar propuesta, importar nuevos comprobantes, ajustes posteriores, no domiciliados | Protocolo **TUS** (subida reanudable); el manual dice que esos clientes «deben ser desarrollados en el lenguaje JAVA» |
| **Generar el registro** | **no existe en la API**: registrar preliminar sirve para «continuar con la Generación en el portal WEB de SUNAT» | — |

**Lo que eso significa para CAYLA (Next.js + Supabase en Vercel)**
- **Leer** es fácil: `fetch` desde el servidor, como `lib/lucode.ts`. Un cron diario o mensual pide el ticket y otro
  lo recoge.
- **Escribir con archivos (TUS)** es lo caro: SUNAT solo documenta Java. Existen clientes TUS en JavaScript, pero SUNAT
  no los respalda; si algo falla, no hay a quién preguntarle. Es justo lo que CAYLA **no** necesita (ver §4).
- **Aceptar y registrar preliminar** sí son REST simples, pero tocan el registro legal: en este repo eso exige el OK
  de Felipe y del contador (CLAUDE.md, «Reglas de ejecución»; ADR-0433:12).

**Una API hermana que no pide Clave SOL:** la *Consulta Integrada de Comprobante de Pago*
(`POST https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/{RUC}/validarcomprobante`) usa
`grant_type=client_credentials` (solo `client_id`/`client_secret`). Dice si **una** factura de proveedor existe y está
aceptada o anulada. No da la lista del mes, pero sirve para validar cada factura al registrarla, sin la llave maestra.

## 3. Qué tiene ya el ERP (lo que la integración reusaría)

- **Ventas:** `comprobantes` guarda tipo, serie, número, cliente, base, IGV, total y el estado que devolvió SUNAT vía
  Lucode, por comprobante (`lib/lucode.ts`, `lib/consultar-comprobante.ts`). Producción declara a SUNAT real desde el
  2026-09-29 (ADR-0278, ADR-0378). Volumen: ~1 100 a 2 800 comprobantes al mes.
- **Compras:** `compras` guarda proveedor (`proveedores.ruc`), tipo, serie, número, fecha de emisión, base, IGV y
  total, con candado de duplicado por proveedor+serie+número. Son **unas decenas de facturas al mes** (ADR-0482). Gastos
  y gastos de viaje también llevan comprobante; el QR de la factura ya llena RUC, serie y número y avisa si no está a
  nombre de CAYLA (ADR-0588). **No hay columna de moneda** (una factura en dólares no se distingue).
- **Impuestos:** calcula el IGV mensual (`fn_impuestos_panel`) y descarga **CSV de apoyo** con forma del PLE 14.1 y
  8.1 (`fn_impuestos_registro_ventas/compras`, `lib/impuestos-reglas.ts:459-620`). D-36: «los libros los arma el
  contador; el sistema le entrega un reporte limpio».
- **SIRE:** cero código. Solo maquetas (`docs/maquetas/finanzas-v2-2026-10/conexiones.html:389`, «bandeja del SIRE»,
  «Fases 3 y 4» sin plan escrito) y preguntas al contador.
- **Credenciales SUNAT:** ninguna. ADR-0005:106 dice que la Clave SOL la maneja Felipe y que «Claude nunca toca esta
  credencial».

Los datos para cruzar ya están: tipo + serie + número + RUC del emisor + fecha + IGV son la clave de una línea del
SIRE.

## 4. Para qué serviría, de mayor a menor beneficio

**1. Compras: encontrar lo que falta o sobra (el beneficio grande).**
La propuesta del RCE trae todas las facturas que SUNAT recibió a nombre de CAYLA. Cruzada con `compras` + `gastos` +
`gastos_viaje` + `comprobantes_produccion` da tres listas:
- **En SUNAT y no en el ERP:** una compra o un gasto que nadie registró (el margen y el IGV del mes salen mal), o una
  factura emitida a tu RUC que nadie reconoce (alguien usa el RUC de CAYLA).
- **En el ERP y no en SUNAT:** el proveedor no la transmitió o la anuló. **Ese IGV no da crédito fiscal**: se paga de
  más sin saberlo.
- **En los dos con montos distintos:** error de digitación en base o IGV.
Con ~9-40 facturas al mes el ahorro es moderado, pero la consecuencia (pagar IGV de más, o un gasto oculto) es la
misma que el ERP ya persigue en «Antes de declarar» (`lib/impuestos-antes-reglas.ts`).

**2. El IGV del ERP contra el de SUNAT.** El **reporte de casillas** es la cifra que SUNAT pondría en el 621. Si
`fn_impuestos_panel` no coincide, se sabe antes de que el contador declare, no después.

**3. Ventas: confirmar que todo lo de Lucode llegó.** El ERP ya conoce el estado de cada comprobante (ADR-0386). La
propuesta del RVIE sería una segunda verificación mensual: útil para notas de crédito y anulaciones, pero la mayor parte
ya la cubre Lucode. Beneficio bajo.

**4. Aceptar la propuesta desde el ERP.** Ahorra unos clics al contador y aun así tiene que entrar al portal a
generar. Beneficio casi nulo, y riesgo legal. **No recomendado.**

## 5. Lo que cuesta y lo que puede salir mal

- **La Clave SOL en el servidor.** Con ella se declara, se paga, se cambian datos del RUC y se emiten comprobantes.
  Mitigación: un **usuario secundario SOL** con perfil limitado al SIRE, guardado como variable de entorno de Vercel
  (como `LUCODE_TOKEN`), nunca en la base. *Verificar en SOL que el perfil del secundario alcanza para el token del SIRE.*
- **Principio 9 (todo puede fallar).** La API es asíncrona por tickets y SUNAT cambia el manual seguido (Ventas va en
  la v31, Compras en la v28). Si no responde, el ERP muestra «la comparación con SUNAT no está disponible», nunca
  bloquea el cierre ni la venta.
- **Mantenimiento:** el formato del txt de la propuesta cambia con las resoluciones. Es la misma carga con API o con
  archivo subido; la API suma el token, los tickets y los reintentos.
- **Seguridad del repo:** el repo es público. Ningún `client_id`, informe con RUC de proveedores ni ejemplo real va a
  un archivo versionado.

## 6. Recomendación: tres escalones, cada uno solo si el anterior dio fruto

**Escalón 0 — ya, sin código (Felipe con el contador).** Confirmar: (a) ¿CAYLA lleva el SIRE y desde qué periodo?
(b) ¿quién acepta o completa la propuesta cada mes? (c) ¿el contador ya compara la propuesta de compras contra algo, o
la acepta tal cual? (d) ¿le sirve el CSV actual o prefiere el formato del SIRE? Sin estas respuestas, construir es un
salto de fe (principio 7).

**Escalón 1 — cuando haya un mes cerrado con el contador: «Subir la propuesta del SIRE».** En Impuestos, el líder sube
el txt o xls de la propuesta de compras (y opcionalmente la de ventas) que baja del portal. Una función pura
(`lib/sire-propuesta-reglas.ts`, con su prueba) lo lee y lo cruza con lo del ERP, y la pantalla muestra las tres listas
del §4.1 dentro de «Antes de declarar». Da **el 90 % del beneficio** sin Clave SOL, sin TUS ni Java, sin cron, y sin
nada que pueda caerse. Si se hace, conviene añadir antes la moneda a `compras`.

**Escalón 2 — solo si el 1 se usa cada mes y subir el archivo es el cuello de botella: API de solo lectura.** Con un
usuario SOL secundario: token → descargar propuesta → ticket → zip, más el reporte de casillas, en un cron del
servidor que deja el resultado donde el escalón 1 ya sabe leer. **Nunca** aceptar, registrar preliminar ni subir
archivos desde el ERP sin un ADR y el OK de Felipe y del contador. Opcional y aparte: validar cada factura de proveedor
al registrarla con la *Consulta Integrada* (sin Clave SOL).

**Lo que no se recomienda:** que el ERP presente el SIRE. La generación final sigue en el portal, y mover el registro
legal desde el ERP agrega riesgo sin quitar trabajo real.

---

## Fuentes

- Manual del servicio API del RVIE v31: https://cpe.sunat.gob.pe/sites/default/files/2026-09/Manual%20del%20servicio%20API%20del%20Registro%20de%20Ventas%20e%20Informaci%C3%B3n%20Electr%C3%B3nica.%20v31_1.pdf
- Manual de servicios Web API SIRE Compras v28: https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual%20de%20servicios%20Web%20Api%20-%20SIRE_Compras%20v28.pdf
- Manual de Consulta Integrada de Comprobante de Pago v2: https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual-de-Consulta-Integrada-de-Comprobante-de-Pago-por-ServicioWEB_v2_0.pdf
- RS 000125-2026/SUNAT: https://www.sunat.gob.pe/legislacion/superin/2026/000125-2026.pdf
- Portal SIRE: https://sire.sunat.gob.pe/
- RMT obligado al SIRE (secundaria): https://misha.pe/tributario/regimen-mype-tributario-obligado-sire-sunat/
- Investigación previa: `docs/investigacion/2026-10-26-impuestos-obligaciones-y-cobertura.md`
