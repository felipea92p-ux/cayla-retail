## 2026-10-12 (Comprobantes: «fue emitido anteriormente» ya no atasca la cola — ADR-0378)
Qué hice: cuando Lucode dice que una boleta «fue emitida anteriormente», el ERP ya no la reintenta para siempre: le pregunta su estado, baja el
XML firmado, lo compara con la boleta (número, fecha, total, cliente, líneas) y solo entonces guarda lo que dice SUNAT; si es otro documento,
queda a la vista como «número ocupado». Además, el aviso «más de 1 hora sin llegar a SUNAT» cuenta desde la emisión, y Comprobantes vacía la
cola en varias pasadas al abrirse.
Por qué así: en producción 41 de los 53 «por enviar» ya estaban en SUNAT (un primer envío cortado a los 15 s que Lucode sí procesó); el aviso
rojo alarmaba de más y esas boletas tapaban a las que de verdad faltaban. Confirmar con el XML evita dar por declarada una venta cuyo número
usó otro documento.
Felipe se lleva: al fusionar, abrir Comprobantes limpia la cola sola; un «número ocupado» es real y se revisa con Lucode. Que el trabajo
programado transmita en producción sigue siendo tu decisión.
