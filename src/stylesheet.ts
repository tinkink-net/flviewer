import { FLV_STYLES } from "./styles";

const STYLE_ID = "flv-styles";

export function injectFlvStyles(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FLV_STYLES;
  document.head.append(style);
}
