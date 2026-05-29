import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { getSpaces, type SpaceSensorDto } from '../../services/api';

type SpaceQrCode = {
  space: SpaceSensorDto;
  roomName: string;
  url: string;
  dataUrl: string;
};

function getRoomName(space: SpaceSensorDto): string {
  return space.ifcName?.trim() || space.ifcLongName?.trim() || space.ifcGlobalId;
}

function buildQrUrl(roomName: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('autoLogin', '1');
  url.searchParams.set('room', roomName);
  return url.toString();
}

export function QRCodeAdmin() {
  const [spaces, setSpaces] = useState<SpaceSensorDto[]>([]);
  const [qrCodes, setQrCodes] = useState<SpaceQrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mappedSpacesCount = useMemo(
    () => spaces.filter(space => space.mapped || space.sensors.length > 0).length,
    [spaces],
  );

  const loadSpaces = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getSpaces();
      setSpaces(data);

      const generated = await Promise.all(
        data.map(async space => {
          const roomName = getRoomName(space);
          const url = buildQrUrl(roomName);
          const dataUrl = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 220,
            color: {
              dark: '#18181b',
              light: '#ffffff',
            },
          });

          return { space, roomName, url, dataUrl };
        }),
      );

      setQrCodes(generated);
    } catch {
      setError('Impossible de charger les pieces depuis /api/spaces.');
      setSpaces([]);
      setQrCodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpaces();
  }, []);

  const downloadQrCode = (qrCode: SpaceQrCode) => {
    const link = document.createElement('a');
    link.href = qrCode.dataUrl;
    link.download = `qr-${qrCode.roomName.replace(/[^a-z0-9_-]+/gi, '-')}.png`;
    link.click();
  };

  return (
    <div className="min-h-full p-6 bg-[radial-gradient(circle_at_0%_0%,#f6f7f8_0,#e9ecef_45%,#e2e8ec_100%)]">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white/70 border border-white/80 px-6 py-5 mb-6 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-2xl bg-[#f4b400] text-white grid place-items-center">
              <QrCode className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-800">QR Code Admin</h1>
              <p className="text-sm text-zinc-500">
                Un QR code par piece avec connexion occupant automatique.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadSpaces}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:text-zinc-900 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualiser
        </button>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <article className="rounded-2xl bg-white/75 border border-white/80 p-4">
          <p className="text-sm text-zinc-500">Pieces</p>
          <p className="text-3xl font-semibold text-zinc-800">{spaces.length}</p>
        </article>
        <article className="rounded-2xl bg-white/75 border border-white/80 p-4">
          <p className="text-sm text-zinc-500">Pieces mappees</p>
          <p className="text-3xl font-semibold text-zinc-800">{mappedSpacesCount}</p>
        </article>
        <article className="rounded-2xl bg-white/75 border border-white/80 p-4">
          <p className="text-sm text-zinc-500">Compte QR</p>
          <p className="text-lg font-semibold text-zinc-800">bb@example.com</p>
        </article>
      </section>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl bg-white/70 border border-white/80 p-8 text-zinc-500 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement des QR codes...
        </div>
      ) : qrCodes.length === 0 ? (
        <div className="rounded-3xl bg-white/70 border border-white/80 p-8 text-zinc-500">
          Aucune piece trouvee depuis /api/spaces.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {qrCodes.map(qrCode => (
            <article
              key={qrCode.space.ifcGlobalId}
              className="rounded-3xl bg-white/78 border border-white/90 p-5 shadow-[0_16px_36px_rgba(0,0,0,0.07)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-800 truncate">
                    Salle {qrCode.roomName}
                  </h2>
                  <p className="text-xs text-zinc-500 truncate">
                    {qrCode.space.ifcLongName || qrCode.space.storey || qrCode.space.ifcGlobalId}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                  {qrCode.space.sensors.length} capteur(s)
                </span>
              </div>

              <div className="mt-5 grid place-items-center rounded-2xl bg-white p-4 border border-zinc-100">
                <img
                  src={qrCode.dataUrl}
                  alt={`QR code pour la salle ${qrCode.roomName}`}
                  className="size-52"
                />
              </div>

              <div className="mt-4 rounded-2xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500 break-all">
                {qrCode.url}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => downloadQrCode(qrCode)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f4b400] px-3 py-2 text-sm font-medium text-white hover:bg-[#e2a800]"
                >
                  <Download className="w-4 h-4" />
                  PNG
                </button>
                <button
                  onClick={() => navigator.clipboard?.writeText(qrCode.url)}
                  className="rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                >
                  Copier lien
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
