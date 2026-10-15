## 2026-10-15 (Las colaboradoras se enteran cuando hay una versión nueva de CAYLA)
Qué hice: una franja discreta arriba de cada pantalla —«Hay una versión nueva de CAYLA. Termina lo que estás haciendo y actualiza.», con
«Actualizar» y «Más tarde»— que sale sola cuando la web que tiene abierta ya no es la de producción. Cada versión lleva grabado su commit; cada
pestaña a la vista pregunta cada 5 minutos a `/api/version`, y cuando no coincide, avisa. Nunca recarga sola. Mido antes de diseñar: 39
publicaciones el 14-oct (unas 6 por hora en horas de tienda) y la protección de versiones de Vercel activa a 12 h, que es justo lo que deja a una
pestaña vieja trabajando en silencio.
Por qué así: recargar sola le haría perder el ticket que se está armando en Vender (el navegador guarda las ventas por subir y los tickets «en
espera», no el que está en curso); por eso la persona decide cuándo, y «Más tarde» la calla 30 minutos. Y con 6 versiones por hora la franja
tiene que ser discreta o se vuelve ruido que se ignora. Sin sesión o sin red no dice nada: callar es la degradación correcta.
Felipe se lleva: ADR-0422 con lo descartado y lo que lo rompería, y cuatro opciones que no construí (marcar una publicación como importante,
subir de tono pasadas ~10 h, recargar en reposo, publicar en lotes). La primera publicación no avisa a nadie (las pestañas abiertas antes no traen
este código): hay que recargarlas una vez a mano.
