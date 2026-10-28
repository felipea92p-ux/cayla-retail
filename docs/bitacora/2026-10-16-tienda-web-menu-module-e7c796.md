## 2026-10-16 (Nace «Tienda web» en el lateral: todo lo de la tienda online junto, con su Resumen y diseños nuevos)
Qué hice: junté en un grupo propio del lateral, después de Ventas, lo que vivía en cuatro lugares (Pedidos web, Vitrina web con Looks y
Esperan, Recomendaciones y la pestaña Tienda web de Configuración), con rutas `/tienda-web/…` y las direcciones viejas redirigiendo; nació
el Resumen («¿Qué te pide hoy la tienda web?», módulo `tienda_web`, migración `20261016174000` sin pegar) y se rediseñaron las cinco
pantallas con una ventana de navegador, un mosaico de prendas y el camino del pedido, con movimiento que entra una vez (ADR-0430).
Por qué así: cada pantalla conserva su módulo para que nadie gane ni pierda un permiso (Ajustes la sigue abriendo Configuración); el
Resumen lee con las reglas de cada pantalla, no con una función nueva, para que sus números nunca contradigan a los de su pantalla; y el
movimiento es «rico, una vez, sin bucle» porque Pedidos se atiende con un cliente esperando.
Felipe se lleva: pegar la migración del Resumen, y decidir a qué roles de tienda les da «Pedidos web» (hoy solo lo tiene «Terminal
Almacén», y un pedido que nadie confirma se cierra solo a las 24 h).
