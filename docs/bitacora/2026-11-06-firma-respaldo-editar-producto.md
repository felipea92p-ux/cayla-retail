# 2026-11-06 · Editar producto no guardaba en las terminales de Lima (firma de respaldo)

- **Qué pasó:** en Caja Lima y Almacén Lima (terminales con `firma_respaldo_id`, ADR-0454), «Confirmar y guardar» de Editar producto decía «Elige quién hace estos cambios» aunque la hoja dijera «Esta terminal no pide responsable»: no se guardaban fotos ni ningún cambio de la ficha. Lo mismo «Cómo lo llama el proveedor».
- **Causa raíz:** `ProductoForm` y `NombreDelProveedor` decidían «¿puedo guardar?» con `if (!firma)`, pero con respaldo `useResponsable().firma()` devuelve `null` a propósito (la base firma sola). Ahora preguntan `responsable.listo`, como el resto del ERP. La base no se tocó.
- **Candado:** `apps/web/lib/firma-de-respaldo.test.ts` falla si un archivo vuelve a cortar un guardado con `if (!x)` tras `const x = ….firma()` (con el código viejo marcaba exactamente los dos archivos). Verificación final pendiente: guardar una foto desde la terminal de Almacén Lima en producción.
