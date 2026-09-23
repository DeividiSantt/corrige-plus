import { redirect } from "next/navigation";
import { productConfig } from "@corrige-plus/config";

export default function HomePage() {
  redirect(productConfig.routes.home);
}
