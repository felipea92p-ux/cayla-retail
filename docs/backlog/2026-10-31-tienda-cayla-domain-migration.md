## 🌐 La tienda web en cayla.pe y baja de Shopify (2026-10-31, ADR-0595)

- [ ] **Exportar de Shopify** clientes, pedidos y lo que se quiera conservar (fotos, textos, blog) y cerrar pedidos pendientes — antes de tocar el DNS.
- [ ] **GoDaddy:** `A @` → `216.150.1.1` y `216.150.16.1`; `CNAME www` → `58fb811e4c45e238.vercel-dns-016.com`. No tocar MX ni TXT (Zoho).
- [ ] Verificar `cayla.pe` y `www.cayla.pe` (certificado y tienda web).
- [ ] Pegar en producción `20261031205000_dominio_cayla_pe_en_avisos_y_etiquetas.sql` (entera).
- [x] DNS cambiado en GoDaddy (2026-10-31) y `cayla.pe`/`www` sirviendo la tienda web con certificado.
- [ ] Convertir `tienda.cayla.pe` en redirección 308 a `cayla.pe` en Vercel. (`URL_SALUD_TIENDA` no está definida en GitHub: si se activa el vigía de la tienda, que apunte a `https://cayla.pe/api/salud`.)
- [ ] Fusionar el PR; cerrar Shopify.
- [ ] **Supabase Auth (clientes):** agregar `https://cayla.pe/**` a Redirect URLs (y el origen en Google, si hay «Entrar con Google»); revisar `TIENDA_URL` en Vercel.
- [ ] **Decide Felipe:** los textos legales del Club que nombran `tienda.cayla.pe` (versión nueva con el abogado) y crear `robots.txt`/`sitemap.xml` + Search Console.
