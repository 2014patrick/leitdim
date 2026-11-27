// electron-builder-Konfiguration für LeitDim
// Unter Windows (GitHub-VM) setzt electron-builder Icon/Version selbst; unter Linux übernimmt build/afterPack.js.
const onWindows = process.platform === 'win32';
module.exports = {
  appId: 'com.patrickthommen.leitdim',
  productName: 'LeitDim',
  copyright: '© 2026 Patrick Thommen',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['main.js', 'preload.js', 'lizenz.js', 'updater.js', 'renderer/**/*', 'package.json'],
  asar: true,
  electronLanguages: ['de', 'en-US'],
  win: {
    target: ['dir', 'portable'],
    icon: 'build/icon.ico',
    signAndEditExecutable: onWindows,
  },
  portable: {
    artifactName: 'LeitDim-${version}-portable-${arch}.exe',
    unpackDirName: 'LeitDim',
    splashImage: 'build/splash.bmp',
  },
  afterPack: onWindows ? undefined : './build/afterPack.js',
  publish: null,
};
