import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarcoCuenta } from "@/components/cuenta/MarcoCuenta";
import { BuscadorNotificaciones } from "@/components/notificaciones/BuscadorNotificaciones";
import { ListaNotificaciones, type FilaNotificacion } from "@/components/notificaciones/ListaNotificaciones";
import { listarAvisos } from "@/lib/avisos-tienda-servidor";
import { avisosVistos } from "@/lib/inicio-aviso-servidor";
import { leerSesion } from "@/lib/sesion-servidor";
import "../estilos/notificaciones.css";

export const metadata: Metadata = { title: "Tus notificaciones · CAYLA", robots: { index: false, follow: false } };

/** Cuántas notificaciones por página. */
const POR_PAGINA = 10;

/**
 * «Todas las notificaciones» (Felipe, 2026-10-19): todo lo que la cuenta ha recibido, la más reciente primero, con búsqueda por texto,
 * paginado y el borrado de una, varias o todas. Sale desde «Ver todas» del panel de la campanita. Lo de la base lo lee `listarAvisos`; lo
 * leído en profundidad va en las cookies de este aparato. Sin sesión, lleva a «Entrar».
 */
export default async function Notificaciones({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { q, p } = await searchParams;
  const sesion = await leerSesion();
  if (sesion.estado === "sin_sesion") redirect("/entrar");
  if (sesion.estado === "sin_respuesta") {
    return <NoDisponible texto="No pudimos revisar tu sesión ahora. Vuelve a intentarlo en unos minutos." />;
  }

  const busqueda = (q ?? "").trim().slice(0, 80);
  const pedida = Math.max(1, Number.parseInt(p ?? "1", 10) || 1);
  const [lista, leidas] = await Promise.all([
    listarAvisos(sesion.usuarioId, { busqueda, pagina: pedida, tamano: POR_PAGINA }),
    avisosVistos(),
  ]);
  if (!lista) {
    return <NoDisponible texto="No pudimos cargar tus notificaciones ahora. Vuelve a intentarlo en unos minutos." />;
  }
  const paginas = Math.max(1, Math.ceil(lista.total / POR_PAGINA));
  // Si se borró lo último de la última página, se vuelve a la nueva última (no a una página vacía).
  if (pedida > paginas) redirect(enlace(busqueda, paginas));

  const filas: FilaNotificacion[] = lista.items.map((a) => ({
    clave: a.clave,
    tipo: a.tipo,
    titulo: a.titulo,
    texto: a.texto,
    href: a.href,
    recibidoEn: a.recibidoEn,
    sinVer: !leidas.has(a.clave),
  }));

  return (
    <MarcoCuenta conCuenta conPie>
      <div className="t-ancho">
        <div className="n-pag">
          <span className="t-ceja">Tus notificaciones</span>
          <h1>
            Todo lo que <em>te llegó.</em>
          </h1>
          <BuscadorNotificaciones inicial={busqueda} />
          <ListaNotificaciones filas={filas} total={lista.total} busqueda={busqueda} />
          <nav className="n-paginas" aria-label="Páginas">
            {pedida > 1 ? <Link href={enlace(busqueda, pedida - 1)}>Anterior</Link> : <span />}
            <span>
              Página {pedida} de {paginas}
            </span>
            {pedida < paginas ? <Link href={enlace(busqueda, pedida + 1)}>Siguiente</Link> : <span />}
          </nav>
        </div>
      </div>
    </MarcoCuenta>
  );
}

/** El enlace a una página de la lista, conservando la búsqueda. */
function enlace(busqueda: string, pagina: number): string {
  const params = new URLSearchParams();
  if (busqueda) params.set("q", busqueda);
  if (pagina > 1) params.set("p", String(pagina));
  const texto = params.toString();
  return texto ? `/notificaciones?${texto}` : "/notificaciones";
}

function NoDisponible({ texto }: { texto: string }) {
  return (
    <MarcoCuenta conCuenta>
      <div className="t-ancho t-angosto w-pagina-form">
        <div className="w-ficha">
          <div>
            <span className="t-ceja">Tus notificaciones</span>
            <h1 className="w-titulo">Un momento</h1>
            <p className="w-texto-sec">{texto}</p>
          </div>
          <Link className="t-btn t-btn-ancho t-btn-sec" href="/notificaciones">
            Volver a intentar
          </Link>
        </div>
      </div>
    </MarcoCuenta>
  );
}
