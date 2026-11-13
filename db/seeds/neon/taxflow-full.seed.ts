import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import crypto from 'node:crypto';
import {
  user,
  account,
  rraStaff,
  product,
  stock,
  transaction,
  transactionItem,
  vatRecord,
  taxPayment,
  auditLog,
  notification,
  importDeclaration,
  dispute,
  supportTicket,
  staffBulletin,
  systemConfig,
} from '../../schema';

// ---------------------------------------------------------------------------
// TaxFlow Full Seed — RRA Staff + 58 traders (90% of 64 TIN businesses)
// Covers: users, products, stock, transactions, VAT, tax payments,
//         import declarations, disputes, support tickets, staff bulletins
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') throw new Error('Demo data seeding is disabled in production.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to seed demo data.');
if (!process.env.TAXFLOW_SEED_PASSWORD || process.env.TAXFLOW_SEED_PASSWORD.length < 12) {
  throw new Error('Set TAXFLOW_SEED_PASSWORD to a value of at least 12 characters.');
}
const SEED_PASSWORD = process.env.TAXFLOW_SEED_PASSWORD;

const VAT_RATE = 0.18;

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysAgoHours(n: number, h: number): Date {
  const d = daysAgo(n);
  d.setHours(h, 0, 0, 0);
  return d;
}

