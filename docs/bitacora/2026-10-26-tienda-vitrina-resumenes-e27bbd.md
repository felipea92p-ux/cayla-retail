## 2026-10-26 (Tienda web ▸ Resumen y Vitrina ▸ Modelos, la Ola 1)
Qué hice: el Resumen empieza por «Lo que te pide hoy» (de 746 px a 250 px del tope), resume el camino en una línea sin pedidos abiertos y baja lo que no tiene nada que decir; la Vitrina filtra por estado, categoría y Lo nuevo detrás de un botón «Filtros» flotante, pagina de 40 en 40, deja el empaque aparte, tiene cifras compactas y una Lista que alterna entre una columna por tienda y las filas de siempre. Las hojas cargan bajo demanda y las dos pantallas tienen su silueta de carga.
Por qué así: con ~300 modelos la Vitrina era una página de ~24 000 px y el Resumen contestaba «qué te pide hoy» después de la decoración; cada decisión salió de una maqueta o un spike medido en 6 anchos, no de gusto. «Encendidos sin precio» tiene una sola definición para que el número del Resumen sea el de la lista.
Felipe se lleva: nada va a producción de la base (sin migraciones). Las decisiones que quedan suyas: extender las cifras compactas y los filtros flotantes a Looks, Probador y las demás pantallas, y si «Lo nuevo» automático debe poder filtrarse (pide cambiar `fn_vitrina_modelos`).

## 2026-10-26 (/chaos del lote «Mostrar / Ocultar» de Tienda web ▸ Vitrina ▸ Modelos, y su aviso)
Qué hice: la hoja de ocultar avisa cuando el lote deja la tienda online sin ningún modelo o oculta la mitad o más de lo que se ve («Hoy se ven 50 modelos; con esto quedarían 25»), y ataqué el lote con 21 ataques (entradas hostiles, doble clic, red cortada, respuesta perdida, recarga al guardar, dos lotes cruzados y dos sesiones a la vez); los 21 resisten y la base quedó idéntica a su foto.
Por qué así: «Elegir los N que coinciden» permite ocultar todo de un clic; es reversible, pero mientras tanto el cliente ve una tienda vacía, así que lo que se avisa es el impacto, no una pregunta de «¿seguro?». La función de la base ya traía todo o nada, orden de bloqueo e idempotencia.
Felipe se lleva: no hay nada que arreglar en el lote. Quedan sin cubrir sesión vencida, atrás/adelante y entrar por URL sin el módulo (en el navegador), y el volumen real; la rama va 183 commits detrás de `main`, así que conviene repetir el caos después de ponerla al día.


## 2026-10-26 (/formidable del Resumen: los 3 cambios, y la tarjeta de tiendas vuelve)
Qué hice: el Resumen ya no dice «Todo al día» cuando no pudo leer los pedidos (lectura caída o cuenta fuera de una tienda: «Sin novedades en lo que se pudo leer», con el motivo); la fila de «por confirmar» no repite el plazo (vive en el camino de abajo) y su enlace dice «Revisar y confirmar». Por pedido de Felipe, «Tiendas en la web» vuelve siempre junto a la ventana, que recupera su ancho.
Por qué así: «Todo al día» es una afirmación sobre lo que se leyó; sin leer, afirmar calma esconde pedidos que se cierran solos y se pierde la venta. El enlace lleva a la lista, y confirmar se hace dentro de cada pedido.
Felipe se lleva: nada va a producción de la base. Los 3 cambios de la Vitrina de `/formidable` siguen esperando su OK (el 3 toca la firma del responsable, ADR-0161).

## 2026-10-26 (/formidable de la Vitrina: los 3 cambios)
Qué hice: el interruptor de un modelo muestra u oculta al momento cuando ya se sabe quién firma (Admin o la persona de turno), con «Deshacer»; si no, abre la hoja como antes. El stock de cada carta dice «Libre:», lo que se toca responde en 24 px o más, la regla del precio se abre con «¿Qué precio ve el cliente?» y los avisos ámbar traen «¿Por qué?».
Por qué así: ocultar es reversible y pedir «¿quién eres?» en cada interruptor cobraba un paso que el sistema ya sabía; la hoja se queda donde sí protege (lotes, tienda que quedaría vacía, responsable sin resolver). La firma sigue en la base: la misma `vitrina_mostrar`.
Felipe se lleva: nada va a producción de la base. Quedan en 375 px «Filtros» (36 px) y «Vista» (40 px), que son piezas del sistema (`/unificar`), y «¿Por qué?» sin ver con un modelo sin precio real (la base local no tiene uno).
