import { AdminCorrectionRequests } from "@/components/AdminCorrectionRequests";
import { AdminRoleElevationRequests } from "@/components/AdminRoleElevationRequests";

export function AdminApprovalRequests() {
  return (
    <div className="space-y-10">
      <AdminRoleElevationRequests />
      <AdminCorrectionRequests />
    </div>
  );
}
