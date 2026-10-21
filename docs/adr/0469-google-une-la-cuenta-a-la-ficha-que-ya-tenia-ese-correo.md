# ADR-0469 — Entrar con Google une la cuenta a la ficha que ya tenía ese correo (con cinco candados)

- **Fecha:** 2026-10-21 · **Estado:** código, base y pruebas listos en local (prueba de base 38/38, web 570 archivos, tienda 49, tipos, Knip, ESLint) y mirado en el
  navegador (Avisar y Deshacer la unión). **La migración `20261021170000` está pegada en producción desde el 2026-10-21** (Felipe lo pidió; verificada por permisos, RLS y la regla del nombre). **Google no se probó de punta a
  punta** (sigue faltando el cliente de Google Cloud en local); lo que sí está probado es cada decisión de la base y cada paso del ERP.
  Rama `claude/google-login-auto-existing-account-7ace9a`.
- **Pedido:** Felipe, 2026-10-21: quien ya tiene una ficha en CAYLA y entra con Google debería entrar solo, no leer «tu correo ya está registrado con otros datos,
  acércate a una tienda». Decidió con `AskUserQuestion` **la opción B** (unir directo por el correo que Google confirmó) **con candados** para no abrir una brecha de identidad.
- **Relacionados:** ADR-0438 (cuenta simple, Google), ADR-0408 (la tienda online), ADR-0288 (el Club y Avisos), ADR-0306 (un módulo es una entrada del menú).

## El problema

`tienda_registrar_cuenta_simple` rechaza todo correo que ya es el de contacto de OTRA ficha (`cuenta_correo_de_otra_persona`), porque sin documento no sabe si es la
misma persona. Con una ficha abierta en caja (con el correo que una colaboradora escribió y nadie confirmó), la persona entra con Google, Google demuestra que
controla ese correo… y la tienda igual la manda a una tienda. El freno protegía de un riesgo real, pero con Google ya hay una prueba que la regla no usaba.

El riesgo que sigue existiendo con la opción B: la colaboradora escribió MAL el correo en caja y otra persona tiene justo ese Gmail. Entraría a «Mi cuenta» y vería
las compras, los puntos y los pedidos de una desconocida.

## Lo que se decidió

Una función nueva, `tienda_vincular_cuenta_google`, que el servidor de la tienda llama **antes** de crear una cuenta simple cuando entra alguien con Google que todavía
no tiene cuenta. Si el correo es el de una ficha y pasa **cinco candados**, la cuenta se crea apuntando a ESA ficha:

1. **Solo se une si todo cuadra:** una sola ficha con ese correo, sin archivar, sin anonimizar, sin fusionar y sin cuenta web (abierta ni cerrada). Si algo falla, el mensaje de siempre.
2. **El nombre debe parecerse:** `fn_nombres_se_parecen` (sin tildes ni mayúsculas ni orden; sin palabras de menos de 3 letras ni «del/los/las»): **dos palabras en común**, o una si
   alguno de los dos nombres tiene una sola. Más estricto que «un apellido o el primer nombre» (lo que se había propuesto): con una sola palabra común bastaría «María».
3. **Se le avisa a la dueña de la ficha por WhatsApp.** **El ERP no envía WhatsApp por su cuenta** (solo hay enlaces que una persona toca): el vínculo queda «falta avisarle» y aparece
   en **Clientas ▸ Avisos ▸ «Cuentas de Google unidas a un miembro»**, con «Avisar» (abre WhatsApp Web con el texto listo y anota quién y desde qué tienda). Una ficha sin celular queda «Sin celular».
4. **Queda registrado y se puede deshacer:** tabla `cuentas_web_vinculos_google` (correo, nombre de Google, nombre de la ficha, aviso, deshecho), actividad `vinculo_google` sin datos de la persona, y
   `desvincular_cuenta_google` —solo el líder— cierra la cuenta como al anonimizar (sin correo ni usuario; el usuario de Google se borra en el proyecto de clientes) y deja la ficha intacta.
5. **Lo que ve la cuenta se revisó:** `tienda_mi_cuenta` trae nombre, correo, código del Club, fecha del Club y cumpleaños; no hay documento, celular ni dirección que enmascarar. Cambiar el correo y
   eliminar la cuenta piden la contraseña, y quien entra solo con Google no tiene. No hizo falta tocar nada.

## Por qué así

- **Una función nueva, no un parche a `tienda_registrar_cuenta_simple`:** esa (20261017175000) puede no estar aún en producción; una nueva no depende de su md5. Y si la web se publica antes que la
  migración, la llamada falla, `siguienteTrasVincular("sin_respuesta")` dice «registrar» y todo sigue como hoy.
- **El nombre se compara en la base:** es el candado de identidad y tiene que valer aunque alguien llame la función desde otro servidor.
- **El aviso no es publicidad:** no pasa por `fn_club_avisos_pendientes` ni `registrar_aviso_enviado` (exigen publicidad vigente, tope de promociones y «responde BAJA»). Tiene su propio par de funciones bajo
  el mismo módulo `avisos_club` (ADR-0306: no hay módulo nuevo). El texto no lleva el correo completo (el aviso puede llegar a quien no es) ni el documento.
- **«Deshacer la unión» es solo del líder** y se firma sin elegir responsable (`vinculo_google_desvincular` en `acciones_sin_responsable`: un líder siempre entra con su cuenta de persona).

## Descartado

- **Avisar por correo:** si el correo de la ficha estaba mal escrito, el aviso llega justo a quien no debe.
- **WhatsApp automático:** no hay proveedor de envío en el ERP y contratarlo es una decisión de dinero y de la Ley 29733 que no es de este cambio. **Es la parte más débil de los candados:** la defensa para el
  caso del familiar con el mismo apellido depende de que una persona de la tienda toque «Avisar». Pasar a un envío automático lo decide Felipe.
- **Unir directo sin candados (B pura):** reabre el riesgo del correo mal escrito.
- **Pedir el DNI al unir (A):** más seguro, pero era justo la fricción que Felipe quería quitar.

## Se rompe si

- Alguien pone a mano un `correo` en una ficha sin que su dueña lo sepa: el vínculo se apoya en que el correo de una ficha es de su dueña.
- El servidor de la tienda llama `tienda_vincular_cuenta_google` sin comprobar con el proyecto de clientes que la sesión es de Google y de ese correo confirmado (hoy lo hace `lib/google-servidor.ts`).
- Nadie abre Clientas ▸ Avisos: el aviso a la dueña no sale. El bloque solo se ve en una tienda (no en CAYLA Global ni en el Taller).

## Pendiente

- Refrescar el diccionario de datos (`pnpm datos:generar:produccion`) ahora que la migración está en producción.
- Decidir si el aviso por WhatsApp se automatiza (proveedor de envío) o se queda como tarea de la tienda.
