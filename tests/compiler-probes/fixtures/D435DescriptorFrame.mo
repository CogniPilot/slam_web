model D435DescriptorFrame
  extends RGBDDescriptorFrame(
    imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,
    channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435DescriptorFrame;
