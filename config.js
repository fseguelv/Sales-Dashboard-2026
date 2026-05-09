/* ================================================================
   CONFIGURACIÓN DEL DASHBOARD
   ================================================================ */

const API_URL = "https://script.google.com/macros/s/AKfycbzTOabgGw9zYgx0CB0T0Vi7UYEEUbNC7BD_VpcgcuLdVRcjV4V5EktI177BWiJw3e9hzg/exec";

const refreshInterval = 60;
const defaultVendor   = "executive";
const enableLogging   = true;

const ETAPAS = [
  { label: "Contacto",              avance: 0.10 },
  { label: "Reunión",               avance: 0.30 },
  { label: "Propuesta enviada",     avance: 0.50 },
  { label: "Seguimiento propuesta", avance: 0.65 },
  { label: "Finalizada",            avance: 1.00 }
];

const MARKETS = [
  "Acería", "Retail", "Cobre", "Instalador", "Distribuidor",
  "Fundición", "Energía", "Cemento y Cal", "Otros Minerales", "Otros"
];

const CLIENT_TO_MARKET = {
  "magotteaux":    "Acería",
  "sodimac":       "Retail",
  "ventanas":      "Cobre",
  "refex":         "Instalador",
  "maigas":        "Retail",
  "amesti":        "Retail",
  "imperial":      "Retail",
  "angloamerican": "Cobre",
  "altonorte":     "Cobre",
  "esco":          "Acería",
  "proteco":       "Distribuidor",
  "talleres":      "Acería",
  "vulco":         "Fundición",
  "enap":          "Energía",
  "chuquicamata":  "Cobre",
  "inacal ant":    "Cemento y Cal",
  "inacal cpp":    "Cemento y Cal",
  "molymet":       "Otros Minerales",
  "molynor":       "Otros Minerales",
  "cbb":           "Cemento y Cal",
  "fundiciones":   "Fundición"
};

const DEMO_MODE = false;

window.DASHBOARD_CONFIG = {
  API_URL,
  refreshInterval,
  defaultVendor,
  enableLogging,
  ETAPAS,
  MARKETS,
  CLIENT_TO_MARKET,
  DEMO_MODE
};
