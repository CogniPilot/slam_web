// Rendered metres: painted markings sit on the local asphalt, not on raised
// centimetre-thick blocks. A thin solid layer also participates in raw depth.
export const ROAD_PAINT_THICKNESS = 0.0004;
export const roadPaintCenter = (asphaltTop: number) => asphaltTop + ROAD_PAINT_THICKNESS / 2;
