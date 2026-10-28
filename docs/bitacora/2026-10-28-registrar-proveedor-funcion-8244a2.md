## 2026-10-28 (Registrar un proveedor nuevo desde «¿Quién hace…?» y Nueva orden)
Qué hice: el combo «Proveedor» de una fase que sale afuera trae «+ Registrar proveedor nuevo», que abre el alta de proveedores de Producción sin salir de la hoja y deja al nuevo elegido en esa fase.
Por qué así: quien hace el corte o la costura y todavía no estaba en el directorio dejaba la fase sin salida (el combo solo listaba los ya registrados); se reutiliza `guardar_proveedor_produccion`, sin tocar la base.
Qué se rompería sin esto: no se podía asignar una fase a un servicio nuevo sin abandonar la orden, registrarlo en Producción ▸ Proveedores y volver a empezar.
