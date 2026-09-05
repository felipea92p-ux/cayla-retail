# ADR-0005 — Facturación electrónica se construye en dos partes separadas

**Fecha:** 2026-09-04
**Estado:** Parte 1 construida y verificada en local (`0032_comprobantes.sql`); parte 2 sin empezar, pendiente de decisión con Felipe

## Contexto

Felipe pidió un apartado nuevo en Finanzas para "ejecutar la facturación
electrónica usando e implementando la API de la SUNAT" — es decir, hablarle
directo al webservice de SUNAT (SEE del Contribuyente), no usar un OSE ya
homologado como Nubefact, que era el supuesto original de `docs/BACKLOG.md`
("finanzas F3: comprobante electrónico (Nubefact/SUNAT)").

Esa diferencia importa porque no es solo un cambio de proveedor: SEE del
Contribuyente exige (a) comprar un certificado digital, (b) generar XML UBL
2.1 y firmarlo digitalmente, (c) transmitirlo por SOAP al webservice de SUNAT
(ambiente beta de homologación, después producción) y procesar el CDR
(Constancia de Recepción) o el rechazo, y (d) pasar el proceso de
homologación de SUNAT antes de poder emitir en producción. Ninguno de esos
cuatro pasos depende del código de este repo — dependen de gestiones de
Felipe (comprar el certificado, dar de alta el RUC para emisión electrónica,
correr los casos de homologación) que todavía no están hechas. `CLAUDE.md`
además marca explícitamente las integraciones con SUNAT/Nubefact como algo
que requiere confirmar antes de ejecutar, por moverse contra una API externa
real de la que depende la validez legal de cada venta.

## Decisión

Partir "facturación electrónica" en dos, y construir solo la primera ahora:

**Parte 1 (construida en `0032_comprobantes.sql`):** todo lo que es
responsabilidad nuestra sin importar quién transmita a SUNAT — reservar el
comprobante con su serie y correlativo oficial (`series_comprobantes`,
`comprobantes`), con el mismo patrón de candado (`for update`) que usa
`fn_aplicar_movimiento` contra la condición de carrera del stock, y las
reglas que ya son ciertas hoy sin depender de SUNAT (una factura sin RUC es un
estado imposible en la base, no solo una validación de formulario). El
comprobante nace en estado `pendiente` — la pantalla de Finanzas > Facturación
ya funciona para emitir y ver comprobantes, con el envío a SUNAT
explícitamente marcado como no conectado (mensaje visible en el modal de
emisión, principio de Norman: no hay ningún botón que aparente hacer algo que
no hace).

**Parte 2 (no empezada):** transmitir el XML firmado a SUNAT y procesar la
respuesta. Requiere que Felipe resuelva primero, con él, cuál de las dos rutas
tomar:

- **SEE del Contribuyente** (lo que pidió): sistema propio habla directo con
  SUNAT. Más control y sin comisión por comprobante, pero exige certificado
  digital, librería de firma XML, cliente SOAP, y pasar la homologación de
  SUNAT antes de emitir en producción — semanas de trabajo antes de la
  primera boleta real.
- **OSE (Nubefact y similares):** un proveedor ya homologado firma y transmite
  por nosotros vía REST; se integra en días, con una comisión por comprobante
  o una suscripción mensual.

## Alternativas descartadas

- **Implementar SEE del Contribuyente completo en esta misma sesión.** Se
  descartó: requiere un certificado digital que Felipe todavía no tiene
  comprado, y homologar con SUNAT antes de poder emitir el primer comprobante
  real — nada de eso es código, y construir la firma XML/SOAP sin poder
  probarla contra el ambiente de homologación real de SUNAT sería trabajo a
  ciegas, lo opuesto al principio de "pasos verificables" del repo.
- **No construir nada hasta que Felipe decida SEE vs. OSE.** Se descartó
  también: el correlativo por serie, el estado del comprobante y la regla
  "factura exige RUC" son ciertos bajo cualquiera de las dos rutas — construir
  eso ahora no se pierde después, decida lo que decida.

## Consecuencias

Finanzas > Facturación ya es una pantalla real: reserva comprobantes,
respeta correlativos oficiales por sede, y hace imposible una factura sin RUC
directamente en el esquema. Ningún comprobante emitido hoy se pierde ni se
duplica cuando se conecte el envío real — nace ya con su número definitivo.
Queda pendiente, antes de que un comprobante emitido aquí sea legalmente
válido ante SUNAT: decidir SEE propio vs. OSE con Felipe, y (si es SEE propio)
que compre el certificado digital y corra la homologación.

## Actualización 2026-09-05 — Parte 2: proveedor = Lucode (apisunat.pe), no Nubefact

Felipe ya tiene una relación comercial activa con **Lucode** (plataforma
`app.apisunat.pe`, planes por volumen de comprobantes — Plan 05, S/30/mes,
500 comprobantes — más barato que el Plan API de Nubefact investigado
previamente, S/70/mes para el mismo volumen) y credenciales de sandbox ya
emitidas. Se decide usar Lucode en vez de Nubefact.

**Corrección de terminología (Ronda de investigación anterior se equivocó en
esto):** "PSE" SÍ es un término oficial de SUNAT, no una etiqueta propia de
un proveedor — existe un menú real en SUNAT Operaciones en Línea: *Empresas /
Comprobantes de pago / Factura Electrónica / Comunicación de Tercerización
con PSE / Altas de PSE* (confirmado en el manual que Lucode envió, "ALTA
PSE - SUNAT v2.pdf"). El mecanismo de Lucode es **tercerización PSE**, no
homologación OSE: CAYLA sigue registrada ante SUNAT como "SEE - Del
Contribuyente", pero autoriza a un tercero (PSE) a transmitir en su nombre —
un mecanismo distinto al de un OSE certificado (Nubefact), aunque el
resultado práctico para CAYLA (no construir firma XML/SOAP propia) es el
mismo. Verificar en la próxima sesión si esto cambia en algo el modelo de
"quién es responsable legal de la transmisión" frente a SUNAT — no se asume.

**Trámite pendiente, hace Felipe, no requiere código:** dar de alta como PSE
tercero, en SUNAT SOL con su propio RUC/clave SOL (Claude nunca toca esta
credencial), dos RUCs — `20515809822` (GIOR TECHNOLOGY S.A.C.) y
`20600337832` (VIDA SOFTWARE S.A.C.) — con fecha de inicio **mañana o
posterior** (SUNAT no permite elegir el mismo día). Esto fija la fecha más
temprana posible de arranque en producción: si el trámite se hace hoy, el
sistema puede transmitir en producción como pronto mañana, nunca el mismo
día.

**Credenciales de Lucode:** Felipe las recibió por WhatsApp (plataforma,
correo, contraseña). No se registran en este documento ni en ningún archivo
del repo — van directo a `.env.local` (gitignorado) cuando se conecte la
Fase 1, puestas por Felipe mismo.
