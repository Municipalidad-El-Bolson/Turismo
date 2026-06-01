"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  LogOut,
  MessageCircle,
  Save,
  Users,
} from "lucide-react";
import { Compliance, Entry, StatsRow, User, api, demoEntries, demoUsers } from "../lib/api";

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
    const demo = demoUsers.find((item) => item.id === userId);
    try {
      const response = await api.login(userId);
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
      setMessage("Backend no disponible: usando datos demo.");
      if (demo?.role === "admin") {
        setCompliance(demoCompliance);
        setStats(demoStats);
      }
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
      const [complianceResponse, statsResponse] = await Promise.all([
        api.compliance(userId, weekStart),
        api.stats(userId, period, new Date().getFullYear()),
      ]);
      setCompliance(complianceResponse);
      setStats(statsResponse.rows);
      setMessage("Panel admin actualizado.");
    } catch {
      setCompliance(demoCompliance);
      setStats(demoStats);
      setMessage("Backend no disponible: panel admin en modo demo.");
    }
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
            {demoUsers.map((demoUser) => (
              <button key={demoUser.id} className="login-button" onClick={() => login(demoUser.id)}>
                {demoUser.role === "admin" ? <Users size={20} /> : <CalendarDays size={20} />}
                <span>{demoUser.display_name}</span>
              </button>
            ))}
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
}) {
  return (
    <section className="admin-grid">
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
            <div className="compliance-item" key={item.establishment_id}>
              <div>
                <strong>{item.establishment_name}</strong>
                <span>{item.completed ? "Completo" : `Falta: ${item.missing_fields.join(", ")}`}</span>
              </div>
              <span className={item.completed ? "pill ok" : "pill warn"}>
                {item.completed ? "OK" : "Pendiente"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const demoCompliance: Compliance[] = [
  {
    establishment_id: "hotel-sol",
    establishment_name: "Hotel Sol",
    whatsapp: "+5492901000001",
    week_start: currentWeek,
    completed: true,
    missing_fields: [],
    status: "complete",
  },
  {
    establishment_id: "cabanas-rio",
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
