/**
 * DigitalTwinServicesView.tsx
 *
 * Corrections apportées :
 * 1. Boutons connectés aux vrais appels API (uploadIFC, connectIoT, createMapping, etc.)
 * 2. États de chargement, erreurs et succès gérés correctement
 * 3. Formulaire de connexion IoT (email/password) avec modal intégré
 * 4. Affichage de la hiérarchie IFC après parsing
 * 5. Liste des capteurs après connexion IoT
 * 6. Workflow de mapping : salle → capteurs → enregistrement
 * 7. Suppression du `Loader2` en spinner permanent remplacé par un vrai état de sync
 * 8. Suppression du `selectedFile` non utilisé pour le parsing
 */

import {
  Building2, Upload, Cpu, Network, Database, CheckCircle,
  AlertTriangle, Loader2, FileCode, Layers3, Activity, Map,
  ChevronRight, X, Wifi, WifiOff, RefreshCw, Download,
  Eye, EyeOff, Plug,
} from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import {
  uploadIFC, getIFCSpaces,
  connectIoT, getAllDevices, disconnectIoT,
  createMapping, getAllMappings, deleteMappingById, exportMappingJSON,
  type IFCParseResult, type IFCSpace,
  type IoTSession, type IoTSensor,
  type MappingEntry, type MappingCreate,
} from '../../services/api';

// ─── Utilitaires ──────────────────────────────────────────────────────────────

const SENSOR_TYPE_COLORS: Record<string, string> = {
  'Température':           'text-amber-400  bg-amber-500/10  border-amber-500/20',
  'Humidité':              'text-purple-400 bg-purple-500/10 border-purple-500/20',
  'Présence/Occupation':   'text-blue-400   bg-blue-500/10   border-blue-500/20',
  'Comptage énergie/eau':  'text-green-400  bg-green-500/10  border-green-500/20',
  'Luminosité':            'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};
const SENSOR_DOT: Record<string, string> = {
  'Température': 'bg-amber-400', 'Humidité': 'bg-purple-400',
  'Présence/Occupation': 'bg-blue-400', 'Comptage énergie/eau': 'bg-green-400',
  'Luminosité': 'bg-yellow-400',
};

function sensorDot(types: string[]) { return SENSOR_DOT[types[0]] ?? 'bg-zinc-500'; }

function SensorPill({ type }: { type: string }) {
  const cls = SENSOR_TYPE_COLORS[type] ?? 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {type}
    </span>
  );
}

function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ─── Section IFC ──────────────────────────────────────────────────────────────

// ─── Section IFC ──────────────────────────────────────────────────────────────

