"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  ClipboardList,
  Download,
  Pencil,
  Trash2,
  LogIn,
  MessageSquareText,
  Plus,
  LogOut,
  MessageCircle,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  Compliance,
  Entry,
  EstablishmentSummary,
  EstablishmentPayload,
  StatsAvailability,
  StatsResponse,
  TypeStatsRow,
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
const todayDate = formatDateInput(new Date());

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDaysFor(value: string) {
  const selected = parseDateInput(value);
  const firstDay = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const lastDay = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const days: Array<string | null> = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(formatDateInput(new Date(selected.getFullYear(), selected.getMonth(), day)));
  }
  return days;
}

const missingFieldLabels: Record<string, string> = {
  occupied_places: "plazas ocupadas",
  occupied_units: "unidades ocupadas",
  period_entries: "carga del periodo",
};

const accommodationTypes = [
  "Hoteles / hosterias",
  "Apart / cabanas",
  "B&B / hospedajes",
  "Hostels",
  "Campings / dormis",
  "Otros",
];

const chartColors = ["#2457a6", "#d64d3b", "#e3a519", "#1f7a4d", "#e86f2d", "#55606f"];

const monthOptions = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

function yearOptions(availability: StatsAvailability) {
  const currentYear = new Date().getFullYear();
  const years = new Set([
    ...Array.from({ length: 8 }, (_, index) => currentYear - 5 + index),
    ...availability.years,
  ]);
  return Array.from(years).sort((a, b) => a - b);
}

function hasYearData(availability: StatsAvailability, year: number) {
  return availability.years.includes(year);
}

function hasMonthData(availability: StatsAvailability, year: number, month: number) {
  return (availability.months_by_year[String(year)] ?? []).includes(month);
}

function formatMissingFields(fields: string[]) {
  return fields.map((field) => missingFieldLabels[field] ?? field).join(", ");
}

function LogoMark(props: { className?: string; src?: string }) {
  return (
    <img
      className={props.className ?? "brand-logo"}
      src={props.src ?? "/el-bolson-logo-dark.png"}
      alt="Turismo El Bolson"
    />
  );
}

function normalizeWhatsAppPhone(phone?: string) {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.startsWith("54")) {
    return digits;
  }
  return digits ? `54${digits}` : "";
}

const communicationTemplates = [
  { value: "load_reminder", label: "Recordatorio de carga" },
  { value: "missing_data", label: "Falta completar datos" },
  { value: "admin_notice", label: "Aviso administrativo" },
  { value: "custom", label: "Mensaje personalizado" },
];

function buildAssistedMessage(template: string, establishmentName: string, detail: string, periodStart: string) {
  const cleanDetail = detail.trim() || "Sin detalle adicional.";

  if (template === "missing_data") {
    return (
      `Hola, ${establishmentName}. Desde Turismo MEB te informamos que tu carga del periodo iniciado el ${periodStart} quedo incompleta.\n\n` +
      `Detalle: ${cleanDetail}\n\n` +
      "Por favor, revisa la informacion cargada para completar el registro.\n\nMuchas gracias."
    );
  }

  if (template === "admin_notice") {
    return (
      `Hola, ${establishmentName}. Desde Turismo MEB necesitamos comunicarnos por una consulta administrativa vinculada al establecimiento.\n\n` +
      `Detalle: ${cleanDetail}\n\n` +
      "Por favor, responde este mensaje cuando puedas.\n\nMuchas gracias."
    );
  }

  if (template === "custom") {
    return cleanDetail;
  }

  return (
    `Hola, ${establishmentName}. Te recordamos cargar la informacion de ocupacion correspondiente al periodo iniciado el ${periodStart} en el sistema de Turismo MEB.\n\n` +
    `Detalle: ${cleanDetail}\n\nMuchas gracias.`
  );
}

