// These two checker assets are also served from the hub. Keep one source for both deployments.
const installerFiles = ['for-websites/index.html', 'for-websites/install.js'];
const checkerDir = 'tools/csv-import-checker/';
const sharedHubPaths = new Map(installerFiles.map(name => [checkerDir + name, name]));

function hubSourcePath(pathname) {
  const asset = ['/for-websites', '/for-websites/'].includes(pathname) ? '/for-websites/index.html' : pathname;
  return installerFiles.includes(asset.slice(1)) ? '/' + checkerDir + asset.slice(1) : pathname;
}
module.exports = {sharedHubPaths, hubSourcePath};
