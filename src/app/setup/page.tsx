import { redirect } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import SetupBootstrapForm from "@/components/screens/SetupBootstrapForm";

export default async function SetupPage() {
  const orgCount = await prisma.organization.count();
  if (orgCount > 0) {
    redirect("/");
  }
  return <SetupBootstrapForm />;
}
