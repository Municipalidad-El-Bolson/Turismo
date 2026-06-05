export type Role = "establishment" | "admin";

export type User = {
  id: string;
  role: Role;
  display_name: string;
  whatsapp?: string;
  establishment_name?: string;
  parcel_number?: string;
  accommodation_name?: string;
  address?: string;
  phone?: string;
  units?: number;
  places?: number;
  accommodation_type?: string;
  temporary_leave_start?: string;
  temporary_leave_end?: string;
};

export type Entry = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  week_start: string;
  occupied_places: number;
  occupied_units: number;
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type Compliance = {
  establishment_id: string;
  establishment_name: string;
  whatsapp?: string;
  week_start: string;
  completed: boolean;
  missing_fields: string[];
  status: "complete" | "missing";
};

export type StatsRow = {
  label: string;
  occupied_places: number;
  occupied_units: number;
  entries: number;
};

export type TypeStatsRow = {
  accommodation_type: string;
  establishments: number;
  participant_establishments: number;
  participation_percent: number;
  expected_responses: number;
  response_count: number;
  missing_responses: number;
  response_rate_percent: number;
  occupied_places: number;
  available_places: number;
  respondent_available_places: number;
  occupancy_rate_percent: number;
  occupied_units: number;
  available_units: number;
  respondent_available_units: number;
  unit_occupancy_percent: number;
};

export type StatsResponse = {
  period: string;
  year?: number;
  month?: number;
  week_start?: string;
  range_start?: string;
  range_end?: string;
  weeks: number;
  rows: StatsRow[];
  type_rows: TypeStatsRow[];
};

export type StatsAvailability = {
  years: number[];
  months_by_year: Record<string, number[]>;
};

export type WhatsAppSendResult = {
  establishment_id: string;
  establishment_name: string;
  to: string;
  sent: boolean;
  dry_run: boolean;
  message: string;
  detail?: unknown;
};

export type EstablishmentSummary = {
  id: string;
  establishment_name: string;
  whatsapp: string;
  parcel_number?: string;
  accommodation_name?: string;
  address?: string;
  phone?: string;
  units?: number;
  places?: number;
  accommodation_type?: string;
  temporary_leave_start?: string;
  temporary_leave_end?: string;
};

export type EstablishmentPayload = {
  parcel_number: string;
  accommodation_name: string;
  address: string;
  phone: string;
  units?: number;
  places?: number;
  accommodation_type?: string;
  temporary_leave_start?: string;
  temporary_leave_end?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export const api = {
  login: (userId: string) => request<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  }),
  adminLogin: (username: string, password: string) => request<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  entries: (userId: string, establishmentId: string) =>
    request<Entry[]>(`/establishments/${establishmentId}/entries?userId=${userId}`),
  saveEntry: (userId: string, establishmentId: string, payload: {
    week_start: string;
    occupied_places: number;
    occupied_units: number;
    notes?: string;
  }) =>
    request<Entry>(`/establishments/${establishmentId}/entries?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  compliance: (userId: string, weekStart: string, compliancePeriod: string) =>
    request<Compliance[]>(
      `/admin/compliance?userId=${userId}&week_start=${weekStart}&compliance_period=${compliancePeriod}`,
    ),
  stats: (
    userId: string,
    period: string,
    year: number,
    month: number,
    weekStart: string,
    rangeStart: string,
    rangeEnd: string,
  ) =>
    request<StatsResponse>(
      `/admin/stats?userId=${userId}&period=${period}&year=${year}&month=${month}&week_start=${weekStart}&range_start=${rangeStart}&range_end=${rangeEnd}`,
    ),
  statsAvailability: (userId: string) =>
    request<StatsAvailability>(`/admin/stats/availability?userId=${userId}`),
  establishments: (userId: string) =>
    request<EstablishmentSummary[]>(`/establishments?userId=${userId}`),
  createEstablishment: (
    userId: string,
    payload: EstablishmentPayload,
  ) =>
    request<EstablishmentSummary>(`/admin/establishments?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEstablishment: (userId: string, establishmentId: string, payload: EstablishmentPayload) =>
    request<EstablishmentSummary>(`/admin/establishments/${establishmentId}?userId=${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteEstablishment: (userId: string, establishmentId: string) =>
    request<void>(`/admin/establishments/${establishmentId}?userId=${userId}`, {
      method: "DELETE",
    }),
  deleteEntry: (userId: string, establishmentId: string, weekStart: string) =>
    request<void>(`/establishments/${establishmentId}/entries/${weekStart}?userId=${userId}`, {
      method: "DELETE",
    }),
  sendReminder: (userId: string, establishmentId: string, weekStart: string) =>
    request<WhatsAppSendResult>(
      `/admin/whatsapp/reminders/${establishmentId}?userId=${userId}&week_start=${weekStart}`,
      { method: "POST" },
    ),
  sendMissingReminders: (userId: string, weekStart: string, compliancePeriod: string) =>
    request<{ week_start: string; results: WhatsAppSendResult[] }>(
      `/admin/whatsapp/reminders?userId=${userId}&week_start=${weekStart}&compliance_period=${compliancePeriod}`,
      { method: "POST" },
    ),
};

export const demoUsers: User[] = [
  {
    id: "10000001",
    role: "establishment",
    display_name: "Hotel Sol",
    establishment_name: "Hotel Sol",
    accommodation_name: "Hotel Sol",
    parcel_number: "101",
    address: "Av. Principal 123",
    phone: "+5492901000001",
    whatsapp: "+5492901000001",
  },
  {
    id: "10000002",
    role: "establishment",
    display_name: "Cabanas Rio",
    establishment_name: "Cabanas Rio",
    accommodation_name: "Cabanas Rio",
    parcel_number: "204",
    address: "Costanera 456",
    phone: "+5492901000002",
    whatsapp: "+5492901000002",
  },
  {
    id: "meb-admin",
    role: "admin",
    display_name: "Admin MEB",
  },
];

export const demoEntries: Entry[] = [
  {
    id: "1",
    establishment_id: "10000001",
    establishment_name: "Hotel Sol",
    week_start: "2026-05-18",
    occupied_places: 38,
    occupied_units: 14,
    created_at: "2026-05-18T10:00:00Z",
    updated_at: "2026-05-18T10:00:00Z",
  },
  {
    id: "2",
    establishment_id: "10000001",
    establishment_name: "Hotel Sol",
    week_start: "2026-05-25",
    occupied_places: 42,
    occupied_units: 16,
    created_at: "2026-05-25T10:00:00Z",
    updated_at: "2026-05-25T10:00:00Z",
  },
];
