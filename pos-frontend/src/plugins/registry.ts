import type { PluginDefinition } from "@/lib/types";
import { weightedItemPlugin } from "./weighted-item";

export const pluginRegistry: PluginDefinition[] = [weightedItemPlugin];
