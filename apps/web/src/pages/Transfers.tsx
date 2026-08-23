import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/empty-state';

export default function TransfersPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Transfers" />
      <EmptyState
        icon={Construction}
        title="Transfers en construcción"
        description="Esta vista se implementa en una fase posterior."
      />
    </div>
  );
}
