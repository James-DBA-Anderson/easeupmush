export type TownView = {
  id: string;
  name: string;
  /** If true, use the whole-island aerial camera. */
  aerial?: boolean;
  lat: number;
  lon: number;
  /** Metres from the subject to the camera. */
  dist: number;
  /** Camera height above ground, metres. */
  height: number;
  /** Where the camera stands, degrees clockwise from north. */
  from: number;
  /** Look-at height above ground, metres. */
  look?: number;
};

export const TOWN_VIEWS: TownView[] = [
  { id: "aerial", name: "Aerial", aerial: true, lat: 50.8025, lon: -1.087, dist: 0, height: 4200, from: 0 },
  {
    id: "spinnaker",
    name: "Spinnaker Tower",
    lat: 50.79562,
    lon: -1.10857,
    dist: 210,
    height: 58,
    from: 228,
    look: 48,
  },
  {
    id: "dockyard",
    name: "Historic Dockyard",
    lat: 50.8019,
    lon: -1.1097,
    dist: 160,
    height: 42,
    from: 248,
    look: 12,
  },
  {
    id: "hard",
    name: "The Hard",
    lat: 50.7974,
    lon: -1.1074,
    dist: 140,
    height: 36,
    from: 258,
    look: 8,
  },
  {
    id: "old-portsmouth",
    name: "Old Portsmouth",
    lat: 50.7893,
    lon: -1.1067,
    dist: 150,
    height: 38,
    from: 214,
    look: 10,
  },
  {
    id: "castle",
    name: "Southsea Castle",
    lat: 50.7781,
    lon: -1.0889,
    dist: 170,
    height: 40,
    from: 176,
    look: 8,
  },
  {
    id: "common",
    name: "Southsea Common",
    lat: 50.7854,
    lon: -1.0918,
    dist: 220,
    height: 48,
    from: 188,
    look: 4,
  },
  {
    id: "clarence",
    name: "Clarence Pier",
    lat: 50.7846,
    lon: -1.0938,
    dist: 150,
    height: 36,
    from: 198,
    look: 8,
  },
  {
    id: "south-parade",
    name: "South Parade Pier",
    lat: 50.7804,
    lon: -1.0765,
    dist: 160,
    height: 38,
    from: 168,
    look: 8,
  },
  {
    id: "canoe-lake",
    name: "Canoe Lake",
    lat: 50.7809,
    lon: -1.0719,
    dist: 140,
    height: 34,
    from: 155,
    look: 4,
  },
  {
    id: "guildhall",
    name: "Guildhall",
    lat: 50.7977,
    lon: -1.0915,
    dist: 200,
    height: 68,
    from: 175,
    look: 24,
  },
  {
    id: "cathedral",
    name: "Cathedral",
    lat: 50.79035,
    lon: -1.1042,
    dist: 110,
    height: 34,
    from: 205,
    look: 16,
  },
  {
    id: "fratton-park",
    name: "Fratton Park",
    lat: 50.7965,
    lon: -1.0639,
    dist: 180,
    height: 48,
    from: 218,
    look: 10,
  },
  {
    id: "station",
    name: "Portsmouth & Southsea",
    lat: 50.7985,
    lon: -1.0909,
    dist: 150,
    height: 48,
    from: 130,
    look: 12,
  },
  {
    id: "spitbank",
    name: "Spitbank Fort",
    lat: 50.77028,
    lon: -1.09444,
    dist: 220,
    height: 55,
    from: 8,
    look: 12,
  },
  {
    id: "langstone",
    name: "Langstone Harbour",
    lat: 50.8215,
    lon: -1.0375,
    dist: 280,
    height: 70,
    from: 232,
    look: 2,
  },
];
