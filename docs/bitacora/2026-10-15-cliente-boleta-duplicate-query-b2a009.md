## 2026-10-15 (La boleta usa el nombre de la ficha del cliente y no vuelve a consultar el padrón)
Qué hice: en Vender, con un cliente en el ticket, elegir boleta o nota de venta ya no le pregunta a SUNAT/RENIEC por su DNI:
la tarjeta muestra el nombre de su ficha con «De la ficha del cliente» y ese es el que se imprime. La regla es pura y probada
(`nombreDeFichaParaComprobante`, `lib/clienta-ticket-reglas.ts`) y `ConsultaDocumento` aprendió a recibir un nombre `conocido`.
Por qué así: el DNI ya pasó por el padrón al registrar al cliente, y repetirlo gastaba una consulta y una espera en el
mostrador. Es la regla de Apartados: primero la ficha, después el padrón. Si se corrige un dígito ya es otra persona y se
consulta como siempre; la factura (RUC) no cambia: su estado y condición se vuelven a mirar cada vez.
Felipe se lleva: verificado en local a escritorio y a 375 px, mirando la red: con el DNI del cliente, cero llamadas a
`/api/padron`; con un dígito cambiado, una; y al volver al DNI del cliente, el comprobante vuelve a llevar el nombre de su ficha.
De punta a punta: un cliente registrado en el momento (DNI inventado, el padrón consultado UNA vez al registrarlo) → boleta →
cobro en efectivo: B001-000004 guardada con su nombre y DNI de la ficha y la venta ligada a él, sin segunda consulta. La base
local volvió a su foto (`estado.mjs`, «idéntico»).
