import { fileURLToPath } from "node:url";
import { kasumiContent, sharedTailwindConfig } from "@kasumi/ui/tailwind-config";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default {
  ...sharedTailwindConfig,
  content: [here("./index.html"), here("./src/**/*.{js,jsx}"), ...kasumiContent],
};
