// Setzt Icon und Versionsinfo in LeitDim.exe (ohne Wine, via resedit)
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const PE = await import('pe-library');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ex = PE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(ex);
  const groups = res.entries.filter((e) => e.type === 14);
  const g = groups[0];
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g ? g.id : 1, g ? g.lang : 1033, iconFile.icons.map((i) => i.data));
  const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = vis[0];
  const v = context.packager.appInfo.version.split('.').map((x) => parseInt(x, 10) || 0);
  const langs = vi.getAllLanguagesForStringValues();
  const lang = langs[0] || { lang: 1033, codepage: 1200 };
  vi.setStringValues(lang, {
    FileDescription: context.packager.appInfo.productName === 'LeitDim' ? 'LeitDim – Leitungsdimensionierung NIN 2025' : 'LeitDim Lizenzen – Lizenzverwaltung',
    ProductName: context.packager.appInfo.productName,
    CompanyName: 'Patrick Thommen',
    LegalCopyright: '© 2026 Patrick Thommen',
    OriginalFilename: context.packager.appInfo.productFilename + '.exe',
    InternalName: context.packager.appInfo.productFilename,
    FileVersion: context.packager.appInfo.version,
    ProductVersion: context.packager.appInfo.version,
  });
  vi.setFileVersion(v[0], v[1], v[2], 0, lang.lang);
  vi.setProductVersion(v[0], v[1], v[2], 0, lang.lang);
  vi.outputToResourceEntries(res.entries);
  res.outputResource(ex);
  fs.writeFileSync(exe, Buffer.from(ex.generate()));
  console.log(`  • LeitDim: Icon + Versionsinfo gesetzt (${path.basename(context.appOutDir)}; Icon-Gruppe ${g ? g.id : 1})`);
};