function buildWhatsAppDeepLink(phone: string | undefined, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return "";
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<Entry[]>(demoEntries);
  const [compliance, setCompliance] = useState<Compliance[]>([]);
  const [stats, setStats] = useState<StatsResponse>(demoStats);
  const [statsAvailability, setStatsAvailability] = useState<StatsAvailability>(demoStatsAvailability);
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
  const [compliancePeriod, setCompliancePeriod] = useState("week");
  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [statsMonth, setStatsMonth] = useState(new Date().getMonth() + 1);
  const [statsWeekStart, setStatsWeekStart] = useState(currentWeek);
  const [statsRangeStart, setStatsRangeStart] = useState(currentWeek);
  const [statsRangeEnd, setStatsRangeEnd] = useState(todayDate);
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
        setStatsAvailability(demoStatsAvailability);
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
        setStatsAvailability(demoStatsAvailability);
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

  async function deleteEntry(weekStartToDelete: string) {
    if (!user) return;
    try {
      await api.deleteEntry(user.id, user.id, weekStartToDelete);
      setEntries((current) => current.filter((entry) => entry.week_start !== weekStartToDelete));
      setMessage("Carga eliminada.");
    } catch {
      setEntries((current) => current.filter((entry) => entry.week_start !== weekStartToDelete));
      setMessage("Carga eliminada en modo demo.");
    }
  }

  async function loadAdminData(userId = user?.id ?? "meb-admin") {
    try {
      const [complianceResponse, statsResponse, establishmentsResponse, statsAvailabilityResponse] = await Promise.all([
        api.compliance(userId, weekStart, compliancePeriod),
        api.stats(userId, period, statsYear, statsMonth, statsWeekStart, statsRangeStart, statsRangeEnd),
        api.establishments(userId),
        api.statsAvailability(userId),
      ]);
      setCompliance(complianceResponse);
      setStats(statsResponse);
      setEstablishments(establishmentsResponse);
      setStatsAvailability(statsAvailabilityResponse);
      setMessage("Panel admin actualizado.");
    } catch {
      setCompliance(demoCompliance);
      setStats(demoStats);
      setStatsAvailability(demoStatsAvailability);
      setEstablishments(demoEstablishments);
      setMessage("Backend no disponible: panel admin en modo demo.");
    }
  }

  async function createEstablishment(payload: EstablishmentPayload) {
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

  async function updateEstablishment(establishmentId: string, payload: EstablishmentPayload) {
    if (!user) return;
    try {
      const updated = await api.updateEstablishment(user.id, establishmentId, payload);
      setEstablishments((current) => current.map((item) => item.id === establishmentId ? updated : item));
      setSelectedProfile(updated);
      setMessage("Establecimiento actualizado.");
      await loadAdminData(user.id);
      setSelectedProfile(updated);
    } catch {
      setMessage("No se pudo actualizar el establecimiento.");
    }
  }

  async function deleteEstablishment(establishmentId: string) {
    if (!user) return;
    const confirmed = window.confirm("Esto elimina el establecimiento y todas sus cargas. ¿Continuar?");
    if (!confirmed) return;
    try {
      await api.deleteEstablishment(user.id, establishmentId);
      setEstablishments((current) => current.filter((item) => item.id !== establishmentId));
      setSelectedProfile(null);
      setSelectedProfileEntries([]);
      setMessage("Establecimiento eliminado.");
      await loadAdminData(user.id);
    } catch {
      setMessage("No se pudo eliminar el establecimiento.");
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

  function sendReminder(establishmentId: string) {
    const establishment = establishments.find((item) => item.id === establishmentId);
    if (!establishment) {
      setMessage("No se encontro el establecimiento para abrir WhatsApp.");
      return;
    }
    const message = buildAssistedMessage(
      "load_reminder",
      establishment.accommodation_name ?? establishment.establishment_name,
      "",
      weekStart,
    );
    const url = buildWhatsAppDeepLink(establishment.phone ?? establishment.whatsapp, message);
    if (!url) {
      setMessage("Ese establecimiento no tiene telefono para WhatsApp.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setMessage("Se abrio WhatsApp con el mensaje preparado. El envio final se confirma en WhatsApp Web/app.");
  }

  function sendMissingReminders() {
    const pending = compliance.filter((item) => !item.completed);
    let opened = 0;
    pending.forEach((item) => {
      const establishment = establishments.find((candidate) => candidate.id === item.establishment_id);
      const establishmentName = establishment?.accommodation_name ?? item.establishment_name;
      const phone = establishment?.phone ?? establishment?.whatsapp ?? item.whatsapp;
      const message = buildAssistedMessage("load_reminder", establishmentName, "", weekStart);
      const url = buildWhatsAppDeepLink(phone, message);
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
      opened += 1;
    });
    setMessage(
      opened
        ? `Se prepararon ${opened} enlaces de WhatsApp para pendientes. El envio final queda en WhatsApp Web/app.`
        : "No hay pendientes con telefono para abrir WhatsApp.",
    );
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
          <div className="login-hero-panel">
            <div className="brand-lockup">
              <LogoMark className="brand-logo hero-logo" src="/el-bolson-turismo-2021.avif" />
              <p className="eyebrow">Turismo MEB</p>
            </div>
            <h1>Control de carga y ocupacion semanal</h1>
            <p className="lede">
              Ingreso simple para establecimientos y tablero de seguimiento para usuarios MEB.
            </p>
            <div className="login-highlight-grid">
              <span>Ocupacion</span>
              <span>Cumplimiento</span>
              <span>Estadisticas</span>
            </div>
          </div>
          <div className="login-actions" aria-label="Usuarios demo">
            <form className="login-card" onSubmit={(event) => { event.preventDefault(); loginAdmin(); }}>
              <div className="panel-title card-title">
                <div>
                  <Users size={21} />
                  <h2>Admin MEB</h2>
                </div>
                <LogoMark className="brand-logo card-logo" />
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
              <div className="panel-title card-title">
                <div>
                  <Building2 size={21} />
                  <h2>Emprendimiento</h2>
                </div>
                <LogoMark className="brand-logo card-logo" />
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
        <div className="topbar-brand">
          <LogoMark className="brand-logo topbar-logo" src="/el-bolson-logo-title.png" />
          <div>
            <p className="eyebrow">Turismo MEB</p>
            <h1>{isAdmin ? "Panel admin" : user.establishment_name}</h1>
          </div>
        </div>
        <button className="icon-button" onClick={() => setUser(null)} title="Salir">
          <LogOut size={19} />
        </button>
      </header>

      {message && !message.startsWith("Backend no disponible") ? (
        <p className="notice">{message}</p>
      ) : null}

      {isAdmin ? (
        <AdminPanel
          compliance={compliance}
          stats={stats}
          statsAvailability={statsAvailability}
          period={period}
          compliancePeriod={compliancePeriod}
          weekStart={weekStart}
          statsYear={statsYear}
          statsMonth={statsMonth}
          statsWeekStart={statsWeekStart}
          statsRangeStart={statsRangeStart}
          statsRangeEnd={statsRangeEnd}
          onPeriodChange={setPeriod}
          onCompliancePeriodChange={setCompliancePeriod}
          onWeekChange={setWeekStart}
          onStatsYearChange={setStatsYear}
          onStatsMonthChange={setStatsMonth}
          onStatsWeekStartChange={setStatsWeekStart}
          onStatsRangeStartChange={setStatsRangeStart}
          onStatsRangeEndChange={setStatsRangeEnd}
          onRefresh={() => loadAdminData()}
          establishments={establishments}
          lastCreatedId={lastCreatedId}
          selectedProfile={selectedProfile}
          selectedProfileEntries={selectedProfileEntries}
          onCreateEstablishment={createEstablishment}
          onUpdateEstablishment={updateEstablishment}
          onDeleteEstablishment={deleteEstablishment}
          onOpenEstablishment={openEstablishmentProfile}
          onOpenCompliance={openComplianceProfile}
          onSendReminder={sendReminder}
          onSendMissingReminders={sendMissingReminders}
          onCloseProfile={() => {
            setSelectedProfile(null);
            setSelectedProfileEntries([]);
          }}
        />
      ) : (
        <EstablishmentPanel
          establishment={user}
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
          onSelectEmptyDate={(date) => {
            setWeekStart(date);
            setOccupiedPlaces(0);
            setOccupiedUnits(0);
            setNotes("");
            setMessage("Dia seleccionado para cargar.");
          }}
          onEdit={(entry) => {
            setWeekStart(entry.week_start);
            setOccupiedPlaces(entry.occupied_places);
            setOccupiedUnits(entry.occupied_units);
            setNotes(entry.notes ?? "");
            setMessage("Carga lista para editar.");
          }}
          onDelete={deleteEntry}
        />
      )}
    </main>
  );
}

function EstablishmentPanel(props: {
  establishment: User;
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
  onSelectEmptyDate: (date: string) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (weekStart: string) => void;
}) {
  const hasCurrentWeek = props.entries.some((entry) => entry.week_start === props.weekStart);
  const loadStatus = hasCurrentWeek ? "Carga completa para el dia seleccionado" : "Falta cargar este dia";
  const entriesByDate = useMemo(
    () => new Map(props.entries.map((entry) => [entry.week_start, entry])),
    [props.entries],
  );
  const calendarDays = useMemo(() => calendarDaysFor(props.weekStart), [props.weekStart]);
  const availablePlaces = typeof props.establishment.places === "number"
    ? Math.max(props.establishment.places - props.occupiedPlaces, 0)
    : undefined;
  const availableUnits = typeof props.establishment.units === "number"
    ? Math.max(props.establishment.units - props.occupiedUnits, 0)
    : undefined;

  return (
    <>
      <section className="status-strip">
        <div className={hasCurrentWeek ? "status ok" : "status warn"}>
          {hasCurrentWeek ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <span>{loadStatus}</span>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="panel merchant-load-panel" onSubmit={(event) => { event.preventDefault(); props.onSave(); }}>
          <div className="panel-title">
            <CalendarDays size={21} />
            <h2>Carga diaria</h2>
          </div>
          <label>
            Dia
            <input type="date" value={props.weekStart} onChange={(event) => props.onWeekChange(event.target.value)} />
          </label>
          <div className="calendar-card">
            <div className="calendar-header">
              <strong>{parseDateInput(props.weekStart).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</strong>
              <span>Verde cargado · amarillo pendiente</span>
            </div>
            <div className="calendar-grid calendar-weekdays">
              {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
            </div>
            <div className="calendar-grid">
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <span className="calendar-empty" key={`empty-${index}`} />;
                }
                const entry = entriesByDate.get(date);
                const isSelected = date === props.weekStart;
                return (
                  <button
                    className={[
                      "calendar-day",
                      entry ? "loaded" : "missing",
                      isSelected ? "selected" : "",
                    ].filter(Boolean).join(" ")}
                    key={date}
                    type="button"
                    title={entry ? "Editar carga" : "Cargar este dia"}
                    onClick={() => entry ? props.onEdit(entry) : props.onSelectEmptyDate(date)}
                  >
                    <span>{parseDateInput(date).getDate()}</span>
                    {entry ? <small>{entry.occupied_places}p / {entry.occupied_units}u</small> : <small>Pendiente</small>}
                  </button>
                );
              })}
            </div>
          </div>
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

        <section className="panel merchant-history-panel">
          <div className="panel-title">
            <ClipboardList size={21} />
            <h2>Cargas previas</h2>
          </div>
          <div className="availability-card">
            <div className="availability-heading">
              <strong>Disponibilidad del dia seleccionado</strong>
              <span>{props.weekStart}</span>
            </div>
            <div className="availability-grid">
              <div>
                <span>Plazas disponibles</span>
                <strong>{formatOptionalNumber(availablePlaces)}</strong>
                <small>{formatOptionalNumber(props.establishment.places)} capacidad</small>
              </div>
              <div>
                <span>Unidades disponibles</span>
                <strong>{formatOptionalNumber(availableUnits)}</strong>
                <small>{formatOptionalNumber(props.establishment.units)} capacidad</small>
              </div>
            </div>
          </div>
          <div className="table">
            <div className="table-row table-head">
              <span>Dia</span>
              <span>Plazas</span>
              <span>Unidades</span>
              <span></span>
            </div>
            {props.entries.map((entry) => (
              <div className="table-row" key={entry.id}>
                <span>{entry.week_start}</span>
                <strong>{entry.occupied_places}</strong>
                <strong>{entry.occupied_units}</strong>
                <span className="row-actions">
                  <button className="icon-button compact-icon" type="button" title="Editar carga" onClick={() => props.onEdit(entry)}>
                    <Pencil size={16} />
                  </button>
                  <button className="icon-button compact-icon danger-icon" type="button" title="Eliminar carga" onClick={() => props.onDelete(entry.week_start)}>
                    <Trash2 size={16} />
                  </button>
                </span>
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
  stats: StatsResponse;
  statsAvailability: StatsAvailability;
  period: string;
  compliancePeriod: string;
  weekStart: string;
  statsYear: number;
  statsMonth: number;
  statsWeekStart: string;
  statsRangeStart: string;
  statsRangeEnd: string;
  onPeriodChange: (value: string) => void;
  onCompliancePeriodChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onStatsYearChange: (value: number) => void;
  onStatsMonthChange: (value: number) => void;
  onStatsWeekStartChange: (value: string) => void;
  onStatsRangeStartChange: (value: string) => void;
  onStatsRangeEndChange: (value: string) => void;
  onRefresh: () => void;
  establishments: EstablishmentSummary[];
  lastCreatedId: string;
  selectedProfile: EstablishmentSummary | null;
  selectedProfileEntries: Entry[];
  onCreateEstablishment: (payload: EstablishmentPayload) => void;
  onUpdateEstablishment: (establishmentId: string, payload: EstablishmentPayload) => void;
  onDeleteEstablishment: (establishmentId: string) => void;
  onOpenEstablishment: (establishment: EstablishmentSummary) => void;
  onOpenCompliance: (item: Compliance) => void;
  onSendReminder: (establishmentId: string) => void;
  onSendMissingReminders: () => void;
  onCloseProfile: () => void;
}) {
  const [newParcelNumber, setNewParcelNumber] = useState("");
  const [newAccommodationName, setNewAccommodationName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newUnits, setNewUnits] = useState("");
  const [newPlaces, setNewPlaces] = useState("");
  const [newAccommodationType, setNewAccommodationType] = useState(accommodationTypes[0]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editParcelNumber, setEditParcelNumber] = useState("");
  const [editAccommodationName, setEditAccommodationName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editUnits, setEditUnits] = useState("");
  const [editPlaces, setEditPlaces] = useState("");
  const [editAccommodationType, setEditAccommodationType] = useState(accommodationTypes[0]);
  const [editTemporaryLeaveStart, setEditTemporaryLeaveStart] = useState("");
  const [editTemporaryLeaveEnd, setEditTemporaryLeaveEnd] = useState("");
  const [establishmentSearch, setEstablishmentSearch] = useState("");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [complianceStatusFilter, setComplianceStatusFilter] = useState("all");
  const [communicationOpen, setCommunicationOpen] = useState(false);
  const [communicationTargetId, setCommunicationTargetId] = useState("");
  const [communicationTemplate, setCommunicationTemplate] = useState(communicationTemplates[0].value);
  const [communicationDetail, setCommunicationDetail] = useState("");
  const [adminView, setAdminView] = useState<"dashboard" | "create" | "compliance">("dashboard");

  const filteredEstablishments = useMemo(() => {
    const query = establishmentSearch.trim().toLowerCase();
    if (!query) return props.establishments;
    return props.establishments.filter((item) =>
      [
        item.id,
        item.parcel_number,
        item.accommodation_name,
        item.establishment_name,
        item.address,
        item.phone,
        item.whatsapp,
        item.accommodation_type,
        item.temporary_leave_start,
        item.temporary_leave_end,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [establishmentSearch, props.establishments]);

  const filteredCompliance = useMemo(() => {
    const query = complianceSearch.trim().toLowerCase();
    return props.compliance.filter((item) =>
      (complianceStatusFilter === "all"
        || (complianceStatusFilter === "complete" && item.completed)
        || (complianceStatusFilter === "missing" && !item.completed))
      && (!query || [item.establishment_id, item.establishment_name, item.whatsapp]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))),
    );
  }, [complianceSearch, complianceStatusFilter, props.compliance]);

  const missingPhones = props.establishments.filter((item) => !item.phone && !item.whatsapp).length;
  const completedCompliance = props.compliance.filter((item) => item.completed).length;
  const pendingCompliance = Math.max(props.compliance.length - completedCompliance, 0);
  const complianceRate = props.compliance.length ? Math.round((completedCompliance / props.compliance.length) * 100) : 0;
  const totalPlaces = props.establishments.reduce((sum, item) => sum + (item.places ?? 0), 0);
  const totalUnits = props.establishments.reduce((sum, item) => sum + (item.units ?? 0), 0);
  const communicationTargets = useMemo(
    () => props.establishments.filter((item) => item.phone || item.whatsapp),
    [props.establishments],
  );
  const selectedCommunicationTarget = useMemo(
    () => communicationTargets.find((item) => item.id === communicationTargetId) ?? communicationTargets[0],
    [communicationTargetId, communicationTargets],
  );
  const communicationMessage = buildAssistedMessage(
    communicationTemplate,
    selectedCommunicationTarget?.accommodation_name ?? selectedCommunicationTarget?.establishment_name ?? "establecimiento",
    communicationDetail,
    props.weekStart,
  );
  const selectedYearHasData = hasYearData(props.statsAvailability, props.statsYear);
  const selectedMonthHasData = hasMonthData(props.statsAvailability, props.statsYear, props.statsMonth);
  const selectedPeriodHasData = props.period === "yearly"
    ? selectedYearHasData
    : props.period === "monthly"
      ? selectedMonthHasData
      : true;

  useEffect(() => {
    if (!props.selectedProfile && !communicationOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (communicationOpen) {
        setCommunicationOpen(false);
        return;
      }
      if (props.selectedProfile) {
        closeProfileModal();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [communicationOpen, props.selectedProfile]);

  function submitEstablishment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onCreateEstablishment({
      parcel_number: newParcelNumber.trim(),
      accommodation_name: newAccommodationName.trim(),
      address: newAddress.trim(),
      phone: newPhone.trim(),
      units: parseOptionalNumber(newUnits),
      places: parseOptionalNumber(newPlaces),
      accommodation_type: newAccommodationType,
    });
    setNewParcelNumber("");
    setNewAccommodationName("");
    setNewAddress("");
    setNewPhone("");
    setNewUnits("");
    setNewPlaces("");
    setNewAccommodationType(accommodationTypes[0]);
  }

  function startEditingProfile(establishment: EstablishmentSummary) {
    setEditParcelNumber(establishment.parcel_number ?? "");
    setEditAccommodationName(establishment.accommodation_name ?? establishment.establishment_name);
    setEditAddress(establishment.address ?? "");
    setEditPhone(establishment.phone ?? establishment.whatsapp ?? "");
    setEditUnits(formatEditNumber(establishment.units));
    setEditPlaces(formatEditNumber(establishment.places));
    setEditAccommodationType(establishment.accommodation_type ?? accommodationTypes[0]);
    setEditTemporaryLeaveStart(establishment.temporary_leave_start ?? "");
    setEditTemporaryLeaveEnd(establishment.temporary_leave_end ?? "");
    setEditingProfile(true);
  }

  function saveProfileEdit(establishment: EstablishmentSummary) {
    props.onUpdateEstablishment(establishment.id, {
      parcel_number: editParcelNumber.trim(),
      accommodation_name: editAccommodationName.trim(),
      address: editAddress.trim(),
      phone: editPhone.trim(),
      units: parseOptionalNumber(editUnits),
      places: parseOptionalNumber(editPlaces),
      accommodation_type: editAccommodationType,
      temporary_leave_start: editTemporaryLeaveStart || undefined,
      temporary_leave_end: editTemporaryLeaveEnd || undefined,
    });
    setEditingProfile(false);
  }

  async function copyLastId() {
    if (!props.lastCreatedId) return;
    try {
      await navigator.clipboard.writeText(props.lastCreatedId);
    } catch {
      return;
    }
  }

  function openCommunication(establishmentId?: string) {
    const pendingId = filteredCompliance.find((item) => !item.completed && (item.whatsapp || props.establishments.find((est) => est.id === item.establishment_id)?.phone))?.establishment_id;
    const nextTargetId = establishmentId || props.selectedProfile?.id || pendingId || communicationTargets[0]?.id || "";
    setCommunicationTargetId(nextTargetId);
    setCommunicationOpen(true);
  }

  function targetHasPhone(establishmentId: string) {
    const establishment = props.establishments.find((item) => item.id === establishmentId);
    return Boolean(establishment?.phone || establishment?.whatsapp);
  }

  function sendAssistedWhatsApp() {
    const phone = selectedCommunicationTarget?.phone ?? selectedCommunicationTarget?.whatsapp;
    const url = buildWhatsAppDeepLink(phone, communicationMessage);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function closeProfileModal() {
    setEditingProfile(false);
    props.onCloseProfile();
  }

  return (
    <section className="admin-layout">
      {props.selectedProfile ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeProfileModal}>
        <section className="panel profile-panel modal-card profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="profile-actions">
            <button className="secondary-button back-button" type="button" onClick={closeProfileModal}>
              <ArrowLeft size={18} />
              <span>Volver</span>
            </button>
            <div className="profile-action-group">
              {editingProfile ? (
                <>
                  <button className="primary-button inline-button" type="button" onClick={() => saveProfileEdit(props.selectedProfile!)}>
                    <Save size={18} />
                    <span>Guardar</span>
                  </button>
                  <button className="secondary-button inline-button" type="button" onClick={() => setEditingProfile(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button className="secondary-button inline-button" type="button" onClick={() => startEditingProfile(props.selectedProfile!)}>
                  <Pencil size={18} />
                  <span>Editar</span>
                </button>
              )}
              <button className="secondary-button inline-button danger-button" type="button" onClick={() => props.onDeleteEstablishment(props.selectedProfile!.id)}>
                <Trash2 size={18} />
                <span>Eliminar</span>
              </button>
            </div>
          </div>
          <div className="profile-head">
            <div>
              <p className="eyebrow">Perfil de establecimiento</p>
              <h2 id="profile-modal-title">{props.selectedProfile.accommodation_name ?? props.selectedProfile.establishment_name}</h2>
            </div>
            <div className="profile-id-actions">
              <strong className="profile-id">{props.selectedProfile.id}</strong>
              <button
                className="secondary-button inline-button"
                type="button"
                onClick={() => openCommunication(props.selectedProfile!.id)}
                disabled={!props.selectedProfile.phone && !props.selectedProfile.whatsapp}
              >
                <MessageSquareText size={18} />
                <span>Recordar</span>
              </button>
            </div>
          </div>
          {editingProfile ? (
            <div className="edit-grid">
              <label>Nro. de parcela<input value={editParcelNumber} onChange={(event) => setEditParcelNumber(event.target.value)} /></label>
              <label>Nombre de alojamiento<input value={editAccommodationName} onChange={(event) => setEditAccommodationName(event.target.value)} /></label>
              <label>Direccion<input value={editAddress} onChange={(event) => setEditAddress(event.target.value)} /></label>
              <label>Telefono<input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} /></label>
              <label>
                Tipo de alojamiento
                <select value={editAccommodationType} onChange={(event) => setEditAccommodationType(event.target.value)}>
                  {accommodationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>Unidades<input type="number" min="0" value={editUnits} onChange={(event) => setEditUnits(event.target.value)} /></label>
              <label>Plazas<input type="number" min="0" value={editPlaces} onChange={(event) => setEditPlaces(event.target.value)} /></label>
              <label>Baja temporal desde<input type="date" value={editTemporaryLeaveStart} onChange={(event) => setEditTemporaryLeaveStart(event.target.value)} /></label>
              <label>Baja temporal hasta<input type="date" value={editTemporaryLeaveEnd} onChange={(event) => setEditTemporaryLeaveEnd(event.target.value)} /></label>
            </div>
          ) : (
            <div className="profile-grid">
              <ProfileField label="Nro. de parcela" value={props.selectedProfile.parcel_number} />
              <ProfileField label="Direccion" value={props.selectedProfile.address} />
              <ProfileField label="Telefono" value={props.selectedProfile.phone ?? props.selectedProfile.whatsapp} />
              <ProfileField label="Tipo de alojamiento" value={props.selectedProfile.accommodation_type} />
              <ProfileField label="Unidades habilitadas" value={formatOptionalNumber(props.selectedProfile.units)} />
              <ProfileField label="Plazas habilitadas" value={formatOptionalNumber(props.selectedProfile.places)} />
              <ProfileField label="Baja temporal" value={formatTemporaryLeave(props.selectedProfile)} />
            </div>
          )}
          <div className="table profile-entries-scroll">
            <div className="table-row table-head">
              <span>Dia</span>
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
        </div>
      ) : null}
      {communicationOpen ? (
        <div className="modal-backdrop communication-backdrop" role="presentation" onMouseDown={() => setCommunicationOpen(false)}>
        <section className="assisted-communication-panel modal-card communication-modal" id="comunicacion-asistida" role="dialog" aria-modal="true" aria-labelledby="communication-modal-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="assisted-communication-header">
            <strong>
              <MessageCircle size={17} />
              <span id="communication-modal-title">Comunicacion asistida</span>
            </strong>
            <div className="assisted-heading-actions">
              <span>WhatsApp abre el mensaje listo para revisar y enviar</span>
              <button
                className="icon-button"
                type="button"
                title="Cerrar comunicacion"
                aria-label="Cerrar comunicacion"
                onClick={() => setCommunicationOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="assisted-communication-body">
            <aside className="assisted-summary-card">
              <div className="summary-icon">
                <MessageCircle size={24} />
              </div>
              <div>
                <h3>Mensaje listo para revisar</h3>
                <p>Elegis el motivo, completas el detalle y WhatsApp abre la conversacion con el texto preparado.</p>
              </div>
              <div className="assisted-recipient">
                <span>Destinatario</span>
                <strong>{selectedCommunicationTarget?.accommodation_name ?? selectedCommunicationTarget?.establishment_name ?? "Sin telefono disponible"}</strong>
                <small>{selectedCommunicationTarget?.phone ?? selectedCommunicationTarget?.whatsapp ?? "Agrega un telefono al perfil"}</small>
              </div>
            </aside>
            <div className="assisted-workspace">
              <div className="assisted-form-grid">
                <label>
                  Asunto / plantilla
                  <select value={communicationTemplate} onChange={(event) => setCommunicationTemplate(event.target.value)}>
                    {communicationTemplates.map((template) => (
                      <option key={template.value} value={template.value}>{template.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Telefono WhatsApp
                  {communicationTargets.length ? (
                    <select value={selectedCommunicationTarget?.id ?? ""} onChange={(event) => setCommunicationTargetId(event.target.value)}>
                      {communicationTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {(target.phone ?? target.whatsapp) || "Sin telefono"} - {target.accommodation_name ?? target.establishment_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value="Sin telefono cargado" disabled />
                  )}
                </label>
                <label>
                  Detalle para completar el mensaje
                  <input
                    value={communicationDetail}
                    onChange={(event) => setCommunicationDetail(event.target.value)}
                    placeholder="Ej.: falta cargar unidades / revisar plazas / coordinar respuesta"
                  />
                </label>
              </div>
              <div className="assisted-preview-row">
                <label className="assisted-preview">
                  Vista previa
                  <textarea readOnly value={communicationMessage} />
                </label>
                <div className="assisted-send-area">
                  <button
                    className="primary-button whatsapp-send-button"
                    type="button"
                    onClick={sendAssistedWhatsApp}
                    disabled={!selectedCommunicationTarget}
                  >
                    <MessageCircle size={17} />
                    <span>Enviar WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
        </div>
      ) : null}
      <section className="admin-command-center">
        <button className={adminView === "dashboard" ? "command-button active" : "command-button"} type="button" onClick={() => setAdminView("dashboard")}>
          <BarChart3 size={22} />
          <span>Dashboard</span>
          <small>Graficos y resumen general</small>
        </button>
        <button className={adminView === "create" ? "command-button active" : "command-button"} type="button" onClick={() => setAdminView("create")}>
          <Plus size={22} />
          <span>Crear</span>
          <small>Alta y lista de establecimientos</small>
        </button>
        <button className={adminView === "compliance" ? "command-button active" : "command-button"} type="button" onClick={() => setAdminView("compliance")}>
          <Users size={22} />
          <span>Cumplimiento</span>
          <small>{pendingCompliance} pendientes</small>
        </button>
      </section>

      {adminView === "dashboard" ? (
      <section className="dashboard-view">
        <div className="dashboard-hero">
          <div>
            <p className="eyebrow">Panel MEB</p>
            <h2>Dashboard de ocupacion turistica</h2>
            <p>Vista general para seguir participacion, respuestas y ocupacion por tipo de alojamiento.</p>
          </div>
          <div className="dashboard-hero-mark">
            <LogoMark className="dashboard-logo" src="/el-bolson-turismo-2021.avif" />
          </div>
        </div>
        <div className="dashboard-metrics">
          <div className="dashboard-metric-card">
            <span>Establecimientos</span>
            <strong>{props.establishments.length}</strong>
            <small>{missingPhones} sin telefono</small>
          </div>
          <div className="dashboard-metric-card green-card">
            <span>Cumplimiento</span>
            <strong>{complianceRate}%</strong>
            <small>{completedCompliance}/{props.compliance.length} completos</small>
          </div>
          <div className="dashboard-metric-card amber-card">
            <span>Pendientes</span>
            <strong>{pendingCompliance}</strong>
            <small>para el periodo elegido</small>
          </div>
          <div className="dashboard-metric-card blue-card">
            <span>Capacidad cargada</span>
            <strong>{totalPlaces}</strong>
            <small>{totalUnits} unidades</small>
          </div>
        </div>
      <div className="panel dashboard-stats-panel">
        <div className="panel-header">
          <div className="panel-title">
            <BarChart3 size={21} />
            <h2>Estadisticas</h2>
          </div>
          <span className="count-badge">{props.stats.weeks} semana{props.stats.weeks === 1 ? "" : "s"}</span>
        </div>
        <div className="toolbar">
          <select value={props.period} onChange={(event) => props.onPeriodChange(event.target.value)}>
            <option value="yearly">Anual</option>
            <option value="monthly">Mensual</option>
            <option value="weekend">Fin de semana</option>
            <option value="range">Rango de fechas</option>
          </select>
          <button className="secondary-button" onClick={props.onRefresh}>Actualizar</button>
        </div>
        <div className="stats-filter-grid">
          {(props.period === "yearly" || props.period === "monthly") ? (
            <label>
              Ano
              <select value={props.statsYear} onChange={(event) => props.onStatsYearChange(Number(event.target.value))}>
                {yearOptions(props.statsAvailability).map((year) => {
                  const hasData = hasYearData(props.statsAvailability, year);
                  return (
                    <option
                      className={hasData ? undefined : "muted-option"}
                      disabled={!hasData && year !== props.statsYear}
                      key={year}
                      value={year}
                    >
                      {hasData ? year : `${year} - sin datos`}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : null}
          {props.period === "monthly" ? (
            <label>
              Mes
              <select value={props.statsMonth} onChange={(event) => props.onStatsMonthChange(Number(event.target.value))}>
                {monthOptions.map((month) => {
                  const hasData = hasMonthData(props.statsAvailability, props.statsYear, month.value);
                  return (
                    <option
                      className={hasData ? undefined : "muted-option"}
                      disabled={!hasData && month.value !== props.statsMonth}
                      key={month.value}
                      value={month.value}
                    >
                      {hasData ? month.label : `${month.label} - sin datos`}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : null}
          {props.period === "weekend" ? (
            <label>
              Semana
              <input type="date" value={props.statsWeekStart} onChange={(event) => props.onStatsWeekStartChange(event.target.value)} />
            </label>
          ) : null}
          {props.period === "range" ? (
            <>
              <label>
                Desde
                <input type="date" value={props.statsRangeStart} onChange={(event) => props.onStatsRangeStartChange(event.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={props.statsRangeEnd} onChange={(event) => props.onStatsRangeEndChange(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
        {!selectedPeriodHasData ? (
          <p className="empty-data-hint">No hay datos cargados para el periodo seleccionado.</p>
        ) : null}
        <StatsCharts rows={props.stats.type_rows} />
      </div>
      </section>
      ) : null}

      {adminView === "compliance" ? (
      <section className="panel compliance-panel dashboard-section-panel">
        <div className="panel-header">
          <div className="panel-title">
            <Users size={21} />
            <h2>Cumplimiento</h2>
          </div>
          <span className="count-badge">{filteredCompliance.length}/{props.compliance.length}</span>
        </div>
        <div className="compliance-controls">
          <div className="toolbar compliance-toolbar">
            <select value={props.compliancePeriod} onChange={(event) => props.onCompliancePeriodChange(event.target.value)}>
              <option value="week">Semana</option>
              <option value="fortnight">Quincena</option>
              <option value="month">Mes</option>
            </select>
            <select value={complianceStatusFilter} onChange={(event) => setComplianceStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="complete">Cumplidos</option>
              <option value="missing">No cumplidos</option>
            </select>
            <input type="date" value={props.weekStart} onChange={(event) => props.onWeekChange(event.target.value)} />
            <button className="secondary-button" onClick={props.onRefresh}>Revisar</button>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="Buscar en cumplimiento"
              placeholder="Buscar alojamiento o ID"
              value={complianceSearch}
              onChange={(event) => setComplianceSearch(event.target.value)}
            />
          </div>
          <button className="primary-button reminder-all" type="button" onClick={() => openCommunication()}>
            <MessageSquareText size={18} />
            <span>Recordar pendientes</span>
          </button>
        </div>
        <div className="compliance-list scroll-list">
          {filteredCompliance.map((item) => (
            <div className="compliance-item" key={item.establishment_id}>
              <button className="compliance-main clickable-row" type="button" onClick={() => props.onOpenCompliance(item)}>
                <div>
                  <strong>{item.establishment_name}</strong>
                  <span>{item.completed ? "Completo" : `Falta: ${formatMissingFields(item.missing_fields)}`}</span>
                </div>
                <span className={item.completed ? "pill ok" : "pill warn"}>
                  {item.completed ? "OK" : "Pendiente"}
                </span>
              </button>
              <button
                className="icon-button compact-icon"
                type="button"
                title="Abrir WhatsApp"
                onClick={() => openCommunication(item.establishment_id)}
                disabled={!targetHasPhone(item.establishment_id)}
              >
                <MessageSquareText size={17} />
              </button>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {adminView === "create" ? (
      <section className="panel establishments-panel dashboard-section-panel">
        <div className="panel-header">
          <div className="panel-title">
            <Plus size={21} />
            <h2>Establecimientos</h2>
          </div>
          <div className="metric-strip">
            <span className="count-badge">{filteredEstablishments.length}/{props.establishments.length}</span>
            <span className={missingPhones ? "count-badge warn-badge" : "count-badge ok-badge"}>
              {missingPhones} sin telefono
            </span>
          </div>
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
          <label>
            Tipo de alojamiento
            <select value={newAccommodationType} onChange={(event) => setNewAccommodationType(event.target.value)}>
              {accommodationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Unidades
            <input
              type="number"
              min="0"
              value={newUnits}
              onChange={(event) => setNewUnits(event.target.value)}
            />
          </label>
          <label>
            Plazas
            <input
              type="number"
              min="0"
              value={newPlaces}
              onChange={(event) => setNewPlaces(event.target.value)}
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
        <div className="list-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="Buscar establecimientos"
              placeholder="Buscar por nombre, ID, parcela, direccion o telefono"
              value={establishmentSearch}
              onChange={(event) => setEstablishmentSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="table establishment-table data-list">
          <div className="table-row table-head sticky-head">
            <span>ID</span>
            <span>Parcela</span>
            <span>Alojamiento</span>
            <span>Direccion</span>
            <span>Telefono</span>
            <span>Tipo</span>
            <span>Unid.</span>
            <span>Plazas</span>
          </div>
          {filteredEstablishments.map((item) => (
            <button className="table-row clickable-row" key={item.id} onClick={() => props.onOpenEstablishment(item)}>
              <span>{item.id}</span>
              <span>{item.parcel_number ?? "-"}</span>
              <strong>{item.accommodation_name ?? item.establishment_name}</strong>
              <span>{item.address ?? "-"}</span>
              <span>{item.phone ?? item.whatsapp}</span>
              <span>{item.accommodation_type ?? "-"}</span>
              <span>{formatOptionalNumber(item.units)}</span>
              <span>{formatOptionalNumber(item.places)}</span>
            </button>
          ))}
          {filteredEstablishments.length === 0 ? (
            <div className="empty-state">No hay establecimientos para esa busqueda.</div>
          ) : null}
        </div>
      </section>
      ) : null}
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

function formatTemporaryLeave(establishment: EstablishmentSummary) {
  if (!establishment.temporary_leave_start || !establishment.temporary_leave_end) {
    return undefined;
  }
  return `${establishment.temporary_leave_start} al ${establishment.temporary_leave_end}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function downloadCanvas(canvas: HTMLCanvasElement, fileName: string) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function prepareCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.font = "14px Arial";
  context.textBaseline = "middle";
  return { canvas, context };
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  let value = text;
  while (context.measureText(value).width > maxWidth && value.length > 4) {
    value = `${value.slice(0, -4)}...`;
  }
  context.fillText(value, x, y);
}

function downloadPieChart(rows: TypeStatsRow[], totalResponses: number) {
  const prepared = prepareCanvas(980, 560);
  if (!prepared) return;
  const { canvas, context } = prepared;
  drawPieChartOnCanvas(context, rows, totalResponses, 40, 36);
  downloadCanvas(canvas, "nivel-de-participacion.png");
}

function drawPieChartOnCanvas(
  context: CanvasRenderingContext2D,
  rows: TypeStatsRow[],
  totalResponses: number,
  x: number,
  y: number,
) {
  context.fillStyle = "#18201c";
  context.font = "700 28px Arial";
  context.fillText("Nivel de participacion", x, y + 10);
  context.fillStyle = "#68736b";
  context.font = "700 16px Arial";
  context.fillText(`N=${totalResponses}`, x, y + 44);

  const values = rows.map((row) => row.response_count);
  const total = values.reduce((sum, value) => sum + value, 0);
  const centerX = x + 220;
  const centerY = y + 264;
  const radius = 150;
  let startAngle = -Math.PI / 2;
  if (!total) {
    context.fillStyle = "#eef1ea";
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
  } else {
    values.forEach((value, index) => {
      const angle = (value / total) * Math.PI * 2;
      context.fillStyle = chartColors[index % chartColors.length];
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, startAngle, startAngle + angle);
      context.closePath();
      context.fill();
      startAngle += angle;
    });
  }

  rows.forEach((row, index) => {
    const legendY = y + 134 + index * 42;
    context.fillStyle = chartColors[index % chartColors.length];
    context.fillRect(x + 460, legendY - 7, 14, 14);
    context.fillStyle = "#23323f";
    context.font = "700 15px Arial";
    drawText(context, row.accommodation_type, x + 486, legendY, 250);
    context.fillStyle = "#68736b";
    context.font = "14px Arial";
    context.fillText(`${row.response_count} (${formatPercent(percentFrom(row.response_count, totalResponses))})`, x + 750, legendY);
  });
}

function downloadBarChart(
  title: string,
  subtitle: string,
  rows: TypeStatsRow[],
  value: (row: TypeStatsRow) => number,
  valueLabel: (value: number) => string,
) {
  const height = Math.max(340, 130 + rows.length * 44);
  const prepared = prepareCanvas(980, height);
  if (!prepared) return;
  const { canvas, context } = prepared;
  drawBarChartOnCanvas(context, title, subtitle, rows, value, valueLabel, 40, 36, 900, height - 52);
  downloadCanvas(canvas, `${slugify(title)}.png`);
}

function drawBarChartOnCanvas(
  context: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  rows: TypeStatsRow[],
  value: (row: TypeStatsRow) => number,
  valueLabel: (value: number) => string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.fillStyle = "#18201c";
  context.font = "700 28px Arial";
  context.fillText(title, x, y + 10);
  context.fillStyle = "#68736b";
  context.font = "700 16px Arial";
  context.fillText(subtitle, x, y + 44);

  const values = rows.map(value);
  const max = Math.max(...values, 1);
  const labelWidth = 260;
  const valueWidth = 90;
  const barX = x + labelWidth;
  const barWidth = width - labelWidth - valueWidth - 30;
  const rowGap = Math.max(30, Math.min(44, (height - 88) / Math.max(rows.length, 1)));
  rows.forEach((row, index) => {
    const rowY = y + 92 + index * rowGap;
    const current = value(row);
    context.fillStyle = "#23323f";
    context.font = "700 14px Arial";
    drawText(context, row.accommodation_type, x, rowY, labelWidth - 30);
    context.fillStyle = "#e8ece5";
    context.fillRect(barX, rowY - 9, barWidth, 18);
    context.fillStyle = chartColors[index % chartColors.length];
    context.fillRect(barX, rowY - 9, Math.max((current / max) * barWidth, current > 0 ? 8 : 0), 18);
    context.fillStyle = "#23323f";
    context.font = "700 14px Arial";
    context.textAlign = "right";
    context.fillText(valueLabel(current), x + width, rowY);
    context.textAlign = "left";
  });
}

function downloadTotalsChart(metrics: Array<{ label: string; value: string; detail?: string }>) {
  const prepared = prepareCanvas(1080, 280);
  if (!prepared) return;
  const { canvas, context } = prepared;
  drawTotalsOnCanvas(context, metrics, 40, 36, 1000);
  downloadCanvas(canvas, "total-general.png");
}

function drawTotalsOnCanvas(
  context: CanvasRenderingContext2D,
  metrics: Array<{ label: string; value: string; detail?: string }>,
  x: number,
  y: number,
  width: number,
) {
  context.fillStyle = "#18201c";
  context.font = "700 28px Arial";
  context.fillText("Total general", x, y + 10);
  context.fillStyle = "#68736b";
  context.font = "700 16px Arial";
  context.fillText("Sobre establecimientos respondientes", x, y + 44);

  const itemWidth = (width - 40) / metrics.length;
  metrics.forEach((metric, index) => {
    const itemX = x + index * itemWidth;
    context.strokeStyle = "#cfdbea";
    context.fillStyle = "#eef5ff";
    context.lineWidth = 1;
    context.fillRect(itemX, y + 80, itemWidth - 20, 112);
    context.strokeRect(itemX, y + 80, itemWidth - 20, 112);
    context.fillStyle = "#68736b";
    context.font = "700 13px Arial";
    drawText(context, metric.label, itemX + 14, y + 106, itemWidth - 48);
    context.fillStyle = "#2457a6";
    context.font = "700 28px Arial";
    drawText(context, metric.value, itemX + 14, y + 140, itemWidth - 48);
    if (metric.detail) {
      context.fillStyle = "#68736b";
      context.font = "700 13px Arial";
      drawText(context, metric.detail, itemX + 14, y + 172, itemWidth - 48);
    }
  });
}

function downloadAllCharts(rows: TypeStatsRow[], metrics: Array<{ label: string; value: string; detail?: string }>, totalResponses: number) {
  const barCharts = [
    {
      title: "Tasa de respuestas",
      subtitle: "En porcentajes",
      value: (row: TypeStatsRow) => row.response_rate_percent,
      valueLabel: (value: number) => formatPercent(value),
    },
    {
      title: "Cantidad de respuestas",
      subtitle: "En cantidades",
      value: (row: TypeStatsRow) => row.response_count,
      valueLabel: (value: number) => String(Math.round(value)),
    },
    {
      title: "Porcentaje de ocupacion",
      subtitle: "Plazas ocupadas sobre plazas habilitadas",
      value: (row: TypeStatsRow) => row.occupancy_rate_percent,
      valueLabel: (value: number) => formatPercent(value),
    },
    {
      title: "Porcentaje de unidades ocupadas",
      subtitle: "Unidades ocupadas sobre unidades habilitadas",
      value: (row: TypeStatsRow) => row.unit_occupancy_percent,
      valueLabel: (value: number) => formatPercent(value),
    },
  ];
  const barChartHeights = barCharts.map(() => Math.max(260, 105 + rows.length * 34));
  const totalHeight = 120 + 420 + barChartHeights.reduce((sum, height) => sum + height + 28, 0) + 240;
  const prepared = prepareCanvas(1200, totalHeight);
  if (!prepared) return;
  const { canvas, context } = prepared;

  context.fillStyle = "#18201c";
  context.font = "700 32px Arial";
  context.fillText("Estadisticas de ocupacion", 40, 46);
  context.fillStyle = "#68736b";
  context.font = "700 16px Arial";
  context.fillText("Graficos exportados desde el panel admin", 40, 82);

  let offsetY = 120;
  drawPieChartOnCanvas(context, rows, totalResponses, 40, offsetY);
  offsetY += 420;

  barCharts.forEach((chart, index) => {
    const chartHeight = barChartHeights[index];
    drawBarChartOnCanvas(context, chart.title, chart.subtitle, rows, chart.value, chart.valueLabel, 40, offsetY, 1120, chartHeight);
    offsetY += chartHeight + 28;
  });

  drawTotalsOnCanvas(context, metrics, 40, offsetY, 1120);
  downloadCanvas(canvas, "estadisticas-completas.png");
}

function DownloadChartButton(props: { onDownload: () => void }) {
  return (
    <button className="icon-button compact-icon download-chart-button" type="button" title="Descargar gráfico" onClick={props.onDownload}>
      <Download size={16} />
    </button>
  );
}

function StatsCharts(props: { rows: TypeStatsRow[] }) {
  const rows = props.rows.length ? props.rows : demoStats.type_rows;
  const [activePieIndex, setActivePieIndex] = useState(0);
  const totalResponses = rows.reduce((sum, row) => sum + row.response_count, 0);
  const totalExpectedResponses = rows.reduce((sum, row) => sum + row.expected_responses, 0);
  const totalEstablishments = rows.reduce((sum, row) => sum + row.establishments, 0);
  const totalParticipantEstablishments = rows.reduce((sum, row) => sum + row.participant_establishments, 0);
  const totalOccupiedPlaces = rows.reduce((sum, row) => sum + row.occupied_places, 0);
  const totalRespondentPlaces = rows.reduce((sum, row) => sum + row.respondent_available_places, 0);
  const totalOccupiedUnits = rows.reduce((sum, row) => sum + row.occupied_units, 0);
  const totalRespondentUnits = rows.reduce((sum, row) => sum + row.respondent_available_units, 0);
  const totalMetrics = [
    { label: "Respondientes", value: `${totalParticipantEstablishments}/${totalEstablishments}` },
    { label: "Tasa de respuestas", value: formatPercent(percentFrom(totalResponses, totalExpectedResponses)) },
    { label: "Respuestas", value: String(totalResponses) },
    {
      label: "Tasa ocupacion plazas",
      value: formatPercent(percentFrom(totalOccupiedPlaces, totalRespondentPlaces)),
      detail: `${totalOccupiedPlaces}/${totalRespondentPlaces}`,
    },
    {
      label: "Tasa ocupacion unidades",
      value: formatPercent(percentFrom(totalOccupiedUnits, totalRespondentUnits)),
      detail: `${totalOccupiedUnits}/${totalRespondentUnits}`,
    },
  ];
  const activePieRow = rows[activePieIndex] ?? rows[0];
  const activePiePercent = activePieRow ? percentFrom(activePieRow.response_count, totalResponses) : 0;
  const pieRadius = 78;
  const pieCircumference = 2 * Math.PI * pieRadius;
  let pieOffset = 0;

  return (
    <div className="stats-charts">
      <button className="secondary-button download-all-button" type="button" onClick={() => downloadAllCharts(rows, totalMetrics, totalResponses)}>
        <Download size={17} />
        <span>Descargar todo</span>
      </button>
      <div className="chart-card participation-chart">
        <div className="chart-heading">
          <h3>Nivel de participacion</h3>
          <div className="chart-heading-actions">
            <span>N={totalResponses}</span>
            <DownloadChartButton onDownload={() => downloadPieChart(rows, totalResponses)} />
          </div>
        </div>
        <div className="pie-wrap">
          <div className="pie-chart-shell" aria-label="Participacion por tipo de alojamiento">
            <svg className="pie-chart-svg" viewBox="0 0 200 200" role="img">
              <circle className="pie-empty-ring" cx="100" cy="100" r={pieRadius} />
              {totalResponses ? rows.map((row, index) => {
                const segmentLength = (row.response_count / totalResponses) * pieCircumference;
                const segmentOffset = pieOffset;
                pieOffset += segmentLength;
                return (
                  <circle
                    className={index === activePieIndex ? "pie-segment active" : "pie-segment"}
                    cx="100"
                    cy="100"
                    key={row.accommodation_type}
                    r={pieRadius}
                    stroke={chartColors[index % chartColors.length]}
                    strokeDasharray={`${segmentLength} ${pieCircumference - segmentLength}`}
                    strokeDashoffset={-segmentOffset}
                    onMouseEnter={() => setActivePieIndex(index)}
                    onClick={() => setActivePieIndex(index)}
                  />
                );
              }) : null}
            </svg>
            <div className="pie-center">
              <span>{activePieRow?.accommodation_type ?? "Sin datos"}</span>
              <strong>{activePieRow ? formatPercent(activePiePercent) : "0%"}</strong>
              <small>{activePieRow?.response_count ?? 0} respuestas</small>
            </div>
          </div>
          <div className="chart-legend">
            {rows.map((row, index) => (
              <button
                className={index === activePieIndex ? "legend-button active" : "legend-button"}
                key={row.accommodation_type}
                type="button"
                onClick={() => setActivePieIndex(index)}
                onMouseEnter={() => setActivePieIndex(index)}
              >
                <span className="legend-dot" style={{ background: chartColors[index % chartColors.length] }} />
                <strong>{row.accommodation_type}</strong>
                <span>{row.response_count} ({formatPercent(percentFrom(row.response_count, totalResponses))})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <BarChart
        title="Tasa de respuestas"
        subtitle="En porcentajes"
        rows={rows}
        value={(row) => row.response_rate_percent}
        valueLabel={(value) => formatPercent(value)}
      />
      <BarChart
        title="Cantidad de respuestas"
        subtitle="En cantidades"
        rows={rows}
        value={(row) => row.response_count}
        valueLabel={(value) => String(Math.round(value))}
      />
      <BarChart
        title="Porcentaje de ocupacion"
        subtitle="Plazas ocupadas sobre plazas habilitadas"
        rows={rows}
        value={(row) => row.occupancy_rate_percent}
        valueLabel={(value) => formatPercent(value)}
      />
      <BarChart
        title="Porcentaje de unidades ocupadas"
        subtitle="Unidades ocupadas sobre unidades habilitadas"
        rows={rows}
        value={(row) => row.unit_occupancy_percent}
        valueLabel={(value) => formatPercent(value)}
      />
      <div className="chart-card totals-card">
        <div className="chart-heading">
          <h3>Total general</h3>
          <div className="chart-heading-actions">
            <span>Sobre establecimientos respondientes</span>
            <DownloadChartButton onDownload={() => downloadTotalsChart(totalMetrics)} />
          </div>
        </div>
        <div className="totals-grid">
          {totalMetrics.map((metric) => <TotalMetric key={metric.label} {...metric} />)}
        </div>
      </div>
    </div>
  );
}

function TotalMetric(props: { label: string; value: string; detail?: string }) {
  return (
    <div className="total-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail ? <small>{props.detail}</small> : null}
    </div>
  );
}

function BarChart(props: {
  title: string;
  subtitle: string;
  rows: TypeStatsRow[];
  value: (row: TypeStatsRow) => number;
  valueLabel: (value: number) => string;
}) {
  const values = props.rows.map(props.value);
  const max = Math.max(...values, 1);

  return (
    <div className="chart-card">
      <div className="chart-heading">
        <h3>{props.title}</h3>
        <div className="chart-heading-actions">
          <span>{props.subtitle}</span>
          <DownloadChartButton onDownload={() => downloadBarChart(props.title, props.subtitle, props.rows, props.value, props.valueLabel)} />
        </div>
      </div>
      <div className="bar-chart">
        {props.rows.map((row, index) => {
          const value = props.value(row);
          return (
            <div className="bar-row" key={row.accommodation_type}>
              <span className="bar-label">{row.accommodation_type}</span>
              <div className="bar-track">
                <span
                  className="bar-fill"
                  style={{
                    width: `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%`,
                    background: chartColors[index % chartColors.length],
                  }}
                />
              </div>
              <strong>{props.valueLabel(value)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildPieGradient(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return "#eef1ea";
  }

  let start = 0;
  const segments = values.map((value, index) => {
    const end = start + (value / total) * 100;
    const segment = `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function percentFrom(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

function formatOptionalNumber(value?: number) {
  return typeof value === "number" ? String(value) : "-";
}

function formatEditNumber(value?: number) {
  return typeof value === "number" ? String(value) : "";
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
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

const demoStats: StatsResponse = {
  period: "monthly",
  year: 2026,
  month: 6,
  week_start: currentWeek,
  range_start: currentWeek,
  range_end: todayDate,
  weeks: 4,
  rows: [
    { label: "2026-05", occupied_places: 120, occupied_units: 48, entries: 6 },
    { label: "2026-06", occupied_places: 42, occupied_units: 16, entries: 2 },
  ],
  type_rows: [
    {
      accommodation_type: "Hoteles / hosterias",
      establishments: 11,
      participant_establishments: 4,
      participation_percent: 36.36,
      expected_responses: 44,
      response_count: 7,
      missing_responses: 37,
      response_rate_percent: 15.91,
      occupied_places: 18,
      available_places: 1680,
      respondent_available_places: 520,
      occupancy_rate_percent: 1.07,
      occupied_units: 7,
      available_units: 680,
      respondent_available_units: 210,
      unit_occupancy_percent: 1.03,
    },
    {
      accommodation_type: "Apart / cabanas",
      establishments: 10,
      participant_establishments: 2,
      participation_percent: 20,
      expected_responses: 40,
      response_count: 8,
      missing_responses: 32,
      response_rate_percent: 20,
      occupied_places: 24,
      available_places: 400,
      respondent_available_places: 180,
      occupancy_rate_percent: 6,
      occupied_units: 9,
      available_units: 200,
      respondent_available_units: 80,
      unit_occupancy_percent: 4.5,
    },
    {
      accommodation_type: "Hostels",
      establishments: 7,
      participant_establishments: 3,
      participation_percent: 42.86,
      expected_responses: 28,
      response_count: 4,
      missing_responses: 24,
      response_rate_percent: 14.29,
      occupied_places: 20,
      available_places: 560,
      respondent_available_places: 240,
      occupancy_rate_percent: 3.57,
      occupied_units: 8,
      available_units: 224,
      respondent_available_units: 96,
      unit_occupancy_percent: 3.57,
    },
  ],
};

const demoStatsAvailability: StatsAvailability = {
  years: [2026],
  months_by_year: {
    "2026": [5, 6],
  },
};

const demoEstablishments: EstablishmentSummary[] = [
  {
    id: "10000001",
    establishment_name: "Hotel Sol",
    accommodation_name: "Hotel Sol",
    parcel_number: "101",
    address: "Av. Principal 123",
    phone: "+5492901000001",
    units: 17,
    places: 42,
    accommodation_type: "Hoteles / hosterias",
    whatsapp: "+5492901000001",
  },
  {
    id: "10000002",
    establishment_name: "Cabanas Rio",
    accommodation_name: "Cabanas Rio",
    parcel_number: "204",
    address: "Costanera 456",
    phone: "+5492901000002",
    units: 5,
    places: 10,
    accommodation_type: "Apart / cabanas",
    whatsapp: "+5492901000002",
  },
];
