# Backlog — INV-24 contaba el nombre sin la medida (2026-10-30)

## NO TRAE SQL

Este cambio es solo del detector de `/chaos` y su prueba: no hay migración, nada que pegar en producción.

## LO QUE QUEDÓ SIN CORRER (de la corrida de `/chaos` sobre «Nuevo avío»)

Van **10 de 22** ataques. La pila local (Postgres privado + PostgREST + la puerta + el servidor con login real)
quedó documentada en el informe, así que la segunda tanda arranca sin volver a armarla.

1. **NAV-03 — recargar justo al pulsar «Guardar» (gravedad 1).** El otro clásico que duplica: el navegador puede
   cortar la respuesta con la escritura ya hecha. El candado de la base debería cubrirlo igual que cubrió los diez
   clics, pero eso hay que **medirlo**, no suponerlo.
2. **RS-01 — perder la red en medio del guardado.** Intentado y **no ejecutado**: parchear `window.fetch` filtrando
   por la URL de la RPC interceptó 0 llamadas (el alta no pasa por ahí con esa forma) y el clic cayó fuera de la
   hoja. Fue el ataque mal montado, no un hallazgo: hay que parchear en el cliente de Supabase.
3. **Los otros diez:** ENT-03, ENT-07, ENT-11 (entradas hostiles), DC-01, DC-03, DC-06 (doble clic y reenvío),
   NAV-05 (URL torcida), PER-01 (permisos), RS-03 (sesión caída), TEC-01, TEC-03, TEC-05 (teclado).

## SIGUE PENDIENTE DE ADR-0580 (no de este PR)

- `pnpm --filter web tema:auditar` con escenarios para la hoja «Nuevo avío» y para Catálogo ▸ Atributos ▸ Avíos.
- `guias:recorrer`: las dos huellas se aceptaron revisando los pasos a mano, no con un recorrido en el navegador.
- `/formidable` con una persona sin contexto.
