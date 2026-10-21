## 2026-10-20 (Catálogo ▸ Productos: filtro «Tienda» — ADR-0467)
Qué hice: una píldora «Tienda» (Todas, CAYLA, CLAURE) en los filtros de Productos. Al elegirla la lista y los conteos de las demás píldoras ven solo las prendas de esa empresa; queda en la dirección (`?empresa=`) y en «Limpiar filtros». Solo aparece si hay más de una empresa.
Por qué así: el filtro vive en la función interna que comparten la lista y los conteos, así que nunca se contradicen; sin tienda elegida todo da lo mismo que antes.
Qué se rompería sin esto: no habría forma de revisar el catálogo de CLAURE sin recorrer todo CAYLA.
Estado: código, pruebas y migración `20261021004000_productos_filtro_por_empresa` listos en la rama `claude/filtro-tienda-productos`. La migración NO está en producción y tiene que pegarse antes de fusionar.
Pendiente: pegar la migración (OK de Felipe); conteo por tienda dentro de la píldora; probar con una cuenta real y datos reales de CLAURE.
