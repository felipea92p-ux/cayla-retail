# `pnpm terminales:crear` (ADR-0162) — respaldo

**Lo normal, desde el 2026-09-22, es crear las terminales en la pantalla:** Colaboradores ▸ Terminales ▸ «+ Nueva
terminal» (solo un líder). Allí también se cambia la clave, el rol, y se desactiva o reactiva. La pantalla usa una Server
Action (`apps/web/app/actions/terminales.ts`) que primero pregunta a la base, con la sesión de quien llama, si es líder, y
recién ahí usa la llave de servicio (`SUPABASE_SERVICE_ROLE_KEY`, solo en el servidor).

Este script queda de **respaldo** (por ejemplo, si el servidor todavía no tiene la llave configurada). Aplica las mismas
reglas que la pantalla: las importa de `apps/web/lib/terminales-reglas.ts`.

Ya **no hay tipo** (ventas/administrativa): una terminal es **tienda + nombre + rol**. Lo que ve lo decide su rol. Puede
haber varias por tienda; dos activas de la misma tienda no pueden llamarse igual.

```bash
# La URL y la llave, solo para este comando. Nunca en un archivo del repo.
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<llave de servicio> \
pnpm terminales:crear TRU "Terminal Caja TRU"                                   # rol: «Terminal de ventas»

pnpm terminales:crear TRU "Terminal Almacén TRU" --rol "Terminal administrativa"
pnpm terminales:crear AQP "Terminal Caja AQP" --cambiar-clave                  # clave nueva para una que ya existe
pnpm terminales:crear --help
```

- **Crear:** el correo es `terminal-<tienda>-<nombre>-<4 al azar>@cayla.pe` (sin datos de ninguna persona). Antes de
  crear, muestra a qué proyecto apunta y pide escribir `SI`. Se detiene si la tienda ya tiene una terminal con ese nombre,
  activa o desactivada. Una desactivada se **reactiva** en Colaboradores ▸ Terminales; no se crea otra con su nombre.
- **`--rol`:** el nombre del rol como se ve en Roles y accesos. Nunca «Líder de equipo» ni uno archivado.
- **`--cambiar-clave`:** no crea nada. Le pone una clave nueva a la terminal de ese nombre, y la anterior deja de servir.
- **La clave se muestra una sola vez** y no se guarda en ningún lado. Son 4 grupos de 5 caracteres, sin 0/O ni 1/l/I,
  para teclearla a mano en el aparato.
- **Si la fila no entra en `retail.terminales`**, borra el usuario de Auth que acababa de crear. Así no queda una cuenta
  capaz de entrar sin ser una terminal.

Las partes puras se prueban sin red con `pnpm terminales:probar` (y a fondo, en `apps/web/lib/terminales-reglas.test.ts`).
