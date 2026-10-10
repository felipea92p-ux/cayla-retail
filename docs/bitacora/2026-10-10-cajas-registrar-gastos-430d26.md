## 2026-10-10 (Caja ▸ Registrar ingreso reemplaza a «Depósito o retiro», ADR-0371)
Qué hice: la cabecera de Caja dice «Registrar gasto» y «Registrar ingreso»; también cambiaron la tarjeta «Hacer» y la barra del celular. `IngresoRapidoModal` usa la misma hoja y el mismo mosaico que el gasto rápido, con seis conceptos: caja fuerte, lo trae el líder, otra sede, vuelve de un retiro, sobrante (solo el líder) y otro. Cada uno pide su dato y la guía de foco acompaña. Retiro y depósito se abren con un enlace al pie de las dos hojas. La migración `20261010160000` suma cuatro motivos de entrada a `registrar_movimiento_caja`.
Por qué así: casi toda entrada caía en «Otro» y al cerrar nadie sabía de dónde salió la plata; un retiro no es un gasto, así que no podía desaparecer.
Felipe se lleva: probado en local (otra sede, S/ 120,50, guardado con motivo, nota y token; 375 px y modo oscuro), con la base restaurada a su foto. **Pendiente tuyo: aplicar `20261010160000` en producción antes de publicar la web.**

## 2026-10-10 (cada ingreso de caja baja la cuenta de donde sale, ADR-0371 act. b)
Qué hice: `registrar_ingreso_caja` y la columna `movimientos_dinero.caja_ingreso_id` (`20261010170000`). Ahora la caja fuerte, el efectivo por rendir y el cajón de la otra sede bajan en la misma operación, o la entrada queda como aporte del dueño, y el flujo y el balance la leen así. En «Lo trae el líder» la hoja pregunta de qué plata es. Quité «Compra de insumos» de las salidas y cerré un hueco viejo: los motivos de sistema se podían tipear sueltos por un NULL.
Por qué así: sin esto, la plata de la caja fuerte se contaba dos veces y el flujo la leía como si CAYLA la hubiera ganado. Es el espejo de cómo ya se respaldaba lo que sale de un cajón.
Felipe se lleva: 31 casos contra Postgres (`pnpm pruebas:caja-ingresos`, en el CI) y las pruebas de Finanzas y Caja en verde; probado en el navegador con la base restaurada (respeté un cambio de otra sesión en `modulos`). **Pendiente tuyo: aplicar 160000 y 170000 en producción, en ese orden, antes de publicar.**

## 2026-10-10 (las dos migraciones de Registrar ingreso, en producción)
Qué hice: apliqué `20261010160000` y `20261010170000` en producción por el MCP de Supabase, a pedido de Felipe (versiones `20261010144148` y `20261010144250`). Antes verifiqué que cada ancla apareciera una sola vez y que la huella del disparador fuera la revisada; después revisé cada función, la columna nueva y los permisos.
Por qué así: los parches por ancla se detienen solos si producción no es la que se revisó; las dos se aplicaron sin error.
Felipe se lleva: la web ya puede publicarse (la hoja llama a `registrar_ingreso_caja`, que ya existe). Pendiente: refrescar el diccionario desde un volcado nuevo.
