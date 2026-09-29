## 2026-09-29 (En la computadora, escanear también dice «Agregada al ticket»)

Qué hice: con la cámara del teléfono, cada lectura muestra una tarjeta que vuela al ticket y dice «al ticket»; en la
computadora, con pistola o teclado, la prenda aparecía en el ticket y no se avisaba nada (solo se avisaba cuando NO
entraba: sin stock o tope). Ahora lo que entra por el campo de escaneo —pistola con o sin Enter, o código tecleado— muestra
arriba a la derecha «Agregada al ticket» con la prenda («Camisa Lara · Rosado · STD») y, desde la segunda unidad de la
misma, cuántas van («· van 2 en el ticket»). El texto es `avisoAgregada` (`lib/vender-stock-local.ts`, con pruebas) y se
pide con `agregar(v, { confirmar: true })` en `PuntoDeVenta`.

Por qué así: el título es siempre el mismo a propósito. `avisar` no apila dos avisos con el mismo texto, así que
escanear seis prendas seguidas deja UNO solo (el de la última) en vez de una fila de tarjetas que tapa la pantalla y
ofrece «Cerrar todos». Tocar una tarjeta o una fila del buscador NO lo pide: ahí la prenda se ve entrar donde se tocó
y el aviso repetiría lo que ya se ve. La cámara del teléfono queda como estaba (`silencioso`: su tarjeta ya lo dice).
Los avisos de «no entró» (agotada, en el almacén, apartada, tope) no cambian. Sin migración: solo web.

Felipe se lleva: probar en la computadora escaneando una prenda con stock → sale «Agregada al ticket» con su nombre;
escanear la misma otra vez → «van 2»; escanear otra distinta → el aviso pasa a esa (no se apilan). Con una sin stock
sigue saliendo el aviso ámbar de siempre y NO el verde. No se verificó en el navegador (el inicio de sesión de
desarrollo no se pudo automatizar): lo cubren las pruebas de `avisoAgregada`.
