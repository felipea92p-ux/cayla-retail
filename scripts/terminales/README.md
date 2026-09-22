# `pnpm terminales:crear` (ADR-0162)

Crea la cuenta de una **terminal de tienda**: un usuario de Auth **sin persona**, fijo a una tienda, más su fila en
`retail.terminales`. Lo corre un líder en su máquina. No se hace desde la web porque exige la llave de servicio, que
salta todo candado, y la web no debe tenerla. Ver «Por qué se crea con un script» en `docs/adr/0162-terminales-sin-persona-como-dynamic.md`.

```bash
# La URL y la llave, solo para este comando. Nunca en un archivo del repo.
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<llave de servicio> \
pnpm terminales:crear TRU ventas

pnpm terminales:crear AQP administrativa --cambiar-clave   # clave nueva para una que ya existe
pnpm terminales:crear --help
```

- **Crear:** el correo es `terminal-<tipo>-<tienda>@cayla.pe` y el nombre, «Terminal Ventas TRU». Antes de crear,
  muestra a qué proyecto apunta y pide escribir `SI`. Se detiene si la tienda ya tiene una terminal de ese tipo,
  activa o desactivada. Una desactivada se **reactiva** en Colaboradores ▸ Terminales; no se crea otra.
- **`--cambiar-clave`:** no crea nada. Le pone una clave nueva a la terminal existente, y la anterior deja de servir.
- **La clave se muestra una sola vez** y no se guarda en ningún lado. Son 4 grupos de 5 caracteres, sin 0/O ni 1/l/I,
  para teclearla a mano en el aparato.
- **Si la fila no entra en `retail.terminales`**, borra el usuario de Auth que acababa de crear. Ese usuario nunca
  inició sesión ni tiene historial. Así no queda una cuenta capaz de entrar sin ser una terminal.
- **Desactivar o reactivar** se hace en la web (Colaboradores ▸ Terminales), no aquí.

Las partes puras (argumentos, correo, nombre, tienda y clave) se prueban sin red con `pnpm terminales:probar`.
