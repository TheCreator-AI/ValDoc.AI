import { prisma } from "@/server/db/prisma";
import EnterpriseWorkspace from "@/components/screens/EnterpriseWorkspace";
import SetupBootstrapForm from "@/components/screens/SetupBootstrapForm";

export default async function HomePage() {
  const orgCount = await prisma.organization.count();
  if (orgCount === 0) {
    return <SetupBootstrapForm />;
  }
  return <EnterpriseWorkspace />;
}
