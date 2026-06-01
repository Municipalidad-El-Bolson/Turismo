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

export type EstablishmentSummary = {
  id: string;
  establishment_name: string;
  whatsapp: string;
  parcel_number?: string;
  accommodation_name?: string;
  address?: string;
  phone?: string;
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
  compliance: (userId: string, weekStart: string) =>
    request<Compliance[]>(`/admin/compliance?userId=${userId}&week_start=${weekStart}`),
  stats: (userId: string, period: string, year: number) =>
    request<{ period: string; rows: StatsRow[] }>(`/admin/stats?userId=${userId}&period=${period}&year=${year}`),
  establishments: (userId: string) =>
    request<EstablishmentSummary[]>(`/establishments?userId=${userId}`),
  createEstablishment: (
    userId: string,
    payload: { parcel_number: string; accommodation_name: string; address: string; phone: string },
  ) =>
    request<EstablishmentSummary>(`/admin/establishments?userId=${userId}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
