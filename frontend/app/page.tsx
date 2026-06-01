"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  ClipboardList,
  LogIn,
  Plus,
  LogOut,
  MessageCircle,
  Save,
  Users,
} from "lucide-react";
import {
  Compliance,
  Entry,
  EstablishmentSummary,
  StatsRow,
  User,
  api,
  demoEntries,
  demoUsers,
} from "../lib/api";

function mondayOf(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  return copy.toISOString().slice(0, 10);
}

const currentWeek = mondayOf(new Date());

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<Entry[]>(demoEntries);
  const [compliance, setCompliance] = useState<Compliance[]>([]);
  const [stats, setStats] = useState<StatsRow[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentSummary[]>([]);
  const [lastCreatedId, setLastCreatedId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<EstablishmentSummary | null>(null);
  const [selectedProfileEntries, setSelectedProfileEntries] = useState<Entry[]>([]);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [occupiedPlaces, setOccupiedPlaces] = useState(0);
  const [occupiedUnits, setOccupiedUnits] = useState(0);
  const [notes, setNotes] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [message, setMessage] = useState("Modo demo activo hasta conectar el backend.");

  const isAdmin = user?.role === "admin";
  const ownEntries = useMemo(
    () => entries.filter((entry) => !user || entry.establishment_id === user.id),
    [entries, user],
  );

  async function login(userId: string) {
    const cleanUserId = userId.trim();
    if (!cleanUserId) {
      setMessage("Ingresa un ID de acceso.");
      return;
    }

    const demo = demoUsers.find((item) => item.id === cleanUserId);
    try {
      const response = await api.login(cleanUserId);
      setUser(response.user);
      setMessage("Conectado al backend.");
      if (response.user.role === "establishment") {
        setEntries(await api.entries(response.user.id, response.user.id));
      }
      if (response.user.role === "admin") {
        await loadAdminData(response.user.id);
      }
    } catch {
      setUser(demo ?? null);
      setMessage(demo ? "Backend no disponible: usando datos demo." : "No se encontro un usuario con ese ID.");
      if (demo?.role === "admin") {
        setCompliance(demoCompliance);
        setStats(demoStats);
        setEstablishments(demoEstablishments);
      }
    }
  }

  async function loginAdmin() {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setMessage("Ingresa usuario y contrasena de admin.");
      return;
    }

    try {
      const response = await api.adminLogin(adminUsername.trim(), adminPassword.trim());
      setUser(response.user);
      setMessage("Conectado al backend.");
      await loadAdminData(response.user.id);
    } catch {
      if (adminUsername.trim() === "admin" && adminPassword.trim() === "admin123") {
        const demoAdmin = demoUsers.find((item) => item.role === "admin");
        setUser(demoAdmin ?? null);
        setCompliance(demoCompliance);
        setStats(demoStats);
        setEstablishments(demoEstablishments);
        setMessage("Backend no disponible: usando admin demo.");
        return;
      }
      setMessage("Usuario o contrasena de admin incorrectos.");
    }
  }

  async function saveEntry() {
    if (!user) return;
    const payload = {
      week_start: weekStart,
      occupied_places: occupiedPlaces,
      occupied_units: occupiedUnits,
      notes,
    };

    try {
      const saved = await api.saveEntry(user.id, user.id, payload);
      setEntries((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
      setMessage("Carga guardada.");
    } catch {
      const localEntry: Entry = {
        id: `${user.id}-${weekStart}`,
        establishment_id: user.id,
        establishment_name: user.establishment_name ?? user.display_name,
        week_start: weekStart,
        occupied_places: occupiedPlaces,
        occupied_units: occupiedUnits,
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setEntries((current) => [localEntry, ...current.filter((entry) => entry.id !== localEntry.id)]);
      setMessage("Guardado local demo. Con MongoDB activo se persiste en la API.");
    }
  }

  async function loadAdminData(userId = user?.id ?? "meb-admin") {
    try {
      const [complianceResponse, statsResponse, establishmentsResponse] = await Promise.all([
        api.compliance(userId, weekStart),
        api.stats(userId, period, new Date().getFullYear()),
        api.establishments(userId),
      ]);
      setCompliance(complianceResponse);
      setStats(statsResponse.rows);
      setEstablishments(establishmentsResponse);
      setMessage("Panel admin actualizado.");
    } catch {
      setCompliance(demoCompliance);
      setStats(demoStats);
      setEstablishments(demoEstablishments);
      setMessage("Backend no disponible: panel admin en modo demo.");
    }
  }

  async function createEstablishment(payload: {
    parcel_number: string;
    accommodation_name: string;
    address: string;
    phone: string;
  }) {
    if (!user) return;
    try {
      const created = await api.createEstablishment(user.id, payload);
      setLastCreatedId(created.id);
      setEstablishments((current) => [...current, created].sort((a, b) =>
        a.establishment_name.localeCompare(b.establishment_name),
      ));
      await loadAdminData(user.id);
      setLastCreatedId(created.id);
      setMessage(`Establecimiento creado. Compartile este ID de acceso: ${created.id}`);
    } catch {
      setMessage("No se pudo crear el establecimiento. Revisa que el ID no exista y que la API este activa.");
    }
  }

  async function openEstablishmentProfile(establishment: EstablishmentSummary) {
    setSelectedProfile(establishment);
    if (!user) {
      setSelectedProfileEntries([]);
      return;
    }

    try {
      setSelectedProfileEntries(await api.entries(user.id, establishment.id));
    } catch {
      setSelectedProfileEntries(demoEntries.filter((entry) => entry.establishment_id === establishment.id));
    }
  }

  function openComplianceProfile(item: Compliance) {
    const establishment = establishments.find((candidate) => candidate.id === item.establishment_id) ?? {
      id: item.establishment_id,
      establishment_name: item.establishment_name,
      accommodation_name: item.establishment_name,
      whatsapp: item.whatsapp ?? "",
    };
    void openEstablishmentProfile(establishment);
  }

  if (!user) {
    return (
      <main className="shell">
        <section className="login">
          <div>
            <p className="eyebrow">Turismo MEB</p>
            <h1>Control de carga y ocupacion semanal</h1>
            <p className="lede">
              Ingreso simple para establecimientos y tablero de seguimiento para usuarios MEB.
            </p>
          </div>
          <div className="login-actions" aria-label="Usuarios demo">
            <form className="login-card" onSubmit={(event) => { event.preventDefault(); loginAdmin(); }}>
              <div className="panel-title">
                <Users size={21} />
                <h2>Admin MEB</h2>
              </div>
              <label>
                Usuario
                <input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} />
              </label>
              <label>
                Contrasena
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                />
              </label>
              <button className="primary-button" type="submit">
                <LogIn size={18} />
                <span>Ingresar admin</span>
              </button>
            </form>
            <form className="login-card" onSubmit={(event) => { event.preventDefault(); login(loginId); }}>
              <div className="panel-title">
                <Building2 size={21} />
                <h2>Emprendimiento</h2>
              </div>
              <label>
                ID numerico
                <input
                  aria-label="ID de emprendimiento"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="10000001"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value.replace(/\D/g, ""))}
                />
              </label>
              <button className="secondary-button" type="submit">
                <LogIn size={18} />
                <span>Ingresar</span>
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Turismo MEB</p>
          <h1>{isAdmin ? "Panel admin" : user.establishment_name}</h1>
        </div>
        <button className="icon-button" onClick={() => setUser(null)} title="Salir">
          <LogOut size={19} />
        </button>
      </header>

      <p className="notice">{message}</p>

      {isAdmin ? (
        <AdminPanel
          compliance={compliance}
          stats={stats}
          period={period}
          weekStart={weekStart}
          onPeriodChange={setPeriod}
          onWeekChange={setWeekStart}
          onRefresh={() => loadAdminData()}
          establishments={establishments}
          lastCreatedId={lastCreatedId}
          selectedProfile={selectedProfile}
          selectedProfileEntries={selectedProfileEntries}
          onCreateEstablishment={createEstablishment}
          onOpenEstablishment={openEstablishmentProfile}
          onOpenCompliance={openComplianceProfile}
          onCloseProfile={() => {
            setSelectedProfile(null);
            setSelectedProfileEntries([]);
          }}
        />
      ) : (
        <EstablishmentPanel
          entries={ownEntries}
          weekStart={weekStart}
          occupiedPlaces={occupiedPlaces}
          occupiedUnits={occupiedUnits}
          notes={notes}
          onWeekChange={setWeekStart}
          onPlacesChange={setOccupiedPlaces}
          onUnitsChange={setOccupiedUnits}
          onNotesChange={setNotes}
          onSave={saveEntry}
        />
      )}
    </main>
  );
}

function EstablishmentPanel(props: {
  entries: Entry[];
  weekStart: string;
  occupiedPlaces: number;
  occupiedUnits: number;
  notes: string;
  onWeekChange: (value: string) => void;
  onPlacesChange: (value: number) => void;
  onUnitsChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
}) {
  const hasCurrentWeek = props.entries.some((entry) => entry.week_start === props.weekStart);
  const loadStatus = hasCurrentWeek ? "Carga completa para la semana seleccionada" : "Falta cargar esta semana";

  return (
    <>
      <section className="status-strip">
        <div className={hasCurrentWeek ? "status ok" : "status warn"}>
          {hasCurrentWeek ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <span>{loadStatus}</span>
        </div>
        <div className="status neutral">
          <MessageCircle size={20} />
          <span>Recordatorio WhatsApp preparado para futuras integraciones</span>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="panel" onSubmit={(event) => { event.preventDefault(); props.onSave(); }}>
          <div className="panel-title">
            <CalendarDays size={21} />
            <h2>Carga semanal</h2>
          </div>
          <label>
            Semana
            <input type="date" value={props.weekStart} onChange={(event) => props.onWeekChange(event.target.value)} />
          </label>
          <div className="field-grid">
            <label>
              Plazas ocupadas
              <input
                type="number"
                min="0"
                value={props.occupiedPlaces}
                onChange={(event) => props.onPlacesChange(Number(event.target.value))}
              />
            </label>
            <label>
              Unidades ocupadas
              <input
                type="number"
                min="0"
                value={props.occupiedUnits}
                onChange={(event) => props.onUnitsChange(Number(event.target.value))}
              />
            </label>
          </div>
          <label>
            Observaciones
            <textarea value={props.notes} onChange={(event) => props.onNotesChange(event.target.value)} />
          </label>
          <button className="primary-button" type="submit">
            <Save size={18} />
            <span>Guardar carga</span>
          </button>
        </form>

        <section className="panel">
          <div className="panel-title">
            <ClipboardList size={21} />
            <h2>Cargas previas</h2>
          </div>
          <div className="table">
            <div className="table-row table-head">
              <span>Semana</span>
              <span>Plazas</span>
              <span>Unidades</span>
            </div>
            {props.entries.map((entry) => (
              <div className="table-row" key={entry.id}>
                <span>{entry.week_start}</span>
                <strong>{entry.occupied_places}</strong>
                <strong>{entry.occupied_units}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}

function AdminPanel(props: {
  compliance: Compliance[];
  stats: StatsRow[];
  period: string;
  weekStart: string;
  onPeriodChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onRefresh: () => void;
  establishments: EstablishmentSummary[];
  lastCreatedId: string;
  selectedProfile: EstablishmentSummary | null;
  selectedProfileEntries: Entry[];
  onCreateEstablishment: (payload: {
    parcel_number: string;
    accommodation_name: string;
    address: string;
    phone: string;
  }) => void;
  onOpenEstablishment: (establishment: EstablishmentSummary) => void;
  onOpenCompliance: (item: Compliance) => void;
  onCloseProfile: () => void;
}) {
  const [newParcelNumber, setNewParcelNumber] = useState("");
  const [newAccommodationName, setNewAccommodationName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");

  function submitEstablishment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onCreateEstablishment({
      parcel_number: newParcelNumber.trim(),
      accommodation_name: newAccommodationName.trim(),
      address: newAddress.trim(),
      phone: newPhone.trim(),
    });
    setNewParcelNumber("");
    setNewAccommodationName("");
    setNewAddress("");
    setNewPhone("");
  }

  async function copyLastId() {
    if (!props.lastCreatedId) return;
    try {
      await navigator.clipboard.writeText(props.lastCreatedId);
    } catch {
      return;
    }
  }

  return (
    <section className="admin-layout">
      {props.selectedProfile ? (
        <section className="panel profile-panel">
          <button className="secondary-button back-button" type="button" onClick={props.onCloseProfile}>
            <ArrowLeft size={18} />
            <span>Volver</span>
          </button>
          <div className="profile-head">
            <div>
              <p className="eyebrow">Perfil de establecimiento</p>
              <h2>{props.selectedProfile.accommodation_name ?? props.selectedProfile.establishment_name}</h2>
            </div>
            <strong className="profile-id">{props.selectedProfile.id}</strong>
          </div>
          <div className="profile-grid">
            <ProfileField label="Nro. de parcela" value={props.selectedProfile.parcel_number} />
            <ProfileField label="Direccion" value={props.selectedProfile.address} />
            <ProfileField label="Telefono" value={props.selectedProfile.phone ?? props.selectedProfile.whatsapp} />
          </div>
          <div className="table">
            <div className="table-row table-head">
              <span>Semana</span>
              <span>Plazas</span>
              <span>Unidades</span>
            </div>
            {props.selectedProfileEntries.map((entry) => (
              <div className="table-row profile-entry-row" key={entry.id}>
                <span>{entry.week_start}</span>
                <strong>{entry.occupied_places}</strong>
                <strong>{entry.occupied_units}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="admin-grid">
      <div className="panel">
        <div className="panel-title">
          <BarChart3 size={21} />
          <h2>Estadisticas</h2>
        </div>
        <div className="toolbar">
          <select value={props.period} onChange={(event) => props.onPeriodChange(event.target.value)}>
            <option value="establishment">Por establecimiento</option>
            <option value="yearly">Anual</option>
            <option value="monthly">Mensual</option>
            <option value="weekend">Fin de semana</option>
          </select>
          <button className="secondary-button" onClick={props.onRefresh}>Actualizar</button>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>Periodo</span>
            <span>Plazas</span>
            <span>Unidades</span>
            <span>Cargas</span>
          </div>
          {props.stats.map((row) => (
            <div className="table-row" key={row.label}>
              <span>{row.label}</span>
              <strong>{row.occupied_places}</strong>
              <strong>{row.occupied_units}</strong>
              <strong>{row.entries}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <Users size={21} />
          <h2>Cumplimiento</h2>
        </div>
        <div className="toolbar">
          <input type="date" value={props.weekStart} onChange={(event) => props.onWeekChange(event.target.value)} />
          <button className="secondary-button" onClick={props.onRefresh}>Revisar</button>
        </div>
        <div className="compliance-list">
          {props.compliance.map((item) => (
            <button className="compliance-item clickable-row" key={item.establishment_id} onClick={() => props.onOpenCompliance(item)}>
              <div>
                <strong>{item.establishment_name}</strong>
                <span>{item.completed ? "Completo" : `Falta: ${item.missing_fields.join(", ")}`}</span>
              </div>
              <span className={item.completed ? "pill ok" : "pill warn"}>
                {item.completed ? "OK" : "Pendiente"}
              </span>
            </button>
          ))}
        </div>
      </div>
      </div>

      <section className="panel">
        <div className="panel-title">
          <Plus size={21} />
          <h2>Establecimientos</h2>
        </div>
        <form className="establishment-form" onSubmit={submitEstablishment}>
          <label>
            Nro. de parcela
            <input
              placeholder="101"
              value={newParcelNumber}
              onChange={(event) => setNewParcelNumber(event.target.value)}
              required
            />
          </label>
          <label>
            Nombre de alojamiento
            <input
              placeholder="Hotel Centro"
              value={newAccommodationName}
              onChange={(event) => setNewAccommodationName(event.target.value)}
              required
            />
          </label>
          <label>
            Direccion
            <input
              placeholder="Av. Principal 123"
              value={newAddress}
              onChange={(event) => setNewAddress(event.target.value)}
              required
            />
          </label>
          <label>
            Telefono
            <input
              placeholder="+549..."
              value={newPhone}
              onChange={(event) => setNewPhone(event.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            <span>Crear</span>
          </button>
        </form>
        {props.lastCreatedId ? (
          <div className="generated-id">
            <div>
              <span>Ultimo ID generado</span>
              <strong>{props.lastCreatedId}</strong>
            </div>
            <button className="icon-button" type="button" onClick={copyLastId} title="Copiar ID">
              <Copy size={18} />
            </button>
          </div>
        ) : null}
        <div className="table establishment-table">
          <div className="table-row table-head">
            <span>ID</span>
            <span>Parcela</span>
            <span>Alojamiento</span>
            <span>Direccion</span>
            <span>Telefono</span>
          </div>
          {props.establishments.map((item) => (
            <button className="table-row clickable-row" key={item.id} onClick={() => props.onOpenEstablishment(item)}>
              <span>{item.id}</span>
              <span>{item.parcel_number ?? "-"}</span>
              <strong>{item.accommodation_name ?? item.establishment_name}</strong>
              <span>{item.address ?? "-"}</span>
              <span>{item.phone ?? item.whatsapp}</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function ProfileField(props: { label: string; value?: string }) {
  return (
    <div className="profile-field">
      <span>{props.label}</span>
      <strong>{props.value || "-"}</strong>
    </div>
  );
}

const demoCompliance: Compliance[] = [
  {
    establishment_id: "10000001",
    establishment_name: "Hotel Sol",
    whatsapp: "+5492901000001",
    week_start: currentWeek,
    completed: true,
    missing_fields: [],
    status: "complete",
  },
  {
    establishment_id: "10000002",
    establishment_name: "Cabanas Rio",
    whatsapp: "+5492901000002",
    week_start: currentWeek,
    completed: false,
    missing_fields: ["occupied_places", "occupied_units"],
    status: "missing",
  },
];

const demoStats: StatsRow[] = [
  { label: "2026-05", occupied_places: 120, occupied_units: 48, entries: 6 },
  { label: "2026-06", occupied_places: 42, occupied_units: 16, entries: 2 },
];

const demoEstablishments: EstablishmentSummary[] = [
  {
    id: "10000001",
    establishment_name: "Hotel Sol",
    accommodation_name: "Hotel Sol",
    parcel_number: "101",
    address: "Av. Principal 123",
    phone: "+5492901000001",
    whatsapp: "+5492901000001",
  },
  {
    id: "10000002",
    establishment_name: "Cabanas Rio",
    accommodation_name: "Cabanas Rio",
    parcel_number: "204",
    address: "Costanera 456",
    phone: "+5492901000002",
    whatsapp: "+5492901000002",
  },
];
