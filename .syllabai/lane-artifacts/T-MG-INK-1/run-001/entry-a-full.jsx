// A) their stack: the full Tldraw editor mounted over the page box
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
export function InkLayer(props) {
  return <Tldraw {...props} />;
}
