## Tiempo real por WebSocket (ADR-0603, 2026-11-02)
Hecho: Punto de venta (Vender/Apartados/Cambios), Existencias y Caja escuchan. **Alcance cerrado por Felipe: solo esos tres módulos.**
**En producción hoy: solo `retail.ventas` publicada.** `stock` se sacó a mano el 2026-11-02 porque sin identidad de réplica rompía las ventas (ADR-0603, «El incidente»).
**POR PEGAR (2026-11-02), antes de fusionar:** la migración corregida `20261102212000` (pone `replica identity full` en `stock` y la publica). Con el OK de Felipe.
**Falta:**
- Fusionar el código web (la base ya emite, pero nadie escucha hasta publicar) y probar el socket de punta a punta en producción con dos máquinas (en local no hay contenedor de Realtime); mirar el uso de Realtime en el panel de Supabase unos días.
- Si Existencias se siente brusca con ventas seguidas, subir `ESPERA_JUNTAR_PAGINA_MS` (hoy 3 s) en `lib/cambios-en-vivo-reglas.ts`.
**Fuera de alcance (solo si Felipe lo pide):** tienda web (aviso sin datos por Broadcast o revalidar la caché del servidor), Pedidos web, Recibir y Traslados, Apartados; cada tabla nueva en la publicación necesita su propio OK (proyecto compartido con Dynamic).
