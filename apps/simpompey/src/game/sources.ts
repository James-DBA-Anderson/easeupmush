export type SourceUse =
  | "osm"
  | "terrain"
  | "buildings"
  | "vegetation"
  | "ships"
  | "trains"
  | "density"
  | "value"
  | "traffic"
  | "crime"
  | "pollution-air"
  | "pollution-noise"
  | "flood"
  | "imd"
  | "broadband"
  | "speeds"
  | "masts";

export type DataSource = {
  id: SourceUse;
  group: "map" | "overlay";
  title: string;
  owner: string;
  href: string;
  licence: string;
  fetched: string;
  period?: string;
  note: string;
};

const OGL = "Open Government Licence";
const ODBL = "ODbL";

/** Last time each file was pulled into SimPompey (commit that last changed the baked data). */
export const DATA_SOURCES: DataSource[] = [
  {
    id: "osm",
    group: "map",
    title: "Streets, land use, labels",
    owner: "© OpenStreetMap contributors",
    href: "https://www.openstreetmap.org/copyright",
    licence: ODBL,
    fetched: "2026-11-08",
    note: "Roads, rails, water, plots, and names from OSM.",
  },
  {
    id: "terrain",
    group: "map",
    title: "Elevation",
    owner: "© NASA / OpenTopography",
    href: "https://www.opentopography.org/",
    licence: "NASA SRTM",
    fetched: "2026-11-08",
    period: "SRTM GL1 30 m",
    note: "Height mesh for the island and the mainland.",
  },
  {
    id: "buildings",
    group: "map",
    title: "3D buildings",
    owner: "© Microsoft",
    href: "https://github.com/microsoft/GlobalMLBuildingFootprints",
    licence: "ODbL / CDLA-Permissive-2.0",
    fetched: "2026-11-08",
    period: "13 Aug 2026 UK extract",
    note: "GlobalML building footprints for Portsmouth, Gosport and Fareham.",
  },
  {
    id: "vegetation",
    group: "map",
    title: "Trees and canopy",
    owner: "© Environment Agency",
    href: "https://www.data.gov.uk/dataset/ecae3bef-1e1d-4051-887b-9dc613c928ec",
    licence: OGL,
    fetched: "2026-11-08",
    period: "VOM 2022",
    note: "EA Vegetation Object Model local maxima, plus OSM trees and rows.",
  },
  {
    id: "ships",
    group: "map",
    title: "Harbour traffic",
    owner: "© MCA",
    href: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    licence: OGL,
    fetched: "2026-11-08",
    note: "AIS tracks baked into the harbour replay.",
  },
  {
    id: "trains",
    group: "map",
    title: "Trains",
    owner: "© National Rail Enquiries",
    href: "https://www.nationalrail.co.uk/developers/darwin-data-feeds/",
    licence: "Darwin",
    fetched: "2026-11-08",
    note: "Darwin movement samples baked into the railway replay.",
  },
  {
    id: "density",
    group: "overlay",
    title: "Population density",
    owner: "© Office for National Statistics",
    href: "https://www.nomisweb.co.uk/datasets/c2021ts006",
    licence: OGL,
    fetched: "2026-11-09",
    period: "Census 2021 · Output Areas",
    note: "Usual residents per square kilometre on Census Day, 21 March 2021.",
  },
  {
    id: "value",
    group: "overlay",
    title: "Land value",
    owner: "© HM Land Registry · © MHCLG",
    href: "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads",
    licence: OGL,
    fetched: "2026-11-08",
    period: "Prices 2022– · rates 2023",
    note: "Price Paid Data for Portsmouth, Gosport and Fareham, with MHCLG £/ha rates.",
  },
  {
    id: "traffic",
    group: "overlay",
    title: "Traffic",
    owner: "© DfT",
    href: "https://roadtraffic.dft.gov.uk/local-authorities/E06000044",
    licence: OGL,
    fetched: "2026-11-08",
    period: "2025",
    note: "Annual average daily flow, plus CGN0504e delay on local A-roads.",
  },
  {
    id: "crime",
    group: "overlay",
    title: "Crime",
    owner: "© police.uk",
    href: "https://data.police.uk/",
    licence: OGL,
    fetched: "2026-11-08",
    period: "Oct 2025 – Sep 2026",
    note: "Hampshire Constabulary street-level crime, 12-month rollup. Locations are approximate.",
  },
  {
    id: "pollution-air",
    group: "overlay",
    title: "Air quality",
    owner: "© Defra UK-AIR",
    href: "https://uk-air.defra.gov.uk/data/pcm-data",
    licence: OGL,
    fetched: "2026-11-08",
    period: "Background 2024 · roadside NO₂ 2023",
    note: "PCM modelled annual mean, 1 km background and roadside A-roads.",
  },
  {
    id: "pollution-noise",
    group: "overlay",
    title: "Noise",
    owner: "© Defra",
    href: "https://www.data.gov.uk/dataset/38b1444f-47a0-42ca-a358-0d145fcf7d5c/road-noise-all-metrics-england-round-4",
    licence: OGL,
    fetched: "2026-11-08",
    period: "Round 4, 2022",
    note: "Strategic road and rail noise mapping, Lden.",
  },
  {
    id: "flood",
    group: "overlay",
    title: "Flood",
    owner: "© Environment Agency",
    href: "https://www.data.gov.uk/dataset/bad1991f-6ac9-41aa-b0fd-26b7266f511d/risk-of-flooding-from-rivers-and-sea",
    licence: OGL,
    fetched: "2026-11-08",
    note: "Rivers and sea (defences included) and surface-water extents 1 in 30 / 100 / 1,000.",
  },
  {
    id: "imd",
    group: "overlay",
    title: "Deprivation",
    owner: "© MHCLG",
    href: "https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025",
    licence: OGL,
    fetched: "2026-11-08",
    period: "IoD 2025 · LSOA 2021",
    note: "English Indices of Deprivation ranks and deciles.",
  },
  {
    id: "broadband",
    group: "overlay",
    title: "Broadband coverage",
    owner: "© Ofcom",
    href: "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-20252/data-downloads-2025",
    licence: OGL,
    fetched: "2026-11-08",
    period: "Connected Nations July 2025",
    note: "Postcode coverage for gigabit, superfast and slow.",
  },
  {
    id: "speeds",
    group: "overlay",
    title: "Broadband speeds",
    owner: "© Ofcom",
    href: "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-2023/data-downloads",
    licence: OGL,
    fetched: "2026-11-08",
    period: "Connected Nations May 2023",
    note: "Postcode median download and upload. Last street-level performance file.",
  },
  {
    id: "masts",
    group: "overlay",
    title: "Masts and cells",
    owner: "© Ofcom WTR · © OpenCelliD",
    href: "https://www.ofcom.org.uk/spectrum/frequencies/wtr",
    licence: "OGL / CC-BY-SA",
    fetched: "2026-11-08",
    note: "Wireless Telegraphy Register licences plus OpenCelliD crowd cells, approximate.",
  },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function sourceRow(src: DataSource): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "sources__item";
  li.dataset.source = src.id;

  const head = document.createElement("div");
  head.className = "sources__head";
  const title = document.createElement("h3");
  title.className = "sources__title";
  title.textContent = src.title;
  const on = document.createElement("span");
  on.className = "sources__on";
  on.textContent = "On";
  head.append(title, on);

  const owner = document.createElement("a");
  owner.className = "sources__owner";
  owner.href = src.href;
  owner.target = "_blank";
  owner.rel = "noreferrer";
  owner.textContent = src.owner;

  const meta = document.createElement("p");
  meta.className = "sources__meta";
  const bits = [`Downloaded ${formatDay(src.fetched)}`];
  if (src.period) bits.push(src.period);
  bits.push(src.licence);
  meta.textContent = bits.join(" · ");

  const note = document.createElement("p");
  note.className = "sources__note";
  note.textContent = src.note;

  li.append(head, owner, meta, note);
  return li;
}
