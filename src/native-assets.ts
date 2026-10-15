import pinText from '../slam-native-package.json?raw';
const delivery:string=JSON.parse(pinText).sha256;
/** Invalidate the small manifest when a new native delivery is pinned. */
export function nativeManifestUrl(base:URL){
  const url=new URL('vendor/slam/manifest.json',base);
  url.searchParams.set('delivery',delivery);return url;
}
