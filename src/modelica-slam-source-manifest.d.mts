export const rgbdSlamSourceManifest: Readonly<{
  schemaVersion: 1;
  modelNames: readonly string[];
  paths: readonly string[];
  separator: '\n';
  composition: string;
  scope: string;
}>;
export type RGBDSlamSourceProfile = 'legacy' | 'd435-native';
export const rgbdSlamNativeSourceManifest: typeof rgbdSlamSourceManifest;
export function rgbdSlamManifest(profile?: RGBDSlamSourceProfile): typeof rgbdSlamSourceManifest;
