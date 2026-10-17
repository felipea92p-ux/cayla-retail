## 2026-10-16 («Ajustes» de Tienda web pasa a ser su propio módulo: «Datos y plazos de la tienda web»)
Qué hice: Felipe vio que «Ajustes» no aparecía en Roles y accesos (la abría Configuración) y pidió que fuera módulo con un nombre menos
general. Creé el módulo `ajustes_web` (migración `20261016223000`, sin pegar en producción), la llave `fn_puede_ajustes_tienda_web()` para las
tres funciones de la pantalla, y cambié la fila del menú, la puerta de la pantalla y el Resumen al módulo nuevo; el rótulo es «Datos y plazos».
Por qué así: en producción ningún rol tiene Configuración, así que nadie pierde acceso hoy; `guardar_whatsapp_tienda` es compartida con
Tiendas y caja y acepta las dos llaves; el módulo nace solo para el líder, como manda la regla de módulos.
Felipe se lleva: pegar la migración en producción y dar «Datos y plazos de la tienda web» a quien deba cambiar lo que la web muestra de cada
tienda (hoy solo el líder). Un rol que ya tenga Configuración no lo recibe solo.
