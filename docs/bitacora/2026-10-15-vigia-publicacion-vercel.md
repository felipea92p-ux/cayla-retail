## 2026-10-15 (Si Vercel no se entera de una fusión a main, el vigía se la pide)
Qué hice: un workflow, «Vigía de Vercel», que después de cada push a `main` mira el último commit y busca la marca que Vercel deja al
recibirlo. Si a los 3 minutos no la tiene, pide la publicación por el Deploy Hook y deja un aviso «Producción atrás de main». Si el filtro
se saltó producción, solo avisa. Antes medí: Vercel marca el commit en 5 s (máximo 9 s, 79 fusiones) y lo publica en 2,7 min. Desde el
1-sep, 2 de 837 fusiones perdieron el aviso, y la de hoy (#1115) dejó producción 47 min atrás.
Por qué así: lo que falla después de la marca ya hace ruido (X roja y correo de Vercel); lo silencioso es el aviso que no llega y el
filtro que se salta producción en verde (9-oct). Mirar el último commit de `main`, y no el del push, evita pedir de más con 6 fusiones por
hora: la versión nueva trae a las anteriores. La marca se reconoce por su enlace al proyecto y no por su nombre, porque el nombre cambió
cuando hubo dos proyectos y hoy se conectó cayla-tienda.
Felipe se lleva: ADR-0425 con las tres opciones (eligió la 1), 19 pruebas que simulan un commit sin publicación, y una tarea suya:
crear el Deploy Hook y guardarlo como secreto `VERCEL_DEPLOY_HOOK`; sin él, el vigía avisa pero no puede pedir la publicación.
