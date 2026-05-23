import type { TildagonAppCategory } from "tildagon-app";

const BrandColors = {
  Orange: "#F77F02",
  Coral: "#F5515E",
  Yellow: "#F9E200",
  Green: "#2AE28C",
  LightBlue: "#2EADD9",
  MidBlue: "#005D96",
  DarkBlue: "#000730",
  // Special from Design
  Purple: "#9900b5",
};

export const CategoryColors: Record<TildagonAppCategory, string> = {
  Badge: BrandColors.LightBlue,
  Music: BrandColors.Yellow,
  Media: BrandColors.Orange,
  Apps: BrandColors.Coral,
  Games: BrandColors.Green,
  Background: BrandColors.Purple,
  Pattern: BrandColors.LightBlue,
};
