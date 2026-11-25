// Kredensial + peran (RBAC sisi-klien) untuk dashboard internal.
// CATATAN KEAMANAN: ini penjagaan sisi-klien (kredensial ada di bundle JS + localStorage),
// BUKAN pengaman kriptografis. Untuk keamanan sungguhan, pindahkan ke autentikasi backend.

export const AUTH_KEY = 'nabihaosel_auth'
export const BRAND_NAME = 'Selamat Datang'
export const BRAND_TAGLINE = 'Sales Analytics Dashboard'

// Definisi peran: halaman yang boleh dibuka, kunci channel, cakupan data, hak edit.
// pages: 'all' atau 'no-overview' (semua kecuali Overview).
// channelLock: null (semua channel) atau 'K25' (dikunci K25).
// scope: 'all' | 'spv' (hanya tim SPV-nya) | 'self' (hanya dirinya).
export const ROLES = {
  editor:  { label: 'Editor',        pages: 'all',         channelLock: null,  scope: 'all',  canEdit: true  },
  boe:     { label: 'BoE',           pages: 'all',         channelLock: null,  scope: 'all',  canEdit: false },
  manager: { label: 'Sales Manager', pages: 'all',         channelLock: 'K25', scope: 'all',  canEdit: false },
  spv:     { label: 'SPV',           pages: 'no-overview', channelLock: 'K25', scope: 'spv',  canEdit: false },
  sp:      { label: 'Team Sales',    pages: 'no-overview', channelLock: 'K25', scope: 'self', canEdit: false },
}

// Akun. SP = hanya salesperson yang masih AKTIF (pemegang Kode C saat ini).
export const USERS = [
  {"username":"owner","password":"Sync3754sch","role":"editor","name":"Owner (kamu)"},
  {"username":"boe","password":"Sync7756hxg","role":"boe","name":"Board of Executives"},
  {"username":"manager","password":"Sync2104tsh","role":"manager","name":"Sales Manager"},
  {"username":"spv.ari","password":"Sync6202gyv","role":"spv","spv":"SPV ARI","name":"SPV ARI"},
  {"username":"spv.regen","password":"Sync4064hqq","role":"spv","spv":"SPV REGEN","name":"SPV REGEN"},
  {"username":"spv.abdul","password":"Sync8965qrb","role":"spv","spv":"SPV ABDUL Wahid","name":"SPV ABDUL Wahid"},
  {"username":"sp.michella","password":"Sync4408rpa","role":"sp","self":"Michella","spv":"SPV ARI","name":"Michella"},
  {"username":"sp.leppi","password":"Sync6151jkb","role":"sp","self":"Leppi","spv":"SPV ARI","name":"Leppi"},
  {"username":"sp.shifa","password":"Sync4899bjw","role":"sp","self":"Shifa","spv":"SPV ARI","name":"Shifa"},
  {"username":"sp.dinda","password":"Sync4651djj","role":"sp","self":"Dinda","spv":"SPV ARI","name":"Dinda"},
  {"username":"sp.fajar","password":"Sync7722pkf","role":"sp","self":"Fajar","spv":"SPV ARI","name":"Fajar"},
  {"username":"sp.riska","password":"Sync2180eah","role":"sp","self":"Riska","spv":"SPV ARI","name":"Riska"},
  {"username":"sp.rizal","password":"Sync1315bqe","role":"sp","self":"Rizal","spv":"SPV REGEN","name":"Rizal"},
  {"username":"sp.indah","password":"Sync2738aab","role":"sp","self":"Indah","spv":"SPV REGEN","name":"Indah"},
  {"username":"sp.rachel","password":"Sync8273par","role":"sp","self":"Rachel","spv":"SPV REGEN","name":"Rachel"},
  {"username":"sp.sadarmawati","password":"Sync6373xkt","role":"sp","self":"Sadarmawati","spv":"SPV REGEN","name":"Sadarmawati"},
  {"username":"sp.dina","password":"Sync5300xuc","role":"sp","self":"Dina","spv":"SPV REGEN","name":"Dina"},
  {"username":"sp.ine","password":"Sync6828nnb","role":"sp","self":"Ine","spv":"SPV REGEN","name":"Ine"},
  {"username":"sp.marlina","password":"Sync6906mgy","role":"sp","self":"Marlina","spv":"SPV REGEN","name":"Marlina"},
  {"username":"sp.zain","password":"Sync3566wgk","role":"sp","self":"Zain","spv":"SPV ABDUL Wahid","name":"Zain"},
  {"username":"sp.evi","password":"Sync2340wwh","role":"sp","self":"Evi","spv":"SPV ABDUL Wahid","name":"Evi"},
  {"username":"sp.wendy","password":"Sync6695ctc","role":"sp","self":"Wendy","spv":"SPV ABDUL Wahid","name":"Wendy"},
  {"username":"sp.sandi","password":"Sync9672ewv","role":"sp","self":"Sandi","spv":"SPV ABDUL Wahid","name":"Sandi"},
  {"username":"sp.alim","password":"Sync8301gpc","role":"sp","self":"Alim","spv":"SPV ABDUL Wahid","name":"Alim"},
  {"username":"sp.achmadcanv","password":"Sync6721amz","role":"sp","self":"Achmad Canv","spv":"SPV ABDUL Wahid","name":"Achmad Canv"},
  {"username":"sp.alysia","password":"Sync3038ptz","role":"sp","self":"Alysia","spv":"SPV ABDUL Wahid","name":"Alysia"},
]

// Anggota tim per SPV (nama SP aktif) — untuk cakupan data SPV.
export const SPV_TEAM = USERS.reduce((m, u) => {
  if (u.role === 'sp' && u.spv) (m[u.spv] = m[u.spv] || []).push(u.self)
  return m
}, {})

// Kompat lama: sebagian komponen masih mengimpor CREDENTIALS.
export const CREDENTIALS = USERS
