// electron-builder-Konfiguration für die LeitDim-Lizenzverwaltung
const onWindows = process.platform === 'win32';
module.exports = {
  appId: 'com.patrickthommen.leitdim.lizenzen',
  productName: 'LeitDim Lizenzen',
  copyright: '© 2026 Patrick Thommen',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['main.js', 'preload.js', 'lizenz.js', 'updater.js', 'renderer/**/*', 'package.json'],
  asar: true,
  electronLanguages: ['de', 'en-US'],
  win: { target: ['portable'], icon: 'build/icon.ico', signAndEditExecutable: onWindows },
  portable: { artifactName: 'LeitDim-Lizenzen-${version}-portable-${arch}.exe', unpackDirName: 'LeitDim-Lizenzen' },
  afterPack: onWindows ? undefined : './build/afterPack.js',
  publish: null,
};
