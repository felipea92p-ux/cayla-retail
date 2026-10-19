## 2026-10-19 (Vitrina: un producto nuevo nace con «Se ve en la web» encendido — ADR-0457)
Qué hice: un disparador en `productos` crea la fila de la vitrina encendida cuando nace un producto aprobado o cuando se aprueba uno que nació pendiente; el empaque y los productos de prueba no entran. Los modelos que ya existían no se tocan.
Por qué así: Felipe quiere que lo que se da de alta salga en la web sin que alguien lo encienda; el disparador deja la regla en un solo lugar (todos los caminos de alta la heredan) y la tienda sigue preguntando «¿se puede vender?» en cada lectura.
Qué se rompería sin esto: cada prenda nueva quedaba fuera de la web hasta que alguien se acordara de encenderla en la Vitrina.
Felipe se lleva: pegar la migración `20261019214000` en producción (una sola parte, después de la Vitrina y «solo ropa») y decidir si lo ya existente sin fila se enciende de una vez (hoy no).
