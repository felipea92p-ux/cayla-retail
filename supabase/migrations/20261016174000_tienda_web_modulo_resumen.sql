-- Tienda web (ADR-0430, Felipe 2026-10-16): el grupo del lateral que junta todo lo de la tienda online, y su Resumen.
--
-- EL PROBLEMA. Lo de la tienda online vivía repartido en cuatro lugares (Ventas ▸ Pedidos web, Catálogo ▸ Vitrina web, Clientes ▸
-- Recomendaciones y la pestaña «Tienda web» de Configuración). Para saber si la tienda online estaba sana había que abrir los cuatro.
--
-- 1. El módulo del Resumen (`tienda_web`): la pantalla «¿Qué te pide hoy la tienda web?». Nace SIN rol, solo para el líder, y
--    delegable (CLAUDE.md «Módulos y roles», ADR-0161): esta migración no se lo da a ningún rol. No trae funciones propias: lee con las
--    mismas lecturas de las otras pantallas del grupo, y cada una pide SU módulo. Quien tiene el Resumen sin «Pedidos web» no ve
--    los pedidos ahí: ve que existen las otras cosas que sí ve.
-- 2. En Roles y accesos, los tres módulos de la tienda online pasan al grupo «Tienda web», justo después de Ventas: el mismo lugar que
--    en el lateral, para que el líder encuentre cada uno en el mismo sitio en las dos pantallas. Solo cambia dónde se dibujan; nadie
--    gana ni pierde un módulo. Configuración se queda en «Gestión»: también abre Tienda web ▸ Ajustes, pero es mucho más que eso.
--
-- Idempotente y sin políticas: se pega en el SQL Editor de una vez (CLAUDE.md «Políticas y deadlocks»).

set lock_timeout = '3s';

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('tienda_web', 'Tienda web', 'Resumen de la tienda web',
   'Ver de un vistazo lo que la tienda online pide hoy: los pedidos por atender de su tienda, las recomendaciones sin responder, quién espera una talla, qué modelos no se ven en la web y qué le falta a cada tienda para mostrarse (cada cosa, solo si también tiene su pantalla)',
   62, false, true)
on conflict (clave) do nothing;

update retail.modulos set grupo = 'Tienda web', orden = 64 where clave = 'pedidos_web' and (grupo <> 'Tienda web' or orden <> 64);
update retail.modulos set grupo = 'Tienda web', orden = 66 where clave = 'vitrina_web' and (grupo <> 'Tienda web' or orden <> 66);
update retail.modulos set grupo = 'Tienda web', orden = 68 where clave = 'recomendaciones' and (grupo <> 'Tienda web' or orden <> 68);
