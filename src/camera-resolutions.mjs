// D400 Series datasheet (August 2025), Table 4-2: USB 3 RGB + Z16 modes.
// These are the ordinary resolutions shared by both streams. The 256x144
// depth mode is for calibration; 320x180/320x240 are RGB-only.
export const D435_PAIRED_RESOLUTIONS=Object.freeze([
  {id:'424x240',width:424,height:240,maxHz:60},
  {id:'640x360',width:640,height:360,maxHz:60},
  {id:'640x480',width:640,height:480,maxHz:60},
  {id:'848x480',width:848,height:480,maxHz:60},
  {id:'1280x720',width:1280,height:720,maxHz:30},
].map(Object.freeze));
export const D435_RESOLUTION_SOURCE='https://realsenseai.com/wp-content/uploads/2025/08/Intel-RealSense-D400-Series-Datasheet-August-2025.pdf';