function vatPeriod(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${q}`;
}

// ── Fixed IDs ────────────────────────────────────────────────────────────────

// RRA Staff (same IDs as existing taxflow.seed.ts for idempotency)
const STAFF_IDS = {
  superAdmin: 'rra-user-sa-001',
  compliance1: 'rra-user-co-001',
  compliance2: 'rra-user-co-002',
  audit1: 'rra-user-ao-001',
  audit2: 'rra-user-ao-002',
  stock1: 'rra-user-sm-001',
  stock2: 'rra-user-sm-002',
  correction1: 'rra-user-cr-001',
  correction2: 'rra-user-cr-002',
  reporting1: 'rra-user-ra-001',
  reporting2: 'rra-user-ra-002',
};

// Trader user IDs (stable)
const T = {
  // Kigali / Gasabo
  kigaliBeverages: 'u-kg-ga-001',
  rwandaPlastics: 'u-kg-ga-002',
  gasaboMetal: 'u-kg-ga-003',
  gasaboSupplies: 'u-kg-ga-004',
  solangeShop: 'u-kg-ga-005',
  // Kigali / Kicukiro
  kicukiroFoods: 'u-kg-ki-001',
  nyanzaTextiles: 'u-kg-ki-002',
  greatLakesCement: 'u-kg-ki-003',
  kicukiroHub: 'u-kg-ki-004',
  faustinElectronics: 'u-kg-ki-005',
  // Kigali / Nyarugenge
  cityPharma: 'u-kg-ny-001',
  nyarugengeFurniture: 'u-kg-ny-002',
  rwandaSoap: 'u-kg-ny-003',
  downtownWholesale: 'u-kg-ny-004',
  yvonneBoutique: 'u-kg-ny-005',
  // Northern
  bueraFarm: 'u-no-bu-001',
  christineShop: 'u-no-bu-002',
  gakenkeDistrib: 'u-no-gk-001',
  oliveStore: 'u-no-gk-002',
  gicumbiDairy: 'u-no-gc-001',
  roseMinimart: 'u-no-gc-002',
  volcanoTrade: 'u-no-mu-001',
  musanzeWholesale: 'u-no-mu-002',
  jpQuickStop: 'u-no-mu-003',
  lilianeFashion: 'u-no-mu-004',
  rulindoAgro: 'u-no-ru-001',
  beatriceShop: 'u-no-ru-002',
  // Southern
  adrienStore: 'u-so-gi-001',
  huyeSupplies: 'u-so-hu-001',
  anettePharma: 'u-so-hu-002',
  kamoniBricks: 'u-so-km-001',
  jacquelineBoutique: 'u-so-km-002',
  muhangaDepot: 'u-so-mh-001',
  delphineMarket: 'u-so-mh-002',
  nyanzaTrade: 'u-so-nz-001',
  chantalStore: 'u-so-nz-002',
  ruhangoSupplies: 'u-so-rh-001',
  esperanceShop: 'u-so-rh-002',
  // Eastern
  bugeseraFarm: 'u-ea-bg-001',
  feliciteSuperette: 'u-ea-bg-002',
  gatsibo: 'u-ea-gt-001',
  florenceGoods: 'u-ea-gt-002',
  kayonzaSolar: 'u-ea-ky-001',
  vestineMini: 'u-ea-ky-002',
  ngomaSupplies: 'u-ea-ng-001',
  esperiaStore: 'u-ea-ng-002',
  nyagatareFeeds: 'u-ea-nt-001',
  immaculeeShop: 'u-ea-nt-002',
  rwamaganaMetal: 'u-ea-rw-001',
  victoireBoutique: 'u-ea-rw-002',
  // Western
  karongiLake: 'u-we-ka-001',
  josephineCorner: 'u-we-ka-002',
  nyabihuHighlands: 'u-we-nb-001',
  anunciataShop: 'u-we-nb-002',
  rubavuBorder: 'u-we-rb-001',
  martheSupermarket: 'u-we-rb-002',
  rusiziSugar: 'u-we-rs-001',
  odetteShop: 'u-we-rs-002',
};

// Product IDs
const P = {
  beverages: 'prod-beverages-001',
  cookingOil: 'prod-cooking-oil-001',
  plasticGoods: 'prod-plastic-goods-001',
  soap: 'prod-soap-001',
  metalProducts: 'prod-metal-products-001',
  sugar: 'prod-sugar-001',
  rice: 'prod-rice-001',
  fabric: 'prod-fabric-001',
  shoes: 'prod-shoes-001',
  cement: 'prod-cement-001',
  pharmaceuticals: 'prod-pharma-001',
  furniture: 'prod-furniture-001',
  dairyProducts: 'prod-dairy-001',
  bricks: 'prod-bricks-001',
  solarPanels: 'prod-solar-001',
  paint: 'prod-paint-001',
};

// ── RRA Staff Data ───────────────────────────────────────────────────────────

const RRA_STAFF_USERS = [
  {
    id: STAFF_IDS.superAdmin,
    name: 'Jean-Pierre Habimana',
    email: 'jean-pierre.habimana@rra.gov.rw',
    staffId: 'SA-001',
    department: 'Administration',
    clearanceLevel: 'super_admin',
  },
  {
    id: STAFF_IDS.compliance1,
    name: 'Amina Uwimana',
    email: 'amina.uwimana@rra.gov.rw',
    staffId: 'CO-001',
    department: 'Compliance',
    clearanceLevel: 'compliance',
  },
  {
    id: STAFF_IDS.compliance2,
    name: 'Patrick Nzabonimpa',
    email: 'patrick.nzabonimpa@rra.gov.rw',
    staffId: 'CO-002',
    department: 'Compliance',
    clearanceLevel: 'compliance',
  },
  {
    id: STAFF_IDS.audit1,
    name: 'Claudine Mukandori',
    email: 'claudine.mukandori@rra.gov.rw',
    staffId: 'AO-001',
    department: 'Audit',
    clearanceLevel: 'audit',
  },
  {
    id: STAFF_IDS.audit2,
    name: 'Eric Gasana',
    email: 'eric.gasana@rra.gov.rw',
    staffId: 'AO-002',
    department: 'Audit',
    clearanceLevel: 'audit',
  },
  {
    id: STAFF_IDS.stock1,
    name: 'Solange Mukamurenzi',
    email: 'solange.mukamurenzi@rra.gov.rw',
    staffId: 'SM-001',
    department: 'Stock Monitoring',
    clearanceLevel: 'stock_monitoring',
  },
  {
    id: STAFF_IDS.stock2,
    name: 'Jean Claude Niyonsaba',
    email: 'jean-claude.niyonsaba@rra.gov.rw',
    staffId: 'SM-002',
    department: 'Stock Monitoring',
    clearanceLevel: 'stock_monitoring',
  },
  {
    id: STAFF_IDS.correction1,
    name: 'Diane Uwingabiye',
    email: 'diane.uwingabiye@rra.gov.rw',
    staffId: 'CR-001',
    department: 'Corrections',
    clearanceLevel: 'correction',
  },
  {
    id: STAFF_IDS.correction2,
    name: 'Pierre Nkurunziza',
    email: 'pierre.nkurunziza@rra.gov.rw',
    staffId: 'CR-002',
    department: 'Corrections',
    clearanceLevel: 'correction',
  },
  {
    id: STAFF_IDS.reporting1,
    name: 'Marie-Claire Ineza',
    email: 'marie-claire.ineza@rra.gov.rw',
    staffId: 'RA-001',
    department: 'Reporting & Analytics',
    clearanceLevel: 'reporting',
  },
  {
    id: STAFF_IDS.reporting2,
    name: 'Innocent Nshimiyimana',
    email: 'innocent.nshimiyimana@rra.gov.rw',
    staffId: 'RA-002',
    department: 'Reporting & Analytics',
    clearanceLevel: 'reporting',
  },
];

// ── Trader Data — 58 businesses (90% of 64 TIN records) ─────────────────────
// Excluded (no taxflow): 103000008, 103000011, 104000007, 105000003, 105000006, 105000011

const TRADERS = [
  // ── Kigali / Gasabo — manufacturers ──
  {
    id: T.kigaliBeverages,
    tin: '101000001',
    name: 'Celestin Mugabo',
    email: 'info@kigalibeverages.rw',
    phone: '+250788101001',
    nationalId: '1197810012300001',
    businessName: 'Kigali Beverages Ltd',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.rwandaPlastics,
    tin: '101000002',
    name: 'Vestine Uwase',
    email: 'sales@rwandaplastics.rw',
    phone: '+250788101002',
    nationalId: '1198520023400002',
    businessName: 'Rwanda Plastics Industries',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.gasaboMetal,
    tin: '101000003',
    name: 'Emmanuel Nkurunziza',
    email: 'contact@gasbabometal.rw',
    phone: '+250788101003',
    nationalId: '1197910034500003',
    businessName: 'Gasabo Metal Works',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.gasaboSupplies,
    tin: '101000004',
    name: 'Patrick Habimana',
    email: 'orders@gasbabosupplies.rw',
    phone: '+250788101004',
    nationalId: '1198210045600004',
    businessName: 'Gasabo General Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.solangeShop,
    tin: '101000005',
    name: 'Solange Mukamana',
    email: 'solange.shop@gmail.com',
    phone: '+250788101005',
    nationalId: '1199020056700005',
    businessName: 'Solange Shop Kimironko',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  // ── Kigali / Kicukiro — manufacturers ──
  {
    id: T.kicukiroFoods,
    tin: '101000006',
    name: 'Innocent Ndayisaba',
    email: 'info@kicukirofoods.rw',
    phone: '+250788101006',
    nationalId: '1198010067800006',
    businessName: 'Kicukiro Foods Processing',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.nyanzaTextiles,
    tin: '101000007',
    name: 'Claudine Uwimana',
    email: 'production@nyanzatextiles.rw',
    phone: '+250788101007',
    nationalId: '1198720078900007',
    businessName: 'Nyanza Textiles Ltd',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.greatLakesCement,
    tin: '101000008',
    name: 'Alain Bizimana',
    email: 'sales@greatlakescement.rw',
    phone: '+250788101008',
    nationalId: '1197610089000008',
    businessName: 'Great Lakes Cement',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.kicukiroHub,
    tin: '101000009',
    name: 'Grace Mukamurenzi',
    email: 'hub@kicukiRotrade.rw',
    phone: '+250788101009',
    nationalId: '1198420090100009',
    businessName: 'Kicukiro Trade Hub',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.faustinElectronics,
    tin: '101000010',
    name: 'Faustin Nzabahimana',
    email: 'faustin.electronics@gmail.com',
    phone: '+250788101010',
    nationalId: '1197710101200010',
    businessName: 'Faustin Electronics',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  // ── Kigali / Nyarugenge — manufacturers ──
  {
    id: T.cityPharma,
    tin: '101000011',
    name: 'Honorine Irakoze',
    email: 'info@citypharma.rw',
    phone: '+250788101011',
    nationalId: '1198820112300011',
    businessName: 'City Pharma Ltd',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.nyarugengeFurniture,
    tin: '101000012',
    name: 'Jean Nsanzimana',
    email: 'orders@nyarugengefurniture.rw',
    phone: '+250788101012',
    nationalId: '1198110123400012',
    businessName: 'Nyarugenge Furniture Works',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.rwandaSoap,
    tin: '101000013',
    name: 'Therese Kayirangwa',
    email: 'production@rwandasoap.rw',
    phone: '+250788101013',
    nationalId: '1198620134500013',
    businessName: 'Rwanda Soap Industries',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.downtownWholesale,
    tin: '101000014',
    name: 'Celine Habimana',
    email: 'downtown@wholesale.rw',
    phone: '+250788101014',
    nationalId: '1198320145600014',
    businessName: 'Downtown Wholesale',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.yvonneBoutique,
    tin: '101000015',
    name: 'Yvonne Niyomugabo',
    email: 'yvonneboutique@gmail.com',
    phone: '+250788101015',
    nationalId: '1199120156700015',
    businessName: 'Yvonne Boutique CBD',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  // ── Northern ──
  {
    id: T.bueraFarm,
    tin: '102000001',
    name: 'David Habyarimana',
    email: 'burera.farm@supplies.rw',
    phone: '+250788102001',
    nationalId: '1197510167800016',
    businessName: 'Burera Farm Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.christineShop,
    tin: '102000002',
    name: 'Christine Mukankusi',
    email: 'christine.shop@gmail.com',
    phone: '+250788102002',
    nationalId: '1198920178900017',
    businessName: 'Christine Corner Shop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.gakenkeDistrib,
    tin: '102000003',
    name: 'Sylvere Ndagijimana',
    email: 'gakenke.dist@gmail.com',
    phone: '+250788102003',
    nationalId: '1197810189000018',
    businessName: 'Gakenke Distribution',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.oliveStore,
    tin: '102000004',
    name: 'Olive Twagirumukiza',
    email: 'olive.store@gmail.com',
    phone: '+250788102004',
    nationalId: '1199220190100019',
    businessName: 'Olive General Store',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.gicumbiDairy,
    tin: '102000005',
    name: 'Pascal Rutayisire',
    email: 'info@gicumbidairy.rw',
    phone: '+250788102005',
    nationalId: '1197710201200020',
    businessName: 'Gicumbi Dairy Products',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.roseMinimart,
    tin: '102000006',
    name: 'Rose Mukamazimpaka',
    email: 'rose.minimart@gmail.com',
    phone: '+250788102006',
    nationalId: '1199020212300021',
    businessName: 'Rose Minimart',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.volcanoTrade,
    tin: '102000007',
    name: 'Simon Ntakarutimana',
    email: 'volcanoes.trade@gmail.com',
    phone: '+250788102007',
    nationalId: '1197610223400022',
    businessName: 'Volcanoes Trade Center',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.musanzeWholesale,
    tin: '102000008',
    name: 'Euphrosie Mukagasana',
    email: 'musanze.wholesale@gmail.com',
    phone: '+250788102008',
    nationalId: '1198420234500023',
    businessName: 'Musanze Wholesale Depot',
    role: 'wholesaler',
    clearanceStatus: 'under_review',
  },
  {
    id: T.jpQuickStop,
    tin: '102000009',
    name: 'Jean Paul Nkurikiyimana',
    email: 'jp.quickstop@gmail.com',
    phone: '+250788102009',
    nationalId: '1198710245600024',
    businessName: 'JP Quick Stop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.lilianeFashion,
    tin: '102000010',
    name: 'Liliane Uwingabiye',
    email: 'liliane.fashion@gmail.com',
    phone: '+250788102010',
    nationalId: '1199420256700025',
    businessName: 'Liliane Fashion House',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.rulindoAgro,
    tin: '102000011',
    name: 'Alexis Gasasira',
    email: 'rulindo.agro@supplies.rw',
    phone: '+250788102011',
    nationalId: '1197910267800026',
    businessName: 'Rulindo Agro Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.beatriceShop,
    tin: '102000012',
    name: 'Beatrice Mukamuganga',
    email: 'beatrice.shop@gmail.com',
    phone: '+250788102012',
    nationalId: '1199320278900027',
    businessName: 'Beatrice Shop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  // ── Southern ──
  {
    id: T.adrienStore,
    tin: '103000001',
    name: 'Adrien Nshimiyimana',
    email: 'adrien.store@gmail.com',
    phone: '+250788103001',
    nationalId: '1198010289000028',
    businessName: 'Adrien Family Store',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.huyeSupplies,
    tin: '103000002',
    name: 'Eric Kalisa',
    email: 'huye.supplies@gmail.com',
    phone: '+250788103002',
    nationalId: '1197810290100029',
    businessName: 'Huye University Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.anettePharma,
    tin: '103000003',
    name: 'Annette Tuyishimire',
    email: 'annette.pharma@gmail.com',
    phone: '+250788103003',
    nationalId: '1198820301200030',
    businessName: 'Annette Pharmacy',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.kamoniBricks,
    tin: '103000004',
    name: 'Francois Mugenzi',
    email: 'info@kamonybricks.rw',
    phone: '+250788103004',
    nationalId: '1197710312300031',
    businessName: 'Kamonyi Brick Works',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.jacquelineBoutique,
    tin: '103000005',
    name: 'Jacqueline Mukamwiza',
    email: 'jacqueline.boutique@gmail.com',
    phone: '+250788103005',
    nationalId: '1199020323400032',
    businessName: 'Jacqueline Boutique',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.muhangaDepot,
    tin: '103000006',
    name: 'Egide Nsabiyaremye',
    email: 'muhanga.depot@gmail.com',
    phone: '+250788103006',
    nationalId: '1197810334500033',
    businessName: 'Muhanga Central Depot',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.delphineMarket,
    tin: '103000007',
    name: 'Delphine Uwizeyimana',
    email: 'delphine.market@gmail.com',
    phone: '+250788103007',
    nationalId: '1199120345600034',
    businessName: 'Delphine Minimarket',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.nyanzaTrade,
    tin: '103000009',
    name: 'Desire Munyakazi',
    email: 'nyanza.trade@gmail.com',
    phone: '+250788103009',
    nationalId: '1198110367800036',
    businessName: 'Nyanza Trade Links',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.chantalStore,
    tin: '103000010',
    name: 'Chantal Uwamahoro',
    email: 'chantal.store@gmail.com',
    phone: '+250788103010',
    nationalId: '1198920378900037',
    businessName: 'Chantal Store',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.ruhangoSupplies,
    tin: '103000012',
    name: 'Augustin Havugimana',
    email: 'ruhango.supplies@gmail.com',
    phone: '+250788103012',
    nationalId: '1197710390100039',
    businessName: 'Ruhango Supplies Co',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.esperanceShop,
    tin: '103000013',
    name: 'Esperance Uwitonze',
    email: 'esperance.shop@gmail.com',
    phone: '+250788103013',
    nationalId: '1198820401200040',
    businessName: 'Esperance Shop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  // ── Eastern ──
  {
    id: T.bugeseraFarm,
    tin: '104000001',
    name: 'Philibert Kayumba',
    email: 'bugesera.farm@supplies.rw',
    phone: '+250788104001',
    nationalId: '1197810412300041',
    businessName: 'Bugesera Farm Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.feliciteSuperette,
    tin: '104000002',
    name: 'Felicite Mukaburigo',
    email: 'felicite.superette@gmail.com',
    phone: '+250788104002',
    nationalId: '1198620423400042',
    businessName: 'Felicite Superette',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.gatsibo,
    tin: '104000003',
    name: 'Celestin Niyonkuru',
    email: 'gatsibo.agro@trade.rw',
    phone: '+250788104003',
    nationalId: '1198010434500043',
    businessName: 'Gatsibo Agro Trade',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.florenceGoods,
    tin: '104000004',
    name: 'Florence Uwingabiye',
    email: 'florence.goods@gmail.com',
    phone: '+250788104004',
    nationalId: '1199220445600044',
    businessName: 'Florence General Goods',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.kayonzaSolar,
    tin: '104000005',
    name: 'Leonidas Ndayambaje',
    email: 'info@kayonzasolar.rw',
    phone: '+250788104005',
    nationalId: '1197610456700045',
    businessName: 'Kayonza Solar Products',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.vestineMini,
    tin: '104000006',
    name: 'Vestine Mukamanzi',
    email: 'vestine.minimart@gmail.com',
    phone: '+250788104006',
    nationalId: '1198920467800046',
    businessName: 'Vestine Minimart',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.ngomaSupplies,
    tin: '104000008',
    name: 'Donatien Habineza',
    email: 'ngoma.supplies@gmail.com',
    phone: '+250788104008',
    nationalId: '1198110489000048',
    businessName: 'Ngoma District Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.esperiaStore,
    tin: '104000009',
    name: 'Esperia Mukazitoni',
    email: 'esperia.store@gmail.com',
    phone: '+250788104009',
    nationalId: '1199020490100049',
    businessName: 'Esperia Store',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.nyagatareFeeds,
    tin: '104000010',
    name: 'Eugene Maniraho',
    email: 'nyagatare.feeds@gmail.com',
    phone: '+250788104010',
    nationalId: '1197810501200050',
    businessName: 'Nyagatare Cattle Feeds',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.immaculeeShop,
    tin: '104000011',
    name: 'Immaculee Uwamahoro',
    email: 'immaculee.shop@gmail.com',
    phone: '+250788104011',
    nationalId: '1198620512300051',
    businessName: 'Immaculee Shop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.rwamaganaMetal,
    tin: '104000012',
    name: 'Alphonse Gatera',
    email: 'info@rwamaganaetal.rw',
    phone: '+250788104012',
    nationalId: '1197510523400052',
    businessName: 'Rwamagana Metal Ltd',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.victoireBoutique,
    tin: '104000013',
    name: 'Victoire Mukagasana',
    email: 'victoire.boutique@gmail.com',
    phone: '+250788104013',
    nationalId: '1198920534500053',
    businessName: 'Victoire Boutique',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  // ── Western ──
  {
    id: T.karongiLake,
    tin: '105000001',
    name: 'Prosper Nzeyimana',
    email: 'karongi.lake@supplies.rw',
    phone: '+250788105001',
    nationalId: '1197710545600054',
    businessName: 'Karongi Lake Supplies',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.josephineCorner,
    tin: '105000002',
    name: 'Josephine Mukagatare',
    email: 'josephine.corner@gmail.com',
    phone: '+250788105002',
    nationalId: '1199020556700055',
    businessName: 'Josephine Corner',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.nyabihuHighlands,
    tin: '105000004',
    name: 'Simeon Nkurunziza',
    email: 'nyabihu.highlands@gmail.com',
    phone: '+250788105004',
    nationalId: '1197610578900057',
    businessName: 'Nyabihu Highlands Trade',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.anunciataShop,
    tin: '105000005',
    name: 'Anunciata Mukabyagamba',
    email: 'anunciata.shop@gmail.com',
    phone: '+250788105005',
    nationalId: '1198820589000058',
    businessName: 'Anunciata Shop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.rubavuBorder,
    tin: '105000007',
    name: 'Justin Uwimana',
    email: 'rubavu.border@trade.rw',
    phone: '+250788105007',
    nationalId: '1197510601200060',
    businessName: 'Rubavu Border Trade',
    role: 'wholesaler',
    clearanceStatus: 'approved',
  },
  {
    id: T.martheSupermarket,
    tin: '105000008',
    name: 'Marthe Mukamuganga',
    email: 'marthe.supermarket@gmail.com',
    phone: '+250788105008',
    nationalId: '1198720612300061',
    businessName: 'Marthe Supermarket',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
  {
    id: T.rusiziSugar,
    tin: '105000009',
    name: 'Etienne Nsabimana',
    email: 'info@rusizisugar.rw',
    phone: '+250788105009',
    nationalId: '1197810623400062',
    businessName: 'Rusizi Sugar Works',
    role: 'manufacturer',
    clearanceStatus: 'approved',
  },
  {
    id: T.odetteShop,
    tin: '105000010',
    name: 'Odette Mukankurunziza',
    email: 'odette.shop@gmail.com',
    phone: '+250788105010',
    nationalId: '1198420634500063',
    businessName: 'Odette Shop',
    role: 'retailer',
    clearanceStatus: 'approved',
  },
];

// ── Products (16) ────────────────────────────────────────────────────────────

const PRODUCTS = [
  { id: P.beverages, name: 'Beverages', unit: 'liter', categoryCode: 'FOOD-004', createdBy: T.kigaliBeverages },
  { id: P.cookingOil, name: 'Cooking Oil', unit: 'liter', categoryCode: 'FOOD-003', createdBy: T.kigaliBeverages },
  { id: P.plasticGoods, name: 'Plastic Goods', unit: 'unit', categoryCode: 'FMCG-002', createdBy: T.rwandaPlastics },
  { id: P.soap, name: 'Soap', unit: 'unit', categoryCode: 'FMCG-001', createdBy: T.rwandaSoap },
  { id: P.metalProducts, name: 'Metal Products', unit: 'kg', categoryCode: 'CONST-003', createdBy: T.gasaboMetal },
  { id: P.sugar, name: 'Sugar', unit: 'kg', categoryCode: 'FOOD-001', createdBy: T.kicukiroFoods },
  { id: P.rice, name: 'Rice', unit: 'kg', categoryCode: 'FOOD-002', createdBy: T.kicukiroFoods },
  { id: P.fabric, name: 'Fabric', unit: 'meter', categoryCode: 'TEXT-001', createdBy: T.nyanzaTextiles },
  { id: P.shoes, name: 'Shoes', unit: 'pair', categoryCode: 'TEXT-002', createdBy: T.nyanzaTextiles },
  { id: P.cement, name: 'Cement', unit: 'kg', categoryCode: 'CONST-001', createdBy: T.greatLakesCement },
  { id: P.pharmaceuticals, name: 'Pharmaceuticals', unit: 'unit', categoryCode: 'MED-001', createdBy: T.cityPharma },
  { id: P.furniture, name: 'Furniture', unit: 'piece', categoryCode: 'FMCG-003', createdBy: T.nyarugengeFurniture },
  { id: P.dairyProducts, name: 'Dairy Products', unit: 'liter', categoryCode: 'FOOD-005', createdBy: T.gicumbiDairy },
  { id: P.bricks, name: 'Bricks', unit: 'unit', categoryCode: 'CONST-004', createdBy: T.kamoniBricks },
  { id: P.solarPanels, name: 'Solar Panels', unit: 'piece', categoryCode: 'TECH-001', createdBy: T.kayonzaSolar },
  { id: P.paint, name: 'Paint', unit: 'liter', categoryCode: 'CONST-002', createdBy: T.rwamaganaMetal },
];

// ── Transaction definitions ──────────────────────────────────────────────────

interface TxDef {
  id: string;
  sellerId: string;
  buyerId: string | null;
  buyerName?: string;
  productId: string;
  qty: number;
  unitPrice: number; // RWF
  status: 'pending' | 'confirmed' | 'completed' | 'rejected';
  daysAgo: number;
}

const TRANSACTIONS: TxDef[] = [
  // ── Kigali Beverages → wholesalers ────────────────────────────────────
  {
    id: 'txn-001',
    sellerId: T.kigaliBeverages,
    buyerId: T.gasaboSupplies,
    productId: P.beverages,
    qty: 2000,
    unitPrice: 800,
    status: 'confirmed',
    daysAgo: 85,
  },
  {
    id: 'txn-002',
    sellerId: T.kigaliBeverages,
    buyerId: T.downtownWholesale,
    productId: P.cookingOil,
    qty: 1500,
    unitPrice: 1200,
    status: 'confirmed',
    daysAgo: 72,
  },
  {
    id: 'txn-003',
    sellerId: T.kigaliBeverages,
    buyerId: T.kicukiroHub,
    productId: P.beverages,
    qty: 1800,
    unitPrice: 800,
    status: 'completed',
    daysAgo: 60,
  },
  {
    id: 'txn-004',
    sellerId: T.kigaliBeverages,
    buyerId: T.volcanoTrade,
    productId: P.cookingOil,
    qty: 500,
    unitPrice: 1200,
    status: 'confirmed',
    daysAgo: 45,
  },
  {
    id: 'txn-005',
    sellerId: T.kigaliBeverages,
    buyerId: T.bueraFarm,
    productId: P.beverages,
    qty: 800,
    unitPrice: 800,
    status: 'confirmed',
    daysAgo: 30,
  },
  {
    id: 'txn-006',
    sellerId: T.kigaliBeverages,
    buyerId: T.huyeSupplies,
    productId: P.cookingOil,
    qty: 600,
    unitPrice: 1200,
    status: 'pending',
    daysAgo: 5,
  },

  // ── Rwanda Plastics → wholesalers ─────────────────────────────────────
  {
    id: 'txn-007',
    sellerId: T.rwandaPlastics,
    buyerId: T.gasaboSupplies,
    productId: P.plasticGoods,
    qty: 3000,
    unitPrice: 350,
    status: 'confirmed',
    daysAgo: 80,
  },
  {
    id: 'txn-008',
    sellerId: T.rwandaPlastics,
    buyerId: T.gakenkeDistrib,
    productId: P.plasticGoods,
    qty: 1200,
    unitPrice: 350,
    status: 'confirmed',
    daysAgo: 65,
  },
  {
    id: 'txn-009',
    sellerId: T.rwandaPlastics,
    buyerId: T.muhangaDepot,
    productId: P.plasticGoods,
    qty: 900,
    unitPrice: 350,
    status: 'completed',
    daysAgo: 50,
  },

  // ── Gasabo Metal Works → wholesalers ──────────────────────────────────
  {
    id: 'txn-010',
    sellerId: T.gasaboMetal,
    buyerId: T.kicukiroHub,
    productId: P.metalProducts,
    qty: 5000,
    unitPrice: 600,
    status: 'confirmed',
    daysAgo: 78,
  },
  {
    id: 'txn-011',
    sellerId: T.gasaboMetal,
    buyerId: T.ngomaSupplies,
    productId: P.metalProducts,
    qty: 2000,
    unitPrice: 600,
    status: 'confirmed',
    daysAgo: 55,
  },
  {
    id: 'txn-012',
    sellerId: T.gasaboMetal,
    buyerId: T.rwamaganaMetal,
    productId: P.metalProducts,
    qty: 3000,
    unitPrice: 580,
    status: 'confirmed',
    daysAgo: 40,
  },
  {
    id: 'txn-013',
    sellerId: T.gasaboMetal,
    buyerId: T.nyabihuHighlands,
    productId: P.metalProducts,
    qty: 1000,
    unitPrice: 600,
    status: 'pending',
    daysAgo: 3,
  },

  // ── Kicukiro Foods → wholesalers ─────────────────────────────────────
  {
    id: 'txn-014',
    sellerId: T.kicukiroFoods,
    buyerId: T.downtownWholesale,
    productId: P.sugar,
    qty: 4000,
    unitPrice: 950,
    status: 'confirmed',
    daysAgo: 82,
  },
  {
    id: 'txn-015',
    sellerId: T.kicukiroFoods,
    buyerId: T.bugeseraFarm,
    productId: P.rice,
    qty: 5000,
    unitPrice: 700,
    status: 'confirmed',
    daysAgo: 70,
  },
  {
    id: 'txn-016',
    sellerId: T.kicukiroFoods,
    buyerId: T.gatsibo,
    productId: P.sugar,
    qty: 2000,
    unitPrice: 950,
    status: 'completed',
    daysAgo: 58,
  },
  {
    id: 'txn-017',
    sellerId: T.kicukiroFoods,
    buyerId: T.nyagatareFeeds,
    productId: P.rice,
    qty: 3000,
    unitPrice: 700,
    status: 'confirmed',
    daysAgo: 42,
  },
  {
    id: 'txn-018',
    sellerId: T.kicukiroFoods,
    buyerId: T.rulindoAgro,
    productId: P.sugar,
    qty: 1500,
    unitPrice: 950,
    status: 'confirmed',
    daysAgo: 28,
  },

  // ── Nyanza Textiles → wholesalers ────────────────────────────────────
  {
    id: 'txn-019',
    sellerId: T.nyanzaTextiles,
    buyerId: T.gasaboSupplies,
    productId: P.fabric,
    qty: 800,
    unitPrice: 2500,
    status: 'confirmed',
    daysAgo: 75,
  },
  {
    id: 'txn-020',
    sellerId: T.nyanzaTextiles,
    buyerId: T.kicukiroHub,
    productId: P.shoes,
    qty: 400,
    unitPrice: 8000,
    status: 'confirmed',
    daysAgo: 62,
  },
  {
    id: 'txn-021',
    sellerId: T.nyanzaTextiles,
    buyerId: T.rubavuBorder,
    productId: P.fabric,
    qty: 600,
    unitPrice: 2500,
    status: 'completed',
    daysAgo: 48,
  },
  {
    id: 'txn-022',
    sellerId: T.nyanzaTextiles,
    buyerId: T.karongiLake,
    productId: P.shoes,
    qty: 300,
    unitPrice: 8000,
    status: 'confirmed',
    daysAgo: 32,
  },

  // ── Great Lakes Cement → wholesalers ─────────────────────────────────
  {
    id: 'txn-023',
    sellerId: T.greatLakesCement,
    buyerId: T.muhangaDepot,
    productId: P.cement,
    qty: 10000,
    unitPrice: 300,
    status: 'confirmed',
    daysAgo: 88,
  },
  {
    id: 'txn-024',
    sellerId: T.greatLakesCement,
    buyerId: T.nyanzaTrade,
    productId: P.cement,
    qty: 8000,
    unitPrice: 300,
    status: 'confirmed',
    daysAgo: 68,
  },
  {
    id: 'txn-025',
    sellerId: T.greatLakesCement,
    buyerId: T.ruhangoSupplies,
    productId: P.cement,
    qty: 6000,
    unitPrice: 300,
    status: 'completed',
    daysAgo: 52,
  },
  {
    id: 'txn-026',
    sellerId: T.greatLakesCement,
    buyerId: T.bugeseraFarm,
    productId: P.cement,
    qty: 5000,
    unitPrice: 300,
    status: 'confirmed',
    daysAgo: 35,
  },

  // ── City Pharma → wholesalers ─────────────────────────────────────────
  {
    id: 'txn-027',
    sellerId: T.cityPharma,
    buyerId: T.downtownWholesale,
    productId: P.pharmaceuticals,
    qty: 500,
    unitPrice: 5000,
    status: 'confirmed',
    daysAgo: 77,
  },
  {
    id: 'txn-028',
    sellerId: T.cityPharma,
    buyerId: T.huyeSupplies,
    productId: P.pharmaceuticals,
    qty: 300,
    unitPrice: 5000,
    status: 'confirmed',
    daysAgo: 55,
  },
  {
    id: 'txn-029',
    sellerId: T.cityPharma,
    buyerId: T.ngomaSupplies,
    productId: P.pharmaceuticals,
    qty: 200,
    unitPrice: 5000,
    status: 'pending',
    daysAgo: 8,
  },

  // ── Nyarugenge Furniture → wholesalers ───────────────────────────────
  {
    id: 'txn-030',
    sellerId: T.nyarugengeFurniture,
    buyerId: T.gasaboSupplies,
    productId: P.furniture,
    qty: 200,
    unitPrice: 35000,
    status: 'confirmed',
    daysAgo: 74,
  },
  {
    id: 'txn-031',
    sellerId: T.nyarugengeFurniture,
    buyerId: T.ruhangoSupplies,
    productId: P.furniture,
    qty: 120,
    unitPrice: 35000,
    status: 'confirmed',
    daysAgo: 50,
  },

  // ── Rwanda Soap → wholesalers ─────────────────────────────────────────
  {
    id: 'txn-032',
    sellerId: T.rwandaSoap,
    buyerId: T.gakenkeDistrib,
    productId: P.soap,
    qty: 5000,
    unitPrice: 450,
    status: 'confirmed',
    daysAgo: 83,
  },
  {
    id: 'txn-033',
    sellerId: T.rwandaSoap,
    buyerId: T.volcanoTrade,
    productId: P.soap,
    qty: 3000,
    unitPrice: 450,
    status: 'confirmed',
    daysAgo: 63,
  },
  {
    id: 'txn-034',
    sellerId: T.rwandaSoap,
    buyerId: T.nyagatareFeeds,
    productId: P.soap,
    qty: 2000,
    unitPrice: 450,
    status: 'completed',
    daysAgo: 45,
  },
  {
    id: 'txn-035',
    sellerId: T.rwandaSoap,
    buyerId: T.karongiLake,
    productId: P.soap,
    qty: 1500,
    unitPrice: 450,
    status: 'confirmed',
    daysAgo: 22,
  },

  // ── Gicumbi Dairy → wholesalers ───────────────────────────────────────
  {
    id: 'txn-036',
    sellerId: T.gicumbiDairy,
    buyerId: T.rulindoAgro,
    productId: P.dairyProducts,
    qty: 3000,
    unitPrice: 600,
    status: 'confirmed',
    daysAgo: 70,
  },
  {
    id: 'txn-037',
    sellerId: T.gicumbiDairy,
    buyerId: T.volcanoTrade,
    productId: P.dairyProducts,
    qty: 2000,
    unitPrice: 600,
    status: 'confirmed',
    daysAgo: 50,
  },
  {
    id: 'txn-038',
    sellerId: T.gicumbiDairy,
    buyerId: T.musanzeWholesale,
    productId: P.dairyProducts,
    qty: 1500,
    unitPrice: 600,
    status: 'confirmed',
    daysAgo: 30,
  },

  // ── Kamonyi Bricks → wholesalers ─────────────────────────────────────
  {
    id: 'txn-039',
    sellerId: T.kamoniBricks,
    buyerId: T.muhangaDepot,
    productId: P.bricks,
    qty: 20000,
    unitPrice: 80,
    status: 'confirmed',
    daysAgo: 79,
  },
  {
    id: 'txn-040',
    sellerId: T.kamoniBricks,
    buyerId: T.nyanzaTrade,
    productId: P.bricks,
    qty: 15000,
    unitPrice: 80,
    status: 'completed',
    daysAgo: 56,
  },

  // ── Kayonza Solar → wholesalers ───────────────────────────────────────
  {
    id: 'txn-041',
    sellerId: T.kayonzaSolar,
    buyerId: T.bugeseraFarm,
    productId: P.solarPanels,
    qty: 100,
    unitPrice: 120000,
    status: 'confirmed',
    daysAgo: 73,
  },
  {
    id: 'txn-042',
    sellerId: T.kayonzaSolar,
    buyerId: T.gatsibo,
    productId: P.solarPanels,
    qty: 80,
    unitPrice: 120000,
    status: 'confirmed',
    daysAgo: 48,
  },

  // ── Rwamagana Metal → wholesalers ─────────────────────────────────────
  {
    id: 'txn-043',
    sellerId: T.rwamaganaMetal,
    buyerId: T.ngomaSupplies,
    productId: P.paint,
    qty: 1000,
    unitPrice: 1500,
    status: 'confirmed',
    daysAgo: 66,
  },
  {
    id: 'txn-044',
    sellerId: T.rwamaganaMetal,
    buyerId: T.nyagatareFeeds,
    productId: P.metalProducts,
    qty: 2000,
    unitPrice: 580,
    status: 'confirmed',
    daysAgo: 44,
  },

  // ── Rusizi Sugar → wholesalers ────────────────────────────────────────
  {
    id: 'txn-045',
    sellerId: T.rusiziSugar,
    buyerId: T.rubavuBorder,
    productId: P.sugar,
    qty: 5000,
    unitPrice: 900,
    status: 'confirmed',
    daysAgo: 81,
  },
  {
    id: 'txn-046',
    sellerId: T.rusiziSugar,
    buyerId: T.nyabihuHighlands,
    productId: P.sugar,
    qty: 3000,
    unitPrice: 900,
    status: 'confirmed',
    daysAgo: 60,
  },
  {
    id: 'txn-047',
    sellerId: T.rusiziSugar,
    buyerId: T.karongiLake,
    productId: P.sugar,
    qty: 2500,
    unitPrice: 900,
    status: 'completed',
    daysAgo: 40,
  },

  // ── Wholesalers → Retailers ───────────────────────────────────────────
  {
    id: 'txn-048',
    sellerId: T.gasaboSupplies,
    buyerId: T.solangeShop,
    productId: P.beverages,
    qty: 200,
    unitPrice: 1100,
    status: 'confirmed',
    daysAgo: 55,
  },
  {
    id: 'txn-049',
    sellerId: T.gasaboSupplies,
    buyerId: T.faustinElectronics,
    productId: P.furniture,
    qty: 20,
    unitPrice: 42000,
    status: 'confirmed',
    daysAgo: 45,
  },
  {
    id: 'txn-050',
    sellerId: T.downtownWholesale,
    buyerId: T.yvonneBoutique,
    productId: P.pharmaceuticals,
    qty: 50,
    unitPrice: 6500,
    status: 'confirmed',
    daysAgo: 40,
  },
  {
    id: 'txn-051',
    sellerId: T.downtownWholesale,
    buyerId: T.solangeShop,
    productId: P.cookingOil,
    qty: 150,
    unitPrice: 1600,
    status: 'completed',
    daysAgo: 35,
  },
  {
    id: 'txn-052',
    sellerId: T.kicukiroHub,
    buyerId: T.faustinElectronics,
    productId: P.metalProducts,
    qty: 300,
    unitPrice: 800,
    status: 'confirmed',
    daysAgo: 38,
  },
  {
    id: 'txn-053',
    sellerId: T.kicukiroHub,
    buyerId: T.yvonneBoutique,
    productId: P.shoes,
    qty: 50,
    unitPrice: 9500,
    status: 'confirmed',
    daysAgo: 28,
  },
  {
    id: 'txn-054',
    sellerId: T.volcanoTrade,
    buyerId: T.jpQuickStop,
    productId: P.soap,
    qty: 500,
    unitPrice: 700,
    status: 'confirmed',
    daysAgo: 42,
  },
  {
    id: 'txn-055',
    sellerId: T.volcanoTrade,
    buyerId: T.lilianeFashion,
    productId: P.dairyProducts,
    qty: 300,
    unitPrice: 850,
    status: 'completed',
    daysAgo: 30,
  },
  {
    id: 'txn-056',
    sellerId: T.musanzeWholesale,
    buyerId: T.jpQuickStop,
    productId: P.dairyProducts,
    qty: 200,
    unitPrice: 850,
    status: 'confirmed',
    daysAgo: 18,
  },
  {
    id: 'txn-057',
    sellerId: T.gakenkeDistrib,
    buyerId: T.oliveStore,
    productId: P.plasticGoods,
    qty: 300,
    unitPrice: 500,
    status: 'confirmed',
    daysAgo: 48,
  },
  {
    id: 'txn-058',
    sellerId: T.gakenkeDistrib,
    buyerId: T.beatriceShop,
    productId: P.soap,
    qty: 400,
    unitPrice: 650,
    status: 'confirmed',
    daysAgo: 32,
  },
  {
    id: 'txn-059',
    sellerId: T.rulindoAgro,
    buyerId: T.beatriceShop,
    productId: P.sugar,
    qty: 200,
    unitPrice: 1200,
    status: 'completed',
    daysAgo: 25,
  },
  {
    id: 'txn-060',
    sellerId: T.huyeSupplies,
    buyerId: T.anettePharma,
    productId: P.pharmaceuticals,
    qty: 80,
    unitPrice: 6000,
    status: 'confirmed',
    daysAgo: 38,
  },
  {
    id: 'txn-061',
    sellerId: T.muhangaDepot,
    buyerId: T.delphineMarket,
    productId: P.cement,
    qty: 1000,
    unitPrice: 420,
    status: 'confirmed',
    daysAgo: 46,
  },
  {
    id: 'txn-062',
    sellerId: T.muhangaDepot,
    buyerId: T.jacquelineBoutique,
    productId: P.plasticGoods,
    qty: 200,
    unitPrice: 500,
    status: 'confirmed',
    daysAgo: 28,
  },
  {
    id: 'txn-063',
    sellerId: T.nyanzaTrade,
    buyerId: T.chantalStore,
    productId: P.bricks,
    qty: 2000,
    unitPrice: 110,
    status: 'confirmed',
    daysAgo: 40,
  },
  {
    id: 'txn-064',
    sellerId: T.ruhangoSupplies,
    buyerId: T.esperanceShop,
    productId: P.furniture,
    qty: 15,
    unitPrice: 40000,
    status: 'completed',
    daysAgo: 33,
  },
  {
    id: 'txn-065',
    sellerId: T.bugeseraFarm,
    buyerId: T.feliciteSuperette,
    productId: P.rice,
    qty: 500,
    unitPrice: 1000,
    status: 'confirmed',
    daysAgo: 44,
  },
  {
    id: 'txn-066',
    sellerId: T.bugeseraFarm,
    buyerId: T.feliciteSuperette,
    productId: P.cement,
    qty: 800,
    unitPrice: 420,
    status: 'confirmed',
    daysAgo: 22,
  },
  {
    id: 'txn-067',
    sellerId: T.gatsibo,
    buyerId: T.florenceGoods,
    productId: P.sugar,
    qty: 300,
    unitPrice: 1250,
    status: 'confirmed',
    daysAgo: 36,
  },
  {
    id: 'txn-068',
    sellerId: T.gatsibo,
    buyerId: T.florenceGoods,
    productId: P.solarPanels,
    qty: 10,
    unitPrice: 135000,
    status: 'confirmed',
    daysAgo: 20,
  },
  {
    id: 'txn-069',
    sellerId: T.ngomaSupplies,
    buyerId: T.esperiaStore,
    productId: P.paint,
    qty: 100,
    unitPrice: 2000,
    status: 'completed',
    daysAgo: 38,
  },
  {
    id: 'txn-070',
    sellerId: T.nyagatareFeeds,
    buyerId: T.immaculeeShop,
    productId: P.metalProducts,
    qty: 400,
    unitPrice: 750,
    status: 'confirmed',
    daysAgo: 30,
  },
  {
    id: 'txn-071',
    sellerId: T.nyagatareFeeds,
    buyerId: T.vestineMini,
    productId: P.soap,
    qty: 300,
    unitPrice: 650,
    status: 'confirmed',
    daysAgo: 15,
  },
  {
    id: 'txn-072',
    sellerId: T.karongiLake,
    buyerId: T.josephineCorner,
    productId: P.sugar,
    qty: 300,
    unitPrice: 1250,
    status: 'confirmed',
    daysAgo: 25,
  },
  {
    id: 'txn-073',
    sellerId: T.karongiLake,
    buyerId: T.josephineCorner,
    productId: P.shoes,
    qty: 40,
    unitPrice: 10000,
    status: 'completed',
    daysAgo: 12,
  },
  {
    id: 'txn-074',
    sellerId: T.nyabihuHighlands,
    buyerId: T.anunciataShop,
    productId: P.sugar,
    qty: 400,
    unitPrice: 1250,
    status: 'confirmed',
    daysAgo: 35,
  },
  {
    id: 'txn-075',
    sellerId: T.rubavuBorder,
    buyerId: T.martheSupermarket,
    productId: P.fabric,
    qty: 150,
    unitPrice: 3200,
    status: 'confirmed',
    daysAgo: 50,
  },
  {
    id: 'txn-076',
    sellerId: T.rubavuBorder,
    buyerId: T.martheSupermarket,
    productId: P.sugar,
    qty: 600,
    unitPrice: 1250,
    status: 'confirmed',
    daysAgo: 28,
  },

  // ── Retailers → Consumers (retail B2C) ───────────────────────────────
  {
    id: 'txn-077',
    sellerId: T.solangeShop,
    buyerId: null,
    buyerName: 'Jean Claude Habimana',
    productId: P.beverages,
    qty: 20,
    unitPrice: 1500,
    status: 'completed',
    daysAgo: 20,
  },
  {
    id: 'txn-078',
    sellerId: T.solangeShop,
    buyerId: null,
    buyerName: 'Alice Mukeshimana',
    productId: P.cookingOil,
    qty: 10,
    unitPrice: 2000,
    status: 'completed',
    daysAgo: 12,
  },
  {
    id: 'txn-079',
    sellerId: T.faustinElectronics,
    buyerId: null,
    buyerName: 'Bernard Nzayisenga',
    productId: P.furniture,
    qty: 2,
    unitPrice: 55000,
    status: 'completed',
    daysAgo: 25,
  },
  {
    id: 'txn-080',
    sellerId: T.yvonneBoutique,
    buyerId: null,
    buyerName: 'Claudette Mukankomeje',
    productId: P.shoes,
    qty: 5,
    unitPrice: 12000,
    status: 'completed',
    daysAgo: 10,
  },
  {
    id: 'txn-081',
    sellerId: T.jpQuickStop,
    buyerId: null,
    buyerName: 'Dieudonne Niyonzima',
    productId: P.soap,
    qty: 50,
    unitPrice: 900,
    status: 'completed',
    daysAgo: 18,
  },
  {
    id: 'txn-082',
    sellerId: T.lilianeFashion,
    buyerId: null,
    buyerName: 'Espoir Kabera',
    productId: P.dairyProducts,
    qty: 30,
    unitPrice: 1100,
    status: 'completed',
    daysAgo: 8,
  },
  {
    id: 'txn-083',
    sellerId: T.anettePharma,
    buyerId: null,
    buyerName: 'Francine Mutuyimana',
    productId: P.pharmaceuticals,
    qty: 10,
    unitPrice: 7000,
    status: 'completed',
    daysAgo: 15,
  },
  {
    id: 'txn-084',
    sellerId: T.feliciteSuperette,
    buyerId: null,
    buyerName: 'Georges Habineza',
    productId: P.rice,
    qty: 50,
    unitPrice: 1300,
    status: 'completed',
    daysAgo: 6,
  },
  {
    id: 'txn-085',
    sellerId: T.martheSupermarket,
    buyerId: null,
    buyerName: 'Helene Mukamugisha',
    productId: P.sugar,
    qty: 30,
    unitPrice: 1600,
    status: 'completed',
    daysAgo: 9,
  },

  // ── A few rejected transactions ───────────────────────────────────────
  {
    id: 'txn-086',
    sellerId: T.kicukiroFoods,
    buyerId: T.ruhangoSupplies,
    productId: P.rice,
    qty: 1000,
    unitPrice: 700,
    status: 'rejected',
    daysAgo: 25,
  },
  {
    id: 'txn-087',
    sellerId: T.rwandaPlastics,
    buyerId: T.karongiLake,
    productId: P.plasticGoods,
    qty: 500,
    unitPrice: 350,
    status: 'rejected',
    daysAgo: 15,
  },
];

// ── Main seed function ───────────────────────────────────────────────────────

async function seedTaxFlowFull(): Promise<void> {
  console.log('🌱 TaxFlow Full Seed — 58 traders + complete supply chain...\n');

  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);

  try {
    const [staffPass, traderPass] = await Promise.all([hashPassword(SEED_PASSWORD), hashPassword(SEED_PASSWORD)]);

    await db.execute(sql`TRUNCATE TABLE audit_log`);

    // ── Step 1: Clean all tables in FK-safe order ────────────────────────

    console.log('  🗑  Clearing existing data...');
    await db.delete(dispute);
    await db.delete(supportTicket);
    await db.delete(staffBulletin);
    await db.delete(vatRecord);
    await db.delete(importDeclaration);
    await db.delete(transactionItem);
    await db.delete(transaction);
    await db.delete(taxPayment);
    await db.delete(notification);
    await db.delete(systemConfig);
    await db.delete(stock);
    await db.delete(product);
    await db.delete(rraStaff);
    await db.delete(account);
    await db.delete(user);
    console.log('  ✓ Cleared\n');

    // ── Step 2: RRA Staff ────────────────────────────────────────────────

    console.log('  👮 Creating RRA staff...');
    for (const s of RRA_STAFF_USERS) {
      await db.insert(user).values({
        id: s.id,
        name: s.name,
        username: s.staffId.toLowerCase(),
        displayUsername: s.staffId,
        email: s.email,
        role: 'rra_staff',
        clearanceStatus: 'approved',
        emailVerified: true,
        phoneNumberVerified: false,
        isActive: true,
      });
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: s.id,
        providerId: 'credential',
        userId: s.id,
        password: staffPass,
      });
      await db.insert(rraStaff).values({
        id: `staff-${s.staffId.toLowerCase()}`,
        userId: s.id,
        staffId: s.staffId,
        department: s.department,
        clearanceLevel: s.clearanceLevel,
        assignedBy: STAFF_IDS.superAdmin,
        isActive: true,
      });
    }
    console.log(`  ✓ ${RRA_STAFF_USERS.length} RRA staff created\n`);

    // ── Step 3: Traders ──────────────────────────────────────────────────

    console.log('  👥 Creating traders...');
    for (const trader of TRADERS) {
      await db.insert(user).values({
        id: trader.id,
        name: trader.name,
        username: trader.tin,
        displayUsername: trader.tin,
        email: trader.email,
        phoneNumber: trader.phone,
        phoneNumberVerified: true,
        nationalId: trader.nationalId,
        tinNumber: trader.tin,
        businessName: trader.businessName,
        role: trader.role,
        clearanceStatus: trader.clearanceStatus,
        emailVerified: true,
        isActive: true,
      });
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: trader.id,
        providerId: 'credential',
        userId: trader.id,
        password: traderPass,
      });
    }
    const mfgCount = TRADERS.filter((t) => t.role === 'manufacturer').length;
    const whoCount = TRADERS.filter((t) => t.role === 'wholesaler').length;
    const retCount = TRADERS.filter((t) => t.role === 'retailer').length;
    console.log(
      `  ✓ ${TRADERS.length} traders: ${mfgCount} manufacturers, ${whoCount} wholesalers, ${retCount} retailers\n`,
    );

    // ── Step 4: Products ─────────────────────────────────────────────────

    console.log('  📦 Creating products...');
    for (const prod of PRODUCTS) {
      await db.insert(product).values({
        id: prod.id,
        name: prod.name,
        unit: prod.unit,
        categoryCode: prod.categoryCode,
        createdByUserId: prod.createdBy,
      });
    }
    console.log(`  ✓ ${PRODUCTS.length} products created\n`);

    // ── Step 5: Initial manufacturer stock ──────────────────────────────

    console.log('  🏭 Setting manufacturer initial stock...');

    const mfgStockEntries: Array<{
      businessId: string;
      productId: string;
      quantity: number;
      source: string;
      price: number;
    }> = [
      { businessId: T.kigaliBeverages, productId: P.beverages, quantity: 15000, source: 'manufactured', price: 800 },
      { businessId: T.kigaliBeverages, productId: P.cookingOil, quantity: 8000, source: 'manufactured', price: 1200 },
      { businessId: T.rwandaPlastics, productId: P.plasticGoods, quantity: 20000, source: 'manufactured', price: 350 },
      { businessId: T.rwandaPlastics, productId: P.soap, quantity: 10000, source: 'manufactured', price: 450 },
      { businessId: T.gasaboMetal, productId: P.metalProducts, quantity: 30000, source: 'manufactured', price: 600 },
      { businessId: T.kicukiroFoods, productId: P.sugar, quantity: 25000, source: 'manufactured', price: 950 },
      { businessId: T.kicukiroFoods, productId: P.rice, quantity: 20000, source: 'manufactured', price: 700 },
      { businessId: T.nyanzaTextiles, productId: P.fabric, quantity: 5000, source: 'manufactured', price: 2500 },
      { businessId: T.nyanzaTextiles, productId: P.shoes, quantity: 3000, source: 'manufactured', price: 8000 },
      { businessId: T.greatLakesCement, productId: P.cement, quantity: 100000, source: 'manufactured', price: 300 },
      { businessId: T.cityPharma, productId: P.pharmaceuticals, quantity: 5000, source: 'manufactured', price: 5000 },
      {
        businessId: T.nyarugengeFurniture,
        productId: P.furniture,
        quantity: 800,
        source: 'manufactured',
        price: 35000,
      },
      { businessId: T.rwandaSoap, productId: P.soap, quantity: 30000, source: 'manufactured', price: 450 },
      { businessId: T.rwandaSoap, productId: P.plasticGoods, quantity: 5000, source: 'manufactured', price: 350 },
      { businessId: T.gicumbiDairy, productId: P.dairyProducts, quantity: 10000, source: 'manufactured', price: 600 },
      { businessId: T.kamoniBricks, productId: P.bricks, quantity: 150000, source: 'manufactured', price: 80 },
      { businessId: T.kamoniBricks, productId: P.cement, quantity: 10000, source: 'manufactured', price: 300 },
      { businessId: T.kayonzaSolar, productId: P.solarPanels, quantity: 500, source: 'manufactured', price: 120000 },
      { businessId: T.rwamaganaMetal, productId: P.metalProducts, quantity: 15000, source: 'manufactured', price: 580 },
      { businessId: T.rwamaganaMetal, productId: P.paint, quantity: 5000, source: 'manufactured', price: 1500 },
      { businessId: T.rusiziSugar, productId: P.sugar, quantity: 50000, source: 'manufactured', price: 900 },
    ];

    for (const entry of mfgStockEntries) {
      await db.insert(stock).values({
        id: crypto.randomUUID(),
        businessId: entry.businessId,
        productId: entry.productId,
        quantity: entry.quantity,
        price: entry.price,
        source: entry.source,
      });
    }
    console.log(`  ✓ ${mfgStockEntries.length} initial stock entries\n`);

    // ── Step 6: Transactions + VAT records ──────────────────────────────

    console.log('  💰 Creating transactions + VAT records...');
    const auditEntries: Array<{
      userId: string;
      action: string;
      targetType: string;
      targetId: string;
      metadata: string;
      ipAddress: string;
      createdAt: Date;
    }> = [];

    // Track running stock balances for wholesalers/retailers (to insert later)
    const stockDeltas: Record<string, Record<string, number>> = {};

    const addDelta = (businessId: string, productId: string, delta: number) => {
      if (!stockDeltas[businessId]) stockDeltas[businessId] = {};
      stockDeltas[businessId][productId] = (stockDeltas[businessId][productId] ?? 0) + delta;
    };

    let confirmedCount = 0;
    for (const txDef of TRANSACTIONS) {
      const totalAmount = txDef.qty * txDef.unitPrice;
      const vatAmount = Math.round(totalAmount * VAT_RATE);
      const createdAt = daysAgoHours(txDef.daysAgo, 9);
      const confirmedAt =
        txDef.status === 'confirmed' || txDef.status === 'completed' ? daysAgoHours(txDef.daysAgo - 1, 14) : null;
      const rejectedAt = txDef.status === 'rejected' ? daysAgoHours(txDef.daysAgo - 1, 11) : null;

      await db.insert(transaction).values({
        id: txDef.id,
        sellerId: txDef.sellerId,
        buyerId: txDef.buyerId,
        buyerName: txDef.buyerName ?? null,
        productId: txDef.productId,
        quantity: txDef.qty,
        unitPrice: txDef.unitPrice,
        totalAmount,
        vatAmount,
        status: txDef.status,
        createdAt,
        updatedAt: confirmedAt ?? createdAt,
        confirmedAt,
        rejectedAt,
      });

      auditEntries.push({
        userId: txDef.sellerId,
        action: 'TRANSACTION_CREATED',
        targetType: 'transaction',
        targetId: txDef.id,
        metadata: JSON.stringify({ buyerId: txDef.buyerId, qty: txDef.qty, totalAmount }),
        ipAddress: '10.0.0.1',
        createdAt,
      });

      if (txDef.status === 'confirmed' || txDef.status === 'completed') {
        confirmedCount++;
        const period = vatPeriod(createdAt);

        // VAT: output for seller
        await db.insert(vatRecord).values({
          id: crypto.randomUUID(),
          transactionId: txDef.id,
          businessId: txDef.sellerId,
          vatType: 'output',
          amount: vatAmount,
          period,
          createdAt: confirmedAt!,
        });

        // VAT: input for B2B buyer
        if (txDef.buyerId) {
          await db.insert(vatRecord).values({
            id: crypto.randomUUID(),
            transactionId: txDef.id,
            businessId: txDef.buyerId,
            vatType: 'input',
            amount: vatAmount,
            period,
            createdAt: confirmedAt!,
          });
          addDelta(txDef.buyerId, txDef.productId, txDef.qty);
        }
        // Deduct from seller (non-manufacturer stock tracked by deltas)
        addDelta(txDef.sellerId, txDef.productId, -txDef.qty);

        const action =
          txDef.status === 'completed' && !txDef.buyerId ? 'RETAIL_SALE_COMPLETED' : 'TRANSACTION_CONFIRMED';
        auditEntries.push({
          userId: txDef.buyerId ?? txDef.sellerId,
          action,
          targetType: 'transaction',
          targetId: txDef.id,
          metadata: JSON.stringify({ vatAmount, period }),
          ipAddress: '10.0.0.2',
          createdAt: confirmedAt!,
        });
      }
    }
    console.log(`  ✓ ${TRANSACTIONS.length} transactions (${confirmedCount} confirmed/completed)\n`);

    // ── Step 7: Wholesaler & Retailer stock entries ───────────────────────

    console.log('  📊 Writing derived stock balances...');
    let stockWritten = 0;
    for (const [businessId, products] of Object.entries(stockDeltas)) {
      for (const [productId, delta] of Object.entries(products)) {
        if (delta > 0) {
          await db
            .insert(stock)
            .values({
              id: crypto.randomUUID(),
              businessId,
              productId,
              quantity: delta,
              source: 'purchased',
            })
            .onConflictDoNothing(); // stock table has unique (business, product)
          stockWritten++;
        }
      }
    }
    console.log(`  ✓ ${stockWritten} stock balance entries written\n`);

    // ── Step 8: Tax Payments ─────────────────────────────────────────────

    console.log('  💳 Creating tax payments...');
    const TAX_PAYMENTS: Array<{
      businessId: string;
      amount: number;
      method: 'mobile_money' | 'bank_transfer' | 'cash';
      reference: string;
      status: 'confirmed' | 'pending';
      daysAgo: number;
    }> = [
      {
        businessId: T.kigaliBeverages,
        amount: 45800000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0001',
        status: 'confirmed',
        daysAgo: 32,
      },
      {
        businessId: T.rwandaPlastics,
        amount: 18900000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0002',
        status: 'confirmed',
        daysAgo: 30,
      },
      {
        businessId: T.gasaboMetal,
        amount: 32100000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0003',
        status: 'confirmed',
        daysAgo: 28,
      },
      {
        businessId: T.kicukiroFoods,
        amount: 62000000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0004',
        status: 'confirmed',
        daysAgo: 31,
      },
      {
        businessId: T.nyanzaTextiles,
        amount: 15500000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0005',
        status: 'confirmed',
        daysAgo: 29,
      },
      {
        businessId: T.greatLakesCement,
        amount: 78000000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0006',
        status: 'confirmed',
        daysAgo: 33,
      },
      {
        businessId: T.cityPharma,
        amount: 22500000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0007',
        status: 'confirmed',
        daysAgo: 27,
      },
      {
        businessId: T.nyarugengeFurniture,
        amount: 9800000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0008',
        status: 'confirmed',
        daysAgo: 26,
      },
      {
        businessId: T.rwandaSoap,
        amount: 29400000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0009',
        status: 'confirmed',
        daysAgo: 34,
      },
      {
        businessId: T.gicumbiDairy,
        amount: 12600000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0010',
        status: 'confirmed',
        daysAgo: 22,
      },
      {
        businessId: T.kamoniBricks,
        amount: 16800000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0011',
        status: 'confirmed',
        daysAgo: 25,
      },
      {
        businessId: T.kayonzaSolar,
        amount: 43200000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0012',
        status: 'confirmed',
        daysAgo: 20,
      },
      {
        businessId: T.rwamaganaMetal,
        amount: 14200000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0013',
        status: 'confirmed',
        daysAgo: 18,
      },
      {
        businessId: T.rusiziSugar,
        amount: 51000000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0014',
        status: 'confirmed',
        daysAgo: 30,
      },
      // Wholesalers
      {
        businessId: T.gasaboSupplies,
        amount: 8200000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0015',
        status: 'confirmed',
        daysAgo: 20,
      },
      {
        businessId: T.kicukiroHub,
        amount: 11400000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0016',
        status: 'confirmed',
        daysAgo: 22,
      },
      {
        businessId: T.downtownWholesale,
        amount: 9600000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0017',
        status: 'confirmed',
        daysAgo: 18,
      },
      {
        businessId: T.volcanoTrade,
        amount: 4200000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0018',
        status: 'confirmed',
        daysAgo: 15,
      },
      {
        businessId: T.bueraFarm,
        amount: 3100000,
        method: 'cash',
        reference: 'RRA-PAY-2026-0019',
        status: 'confirmed',
        daysAgo: 17,
      },
      {
        businessId: T.huyeSupplies,
        amount: 7800000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0020',
        status: 'confirmed',
        daysAgo: 14,
      },
      {
        businessId: T.muhangaDepot,
        amount: 5600000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0021',
        status: 'confirmed',
        daysAgo: 12,
      },
      {
        businessId: T.ruhangoSupplies,
        amount: 4300000,
        method: 'cash',
        reference: 'RRA-PAY-2026-0022',
        status: 'confirmed',
        daysAgo: 10,
      },
      {
        businessId: T.bugeseraFarm,
        amount: 6100000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0023',
        status: 'confirmed',
        daysAgo: 16,
      },
      {
        businessId: T.gatsibo,
        amount: 4900000,
        method: 'mobile_money',
        reference: 'RRA-PAY-2026-0024',
        status: 'confirmed',
        daysAgo: 9,
      },
      {
        businessId: T.rubavuBorder,
        amount: 7200000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0025',
        status: 'confirmed',
        daysAgo: 13,
      },
      {
        businessId: T.rusiziSugar,
        amount: 12000000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0026',
        status: 'pending',
        daysAgo: 2,
      },
      {
        businessId: T.kigaliBeverages,
        amount: 20000000,
        method: 'bank_transfer',
        reference: 'RRA-PAY-2026-0027',
        status: 'pending',
        daysAgo: 1,
      },
    ];

    for (const pmt of TAX_PAYMENTS) {
      const createdAt = daysAgo(pmt.daysAgo);
      await db.insert(taxPayment).values({
        id: crypto.randomUUID(),
        businessId: pmt.businessId,
        amount: pmt.amount,
        method: pmt.method,
        reference: pmt.reference,
        status: pmt.status,
        createdAt,
        updatedAt: createdAt,
      });
    }
    console.log(`  ✓ ${TAX_PAYMENTS.length} tax payments\n`);

    // ── Step 9: Import Declarations ──────────────────────────────────────

    console.log('  📋 Creating import declarations...');
    const IMPORTS = [
      {
        businessId: T.kigaliBeverages,
        productId: P.beverages,
        expectedQty: 5000,
        actualQty: 4950,
        status: 'activated',
        customsRef: 'CUS-2026-0101',
        origin: 'Kenya',
        invoiceRef: 'INV-KE-2026-001',
        daysAgo: 60,
        reviewedBy: STAFF_IDS.stock1,
      },
      {
        businessId: T.rwandaPlastics,
        productId: P.plasticGoods,
        expectedQty: 10000,
        actualQty: 9900,
        status: 'activated',
        customsRef: 'CUS-2026-0102',
        origin: 'China',
        invoiceRef: 'INV-CN-2026-001',
        daysAgo: 55,
        reviewedBy: STAFF_IDS.stock1,
      },
      {
        businessId: T.greatLakesCement,
        productId: P.cement,
        expectedQty: 50000,
        actualQty: 50000,
        status: 'activated',
        customsRef: 'CUS-2026-0103',
        origin: 'Tanzania',
        invoiceRef: 'INV-TZ-2026-001',
        daysAgo: 50,
        reviewedBy: STAFF_IDS.stock2,
      },
      {
        businessId: T.cityPharma,
        productId: P.pharmaceuticals,
        expectedQty: 2000,
        actualQty: null,
        status: 'submitted',
        customsRef: 'CUS-2026-0104',
        origin: 'India',
        invoiceRef: 'INV-IN-2026-001',
        daysAgo: 10,
        reviewedBy: null,
      },
      {
        businessId: T.kayonzaSolar,
        productId: P.solarPanels,
        expectedQty: 200,
        actualQty: 198,
        status: 'activated',
        customsRef: 'CUS-2026-0105',
        origin: 'China',
        invoiceRef: 'INV-CN-2026-002',
        daysAgo: 40,
        reviewedBy: STAFF_IDS.stock1,
      },
      {
        businessId: T.rubavuBorder,
        productId: P.fabric,
        expectedQty: 2000,
        actualQty: null,
        status: 'pending',
        customsRef: null,
        origin: 'Uganda',
        invoiceRef: null,
        daysAgo: 5,
        reviewedBy: null,
      },
      {
        businessId: T.rusiziSugar,
        productId: P.sugar,
        expectedQty: 20000,
        actualQty: 19800,
        status: 'activated',
        customsRef: 'CUS-2026-0106',
        origin: 'Brazil',
        invoiceRef: 'INV-BR-2026-001',
        daysAgo: 45,
        reviewedBy: STAFF_IDS.stock2,
      },
      {
        businessId: T.nyanzaTextiles,
        productId: P.fabric,
        expectedQty: 3000,
        actualQty: 2980,
        status: 'activated',
        customsRef: 'CUS-2026-0107',
        origin: 'Ethiopia',
        invoiceRef: 'INV-ET-2026-001',
        daysAgo: 35,
        reviewedBy: STAFF_IDS.stock1,
      },
      {
        businessId: T.kicukiroFoods,
        productId: P.sugar,
        expectedQty: 15000,
        actualQty: null,
        status: 'rejected',
        customsRef: 'CUS-2026-0108',
        origin: 'Uganda',
        invoiceRef: 'INV-UG-2026-001',
        daysAgo: 30,
        reviewedBy: STAFF_IDS.stock2,
      },
    ];

    for (const imp of IMPORTS) {
      const createdAt = daysAgo(imp.daysAgo);
      await db.insert(importDeclaration).values({
        id: crypto.randomUUID(),
        businessId: imp.businessId,
        productId: imp.productId,
        expectedQuantity: imp.expectedQty,
        actualQuantity: imp.actualQty,
        status: imp.status,
        customsRef: imp.customsRef,
        originCountry: imp.origin,
        invoiceRef: imp.invoiceRef,
        supportingDoc: imp.status === 'pending' ? null : 'Commercial invoice + packing list attached',
        reviewedById: imp.reviewedBy,
        createdAt,
        updatedAt: imp.status === 'pending' || imp.status === 'submitted' ? createdAt : daysAgo(imp.daysAgo - 3),
      });
    }
    console.log(`  ✓ ${IMPORTS.length} import declarations\n`);

    // ── Step 10: Disputes ────────────────────────────────────────────────

    console.log('  ⚖  Creating disputes...');
    const DISPUTES = [
      {
        transactionId: 'txn-050',
        filedById: T.yvonneBoutique,
        counterpartyId: T.downtownWholesale,
        refNum: 'DSP-2026-001',
        reason: 'Pharmaceuticals delivered were 15 units short. Invoice shows 50 units but only 35 were received.',
        status: 'under_review',
        cpResponse: 'acknowledged',
        cpNote: 'We acknowledge receiving the complaint. Investigating our warehouse dispatch records.',
        rraAction: null,
        resolution: null,
        daysAgo: 22,
      },
      {
        transactionId: 'txn-061',
        filedById: T.delphineMarket,
        counterpartyId: T.muhangaDepot,
        refNum: 'DSP-2026-002',
        reason: 'Cement delivered was substandard quality. Bags were damaged and quantity was incorrect.',
        status: 'resolved',
        cpResponse: 'contested',
        cpNote: "Goods were in perfect condition at time of dispatch. Damage occurred during buyer's transport.",
        rraAction: 'adjust_amount',
        resolution:
          'RRA investigated both parties. Partial refund of 30% approved due to shared responsibility for packaging.',
        daysAgo: 35,
      },
      {
        transactionId: 'txn-014',
        filedById: T.downtownWholesale,
        counterpartyId: T.kicukiroFoods,
        refNum: 'DSP-2026-003',
        reason: 'Sugar delivery delayed by 3 weeks past agreed date causing financial loss to our business.',
        status: 'filed',
        cpResponse: 'pending',
        cpNote: null,
        rraAction: null,
        resolution: null,
        daysAgo: 8,
      },
      {
        transactionId: 'txn-063',
        filedById: T.chantalStore,
        counterpartyId: T.nyanzaTrade,
        refNum: 'DSP-2026-004',
        reason:
          'Bricks delivered do not match the grade specified in the purchase order. Grade B delivered instead of Grade A.',
        status: 'acknowledged',
        cpResponse: 'acknowledged',
        cpNote:
          'We confirm an error occurred in our dispatch. Grade A bricks will be delivered as replacement within 7 days.',
        rraAction: null,
        resolution: null,
        daysAgo: 14,
      },
    ];

    for (const d of DISPUTES) {
      const createdAt = daysAgo(d.daysAgo);
      await db.insert(dispute).values({
        id: crypto.randomUUID(),
        transactionId: d.transactionId,
        filedById: d.filedById,
        counterpartyId: d.counterpartyId,
        referenceNumber: d.refNum,
        reason: d.reason,
        status: d.status,
        counterpartyResponse: d.cpResponse,
        counterpartyNote: d.cpNote,
        rraAction: d.rraAction,
        resolution: d.resolution,
        rraOfficialNote: d.resolution
          ? 'Official notice sent to both parties on ' + daysAgo(d.daysAgo - 5).toDateString()
          : null,
        resolvedById: d.resolution ? STAFF_IDS.compliance1 : null,
        createdAt,
        updatedAt: createdAt,
      });
      if (d.status !== 'resolved' && d.status !== 'dismissed') {
        await db.update(vatRecord)
          .set({ isFrozen: true })
          .where(eq(vatRecord.transactionId, d.transactionId));
      }
    }
    console.log(`  ✓ ${DISPUTES.length} disputes\n`);

    // ── Step 11: Support Tickets ─────────────────────────────────────────

    console.log('  🎫 Creating support tickets...');
    const TICKETS = [
      {
        traderId: T.musanzeWholesale,
        category: 'account_issue',
        subject: 'Account under review for 3 weeks — no update',
        description:
          'My account has been under review status since January 2026. I have submitted all required documents but have not received any feedback. This is affecting my business operations.',
        status: 'in_progress',
        priority: 'high',
        assignedTo: STAFF_IDS.compliance2,
        daysAgo: 21,
      },
      {
        traderId: T.ruhangoSupplies,
        category: 'tax_query',
        subject: 'VAT filing deadline clarification for Q1 2026',
        description:
          'I need clarification on the VAT filing deadline for Q1 2026. Is it 15th April or 30th April? Our accountant says different dates.',
        status: 'resolved',
        priority: 'medium',
        assignedTo: STAFF_IDS.reporting1,
        daysAgo: 18,
        resolution: 'VAT Q1 2026 filing deadline is 30 April 2026. Please refer to the RRA circular dated 2026-01-15.',
      },
      {
        traderId: T.beatriceShop,
        category: 'system_bug',
        subject: 'Cannot submit transaction — system error 500',
        description:
          "When I try to confirm a transaction I get an error. It says 'Internal Server Error'. This has been happening since yesterday.",
        status: 'open',
        priority: 'high',
        assignedTo: null,
        daysAgo: 2,
      },
      {
        traderId: T.lilianeFashion,
        category: 'general',
        subject: 'How to record stock from market purchase',
        description:
          'I bought goods from the market without an official invoice. How do I record this in TaxFlow? The seller is not registered.',
        status: 'resolved',
        priority: 'low',
        assignedTo: STAFF_IDS.compliance1,
        daysAgo: 30,
        resolution:
          "For informal purchases, use the 'Add Stock' feature with source type 'purchased'. You are required to keep your own receipt for audit purposes.",
      },
      {
        traderId: T.adrienStore,
        category: 'tax_query',
        subject: 'Penalty notice received — dispute process',
        description:
          'I received a penalty notice for late VAT filing. I believe this is incorrect as I filed on time. What is the dispute process?',
        status: 'in_progress',
        priority: 'medium',
        assignedTo: STAFF_IDS.compliance2,
        daysAgo: 10,
      },
      {
        traderId: T.feliciteSuperette,
        category: 'account_issue',
        subject: 'Password reset not working',
        description:
          'I requested a password reset but I am not receiving the email. I have checked my spam folder. My email is felicite.superette@gmail.com.',
        status: 'resolved',
        priority: 'low',
        assignedTo: STAFF_IDS.reporting2,
        daysAgo: 14,
        resolution:
          'Password reset email resent. Please also check your spam/junk folder. Issue was a temporary mail delivery delay.',
      },
    ];

    for (const t of TICKETS) {
      const createdAt = daysAgo(t.daysAgo);
      const resolvedAt = t.status === 'resolved' ? daysAgo(t.daysAgo - 3) : null;
      await db.insert(supportTicket).values({
        id: crypto.randomUUID(),
        traderId: t.traderId,
        category: t.category,
        subject: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assignedToId: t.assignedTo ?? null,
        resolution: 'resolution' in t ? t.resolution : null,
        createdAt,
        updatedAt: resolvedAt ?? createdAt,
        resolvedAt,
      });
    }
    console.log(`  ✓ ${TICKETS.length} support tickets\n`);

    // ── Step 12: Staff Bulletins ─────────────────────────────────────────

    console.log('  📌 Creating staff bulletins...');
    const BULLETINS = [
      {
        authorId: STAFF_IDS.superAdmin,
        title: 'Q1 2026 VAT Filing Campaign — All Hands',
        content:
          'All compliance and monitoring staff are required to support the Q1 2026 VAT filing campaign. Traders who have not filed by April 15 must be contacted directly. Please coordinate with your district supervisors and report daily progress to reporting@rra.gov.rw.',
        priority: 'urgent',
        department: null,
        daysAgo: 5,
      },
      {
        authorId: STAFF_IDS.audit1,
        title: 'New Audit Protocol for Import Declarations',
        content:
          'Effective immediately, all import declarations above 5,000 USD equivalent must be cross-verified with Rwanda Revenue Authority customs database before activation. This applies to declarations from all business types. Training materials have been shared via email.',
        priority: 'important',
        department: 'Audit',
        daysAgo: 12,
      },
      {
        authorId: STAFF_IDS.reporting1,
        title: 'Monthly Analytics Report — March 2026 Published',
        content:
          'The March 2026 analytics report is now available on the internal portal. Key highlights: total VAT collected up 12% compared to February, 8 new manufacturers registered in Kigali, dispute resolution rate improved to 78%. Please review before the Monday all-staff meeting.',
        priority: 'info',
        department: 'Reporting & Analytics',
        daysAgo: 3,
      },
      {
        authorId: STAFF_IDS.compliance1,
        title: 'System Maintenance Window — April 5, 2026',
        content:
          'TaxFlow platform will undergo scheduled maintenance on April 5, 2026 from 11:00 PM to 3:00 AM. All staff should save their work and log out before 10:45 PM. Traders have been notified. Emergency contact: sysadmin@rra.gov.rw.',
        priority: 'important',
        department: null,
        daysAgo: 1,
      },
    ];

    for (const b of BULLETINS) {
      const createdAt = daysAgo(b.daysAgo);
      await db.insert(staffBulletin).values({
        id: crypto.randomUUID(),
        authorId: b.authorId,
        title: b.title,
        content: b.content,
        priority: b.priority,
        department: b.department,
        createdAt,
      });
    }
    console.log(`  ✓ ${BULLETINS.length} staff bulletins\n`);

    // ── Step 13: Notifications ───────────────────────────────────────────

    console.log('  🔔 Creating notifications...');
    const NOTIFICATIONS = [
      {
        userId: T.yvonneBoutique,
        type: 'txn_confirmed',
        title: 'Transaction Confirmed',
        message: 'Your purchase of 50 Pharmaceuticals from Downtown Wholesale has been confirmed.',
        link: '/dashboard/transactions',
        daysAgo: 39,
        read: true,
      },
      {
        userId: T.downtownWholesale,
        type: 'txn_incoming',
        title: 'New Purchase Order',
        message: 'Yvonne Boutique CBD has placed an order for 50 Pharmaceuticals.',
        link: '/dashboard/sell',
        daysAgo: 40,
        read: true,
      },
      {
        userId: T.kigaliBeverages,
        type: 'compliance_alert',
        title: 'Tax Payment Reminder',
        message: 'Your Q1 2026 VAT liability is due by April 30. Please ensure timely payment.',
        link: '/dashboard/payments',
        daysAgo: 5,
        read: false,
      },
      {
        userId: T.musanzeWholesale,
        type: 'compliance_alert',
        title: 'Account Under Review',
        message: 'Your account is currently under review. Please check your support ticket for updates.',
        link: '/dashboard/profile',
        daysAgo: 21,
        read: false,
      },
      {
        userId: T.delphineMarket,
        type: 'txn_confirmed',
        title: 'Transaction Confirmed',
        message: 'Your purchase of 1000 kg Cement from Muhanga Central Depot has been confirmed.',
        link: '/dashboard/transactions',
        daysAgo: 45,
        read: true,
      },
      {
        userId: T.jpQuickStop,
        type: 'txn_confirmed',
        title: 'Transaction Confirmed',
        message: 'Your purchase of 500 units Soap from Volcanoes Trade Center has been confirmed.',
        link: '/dashboard/transactions',
        daysAgo: 41,
        read: true,
      },
      {
        userId: T.lilianeFashion,
        type: 'txn_confirmed',
        title: 'Transaction Confirmed',
        message: 'Your purchase of 300 liters Dairy Products from Volcanoes Trade Center is confirmed.',
        link: '/dashboard/transactions',
        daysAgo: 29,
        read: false,
      },
      {
        userId: T.chantalStore,
        type: 'txn_incoming',
        title: 'Dispute Opened',
        message: 'You have filed dispute DSP-2026-004 against Nyanza Trade Links. Status: Filed.',
        link: '/dashboard/disputes',
        daysAgo: 14,
        read: true,
      },
      {
        userId: T.rusiziSugar,
        type: 'system',
        title: 'Import Declaration Approved',
        message: 'Your import declaration CUS-2026-0106 for Sugar from Brazil has been activated.',
        link: '/dashboard/imports',
        daysAgo: 42,
        read: true,
      },
      {
        userId: T.cityPharma,
        type: 'compliance_alert',
        title: 'Import Declaration Pending',
        message: 'Your import declaration CUS-2026-0104 is under review by RRA. Expected within 5 days.',
        link: '/dashboard/imports',
        daysAgo: 9,
        read: false,
      },
      {
        userId: T.beatriceShop,
        type: 'system',
        title: 'Support Ticket Resolved',
        message: 'Your query on VAT filing has been resolved. Check your ticket for the response.',
        link: '/dashboard/support',
        daysAgo: 27,
        read: false,
      },
      {
        userId: T.kicukiroFoods,
        type: 'txn_rejected',
        title: 'Import Declaration Rejected',
        message: 'Your import declaration CUS-2026-0108 for Sugar from Uganda was rejected. Contact compliance.',
        link: '/dashboard/imports',
        daysAgo: 27,
        read: true,
      },
    ];

    for (const notif of NOTIFICATIONS) {
      const createdAt = daysAgo(notif.daysAgo);
      await db.insert(notification).values({
        id: crypto.randomUUID(),
        userId: notif.userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        link: notif.link,
        read: notif.read,
        createdAt,
      });
    }
    console.log(`  ✓ ${NOTIFICATIONS.length} notifications\n`);

    // ── Step 14: Audit Log (production records) ──────────────────────────

    console.log('  📋 Writing production audit entries...');
    // Add PRODUCTION_RECORDED entries for manufacturers
    const productionEntries = [
      { userId: T.kigaliBeverages, productId: P.beverages, qty: 15000, daysAgo: 90 },
      { userId: T.kigaliBeverages, productId: P.cookingOil, qty: 8000, daysAgo: 88 },
      { userId: T.rwandaPlastics, productId: P.plasticGoods, qty: 20000, daysAgo: 87 },
      { userId: T.gasaboMetal, productId: P.metalProducts, qty: 30000, daysAgo: 85 },
      { userId: T.kicukiroFoods, productId: P.sugar, qty: 25000, daysAgo: 84 },
      { userId: T.kicukiroFoods, productId: P.rice, qty: 20000, daysAgo: 83 },
      { userId: T.nyanzaTextiles, productId: P.fabric, qty: 5000, daysAgo: 82 },
      { userId: T.nyanzaTextiles, productId: P.shoes, qty: 3000, daysAgo: 81 },
      { userId: T.greatLakesCement, productId: P.cement, qty: 100000, daysAgo: 80 },
      { userId: T.cityPharma, productId: P.pharmaceuticals, qty: 5000, daysAgo: 79 },
      { userId: T.nyarugengeFurniture, productId: P.furniture, qty: 800, daysAgo: 78 },
      { userId: T.rwandaSoap, productId: P.soap, qty: 30000, daysAgo: 77 },
      { userId: T.gicumbiDairy, productId: P.dairyProducts, qty: 10000, daysAgo: 75 },
      { userId: T.kamoniBricks, productId: P.bricks, qty: 150000, daysAgo: 74 },
      { userId: T.kayonzaSolar, productId: P.solarPanels, qty: 500, daysAgo: 72 },
      { userId: T.rwamaganaMetal, productId: P.metalProducts, qty: 15000, daysAgo: 70 },
      { userId: T.rusiziSugar, productId: P.sugar, qty: 50000, daysAgo: 68 },
      // Second production batch (current quarter)
      { userId: T.kigaliBeverages, productId: P.beverages, qty: 12000, daysAgo: 25 },
      { userId: T.kicukiroFoods, productId: P.sugar, qty: 18000, daysAgo: 22 },
      { userId: T.rwandaSoap, productId: P.soap, qty: 20000, daysAgo: 20 },
      { userId: T.greatLakesCement, productId: P.cement, qty: 80000, daysAgo: 18 },
      { userId: T.rusiziSugar, productId: P.sugar, qty: 35000, daysAgo: 15 },
    ];

    for (const entry of productionEntries) {
      auditEntries.push({
        userId: entry.userId,
        action: 'PRODUCTION_RECORDED',
        targetType: 'product',
        targetId: entry.productId,
        metadata: JSON.stringify({ quantity: entry.qty }),
        ipAddress: '10.0.0.1',
        createdAt: daysAgo(entry.daysAgo),
      });
    }

    for (const entry of auditEntries) {
      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        userId: entry.userId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress,
        createdAt: entry.createdAt,
      });
    }
    console.log(`  ✓ ${auditEntries.length} audit log entries\n`);

    // ── Step 15: System Config ───────────────────────────────────────────

    console.log('  ⚙  Writing system config...');
    const CONFIGS = [
      { key: 'vat_rate', value: '0.18' },
      { key: 'vat_filing_deadline', value: '30' }, // day of month
      { key: 'dispute_window_days', value: '30' },
      { key: 'platform_name', value: 'TaxFlow Rwanda' },
      { key: 'rra_contact_email', value: 'support@rra.gov.rw' },
      { key: 'max_import_value_usd', value: '5000' },
      { key: 'current_tax_year', value: '2026' },
      { key: 'maintenance_mode', value: 'false' },
    ];
    for (const cfg of CONFIGS) {
      await db
        .insert(systemConfig)
        .values({
          key: cfg.key,
          value: cfg.value,
          updatedAt: new Date(),
          updatedBy: STAFF_IDS.superAdmin,
        })
        .onConflictDoNothing();
    }
    console.log(`  ✓ ${CONFIGS.length} system config entries\n`);

    // ── Summary ──────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ TaxFlow Full Seed Complete!\n');
    console.log('  Sample logins:');
    console.log('═══════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seedTaxFlowFull()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default seedTaxFlowFull;
