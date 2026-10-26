## 🛡️ Escudos de ciudad en la cabecera de la tienda (2026-10-26) — solo web, sin migración; rama `claude/city-shields-hover-text-54158e`

- [x] Escudo en la cabecera y en la lista de tiendas; el nombre aparece al pasar el mouse o con Tab (`MarcaDeTienda.tsx`, `cabecera.css`).
- [x] Escudos de Trujillo, Arequipa y Lima (miniaturas de 120 px de Wikimedia Commons) y atribución en el pie (`lib/escudos-creditos.ts`).
- [ ] Pedir a cada municipalidad su escudo oficial; al reemplazar el archivo, quitar su línea de `lib/escudos-creditos.ts` (la prueba lo exige junto con el registro).
- [ ] Confirmar con alguien de Lima que el escudo de la ciudad (no el del departamento) es el que esperan ver.
- [ ] Una tienda nueva sin escudo: sumar su archivo en `public/escudos/` y su línea en `lib/escudo-de-tienda.ts` y `lib/escudos-creditos.ts`.
