import { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, CircleAlert, Clock3, Users, Wrench } from 'lucide-react';

type RoomStatus = 'available' | 'reserved' | 'maintenance';

type MeetingRoom = {
  id: number;
  name: string;
  floor: string;
  capacity: number;
  status: RoomStatus;
  reservedSlot?: string;
};

const initialRooms: MeetingRoom[] = [
  { id: 1, name: 'Salle 1', floor: 'Etage 1', capacity: 10, status: 'available' },
  { id: 2, name: 'Salle 4', floor: 'Etage 2', capacity: 12, status: 'reserved', reservedSlot: '10:00 - 11:30' },
  { id: 3, name: 'Salle 6', floor: 'Etage 3', capacity: 8, status: 'maintenance' },
  { id: 4, name: 'Salle 2', floor: 'Etage 1', capacity: 6, status: 'available' },
  { id: 5, name: 'Salle 5', floor: 'Etage 2', capacity: 14, status: 'reserved', reservedSlot: '14:00 - 15:00' },
  { id: 6, name: 'Salle 7', floor: 'Etage 4', capacity: 8, status: 'available' },
];

export function ReservationView() {
  const [rooms, setRooms] = useState<MeetingRoom[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('Tunisie'); // valeur par défaut
  const [phone, setPhone] = useState('+216');
  const [email, setEmail] = useState('');
  const countryPrefixes: Record<string, string> = {
  Tunisie: '+216',
  France: '+33',
  Maroc: '+212',
  Algérie: '+213',
  USA: '+1',
};
  const [message, setMessage] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const getStatusUi = (status: RoomStatus) => {
    if (status === 'available') {
      return {
        label: 'Disponible',
        classes: 'bg-green-500/15 text-green-400 border-green-500/30',
        icon: <CheckCircle2 className="h-4 w-4" />,
      };
    }
    if (status === 'reserved') {
      return {
        label: 'Reservee',
        classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        icon: <Clock3 className="h-4 w-4" />,
      };
    }
    return {
      label: 'En panne',
      classes: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: <Wrench className="h-4 w-4" />,
    };
  };

  const handleReserve = () => {
    if (!selectedRoom) {
      setMessage('Selectionnez une salle disponible.');
      return;
    }
    if (selectedRoom.status !== 'available') {
      setMessage('Cette salle n est pas disponible.');
      return;
    }
    if (!date || !startTime || !endTime) {
      setMessage('Choisissez la date et les heures de debut/fin.');
      return;
    }
    if (startTime >= endTime) {
      setMessage('L heure de fin doit etre apres l heure de debut.');
      return;
    }

    const slot = `${startTime} - ${endTime}`;
    setRooms((prev) =>
      prev.map((room) =>
        room.id === selectedRoom.id
          ? { ...room, status: 'reserved', reservedSlot: slot }
          : room
      )
    );
    setMessage(`Reservation confirmee pour ${selectedRoom.name} le ${date}.`);
  };

  return (
    <div className="soft-page p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Reservation des salles</h2>
        <p className="text-zinc-400">Selectionnez une salle, date et heure pour reserver votre reunion</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {rooms.map((room) => {
            const statusUi = getStatusUi(room.status);
            const isActive = selectedRoomId === room.id;
            const canReserve = room.status === 'available';

            return (
              <div
                key={room.id}
                className={`rounded-xl border p-5 backdrop-blur-xl transition-all ${
                  isActive
                    ? 'bg-zinc-900/40 border-blue-500/40'
                    : 'bg-zinc-900/30 border-zinc-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-white text-lg font-semibold">{room.name}</h3>
                    <p className="text-zinc-400 text-sm mt-1">{room.floor}</p>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusUi.classes}`}>
                    {statusUi.icon}
                    {statusUi.label}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-5 text-sm">
                  <span className="inline-flex items-center gap-2 text-zinc-300">
                    <Users className="h-4 w-4 text-zinc-400" />
                    {room.capacity} occupation
                  </span>
                  {room.reservedSlot && (
                    <span className="inline-flex items-center gap-2 text-zinc-300">
                      <Clock3 className="h-4 w-4 text-zinc-400" />
                      {room.reservedSlot}
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => canReserve && setSelectedRoomId(room.id)}
                    disabled={!canReserve}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      canReserve
                        ? 'bg-[#f4b400] text-white hover:bg-[#e1a600]'
                        : 'bg-zinc-700/60 text-zinc-400 cursor-not-allowed'
                    }`}
                  >
                    Reserver
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-zinc-900/30 backdrop-blur-xl border border-zinc-800/50 p-5 h-fit sticky top-6">
          <div className="flex items-center gap-2 text-white mb-4">
            <CalendarClock className="h-5 w-5 text-[#f4b400]" />
            <h3 className="font-semibold">Nouvelle reservation</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400">Salle choisie</label>
              <div className="mt-1 rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200">
                {selectedRoom?.name ?? 'Aucune salle selectionnee'}
              </div>
            </div>

<div className="grid grid-cols-2 gap-3">
  <div>
    <label className="text-xs text-zinc-400">Nom</label>
    <input
      type="text"
      placeholder="Entrer votre nom"
      value={lastName}
      onChange={(e) => setLastName(e.target.value)}
      className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
    />
  </div>

  <div>
    <label className="text-xs text-zinc-400">Prénom</label>
    <input
      type="text"
      placeholder="Entrer votre prénom"
      value={firstName}
      onChange={(e) => setFirstName(e.target.value)}
      className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
    />
  </div>
</div>
<div>
  <label className="text-xs text-zinc-400">Email</label>
  <input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    placeholder="exemple@domaine.com"
    className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
  />
</div>
<div>
  <label className="text-xs text-zinc-400">Pays</label>
  <select
    value={country}
    onChange={(e) => {
      const selected = e.target.value;
      setCountry(selected);
      setPhone(countryPrefixes[selected] || ''); // met le préfixe automatiquement
    }}
    className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
  >
    <option value="Tunisie">Tunisie</option>
    <option value="France">France</option>
    <option value="Maroc">Maroc</option>
    <option value="Algérie">Algérie</option>
    <option value="USA">USA</option>
  </select>
</div>

<div>
  <label className="text-xs text-zinc-400">Numéro de téléphone</label>
  <input
    type="tel"
    value={phone}
    onChange={(e) => setPhone(e.target.value)}
    placeholder={`${countryPrefixes[country]} XX XXX XXX`}
    className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
  />
</div>
            <div>
              <label className="text-xs text-zinc-400">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400">Debut</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Fin</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#f4b400]"
                />
              </div>
            </div>

            <button
              onClick={handleReserve}
              className="w-full rounded-lg bg-[#f4b400] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e1a600]"
            >
              Confirmer reservation
            </button>

            {message && (
              <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300 inline-flex items-start gap-2">
                <CircleAlert className="h-4 w-4 mt-0.5 text-[#f4b400]" />
                <span>{message}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
