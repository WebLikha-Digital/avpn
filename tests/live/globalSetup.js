import { build } from "vite";

export default async function globalSetup() {
  await build();
}
