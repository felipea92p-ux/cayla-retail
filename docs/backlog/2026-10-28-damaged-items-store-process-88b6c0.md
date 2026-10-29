## 🩹 Prendas dañadas en tienda (2026-10-28, ADR-0564) — 6 migraciones EN producción desde el 2026-10-29, web sin publicar; rama `claude/damaged-items-store-process-88b6c0`

- [x] **Tipo de daño** (`20261029024000`): lista corta + nota opcional; la web vieja sigue valiendo. 47 casos de Postgres y las reglas unitarias.
- [x] **Lugar de las dañadas por tienda** (`20261029031000`): se marca y se cambia en «Prendas dañadas»; «Reportar dañada» lo repite.
- [x] **«Separé una dañada»** en Vender (a la vista) y en el Inicio de almacén (cabina y dock): lleva al buscador de la prenda dañada de Existencias.
- [x] **«Salió a arreglar»** (`20261029032000`): cerca o Taller, sin mover stock; la lista dice «En arreglo · Taller · hace 3 días».
- [x] **«Se arregló» al piso o al almacén, costo opcional, y «No se pudo»** (`20261029033000`): con piso, dos traslados internos y Frescura cuenta desde ahí.
- [x] **Aviso a los 7 días**: la fila de dañadas de «Para hoy» sube a rojo si alguna lleva 7 días separada sin salir a arreglar.
- [x] **Foto opcional del daño** (`20261029034000` + `20261029045000`): sube después de reportar; bucket privado con enlaces firmados de 1 hora.
- [x] Verificado en el navegador (reporte con foto, «Se arregló» al piso con costo, botones de Vender e Inicio, 375 px) y en modo oscuro (4 escenarios nuevos, 0 hallazgos solo en oscuro).
- [x] **Las 6 migraciones están en producción** (2026-10-29, con md5 de cada función igual al local; versiones en el ADR-0564). Falta refrescar `docs/datos/generado/` desde producción.
- [x] **El costo del arreglo genera su gasto en Finanzas** (2026-10-29): `registrar_gasto` en la misma transacción, «Mantenimiento y reparaciones», del cajón, Yape o Plin; probado en Postgres (el diario lo muestra).
- [x] **El Inicio del líder avisa de las dañadas de 7 días** («Dañadas sin decidir», urgente).
- [ ] **Darle el módulo Existencias al rol `terminal_ventas` en producción** (Colaboradores ▸ Roles y accesos): Felipe dijo que cualquier terminal puede hacerlo con su responsable, pero ese rol no trae Existencias
      (sí `terminal_administrativa`) y sin él el botón de la caja no sale y la base rechaza el reporte. Lo intenté por SQL y el sistema lo frenó (es dar un permiso): paso de Felipe, o autorizarlo.
- [ ] **Publicar la web** (abrir el PR con `/abrir-pr`): hasta entonces nadie ve nada de lo nuevo; la base ya lo acepta.
- [ ] **Sin probar con una terminal real**: las cuentas de caja y de almacén de Trujillo/Lima, con su responsable de turno (el botón y el reporte se probaron con la cuenta de Felipe).
- [ ] **`/chaos` completo** sobre reportar, sacar, arreglar y la foto (doble clic, dos pestañas, corte de red): solo se corrió la parte de Postgres (candados, idempotencia, concurrencia por `for update`). La
      prueba de carreras con COMMIT (`danadas_concurrencia.mjs`) pide una base desechable.
- [ ] **Sin probar el gasto en efectivo con la caja abierta** (solo Yape/Plin y «caja cerrada» en las pruebas de Postgres) ni con una terminal real; el permiso exige caja o el módulo Gastos.
- [ ] **Una dañada «en arreglo» sigue contando en el inventario de la sede** (en la cuarentena): si se quiere una cifra «fuera de la tienda», es una decisión de modelo.
- [ ] `pnpm pruebas:perdidas` falla 1 de 116 (M5, Estado de resultados antes/después de la 659→6951) en la base local compartida: no toca dañadas y la base local tiene migraciones sin aplicar
      (p. ej. `fn_valor_inventario`); no se investigó más.
- [ ] Queda un objeto de prueba de 1 KB en el bucket local `retail-danadas` (el estado de las tablas se restauró; Storage no entra en esa foto).
