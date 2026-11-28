# 2026-11-28 · Las casillas de la prenda ya están en producción (ADR-0700)

Qué hice: comprobé que `20261124201000` (las casillas como lista que edita el Admin) y `20261126211000` (las casillas al eliminar y fusionar una prenda) están en producción desde el 2026-11-26, pegadas antes de fusionar el PR #2004, y corregí el ADR-0700, su backlog y el mapa, que seguían diciendo «solo en local».
Por qué así: el SQL Editor no deja fila en el historial de migraciones, así que se comprueba el efecto: el md5 de las diez funciones (sin comentarios, en los dos lados), sus permisos, la tabla con RLS, el bloque de Recibir y cuándo se creó la tabla (16:31 de Lima).
Qué se rompería sin esto: un registro que dice «falta pegar» lleva a otra sesión a pegarla de nuevo (no cambiaría nada: es idempotente) o a creer que la web en producción llama a funciones que no existen.
Probado: consultas de solo lectura a producción el 2026-11-28; nadie usó las casillas todavía (ninguna prenda marcada) y las listas de tejidos y marcas siguen vacías.