function IFCSection({
  onSpacesLoaded,
}: {
  onSpacesLoaded: (
    result: IFCParseResult,
    spaces: IFCSpace[]
  ) => void;
}) {

  const [file,      setFile]      = useState<File | null>(null);
  const [result,    setResult]    = useState<IFCParseResult | null>(null);
  const [spaces,    setSpaces]    = useState<IFCSpace[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [showTree,  setShowTree]  = useState(false);
  const [dragging,  setDragging]  = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.ifc')) {
      setError('Seuls les fichiers .ifc sont acceptés.');
      return;
    }

    setFile(f);
    setError(null);
    setResult(null);
    setSpaces([]);
  };

  const handleParse = useCallback(async () => {

    if (!file) return;

    setLoading(true);
    setError(null);

    try {

      // ─────────────────────────────
      // Upload + parsing IFC
      // ─────────────────────────────

      const r = await uploadIFC(file);

      setResult(r);

      // ─────────────────────────────
      // Chargement des espaces
      // ─────────────────────────────

      const sp = await getIFCSpaces(r.session_id);

      setSpaces(sp);

      // ✅ IMPORTANT
      // Remonter les espaces au composant parent
      onSpacesLoaded(r, sp);

      setShowTree(true);

    } catch (e) {

      setError((e as Error).message);

    } finally {

      setLoading(false);

    }

  }, [file, onSpacesLoaded]);

  const handleReset = () => {

    setFile(null);
    setResult(null);
    setSpaces([]);
    setError(null);
    setShowTree(false);

    // ✅ reset parent state
    onSpacesLoaded(
      {
        session_id: '',
        schema: '',
        original_filename: '',
        summary: {
          storeys: 0,
          spaces: 0,
          equipment: 0,
        },
        hierarchy: {
          project: {
            project_name: '',
            global_id: '',
          },
          levels: [],
        },
      },
      []
    );

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 backdrop-blur-xl hover:border-zinc-700/50 transition-all space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500">
          <FileCode className="w-6 h-6 text-white" />
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs">
          <CheckCircle className="w-3 h-3" />
          Online · :8001
        </div>
      </div>

      <h3 className="text-white text-xl font-semibold">
        IFC Parser Service
      </h3>

      <p className="text-zinc-400 text-sm leading-relaxed">
        Importer et analyser les fichiers IFC BIM du bâtiment afin d'extraire
        les étages, espaces et équipements.
      </p>

      {/* Features */}
      <div className="space-y-1.5">
        {[
          'Upload de fichiers IFC',
          'Analyse BIM',
          'Extraction des équipements',
          'Visualisation hiérarchique',
        ].map(f => (
          <div
            key={f}
            className="flex items-center gap-2 text-sm text-zinc-300"
          >
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            {f}
          </div>
        ))}
      </div>

      {error && (
        <ErrorBanner
          msg={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}

        onDragLeave={() => setDragging(false)}

        onDrop={e => {
          e.preventDefault();
          setDragging(false);

          if (e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}

        onClick={() => inputRef.current?.click()}

        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-blue-500/60 bg-blue-500/5'
            : result
            ? 'border-green-500/40 bg-green-500/5'
            : file
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-zinc-700/60 hover:border-zinc-600 hover:bg-zinc-800/20'
        }`}
      >

        <input
          ref={inputRef}
          type="file"
          accept=".ifc"
          className="hidden"
          onChange={e => {
            if (e.target.files?.[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <Building2
          className={`w-7 h-7 mx-auto mb-2 ${
            result
              ? 'text-green-400'
              : file
              ? 'text-blue-400'
              : 'text-zinc-600'
          }`}
        />

        <p className="text-sm font-medium text-zinc-300">
          {result
            ? `✓ ${file!.name}`
            : file
            ? file.name
            : 'Glisser un fichier .ifc ici'}
        </p>

        <p className="text-xs text-zinc-600 mt-1">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
            : 'ou cliquer pour parcourir'}
        </p>
      </div>

      {/* Actions */}
      <div className="space-y-2">

        <label className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white cursor-pointer transition-all text-sm font-medium">
          <Upload className="w-4 h-4" />

          Importer un fichier IFC

          <input
            type="file"
            accept=".ifc"
            className="hidden"
            onChange={e => {
              if (e.target.files?.[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />
        </label>

        <button
          onClick={handleParse}
          disabled={!file || loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 text-white transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Activity className="w-4 h-4" />
          }

          {loading
            ? 'Analyse en cours…'
            : 'Analyser le modèle BIM'}
        </button>

        {result && (
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/30 text-zinc-500 hover:text-zinc-300 text-xs transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Réinitialiser
          </button>
        )}
      </div>

      {/* Result summary */}
      {result && (
        <div className="space-y-3">

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Étages',  value: result.summary.storeys },
              { label: 'Espaces', value: result.summary.spaces },
              { label: 'Équip.',  value: result.summary.equipment },
            ].map(s => (
              <div
                key={s.label}
                className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-2.5 text-center"
              >
                <p className="text-xs text-zinc-500">
                  {s.label}
                </p>

                <p className="text-lg font-bold text-white">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowTree(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 text-xs transition-all"
          >
            <span className="flex items-center gap-1.5">
              {showTree
                ? <EyeOff className="w-3.5 h-3.5" />
                : <Eye className="w-3.5 h-3.5" />
              }

              {showTree
                ? 'Masquer la hiérarchie'
                : 'Afficher la hiérarchie'}
            </span>

            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${
                showTree ? 'rotate-90' : ''
              }`}
            />
          </button>

          {showTree && (
            <div className="bg-zinc-900/50 border border-zinc-800/40 rounded-xl p-3 font-mono text-xs space-y-1 max-h-48 overflow-y-auto">

              <div className="text-blue-400 font-semibold mb-1">
                ▸ {result.hierarchy.project.project_name}
              </div>

              {result.hierarchy.levels.map((level, i) => (
                <div key={i}>

                  <div className="text-zinc-300 pl-3">
                    {i < result.hierarchy.levels.length - 1 ? '├' : '└'}{' '}
                    {level.name}

                    {level.elevation_m !== undefined && (
                      <span className="text-zinc-600 ml-1">
                        ({level.elevation_m >= 0 ? '+' : ''}
                        {level.elevation_m}m)
                      </span>
                    )}
                  </div>

                  {level.spaces.map((sp, j) => (
                    <div
                      key={j}
                      className="text-zinc-500 pl-7 text-[10px]"
                    >
                      {j < level.spaces.length - 1 ? '├' : '└'} {sp.name}

                      {sp.area_m2 && (
                        <span className="text-zinc-700 ml-1">
                          · {sp.area_m2.toFixed(1)}m²
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="font-mono text-blue-400/70 bg-blue-500/8 border border-blue-500/15 rounded px-1.5 py-0.5">
              {result.session_id}
            </span>

            <span>session active</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section IoT ──────────────────────────────────────────────────────────────

function IoTSection({ onSensorsLoaded }: { onSensorsLoaded: (s: IoTSession, sensors: IoTSensor[]) => void }) {
  const [session,   setSession]   = useState<IoTSession | null>(null);
  const [sensors,   setSensors]   = useState<IoTSensor[]>([]);
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [fetching,  setFetching]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleConnect = async () => {
    if (!email || !password) { setError('Email et mot de passe requis.'); return; }
    setLoading(true); setError(null);
    try {
      const s = await connectIoT(email, password);
      setSession(s);
      setShowForm(false);
      const devs = await getAllDevices(s.session_id);
      setSensors(devs);
      onSensorsLoaded(s, devs);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const handleRefresh = async () => {
    if (!session) return;
    setFetching(true);
    try {
      const devs = await getAllDevices(session.session_id);
      setSensors(devs);
      onSensorsLoaded(session, devs);
    } catch (e) { setError((e as Error).message); }
    finally { setFetching(false); }
  };

  const handleDisconnect = async () => {
    if (session) await disconnectIoT(session.session_id).catch(() => {});
    setSession(null); setSensors([]); setEmail(''); setPassword('');
    onSensorsLoaded({ session_id: '', id_client: 0, id_user: 0 }, []);
  };

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 backdrop-blur-xl hover:border-zinc-700/50 transition-all space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500">
          <Cpu className="w-6 h-6 text-white" />
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
          session ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800/50 text-zinc-500'
        }`}>
          {session ? <><CheckCircle className="w-3 h-3" /> Connecté · :8002</> : <>:8002</>}
        </div>
      </div>

      <h3 className="text-white text-xl font-semibold">IoT Connector Service</h3>
      <p className="text-zinc-400 text-sm leading-relaxed">
        Connexion temps réel avec les capteurs IoT WaveOn pour surveiller les données du bâtiment.
      </p>

      {/* Features */}
      <div className="space-y-1.5">
        {['Capteurs temps réel', 'Streaming MQTT', 'Monitoring', 'Détection d\'anomalies'].map(f => (
          <div key={f} className="flex items-center gap-2 text-sm text-zinc-300">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" /> {f}
          </div>
        ))}
      </div>

      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}

      {/* Login form */}
      {showForm && !session && (
  <div className="bg-white border border-gray-300 rounded-xl p-4 space-y-3 shadow-sm">
    
    <div>
      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">
        Email WaveOn
      </label>

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="user@waveon.tn"
        className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-500 transition-colors"
      />
    </div>

    <div>
      <label className="block text-[10px] text-gray-500 uppercase tracking-widest mb-1">
        Mot de passe
      </label>

      <div className="relative">
        <input
          type={showPass ? 'text' : 'password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleConnect()}
          placeholder="••••••••"
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 pr-9 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-500 transition-colors"
        />

        <button
          onClick={() => setShowPass(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
        >
          {showPass ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>

    <div className="flex gap-2">
      {/* bouton principal inchangé */}
      <button
        onClick={handleConnect}
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-sm transition-all disabled:opacity-40"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plug className="w-4 h-4" />
        )}

        {loading ? 'Connexion…' : 'Se connecter'}
      </button>

      <button
        onClick={() => {
          setShowForm(false);
          setError(null);
        }}
        className="px-3 py-2 rounded-lg bg-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-300 text-sm transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>

  </div>
)}

      {/* Actions */}
      <div className="space-y-2">
        {!session ? (
          <button onClick={() => setShowForm(v => !v)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white transition-all text-sm font-medium">
            <Wifi className="w-4 h-4" />
            {showForm ? 'Masquer le formulaire' : 'Se connecter à WaveOn'}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-green-400 font-medium">Session active</p>
                <p className="text-[10px] text-zinc-500 font-mono truncate">{session.session_id}</p>
              </div>
              <button onClick={handleRefresh} disabled={fetching}
                className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <button onClick={handleDisconnect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-sm transition-all">
              <WifiOff className="w-4 h-4" /> Déconnecter
            </button>
          </>
        )}

        {/* Sensor list */}
{session && sensors.length > 0 && (
  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
    
    <p className="text-[10px] text-gray-500 uppercase tracking-widest px-0.5">
      {sensors.length} équipements détectés
    </p>

    {sensors.map(s => (
      <div
        key={s.id}
        className="flex items-center gap-2.5 bg-white border border-gray-300 rounded-xl px-3 py-2.5 shadow-sm"
      >
        
        {/* point vert */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            s.sensor_types?.length
              ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.7)]'
              : 'bg-gray-400'
          }`}
        />

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-900 truncate font-medium">
            {s.device_name}
          </p>

          <div className="flex gap-1 mt-0.5 flex-wrap">
            {s.sensor_types.slice(0, 2).map(t => (
              <SensorPill key={t} type={t} />
            ))}
          </div>
        </div>

        <span className="text-[10px] font-mono text-gray-500 flex-shrink-0">
          {s.unicast}
        </span>
      </div>
    ))}
  </div>
)}
        {session && sensors.length === 0 && !fetching && (
          <p className="text-center text-xs text-zinc-600 py-4">Aucun équipement trouvé.</p>
        )}
      </div>
    </div>
  );
}

// ─── Section Mapping ──────────────────────────────────────────────────────────

function MappingSection({
  spaces, sensors,
}: {
  spaces: IFCSpace[];
  sensors: IoTSensor[];
}) {
  const [mappings,     setMappings]     = useState<MappingEntry[]>([]);
  const [selSpace,     setSelSpace]     = useState<IFCSpace | null>(null);
  const [selSensors,   setSelSensors]   = useState<Set<string>>(new Set());
  const [view,         setView]         = useState<'create' | 'list'>('create');
  const [saving,       setSaving]       = useState(false);
  const [loadingList,  setLoadingList]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const toggleSensor = (id: string) => {
    setSelSensors(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleSave = async () => {
    if (!selSpace || selSensors.size === 0) return;
    setSaving(true); setError(null);
    try {
      const payload: MappingCreate = {
        space_global_id: selSpace.global_id,
        space_name:      selSpace.name,
        storey_name:     selSpace.storey?.name,
        area_m2:         selSpace.area_m2,
        sensors: sensors.filter(s => selSensors.has(s.id)).map(s => ({
          sensor_type:  s.sensor_type,
          device_id:    s.id,
          unicast:      s.unicast,
          device_name:  s.device_name,
          network_id:   s.network_id,
          sensor_types: s.sensor_types,
        })),
      };
      const created = await createMapping(payload);
      setMappings(prev => [...prev.filter(m => m.space_global_id !== created.space_global_id), created]);
      setSelSpace(null); setSelSensors(new Set());
      setView('list');
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleLoadMappings = async () => {
    setLoadingList(true); setError(null);
    try { setMappings(await getAllMappings()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoadingList(false); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteMappingById(id); setMappings(prev => prev.filter(m => m.id !== id)); }
    catch (e) { setError((e as Error).message); }
  };

  const handleExport = async () => {
    try {
      const blob = await exportMappingJSON();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'mapping_export.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
  };

  const canSave = selSpace !== null && selSensors.size > 0;
  const needsIFC = spaces.length === 0;
  const needsIoT = sensors.length === 0;

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 backdrop-blur-xl hover:border-zinc-700/50 transition-all space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="p-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500">
          <Map className="w-6 h-6 text-white" />
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs">
          <CheckCircle className="w-3 h-3" /> Online · :8003
        </div>
      </div>

      <h3 className="text-white text-xl font-semibold">Mapping Service</h3>
      <p className="text-zinc-400 text-sm leading-relaxed">
        Association entre équipements BIM et objets IoT afin de créer le jumeau numérique intelligent.
      </p>

      {/* Features */}
      <div className="space-y-1.5">
        {['Mapping IFC ↔ IoT', 'Relations intelligentes', 'Synchronisation', 'Visualisation des connexions'].map(f => (
          <div key={f} className="flex items-center gap-2 text-sm text-zinc-300">
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" /> {f}
          </div>
        ))}
      </div>

      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}

      {/* Prerequisite warnings */}
      {(needsIFC || needsIoT) && (
        <div className="space-y-2">
          {needsIFC && (
            <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5 text-amber-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Parsez un fichier IFC d'abord pour obtenir les salles.
            </div>
          )}
          {needsIoT && (
            <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5 text-amber-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Connectez IoT d'abord pour obtenir les capteurs.
            </div>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-1">
  {(['create', 'list'] as const).map(v => (
    <button
      key={v}
      onClick={() => {
        setView(v);
        if (v === 'list') handleLoadMappings();
      }}
      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
        view === v
          ? 'bg-yellow-400 text-black border border-yellow-300 shadow-sm'
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {v === 'create' ? '+ Nouveau mapping' : '📋 Voir les mappings'}
    </button>
  ))}
</div>

      {/* CREATE */}
      {view === 'create' && (
        <div className="space-y-3">
          {/* Space picker */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
              Salle IFC {spaces.length > 0 && `(${spaces.length})`}
            </p>
            {spaces.length === 0 ? (
              <p className="text-xs text-zinc-600 italic py-2">Aucune salle disponible</p>
            ) : (
              <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
                {spaces.map(sp => (
                  <button key={sp.global_id} onClick={() => setSelSpace(sp)}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-all ${
                      selSpace?.global_id === sp.global_id
                        ? 'border-green-500/40 bg-green-500/8 text-green-400'
                        : 'border-zinc-800/60 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700'
                    }`}>
                    <div className="font-medium truncate">{sp.name}</div>
                    {sp.storey && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{sp.storey.name}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sensor picker */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
              Capteurs WaveOn {selSensors.size > 0 && `(${selSensors.size} sélectionnés)`}
            </p>
            {sensors.length === 0 ? (
              <p className="text-xs text-zinc-600 italic py-2">Aucun capteur disponible</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {sensors.map(s => {
                  const sel = selSensors.has(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSensor(s.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${
                        sel ? 'border-green-500/40 bg-green-500/8' : 'border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700'
                      }`}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sensorDot(s.sensor_types)}`} />
                      <span className={`text-xs flex-1 truncate ${sel ? 'text-green-400' : 'text-zinc-300'}`}>
                        {s.device_name}
                      </span>
                      {sel && <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={handleSave} disabled={!canSave || saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-all text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {saving ? 'Enregistrement…'
              : canSave ? `Mapper "${selSpace!.name}" (${selSensors.size} capteur${selSensors.size > 1 ? 's' : ''})`
              : 'Sélectionnez une salle et des capteurs'}
          </button>
        </div>
      )}

      {/* LIST */}
      {view === 'list' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{mappings.length} mapping{mappings.length !== 1 ? 's' : ''}</p>
            <button onClick={handleExport}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
              <Download className="w-3.5 h-3.5" /> Exporter JSON
            </button>
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
            </div>
          ) : mappings.length === 0 ? (
            <p className="text-center text-xs text-zinc-600 py-6">Aucun mapping enregistré.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {mappings.map(m => (
                <div key={m.id} className="flex items-start gap-3 bg-zinc-800/30 border border-zinc-700/40 rounded-xl px-3 py-2.5">
                  <Network className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{m.space_name}</p>
                    {m.storey_name && <p className="text-[10px] text-zinc-500">{m.storey_name}</p>}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {m.sensors.map((s, i) => (
                        <span key={i} className="text-[10px] text-zinc-500 bg-zinc-800/60 rounded px-1.5 py-0.5">
                          {s.device_name ?? s.unicast}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(m.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function DigitalTwinServicesView() {

  // État partagé entre les 3 sections
  const [ifcSpaces, setIfcSpaces]   = useState<IFCSpace[]>([]);
  const [iotSensors, setIotSensors] = useState<IoTSensor[]>([]);

  const readyForMapping = ifcSpaces.length > 0 && iotSensors.length > 0;

  return (
    <div className="soft-page p-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Digital Twin Platform</h1>
          <p className="text-zinc-400">Gestion et interaction avec les microservices du jumeau numérique</p>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/50 rounded-xl px-4 py-3 backdrop-blur-xl">
          <Activity className="w-5 h-5 text-green-400" />
          <div>
            <p className="text-white text-sm font-medium">Tous les services sont opérationnels</p>
            <p className="text-zinc-500 text-xs">Synchronisation temps réel active</p>
          </div>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-5">
        {[
          { icon: Building2,  color: 'text-blue-400',   bg: 'bg-blue-500/10',   badge: 'BIM',     title: 'IFC Parser',       desc: 'Analyse et extraction des données BIM depuis les fichiers IFC.',    ready: ifcSpaces.length > 0  },
          { icon: Cpu,        color: 'text-purple-400', bg: 'bg-purple-500/10', badge: 'IoT',     title: 'IoT Connector',    desc: 'Surveillance et communication avec les équipements intelligents.',   ready: iotSensors.length > 0 },
          { icon: Network,    color: 'text-green-400',  bg: 'bg-green-500/10',  badge: 'Mapping', title: 'Mapping Service',  desc: 'Création des relations entre BIM et données IoT.',                   ready: readyForMapping       },
        ].map(({ icon: Icon, color, bg, badge, title, desc, ready }) => (
          <div key={badge} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${bg}`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs px-3 py-1 rounded-full ${bg} ${color}`}>{badge}</span>
                {ready && <div className="w-1.5 h-1.5 rounded-full bg-green-400" title="Données chargées" />}
              </div>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
            <p className="text-zinc-400 text-sm">{desc}</p>
          </div>
        ))}
      </div>

      {/* Contexte partagé visible */}
      {(ifcSpaces.length > 0 || iotSensors.length > 0) && (
        <div className="flex items-center gap-6 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl px-6 py-4 backdrop-blur-xl">
          <span className="text-xs text-zinc-600 uppercase tracking-widest">Contexte actif</span>
          {ifcSpaces.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-blue-400">{ifcSpaces.length} espaces IFC chargés</span>
            </div>
          )}
          {iotSensors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs text-purple-400">{iotSensors.length} capteurs IoT actifs</span>
            </div>
          )}
          {readyForMapping && (
            <div className="flex items-center gap-1.5 ml-auto">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs text-green-400">Mapping disponible</span>
            </div>
          )}
        </div>
      )}

      {/* Services */}
      <div className="grid grid-cols-3 gap-6">
        <IFCSection
          onSpacesLoaded={(_, spaces) => setIfcSpaces(spaces)}
        />
        <IoTSection
          onSensorsLoaded={(_, sensors) => setIotSensors(sensors)}
        />
        <MappingSection
          spaces={ifcSpaces}
          sensors={iotSensors}
        />
      </div>

      {/* Architecture */}
      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-8 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <Layers3 className="w-6 h-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-white">Architecture du Digital Twin</h2>
        </div>
        <div className="grid grid-cols-3 gap-6 items-center">
          <div className="bg-zinc-800/40 rounded-2xl p-6 border border-zinc-700/50 text-center">
            <Building2 className="w-10 h-10 text-blue-400 mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-2">IFC Models</h3>
            <p className="text-zinc-400 text-sm">Structure BIM du bâtiment</p>
            {ifcSpaces.length > 0 && (
              <p className="text-xs text-blue-400 mt-2">{ifcSpaces.length} espaces chargés</p>
            )}
          </div>
          <div className="flex flex-col items-center justify-center">
            <Database className="w-12 h-12 text-cyan-400 mb-3" />
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full" />
            <p className="text-zinc-400 text-sm mt-3">Synchronisation intelligente</p>
          </div>
          <div className="bg-zinc-800/40 rounded-2xl p-6 border border-zinc-700/50 text-center">
            <Cpu className="w-10 h-10 text-purple-400 mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-2">IoT Devices</h3>
            <p className="text-zinc-400 text-sm">Données temps réel des capteurs</p>
            {iotSensors.length > 0 && (
              <p className="text-xs text-purple-400 mt-2">{iotSensors.length} capteurs actifs</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between bg-zinc-900/20 border border-zinc-800/50 rounded-2xl px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <div>
            <p className="text-white text-sm font-medium">Synchronisation des microservices active</p>
            <p className="text-zinc-500 text-xs">
              {readyForMapping
                ? 'IFC + IoT chargés — mapping prêt à être généré'
                : 'En attente des données IFC et IoT'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 text-green-400">
          <CheckCircle className="w-4 h-4" />
          Système opérationnel
        </div>
      </div>
    </div>
  );
}
