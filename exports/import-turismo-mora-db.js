const fileName = "turismo-mora-ultima-etapa-db.json";
let rawData;

try {
  rawData = cat(fileName);
} catch {
  rawData = cat(`/tmp/${fileName}`);
}

const data = EJSON.parse(rawData);

db.users.deleteMany({});
db.occupancy_entries.deleteMany({});

if (data.collections.users.length) {
  db.users.insertMany(data.collections.users);
}

if (data.collections.occupancy_entries.length) {
  db.occupancy_entries.insertMany(data.collections.occupancy_entries);
}

db.users.createIndex({ role: 1 });
db.occupancy_entries.createIndex(
  { establishment_id: 1, week_start: 1 },
  { unique: true },
);

print(`Usuarios/establecimientos cargados: ${data.collections.users.length}`);
print(`Cargas cargadas: ${data.collections.occupancy_entries.length}`);
