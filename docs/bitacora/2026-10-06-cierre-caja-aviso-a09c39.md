## 2026-10-06 — El aviso de cierre de caja se muda al centro de la barra (el «Marcador», ADR-0359)

- **QUÉ HICE:** la «Isla» flotante de abajo a la derecha pasó a ser una cápsula en el medio de la barra superior (maqueta 3 que eligió
  Felipe): luz, rótulo, contador de paletas y botón «Cerrar», con una pestaña que cuelga con el efectivo a cuadrar y un resplandor que
  baja hacia la página (600 px y más intenso en rojo). Sin el nombre de la tienda sobre «Caja sin cerrar». Avisa desde 15 min antes
  de la hora de cierre (7:30 p. m. para una tienda que cierra a las 7:45) y, desde la hora, la pestaña se despliega sola cada 5 min
  (7:45, 7:50, 7:55…) hasta que se cierre la caja.
- **POR QUÉ ASÍ:** el preaviso va en una función aparte (`estadoAviso`) para no mover el botón «Cerrar caja» de Caja, que usa
  `estadoRecordatorio`. La cápsula sigue montada una vez en el layout, con la misma caja que la cabecera, sin tocar `AppShell`. La
  pestaña baja cuando el número de despliegue crece, así que cargar una pantalla a mitad de camino no la abre encima del trabajo.
- **QUÉ SE ROMPERÍA SIN ESTO:** una caja que se queda abierta de noche descuadra el cajón del día siguiente; avisar 15 min antes y
  «insistir» cada 5 da tiempo de contar sin que nadie tenga que acordarse.
- **Verificado en el navegador** (base local, Tienda Trujillo con la hora movida): preaviso, los tres niveles, despliegue automático
  al minuto 15, claro/oscuro y 375 px (ahí cuelga bajo la cabecera). **Sin probar:** la despedida con una caja cerrada de verdad.
- **Ajustes del mismo día:** (1) responsive medido: la cápsula mide el hueco real de la cabecera y se achica por tramos o cuelga bajo
  ella, así que no tapa «Actividad» ni nada (probado a 1440, 1100, 768 y 320 px; el primer corte por anchos de pantalla la dejaba
  encima de «Actividad» en celular); (2) desde la hora de cierre emite ondas sin parar, como las del cambio de nivel; (3) el parpadeo
  de «desde la hora» que se vio era de la MAQUETA (el contenedor del número no era una rueda y el valor viejo y el nuevo quedaban
  lado a lado ~0,4 s por minuto); en el componente real los dos quedan apilados y se ve solo uno. La maqueta ya está corregida.
