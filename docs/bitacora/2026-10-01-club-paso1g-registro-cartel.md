## 2026-10-01 (Club de clientas, tanda 1g: ella se une sola desde el cartel; el club es solo WhatsApp de promociones)

Qué hice: con cuatro agentes sobre un contrato fijado antes (ADR-0288 act. g), la tanda entera. Base: 8 migraciones
`20261001210000`–`210700` sin pegar (registro desde la página con padrón, límites e IP en huella; vale de aniversario con su
canje en `registrar_venta` y el mismo reparto al céntimo que la web; avisos por mandar con tope y grupo testigo; beneficios
editables; anonimización a los 3 años sin compras; retiro de invitar de palabra, del QR personal y del camino B). Web: la
página `/club/<tienda>` con su política y sus términos, el QR general en el cartel y el ticket, la caja con solo el
documento y la tarjeta «Pídele que escanee el cartel» que se actualiza sola, el vale en Cobrar (una ventaja del club por
compra), Clientas ▸ Avisos con «Enviar» a WhatsApp Web, «Beneficios del club» y el cron de conservación.

Por qué así: lo pidió Felipe para que la asesora no tipee datos y la clienta los deje con su consentimiento informado; la
casilla de WhatsApp es opcional para no atar el cupón a la publicidad (art. 3.2 del reglamento de la Ley 29733). Al integrar
corregí de raíz que el «¿Eres …?» del DNI prendiera el loader (pasó a `/api/club/nombre` con `x-espera: no`).

Probado a 375 px contra una copia aislada al día con main (capturas en `docs/capturas/2026-10-01-club-paso1g/`): registro
con carné de punta a punta (ficha, dos permisos con su versión y «ella misma»), padrón caído sin datos de nadie, Avisos con
«Enviar» anotado, la caja que pasa sola a socia, el cupón de cumpleaños de quien se unió desde el cartel y Beneficios.
Felipe se lleva: pegar las 8 partes en orden y fusionar después; aprobar el texto legal y las decisiones del backlog.
