export type Role = "establishment" | "admin" | "tourism" | "marketing";

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
  social_reason?: string;
  email?: string;
  category_number?: number;
  category_numbers?: number[];
  accommodation_types?: string[];
  habilitation_number?: string;
  nomenclature?: string;
  neighborhood?: string;
  units?: number;
  places?: number;
  accommodation_type?: string;
  temporary_leave_start?: string;
  temporary_leave_end?: string;
  response_count?: number;
  last_response?: string;
};

export type Entry = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  week_start: string;
  occupancy_segment?: "general" | "camping" | "dormis";
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

export type EstablishmentSummary = {
  id: string;
  establishment_name: string;
  whatsapp: string;
  parcel_number?: string;
  accommodation_name?: string;
  address?: string;
  phone?: string;
  social_reason?: string;
  email?: string;
  category_number?: number;
  category_numbers?: number[];
  accommodation_types?: string[];
  habilitation_number?: string;
  nomenclature?: string;
  neighborhood?: string;
  units?: number;
  places?: number;
  accommodation_type?: string;
  temporary_leave_start?: string;
  temporary_leave_end?: string;
  response_count?: number;
  last_response?: string;
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

export type CorrectionRequest = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  field_name: string;
  field_label: string;
  current_value?: string;
  requested_value: string;
  notes?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string;
};

export type CorrectionRequestPayload = {
  field_name: string;
  requested_value: string;
  notes?: string;
};

function apiUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") {
    return configuredUrl ?? "http://localhost:8000";
  }
  if (configuredUrl && !configuredUrl.includes("localhost")) {
    return configuredUrl;
  }
  return "/api/backend";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
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
    occupancy_segment?: "general" | "camping" | "dormis";
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
  deleteEntry: (userId: string, establishmentId: string, weekStart: string, occupancySegment = "general") =>
    request<void>(
      `/establishments/${establishmentId}/entries/${weekStart}?userId=${userId}&occupancy_segment=${occupancySegment}`,
      {
      method: "DELETE",
      },
    ),
  createCorrectionRequest: (userId: string, establishmentId: string, payload: CorrectionRequestPayload) =>
    request<CorrectionRequest>(`/establishments/${establishmentId}/correction-requests?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  correctionRequests: (userId: string, status = "pending") =>
    request<CorrectionRequest[]>(`/admin/correction-requests?userId=${userId}&status=${status}`),
  reviewCorrectionRequest: (userId: string, requestId: string, status: "approved" | "rejected") =>
    request<CorrectionRequest>(`/admin/correction-requests/${requestId}/review?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
};

export const demoUsers: User[] = [
  {
    id: "23713213",
    role: "establishment",
    display_name: "CAMPING El pinar dormis",
    establishment_name: "CAMPING El pinar dormis",
    accommodation_name: "CAMPING El pinar dormis",
    parcel_number: "8040",
    address: "SUBIDA DE LA CRUZ 1121",
    phone: "+542944102774",
    whatsapp: "+542944102774",
    social_reason: "CARDARELLI ANA MARIA",
    category_number: 6,
    category_numbers: [6],
    accommodation_type: "Campings",
    accommodation_types: ["Campings", "Dormis"],
    habilitation_number: "8040",
    units: 11,
    places: 28,
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
  {
    id: "meb-turismo",
    role: "tourism",
    display_name: "Equipo Turismo",
  },
  {
    id: "meb-marketing",
    role: "marketing",
    display_name: "Marketing MEB",
  },
];

export const demoEntries: Entry[] = [
  {
    id: "1",
    establishment_id: "23713213",
    establishment_name: "CAMPING El pinar dormis",
    week_start: "2026-05-18",
    occupancy_segment: "camping",
    occupied_places: 18,
    occupied_units: 7,
    created_at: "2026-05-18T10:00:00Z",
    updated_at: "2026-05-18T10:00:00Z",
  },
  {
    id: "2",
    establishment_id: "23713213",
    establishment_name: "CAMPING El pinar dormis",
    week_start: "2026-05-25",
    occupancy_segment: "dormis",
    occupied_places: 6,
    occupied_units: 2,
    created_at: "2026-05-25T10:00:00Z",
    updated_at: "2026-05-25T10:00:00Z",
  },
];
