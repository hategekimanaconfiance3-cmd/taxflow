import { IndustrialManagement } from "@/components/dashboard/industrial/industrial-management";
import { getMyFactories, getMyFactoryLines } from "@/lib/actions/factory.action";
import { getMyIndustrialEquipment, getMyIndustrialGateways } from "@/lib/actions/industrial.action";
import { requireTraderSession } from "@/lib/auth-guard";

export default async function IndustrialManagementPage() {
  await requireTraderSession(['manufacturer']);
  const [factories, equipment, gateways] = await Promise.all([
    getMyFactories(),
    getMyIndustrialEquipment(),
    getMyIndustrialGateways(),
  ]);
  const lineGroups = await Promise.all(factories.map(async (factory) => ({
    factoryId: factory.id,
    lines: await getMyFactoryLines(factory.id),
  })));
  const lines = lineGroups.flatMap((group) => group.lines.map((line) => ({ ...line, factoryId: group.factoryId })));
  return <IndustrialManagement factories={factories} lines={lines} equipment={equipment} gateways={gateways} />;
}
