## Tiempo real por WebSocket (ADR-0603, 2026-11-02)
Hecho: `retail.stock` y `retail.ventas` publicadas en `supabase_realtime` (**ya en producción**); Punto de venta (Vender/Apartados/Cambios), Existencias y Caja escuchan. **Alcance cerrado por Felipe: solo esos tres módulos.**
**Falta:**
- Fusionar el código web (la base ya emite, pero nadie escucha hasta publicar) y probar el socket de punta a punta en producción con dos máquinas (en local no hay contenedor de Realtime); mirar el uso de Realtime en el panel de Supabase unos días.
- Si Existencias se siente brusca con ventas seguidas, subir `ESPERA_JUNTAR_PAGINA_MS` (hoy 3 s) en `lib/cambios-en-vivo-reglas.ts`.
**Fuera de alcance (solo si Felipe lo pide):** tienda web (aviso sin datos por Broadcast o revalidar la caché del servidor), Pedidos web, Recibir y Traslados, Apartados; cada tabla nueva en la publicación necesita su propio OK (proyecto compartido con Dynamic).
