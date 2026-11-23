---
paths:
  - "knip.ts"
  - "scripts/knip/**"
---

## Código muerto: Knip en el CI (regla — ADR-0406, Felipe 2026-10-14)

**El CI corre `pnpm knip` y pone el PR en rojo si hay un archivo que nadie importa, una exportación que nadie lee, una dependencia que
nadie carga o un binario sin declarar** (en todo el monorepo, ~3 s; la configuración y el porqué de cada excepción, en `knip.ts`). Las
pruebas cuentan como uso. **La otra mitad la vigila `pnpm knip:produccion`** (`knip --production`, ADR-0406 act. b): lo que SOLO usan
las pruebas, porque ninguna pantalla lo importa (el 2026-10-14 eran 109 piezas; reemplaza a `reglas-sin-uso.test.ts`). Su deuda de
antes vive en `scripts/knip/deuda-produccion.mjs` y solo baja. Una pieza nueva que solo usa su prueba se conecta a su pantalla en el
mismo PR o se borra. Si existe PARA la prueba (la constante que se cruza con la migración, el tope de un placeholder, la lista de todos
los valores de un tipo), se declara con `/** @internal <motivo> */`. Lo que llega a la tienda lleva `!` en `knip.ts`: una carpeta nueva
de `apps/web` se suma ahí. Si Knip falla:
- **Lo que de verdad no se usa se borra** (git lo guarda). Antes de borrar una función que llama `.rpc(…)`, mira si alguien más la
  llama: si era la única, la función de la base queda sin llamador y `pruebas:roles-cobertura` lo marca (esa limpieza lleva migración).
- **Lo que se queda sin uso a propósito se declara, con el motivo junto al código:** una exportación con `@public` en su comentario
  (`/** @public Sin uso hasta que … */`); un archivo entero, en `ignore` de `knip.ts`. Una pieza que nace antes que su primer uso (como
  las de /unificar) se declara así y sale de la lista cuando la usa alguien.
- **Un falso positivo** (un archivo que se carga por URL desde `public/`, un script que se lee como texto y se inyecta en la página, un
  CLI que se corre a mano) va en `entry` de `knip.ts`, que es lo que es. Nunca se borra algo solo porque Knip lo diga sin entender cómo se carga.
