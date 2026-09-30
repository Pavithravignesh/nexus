import type { Metadata } from "next";
import { ModelView } from "@/components/model/ModelView";

export const metadata: Metadata = {
  title: "Data model · Nexus Ops",
  description: "Live entity-relationship view of the Nexus telemetry model",
};

export default function ModelPage(): React.JSX.Element {
  return <ModelView />;
}
