# 2026-11-04 · Configuración, vista por vista

- «Tiendas y caja» se partió en «Metas» (la de fábrica) y «Empresa y tiendas», con mes por mes de a una tienda, las campañas pasadas plegadas y los datos fiscales en lista y no en campos: de 4,3 pantallas y 160 controles a 2,3 y 1,8. Solo presentación (ADR-0195, act. de hoy). Verificado en el navegador a 1440, 1920 y 375, en claro y oscuro; guardar una casilla, la guía (38 pasos) y la auditoría de tema, en verde.
- Maqueta de las 8 vistas en `docs/maquetas/configuracion-vistas-2026-11/`, con la propuesta de quedar en 5 pestañas y la lista de qué se quita, se junta o se muda, sacada de quién lee cada dato y del uso real en producción (lectura).
- Felipe eligió las 5 pestañas y pidió menos texto, nada muy pequeño y más visual. Tres direcciones de Empresa y tiendas, con movimiento, en `docs/maquetas/empresa-tiendas-2026-11/`; esperan su elección. Nada de esto está construido.
- Felipe eligió A · Las vitrinas y pidió subirla a vidrio líquido con gráficos sofisticados y futuristas: cada dato es un instrumento dentro de una gota (`docs/maquetas/empresa-tiendas-vitrinas-2026-11/`). Sigue sin construirse.
- Felipe pidió quitar los colores de detrás: el vidrio queda neutro y el color de la sede, solo en su aro y sus instrumentos. También se fue el vidrio que doblaba el fondo.
- Empresa y tiendas ya son Las vitrinas en el ERP, con su movimiento y su guía, y Metas dejó el fondo y la hora de cierre. Verificado en el ERP local; sin PR ni producción.
- Guardar metas y fondo ya lee lo último de la base antes de mandar la semana: una página vieja no borra lo de otra pestaña. Repetí el ataque y resiste, también en la semana de un mes.
