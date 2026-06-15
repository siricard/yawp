// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  // TODO: set to the production docs URL once chosen (e.g. https://docs.yawp.chat)
  site: "https://docs.yawp.example",
  integrations: [
    starlight({
      title: "Yawp Docs",
      description:
        "Self-hosting guides and concept documentation for Yawp — a decentralized, end-to-end encrypted communication platform.",
      tagline: "Run your own corner of the network.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          // TODO: point at the real repo
          href: "https://github.com/yawp/yawp",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [{ autogenerate: { directory: "start-here" } }],
        },
        {
          label: "Self-hosting",
          items: [{ autogenerate: { directory: "self-hosting" } }],
        },
        {
          label: "How Yawp works",
          items: [{ autogenerate: { directory: "how-it-works" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Contributing",
          items: [{ autogenerate: { directory: "contributing" } }],
        },
      ],
    }),
  ],
});
